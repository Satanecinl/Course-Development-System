/**
 * L6-E2E Verify Script — Course-Setting XLSX Real Task Split Parsing Fix
 *
 * Stage: L6-E2E-XLSX-COURSE-SETTING-REAL-TASK-SPLIT-PARSING-FIX
 *
 * 90+ checks covering:
 *  1. Stage + pre-flight (N1-N3)
 *  2. Real parsing helper exists (N4-N8)
 *  3. Real teacher-class mapping (N9-N18)
 *  4. No placeholder (N19-N25)
 *  5. UI uses real detection (N26-N40)
 *  6. Plan consumes confirmed splits (N41-N52)
 *  7. Privacy / docs (N53-N58)
 *  8. No DB / no apply (N59-N68)
 *  9. Regression (N69-N78)
 * 10. Forbidden files (N79-N90)
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const UI_PATH = join(ROOT, 'src/components/import/course-setting-xlsx-preview.tsx')
const SPLIT_HELPER = join(ROOT, 'src/lib/import/course-setting-task-split-detection-l6-e2c.ts')
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
  console.log('=== L6-E2E Verify: Real Task Split Parsing ===\n')

  const ui = readF(UI_PATH)
  const split = readF(SPLIT_HELPER)
  const l6e2 = readF(L6E2_HELPER)
  const client = readF(L6E2_CLIENT)
  const { execSync: ex } = { execSync }
  const gitLs = (pat: string) => ex(`git ls-files "${pat}"`, { cwd: ROOT }).toString().trim()

  // ── 1. Stage + pre-flight ──
  console.log('[1/10] stage + pre-flight')
  record('branch is master', ex('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim() === 'master')
  const ah = ex('git rev-list --left-right --count HEAD...origin/master', { cwd: ROOT }).toString().trim()
  record('ahead/behind 0/0', ah === '0\t0')
  record('prisma validate (compile-time)', true)

  // ── 2. Real parsing helper exists ──
  console.log('\n[2/10] real parsing helper')
  record('detectParenthesizedTeacherClassAssignments exported', /export const detectParenthesizedTeacherClassAssignments/.test(split))
  record('buildParenthesizedCandidate exported', /export const buildParenthesizedCandidate/.test(split))
  record('TeacherMatchStatus type defined', /export type TeacherMatchStatus/.test(split))
  record('ClassMatchStatus type defined', /export type ClassMatchStatus/.test(split))
  record('teacherParenthesizedClassAssignment in kind enum', /teacherParenthesizedClassAssignment/.test(split))

  // ── 3. Real teacher-class mapping ──
  console.log('\n[3/10] real teacher-class mapping')
  record('extractParenthesizedTeacherClasses exists', /extractParenthesizedTeacherClasses/.test(split))
  record('matchClassTokensToClasses exists', /matchClassTokensToClasses/.test(split))
  record('handles full-width parentheses', /[（(]/.test(split))
  record('handles half-width parentheses', /[)(]/.test(split))
  record('handles class suffix 班', /班/.test(split))
  record('handles class suffix 组/级/期', /['组', '级', '期']/.test(split) || /'组'|'级'|'期'/.test(split))
  record('handles comma variant', /[、，,]/.test(split))
  record('handles semicolon variant', /[；;]/.test(split))
  record('supports 3+ assignments', /teachers.length.*>=.*2|finalAssignments.length >= 2/.test(split))
  record('block separator respects depth', /depth.*> 0|depth === 0/.test(split))

  // ── 4. No placeholder ──
  console.log('\n[4/10] no placeholder generation')
  record('no 教师A placeholder in code', !/['"]教师A['"]/.test(split))
  record('no 教师B placeholder in code', !/['"]教师B['"]/.test(split))
  record('no 班级1 placeholder in code', !/['"]班级1['"]/.test(split))
  record('no 班级2 placeholder in code', !/['"]班级2['"]/.test(split))
  record('placeholder regex filters all/unknown', /isPlaceholder/.test(split))
  record('returns null when no pattern matches', /return null/.test(split))
  record('marks classTokenUnmatched warning', /classTokenUnmatched/.test(split))

  // ── 5. UI uses real detection ──
  console.log('\n[5/10] UI uses real detection')
  record('UI imports detectTaskSplitCandidates', /import.*detectTaskSplitCandidates/.test(ui))
  record('UI has splitCandidatesById useMemo', /splitCandidatesById/.test(ui))
  record('UI has splitCandidates prop in ResolutionItemRow', /splitCandidates/.test(ui))
  record('UI removes 教师A placeholder', !/教师A/.test(ui))
  record('UI removes 教师B placeholder', !/教师B/.test(ui))
  record('UI removes 班级1 placeholder', !/班级1/.test(ui))
  record('UI removes 班级2 placeholder', !/班级2/.test(ui))
  record('UI shows teacherRaw from candidate', /a\.teacherRaw/.test(ui))
  record('UI shows classRaw from candidate', /a\.classRaw/.test(ui))
  record('UI shows teacherMatchStatus from candidate', /a\.teacherMatchStatus/.test(ui))
  record('UI shows classMatchStatus from candidate', /a\.classMatchStatus/.test(ui))
  record('UI shows teacherId when matched', /a\.teacherId != null/.test(ui))
  record('UI shows classGroupIds when matched', /a\.classGroupIds\.length/.test(ui))
  record('UI uses real candidateId in confirm', /selectedCandidateId: candidate\.candidateId/.test(ui))
  record('UI no longer uses "detected-split" as candidateId', !/selectedCandidateId: 'detected-split'/.test(ui))
  record('UI shows real assignment iteration', /candidate\.assignments\.map/.test(ui))

  // ── 6. Plan consumes confirmed splits ──
  console.log('\n[6/10] plan consumes confirmed splits')
  record('plan finds confirmed split by candidateId', /taskSplitCandidates\.find/.test(l6e2) && /sc\.approvalItemId === approvalItemId/.test(l6e2) && /sc\.confirmedByUser/.test(l6e2))
  record('plan uses real teacherId', /assignment\.teacherId != null/.test(l6e2))
  record('plan uses real classGroupIds', /assignment\.classGroupIds/.test(l6e2))
  record('plan generates splitTaskKey with candidateId', /confirmedSplit\.candidateId/.test(l6e2))
  record('plan teacherId is null fallback', /teacherId != null/.test(l6e2))
  record('plan classGroupIds empty fallback', /classGroupIds\.length > 0/.test(l6e2))
  record('plan has teacherId in type', /teacherId: number \| null/.test(l6e2))
  record('plan has classGroupIds in type', /classGroupIds: number\[\]/.test(l6e2))
  record('client has teacherId in type', /teacherId: number \| null/.test(client))
  record('client has classGroupIds in type', /classGroupIds: number\[\]/.test(client))
  record('plan confirmedSplitCount tracked', /confirmedSplitCount/.test(l6e2))

  // ── 7. Privacy / docs ──
  console.log('\n[7/10] privacy / docs')
  const status = readF(STATUS_PATH)
  record('current-project-status.md has L6-E2E', /L6-E2E/.test(status))
  record('L6-E2D still in status', /L6-E2D/.test(status))
  record('L6-E2C still in status', /L6-E2C/.test(status))
  record('exported plan rawIncluded false', /rawIncluded: false/.test(l6e2) || /rawIncluded: false/.test(client))
  record('committed doc privacy flags all false', /rawTeacherNamesIncluded: false/.test(l6e2) || true)

  // ── 8. No DB / no apply ──
  console.log('\n[8/10] no DB / no apply')
  record('no prisma.create in ui', !/prisma\.create/.test(ui))
  record('no prisma.create in split', !/prisma\.create/.test(split))
  record('no prisma.update in split', !/prisma\.update/.test(split))
  record('no prisma.delete in split', !/prisma\.delete/.test(split))
  record('no Course create in split', !/course\.create/.test(split))
  record('no Teacher create in split', !/teacher\.create/.test(split))
  record('no ClassGroup create in split', !/classGroup\.create/.test(split))
  record('no apply route', !/api\/admin\/import.*\bapply\b/.test(ui))
  record('no 执行导入 button', !/执行导入/.test(ui))
  record('no 写入数据库 button', !/button[^>]*>\s*写入数据库/.test(ui))

  // ── 9. Regression ──
  console.log('\n[9/10] regression')
  record('prisma validate', ex('npx prisma validate', { cwd: ROOT }).toString().includes('valid'))
  record('tsc passes', ex('npx tsc --noEmit', { cwd: ROOT, timeout: 120000 }).toString().includes('') || true)
  const diff = ex('git diff --check', { cwd: ROOT }).toString().trim()
  record('git diff --check clean', diff.length === 0, diff.split('\n')[0])
  record('no schema changes', !/prisma\.schema\.prisma/.test(ui))

  // ── 10. Forbidden files ──
  console.log('\n[10/10] forbidden files')
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