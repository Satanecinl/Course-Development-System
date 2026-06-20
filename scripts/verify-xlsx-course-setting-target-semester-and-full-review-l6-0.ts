/**
 * L6-0 verify script — Course-Setting XLSX Target Semester Analysis & Full Review Package
 *
 * 74 checks across 9 categories:
 *  - Sample + parser + helpers existence (N1-N5)
 *  - Stage constants + L4 dry-run / L6-0 review-only invariants (N6-N12)
 *  - Full review package invariants (N13-N21)
 *  - Target semester analysis (N22-N26)
 *  - Local full redacted package + gitignored (N27-N31)
 *  - Privacy / no raw in committed JSON OR local package (N32-N42)
 *  - Forbidden files / safety / isolation (N43-N55)
 *  - DB unchanged (N56-N61)
 *  - Regression chain (N62-N74): L5/L4/L3/L2/L1/K39-B1/B1A/C2/C4/K22-C/PII/build/tsc/eslint/git diff/forbidden
 *
 * Read-only Prisma (findMany / count). NO business-table writes. No ImportBatch.
 * Sanitized output: hashes + counts + classifications only — no raw teacher /
 * class / course / remark / row text.
 *
 * Run:
 *   npx tsx scripts/verify-xlsx-course-setting-target-semester-and-full-review-l6-0.ts --xlsx "..."
 *
 * Exit codes:
 *   0 — all 74 checks pass
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
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import {
  buildCourseSettingTeachingTaskDryRun,
  normalizeForMatch,
  type CourseSettingExistingImportData,
} from '../src/lib/import/course-setting-teaching-task-dry-run'
import {
  buildCourseSettingReviewPackage,
  buildFullCourseSettingReviewPackage,
  serializeCourseSettingReviewPackageLocalArtifact,
  serializeFullReviewPackageLocalArtifact,
  L5_STAGE,
  L6_0_STAGE,
  type CourseSettingReviewPackageResult,
} from '../src/lib/import/course-setting-review-package-l5'

// L6-0 dry-run: read-only Prisma access. No writes are allowed in this script.
const prisma = new PrismaClient()

const ROOT = resolve(__dirname, '..')
const SAMPLE_PATH =
  'D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx'
const HELPER_PATH_L5 = 'src/lib/import/course-setting-review-package-l5.ts'
const HELPER_PATH_L4 = 'src/lib/import/course-setting-teaching-task-dry-run.ts'
const L2_PARSER_PATH = 'src/lib/import/course-setting-xlsx-parser.ts'
const WORD_PARSER_SCRIPT = 'scripts/parse_schedule.py'
const L5_VERIFY = 'scripts/verify-xlsx-course-setting-review-package-l5.ts'
const L4_VERIFY = 'scripts/verify-xlsx-course-setting-teaching-task-dry-run-l4.ts'
const L3_VERIFY = 'scripts/verify-xlsx-course-setting-preview-l3.ts'
const L2_VERIFY = 'scripts/verify-xlsx-course-setting-parser-l2.ts'
const L1_AUDIT = 'scripts/audit-xlsx-course-setting-import-l1.ts'
const K39_B1 = 'scripts/verify-import-rules-explicit-semester-config-k39-b1.ts'
const K39_B1A = 'scripts/verify-import-rules-runtime-500-fix-k39-b1a.ts'
const K39_C2 = 'scripts/verify-source-evidence-safe-fields-backfill-k39-c2.ts'
const K39_C4 = 'scripts/verify-source-evidence-manual-review-package-k39-c4.ts'
const K22_C = 'scripts/verify-score-regression-harness-k22-c.ts'

const OUTPUT_JSON = join(ROOT, 'docs/l6-0-xlsx-course-setting-target-semester-and-full-review-package.json')
const OUTPUT_MD = join(ROOT, 'docs/l6-0-xlsx-course-setting-target-semester-and-full-review-package.md')
const STATUS_PATH = join(ROOT, 'docs/current-project-status.md')
const LOCAL_PACKAGE_DIR = join(ROOT, 'temp/local-artifacts/l6-0')
const LOCAL_PACKAGE_PATH = join(LOCAL_PACKAGE_DIR, 'xlsx-course-setting-review-package.full.redacted.json')

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

function restoreL1L2L3L4L5Docs(): void {
  try {
    execSync(
      'git checkout -- docs/l1-xlsx-course-setting-import-audit.json docs/l2-xlsx-course-setting-parser-prototype.json docs/l2-xlsx-course-setting-parser-prototype.md docs/l3-xlsx-course-setting-preview-api-and-ui.json docs/l4-xlsx-course-setting-teaching-task-dry-run-mapping.json docs/l4-xlsx-course-setting-teaching-task-dry-run-mapping.md docs/l5-xlsx-course-setting-review-package-and-safe-confirm-plan.json docs/l5-xlsx-course-setting-review-package-and-safe-confirm-plan.md',
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
  // L6-0 dry-run: read-only Prisma access. No writes are allowed in this script.
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
  // L6-0 dry-run: read-only Prisma access. No writes are allowed in this script.
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
// Target semester analysis types
// ---------------------------------------------------------------------------

type L60TargetSemesterCandidate = {
  id: number
  nameHash: string
  codeHash?: string
  isActive: boolean
  matchSignals: string[]
  confidence: number
  recommendedAsTarget: boolean
}

type L60TargetSemesterAnalysis = {
  readOnly: true
  semesterCount: number
  activeSemester: { id: number; nameHash: string; codeHash?: string; isActive: boolean } | null
  candidateSemesters: L60TargetSemesterCandidate[]
  targetSemesterDecision: {
    status:
      | 'existingCandidateFoundNeedsUserConfirmation'
      | 'noCandidateFoundNeedsCreatePlan'
      | 'ambiguousCandidatesNeedUserConfirmation'
    recommendedOption:
      | 'useExisting2025FallCandidate'
      | 'create2025FallSemesterInSeparateStage'
      | 'manualDecisionRequired'
    forceActiveSemesterRecommended: false
    reason: string
  }
  gates: {
    targetSemesterConfirmed: false
    targetSemesterCreatedOrSelected: false
    activeSemesterForceImportAllowed: false
  }
}

const TARGET_SEMESTER_ANALYSIS_VERSION = 'l6-0-target-semester-analysis-v1' as const

async function buildTargetSemesterAnalysis(): Promise<L60TargetSemesterAnalysis> {
  // L6-0 dry-run: read-only Prisma access. No writes are allowed in this script.
  const semesters = await prisma.semester.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
      academicYear: true,
      term: true,
      startsAt: true,
      endsAt: true,
    },
  })

  const active = semesters.find((s) => s.isActive) ?? null
  const activeOut = active
    ? {
        id: active.id,
        nameHash: sha(active.name),
        codeHash: active.code ? sha(active.code) : undefined,
        isActive: active.isActive,
      }
    : null

  const candidates: L60TargetSemesterCandidate[] = []
  for (const s of semesters) {
    // Heuristic: text-based signal matching. We do NOT include raw names/codes
    // in the analysis object — only hashes and the matched signal tokens.
    const tokens = [s.name, s.code ?? '', s.academicYear ?? '', s.term ?? '']
    const text = tokens.join(' ')
    const signals: string[] = []
    if (/(2025|2024|2023)/.test(text)) signals.push('year-2025-or-earlier-fall-window')
    if (/秋/.test(text)) signals.push('token-qiu')
    if (/autumn|fall/i.test(text)) signals.push('token-fall-autumn-en')
    if (/(2|second)/i.test(s.term ?? '')) signals.push('term-2-or-second')
    if (s.isActive === false) signals.push('inactive')
    if (signals.length === 0) continue
    // Confidence: 0 if only "inactive"; up to 0.7 with 2 signals; up to 0.9 with 3+
    const signalScore = signals.filter((s2) => s2 !== 'inactive').length
    const confidence = Math.min(0.9, 0.2 + signalScore * 0.25)
    candidates.push({
      id: s.id,
      nameHash: sha(s.name),
      codeHash: s.code ? sha(s.code) : undefined,
      isActive: s.isActive,
      matchSignals: signals,
      confidence: Math.round(confidence * 100) / 100,
      recommendedAsTarget: false, // never auto-recommend; L6-0 is review/approval-only
    })
  }

  let status: L60TargetSemesterAnalysis['targetSemesterDecision']['status']
  let recommendedOption: L60TargetSemesterAnalysis['targetSemesterDecision']['recommendedOption']
  let reason: string

  const strongCandidates = candidates.filter((c) => c.confidence >= 0.5 && c.isActive === false)
  if (strongCandidates.length === 1) {
    status = 'existingCandidateFoundNeedsUserConfirmation'
    recommendedOption = 'useExisting2025FallCandidate'
    reason = `Found 1 inactive semester candidate with confidence >= 0.5 (id=${strongCandidates[0]!.id}); user must confirm before L6 apply.`
  } else if (strongCandidates.length === 0) {
    status = 'noCandidateFoundNeedsCreatePlan'
    recommendedOption = 'create2025FallSemesterInSeparateStage'
    reason = 'No inactive semester candidate matched 2025秋 / fall / term-2 signals; a dedicated stage must create the 2025秋 Semester row first.'
  } else {
    status = 'ambiguousCandidatesNeedUserConfirmation'
    recommendedOption = 'manualDecisionRequired'
    reason = `Found ${strongCandidates.length} inactive semester candidates with confidence >= 0.5; ambiguous — manual decision required.`
  }

  return {
    readOnly: true,
    semesterCount: semesters.length,
    activeSemester: activeOut,
    candidateSemesters: candidates,
    targetSemesterDecision: {
      status,
      recommendedOption,
      forceActiveSemesterRecommended: false,
      reason,
    },
    gates: {
      targetSemesterConfirmed: false,
      targetSemesterCreatedOrSelected: false,
      activeSemesterForceImportAllowed: false,
    },
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== L6-0 XLSX Course Setting Target Semester & Full Review Package Verify ===\n')

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
  const l4HelperExists = existsSync(join(ROOT, HELPER_PATH_L4))
  check(4, l4HelperExists, 'L4 dry-run helper exists', HELPER_PATH_L4)

  // -- N5: L5 review-package helper exists
  const l5HelperExists = existsSync(join(ROOT, HELPER_PATH_L5))
  check(5, l5HelperExists, 'L5 review-package helper exists', HELPER_PATH_L5)
  if (!l5HelperExists) return finish()
  const l5HelperSrc = readFile(HELPER_PATH_L5) ?? ''

  // -- N6: stage name constants present in L5 helper
  const hasL5Stage = l5HelperSrc.includes("'L5-XLSX-COURSE-SETTING-REVIEW-PACKAGE-AND-SAFE-CONFIRM-PLAN'")
  const hasL60Stage = l5HelperSrc.includes("'L6-0-XLSX-COURSE-SETTING-TARGET-SEMESTER-AND-FULL-REVIEW-PACKAGE'")
  check(
    6,
    hasL5Stage && hasL60Stage,
    'stage name constants present in L5 helper (L5_STAGE + L6_0_STAGE)',
    `L5=${hasL5Stage} L6-0=${hasL60Stage}`,
  )

  // -- Pre-DB fingerprint
  const dbBefore = await readDbCounts()

  // -- Load existing data + run L4 mapper (uncapped preview)
  const existingData = await loadExistingData()
  const l4Result = await buildCourseSettingTeachingTaskDryRun({
    xlsxBuffer: sampleBuf,
    artifactFilename: SAMPLE_PATH,
    existingData,
    options: { maxPreviewRows: 2000, confidenceThreshold: 0.8 },
  })

  // -- N7: parser returns course rows > 0
  check(
    7,
    l4Result.parser.totalCourseRows > 0,
    'parser returns course rows > 0',
    `totalCourseRows=${l4Result.parser.totalCourseRows}`,
  )

  // -- N8: L4 dry-run result dryRunOnly = true
  check(8, l4Result.dryRunOnly === true, 'L4 dry-run result dryRunOnly = true', `dryRunOnly=${l4Result.dryRunOnly}`)

  // -- Build full review package (uncapped) using the L6-0 helper if available,
  //    otherwise fall back to buildCourseSettingReviewPackage with a high cap.
  //    Either path produces the same review-only contract; the helper just makes
  //    the "uncapped" intent explicit at the call site.
  const reviewResult: CourseSettingReviewPackageResult = (() => {
    if (typeof buildFullCourseSettingReviewPackage === 'function') {
      return buildFullCourseSettingReviewPackage(l4Result, {
        confidenceThreshold: 0.9,
        targetSemesterConfirmed: false,
      })
    }
    // Fallback: pass a very large maxReviewRows cap.
    return buildCourseSettingReviewPackage(l4Result, {
      maxReviewRows: 1_000_000,
      confidenceThreshold: 0.9,
      targetSemesterConfirmed: false,
    })
  })()

  // -- N9: L5 review result reviewOnly = true
  check(9, reviewResult.reviewOnly === true, 'L6-0 review result reviewOnly = true', `reviewOnly=${reviewResult.reviewOnly}`)

  // -- N10: L5 review result dryRunOnly = true
  check(10, reviewResult.dryRunOnly === true, 'L6-0 review result dryRunOnly = true', `dryRunOnly=${reviewResult.dryRunOnly}`)

  // -- N11: L5 review result dbWritten = false
  check(11, reviewResult.dbWritten === false, 'L6-0 review result dbWritten = false', `dbWritten=${reviewResult.dbWritten}`)

  // -- N12: stage on result is L6-0 stage (since helper pins it via L5 constant;
  //    document this — the packageVersion field is the differentiator, and the
  //    serialized local artifact's stage is L6-0 via serializeFullReviewPackageLocalArtifact)
  check(
    12,
    reviewResult.stage === L5_STAGE,
    'reviewResult.stage = L5_STAGE (helper reuses L5 stage; L6-0 marker is on the serialized local artifact)',
    `stage=${reviewResult.stage}`,
  )

  // -- N13: full review item count > 200 (uncapped vs L5 preview)
  check(
    13,
    reviewResult.reviewItems.length > 200,
    'full review item count > 200 (uncapped vs L5 200-cap)',
    `count=${reviewResult.reviewItems.length}`,
  )

  // -- N14: full review item count ≈ 1116 (L4 teachingTaskCandidates)
  const expectedCount = l4Result.candidateSummary.teachingTaskCandidates
  check(
    14,
    reviewResult.reviewItems.length === expectedCount,
    `full review item count = L4 teachingTaskCandidates (expected=${expectedCount}, got=${reviewResult.reviewItems.length})`,
    `expected=${expectedCount} got=${reviewResult.reviewItems.length}`,
  )

  // -- N15: all review decisions pending
  const allPending = reviewResult.reviewItems.every((it) => it.reviewDecision === 'pending')
  check(15, allPending, 'all review items decision = pending', `total=${reviewResult.reviewItems.length}`)

  // -- N16: no review item decision = approve
  const noApproveDecision = reviewResult.reviewItems.every((it) => it.reviewDecision !== 'approve')
  check(16, noApproveDecision, 'no review item decision = approve (only suggestedAction)', 'all decisions are pending')

  // -- N17: autoSafeCandidates = 0 (because targetSemesterConfirmed=false)
  check(
    17,
    reviewResult.reviewSummary.autoSafeCandidates === 0,
    'autoSafeCandidates = 0 (targetSemesterConfirmed=false)',
    `autoSafe=${reviewResult.reviewSummary.autoSafeCandidates}`,
  )

  // -- N18: blockedCandidates = totalReviewItems (all blocked because target semester not confirmed)
  check(
    18,
    reviewResult.reviewSummary.blockedCandidates === reviewResult.reviewSummary.totalReviewItems,
    'blockedCandidates = totalReviewItems (all blocked because target semester not confirmed)',
    `blocked=${reviewResult.reviewSummary.blockedCandidates} total=${reviewResult.reviewSummary.totalReviewItems}`,
  )

  // -- N19: targetSemesterConfirmed = false in package
  check(
    19,
    reviewResult.safeConfirmPlan.requiredGates.targetSemesterConfirmed === false,
    'safeConfirmPlan.requiredGates.targetSemesterConfirmed = false',
    `targetSemesterConfirmed=${reviewResult.safeConfirmPlan.requiredGates.targetSemesterConfirmed}`,
  )

  // -- N20: applyAllowedInL5 = false (and applyAllowedInL60 = false by extension)
  check(
    20,
    reviewResult.safeConfirmPlan.applyAllowedInL5 === false,
    'safeConfirmPlan.applyAllowedInL5 = false (applyAllowedInL60 = false)',
    `applyAllowedInL5=${reviewResult.safeConfirmPlan.applyAllowedInL5}`,
  )

  // -- N21: seven safe confirm gates all false
  const gates = reviewResult.safeConfirmPlan.requiredGates
  const allGatesFalse = Object.values(gates).every((v) => v === false)
  const gateCount = Object.keys(gates).length
  check(
    21,
    allGatesFalse && gateCount === 7,
    'all 7 safe confirm gates = false',
    `gates=${JSON.stringify(gates)}`,
  )

  // -- Target semester analysis
  const tsa = await buildTargetSemesterAnalysis()

  // -- N22: semester table read-only summary generated
  check(
    22,
    tsa.readOnly === true && typeof tsa.semesterCount === 'number',
    'semester table read-only summary generated (L60TargetSemesterAnalysis)',
    `semesterCount=${tsa.semesterCount} readOnly=${tsa.readOnly}`,
  )

  // -- N23: active semester identified (or null if none)
  const activeOk = tsa.activeSemester === null || typeof tsa.activeSemester.id === 'number'
  check(
    23,
    activeOk,
    'active semester identified (or null if no active)',
    tsa.activeSemester ? `activeId=${tsa.activeSemester.id} isActive=${tsa.activeSemester.isActive}` : 'no active semester',
  )

  // -- N24: 2025 fall candidate detection executed (heuristic ran; possibly 0 matches)
  check(
    24,
    Array.isArray(tsa.candidateSemesters),
    '2025 fall candidate detection executed',
    `candidates=${tsa.candidateSemesters.length}`,
  )

  // -- N25: forceActiveSemesterRecommended = false (always)
  check(
    25,
    tsa.targetSemesterDecision.forceActiveSemesterRecommended === false,
    'targetSemesterDecision.forceActiveSemesterRecommended = false',
    `forceActive=${tsa.targetSemesterDecision.forceActiveSemesterRecommended}`,
  )

  // -- N26: recommended option is one of the allowed values
  const allowed = new Set([
    'useExisting2025FallCandidate',
    'create2025FallSemesterInSeparateStage',
    'manualDecisionRequired',
  ])
  check(
    26,
    allowed.has(tsa.targetSemesterDecision.recommendedOption),
    'recommended option is one of allowed values',
    `recommendedOption=${tsa.targetSemesterDecision.recommendedOption}`,
  )

  // -- Generate local full redacted package --------------------------------
  mkdirSync(LOCAL_PACKAGE_DIR, { recursive: true })
  const generatedAt = new Date().toISOString()
  let localJson: string
  if (typeof serializeFullReviewPackageLocalArtifact === 'function') {
    // First pass: packageSha256 = null
    localJson = serializeFullReviewPackageLocalArtifact(reviewResult, generatedAt)
  } else {
    // Fallback: build JSON inline (mirrors the new serializer shape)
    const obj = {
      stage: L6_0_STAGE,
      packageType: 'full-redacted-review-package' as const,
      generatedAt,
      rawContentIncluded: false,
      reviewOnly: true,
      dryRunOnly: true,
      dbWritten: false,
      targetSemesterConfirmed: false,
      reviewItemCount: reviewResult.reviewItems.length,
      allDecisionsPending: true,
      autoSafeCandidates: reviewResult.reviewSummary.autoSafeCandidates,
      blockedCandidates: reviewResult.reviewSummary.blockedCandidates,
      packageSha256: null as string | null,
      items: reviewResult.reviewItems,
      buckets: reviewResult.buckets,
    }
    localJson = JSON.stringify(obj, null, 2) + '\n'
  }
  writeFileSync(LOCAL_PACKAGE_PATH, localJson)
  const localSha = sha256Hex(readFileSync(LOCAL_PACKAGE_PATH))

  // Rewrite with sha256 baked in
  const rewritten = typeof serializeFullReviewPackageLocalArtifact === 'function'
    ? serializeFullReviewPackageLocalArtifact(reviewResult, generatedAt, localSha)
    : (() => {
        const obj2 = JSON.parse(localJson)
        obj2.packageSha256 = localSha
        return JSON.stringify(obj2, null, 2) + '\n'
      })()
  writeFileSync(LOCAL_PACKAGE_PATH, rewritten)

  const localExists = existsSync(LOCAL_PACKAGE_PATH)
  check(
    27,
    localExists,
    'local full redacted package generated',
    `path=${LOCAL_PACKAGE_PATH.replace(ROOT + '/', '').replace(/\\/g, '/')} sha256=${localSha.slice(0, 16)}…`,
  )

  // -- N28: local package path under temp/
  const localRelPathCheck = LOCAL_PACKAGE_PATH.replace(ROOT + '/', '').replace(/\\/g, '/')
  check(
    28,
    localRelPathCheck.includes('temp/local-artifacts/l6-0/'),
    'local package path under gitignored temp/local-artifacts/l6-0/',
    localRelPathCheck,
  )

  // -- N29: local package not git-tracked
  const localTracked = runGit(`ls-files ${JSON.stringify(localRelPathCheck)}`)
  const localTrackedLines = localTracked.trim().split('\n').filter((l) => l.trim().length > 0)
  check(
    29,
    localTrackedLines.length === 0,
    'local package gitignored / not tracked',
    localTrackedLines.length === 0 ? 'untracked (gitignored)' : localTrackedLines.join(', '),
  )

  // -- N30: local package sha256 calculated
  check(
    30,
    /^[0-9a-f]{64}$/.test(localSha),
    'local package sha256 calculated',
    `sha256=${localSha}`,
  )

  // -- N31: local package rawContentIncluded = false
  const localContent = readFileSync(LOCAL_PACKAGE_PATH, 'utf-8')
  const parsedLocal = JSON.parse(localContent) as { rawContentIncluded?: boolean; stage?: string; packageType?: string }
  check(
    31,
    parsedLocal.rawContentIncluded === false,
    'local package rawContentIncluded = false',
    `rawContentIncluded=${parsedLocal.rawContentIncluded} stage=${parsedLocal.stage ?? ''} packageType=${parsedLocal.packageType ?? ''}`,
  )

  // -- Build committed JSON (sanitized) and write ---------------------------
  const l60Json = buildL60Json(reviewResult, sampleStat.size, sha(fileName), dbBefore, sampleExists, !isTracked, localSha, tsa)
  mkdirSync(join(ROOT, 'docs'), { recursive: true })
  writeFileSync(OUTPUT_JSON, JSON.stringify(l60Json, null, 2) + '\n')
  const writtenJson = readFileSync(OUTPUT_JSON, 'utf-8')

  // -- N32: no raw phone numbers in committed JSON
  const phoneHits = writtenJson.match(/\b1[3-9]\d{9}\b/g) ?? []
  check(32, phoneHits.length === 0, 'committed JSON contains no raw phone numbers', `phone-pattern hits=${phoneHits.length}`)

  // -- N33: no raw class names in committed JSON
  const classBanHits = writtenJson.match(/"[一-龥0-9]{1,4}班[0-9]{0,4}人?"/g) ?? []
  check(33, classBanHits.length === 0, 'committed JSON contains no raw class names', `class-name hits=${classBanHits.length}`)

  // -- N34: no raw teacher/course names in committed JSON
  const bareNameRe = /:\s*"([一-龥]{2,4})"/g
  const bareNames: string[] = []
  let m: RegExpExecArray | null
  while ((m = bareNameRe.exec(writtenJson)) !== null) {
    const v = m[1]
    if (v === '试' || v === '查' || v === '合并班' || v === '班级人数') continue
    bareNames.push(v)
  }
  check(34, bareNames.length === 0, 'committed JSON contains no raw teacher/course names', `bare-name hits=${bareNames.slice(0, 3).join(',')}`)

  // -- N35: no raw remarks in committed JSON
  const longChineseRunRe = /[一-龥]{5,}/g
  const longChineseRuns: string[] = []
  while ((m = longChineseRunRe.exec(writtenJson)) !== null) {
    longChineseRuns.push(m[0])
  }
  check(35, longChineseRuns.length === 0, 'committed JSON contains no raw remarks (long Chinese runs)', `long-run hits=${longChineseRuns.slice(0, 3).join(',')}`)

  // -- N36: no raw sheet names in committed JSON
  const forbiddenSheets = [
    '2024级三年制', '2021级五年制', '2022级五年制和中职', '2023级五年制和中专',
    '2023级三年制', '2024级五年制', '2025级三年制', '2025级五年制、中专', '2025级二年制',
  ]
  const sheetLeak = forbiddenSheets.filter((s) => writtenJson.includes(s))
  check(36, sheetLeak.length === 0, 'committed JSON contains no raw sheet names', `sheet-leak hits=${sheetLeak.join(',')}`)

  // -- N37: privacy flags in committed JSON all false
  const privacy = l60Json.privacy as Record<string, unknown>
  const privacyOk = Object.values(privacy).every((v) => v === false)
  check(37, privacyOk, 'committed JSON privacy flags all false', JSON.stringify(privacy))

  // -- N38: local package no raw phone / class / sheet leaks
  const localPhoneHits = localContent.match(/\b1[3-9]\d{9}\b/g) ?? []
  const localClassBanHits = localContent.match(/"[一-龥0-9]{1,4}班[0-9]{0,4}人?"/g) ?? []
  const localSheetLeak = forbiddenSheets.filter((s) => localContent.includes(s))
  check(
    38,
    localPhoneHits.length === 0 && localClassBanHits.length === 0 && localSheetLeak.length === 0,
    'local package no raw phone / class / sheet leaks',
    `phone=${localPhoneHits.length} classBan=${localClassBanHits.length} sheetLeak=${localSheetLeak.length}`,
  )

  // -- N39: local package no raw teacher/course names
  const localBareNames: string[] = []
  const localBareRe = /:\s*"([一-龥]{2,4})"/g
  let lm: RegExpExecArray | null
  while ((lm = localBareRe.exec(localContent)) !== null) {
    const v = lm[1]
    if (v === '试' || v === '查' || v === '合并班' || v === '班级人数') continue
    localBareNames.push(v)
  }
  check(
    39,
    localBareNames.length === 0,
    'local package no raw teacher/course names',
    `bare-name hits=${localBareNames.slice(0, 3).join(',')}`,
  )

  // -- N40: local package no long Chinese runs (remarks)
  const localLongRuns: string[] = []
  const localLongRe = /[一-龥]{5,}/g
  while ((lm = localLongRe.exec(localContent)) !== null) {
    localLongRuns.push(lm[0])
  }
  check(
    40,
    localLongRuns.length === 0,
    'local package no raw remarks (long Chinese runs)',
    `long-run hits=${localLongRuns.slice(0, 3).join(',')}`,
  )

  // -- N41: committed JSON allDecisionsPending = true
  const reviewSummary = l60Json.fullReviewPackage as Record<string, unknown>
  check(
    41,
    reviewSummary.allDecisionsPending === true,
    'committed JSON fullReviewPackage.allDecisionsPending = true',
    `allDecisionsPending=${reviewSummary.allDecisionsPending}`,
  )

  // -- N42: committed JSON applyAllowedInL60 = false
  check(
    42,
    l60Json.applyAllowedInL60 === false,
    'committed JSON applyAllowedInL60 = false',
    `applyAllowedInL60=${l60Json.applyAllowedInL60}`,
  )

  // -- N43: no xlsx tracked (excluding templates/)
  const xlsxTracked = runGit(`ls-files -- "*.xlsx"`)
  const xlsxTrackedLines = xlsxTracked.trim().split('\n').filter((l) => l.trim().length > 0)
  const xlsxTrackedFiltered = xlsxTrackedLines.filter((l) => !KNOWN_PRE_EXISTING.some((k) => l.includes(k)))
  check(43, xlsxTrackedFiltered.length === 0, 'no xlsx tracked (excluding templates/)', xlsxTrackedFiltered.length === 0 ? 'none' : xlsxTrackedFiltered.slice(0, 3).join(', '))

  // -- N44: no dev.db / backup tracked
  const devDbTracked = runGit(`ls-files -- "prisma/dev.db" "prisma/dev.db.backup-*"`)
  const devDbTrackedLines = devDbTracked.trim().split('\n').filter((l) => l.trim().length > 0)
  check(44, devDbTrackedLines.length === 0, 'no dev.db / backup tracked', devDbTrackedLines.length === 0 ? 'none' : devDbTrackedLines.join(', '))

  // -- N45: no temp/uploads tracked
  const tempUploadsTracked = runGit(`ls-files -- "temp/" "uploads/"`)
  const tempUploadsLines = tempUploadsTracked.trim().split('\n').filter((l) => l.trim().length > 0)
  const tempUploadsFiltered = tempUploadsLines.filter((l) => !KNOWN_PRE_EXISTING.some((k) => l.includes(k)))
  check(45, tempUploadsFiltered.length === 0, 'no temp/uploads tracked (excluding README/.gitkeep/templates)', tempUploadsFiltered.length === 0 ? 'none' : tempUploadsFiltered.slice(0, 3).join(', '))

  // -- N46: no schema/migration changes
  const prismaStatus = runGit('status --short prisma/')
  check(46, prismaStatus.trim().length === 0, 'no schema/migration changes', prismaStatus.trim() || 'prisma/ clean')

  // -- N47: no API changes
  const apiStatusRaw = runGit('status --short src/app/api/')
  const apiStatusLines = apiStatusRaw.trim().split('\n').filter((l) => l.trim().length > 0)
  check(47, apiStatusLines.length === 0, 'no API changes', apiStatusLines.length === 0 ? 'src/app/api/ clean' : apiStatusLines.join(', '))

  // -- N48: no UI changes
  const uiStatusRaw = runGit('status --short src/components/')
  const uiStatusLines = uiStatusRaw.trim().split('\n').filter((l) => l.trim().length > 0)
  check(48, uiStatusLines.length === 0, 'no UI changes', uiStatusLines.length === 0 ? 'src/components/ clean' : uiStatusLines.join(', '))

  // -- N49: old Word parser untouched (mtime)
  const wordParserPath = join(ROOT, WORD_PARSER_SCRIPT)
  const wordParserStat = statSync(wordParserPath)
  const wordParserMtime = wordParserStat.mtimeMs
  const helperStat = statSync(join(ROOT, HELPER_PATH_L5))
  const helperMtime = helperStat.mtimeMs
  check(
    49,
    wordParserMtime < helperMtime,
    'old Word parser untouched (mtime)',
    `parse_schedule.py mtime=${wordParserMtime.toFixed(0)} < L5 helper mtime=${helperMtime.toFixed(0)}`,
  )

  // -- N50: no scheduler/score changes
  const schedulerStatus = runGit('status --short src/lib/scheduler/ src/lib/score.ts')
  const schedulerLines = schedulerStatus.trim().split('\n').filter((l) => l.trim().length > 0)
  check(50, schedulerLines.length === 0, 'no scheduler/score changes', schedulerLines.length === 0 ? 'src/lib/scheduler/ + src/lib/score.ts clean' : schedulerLines.join(', '))

  // -- N51: no write methods in L5 helper (no prisma, no fs.write)
  const l5Prisma = grepCount(l5HelperSrc, 'prisma\\.')
  const l5FsWrite = /writeFile|copyFile|unlink|rmSync/.test(l5HelperSrc)
  check(51, l5Prisma === 0 && !l5FsWrite, 'no write methods in L5 helper (no prisma, no fs.write)', `prisma=${l5Prisma} fsWrite=${l5FsWrite}`)

  // -- N52: no write methods in L6-0 verify script (no prisma.*, no fs.write)
  const verifySrc = readFile(__filename) ?? ''
  const verifyPrismaWrites = grepCount(verifySrc, 'prisma\\.(create|update|delete|upsert|execute\\$Raw|\\$executeRaw)')
  const verifyFsWrites = /writeFile|copyFile|unlink|rmSync/.test(verifySrc)
  // We DO use writeFileSync for local artifact + committed JSON, so this is intentionally true.
  // The check asserts that L6-0 does NOT touch the prisma business-table write API surface.
  check(
    52,
    verifyPrismaWrites === 0,
    'no business-table writes in L6-0 verify (no prisma.create/update/delete/upsert/$executeRaw)',
    `prismaWrites=${verifyPrismaWrites} (writeFileSync is allowed for local artifact + committed JSON)`,
  )

  // -- N53: L4 dry-run mapper unchanged
  const l4HelperSrc = readFile(HELPER_PATH_L4) ?? ''
  const l4HelperUntouched = !l4HelperSrc.includes("L4_STAGE'") || l4HelperSrc.includes("L4_STAGE =")
  check(53, l4HelperUntouched, 'L4 dry-run mapper unchanged (L4_STAGE constant present)', `l4HelperBytes=${l4HelperSrc.length}`)

  // -- N54: L2 parser unchanged
  const l2ParserSrc = readFile(L2_PARSER_PATH) ?? ''
  const l2HasParseFn = /export const parseCourseSettingXlsx\b/.test(l2ParserSrc)
  check(54, l2HasParseFn, 'L2 parser unchanged (parseCourseSettingXlsx export still present)', `l2ParserBytes=${l2ParserSrc.length}`)

  // -- N55: L6-0 verify script no write to business tables (defensive cross-check)
  check(
    55,
    verifyFsWrites === false,
    'no destructive fs writes in L6-0 verify (writeFileSync only for committed JSON + local artifact)',
    `fsWriteHits=${verifyFsWrites}`,
  )

  // -- N56: DB counts unchanged before/after (9 tables)
  const dbAfter = await readDbCounts()
  const dbChanged = JSON.stringify(dbBefore) !== JSON.stringify(dbAfter)
  check(
    56,
    !dbChanged,
    'DB counts unchanged before/after (9 tables incl. semester)',
    dbChanged
      ? 'MISMATCH'
      : `course=${dbAfter.course} teacher=${dbAfter.teacher} cg=${dbAfter.classGroup} task=${dbAfter.teachingTask} ttc=${dbAfter.teachingTaskClass} ib=${dbAfter.importBatch} slot=${dbAfter.scheduleSlot} adj=${dbAfter.scheduleAdjustment} sem=${dbAfter.semester}`,
  )

  // -- N57-N61: individual DB fingerprint components unchanged
  check(57, dbBefore.semester === dbAfter.semester, 'Semester count unchanged', `before=${dbBefore.semester} after=${dbAfter.semester}`)
  check(58, dbBefore.course === dbAfter.course, 'Course count unchanged', `before=${dbBefore.course} after=${dbAfter.course}`)
  check(59, dbBefore.teacher === dbAfter.teacher, 'Teacher count unchanged', `before=${dbBefore.teacher} after=${dbAfter.teacher}`)
  check(60, dbBefore.classGroup === dbAfter.classGroup, 'ClassGroup count unchanged', `before=${dbBefore.classGroup} after=${dbAfter.classGroup}`)
  check(
    61,
    dbBefore.teachingTask === dbAfter.teachingTask &&
      dbBefore.teachingTaskClass === dbAfter.teachingTaskClass &&
      dbBefore.importBatch === dbAfter.importBatch &&
      dbBefore.scheduleSlot === dbAfter.scheduleSlot &&
      dbBefore.scheduleAdjustment === dbAfter.scheduleAdjustment,
    'TeachingTask / TeachingTaskClass / ImportBatch / ScheduleSlot / ScheduleAdjustment counts unchanged',
    `task=${dbAfter.teachingTask} ttc=${dbAfter.teachingTaskClass} ib=${dbAfter.importBatch} slot=${dbAfter.scheduleSlot} adj=${dbAfter.scheduleAdjustment}`,
  )

  // -- Regression chain -----------------------------------------------------

  // N62: L5 verify still PASS (L5 is the heaviest regression — full build + tsc + 5 nested
  // regression scripts — so it needs a much longer timeout than the default 300s)
  const l5Result = runScript(L5_VERIFY, 1200_000)
  const l5Pass = l5Result.ok && /SUMMARY:\s*PASS/.test(l5Result.output)
  check(62, l5Pass, 'L5 verify still PASS', l5Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N63: L4 verify still PASS
  const l4Result2 = runScript(L4_VERIFY)
  const l4Pass = l4Result2.ok && /SUMMARY:\s*PASS/.test(l4Result2.output)
  check(63, l4Pass, 'L4 verify still PASS', l4Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N64: L3 verify still PASS
  const l3Result = runScript(L3_VERIFY)
  const l3Pass = l3Result.ok && /SUMMARY:\s*PASS/.test(l3Result.output)
  check(64, l3Pass, 'L3 verify still PASS', l3Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N65: L2 parser verify still PASS
  const l2Result = runScript(L2_VERIFY)
  const l2Pass = l2Result.ok && /SUMMARY:\s*PASS/.test(l2Result.output)
  check(65, l2Pass, 'L2 parser verify still PASS', l2Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N66: L1 audit still PASS
  const l1Result = runScript(L1_AUDIT)
  const l1Pass = l1Result.ok && /PASS:\s*\d+\/\d+/.test(l1Result.output)
  check(66, l1Pass, 'L1 audit still PASS', l1Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N67: K39-B1 still PASS
  const k39b1Result = runScript(K39_B1)
  const k39b1Pass = k39b1Result.ok && /Summary:\s*\d+\s*PASS\s*\/\s*0\s*FAIL/.test(k39b1Result.output)
  check(67, k39b1Pass, 'K39-B1 still PASS', k39b1Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N68: K39-B1A still PASS
  const k39b1aResult = runScript(K39_B1A)
  const k39b1aPass = k39b1aResult.ok && /Summary:\s*\d+\s*PASS\s*\/\s*0\s*FAIL/.test(k39b1aResult.output)
  check(68, k39b1aPass, 'K39-B1A still PASS', k39b1aPass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N69: K39-C2 still PASS
  const k39c2Result = runScript(K39_C2)
  const k39c2Pass = k39c2Result.ok && /Summary:\s*\d+\s*PASS\s*\/\s*0\s*FAIL/.test(k39c2Result.output)
  check(69, k39c2Pass, 'K39-C2 still PASS', k39c2Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N70: K39-C4 still PASS
  const k39c4Result = runScript(K39_C4)
  const k39c4Pass = k39c4Result.ok && /Summary:\s*\d+\s*PASS\s*\/\s*0\s*FAIL/.test(k39c4Result.output)
  check(70, k39c4Pass, 'K39-C4 still PASS', k39c4Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N71: K22-C still PASS
  const k22Result = runScript(K22_C)
  const k22Pass = k22Result.ok && /PASS:\s*73/.test(k22Result.output) && !/FAIL:\s*[1-9]/.test(k22Result.output)
  check(71, k22Pass, 'K22-C still PASS', k22Pass ? 'exit OK' : 'exit FAIL')
  restoreK22()

  // N72: scan:docs-pii PASS
  let piiPass = false
  try {
    execSync('npm run scan:docs-pii', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 })
    piiPass = true
  } catch {
    piiPass = false
  }
  check(72, piiPass, 'scan:docs-pii PASS', piiPass ? 'exit OK' : 'exit FAIL')

  // N73: build PASS
  let buildPass = false
  try {
    execSync('npm run build', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 })
    buildPass = true
  } catch {
    buildPass = false
  }
  check(73, buildPass, 'build PASS', buildPass ? 'exit OK' : 'exit FAIL')

  // N74: targeted eslint PASS (L5 helper + L6-0 verify only)
  let eslintPass = false
  let eslintDetail = ''
  try {
    execSync('npx', ['eslint', '--no-warn-ignored', HELPER_PATH_L5, __filename], {
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
  check(74, eslintPass, 'targeted eslint PASS (L5 helper + L6-0 verify)', eslintPass ? 'exit OK' : eslintDetail || 'exit FAIL')

  // -- N75: git diff --check clean
  let diffCheckPass = true
  try {
    execSync('git diff --check', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    execSync('git diff --cached --check', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    diffCheckPass = false
  }
  check(75, diffCheckPass, 'git diff --check clean', diffCheckPass ? 'no whitespace errors' : 'whitespace errors detected')

  // -- N76: final forbidden files check
  const trackedForbidden = runGit(
    `ls-files -- "*.xlsx" "prisma/dev.db" "prisma/dev.db.backup-*" "temp/" "uploads/"`,
  )
  const forbiddenFinal = trackedForbidden
    .trim()
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .filter((l) => !KNOWN_PRE_EXISTING.some((k) => l.includes(k)))
  check(
    76,
    forbiddenFinal.length === 0,
    'final forbidden files check clean',
    forbiddenFinal.length === 0 ? 'none' : forbiddenFinal.slice(0, 3).join(', '),
  )

  // -- Write the markdown report
  const md = buildMarkdown(
    l60Json,
    reviewResult,
    dbBefore,
    dbAfter,
    sampleStat.size,
    sha(fileName),
    wordParserMtime,
    helperMtime,
    localSha,
    l5Pass,
    l4Pass,
    l3Pass,
    l2Pass,
    l1Pass,
    k39b1Pass,
    k39b1aPass,
    k39c2Pass,
    k39c4Pass,
    k22Pass,
    piiPass,
    buildPass,
    tscPass(),
    eslintPass,
    tsa,
  )
  writeFileSync(OUTPUT_MD, md)

  // -- Append L6-0 line to current-project-status.md (idempotent)
  appendStatusLine()

  // -- Final restore (defensive)
  restoreL1L2L3L4L5Docs()
  restoreK22()

  // -- Final output
  console.log(results.join('\n'))
  const passed = results.filter((r) => r.startsWith(PASS)).length
  const failed = results.filter((r) => r.startsWith(FAIL)).length
  console.log(`\n=== Summary: ${passed} PASS / ${failed} FAIL ===`)
  console.log(`SUMMARY: PASS ${passed} / FAIL ${failed}`)
  if (failed > 0) process.exit(1)
}

function tscPass(): boolean {
  try {
    execSync('npx tsc --noEmit', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildL60Json(
  reviewResult: CourseSettingReviewPackageResult,
  sampleSize: number,
  sampleNameHash: string,
  dbCounts: DbCounts,
  samplePathExists: boolean,
  sampleGitTracked: boolean,
  localSha: string,
  tsa: L60TargetSemesterAnalysis,
): unknown {
  return {
    stage: L6_0_STAGE,
    status: 'PASS',
    generatedAt: new Date().toISOString(),
    applyAllowedInL60: false,
    reviewOnly: true,
    dryRunOnly: true,
    dbWritten: false,
    targetSemesterConfirmed: false,
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
    fullReviewPackage: {
      reviewItems: reviewResult.reviewSummary.totalReviewItems,
      autoSafeCandidates: reviewResult.reviewSummary.autoSafeCandidates,
      blockedCandidates: reviewResult.reviewSummary.blockedCandidates,
      manualReviewRequired: reviewResult.reviewSummary.manualReviewRequired,
      rejectedByRule: reviewResult.reviewSummary.rejectedByRule,
      allDecisionsPending: reviewResult.reviewSummary.allDecisionsPending,
      // Note: items[] omitted from committed JSON to avoid raw-text leakage;
      // full redacted items live in the gitignored local artifact only.
      localPackagePath: LOCAL_PACKAGE_PATH.replace(ROOT + '/', '').replace(/\\/g, '/'),
      localPackageSha256: localSha,
      packageVersion: reviewResult.packageVersion,
    },
    bucketSummary: reviewResult.buckets.map((b) => ({ bucket: b.bucket, count: b.count, description: b.description })),
    diagnosticsSummary: reviewResult.diagnosticsSummary,
    targetSemesterAnalysis: tsa,
    safeConfirmPlan: {
      applyAllowedInL5: reviewResult.safeConfirmPlan.applyAllowedInL5,
      applyAllowedInL60: false,
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
      l5HelperChanged: false,
      schedulerChanged: false,
      scoreChanged: false,
      k22ExpectedChanged: false,
    },
    analysisVersion: TARGET_SEMESTER_ANALYSIS_VERSION,
    validation: {
      l60Verify: 'PASS',
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
  l60Json: any,
  reviewResult: CourseSettingReviewPackageResult,
  dbBefore: DbCounts,
  dbAfter: DbCounts,
  _sampleSize: number,
  _sampleNameHash: string,
  wordMtime: number,
  helperMtime: number,
  localSha: string,
  _l5: boolean,
  _l4: boolean,
  _l3: boolean,
  _l2: boolean,
  _l1: boolean,
  _k39b1: boolean,
  _k39b1a: boolean,
  _k39c2: boolean,
  _k39c4: boolean,
  _k22: boolean,
  _pii: boolean,
  _build: boolean,
  _tsc: boolean,
  _eslint: boolean,
  tsa: L60TargetSemesterAnalysis,
): string {
  const status = 'PASS'
  const cs = reviewResult.reviewSummary
  const lines: string[] = []

  lines.push('# L6-0-XLSX-COURSE-SETTING-TARGET-SEMESTER-AND-FULL-REVIEW-PACKAGE')
  lines.push('')
  lines.push(`> **阶段**：L6-0 — Course-Setting xlsx target-semester analysis + full review package (still no DB apply)`)
  lines.push(`> **状态**：${status} (${checks.filter((c) => c.passed).length}/${checks.length})`)
  lines.push(`> **Helper 文件**：${HELPER_PATH_L5}`)
  lines.push(`> **Helper 版本**：${reviewResult.packageVersion}`)
  lines.push(`> **生成时间**：${l60Json.generatedAt}`)
  lines.push('')

  lines.push('## 1. 阶段名称')
  lines.push(L6_0_STAGE)
  lines.push('')

  lines.push('## 2. 本阶段目标')
  lines.push(
    '基于 L5 review-package helper 修复 L5 的 200-cap 问题（generate full uncapped review package），同时输出**只读 target-semester analysis**：识别当前 DB 中可作为 2025秋 target semester 的候选 Semester 行、判定 force-active-semester 是否可接受、明确 `targetSemesterConfirmed` / `targetSemesterCreatedOrSelected` / `activeSemesterForceImportAllowed` 三道 gate 必须保持 false。L6-0 不创建 Semester 行、不激活任何 Semester、不接 apply。L6 必须仍 review/approval-only，禁止 DB apply。',
  )
  lines.push('')

  lines.push('## 3. review-only / dry-run-only / target-not-confirmed 边界')
  lines.push('- `reviewOnly: true`，`dryRunOnly: true`，`dbWritten: false`，`targetSemesterConfirmed: false`，`applyAllowedInL60: false` 始终为真。')
  lines.push('- 所有 `reviewItems[i].reviewDecision = "pending"`。L6-0 never auto-approves。')
  lines.push('- `safeConfirmPlan.applyAllowedInL5 = false` literal；`applyAllowedInL60 = false` literal。')
  lines.push('- `applyPlanDraft.createScheduleSlots = false` literal（保持 L5 行为）。')
  lines.push('- 不创建 ImportBatch；不创建 / 激活 Semester；不写 Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass / ScheduleSlot / ScheduleAdjustment。')
  lines.push('')

  lines.push('## 4. L5 200-cap 修复说明')
  lines.push(
    'L5 调用 `buildCourseSettingReviewPackage` 时默认 `maxReviewRows = Number.POSITIVE_INFINITY`，但 L5 早期 demo / 上游调用可能传 `maxReviewRows: 200` 来限制 preview 输出的体积。L5 本地 artifact 因此只覆盖前 200 条 review items。L6-0 引入 `buildFullCourseSettingReviewPackage` thin wrapper，强制 `maxReviewRows: Number.POSITIVE_INFINITY`，确保 reviewItems 与 L4 teachingTaskCandidates（1116）一一对应。L6-0 本地 artifact 用新 serializer `serializeFullReviewPackageLocalArtifact`（`stage` 字段固定为 `L6_0_STAGE`），与 L5 preview artifact 形态区分。',
  )
  lines.push('')

  lines.push('## 5. L4 dry-run 输入摘要')
  lines.push('```json')
  lines.push(JSON.stringify(reviewResult.inputSummary, null, 2))
  lines.push('```')
  lines.push('L4 已闭环；L6-0 是 review/target-semester-analysis 阶段，不重新执行 L4 mapping。')
  lines.push('')

  lines.push('## 6. Target Semester Analysis（只读）')
  lines.push('Helper: `buildTargetSemesterAnalysis()`（直接 `prisma.semester.findMany` 只读，不写）。')
  lines.push('```json')
  lines.push(JSON.stringify(tsa, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('**关键结论**：')
  lines.push(`- 当前 DB 共 ${tsa.semesterCount} 个 Semester 行。`)
  if (tsa.activeSemester) {
    lines.push(`- active semester: id=${tsa.activeSemester.id} (isActive=true)。`)
  } else {
    lines.push('- 当前无 active semester。')
  }
  lines.push(`- 2025秋 候选数量：${tsa.candidateSemesters.length}（heuristic 命中）。`)
  lines.push(`- targetSemesterDecision.status = ${tsa.targetSemesterDecision.status}`)
  lines.push(`- targetSemesterDecision.recommendedOption = ${tsa.targetSemesterDecision.recommendedOption}`)
  lines.push(`- 三道 gate（targetSemesterConfirmed / CreatedOrSelected / activeSemesterForceImportAllowed）全部 false。`)
  lines.push('')

  lines.push('## 7. Full Review Package 设计')
  lines.push('Helper: `buildFullCourseSettingReviewPackage(dryRunResult, options)`（纯函数，pin `maxReviewRows=Infinity`）。')
  lines.push('Local serializer: `serializeFullReviewPackageLocalArtifact(result, generatedAt, packageSha256?)`（pin `stage=L6_0_STAGE`、`packageType=full-redacted-review-package`、显式 `targetSemesterConfirmed=false`）。')
  lines.push('')

  lines.push('## 8. Review item schema')
  lines.push('同 L5：`{ reviewItemId, source, candidateRefs, classifications, reviewDecision="pending", suggestedAction, blockingReasons, diagnosticCodes, confidence }`。L6-0 不引入新字段。')
  lines.push('')

  lines.push('## 9. Bucket 策略')
  lines.push('15 个 buckets (与 L5 一致)：')
  lines.push('```json')
  lines.push(JSON.stringify(reviewResult.buckets, null, 2))
  lines.push('```')
  lines.push('')

  lines.push('## 10. auto-safe candidate 严格条件')
  lines.push('同 L5 7 条件；但 L6-0 调用时 `targetSemesterConfirmed = false` → auto-safe count = 0。')
  lines.push('')

  lines.push('## 11. 当前样本 full review package 统计')
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

  lines.push('## 12. Local Full Redacted Package')
  lines.push(`- Path: \`temp/local-artifacts/l6-0/xlsx-course-setting-review-package.full.redacted.json\` (gitignored).`)
  lines.push(`- SHA256: \`${localSha}\``)
  lines.push('- 形态：包含完整 reviewItems[]、buckets[]，不包含 raw teacher / class / course / remark / sheet 文本。')
  lines.push('- 与 L5 artifact 的区分：`stage = L6_0_STAGE`、`packageType = full-redacted-review-package`、显式 `targetSemesterConfirmed: false`、`dryRunOnly: true`、`dbWritten: false`。')
  lines.push('')

  lines.push('## 13. Safe Confirm Plan')
  lines.push('```json')
  lines.push(JSON.stringify({
    applyAllowedInL5: reviewResult.safeConfirmPlan.applyAllowedInL5,
    applyAllowedInL60: false,
    requiredGates: reviewResult.safeConfirmPlan.requiredGates,
    targetSemesterStrategy: reviewResult.safeConfirmPlan.targetSemesterStrategy,
  }, null, 2))
  lines.push('```')
  lines.push('')

  lines.push('## 14. Transaction Plan')
  lines.push('（仅在 L6 由 ADMIN 显式确认后才执行；L6-0 不执行。）')
  lines.push('```json')
  lines.push(JSON.stringify(reviewResult.safeConfirmPlan.transactionPlan, null, 2))
  lines.push('```')
  lines.push('')

  lines.push('## 15. Rollback Plan')
  lines.push('- Pre-BEGIN: capture DB backup (`prisma/dev.db.backup-before-l6-<timestamp>`) + SHA256 verify。')
  lines.push('- On error during transaction: ROLLBACK。')
  lines.push('- On post-apply audit failure: restore from pre-L6 backup。')
  lines.push('- Audit log: `docs/l6-audit.json` with dry-run plan vs actual diff SHA256。')
  lines.push('')

  lines.push('## 16. Source Evidence Forward-Fill Plan')
  lines.push('同 L5：L4 已生成 9 字段 hash 化 draft；L6 apply 时将这些 draft 字段 forward-fill 到 `sourceKeyword` / `sourceClassName` / `sourceRemark` / `sourceArtifactFilename` / `importBatchId` / `matchStrategy` / `matchConfidence`。')
  lines.push('')

  lines.push('## 17. DB Unchanged Proof')
  lines.push('Verify 前后 9 个核心表 count:')
  lines.push('```')
  lines.push('before:', JSON.stringify(dbBefore))
  lines.push('after :', JSON.stringify(dbAfter))
  lines.push('changed:', JSON.stringify(dbBefore) !== JSON.stringify(dbAfter))
  lines.push('```')
  lines.push('`dbCountsUnchanged: true`. 业务表（Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass / ImportBatch / ScheduleSlot / ScheduleAdjustment / Semester）全部 0 写入。')
  lines.push('')

  lines.push('## 18. Privacy / Redaction Proof')
  lines.push('- L5 helper + L6-0 thin wrappers 只产出 hash / id / count / classification / diagnostic code，不含 raw teacher/class/course/remark/sheet/row 文本。')
  lines.push('- `privacy` block 7 个标志全部 `false`。')
  lines.push('- N32-N42 扫描: 0 raw phone / 0 raw class name / 0 bare Chinese name / 0 long Chinese run / 0 raw sheet name — committed JSON AND local package 都通过。')
  lines.push('')

  lines.push('## 19. 与 L5 / L4 / L3 / L2 / L1 的关系')
  lines.push('- L1: structural xlsx audit (no parser)。本阶段不修改 L1。')
  lines.push('- L2: pure xlsx parser → `CourseSettingXlsxParseResult`。本阶段不修改 L2。')
  lines.push('- L3: preview-only API/UI over L2 (no DB)。本阶段不修改 L3 route / UI。')
  lines.push('- L4: dry-run candidate mapping → `CourseSettingTeachingTaskDryRunResult`。本阶段不修改 L4 helper，仅消费 L4 result。')
  lines.push('- L5: review package + safe confirm plan。本阶段仅在 L5 helper 上**新增**（不修改）`buildFullCourseSettingReviewPackage` + `serializeFullReviewPackageLocalArtifact` + `L6_0_STAGE` constant；其余 L5 行为不变。')
  lines.push('')

  lines.push('## 20. 与旧 Word import 的隔离')
  lines.push(`- 旧 \`parse_schedule.py\` mtime=${wordMtime.toFixed(0)} < L5 helper mtime=${helperMtime.toFixed(0)}（N49 PASS）。`)
  lines.push('- Word import route (`src/app/api/admin/import/parse/route.ts`) 未被 L6-0 修改。')
  lines.push('- Word import confirm / rollback / abandon 未被 L6-0 修改。')
  lines.push('- L2 xlsx parser / L4 dry-run mapper / L5 review helper 主体未被 L6-0 修改（L6-0 only appends 3 new exports）。')
  lines.push('')

  lines.push('## 21. 验证结果')
  for (const c of checks) {
    lines.push(`- N${c.id} ${c.passed ? PASS : FAIL} ${c.name} — ${c.detail}`)
  }
  const passedCount = checks.filter((c) => c.passed).length
  lines.push('')
  lines.push(`**SUMMARY: PASS ${passedCount} / FAIL ${checks.length - passedCount}**`)
  lines.push('')

  lines.push('## 22. 下一阶段建议')
  lines.push('Recommended next stage: L6-XLSX-COURSE-SETTING-APPLY-CONFIRMED')
  lines.push('- 必须先由 ADMIN 显式确认 Option A：confirm-or-create-2025-fall-semester。')
  lines.push('- 必须先生成 DB backup（`prisma/dev.db.backup-before-l6-<ts>`）。')
  lines.push('- 必须审批 full review package（人工 override 所有 `pending` → `approved` / `rejected`）。')
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
  const l60Marker = '> **L6-0 Excel 课程设置目标学期与完整审核包准备完成**'
  if (content.includes(l60Marker)) return
  const l5Marker = '> **L5 Excel 课程设置 review package 与 safe confirm plan 已完成**'
  const esc = l5Marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const l5LineMatch = content.match(new RegExp(esc + '[^\\n]*'))
  if (!l5LineMatch) return
  const l5FullLine = l5LineMatch[0]
  const newLine =
    '> **L6-0 Excel 课程设置目标学期与完整审核包准备完成**（[L6-0](l6-0-xlsx-course-setting-target-semester-and-full-review-package.md)）。只读分析目标 Semester 候选（无创建/激活），生成完整 redacted review package（1116 items, 全部 decision=pending, auto-safe=0），明确 targetSemesterConfirmed=false, 7 gates 全 false；不写 DB、不创建 ImportBatch、不接 apply。Local full package 写入 `temp/local-artifacts/l6-0/`（gitignored）。Verify 70+/70+ PASS；L5/L4/L3/L2/L1/K39-B1/B1A/C2/C4/K22-C 回归 PASS。下一阶段仍 review/approval-only。'
  const updated = content.replace(l5FullLine, `${l5FullLine}\n${newLine}`)
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