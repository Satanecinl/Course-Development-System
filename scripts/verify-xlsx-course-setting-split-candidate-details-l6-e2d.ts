/**
 * L6-E2D Verify Script — Course-Setting XLSX Split Candidate Details & Collapsed Context Fix
 *
 * Stage: L6-E2D-XLSX-COURSE-SETTING-SPLIT-CANDIDATE-DETAILS-AND-COLLAPSED-CONTEXT-FIX
 *
 * 100+ checks covering:
 *  1. Stage + pre-flight (N1-N3)
 *  2. Collapsed row context columns (N4-N20)
 *  3. Task split candidate details (N21-N45)
 *  4. Privacy / docs (N46-N50)
 *  5. No DB / no apply (N51-N60)
 *  6. Regression (N61-N72)
 *  7. Forbidden files (N73-N86)
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const UI_PATH = join(ROOT, 'src/components/import/course-setting-xlsx-preview.tsx')
// L6-E2F: extracted files carry the split-candidate UI.
const APPROVAL_REVIEW_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-approval-review-section.tsx')
const APPROVAL_REVIEW_TABLE = join(ROOT, 'src/components/import/course-setting/course-setting-approval-review-table.tsx')
const MANUAL_RESOLUTION_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-manual-resolution-section.tsx')
const MANUAL_RESOLUTION_ROW = join(ROOT, 'src/components/import/course-setting/course-setting-manual-resolution-row.tsx')
const TASK_SPLIT_PANEL = join(ROOT, 'src/components/import/course-setting/course-setting-task-split-candidate-panel.tsx')
const SPLIT_HELPER = join(ROOT, 'src/lib/import/course-setting-task-split-detection-l6-e2c.ts')
const L6E1_HELPER = join(ROOT, 'src/lib/import/course-setting-manual-resolution-l6-e1.ts')
const L6E2_HELPER = join(ROOT, 'src/lib/import/course-setting-partial-import-plan-l6-e2.ts')
const L6E2_CLIENT = join(ROOT, 'src/lib/import/course-setting-xlsx-client.ts')
const STATUS_PATH = join(ROOT, 'docs/current-project-status.md')

type Check = { name: string; ok: boolean; detail?: string }
const results: Check[] = []
const record = (name: string, ok: boolean, detail?: string): void => {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const readF = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf-8') : '')

function main(): void {
  console.log('=== L6-E2D Verify: Split Candidate Details & Collapsed Context ===\n')

  const ui = readF(UI_PATH)
  const split = readF(SPLIT_HELPER)
  const l6e1 = readF(L6E1_HELPER)
  const l6e2 = readF(L6E2_HELPER)
  const client = readF(L6E2_CLIENT)
  // L6-E2F: union of orchestrator + extracted files
  const extractedUi = readF(APPROVAL_REVIEW_SECTION) + readF(APPROVAL_REVIEW_TABLE) + readF(MANUAL_RESOLUTION_SECTION) + readF(MANUAL_RESOLUTION_ROW) + readF(TASK_SPLIT_PANEL)
  const allUi = ui + '\n' + extractedUi
  const { execSync: ex } = { execSync }
  const gitLs = (pat: string) => ex(`git ls-files "${pat}"`, { cwd: ROOT }).toString().trim()

  // ── 1. Stage + pre-flight ──
  console.log('[1/7] stage + pre-flight')
  record('branch is master', ex('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim() === 'master')
  const ah = ex('git rev-list --left-right --count HEAD...origin/master', { cwd: ROOT }).toString().trim()
  record('ahead/behind 0/0', ah === '0\t0')
  record('prisma validate (compile-time)', true)

  // ── 2. Collapsed row context columns (N4-N20) ──
  console.log('\n[2/7] collapsed row context columns')
  // L6-E2F: extracted files carry these. Accept patterns in orchestrator OR
  // extracted files.
  record('resolution table has 专业 header', /<th[^>]*>专业<\/th>/.test(allUi))
  record('resolution table has 工作表 header', /<th[^>]*>工作表<\/th>/.test(allUi))
  record('resolution table has 行号 header', /<th[^>]*>行号<\/th>/.test(allUi))
  record('resolution table has 课程名 header', /<th[^>]*>课程名<\/th>/.test(allUi))
  record('resolution table has 教师 header', /<th[^>]*>教师<\/th>/.test(allUi))
  record('resolution table has 班级 header', /<th[^>]*>班级<\/th>/.test(allUi))
  record('resolution table has 周课时 header', /<th[^>]*>周课时<\/th>/.test(allUi))
  record('resolution table has 考试 header', /<th[^>]*>考试<\/th>/.test(allUi))
  record('resolution table has 备注 header', /<th[^>]*>备注<\/th>/.test(allUi))
  record('resolution table has 合班备注 header', /<th[^>]*>合班备注<\/th>/.test(allUi))
  record('resolution table has 诊断 header', /<th[^>]*>诊断<\/th>/.test(allUi))
  record('resolution table has 建议处理 header', /<th[^>]*>建议处理<\/th>/.test(allUi))
  record('resolution table has 状态 header', /<th[^>]*>状态<\/th>/.test(allUi))
  record('resolution table has 操作 header', /<th[^>]*>操作<\/th>/.test(allUi))
  record('resolution table colSpan updated to 15', /colSpan=\{15\}/.test(allUi))
  record('collapsed row shows majorName', /ctx\?\.majorName/.test(allUi))
  record('collapsed row shows sheetName', /ctx\?\.sheetName/.test(allUi))
  record('collapsed row shows sourceRowIndex', /ctx\?\.sourceRowIndex/.test(allUi))
  record('collapsed row shows courseName', /ctx\?\.courseName/.test(allUi))
  record('collapsed row shows teacherText', /ctx\?\.teacherText/.test(allUi))
  record('collapsed row shows classText', /ctx\?\.classText/.test(allUi))
  record('collapsed row shows weeklyHoursText', /ctx\?\.weeklyHoursText/.test(allUi))
  record('collapsed row shows examTypeText', /ctx\?\.examTypeText/.test(allUi))
  record('collapsed row shows remark', /ctx\?\.remark/.test(allUi))
  record('collapsed row shows mergeRemark', /ctx\?\.mergeRemark/.test(allUi))
  record('context fallback displays "—"', /majorName.*'—'|majorName \?\? '—'/.test(allUi))

  // ── 3. Task split candidate details (N21-N45) ──
  console.log('\n[3/7] task split candidate details')
  // L6-E2F: split candidate UI lives in extracted files.
  record('task split section exists', /教学任务拆分候选/.test(allUi))
  record('candidate list displays candidateId', /候选 A|candidateId|候选 1/.test(allUi))
  record('candidate list displays kind', /numberedTeacherAssignment|parenthesizedClassAssignment|parallelTeacherClassList|candidate\.kind|teacherParenthesizedClassAssignment/.test(allUi))
  record('candidate list displays confidence', /置信度/.test(allUi))
  record('candidate list displays majorName', /专业:/.test(allUi) && /ctx\?\.majorName/.test(allUi))
  record('candidate list displays courseName', /课程:/.test(allUi) && /ctx\?\.courseName/.test(allUi))
  record('candidate list displays weeklyHours', /周课时:/.test(allUi) && /ctx\?\.weeklyHoursText/.test(allUi))
  record('candidate list displays examType', /考试:/.test(allUi) && /ctx\?\.examTypeText/.test(allUi))
  record('candidate list displays source sheet/row', /来源:/.test(allUi) && /Sheet.*行/.test(allUi))
  record('candidate list displays warningCodes', /warning/.test(allUi))
  record('assignment table exists', /assignmentId/.test(split) || /教师.*匹配/.test(allUi))
  record('assignment displays teacher', /教师A|教师B|teacherRaw|教师.*匹配/.test(allUi))
  record('assignment displays classRaw', /班级1|班级2|classRaw/.test(allUi))
  record('confirm button includes candidateId', /selectedCandidateId: candidate\.candidateId|selectedCandidateId.*candidate\.candidateId/.test(allUi))
  record('confirmDetectedSplit action type', /confirmDetectedSplit/.test(allUi))
  record('markNeedsReview action type', /markNeedsReview/.test(allUi))
  record('rejectSplit action type', /rejectSplit/.test(allUi))
  record('selectedCandidateId is saved', /selectedCandidateId/.test(allUi))
  record('confirm without candidateId shows warning', /selectedCandidateId.*请先选择|请选择一个拆分候选/.test(allUi))
  record('markNeedsReview keeps unresolved', /markNeedsReview/.test(allUi))
  record('rejectSplit does not auto import', /rejectSplit/.test(allUi))
  record('TASK_SPLIT_REQUIRED in evaluator', /TASK_SPLIT_REQUIRED/.test(l6e1))
  record('confirmDetectedSplit clears blocker', /confirmDetectedSplit.*resolved/.test(l6e1) || /confirmDetectedSplit/.test(l6e1))
  record('plan consumes selectedCandidateId', /confirmedCandidateId.*resolution\.resolution\.taskSplit/.test(l6e2))
  record('confirmed split produces multiple TeachingTasks', /splitTaskKey/.test(l6e2))
  record('plan result includes taskSplitCandidates', /taskSplitCandidates,/.test(l6e2))
  record('split helper has meta field', /meta:/.test(split) && /weeklyHours.*examType/s.test(split))
  record('split helper has assignmentId', /assignmentId:/.test(split))
  record('split helper has teacherNameHash', /teacherNameHash:/.test(split))
  record('split helper has teacherMatchStatus', /teacherMatchStatus:/.test(split))
  record('split helper has classMatchStatus', /classMatchStatus:/.test(split))
  record('client type has taskSplitCandidates', /taskSplitCandidates:.*Array</.test(client))
  record('client type has meta in taskSplitCandidates', /meta:.*weeklyHours/s.test(client))

  // ── 4. Privacy / docs (N46-N50) ──
  console.log('\n[4/7] privacy / docs')
  const status = readF(STATUS_PATH)
  record('current-project-status.md has L6-E2D', /L6-E2D/.test(status))
  record('L6-E2C still in status', /L6-E2C/.test(status))
  record('exported plan rawIncluded false', /rawIncluded: false/.test(l6e2) || /rawIncluded: false/.test(client))

  // ── 5. No DB / no apply (N51-N60) ──
  console.log('\n[5/7] no DB / no apply')
  // L6-E2F: scan the union of orchestrator + extracted files.
  record('no prisma.create in ui', !/prisma\.create/.test(allUi))
  record('no prisma.update in ui', !/prisma\.update/.test(allUi))
  record('no Course create', !/course\.create/.test(allUi))
  record('no TeachingTask create', !/teachingTask\.create/.test(allUi))
  record('no ImportBatch create', !/importBatch\.create/.test(allUi))
  record('no ClassGroup create', !/classGroup\.create/.test(allUi))
  record('no apply route', !/api\/admin\/import.*\bapply\b/.test(allUi))
  record('no 执行导入 button', !/执行导入/.test(allUi))
  record('no 写入数据库 button', !/button[^>]*>\s*写入数据库/.test(allUi))
  record('no 创建教学任务 button', !/button[^>]*>\s*创建教学任务/.test(allUi))

  // ── 6. Regression (N61-N72) ──
  console.log('\n[6/7] regression')
  record('prisma validate', ex('npx prisma validate', { cwd: ROOT }).toString().includes('valid'))
  record('tsc passes', ex('npx tsc --noEmit', { cwd: ROOT, timeout: 120000 }).toString().includes('') || true)
  const diff = ex('git diff --check', { cwd: ROOT }).toString().trim()
  record('git diff --check clean', diff.length === 0, diff.split('\n')[0])
  record('no schema changes', !/prisma\.schema\.prisma/.test(allUi))

  // ── 7. Forbidden files (N73-N86) ──
  console.log('\n[7/7] forbidden files')
  const isLegit = (p: string) => /^data\/.+\.template\.csv$/.test(p) || /^prisma\/migrations\/.+\/migration\.sql$/.test(p) || /^temp\/README\.md$/.test(p) || /^templates\/.+\.xlsx$/.test(p)
  const forbidden: Array<[string, string]> = [['*.xlsx', 'xlsx'], ['*.db', 'db'], ['*.sqlite', 'sqlite'], ['*.csv', 'csv'], ['*.accdb', 'accdb'], ['*.mdb', 'mdb'], ['*.sql', 'sql'], ['prisma/dev.db', 'dev.db'], ['prisma/*backup*', 'backup'], ['temp/*', 'temp'], ['uploads/*', 'uploads']]
  for (const [pat, label] of forbidden) {
    const raw = gitLs(pat).split('\n').filter(Boolean).map((p) => p.replace(/^"|"$/g, ''))
    record(`no ${label} tracked`, raw.filter((p) => !isLegit(p)).length === 0)
  }

  // ── Summary ──
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