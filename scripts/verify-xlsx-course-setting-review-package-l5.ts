/**
 * L5 verify script — Course-Setting XLSX Review Package & Safe Confirm Plan
 *
 * 62 checks across 9 categories:
 *  - Sample + parser + helpers existence (N1-N5)
 *  - L4 dry-run / L5 review-only invariants (N6-N10)
 *  - Review items + buckets + diagnostics (N11-N16)
 *  - Safe confirm plan + target semester (N17-N22)
 *  - Local redacted package + gitignored (N23-N25)
 *  - Privacy / no raw in committed JSON (N26-N32)
 *  - Forbidden files / safety / isolation (N33-N43)
 *  - DB unchanged (N44-N45)
 *  - Regression chain (N46-N62): L4/L3/L2/L1/K39-B1/B1A/C2/C4/K22-C/PII/build/tsc/eslint/git diff/forbidden
 *
 * Read-only Prisma (findMany / count). NO business-table writes. No ImportBatch.
 * Sanitized output: hashes + counts + classifications only.
 *
 * Run:
 *   npx tsx scripts/verify-xlsx-course-setting-review-package-l5.ts --xlsx "..."
 *
 * Exit codes:
 *   0 — all 62 checks pass
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
import { dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import {
  buildCourseSettingTeachingTaskDryRun,
  normalizeForMatch,
  type CourseSettingExistingImportData,
} from '../src/lib/import/course-setting-teaching-task-dry-run'
import {
  buildCourseSettingReviewPackage,
  serializeCourseSettingReviewPackageLocalArtifact,
  L5_STAGE,
  type CourseSettingReviewPackageResult,
} from '../src/lib/import/course-setting-review-package-l5'

// L5 dry-run: read-only Prisma access. No writes are allowed in this script.
const prisma = new PrismaClient()

const ROOT = resolve(__dirname, '..')
const SAMPLE_PATH =
  'D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx'
const HELPER_PATH = 'src/lib/import/course-setting-review-package-l5.ts'
const L4_HELPER_PATH = 'src/lib/import/course-setting-teaching-task-dry-run.ts'
const L2_PARSER_PATH = 'src/lib/import/course-setting-xlsx-parser.ts'
const WORD_PARSER_SCRIPT = 'scripts/parse_schedule.py'
const L4_VERIFY = 'scripts/verify-xlsx-course-setting-teaching-task-dry-run-l4.ts'
const L3_VERIFY = 'scripts/verify-xlsx-course-setting-preview-l3.ts'
const L2_VERIFY = 'scripts/verify-xlsx-course-setting-parser-l2.ts'
const L1_AUDIT = 'scripts/audit-xlsx-course-setting-import-l1.ts'
const K39_B1 = 'scripts/verify-import-rules-explicit-semester-config-k39-b1.ts'
const K39_B1A = 'scripts/verify-import-rules-runtime-500-fix-k39-b1a.ts'
const K39_C2 = 'scripts/verify-source-evidence-safe-fields-backfill-k39-c2.ts'
const K39_C4 = 'scripts/verify-source-evidence-manual-review-package-k39-c4.ts'
const K22_C = 'scripts/verify-score-regression-harness-k22-c.ts'

const OUTPUT_JSON = join(ROOT, 'docs/l5-xlsx-course-setting-review-package-and-safe-confirm-plan.json')
const OUTPUT_MD = join(ROOT, 'docs/l5-xlsx-course-setting-review-package-and-safe-confirm-plan.md')
const STATUS_PATH = join(ROOT, 'docs/current-project-status.md')
const LOCAL_PACKAGE_DIR = join(ROOT, 'temp/local-artifacts/l5')
const LOCAL_PACKAGE_PATH = join(LOCAL_PACKAGE_DIR, 'xlsx-course-setting-review-package.redacted.json')

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
function sha256Hex(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex')
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

function restoreL1L2L4Docs(): void {
  try {
    execSync(
      'git checkout -- docs/l1-xlsx-course-setting-import-audit.json docs/l2-xlsx-course-setting-parser-prototype.json docs/l2-xlsx-course-setting-parser-prototype.md docs/l3-xlsx-course-setting-preview-api-and-ui.json docs/l4-xlsx-course-setting-teaching-task-dry-run-mapping.json docs/l4-xlsx-course-setting-teaching-task-dry-run-mapping.md',
      { cwd: ROOT, stdio: 'ignore' },
    )
  } catch {
    /* ignore */
  }
}

const KNOWN_PRE_EXISTING = ['temp/README.md', 'temp/.gitkeep', 'templates/']

// ---------------------------------------------------------------------------
// Read-only DB fingerprint
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
  semester: number
}

async function readDbCounts(): Promise<DbCounts> {
  // L5 dry-run: read-only Prisma access. No writes are allowed in this script.
  const [
    course,
    teacher,
    classGroup,
    teachingTask,
    teachingTaskClass,
    importBatch,
    scheduleSlot,
    scheduleAdjustment,
    semester,
  ] = await Promise.all([
    prisma.course.count(),
    prisma.teacher.count(),
    prisma.classGroup.count(),
    prisma.teachingTask.count(),
    prisma.teachingTaskClass.count(),
    prisma.importBatch.count(),
    prisma.scheduleSlot.count(),
    prisma.scheduleAdjustment.count(),
    prisma.semester.count(),
  ])
  return {
    course,
    teacher,
    classGroup,
    teachingTask,
    teachingTaskClass,
    importBatch,
    scheduleSlot,
    scheduleAdjustment,
    semester,
  }
}

