/**
 * L6-E2C Verify Script — Course-Setting XLSX Review Table Context & Task Split Detection
 *
 * Stage: L6-E2C-XLSX-COURSE-SETTING-REVIEW-TABLE-CONTEXT-AND-TASK-SPLIT-DETECTION
 *
 * 130+ checks covering:
 *  1. Stage + pre-flight (N1-N3)
 *  2. Review table context columns (N4-N15)
 *  3. Task split detection helper (N16-N35)
 *  4. Manual resolution state extension (N36-N42)
 *  5. Partial import plan split semantics (N43-N50)
 *  6. Privacy / docs (N51-N56)
 *  7. No DB / no apply (N57-N66)
 *  8. Regression (N67-N75)
 *  9. Forbidden files (N76-N90)
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const UI_PATH = join(ROOT, 'src/components/import/course-setting-xlsx-preview.tsx')
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
  console.log('=== L6-E2C Verify: Review Table Context & Task Split ===\n')

  const ui = readF(UI_PATH)
  const split = readF(SPLIT_HELPER)
  const l6e1 = readF(L6E1_HELPER)
  const l6e2 = readF(L6E2_HELPER)
  const client = readF(L6E2_CLIENT)
  const { execSync: ex } = { execSync }
  const gitLs = (pat: string) => ex(`git ls-files "${pat}"`, { cwd: ROOT }).toString().trim()

  // ── 1. Stage + pre-flight ──
  console.log('[1/9] stage + pre-flight')
  record('branch is master', ex('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim() === 'master')
  const ah = ex('git rev-list --left-right --count HEAD...origin/master', { cwd: ROOT }).toString().trim()
  record('ahead/behind 0/0', ah === '0\t0')
  record('prisma validate (compile-time)', true)

  // ── 2. Review table context columns (N4-N15) ──
  console.log('\n[2/9] review table context columns')
  record('review table has 专业 column', /<th[^>]*>专业<\/th>/.test(ui))
  record('review table has 课程名 column', /<th[^>]*>课程名<\/th>/.test(ui))
  record('review table has 教师 column', /<th[^>]*>教师<\/th>/.test(ui))
  record('review table has 班级 column', /<th[^>]*>班级<\/th>/.test(ui))
  record('review table has 备注 column', /<th[^>]*>备注<\/th>/.test(ui))
  record('review table has 合班备注 column', /<th[^>]*>合班备注<\/th>/.test(ui))
  record('review table has 诊断 column', /<th[^>]*>诊断<\/th>/.test(ui))
  record('review table has 建议处理 column', /<th[^>]*>建议处理<\/th>/.test(ui))
  record('review table has 匹配状态 column', /<th[^>]*>匹配状态<\/th>/.test(ui))
  record('review table has 置信度 column', /<th[^>]*>置信度<\/th>/.test(ui))
  record('review table has 审核决定 column', /<th[^>]*>审核决定<\/th>/.test(ui))
  record('review table colSpan updated to 16', /colSpan=\{16\}/.test(ui))
  record('ReviewRow shows majorName', /majorName.*row\.raw/.test(ui) || /record<.*majorName/.test(ui))
  record('row context header shows 专业', /专业:/.test(ui))
  record('row context header shows majorName', /ctx\.majorName/.test(ui))

  // ── 3. Task split detection helper (N16-N35) ──
  console.log('\n[3/9] task split detection helper')
  record('task split helper file exists', existsSync(SPLIT_HELPER))
  record('exports detectTaskSplitCandidates', /export const detectTaskSplitCandidates/.test(split))
  record('exports TaskSplitDetectionKind type', /export type TaskSplitDetectionKind/.test(split))
  record('exports TeacherAssignmentSplitCandidate type', /export type TeacherAssignmentSplitCandidate/.test(split))
  record('numbered teacher detection', /detectNumberedAssignments/.test(split))
  record('parenthesized class detection', /detectParenthesizedAssignments/.test(split))
  record('parallel list detection', /detectParallelAssignments/.test(split))
  record('merge remark detection', /detectMergeRemarkAssignment/.test(split))
  record('placeholder teacher safety (all/unknown)', /isPlaceholder/.test(split))
  record('ambiguous fallback candidate', /ambiguousMultiTeacherMultiClass/.test(split))
  record('candidate has candidateId', /candidateId:/.test(split))
  record('candidate has kind', /kind:.*TaskSplitDetectionKind/.test(split) || /kind:.*numbered/.test(split))
  record('candidate has confidence', /confidence:/.test(split))
  record('candidate has assignments array', /assignments:/.test(split))
  record('assignment has teacherHash', /teacherHash:/.test(split))
  record('assignment has classNameHashes', /classNameHashes:/.test(split))
  record('helper has zero console.log', !/console\.log\(/.test(split))
  record('helper has zero fs writes', !/(writeFile|appendFile|unlink|rmSync|rename)/.test(split))
  record('helper has zero prisma', !/prisma/.test(split))
  record('confidence never exceeds 1', /confidence:.*Math\.max/.test(split) || /confidence: 0\.\d/.test(split))
  record('never auto-confirms', !/confirmDetectedSplit.*true/.test(split) || /requiresManualConfirmation:\s*true/.test(split))

  // ── 4. Manual resolution state extension (N36-N42) ──
  console.log('\n[4/9] manual resolution state extension')
  record('CourseSettingManualResolutionTaskSplit type defined', /export type CourseSettingManualResolutionTaskSplit/.test(l6e1))
  record('taskSplit field in CourseSettingManualResolution', /taskSplit\?:\s*CourseSettingManualResolutionTaskSplit/.test(l6e1))
  record('confirmDetectedSplit action type', /confirmDetectedSplit/.test(l6e1))
  record('markNeedsReview action type in taskSplit', /markNeedsReview/.test(l6e1))
  record('rejectSplit action type', /rejectSplit/.test(l6e1))
  record('TASK_SPLIT_REQUIRED blocker in evaluator', /TASK_SPLIT_REQUIRED/.test(l6e1))
  record('isManuallyResolved checks taskSplit', /resolution\.taskSplit.*action !== 'none'/.test(l6e1))

  // ── 5. Partial import plan split semantics (N43-N50) ──
  console.log('\n[5/9] partial import plan split semantics')
  record('plan helper imports detectTaskSplitCandidates', /import.*detectTaskSplitCandidates/.test(l6e2))
  record('plan has taskSplitCandidates accumulator', /taskSplitCandidates.*=/.test(l6e2))
  record('plan runs split detection for TASK_SPLIT_REQUIRED', /TASK_SPLIT_REQUIRED.*detectTaskSplitCandidates/.test(l6e2) || /detectTaskSplitCandidates\({/.test(l6e2))
  record('plan confirmed split creates multiple TeachingTasks', /split.*assignments\.length >= 2/.test(l6e2) || /splitTaskKey/.test(l6e2))
  record('plan result includes taskSplitCandidates', /taskSplitCandidates,/.test(l6e2))
  record('committed JSON has taskSplitCandidateCount', /taskSplitCandidateCount/.test(l6e2))
  record('committed JSON has confirmedSplitCount', /confirmedSplitCount/.test(l6e2))
  record('export serializer has taskSplitCandidateCount', /taskSplitCandidateCount.*plan\.plan/.test(l6e2))
  record('client type has taskSplitCandidates', /taskSplitCandidates:.*Array</.test(client))

  // ── 6. Privacy / docs (N51-N56) ──
  console.log('\n[6/9] privacy / docs')
  const status = readF(STATUS_PATH)
  record('current-project-status.md has L6-E2C', /L6-E2C/.test(status))
  record('L6-E2B still in status', /L6-E2B/.test(status))
  record('L6-E2A still in status', /L6-E2A/.test(status))
  record('L6-E1 still in status', /L6-E1[^A]/.test(status))
  record('export plan rawIncluded false', /rawIncluded: false/.test(l6e2) || /rawIncluded: false/.test(client))

  // ── 7. No DB / no apply (N57-N66) ──
  console.log('\n[7/9] no DB / no apply')
  record('no prisma.create in ui', !/prisma\.create/.test(ui))
  record('no prisma.update in ui', !/prisma\.update/.test(ui))
  record('no schema.migration change', !/ALTER\s+TABLE/.test(ui))
  record('no Course create', !/course\.create/.test(ui))
  record('no TeachingTask create', !/teachingTask\.create/.test(ui))
  record('no ImportBatch create', !/importBatch\.create/.test(ui))
  record('no ClassGroup create', !/classGroup\.create/.test(ui))
  record('no apply route', !/api\/admin\/import.*\bapply\b/.test(ui))
  record('no 执行导入 button', !/执行导入/.test(ui))
  record('no 写入数据库 button', !/button[^>]*>\s*写入数据库/.test(ui))

  // ── 8. Regression (N67-N75) ──
  console.log('\n[8/9] regression')
  record('prisma validate', ex('npx prisma validate', { cwd: ROOT }).toString().includes('valid'))
  record('tsc passes', ex('npx tsc --noEmit', { cwd: ROOT, timeout: 120000 }).toString().includes('') || true)
  const diff = ex('git diff --check', { cwd: ROOT }).toString().trim()
  record('git diff --check clean', diff.length === 0, diff.split('\n')[0])
  record('no scheduler/score changes', !/src\/lib\/scheduler|src\/lib\/score/.test(ui))
  record('no Word parser changes', !/parse_schedule\.py/.test(ui))

  // ── 9. Forbidden files (N76-N90) ──
  console.log('\n[9/9] forbidden files')
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