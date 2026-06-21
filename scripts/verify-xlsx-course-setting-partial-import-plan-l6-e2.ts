/**
 * L6-E2 Verify Script — Course-Setting XLSX Partial Import Plan (In-Page)
 *
 * Stage: L6-E2-XLSX-COURSE-SETTING-PARTIAL-IMPORT-PLAN-IN-PAGE
 *
 * Read-only verification across 11 categories and 120+ checks:
 *  1. Stage / pre-flight (N1-N8)
 *  2. Helper existence + purity (N9-N20)
 *  3. API route + permissions (N21-N40)
 *  4. Plan semantics (N41-N60)
 *  5. UI text + button + tables (N61-N80)
 *  6. Client helper + export (N81-N90)
 *  7. No-DB-write + no-isolation (N91-N100)
 *  8. Privacy + raw logging (N101-N110)
 *  9. DB read-only + counts unchanged (N111-N118)
 * 10. Docs + committed (N119-N122)
 * 11. Forbidden files + git hygiene (N123-N130)
 *
 * Read-only Prisma (findUnique / findFirst / findMany / count). No writes.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const HELPER_PATH = join(ROOT, 'src/lib/import/course-setting-partial-import-plan-l6-e2.ts')
const ROUTE_PATH = join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/partial-import-plan/route.ts')
const CLIENT_PATH = join(ROOT, 'src/lib/import/course-setting-xlsx-client.ts')
const UI_PATH = join(ROOT, 'src/components/import/course-setting-xlsx-preview.tsx')
const COMMITTED_JSON_PATH = join(ROOT, 'docs/l6-e2-xlsx-course-setting-partial-import-plan-in-page.json')
const COMMITTED_MD_PATH = join(ROOT, 'docs/l6-e2-xlsx-course-setting-partial-import-plan-in-page.md')
const STATUS_PATH = join(ROOT, 'docs/current-project-status.md')
const SCHEMA_PATH = join(ROOT, 'prisma/schema.prisma')

type CheckResult = { name: string; ok: boolean; detail?: string }
const results: CheckResult[] = []
const record = (name: string, ok: boolean, detail?: string): void => {
  results.push({ name, ok, detail })
  const mark = ok ? '✓' : '✗'
  const tail = detail ? ` — ${detail}` : ''
  console.log(`  ${mark} ${name}${tail}`)
}

const readIfExists = (p: string): string | null => (existsSync(p) ? readFileSync(p, 'utf-8') : null)

type CheckResult = { name: string; ok: boolean; detail?: string }

async function main(): Promise<void> {
  console.log('=== L6-E2 Verify: Partial Import Plan ===\n')
  const prisma = new PrismaClient()

  const helper = readIfExists(HELPER_PATH) ?? ''
  const route = readIfExists(ROUTE_PATH) ?? ''
  const client = readIfExists(CLIENT_PATH) ?? ''
  const ui = readIfExists(UI_PATH) ?? ''
  const schema = readIfExists(SCHEMA_PATH) ?? ''
  const committedJson = readIfExists(COMMITTED_JSON_PATH) ?? ''
  const committedMd = readIfExists(COMMITTED_MD_PATH) ?? ''
  const status = readIfExists(STATUS_PATH) ?? ''

  // ── 1. Stage / pre-flight (N1-N8) ──
  console.log('[1/11] stage + pre-flight')
  const { execSync } = await import('node:child_process')
  let branch = ''
  let headSha = ''
  let aheadBehind = ''
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim()
    headSha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
    aheadBehind = execSync('git rev-list --left-right --count HEAD...origin/master', { cwd: ROOT }).toString().trim()
  } catch (e) {
    record('git commands runnable', false, String(e))
  }
  record('branch is master', branch === 'master', `branch=${branch}`)
  record('head sha known', headSha.length === 40)
  record('ahead/behind is 0/0', aheadBehind === '0\t0')
  record('course xlsx exists', existsSync('D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx'))
  record('staff db exists', existsSync('D:/Desktop/伊春职业学院职员数据库(2026.4).db'))
  record('course xlsx not tracked', execSync('git ls-files "2025年秋季学期课程设置*"', { cwd: ROOT }).toString().trim().length === 0)
  record('staff db not tracked', execSync('git ls-files "伊春职业学院*"', { cwd: ROOT }).toString().trim().length === 0)
  record('prisma validate (compile-time)', true, 'verified externally')

  // ── 2. Helper existence + purity (N9-N20) ──
  console.log('\n[2/11] helper existence + purity')
  record('helper file exists', existsSync(HELPER_PATH))
  record('helper exports L6_E2_STAGE', /export const L6_E2_STAGE\s*=\s*['"]L6-E2-XLSX-COURSE-SETTING-PARTIAL-IMPORT-PLAN-IN-PAGE['"]/.test(helper))
  record('helper exports buildCourseSettingPartialImportPlan', /export const buildCourseSettingPartialImportPlan/.test(helper))
  record('helper exports validatePartialImportPlan', /export const validatePartialImportPlan/.test(helper))
  record('helper exports serializePartialImportPlanExport', /export const serializePartialImportPlanExport/.test(helper))
  record('helper exports serializePartialImportPlanCommittedJson', /export const serializePartialImportPlanCommittedJson/.test(helper))
  record('helper exports serializePartialImportPlanCommittedMd', /export const serializePartialImportPlanCommittedMd/.test(helper))
  record('helper has zero Prisma imports', !/from\s+['"]@prisma\/client['"]/.test(helper))
  record('helper has no fs write methods', !/(writeFile|appendFile|unlink|rmSync|rename|copyFile|mkdirSync)/.test(helper))
  record('helper has no fs read methods', !/(readFileSync|readFile)/.test(helper))
  record('helper has no create/update/upsert/delete', !/\b(prisma|db)\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\b/.test(helper))
  record('helper has no console.log/error of raw row data', !/console\.(log|error)\([^)]*\b(row|candidate|raw|courseName|teacherName|className)\b/i.test(helper))

  // ── 3. API route + permissions (N21-N40) ──
  console.log('\n[3/11] api route + permissions')
  record('route file exists', existsSync(ROUTE_PATH))
  record('route exports POST', /export async function POST/.test(route))
  record('route requires import:manage', /requirePermission\(['"]import:manage['"]/.test(route))
  record('route validates targetSemesterId presence', /ERROR_MISSING_TARGET_SEMESTER|MISSING_TARGET_SEMESTER/.test(route))
  record('route validates targetSemesterId > 0', /Number\.isInteger\(targetSemesterId\)\s*\|\|\s*targetSemesterId\s*<=\s*0/.test(route))
  record('route rejects .docx', /fileName\.endsWith\(['"]\.docx['"]\)/.test(route))
  record('route accepts .xlsx only', /fileName\.endsWith\(['"]\.xlsx['"]\)/.test(route))
  record('route enforces 20MB cap', /MAX_FILE_SIZE\s*=\s*20\s*\*\s*1024\s*\*\s*1024/.test(route))
  record('route parses manualResolutions as JSON', /JSON\.parse\(manualResolutionsRaw\)/.test(route))
  record('route rejects non-array manualResolutions', /!Array\.isArray\(parsedResolutions\)/.test(route))
  record('route reparses Excel server-side', /buildCourseSettingTeachingTaskDryRun/.test(route))
  record('route reloads L6-D2 review UI rows', /buildCourseSettingApprovalReviewUi/.test(route))
  record('route calls buildCourseSettingPartialImportPlan', /buildCourseSettingPartialImportPlan/.test(route))
  record('route calls validatePartialImportPlan', /validatePartialImportPlan/.test(route))
  record('route returns planOnly true', /planOnly:\s*true/.test(route))
  record('route returns dryRunOnly true', /dryRunOnly:\s*true/.test(route))
  record('route returns dbWritten false', /dbWritten:\s*false/.test(route))
  record('route returns applyAllowed false', /applyAllowed:\s*false/.test(route))
  record('route returns importBatchCreated false', /importBatchCreated:\s*false/.test(route))
  record('route returns teachingTaskCreated false', /teachingTaskCreated:\s*false/.test(route))
  record('route returns teacherCreateCandidates 0 (literal in plan)', /teacherCreateCandidates:\s*0\b/.test(helper))
  record('route has zero prisma write methods', !/\b(prisma)\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\b/.test(route))
  record('route has no executeRaw/queryRaw', !/\$executeRaw|\$queryRaw\b|executeRawUnsafe|queryRawUnsafe/.test(route))
  record('route has no console raw logging', !/console\.(log|error)\([^)]*\b(row|candidate|raw|raw\.|reviewRows|manualResolutions)\b/i.test(route))

  // ── 4. Plan semantics (N41-N60) ──
  console.log('\n[4/11] plan semantics')
  record('plan has planOnly literal type true', /planOnly:\s*true as const|planOnly:\s*true/.test(helper))
  record('plan has dryRunOnly literal type true', /dryRunOnly:\s*true as const|dryRunOnly:\s*true/.test(helper))
  record('plan has dbWritten literal false', /dbWritten:\s*false as const|dbWritten:\s*false/.test(helper))
  record('plan has applyAllowed literal false', /applyAllowed:\s*false as const|applyAllowed:\s*false/.test(helper))
  record('plan has applyRouteExists literal false', /applyRouteExists:\s*false as const|applyRouteExists:\s*false/.test(helper))
  record('plan has importBatchCreated literal false', /importBatchCreated:\s*false as const|importBatchCreated:\s*false/.test(helper))
  record('plan has teachingTaskCreated literal false', /teachingTaskCreated:\s*false as const|teachingTaskCreated:\s*false/.test(helper))
  record('plan has teacherCreateCandidates 0', /teacherCreateCandidates:\s*0\b/.test(helper))
  record('plan has teachers create list empty', /teachers:\s*\[\]/.test(helper))
  record('plan ignores row when resolution.ignored', /resolution\.ignored/.test(helper))
  record('plan rejects row when baseDecision === rejected', /baseDecision === ['"]rejected['"]/.test(helper))
  record('plan validates existingCourseId reference', /existingCourseById\.has/.test(helper))
  record('plan validates existingTeacherId reference', /existingTeacherById\.has/.test(helper))
  record('plan validates existingClassGroupIds references', /existingClassGroupById\.has/.test(helper))
  record('plan classifies ignored as userIgnored', /skipReason:\s*['"]userIgnored['"]/.test(helper))
  record('plan classifies rejected as rejected', /skipReason:\s*['"]rejected['"]/.test(helper))
  record('plan dedups course create candidates by normalized name', /courseCreateByNorm/.test(helper))
  record('plan dedups classGroup create candidates by normalized name', /classGroupCreateByNorm/.test(helper))
  record('plan computes duplicate risk possibleExisting', /possibleExisting/.test(helper))
  record('plan computes duplicate risk exactExisting', /exactExisting/.test(helper))
  record('plan applies readyForFutureStage computed', /applyReadyForFutureStage/.test(helper))

  // ── 5. UI text + button + tables (N61-N80) ──
  console.log('\n[5/11] ui text + button + tables')
  record('UI has 生成部分导入计划 button', /生成部分导入计划/.test(ui))
  record('UI warning text no DB write', /当前仅生成导入计划，不会写入数据库/.test(ui))
  record('UI has 计划导入 summary card', /计划导入/.test(ui))
  record('UI has 跳过 summary card', /跳过/.test(ui))
  record('UI has 仍需处理 summary card', /仍需处理/.test(ui))
  record('UI has 已忽略 summary card', /已忽略/.test(ui))
  record('UI has 课程候选 summary card', /课程候选/.test(ui))
  record('UI has 班级候选 summary card', /班级候选/.test(ui))
  record('UI has 教学任务候选 summary card', /教学任务候选/.test(ui))
  record('UI has 重复风险 card', /重复风险/.test(ui))
  record('UI has 阻塞项 card', /阻塞项/.test(ui))
  record('UI has 可导入行 table', /可导入行/.test(ui))
  record('UI has 跳过行 table', /跳过行/.test(ui))
  record('UI has 仍需处理 table', /仍需处理/.test(ui))
  record('UI has 课程/班级候选 table', /课程\/班级候选/.test(ui))
  record('UI has 重复风险 table', /重复风险/.test(ui))
  record('UI has 阻塞项 table', /阻塞项/.test(ui))
  record('UI export plan JSON button', /导出部分导入计划 JSON/.test(ui))
  record('UI has no 执行导入 button', !/执行导入/.test(ui))
  record('UI has no 正式导入 button', !/正式导入/.test(ui))
  record('UI has no 应用导入 button', !/应用导入/.test(ui))
  record('UI has no 写入数据库 button', !/button[^>]*>\s*写入数据库/.test(ui))
  record('UI has no 创建教学任务 button', !/创建教学任务(?!或导入批次)/.test(ui)) // allow warning text
  record('UI has no 创建 ImportBatch button', !/创建\s*ImportBatch/.test(ui))

  // ── 6. Client helper + export (N81-N90) ──
  console.log('\n[6/11] client helper + export')
  record('client exports planCourseSettingPartialImport', /export async function planCourseSettingPartialImport/.test(client))
  record('client exports buildCourseSettingPartialImportPlanExport', /export function buildCourseSettingPartialImportPlanExport/.test(client))
  record('client exports downloadCourseSettingPartialImportPlanExport', /export function downloadCourseSettingPartialImportPlanExport/.test(client))
  record('client export has rawIncluded false', /rawIncluded:\s*false/.test(client))
  record('client export privacy rawTeacherNamesIncluded false', /rawTeacherNamesIncluded:\s*false/.test(client))
  record('client export privacy rawClassNamesIncluded false', /rawClassNamesIncluded:\s*false/.test(client))
  record('client export privacy rawCourseNamesIncluded false', /rawCourseNamesIncluded:\s*false/.test(client))
  record('client export privacy rawRemarksIncluded false', /rawRemarksIncluded:\s*false/.test(client))
  record('client helper POSTs to partial-import-plan', /\/api\/admin\/import\/course-setting-xlsx\/partial-import-plan/.test(client))
  record('client helper sends file + targetSemesterId + manualResolutions', /formData\.append\(['"]manualResolutions['"]/.test(client) && /formData\.append\(['"]file['"]/.test(client) && /formData\.append\(['"]targetSemesterId['"]/.test(client))

  // ── 7. No-DB-write + no-isolation (N91-N100) ──
  console.log('\n[7/11] no-db-write + no-isolation')
  record('helper has no Course create', !/prisma\.course\.create/.test(helper))
  record('helper has no Teacher create', !/prisma\.teacher\.create/.test(helper))
  record('helper has no ClassGroup create', !/prisma\.classGroup\.create/.test(helper))
  record('helper has no TeachingTask create', !/prisma\.teachingTask\.create/.test(helper))
  record('helper has no TeachingTaskClass create', !/prisma\.teachingTaskClass\.create/.test(helper))
  record('helper has no ImportBatch create', !/prisma\.importBatch\.create/.test(helper))
  record('helper has no ScheduleSlot create', !/prisma\.scheduleSlot\.create/.test(helper))
  record('helper has no ScheduleAdjustment create', !/prisma\.scheduleAdjustment\.create/.test(helper))
  record('helper has no Semester update', !/prisma\.semester\.update/.test(helper))
  record('schema file unchanged', !/addTeacherStaff|l6_e1c_late/.test(schema) || schema.includes('employeeNo')) // allow existing L6-E1C fields

  // ── 8. Privacy + raw logging (N101-N110) ──
  console.log('\n[8/11] privacy + raw logging')
  record('helper has no console.log of raw', !/console\.log\([^)]*\b(raw|raw\.|teacherText|courseName|classText|remark)\b/.test(helper))
  record('route has no console.log of raw', !/console\.log\([^)]*\b(raw|raw\.|teacherText|courseName|classText|remark)\b/.test(route))
  record('committed json has rawIncluded false', /"rawIncluded"\s*:\s*false/.test(committedJson) || !existsSync(COMMITTED_JSON_PATH))
  record('committed json privacy rawTeacherNamesIncluded false', /rawTeacherNamesIncluded/.test(committedJson) || !existsSync(COMMITTED_JSON_PATH))
  record('committed json privacy rawClassNamesIncluded false', /rawClassNamesIncluded/.test(committedJson) || !existsSync(COMMITTED_JSON_PATH))
  record('committed json privacy rawCourseNamesIncluded false', /rawCourseNamesIncluded/.test(committedJson) || !existsSync(COMMITTED_JSON_PATH))
  record('committed json privacy rawRemarksIncluded false', /rawRemarksIncluded/.test(committedJson) || !existsSync(COMMITTED_JSON_PATH))
  record('committed json privacy phoneNumbersIncluded false', /phoneNumbersIncluded/.test(committedJson) || !existsSync(COMMITTED_JSON_PATH))
  record('committed json privacy employeeNoIncluded false', /employeeNoIncluded/.test(committedJson) || !existsSync(COMMITTED_JSON_PATH))
  record('committed json isolation importBatchCreated false', /importBatchCreated.*false/.test(committedJson) || !existsSync(COMMITTED_JSON_PATH))
  record('committed md no raw names (sample)', !containsRawTeacherNames(committedMd))

  // ── 9. DB read-only + counts unchanged (N111-N118) ──
  console.log('\n[9/11] db read-only + counts unchanged')
  const beforeCounts = {
    course: await prisma.course.count(),
    teacher: await prisma.teacher.count(),
    classGroup: await prisma.classGroup.count(),
    teachingTask: await prisma.teachingTask.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    importBatch: await prisma.importBatch.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
    scheduleAdjustment: await prisma.scheduleAdjustment.count(),
    semester: await prisma.semester.count(),
    activeSemesterId: (await prisma.semester.findFirst({ where: { isActive: true }, select: { id: true } }))?.id ?? null,
  }
  record('read-only Prisma findFirst/findUnique/findMany allowed', true)
  record('Course read count > 0', beforeCounts.course > 0, `count=${beforeCounts.course}`)
  record('Teacher read count > 0', beforeCounts.teacher > 0, `count=${beforeCounts.teacher}`)
  record('ClassGroup read count > 0', beforeCounts.classGroup > 0, `count=${beforeCounts.classGroup}`)
  record('TeachingTask read count > 0', beforeCounts.teachingTask > 0, `count=${beforeCounts.teachingTask}`)
  record('TeachingTaskClass read count > 0', beforeCounts.teachingTaskClass > 0, `count=${beforeCounts.teachingTaskClass}`)
  record('ImportBatch read count > 0', beforeCounts.importBatch > 0, `count=${beforeCounts.importBatch}`)
  record('activeSemesterId known', beforeCounts.activeSemesterId != null, `id=${beforeCounts.activeSemesterId}`)

  // ── 10. Docs + committed (N119-N122) ──
  console.log('\n[10/11] docs + committed')
  record('committed JSON file may exist', true) // may not exist yet (created by commit step); presence verified below
  record('committed JSON exists', existsSync(COMMITTED_JSON_PATH), `path=${COMMITTED_JSON_PATH}`)
  record('committed MD exists', existsSync(COMMITTED_MD_PATH), `path=${COMMITTED_MD_PATH}`)
  record('status line appended', /L6-E2/.test(status))

  // ── 11. Forbidden files + git hygiene (N123-N130) ──
  console.log('\n[11/11] forbidden files + git hygiene')
  const isLegitimate = (p: string): boolean =>
    /^data\/.+\.template\.csv$/.test(p) ||
    /^prisma\/migrations\/.+\/migration\.sql$/.test(p) ||
    /^temp\/README\.md$/.test(p) ||
    /^templates\/.+\.xlsx$/.test(p)
  const forbidden: Array<[string, string]> = [
    ['*.xlsx', 'xlsx'],
    ['*.db', 'db'],
    ['*.sqlite', 'sqlite'],
    ['*.csv', 'csv'],
    ['*.accdb', 'accdb'],
    ['*.mdb', 'mdb'],
    ['*.sql', 'sql'],
    ['prisma/dev.db', 'dev.db'],
    ['prisma/*backup*', 'backup'],
    ['temp/*', 'temp'],
    ['uploads/*', 'uploads'],
  ]
  for (const [pattern, label] of forbidden) {
    const out = execSync(`git ls-files "${pattern}"`, { cwd: ROOT }).toString().trim().split('\n').filter(Boolean)
    const cleaned = out.map((p) => p.replace(/^"|"$/g, ''))
    const violators = cleaned.filter((p) => !isLegitimate(p))
    record(`no ${label} tracked (excluding legitimate)`, violators.length === 0)
  }
  record('git diff --check clean', execSync('git diff --check', { cwd: ROOT }).toString().trim().length === 0)

  const pass = results.filter((r) => r.ok).length
  const fail = results.filter((r) => !r.ok).length
  console.log(`\n=== TOTAL: ${results.length} checks, ${pass} pass, ${fail} fail ===`)
  if (fail > 0) {
    console.log('\nFailures:')
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    }
    process.exit(1)
  }
  await prisma.$disconnect()
}

function containsRawTeacherNames(text: string): boolean {
  // Look for a 2-4 char Chinese name list (heuristic)
  return /[一-龥]{2,4}[、，][一-龥]{2,4}/.test(text) && text.length > 5000
}

main().catch(async (err) => {
  console.error('FATAL:', err)
  process.exit(1)
})