/**
 * K39-C2: Backfill safe source evidence fields.
 *
 * Writes ONLY TeachingTaskClass.importBatchId and TeachingTaskClass.sourceArtifactFilename.
 * Default: dry-run. --apply: real transactional write.
 *
 * Usage:
 *   npx tsx scripts/backfill-source-evidence-safe-fields-k39-c2.ts          # dry-run
 *   npx tsx scripts/backfill-source-evidence-safe-fields-k39-c2.ts --apply   # apply
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── ALLOWLIST: only these fields may appear in update data ──
const ALLOWED_UPDATE_FIELDS = new Set(['importBatchId', 'sourceArtifactFilename'])

interface Candidate {
  ttcId: number
  importBatchId: number
  sourceArtifactFilename: string
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`=== K39-C2: Safe Fields Backfill (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`)

  // ── 1. Snapshot before counts ──
  const before = {
    ttcTotal: await prisma.teachingTaskClass.count(),
    importBatchIdNonNull: await prisma.teachingTaskClass.count({ where: { importBatchId: { not: null } } }),
    sourceArtifactNonNull: await prisma.teachingTaskClass.count({ where: { sourceArtifactFilename: { not: null } } }),
    sourceRowIndexNonNull: await prisma.teachingTaskClass.count({ where: { sourceRowIndex: { not: null } } }),
    sourceKeywordNonNull: await prisma.teachingTaskClass.count({ where: { sourceKeyword: { not: null } } }),
    sourceClassNameNonNull: await prisma.teachingTaskClass.count({ where: { sourceClassName: { not: null } } }),
    sourceRemarkNonNull: await prisma.teachingTaskClass.count({ where: { sourceRemark: { not: null } } }),
    matchStrategyNonNull: await prisma.teachingTaskClass.count({ where: { matchStrategy: { not: null } } }),
    matchConfidenceNonNull: await prisma.teachingTaskClass.count({ where: { matchConfidence: { not: null } } }),
    importBatchTotal: await prisma.importBatch.count(),
    teachingTaskTotal: await prisma.teachingTask.count(),
    scheduleSlotTotal: await prisma.scheduleSlot.count(),
    scheduleAdjustmentTotal: await prisma.scheduleAdjustment.count(),
  }
  console.log('📊 Before counts:')
  console.log(`   TeachingTaskClass: ${before.ttcTotal}`)
  console.log(`   importBatchId non-null: ${before.importBatchIdNonNull}`)
  console.log(`   sourceArtifactFilename non-null: ${before.sourceArtifactNonNull}`)
  console.log(`   Other evidence fields non-null: sourceRowIndex=${before.sourceRowIndexNonNull} sourceKeyword=${before.sourceKeywordNonNull} sourceClassName=${before.sourceClassNameNonNull} sourceRemark=${before.sourceRemarkNonNull} matchStrategy=${before.matchStrategyNonNull} matchConfidence=${before.matchConfidenceNonNull}`)
  console.log(`   ImportBatch: ${before.importBatchTotal} | TeachingTask: ${before.teachingTaskTotal} | ScheduleSlot: ${before.scheduleSlotTotal} | ScheduleAdjustment: ${before.scheduleAdjustmentTotal}`)

  // ── 2. Get confirmed batch ──
  const confirmedBatch = await prisma.importBatch.findFirst({ where: { status: 'confirmed' } })
  if (!confirmedBatch) {
    console.error('❌ No confirmed batch found')
    process.exit(1)
  }
  if (!confirmedBatch.filename) {
    console.error('❌ Confirmed batch has no filename')
    process.exit(1)
  }
  console.log(`\n📋 Confirmed batch: #${confirmedBatch.id} (semesterId=${confirmedBatch.semesterId})`)

  // ── 3. Build candidates via deterministic join ──
  const teachingTasks = await prisma.teachingTask.findMany({
    where: { importBatchId: confirmedBatch.id },
    select: { id: true, importBatchId: true, semesterId: true },
  })
  const ttIdSet = new Set(teachingTasks.map(t => t.id))
  const ttMap = new Map(teachingTasks.map(t => [t.id, t]))

  const allTtc = await prisma.teachingTaskClass.findMany({
    where: { teachingTaskId: { in: Array.from(ttIdSet) } },
    select: { id: true, teachingTaskId: true, importBatchId: true, sourceArtifactFilename: true },
  })

  console.log(`\n🔗 Candidates: ${allTtc.length} TeachingTaskClass links`)

  // ── 4. Validate candidates ──
  const candidates: Candidate[] = []
  const blocked: { ttcId: number; reason: string }[] = []

  for (const ttc of allTtc) {
    const tt = ttMap.get(ttc.teachingTaskId)
    if (!tt) {
      blocked.push({ ttcId: ttc.id, reason: 'TEACHING_TASK_NOT_FOUND' })
      continue
    }
    if (tt.importBatchId !== confirmedBatch.id) {
      blocked.push({ ttcId: ttc.id, reason: 'IMPORT_BATCH_MISMATCH' })
      continue
    }
    if (tt.semesterId !== confirmedBatch.semesterId) {
      blocked.push({ ttcId: ttc.id, reason: 'SEMESTER_MISMATCH' })
      continue
    }
    // Already has different value?
    if (ttc.importBatchId !== null && ttc.importBatchId !== tt.importBatchId) {
      blocked.push({ ttcId: ttc.id, reason: 'IMPORT_BATCH_ID_CONFLICT' })
      continue
    }
    if (ttc.sourceArtifactFilename !== null && ttc.sourceArtifactFilename !== confirmedBatch.filename) {
      blocked.push({ ttcId: ttc.id, reason: 'SOURCE_ARTIFACT_CONFLICT' })
      continue
    }

    candidates.push({
      ttcId: ttc.id,
      importBatchId: tt.importBatchId!,
      sourceArtifactFilename: confirmedBatch.filename,
    })
  }

  console.log(`   Valid candidates: ${candidates.length}`)
  console.log(`   Blocked: ${blocked.length}`)
  if (blocked.length > 0) {
    const reasonCounts = new Map<string, number>()
    blocked.forEach(b => reasonCounts.set(b.reason, (reasonCounts.get(b.reason) ?? 0) + 1))
    console.log('   Blocked reasons:')
    reasonCounts.forEach((count, reason) => console.log(`     ${reason}: ${count}`))
  }

  // ── 5. Allowlist assertion ──
  const sampleData = { importBatchId: candidates[0]?.importBatchId, sourceArtifactFilename: candidates[0]?.sourceArtifactFilename }
  const dataKeys = Object.keys(sampleData)
  const illegalKeys = dataKeys.filter(k => !ALLOWED_UPDATE_FIELDS.has(k))
  if (illegalKeys.length > 0) {
    console.error(`❌ ILLEGAL FIELDS in update data: ${illegalKeys.join(', ')}`)
    process.exit(1)
  }

  if (!apply) {
    console.log(`\n⚠️  DRY-RUN: Would update ${candidates.length} TeachingTaskClass rows`)
    console.log(`   Fields: importBatchId=${confirmedBatch.id}, sourceArtifactFilename=[batch filename]`)
    console.log('\n   Run with --apply to execute.')
    return
  }

  // ── 6. Apply in transaction ──
  console.log(`\n🔄 Applying ${candidates.length} updates in transaction...`)

  let updatedCount = 0
  await prisma.$transaction(async (tx) => {
    for (const c of candidates) {
      const data = {
        importBatchId: c.importBatchId,
        sourceArtifactFilename: c.sourceArtifactFilename,
      }
      // Final allowlist assertion
      const keys = Object.keys(data)
      const bad = keys.filter(k => !ALLOWED_UPDATE_FIELDS.has(k))
      if (bad.length > 0) throw new Error(`ILLEGAL FIELDS: ${bad.join(', ')}`)

      await tx.teachingTaskClass.update({
        where: { id: c.ttcId },
        data,
      })
      updatedCount++
    }
  })

  console.log(`✅ Updated ${updatedCount} TeachingTaskClass rows`)

  // ── 7. Verify after ──
  const after = {
    importBatchIdNonNull: await prisma.teachingTaskClass.count({ where: { importBatchId: { not: null } } }),
    sourceArtifactNonNull: await prisma.teachingTaskClass.count({ where: { sourceArtifactFilename: { not: null } } }),
    sourceRowIndexNonNull: await prisma.teachingTaskClass.count({ where: { sourceRowIndex: { not: null } } }),
    sourceKeywordNonNull: await prisma.teachingTaskClass.count({ where: { sourceKeyword: { not: null } } }),
    matchStrategyNonNull: await prisma.teachingTaskClass.count({ where: { matchStrategy: { not: null } } }),
    importBatchTotal: await prisma.importBatch.count(),
    teachingTaskTotal: await prisma.teachingTask.count(),
    scheduleSlotTotal: await prisma.scheduleSlot.count(),
    scheduleAdjustmentTotal: await prisma.scheduleAdjustment.count(),
  }

  console.log('\n📊 After counts:')
  console.log(`   importBatchId non-null: ${after.importBatchIdNonNull} (was ${before.importBatchIdNonNull})`)
  console.log(`   sourceArtifactFilename non-null: ${after.sourceArtifactNonNull} (was ${before.sourceArtifactNonNull})`)
  console.log(`   sourceRowIndex/sourceKeyword/matchStrategy: unchanged (${after.sourceRowIndexNonNull}/${after.sourceKeywordNonNull}/${after.matchStrategyNonNull})`)
  console.log(`   ImportBatch: ${after.importBatchTotal} | TeachingTask: ${after.teachingTaskTotal} | ScheduleSlot: ${after.scheduleSlotTotal} | ScheduleAdjustment: ${after.scheduleAdjustmentTotal}`)

  // ── 8. Business data invariance check ──
  const invariants = [
    ['ImportBatch', before.importBatchTotal, after.importBatchTotal],
    ['TeachingTask', before.teachingTaskTotal, after.teachingTaskTotal],
    ['ScheduleSlot', before.scheduleSlotTotal, after.scheduleSlotTotal],
    ['ScheduleAdjustment', before.scheduleAdjustmentTotal, after.scheduleAdjustmentTotal],
  ] as const
  let invariantFailed = false
  for (const [name, b, a] of invariants) {
    if (b !== a) {
      console.error(`❌ INVARIANT VIOLATION: ${name} changed ${b} → ${a}`)
      invariantFailed = true
    }
  }
  if (invariantFailed) process.exit(1)
  console.log('\n✅ All business data invariants preserved.')
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
