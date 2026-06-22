/**
 * L7-A2A Verify Script — Approval Review Full Dataset Wiring Fix
 *
 * Stage: L7-A2A-XLSX-COURSE-SETTING-APPROVAL-REVIEW-FULL-DATASET-WIRING-FIX
 *
 * Verifies that the approval-review API returns the FULL review dataset
 * (not 50 / 200 rows) and that the route, builder, UI summary, export
 * JSON, and partial plan are all wired against the full dataset scope.
 *
 * Background: L7-A2 raised DEFAULT_MAX_ROWS / ABSOLUTE_MAX_ROWS to 100000
 * but forgot that the approval-review route calls the L4 mapper WITHOUT
 * passing `maxPreviewRows`, so the L4 mapper's default of 50 caps
 * `previewCandidates` at 50 — which becomes the input to the approval
 * package. Result: reviewItems.length === 50 regardless of route-level
 * maxRows. This script confirms the L7-A2A fix:
 *  - approval-review route now passes `maxPreviewRows: ABSOLUTE_MAX_ROWS`
 *    to the L4 mapper
 *  - response carries a `reviewDatasetSummary` with `dataScope=fullDataset`
 *  - client types expose the new summary
 *  - UI summary uses full dataset total, never page size
 *  - export JSON / partial plan operate on the full dataset
 *  - no DB writes, no apply route, no schema change
 *
 * 80+ checks.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const APPROVAL_ROUTE = join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/approval-review/route.ts')
const PREVIEW_ROUTE = join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/preview/route.ts')
const PREVIEW_HELPER = join(ROOT, 'src/lib/import/course-setting-xlsx-preview.ts')
const DRY_RUN_HELPER = join(ROOT, 'src/lib/import/course-setting-teaching-task-dry-run.ts')
const APPROVAL_PACKAGE = join(ROOT, 'src/lib/import/course-setting-approval-package-l6-d.ts')
const APPROVAL_REVIEW_UI = join(ROOT, 'src/lib/import/course-setting-approval-review-ui-l6-d2.ts')
const CLIENT_TYPES = join(ROOT, 'src/lib/import/course-setting-xlsx-client.ts')
const UI_PATH = join(ROOT, 'src/components/import/course-setting-xlsx-preview.tsx')
const REVIEW_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-approval-review-section.tsx')
const RESOLUTION_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-manual-resolution-section.tsx')
const PARTIAL_PLAN_HELPER = join(ROOT, 'src/lib/import/course-setting-partial-import-plan-l6-e2.ts')
const L6E2G_HELPER = join(ROOT, 'src/lib/import/course-setting-new-course-candidate-l6-e2g.ts')
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
  console.log('=== L7-A2A Verify: Approval Review Full Dataset Wiring Fix ===\n')

  const ex = execSync
  const approvalRouteSrc = readF(APPROVAL_ROUTE)
  const previewRouteSrc = readF(PREVIEW_ROUTE)
  const previewHelperSrc = readF(PREVIEW_HELPER)
  const dryRunSrc = readF(DRY_RUN_HELPER)
  const approvalPkgSrc = readF(APPROVAL_PACKAGE)
  const approvalUiSrc = readF(APPROVAL_REVIEW_UI)
  const clientSrc = readF(CLIENT_TYPES)
  const mainSrc = readF(UI_PATH)
  const reviewSectionSrc = readF(REVIEW_SECTION)
  const resolutionSectionSrc = readF(RESOLUTION_SECTION)
  const l6e2Src = readF(PARTIAL_PLAN_HELPER)
  const l6e2gSrc = readF(L6E2G_HELPER)
  const statusSrc = readF(STATUS_PATH)

  // ── 1. Stage + pre-flight ─────────────────────────────────────────────
  console.log('[1/8] stage + pre-flight')
  record('branch is master', ex('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim() === 'master')
  const ah = ex('git rev-list --left-right --count HEAD...origin/master', { cwd: ROOT }).toString().trim()
  record('ahead/behind 0/0', ah === '0\t0', `ah=${ah.replace(/\s/g, '/')}`)
  record('status has L7-A2A reference', /L7-A2A/.test(statusSrc))
  record('approval route stage L7-A2A in response', /L7-A2A-XLSX-COURSE-SETTING-APPROVAL-REVIEW-FULL-DATASET-WIRING-FIX/.test(approvalRouteSrc))

  // ── 2. Root cause fix: L4 maxPreviewRows is forwarded from approval route
  console.log('\n[2/8] root-cause fix — L4 maxPreviewRows pass-through')
  // Critical: the approval-review route now explicitly passes maxPreviewRows
  record('approval route passes maxPreviewRows to L4 mapper', /buildCourseSettingTeachingTaskDryRun[\s\S]{0,400}maxPreviewRows/.test(approvalRouteSrc))
  record('approval route uses ABSOLUTE_MAX_ROWS for maxPreviewRows', /maxPreviewRows:\s*ABSOLUTE_MAX_ROWS/.test(approvalRouteSrc))
  // The preview helper also forwards maxPreviewRows (defensive consistency)
  record('preview helper forwards maxPreviewRows to L4 mapper', /maxPreviewRows,?\s*\n?\s*\}[\s\n]*\)/.test(previewHelperSrc) || /maxPreviewRows,?\s*\}/.test(previewHelperSrc))

  // ── 3. Server-side row limits raised above 50
  console.log('\n[3/8] server-side row limits raised')
  const absMaxRows = (() => {
    const m = approvalRouteSrc.match(/ABSOLUTE_MAX_ROWS\s*=\s*(\d+)/)
    return m && m[1] ? parseInt(m[1], 10) : 0
  })()
  record('ABSOLUTE_MAX_ROWS > 50', absMaxRows > 50, `ABSOLUTE_MAX_ROWS=${absMaxRows}`)
  record('DEFAULT_MAX_ROWS > 50', (() => {
    const m = approvalRouteSrc.match(/DEFAULT_MAX_ROWS\s*=\s*(\d+)/)
    return m && m[1] ? parseInt(m[1], 10) > 50 : false
  })())
  record('preview route maxPreviewRows > 50', (() => {
    const m = previewRouteSrc.match(/maxPreviewRows\s*=\s*(\d+)/)
    return m && m[1] ? parseInt(m[1], 10) > 50 : false
  })())

  // ── 4. reviewDatasetSummary surface in response
  console.log('\n[4/8] reviewDatasetSummary surface')
  record('reviewDatasetSummary object built in approval route', /reviewDatasetSummary\s*=\s*\{/.test(approvalRouteSrc))
  record('reviewDatasetSummary.templateVersion present', /templateVersion:/.test(approvalRouteSrc))
  record('reviewDatasetSummary.totalCourseRows present', /totalCourseRows[,:]/.test(approvalRouteSrc))
  record('reviewDatasetSummary.totalReviewItems present', /totalReviewItems:/.test(approvalRouteSrc))
  record('reviewDatasetSummary.approvalItemsReturned present', /approvalItemsReturned:/.test(approvalRouteSrc))
  record('reviewDatasetSummary.paginationMode = client-side', /paginationMode:\s*['"]client-side['"]/.test(approvalRouteSrc))
  record('reviewDatasetSummary.pageSize = 50', /pageSize:\s*50/.test(approvalRouteSrc))
  record('reviewDatasetSummary.dataScope = fullDataset', /dataScope:\s*['"]fullDataset['"]/.test(approvalRouteSrc))
  record('reviewDatasetSummary.maxRowsSafetyCap present', /maxRowsSafetyCap:/.test(approvalRouteSrc))
  record('reviewDatasetSummary in route response payload', /reviewDatasetSummary,/.test(approvalRouteSrc))

  // ── 5. Client-side types expose reviewDatasetSummary
  console.log('\n[5/8] client-side types for reviewDatasetSummary')
  record('client types declare CourseSettingApprovalReviewUiDatasetSummary', /CourseSettingApprovalReviewUiDatasetSummary/.test(clientSrc))
  record('client response type includes reviewDatasetSummary optional field', /reviewDatasetSummary\?:\s*CourseSettingApprovalReviewUiDatasetSummary/.test(clientSrc))
  record('client stage literal includes L7-A2A value', /L7-A2A-XLSX-COURSE-SETTING-APPROVAL-REVIEW-FULL-DATASET-WIRING-FIX/.test(clientSrc))

  // ── 6. UI summary uses full dataset total (not pageSize)
  console.log('\n[6/8] UI summary uses full dataset total')
  record('review section displays reviewDatasetSummary banner', /reviewDatasetSummary/.test(reviewSectionSrc))
  record('review section shows 全量数据集 / fullDataset badge', /全量数据集/.test(reviewSectionSrc))
  record('review section shows totalReviewItems from summary', /totalReviewItems/.test(reviewSectionSrc))
  record('review section shows approvalItemsReturned', /approvalItemsReturned/.test(reviewSectionSrc))
  record('orchestrator reads reviewDatasetSummary.totalReviewItems', /reviewDatasetSummary\?\.totalReviewItems/.test(mainSrc))
  record('orchestrator toast uses full total not pageSize', /data\.reviewDatasetSummary\?\.totalReviewItems\s*\?\?\s*data\.summary\.totalItems/.test(mainSrc))
  record('PAGE_SIZE still equals 50', /PAGE_SIZE\s*=\s*50/.test(mainSrc))
  record('filteredRows filters from reviewResult.rows (full)', /reviewResult\.rows\.filter/.test(mainSrc))
  record('paginatedFilteredRows slices from filteredRows', /filteredRows\.slice/.test(mainSrc))

  // ── 7. Export + partial plan use full dataset
  console.log('\n[7/8] export + partial plan use full dataset')
  record('export decision iterates full review rows (via local rows var or direct rows.map)', /(const rows\s*=\s*reviewResult\.rows[\s\S]{0,200}rows\.map)|(reviewResult\.rows\.map)/.test(mainSrc))
  record('export resolution iterates resolutionItems', /resolutionItems\.map/.test(mainSrc))
  record('partial plan passes resolutionItems to API', /resolutionItems,/.test(mainSrc))
  record('partial plan summary exported', /exportedItemCount|exportScope/.test(l6e2Src) || /planHash/.test(l6e2Src))
  record('export rawIncluded false preserved', /rawIncluded:\s*false/.test(clientSrc) || /exportedPlanRawIncluded:\s*false/.test(clientSrc))

  // ── 8. Hard constraints — no DB writes, no apply, no schema/migration change
  console.log('\n[8/8] hard constraints — no DB writes, no apply, no schema change')
  record('no apply route directory', !existsSync(join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/partial-import-apply')))
  record('no 执行导入 button text', !/执行导入/.test(mainSrc + reviewSectionSrc + resolutionSectionSrc))
  record('no 正式导入 button text', !/正式导入/.test(mainSrc + reviewSectionSrc + resolutionSectionSrc))
  record('no applyDB / writeDB button text', !/applyDB|writeDB|createImportBatch|createTeachingTask/.test(mainSrc + reviewSectionSrc + resolutionSectionSrc))
  record('no schema change', ex('git diff --name-only HEAD -- prisma/schema.prisma', { cwd: ROOT }).toString().trim().length === 0)
  record('no migration change', ex('git diff --name-only HEAD -- prisma/migrations', { cwd: ROOT }).toString().trim().length === 0)
  record('no scheduler/score change', ex('git diff --name-only HEAD -- src/lib/scheduler src/lib/score.ts', { cwd: ROOT }).toString().trim().length === 0)
  record('no Word parser change', ex('git diff --name-only HEAD -- scripts/parse_schedule.py scripts/parse_cell.py', { cwd: ROOT }).toString().trim().length === 0)
  record('no package.json change', ex('git diff --name-only HEAD -- package.json package-lock.json', { cwd: ROOT }).toString().trim().length === 0)
  record('git diff --check clean', ex('git diff --check', { cwd: ROOT }).toString().trim().length === 0)
  const status = ex('git status --short', { cwd: ROOT }).toString().trim()
  // Tolerate modifications to L7-A2A-allowed files + L7-A2A untracked files
  // + L6-E1 stage-aware update (export button text regex)
  // + L7-A3 in-scope files (classification rules).
  const allowedPaths = [
    'src/app/api/admin/import/course-setting-xlsx/approval-review/route.ts',
    'src/app/api/admin/import/course-setting-xlsx/preview/route.ts',
    'src/lib/import/course-setting-xlsx-client.ts',
    'src/lib/import/course-setting-xlsx-preview.ts',
    'src/lib/import/course-setting-approval-review-ui-l6-d2.ts',
    'src/lib/import/course-setting-partial-import-plan-l6-e2.ts',
    'src/lib/import/course-setting-approval-package-l6-d.ts',
    'src/lib/import/course-setting-manual-resolution-l6-e1.ts',
    'src/lib/import/course-setting-new-course-candidate-l6-e2g.ts',
    'src/lib/import/course-setting-teaching-task-dry-run.ts',
    'src/components/import/course-setting-xlsx-preview.tsx',
    'src/components/import/course-setting/',
    'scripts/verify-xlsx-course-setting-approval-review-full-dataset-wiring-l7-a2a.ts',
    'scripts/verify-xlsx-course-setting-importable-classification-l7-a3.ts',
    'scripts/verify-xlsx-course-setting-manual-resolution-ui-l6-e1.ts',
    'docs/l7-a2a',
    'docs/l7-a3',
    'docs/current-project-status.md',
  ]
  const isAllowed = (path: string): boolean =>
    allowedPaths.some((p) => path.includes(p))
  const lines = status.split('\n').filter((l) => l.trim() !== '')
  const offenders = lines.filter((line) => {
    const path = line.replace(/^\s*[?MAU ]+\s*/, '').trim()
    return !isAllowed(path)
  })
  record('worktree contains only L7-A2A-allowed files',
    offenders.length === 0,
    offenders.join(' | ') || `${lines.length} files in L7-A2A scope`)

  // ── 9. Functional correctness — full dataset wiring (run against new template)
  console.log('\n[9/9] functional correctness — full dataset wiring')
  // We re-run a small in-process dry-run with the L7-A2A option to prove
  // previewCandidates.length grows from 50 (default) to the full count.
  const xlsx = process.argv.find((a) => a.endsWith('.xlsx')) ?? 'D:\\Desktop\\Course Development System\\课程设置新模板.xlsx'
  const semArg = process.argv.find((a) => a.startsWith('--target-semester-id='))
  const targetSemesterId = semArg ? parseInt(semArg.split('=')[1] ?? '4', 10) : 4
  if (existsSync(xlsx)) {
    try {
      const helper = `
        import { readFileSync } from 'node:fs'
        import { buildCourseSettingTeachingTaskDryRun } from './src/lib/import/course-setting-teaching-task-dry-run'
        import { loadCourseSettingExistingDataForSemester } from './src/lib/import/course-setting-xlsx-preview'
        ;(async () => {
          const buffer = readFileSync(${JSON.stringify(xlsx)})
          const existingData = await loadCourseSettingExistingDataForSemester(${targetSemesterId})
          const defaultDryRun = await buildCourseSettingTeachingTaskDryRun({
            xlsxBuffer: buffer,
            artifactFilename: '课程设置新模板.xlsx',
            existingData,
            options: { parserVersion: 'l2-parser-v1', includeRawValues: true },
          })
          const fullDryRun = await buildCourseSettingTeachingTaskDryRun({
            xlsxBuffer: buffer,
            artifactFilename: '课程设置新模板.xlsx',
            existingData,
            options: { parserVersion: 'l2-parser-v1', includeRawValues: true, maxPreviewRows: 100000 },
          })
          console.log(JSON.stringify({
            totalCourseRows: defaultDryRun.parser.totalCourseRows,
            defaultPreviewCount: defaultDryRun.previewCandidates.length,
            fullPreviewCount: fullDryRun.previewCandidates.length,
          }))
        })().catch((e) => { console.error(e); process.exit(1) })
      `
      const tmpPath = join(ROOT, 'test-l7a2a.ts')
      writeFileSync(tmpPath, helper)
      try {
        const out = execSync(`npx tsx "${tmpPath}"`, { cwd: ROOT, encoding: 'utf-8' })
        const stats = JSON.parse(out.trim().split('\n').pop() ?? '{}')
        record('totalCourseRows > 50', stats.totalCourseRows > 50, `totalCourseRows=${stats.totalCourseRows}`)
        record('default preview count = 50 (root cause)', stats.defaultPreviewCount === 50, `defaultPreviewCount=${stats.defaultPreviewCount}`)
        record('with maxPreviewRows=100000 preview count equals totalCourseRows', stats.fullPreviewCount === stats.totalCourseRows, `full=${stats.fullPreviewCount} total=${stats.totalCourseRows}`)
        record('totalCourseRows > 1000 for new template', stats.totalCourseRows > 1000, `totalCourseRows=${stats.totalCourseRows}`)
        record('expected total 1167', stats.totalCourseRows === 1167, `totalCourseRows=${stats.totalCourseRows}`)
      } finally {
        unlinkSync(tmpPath)
      }
    } catch (e: unknown) {
      record('functional dry-run completes without error', false, e instanceof Error ? e.message : String(e))
    }
  } else {
    record('xlsx file exists', false, `missing: ${xlsx}`)
  }

  // ── 10. Template version + new course + task split semantics preserved
  console.log('\n[10/12] template + new course + task split semantics preserved')
  record('new template rule helper exists', /new-course-setting-a-m-v2/.test(approvalRouteSrc + clientSrc))
  record('targetSemesterId source preserved in route', /targetSemesterIdRaw/.test(approvalRouteSrc))
  record('new course candidate helper L6-E2G exists', /COURSE_CREATE_CANDIDATE/.test(l6e2gSrc))
  record('COURSE_NAME_MISSING exists', /COURSE_NAME_MISSING/.test(l6e2gSrc))
  record('classifyCourseSituation exists', /classifyCourseSituation/.test(l6e2gSrc))
  record('task split detection helper exists', /detectTaskSplitCandidates/.test(readF(join(ROOT, 'src/lib/import/course-setting-task-split-detection-l6-e2c.ts'))))
  record('TASK_SPLIT_REQUIRED diagnostic preserved', /TASK_SPLIT_REQUIRED/.test(dryRunSrc))
  record('approval review ui flags include autoSafeCandidate', /autoSafeCandidate/.test(approvalUiSrc))
  record('approval review ui flags include needsHumanReview', /needsHumanReview/.test(approvalUiSrc))

  // ── 11. No DB write methods (Prisma) in approval route / builders
  console.log('\n[11/12] no DB write methods in approval route / builders')
  // Strip comment lines first to avoid matching docstring mentions.
  const stripComments = (s: string): string => s.split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, ''))
    .join('\n')
  const allSrc = stripComments(approvalRouteSrc + approvalPkgSrc + approvalUiSrc + previewHelperSrc)
  const writePatterns: { name: string; re: RegExp }[] = [
    { name: 'prisma.course.create', re: /prisma\.course\.create/ },
    { name: 'prisma.teacher.create', re: /prisma\.teacher\.create/ },
    { name: 'prisma.classGroup.create', re: /prisma\.classGroup\.create/ },
    { name: 'prisma.teachingTask.create', re: /prisma\.teachingTask\.create/ },
    { name: 'prisma.teachingTaskClass.create', re: /prisma\.teachingTaskClass\.create/ },
    { name: 'prisma.importBatch.create', re: /prisma\.importBatch\.create/ },
    { name: 'prisma.$executeRaw', re: /prisma\.\$executeRaw/ },
    { name: '.createMany(', re: /\.createMany\(/ },
    { name: '.upsert(', re: /\.upsert\(/ },
    { name: '.executeRaw(', re: /\.executeRaw\(/ },
    { name: '.updateMany(', re: /\.updateMany\(/ },
    { name: '.deleteMany(', re: /\.deleteMany\(/ },
  ]
  let noWrite = true
  for (const p of writePatterns) {
    if (p.re.test(allSrc)) {
      record('forbidden DB write pattern absent: ' + p.name, false, 'present')
      noWrite = false
    }
  }
  if (noWrite) record('no DB write patterns in approval-route + builders', true)

  // ── 12. Apply button / route / directory absence
  console.log('\n[12/12] apply button / route absence')
  record('no partial-import-apply directory', !existsSync(join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/partial-import-apply')))
  record('no partial-import-apply anywhere', !existsSync(join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/partial-import-apply')) && !/partial-import-apply/.test(mainSrc + reviewSectionSrc))
  record('no applyAllowed=true literal', !/applyAllowed:\s*true/.test(mainSrc + reviewSectionSrc + resolutionSectionSrc))
  record('no canApply=true literal', !/canApply:\s*true/.test(mainSrc + reviewSectionSrc + resolutionSectionSrc))
  record('dbWritten: false preserved', /dbWritten:\s*false/.test(approvalRouteSrc))
  record('dryRunOnly: true preserved', /dryRunOnly:\s*true/.test(approvalRouteSrc))
  record('reviewOnly: true preserved', /reviewOnly:\s*true/.test(approvalRouteSrc))
  record('approval package applyAllowed=false literal type preserved', /applyAllowed:\s*false/.test(approvalPkgSrc))
  record('approval package dryRunOnly=true literal preserved', /dryRunOnly:\s*true/.test(approvalPkgSrc))
  record('approval package dbWritten=false literal preserved', /dbWritten:\s*false/.test(approvalPkgSrc))
  record('ui review-only badge present', /review-only|applyAllowed=false/.test(reviewSectionSrc))
  record('preview-only badge present in orchestrator', /Preview Only/.test(mainSrc))
  record('previewOnly flag on preview response', /previewOnly:\s*true/.test(clientSrc))
  record('canConfirm: false on preview response', /canConfirm:\s*false/.test(clientSrc))
  record('canApply: false on preview response', /canApply:\s*false/.test(clientSrc))

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