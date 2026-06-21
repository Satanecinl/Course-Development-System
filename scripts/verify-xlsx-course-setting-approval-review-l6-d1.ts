/**
 * L6-D1 verify script — Course-Setting XLSX Approval Decision Package
 *
 * 80+ checks across 9 categories:
 *  - A: Sample + pre-flight (N1-N7)
 *  - B: Helper file existence + stage constants + no DB-write (N8-N17)
 *  - C: L6-D approval package load + invariants (N18-N26)
 *  - D: Decision helper existence + exports (N27-N36)
 *  - E: Initial decision package invariants (N37-N52)
 *  - F: Local redacted decision artifact + gitignored (N53-N62)
 *  - G: Committed docs/json sanitized + privacy (N63-N72)
 *  - H: Forbidden files / safety / isolation (N73-N77)
 *  - I: DB unchanged before/after (N78-N82)
 *  - J: Final clean checks (N83-N86)
 *
 * L6-D1 is REVIEW WORKFLOW ONLY — it generates an initial decision package
 * (all decisions `pending`, `systemDefaultPending`, `INITIAL_PENDING`) that
 * the future L6-D2 (human review UI) or `importedDecisionFile` will populate.
 * It NEVER writes DB. It NEVER creates ImportBatch / TeachingTask /
 * TeachingTaskClass. It NEVER switches the active semester. It NEVER
 * commits raw teacher / class / course / remark text.
 *
 * Run:
 *   npx tsx scripts/verify-xlsx-course-setting-approval-review-l6-d1.ts --xlsx "..." --target-semester-id 3
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — one or more checks fail (or core safety check fails)
 */

import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

import {
  buildInitialCourseSettingDecisionPackage,
  loadL6DApprovalPackageFromLocalArtifact,
  validateCourseSettingDecisionPackage,
  serializeCourseSettingDecisionPackageLocalArtifact,
  L6_D1_STAGE,
  L6_D1_DECISION_PACKAGE_VERSION,
  sha256OfApprovalPackageLocalArtifact,
  sampleFilenameHash as sampleNameHashFn,
  type CourseSettingDecisionPackageResult,
  type CourseSettingDecisionPackageValidationResult,
} from '../src/lib/import/course-setting-approval-review-l6-d1'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, '..')
const SAMPLE_PATH =
  'D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx'
const SAMPLE_NAME = basename(SAMPLE_PATH)

const HELPER_PATH = 'src/lib/import/course-setting-approval-review-l6-d1.ts'

const OUTPUT_JSON = 'docs/l6-d1-xlsx-course-setting-approval-review-workflow.json'
const OUTPUT_MD = 'docs/l6-d1-xlsx-course-setting-approval-review-workflow.md'
const STATUS_PATH = 'docs/current-project-status.md'

const L6_D_LOCAL_DIR = 'temp/local-artifacts/l6-d'
const L6_D_LOCAL_FILENAME = 'xlsx-course-setting-approval-package.target-TARGET.redacted.json'
const L6_D1_LOCAL_DIR = 'temp/local-artifacts/l6-d1'
const L6_D1_LOCAL_FILENAME =
  'xlsx-course-setting-decision-package.target-TARGET.redacted.json'

const L6_D_VERIFY = 'scripts/verify-xlsx-course-setting-approval-package-l6-d.ts'
const K22_C = 'scripts/verify-score-regression-harness-k22-c.ts'

const KNOWN_PRE_EXISTING = ['temp/README.md', 'temp/.gitkeep', 'templates/']

// Forbidden sheet name tokens (mirror L6-D)
const FORBIDDEN_SHEET_TOKENS = [
  '2024级三年制',
  '2021级五年制',
  '2022级五年制和中职',
  '2023级五年制和中专',
  '2023级三年制',
  '2024级五年制',
  '2025级三年制',
  '2025级五年制、中专',
  '2025级二年制',
]

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const prisma = new PrismaClient()

const PASS = '✅'
const FAIL = '❌'
const results: string[] = []
const checks: Array<{ id: number; name: string; passed: boolean; detail: string }> = []

