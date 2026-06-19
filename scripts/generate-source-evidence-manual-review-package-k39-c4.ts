/**
 * K39-C4: Generate source evidence manual review package.
 *
 * READ-ONLY. Generates gitignored review package for 192 unique conditional candidates.
 * Does NOT write DB. Does NOT run imports.
 *
 * Output:
 *   temp/local-artifacts/k39-c4/source-evidence-manual-review-package.json (gitignored)
 *   docs/k39-c4-source-evidence-manual-review-package-summary.json (committed, anonymized)
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

const prisma = new PrismaClient()
const ROOT = process.cwd()
const PACKAGE_DIR = join(ROOT, 'temp', 'local-artifacts', 'k39-c4')
const PACKAGE_PATH = join(PACKAGE_DIR, 'source-evidence-manual-review-package.json')
const SUMMARY_PATH = join(ROOT, 'docs', 'k39-c4-source-evidence-manual-review-package-summary.json')

function hashStr(s: string): string {
  return createHash('sha256').update(s).digest('hex').substring(0, 16)
}

async function main() {
  console.log('=== K39-C4: Manual Review Package Generator ===')
  console.log('Mode: PACKAGE GENERATION ONLY — NO DB WRITES\n')

  // 1. Read K39-C1 candidates
  const candidateJsonPath = join(ROOT, 'docs', 'k39-c1-source-evidence-backfill-candidates.json')
  if (!existsSync(candidateJsonPath)) {
    console.error('❌ K39-C1 candidate JSON not found')
    process.exit(1)
  }
  const candidateJson = JSON.parse(readFileSync(candidateJsonPath, 'utf-8'))
  console.log(`📋 K39-C1 candidates loaded: ${candidateJson.candidates?.length ?? 0}`)

  // 2. Filter unique conditional candidates
  const uniqueCandidates = (candidateJson.candidates ?? []).filter(
    (c: Record<string, unknown>) => c.safeToApplyFuture === true && (c.blockers as string[])?.length === 0
  )
  console.log(`🔗 Unique conditional candidates: ${uniqueCandidates.length}`)

  // 3. Get confirmed batch for artifact
  const confirmedBatch = await prisma.importBatch.findFirst({ where: { status: 'confirmed' } })
  if (!confirmedBatch) { console.error('❌ No confirmed batch'); process.exit(1) }

  // 4. Read source artifact
  const artifactPath = join(ROOT, confirmedBatch.parsedJsonPath ?? '')
  let sourceRecords: Array<Record<string, unknown>> = []
  if (existsSync(artifactPath)) {
    sourceRecords = JSON.parse(readFileSync(artifactPath, 'utf-8'))
    console.log(`📄 Source artifact loaded: ${sourceRecords.length} records`)
  }

  // 5. Get TeachingTask + TeachingTaskClass for unique candidates
  const ttIds = new Set(uniqueCandidates.map((c: Record<string, unknown>) => c.ttId))
  const teachingTasks = await prisma.teachingTask.findMany({
    where: { id: { in: Array.from(ttIds) } },
    select: { id: true, courseId: true, course: { select: { name: true } }, teacherId: true, teacher: { select: { name: true } }, startWeek: true, endWeek: true },
  })
  const ttMap = new Map(teachingTasks.map(t => [t.id, t]))

  const ttcIds = uniqueCandidates.map((c: Record<string, unknown>) => c.ttcId)
  const allTtc = await prisma.teachingTaskClass.findMany({
    where: { id: { in: ttcIds } },
    select: { id: true, teachingTaskId: true, classGroup: { select: { name: true } } },
  })
  const ttcMap = new Map(allTtc.map(t => [t.id, t]))

  // 6. Build source record index
  const sourceIndex = new Map<string, number[]>()
  sourceRecords.forEach((sr, idx) => {
    const key = `${sr.course ?? ''}|${sr.teacher ?? ''}|${(sr.class_info as Record<string, unknown>)?.class_name ?? ''}`
    const arr = sourceIndex.get(key) ?? []
    arr.push(idx)
    sourceIndex.set(key, arr)
  })

  // 7. Generate review records
  const reviewRecords = uniqueCandidates.map((c: Record<string, unknown>) => {
    const tt = ttMap.get(c.ttId as number)
    const ttc = ttcMap.get(c.ttcId as number)
    const courseName = tt?.course?.name ?? ''
    const teacherName = tt?.teacher?.name ?? ''
    const className = ttc?.classGroup?.name ?? ''
    const lookupKey = `${courseName}|${teacherName}|${className}`
    const matchingIndices = sourceIndex.get(lookupKey) ?? []
    const sr = matchingIndices.length === 1 ? sourceRecords[matchingIndices[0]] : null

    return {
      teachingTaskClassId: c.ttcId,
      teachingTaskId: c.ttId,
      candidate: {
        sourceRowIndex: sr ? matchingIndices[0] : null,
        sourceKeyword: courseName || null,
        sourceClassName: className || null,
        sourceRemark: sr?.remark ? String(sr.remark) : null,
      },
      confidence: sr ? 'HIGH' : 'LOW',
      sourceRecordHash: hashStr(lookupKey),
      review: {
        decision: 'pending' as const,
        allowedValues: ['approve', 'reject', 'needs-review'],
        reviewerNote: '',
      },
    }
  })

  // 8. Build package
  const packageData = {
    stage: 'K39-C4',
    generatedAt: new Date().toISOString(),
    dryRunOnly: true,
    writesDb: false,
    reviewPackage: true,
    candidateScope: 'UNIQUE_CONDITIONAL_ONLY',
    records: reviewRecords,
  }

  // 9. Write to gitignored path
  if (!existsSync(PACKAGE_DIR)) mkdirSync(PACKAGE_DIR, { recursive: true })
  writeFileSync(PACKAGE_PATH, JSON.stringify(packageData, null, 2))
  const packageContent = readFileSync(PACKAGE_PATH, 'utf-8')
  const packageSha256 = createHash('sha256').update(packageContent).digest('hex')

  console.log(`\n📦 Review package written:`)
  console.log(`   Path: ${PACKAGE_PATH}`)
  console.log(`   Records: ${reviewRecords.length}`)
  console.log(`   SHA256: ${packageSha256}`)

  // 10. Write committed summary (anonymized)
  const summary = {
    stage: 'K39-C4',
    dryRunOnly: true,
    writesDb: false,
    packagePath: 'temp/local-artifacts/k39-c4/source-evidence-manual-review-package.json',
    packageGitignored: true,
    packageRecordCount: reviewRecords.length,
    packageSha256,
    uniqueCandidates: uniqueCandidates.length,
    multipleCandidates: (candidateJson.candidates?.length ?? 0) - uniqueCandidates.length,
    includedScope: 'UNIQUE_CONDITIONAL_ONLY',
    excludedScope: 'MULTIPLE_CANDIDATES',
    fieldsIncludedForReview: ['sourceRowIndex', 'sourceKeyword', 'sourceClassName', 'sourceRemark'],
    fieldsExcludedFromApply: ['matchStrategy', 'matchConfidence'],
    noDbWrites: true,
    noApprovedByDefault: true,
    nextStageRecommendation: 'K39-C5-SOURCE-EVIDENCE-CONDITIONAL-FIELDS-APPROVED-APPLY',
  }
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2))

  console.log(`\n📄 Committed summary written: ${SUMMARY_PATH}`)
  console.log(`\n✅ Package generation complete.`)
  console.log(`   Reviewer must edit decision field before K39-C5 apply.`)
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
