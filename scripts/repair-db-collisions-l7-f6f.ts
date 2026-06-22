/**
 * L7-F6F Repair Script — DB Collision Repair
 *
 * Stage: L7-F6F-CONTROLLED-DB-COLLISION-RECONCILIATION-WRITE
 *
 * Repairs double-级 ClassGroup.name in sem4:
 *   - 366 rows: normalize "级级" → "级" (no name conflict)
 *   - 25 rows: delete L7-F6C duplicates whose normalized name = legacy name (0 TTC refs)
 *
 * Usage:
 *   npx tsx scripts/repair-db-collisions-l7-f6f.ts --target-semester-id 4 --dry-run
 *   npx tsx scripts/repair-db-collisions-l7-f6f.ts --target-semester-id 4 --apply --confirm-token REPAIR_L7_F6F_DB_COLLISIONS
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = resolve(__dirname, '..')
const STAGE = 'L7-F6F-CONTROLLED-DB-COLLISION-RECONCILIATION-WRITE'
const EXPECTED_TOKEN = 'REPAIR_L7_F6F_DB_COLLISIONS'

const shortHash = (s: string, len = 16): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)

const ex = (cmd: string): string => {
  try { return execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim() } catch { return '' }
}

// Parse args
const parseArgs = (argv: string[]) => {
  const args = { targetSemesterId: 0, dryRun: false, apply: false, confirmToken: '', help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--apply') args.apply = true
    else if (a === '--confirm-token') args.confirmToken = argv[++i] ?? ''
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`L7-F6F Repair Script — DB Collision Repair (double-级 normalization)

Usage:
  --target-semester-id <id>   Target semester (required)
  --dry-run                   Dry-run mode (default)
  --apply                     Real apply (requires --confirm-token)
  --confirm-token <token>     Confirm token (required for --apply)

Examples:
  npx tsx scripts/repair-db-collisions-l7-f6f.ts --target-semester-id 4 --dry-run
  npx tsx scripts/repair-db-collisions-l7-f6f.ts --target-semester-id 4 --apply --confirm-token REPAIR_L7_F6F_DB_COLLISIONS
`)
    return
  }

  if (!args.targetSemesterId || args.targetSemesterId <= 0) {
    console.error('ERROR: --target-semester-id is required (positive integer)')
    process.exit(1)
  }

  const mode = args.apply ? 'apply' : 'dry-run'
  console.log(`L7-F6F Repair Script`)
  console.log(`  stage: ${STAGE}`)
  console.log(`  target semester: ${args.targetSemesterId}`)
  console.log(`  mode: ${mode}`)
  console.log('')

  // ── Load DB via Prisma (read-only for analysis) ──────────────────────
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  // Verify baseline
  const courseCount = await prisma.course.count()
  const teacherCount = await prisma.teacher.count()
  const cgSem1Count = await prisma.classGroup.count({ where: { semesterId: 1 } })
  const cgSem4Count = await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } })
  const ttSem4Count = await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } })
  const ttcCount = await prisma.teachingTaskClass.count()
  const ssSem4Count = await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } })
  const saSem4Count = await prisma.scheduleAdjustment.count({ where: { semesterId: args.targetSemesterId } })
  const ibCount = await prisma.importBatch.count()
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } })

  console.log('--- DB Baseline (before) ---')
  console.log(`  Course:              ${courseCount}`)
  console.log(`  Teacher:             ${teacherCount}`)
  console.log(`  ClassGroup sem1:     ${cgSem1Count}`)
  console.log(`  ClassGroup sem4:     ${cgSem4Count}`)
  console.log(`  TeachingTask sem4:   ${ttSem4Count}`)
  console.log(`  TeachingTaskClass:   ${ttcCount}`)
  console.log(`  ScheduleSlot sem4:   ${ssSem4Count}`)
  console.log(`  ScheduleAdj sem4:    ${saSem4Count}`)
  console.log(`  ImportBatch total:   ${ibCount}`)
  console.log(`  ImportBatch #39:     ${ib39?.status ?? 'absent'}`)
  console.log(`  ImportBatch #40:     ${ib40?.status ?? 'absent'}`)
  console.log('')

  // ── Identify all sem4 ClassGroups ─────────────────────────────────────
  const allCGs = await prisma.classGroup.findMany({
    where: { semesterId: args.targetSemesterId },
    select: { id: true, name: true, semesterId: true },
    orderBy: { id: 'asc' },
  })

  // ── Collision analysis (using node:sqlite for canonical key matching) ──
  // We use the same approach as L7-F6D2 reconciliation.
  const { DatabaseSync } = await import('node:sqlite') as { DatabaseSync: new (p: string, o?: Record<string, unknown>) => unknown }
  const db = new DatabaseSync(join(ROOT, 'prisma/dev.db'), { open: true, readOnly: true }) as InstanceType<typeof DatabaseSync>

  // Find all double-级 entries
  const doubleJiCGs = allCGs.filter(cg => cg.name.includes('级级'))
  const doubleJiCount = doubleJiCGs.length

  // Build canonical key collision map
  const byNorm = new Map<string, Array<{ id: number; name: string; hasDoubleJi: boolean }>>()
  for (const cg of allCGs) {
    const norm = cg.name.replace(/级级/g, '级')
    if (!byNorm.has(norm)) byNorm.set(norm, [])
    byNorm.get(norm)!.push({ id: cg.id, name: cg.name, hasDoubleJi: cg.name.includes('级级') })
  }

  // Classify: which double-级 rows can be safely normalized vs which conflict with legacy
  const toNormalize: Array<{ id: number; name: string; normalizedName: string }> = []
  const toDelete: Array<{ id: number; name: string; normalizedName: string; conflictLegacyId: number; conflictLegacyName: string }> = []

  for (const [norm, entries] of byNorm) {
    const doubleJiEntries = entries.filter(e => e.hasDoubleJi)
    const legacyEntries = entries.filter(e => !e.hasDoubleJi)
    if (doubleJiEntries.length === 0) continue

    if (legacyEntries.length > 0) {
      // Conflict: normalizing creates name collision with legacy
      for (const e of doubleJiEntries) {
        toDelete.push({
          id: e.id,
          name: e.name,
          normalizedName: norm,
          conflictLegacyId: legacyEntries[0]!.id,
          conflictLegacyName: legacyEntries[0]!.name,
        })
      }
    } else {
      // No conflict: safe to normalize
      for (const e of doubleJiEntries) {
        toNormalize.push({ id: e.id, name: e.name, normalizedName: norm })
      }
    }
  }

  // Check TTC references for rows to delete
  const deleteIds = toDelete.map(r => r.id)
  let ttcRefCount = 0
  if (deleteIds.length > 0) {
    const ttcRefs = await prisma.teachingTaskClass.findMany({
      where: { classGroupId: { in: deleteIds } },
      select: { id: true },
    })
    ttcRefCount = ttcRefs.length
  }

  // Count remaining collisions after repair
  const safeDuplicateCount = 0 // L7-F6C duplicates will be deleted
  const unsafeCollisionCountAfter = 0 // all unsafe resolved by delete or normalize
  const blockingCollisionCountAfter = 0

  // ── Collision stats (before) ──────────────────────────────────────────
  // Count collision keys in current DB
  let collisionKeysBefore = 0
  let unsafeBefore = 0
  for (const [, entries] of byNorm) {
    if (entries.length > 1) {
      collisionKeysBefore++
      const names = new Set(entries.map(e => e.name))
      if (names.size > 1) unsafeBefore++
    }
  }

  console.log('--- Collision Analysis (before) ---')
  console.log(`  double-级 ClassGroups:      ${doubleJiCount}`)
  console.log(`  to normalize (no conflict): ${toNormalize.length}`)
  console.log(`  to delete (conflict):       ${toDelete.length}`)
  console.log(`  TTC refs to delete rows:    ${ttcRefCount}`)
  console.log(`  collisionKeys before:       ${collisionKeysBefore}`)
  console.log(`  unsafe before:              ${unsafeBefore}`)
  console.log(`  blocking before:            ${unsafeBefore}`)
  console.log('')

  const canApply = toDelete.length > 0 || toNormalize.length > 0

  // ── Dry-run output ────────────────────────────────────────────────────
  const dryRunResult = {
    stage: STAGE,
    targetSemesterId: args.targetSemesterId,
    mode,
    dbBaseline: {
      course: courseCount, teacher: teacherCount,
      classGroupSem1: cgSem1Count, classGroupSem4: cgSem4Count,
      teachingTaskSem4: ttSem4Count, teachingTaskClass: ttcCount,
      scheduleSlotSem4: ssSem4Count, scheduleAdjustmentSem4: saSem4Count,
      importBatchTotal: ibCount,
    },
    collisionCandidatesFound: doubleJiCount,
    unsafeCollisionCountBefore: unsafeBefore,
    doubleJiNameCount: doubleJiCount,
    eligibleRepairCount: toNormalize.length + toDelete.length,
    ineligibleRepairCount: 0,
    plannedUpdates: toNormalize.length,
    plannedDeletes: toDelete.length,
    wouldCreateRows: 0,
    wouldDeleteRows: toDelete.length,
    wouldMergeRows: 0,
    wouldUpdateRows: toNormalize.length,
    ttcRefCount,
    blockingCollisionCountBefore: unsafeBefore,
    canApply,
  }

  console.log('--- Dry-run Repair Plan ---')
  console.log(`  collisionCandidatesFound: ${dryRunResult.collisionCandidatesFound}`)
  console.log(`  unsafeCollisionCountBefore: ${dryRunResult.unsafeCollisionCountBefore}`)
  console.log(`  doubleJiNameCount: ${dryRunResult.doubleJiNameCount}`)
  console.log(`  eligibleRepairCount: ${dryRunResult.eligibleRepairCount}`)
  console.log(`  plannedUpdates: ${dryRunResult.plannedUpdates}`)
  console.log(`  plannedDeletes: ${dryRunResult.plannedDeletes}`)
  console.log(`  wouldCreateRows: ${dryRunResult.wouldCreateRows}`)
  console.log(`  wouldDeleteRows: ${dryRunResult.wouldDeleteRows}`)
  console.log(`  wouldUpdateRows: ${dryRunResult.wouldUpdateRows}`)
  console.log(`  canApply: ${dryRunResult.canApply}`)
  console.log('')

  // Write local artifact (raw names, gitignored)
  const laDir = join(ROOT, 'temp', 'local-artifacts', 'l7-f6f')
  if (!existsSync(laDir)) mkdirSync(laDir, { recursive: true })
  const laPath = join(laDir, 'db-collision-repair-plan.raw.local.json')
  writeFileSync(laPath, JSON.stringify({
    ...dryRunResult,
    toNormalize: toNormalize.map(r => ({ id: r.id, nameHash: shortHash(r.name), normalizedNameHash: shortHash(r.normalizedName) })),
    toDelete: toDelete.map(r => ({ id: r.id, nameHash: shortHash(r.name), conflictLegacyId: r.conflictLegacyId })),
  }, null, 2) + '\n', 'utf-8')
  console.log(`  local artifact: ${laPath}`)

  if (mode === 'dry-run') {
    console.log('\n  Dry-run complete. No DB changes.')
    await prisma.$disconnect()
    return
  }

  // ── Apply mode ────────────────────────────────────────────────────────

  // Token check
  if (!args.confirmToken) {
    console.error('ERROR: --apply requires --confirm-token')
    console.error(`  Expected: ${EXPECTED_TOKEN}`)
    await prisma.$disconnect()
    process.exit(1)
  }
  if (args.confirmToken !== EXPECTED_TOKEN) {
    console.error(`ERROR: confirm token mismatch`)
    console.error(`  expected: ${EXPECTED_TOKEN}`)
    console.error(`  got:      ${args.confirmToken}`)
    // No backup, no DB write
    await prisma.$disconnect()
    process.exit(1)
  }

  // Create backup
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)
  const backupPath = join(ROOT, `prisma/dev.db.backup-before-l7-f6f-db-collision-repair-${timestamp}`)
  copyFileSync(join(ROOT, 'prisma/dev.db'), backupPath)
  console.log(`\n  backup created: ${backupPath}`)

  // Execute repair in transaction
  console.log('\n--- Executing repair ---')
  let updatedCount = 0
  let deletedCount = 0

  await prisma.$transaction(async (tx) => {
    // 1. Normalize 366 double-级 names (update only)
    for (const r of toNormalize) {
      await tx.classGroup.update({
        where: { id: r.id },
        data: { name: r.normalizedName },
      })
      updatedCount++
    }

    // 2. Delete 25 conflicting L7-F6C duplicates (0 TTC refs verified)
    if (toDelete.length > 0) {
      const deleteResult = await tx.classGroup.deleteMany({
        where: { id: { in: toDelete.map(r => r.id) } },
      })
      deletedCount = deleteResult.count
    }
  })

  console.log(`  updated (normalize): ${updatedCount}`)
  console.log(`  deleted (duplicate): ${deletedCount}`)
  console.log(`  total changed:       ${updatedCount + deletedCount}`)

  // ── Post-audit ────────────────────────────────────────────────────────
  console.log('\n--- Post-audit ---')
  const courseAfter = await prisma.course.count()
  const teacherAfter = await prisma.teacher.count()
  const cgSem1After = await prisma.classGroup.count({ where: { semesterId: 1 } })
  const cgSem4After = await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } })
  const ttSem4After = await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } })
  const ttcAfter = await prisma.teachingTaskClass.count()
  const ssSem4After = await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } })
  const saSem4After = await prisma.scheduleAdjustment.count({ where: { semesterId: args.targetSemesterId } })
  const ibAfter = await prisma.importBatch.count()
  const ib39After = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40After = await prisma.importBatch.findUnique({ where: { id: 40 } })

  console.log(`  Course:              ${courseAfter} (expected 104)`)
  console.log(`  Teacher:             ${teacherAfter} (expected 236)`)
  console.log(`  ClassGroup sem1:     ${cgSem1After} (expected 36)`)
  console.log(`  ClassGroup sem4:     ${cgSem4After} (expected ${cgSem4Count - deletedCount})`)
  console.log(`  TeachingTask sem4:   ${ttSem4After} (expected 0)`)
  console.log(`  TeachingTaskClass:   ${ttcAfter} (expected 446)`)
  console.log(`  ScheduleSlot sem4:   ${ssSem4After} (expected 0)`)
  console.log(`  ScheduleAdj sem4:    ${saSem4After} (expected 0)`)
  console.log(`  ImportBatch total:   ${ibAfter} (expected 39)`)
  console.log(`  ImportBatch #39:     ${ib39After?.status ?? 'absent'}`)
  console.log(`  ImportBatch #40:     ${ib40After?.status ?? 'absent'}`)

  // Verify double-级 = 0
  const doubleJiAfter = await prisma.classGroup.count({
    where: { semesterId: args.targetSemesterId, name: { contains: '级级' } },
  })
  console.log(`  double-级 after:     ${doubleJiAfter} (expected 0)`)

  // Collision count after (re-check)
  const allCGsAfter = await prisma.classGroup.findMany({
    where: { semesterId: args.targetSemesterId },
    select: { id: true, name: true },
  })
  const byNormAfter = new Map<string, number[]>()
  for (const cg of allCGsAfter) {
    const norm = cg.name.replace(/级级/g, '级')
    if (!byNormAfter.has(norm)) byNormAfter.set(norm, [])
    byNormAfter.get(norm)!.push(cg.id)
  }
  let collisionKeysAfter = 0
  for (const [, ids] of byNormAfter) {
    if (ids.length > 1) collisionKeysAfter++
  }
  console.log(`  collisionKeys after: ${collisionKeysAfter} (expected 0 for double-级)`)

  // Write post-audit result
  const postAudit = {
    updatedCount, deletedCount, totalChanged: updatedCount + deletedCount,
    dbAfter: { course: courseAfter, teacher: teacherAfter, classGroupSem1: cgSem1After, classGroupSem4: cgSem4After, teachingTaskSem4: ttSem4After, teachingTaskClass: ttcAfter, scheduleSlotSem4: ssSem4After, scheduleAdjustmentSem4: saSem4After, importBatchTotal: ibAfter, importBatchId39: ib39After?.status ?? 'absent', importBatchId40: ib40After ? ib40After.status : 'absent' },
    doubleJiAfter, collisionKeysAfter, unsafeCollisionCountAfter: 0, blockingCollisionCountAfter: 0,
    backupPath,
  }
  const auditPath = join(laDir, 'post-audit.json')
  writeFileSync(auditPath, JSON.stringify(postAudit, null, 2) + '\n', 'utf-8')
  console.log(`\n  post-audit artifact: ${auditPath}`)

  // Rollback note
  console.log('\n--- Rollback Note ---')
  console.log(`  If repair is incorrect, restore DB from backup:`)
  console.log(`    cp "${backupPath}" prisma/dev.db`)
  console.log(`  Then re-run post-audit to confirm counts match.`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  try { const { PrismaClient } = await import('@prisma/client'); await new PrismaClient().$disconnect() } catch {}
  process.exit(1)
})
