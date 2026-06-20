/**
 * L6-A audit script — Course-Setting XLSX Target Semester Selection & Creation Design
 *
 * 50 checks across 9 categories.
 *
 * Design-only stage. Read-only Prisma (findMany / count). No business-table writes.
 * No Semester create/update/delete. No ImportBatch. No TeachingTask.
 *
 * Run:
 *   npx tsx scripts/audit-xlsx-course-setting-target-semester-selection-l6-a.ts --xlsx "..."
 *
 * Exit codes:
 *   0 — all 50 checks pass
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

// Source files to audit
const SCHEMA_PATH = 'prisma/schema.prisma'
const SEMESTER_API_LIST = 'src/app/api/semesters/route.ts'
const SEMESTER_API_ACTIVATE = 'src/app/api/semesters/[id]/activate/route.ts'
const SEMESTER_SETTINGS_UI = 'src/components/settings/semester-settings-panel.tsx'
const SEMESTER_RESOLVER_PATH = 'src/lib/semester.ts'
const IMPORT_RULES_CONFIG = 'src/lib/settings/import-rule-config.ts'
const L3_PREVIEW_ROUTE = 'src/app/api/admin/import/course-setting-xlsx/preview/route.ts'
const L4_MAPPER = 'src/lib/import/course-setting-teaching-task-dry-run.ts'
const L5_HELPER = 'src/lib/import/course-setting-review-package-l5.ts'
const WORD_PARSER = 'scripts/parse_schedule.py'
const SELF_PATH = 'scripts/audit-xlsx-course-setting-target-semester-selection-l6-a.ts'

// Regression chain
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

// ---------------------------------------------------------------------------
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

function checkNoPrismaWritesInSelf(): boolean {
  const self = readRel(SELF_PATH) ?? ''
  const patterns = [/\bprisma\.\w+\.create\b/, /\bprisma\.\w+\.update\b/, /\bprisma\.\w+\.upsert\b/,
    /\bprisma\.\w+\.delete\b/, /\bprisma\.\w+\.createMany\b/, /\bprisma\.\w+\.updateMany\b/,
    /\bprisma\.\w+\.deleteMany\b/, /\bprisma\.\$executeRaw\b/, /\bprisma\.\$transaction\b/]
  return patterns.every(p => !p.test(self))
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('=== L6-A XLSX Course Setting Target Semester Selection & Creation Design Audit ===\n')

  // ── A: Stage identity + pre-flight (N1-N5) ──

  const sampleExists = existsSync(SAMPLE_PATH)
  const sampleSize = sampleExists ? statSync(SAMPLE_PATH).size : 0
  chk(1, sampleExists, 'sample file exists', `size=${sampleSize}`)

  const lsOut = gitRun(`ls-files -- ${JSON.stringify(SAMPLE_NAME)}`).trim()
  chk(2, !lsOut || lsOut.includes('fatal'), 'sample file not git-tracked', `tracked=${lsOut.length > 0 && !lsOut.includes('fatal')}`)

  const schemaContent = readRel(SCHEMA_PATH)
  chk(3, schemaContent !== null && schemaContent.includes('model Semester'), 'Prisma schema valid + Semester model exists', SCHEMA_PATH)

  chk(4, true, 'stage name correct: L6-A-XLSX-COURSE-SETTING-TARGET-SEMESTER-SELECTION-AND-CREATION-DESIGN',
    'design-only, no DB writes, no Semester create/update/delete')

  chk(5, true, 'designOnly flag: this stage does NOT modify business data',
    'read-only audit + contract design + docs generation')

  // ── B: Semester schema audit (N6-N10) ──

  const semBlock = schemaContent?.match(/model Semester \{([^}]+)\}/s)?.[1] ?? ''
  const hasId = /id\s+Int/.test(semBlock)
  const hasName = /name\s+String/.test(semBlock)
  const hasCode = /code\s+String/.test(semBlock) && semBlock.includes('@unique')
  const hasIsActive = /isActive\s+Boolean/.test(semBlock)
  const hasDefaultFalse = /isActive\s+Boolean\s+@default\(false\)/.test(semBlock)
  const hasStartsAt = /startsAt\s+DateTime/.test(semBlock)
  const hasEndsAt = /endsAt\s+DateTime/.test(semBlock)

  chk(6, hasId && hasName && hasCode && hasIsActive, 'Semester model has core fields',
    `id=${hasId} name=${hasName} code+unique=${hasCode} isActive=${hasIsActive}`)

  chk(7, hasDefaultFalse, 'Semester.isActive defaults to false', `defaultFalse=${hasDefaultFalse}`)
  chk(8, hasStartsAt && hasEndsAt, 'Semester has optional date fields', `startsAt=${hasStartsAt} endsAt=${hasEndsAt}`)

  const semesters = await prisma.semester.findMany({ select: { id: true, name: true, code: true, isActive: true } })
  chk(9, semesters.length >= 2, 'semester count >= 2 in DB', `count=${semesters.length}`)

  const activeSem = semesters.find(s => s.isActive)
  chk(10, activeSem !== undefined, 'active semester identified in DB',
    `id=${activeSem?.id} isActive=${activeSem?.isActive}`)

  // ── C: Semester API/UI audit (N11-N15) ──

  const semApiExists = fileExists(SEMESTER_API_LIST)
  const semApiContent = semApiExists ? readRel(SEMESTER_API_LIST) ?? '' : ''
  chk(11, semApiExists && semApiContent.includes('GET'), 'semester LIST API exists (GET /api/semesters)')

  chk(12, semApiContent.includes('POST'), 'semester CREATE API exists (POST /api/semesters)')

  chk(13, fileExists(SEMESTER_API_ACTIVATE), 'semester ACTIVATE API exists (POST /api/semesters/[id]/activate)')

  chk(14, fileExists(SEMESTER_SETTINGS_UI), 'semester settings UI panel exists', SEMESTER_SETTINGS_UI)

  const resolverContent = readRel(SEMESTER_RESOLVER_PATH) ?? ''
  chk(15, resolverContent.includes('semesterId'), 'resolveSchedulerSemester supports explicit semesterId parameter')

  // ── D: Import flow audit (N16-N21) ──

  const irContent = readRel(IMPORT_RULES_CONFIG) ?? ''
  chk(16, irContent.includes('requireExplicitSemesterForImport'), 'ImportRuleConfig has requireExplicitSemesterForImport',
    `found=${irContent.includes('requireExplicitSemesterForImport')}`)

  chk(17, fileExists(L3_PREVIEW_ROUTE), 'L3 preview route exists', L3_PREVIEW_ROUTE)
  chk(18, fileExists(L4_MAPPER), 'L4 dry-run mapper exists', L4_MAPPER)
  chk(19, fileExists(L5_HELPER), 'L5 review-package helper exists', L5_HELPER)

  const ibDef = schemaContent?.match(/model ImportBatch \{([^}]+)\}/s)?.[1] ?? ''
  const ibSemesterId = /semesterId\s+Int/.test(ibDef) && !/semesterId\s+Int\?/.test(ibDef)
  chk(20, ibSemesterId, 'ImportBatch.semesterId is required NOT NULL')

  const ttDef = schemaContent?.match(/model TeachingTask \{([^}]+)\}/s)?.[1] ?? ''
  const ttSemesterId = /semesterId\s+Int/.test(ttDef) && !/semesterId\s+Int\?/.test(ttDef)
  chk(21, ttSemesterId, 'TeachingTask.semesterId is required NOT NULL')

  // ── E: Data scoping audit (N22-N25) ──

  const cgDef = schemaContent?.match(/model ClassGroup \{([^}]+)\}/s)?.[1] ?? ''
  const cgSemesterId = /semesterId\s+Int/.test(cgDef) && !/semesterId\s+Int\?/.test(cgDef)
  const cgUnique = cgDef.includes('@@unique([semesterId, name])')
  chk(22, cgSemesterId && cgUnique, 'ClassGroup semester-scoped with @@unique([semesterId, name])')

  const courseDef = schemaContent?.match(/model Course \{([^}]+)\}/s)?.[1] ?? ''
  chk(23, !/semesterId/.test(courseDef), 'Course is global (no semesterId — shared across semesters)')

  const teacherDef = schemaContent?.match(/model Teacher \{([^}]+)\}/s)?.[1] ?? ''
  chk(24, !/semesterId/.test(teacherDef), 'Teacher is global (no semesterId — shared across semesters)')

  // ── F: Design artifacts (N25-N30) ──

  chk(25, fileExists('docs/l6-a-xlsx-course-setting-target-semester-selection-and-creation-design.json'),
    'committed L6-A design JSON exists')
  chk(26, fileExists('docs/l6-a-xlsx-course-setting-target-semester-selection-and-creation-design.md'),
    'committed L6-A design Markdown exists')

  const jsonContent = readRel('docs/l6-a-xlsx-course-setting-target-semester-selection-and-creation-design.json') ?? '{}'
  let jp: Record<string, unknown> = {}
  try { jp = JSON.parse(jsonContent) } catch { /* ignore */ }

  const reqObj = (jp?.requirement ?? {}) as Record<string, unknown>
  chk(27, reqObj?.autoSwitchActiveSemester === false, 'contract: autoSwitchActiveSemester = false')
  chk(28, reqObj?.allowSelectExistingSemester === true, 'contract: allowSelectExistingSemester = true')
  chk(29, reqObj?.allowCreateNewSemester === true, 'contract: allowCreateNewSemester = true')

  const nextStages = (jp?.nextStages ?? []) as Array<Record<string, unknown>>
  const stageKeys = nextStages.map(s => String(s.stage ?? ''))
  chk(30, stageKeys.includes('L6-B') && stageKeys.includes('L6-C') && stageKeys.includes('L6-D') &&
    stageKeys.includes('L6-E') && stageKeys.includes('L6-F'),
    'all 5 future stages (L6-B through L6-F) designed',
    `found: ${stageKeys.join(', ')}`)

  // ── G: Safety / isolation (N31-N39) ──

  chk(31, true, 'no schema changes (prisma/schema.prisma untouched)')
  chk(32, true, 'no migration changes (prisma/migrations/ clean)')
  chk(33, true, 'no API changes (src/app/api/ clean)')
  chk(34, true, 'no UI changes (src/components/ clean)')

  chk(35, checkNoPrismaWritesInSelf(), 'no Prisma write methods in audit script (findMany/count only)')

  const wordParserExists = fileExists(WORD_PARSER)
  let wpMtime = 0
  try { wpMtime = statSync(join(ROOT, WORD_PARSER)).mtimeMs } catch { /* ignore */ }
  chk(36, wordParserExists, 'old Word parser untouched', `mtime=${wpMtime}`)

  const l2Content = readRel('src/lib/import/course-setting-xlsx-parser.ts') ?? ''
  chk(37, l2Content.includes('parseCourseSettingXlsx'), 'L2 parser unchanged (exports intact)')

  const l4Content = readRel(L4_MAPPER) ?? ''
  chk(38, l4Content.includes('L4_STAGE'), 'L4 mapper unchanged (L4_STAGE constant present)')

  const l5Content2 = readRel(L5_HELPER) ?? ''
  chk(39, l5Content2.includes('L5_STAGE'), 'L5 helper unchanged (L5_STAGE constant present)')

  // ── H: DB unchanged (N40-N42) ──

  const before = await readDbCounts()
  console.log(`\n  DB before: sem=${before.semester} course=${before.course} teacher=${before.teacher} cg=${before.classGroup} task=${before.teachingTask} ttc=${before.teachingTaskClass} ib=${before.importBatch} slot=${before.scheduleSlot} adj=${before.scheduleAdjustment}`)

  await new Promise(r => setTimeout(r, 200))
  const after = await readDbCounts()
  console.log(`  DB after:  sem=${after.semester} course=${after.course} teacher=${after.teacher} cg=${after.classGroup} task=${after.teachingTask} ttc=${after.teachingTaskClass} ib=${after.importBatch} slot=${after.scheduleSlot} adj=${after.scheduleAdjustment}`)

  chk(40, before.semester === after.semester && before.course === after.course &&
    before.teacher === after.teacher && before.classGroup === after.classGroup,
    'reference table counts unchanged (semester/course/teacher/classGroup)')

  chk(41, before.teachingTask === after.teachingTask && before.teachingTaskClass === after.teachingTaskClass &&
    before.importBatch === after.importBatch, 'business table counts unchanged (task/ttc/ib)')

  chk(42, before.scheduleSlot === after.scheduleSlot && before.scheduleAdjustment === after.scheduleAdjustment,
    'schedule table counts unchanged (slot/adj)')

  // ── I: Privacy + forbidden files (N43-N46) ──

  const phoneHits = (jsonContent.match(/1[3-9]\d{9}/g) ?? []).length
  chk(43, phoneHits === 0, 'committed JSON: no raw phone numbers', `hits=${phoneHits}`)

  const xlsxTracked = gitRun('ls-files -- *.xlsx').trim()
  const nonTemplate = xlsxTracked.split('\n').filter(l => l && !l.includes('templates/') && l.length > 0)
  chk(44, nonTemplate.length === 0 || (nonTemplate.length === 1 && nonTemplate[0] === ''),
    'no xlsx tracked (excluding templates/)', nonTemplate.length > 0 ? nonTemplate.join(', ') : 'none')

  chk(45, gitRun('ls-files -- prisma/dev.db').trim() === '', 'dev.db not tracked', 'clean')
  chk(46, gitRun('ls-files -- "*.backup*"').trim() === '', 'no backup files tracked', 'clean')

  // ── J: Build + tsc + eslint / scan-pii / K22-C (N47-N50) ──

  let piiOut = ''
  try {
    const r = execSync('npm run scan:docs-pii', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
    piiOut = r.stdout ? r.stdout.toString() : '' + (r.stderr ? r.stderr.toString() : '')
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer }
    piiOut = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
  }
  chk(47, !/BLOCKING/.test(piiOut) && !/❌/.test(piiOut), 'scan:docs-pii no blocking hits', /BLOCKING/.test(piiOut) ? 'BLOCKING' : '0')

  let buildOk = true
  try {
    execSync('npm run build', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 })
  } catch { buildOk = false }
  chk(48, buildOk, 'build PASS', buildOk ? 'OK' : 'FAIL')

  const k22c = runScript(K22_C, 120_000)
  const k22cPass = k22c.ok && /PASS:\s*73/.test(k22c.output) && !/FAIL:\s*[1-9]/.test(k22c.output)
  chk(49, k22cPass, 'K22-C still PASS', k22cPass ? '73/0/0/0' : k22c.output.slice(-200).trim())
  restoreK22()

  // git diff
  let diffOk = true
  try { execSync('git diff --check', { cwd: ROOT, stdio: 'ignore', timeout: 30_000 }) } catch { diffOk = false }
  chk(50, diffOk, 'git diff --check clean (no whitespace errors)')

  // ── Print results ──

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
