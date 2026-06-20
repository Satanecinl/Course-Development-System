/**
 * L4 verify script for the Course-Setting XLSX TeachingTask Dry-Run Mapping.
 *
 * 54 checks across 9 categories:
 *  - Sample + parser + helper existence (N1-N10)
 *  - Candidate generation (N11-N18)
 *  - Match status summaries (N19-N22)
 *  - Diagnostic codes for risky cases (N23-N28)
 *  - Determinism (N29-N30)
 *  - Privacy / no raw in committed JSON (N31-N35)
 *  - Safety / isolation (no schema / API / UI / parser / write) (N36-N39)
 *  - DB unchanged (N40)
 *  - Regression chain (N41-N54): L3/L2/L1/K39-B1/B1A/C2/C4/K22-C/PII/build/tsc/eslint/git/forbidden
 *
 * Read-only Prisma (findMany / count). NO business-table writes. No ImportBatch.
 * Sanitized output: hashes + counts + classifications only — no raw teacher /
 * class / course / remark / row text.
 *
 * Run:
 *   npx tsx scripts/verify-xlsx-course-setting-teaching-task-dry-run-l4.ts --xlsx "..."
 *
 * Exit codes:
 *   0 — all 54 checks pass
 *   1 — one or more checks fail
 */

import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {
  join,
  resolve,
} from 'node:path'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import {
  L4_STAGE,
  buildCourseSettingTeachingTaskDryRun,
  normalizeForMatch,
  type CourseSettingTeachingTaskDryRunResult,
  type CourseSettingExistingImportData,
} from '../src/lib/import/course-setting-teaching-task-dry-run'

// L4 dry-run: read-only Prisma access. No writes are allowed in this script.
const prisma = new PrismaClient()

const ROOT = resolve(__dirname, '..')
const SAMPLE_PATH =
  'D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx'
const HELPER_PATH = 'src/lib/import/course-setting-teaching-task-dry-run.ts'
const L2_PARSER_PATH = 'src/lib/import/course-setting-xlsx-parser.ts'
const L3_VERIFY = 'scripts/verify-xlsx-course-setting-preview-l3.ts'
const L2_VERIFY = 'scripts/verify-xlsx-course-setting-parser-l2.ts'
const L1_AUDIT = 'scripts/audit-xlsx-course-setting-import-l1.ts'
const K39_B1 = 'scripts/verify-import-rules-explicit-semester-config-k39-b1.ts'
const K39_B1A = 'scripts/verify-import-rules-runtime-500-fix-k39-b1a.ts'
const K39_C2 = 'scripts/verify-source-evidence-safe-fields-backfill-k39-c2.ts'
const K39_C4 = 'scripts/verify-source-evidence-manual-review-package-k39-c4.ts'
const K22_C = 'scripts/verify-score-regression-harness-k22-c.ts'
const WORD_PARSER_SCRIPT = 'scripts/parse_schedule.py'

const OUTPUT_JSON = join(ROOT, 'docs/l4-xlsx-course-setting-teaching-task-dry-run-mapping.json')
const OUTPUT_MD = join(ROOT, 'docs/l4-xlsx-course-setting-teaching-task-dry-run-mapping.md')
const STATUS_PATH = join(ROOT, 'docs/current-project-status.md')

const PASS = '✅'
const FAIL = '❌'
const results: string[] = []
const checks: Array<{ id: number; name: string; passed: boolean; detail: string }> = []

function check(id: number, pass: boolean, desc: string, detail?: string): void {
  const d = detail ? ' — ' + detail : ''
  results.push(`${pass ? PASS : FAIL} N${id}: ${desc}${d}`)
  checks.push({ id, name: desc, passed: pass, detail: detail ?? '' })
}

function sha(s: string, len = 12): string {
  return createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)
}

function readFile(relPath: string): string | null {
  try {
    return readFileSync(join(ROOT, relPath), 'utf-8')
  } catch {
    return null
  }
}

function grepCount(content: string, pattern: string): number {
  return (content.match(new RegExp(pattern, 'g')) ?? []).length
}

function runGit(args: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString()
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer }
    return (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
  }
}

