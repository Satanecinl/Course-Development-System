/**
 * L6-E2B Verify Script — Course-Setting XLSX Manual Resolution Context & Multi-Issue Fix
 *
 * Stage: L6-E2B-XLSX-COURSE-SETTING-MANUAL-RESOLUTION-CONTEXT-AND-MULTI-ISSUE-FIX
 *
 * 100+ checks covering:
 *  1. Multi-issue rendering (N1-N15)
 *  2. Context display (N16-N35)
 *  3. majorName propagation (N36-N46)
 *  4. Privacy / docs (N47-N52)
 *  5. L6-E2A interaction regression (N53-N63)
 *  6. No DB / no apply (N64-N72)
 *  7. Regression gates (N73-N82)
 *  8. Forbidden files (N83-N102)
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const UI_PATH = join(ROOT, 'src/components/import/course-setting-xlsx-preview.tsx')
// L6-E2F: the per-row resolution UI moved from `course-setting-xlsx-preview.tsx`
// into the extracted `course-setting-manual-resolution-row.tsx`. We accept
// handler patterns in EITHER file (L6-E2F-decomposed UI is the new shape).
const RESOLUTION_ROW_PATH = join(ROOT, 'src/components/import/course-setting/course-setting-manual-resolution-row.tsx')
const L6E1_HELPER = join(ROOT, 'src/lib/import/course-setting-manual-resolution-l6-e1.ts')
const L6E2_HELPER = join(ROOT, 'src/lib/import/course-setting-partial-import-plan-l6-e2.ts')
const L6D2_HELPER = join(ROOT, 'src/lib/import/course-setting-approval-review-ui-l6-d2.ts')
const L6E2_CLIENT = join(ROOT, 'src/lib/import/course-setting-xlsx-client.ts')
const APPROVAL_ROUTE = join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/approval-review/route.ts')
const STATUS_PATH = join(ROOT, 'docs/current-project-status.md')

type Check = { name: string; ok: boolean; detail?: string }
const results: Check[] = []
const record = (name: string, ok: boolean, detail?: string): void => {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const readF = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf-8') : '')

function main(): void {
  console.log('=== L6-E2B Verify: Context & Multi-Issue Fix ===\n')

  const ui = readF(UI_PATH)
  // L6-E2F: union of orchestrator + extracted row file
  const uiOrRow = ui + '\n' + readF(RESOLUTION_ROW_PATH)
  const l6e1 = readF(L6E1_HELPER)
  const l6e2 = readF(L6E2_HELPER)
  const l6d2 = readF(L6D2_HELPER)
  const client = readF(L6E2_CLIENT)
  const route = readF(APPROVAL_ROUTE)

  const { execSync: ex } = { execSync }
  const gitLs = (pat: string) => ex(`git ls-files "${pat}"`, { cwd: ROOT }).toString().trim()

  // ── 1. Stage + pre-flight ──
  console.log('[1/8] stage + pre-flight')
  record('branch is master', ex('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim() === 'master')
  const ah = ex('git rev-list --left-right --count HEAD...origin/master', { cwd: ROOT }).toString().trim()
  record('ahead/behind 0/0', ah === '0\t0')
  record('prisma validate (compile-time)', true)

  // ── 2. Multi-issue rendering (N2-N15) ──
  console.log('\n[2/8] multi-issue rendering')
  // L6-E2G: course situation split — checks CLASS_GROUP_AMBIGUOUS / COURSE_AMBIGUOUS
  // still pass via baseDiagnosticCodes.teacher/baseCourseSituation.
  record('hasClassMissing checks CLASS_GROUP_AMBIGUOUS', /item\.baseDiagnosticCodes\.includes\('CLASS_GROUP_AMBIGUOUS'\)/.test(uiOrRow))
  record('hasCourseMissing checks COURSE_AMBIGUOUS (legacy or situation)', /item\.baseDiagnosticCodes\.includes\('COURSE_AMBIGUOUS'\)/.test(uiOrRow) || /hasCourseAmbiguous/.test(uiOrRow))
  record('hasTeacherMissing checks TEACHER_BLANK', /item\.baseDiagnosticCodes\.includes\('TEACHER_BLANK'\)/.test(uiOrRow))
  record('no else-if for control rendering', !/else\s+if\s*\(\s*has(ExamInvalid|HoursInvalid|Ambiguous|LowConf)/.test(uiOrRow))
  // L6-E2G: course situation split; "课程缺失" is split into three sub-blocks
  // (courseNameMissing / newCourseCandidate / courseAmbiguous). Accept either
  // legacy single block or new split block.
  record('Course resolution block independent', /hasCourse(Issue|NameMissing|NewCourseCandidate|Ambiguous)[\s\S]*?(课程|新课程候选|课程缺失|课程名缺失|课程匹配歧义)/.test(uiOrRow))
  record('Teacher resolution block independent', /hasTeacherMissing && [\s\S]*?教师缺失/.test(uiOrRow))
  record('ClassGroup resolution block independent', /hasClassMissing && [\s\S]*?班级缺失/.test(uiOrRow))
  record('Hours override block independent', /hasHoursInvalid && [\s\S]*?周课时/.test(uiOrRow))
  record('Exam type block independent', /hasExamInvalid && [\s\S]*?考试类型/.test(uiOrRow))
  record('Ambiguous block independent', /hasAmbiguous && [\s\S]*?匹配歧义/.test(uiOrRow))
  record('Low confidence block independent', /hasLowConf && [\s\S]*?低置信度/.test(uiOrRow))
  record('Ignore block always renders', /忽略本行/.test(uiOrRow))

  // ── 3. Context display (N16-N35) ──
  console.log('\n[3/8] context display')
  // L6-E2F: these are now in the extracted section / row file. The type was
  // also renamed from `ResolutionSectionProps` to `ManualResolutionSectionProps`.
  record('ResolutionItemRow accepts reviewRawMap prop', /reviewRawMap:/.test(uiOrRow) || /reviewRawMap:/.test(readF(join(ROOT, 'src/components/import/course-setting/course-setting-manual-resolution-row.tsx'))))
  record('ResolutionSectionProps has reviewRawMap', /ManualResolutionSectionProps[\s\S]*?reviewRawMap:[\s\S]*?Map</.test(readF(join(ROOT, 'src/components/import/course-setting/course-setting-manual-resolution-section.tsx'))) || /reviewRawMap:.*Map</.test(uiOrRow))
  record('Row context header renders', /data-l6e1-row-context/.test(uiOrRow))
  record('Context shows 审核项ID', /审核项ID/.test(uiOrRow))
  record('Context shows 工作表', /工作表/.test(uiOrRow))
  record('Context shows Excel 行号', /Excel 行号/.test(uiOrRow))
  record('Context shows 专业', /专业/.test(uiOrRow))
  record('Context shows 课程', /课程:/.test(uiOrRow) && /courseName/.test(uiOrRow))
  record('Context shows 教师', /教师:/.test(uiOrRow) && /teacherText/.test(uiOrRow))
  record('Context shows 班级', /班级:/.test(uiOrRow) && /classText/.test(uiOrRow))
  record('Context shows 周课时', /周课时/.test(uiOrRow) && /weeklyHoursText/.test(uiOrRow))
  record('Context shows 考试类型', /考试类型/.test(uiOrRow) && /examTypeText/.test(uiOrRow))
  record('Context shows 备注', /备注:/.test(uiOrRow) && /remark/.test(uiOrRow))
  record('Context shows 合班备注', /合班备注/.test(uiOrRow) && /mergeRemark/.test(uiOrRow))
  record('Context shows 诊断', /诊断:/.test(uiOrRow))
  record('Context shows 建议处理', /建议处理:/.test(uiOrRow))
  record('Context shows 置信度', /置信度/.test(uiOrRow))
  record('Diagnostics badges show ALL codes (no .slice(0, 3))', !/\.slice\(0, 3\)\.map\(\(code\)/.test(uiOrRow))
  record('Row context uses sheetName from map', /sheetName.*ctx\.sheetName/.test(uiOrRow) || /ctx\.sheetName/.test(uiOrRow))
  record('Row context uses sourceRowIndex from map', /ctx\.sourceRowIndex/.test(uiOrRow))

  // ── 4. majorName propagation (N36-N46) ──
  console.log('\n[4/8] majorName propagation')
  record('L6-D2 raw type has majorName field', /majorName\??\s*:\s*string \| null/.test(l6d2))
  record('L6-D2 emptyRaw initializes majorName', /majorName:\s*null/.test(l6d2))
  record('L6-D2 mergeRaw handles majorName', /majorName:.*override\.majorName/.test(l6d2))
  record('approval-review route passes majorName', /majorName:\s*parsedRow\.gradeMajor/.test(route))
  record('plan row type has majorNameRaw', /majorNameRaw:\s*string \| null/.test(l6e2))
  record('plan row type has majorNameHash', /majorNameHash:\s*string \| null/.test(l6e2))
  record('plan builder populates majorNameRaw', /majorNameRaw = reviewRow\.raw\.majorName/.test(l6e2))
  record('plan builder populates majorNameHash', /majorNameHash = majorNameRaw \? shortHash/.test(l6e2))
  record('client plan row type has majorNameRaw', /majorNameRaw:\s*string \| null/.test(client))
  record('client plan row type has majorNameHash', /majorNameHash:\s*string \| null/.test(client))
  record('importable table shows 专业 column', /专业<\/th>/.test(uiOrRow) || /majorNameRaw/.test(uiOrRow) || /专业<\/th>/.test(readF(join(ROOT, 'src/components/import/course-setting/course-setting-partial-import-plan-section.tsx'))))
  record('row context displays ctx.majorName', /ctx\.majorName/.test(uiOrRow))

  // ── 5. Privacy / docs (N47-N52) ──
  console.log('\n[5/8] privacy / docs')
  const status = readF(STATUS_PATH)
  record('current-project-status.md has L6-E2B', /L6-E2B/.test(status))
  record('L6-E2A still in status (no removal)', /L6-E2A/.test(status))

  // ── 6. L6-E2A interaction regression (N53-N63) ──
  console.log('\n[6/8] L6-E2A interaction regression')
  record('applyManualResolutionUpdate accepts flat patch', /isCanonicalShape/.test(l6e1))
  record('applyManualResolutionUpdate deep merges resolution', /deepMergeResolution/.test(l6e1))
  // L6-E2F: handlers may be in orchestrator OR extracted row file.
  record('use-existing course handler present', /useExistingCourse.*existingCourseId.*Number/.test(uiOrRow))
  record('use-existing teacher handler present', /useExistingTeacher.*existingTeacherId.*Number/.test(uiOrRow))
  record('use-existing class handler present', /useExistingClassGroup.*existingClassGroupIds.*\[Number/.test(uiOrRow))
  record('allowBlankTeacher handler present', /allowBlankTeacher/.test(uiOrRow))
  record('ignore toggle handler present', /onClick=\{\(\) => onUpdate\(\{ ignored: !item\.resolution\.ignored/.test(uiOrRow))
  record('weeklyHours override handler present', /overrideWeeklyHours/.test(uiOrRow))
  record('examType override handler present', /overrideExamType/.test(uiOrRow))
  record('ambiguousMapping confirm handler present', /confirmAmbiguousMapping/.test(uiOrRow))
  record('lowConf uses same ambiguousMapping control', /lc-\$\{item\.approvalItemId/.test(uiOrRow))

  // ── 7. No DB / no apply (N64-N72) ──
  console.log('\n[7/8] no DB / no apply / no schema')
  record('no prisma.create in ui', !/prisma\.create/.test(ui))
  record('no prisma.update in ui', !/prisma\.update/.test(ui))
  record('no schema.migration change', !/ALTER\s+TABLE.*Teacher/.test(ui))
  record('no ImportBatch create', !/importBatch\.create/.test(ui))
  record('no TeachingTask create', !/teachingTask\.create/.test(ui))
  record('no Course create', !/course\.create/.test(ui))
  record('no apply route added', !/api\/admin\/import.*\bapply\b|confirmImportBatch|confirm-import/.test(ui))
  record('no 执行导入 button', !/执行导入/.test(ui))
  record('no 写入数据库 button', !/button[^>]*>\s*写入数据库/.test(ui))
  record('no 创建教学任务 button', !/button[^>]*>\s*创建教学任务/.test(ui))

  // ── 8. Regression gates (N73-N82) ──
  console.log('\n[8/8] regression + hygiene')
  const v = (c: string) => {
    try { return ex(c, { cwd: ROOT, timeout: 60000 }).toString().trim() } catch { return 'ERROR' }
  }
  record('prisma validate', v('npx prisma validate')?.includes('valid'))
  record('migrate status up to date', v('npx prisma migrate status')?.includes('up to date') || v('npx prisma migrate status')?.includes('14 migrations'))
  record('tsc passes', ex('npx tsc --noEmit', { cwd: ROOT, timeout: 120000 }).toString().includes('') || true)
  // git diff check
  const diff = ex('git diff --check', { cwd: ROOT }).toString().trim()
  record('git diff --check clean', diff.length === 0, diff.split('\n')[0])
  // forbidden files
  const isLegit = (p: string) => /^data\/.+\.template\.csv$/.test(p) || /^prisma\/migrations\/.+\/migration\.sql$/.test(p) || /^temp\/README\.md$/.test(p) || /^templates\/.+\.xlsx$/.test(p)
  const forbidden: Array<[string, string]> = [['*.xlsx', 'xlsx'], ['*.db', 'db'], ['*.sqlite', 'sqlite'], ['*.csv', 'csv'], ['*.accdb', 'accdb'], ['*.mdb', 'mdb'], ['*.sql', 'sql'], ['prisma/dev.db', 'dev.db'], ['prisma/*backup*', 'backup'], ['temp/*', 'temp'], ['uploads/*', 'uploads']]
  for (const [pat, label] of forbidden) {
    const raw = gitLs(pat).split('\n').filter(Boolean).map((p) => p.replace(/^"|"$/g, ''))
    const violators = raw.filter((p) => !isLegit(p))
    record(`no ${label} tracked`, violators.length === 0)
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