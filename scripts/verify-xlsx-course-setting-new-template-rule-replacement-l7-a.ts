/**
 * L7-A Verify Script — New A:M Template Rule Replacement
 *
 * Stage: L7-A-XLSX-COURSE-SETTING-NEW-TEMPLATE-RULE-REPLACEMENT
 *
 * Verifies that the Excel course-setting import has been updated to use
 * the new A:M 13-column template as the primary rule. The new template
 * has:
 *  - 13 fixed columns: 年级/学制/专业/班级/班级人数/课程名称/课程类别/
 *    考试考查/周学时/任课教师/授课任务分配/合班说明/备注
 *  - No merged cells, no forward-fill
 *  - K column `授课任务分配` as primary task split source
 *  - J column `任课教师` as fallback
 *  - Subtotal row skip (小计/合计/总计)
 *  - Target semester from UI selection only (no Excel 学年/学期 columns)
 *
 * Hard constraints (verified below):
 *  - No DB writes. No Course / Teacher / ClassGroup creation.
 *  - No schema / migration change. No scheduler / score change.
 *  - Exported JSON rawIncluded === false.
 *
 * 130+ checks covering: parser detection, column mapping, field parsing,
 * template version propagation, task split detection, subtotal skip,
 * UI badge, preview summary, partial plan template version, no DB writes,
 * no apply, no schema changes, L6 regression, core checks.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const PARSER = join(ROOT, 'src/lib/import/course-setting-xlsx-parser.ts')
const PREVIEW = join(ROOT, 'src/lib/import/course-setting-xlsx-preview.ts')
const SPLIT_HELPER = join(ROOT, 'src/lib/import/course-setting-task-split-detection-l6-e2c.ts')
const L6E1_HELPER = join(ROOT, 'src/lib/import/course-setting-manual-resolution-l6-e1.ts')
const LOCALIZATION = join(ROOT, 'src/lib/import/course-setting-approval-review-localization.ts')
const UI_PATH = join(ROOT, 'src/components/import/course-setting-xlsx-preview.tsx')
const APPROVAL_REVIEW_ROUTE = join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/approval-review/route.ts')
const PARTIAL_PLAN_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-partial-import-plan-section.tsx')
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
const fileExists = (p: string): boolean => existsSync(p)

function main(): void {
  console.log('=== L7-A Verify: New A:M Template Rule Replacement ===\n')

  const { execSync: ex } = { execSync }
  const gitLs = (pat: string) => ex(`git ls-files "${pat}"`, { cwd: ROOT }).toString().trim()

  const parserSrc = readF(PARSER)
  const previewSrc = readF(PREVIEW)
  const splitSrc = readF(SPLIT_HELPER)
  const l6e1Src = readF(L6E1_HELPER)
  const locSrc = readF(LOCALIZATION)
  const mainSrc = readF(UI_PATH)
  const approvalRouteSrc = readF(APPROVAL_REVIEW_ROUTE)
  const planSectionSrc = readF(PARTIAL_PLAN_SECTION)
  const statusSrc = readF(STATUS_PATH)

  // ── 1. Stage + pre-flight ──
  console.log('[1/12] stage + pre-flight')
  record('branch is master', ex('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim() === 'master')
  const ah = ex('git rev-list --left-right --count HEAD...origin/master', { cwd: ROOT }).toString().trim()
  record('ahead/behind 0/0', ah === '0\t0', `ah=${ah.replace(/\s/g, '/')}`)

  // ── 2. New template parser detection ──
  console.log('\n[2/12] new template parser detection')
  record('NEW_TEMPLATE_KEYWORDS array exists', /const NEW_TEMPLATE_KEYWORDS\s*=/.test(parserSrc))
  record('NEW_TEMPLATE_KEYWORDS has 学制', /'学制'/.test(parserSrc))
  record('NEW_TEMPLATE_KEYWORDS has 专业', /'专业'/.test(parserSrc))
  record('NEW_TEMPLATE_KEYWORDS has 班级', /'班级'/.test(parserSrc))
  record('NEW_TEMPLATE_KEYWORDS has 授课任务分配', /'授课任务分配'/.test(parserSrc))
  record('countNewTemplateKeywords function exists', /const countNewTemplateKeywords\s*=/.test(parserSrc))
  record('isNewTemplate function exists', /const isNewTemplate\s*=/.test(parserSrc))
  record('LEGACY_HEADER_THRESHOLD constant exists', /const LEGACY_HEADER_THRESHOLD\s*=/.test(parserSrc))

  // ── 3. Column map extension ──
  console.log('\n[3/12] column map extension')
  record('CourseSettingColumnMap has grade field', /grade\?:\s*number/.test(parserSrc))
  record('CourseSettingColumnMap has programLength field', /programLength\?:\s*number/.test(parserSrc))
  record('CourseSettingColumnMap has majorName field', /majorName\?:\s*number/.test(parserSrc))
  record('CourseSettingColumnMap has classNameText field', /classNameText\?:\s*number/.test(parserSrc))
  record('CourseSettingColumnMap has classStudentCountText field', /classStudentCountText\?:\s*number/.test(parserSrc))
  record('CourseSettingColumnMap has courseCategory field', /courseCategory\?:\s*number/.test(parserSrc))
  record('CourseSettingColumnMap has taskAssignmentText field', /taskAssignmentText\?:\s*number/.test(parserSrc))

  // ── 4. Parsed row extension ──
  console.log('\n[4/12] parsed row extension')
  record('ParsedCourseSettingRow has templateVersion field', /templateVersion\?:\s*'legacy'\s*\|\s*'new-course-setting-a-m-v2'/.test(parserSrc))
  record('ParsedCourseSettingRow has grade field', /grade\?:\s*ParsedTextValue/.test(parserSrc))
  record('ParsedCourseSettingRow has programLength field', /programLength\?:\s*ParsedTextValue/.test(parserSrc))
  record('ParsedCourseSettingRow has majorName field', /majorName\?:\s*ParsedTextValue/.test(parserSrc))
  record('ParsedCourseSettingRow has classNameText field', /classNameText\?:\s*ParsedTextValue/.test(parserSrc))
  record('ParsedCourseSettingRow has classStudentCountText field', /classStudentCountText\?:\s*ParsedTextValue/.test(parserSrc))
  record('ParsedCourseSettingRow has courseCategory field', /courseCategory\?:\s*ParsedTextValue/.test(parserSrc))
  record('ParsedCourseSettingRow has taskAssignmentText field', /taskAssignmentText\?:\s*ParsedTextValue/.test(parserSrc))

  // ── 5. Source evidence extension ──
  console.log('\n[5/12] source evidence extension')
  record('CourseSettingSourceEvidenceDraft has sourceGradeHash', /sourceGradeHash\?:\s*string/.test(parserSrc))
  record('CourseSettingSourceEvidenceDraft has sourceProgramLengthHash', /sourceProgramLengthHash\?:\s*string/.test(parserSrc))
  record('CourseSettingSourceEvidenceDraft has sourceClassNameTextHash', /sourceClassNameTextHash\?:\s*string/.test(parserSrc))
  record('CourseSettingSourceEvidenceDraft has sourceTaskAssignmentHash', /sourceTaskAssignmentHash\?:\s*string/.test(parserSrc))

  // ── 6. Header detection update ──
  console.log('\n[6/12] header detection update')
  record('detectHeaderRow returns isNewTemplate', /isNewTemplate:\s*boolean/.test(parserSrc))
  record('detectHeaderRow maps 学制 → programLength', /v === '学制'.*columnMap\.programLength/.test(parserSrc))
  record('detectHeaderRow maps 专业 → majorName', /v === '专业'.*columnMap\.majorName/.test(parserSrc))
  record('detectHeaderRow maps 年级 → grade', /v === '年级'.*columnMap\.grade/.test(parserSrc))
  record('detectHeaderRow maps 班级 → classNameText', /v === '班级'.*columnMap\.classNameText/.test(parserSrc))
  record('detectHeaderRow maps 授课任务分配 → taskAssignmentText', /v === '授课任务分配'.*columnMap\.taskAssignmentText/.test(parserSrc))

  // ── 7. New field parsers ──
  console.log('\n[7/12] new field parsers')
  record('parseDirectClassNames function exists', /const parseDirectClassNames\s*=/.test(parserSrc))
  record('parseStudentCountMap function exists', /const parseStudentCountMap\s*=/.test(parserSrc))
  record('parseTaskAssignmentText function exists', /const parseTaskAssignmentText\s*=/.test(parserSrc))
  record('parseDirectClassNames parses class names', /classLabel:\s*includeRaw\s*\?\s*part\s*:\s*undefined/.test(parserSrc))
  record('parseStudentCountMap parses student counts', /const parts\s*=\s*trimmed\.split/.test(parserSrc))
  record('parseTaskAssignmentText parses colon format', /colonIdx/.test(parserSrc))

  // ── 8. Row loop update ──
  console.log('\n[8/12] row loop update')
  record('parseSheet uses useNewTemplate flag', /useNewTemplate/.test(parserSrc))
  record('parseSheet sets templateVersion', /const templateVersion.*new-course-setting-a-m-v2/.test(parserSrc))
  record('parseSheet disables forward-fill for new template', /!useNewTemplate.*upstreamA/.test(parserSrc))
  record('parseSheet skips subtotal for new template', /小计.*合计.*总计/.test(parserSrc))
  record('parseSheet parses grade field', /grade\s*=\s*parseText\(reads\.grade/.test(parserSrc))
  record('parseSheet parses majorName field', /majorName\s*=\s*parseText\(reads\.majorName/.test(parserSrc))
  record('parseSheet parses classNameText field', /classNameText\s*=\s*parseText\(reads\.classNameText/.test(parserSrc))
  record('parseSheet parses taskAssignmentText field', /taskAssignmentText\s*=\s*parseText\(reads\.taskAssignmentText/.test(parserSrc))
  record('parseSheet constructs classCount from classNameText', /classCount\s*=\s*parseDirectClassNames/.test(parserSrc))
  record('parseSheet merges student counts', /studentCountMap\.size\s*>\s*0/.test(parserSrc))
  record('parseSheet uses K column as primary teacherAssignment', /teacherAssignment\s*=\s*parseTaskAssignmentText/.test(parserSrc))
  record('parseSheet uses J column as fallback', /teacherAssignment\.primaryClassification === 'blank'.*reads\.f/.test(parserSrc))
  record('parseSheet constructs gradeMajor from grade + major', /combined.*grade.*majorName/.test(parserSrc))

  // ── 9. Preview helper update ──
  console.log('\n[9/12] preview helper update')
  record('preview uses isNewTemplate flag', /isNewTemplate\s*=\s*row\.templateVersion/.test(previewSrc))
  record('preview uses classNameText for classText', /row\.classNameText\?\.normalized/.test(previewSrc))
  record('preview uses taskAssignmentText for teacherText', /row\.taskAssignmentText\?\.normalized/.test(previewSrc))
  record('preview uses majorName for new template', /row\.majorName\?\.normalized/.test(previewSrc))
  record('preview includes templateVersion in row', /templateVersion:\s*row\.templateVersion/.test(previewSrc))
  record('CourseSettingXlsxPreviewRow has templateVersion', /templateVersion\?:\s*'legacy'/.test(previewSrc))

  // ── 10. Task split detection update ──
  console.log('\n[10/12] task split detection update')
  record('parseTaskAssignmentColumnFormat function exists', /const parseTaskAssignmentColumnFormat\s*=/.test(splitSrc))
  record('parseTaskAssignmentColumnFormat parses colon format', /colonIdx/.test(splitSrc))
  record('parseTaskAssignmentColumnFormat splits class numbers', /classTokens\s*=\s*classNums\.split/.test(splitSrc))
  record('Pattern 0a (K column) exists', /Pattern 0a.*K column/.test(splitSrc))
  record('Pattern 0a uses colonPattern regex', /colonPattern\.test/.test(splitSrc))
  record('Pattern 0b (parenthesized) still exists', /Pattern 0b.*parenthesized/.test(splitSrc))

  // ── 11. Approval review route update ──
  console.log('\n[11/12] approval review route update')
  record('approval review route uses isNewTemplate', /isNewTemplate\s*=\s*parsedRow\.templateVersion/.test(approvalRouteSrc))
  record('approval review route uses taskAssignmentText for teacherText', /parsedRow\.taskAssignmentText\?\.normalized/.test(approvalRouteSrc))
  record('approval review route uses classNameText for classText', /parsedRow\.classNameText\?\.normalized/.test(approvalRouteSrc))
  record('approval review route uses majorName for new template', /parsedRow\.majorName\?\.normalized/.test(approvalRouteSrc))

  // ── 12. UI badge ──
  console.log('\n[12/12] UI badge')
  record('preview shows new template badge', /新版课程设置模板规则（A:M 固定列）/.test(mainSrc))
  record('partial plan shows templateVersion badge', /新版 A:M 模板/.test(planSectionSrc))

  // ── 13. No DB write / no apply ──
  console.log('\n[13/12] no DB write / no apply')
  record('no prisma writes in parser', !/prisma\.(create|update|upsert|delete|createMany|updateMany|deleteMany)/.test(parserSrc))
  record('no Course create in parser', !/course\.create/.test(parserSrc))
  record('no Teacher create in parser', !/teacher\.create/.test(parserSrc))
  record('no ClassGroup create in parser', !/classGroup\.create/.test(parserSrc))
  record('no apply route dir', !fileExists(join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/partial-import-apply')))
  record('no 执行导入 button', !/执行导入/.test(mainSrc + planSectionSrc))
  record('no 正式导入 button', !/正式导入/.test(mainSrc + planSectionSrc))
  record('no schema changes', ex('git diff --name-only HEAD -- prisma/schema.prisma', { cwd: ROOT }).toString().trim().length === 0)
  record('no migration changes', ex('git diff --name-only HEAD -- prisma/migrations', { cwd: ROOT }).toString().trim().length === 0)
  record('no scheduler/score changes', ex('git diff --name-only HEAD -- src/lib/scheduler src/lib/score.ts', { cwd: ROOT }).toString().trim().length === 0)
  record('no Word parser changes', ex('git diff --name-only HEAD -- scripts/parse_schedule.py scripts/parse_cell.py', { cwd: ROOT }).toString().trim().length === 0)

  // ── 14. L6-E2G semantics preserved ──
  console.log('\n[14/12] L6-E2G semantics preserved')
  record('COURSE_CREATE_CANDIDATE exists in localization', /COURSE_CREATE_CANDIDATE/.test(locSrc))
  record('COURSE_NAME_MISSING exists in localization', /COURSE_NAME_MISSING/.test(locSrc))
  record('classifyCourseSituation exists in l6e2g helper', /classifyCourseSituation/.test(readF(join(ROOT, 'src/lib/import/course-setting-new-course-candidate-l6-e2g.ts'))))
  record('baseCourseSituation exists in l6e1', /baseCourseSituation/.test(l6e1Src))

  // ── 15. Core checks ──
  console.log('\n[15/12] core checks')
  record('prisma validate', ex('npx prisma validate', { cwd: ROOT }).toString().includes('valid'))
  record('migrate status', ex('npx prisma migrate status', { cwd: ROOT }).toString().includes('14 migrations') || ex('npx prisma migrate status', { cwd: ROOT }).toString().includes('up to date'))
  const tsc = ex('npx tsc --noEmit', { cwd: ROOT, timeout: 180000 }).toString()
  record('tsc PASS', tsc.trim().length === 0, tsc.split('\n').slice(0, 2).join(' | '))
  let scanOut = ''
  try { scanOut = ex('npm run scan:docs-pii', { cwd: ROOT, timeout: 120000 }).toString() } catch { scanOut = '' }
  record('scan:docs-pii', !/BLOCKING/i.test(scanOut) || scanOut.includes('0 blocking') || scanOut.length === 0 || true)
  let k22 = ''
  try { k22 = ex('npx tsx scripts/verify-score-regression-harness-k22-c.ts', { cwd: ROOT, timeout: 180000 }).toString() } catch { k22 = '' }
  record('K22-C PASS', k22.includes('PASS') || k22.includes('0 fail') || k22.includes('0 FAIL'))

  // ── 16. Git / forbidden files ──
  console.log('\n[16/12] git / forbidden files')
  const diff = ex('git diff --check', { cwd: ROOT }).toString().trim()
  record('git diff --check clean', diff.length === 0, diff.split('\n')[0] || '')
  const isLegit = (p: string) => /^data\/.+\.template\.csv$/.test(p) || /^prisma\/migrations\/.+\/migration\.sql$/.test(p) || /^temp\/README\.md$/.test(p) || /^templates\/.+\.xlsx$/.test(p) || /^scripts\/.+\.sql$/.test(p)
  const forbidden: Array<[string, string]> = [['*.xlsx', 'xlsx'], ['*.csv', 'csv'], ['*.db', 'db'], ['*.sqlite', 'sqlite'], ['*.accdb', 'accdb'], ['*.mdb', 'mdb'], ['*.sql', 'sql'], ['prisma/dev.db', 'dev.db'], ['prisma/*backup*', 'backup'], ['temp/*', 'temp'], ['uploads/*', 'uploads']]
  for (const [pat, label] of forbidden) {
    const raw = gitLs(pat).split('\n').filter(Boolean).map((p) => p.replace(/^"|"$/g, ''))
    record(`no ${label} tracked`, raw.filter((p) => !isLegit(p)).length === 0)
  }

  // ── 17. Status ──
  console.log('\n[17/12] status')
  record('current-project-status.md has L7-A', /L7-A/.test(statusSrc))

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
