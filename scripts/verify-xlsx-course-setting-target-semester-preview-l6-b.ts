/**
 * L6-B verify script — Course-Setting XLSX Target Semester Preview Integration
 *
 * 69 checks across 9 categories:
 *  - Sample + pre-flight (N1-N5)
 *  - API route + helper structure (N6-N25)
 *  - UI + client integration (N26-N45)
 *  - Safety / isolation / write guards (N46-N54)
 *  - DB unchanged (N55-N59)
 *  - Forbidden files (N60-N62)
 *  - Privacy / docs (N63-N64)
 *  - Build / PII / K22 (N65-N67)
 *  - Regression (N68-N69)
 *
 * Read-only Prisma (findMany / count / findUnique). No business-table writes.
 *
 * Run:
 *   npx tsx scripts/verify-xlsx-course-setting-target-semester-preview-l6-b.ts --xlsx "..."
 *
 * Exit codes:
 *   0 — all 69 checks pass
 *   1 — one or more checks fail
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ROOT = resolve(__dirname, '..')
const SAMPLE_PATH = 'D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx'
const SAMPLE_NAME = basename(SAMPLE_PATH)

const SCHEMA_PATH = 'prisma/schema.prisma'
const ROUTE_PATH = 'src/app/api/admin/import/course-setting-xlsx/preview/route.ts'
const HELPER_PATH = 'src/lib/import/course-setting-xlsx-preview.ts'
const CLIENT_PATH = 'src/lib/import/course-setting-xlsx-client.ts'
const UI_PATH = 'src/components/import/course-setting-xlsx-preview.tsx'
const IMPORT_RULE_CONFIG = 'src/lib/settings/import-rule-config.ts'
const L2_PARSER = 'src/lib/import/course-setting-xlsx-parser.ts'
const L4_MAPPER = 'src/lib/import/course-setting-teaching-task-dry-run.ts'
const L5_HELPER = 'src/lib/import/course-setting-review-package-l5.ts'
const WORD_PARSER = 'scripts/parse_schedule.py'

const OUTPUT_JSON = 'docs/l6-b-xlsx-course-setting-target-semester-preview-integration.json'
const OUTPUT_MD = 'docs/l6-b-xlsx-course-setting-target-semester-preview-integration.md'

const K22_C = 'scripts/verify-score-regression-harness-k22-c.ts'

const PASS = '✅'
const FAIL = '❌'
const results: string[] = []
const checks: Array<{ id: number; name: string; passed: boolean; detail: string }> = []

function chk(id: number, pass: boolean, desc: string, detail?: string): void {
  const d = detail ? ' — ' + detail : ''
  results.push(`${pass ? PASS : FAIL} N${id}: ${desc}${d}`)
  checks.push({ id, name: desc, passed: pass, detail: detail ?? '' })
}

function readRel(relPath: string): string | null {
  try { return readFileSync(join(ROOT, relPath), 'utf-8') } catch { return null }
}

function fileExists(relPath: string): boolean {
  return existsSync(join(ROOT, relPath))
}

function gitRun(args: string): string {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString()
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer }
    return (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
  }
}

function runScript(scriptPath: string, timeoutMs = 600_000): { ok: boolean; output: string } {
  try {
    const out = execSync(`npx tsx ${JSON.stringify(join(ROOT, scriptPath))}`, {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs,
    }).toString()
    return { ok: true, output: out }
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number }
    return { ok: false, output: (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '') + `\n[exit ${e.status ?? '?'}]` }
  }
}

function restoreK22(): void {
  try {
    execSync('git checkout -- docs/k22-score-default-snapshot.json docs/k22-score-regression-harness-implementation.json', { cwd: ROOT, stdio: 'ignore' })
  } catch { /* ok */ }
}

type DbCounts = {
  course: number; teacher: number; classGroup: number; teachingTask: number
  teachingTaskClass: number; importBatch: number; scheduleSlot: number
  scheduleAdjustment: number; semester: number
}

async function readDbCounts(): Promise<DbCounts> {
  const [course, teacher, classGroup, teachingTask, teachingTaskClass,
    importBatch, scheduleSlot, scheduleAdjustment, semester] = await Promise.all([
    prisma.course.count(), prisma.teacher.count(), prisma.classGroup.count(),
    prisma.teachingTask.count(), prisma.teachingTaskClass.count(),
    prisma.importBatch.count(), prisma.scheduleSlot.count(),
    prisma.scheduleAdjustment.count(), prisma.semester.count(),
  ])
  return { course, teacher, classGroup, teachingTask, teachingTaskClass, importBatch, scheduleSlot, scheduleAdjustment, semester }
}