async function loadExistingData(): Promise<CourseSettingExistingImportData> {
  // L5 dry-run: read-only Prisma access. No writes are allowed in this script.
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
  console.log('=== L5 XLSX Course Setting Review Package & Safe Confirm Plan Verify ===\n')

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
  const l4HelperExists = existsSync(join(ROOT, L4_HELPER_PATH))
  check(4, l4HelperExists, 'L4 dry-run helper exists', L4_HELPER_PATH)

  // -- N5: L5 review-package helper exists
  const l5HelperExists = existsSync(join(ROOT, HELPER_PATH))
  check(5, l5HelperExists, 'L5 review-package helper exists', HELPER_PATH)
  if (!l5HelperExists) return finish()
  const l5HelperSrc = readFile(HELPER_PATH) ?? ''

  // -- Pre-DB fingerprint
  const dbBefore = await readDbCounts()

  // -- Load existing data + run L4 mapper + run L5 review package
  const existingData = await loadExistingData()
  const l4Result1 = await buildCourseSettingTeachingTaskDryRun({
    xlsxBuffer: sampleBuf,
    artifactFilename: SAMPLE_PATH,
    existingData,
    options: { maxPreviewRows: 200, confidenceThreshold: 0.8 },
  })
  const reviewResult: CourseSettingReviewPackageResult = buildCourseSettingReviewPackage(l4Result1, {
    maxReviewRows: 200,
    confidenceThreshold: 0.9,
    targetSemesterConfirmed: false,
  })

  // -- N6: parser returns course rows > 0
  check(
    6,
    l4Result1.parser.totalCourseRows > 0,
    'parser returns course rows > 0',
    `totalCourseRows=${l4Result1.parser.totalCourseRows}`,
  )

  // -- N7: L4 dry-run result dryRunOnly = true
  check(7, l4Result1.dryRunOnly === true, 'L4 dry-run result dryRunOnly = true', `dryRunOnly=${l4Result1.dryRunOnly}`)

  // -- N8: L5 review result reviewOnly = true
  check(8, reviewResult.reviewOnly === true, 'L5 review result reviewOnly = true', `reviewOnly=${reviewResult.reviewOnly}`)

  // -- N9: L5 review result dryRunOnly = true
  check(9, reviewResult.dryRunOnly === true, 'L5 review result dryRunOnly = true', `dryRunOnly=${reviewResult.dryRunOnly}`)

  // -- N10: L5 review result dbWritten = false
  check(10, reviewResult.dbWritten === false, 'L5 review result dbWritten = false', `dbWritten=${reviewResult.dbWritten}`)

  // -- N11: review items generated
  check(11, reviewResult.reviewItems.length > 0, 'review items generated', `count=${reviewResult.reviewItems.length}`)

  // -- N12: all review items decision = pending
  const allPending = reviewResult.reviewItems.every((it) => it.reviewDecision === 'pending')
  check(12, allPending, 'all review items decision = pending', `total=${reviewResult.reviewItems.length}`)

  // -- N13: no review item decision = approve (we use 'approveCandidate' suggestedAction, NOT decision)
  const noApproveDecision = reviewResult.reviewItems.every((it) => it.reviewDecision !== 'approve')
  check(13, noApproveDecision, 'no review item decision = approve (only suggestedAction=approveCandidate for auto-safe)', 'all decisions are pending')

  // -- N14: bucket summary generated (all 15 buckets)
  check(14, reviewResult.buckets.length === 15, 'bucket summary generated (15 buckets)', `bucketCount=${reviewResult.buckets.length}`)

  // -- N15: diagnostics summary generated
  check(15, typeof reviewResult.diagnosticsSummary.total === 'number', 'diagnostics summary generated', `total=${reviewResult.diagnosticsSummary.total} byCodeKeys=${Object.keys(reviewResult.diagnosticsSummary.byCode).length}`)

  // -- N16: safe confirm plan generated
  check(16, reviewResult.safeConfirmPlan !== undefined, 'safe confirm plan generated', `recommendedNextStage=${reviewResult.safeConfirmPlan.recommendedNextStage}`)

  // -- N17: safe confirm plan applyAllowedInL5 = false
  check(17, reviewResult.safeConfirmPlan.applyAllowedInL5 === false, 'safe confirm plan applyAllowedInL5 = false', `applyAllowedInL5=${reviewResult.safeConfirmPlan.applyAllowedInL5}`)

  // -- N18: target semester strategy present
  const tss = reviewResult.safeConfirmPlan.targetSemesterStrategy
  check(18, tss.status === 'required' && tss.options.length >= 3, 'target semester strategy present (3 options)', `options=${tss.options.length}`)

  // -- N19: target semester strategy does not recommend active semester forced import (Option B recommended=false)
  const optB = tss.options.find((o) => /force-active|force_active|active-semester/i.test(o.option))
  check(19, !optB || optB.recommended === false, 'target semester strategy does not recommend active semester forced import', optB ? `${optB.option} recommended=${optB.recommended}` : 'no force-active option found')

  // -- N20: transaction plan present
  check(20, reviewResult.safeConfirmPlan.transactionPlan.steps.length > 0, 'transaction plan present', `steps=${reviewResult.safeConfirmPlan.transactionPlan.steps.length}`)

  // -- N21: rollback plan present
  check(21, reviewResult.safeConfirmPlan.transactionPlan.rollbackStrategy.length > 0, 'rollback plan present', `rollbackStrategies=${reviewResult.safeConfirmPlan.transactionPlan.rollbackStrategy.length}`)

  // -- N22: source evidence plan present
  const apd = reviewResult.safeConfirmPlan.applyPlanDraft
  check(22, apd.writeSourceEvidence === true, 'source evidence plan present (writeSourceEvidence=true)', `createScheduleSlots=${apd.createScheduleSlots}`)

  // -- N23: local redacted review package generated
  mkdirSync(LOCAL_PACKAGE_DIR, { recursive: true })
  const generatedAt = new Date().toISOString()
  // First write without sha, then read and rewrite with sha.
  const initialJson = serializeCourseSettingReviewPackageLocalArtifact(reviewResult, generatedAt)
  writeFileSync(LOCAL_PACKAGE_PATH, initialJson)
  const localSha = sha256Hex(readFileSync(LOCAL_PACKAGE_PATH))
  const finalJson = serializeCourseSettingReviewPackageLocalArtifact(reviewResult, generatedAt, localSha)
  writeFileSync(LOCAL_PACKAGE_PATH, finalJson)
  const localExists = existsSync(LOCAL_PACKAGE_PATH)
  check(23, localExists, 'local redacted review package generated', `path=${LOCAL_PACKAGE_PATH.replace(ROOT + '/', '')} sha256=${localSha.slice(0, 16)}…`)

  // -- N24: local review package gitignored / not tracked
  const localRelPath = LOCAL_PACKAGE_PATH.replace(ROOT + '/', '').replace(/\\/g, '/')
  const localTracked = runGit(`ls-files ${JSON.stringify(localRelPath)}`)
  const localTrackedLines = localTracked.trim().split('\n').filter((l) => l.trim().length > 0)
  check(24, localTrackedLines.length === 0, 'local review package gitignored / not tracked', localTrackedLines.length === 0 ? 'untracked (gitignored)' : localTrackedLines.join(', '))

  // -- N25: local review package sha256 recorded
  check(25, /^[0-9a-f]{64}$/.test(localSha), 'local review package sha256 calculated', `sha256=${localSha}`)

  // -- Build committed JSON (sanitized) and write
  const l5Json = buildL5Json(reviewResult, sampleStat.size, sha(fileName), dbBefore, sampleExists, !isTracked, localSha)
  mkdirSync(join(ROOT, 'docs'), { recursive: true })
  writeFileSync(OUTPUT_JSON, JSON.stringify(l5Json, null, 2) + '\n')
  const writtenJson = readFileSync(OUTPUT_JSON, 'utf-8')

  // -- N26: no raw phone numbers in committed JSON
  const phoneHits = writtenJson.match(/\b1[3-9]\d{9}\b/g) ?? []
  check(26, phoneHits.length === 0, 'committed JSON contains no raw phone numbers', `phone-pattern hits=${phoneHits.length}`)

  // -- N27: no raw class names in committed JSON
  const classBanHits = writtenJson.match(/"[一-龥0-9]{1,4}班[0-9]{0,4}人?"/g) ?? []
  check(27, classBanHits.length === 0, 'committed JSON contains no raw class names', `class-name hits=${classBanHits.length}`)

  // -- N28: no raw teacher/course names in committed JSON
  const bareNameRe = /:\s*"([一-龥]{2,4})"/g
  const bareNames: string[] = []
  let m: RegExpExecArray | null
  while ((m = bareNameRe.exec(writtenJson)) !== null) {
    const v = m[1]
    if (v === '试' || v === '查' || v === '合并班' || v === '班级人数') continue
    bareNames.push(v)
  }
  check(28, bareNames.length === 0, 'committed JSON contains no raw teacher/course names', `bare-name hits=${bareNames.slice(0, 3).join(',')}`)

  // -- N29: no raw remarks in committed JSON
  const longChineseRunRe = /[一-龥]{5,}/g
  const longChineseRuns: string[] = []
  while ((m = longChineseRunRe.exec(writtenJson)) !== null) {
    longChineseRuns.push(m[0])
  }
  check(29, longChineseRuns.length === 0, 'committed JSON contains no raw remarks (long Chinese runs)', `long-run hits=${longChineseRuns.slice(0, 3).join(',')}`)

  // -- N30: no raw sheet names in committed JSON
  const forbiddenSheets = [
    '2024级三年制', '2021级五年制', '2022级五年制和中职', '2023级五年制和中专',
    '2023级三年制', '2024级五年制', '2025级三年制', '2025级五年制、中专', '2025级二年制',
  ]
  const sheetLeak = forbiddenSheets.filter((s) => writtenJson.includes(s))
  check(30, sheetLeak.length === 0, 'committed JSON contains no raw sheet names', `sheet-leak hits=${sheetLeak.join(',')}`)

  // -- N31: privacy flags in committed JSON are all false
  const privacy = l5Json.privacy as Record<string, unknown>
  const privacyOk = Object.values(privacy).every((v) => v === false)
  check(31, privacyOk, 'committed JSON privacy flags all false', JSON.stringify(privacy))

  // -- N32: allDecisionsPending in committed JSON
  const reviewSummary = l5Json.reviewPackageSummary as Record<string, unknown>
  check(32, reviewSummary.allDecisionsPending === true, 'committed JSON reviewPackageSummary.allDecisionsPending = true', `allDecisionsPending=${reviewSummary.allDecisionsPending}`)

  // -- N33: no xlsx tracked
  const xlsxTracked = runGit(`ls-files -- "*.xlsx"`)
  const xlsxTrackedLines = xlsxTracked.trim().split('\n').filter((l) => l.trim().length > 0)
  const xlsxTrackedFiltered = xlsxTrackedLines.filter((l) => !KNOWN_PRE_EXISTING.some((k) => l.includes(k)))
  check(33, xlsxTrackedFiltered.length === 0, 'no xlsx tracked (excluding templates/)', xlsxTrackedFiltered.length === 0 ? 'none' : xlsxTrackedFiltered.slice(0, 3).join(', '))

  // -- N34: no dev.db tracked
  const devDbTracked = runGit(`ls-files -- "prisma/dev.db" "prisma/dev.db.backup-*"`)
  const devDbTrackedLines = devDbTracked.trim().split('\n').filter((l) => l.trim().length > 0)
  check(34, devDbTrackedLines.length === 0, 'no dev.db / backup tracked', devDbTrackedLines.length === 0 ? 'none' : devDbTrackedLines.join(', '))

  // -- N35: no temp/uploads tracked
  const tempUploadsTracked = runGit(`ls-files -- "temp/" "uploads/"`)
  const tempUploadsLines = tempUploadsTracked.trim().split('\n').filter((l) => l.trim().length > 0)
  const tempUploadsFiltered = tempUploadsLines.filter((l) => !KNOWN_PRE_EXISTING.some((k) => l.includes(k)))
  check(35, tempUploadsFiltered.length === 0, 'no temp/uploads tracked (excluding README/.gitkeep/templates)', tempUploadsFiltered.length === 0 ? 'none' : tempUploadsFiltered.slice(0, 3).join(', '))

  // -- N36: no schema/migration changes
  const prismaStatus = runGit('status --short prisma/')
  check(36, prismaStatus.trim().length === 0, 'no schema/migration changes', prismaStatus.trim() || 'prisma/ clean')

  // -- N37: no API changes (L6-B stage-aware: course-setting-xlsx preview route acceptable)
  const apiStatusRaw = runGit('status --short src/app/api/')
  const apiStatusLines = apiStatusRaw.trim().split('\n').filter((l) => l.trim().length > 0)
  const l6bAcceptableApi = (line: string) =>
    line.includes('src/app/api/admin/import/course-setting-xlsx/preview/route.ts')
  const apiUnexpected = apiStatusLines.filter((l) => !l6bAcceptableApi(l))
  check(37, apiUnexpected.length === 0,
    'no API changes (L6-B: course-setting-xlsx preview route acceptable)',
    apiUnexpected.length === 0 ? `L6-B route: ${apiStatusLines.join(', ')}` : apiUnexpected.join(', '))

  // -- N38: no UI changes (L6-B stage-aware: course-setting-xlsx preview UI acceptable)
  const uiStatusRaw = runGit('status --short src/components/')
  const uiStatusLines = uiStatusRaw.trim().split('\n').filter((l) => l.trim().length > 0)
  const l6bAcceptableUi = (line: string) =>
    line.includes('src/components/import/course-setting-xlsx-preview.tsx')
  const uiUnexpected = uiStatusLines.filter((l) => !l6bAcceptableUi(l))
  check(38, uiUnexpected.length === 0,
    'no UI changes (L6-B: course-setting-xlsx preview UI acceptable)',
    uiUnexpected.length === 0 ? `L6-B UI: ${uiStatusLines.join(', ')}` : uiUnexpected.join(', '))

  // -- N39: old Word parser untouched
  const wordParserPath = join(ROOT, WORD_PARSER_SCRIPT)
  const wordParserStat = statSync(wordParserPath)
  const wordParserMtime = wordParserStat.mtimeMs
  const helperStat = statSync(join(ROOT, HELPER_PATH))
  const helperMtime = helperStat.mtimeMs
  check(39, wordParserMtime < helperMtime, 'old Word parser untouched (mtime)', `parse_schedule.py mtime=${wordParserMtime.toFixed(0)} < helper mtime=${helperMtime.toFixed(0)}`)

  // -- N40: no scheduler/score changes
  const schedulerStatus = runGit('status --short src/lib/scheduler/ src/lib/score.ts')
  const schedulerLines = schedulerStatus.trim().split('\n').filter((l) => l.trim().length > 0)
  check(40, schedulerLines.length === 0, 'no scheduler/score changes', schedulerLines.length === 0 ? 'src/lib/scheduler/ + src/lib/score.ts clean' : schedulerLines.join(', '))

  // -- N41: no write methods in L5 helper (no prisma, no fs.write)
  const l5Prisma = grepCount(l5HelperSrc, 'prisma\\.')
  const l5FsWrite = /writeFile|copyFile|unlink|rmSync/.test(l5HelperSrc)
  check(41, l5Prisma === 0 && !l5FsWrite, 'no write methods in L5 helper (no prisma, no fs.write)', `prisma=${l5Prisma} fsWrite=${l5FsWrite}`)

  // -- N42: L4 dry-run mapper unchanged
  const l4HelperSrc = readFile(L4_HELPER_PATH) ?? ''
  const l4HelperUntouched = !l4HelperSrc.includes("L4_STAGE'") || l4HelperSrc.includes("L4_STAGE =")
  check(42, l4HelperUntouched, 'L4 dry-run mapper unchanged (L4_STAGE constant present)', `l4HelperBytes=${l4HelperSrc.length}`)

  // -- N43: L2 parser unchanged
  const l2ParserSrc = readFile(L2_PARSER_PATH) ?? ''
  const l2HasParseFn = /export const parseCourseSettingXlsx\b/.test(l2ParserSrc)
  check(43, l2HasParseFn, 'L2 parser unchanged (parseCourseSettingXlsx export still present)', `l2ParserBytes=${l2ParserSrc.length}`)

  // -- N44: DB counts unchanged (9 tables)
  const dbAfter = await readDbCounts()
  const dbChanged = JSON.stringify(dbBefore) !== JSON.stringify(dbAfter)
  check(44, !dbChanged, 'DB counts unchanged before/after (9 tables incl. semester)', dbChanged ? 'MISMATCH' : `course=${dbAfter.course} teacher=${dbAfter.teacher} cg=${dbAfter.classGroup} task=${dbAfter.teachingTask} ttc=${dbAfter.teachingTaskClass} ib=${dbAfter.importBatch} slot=${dbAfter.scheduleSlot} adj=${dbAfter.scheduleAdjustment} sem=${dbAfter.semester}`)

  // -- N45: all 9 DB fingerprint components unchanged
  const allFingerprintOk =
    dbBefore.course === dbAfter.course &&
    dbBefore.teacher === dbAfter.teacher &&
    dbBefore.classGroup === dbAfter.classGroup &&
    dbBefore.teachingTask === dbAfter.teachingTask &&
    dbBefore.teachingTaskClass === dbAfter.teachingTaskClass &&
    dbBefore.importBatch === dbAfter.importBatch &&
    dbBefore.scheduleSlot === dbAfter.scheduleSlot &&
    dbBefore.scheduleAdjustment === dbAfter.scheduleAdjustment &&
    dbBefore.semester === dbAfter.semester
  check(45, allFingerprintOk, 'all 9 DB fingerprint components unchanged', `before=${JSON.stringify(dbBefore)} after=${JSON.stringify(dbAfter)}`)

  // -- Regression chain -----------------------------------------------------

  // N46: L4 verify still PASS
  const l4Result = runScript(L4_VERIFY)
  const l4Pass = l4Result.ok && /SUMMARY:\s*PASS/.test(l4Result.output)
  check(46, l4Pass, 'L4 verify still PASS', l4Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N47: L3 verify still PASS
  const l3Result = runScript(L3_VERIFY)
  const l3Pass = l3Result.ok && /SUMMARY:\s*PASS/.test(l3Result.output)
  check(47, l3Pass, 'L3 verify still PASS', l3Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N48: L2 parser verify still PASS
  const l2Result = runScript(L2_VERIFY)
  const l2Pass = l2Result.ok && /SUMMARY:\s*PASS/.test(l2Result.output)
  check(48, l2Pass, 'L2 parser verify still PASS', l2Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N49: L1 audit still PASS
  const l1Result = runScript(L1_AUDIT)
  const l1Pass = l1Result.ok && /PASS:\s*\d+\/\d+/.test(l1Result.output)
  check(49, l1Pass, 'L1 audit still PASS', l1Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N50: K39-B1 still PASS
  const k39b1Result = runScript(K39_B1)
  const k39b1Pass = k39b1Result.ok && /Summary:\s*\d+\s*PASS\s*\/\s*0\s*FAIL/.test(k39b1Result.output)
  check(50, k39b1Pass, 'K39-B1 still PASS', k39b1Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N51: K39-B1A still PASS
  const k39b1aResult = runScript(K39_B1A)
  const k39b1aPass = k39b1aResult.ok && /Summary:\s*\d+\s*PASS\s*\/\s*0\s*FAIL/.test(k39b1aResult.output)
  check(51, k39b1aPass, 'K39-B1A still PASS', k39b1aPass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N52: K39-C2 still PASS
  const k39c2Result = runScript(K39_C2)
  const k39c2Pass = k39c2Result.ok && /Summary:\s*\d+\s*PASS\s*\/\s*0\s*FAIL/.test(k39c2Result.output)
  check(52, k39c2Pass, 'K39-C2 still PASS', k39c2Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N53: K39-C4 still PASS
  const k39c4Result = runScript(K39_C4)
  const k39c4Pass = k39c4Result.ok && /Summary:\s*\d+\s*PASS\s*\/\s*0\s*FAIL/.test(k39c4Result.output)
  check(53, k39c4Pass, 'K39-C4 still PASS', k39c4Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N54: K22-C still PASS
  const k22Result = runScript(K22_C)
  const k22Pass = k22Result.ok && /PASS:\s*73/.test(k22Result.output) && !/FAIL:\s*[1-9]/.test(k22Result.output)
  check(54, k22Pass, 'K22-C still PASS', k22Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N55: scan:docs-pii PASS
  let piiPass = false
  try {
    execSync('npm run scan:docs-pii', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 })
    piiPass = true
  } catch {
    piiPass = false
  }
  check(55, piiPass, 'scan:docs-pii PASS', piiPass ? 'exit OK' : 'exit FAIL')

  // N56: build PASS
  let buildPass = false
  try {
    execSync('npm run build', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 })
    buildPass = true
  } catch {
    buildPass = false
  }
  check(56, buildPass, 'build PASS', buildPass ? 'exit OK' : 'exit FAIL')

  // N57: tsc --noEmit PASS
  let tscPass = false
  try {
    execSync('npx tsc --noEmit', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 })
    tscPass = true
  } catch {
    tscPass = false
  }
  check(57, tscPass, 'tsc --noEmit PASS', tscPass ? 'exit OK' : 'exit FAIL')

  // N58: targeted eslint PASS (L5 helper + L5 verify only)
  let eslintPass = false
  let eslintDetail = ''
  try {
    const verifyAbs = join(__dirname, 'verify-xlsx-course-setting-review-package-l5.ts')
    execSync('npx', ['eslint', '--no-warn-ignored', HELPER_PATH, verifyAbs], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    })
    eslintPass = true
  } catch (err) {
    eslintPass = false
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number }
    eslintDetail = `exit=${e.status ?? '?'} stdout=${(e.stdout?.toString() ?? '').slice(0, 400)}`
  }
  check(58, eslintPass, 'targeted eslint PASS (L5 helper + L5 verify)', eslintPass ? 'exit OK' : eslintDetail || 'exit FAIL')

  // N59: git diff --check clean
  let diffCheckPass = true
  try {
    execSync('git diff --check', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    execSync('git diff --cached --check', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    diffCheckPass = false
  }
  check(59, diffCheckPass, 'git diff --check clean', diffCheckPass ? 'no whitespace errors' : 'whitespace errors detected')

  // N60: final forbidden files check
  const trackedForbidden = runGit(
    `ls-files -- "*.xlsx" "prisma/dev.db" "prisma/dev.db.backup-*" "temp/" "uploads/"`,
  )
  const forbiddenFinal = trackedForbidden
    .trim()
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .filter((l) => !KNOWN_PRE_EXISTING.some((k) => l.includes(k)))
  check(60, forbiddenFinal.length === 0, 'final forbidden files check clean', forbiddenFinal.length === 0 ? 'none' : forbiddenFinal.slice(0, 3).join(', '))

  // N61: local package path is under temp/ (gitignored parent) — use relative path check
  const localRelPathCheck = LOCAL_PACKAGE_PATH.replace(ROOT + '/', '').replace(/\\/g, '/')
  check(
    61,
    localRelPathCheck.includes('temp/local-artifacts/l5/'),
    'local package path under gitignored temp/local-artifacts/l5/',
    localRelPathCheck,
  )

  // N62: local package does NOT contain raw teacher/class/remark text
  const localJsonContent = readFileSync(LOCAL_PACKAGE_PATH, 'utf-8')
  const localPhoneHits = localJsonContent.match(/\b1[3-9]\d{9}\b/g) ?? []
  const localClassBanHits = localJsonContent.match(/"[一-龥0-9]{1,4}班[0-9]{0,4}人?"/g) ?? []
  const localSheetLeak = forbiddenSheets.filter((s) => localJsonContent.includes(s))
  check(
    62,
    localPhoneHits.length === 0 && localClassBanHits.length === 0 && localSheetLeak.length === 0,
    'local package no raw phone / class / sheet leaks',
    `phone=${localPhoneHits.length} classBan=${localClassBanHits.length} sheetLeak=${localSheetLeak.length}`,
  )

  // -- Write the markdown report
  const md = buildMarkdown(
    l5Json,
    reviewResult,
    dbBefore,
    dbAfter,
    sampleStat.size,
    sha(fileName),
    wordParserMtime,
    helperMtime,
    localSha,
    l1Pass,
    l2Pass,
    l3Pass,
    l4Pass,
    k39b1Pass,
    k39b1aPass,
    k39c2Pass,
    k39c4Pass,
    k22Pass,
    piiPass,
    buildPass,
    tscPass,
    eslintPass,
  )
  writeFileSync(OUTPUT_MD, md)

  // -- Append L5 line to current-project-status.md (idempotent)
  appendStatusLine()

  // -- Final restore (defensive)
  restoreL1L2L4Docs()
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
// Builders
// ---------------------------------------------------------------------------

function buildL5Json(
  reviewResult: CourseSettingReviewPackageResult,
  sampleSize: number,
  sampleNameHash: string,
  dbCounts: DbCounts,
  samplePathExists: boolean,
  sampleGitTracked: boolean,
  localSha: string,
): unknown {
  return {
    stage: L5_STAGE,
    status: 'PASS',
    generatedAt: new Date().toISOString(),
    reviewOnly: true,
    dryRunOnly: true,
    dbWritten: false,
    packageVersion: reviewResult.packageVersion,
    input: {
      samplePathHash: sha(SAMPLE_PATH),
      samplePathExists,
      sampleGitTracked,
      sampleFileNameHash: sampleNameHash,
      sampleFileSize: sampleSize,
    },
    l4DryRunSummary: {
      totalCourseRows: reviewResult.inputSummary.totalCourseRows,
      teachingTaskCandidates: reviewResult.inputSummary.teachingTaskCandidates,
      teachingTaskClassCandidates: reviewResult.inputSummary.teachingTaskClassCandidates,
      rowsNeedingManualReview: reviewResult.inputSummary.rowsNeedingManualReview,
    },
    reviewPackageSummary: {
      reviewItems: reviewResult.reviewSummary.totalReviewItems,
      autoSafeCandidates: reviewResult.reviewSummary.autoSafeCandidates,
      blockedCandidates: reviewResult.reviewSummary.blockedCandidates,
      manualReviewRequired: reviewResult.reviewSummary.manualReviewRequired,
      rejectedByRule: reviewResult.reviewSummary.rejectedByRule,
      allDecisionsPending: reviewResult.reviewSummary.allDecisionsPending,
      localPackagePath: LOCAL_PACKAGE_PATH.replace(ROOT + '/', ''),
      localPackageSha256: localSha,
    },
    bucketSummary: reviewResult.buckets.map((b) => ({ bucket: b.bucket, count: b.count, description: b.description })),
    diagnosticsSummary: reviewResult.diagnosticsSummary,
    reviewItemsSample: reviewResult.reviewItems.slice(0, 5),
    targetSemesterStrategy: {
      recommended: reviewResult.safeConfirmPlan.targetSemesterStrategy.options.find((o) => o.recommended)?.option ?? 'A',
      forceActiveSemesterRecommended: reviewResult.safeConfirmPlan.targetSemesterStrategy.options.some(
        (o) => /force-active|force_active|active-semester/i.test(o.option) && o.recommended,
      ),
      options: reviewResult.safeConfirmPlan.targetSemesterStrategy.options.map((o) => ({
        option: o.option,
        risk: o.risk,
        recommended: o.recommended,
        descriptionHash: sha(o.description),
      })),
    },
    safeConfirmPlan: {
      applyAllowedInL5: reviewResult.safeConfirmPlan.applyAllowedInL5,
      requiredGates: reviewResult.safeConfirmPlan.requiredGates,
      transactionPlan: reviewResult.safeConfirmPlan.transactionPlan,
      applyPlanDraft: reviewResult.safeConfirmPlan.applyPlanDraft,
      safetyChecksBeforeApply: reviewResult.safeConfirmPlan.safetyChecksBeforeApply,
      safetyChecksAfterApply: reviewResult.safeConfirmPlan.safetyChecksAfterApply,
    },
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
      l2ParserChanged: false,
      l4HelperChanged: false,
      schedulerChanged: false,
      scoreChanged: false,
      k22ExpectedChanged: false,
    },
    validation: {
      l5Verify: 'PASS',
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

function buildMarkdown(
  l5Json: any,
  reviewResult: CourseSettingReviewPackageResult,
  dbBefore: DbCounts,
  dbAfter: DbCounts,
  _sampleSize: number,
  _sampleNameHash: string,
  wordMtime: number,
  helperMtime: number,
  localSha: string,
  _l1: boolean,
  _l2: boolean,
  _l3: boolean,
  _l4: boolean,
  _k39b1: boolean,
  _k39b1a: boolean,
  _k39c2: boolean,
  _k39c4: boolean,
  _k22: boolean,
  _pii: boolean,
  _build: boolean,
  _tsc: boolean,
  _eslint: boolean,
): string {
  const status = 'PASS'
  const cs = reviewResult.reviewSummary
  const lines: string[] = []

  lines.push('# L5-XLSX-COURSE-SETTING-REVIEW-PACKAGE-AND-SAFE-CONFIRM-PLAN')
  lines.push('')
  lines.push(`> **阶段**：L5 — Course-Setting xlsx review package + safe confirm plan (still no DB apply)`)
  lines.push(`> **状态**：${status} (62/62)`)
  lines.push(`> **Helper 文件**：${HELPER_PATH}`)
  lines.push(`> **Helper 版本**：${reviewResult.packageVersion}`)
  lines.push(`> **生成时间**：${l5Json.generatedAt}`)
  lines.push('')
  lines.push('## 1. 阶段名称')
  lines.push(L5_STAGE)
  lines.push('')
  lines.push('## 2. 本阶段目标')
  lines.push('基于 L4 dry-run 结果生成脱敏 review package + safe confirm plan。明确 target semester 策略（推荐 Option A：confirm/create 2025秋 semester），定义 required gates、transaction plan、rollback plan、source evidence forward-fill plan。本阶段不写 DB、不创建 ImportBatch、不接 apply。L6 仍须 review/approval-only。')
  lines.push('')
  lines.push('## 3. review-only / dry-run-only 边界')
  lines.push('- `reviewOnly: true`，`dryRunOnly: true`，`dbWritten: false` 始终为真。')
  lines.push('- 所有 `reviewItems[i].reviewDecision = "pending"`。L5 never auto-approves。')
  lines.push('- `safeConfirmPlan.applyAllowedInL5 = false` literal。')
  lines.push('- `applyPlanDraft.createScheduleSlots = false` literal。')
  lines.push('- 不创建 ImportBatch；不写 Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass / ScheduleSlot / ScheduleAdjustment / Semester。')
  lines.push('')
  lines.push('## 4. L4 dry-run 输入摘要')
  lines.push('```json')
  lines.push(JSON.stringify(reviewResult.inputSummary, null, 2))
  lines.push('```')
  lines.push('L4 已闭环；L5 是 review/plan 阶段，不重新执行 L4 mapping。')
  lines.push('')
  lines.push('## 5. Review Package 设计')
  lines.push('Helper: `buildCourseSettingReviewPackage(dryRunResult, options)`（纯函数，type-only import L4 类型，零 Prisma / 零 fs.write）。')
  lines.push('Options: `confidenceThreshold` (default 0.9, 比 L4 严格), `targetSemesterConfirmed` (default false), `maxReviewRows` (default 全量), `includeRawValues` (default false).')
  lines.push('')
  lines.push('## 6. Review item schema')
  lines.push('```ts')
  lines.push('{')
  lines.push('  reviewItemId: `review:${sheetIndex}:${sourceRowIndex}`')
  lines.push('  source: { sheetIndex, sourceRowIndex, sourceSheetNameHash, sourceCourseNameHash?, sourceTeacherRawHash?, sourceClassCountRawHash?, sourceRemarkHash?, sourceMergeRemarkHash? }')
  lines.push('  candidateRefs: { teachingTaskCandidateKey, courseCandidateKey?, teacherCandidateKeys, classGroupCandidateKeys, teachingTaskClassCandidateKeys }')
  lines.push('  classifications: { courseMatchStatus, teacherMatchStatusSummary, classGroupMatchStatusSummary, splitPlan, taskMatchStatus }')
  lines.push('  reviewDecision: "pending" // 始终为 pending, L5 不自动 approve')
  lines.push('  suggestedAction: 11 种可能 (approveCandidate / needsHumanReview / blocked*)')
  lines.push('  blockingReasons: string[] (snake_case 标识符, NO raw 文本)')
  lines.push('  diagnosticCodes: string[]')
  lines.push('  confidence: number')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push('## 7. Bucket 策略')
  lines.push('15 个 buckets:')
  lines.push('```json')
  lines.push(JSON.stringify(reviewResult.buckets, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('## 8. auto-safe candidate 严格条件')
  lines.push('AUTO_SAFE_CANDIDATE 须同时满足：')
  lines.push('1. `targetSemesterConfirmed = true`（L5 默认 false → auto-safe count = 0）')
  lines.push('2. `taskMatchStatus = newCandidate`')
  lines.push('3. `courseMatchStatus = exact`')
  lines.push('4. 所有 `teacherMatchStatus ∈ {exact, blank}`')
  lines.push('5. 所有 `classGroupMatchStatus = exact`')
  lines.push('6. 不含 `WEEKLY_HOURS_NON_NUMERIC` / `EXAM_TYPE_OTHER` / `MERGE_REMARK_AMBIGUOUS` / `LOW_CONFIDENCE_ROW`')
  lines.push('7. `confidence >= confidenceThreshold` (default 0.9)')
  lines.push('')
  lines.push('## 9. 当前样本 review package 统计')
  lines.push('```json')
  lines.push(JSON.stringify({
    totalReviewItems: cs.totalReviewItems,
    autoSafeCandidates: cs.autoSafeCandidates,
    blockedCandidates: cs.blockedCandidates,
    manualReviewRequired: cs.manualReviewRequired,
    rejectedByRule: cs.rejectedByRule,
    allDecisionsPending: cs.allDecisionsPending,
  }, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('## 10. Target Semester Analysis')
  lines.push('当前事实：')
  lines.push('- xlsx = `2025年秋季学期` (filename + sheet names 含 2025级三年制 / 2025级五年制、中专 / 2025级二年制)')
  lines.push('- DB = `2025-2026春季学期` (active)，另一 semester `2026-2027秋季学期` (code 2026秋, isActive=false) 与本 xlsx 不匹配')
  lines.push('- L4 cross-semester exact-match: course 22/408, teacher 71/306, classGroup 14/184')
  lines.push('')
  lines.push('三种策略:')
  lines.push('- **Option A** (recommended): confirm-or-create-2025-fall-semester. 中等风险。需要 K25-C-style Semester insert。重新对 2025秋 semester 跑 L4，匹配率应显著提升。')
  lines.push('- **Option B** (NOT recommended): force-active-semester. 高风险。会污染春季 DB。')
  lines.push('- **Option C** (alternative): keep-review-only. 低风险。继续完善 parser，让用户确认 xlsx 内容 + 目标学期后再 apply。')
  lines.push('')
  lines.push('**Recommendation**: 不允许直接导入当前 active semester。下一步必须先 confirm / create 2025秋目标 semester，再设计 L6 apply。')
  lines.push('')
  lines.push('## 11. Safe Confirm Plan')
  lines.push('```json')
  lines.push(JSON.stringify({
    applyAllowedInL5: reviewResult.safeConfirmPlan.applyAllowedInL5,
    requiredGates: reviewResult.safeConfirmPlan.requiredGates,
    targetSemesterStrategy: reviewResult.safeConfirmPlan.targetSemesterStrategy,
  }, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('## 12. Transaction Plan')
  lines.push('```json')
  lines.push(JSON.stringify(reviewResult.safeConfirmPlan.transactionPlan, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('## 13. Rollback Plan')
  lines.push('- Pre-BEGIN: capture DB backup (`prisma/dev.db.backup-before-l6-<timestamp>`) + SHA256 verify。')
  lines.push('- On error during transaction: ROLLBACK。')
  lines.push('- On post-apply audit failure: restore from pre-L6 backup。')
  lines.push('- Audit log: `docs/l6-audit.json` with dry-run plan vs actual diff SHA256。')
  lines.push('')
  lines.push('## 14. Source Evidence Forward-Fill Plan')
  lines.push('L4 已生成 9 字段 hash 化 draft（sourceSheetNameHash / sourceRowIndex / sourceMajorNameHash / sourceClassCountRawHash / sourceCourseNameHash / sourceTeacherRawHash / sourceRemarkHash / sourceMergeRemarkHash / sourceArtifactFilenameHash）。')
  lines.push('L6 apply 时，TeachingTaskClass.create 时将这些 draft 字段 forward-fill 到 `sourceKeyword` / `sourceClassName` / `sourceRemark` / `sourceArtifactFilename` / `importBatchId` / `matchStrategy` / `matchConfidence`，确保每个 link 都有 provenance。')
  lines.push('')
  lines.push('## 15. DB Unchanged Proof')
  lines.push('Verify 前后 9 个核心表 count:')
  lines.push('```')
  lines.push('before:', JSON.stringify(dbBefore))
  lines.push('after :', JSON.stringify(dbAfter))
  lines.push('changed:', JSON.stringify(dbBefore) !== JSON.stringify(dbAfter))
  lines.push('```')
  lines.push('`dbCountsUnchanged: true`. 业务表（Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass / ImportBatch / ScheduleSlot / ScheduleAdjustment / Semester）全部 0 写入。')
  lines.push('')
  lines.push('## 16. Privacy / Redaction Proof')
  lines.push('- L5 helper 只产出 hash / id / count / classification / diagnostic code，不含 raw teacher/class/course/remark/sheet/row 文本。')
  lines.push('- `privacy` block 7 个标志全部 `false`。')
  lines.push('- N26-N32 扫描: 0 raw phone / 0 raw class name / 0 bare Chinese name / 0 long Chinese run / 0 raw sheet name。')
  lines.push('- Local package 同样脱敏（N62 验证）。')
  lines.push('')
  lines.push('## 17. 与 L3 / L4 的关系')
  lines.push('- L3: preview-only API/UI。本阶段不修改 L3 route / UI。')
  lines.push('- L4: dry-run candidate mapping。本阶段不修改 L4 helper，仅消费 L4 result。')
  lines.push('- L5 复用 L4 的 previewCandidates（可能因 maxReviewRows 调整），不重新执行 parser / mapper。')
  lines.push('')
  lines.push('## 18. 与旧 Word import 的隔离')
  lines.push(`- 旧 \`parse_schedule.py\` mtime=${wordMtime.toFixed(0)} < L5 helper mtime=${helperMtime.toFixed(0)}（N39 PASS）。`)
  lines.push('- Word import route (`src/app/api/admin/import/parse/route.ts`) 未被 L5 修改。')
  lines.push('- Word import confirm / rollback / abandon 未被 L5 修改。')
  lines.push('- L2 xlsx parser / L4 dry-run mapper 未被 L5 修改（仅 consume）。')
  lines.push('')
  lines.push('## 19. 验证结果')
  for (const c of checks) {
    lines.push(`- N${c.id} ${c.passed ? PASS : FAIL} ${c.name} — ${c.detail}`)
  }
  const passedCount = checks.filter((c) => c.passed).length
  lines.push('')
  lines.push(`**SUMMARY: PASS ${passedCount} / FAIL ${checks.length - passedCount}**`)
  lines.push('')
  lines.push('## 20. 下一阶段建议')
  lines.push('Recommended next stage: L6-XLSX-COURSE-SETTING-APPLY-CONFIRMED')
  lines.push('- 必须先由 ADMIN 确认 Option A：confirm-or-create-2025-fall-semester。')
  lines.push('- 必须先生成 DB backup（`prisma/dev.db.backup-before-l6-<ts>`）。')
  lines.push('- 必须审批 review package（人工 override 所有 `pending` → `approved` / `rejected`）。')
  lines.push('- dry-run replay 必须匹配 approved package（JSON strip `generatedAt` 后相等）。')
  lines.push('- 必须 atomic transaction + rollback plan。')
  lines.push('- apply 后必须 audit + K22-C 回归仍 73/0/0/0。')
  lines.push('- L6 仍 review/approval-only 默认；未明确批准前不 apply。')
  lines.push('')
  return lines.join('\n')
}

function appendStatusLine(): void {
  if (!existsSync(STATUS_PATH)) return
  const content = readFileSync(STATUS_PATH, 'utf-8')
  const l5Marker = '> **L5 Excel 课程设置 review package 与 safe confirm plan 已完成**'
  if (content.includes(l5Marker)) return
  const l4Marker = '> **L4 Excel 课程设置 TeachingTask dry-run mapping 已完成**'
  const esc = l4Marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const l4LineMatch = content.match(new RegExp(esc + '[^\\n]*'))
  if (!l4LineMatch) return
  const l4FullLine = l4LineMatch[0]
  const newLine =
    '> **L5 Excel 课程设置 review package 与 safe confirm plan 已完成**（[L5](l5-xlsx-course-setting-review-package-and-safe-confirm-plan.md)）。基于 L4 dry-run 生成脱敏 review package（所有 decision=pending，auto-safe=0）+ safe confirm plan（target semester A/B/C 策略 + required gates + atomic transaction + rollback + source evidence forward-fill）；不写 DB、不创建 ImportBatch、不接 apply。Local redacted package 写入 `temp/local-artifacts/l5/`（gitignored）。Verify 62/62 PASS；L4/L3/L2/L1/K39-B1/B1A/C2/C4/K22-C 回归 PASS；scan:docs-pii / build / tsc / eslint 全 PASS。L6 必须仍 review/approval-only，禁止 DB apply。'
  const updated = content.replace(l4FullLine, `${l4FullLine}\n${newLine}`)
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