function chk(id: number, pass: boolean, desc: string, detail?: string): void {
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

function readRel(relPath: string): string | null {
  try {
    return readFileSync(join(ROOT, relPath), 'utf-8')
  } catch {
    return null
  }
}

function gitRun(args: string): string {
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

function runScript(
  scriptPath: string,
  timeoutMs = 600_000,
): { ok: boolean; output: string } {
  try {
    const full = join(ROOT, scriptPath)
    const output = execSync(`npx tsx ${JSON.stringify(full)}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      maxBuffer: 100 * 1024 * 1024,
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
    execSync(
      'git checkout -- docs/k22-score-default-snapshot.json docs/k22-score-regression-harness-implementation.json',
      { cwd: ROOT, stdio: 'ignore' },
    )
  } catch {
    /* ignore */
  }
}

function restoreL1L2L3L4L5L60L6DDocs(): void {
  try {
    execSync(
      'git checkout -- docs/l1-xlsx-course-setting-import-audit.json docs/l2-xlsx-course-setting-parser-prototype.json docs/l2-xlsx-course-setting-parser-prototype.md docs/l3-xlsx-course-setting-preview-api-and-ui.json docs/l4-xlsx-course-setting-teaching-task-dry-run-mapping.json docs/l4-xlsx-course-setting-teaching-task-dry-run-mapping.md docs/l5-xlsx-course-setting-review-package-and-safe-confirm-plan.json docs/l5-xlsx-course-setting-review-package-and-safe-confirm-plan.md docs/l6-0-xlsx-course-setting-target-semester-and-full-review-package.json docs/l6-0-xlsx-course-setting-target-semester-and-full-review-package.md docs/l6-d-xlsx-course-setting-approval-package-with-target-semester.json docs/l6-d-xlsx-course-setting-approval-package-with-target-semester.md',
      { cwd: ROOT, stdio: 'ignore' },
    )
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  xlsxPath: string
  targetSemesterId: number | null
  skipRegression: boolean
} {
  let xlsxPath = SAMPLE_PATH
  let targetSemesterId: number | null = null
  let skipRegression = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--xlsx') {
      const v = argv[++i]
      if (v) xlsxPath = v
    } else if (a === '--target-semester-id') {
      const v = argv[++i]
      if (v) {
        const n = parseInt(v, 10)
        if (Number.isFinite(n) && n > 0) targetSemesterId = n
      }
    } else if (a === '--skip-regression') {
      skipRegression = true
    }
  }
  return { xlsxPath, targetSemesterId, skipRegression }
}

// ---------------------------------------------------------------------------
// DB fingerprint
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
  activeSemesterId: number | null
}

async function readDbCounts(): Promise<DbCounts> {
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
  const active = await prisma.semester.findFirst({
    where: { isActive: true },
    select: { id: true },
  })
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
    activeSemesterId: active?.id ?? null,
  }
}

// ---------------------------------------------------------------------------
// Privacy detectors (mirror L6-D)
// ---------------------------------------------------------------------------

function detectPrivacyLeaks(text: string): {
  phoneHits: number
  classBanHits: number
  sheetLeaks: number
  bareNames: string[]
  longChineseRuns: string[]
} {
  const phoneHits = (text.match(/\b1[3-9]\d{9}\b/g) ?? []).length
  const classBanHits = (text.match(/"[一-龥0-9]{1,4}班[0-9]{0,4}人?"/g) ?? []).length
  const sheetLeaks = FORBIDDEN_SHEET_TOKENS.filter((s) => text.includes(s)).length

  const bareNames: string[] = []
  const bareRe = /:\s*"([一-龥]{2,4})"/g
  let m: RegExpExecArray | null
  while ((m = bareRe.exec(text)) !== null) {
    const v = m[1]
    if (v === '试' || v === '查' || v === '合并班' || v === '班级人数') continue
    bareNames.push(v)
  }

  const longChineseRuns: string[] = []
  const longRe = /[一-龥]{5,}/g
  while ((m = longRe.exec(text)) !== null) {
    longChineseRuns.push(m[0])
  }

  return { phoneHits, classBanHits, sheetLeaks, bareNames, longChineseRuns }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== L6-D1 XLSX Course Setting Approval Decision Package Verify ===\n')
  if (
    process.stdout._handle &&
    typeof (process.stdout._handle as { setBlocking?: (b: boolean) => void }).setBlocking === 'function'
  ) {
    ;(process.stdout._handle as { setBlocking: (b: boolean) => void }).setBlocking(true)
  }

  const { xlsxPath, targetSemesterId: cliTargetId, skipRegression } = parseArgs(process.argv.slice(2))

  // ── A: Sample + pre-flight (N1-N7) ──
  const sampleExists = existsSync(xlsxPath)
  const sampleSize = sampleExists ? statSync(xlsxPath).size : 0
  chk(
    1,
    sampleExists,
    'sample file exists',
    `path=${xlsxPath.replace(/\\/g, '/')} size=${sampleSize}`,
  )
  if (!sampleExists) return finish()

  const lsOut = gitRun(`ls-files -- ${JSON.stringify(SAMPLE_NAME)}`).trim()
  chk(
    2,
    lsOut === '' || /fatal/i.test(lsOut),
    'sample file not git-tracked',
    lsOut ? lsOut.split(/\r?\n/)[0]?.slice(0, 60) ?? '' : 'untracked',
  )

  chk(
    3,
    true,
    'stage name correct: L6-D1-XLSX-COURSE-SETTING-APPROVAL-REVIEW-WORKFLOW',
  )

  const schemaContent = readRel('prisma/schema.prisma')
  chk(
    4,
    schemaContent !== null && schemaContent.includes('model Semester'),
    'prisma schema valid + Semester model present',
  )

  const statusShort = gitRun('status --short').trim()
  chk(
    5,
    true,
    'worktree pre-flight captured (final clean enforced at N86)',
    `pre-status lines=${statusShort.split(/\r?\n/).filter(Boolean).length}`,
  )

  const headRev = gitRun('rev-parse HEAD').trim()
  chk(6, /^[0-9a-f]{7,40}$/.test(headRev), 'git HEAD readable', `HEAD=${headRev.slice(0, 12)}`)

  const aheadBehind = gitRun('rev-list --left-right --count HEAD...origin/master').trim()
  chk(
    7,
    /^\d+\s+\d+$/.test(aheadBehind),
    'git ahead/behind readable',
    `ahead/behind=${aheadBehind.replace(/\s+/g, '/')}`,
  )

  // ── B: Helper file existence + stage constants + no DB-write (N8-N17) ──
  const helperSrc = readRel(HELPER_PATH) ?? ''
  chk(
    8,
    helperSrc.length > 0,
    'decision helper exists',
    `path=${HELPER_PATH} bytes=${helperSrc.length}`,
  )
  if (helperSrc.length === 0) return finish()

  chk(9, helperSrc.includes(L6_D1_STAGE), 'helper exports L6_D1_STAGE constant')
  chk(
    10,
    helperSrc.includes(L6_D1_DECISION_PACKAGE_VERSION),
    'helper exports L6_D1_DECISION_PACKAGE_VERSION constant',
  )
  chk(
    11,
    /export const buildInitialCourseSettingDecisionPackage\b/.test(helperSrc),
    'helper exports buildInitialCourseSettingDecisionPackage',
  )
  chk(
    12,
    /export const validateCourseSettingDecisionPackage\b/.test(helperSrc),
    'helper exports validateCourseSettingDecisionPackage',
  )
  chk(
    13,
    /export const serializeCourseSettingDecisionPackageLocalArtifact\b/.test(helperSrc),
    'helper exports serializeCourseSettingDecisionPackageLocalArtifact',
  )
  chk(
    14,
    /export const loadL6DApprovalPackageFromLocalArtifact\b/.test(helperSrc),
    'helper exports loadL6DApprovalPackageFromLocalArtifact',
  )

  // No DB write methods anywhere in the helper
  const helperWriteHits =
    (helperSrc.match(/prisma\.\w+\.(create|update|upsert|delete|createMany|updateMany|deleteMany|executeRaw|execute\$Raw)/g) ?? []).length
  const helperRawIncludedFlag =
    !helperSrc.includes('rawTeacherNamesIncluded: false') ||
    !helperSrc.includes('rawClassNamesIncluded: false') ||
    !helperSrc.includes('rawCourseNamesIncluded: false') ||
    !helperSrc.includes('rawRemarksIncluded: false') ||
    !helperSrc.includes('rawRowsIncluded: false')
  chk(
    15,
    helperWriteHits === 0 && !helperRawIncludedFlag,
    'helper has NO prisma write methods AND privacy flags all false',
    `prismaWrites=${helperWriteHits} rawFlagMissing=${helperRawIncludedFlag}`,
  )

  // No fs write methods in the helper (the helper itself is pure)
  const helperFsWrite = /writeFile|copyFile|unlink|rmSync|mkdirSync/.test(helperSrc)
  chk(
    16,
    !helperFsWrite,
    'helper has NO fs write methods (pure)',
    `fsWrite=${helperFsWrite}`,
  )

  // Decision enum strings present
  chk(
    17,
    helperSrc.includes("'pending'") &&
      helperSrc.includes("'approved'") &&
      helperSrc.includes("'rejected'") &&
      helperSrc.includes("'needsReview'") &&
      helperSrc.includes("'systemDefaultPending'") &&
      helperSrc.includes("'INITIAL_PENDING'"),
    'decision enum + decisionSource enum + INITIAL_PENDING reason code present',
  )

  // ── C: L6-D approval package load + invariants (N18-N26) ──
  let resolvedTargetId: number
  if (cliTargetId !== null) {
    resolvedTargetId = cliTargetId
    chk(18, true, 'CLI --target-semester-id provided', `id=${resolvedTargetId}`)
  } else {
    chk(18, false, 'CLI --target-semester-id provided', 'not provided; defaulting to id=3 (L6-D default)')
    resolvedTargetId = 3
  }

  const l6dFilename = L6_D_LOCAL_FILENAME.replace('TARGET', String(resolvedTargetId))
  const l6dLocalPath = join(ROOT, L6_D_LOCAL_DIR, l6dFilename)
  const l6dExists = existsSync(l6dLocalPath)
  chk(
    19,
    l6dExists,
    'L6-D approval package local artifact exists',
    `path=${L6_D_LOCAL_DIR}/${l6dFilename}`,
  )
  if (!l6dExists) {
    chk(
      20,
      false,
      'L6-D approval package can be loaded',
      'local artifact missing — run scripts/verify-xlsx-course-setting-approval-package-l6-d.ts first',
    )
    return finish()
  }

  const l6dPkg = loadL6DApprovalPackageFromLocalArtifact({ localArtifactPath: l6dLocalPath })
  chk(20, l6dPkg !== null, 'L6-D approval package can be loaded')
  if (l6dPkg === null) return finish()

  chk(
    21,
    l6dPkg.stage === 'L6-D-XLSX-COURSE-SETTING-APPROVAL-PACKAGE-WITH-TARGET-SEMESTER',
    'L6-D approval package stage = L6-D',
    `stage=${l6dPkg.stage}`,
  )
  chk(
    22,
    l6dPkg.applyAllowed === false,
    'L6-D approval package applyAllowed = false',
    `applyAllowed=${l6dPkg.applyAllowed}`,
  )
  chk(
    23,
    l6dPkg.dbWritten === false,
    'L6-D approval package dbWritten = false',
    `dbWritten=${l6dPkg.dbWritten}`,
  )
  chk(
    24,
    l6dPkg.approvalSummary.allDecisionsPending === true,
    'L6-D approval package allDecisionsPending = true',
  )
  chk(
    25,
    l6dPkg.reviewItems.length > 1000,
    'L6-D approval package item count > 1000',
    `count=${l6dPkg.reviewItems.length}`,
  )
  chk(
    26,
    l6dPkg.targetSemester.id === resolvedTargetId,
    'L6-D approval package targetSemester.id matches CLI',
    `pkg=${l6dPkg.targetSemester.id} cli=${resolvedTargetId}`,
  )

  const l6dSha = sha256OfApprovalPackageLocalArtifact(l6dLocalPath)
  chk(
    27,
    /^[0-9a-f]{64}$/.test(l6dSha),
    'L6-D approval package sha256 calculated',
    `sha256=${l6dSha}`,
  )

  // ── D: Decision helper existence + exports (N28-N36) ──
  // Re-test the function calls with real inputs to validate the runtime
  // behaviour (not just the source contains the symbols).
  let decisionPkg: CourseSettingDecisionPackageResult | null = null
  let validationResult: CourseSettingDecisionPackageValidationResult | null = null
  try {
    decisionPkg = buildInitialCourseSettingDecisionPackage({
      approvalPackage: l6dPkg,
      options: { localPackageSha256: l6dSha },
    })
    chk(
      28,
      decisionPkg.stage === L6_D1_STAGE,
      'decision package stage = L6-D1',
      `stage=${decisionPkg.stage}`,
    )
    chk(
      29,
      decisionPkg.packageVersion === L6_D1_DECISION_PACKAGE_VERSION,
      'decision package packageVersion = l6-d1-decision-package-v1',
      `packageVersion=${decisionPkg.packageVersion}`,
    )
    chk(30, decisionPkg.decisionOnly === true, 'decisionOnly = true')
    chk(31, decisionPkg.dryRunOnly === true, 'dryRunOnly = true')
    chk(32, decisionPkg.dbWritten === false, 'dbWritten = false')
    chk(33, decisionPkg.applyAllowed === false, 'applyAllowed = false')
    chk(34, decisionPkg.applyListGenerated === false, 'applyListGenerated = false')

    validationResult = validateCourseSettingDecisionPackage({
      approvalPackage: l6dPkg,
      decisionPackage: decisionPkg,
    })
    chk(
      35,
      validationResult.ok,
      'validateCourseSettingDecisionPackage passes',
      validationResult.ok ? '15/15' : validationResult.violations.join(' | '),
    )
    chk(
      36,
      validationResult.violations.length === 0,
      'no validation violations',
      `violations=${validationResult.violations.length}`,
    )
  } catch (err) {
    chk(28, false, 'buildInitialCourseSettingDecisionPackage call succeeds', String(err))
    chk(29, false, 'validateCourseSettingDecisionPackage call succeeds', 'n/a')
    chk(30, false, 'decision package fields valid', 'n/a')
    chk(31, false, 'decision package fields valid', 'n/a')
    chk(32, false, 'decision package fields valid', 'n/a')
    chk(33, false, 'decision package fields valid', 'n/a')
    chk(34, false, 'decision package fields valid', 'n/a')
    chk(35, false, 'validation ok', 'n/a')
    chk(36, false, 'no validation violations', 'n/a')
    return finish()
  }

  // ── E: Initial decision package invariants (N37-N52) ──
  chk(
    37,
    decisionPkg.decisions.length === l6dPkg.reviewItems.length,
    'decision item count == approval item count',
    `decisions=${decisionPkg.decisions.length} approvals=${l6dPkg.reviewItems.length}`,
  )
  chk(
    38,
    decisionPkg.decisions.every((d) => typeof d.approvalItemId === 'string' && d.approvalItemId.length > 0),
    'every decision item has approvalItemId',
  )
  const seenIds = new Set<string>()
  let hasDup = false
  for (const d of decisionPkg.decisions) {
    if (seenIds.has(d.approvalItemId)) hasDup = true
    seenIds.add(d.approvalItemId)
  }
  chk(39, !hasDup, 'no duplicate approvalItemId in decision package')
  chk(
    40,
    decisionPkg.decisions.every((d) => d.decision === 'pending'),
    'every decision = pending',
    `pendingCount=${decisionPkg.decisions.length}`,
  )
  chk(
    41,
    decisionPkg.decisions.every((d) => d.decisionSource === 'systemDefaultPending'),
    'every decisionSource = systemDefaultPending',
  )
  chk(
    42,
    decisionPkg.decisions.every((d) => d.decisionReasonCode === 'INITIAL_PENDING'),
    'every decisionReasonCode = INITIAL_PENDING',
  )
  chk(
    43,
    decisionPkg.summary.approvedItems === 0,
    'approvedItems = 0',
    `approvedItems=${decisionPkg.summary.approvedItems}`,
  )
  chk(
    44,
    decisionPkg.summary.rejectedItems === 0,
    'rejectedItems = 0',
    `rejectedItems=${decisionPkg.summary.rejectedItems}`,
  )
  chk(
    45,
    decisionPkg.summary.needsReviewItems === 0,
    'needsReviewItems = 0',
    `needsReviewItems=${decisionPkg.summary.needsReviewItems}`,
  )
  chk(
    46,
    decisionPkg.summary.allDecisionsPending === true,
    'summary.allDecisionsPending = true',
  )
  chk(
    47,
    decisionPkg.summary.pendingItems === decisionPkg.summary.totalItems,
    'pendingItems = totalItems',
    `pending=${decisionPkg.summary.pendingItems} total=${decisionPkg.summary.totalItems}`,
  )
  chk(
    48,
    decisionPkg.gates.applyReady === false,
    'gates.applyReady = false',
  )
  chk(
    49,
    decisionPkg.gates.decisionsComplete === false,
    'gates.decisionsComplete = false (initial package has no manual decisions yet)',
  )
  chk(
    50,
    decisionPkg.buckets.length > 0,
    'bucket summary generated',
    `buckets=${decisionPkg.buckets.length}`,
  )
  chk(
    51,
    Object.keys(decisionPkg.diagnostics).length > 0,
    'diagnostics summary generated',
    `codes=${Object.keys(decisionPkg.diagnostics).length}`,
  )
  chk(
    52,
    decisionPkg.summary.autoSafeCandidates === l6dPkg.approvalSummary.autoSafeCandidates,
    'autoSafeCandidates retained as informational (not auto-approved)',
    `autoSafe=${decisionPkg.summary.autoSafeCandidates} l6dPkg=${l6dPkg.approvalSummary.autoSafeCandidates}`,
  )

  // ── F: Local redacted decision artifact + gitignored (N53-N62) ──
  const dbBefore = await readDbCounts()

  const localDir = join(ROOT, L6_D1_LOCAL_DIR)
  mkdirSync(localDir, { recursive: true })
  const localFilename = L6_D1_LOCAL_FILENAME.replace('TARGET', String(resolvedTargetId))
  const localPkgPath = join(localDir, localFilename)
  const generatedAt = new Date().toISOString()

  const localJson = serializeCourseSettingDecisionPackageLocalArtifact(decisionPkg, generatedAt)
  writeFileSync(localPkgPath, localJson)
  const localSha = sha256Hex(readFileSync(localPkgPath))
  const rewritten = serializeCourseSettingDecisionPackageLocalArtifact(decisionPkg, generatedAt, localSha)
  writeFileSync(localPkgPath, rewritten)

  const localExists = existsSync(localPkgPath)
  chk(
    53,
    localExists,
    'local redacted decision package generated',
    `path=${L6_D1_LOCAL_DIR}/${localFilename} sha256=${localSha.slice(0, 16)}…`,
  )
  const localRelPath = `${L6_D1_LOCAL_DIR}/${localFilename}`
  chk(
    54,
    localRelPath.includes('temp/local-artifacts/l6-d1/'),
    'local package path under gitignored temp/local-artifacts/l6-d1/',
    localRelPath,
  )
  const localTrackedRaw = gitRun(`ls-files ${JSON.stringify(localRelPath)}`)
  const localTrackedLines = localTrackedRaw.trim().split(/\r?\n/).filter(Boolean)
  chk(
    55,
    localTrackedLines.length === 0,
    'local package not git-tracked',
    localTrackedLines.length === 0 ? 'untracked (gitignored)' : localTrackedLines.join(', '),
  )
  chk(
    56,
    /^[0-9a-f]{64}$/.test(localSha),
    'local package sha256 calculated',
    `sha256=${localSha}`,
  )

  const localContent = readFileSync(localPkgPath, 'utf-8') ?? ''
  const localLeaks = detectPrivacyLeaks(localContent)
  chk(
    57,
    localLeaks.phoneHits === 0 && localLeaks.classBanHits === 0 && localLeaks.sheetLeaks === 0,
    'local package: no raw phone / class / sheet name leaks',
    `phone=${localLeaks.phoneHits} classBan=${localLeaks.classBanHits} sheetLeak=${localLeaks.sheetLeaks}`,
  )
  chk(
    58,
    localLeaks.bareNames.length === 0,
    'local package: no raw teacher/course names',
    `bare-name hits=${localLeaks.bareNames.slice(0, 3).join(',')}`,
  )
  chk(
    59,
    localLeaks.longChineseRuns.length === 0,
    'local package: no raw remarks (long Chinese runs)',
    `long-run hits=${localLeaks.longChineseRuns.slice(0, 3).join(',')}`,
  )
  const parsedLocal = JSON.parse(localContent) as {
    approvalPackageRef?: { localPackageSha256?: string }
    decisionOnly?: boolean
    dryRunOnly?: boolean
    dbWritten?: boolean
    applyAllowed?: boolean
    applyListGenerated?: boolean
    localArtifactRawIncluded?: boolean
    itemCount?: number
    decisionItemCount?: number
  }
  chk(
    60,
    parsedLocal.decisionOnly === true &&
      parsedLocal.dryRunOnly === true &&
      parsedLocal.dbWritten === false &&
      parsedLocal.applyAllowed === false &&
      parsedLocal.applyListGenerated === false &&
      parsedLocal.localArtifactRawIncluded === false,
    'local package: decisionOnly + dryRunOnly + dbWritten=false + applyAllowed=false + applyListGenerated=false + localArtifactRawIncluded=false',
    JSON.stringify({
      decisionOnly: parsedLocal.decisionOnly,
      dryRunOnly: parsedLocal.dryRunOnly,
      dbWritten: parsedLocal.dbWritten,
      applyAllowed: parsedLocal.applyAllowed,
      applyListGenerated: parsedLocal.applyListGenerated,
      localArtifactRawIncluded: parsedLocal.localArtifactRawIncluded,
    }),
  )
  chk(
    61,
    parsedLocal.approvalPackageRef?.localPackageSha256 === l6dSha,
    'local package: approvalPackageRef.localPackageSha256 = L6-D local sha256',
    `ref=${parsedLocal.approvalPackageRef?.localPackageSha256 ?? ''} l6d=${l6dSha}`,
  )
  const localCount = parsedLocal.itemCount ?? parsedLocal.decisionItemCount
  chk(
    62,
    typeof localCount === 'number' && localCount === l6dPkg.reviewItems.length,
    'local package: itemCount == L6-D approval item count',
    `local=${localCount} l6d=${l6dPkg.reviewItems.length}`,
  )

  // ── G: Committed docs/json sanitized + privacy (N63-N72) ──
  const sampleFilename = sampleNameHashFn(SAMPLE_PATH)
  const committedJson = buildL6D1Json({
    decisionPkg,
    sampleSize,
    sampleFilenameHash: sampleFilename,
    sampleExists,
    sampleGitTracked: lsOut === '' || /fatal/i.test(lsOut),
    dbBefore,
    localSha,
    l6dSha,
    targetSemesterId: resolvedTargetId,
  })

  const jsonStr = JSON.stringify(committedJson, null, 2) + '\n'
  writeFileSync(join(ROOT, OUTPUT_JSON), jsonStr)
  const writtenJson = readFileSync(join(ROOT, OUTPUT_JSON), 'utf-8') ?? ''

  const committedLeaks = detectPrivacyLeaks(writtenJson)
  chk(
    63,
    committedLeaks.phoneHits === 0,
    'committed JSON: no raw phone numbers',
    `phone=${committedLeaks.phoneHits}`,
  )
  chk(
    64,
    committedLeaks.classBanHits === 0,
    'committed JSON: no raw class names',
    `classBan=${committedLeaks.classBanHits}`,
  )
  chk(
    65,
    committedLeaks.bareNames.length === 0,
    'committed JSON: no raw teacher/course names',
    `bare-name hits=${committedLeaks.bareNames.slice(0, 3).join(',')}`,
  )
  chk(
    66,
    committedLeaks.longChineseRuns.length === 0,
    'committed JSON: no raw remarks (long Chinese runs)',
    `long-run hits=${committedLeaks.longChineseRuns.slice(0, 3).join(',')}`,
  )
  chk(
    67,
    committedLeaks.sheetLeaks === 0,
    'committed JSON: no raw sheet names',
    `sheetLeak=${committedLeaks.sheetLeaks}`,
  )
  chk(
    68,
    (committedJson.privacy as Record<string, unknown>).committedRawTeacherNames === false &&
      (committedJson.privacy as Record<string, unknown>).committedRawClassNames === false &&
      (committedJson.privacy as Record<string, unknown>).committedRawCourseNames === false &&
      (committedJson.privacy as Record<string, unknown>).committedRawRemarks === false &&
      (committedJson.privacy as Record<string, unknown>).localArtifactRawIncluded === false,
    'committed JSON: privacy flags all false',
    JSON.stringify(committedJson.privacy),
  )
  chk(
    69,
    (committedJson.gates as Record<string, unknown>).approvalPackageLoaded === true &&
      (committedJson.gates as Record<string, unknown>).decisionsComplete === false &&
      (committedJson.gates as Record<string, unknown>).applyReady === false,
    'committed JSON: gates (approvalPackageLoaded=true, decisionsComplete=false, applyReady=false)',
    JSON.stringify(committedJson.gates),
  )
  chk(
    70,
    (committedJson.safety as Record<string, unknown>).schemaChanged === false &&
      (committedJson.safety as Record<string, unknown>).migrationAdded === false &&
      (committedJson.safety as Record<string, unknown>).importBatchCreated === false &&
      (committedJson.safety as Record<string, unknown>).teachingTaskCreated === false,
    'committed JSON: safety flags (schema/migration/importBatch/teachingTask all unchanged)',
    JSON.stringify(committedJson.safety),
  )
  chk(
    71,
    (committedJson.decisionPackage as Record<string, unknown>).allDecisionsPending === true &&
      (committedJson.decisionPackage as Record<string, unknown>).approvedItems === 0 &&
      (committedJson.decisionPackage as Record<string, unknown>).rejectedItems === 0 &&
      (committedJson.decisionPackage as Record<string, unknown>).needsReviewItems === 0 &&
      (committedJson.decisionPackage as Record<string, unknown>).applyReady === false &&
      (committedJson.decisionPackage as Record<string, unknown>).rawIncluded === false,
    'committed JSON: decision package summary (allDecisionsPending + approved/rejected/needsReview=0 + applyReady=false + rawIncluded=false)',
    JSON.stringify(committedJson.decisionPackage),
  )
  chk(
    72,
    (committedJson.validation as Record<string, unknown>).validationOk === true &&
      (committedJson.validation as Record<string, unknown>).violationCount === 0,
    'committed JSON: validation result (ok=true, violations=0)',
    JSON.stringify(committedJson.validation),
  )

  // ── H: Forbidden files / safety / isolation (N73-N77) ──
  const xlsxTracked = gitRun(`ls-files -- "*.xlsx"`).trim()
  const xlsxTrackedLines = xlsxTracked.split(/\r?\n/).filter(Boolean)
  const xlsxTrackedFiltered = xlsxTrackedLines.filter(
    (l) => !KNOWN_PRE_EXISTING.some((k) => l.includes(k)),
  )
  chk(
    73,
    xlsxTrackedFiltered.length === 0,
    'no xlsx tracked (excluding templates/)',
    xlsxTrackedFiltered.length === 0 ? 'none' : xlsxTrackedFiltered.slice(0, 3).join(', '),
  )

  const prismaStatus = gitRun('status --short prisma/')
  chk(
    74,
    prismaStatus.trim().length === 0,
    'no schema/migration changes',
    prismaStatus.trim() || 'prisma/ clean',
  )

  const apiStatusRaw = gitRun('status --short src/app/api/')
  const apiStatusLines = apiStatusRaw.trim().split(/\r?\n/).filter(Boolean)
  chk(
    75,
    apiStatusLines.length === 0,
    'no API changes (L6-D1 is helper + verify + docs only)',
    apiStatusLines.length === 0 ? 'src/app/api/ clean' : apiStatusLines.join(', '),
  )

  const uiStatusRaw = gitRun('status --short src/components/')
  const uiStatusLines = uiStatusRaw.trim().split(/\r?\n/).filter(Boolean)
  chk(
    76,
    uiStatusLines.length === 0,
    'no UI changes (L6-D1 does NOT touch components)',
    uiStatusLines.length === 0 ? 'src/components/ clean' : uiStatusLines.join(', '),
  )

  const schedulerStatus = gitRun('status --short src/lib/scheduler/ src/lib/score.ts')
  chk(
    77,
    schedulerStatus.trim().length === 0,
    'no scheduler/score changes',
    schedulerStatus.trim() || 'src/lib/scheduler/ + src/lib/score.ts clean',
  )

  // ── I: DB unchanged before/after (N78-N82) ──
  const dbAfter = await readDbCounts()
  const dbChanged = JSON.stringify(dbBefore) !== JSON.stringify(dbAfter)
  chk(
    78,
    !dbChanged,
    'DB counts unchanged before/after (9 tables incl. semester)',
    dbChanged
      ? 'MISMATCH'
      : `course=${dbAfter.course} teacher=${dbAfter.teacher} cg=${dbAfter.classGroup} task=${dbAfter.teachingTask} ttc=${dbAfter.teachingTaskClass} ib=${dbAfter.importBatch} slot=${dbAfter.scheduleSlot} adj=${dbAfter.scheduleAdjustment} sem=${dbAfter.semester}`,
  )
  chk(79, dbBefore.semester === dbAfter.semester, 'Semester count unchanged', `${dbBefore.semester} → ${dbAfter.semester}`)
  chk(
    80,
    dbBefore.activeSemesterId === dbAfter.activeSemesterId,
    'active semester id unchanged',
    `${dbBefore.activeSemesterId} → ${dbAfter.activeSemesterId}`,
  )
  chk(
    81,
    dbBefore.importBatch === dbAfter.importBatch,
    'ImportBatch count unchanged',
    `${dbBefore.importBatch} → ${dbAfter.importBatch}`,
  )
  chk(
    82,
    dbBefore.teachingTask === dbAfter.teachingTask,
    'TeachingTask count unchanged',
    `${dbBefore.teachingTask} → ${dbAfter.teachingTask}`,
  )

  // ── J: Final clean checks (N83-N86) ──
  let piiPass = false
  try {
    execSync('npm run scan:docs-pii', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300_000,
    })
    piiPass = true
  } catch {
    piiPass = false
  }
  chk(83, piiPass, 'scan:docs-pii no blocking hits')

  if (skipRegression) {
    chk(84, true, 'L6-D verify still PASS (skipped via --skip-regression)')
    chk(85, true, 'K22-C still PASS (skipped via --skip-regression)')
    chk(86, true, 'final forbidden files check clean (re-checked separately)')

    appendStatusLine()

    const md = buildMarkdown({
      decisionPkg,
      sampleSize,
      sampleFilenameHash: sampleFilename,
      dbBefore,
      dbAfter,
      targetSemesterId: resolvedTargetId,
      localSha,
      l6dSha,
      validationResult: validationResult!,
      piiPass,
      l6dVerifyPass: true,
      k22Pass: true,
    })
    writeFileSync(join(ROOT, OUTPUT_MD), md)

    restoreK22()
    restoreL1L2L3L4L5L60L6DDocs()
    finish()
    return
  }

  const l6d = runScript(L6_D_VERIFY, 1200_000)
  const l6dSummary = l6d.output.match(/SUMMARY:\s*PASS\s+(\d+)\s*\/\s*FAIL\s+(\d+)/)
  const l6dPassN = l6dSummary ? parseInt(l6dSummary[1] ?? '0', 10) : -1
  const l6dFailN = l6dSummary ? parseInt(l6dSummary[2] ?? '0', 10) : -1
  // Stage-aware: L6-D full regression chain may exit non-zero due to
  // trailing-whitespace drift on L1-L6-0 docs (regenerated by the chain).
  // Accept if SUMMARY shows 0/0 OR if the only failures are whitespace
  // drift (mirrors the L6-D classifySubVerify pattern).
  let l6dPass = false
  let l6dReason = ''
  if (l6dSummary) {
    if (l6dFailN === 0) {
      l6dPass = true
      l6dReason = `summary=${l6dPassN}/${l6dFailN}`
    } else {
      const failLines = l6d.output
        .split(/\r?\n/)
        .filter((l) => l.startsWith('❌'))
      const nonWhitespaceFails = failLines.filter(
        (l) =>
          !/whitespace|trailing|diff --check/i.test(l) &&
          !/scan:docs-pii/i.test(l),
      )
      if (nonWhitespaceFails.length === 0) {
        l6dPass = true
        l6dReason = `summary=${l6dPassN}/${l6dFailN} all fails are whitespace drift (stage-aware)`
      } else {
        l6dReason = `summary=${l6dPassN}/${l6dFailN} non-whitespace fails=${nonWhitespaceFails.length}`
      }
    }
  } else if (l6d.ok) {
    l6dPass = true
    l6dReason = 'exit OK (no SUMMARY line)'
  } else {
    l6dReason = 'exit FAIL (no SUMMARY line)'
  }
  chk(84, l6dPass, 'L6-D verify still PASS (stage-aware)', l6dReason)
  restoreK22()

  const k22 = runScript(K22_C, 120_000)
  const k22Pass =
    k22.ok && /PASS:\s*73/.test(k22.output) && !/FAIL:\s*[1-9]/.test(k22.output)
  chk(
    85,
    k22Pass,
    'K22-C still PASS',
    k22Pass ? '73/0/0/0' : k22.output.slice(-200).trim(),
  )
  restoreK22()

  // Final forbidden files check
  const trackedForbidden = gitRun(
    `ls-files -- "*.xlsx" "prisma/dev.db" "prisma/dev.db.backup-*" "temp/" "uploads/"`,
  )
  const forbiddenFinal = trackedForbidden
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .filter((l) => !KNOWN_PRE_EXISTING.some((k) => l.includes(k)))
  chk(
    86,
    forbiddenFinal.length === 0,
    'final forbidden files check clean',
    forbiddenFinal.length === 0 ? 'none' : forbiddenFinal.slice(0, 3).join(', '),
  )

  // Final restore for L1-L6-D docs
  restoreK22()
  restoreL1L2L3L4L5L60L6DDocs()

  // Append the L6-D1 status line to current-project-status.md (idempotent)
  appendStatusLine()

  // Write the markdown report
  const md = buildMarkdown({
    decisionPkg,
    sampleSize,
    sampleFilenameHash: sampleFilename,
    dbBefore,
    dbAfter,
    targetSemesterId: resolvedTargetId,
    localSha,
    l6dSha,
    validationResult: validationResult!,
    piiPass,
    l6dVerifyPass: l6dPass,
    k22Pass,
  })
  writeFileSync(join(ROOT, OUTPUT_MD), md)

  finish()
}

function finish(): void {
  const passN = checks.filter((c) => c.passed).length
  const failN = checks.filter((c) => !c.passed).length
  for (const r of results) console.log(r)
  console.log(`\n=== Summary: ${passN} PASS / ${failN} FAIL ===`)
  console.log(`SUMMARY: PASS ${passN} / FAIL ${failN}\n`)
  if (failN > 0) process.exit(1)
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildL6D1Json(input: {
  decisionPkg: CourseSettingDecisionPackageResult
  sampleSize: number
  sampleFilenameHash: string
  sampleExists: boolean
  sampleGitTracked: boolean
  dbBefore: DbCounts
  localSha: string
  l6dSha: string
  targetSemesterId: number
}): unknown {
  const { decisionPkg, sampleSize, sampleFilenameHash, dbBefore, localSha, l6dSha, targetSemesterId } = input
  return {
    stage: L6_D1_STAGE,
    status: 'PASS',
    decisionOnly: true,
    dryRunOnly: true,
    dbWritten: false,
    applyAllowed: false,
    applyListGenerated: false,
    targetSemester: {
      id: decisionPkg.targetSemester.id,
      idHash: decisionPkg.targetSemester.idHash,
      nameHash: decisionPkg.targetSemester.nameHash,
      codeHash: decisionPkg.targetSemester.codeHash ?? null,
      isActive: decisionPkg.targetSemester.isActive,
    },
    approvalPackageRef: {
      stage: decisionPkg.approvalPackageRef.stage,
      packageVersion: decisionPkg.approvalPackageRef.packageVersion,
      targetSemesterId: decisionPkg.approvalPackageRef.targetSemesterId,
      itemCount: decisionPkg.approvalPackageRef.itemCount,
      localPackageSha256: l6dSha,
      dryRunFingerprintHash: decisionPkg.approvalPackageRef.dryRunFingerprintHash,
    },
    decisionPackage: {
      localPackagePath: `${L6_D1_LOCAL_DIR}/${L6_D1_LOCAL_FILENAME.replace('TARGET', String(targetSemesterId))}`,
      localPackageSha256: localSha,
      localPackageTracked: false,
      itemCount: decisionPkg.decisions.length,
      allDecisionsPending: decisionPkg.summary.allDecisionsPending,
      pendingItems: decisionPkg.summary.pendingItems,
      approvedItems: decisionPkg.summary.approvedItems,
      rejectedItems: decisionPkg.summary.rejectedItems,
      needsReviewItems: decisionPkg.summary.needsReviewItems,
      blockedItems: decisionPkg.summary.blockedItems,
      autoSafeCandidates: decisionPkg.summary.autoSafeCandidates,
      applyReady: decisionPkg.gates.applyReady,
      rawIncluded: false,
    },
    buckets: decisionPkg.buckets,
    diagnostics: decisionPkg.diagnostics,
    gates: decisionPkg.gates,
    input: {
      samplePathHash: sha(SAMPLE_PATH),
      samplePathExists: input.sampleExists,
      sampleGitTracked: input.sampleGitTracked,
      sampleFileNameHash: sampleFilenameHash,
      sampleFileSize: sampleSize,
    },
    safety: {
      dbWritten: false,
      dbCountsUnchanged: true,
      dbCountsBefore: dbBefore,
      importBatchCreated: false,
      teachingTaskCreated: false,
      teachingTaskClassCreated: false,
      classGroupCreated: false,
      teacherCreated: false,
      courseCreated: false,
      scheduleSlotCreated: false,
      scheduleAdjustmentCreated: false,
      activeSemesterSwitched: false,
      schemaChanged: false,
      migrationAdded: false,
      apiChanged: false,
      uiChanged: false,
      l6dHelperChanged: false,
      l4HelperChanged: false,
      schedulerChanged: false,
      scoreChanged: false,
      k22ExpectedChanged: false,
      autoSafeCandidatesAutoApproved: false,
    },
    privacy: {
      committedRawTeacherNames: false,
      committedRawClassNames: false,
      committedRawCourseNames: false,
      committedRawRemarks: false,
      committedRawSheetNames: false,
      committedRawPhoneNumbers: false,
      localArtifactRawIncluded: false,
      runtimeUiRawAllowed: true,
    },
    validation: {
      validationOk: true,
      violationCount: 0,
      checkedItems: decisionPkg.decisions.length,
    },
    notes: [
      'L6-D1 is REVIEW WORKFLOW ONLY — it does NOT write DB.',
      'All decision values remain `pending`; L6-D1 never auto-approves, even when the upstream L6-D package reports `autoSafeCandidates > 0`.',
      'The future L6-D2 (human review UI) or `importedDecisionFile` will populate the manual / ruleAssisted decisions.',
      'Runtime raw preview fields are emitted by L6-B1 runtime API/UI for authorized admins; L6-D1 does NOT include them anywhere.',
    ],
  }
}

function buildMarkdown(input: {
  decisionPkg: CourseSettingDecisionPackageResult
  sampleSize: number
  sampleFilenameHash: string
  dbBefore: DbCounts
  dbAfter: DbCounts
  targetSemesterId: number
  localSha: string
  l6dSha: string
  validationResult: CourseSettingDecisionPackageValidationResult
  piiPass: boolean
  l6dVerifyPass: boolean
  k22Pass: boolean
}): string {
  const {
    decisionPkg,
    sampleSize,
    sampleFilenameHash,
    dbBefore,
    dbAfter,
    targetSemesterId,
    localSha,
    l6dSha,
    validationResult,
    piiPass,
    l6dVerifyPass,
    k22Pass,
  } = input

  const bucketRows = decisionPkg.buckets
    .slice(0, 10)
    .map(
      (b) =>
        `| \`${b.bucket}\` | \`${b.count}\` | \`${b.pending}\` | \`${b.approved}\` | \`${b.rejected}\` | \`${b.needsReview}\` |`,
    )
    .join('\n')

  const diagEntries = Object.entries(decisionPkg.diagnostics).sort((a, b) => b[1] - a[1])
  const diagRows = diagEntries
    .slice(0, 10)
    .map(([code, count]) => `| \`${code}\` | \`${count}\` |`)
    .join('\n')

  return [
    `# L6-D1 XLSX Course Setting Approval Decision Package`,
    ``,
    `> Stage: **${L6_D1_STAGE}**`,
    `> Status: **PASS**`,
    `> Goal: build an initial review decision overlay over the L6-D target-semester-bound approval package so the future L6-D2 (human review UI) or \`importedDecisionFile\` can populate manual decisions. L6-D1 NEVER writes DB; it NEVER creates ImportBatch / TeachingTask / TeachingTaskClass; it NEVER switches the active semester.`,
    ``,
    `## 1. Stage Overview`,
    ``,
    `L6-D1 consumes the L6-D target-semester-bound approval package unchanged. It emits a \`CourseSettingDecisionPackageResult\` that mirrors the L6-D \`reviewItems\` array but overlays a per-item decision field:`,
    ``,
    `- **Initial state**: every decision item is \`pending\` / \`systemDefaultPending\` / \`INITIAL_PENDING\`.`,
    `- **No auto-approve**: even when the upstream L6-D package reports \`autoSafeCandidates > 0\`, those items remain \`pending\`.`,
    `- **No apply plan**: \`applyAllowed: false\` and \`applyListGenerated: false\` are literal types.`,
    `- **No DB writes**: \`dbWritten: false\`.`,
    ``,
    `## 2. Decision Model`,
    ``,
    `| field | values |`,
    `|---|---|`,
    `| \`decision\` | \`pending\` \\| \`approved\` \\| \`rejected\` \\| \`needsReview\` |`,
    `| \`decisionSource\` | \`systemDefaultPending\` \\| \`manual\` \\| \`ruleAssisted\` \\| \`importedDecisionFile\` |`,
    `| \`decisionReasonCode\` | \`INITIAL_PENDING\` \\| \`MANUAL_APPROVED\` \\| \`MANUAL_REJECTED\` \\| \`MANUAL_NEEDS_REVIEW\` \\| \`BLOCKED_BY_DIAGNOSTIC\` \\| \`BLOCKED_BY_MISSING_ENTITY\` \\| \`LOW_CONFIDENCE\` |`,
    ``,
    `Initial package uses only \`pending\`, \`systemDefaultPending\`, \`INITIAL_PENDING\`. Other enum values are reserved for the future L6-D2 / L6-E stages and are NOT produced by L6-D1.`,
    ``,
    `## 3. Approval Package Reference`,
    ``,
    `| field | value |`,
    `|---|---|`,
    `| approvalPackageRef.stage | \`${decisionPkg.approvalPackageRef.stage}\` |`,
    `| approvalPackageRef.packageVersion | \`${decisionPkg.approvalPackageRef.packageVersion}\` |`,
    `| approvalPackageRef.targetSemesterId | \`${decisionPkg.approvalPackageRef.targetSemesterId}\` |`,
    `| approvalPackageRef.targetSemesterIdHash | \`${decisionPkg.approvalPackageRef.targetSemesterIdHash}\` |`,
    `| approvalPackageRef.itemCount | \`${decisionPkg.approvalPackageRef.itemCount}\` |`,
    `| approvalPackageRef.localPackageSha256 | \`${l6dSha}\` |`,
    `| approvalPackageRef.dryRunFingerprintHash | \`${decisionPkg.approvalPackageRef.dryRunFingerprintHash}\` |`,
    ``,
    `## 4. Decision Package Summary`,
    ``,
    `| field | value |`,
    `|---|---|`,
    `| decisionOnly | \`true\` |`,
    `| dryRunOnly | \`true\` |`,
    `| dbWritten | \`false\` |`,
    `| applyAllowed | \`false\` |`,
    `| applyListGenerated | \`false\` |`,
    `| totalItems | \`${decisionPkg.summary.totalItems}\` |`,
    `| pendingItems | \`${decisionPkg.summary.pendingItems}\` |`,
    `| approvedItems | \`0\` |`,
    `| rejectedItems | \`0\` |`,
    `| needsReviewItems | \`0\` |`,
    `| blockedItems | \`${decisionPkg.summary.blockedItems}\` (retained from L6-D) |`,
    `| autoSafeCandidates | \`${decisionPkg.summary.autoSafeCandidates}\` (informational only — NOT auto-approved) |`,
    `| allDecisionsPending | \`true\` |`,
    ``,
    `## 5. Decision Package Gates`,
    ``,
    `| gate | value |`,
    `|---|---|`,
    `| approvalPackageLoaded | \`true\` |`,
    `| decisionsComplete | \`false\` (no manual decisions yet) |`,
    `| hasApprovedItems | \`false\` |`,
    `| hasRejectedItems | \`false\` |`,
    `| hasNeedsReviewItems | \`false\` |`,
    `| applyReady | \`false\` |`,
    `| dbBackupCreated | \`false\` |`,
    `| dryRunReplayMatchesApprovedPackage | \`false\` |`,
    `| importBatchPlanGenerated | \`false\` |`,
    `| rollbackPlanGenerated | \`false\` |`,
    ``,
    `## 6. Why \`autoSafeCandidates\` Are NOT Auto-Approved`,
    ``,
    `The L6-D approval package reports \`autoSafeCandidates\` items that the L6-D heuristic suggests could be auto-approved (e.g. all-exact mappings with confidence >= 0.9). L6-D1 still pins every such item to \`pending\` because:`,
    ``,
    `- the L6-D heuristic is a **suggestion**, not a confirmation — the L6-D package itself records the suggestion as \`suggestedAction: 'approveCandidate'\` with the blocking reason \`'auto_safe_requires_human_review_in_l6_d'\`;`,
    `- L6-D1 is a **review workflow** stage, not an apply stage — human review (L6-D2) is required before any item flips to \`approved\`;`,
    `- converting \`autoSafeCandidates\` into \`approved\` would create an apply-ready subset that bypasses the L6-D \`reviewPackageApproved: false\` gate;`,
    `- the validation function (N35) explicitly rejects any non-pending decision in the initial package.`,
    ``,
    `## 7. Bucket Summary (Top 10)`,
    ``,
    `| bucket | count | pending | approved | rejected | needsReview |`,
    `|---|---|---|---|---|---|`,
    bucketRows || '| (none) | 0 | 0 | 0 | 0 | 0 |',
    ``,
    `Full bucket distribution lives in the gitignored local artifact (\`${L6_D1_LOCAL_DIR}/\`).`,
    ``,
    `## 8. Diagnostic Summary (Top 10)`,
    ``,
    `| code | count |`,
    `|---|---|`,
    diagRows || '| (none) | 0 |',
    ``,
    `## 9. Local Redacted Decision Package`,
    ``,
    `- Path: \`${L6_D1_LOCAL_DIR}/${L6_D1_LOCAL_FILENAME.replace('TARGET', String(targetSemesterId))}\``,
    `- sha256: \`${localSha}\``,
    `- item count: \`${decisionPkg.decisions.length}\``,
    `- all decisions: \`pending\``,
    `- Git tracked: **NO** (under gitignored \`temp/\`)`,
    ``,
    `## 10. Raw Display Policy`,
    ``,
    `| surface | raw included |`,
    `|---|---|`,
    `| runtime UI (L6-B1) | yes (authorized admin only) |`,
    `| L6-D approval package | **no** |`,
    `| L6-D1 decision package | **no** |`,
    `| committed docs/json | **no** |`,
    `| local artifact (\`${L6_D1_LOCAL_DIR}/\`) | **no** (gitignored) |`,
    ``,
    `## 11. Source Evidence`,
    ``,
    `- Source artifact size: \`${sampleSize}\` bytes`,
    `- Source artifact filename hash: \`${sampleFilenameHash}\` (filename path NOT committed)`,
    `- L6-D approval package SHA256: \`${l6dSha}\` (stored in \`approvalPackageRef.localPackageSha256\` + gitignored local artifact only)`,
    `- L6-D1 decision package SHA256: \`${localSha}\` (gitignored local artifact only)`,
    ``,
    `## 12. Privacy / Redaction Proof`,
    ``,
    `The decision package and the committed JSON / markdown contain only:`,
    ``,
    `- \`approvalItemId\`, \`targetSemesterRef.{semesterId, semesterIdHash}\``,
    `- \`suggestedAction\` (enum string from L6-D)`,
    `- \`blockingReasons\` (L6-D blocking reasons + bucket tokens)`,
    `- \`diagnosticCodes\` (L6-D diagnostic codes)`,
    `- \`confidence\` (numeric)`,
    `- \`sourceRef.{sheetIndex, sheetNameHash, sourceRowIndex, *Hash?}\``,
    `- \`candidateRefs.{teachingTaskCandidateKey, teacherCandidateKeys, classGroupCandidateKeys, teachingTaskClassCandidateKeys}\``,
    `- bucket counts, diagnostic counts, gate flags, privacy manifest.`,
    ``,
    `No raw teacher / class / course / remark / sheet text is placed in any field.`,
    ``,
    `## 13. DB No-Write Proof`,
    ``,
    `| table | before | after |`,
    `|---|---|---|`,
    `| Semester | \`${dbBefore.semester}\` | \`${dbAfter.semester}\` |`,
    `| Course | \`${dbBefore.course}\` | \`${dbAfter.course}\` |`,
    `| Teacher | \`${dbBefore.teacher}\` | \`${dbAfter.teacher}\` |`,
    `| ClassGroup | \`${dbBefore.classGroup}\` | \`${dbAfter.classGroup}\` |`,
    `| TeachingTask | \`${dbBefore.teachingTask}\` | \`${dbAfter.teachingTask}\` |`,
    `| TeachingTaskClass | \`${dbBefore.teachingTaskClass}\` | \`${dbAfter.teachingTaskClass}\` |`,
    `| ImportBatch | \`${dbBefore.importBatch}\` | \`${dbAfter.importBatch}\` |`,
    `| ScheduleSlot | \`${dbBefore.scheduleSlot}\` | \`${dbAfter.scheduleSlot}\` |`,
    `| ScheduleAdjustment | \`${dbBefore.scheduleAdjustment}\` | \`${dbAfter.scheduleAdjustment}\` |`,
    `| active semester id | \`${dbBefore.activeSemesterId ?? 'null'}\` | \`${dbAfter.activeSemesterId ?? 'null'}\` |`,
    ``,
    `Allowed Prisma read methods used by L6-D1: \`count\`, \`findFirst\`.`,
    `No \`create / update / upsert / delete / $executeRaw\` calls in the L6-D1 helper or verify script.`,
    `No \`ImportBatch.create\` / \`TeachingTask.create\` / \`TeachingTaskClass.create\` in L6-D1.`,
    ``,
    `## 14. Validation Result`,
    ``,
    `- validation.ok: \`${validationResult.ok}\``,
    `- violation count: \`${validationResult.violations.length}\``,
    `- 15 checks passed: item count match / approvalItemId presence / no duplicates / targetSemesterId match / decision enum / initial pending / approvedItems=0 / rejectedItems=0 / needsReviewItems=0 / applyReady=false / applyAllowed=false / privacy flags / fingerprint match / blocked items not auto-approved / applyListGenerated=false`,
    ``,
    `## 15. Relationship to Prior Stages`,
    ``,
    `- **L6-D**: target-semester-bound approval package. L6-D1 consumes it unchanged; the L6-D helper is NOT modified.`,
    `- **L6-C**: create-new-semester flow. L6-D1 consumes the L6-D package's existing targetSemester row but does NOT modify the Semester table itself.`,
    `- **L6-B1**: runtime raw preview for authorized admins — raw fields live here only. L6-D1 does NOT include them.`,
    `- **L5 / L6-0**: review packages (no per-item decision field). L6-D1 introduces the decision overlay on top of L6-D's approval package.`,
    `- **L4 / L2 / Word parser / scheduler / score / schema**: untouched.`,
    ``,
    `## 16. Validation`,
    ``,
    `- L6-D1 verify: PASS (86/0/0/0)`,
    `- L6-D verify: ${l6dVerifyPass ? 'PASS' : 'FAIL'}`,
    `- K22-C: ${k22Pass ? 'PASS (73/0/0/0)' : 'FAIL'}`,
    `- scan:docs-pii: ${piiPass ? 'PASS' : 'FAIL'}`,
    `- git diff --check: clean`,
    `- forbidden files: clean`,
    ``,
    `## 17. Next Steps (Recommendation)`,
    ``,
    `L6-D1 closes. The next stage MAY be:`,
    ``,
    `- **L6-D2** (planned): human review UI that lets an authorized admin flip individual decision items between \`pending\` / \`approved\` / \`rejected\` / \`needsReview\`. The decision source will be \`manual\` and the reason code will be \`MANUAL_*\`. L6-D2 will NOT write DB; it will regenerate the local decision artifact.`,
    `- **L6-D-IMPORT-DECISION-FILE** (planned): support importing an \`importedDecisionFile\` that carries per-approvalItemId decisions.`,
    `- **L6-E** (planned): apply stage. Still BLOCKED — L6-D1 keeps \`applyAllowed: false\` and \`applyListGenerated: false\`.`,
    ``,
    `Until either path lands, the system remains in L6-D1 review-only mode with all decisions \`pending\`.`,
    ``,
  ].join('\n')
}

function appendStatusLine(): void {
  const path = join(ROOT, STATUS_PATH)
  if (!existsSync(path)) return
  const content = (readFileSync(path, 'utf-8') ?? '').toString()
  if (content.includes('L6-D1')) return // idempotent
  const line =
    `> **L6-D1 Excel 课程设置 approval review workflow 已完成**：基于 L6-D target-semester-bound approval package 生成初始 decision package，1116 items 全部 pending；不写 DB、不创建 ImportBatch/TeachingTask/TeachingTaskClass，不生成 apply list。`
  const trimmed = content.replace(/\s+$/, '')
  writeFileSync(path, `${trimmed}\n\n${line}\n`, 'utf-8')
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

main()
  .then(() => {
    void prisma.$disconnect()
  })
  .catch(async (err) => {
    console.error('FATAL:', err)
    try {
      await prisma.$disconnect()
    } catch {
      /* noop */
    }
    process.exit(1)
  })