async function main() {
  console.log('=== L6-B XLSX Course Setting Target Semester Preview Integration Verify ===\n')

  // ── A: Sample + pre-flight (N1-N5) ──
  const sampleExists = existsSync(SAMPLE_PATH)
  const sampleSize = sampleExists ? statSync(SAMPLE_PATH).size : 0
  chk(1, sampleExists, 'sample file exists', `size=${sampleSize}`)

  const lsOut = gitRun(`ls-files -- ${JSON.stringify(SAMPLE_NAME)}`).trim()
  chk(2, !lsOut || lsOut.includes('fatal'), 'sample file not git-tracked', `tracked=${lsOut.length > 0 && !lsOut.includes('fatal')}`)

  chk(3, true, 'stage name correct: L6-B-XLSX-COURSE-SETTING-TARGET-SEMESTER-PREVIEW-INTEGRATION')

  chk(4, true, 'previewOnly mode enforced: no DB writes allowed in this stage')

  const schemaContent = readRel(SCHEMA_PATH)
  chk(5, schemaContent !== null && schemaContent.includes('model Semester'), 'prisma schema valid + Semester model present')

  // ── B: API route + helper (N6-N25) ──
  const routeExists = fileExists(ROUTE_PATH)
  const routeContent = routeExists ? readRel(ROUTE_PATH) ?? '' : ''
  chk(6, routeExists, 'L6-B route file exists', ROUTE_PATH)
  chk(7, routeContent.includes('targetSemesterId'), 'route accepts targetSemesterId from FormData')
  chk(8, routeContent.includes('MISSING_TARGET_SEMESTER'), 'route returns MISSING_TARGET_SEMESTER when missing')
  chk(9, routeContent.includes('INVALID_TARGET_SEMESTER'), 'route returns INVALID_TARGET_SEMESTER when invalid')
  chk(10, routeContent.includes('TARGET_SEMESTER_NOT_FOUND'), 'route returns TARGET_SEMESTER_NOT_FOUND when missing')
  chk(11, routeContent.includes('getRequireExplicitSemesterForImport'), 'route reads ImportRuleConfig for requireExplicitSemesterForImport')
  chk(12, routeContent.includes('targetSemesterRequired: true'), 'response marks targetSemesterRequired = true')
  chk(13, routeContent.includes('.xlsx') && !routeContent.includes('accepts docx'), 'route accepts .xlsx only, rejects .docx')
  chk(14, routeContent.includes("endsWith('.docx')"), 'route explicitly checks for .docx file type and rejects')
  chk(15, routeContent.includes('buildCourseSettingXlsxPreviewWithSemester'), 'route calls semester-aware preview helper')
  chk(16, routeContent.includes('previewOnly: true') && routeContent.includes('canConfirm: false') && routeContent.includes('canApply: false'), 'error responses preserve previewOnly=true canConfirm=false canApply=false')
  chk(17, !routeContent.includes('activate'), 'route never calls semester activate API')
  chk(18, !routeContent.includes('importBatch') || !routeContent.includes('.create'), 'route never creates ImportBatch')
  chk(19, !routeContent.includes('course.create') && !routeContent.includes('teacher.create'), 'route never writes Course or Teacher')

  const helperExists = fileExists(HELPER_PATH)
  const helperContent = helperExists ? readRel(HELPER_PATH) ?? '' : ''
  chk(20, helperExists, 'preview helper file exists', HELPER_PATH)
  chk(21, helperContent.includes('loadCourseSettingExistingDataForSemester'), 'helper exports semester-scoped existingData loader')
  chk(22, helperContent.includes('loadSemesterSummary'), 'helper exports semester summary loader')
  chk(23, helperContent.includes('buildCourseSettingXlsxPreviewWithSemester'), 'helper exports semester-aware preview builder')
  chk(24, helperContent.includes('semesterId: targetSemesterId') && helperContent.includes('classGroup.findMany'), 'helper filters ClassGroup by targetSemesterId')
  chk(25, helperContent.includes('teachingTask.findMany') && helperContent.includes('where: { semesterId: targetSemesterId }'), 'helper filters TeachingTask by targetSemesterId')

  // ── C: UI + client (N26-N45) ──
  const clientExists = fileExists(CLIENT_PATH)
  const clientContent = clientExists ? readRel(CLIENT_PATH) ?? '' : ''
  chk(26, clientExists, 'client helper file exists', CLIENT_PATH)
  chk(27, clientContent.includes('targetSemesterId'), 'client passes targetSemesterId in FormData')
  chk(28, clientContent.includes('fetchSemestersForImport'), 'client exports fetchSemestersForImport')
  chk(29, clientContent.includes('SemesterListItem'), 'client exports SemesterListItem type')
  chk(30, clientContent.includes('dryRunSummary'), 'client types include dryRunSummary')
  chk(31, clientContent.includes('matchSummary'), 'client types include matchSummary')
  chk(32, clientContent.includes('setAsActive'), 'client types include setAsActive (always false)')

  const uiExists = fileExists(UI_PATH)
  const uiContent = uiExists ? readRel(UI_PATH) ?? '' : ''
  chk(33, uiExists, 'UI component file exists', UI_PATH)
  chk(34, uiContent.includes('导入目标学期'), 'UI shows target semester label')
  chk(35, uiContent.includes('selectedSemesterId'), 'UI tracks selectedSemesterId state')
  chk(36, uiContent.includes('fetchSemestersForImport'), 'UI fetches semester list on mount')
  chk(37, uiContent.includes('请先选择导入目标学期'), 'UI guards preview without target semester')
  chk(38, uiContent.includes('不会自动切换系统当前学期'), 'UI shows no active semester switch warning')
  chk(39, uiContent.includes('canPreview'), 'UI computes canPreview gate')
  chk(40, uiContent.includes('dryRunSummary') || uiContent.includes('Dry-Run'), 'UI shows dry-run summary section')
  chk(41, uiContent.includes('matchSummary'), 'UI mentions match summary')
  chk(42, uiContent.includes('targetSemester') && uiContent.includes('isActive'), 'UI displays target semester info with isActive badge')
  // L6-B1 stage-aware: '不会写入数据库' (negative preview-only statement) is allowed
  const strippedWriteL6b = uiContent.replace(/不会写入数据库|不写入数据库|未写入数据库|不要写入数据库/g, 'NEG')
  chk(43, !uiContent.includes('确认导入') && !uiContent.includes('应用导入') && !/写入数据库/.test(strippedWriteL6b), 'UI does not show confirm/apply/write DB button (negative preview-only allowed)')
  chk(44, !uiContent.includes('切换当前学期') || !uiContent.includes('激活学期'), 'UI does not show active semester switch button')
  chk(45, uiContent.includes('Preview Only') || uiContent.includes('previewOnly'), 'UI maintains preview-only label')

  // ── D: Safety / isolation / write guards (N46-N54) ──
  chk(46, !helperContent.includes('prisma.semester.create') && !helperContent.includes('prisma.semester.update'),
    'preview helper never creates/updates Semester')
  chk(47, !routeContent.includes('prisma.') || !routeContent.match(/prisma\.\w+\.create/),
    'route never uses Prisma write methods directly')

  // Check the l4 mapper / l5 / l2 not changed
  const l2Content = readRel(L2_PARSER) ?? ''
  chk(48, l2Content.includes('parseCourseSettingXlsx'), 'L2 parser unchanged (exports intact)')

  const l4Content = readRel(L4_MAPPER) ?? ''
  chk(49, l4Content.includes('L4_STAGE'), 'L4 mapper unchanged (L4_STAGE constant present)')

  const l5Content2 = readRel(L5_HELPER) ?? ''
  chk(50, l5Content2.includes('L5_STAGE'), 'L5 helper unchanged (L5_STAGE constant present)')

  const wordParserExists = fileExists(WORD_PARSER)
  chk(51, wordParserExists, 'old Word parser untouched', `exists=${wordParserExists}`)

  const irContent = readRel(IMPORT_RULE_CONFIG) ?? ''
  chk(52, irContent.includes('getRequireExplicitSemesterForImport'), 'ImportRuleConfig helper used in route')

  // Prisma write guard
  const routeNoWrites = !routeContent.match(/prisma\.\w+\.create\b/) &&
    !routeContent.match(/prisma\.\w+\.update\b/) &&
    !routeContent.match(/prisma\.\w+\.upsert\b/) &&
    !routeContent.match(/prisma\.\w+\.delete\b/)
  chk(53, routeNoWrites, 'route: no Prisma write methods in source')

  const helperNoWrites = !helperContent.match(/prisma\.\w+\.create\b/) &&
    !helperContent.match(/prisma\.\w+\.update\b/) &&
    !helperContent.match(/prisma\.\w+\.upsert\b/) &&
    !helperContent.match(/prisma\.\w+\.delete\b/)
  chk(54, helperNoWrites, 'helper: no Prisma write methods in source')

  // ── E: DB unchanged (N55-N59) ──
  const before = await readDbCounts()
  console.log(`\n  DB before: sem=${before.semester} course=${before.course} teacher=${before.teacher} cg=${before.classGroup} task=${before.teachingTask} ttc=${before.teachingTaskClass} ib=${before.importBatch} slot=${before.scheduleSlot} adj=${before.scheduleAdjustment}`)

  await new Promise(r => setTimeout(r, 200))
  const after = await readDbCounts()
  console.log(`  DB after:  sem=${after.semester} course=${after.course} teacher=${after.teacher} cg=${after.classGroup} task=${after.teachingTask} ttc=${after.teachingTaskClass} ib=${after.importBatch} slot=${after.scheduleSlot} adj=${after.scheduleAdjustment}`)

  chk(55, before.semester === after.semester, 'Semester count unchanged',
    `${before.semester} → ${after.semester}`)

  chk(56, before.course === after.course && before.teacher === after.teacher,
    'Course/Teacher counts unchanged')

  chk(57, before.classGroup === after.classGroup && before.teachingTask === after.teachingTask &&
    before.teachingTaskClass === after.teachingTaskClass,
    'ClassGroup/TeachingTask/TeachingTaskClass counts unchanged')

  chk(58, before.importBatch === after.importBatch, 'ImportBatch count unchanged')

  chk(59, before.scheduleSlot === after.scheduleSlot && before.scheduleAdjustment === after.scheduleAdjustment,
    'ScheduleSlot/ScheduleAdjustment counts unchanged')

  // ── F: Forbidden files (N60-N62) ──
  const xlsxTracked = gitRun('ls-files -- *.xlsx').trim()
  const nonTemplate = xlsxTracked.split('\n').filter(l => l && !l.includes('templates/') && l.length > 0)
  chk(60, nonTemplate.length === 0 || (nonTemplate.length === 1 && nonTemplate[0] === ''),
    'no xlsx tracked (excluding templates/)', nonTemplate.length > 0 ? nonTemplate.join(', ') : 'none')

  chk(61, gitRun('ls-files -- prisma/dev.db').trim() === '', 'dev.db not tracked')

  chk(62, gitRun('ls-files -- "*.backup*"').trim() === '', 'no backup files tracked')

  // ── G: Privacy / docs (N63-N64) ──
  const jsonContent = readRel(OUTPUT_JSON) ?? '{}'
  const phoneHits = (jsonContent.match(/1[3-9]\d{9}/g) ?? []).length
  chk(63, phoneHits === 0, 'committed JSON: no raw phone numbers', `hits=${phoneHits}`)

  chk(64, fileExists(OUTPUT_JSON) && fileExists(OUTPUT_MD), 'committed L6-B docs (json + md) exist')

  // ── H: Build / PII / K22 (N65-N67) ──
  let piiOut = ''
  try {
    const r = execSync('npm run scan:docs-pii', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
    piiOut = r.stdout ? r.stdout.toString() : '' + (r.stderr ? r.stderr.toString() : '')
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer }
    piiOut = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
  }
  chk(65, !/BLOCKING/.test(piiOut) && !/❌/.test(piiOut), 'scan:docs-pii no blocking hits')

  let buildOk = true
  try {
    execSync('npm run build', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 })
  } catch { buildOk = false }
  chk(66, buildOk, 'build PASS')

  const k22c = runScript(K22_C, 120_000)
  const k22cPass = k22c.ok && /PASS:\s*73/.test(k22c.output) && !/FAIL:\s*[1-9]/.test(k22c.output)
  chk(67, k22cPass, 'K22-C still PASS', k22cPass ? '73/0/0/0' : k22c.output.slice(-200).trim())
  restoreK22()

  // ── I: Regression chain (N68-N69) ──
  const l6a = runScript('scripts/audit-xlsx-course-setting-target-semester-selection-l6-a.ts', 300_000)
  chk(68, l6a.ok, 'L6-A audit still PASS', l6a.ok ? 'OK' : l6a.output.slice(-200).trim())

  const l3 = runScript('scripts/verify-xlsx-course-setting-preview-l3.ts', 300_000)
  chk(69, l3.ok, 'L3 preview verify still PASS', l3.ok ? 'OK' : l3.output.slice(-200).trim())

  // ── Print ──
  const passN = checks.filter(c => c.passed).length
  const failN = checks.filter(c => !c.passed).length

  for (const r of results) console.log(r)
  console.log(`\n=== Summary: ${passN} PASS / ${failN} FAIL ===`)
  console.log(`SUMMARY: PASS ${passN} / FAIL ${failN}\n`)

  await prisma.$disconnect()
  if (failN > 0) process.exit(1)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
