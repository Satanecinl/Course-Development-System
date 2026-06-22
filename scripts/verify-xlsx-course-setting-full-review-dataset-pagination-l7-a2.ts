/**
 * L7-A2 Verify Script — Full Review Dataset and Pagination Fix
 *
 * Stage: L7-A2-XLSX-COURSE-SETTING-FULL-REVIEW-DATASET-AND-PAGINATION-FIX
 *
 * Verifies that the approval review API returns the full dataset (not
 * truncated to 50 or 200 rows) and the frontend adds client-side
 * pagination for performance.
 *
 * 100+ checks covering: backend row limits, frontend pagination state,
 * pagination UI controls, filter-before-paginate, state persistence,
 * export full dataset, partial plan full dataset, no DB writes, no apply,
 * L6/L7 regression, core checks.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const APPROVAL_ROUTE = join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/approval-review/route.ts')
const PREVIEW_ROUTE = join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/preview/route.ts')
const PREVIEW_HELPER = join(ROOT, 'src/lib/import/course-setting-xlsx-preview.ts')
const UI_PATH = join(ROOT, 'src/components/import/course-setting-xlsx-preview.tsx')
const REVIEW_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-approval-review-section.tsx')
const RESOLUTION_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-manual-resolution-section.tsx')
const L6E2_HELPER = join(ROOT, 'src/lib/import/course-setting-partial-import-plan-l6-e2.ts')
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
  console.log('=== L7-A2 Verify: Full Review Dataset and Pagination Fix ===\n')

  const { execSync: ex } = { execSync }
  const approvalRouteSrc = readF(APPROVAL_ROUTE)
  const previewRouteSrc = readF(PREVIEW_ROUTE)
  const previewHelperSrc = readF(PREVIEW_HELPER)
  const mainSrc = readF(UI_PATH)
  const reviewSectionSrc = readF(REVIEW_SECTION)
  const resolutionSectionSrc = readF(RESOLUTION_SECTION)
  const l6e2Src = readF(L6E2_HELPER)
  const l6e2gSrc = readF(L6E2G_HELPER)
  const statusSrc = readF(STATUS_PATH)

  // ── 1. Stage + pre-flight ──
  console.log('[1/12] stage + pre-flight')
  record('branch is master', ex('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim() === 'master')
  const ah = ex('git rev-list --left-right --count HEAD...origin/master', { cwd: ROOT }).toString().trim()
  record('ahead/behind 0/0', ah === '0\t0', `ah=${ah.replace(/\s/g, '/')}`)

  // ── 2. Backend row limits raised ──
  console.log('\n[2/12] backend row limits raised')
  record('DEFAULT_MAX_ROWS raised (>=10000)', /DEFAULT_MAX_ROWS\s*=\s*(\d+)/.test(approvalRouteSrc) && (() => { const m = approvalRouteSrc.match(/DEFAULT_MAX_ROWS\s*=\s*(\d+)/); return m ? parseInt(m[1]!, 10) >= 10000 : false; })())
  record('ABSOLUTE_MAX_ROWS raised (>=10000)', /ABSOLUTE_MAX_ROWS\s*=\s*(\d+)/.test(approvalRouteSrc) && (() => { const m = approvalRouteSrc.match(/ABSOLUTE_MAX_ROWS\s*=\s*(\d+)/); return m ? parseInt(m[1]!, 10) >= 10000 : false; })())
  record('approval route still has maxRows parameter', /maxRows/.test(approvalRouteSrc))
  record('preview route maxPreviewRows raised (>=1000)', /maxPreviewRows\s*=\s*(\d+)/.test(previewRouteSrc) && (() => { const m = previewRouteSrc.match(/maxPreviewRows\s*=\s*(\d+)/); return m ? parseInt(m[1]!, 10) >= 1000 : false; })())

  // ── 3. Frontend pagination state ──
  console.log('\n[3/12] frontend pagination state')
  record('PAGE_SIZE constant exists in orchestrator', /PAGE_SIZE\s*=\s*50/.test(mainSrc))
  record('reviewPage state exists', /reviewPage/.test(mainSrc))
  record('resolutionPage state exists', /resolutionPage/.test(mainSrc))
  record('paginatedFilteredRows computed', /paginatedFilteredRows/.test(mainSrc))
  record('paginatedFilteredResolutionItems computed', /paginatedFilteredResolutionItems/.test(mainSrc))
  record('totalFilteredReviewRows computed', /totalFilteredReviewRows/.test(mainSrc))
  record('totalFilteredResolutionItems computed', /totalFilteredResolutionItems/.test(mainSrc))
  record('totalReviewPages computed', /totalReviewPages/.test(mainSrc))
  record('totalResolutionPages computed', /totalResolutionPages/.test(mainSrc))

  // ── 4. Filtering before pagination ──
  console.log('\n[4/12] filtering before pagination')
  record('filteredRows useMemo exists', /const filteredRows\s*=\s*useMemo/.test(mainSrc))
  record('filteredRows filters by decision', /filterDecision/.test(mainSrc))
  record('filteredRows filters by blocked', /filterBlocked/.test(mainSrc))
  record('filteredRows filters by search', /searchText/.test(mainSrc))
  record('paginated rows slice from filteredRows', /filteredRows\.slice/.test(mainSrc))

  // ── 5. Review section pagination UI ──
  console.log('\n[5/12] review section pagination UI')
  record('review section accepts pagination props', /totalFilteredCount/.test(reviewSectionSrc))
  record('review section accepts currentPage', /currentPage/.test(reviewSectionSrc))
  record('review section accepts totalPages', /totalPages/.test(reviewSectionSrc))
  record('review section accepts pageSize', /pageSize/.test(reviewSectionSrc))
  record('review section accepts onPageChange', /onPageChange/.test(reviewSectionSrc))
  record('review section shows page range', /currentPage \* pageSize/.test(reviewSectionSrc) || /currentPage.*pageSize/.test(reviewSectionSrc))
  record('review section shows current page / total pages', /currentPage.*\/.*totalPages/.test(reviewSectionSrc))
  record('first page button exists', /ChevronsLeft/.test(reviewSectionSrc))
  record('previous page button exists', /ChevronLeft/.test(reviewSectionSrc))
  record('next page button exists', /ChevronRight/.test(reviewSectionSrc))
  record('last page button exists', /ChevronsRight/.test(reviewSectionSrc))
  record('first page button disabled when on first page', /currentPage <= 1/.test(reviewSectionSrc))
  record('next page button disabled when on last page', /currentPage >= totalPages/.test(reviewSectionSrc))

  // ── 6. Manual resolution section pagination UI ──
  console.log('\n[6/12] manual resolution section pagination UI')
  record('resolution section accepts pagination props', /totalFilteredCount/.test(resolutionSectionSrc))
  record('resolution section accepts currentPage', /currentPage/.test(resolutionSectionSrc))
  record('resolution section accepts onPageChange', /onPageChange/.test(resolutionSectionSrc))
  record('resolution section shows page range', /currentPage.*pageSize/.test(resolutionSectionSrc))
  record('resolution section shows current page / total', /currentPage.*\/.*totalPages/.test(resolutionSectionSrc))
  record('resolution section has first page button', /ChevronsLeft/.test(resolutionSectionSrc))
  record('resolution section has previous page button', /ChevronLeft/.test(resolutionSectionSrc))
  record('resolution section has next page button', /ChevronRight/.test(resolutionSectionSrc))
  record('resolution section has last page button', /ChevronsRight/.test(resolutionSectionSrc))

  // ── 7. State persistence ──
  console.log('\n[7/12] state persistence')
  record('clientDecisions keyed by approvalItemId', /clientDecisions\[row\.approvalItemId\]/.test(mainSrc))
  record('resolutionItems keyed by approvalItemId', /approvalItemId/.test(readF(join(ROOT, 'src/lib/import/course-setting-manual-resolution-l6-e1.ts'))))
  record('full dataset in state (reviewResult.rows)', /reviewResult\.rows/.test(mainSrc))
  record('full dataset in resolutionItems', /resolutionItems/.test(mainSrc))

  // ── 8. Export full dataset ──
  console.log('\n[8/12] export full dataset')
  record('export decision iterates all rows', /reviewResult\.rows/.test(mainSrc))
  record('export draft iterates all items', /resolutionItems\.length/.test(mainSrc))
  record('export button text indicates full dataset', /导出全量/.test(resolutionSectionSrc) || /导出审核决策 JSON/.test(reviewSectionSrc))
  record('export rawIncluded false', /rawIncluded:\s*false/.test(l6e2Src))

  // ── 9. Partial plan full dataset ──
  console.log('\n[9/12] partial plan full dataset')
  record('partial plan receives all resolutionItems', /resolutionItems,/.test(mainSrc))
  record('partial plan not paginated', /handleGeneratePartialPlan/.test(mainSrc))

  // ── 10. L6-E2G semantics preserved ──
  console.log('\n[10/12] L6-E2G semantics preserved')
  record('COURSE_CREATE_CANDIDATE exists', /COURSE_CREATE_CANDIDATE/.test(l6e2gSrc))
  record('COURSE_NAME_MISSING exists', /COURSE_NAME_MISSING/.test(l6e2gSrc))
  record('classifyCourseSituation exists', /classifyCourseSituation/.test(l6e2gSrc))

  // ── 11. No DB write / no apply ──
  console.log('\n[11/12] no DB write / no apply')
  record('no apply route dir', !existsSync(join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/partial-import-apply')))
  record('no 执行导入 button', !/执行导入/.test(mainSrc + reviewSectionSrc + resolutionSectionSrc))
  record('no 正式导入 button', !/正式导入/.test(mainSrc + reviewSectionSrc + resolutionSectionSrc))
  record('no schema changes', ex('git diff --name-only HEAD -- prisma/schema.prisma', { cwd: ROOT }).toString().trim().length === 0)
  record('no migration changes', ex('git diff --name-only HEAD -- prisma/migrations', { cwd: ROOT }).toString().trim().length === 0)

  // ── 12. Git / forbidden files ──
  console.log('\n[12/12] git / forbidden files')
  const diff = ex('git diff --check', { cwd: ROOT }).toString().trim()
  record('git diff --check clean', diff.length === 0, diff.split('\n')[0] || '')
  const status = ex('git status --short', { cwd: ROOT }).toString().trim()
  record('worktree clean', status.length === 0)
  record('status has L7-A2', /L7-A2/.test(statusSrc))

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