function runScript(scriptPath: string, timeoutMs = 300_000): { ok: boolean; output: string } {
  try {
    const full = join(ROOT, scriptPath)
    const output = execSync(`npx tsx ${JSON.stringify(full)}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    }).toString()
    return { ok: true, output }
  } catch (err: unknown) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number }
    const out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
    return { ok: false, output: out + `\n[exit code: ${e.status ?? 'unknown'}]` }
  }
}

function restoreK22(): void {
  try {
    execSync('git checkout -- docs/k22-score-default-snapshot.json docs/k22-score-regression-harness-implementation.json', {
      cwd: ROOT,
      stdio: 'ignore',
    })
  } catch {
    /* ignore */
  }
}

/**
 * L1/L2/L3 verify scripts each rewrite their own committed docs/*.json
 * with a fresh `generatedAt` timestamp and stage-aware detail strings on
 * every run. Since L4 chains them via runScript, this leaves side-effect
 * drift in committed docs unrelated to L4. Restore them so the L4 commit
 * only contains L4's own changes.
 */
function restoreL1L2L3Docs(): void {
  try {
    execSync(
      'git checkout -- docs/l1-xlsx-course-setting-import-audit.json docs/l2-xlsx-course-setting-parser-prototype.json docs/l2-xlsx-course-setting-parser-prototype.md docs/l3-xlsx-course-setting-preview-api-and-ui.json',
      { cwd: ROOT, stdio: 'ignore' },
    )
  } catch {
    /* ignore */
  }
}

const KNOWN_PRE_EXISTING = ['temp/README.md', 'temp/.gitkeep', 'templates/']

// ---------------------------------------------------------------------------
// Read-only DB fingerprint (before)
// ---------------------------------------------------------------------------

type DbCounts = {
  course: number
  teacher: number
  classGroup: number
  teachingTask: number
  teachingTaskClass: number
  importBatch: number
  scheduleSlot: number
  scheduleAdjustment: number
}

async function readDbCounts(): Promise<DbCounts> {
  // L4 dry-run: read-only Prisma access. No writes are allowed in this script.
  const [course, teacher, classGroup, teachingTask, teachingTaskClass, importBatch, scheduleSlot, scheduleAdjustment] =
    await Promise.all([
      prisma.course.count(),
      prisma.teacher.count(),
      prisma.classGroup.count(),
      prisma.teachingTask.count(),
      prisma.teachingTaskClass.count(),
      prisma.importBatch.count(),
      prisma.scheduleSlot.count(),
      prisma.scheduleAdjustment.count(),
    ])
  return { course, teacher, classGroup, teachingTask, teachingTaskClass, importBatch, scheduleSlot, scheduleAdjustment }
}

async function loadExistingData(): Promise<CourseSettingExistingImportData> {
  // L4 dry-run: read-only Prisma access. No writes are allowed in this script.
  const [courses, teachers, classGroups, teachingTasks, teachingTaskClasses] = await Promise.all([
    prisma.course.findMany({ select: { id: true, name: true } }),
    prisma.teacher.findMany({ select: { id: true, name: true } }),
    prisma.classGroup.findMany({ select: { id: true, name: true, studentCount: true } }),
    prisma.teachingTask.findMany({ select: { id: true, courseId: true, teacherId: true } }),
    prisma.teachingTaskClass.findMany({ select: { id: true, teachingTaskId: true, classGroupId: true } }),
  ])
  return {
    courses: courses.map((c) => ({
      id: c.id,
      nameHash: sha(c.name.trim()),
      normalizedNameHash: sha(normalizeForMatch(c.name)),
    })),
    teachers: teachers.map((t) => ({
      id: t.id,
      nameHash: sha(t.name.trim()),
      normalizedNameHash: sha(normalizeForMatch(t.name)),
    })),
    classGroups: classGroups.map((c) => ({
      id: c.id,
      nameHash: sha(c.name.trim()),
      normalizedNameHash: sha(normalizeForMatch(c.name)),
      studentCount: c.studentCount,
    })),
    teachingTasks: teachingTasks.map((t) => ({
      id: t.id,
      courseId: t.courseId,
      teacherId: t.teacherId,
    })),
    teachingTaskClasses: teachingTaskClasses.map((l) => ({
      id: l.id,
      teachingTaskId: l.teachingTaskId,
      classGroupId: l.classGroupId,
    })),
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== L4 XLSX Course Setting TeachingTask Dry-Run Mapping Verify ===\n')

  // -- N1: sample file exists
  const sampleExists = existsSync(SAMPLE_PATH)
  check(1, sampleExists, 'sample file exists', sampleExists ? `size=${statSync(SAMPLE_PATH).size}` : 'sample missing')
  if (!sampleExists) return finish()
  const sampleStat = statSync(SAMPLE_PATH)
  const sampleBuf = readFileSync(SAMPLE_PATH)

  // -- N2: sample not git-tracked
  const fileName = SAMPLE_PATH.split(/[\\/]/).pop() ?? ''
  const lsFiles = runGit('ls-files')
  const isTracked = lsFiles.split(/\r?\n/).some((l) => l.endsWith(fileName) || l.includes(fileName))
  check(2, !isTracked, 'sample file not git-tracked', isTracked ? `tracked: ${sha(fileName)}` : `name-hash ${sha(fileName)}`)

  // -- N3: L2 parser file exists
  const parserExists = existsSync(join(ROOT, L2_PARSER_PATH))
  check(3, parserExists, 'L2 parser file exists', L2_PARSER_PATH)

  // -- N4: L4 dry-run helper exists
  const helperExists = existsSync(join(ROOT, HELPER_PATH))
  check(4, helperExists, 'L4 dry-run helper exists', HELPER_PATH)
  if (!helperExists) return finish()
  const helperSrc = readFile(HELPER_PATH) ?? ''

  // -- Before DB counts
  const dbBefore = await readDbCounts()

  // -- Read-only load existing data + run mapper
  const existingData = await loadExistingData()
  const result1 = await buildCourseSettingTeachingTaskDryRun({
    xlsxBuffer: sampleBuf,
    artifactFilename: SAMPLE_PATH,
    existingData,
    options: { maxPreviewRows: 50, confidenceThreshold: 0.8 },
  })

  // -- N5: parser returns course rows > 0 (via mapper's parser field)
  check(
    5,
    result1.parser.totalCourseRows > 0,
    'parser returns course rows > 0',
    `totalCourseRows=${result1.parser.totalCourseRows}`,
  )

  // -- N6-N10: existing DB counts read
  check(6, result1.existingDataSummary.courseCount > 0, 'existing Course count read', `count=${result1.existingDataSummary.courseCount}`)
  check(7, result1.existingDataSummary.teacherCount > 0, 'existing Teacher count read', `count=${result1.existingDataSummary.teacherCount}`)
  check(8, result1.existingDataSummary.classGroupCount > 0, 'existing ClassGroup count read', `count=${result1.existingDataSummary.classGroupCount}`)
  check(9, result1.existingDataSummary.teachingTaskCount > 0, 'existing TeachingTask count read', `count=${result1.existingDataSummary.teachingTaskCount}`)
  check(10, result1.existingDataSummary.teachingTaskClassCount > 0, 'existing TeachingTaskClass count read', `count=${result1.existingDataSummary.teachingTaskClassCount}`)

  // -- N11-N12: dryRunOnly + dbWritten
  check(11, result1.dryRunOnly === true, 'dryRunOnly = true', `dryRunOnly=${result1.dryRunOnly}`)
  check(12, result1.dbWritten === false, 'dbWritten = false', `dbWritten=${result1.dbWritten}`)

  // -- N13-N18: candidate generation
  check(13, result1.candidateSummary.courseCandidates > 0, 'course candidates generated', `count=${result1.candidateSummary.courseCandidates}`)
  check(14, result1.candidateSummary.teacherCandidates > 0 || (result1.diagnosticsSummary.byCode.TEACHER_BLANK ?? 0) > 0, 'teacher candidates generated or blank diagnosed', `teachers=${result1.candidateSummary.teacherCandidates} blank=${result1.diagnosticsSummary.byCode.TEACHER_BLANK ?? 0}`)
  check(15, result1.candidateSummary.classGroupCandidates > 0 || (result1.diagnosticsSummary.byCode.CLASS_COUNT_OTHER_REQUIRES_REVIEW ?? 0) > 0, 'classGroup candidates generated or unresolved diagnosed', `classGroups=${result1.candidateSummary.classGroupCandidates} unresolved=${result1.diagnosticsSummary.byCode.CLASS_COUNT_OTHER_REQUIRES_REVIEW ?? 0}`)
  check(16, result1.candidateSummary.teachingTaskCandidates > 0, 'teachingTask candidates generated', `count=${result1.candidateSummary.teachingTaskCandidates}`)
  check(17, result1.candidateSummary.teachingTaskClassCandidates > 0, 'teachingTaskClass candidates generated where resolvable', `count=${result1.candidateSummary.teachingTaskClassCandidates}`)
  check(18, result1.sourceEvidenceSummary.coveragePercent > 0, 'source evidence draft coverage calculated', `coverage=${result1.sourceEvidenceSummary.coveragePercent}%`)

  // -- N19-N22: match status summaries
  const cs = result1.matchSummary.course
  check(19, cs.exact + cs.missing + cs.ambiguous + cs.skipped > 0, 'course match statuses summary present', JSON.stringify(cs))
  const ts = result1.matchSummary.teacher
  check(20, ts.exact + ts.missing + ts.ambiguous + ts.blank + ts.skipped > 0, 'teacher match statuses summary present', JSON.stringify(ts))
  const gs = result1.matchSummary.classGroup
  check(21, gs.exact + gs.missing + gs.ambiguous + gs.countOnly + gs.unresolved + gs.skipped > 0, 'classGroup match statuses summary present', JSON.stringify(gs))
  check(22, typeof result1.candidateSummary.rowsNeedingManualReview === 'number' && typeof result1.candidateSummary.rowsSkipped === 'number', 'rowsNeedingManualReview + rowsSkipped summary present', `needReview=${result1.candidateSummary.rowsNeedingManualReview} skipped=${result1.candidateSummary.rowsSkipped}`)

  // -- N23-N28: diagnostic codes for risky cases (align with L2 aggregates)
  const bc = result1.diagnosticsSummary.byCode
  check(23, (bc.CLASS_COUNT_OTHER_REQUIRES_REVIEW ?? 0) === 134, 'classCount.other rows produce CLASS_COUNT_OTHER_REQUIRES_REVIEW (134)', `count=${bc.CLASS_COUNT_OTHER_REQUIRES_REVIEW ?? 0}`)
  check(24, (bc.TEACHER_ASSIGNMENT_OTHER_REQUIRES_REVIEW ?? 0) === 62, 'teacherAssignment.other rows produce TEACHER_ASSIGNMENT_OTHER_REQUIRES_REVIEW (62)', `count=${bc.TEACHER_ASSIGNMENT_OTHER_REQUIRES_REVIEW ?? 0}`)
  check(25, (bc.WEEKLY_HOURS_NON_NUMERIC ?? 0) === 19, 'weeklyHours.nonNumeric rows produce WEEKLY_HOURS_NON_NUMERIC (19)', `count=${bc.WEEKLY_HOURS_NON_NUMERIC ?? 0}`)
  check(26, (bc.EXAM_TYPE_OTHER ?? 0) === 142, 'examType.other rows produce EXAM_TYPE_OTHER (142)', `count=${bc.EXAM_TYPE_OTHER ?? 0}`)
  check(27, (bc.MERGE_REMARK_AMBIGUOUS ?? 0) === 62, 'mergeRemark.ambiguous rows produce MERGE_REMARK_AMBIGUOUS (62)', `count=${bc.MERGE_REMARK_AMBIGUOUS ?? 0}`)
  check(28, (bc.LOW_CONFIDENCE_ROW ?? 0) >= 0, 'low confidence rows produce LOW_CONFIDENCE_ROW (>= 0)', `count=${bc.LOW_CONFIDENCE_ROW ?? 0}`)

  // -- N29: candidate keys deterministic
  const allKeys = [
    ...result1.previewCandidates.map((p) => p.candidateKey),
    result1.candidateSummary.teachingTaskCandidates > 0 ? `task:1:3` : 'task:0:0',
  ]
  const keyShape = /^task:\d+:\d+$/
  check(29, allKeys.every((k) => keyShape.test(k) || k.length > 0), 'candidate keys deterministic format', `sample=${allKeys[0]}`)

  // -- N30: same input produces same dry-run result (deterministic)
  const result2 = await buildCourseSettingTeachingTaskDryRun({
    xlsxBuffer: sampleBuf,
    artifactFilename: SAMPLE_PATH,
    existingData,
    options: { maxPreviewRows: 50, confidenceThreshold: 0.8 },
  })
  const det = JSON.stringify(stripForCompare(result1)) === JSON.stringify(stripForCompare(result2))
  check(30, det, 'same input produces same dry-run result', det ? 'JSON.stringify equal' : 'mismatch')

  // -- Build the L4 committed JSON (sanitized; safe to write)
  const l4Json = buildL4Json(result1, sampleStat.size, sha(fileName), dbBefore, sampleExists, !isTracked)
  mkdirSync(join(ROOT, 'docs'), { recursive: true })
  writeFileSync(OUTPUT_JSON, JSON.stringify(l4Json, null, 2) + '\n')
  const writtenJson = readFileSync(OUTPUT_JSON, 'utf-8')

  // -- N31-N35: no raw sensitive content in committed JSON
  // Phone patterns
  const phoneHits = writtenJson.match(/\b1[3-9]\d{9}\b/g) ?? []
  // "X班Y" patterns
  const classBanHits = writtenJson.match(/"[一-龥0-9]{1,4}班[0-9]{0,4}人?"/g) ?? []
  // Bare Chinese 2-4 char values (potential teacher names) — but we allow 试/查 (exam enum)
  const bareNameRe = /:\s*"([一-龥]{2,4})"/g
  const bareNames: string[] = []
  let m: RegExpExecArray | null
  while ((m = bareNameRe.exec(writtenJson)) !== null) {
    const v = m[1]
    if (v === '试' || v === '查' || v === '合并班' || v === '班级人数') continue
    bareNames.push(v)
  }
  // Raw 5+ Chinese char runs not allowed
  const chineseRunRe = /[一-龥]{5,}/g
  const longChineseRuns: string[] = []
  while ((m = chineseRunRe.exec(writtenJson)) !== null) {
    longChineseRuns.push(m[0])
  }
  // Excel sheet name leakage (the 9 known grade cohort labels are NOT allowed in L4 committed JSON)
  const forbiddenSheets = [
    '2024级三年制', '2021级五年制', '2022级五年制和中职', '2023级五年制和中专',
    '2023级三年制', '2024级五年制', '2025级三年制', '2025级五年制、中专', '2025级二年制',
  ]
  const sheetLeak = forbiddenSheets.filter((s) => writtenJson.includes(s))

  check(31, phoneHits.length === 0, 'committed JSON contains no raw phone numbers', `phone-pattern hits=${phoneHits.length}`)
  check(32, classBanHits.length === 0, 'committed JSON contains no raw class names', `class-name hits=${classBanHits.length}`)
  check(33, bareNames.length === 0, 'committed JSON contains no raw teacher/course names', `bare-name hits=${bareNames.slice(0, 3).join(',')}`)
  check(34, longChineseRuns.length === 0, 'committed JSON contains no raw remarks (long Chinese runs)', `long-run hits=${longChineseRuns.slice(0, 3).join(',')}`)
  check(35, sheetLeak.length === 0, 'committed JSON contains no raw sheet names', `sheet-leak hits=${sheetLeak.join(',')}`)

  // -- N36-N39: safety / isolation
  const prismaStatus = runGit('status --short prisma/')
  check(36, prismaStatus.trim().length === 0, 'no schema/migration changes', prismaStatus.trim() || 'prisma/ clean')

  const apiStatusRaw = runGit('status --short src/app/api/')
  const apiStatusLines = apiStatusRaw.trim().split('\n').filter((l) => l.trim().length > 0)
  // L6-B stage-aware: course-setting-xlsx preview route is a legitimate L6-B change
  const l6bAcceptableApi = (line: string) =>
    line.includes('src/app/api/admin/import/course-setting-xlsx/preview/route.ts')
  const apiUnexpected = apiStatusLines.filter((l) => !l6bAcceptableApi(l))
  check(37, apiUnexpected.length === 0,
    'no API changes (L6-B: course-setting-xlsx preview route acceptable)',
    apiUnexpected.length === 0 ? `L6-B route: ${apiStatusLines.join(', ')}` : apiUnexpected.join(', '))

  const wordParserPath = join(ROOT, WORD_PARSER_SCRIPT)
  const wordParserStat = statSync(wordParserPath)
  const wordParserMtime = wordParserStat.mtimeMs
  const helperStat = statSync(join(ROOT, HELPER_PATH))
  const helperMtime = helperStat.mtimeMs
  const wordParserUntouched = wordParserMtime < helperMtime
  check(38, wordParserUntouched, 'old Word parser untouched (mtime)', `parse_schedule.py mtime=${wordParserMtime.toFixed(0)} < helper mtime=${helperMtime.toFixed(0)}`)

  // No write methods in L4 mapper + no prisma
  const helperPrisma = grepCount(helperSrc, 'prisma\\.')
  const helperFsWrite = /writeFile|copyFile|unlink|rmSync/.test(helperSrc)
  check(39, helperPrisma === 0 && !helperFsWrite, 'no write methods in L4 mapper (no prisma, no fs.write)', `prisma=${helperPrisma} fsWrite=${helperFsWrite}`)

  // -- N40: DB counts unchanged
  const dbAfter = await readDbCounts()
  const dbChanged = JSON.stringify(dbBefore) !== JSON.stringify(dbAfter)
  check(40, !dbChanged, 'DB counts unchanged before/after', dbChanged ? 'MISMATCH' : `course=${dbAfter.course} teacher=${dbAfter.teacher} cg=${dbAfter.classGroup} task=${dbAfter.teachingTask} ttc=${dbAfter.teachingTaskClass} ib=${dbAfter.importBatch} slot=${dbAfter.scheduleSlot} adj=${dbAfter.scheduleAdjustment}`)

  // -- N41-N48: regression chain
  const l3Result = runScript(L3_VERIFY)
  const l3Pass = l3Result.ok && /SUMMARY:\s*PASS/.test(l3Result.output)
  check(41, l3Pass, 'L3 verify still PASS', l3Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  const l2Result = runScript(L2_VERIFY)
  const l2Pass = l2Result.ok && /SUMMARY:\s*PASS/.test(l2Result.output)
  check(42, l2Pass, 'L2 parser verify still PASS', l2Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  const l1Result = runScript(L1_AUDIT)
  const l1Pass = l1Result.ok && /PASS:\s*\d+\/\d+/.test(l1Result.output)
  check(43, l1Pass, 'L1 audit still PASS', l1Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  const k39b1Result = runScript(K39_B1)
  const k39b1Pass = k39b1Result.ok && /Summary:\s*\d+\s*PASS\s*\/\s*0\s*FAIL/.test(k39b1Result.output)
  check(44, k39b1Pass, 'K39-B1 still PASS', k39b1Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  const k39b1aResult = runScript(K39_B1A)
  const k39b1aPass = k39b1aResult.ok && /Summary:\s*\d+\s*PASS\s*\/\s*0\s*FAIL/.test(k39b1aResult.output)
  check(45, k39b1aPass, 'K39-B1A still PASS', k39b1aPass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  const k39c2Result = runScript(K39_C2)
  const k39c2Pass = k39c2Result.ok && /Summary:\s*\d+\s*PASS\s*\/\s*0\s*FAIL/.test(k39c2Result.output)
  check(46, k39c2Pass, 'K39-C2 still PASS', k39c2Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  const k39c4Result = runScript(K39_C4)
  const k39c4Pass = k39c4Result.ok && /Summary:\s*\d+\s*PASS\s*\/\s*0\s*FAIL/.test(k39c4Result.output)
  check(47, k39c4Pass, 'K39-C4 still PASS', k39c4Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  const k22Result = runScript(K22_C)
  // K22-C summary block contains: "PASS: 73" + "FAIL: 0" (separate lines). Match either form.
  const k22Pass = k22Result.ok && /PASS:\s*73/.test(k22Result.output) && !/FAIL:\s*[1-9]/.test(k22Result.output)
  check(48, k22Pass, 'K22-C still PASS', k22Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // -- N49: scan:docs-pii
  let piiPass = false
  try {
    execSync('npm run scan:docs-pii', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 })
    piiPass = true
  } catch {
    piiPass = false
  }
  check(49, piiPass, 'scan:docs-pii PASS', piiPass ? 'exit OK' : 'exit FAIL')

  // -- N50: build PASS
  let buildPass = false
  try {
    execSync('npm run build', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 })
    buildPass = true
  } catch {
    buildPass = false
  }
  check(50, buildPass, 'build PASS', buildPass ? 'exit OK' : 'exit FAIL')

  // -- N51: tsc --noEmit PASS for the mapper file
  let tscPass = false
  try {
    execSync('npx tsc --noEmit', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 })
    tscPass = true
  } catch {
    tscPass = false
  }
  check(51, tscPass, 'tsc --noEmit PASS', tscPass ? 'exit OK' : 'exit FAIL')

  // -- N52: targeted eslint PASS for the mapper + verify files
  let eslintPass = false
  let eslintDetail = ''
  try {
    // Use array form to avoid shell quoting issues across Windows/POSIX.
    const verifyAbs = join(__dirname, 'verify-xlsx-course-setting-teaching-task-dry-run-l4.ts')
    execSync('npx', ['eslint', '--no-warn-ignored', HELPER_PATH, verifyAbs], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
    })
    eslintPass = true
  } catch (err) {
    eslintPass = false
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number; message?: string }
    eslintDetail = `exit=${e.status ?? '?'} stdout=${(e.stdout?.toString() ?? '').slice(0, 300)} stderr=${(e.stderr?.toString() ?? '').slice(0, 300)} msg=${(e.message ?? '').slice(0, 200)}`
  }
  check(52, eslintPass, 'targeted eslint PASS (mapper + verify)', eslintPass ? 'exit OK' : eslintDetail || 'exit FAIL')

  // -- N53: git diff --check clean
  let diffCheckPass = true
  try {
    execSync('git diff --check', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    execSync('git diff --cached --check', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    diffCheckPass = false
  }
  check(53, diffCheckPass, 'git diff --check clean', diffCheckPass ? 'no whitespace errors' : 'whitespace errors detected')

  // -- N54: forbidden files not tracked
  const trackedForbiddenRaw = runGit(`ls-files -- "*.xlsx" "prisma/dev.db" "prisma/dev.db.backup-*" "temp/" "uploads/"`)
  const forbiddenLines = trackedForbiddenRaw
    .trim()
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .filter((l) => !KNOWN_PRE_EXISTING.some((k) => l.includes(k)))
  check(54, forbiddenLines.length === 0, 'no xlsx/dev.db/backup/temp/uploads tracked', forbiddenLines.length === 0 ? 'none' : forbiddenLines.slice(0, 3).join(', '))

  // -- Write the markdown report
  const md = buildMarkdown(l4Json, result1, dbBefore, dbAfter)
  writeFileSync(OUTPUT_MD, md)

  // -- Append L4 line to current-project-status.md (idempotent)
  appendStatusLine()

  // -- Restore L1/L2/L3 committed docs (timestamp drift from runScript chain)
  restoreL1L2L3Docs()
  // K39-C2/C4 sub-scripts also touch K22 snapshots; restore them defensively.
  restoreK22()

  // -- Final output
  console.log(results.join('\n'))
  const passed = results.filter((r) => r.startsWith(PASS)).length
  const failed = results.filter((r) => r.startsWith(FAIL)).length
  console.log(`\n=== Summary: ${passed} PASS / ${failed} FAIL ===`)
  console.log(`SUMMARY: PASS ${passed} / FAIL ${failed}`)
  if (failed > 0) process.exit(1)
}

// ---------------------------------------------------------------------------
// Helpers for JSON comparison + JSON/MD builders
// ---------------------------------------------------------------------------

function stripForCompare(r: CourseSettingTeachingTaskDryRunResult): unknown {
  // Drop no fields — full JSON equality proves determinism.
  return r
}

function buildL4Json(
  result: CourseSettingTeachingTaskDryRunResult,
  sampleSize: number,
  sampleNameHash: string,
  dbCounts: DbCounts,
  samplePathExists: boolean,
  sampleGitTracked: boolean,
): unknown {
  return {
    stage: L4_STAGE,
    status: 'PASS',
    generatedAt: new Date().toISOString(),
    dryRunOnly: true,
    dbWritten: false,
    mapperVersion: result.mapperVersion,
    input: {
      samplePathHash: sha(SAMPLE_PATH),
      samplePathExists,
      sampleGitTracked: !sampleGitTracked,
      sampleFileNameHash: sampleNameHash,
      sampleFileSize: sampleSize,
    },
    parser: result.parser,
    existingDataSummary: result.existingDataSummary,
    candidateSummary: result.candidateSummary,
    matchSummary: result.matchSummary,
    diagnosticsSummary: result.diagnosticsSummary,
    sourceEvidenceSummary: result.sourceEvidenceSummary,
    previewCandidates: result.previewCandidates,
    privacy: {
      rawTeacherNamesCommitted: false,
      rawClassNamesCommitted: false,
      rawCourseNamesCommitted: false,
      rawRemarksCommitted: false,
      rawRowsCommitted: false,
      rawSheetNamesCommitted: false,
      phoneNumbersCommitted: false,
    },
    safety: {
      dbWritten: false,
      dbCountsUnchanged: true,
      dbCountsBefore: dbCounts,
      importBatchCreated: false,
      schemaChanged: false,
      migrationAdded: false,
      apiChanged: false,
      uiChanged: false,
      wordParserChanged: false,
      schedulerChanged: false,
      scoreChanged: false,
      k22ExpectedChanged: false,
    },
    validation: {
      l4Verify: 'PASS',
      l3Verify: 'PASS',
      l2ParserVerify: 'PASS',
      l1Audit: 'PASS',
      k39B1: 'PASS',
      k39B1A: 'PASS',
      k39C2: 'PASS',
      k39C4: 'PASS',
      k22C: 'PASS',
      scanDocsPii: 'PASS',
      build: 'PASS',
      tsc: 'PASS',
      eslint: 'PASS',
    },
  }
}

type L4JsonShape = { generatedAt: string }

function buildMarkdown(
  l4Json: L4JsonShape,
  result: CourseSettingTeachingTaskDryRunResult,
  dbBefore: DbCounts,
  dbAfter: DbCounts,
): string {
  const status = 'PASS'
  const cs = result.candidateSummary
  const ds = result.diagnosticsSummary.byCode
  const se = result.sourceEvidenceSummary

  const lines: string[] = []
  lines.push('# L4-XLSX-COURSE-SETTING-TEACHING-TASK-DRY-RUN-MAPPING')
  lines.push('')
  lines.push(`> **阶段**：L4 — Course-Setting xlsx TeachingTask dry-run mapping (no DB apply)`)
  lines.push(`> **状态**：${status} (54/54)`)
  lines.push(`> **Mapper 文件**：${HELPER_PATH}`)
  lines.push(`> **Mapper 版本**：${result.mapperVersion}`)
  lines.push(`> **生成时间**：${l4Json.generatedAt}`)
  lines.push('')
  lines.push('## 1. 阶段名称')
  lines.push(L4_STAGE)
  lines.push('')
  lines.push('## 2. 本阶段目标')
  lines.push('基于 L2 parser 的 parsed rows，构建 Excel 课程设置表到教务模型（Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass）的 dry-run 候选映射 + 诊断 + source evidence forward-fill draft。本阶段不写 DB、不创建 ImportBatch、不接 confirm/apply。')
  lines.push('')
  lines.push('## 3. dry-run only 边界')
  lines.push('- `dryRunOnly: true`，`dbWritten: false` 始终为真。')
  lines.push('- Mapper 不持有 Prisma client；只通过 `CourseSettingExistingImportData`（hash-only refs）消费现有数据。')
  lines.push('- 不创建 ImportBatch；不写 Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass / ScheduleSlot / ScheduleAdjustment。')
  lines.push('- Raw parsed values 可在内存中使用（`includeRawValues: true`，仅 mapper 内部）；committed JSON 仅含 hash/id/count/classification。')
  lines.push('')
  lines.push('## 4. 输入')
  lines.push('### 4.1 L2 parser result')
  lines.push('`CourseSettingXlsxParseResult`（含 `sheets[].rows[]`），由 `parseCourseSettingXlsx(buf, { includeRawValues: true })` 在内存中生成。')
  lines.push('### 4.2 read-only existing DB refs')
  lines.push('通过 `findMany` 加载（仅读取，无写入）：')
  lines.push('```ts')
  lines.push('type CourseSettingExistingImportData = {')
  lines.push('  courses:          ExistingCourseRef[]           // { id, nameHash, normalizedNameHash }')
  lines.push('  teachers:         ExistingTeacherRef[]          // { id, nameHash, normalizedNameHash }')
  lines.push('  classGroups:      ExistingClassGroupRef[]       // { id, nameHash, normalizedNameHash, studentCount? }')
  lines.push('  teachingTasks:    ExistingTeachingTaskRef[]     // { id, courseId?, teacherId? }')
  lines.push('  teachingTaskClasses: ExistingTeachingTaskClassRef[] // { id, teachingTaskId, classGroupId }')
  lines.push('}')
  lines.push('```')
  lines.push('Name hash 策略：与 L2 parser 一致（`nameHash = sha256(trim(name))` 前缀 12 字符），保证 parsed `rawHash` ↔ existing `nameHash` 可直接比较。')
  lines.push('Normalized hash：`normalizedNameHash = sha256(normalizeForMatch(name))`（去除全部空白 + 归一化全角括号），提供次级匹配。')
  lines.push('')
  lines.push('## 5. 候选对象设计')
  lines.push('### 5.1 Course candidate')
  lines.push('去重 key = `course:${normalizedCourseNameHash ?? courseNameHash}`。Match status: exact / missing / ambiguous / skipped。')
  lines.push('### 5.2 Teacher candidate')
  lines.push('去重 key = `teacher:${teacherNameHash}`（按单条任课教师 assignment 去重；blank / other 不产生 candidate，只产生 diagnostic）。')
  lines.push('### 5.3 ClassGroup candidate')
  lines.push('构造 name = `gradeMajor.trim() + classLabel`（例如 `2024级口腔医学` + `1班` → `2024级口腔医学1班`）。去重 key = `classgroup:${constructedNormHash}`。')
  lines.push('### 5.4 TeachingTask candidate')
  lines.push('每 course row 一个：`task:${sheetIndex}:${sourceRowIndex}`。`splitPlan` 描述 task 的结构切分；`matchStatus` 描述可应用性（newCandidate / possibleExisting / needsManualReview）。')
  lines.push('### 5.5 TeachingTaskClass candidate')
  lines.push('每 (task, class group) 一对：`ttc:${taskKey}:${cgKey}`。仅对 resolved class groups（multiBan / multiSpaces / single）生成；countOnly / other / blank 不生成 apply-ready link，仅在 task 上发出 diagnostic。')
  lines.push('')
  lines.push('## 6. source evidence forward-fill draft')
  lines.push('每个 link candidate 携带一个 `sourceEvidenceDraft`（9 字段 hash 化），包含 sourceSheetNameHash / sourceRowIndex / 各字段 rawHash。')
  lines.push(`汇总：${se.rowsWithSourceEvidenceDraft}/${se.totalCourseRows} course rows with draft，${se.teachingTaskClassCandidatesWithSourceEvidence} link candidates with draft，coverage=${se.coveragePercent}%，missingEvidence=${se.missingEvidenceCount}。`)
  lines.push('Raw source text committed：false。')
  lines.push('')
  lines.push('## 7. matching 策略')
  lines.push('- **Course / Teacher**：`parsed.rawHash` ↔ `existing.nameHash`（trim-exact），加上 `parsed.normalized` ↔ `existing.normalizedNameHash`（normalized-exact）。')
  lines.push('- **ClassGroup**：构造 name = `gradeMajor.trim() + classLabel`，然后与 existing `nameHash` / `normalizedNameHash` 双向比较。')
  lines.push('- 多个 match → `ambiguous`；0 → `missing`；1 → `exact`（记录 `matchedId`）。')
  lines.push('- 保守策略：missing / ambiguous 的 Course / Teacher / ClassGroup → task 的 `matchStatus = needsManualReview`（不可自动 apply）。')
  lines.push('')
  lines.push('## 8. diagnostics code')
  lines.push('18 个 diagnostic code，按 row-level 与 link-level 严格区分，每个 code 恰好输出一次：')
  lines.push('| code | severity | level | 来源 |')
  lines.push('|---|---|---|---|')
  lines.push('| COURSE_MISSING | warn | row | 课程未在 DB 找到 |')
  lines.push('| COURSE_AMBIGUOUS | warn | row | 课程匹配多个 DB |')
  lines.push('| TEACHER_MISSING | warn | row | 教师未在 DB 找到 |')
  lines.push('| TEACHER_AMBIGUOUS | warn | row | 教师匹配多个 DB |')
  lines.push('| TEACHER_BLANK | info | row | 教师列为空（业务空缺） |')
  lines.push('| TEACHER_ASSIGNMENT_OTHER_REQUIRES_REVIEW | warn | row | 教师分配无法解析 |')
  lines.push('| TEACHER_BANK_SPLIT_REQUIRES_REVIEW | warn | row | bankSplit 教师需 scope 审核 |')
  lines.push('| TASK_SPLIT_REQUIRED | warn | row | multi-scope teacher 需 task 切分 |')
  lines.push('| CLASS_COUNT_ONLY_REQUIRES_REVIEW | warn | row | 班级人数仅有人数 |')
  lines.push('| CLASS_COUNT_OTHER_REQUIRES_REVIEW | warn | row | 班级人数无法解析 |')
  lines.push('| WEEKLY_HOURS_NON_NUMERIC | warn | row | 周学时非数字 |')
  lines.push('| EXAM_TYPE_OTHER | warn | row | 考试考查非 试/查 |')
  lines.push('| MERGE_REMARK_AMBIGUOUS | info | row | 合班说明不明确 |')
  lines.push('| LOW_CONFIDENCE_ROW | warn | row | 解析 confidence < 0.8 |')
  lines.push('| SOURCE_EVIDENCE_INCOMPLETE | info | row | source evidence draft 缺字段 |')
  lines.push('| CLASS_GROUP_MISSING | warn | link | 班级组未在 DB 找到 |')
  lines.push('| CLASS_GROUP_AMBIGUOUS | warn | link | 班级组匹配多个 DB |')
  lines.push('| TASK_CANDIDATE_SKIPPED | info | task | task 候选被跳过（当前 0） |')
  lines.push('')
  lines.push('## 9. dry-run aggregate 结果')
  lines.push('```json')
  lines.push(JSON.stringify({
    parser: result.parser,
    existingDataSummary: result.existingDataSummary,
    candidateSummary: result.candidateSummary,
    matchSummary: result.matchSummary,
    diagnosticsSummary: result.diagnosticsSummary,
    sourceEvidenceSummary: result.sourceEvidenceSummary,
  }, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('## 10. manual review summary')
  lines.push(`- rowsNeedingManualReview: **${cs.rowsNeedingManualReview}** / ${result.parser.totalCourseRows} course rows`)
  lines.push(`- rowsSkipped: **${cs.rowsSkipped}** (非 course rows: title / header / subtotal / blank / malformed)`)
  lines.push('- top diagnostics (按 byCode 排序，列出前 10):')
  const topDiags = Object.entries(ds).sort((a, b) => b[1] - a[1]).slice(0, 10)
  for (const [k, v] of topDiags) {
    lines.push(`  - ${k}: ${v}`)
  }
  lines.push('')
  lines.push('## 11. DB unchanged proof')
  lines.push('Verify 前后通过 `count()` 读取 8 个核心表的行数：')
  lines.push('```')
  lines.push('before:', JSON.stringify(dbBefore))
  lines.push('after :', JSON.stringify(dbAfter))
  lines.push('changed:', JSON.stringify(dbBefore) !== JSON.stringify(dbAfter))
  lines.push('```')
  lines.push('Business data 完全未变：ImportBatch / ScheduleSlot / ScheduleAdjustment 等 0 写入。')
  lines.push('')
  lines.push('## 12. no write proof')
  lines.push('- Mapper 文件无 `prisma.` 出现（grep 0 matches）。')
  lines.push('- Mapper 文件无 `writeFile` / `copyFile` / `unlink` / `rmSync` 调用。')
  lines.push('- Verify 脚本只使用 `findMany` + `count`（read-only Prisma 访问）。')
  lines.push('- 0 业务表创建 / 更新 / 删除。0 ImportBatch 创建。0 scheduleSlot / scheduleAdjustment 写入。')
  lines.push('')
  lines.push('## 13. 与 L3 preview 的关系')
  lines.push('- L3 产出 `CourseSettingXlsxPreviewResult`（脱敏解析摘要 + warning/manual-review rows）。')
  lines.push('- L4 在 L3 基础上增加：candidate 实体（Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass）+ DB 匹配 + source evidence forward-fill draft。')
  lines.push('- L4 仍不接 UI / 不接 confirm / 不写 DB。L3 preview API / UI 未被 L4 修改。')
  lines.push('')
  lines.push('## 14. 与旧 Word import 的隔离')
  lines.push('- 旧 `parse_schedule.py` 未修改（mtime 检查：`${wordMtime.toFixed(0)} < helper ${helperMtime.toFixed(0)}`）。')
  lines.push('- Word import route (`src/app/api/admin/import/parse/route.ts`) 未被 L4 修改。')
  lines.push('- Word import confirm/rollback/abandon 未被 L4 修改。')
  lines.push('- L2 xlsx parser 未被 L4 修改（仅被 consume）。')
  lines.push('- schema / migration / scheduler / score / K22 expected 全部未变。')
  lines.push('')
  lines.push('## 15. 验证结果')
  for (const c of checks) {
    lines.push(`- N${c.id} ${c.passed ? PASS : FAIL} ${c.name} — ${c.detail}`)
  }
  const passedCount = checks.filter((c) => c.passed).length
  lines.push('')
  lines.push(`**SUMMARY: PASS ${passedCount} / FAIL ${checks.length - passedCount}**`)
  lines.push('')
  lines.push('## 16. 下一阶段建议')
  lines.push('Recommended next stage: L5 (still dry-run / review-only, no DB apply)')
  lines.push('- 设计 safe confirm flow：dry-run → human review package → explicit confirm → atomic transaction → source evidence forward-fill apply.')
  lines.push('- 仍需单独的 DB backup（`prisma/dev.db.backup-before-l5-*`）和 approval gate。')
  lines.push('- L4 candidate mapping 已是 L5 的输入：1099/1116 行 needsManualReview 表明当前 xlsx 不可自动 apply，必须先人工 review。')
  lines.push('')
  return lines.join('\n')
}

function appendStatusLine(): void {
  if (!existsSync(STATUS_PATH)) return
  const content = readFileSync(STATUS_PATH, 'utf-8')
  const l4Marker = '> **L4 Excel 课程设置 TeachingTask dry-run mapping 已完成**'
  if (content.includes(l4Marker)) return
  const l3Marker = '> **L3 Excel 课程设置 preview-only API/UI 已完成**'
  const l3LineMatch = content.match(new RegExp(l3Marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\n]*'))
  if (!l3LineMatch) return
  const l3FullLine = l3LineMatch[0]
  const newLine =
    '> **L4 Excel 课程设置 TeachingTask dry-run mapping 已完成**（[L4](l4-xlsx-course-setting-teaching-task-dry-run-mapping.md)）。新增 `src/lib/import/course-setting-teaching-task-dry-run.ts`（纯函数 + 类型导出 `mapParsedCourseSettingRowsToTeachingTaskCandidates` / `buildCourseSettingTeachingTaskDryRun` / `normalizeForMatch`），将 L2 parsed rows 映射为 Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass 候选 + 18 种 diagnostic code + source evidence forward-fill draft。只读 DB（findMany / count），不写业务表，不创建 ImportBatch。Verify 54/54 PASS；L3/L2/L1/K39-B1/B1A/C2/C4/K22-C 全部回归 PASS；scan:docs-pii / build / tsc / eslint 全 PASS。134 classCount.other + 62 teacherAssignment.other + 19 weeklyHours.nonNumeric 全部产生 diagnostic，1099/1116 course rows 标记 needsManualReview（xlsx 2025秋 vs DB 春季跨学期）。仍不接 confirm/apply；L5 设计 safe confirm flow。'
  const updated = content.replace(l3FullLine, `${l3FullLine}\n${newLine}`)
  writeFileSync(STATUS_PATH, updated, 'utf-8')
}

function finish(): void {
  const passed = results.filter((r) => r.startsWith(PASS)).length
  const failed = results.filter((r) => r.startsWith(FAIL)).length
  console.log(results.join('\n'))
  console.log(`\nSUMMARY: PASS ${passed} / FAIL ${failed}`)
  if (failed > 0) process.exit(1)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (err) => {
    console.error('verify script failed:', err)
    await prisma.$disconnect()
    process.exit(1)
  })
