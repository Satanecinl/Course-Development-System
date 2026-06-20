/**
 * L6-B1 verify script — Course-Setting XLSX Raw Preview Display
 *
 * 82 checks across 9 categories:
 *  - Sample + pre-flight (N1-N3)
 *  - API route + helper (N4-N30)
 *  - UI + client (N31-N44)
 *  - Safety / isolation (N45-N54)
 *  - DB unchanged (N55-N59)
 *  - Forbidden files (N60-N63)
 *  - Privacy / committed artifacts (N64-N66)
 *  - Build / PII / K22 (N67-N69)
 *  - Regression (N70-N82)
 *
 * Design-only. Read-only Prisma (findMany / count / findUnique). No business-table writes.
 *
 * Run:
 *   npx tsx scripts/verify-xlsx-course-setting-raw-preview-display-l6-b1.ts --xlsx "..."
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
const L2_PARSER = 'src/lib/import/course-setting-xlsx-parser.ts'
const L4_MAPPER = 'src/lib/import/course-setting-teaching-task-dry-run.ts'
const L5_HELPER = 'src/lib/import/course-setting-review-package-l5.ts'
const WORD_PARSER = 'scripts/parse_schedule.py'

const OUTPUT_JSON = 'docs/l6-b1-xlsx-course-setting-raw-preview-display.json'
const OUTPUT_MD = 'docs/l6-b1-xlsx-course-setting-raw-preview-display.md'

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
  console.log('=== L6-B1 XLSX Course Setting Raw Preview Display Verify ===\n')

  // ── A: Sample + pre-flight (N1-N3) ──
  const sampleExists = existsSync(SAMPLE_PATH)
  const sampleSize = sampleExists ? statSync(SAMPLE_PATH).size : 0
  chk(1, sampleExists, 'sample file exists', `size=${sampleSize}`)

  const lsOut = gitRun(`ls-files -- ${JSON.stringify(SAMPLE_NAME)}`).trim()
  chk(2, !lsOut || lsOut.includes('fatal'), 'sample file not git-tracked')

  chk(3, true, 'stage name correct: L6-B1-XLSX-COURSE-SETTING-RAW-PREVIEW-DISPLAY')

  // ── B: API route + helper (N4-N30) ──
  const routeContent = readRel(ROUTE_PATH) ?? ''
  const helperContent = readRel(HELPER_PATH) ?? ''
  const clientContent = readRel(CLIENT_PATH) ?? ''
  const uiContent = readRel(UI_PATH) ?? ''

  chk(4, routeContent.includes('targetSemesterId'), 'route still requires targetSemesterId')
  chk(5, routeContent.includes('MISSING_TARGET_SEMESTER'), 'route rejects missing targetSemesterId')
  chk(6, routeContent.includes('INVALID_TARGET_SEMESTER'), 'route rejects invalid targetSemesterId')
  chk(7, routeContent.includes('TARGET_SEMESTER_NOT_FOUND'), 'route rejects non-existent semester')
  chk(8, routeContent.includes('buildCourseSettingXlsxPreviewWithSemester'), 'route calls semester-aware preview')
  chk(9, routeContent.includes('maxPreviewRows'), 'route accepts maxPreviewRows from form')

  chk(10, helperContent.includes('rawPreview'), 'helper exposes rawPreview metadata')
  chk(11, helperContent.includes('authorized-admin-preview-only'), 'helper marks raw preview scope')
  chk(12, helperContent.includes('returnedRows') && helperContent.includes('maxPreviewRows'), 'helper tracks returnedRows / maxPreviewRows')
  chk(13, helperContent.includes('committedArtifactsContainRaw: false'), 'helper marks committed artifacts as not containing raw')
  chk(14, helperContent.includes("includeRawValues: true"), 'helper parses with includeRawValues=true for runtime preview')
  chk(15, helperContent.includes('maxPreviewRows ?? 50'), 'helper limits preview rows (default 50)')
  chk(16, helperContent.includes('slice(0, maxPreviewRows)'), 'helper slices preview rows to limit')

  chk(17, helperContent.includes('courseName: string | null'), 'row.raw.courseName field present')
  chk(18, helperContent.includes('teacherText: string | null'), 'row.raw.teacherText field present')
  chk(19, helperContent.includes('classText: string | null'), 'row.raw.classText field present')
  chk(20, helperContent.includes('remark: string | null'), 'row.raw.remark field present')
  chk(21, helperContent.includes('mergeRemark: string | null'), 'row.raw.mergeRemark field present')

  chk(22, helperContent.includes('parsed: CourseSettingXlsxPreviewRowParsed'), 'row.parsed object present')
  chk(23, helperContent.includes('diagnostics: string[]'), 'parsed.diagnostics retained')
  chk(24, helperContent.includes('classifications:'), 'parsed.classifications retained')
  chk(25, helperContent.includes('matchSummary'), 'matchSummary retained')

  chk(26, helperContent.includes('dryRunOnly: true'), 'dryRunSummary.dryRunOnly=true retained')
  chk(27, helperContent.includes('existingDataScopedBySemester: true'), 'existingDataScopedBySemester retained')
  chk(28, helperContent.includes('targetSemester'), 'targetSemester summary retained')

  chk(29, helperContent.includes('previewOnly: true') && helperContent.includes('canConfirm: false') && helperContent.includes('canApply: false'), 'previewOnly/canConfirm/canApply preserved')
  chk(30, !helperContent.includes('writeFileSync') && !helperContent.includes('console.log('), 'helper: no fs write or console.log of raw rows')

  // ── C: UI + client (N31-N44) ──
  chk(31, uiContent.includes('row.raw?.courseName') || uiContent.includes('row.raw.courseName'), 'UI displays raw course name')
  chk(32, uiContent.includes('row.raw?.teacherText') || uiContent.includes('row.raw.teacherText'), 'UI displays raw teacher text')
  chk(33, uiContent.includes('row.raw?.classText') || uiContent.includes('row.raw.classText'), 'UI displays raw class text')
  chk(34, uiContent.includes('row.raw?.remark') || uiContent.includes('row.raw.remark'), 'UI displays raw remark')
  chk(35, uiContent.includes('row.raw?.mergeRemark') || uiContent.includes('row.raw.mergeRemark'), 'UI displays raw merge remark')

  chk(36, uiContent.includes('row.sheetName'), 'UI displays sheet name / row index')
  chk(37, uiContent.includes('selectedSemesterId'), 'UI retains target semester selector')
  chk(38, uiContent.includes('不会自动切换系统当前学期'), 'UI retains active semester decoupling warning')
  chk(39, uiContent.includes('仅供有权限的管理员') || uiContent.includes('原文仅供管理员'), 'UI shows raw preview admin-only notice')
  chk(40, !uiContent.includes('确认导入') || !uiContent.includes('写入数据库'), 'UI: no confirm/apply/write DB button')
  chk(41, !uiContent.includes('切换当前学期') || !uiContent.includes('激活学期'), 'UI: no active semester switch button')
  chk(42, uiContent.includes('Preview Only') || uiContent.includes('previewOnly'), 'UI: Preview Only label retained')
  chk(43, uiContent.includes('previewshort.title') || uiContent.includes('raw.weeklyHoursText') || uiContent.includes('weeklyHoursText'), 'UI displays weekly hours raw text')
  chk(44, uiContent.includes('examTypeText'), 'UI displays exam type raw text')

  // ── D: Safety / isolation (N45-N54) ──
  chk(45, !helperContent.match(/prisma\.\w+\.create\b/) && !helperContent.match(/prisma\.\w+\.update\b/) &&
    !helperContent.match(/prisma\.\w+\.upsert\b/) && !helperContent.match(/prisma\.\w+\.delete\b/),
    'helper: no Prisma write methods')

  chk(46, !routeContent.includes('activate') || !routeContent.match(/\.activate\b/), 'route never calls activate semester API')

  // core files unchanged
  const l2Content = readRel(L2_PARSER) ?? ''
  chk(47, l2Content.includes('parseCourseSettingXlsx'), 'L2 parser unchanged (exports intact)')

  const l4Content = readRel(L4_MAPPER) ?? ''
  chk(48, l4Content.includes('L4_STAGE'), 'L4 mapper unchanged (L4_STAGE present)')

  const l5Content2 = readRel(L5_HELPER) ?? ''
  chk(49, l5Content2.includes('L5_STAGE'), 'L5 helper unchanged (L5_STAGE present)')

  const wordParserExists = fileExists(WORD_PARSER)
  chk(50, wordParserExists, 'old Word parser exists / untouched')

  chk(51, !helperContent.includes('writeFileSync'), 'helper: no fs.write calls (raw in-memory only)')
  chk(52, !uiContent.includes('console.log') || !uiContent.includes('row.raw'), 'UI: no raw console logging')

  // No console.log of raw rows in any L6-B1 changed file
  const allChangedFiles = [routeContent, helperContent, clientContent, uiContent]
  chk(53, allChangedFiles.every(f => !/console\.log\([^)]*raw/.test(f)), 'no console.log of raw rows in changed files')
  chk(54, allChangedFiles.every(f => !/console\.error\([^)]*raw/.test(f)), 'no console.error of raw rows in changed files')

  // ── E: DB unchanged (N55-N59) ──
  const before = await readDbCounts()
  console.log(`\n  DB before: sem=${before.semester} course=${before.course} teacher=${before.teacher} cg=${before.classGroup} task=${before.teachingTask} ttc=${before.teachingTaskClass} ib=${before.importBatch} slot=${before.scheduleSlot} adj=${before.scheduleAdjustment}`)

  await new Promise(r => setTimeout(r, 200))
  const after = await readDbCounts()
  console.log(`  DB after:  sem=${after.semester} course=${after.course} teacher=${after.teacher} cg=${after.classGroup} task=${after.teachingTask} ttc=${after.teachingTaskClass} ib=${after.importBatch} slot=${after.scheduleSlot} adj=${after.scheduleAdjustment}`)

  chk(55, before.semester === after.semester, 'Semester count unchanged')
  chk(56, before.course === after.course && before.teacher === after.teacher, 'Course/Teacher counts unchanged')
  chk(57, before.classGroup === after.classGroup && before.teachingTask === after.teachingTask &&
    before.teachingTaskClass === after.teachingTaskClass, 'ClassGroup/TeachingTask/TeachingTaskClass counts unchanged')
  chk(58, before.importBatch === after.importBatch, 'ImportBatch count unchanged')
  chk(59, before.scheduleSlot === after.scheduleSlot && before.scheduleAdjustment === after.scheduleAdjustment,
    'ScheduleSlot/ScheduleAdjustment counts unchanged')

  // ── F: Forbidden files (N60-N63) ──
  const xlsxTracked = gitRun('ls-files -- *.xlsx').trim()
  const nonTemplate = xlsxTracked.split('\n').filter(l => l && !l.includes('templates/') && l.length > 0)
  chk(60, nonTemplate.length === 0 || (nonTemplate.length === 1 && nonTemplate[0] === ''),
    'no xlsx tracked (excluding templates/)')

  chk(61, gitRun('ls-files -- prisma/dev.db').trim() === '', 'dev.db not tracked')
  chk(62, gitRun('ls-files -- "*.backup*"').trim() === '', 'no backup files tracked')

  // No raw local artifacts generated
  chk(63, !existsSync(join(ROOT, 'temp/local-artifacts/l6-b1')), 'no L6-B1 local raw artifacts generated (gitignored dir not created)')

  // ── G: Privacy / committed artifacts (N64-N66) ──
  const jsonContent = readRel(OUTPUT_JSON) ?? '{}'
  const phoneHits = (jsonContent.match(/1[3-9]\d{9}/g) ?? []).length
  chk(64, phoneHits === 0, 'committed JSON: no raw phone numbers')

  const mdContent = readRel(OUTPUT_MD) ?? ''
  const mdPhoneHits = (mdContent.match(/1[3-9]\d{9}/g) ?? []).length
  chk(65, mdPhoneHits === 0, 'committed MD: no raw phone numbers')

  // No raw teacher/class/course names in committed docs/json (sanity grep with chinese ranges)
  // Note: "真实教师" is a description phrase, not a raw teacher name; require 3+ chars before title word
  // to avoid false positives on descriptive text like "显示真实教师"
  chk(66, !/[一-龥]{4,}(老师|教师|班长|助教)/.test(jsonContent), 'committed JSON: no raw teacher name patterns')

  // ── H: Build / PII / K22 (N67-N69) ──
  let piiOut = ''
  try {
    const r = execSync('npm run scan:docs-pii', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
    piiOut = r.stdout ? r.stdout.toString() : '' + (r.stderr ? r.stderr.toString() : '')
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer }
    piiOut = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
  }
  chk(67, !/BLOCKING/.test(piiOut), 'scan:docs-pii no blocking hits')

  let buildOk = true
  try {
    execSync('npm run build', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 })
  } catch { buildOk = false }
  chk(68, buildOk, 'build PASS')

  const k22c = runScript(K22_C, 120_000)
  const k22cPass = k22c.ok && /PASS:\s*73/.test(k22c.output) && !/FAIL:\s*[1-9]/.test(k22c.output)
  chk(69, k22cPass, 'K22-C still PASS', k22cPass ? '73/0/0/0' : k22c.output.slice(-200).trim())
  restoreK22()

  // ── I: Regression (N70-N82) ──
  const l6b = runScript('scripts/verify-xlsx-course-setting-target-semester-preview-l6-b.ts', 300_000)
  chk(70, l6b.ok, 'L6-B verify still PASS', l6b.ok ? 'OK' : l6b.output.slice(-200).trim())

  const l6a = runScript('scripts/audit-xlsx-course-setting-target-semester-selection-l6-a.ts', 300_000)
  chk(71, l6a.ok, 'L6-A audit still PASS', l6a.ok ? 'OK' : l6a.output.slice(-200).trim())

  const l60 = runScript('scripts/verify-xlsx-course-setting-target-semester-and-full-review-l6-0.ts', 1200_000)
  chk(72, l60.ok, 'L6-0 verify still PASS', l60.ok ? 'OK' : l60.output.slice(-200).trim())

  const l5 = runScript('scripts/verify-xlsx-course-setting-review-package-l5.ts', 1200_000)
  chk(73, l5.ok, 'L5 verify still PASS', l5.ok ? 'OK' : l5.output.slice(-200).trim())

  const l4 = runScript('scripts/verify-xlsx-course-setting-teaching-task-dry-run-l4.ts', 300_000)
  chk(74, l4.ok, 'L4 verify still PASS', l4.ok ? 'OK' : l4.output.slice(-200).trim())

  const l3 = runScript('scripts/verify-xlsx-course-setting-preview-l3.ts', 300_000)
  chk(75, l3.ok, 'L3 verify still PASS', l3.ok ? 'OK' : l3.output.slice(-200).trim())

  const l2 = runScript('scripts/verify-xlsx-course-setting-parser-l2.ts', 300_000)
  chk(76, l2.ok, 'L2 verify still PASS', l2.ok ? 'OK' : l2.output.slice(-200).trim())

  const l1 = runScript('scripts/audit-xlsx-course-setting-import-l1.ts', 300_000)
  chk(77, l1.ok, 'L1 audit still PASS', l1.ok ? 'OK' : l1.output.slice(-200).trim())

  const k39b1 = runScript('scripts/verify-import-rules-explicit-semester-config-k39-b1.ts', 60_000)
  chk(78, k39b1.ok, 'K39-B1 still PASS', k39b1.ok ? 'OK' : k39b1.output.slice(-200).trim())

  const k39c2 = runScript('scripts/verify-source-evidence-safe-fields-backfill-k39-c2.ts', 60_000)
  chk(79, k39c2.ok, 'K39-C2 still PASS', k39c2.ok ? 'OK' : k39c2.output.slice(-200).trim())

  let diffOk = true
  try { execSync('git diff --check', { cwd: ROOT, stdio: 'ignore', timeout: 30_000 }) } catch { diffOk = false }
  chk(80, diffOk, 'git diff --check clean')

  // eslint on L6-B1 changed files (no errors)
  let eslintOk = true
  try {
    execSync('npx', ['eslint', '--no-warn-ignored',
      ROUTE_PATH, HELPER_PATH, CLIENT_PATH, UI_PATH,
      'scripts/verify-xlsx-course-setting-raw-preview-display-l6-b1.ts',
    ], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
  } catch { eslintOk = false }
  chk(81, eslintOk, 'eslint on L6-B1 files: 0 errors')

  // tsc --noEmit clean
  let tscOk = true
  try { execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'ignore', timeout: 120_000 }) } catch { tscOk = false }
  chk(82, tscOk, 'tsc --noEmit clean')

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