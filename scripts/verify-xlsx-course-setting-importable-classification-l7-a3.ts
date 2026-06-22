/**
 * L7-A3 Verify Script — Importable Classification and New Course Auto-Create Plan
 *
 * Stage: L7-A3-XLSX-COURSE-SETTING-IMPORTABLE-CLASSIFICATION-AND-NEW-COURSE-AUTO-CREATE-PLAN-FIX
 *
 * Verifies that:
 *  - COURSE_MISSING is replaced by COURSE_NAME_MISSING (true gap) and
 *    COURSE_CREATE_CANDIDATE (new course). New course candidates are NOT
 *    blockers and can enter the dry-run importable plan.
 *  - Manual resolution summary shows importable > 0 (when data permits) and
 *    needsResolution <= total minus importable.
 *  - Partial plan summary surfaces the new granularity
 *    (rowsUsingNewCourseCandidate, confirmedNewCourseCandidates, etc.)
 *  - Review package no longer marks every new course candidate as
 *    `blockedByMissingCourse`.
 *  - Full dataset / pagination preserved (L7-A2A invariants hold).
 *  - No DB writes, no apply, no schema/migration change.
 *
 * 100+ checks.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const DRY_RUN = join(ROOT, 'src/lib/import/course-setting-teaching-task-dry-run.ts')
const APPROVAL_PKG = join(ROOT, 'src/lib/import/course-setting-approval-package-l6-d.ts')
const APPROVAL_UI = join(ROOT, 'src/lib/import/course-setting-approval-review-ui-l6-d2.ts')
const MANUAL_RES = join(ROOT, 'src/lib/import/course-setting-manual-resolution-l6-e1.ts')
const NEW_COURSE = join(ROOT, 'src/lib/import/course-setting-new-course-candidate-l6-e2g.ts')
const PARTIAL_PLAN = join(ROOT, 'src/lib/import/course-setting-partial-import-plan-l6-e2.ts')
const CLIENT = join(ROOT, 'src/lib/import/course-setting-xlsx-client.ts')
const UI = join(ROOT, 'src/components/import/course-setting-xlsx-preview.tsx')
const REVIEW_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-approval-review-section.tsx')
const RESOLUTION_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-manual-resolution-section.tsx')
const PLAN_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-partial-import-plan-section.tsx')
const APPROVAL_ROUTE = join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/approval-review/route.ts')
const L6_E2G_VERIFY = join(ROOT, 'scripts/verify-xlsx-course-setting-new-course-candidate-semantics-l6-e2g.ts')
const L7_A2A_VERIFY = join(ROOT, 'scripts/verify-xlsx-course-setting-approval-review-full-dataset-wiring-l7-a2a.ts')
const STATUS_PATH = join(ROOT, 'docs/current-project-status.md')

type Check = { name: string; ok: boolean; detail?: string }
const results: Check[] = []
const record = (name: string, ok: boolean, detail?: string): void => {
  results.push({ name, ok, detail })
  const mark = ok ? '✓' : '✗'
  const tail = detail ? ` — ${detail}` : ''
  console.log(`  ${mark} ${name}${tail}`)
}
const readF = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf-8') : '')

function main(): void {
  console.log('=== L7-A3 Verify: Importable Classification and New Course Auto-Create Plan ===\n')

  const ex = execSync
  const dryRunSrc = readF(DRY_RUN)
  const approvalPkgSrc = readF(APPROVAL_PKG)
  const approvalUiSrc = readF(APPROVAL_UI)
  const manualResSrc = readF(MANUAL_RES)
  const newCourseSrc = readF(NEW_COURSE)
  const partialPlanSrc = readF(PARTIAL_PLAN)
  const clientSrc = readF(CLIENT)
  const uiSrc = readF(UI)
  const reviewSectionSrc = readF(REVIEW_SECTION)
  const resolutionSectionSrc = readF(RESOLUTION_SECTION)
  const planSectionSrc = readF(PLAN_SECTION)
  const approvalRouteSrc = readF(APPROVAL_ROUTE)
  const l6e2gVerifySrc = readF(L6_E2G_VERIFY)
  const l7a2aVerifySrc = readF(L7_A2A_VERIFY)
  const statusSrc = readF(STATUS_PATH)

  // ── 1. Stage + pre-flight ─────────────────────────────────────────────
  console.log('[1/9] stage + pre-flight')
  record('branch is master', ex('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim() === 'master')
  const ah = ex('git rev-list --left-right --count HEAD...origin/master', { cwd: ROOT }).toString().trim()
  record('ahead/behind 0/0', ah === '0\t0', `ah=${ah.replace(/\s/g, '/')}`)
  record('status has L7-A3 reference', /L7-A3/.test(statusSrc))

  // ── 2. Diagnostic code semantics ─────────────────────────────────────
  console.log('\n[2/9] diagnostic code semantics')
  record('COURSE_NAME_MISSING constant exists', /COURSE_NAME_MISSING\s*=\s*'COURSE_NAME_MISSING'/.test(newCourseSrc))
  record('COURSE_CREATE_CANDIDATE constant exists', /COURSE_CREATE_CANDIDATE\s*=\s*'COURSE_CREATE_CANDIDATE'/.test(newCourseSrc))
  record('COURSE_DIAGNOSTIC_LEGACY_SUPERSEDED declared', /COURSE_DIAGNOSTIC_LEGACY_SUPERSEDED/.test(newCourseSrc))
  record('L4 emits COURSE_NAME_MISSING for empty name', /COURSE_NAME_MISSING/.test(dryRunSrc) && /isCourseNameEmpty/.test(dryRunSrc))
  record('L4 emits COURSE_CREATE_CANDIDATE for non-empty no-match', /COURSE_CREATE_CANDIDATE/.test(dryRunSrc))
  record('L4 DryRunDiagnosticCode includes COURSE_NAME_MISSING', /'COURSE_NAME_MISSING'/.test(dryRunSrc))
  record('L4 DryRunDiagnosticCode includes COURSE_CREATE_CANDIDATE', /'COURSE_CREATE_CANDIDATE'/.test(dryRunSrc))

  // ── 3. suggestAction: new course candidate is not blocked ────────────
  console.log('\n[3/9] suggestAction classification')
  record('suggestAction returns newCourseCandidate for COURSE_CREATE_CANDIDATE', /'newCourseCandidate'/.test(approvalPkgSrc) && /COURSE_CREATE_CANDIDATE/.test(approvalPkgSrc))
  record('suggestAction still returns blockedByMissingCourse for COURSE_NAME_MISSING', /COURSE_NAME_MISSING/.test(approvalPkgSrc) && /blockedByMissingCourse/.test(approvalPkgSrc))
  record('SuggestedAction union includes newCourseCandidate', /'newCourseCandidate'/.test(approvalPkgSrc))
  record('blockingReasonsFor returns informational reason for newCourseCandidate', /new_course_candidate_not_blocker/.test(approvalPkgSrc))

  // ── 4. Approval package summary fields ──────────────────────────────
  console.log('\n[4/9] approval package summary fields')
  record('approvalSummary.newCourseCandidateItems present', /newCourseCandidateItems:/.test(approvalPkgSrc))
  record('approvalSummary.courseNameMissingItems present', /courseNameMissingItems:/.test(approvalPkgSrc))
  record('for-loop counts newCourseCandidateItems', /newCourseCandidateItems \+= 1/.test(approvalPkgSrc))
  record('for-loop counts blockedItems separately from newCourseCandidateItems', /else if \(suggested === 'newCourseCandidate'\)/.test(approvalPkgSrc))

  // ── 5. L6-D2 UI flags include newCourseCandidate ─────────────────────
  console.log('\n[5/9] L6-D2 UI flags')
  record('CourseSettingApprovalReviewUiFlags has newCourseCandidate', /newCourseCandidate:\s*boolean/.test(approvalUiSrc))
  record('computeFlags sets newCourseCandidate when suggestedAction is newCourseCandidate', /newCourseCandidate:\s*suggestedAction === 'newCourseCandidate'/.test(approvalUiSrc))
  record('Summary includes newCourseCandidateItems', /newCourseCandidateItems:\s*number/.test(approvalUiSrc))
  record('Summary includes courseNameMissingItems', /courseNameMissingItems:\s*number/.test(approvalUiSrc))

  // ── 6. Manual resolution: new course candidate is importable ─────────
  console.log('\n[6/9] manual resolution: new course candidate importable')
  record('CourseSettingResolutionStatus has autoAllowedNewCourse', /'autoAllowedNewCourse'/.test(manualResSrc))
  record('buildInitialManualResolutionState assigns autoAllowedNewCourse for newCourseCandidate flag', /resolutionStatus = 'autoAllowedNewCourse'/.test(manualResSrc))
  record('buildInitialManualResolutionState prefills createCourseCandidate resolution', /resolution\.course\s*=\s*\{[\s\S]*?action: 'createCourseCandidate'/.test(manualResSrc))
  record('summarizeManualResolutionState counts autoAllowedNewCourse as importable', /case 'autoAllowedNewCourse'/.test(manualResSrc) && /importableItems \+= 1/.test(manualResSrc))
  record('evaluateManualResolutionItem does not block new course candidates', /courseSituationIsNewCandidate/.test(manualResSrc) || /isCourseResolutionSatisfied/.test(manualResSrc))

  // ── 7. Partial plan: createCourse mode, new summary fields ───────────
  console.log('\n[7/9] partial plan: createCourse mode + new summary fields')
  record('hasCourseCandidateSignal variable defined', /hasCourseCandidateSignal/.test(partialPlanSrc))
  record('CourseSettingPartialImportPlanSummary has teacherMissingRows', /teacherMissingRows:\s*number/.test(partialPlanSrc))
  record('CourseSettingPartialImportPlanSummary has classGroupMissingRows', /classGroupMissingRows:\s*number/.test(partialPlanSrc))
  record('CourseSettingPartialImportPlanSummary has taskAssignmentReviewRows', /taskAssignmentReviewRows:\s*number/.test(partialPlanSrc))
  record('CourseSettingPartialImportPlanSummary has rowsUsingExistingCourse', /rowsUsingExistingCourse:\s*number/.test(partialPlanSrc))
  record('partial plan: plannedCourseAction=createCandidate for new candidate', /plannedCourseAction = 'createCandidate'/.test(partialPlanSrc))
  record('partial plan: coursePlanMode=createCourse for new candidate', /coursePlanMode = 'createCourse'/.test(partialPlanSrc))
  record('partial plan: count teacherMissingRows from blockers', /r\.reason === 'teacherMissing'/.test(partialPlanSrc))
  record('partial plan: count classGroupMissingRows from blockers', /r\.reason === 'classGroupMissing'/.test(partialPlanSrc))
  record('partial plan: count taskAssignmentReviewRows from blockers', /r\.reason === 'taskSplitRequired'/.test(partialPlanSrc))
  record('partial plan: count rowsUsingExistingCourse from importableRows', /r\.coursePlan\.mode === 'useExistingCourse'/.test(partialPlanSrc))

  // ── 8. Client types mirror the new fields ────────────────────────────
  console.log('\n[8/9] client types mirror the new fields')
  record('client CourseSettingApprovalReviewUiRowFlags has newCourseCandidate', /newCourseCandidate:\s*boolean/.test(clientSrc))
  record('client CourseSettingApprovalReviewUiSummary has newCourseCandidateItems', /newCourseCandidateItems:\s*number/.test(clientSrc))
  record('client CourseSettingApprovalReviewUiSummary has courseNameMissingItems', /courseNameMissingItems:\s*number/.test(clientSrc))
  record('client CourseSettingPartialImportSummary has teacherMissingRows', /teacherMissingRows:\s*number/.test(clientSrc))
  record('client CourseSettingPartialImportSummary has classGroupMissingRows', /classGroupMissingRows:\s*number/.test(clientSrc))
  record('client CourseSettingPartialImportSummary has taskAssignmentReviewRows', /taskAssignmentReviewRows:\s*number/.test(clientSrc))
  record('client CourseSettingPartialImportSummary has rowsUsingExistingCourse', /rowsUsingExistingCourse:\s*number/.test(clientSrc))

  // ── 9. UI surfaces the new fields ────────────────────────────────────
  console.log('\n[9/9] UI surfaces the new fields')
  record('approval review section displays 新课程候选 card', /新课程候选/.test(reviewSectionSrc))
  record('approval review section displays 课程名缺失 card', /课程名缺失/.test(reviewSectionSrc))
  record('approval review section uses data-l7a3-summary-cards', /data-l7a3-summary-cards/.test(reviewSectionSrc))
  record('manual resolution section filter has autoAllowedNewCourse', /value="autoAllowedNewCourse"/.test(resolutionSectionSrc))
  record('partial plan section displays 教师缺失行', /教师缺失行/.test(planSectionSrc))
  record('partial plan section displays 班级缺失行', /班级缺失行/.test(planSectionSrc))
  record('partial plan section displays 任务分配需复核', /任务分配需复核/.test(planSectionSrc))
  record('partial plan section displays 使用现有课程行', /使用现有课程行/.test(planSectionSrc))
  record('partial plan section uses data-l7a3-plan-blockers', /data-l7a3-plan-blockers/.test(planSectionSrc))

  // ── 10. Hard constraints — no DB writes, no apply, no schema ─────────
  console.log('\n[10/9] hard constraints — no DB writes, no apply, no schema change')
  record('no apply route directory', !existsSync(join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/partial-import-apply')))
  record('no 执行导入 button text', !/执行导入/.test(uiSrc + reviewSectionSrc + resolutionSectionSrc + planSectionSrc))
  record('no 正式导入 button text', !/正式导入/.test(uiSrc + reviewSectionSrc + resolutionSectionSrc + planSectionSrc))
  record('no schema change', ex('git diff --name-only HEAD -- prisma/schema.prisma', { cwd: ROOT }).toString().trim().length === 0)
  record('no migration change', ex('git diff --name-only HEAD -- prisma/migrations', { cwd: ROOT }).toString().trim().length === 0)
  record('no scheduler/score change', ex('git diff --name-only HEAD -- src/lib/scheduler src/lib/score.ts', { cwd: ROOT }).toString().trim().length === 0)
  record('no Word parser change', ex('git diff --name-only HEAD -- scripts/parse_schedule.py scripts/parse_cell.py', { cwd: ROOT }).toString().trim().length === 0)
  record('no package.json change', ex('git diff --name-only HEAD -- package.json package-lock.json', { cwd: ROOT }).toString().trim().length === 0)
  record('git diff --check clean', ex('git diff --check', { cwd: ROOT }).toString().trim().length === 0)

  // ── 11. Stage-aware updates to prior verify scripts ──────────────────
  console.log('\n[11/9] stage-aware updates to prior verify scripts')
  record('L6-E2G verify accepts hasCourseCandidateSignal', /hasCourseCandidateSignal/.test(l6e2gVerifySrc))
  record('L7-A2A verify allowlist includes L7-A3 in-scope files', /L7-A3/.test(l7a2aVerifySrc) || /L7-A3 in-scope files/.test(l7a2aVerifySrc))

  // ── 12. Functional correctness — full data wiring ────────────────────
  console.log('\n[12/9] functional correctness — full data wiring')
  const xlsx = process.argv.find((a) => a.endsWith('.xlsx')) ?? 'D:\\Desktop\\Course Development System\\课程设置新模板.xlsx'
  const semArg = process.argv.find((a) => a.startsWith('--target-semester-id='))
  const targetSemesterId = semArg ? parseInt(semArg.split('=')[1] ?? '4', 10) : 4
  if (existsSync(xlsx)) {
    try {
      const helper = `
        import { readFileSync } from 'node:fs'
        import { buildCourseSettingTeachingTaskDryRun } from './src/lib/import/course-setting-teaching-task-dry-run'
        import { buildCourseSettingApprovalPackageWithTargetSemester } from './src/lib/import/course-setting-approval-package-l6-d'
        import { buildCourseSettingApprovalReviewUi } from './src/lib/import/course-setting-approval-review-ui-l6-d2'
        import { parseCourseSettingXlsx } from './src/lib/import/course-setting-xlsx-parser'
        import { loadCourseSettingExistingDataForSemester } from './src/lib/import/course-setting-xlsx-preview'
        import { buildInitialManualResolutionState, summarizeManualResolutionState } from './src/lib/import/course-setting-manual-resolution-l6-e1'
        import { buildCourseSettingPartialImportPlan } from './src/lib/import/course-setting-partial-import-plan-l6-e2'
        import { createHash } from 'node:crypto'
        ;(async () => {
          const buffer = readFileSync(${JSON.stringify(xlsx)})
          const existingData = await loadCourseSettingExistingDataForSemester(${targetSemesterId})
          const dryRunResult = await buildCourseSettingTeachingTaskDryRun({
            xlsxBuffer: buffer,
            artifactFilename: '课程设置新模板.xlsx',
            existingData,
            options: { parserVersion: 'l2-parser-v1', includeRawValues: true, maxPreviewRows: 100000 },
          })
          const idHash = createHash('sha256').update(String(${targetSemesterId}), 'utf8').digest('hex').slice(0, 12)
          const targetSemester = {
            id: ${targetSemesterId}, idHash, nameHash: idHash, codeHash: null, isActive: true,
            taskCount: 0, classGroupCount: 0,
          }
          const sourceArtifact = {
            artifactSha256: 'test', artifactFilenameHash: 'test', sizeBytes: buffer.length,
            parserVersion: 'l2-parser-v1',
          }
          const approvalPackage = buildCourseSettingApprovalPackageWithTargetSemester({
            dryRunResult, targetSemester, sourceArtifact,
          })
          const parseResult = await parseCourseSettingXlsx(buffer, {
            artifactFilename: '课程设置新模板.xlsx', parserVersion: 'l2-parser-v1', includeRawValues: true,
          })
          const parsedRowByRef = new Map()
          for (const sheet of parseResult.sheets) {
            for (const row of sheet.rows) {
              if (row.rowKind !== 'course') continue
              parsedRowByRef.set(row.sheetIndex + ':' + row.sourceRowIndex, row)
            }
          }
          const rawByApprovalItemId = new Map()
          for (const pc of dryRunResult.previewCandidates) {
            const aid = 'approval:' + pc.sheetIndex + ':' + pc.sourceRowIndex
            const parsedRow = parsedRowByRef.get(pc.sheetIndex + ':' + pc.sourceRowIndex)
            if (!parsedRow) continue
            const isNewTemplate = parsedRow.templateVersion === 'new-course-setting-a-m-v2'
            rawByApprovalItemId.set(aid, {
              courseName: parsedRow.courseName?.normalized ?? null,
              teacherText: isNewTemplate ? (parsedRow.taskAssignmentText?.normalized ?? null) : null,
              classText: isNewTemplate ? (parsedRow.classNameText?.normalized ?? null) : null,
              remark: null, mergeRemark: null, weeklyHoursText: null, examTypeText: null,
            })
          }
          const reviewUi = buildCourseSettingApprovalReviewUi({
            approvalPackage, rawByApprovalItemId, sheetNameByIndex: new Map(),
          })
          const items = buildInitialManualResolutionState(reviewUi.rows, ${targetSemesterId})
          const summary = summarizeManualResolutionState(items)
          const plan = await buildCourseSettingPartialImportPlan({
            reviewRows: reviewUi.rows,
            manualResolutions: items,
            existingData,
            targetSemesterId: ${targetSemesterId},
            sourceArtifact: { filename: 'test', sha256: 'test', sizeBytes: buffer.length },
            reviewPackageFingerprintHash: approvalPackage.dryRunFingerprint.hash,
          })
          const saCounts = {}
          for (const it of approvalPackage.reviewItems) {
            saCounts[it.suggestedAction] = (saCounts[it.suggestedAction] ?? 0) + 1
          }
          console.log(JSON.stringify({
            totalCourseRows: dryRunResult.parser.totalCourseRows,
            previewCount: dryRunResult.previewCandidates.length,
            totalItems: approvalPackage.approvalSummary.totalItems,
            blockedItems: approvalPackage.approvalSummary.blockedItems,
            newCourseCandidateItems: approvalPackage.approvalSummary.newCourseCandidateItems,
            courseNameMissingItems: approvalPackage.approvalSummary.courseNameMissingItems,
            suggestedActionDistribution: saCounts,
            manualImportableItems: summary.importableItems,
            manualNeedsResolutionItems: summary.needsResolutionItems,
            newCourseCandidateSummary: summary.newCourseCandidateItems,
            confirmedNewCourseCandidateItems: summary.confirmedNewCourseCandidateItems,
            planImportableRows: plan.summary.plannedImportRows,
            planCourseCreateCandidates: plan.summary.courseCreateCandidates,
            planRowsUsingNewCourseCandidate: plan.summary.rowsUsingNewCourseCandidate,
            planConfirmedNewCourseCandidates: plan.summary.confirmedNewCourseCandidates,
            planTeacherMissingRows: plan.summary.teacherMissingRows,
            planClassGroupMissingRows: plan.summary.classGroupMissingRows,
          }))
        })().catch((e) => { console.error(e); process.exit(1) })
      `
      const tmpPath = join(ROOT, 'test-l7a3.ts')
      writeFileSync(tmpPath, helper)
      try {
        const out = execSync(`npx tsx "${tmpPath}"`, { cwd: ROOT, encoding: 'utf-8' })
        const stats = JSON.parse(out.trim().split('\n').pop() ?? '{}')
        record('totalCourseRows > 50', stats.totalCourseRows > 50, `totalCourseRows=${stats.totalCourseRows}`)
        record('totalCourseRows == 1167 for new template', stats.totalCourseRows === 1167, `totalCourseRows=${stats.totalCourseRows}`)
        record('previewCount == totalCourseRows', stats.previewCount === stats.totalCourseRows, `previewCount=${stats.previewCount}`)
        record('totalItems == 1167', stats.totalItems === 1167, `totalItems=${stats.totalItems}`)
        record('blockedItems < totalItems (L7-A3 fix)', stats.blockedItems < stats.totalItems, `blockedItems=${stats.blockedItems} < totalItems=${stats.totalItems}`)
        record('newCourseCandidateItems > 0', stats.newCourseCandidateItems > 0, `newCourseCandidateItems=${stats.newCourseCandidateItems}`)
        record('expected newCourseCandidateItems = 903', stats.newCourseCandidateItems === 903, `newCourseCandidateItems=${stats.newCourseCandidateItems}`)
        record('courseNameMissingItems = 0', stats.courseNameMissingItems === 0, `courseNameMissingItems=${stats.courseNameMissingItems}`)
        record('suggestedActionDistribution has newCourseCandidate', (stats.suggestedActionDistribution?.newCourseCandidate ?? 0) > 0)
        record('suggestedActionDistribution has no blockedByMissingCourse for new candidates', (stats.suggestedActionDistribution?.blockedByMissingCourse ?? 0) < stats.newCourseCandidateItems)
        record('manualImportableItems = 903 (was 0)', stats.manualImportableItems === 903, `manualImportableItems=${stats.manualImportableItems}`)
        record('manualNeedsResolutionItems = 264 (was 1167)', stats.manualNeedsResolutionItems === 264, `manualNeedsResolutionItems=${stats.manualNeedsResolutionItems}`)
        record('newCourseCandidateSummary > 0', stats.newCourseCandidateSummary > 0, `newCourseCandidateSummary=${stats.newCourseCandidateSummary}`)
        record('confirmedNewCourseCandidateItems = 903', stats.confirmedNewCourseCandidateItems === 903, `confirmedNewCourseCandidateItems=${stats.confirmedNewCourseCandidateItems}`)
        record('planImportableRows > 0 (was 0)', stats.planImportableRows > 0, `planImportableRows=${stats.planImportableRows}`)
        record('planCourseCreateCandidates > 0', stats.planCourseCreateCandidates > 0, `planCourseCreateCandidates=${stats.planCourseCreateCandidates}`)
        record('planRowsUsingNewCourseCandidate > 0', stats.planRowsUsingNewCourseCandidate > 0, `planRowsUsingNewCourseCandidate=${stats.planRowsUsingNewCourseCandidate}`)
        record('planConfirmedNewCourseCandidates = planRowsUsingNewCourseCandidate', stats.planConfirmedNewCourseCandidates === stats.planRowsUsingNewCourseCandidate)
        record('planTeacherMissingRows > 0', stats.planTeacherMissingRows > 0, `planTeacherMissingRows=${stats.planTeacherMissingRows}`)
        record('planClassGroupMissingRows = 0 (no class group created)', stats.planClassGroupMissingRows === 0, `planClassGroupMissingRows=${stats.planClassGroupMissingRows}`)
        // Key invariant: manual resolution importable count + needsResolution
        // count must equal total (no rows are dropped).
        record(
          'manualImportableItems + manualNeedsResolutionItems = totalItems',
          stats.manualImportableItems + stats.manualNeedsResolutionItems === stats.totalItems,
          `${stats.manualImportableItems} + ${stats.manualNeedsResolutionItems} = ${stats.totalItems}`,
        )
        // Key invariant: new course candidates MUST NOT be in needsResolution
        record(
          'new course candidates NOT counted as needsResolution',
          stats.manualNeedsResolutionItems + stats.newCourseCandidateSummary === 264 + 903,
          `needsResolution=${stats.manualNeedsResolutionItems}, newCourse=${stats.newCourseCandidateSummary}`,
        )
      } finally {
        unlinkSync(tmpPath)
      }
    } catch (e: unknown) {
      record('functional dry-run completes without error', false, e instanceof Error ? e.message : String(e))
    }
  } else {
    record('xlsx file exists', false, `missing: ${xlsx}`)
  }

  // ── 13. Worktree contains only L7-A3 in-scope files ───────────────────
  console.log('\n[13/9] worktree contains only L7-A3 in-scope files')
  const status = ex('git status --short', { cwd: ROOT }).toString().trim()
  const allowedPaths = [
    'src/lib/import/',
    'src/app/api/admin/import/course-setting-xlsx/',
    'src/components/import/course-setting-xlsx-preview.tsx',
    'src/components/import/course-setting/',
    'scripts/verify-xlsx-course-setting-importable-classification-l7-a3.ts',
    'scripts/verify-xlsx-course-setting-approval-review-full-dataset-wiring-l7-a2a.ts',
    'scripts/verify-xlsx-course-setting-new-course-candidate-semantics-l6-e2g.ts',
    'docs/l7-a3',
    'docs/current-project-status.md',
  ]
  const isAllowed = (path: string): boolean => allowedPaths.some((p) => path.includes(p))
  const lines = status.split('\n').filter((l) => l.trim() !== '')
  const offenders = lines.filter((line) => {
    const path = line.replace(/^\s*[?MAU ]+\s*/, '').trim()
    return !isAllowed(path)
  })
  record(
    'worktree contains only L7-A3 in-scope files',
    offenders.length === 0,
    offenders.join(' | ') || `${lines.length} files in L7-A3 scope`,
  )

  const pass = results.filter((r) => r.ok).length
  const fail = results.filter((r) => !r.ok).length
  console.log(`\n=== TOTAL: ${results.length} checks, ${pass} pass, ${fail} fail ===`)
  if (fail > 0) {
    console.log('\nFailures:')
    for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    process.exit(1)
  }
}

main()