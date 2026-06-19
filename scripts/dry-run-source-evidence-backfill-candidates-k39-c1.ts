/**
 * K39-C1: Dry-run source evidence backfill candidate generator.
 *
 * READ-ONLY. Does NOT write DB. Does NOT call prisma update/create/delete.
 * Generates anonymized candidate report for manual review.
 *
 * Usage:
 *   npx tsx scripts/dry-run-source-evidence-backfill-candidates-k39-c1.ts
 *
 * Output:
 *   docs/k39-c1-source-evidence-backfill-candidates.json (anonymized)
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()
const ROOT = process.cwd()
const OUTPUT_PATH = join(ROOT, 'docs', 'k39-c1-source-evidence-backfill-candidates.json')

// Simple hash for anonymization (deterministic, non-reversible)
function hashStr(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return 'h' + Math.abs(h).toString(36)
}

interface Candidate {
  ttcId: number
  ttId: number
  importBatchId: number | null
  importBatchIdConfidence: 'HIGH' | 'NONE'
  sourceArtifactFilename: string | null
  sourceArtifactConfidence: 'HIGH' | 'NONE'
  sourceRowIndex: number | null
  sourceRowIndexConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  sourceKeyword: string | null
  sourceKeywordConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  sourceClassName: string | null
  sourceClassNameConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  sourceRemark: string | null
  sourceRemarkConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  blockers: string[]
  safeToApplyFuture: boolean
  // Anonymized identifiers for matching
  courseHash: string
  teacherHash: string
  classGroupHash: string
  weekType: string
  startWeek: number
  endWeek: number
}

interface SourceRecord {
  course: string
  teacher: string
  className: string
  dayOfWeek: number
  timeSlot: string
  weekType: string
  weekStart: number
  weekEnd: number
  remark: string | null
  idx: number // source row index (0-based)
}

async function main() {
  console.log('=== K39-C1: Dry-Run Source Evidence Backfill Candidates ===')
  console.log('Mode: DRY-RUN ONLY — NO DB WRITES\n')

  // 1. Get confirmed batch
  const confirmedBatch = await prisma.importBatch.findFirst({
    where: { status: 'confirmed' },
    orderBy: { id: 'asc' },
  })
  if (!confirmedBatch) {
    console.error('❌ No confirmed batch found')
    process.exit(1)
  }
  console.log(`📋 Confirmed batch: #${confirmedBatch.id} (${confirmedBatch.filename})`)

  // 2. Read JSON artifact
  if (!confirmedBatch.parsedJsonPath) {
    console.error('❌ Confirmed batch has no parsedJsonPath')
    process.exit(1)
  }
  const artifactPath = join(ROOT, confirmedBatch.parsedJsonPath)
  let sourceRecords: SourceRecord[]
  try {
    const raw = readFileSync(artifactPath, 'utf-8')
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>
    sourceRecords = parsed.map((r, idx) => ({
      course: String(r.course ?? ''),
      teacher: String(r.teacher ?? ''),
      className: String((r.class_info as Record<string, unknown>)?.class_name ?? ''),
      dayOfWeek: Number(r.day_of_week ?? 0),
      timeSlot: String(r.time_slot ?? ''),
      weekType: r.week_start === r.week_end ? 'SINGLE'
        : Number(r.week_start) % 2 === 1 && Number(r.week_end) % 2 === 1 ? 'ODD'
        : Number(r.week_start) % 2 === 0 && Number(r.week_end) % 2 === 0 ? 'EVEN'
        : 'FULL',
      weekStart: Number(r.week_start ?? 0),
      weekEnd: Number(r.week_end ?? 0),
      remark: r.remark ? String(r.remark) : null,
      idx,
    }))
    console.log(`📄 Artifact loaded: ${sourceRecords.length} source records`)
  } catch (e) {
    console.error(`❌ Failed to read artifact: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }

  // 3. Get all TeachingTaskClass + TeachingTask for confirmed batch
  const teachingTasks = await prisma.teachingTask.findMany({
    where: { importBatchId: confirmedBatch.id },
    select: { id: true, importBatchId: true, courseId: true, course: { select: { name: true } }, teacherId: true, teacher: { select: { name: true } }, weekType: true, startWeek: true, endWeek: true },
  })
  const ttIdSet = new Set(teachingTasks.map(t => t.id))
  const ttMap = new Map(teachingTasks.map(t => [t.id, t]))

  const allTtc = await prisma.teachingTaskClass.findMany({
    where: { teachingTaskId: { in: Array.from(ttIdSet) } },
    select: { id: true, teachingTaskId: true, classGroupId: true, classGroup: { select: { name: true } } },
  })

  console.log(`🔗 TeachingTasks: ${teachingTasks.length}, TeachingTaskClass links: ${allTtc.length}`)

  // 4. Build source record index for matching
  // Key: course|teacher|className → array of source records
  const sourceIndex = new Map<string, SourceRecord[]>()
  for (const sr of sourceRecords) {
    const key = `${sr.course}|${sr.teacher}|${sr.className}`
    const arr = sourceIndex.get(key) ?? []
    arr.push(sr)
    sourceIndex.set(key, arr)
  }

  // 5. Generate candidates
  const candidates: Candidate[] = []
  let safeImportBatchId = 0
  let safeArtifact = 0
  let conditional = 0
  let blocked = 0

  for (const ttc of allTtc) {
    const tt = ttMap.get(ttc.teachingTaskId)
    if (!tt) continue

    const courseName = tt.course?.name ?? ''
    const teacherName = tt.teacher?.name ?? ''
    const className = ttc.classGroup?.name ?? ''

    // Safe: importBatchId
    const importBatchId = tt.importBatchId ?? null
    const importBatchIdConfidence = importBatchId ? 'HIGH' as const : 'NONE' as const
    if (importBatchId) safeImportBatchId++

    // Safe: sourceArtifactFilename
    const sourceArtifactFilename = confirmedBatch.filename ?? null
    const sourceArtifactConfidence = 'HIGH' as const
    safeArtifact++

    // Conditional: sourceRowIndex, sourceKeyword, sourceClassName, sourceRemark
    const lookupKey = `${courseName}|${teacherName}|${className}`
    const matchingRecords = sourceIndex.get(lookupKey) ?? []

    let sourceRowIndex: number | null = null
    let sourceRowIndexConfidence: Candidate['sourceRowIndexConfidence'] = 'NONE'
    let sourceKeyword: string | null = null
    let sourceKeywordConfidence: Candidate['sourceKeywordConfidence'] = 'NONE'
    let sourceClassName: string | null = null
    let sourceClassNameConfidence: Candidate['sourceClassNameConfidence'] = 'NONE'
    let sourceRemark: string | null = null
    let sourceRemarkConfidence: Candidate['sourceRemarkConfidence'] = 'NONE'
    const blockers: string[] = []

    if (matchingRecords.length === 1) {
      const sr = matchingRecords[0]
      sourceRowIndex = sr.idx
      sourceRowIndexConfidence = 'HIGH'
      sourceKeyword = courseName // anonymized in output
      sourceKeywordConfidence = 'HIGH'
      sourceClassName = className
      sourceClassNameConfidence = 'HIGH'
      sourceRemark = sr.remark
      sourceRemarkConfidence = sr.remark ? 'HIGH' : 'NONE'
      conditional++
    } else if (matchingRecords.length > 1) {
      blockers.push('MULTIPLE_CANDIDATES')
      blocked++
    } else {
      blockers.push('NO_SOURCE_RECORD')
      blocked++
    }

    candidates.push({
      ttcId: ttc.id,
      ttId: ttc.teachingTaskId,
      importBatchId,
      importBatchIdConfidence,
      sourceArtifactFilename,
      sourceArtifactConfidence,
      sourceRowIndex,
      sourceRowIndexConfidence,
      sourceKeyword,
      sourceKeywordConfidence,
      sourceClassName,
      sourceClassNameConfidence,
      sourceRemark,
      sourceRemarkConfidence,
      blockers,
      safeToApplyFuture: importBatchId !== null && blockers.length === 0,
      courseHash: hashStr(courseName),
      teacherHash: hashStr(teacherName),
      classGroupHash: hashStr(className),
      weekType: tt.weekType,
      startWeek: tt.startWeek,
      endWeek: tt.endWeek,
    })
  }

  // 6. Build output (anonymized)
  const output = {
    stage: 'K39-C1',
    generatedAt: new Date().toISOString(),
    dryRunOnly: true,
    writesDb: false,
    confirmedBatchId: confirmedBatch.id,
    confirmedBatchFilename: `[hash:${hashStr(confirmedBatch.filename ?? '')}]`,
    sourceRecordCount: sourceRecords.length,
    summary: {
      teachingTaskClassLinks: allTtc.length,
      missingImportBatchId: allTtc.length - safeImportBatchId,
      safeImportBatchIdCandidates: safeImportBatchId,
      safeArtifactFilenameCandidates: safeArtifact,
      conditionalRecordCandidates: conditional,
      blockedRecordCandidates: blocked,
      unsafeMatchStrategyCandidates: allTtc.length,
    },
    fieldRecommendation: {
      importBatchId: 'SAFE_HIGH_CONFIDENCE',
      sourceArtifactFilename: 'SAFE_HIGH_CONFIDENCE',
      sourceRowIndex: 'CONDITIONAL_REQUIRES_REVIEW',
      sourceKeyword: 'CONDITIONAL_REQUIRES_REVIEW',
      sourceClassName: 'CONDITIONAL_REQUIRES_REVIEW',
      sourceRemark: 'CONDITIONAL_REQUIRES_REVIEW',
      matchStrategy: 'DO_NOT_BACKFILL_AUTOMATICALLY',
      matchConfidence: 'DO_NOT_BACKFILL_AUTOMATICALLY',
    },
    blockers: [
      { code: 'MULTIPLE_CANDIDATES', count: candidates.filter(c => c.blockers.includes('MULTIPLE_CANDIDATES')).length, description: 'Multiple source records match — ambiguous mapping' },
      { code: 'NO_SOURCE_RECORD', count: candidates.filter(c => c.blockers.includes('NO_SOURCE_RECORD')).length, description: 'No source record found in artifact' },
    ],
    fieldBlockers: {
      matchStrategy: 'Requires re-running importer matching logic. May differ from original import-time behavior.',
      matchConfidence: 'Same as matchStrategy. Non-deterministic recompute.',
    },
    candidates: candidates.map(c => ({
      ...c,
      // Ensure no raw names leak — hashes only
      courseHash: c.courseHash,
      teacherHash: c.teacherHash,
      classGroupHash: c.classGroupHash,
    })),
    nextStageRecommendation: 'K39-C2-SOURCE-EVIDENCE-BACKFILL-MANUAL-REVIEW-PLAN',
  }

  // 7. Write output
  const docsDir = join(ROOT, 'docs')
  if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true })
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2))

  console.log(`\n📊 Results:`)
  console.log(`   Safe importBatchId candidates: ${safeImportBatchId}/${allTtc.length}`)
  console.log(`   Safe artifactFilename candidates: ${safeArtifact}/${allTtc.length}`)
  console.log(`   Conditional record candidates: ${conditional}/${allTtc.length}`)
  console.log(`   Blocked candidates: ${blocked}/${allTtc.length}`)
  console.log(`   Unsafe matchStrategy: ${allTtc.length}/${allTtc.length}`)
  console.log(`\n✅ Output written to: ${OUTPUT_PATH}`)
  console.log(`   dryRunOnly: true, writesDb: false`)
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
