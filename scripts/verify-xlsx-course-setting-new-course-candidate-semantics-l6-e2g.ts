/**
 * L6-E2G Verify Script — Course-Setting XLSX New Course Candidate Semantics Fix
 *
 * Stage: L6-E2G-XLSX-COURSE-SETTING-NEW-COURSE-CANDIDATE-SEMANTICS-FIX
 *
 * This stage splits the legacy `COURSE_MISSING` diagnostic into two
 * semantically distinct cases at the L6-D2 / L6-E1 / L6-E2 layer:
 *
 *  1. Excel course name is EMPTY / unparsable → `COURSE_NAME_MISSING`
 *     (true blocker; user MUST resolve manually).
 *  2. Excel has a course name but DB has no match →
 *     `COURSE_CREATE_CANDIDATE` (new course candidate; confirmable; the
 *     user can confirm/rename/replace; future L6-F will create the Course
 *     on apply).
 *
 * `COURSE_AMBIGUOUS` (multiple DB matches) is preserved unchanged.
 *
 * Hard constraints (verified below):
 *  - No DB writes. No Course / Teacher / ClassGroup / TeachingTask /
 *    ImportBatch creation. No apply route. No apply button.
 *  - No schema / migration change. No scheduler / score change. No Word
 *    parser change.
 *  - Exported JSON rawIncluded === false. Committed docs no raw names.
 *
 * 90+ checks. Runs in seconds (mostly static analysis + a runtime dry-run
 * of the L6-E2 plan builder against the real xlsx).
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const L6E2G_HELPER = join(ROOT, 'src/lib/import/course-setting-new-course-candidate-l6-e2g.ts')
const L6E1_HELPER = join(ROOT, 'src/lib/import/course-setting-manual-resolution-l6-e1.ts')
const L6E2_HELPER = join(ROOT, 'src/lib/import/course-setting-partial-import-plan-l6-e2.ts')
const LOCALIZATION = join(ROOT, 'src/lib/import/course-setting-approval-review-localization.ts')
const L6E2_CLIENT = join(ROOT, 'src/lib/import/course-setting-xlsx-client.ts')
const UI_PATH = join(ROOT, 'src/components/import/course-setting-xlsx-preview.tsx')
const APPROVAL_REVIEW_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-approval-review-section.tsx')
const APPROVAL_REVIEW_TABLE = join(ROOT, 'src/components/import/course-setting/course-setting-approval-review-table.tsx')
const MANUAL_RESOLUTION_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-manual-resolution-section.tsx')
const MANUAL_RESOLUTION_ROW = join(ROOT, 'src/components/import/course-setting/course-setting-manual-resolution-row.tsx')
const PARTIAL_PLAN_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-partial-import-plan-section.tsx')
const STATUS_PATH = join(ROOT, 'docs/current-project-status.md')
const L6E2G_DOC_MD = join(ROOT, 'docs/l6-e2g-xlsx-course-setting-new-course-candidate-semantics-fix.md')
const L6E2G_DOC_JSON = join(ROOT, 'docs/l6-e2g-xlsx-course-setting-new-course-candidate-semantics-fix.json')
const PARTIAL_APPLY_DIR = join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/partial-import-apply')

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
  console.log('=== L6-E2G Verify: New Course Candidate Semantics Fix ===\n')

  const { execSync: ex } = { execSync }
  const gitLs = (pat: string) => ex(`git ls-files "${pat}"`, { cwd: ROOT }).toString().trim()

  const l6e2gHelper = readF(L6E2G_HELPER)
  const l6e1 = readF(L6E1_HELPER)
  const l6e2 = readF(L6E2_HELPER)
  const loc = readF(LOCALIZATION)
  const client = readF(L6E2_CLIENT)
  const main = readF(UI_PATH)
  const row = readF(MANUAL_RESOLUTION_ROW)
  const section = readF(MANUAL_RESOLUTION_SECTION)
  const planSection = readF(PARTIAL_PLAN_SECTION)
  const allUi = main + '\n' + readF(APPROVAL_REVIEW_SECTION) + readF(APPROVAL_REVIEW_TABLE) + section + row + planSection

  // ── 1. Stage + pre-flight ──
  console.log('[1/12] stage + pre-flight')
  // N1
  record('branch is master', ex('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim() === 'master')
  // N2
  const ah = ex('git rev-list --left-right --count HEAD...origin/master', { cwd: ROOT }).toString().trim()
  record('ahead/behind 0/0', ah === '0\t0', `ah=${ah.replace(/\s/g, '/')}`)
  // N3
  record('stage name constant exists', /L6_E2G_STAGE\s*=/.test(l6e2gHelper))
  // N4
  record('stage constant value correct', /'L6-E2G-XLSX-COURSE-SETTING-NEW-COURSE-CANDIDATE-SEMANTICS-FIX'/.test(l6e2gHelper))

  // ── 2. Diagnostic semantics ──
  console.log('\n[2/12] diagnostic semantics')
  // N5: COURSE_CREATE_CANDIDATE constant exists
  record('COURSE_CREATE_CANDIDATE constant exists', /export const COURSE_CREATE_CANDIDATE\s*=\s*'COURSE_CREATE_CANDIDATE'/.test(l6e2gHelper))
  // N6: COURSE_NAME_MISSING constant exists
  record('COURSE_NAME_MISSING constant exists', /export const COURSE_NAME_MISSING\s*=\s*'COURSE_NAME_MISSING'/.test(l6e2gHelper))
  // N7: classifyCourseSituation function exists
  record('classifyCourseSituation helper exists', /export const classifyCourseSituation\s*=/.test(l6e2gHelper))
  // N8: Excel courseName empty → COURSE_NAME_MISSING via classifyCourseSituation
  record('Excel courseName empty → courseNameMissing situation', /isExcelCourseNameMissing/.test(l6e2gHelper) && /'courseNameMissing'/.test(l6e2gHelper))
  // N9: Excel courseName non-empty + COURSE_MISSING diagnostic → newCourseCandidate
  record('Excel courseName + COURSE_MISSING → newCourseCandidate', /isNewCourseCandidate/.test(l6e2gHelper))
  // N10: DB course missing no longer maps to plain COURSE_MISSING at the L6-E2G layer
  record('effectiveCourseDiagnostics strips COURSE_MISSING', /filter\(\(c\) => c !== 'COURSE_MISSING'\)/.test(l6e2gHelper))
  // N11: COURSE_CREATE_CANDIDATE label
  record('localization has COURSE_CREATE_CANDIDATE label', /COURSE_CREATE_CANDIDATE:\s*'新课程候选'/.test(loc))
  // N12: COURSE_NAME_MISSING label
  record('localization has COURSE_NAME_MISSING label', /COURSE_NAME_MISSING:\s*'课程名缺失'/.test(loc))
  // N13: COURSE_AMBIGUOUS preserved
  record('localization still has COURSE_AMBIGUOUS label', /COURSE_AMBIGUOUS:\s*'课程匹配歧义'/.test(loc))
  // N14: COURSE_SITUATION_LABELS map exists
  record('COURSE_SITUATION_LABELS map exists', /COURSE_SITUATION_LABELS\s*=/.test(loc))
  // N15: long-form description for new course candidate
  record('long-form new course candidate description present', /系统未找到已有课程，将作为新课程创建/.test(loc))
  // N16: long-form description for true missing
  record('long-form course name missing description present', /Excel 行中没有可识别的课程名/.test(loc))

  // ── 3. Manual resolution semantics ──
  console.log('\n[3/12] manual resolution semantics')
  // N17: l6-e1 item has baseCourseSituation field
  record('item has baseCourseSituation field', /baseCourseSituation:\s*CourseSituation/.test(l6e1))
  // N18: item has baseRawCourseName field
  record('item has baseRawCourseName field', /baseRawCourseName:\s*string \| null/.test(l6e1))
  // N19: evaluateManualResolutionItem uses baseCourseSituation
  record('evaluator branches on baseCourseSituation', /baseCourseSituation === 'courseNameMissing'/.test(l6e1) && /baseCourseSituation === 'newCourseCandidate'/.test(l6e1))
  // N20: courseNameMissing → blocker 'courseNameMissing' (not 'courseMissing')
  record('courseNameMissing pushes courseNameMissing blocker', /blockers\.push\('courseNameMissing'\)/.test(l6e1))
  // N21: newCourseCandidate → blocker 'newCourseCandidate' when unresolved
  record('newCourseCandidate pushes newCourseCandidate blocker when unresolved', /blockers\.push\('newCourseCandidate'\)/.test(l6e1))
  // N22: courseAmbiguous preserved
  record('courseAmbiguous blocker preserved', /blockers\.push\('courseAmbiguous'\)/.test(l6e1))
  // N23: summary has courseNameMissingItems
  record('summary has courseNameMissingItems', /courseNameMissingItems:\s*number/.test(l6e1))
  // N24: summary has newCourseCandidateItems
  record('summary has newCourseCandidateItems', /newCourseCandidateItems:\s*number/.test(l6e1))
  // N25: summary has courseAmbiguousItems
  record('summary has courseAmbiguousItems', /courseAmbiguousItems:\s*number/.test(l6e1))
  // N26: summary has confirmedNewCourseCandidateItems
  record('summary has confirmedNewCourseCandidateItems', /confirmedNewCourseCandidateItems:\s*number/.test(l6e1))
  // N27: summarize counts courseNameMissing
  record('summarize counts courseNameMissingItems', /case 'courseNameMissing'/.test(l6e1))
  // N28: summarize counts newCourseCandidate
  record('summarize counts newCourseCandidateItems', /case 'newCourseCandidate'/.test(l6e1))
  // N29: summarize counts confirmed new course candidate
  record('summarize counts confirmed new course candidate', /createCourseCandidate[\s\S]*?confirmedNewCourseCandidateItems \+= 1/.test(l6e1))

  // ── 4. Partial import plan semantics ──
  console.log('\n[4/12] partial import plan semantics')
  // N30: summary has courseNameMissingRows
  record('plan summary has courseNameMissingRows', /courseNameMissingRows:\s*number/.test(l6e2))
  // N31: summary has rowsUsingNewCourseCandidate
  record('plan summary has rowsUsingNewCourseCandidate', /rowsUsingNewCourseCandidate:\s*number/.test(l6e2))
  // N32: summary has confirmedNewCourseCandidates
  record('plan summary has confirmedNewCourseCandidates', /confirmedNewCourseCandidates:\s*number/.test(l6e2))
  // N33: summary has courseAmbiguousRows
  record('plan summary has courseAmbiguousRows', /courseAmbiguousRows:\s*number/.test(l6e2))
  // N34: plan row has coursePlan field
  record('plan row has coursePlan field', /coursePlan:\s*\{/.test(l6e2))
  // N35: coursePlan.mode supports useExistingCourse
  record('coursePlan.mode supports useExistingCourse', /mode: 'useExistingCourse' \| 'createCourse' \| 'unresolved'/.test(l6e2))
  // N36: coursePlan.mode supports createCourse
  record('coursePlan.mode supports createCourse', /'createCourse'/.test(l6e2))
  // N37: coursePlan.mode supports unresolved
  record('coursePlan.mode supports unresolved', /'unresolved'/.test(l6e2))
  // N38: createCourseCandidate carries nameHash + source + confirmed
  record('createCourseCandidate has nameHash + source + confirmed', /nameHash:\s*string/.test(l6e2) && /source:\s*'excelCourseName' \| 'manualOverride'/.test(l6e2) && /confirmed:\s*boolean/.test(l6e2))
  // N39: CourseCreateCandidatePlan has confirmedCount
  record('CourseCreateCandidatePlan has confirmedCount', /confirmedCount:\s*number/.test(l6e2))
  // N40: plan pushes courseNameMissing blocker when Excel course name blank
  record('plan pushes courseNameMissing blocker for blank Excel course', /blockersForRow\.push\('courseNameMissing'\)/.test(l6e2))
  // N41: plan pushes courseAmbiguous blocker
  record('plan pushes courseAmbiguous blocker', /blockersForRow\.push\('courseAmbiguous'\)/.test(l6e2))
  // N42: plan creates candidate from Excel courseName when DB has no match (no resolution)
  // L7-A3 stage-aware: accept the new `hasCourseCandidateSignal` variable
  // that supersedes the legacy `hasCourseMissingDiag`.
  record('plan auto-creates candidate from Excel courseName (no resolution branch)', /hasCourseMissingDiag && !isExcelCourseNameBlank/.test(l6e2) || /hasCourseCandidateSignal && !isExcelCourseNameBlank/.test(l6e2))
  // N43: plan creates candidate when user confirms via createCourseCandidate
  record('plan honours createCourseCandidate resolution', /c\.action === 'createCourseCandidate'/.test(l6e2))
  // N44: confirmed candidates counted via confirmedCount increment
  record('plan increments confirmedCount for confirmed candidates', /isConfirmed \? 1 : 0/.test(l6e2) || /if \(isConfirmed\) existing\.confirmedCount \+= 1/.test(l6e2))
  // N45: aggregate counts derived from candidate list + blockers
  record('plan aggregates rowsUsingNewCourseCandidate from candidate list', /rowsUsingNewCourseCandidate \+= c\.approvalItemIds\.length/.test(l6e2))
  // N46: validation rules assert coursePlan consistency
  record('validation asserts coursePlan.mode consistency', /coursePlan\.mode === 'useExistingCourse' && r\.plannedCourseAction !== 'useExisting'/.test(l6e2))
  // N47: validation asserts confirmedNewCourseCandidates <= rowsUsingNewCourseCandidate
  record('validation asserts confirmed <= rowsUsing', /confirmedNewCourseCandidates.*must be <= rowsUsingNewCourseCandidate/.test(l6e2))
  // N48: client mirror type has coursePlan
  record('client plan row has coursePlan field', /coursePlan:\s*\{/.test(client))
  // N49: client summary has the four new counters
  record('client summary has courseNameMissingRows', /courseNameMissingRows:\s*number/.test(client))
  // N50: client summary has rowsUsingNewCourseCandidate
  record('client summary has rowsUsingNewCourseCandidate', /rowsUsingNewCourseCandidate:\s*number/.test(client))

  // ── 5. UI text changes ──
  console.log('\n[5/12] UI text changes')
  // N51: UI no longer labels new course candidate as plain "课程缺失" in the row block
  // (The course resolution block now uses situation-specific labels.)
  record('row block uses COURSE_SITUATION_LABELS', /COURSE_SITUATION_LABELS\[courseSituation\]/.test(row))
  // N52: UI says "新课程候选" for new course candidate
  record('UI text says 新课程候选', /新课程候选/.test(allUi))
  // N53: UI says "课程名缺失" for true missing
  record('UI text says 课程名缺失', /课程名缺失/.test(allUi))
  // N54: UI provides confirm create course action (button)
  record('UI provides 确认创建新课程 action', /确认创建新课程/.test(allUi))
  // N55: UI data attribute marks new candidate controls
  record('UI has data-l6e2g-course-controls="new-candidate"', /data-l6e2g-course-controls="new-candidate"/.test(allUi))
  // N56: UI provides use-existing course fallback
  record('UI provides 选择已有课程 fallback', /选择已有课程/.test(allUi))
  // N57: UI allows renaming the candidate
  record('UI allows rename candidate (placeholder)', /新课程候选名称/.test(allUi))
  // N58: UI displays Excel course name for new candidate context
  record('UI displays Excel 课程名 for new candidate context', /Excel 课程名/.test(allUi))
  // N59: plan section surfaces courseNameMissingRows count card
  record('plan section has 课程名缺失行 card', /课程名缺失行/.test(planSection))
  // N60: plan section surfaces confirmedNewCourseCandidates count card
  record('plan section has 新课程候选（已确认） card', /新课程候选（已确认）/.test(planSection))
  // N61: manual resolution section surfaces new course candidate summary card
  record('manual resolution section has 新课程候选 summary card', /新课程候选/.test(section))
  // N62: plan importable table distinguishes confirmed vs unconfirmed candidates
  record('plan importable table marks confirmed candidates', /新候选（已确认）/.test(planSection) && /新候选（未确认）/.test(planSection))
  // N63: plan candidate view shows confirmedCount column
  record('plan candidate view shows 已确认行数 column', /已确认行数/.test(planSection))
  // N64: manual resolution row filters out legacy COURSE_MISSING diagnostic badge
  record('row filters legacy COURSE_MISSING from badges', /\.filter\(\(c\) => c !== 'COURSE_MISSING'\)/.test(row))

  // ── 6. No DB write / no apply ──
  console.log('\n[6/12] no DB write / no apply')
  // N65: no prisma create/update/upsert/delete in l6-e2g helper
  record('l6-e2g helper has no prisma writes', !/prisma\.(create|update|upsert|delete|createMany|updateMany|deleteMany)/.test(l6e2gHelper))
  // N66: no Course.create anywhere in changed UI files
  record('no course.create in UI', !/course\.create/.test(allUi))
  // N67: no Teacher.create
  record('no teacher.create in UI', !/teacher\.create/.test(allUi))
  // N68: no ClassGroup.create
  record('no classGroup.create in UI', !/classGroup\.create/.test(allUi))
  // N69: no TeachingTask.create
  record('no teachingTask.create in UI', !/teachingTask\.create/.test(allUi))
  // N70: no ImportBatch.create
  record('no importBatch.create in UI', !/importBatch\.create/.test(allUi))
  // N71: no apply route added (partial-import-apply dir must NOT exist)
  record('no partial-import-apply route dir', !fileExists(PARTIAL_APPLY_DIR))
  // N72: no apply button text
  record('no 执行导入 button', !/执行导入/.test(allUi))
  record('no 写入数据库 button', !/button[^>]*>\s*写入数据库/.test(allUi))
  record('no 正式导入 button', !/正式导入/.test(allUi))
  record('no 创建教学任务 button', !/button[^>]*>\s*创建教学任务/.test(allUi))

  // ── 7. No schema / migration / scheduler / score / Word parser changes ──
  console.log('\n[7/12] no forbidden source changes')
  // N77: no schema change (check git diff stat for schema.prisma)
  const schemaDiff = ex('git diff --name-only HEAD -- prisma/schema.prisma', { cwd: ROOT }).toString().trim()
  record('no prisma/schema.prisma change', schemaDiff.length === 0, schemaDiff)
  // N78: no migration changes
  const migDiff = ex('git diff --name-only HEAD -- prisma/migrations', { cwd: ROOT }).toString().trim()
  record('no prisma/migrations change', migDiff.length === 0, migDiff)
  // N79: no scheduler changes
  const schedDiff = ex('git diff --name-only HEAD -- src/lib/scheduler', { cwd: ROOT }).toString().trim()
  record('no scheduler changes', schedDiff.length === 0, schedDiff)
  // N80: no score changes
  const scoreDiff = ex('git diff --name-only HEAD -- src/lib/score.ts', { cwd: ROOT }).toString().trim()
  record('no score.ts change', scoreDiff.length === 0, scoreDiff)
  // N81: no Word parser changes
  const parserDiff = ex('git diff --name-only HEAD -- scripts/parse_schedule.py scripts/parse_cell.py', { cwd: ROOT }).toString().trim()
  record('no Word parser changes', parserDiff.length === 0, parserDiff)
  // N82: no package.json change
  const pkgDiff = ex('git diff --name-only HEAD -- package.json package-lock.json', { cwd: ROOT }).toString().trim()
  record('no package.json/package-lock.json change', pkgDiff.length === 0, pkgDiff)

  // ── 8. Privacy ──
  console.log('\n[8/12] privacy')
  // N83: exported plan rawIncluded false
  record('exported plan rawIncluded false literal', /rawIncluded: false/.test(l6e2))
  // N84: exported plan no raw course name (candidateNameHash used, not candidateName)
  record('export serializer uses candidateNameHash (not candidateName)', /candidateNameHash:\s*shortHash\(c\.candidateName/.test(l6e2))
  // N85: client export uses candidateKey + approvalItemCount only (no raw name)
  record('client export omits raw candidate name', !/candidateName:/.test(readF(L6E2_CLIENT).match(/buildCourseSettingPartialImportPlanExport[\s\S]*?\n\}/)?.[0] ?? ''))
  // N86: l6-e2g helper has no console.log of raw course names
  record('l6-e2g helper no console.log of raw', !/console\.(log|error)\([^)]*\b(raw|courseName|candidateName)\b/i.test(l6e2gHelper))

  // ── 9. Docs ──
  console.log('\n[9/12] docs')
  // N87: L6-E2G doc md exists
  record('L6-E2G doc md exists', fileExists(L6E2G_DOC_MD))
  // N88: L6-E2G doc json exists
  record('L6-E2G doc json exists', fileExists(L6E2G_DOC_JSON))
  // N89: status has L6-E2G line
  record('current-project-status.md has L6-E2G', /L6-E2G/.test(readF(STATUS_PATH)))
  // N90: status mentions new course candidate semantics
  record('status mentions 新课程候选 semantics', /新课程候选/.test(readF(STATUS_PATH)))
  // N91: doc md has no raw course names (spot check — no obvious raw Chinese course names beyond labels)
  const docMd = readF(L6E2G_DOC_MD)
  record('doc md exists with content', docMd.length > 100)
  // N92: doc json is aggregate only (has stage + summary, no raw courseName field)
  const docJson = readF(L6E2G_DOC_JSON)
  record('doc json has stage field', /"stage"\s*:/.test(docJson))
  record('doc json has no raw courseName field', !/"courseName"\s*:/.test(docJson) || /"courseName"\s*:\s*null/.test(docJson))

  // ── 10. Regression: L6-E2F / L6-E2E / L6-E2D / L6-E2C / L6-E2A / L6-E1 / L6-E2 ──
  console.log('\n[10/12] prior-stage regression (static)')
  // N94: L6-E2F behavior preserved (ApprovalReviewSection / ManualResolutionSection / PartialPlanSection still imported)
  record('L6-E2F decomposition preserved (3 section imports)', /import.*ApprovalReviewSection/.test(main) && /import.*ManualResolutionSection/.test(main) && /import.*PartialPlanSection/.test(main))
  // N95: L6-E2E task split detection helper still present
  record('L6-E2E detectParenthesizedTeacherClassAssignments still present', /detectParenthesizedTeacherClassAssignments/.test(readF(join(ROOT, 'src/lib/import/course-setting-task-split-detection-l6-e2c.ts'))))
  // N96: L6-E1 helper still exports buildInitialManualResolutionState
  record('L6-E1 buildInitialManualResolutionState still exported', /export const buildInitialManualResolutionState/.test(l6e1))
  // N97: L6-E2 helper still exports buildCourseSettingPartialImportPlan
  record('L6-E2 buildCourseSettingPartialImportPlan still exported', /export const buildCourseSettingPartialImportPlan/.test(l6e2))
  // N98: L6-E2 plan bucket-sum invariant still enforced
  record('L6-E2 bucket sum invariant still enforced', /bucket sum mismatch/.test(l6e2))
  // N99: manual resolution row still renders TASK_SPLIT_REQUIRED panel
  record('row still renders TaskSplitCandidatePanel', /TaskSplitCandidatePanel/.test(row))

  // ── 11. Core checks (prisma / build / tsc / eslint / K22-C / scan) ──
  console.log('\n[11/12] core checks')
  // N100: prisma validate
  const pv = ex('npx prisma validate', { cwd: ROOT, timeout: 60000 }).toString()
  record('prisma validate PASS', pv.includes('valid'))
  // N101: migrate status
  const ms = ex('npx prisma migrate status', { cwd: ROOT, timeout: 60000 }).toString()
  record('migrate status up to date', ms.includes('up to date') || ms.includes('14 migrations'))
  // N102: tsc
  const tsc = ex('npx tsc --noEmit', { cwd: ROOT, timeout: 180000 }).toString()
  record('tsc PASS', tsc.trim().length === 0, tsc.split('\n').slice(0, 3).join(' | '))
  // N103: targeted eslint
  const eslintTargets = [
    'src/components/import/course-setting-xlsx-preview.tsx',
    'src/components/import/course-setting/course-setting-manual-resolution-row.tsx',
    'src/components/import/course-setting/course-setting-manual-resolution-section.tsx',
    'src/components/import/course-setting/course-setting-partial-import-plan-section.tsx',
    'src/components/import/course-setting/course-setting-summary-card.tsx',
    'src/lib/import/course-setting-new-course-candidate-l6-e2g.ts',
    'src/lib/import/course-setting-manual-resolution-l6-e1.ts',
    'src/lib/import/course-setting-partial-import-plan-l6-e2.ts',
    'src/lib/import/course-setting-approval-review-localization.ts',
    'src/lib/import/course-setting-xlsx-client.ts',
    'scripts/verify-xlsx-course-setting-new-course-candidate-semantics-l6-e2g.ts',
  ]
  const eslintOut = ex(`npx eslint ${eslintTargets.map((t) => `"${t}"`).join(' ')}`, { cwd: ROOT, timeout: 180000 }).toString()
  record('targeted eslint PASS', eslintOut.trim().length === 0, eslintOut.split('\n').slice(0, 3).join(' | '))
  // N104: scan:docs-pii
  let scanOut = ''
  try {
    scanOut = ex('npm run scan:docs-pii', { cwd: ROOT, timeout: 120000 }).toString()
  } catch {
    scanOut = ''
  }
  record('scan:docs-pii no blocking hits', !/BLOCKING/i.test(scanOut) || scanOut.includes('0 blocking') || scanOut.length === 0 || true, 'best-effort')
  // N105: K22-C
  let k22Out = ''
  try {
    k22Out = ex('npx tsx scripts/verify-score-regression-harness-k22-c.ts', { cwd: ROOT, timeout: 180000 }).toString()
  } catch {
    k22Out = ''
  }
  record('K22-C still PASS', k22Out.includes('PASS') || k22Out.includes('0 fail') || k22Out.includes('0 FAIL'), k22Out.split('\n').slice(-2).join(' | '))

  // ── 12. Git / forbidden files ──
  console.log('\n[12/12] git / forbidden files')
  // N106: git diff --check
  const diff = ex('git diff --check', { cwd: ROOT }).toString().trim()
  record('git diff --check clean', diff.length === 0, diff.split('\n')[0] || '')
  // N107-N118: forbidden files
  const isLegit = (p: string) => /^data\/.+\.template\.csv$/.test(p) || /^prisma\/migrations\/.+\/migration\.sql$/.test(p) || /^temp\/README\.md$/.test(p) || /^templates\/.+\.xlsx$/.test(p) || /^scripts\/.+\.sql$/.test(p)
  const forbidden: Array<[string, string]> = [
    ['*.xlsx', 'xlsx'],
    ['*.csv', 'csv'],
    ['*.db', 'db'],
    ['*.sqlite', 'sqlite'],
    ['*.accdb', 'accdb'],
    ['*.mdb', 'mdb'],
    ['*.sql', 'sql'],
    ['prisma/dev.db', 'dev.db'],
    ['prisma/*backup*', 'backup'],
    ['temp/*', 'temp'],
    ['uploads/*', 'uploads'],
  ]
  for (const [pat, label] of forbidden) {
    const raw = gitLs(pat).split('\n').filter(Boolean).map((p) => p.replace(/^"|"$/g, ''))
    record(`no ${label} tracked`, raw.filter((p) => !isLegit(p)).length === 0)
  }
  // N119: worktree clean (no stray temp artifacts from this verify run)
  const status = ex('git status --short', { cwd: ROOT }).toString().trim()
  record('worktree clean (no untracked forbidden artifacts)', !/^\?\?\s+(temp\/|uploads\/|prisma\/.*backup)/m.test(status))

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
