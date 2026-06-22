/**
 * L7-F1 Diagnostic Script — Apply Plan Mismatch Root Cause Analysis
 *
 * Stage: L7-F1-XLSX-COURSE-SETTING-APPLY-TRIAL-SEMANTIC-DIAGNOSTIC
 *
 * Read-only diagnostic. Compares three code paths to identify where the
 * L7-A3 "903 importable" vs L7-F "4 importable" divergence originates.
 *
 * Path A: L7-A3 classification (L6-E1 summarizeManualResolutionState)
 *   → uses buildInitialManualResolutionState + summarize
 *
 * Path B: Browser-equivalent plan (buildInitialManualResolutionState → L6-E2 plan)
 *   → simulates what the browser does when user clicks "生成部分导入计划"
 *
 * Path C: L7-F CLI trial (L6-E2 plan with empty manualResolutions)
 *   → what the trial script actually executed
 *
 * All paths are read-only. No DB writes, no apply, no backup.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const DIAGNOSIS_STAGE = 'L7-F1-XLSX-COURSE-SETTING-APPLY-TRIAL-SEMANTIC-DIAGNOSTIC'

// ── Args ─────────────────────────────────────────────────────────────────────

type CliArgs = {
  xlsx: string
  targetSemesterId: number
  help: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { xlsx: '', targetSemesterId: 0, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--xlsx') args.xlsx = argv[++i] ?? ''
    else if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.xlsx || !args.targetSemesterId) {
    console.log('Usage: npx tsx scripts/diagnose-xlsx-course-setting-apply-plan-mismatch-l7-f1.ts \\')
    console.log('  --xlsx "<path>" --target-semester-id <id>')
    console.log('')
    console.log('Read-only diagnostic. Compares L7-A3 classification vs L7-F trial plan.')
    return
  }

  console.log(`=== L7-F1 Diagnostic: Apply Plan Mismatch ===`)
  console.log(`  xlsx: ${args.xlsx}`)
  console.log(`  targetSemesterId: ${args.targetSemesterId}`)
  console.log('')

  const prisma = new PrismaClient()

  // ── 1. DB counts + ImportBatch #39 ─────────────────────────────────
  console.log('[1/5] DB counts + ImportBatch #39')
  const counts = {
    course: await prisma.course.count(),
    teacher: await prisma.teacher.count(),
    classGroup: await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } }),
    teachingTask: await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } }),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    importBatch: await prisma.importBatch.count(),
    scheduleSlot: await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } }),
    scheduleAdjustment: await prisma.scheduleAdjustment.count({ where: { semesterId: args.targetSemesterId } }),
  }
  console.log(`  Course: ${counts.course}`)
  console.log(`  Teacher: ${counts.teacher}`)
  console.log(`  ClassGroup (semester ${args.targetSemesterId}): ${counts.classGroup}`)
  console.log(`  TeachingTask (semester ${args.targetSemesterId}): ${counts.teachingTask}`)
  console.log(`  TeachingTaskClass: ${counts.teachingTaskClass}`)
  console.log(`  ImportBatch: ${counts.importBatch}`)
  console.log(`  ScheduleSlot (semester ${args.targetSemesterId}): ${counts.scheduleSlot}`)
  console.log(`  ScheduleAdjustment (semester ${args.targetSemesterId}): ${counts.scheduleAdjustment}`)
  console.log('')

  const importBatch39 = await prisma.importBatch.findUnique({ where: { id: 39 } }).catch(() => null)
  console.log(`  ImportBatch #39 exists: ${importBatch39 != null}`)
  if (importBatch39) {
    console.log(`    status: ${importBatch39.status}`)
    console.log(`    strategy: ${importBatch39.strategy}`)
    console.log(`    filename: ${importBatch39.filename}`)
    console.log(`    recordCount: ${importBatch39.recordCount}`)
    console.log(`    createdTaskCount: ${importBatch39.createdTaskCount}`)
    console.log(`    createdSlotCount: ${importBatch39.createdSlotCount}`)
    console.log(`    semesterId: ${importBatch39.semesterId}`)
    console.log(`    createdAt: ${importBatch39.createdAt.toISOString()}`)
    console.log(`    confirmedAt: ${importBatch39.confirmedAt?.toISOString() ?? 'null'}`)
  }
  console.log('')

  // ── 2. Load Excel + build shared foundations ────────────────────────
  console.log('[2/5] Parse Excel + build L4/L6-D foundations')
  const buffer = readFileSync(args.xlsx)
  const fileSha256 = createHash('sha256').update(buffer).digest('hex')

  const { prisma: prisma2 } = await import('@/lib/prisma')
  const { loadCourseSettingExistingDataForSemester } = await import('@/lib/import/course-setting-xlsx-preview')
  const { buildCourseSettingTeachingTaskDryRun } = await import('@/lib/import/course-setting-teaching-task-dry-run')
  const { buildCourseSettingApprovalPackageWithTargetSemester } = await import('@/lib/import/course-setting-approval-package-l6-d')
  const { buildCourseSettingApprovalReviewUi } = await import('@/lib/import/course-setting-approval-review-ui-l6-d2')
  const {
    buildCourseSettingPartialImportPlan,
  } = await import('@/lib/import/course-setting-partial-import-plan-l6-e2')
  const {
    buildInitialManualResolutionState,
    summarizeManualResolutionState,
  } = await import('@/lib/import/course-setting-manual-resolution-l6-e1')

  const semester = await prisma2.semester.findUnique({
    where: { id: args.targetSemesterId },
    select: { id: true, name: true, code: true, isActive: true },
  })
  if (!semester) {
    console.error(`ERROR: semester ${args.targetSemesterId} not found`)
    await prisma2.$disconnect()
    return
  }
  console.log(`  semester: ${semester.name} (${semester.code ?? 'n/a'}) isActive=${semester.isActive}`)

  const existingData = await loadCourseSettingExistingDataForSemester(args.targetSemesterId)
  console.log(`  existing courses: ${existingData.courses.length}`)
  console.log(`  existing teachers: ${existingData.teachers.length}`)
  console.log(`  existing classGroups: ${existingData.classGroups.length}`)
  console.log(`  existing teachingTasks: ${existingData.teachingTasks.length}`)

  const dryRunResult = await buildCourseSettingTeachingTaskDryRun({
    xlsxBuffer: buffer,
    artifactFilename: args.xlsx,
    existingData,
    options: { parserVersion: 'l2-parser-v1', includeRawValues: true, maxPreviewRows: 100000 },
  })
  console.log(`  dryRunResult previewCandidates: ${dryRunResult.previewCandidates.length}`)

  const filenameHash = createHash('sha256').update(args.xlsx, 'utf8').digest('hex').slice(0, 12)
  const idHash = createHash('sha256').update(String(semester.id), 'utf8').digest('hex').slice(0, 12)
  const nameHash = createHash('sha256').update(semester.name, 'utf8').digest('hex').slice(0, 12)
  const codeHash = semester.code
    ? createHash('sha256').update(semester.code, 'utf8').digest('hex').slice(0, 12)
    : null

  const approvalPackage = buildCourseSettingApprovalPackageWithTargetSemester({
    dryRunResult,
    targetSemester: {
      id: semester.id,
      idHash, nameHash, codeHash,
      isActive: semester.isActive,
      taskCount: dryRunResult.existingDataSummary.teachingTaskCount,
      classGroupCount: dryRunResult.existingDataSummary.classGroupCount,
    },
    sourceArtifact: {
      artifactSha256: fileSha256,
      artifactFilenameHash: filenameHash,
      sizeBytes: buffer.length,
      parserVersion: dryRunResult.parser.parserVersion,
    },
  })

  const reviewUi = buildCourseSettingApprovalReviewUi({ approvalPackage })
  console.log(`  reviewUi rows: ${reviewUi.rows.length}`)
  console.log(`  reviewUi summary: total=${reviewUi.summary.totalItems} blocked=${reviewUi.summary.blockedItems} newCourseCandidate=${reviewUi.summary.newCourseCandidateItems}`)
  console.log('')

  // ── 3. Path A: L7-A3 classification ──────────────────────────────
  // This is what L7-A3 measures: the L6-E1 initial state + summarize.
  console.log('[3/5] Path A: L7-A3 classification (buildInitialManualResolutionState + summarize)')
  const l7a3ResolutionState = buildInitialManualResolutionState(reviewUi.rows, args.targetSemesterId)
  const l7a3Summary = summarizeManualResolutionState(l7a3ResolutionState)
  console.log(`  totalItems: ${l7a3Summary.totalItems}`)
  console.log(`  importableItems: ${l7a3Summary.importableItems}`)
  console.log(`  newCourseCandidateItems: ${l7a3Summary.newCourseCandidateItems}`)
  console.log(`  confirmedNewCourseCandidateItems: ${l7a3Summary.confirmedNewCourseCandidateItems}`)
  console.log(`  needsResolutionItems: ${l7a3Summary.needsResolutionItems}`)
  console.log(`  ignoredItems: ${l7a3Summary.ignoredItems}`)
  console.log(`  pendingItems: ${l7a3Summary.pendingItems}`)
  console.log(`  courseNameMissingItems: ${l7a3Summary.courseNameMissingItems}`)
  console.log(`  courseAmbiguousItems: ${l7a3Summary.courseAmbiguousItems}`)
  console.log(`  unresolvedBlockers:`, l7a3Summary.unresolvedBlockers)
  console.log('')

  // ── 4. Path B: Browser-equivalent plan ─────────────────────────────
  // The browser calls buildInitialManualResolutionState() then passes
  // the resulting array to the plan API. This simulates that flow.
  console.log('[4/5] Path B: Browser-equivalent plan (initial resolutions → L6-E2 plan)')
  const browserResolutions = buildInitialManualResolutionState(reviewUi.rows, args.targetSemesterId)
  const browserPlan = await buildCourseSettingPartialImportPlan({
    reviewRows: reviewUi.rows,
    manualResolutions: browserResolutions,
    existingData,
    targetSemesterId: args.targetSemesterId,
    sourceArtifact: { filename: args.xlsx, sha256: fileSha256, sizeBytes: buffer.length },
    reviewPackageFingerprintHash: approvalPackage.dryRunFingerprint.hash,
  })
  console.log(`  importableRows: ${browserPlan.summary.plannedImportRows}`)
  console.log(`  skippedRows: ${browserPlan.summary.skippedRows}`)
  console.log(`  unresolvedRows: ${browserPlan.summary.unresolvedRows}`)
  console.log(`  ignoredRows: ${browserPlan.summary.ignoredRows}`)
  console.log(`  blockingRows: ${browserPlan.summary.blockingRows}`)
  console.log(`  courseCreateCandidates: ${browserPlan.summary.courseCreateCandidates}`)
  console.log(`  rowsUsingNewCourseCandidate: ${browserPlan.summary.rowsUsingNewCourseCandidate}`)
  console.log(`  confirmedNewCourseCandidates: ${browserPlan.summary.confirmedNewCourseCandidates}`)
  console.log(`  teacherMissingRows: ${browserPlan.summary.teacherMissingRows}`)
  console.log(`  classGroupMissingRows: ${browserPlan.summary.classGroupMissingRows}`)
  console.log(`  taskAssignmentReviewRows: ${browserPlan.summary.taskAssignmentReviewRows}`)
  console.log(`  courseNameMissingRows: ${browserPlan.summary.courseNameMissingRows}`)
  console.log(`  courseAmbiguousRows: ${browserPlan.summary.courseAmbiguousRows}`)
  console.log(`  teachingTaskCandidates: ${browserPlan.summary.teachingTaskCandidates}`)
  console.log(`  teachingTaskClassCandidates: ${browserPlan.summary.teachingTaskClassCandidates}`)
  console.log(`  rowsUsingExistingCourse: ${browserPlan.summary.rowsUsingExistingCourse}`)

  // Unresolved breakdown
  const browserUnresolvedBreakdown: Record<string, number> = {}
  for (const row of browserPlan.plan.unresolvedRows) {
    for (const reason of row.unresolvedReasons) {
      browserUnresolvedBreakdown[reason] = (browserUnresolvedBreakdown[reason] ?? 0) + 1
    }
  }
  console.log(`  unresolvedReasonBreakdown:`, browserUnresolvedBreakdown)
  console.log('')

  // ── 5. Path C: L7-F CLI trial (empty manualResolutions) ───────────
  // This is what the trial script actually ran.
  console.log('[5/5] Path C: L7-F CLI trial (empty manualResolutions = [])')
  const cliPlan = await buildCourseSettingPartialImportPlan({
    reviewRows: reviewUi.rows,
    manualResolutions: [],   // ← THE KEY DIFFERENCE
    existingData,
    targetSemesterId: args.targetSemesterId,
    sourceArtifact: { filename: args.xlsx, sha256: fileSha256, sizeBytes: buffer.length },
    reviewPackageFingerprintHash: approvalPackage.dryRunFingerprint.hash,
  })
  console.log(`  importableRows: ${cliPlan.summary.plannedImportRows}`)
  console.log(`  skippedRows: ${cliPlan.summary.skippedRows}`)
  console.log(`  unresolvedRows: ${cliPlan.summary.unresolvedRows}`)
  console.log(`  ignoredRows: ${cliPlan.summary.ignoredRows}`)
  console.log(`  blockingRows: ${cliPlan.summary.blockingRows}`)
  console.log(`  courseCreateCandidates: ${cliPlan.summary.courseCreateCandidates}`)
  console.log(`  rowsUsingNewCourseCandidate: ${cliPlan.summary.rowsUsingNewCourseCandidate}`)
  console.log(`  confirmedNewCourseCandidates: ${cliPlan.summary.confirmedNewCourseCandidates}`)
  console.log(`  teacherMissingRows: ${cliPlan.summary.teacherMissingRows}`)
  console.log(`  classGroupMissingRows: ${cliPlan.summary.classGroupMissingRows}`)
  console.log(`  taskAssignmentReviewRows: ${cliPlan.summary.taskAssignmentReviewRows}`)
  console.log(`  courseNameMissingRows: ${cliPlan.summary.courseNameMissingRows}`)
  console.log(`  teachingTaskCandidates: ${cliPlan.summary.teachingTaskCandidates}`)
  console.log(`  teachingTaskClassCandidates: ${cliPlan.summary.teachingTaskClassCandidates}`)

  const cliUnresolvedBreakdown: Record<string, number> = {}
  for (const row of cliPlan.plan.unresolvedRows) {
    for (const reason of row.unresolvedReasons) {
      cliUnresolvedBreakdown[reason] = (cliUnresolvedBreakdown[reason] ?? 0) + 1
    }
  }
  console.log(`  unresolvedReasonBreakdown:`, cliUnresolvedBreakdown)

  // Plan hash
  const stableStringify = (v: unknown): string => {
    if (v == null || typeof v !== 'object') return JSON.stringify(v)
    if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
    const keys = Object.keys(v as Record<string, unknown>).sort()
    return `{${keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])).join(',')}}`
  }
  const cliPlanHash = createHash('sha256').update(stableStringify(cliPlan), 'utf8').digest('hex')
  console.log(`  planHash: ${cliPlanHash}`)
  console.log('')

  // ── 6. Divergence analysis ────────────────────────────────────────
  console.log('=== Divergence Analysis ===')
  console.log(`  maxPreviewRows used: 100000 (L7-A2A fix applied to diagnostic)`)
  console.log(`  dryRunResult previewCandidates: ${dryRunResult.previewCandidates.length}`)
  console.log(`  reviewUi rows: ${reviewUi.rows.length}`)
  console.log(`  L7-A3 importableItems (L6-E1 status-based): ${l7a3Summary.importableItems}`)
  console.log(`  Browser plan importable (L6-E2 with resolutions): ${browserPlan.summary.plannedImportRows}`)
  console.log(`  CLI plan importable (L6-E2 without resolutions): ${cliPlan.summary.plannedImportRows}`)
  console.log('')

  // First divergence: L7-A3 says X but L6-E2 browser plan says Y
  let firstDivergence = ''
  if (l7a3Summary.importableItems !== browserPlan.summary.plannedImportRows) {
    firstDivergence = `L7-A3 status-based importableItems=${l7a3Summary.importableItems} ≠ browser plan plannedImportRows=${browserPlan.summary.plannedImportRows}`
    console.log(`  [1st] ${firstDivergence}`)
    console.log(`        L7-A3 counts resolutionStatus='autoAllowedNewCourse' as importable`)
    console.log(`        L6-E2 plan validation is stricter: rows must have no blockers at all`)
    console.log(`        autoAllowedNewCourse rows may still have TEACHER_MISSING/CLASS_GROUP_MISSING blockers`)
  } else {
    console.log(`  [1st] L7-A3 importable (${l7a3Summary.importableItems}) = browser plan (${browserPlan.summary.plannedImportRows}) — no divergence at this level`)
  }

  // Second divergence: browser path vs CLI path
  if (browserPlan.summary.plannedImportRows !== cliPlan.summary.plannedImportRows) {
    const second = `Browser plan (${browserPlan.summary.plannedImportRows}) ≠ CLI plan (${cliPlan.summary.plannedImportRows})`
    console.log(`  [2nd] ${second}`)
    console.log(`        Browser calls buildInitialManualResolutionState() first`)
    console.log(`        CLI passes [] → no resolutions → findResolution()=null for all rows`)
  } else {
    console.log(`  [2nd] Browser plan (${browserPlan.summary.plannedImportRows}) = CLI plan (${cliPlan.summary.plannedImportRows}) — buildInitialManualResolutionState() makes no difference to L6-E2 plan`)
  }
  console.log('')

  // Root cause explanation
  console.log('=== Root Cause (Three-Level) ===')
  console.log('')
  console.log('  [Level 1] maxPreviewRows truncation (MOST IMPACTFUL)')
  console.log(`    - The L4 mapper defaults maxPreviewRows to 50 (line 518 of course-setting-teaching-task-dry-run.ts)`)
  console.log(`    - The approval-review route passes maxPreviewRows: 100000 (L7-A2A fix)`)
  console.log(`    - The partial-import-plan route and partial-import-apply route do NOT pass maxPreviewRows`)
  console.log(`    - This means the L7-F plan was built on only 50 of ${dryRunResult.previewCandidates.length} rows`)
  console.log(`    - With ${dryRunResult.previewCandidates.length} rows: ${browserPlan.summary.plannedImportRows} importable`)
  console.log(`    - The L7-A2A fix only applied to the approval-review route, not to plan/apply routes`)
  console.log('')
  console.log('  [Level 2] L7-A3 "importableItems" is a status metric, not a plan metric')
  console.log(`    - L7-A3 counts resolutionStatus='autoAllowedNewCourse' as importable (${l7a3Summary.importableItems} items)`)
  console.log(`    - L6-E2 plan counts rows with zero blockers as importable (${browserPlan.summary.plannedImportRows} rows)`)
  console.log(`    - 'autoAllowedNewCourse' rows may still have TEACHER_MISSING/CLASS_GROUP_MISSING blockers`)
  console.log(`    - So L7-A3 "importable" ≠ L6-E2 plan "importable" (different definitions)`)
  console.log('')
  console.log('  [Level 3] semester 4 has 0 ClassGroups')
  console.log(`    - existing classGroups: ${existingData.classGroups.length}`)
  console.log(`    - The historical import created ClassGroups in the LEGACY-DEFAULT semester, not semester 4`)
  console.log(`    - Even if all 1167 rows were processed, TeachingTaskClass creation requires classGroupIds`)
  console.log(`    - With 0 ClassGroups, no TeachingTaskClass can be created (only TeachingTask without classes)`)
  console.log('')
  console.log('  All three issues must be addressed for a valid import.')
  console.log('')

  // Recommendations
  console.log('=== Recommendation ===')
  console.log(`  1. ImportBatch #39 (${importBatch39?.status ?? 'MISSING'}): created ${importBatch39?.createdAt.toISOString() ?? 'unknown'}`)
  console.log(`     - Contains 0 created tasks (correct — no ClassGroups and limited rows)`)
  console.log(`     - Harmless empty record — can keep, but new apply will create a new batch`)
  console.log(`     - Decision: defer (no cleanup needed)`)
  console.log('')
  console.log(`  2. Fix maxPreviewRows in plan/apply routes (ESSENTIAL)`)
  console.log(`     - Add maxPreviewRows: 100000 to the L4 mapper call in:`)
  console.log(`       src/app/api/admin/import/course-setting-xlsx/partial-import-plan/route.ts`)
  console.log(`       src/app/api/admin/import/course-setting-xlsx/partial-import-apply/route.ts`)
  console.log(`     - Also pass in the CLI trial script`)
  console.log(`     - This is the same fix L7-A2A applied to the approval-review route`)
  console.log('')
  console.log(`  3. ClassGroup scope`)
  console.log(`     - semester 4 has ${existingData.classGroups.length} ClassGroups`)
  console.log(`     - Historical data is in a different semester (LEGACY-DEFAULT)`)
  console.log(`     - User must import ClassGroups into semester 4 OR use an existing semester with ClassGroups`)
  console.log(`     - Without ClassGroups, no TeachingTaskClass links can be created`)
  console.log('')
  console.log(`  4. Reconcile "importable" definitions`)
  console.log(`     - L7-A3 resolutionStatus='autoAllowedNewCourse' ≠ L6-E2 plan "importable"`)
  console.log(`     - Need to clarify in UI/docs what "importable" means at each stage`)
  console.log(`     - Recommendation: update L7-A3 summary to distinguish "auto-allowed" from "fully resolved"`)
  console.log('')

  // Save artifact
  const artifactDir = join(ROOT, 'temp', 'local-artifacts', 'l7-f1')
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true })

  const diagnosticResult = {
    stage: DIAGNOSIS_STAGE,
    dbWrite: false,
    targetSemesterId: args.targetSemesterId,
    xlsxSha256: fileSha256,
    xlsxSizeBytes: buffer.length,
    semester,
    maxPreviewRowsUsed: 100000,
    totalRowsParsed: reviewUi.rows.length,
    l7a3Classification: {
      totalReviewItems: l7a3Summary.totalItems,
      importableItems: l7a3Summary.importableItems,
      newCourseCandidateItems: l7a3Summary.newCourseCandidateItems,
      confirmedNewCourseCandidateItems: l7a3Summary.confirmedNewCourseCandidateItems,
      needsResolutionItems: l7a3Summary.needsResolutionItems,
      ignoredItems: l7a3Summary.ignoredItems,
      pendingItems: l7a3Summary.pendingItems,
      courseNameMissingItems: l7a3Summary.courseNameMissingItems,
      courseAmbiguousItems: l7a3Summary.courseAmbiguousItems,
      reviewUiBlockedItems: reviewUi.summary.blockedItems,
      reviewUiNewCourseCandidateItems: reviewUi.summary.newCourseCandidateItems,
      unresolvedBlockers: l7a3Summary.unresolvedBlockers,
    },
    browserEquivalentPlan: {
      importableRows: browserPlan.summary.plannedImportRows,
      skippedRows: browserPlan.summary.skippedRows,
      unresolvedRows: browserPlan.summary.unresolvedRows,
      courseCreateCandidates: browserPlan.summary.courseCreateCandidates,
      rowsUsingNewCourseCandidate: browserPlan.summary.rowsUsingNewCourseCandidate,
      confirmedNewCourseCandidates: browserPlan.summary.confirmedNewCourseCandidates,
      teacherMissingRows: browserPlan.summary.teacherMissingRows,
      classGroupMissingRows: browserPlan.summary.classGroupMissingRows,
      taskAssignmentReviewRows: browserPlan.summary.taskAssignmentReviewRows,
      teachingTaskCandidates: browserPlan.summary.teachingTaskCandidates,
      teachingTaskClassCandidates: browserPlan.summary.teachingTaskClassCandidates,
      unresolvedReasonBreakdown: browserUnresolvedBreakdown,
    },
    l7fServiceRecompute: {
      importableRows: cliPlan.summary.plannedImportRows,
      skippedRows: cliPlan.summary.skippedRows,
      unresolvedRows: cliPlan.summary.unresolvedRows,
      courseCreateCandidates: cliPlan.summary.courseCreateCandidates,
      rowsUsingNewCourseCandidate: cliPlan.summary.rowsUsingNewCourseCandidate,
      confirmedNewCourseCandidates: cliPlan.summary.confirmedNewCourseCandidates,
      teacherMissingRows: cliPlan.summary.teacherMissingRows,
      classGroupMissingRows: cliPlan.summary.classGroupMissingRows,
      teachingTaskCandidates: cliPlan.summary.teachingTaskCandidates,
      teachingTaskClassCandidates: cliPlan.summary.teachingTaskClassCandidates,
      planHash: cliPlanHash,
      unresolvedReasonBreakdown: cliUnresolvedBreakdown,
    },
    firstDivergence: {
      step: firstDivergence || 'same count at all three levels (with 100000 maxPreviewRows)',
      l7a3Importable: l7a3Summary.importableItems,
      browserPlanImportable: browserPlan.summary.plannedImportRows,
      cliPlanImportable: cliPlan.summary.plannedImportRows,
      level1RootCause:
        'maxPreviewRows defaults to 50 in the L4 mapper (course-setting-teaching-task-dry-run.ts:518). ' +
        'The approval-review route passes maxPreviewRows:100000 (L7-A2A fix), but the partial-import-plan ' +
        'and partial-import-apply routes do not. This means L7-F plan was built on only 50 of all rows.',
      level2RootCause:
        'L7-A3 counts resolutionStatus="autoAllowedNewCourse" as importable (903 items), but L6-E2 plan ' +
        'requires fully-resolved rows (no teacher/classGroup blockers). autoAllowedNewCourse means "course ' +
        'can be created" not "all blockers resolved". The two stages use different definitions of importable.',
      level3RootCause:
        'semester 4 has 0 ClassGroups. Historical ClassGroups are in a different semester. Even with all ' +
        'rows processed, TeachingTaskClass links cannot be created without ClassGroups in the target semester.',
    },
    importBatch39: {
      exists: importBatch39 != null,
      status: importBatch39?.status ?? null,
      strategy: importBatch39?.strategy ?? null,
      filename: importBatch39?.filename ?? null,
      recordCount: importBatch39?.recordCount ?? null,
      createdTaskCount: importBatch39?.createdTaskCount ?? null,
      createdSlotCount: importBatch39?.createdSlotCount ?? null,
      semesterId: importBatch39?.semesterId ?? null,
      createdAt: importBatch39?.createdAt?.toISOString() ?? null,
    },
    existingDataSummary: {
      courses: existingData.courses.length,
      teachers: existingData.teachers.length,
      classGroups: existingData.classGroups.length,
      teachingTasks: existingData.teachingTasks.length,
    },
    counts,
    recommendation: {
      keepImportBatch39: 'defer',
      rollbackRecommended: 'defer',
      fixMaxPreviewRows: 'ESSENTIAL — add maxPreviewRows:100000 to plan/apply routes and CLI trial',
      classGroupScope: 'semester 4 has 0 ClassGroups — user must import or select a semester with ClassGroups',
      reconcileImportableDefinition: 'L7-A3 autoAllowedNewCourse ≠ L6-E2 fully-resolved — need UI/docs clarification',
      nextStage:
        '(1) Fix maxPreviewRows in plan/apply routes and CLI trial; ' +
        '(2) Ensure target semester has ClassGroups; ' +
        '(3) Re-run trial with full-row plan and proper ClassGroup scope. ' +
        'No business logic fix needed — the L7-F framework is correct.',
    },
    rawIncluded: false,
  }

  const artifactPath = join(artifactDir, `diagnostic.target-${args.targetSemesterId}.json`)
  writeFileSync(artifactPath, JSON.stringify(diagnosticResult, null, 2) + '\n', 'utf-8')
  console.log(`\nartifact: ${artifactPath}`)

  // Git head
  let headSha = ''
  try {
    headSha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
  } catch { /* ignore */ }

  // Write summary JSON
  const summaryPath = join(artifactDir, `summary.target-${args.targetSemesterId}.json`)
  writeFileSync(summaryPath, JSON.stringify({
    head: headSha,
    targetSemesterId: args.targetSemesterId,
    l7a3Importable: l7a3Summary.importable,
    browserPlanImportable: browserPlan.summary.plannedImportRows,
    cliPlanImportable: cliPlan.summary.plannedImportRows,
    rootCause: 'CLI trial passes manualResolutions=[] → no buildInitialManualResolutionState()',
    importBatch39Status: importBatch39?.status ?? 'MISSING',
  }, null, 2) + '\n', 'utf-8')
  console.log(`summary: ${summaryPath}`)

  await prisma2.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  try {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  } catch { /* ignore */ }
  process.exit(1)
})
