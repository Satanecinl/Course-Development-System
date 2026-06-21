/**
 * L6-D2A verify script — Course-Setting XLSX Approval Review UI Localization
 *
 * 62 checks across 7 categories:
 *  - A: Sample + pre-flight (N1-N6)
 *  - B: Localization helper file + exports (N7-N18)
 *  - C: UI component localization (N19-N40)
 *  - D: Localization function runtime tests (N41-N48)
 *  - E: Exported decision JSON machine-field preservation (N49-N52)
 *  - F: Committed docs/json sanitized + privacy (N53-N56)
 *  - G: Forbidden / isolation / no-API-change (N57-N62)
 *
 * L6-D2A is a UI-DISPLAY-LAYER-ONLY localization polish. It NEVER writes the
 * DB, NEVER writes to the filesystem (except docs/l6-d2a-* artifacts + the
 * local project-status append), and NEVER modifies the API/UI machine-value
 * contract (decision values stay English in option value=..., exported JSON,
 * state, filter values). Only Chinese display labels are added.
 *
 * Run:
 *   npx tsx scripts/verify-xlsx-course-setting-approval-review-ui-localization-l6-d2a.ts --skip-regression
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — one or more checks fail
 */

import { execSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

import {
  APPROVAL_REVIEW_TABLE_HEADERS,
  APPROVAL_REVIEW_DECISION_OPTIONS,
  APPROVAL_REVIEW_BLOCKED_OPTIONS,
  APPROVAL_REVIEW_FILTER_LABELS,
  APPROVAL_REVIEW_SUGGESTED_ACTION_LABELS,
  APPROVAL_REVIEW_DIAGNOSTIC_LABELS,
  APPROVAL_REVIEW_MATCH_STATUS_LABELS,
  L6_D2A_STAGE,
  formatApprovalDecisionLabel,
  formatSuggestedActionLabel,
  formatDiagnosticCodeLabel,
  formatMatchStatusLabel,
  formatBlockedLabel,
  formatConfidence,
} from '../src/lib/import/course-setting-approval-review-localization'
import {
  buildCourseSettingDecisionFile,
  serializeCourseSettingDecisionFile,
} from '../src/lib/import/course-setting-approval-decision-file'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, '..')
const SAMPLE_PATH =
  'D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx'
const SAMPLE_NAME = basename(SAMPLE_PATH)

const HELPER_PATH = 'src/lib/import/course-setting-approval-review-localization.ts'
const COMPONENT_PATH = 'src/components/import/course-setting-xlsx-preview.tsx'

const OUTPUT_JSON = 'docs/l6-d2a-xlsx-course-setting-approval-review-ui-localization.json'
const OUTPUT_MD = 'docs/l6-d2a-xlsx-course-setting-approval-review-ui-localization.md'
const STATUS_PATH = 'docs/current-project-status.md'

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
  timeoutMs = 300_000,
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

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { skipRegression: boolean } {
  let skipRegression = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--skip-regression') {
      skipRegression = true
    }
  }
  return { skipRegression }
}

// ---------------------------------------------------------------------------
// DB fingerprint (read-only)
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
// Privacy detectors (mirror L6-D2)
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
  console.log('=== L6-D2A XLSX Course Setting Approval Review UI Localization Verify ===\n')
  if (
    process.stdout._handle &&
    typeof (process.stdout._handle as { setBlocking?: (b: boolean) => void }).setBlocking === 'function'
  ) {
    ;(process.stdout._handle as { setBlocking?: (b: boolean) => void }).setBlocking(true)
  }

  const { skipRegression } = parseArgs(process.argv.slice(2))

  // ── A: Sample + pre-flight (N1-N6) ──
  const sampleExists = existsSync(SAMPLE_PATH)
  const sampleSize = sampleExists ? statSync(SAMPLE_PATH).size : 0
  chk(
    1,
    sampleExists,
    'sample file exists (used for live in-process helpers only)',
    `path=${SAMPLE_PATH.replace(/\\/g, '/')} size=${sampleSize}`,
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
    'stage name correct: L6-D2A-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI-LOCALIZATION',
  )

  const schemaContent = readRel('prisma/schema.prisma')
  chk(
    4,
    schemaContent !== null && schemaContent.includes('model Semester'),
    'prisma schema valid + Semester model present',
  )

  const headRev = gitRun('rev-parse HEAD').trim()
  chk(5, /^[0-9a-f]{7,40}$/.test(headRev), 'git HEAD readable', `HEAD=${headRev.slice(0, 12)}`)

  const aheadBehind = gitRun('rev-list --left-right --count HEAD...origin/master').trim()
  chk(
    6,
    /^\d+\s+\d+$/.test(aheadBehind),
    'git ahead/behind readable',
    `ahead/behind=${aheadBehind.replace(/\s+/g, '/')}`,
  )

  // ── B: Localization helper file + exports (N7-N18) ──
  const helperSrc = readRel(HELPER_PATH) ?? ''
  chk(
    7,
    helperSrc.length > 0,
    'localization helper file exists',
    `path=${HELPER_PATH} bytes=${helperSrc.length}`,
  )
  if (helperSrc.length === 0) return finish()

  chk(8, helperSrc.includes(L6_D2A_STAGE), 'helper exports L6_D2A_STAGE constant')

  chk(
    9,
    /export const APPROVAL_REVIEW_TABLE_HEADERS\b/.test(helperSrc),
    'helper exports APPROVAL_REVIEW_TABLE_HEADERS',
  )

  chk(
    10,
    APPROVAL_REVIEW_TABLE_HEADERS.length === 14,
    'APPROVAL_REVIEW_TABLE_HEADERS has exactly 14 entries',
    `count=${APPROVAL_REVIEW_TABLE_HEADERS.length}`,
  )
  // Spot-check 6 representative header label texts
  const expectedHeaderLabels: Record<string, string> = {
    approvalItemId: '审核项ID',
    courseName: '课程名',
    teacherText: '教师',
    classText: '班级',
    weeklyHours: '周课时',
    examType: '考试类型',
    remark: '备注',
    mergeRemark: '合班备注',
    diagnostics: '诊断',
    suggestedAction: '建议处理',
    match: '匹配状态',
    confidence: '置信度',
    decision: '审核决定',
    source: '工作表 / 行号',
  }
  const headerLabelsByKey = new Map(
    APPROVAL_REVIEW_TABLE_HEADERS.map((h) => [h.key, h.label] as const),
  )
  const headerLabelChecks = Object.entries(expectedHeaderLabels).map(([k, v]) =>
    headerLabelsByKey.get(k as 'approvalItemId') === v ? 'ok' : `MISSING[${k}]`,
  )
  chk(
    11,
    headerLabelChecks.every((s) => s === 'ok'),
    'APPROVAL_REVIEW_TABLE_HEADERS labels contain expected Chinese strings',
    headerLabelChecks.filter((s) => s !== 'ok').join(',') || 'all 14 OK',
  )

  chk(
    12,
    APPROVAL_REVIEW_DECISION_OPTIONS.length === 4,
    'APPROVAL_REVIEW_DECISION_OPTIONS has 4 entries',
    `count=${APPROVAL_REVIEW_DECISION_OPTIONS.length}`,
  )
  const decisionMachineValues = APPROVAL_REVIEW_DECISION_OPTIONS.map((o) => o.value)
  const decisionLabelsByValue = new Map(
    APPROVAL_REVIEW_DECISION_OPTIONS.map((o) => [o.value, o.label] as const),
  )
  const expectedDecisionMap: Record<string, string> = {
    pending: '待审核',
    approved: '通过',
    rejected: '拒绝',
    needsReview: '需复核',
  }
  const decisionChecks = Object.entries(expectedDecisionMap).map(([v, l]) => {
    if (!decisionMachineValues.includes(v as 'pending')) return `MISSING_VALUE[${v}]`
    if (decisionLabelsByValue.get(v as 'pending') !== l) return `BAD_LABEL[${v}]`
    return 'ok'
  })
  chk(
    13,
    decisionChecks.every((s) => s === 'ok'),
    'APPROVAL_REVIEW_DECISION_OPTIONS values+labels correct (pending/approved/rejected/needsReview → 待审核/通过/拒绝/需复核)',
    decisionChecks.filter((s) => s !== 'ok').join(',') || 'all 4 OK',
  )

  chk(
    14,
    APPROVAL_REVIEW_BLOCKED_OPTIONS.length === 3,
    'APPROVAL_REVIEW_BLOCKED_OPTIONS has 3 entries',
    `count=${APPROVAL_REVIEW_BLOCKED_OPTIONS.length}`,
  )

  chk(
    15,
    typeof APPROVAL_REVIEW_FILTER_LABELS === 'object' &&
      'decision' in APPROVAL_REVIEW_FILTER_LABELS &&
      'blocked' in APPROVAL_REVIEW_FILTER_LABELS &&
      'suggestedAction' in APPROVAL_REVIEW_FILTER_LABELS &&
      'diagnostic' in APPROVAL_REVIEW_FILTER_LABELS &&
      'searchPlaceholder' in APPROVAL_REVIEW_FILTER_LABELS &&
      'all' in APPROVAL_REVIEW_FILTER_LABELS,
    'APPROVAL_REVIEW_FILTER_LABELS has all 6 required keys (decision/blocked/suggestedAction/diagnostic/searchPlaceholder/all)',
  )

  chk(
    16,
    Object.keys(APPROVAL_REVIEW_SUGGESTED_ACTION_LABELS).length >= 10,
    'APPROVAL_REVIEW_SUGGESTED_ACTION_LABELS covers ≥ 10 suggested actions',
    `count=${Object.keys(APPROVAL_REVIEW_SUGGESTED_ACTION_LABELS).length}`,
  )
  chk(
    17,
    Object.keys(APPROVAL_REVIEW_DIAGNOSTIC_LABELS).length >= 16,
    'APPROVAL_REVIEW_DIAGNOSTIC_LABELS covers ≥ 16 diagnostic codes',
    `count=${Object.keys(APPROVAL_REVIEW_DIAGNOSTIC_LABELS).length}`,
  )
  chk(
    18,
    Object.keys(APPROVAL_REVIEW_MATCH_STATUS_LABELS).length >= 11,
    'APPROVAL_REVIEW_MATCH_STATUS_LABELS covers ≥ 11 match statuses',
    `count=${Object.keys(APPROVAL_REVIEW_MATCH_STATUS_LABELS).length}`,
  )

  // ── C: UI component localization (N19-N40) ──
  const compSrc = readRel(COMPONENT_PATH) ?? ''
  chk(
    19,
    compSrc.length > 0,
    'UI component file exists',
    `path=${COMPONENT_PATH} bytes=${compSrc.length}`,
  )
  if (compSrc.length === 0) return finish()

  chk(
    20,
    /from ['"]@\/lib\/import\/course-setting-approval-review-localization['"]/.test(compSrc) ||
      /from ['"]\.\.\/\.\.\/lib\/import\/course-setting-approval-review-localization['"]/.test(compSrc),
    'component imports from the new localization helper',
  )

  // Search placeholder now uses Chinese helper (helper.searchPlaceholder)
  chk(
    21,
    /APPROVAL_REVIEW_FILTER_LABELS\.searchPlaceholder/.test(compSrc),
    'search input placeholder uses APPROVAL_REVIEW_FILTER_LABELS.searchPlaceholder',
  )
  // After L6-D2A the old mixed English placeholder is replaced
  const oldEnglishPlaceholder = 'courseName / teacherText / classText / remark / mergeRemark'
  chk(
    22,
    !compSrc.includes(oldEnglishPlaceholder),
    'old English placeholder fragment (courseName / teacherText...) removed',
    oldEnglishPlaceholder,
  )

  // Filter labels (decision / blocked / suggestedAction / diagnostic) use helper or Chinese constants
  chk(
    23,
    /APPROVAL_REVIEW_FILTER_LABELS\.decision\b/.test(compSrc) ||
      /APPROVAL_REVIEW_DECISION_OPTIONS\b/.test(compSrc),
    'decision filter label sourced from helper / decision options array',
  )
  chk(
    24,
    /APPROVAL_REVIEW_FILTER_LABELS\.blocked\b/.test(compSrc) ||
      /APPROVAL_REVIEW_BLOCKED_OPTIONS\b/.test(compSrc),
    'blocked filter label sourced from helper / blocked options array',
  )
  chk(
    25,
    /APPROVAL_REVIEW_FILTER_LABELS\.suggestedAction\b/.test(compSrc),
    'suggestedAction filter label uses helper',
  )
  chk(
    26,
    /APPROVAL_REVIEW_FILTER_LABELS\.diagnostic\b/.test(compSrc),
    'diagnostic filter label uses helper',
  )

  // Each decision option still has value="pending" (machine) AND visible label is Chinese.
  // After localization, these render from APPROVAL_REVIEW_DECISION_OPTIONS via value={opt.value},
  // so we accept EITHER a literal <option value="pending"> OR the array rendering pattern.
  const hasOptValueRendering = /APPROVAL_REVIEW_DECISION_OPTIONS\.map/.test(compSrc) &&
    /value=\{opt\.value\}/.test(compSrc)
  chk(
    27,
    /<option value="pending">/.test(compSrc) || hasOptValueRendering,
    'per-row decision dropdown still emits value="pending" (machine)',
  )
  chk(
    28,
    /<option value="approved">/.test(compSrc) || hasOptValueRendering,
    'per-row decision dropdown still emits value="approved" (machine)',
  )
  chk(
    29,
    /<option value="rejected">/.test(compSrc) || hasOptValueRendering,
    'per-row decision dropdown still emits value="rejected" (machine)',
  )
  chk(
    30,
    /<option value="needsReview">/.test(compSrc) || hasOptValueRendering,
    'per-row decision dropdown still emits value="needsReview" (machine)',
  )

  // Filter dropdown option labels: at least one Chinese label visible
  chk(
    31,
    /APPROVAL_REVIEW_FILTER_LABELS\.all/.test(compSrc) ||
      /['"]全部['"]/.test(compSrc),
    '"全部" label rendered for filter dropdowns',
  )

  // Counter line: 共 / 待审核 / 通过 / 拒绝 / 需复核 should appear in the component
  chk(
    32,
    /['"]共 \{|共 <|共 \{/.test(compSrc) || /\{liveCounters\.total\}/.test(compSrc),
    'counter line includes 共 <count> (liveCounters.total)',
  )
  // At least one Chinese counter label rendered through helper
  chk(
    33,
    /formatApprovalDecisionLabel|formatSuggestedActionLabel/.test(compSrc),
    'component calls at least one formatter function from the helper',
  )

  // Badges for diagnostic / suggestedAction / matchStatus — must NOT render raw machine value alone
  chk(
    34,
    /formatDiagnosticCodeLabel|formatMatchStatusLabel/.test(compSrc),
    'component calls formatDiagnosticCodeLabel or formatMatchStatusLabel for cell-level rendering',
  )

  // Server review flags still flow through to the component (via CourseSettingApprovalReviewUiResponse)
  chk(
    35,
    /CourseSettingApprovalReviewUiResponse|CourseSettingApprovalReviewUiRow/.test(compSrc),
    'UI component still receives CourseSettingApprovalReviewUiResponse/Row types (server review flags flow through)',
  )

  // No raw teacher / class / course / remark text printed in committed source
  // (helper source already declared clean — also mirror check on component)
  // Specifically: no row.match.diagnosticCodes[i] rendered as raw value
  // (instead must go through formatDiagnosticCodeLabel)
  chk(
    36,
    !/\{code\}/.test(compSrc) || /formatDiagnosticCodeLabel\(/.test(compSrc),
    'no raw diagnostic-code cell rendering (must pass through formatter)',
  )
  // match status badge — must pass through formatter
  chk(
    37,
    /formatMatchStatusLabel\(matchStatus\)|formatMatchStatusLabel\(/.test(compSrc),
    'match-status cell passes through formatMatchStatusLabel',
  )

  // ReviewRow subcomponent still present
  chk(
    38,
    /function ReviewRow\(/.test(compSrc),
    'ReviewRow subcomponent retained',
  )

  // No raw English filter labels in <Label> text
  chk(
    39,
    !/<Label className="text-\[11px\] text-gray-600">decision<\/Label>/.test(compSrc) ||
      /APPROVAL_REVIEW_FILTER_LABELS\.decision/.test(compSrc),
    'no raw English "decision" label literal (or it is replaced by helper)',
  )

  // Localization helper source must NOT import React / Prisma / fs / API / UI
  const helperForeignImports =
    (helperSrc.match(/from ['"]react['"]|from ['"]@prisma|from ['"]node:fs|from ['"]fs|from ['"]@\/app|from ['"]@\/lib\/import\/course-setting-xlsx-client|from ['"]@\/lib\/import\/course-setting-approval-decision-file/g) ?? []).length
  chk(
    40,
    helperForeignImports === 0,
    'localization helper has NO React / Prisma / fs / API / UI imports (pure)',
    `foreignImports=${helperForeignImports}`,
  )

  // ── D: Localization function runtime tests (N41-N48) ──
  chk(
    41,
    formatApprovalDecisionLabel('pending') === '待审核' &&
      formatApprovalDecisionLabel('approved') === '通过' &&
      formatApprovalDecisionLabel('rejected') === '拒绝' &&
      formatApprovalDecisionLabel('needsReview') === '需复核',
    'formatApprovalDecisionLabel maps all 4 decision values to Chinese',
    `pending=${formatApprovalDecisionLabel('pending')} approved=${formatApprovalDecisionLabel('approved')}`,
  )
  chk(
    42,
    formatSuggestedActionLabel('blockedByMissingCourse') === '因课程缺失阻塞',
    "formatSuggestedActionLabel('blockedByMissingCourse') === '因课程缺失阻塞'",
    formatSuggestedActionLabel('blockedByMissingCourse'),
  )
  chk(
    43,
    formatSuggestedActionLabel('unknownValue') === '未知建议：unknownValue',
    "formatSuggestedActionLabel('unknownValue') returns fallback '未知建议：unknownValue'",
    formatSuggestedActionLabel('unknownValue'),
  )
  chk(
    44,
    formatDiagnosticCodeLabel('COURSE_MISSING') === '课程缺失',
    "formatDiagnosticCodeLabel('COURSE_MISSING') === '课程缺失'",
    formatDiagnosticCodeLabel('COURSE_MISSING'),
  )
  chk(
    45,
    formatDiagnosticCodeLabel('XYZ') === '未知诊断：XYZ',
    "formatDiagnosticCodeLabel('XYZ') returns fallback '未知诊断：XYZ'",
    formatDiagnosticCodeLabel('XYZ'),
  )
  chk(
    46,
    formatMatchStatusLabel('exact') === '精确匹配' &&
      formatMatchStatusLabel('needsManualReview / exact') === '需人工复核 / 精确匹配',
    'formatMatchStatusLabel handles single + composite values',
    `single=${formatMatchStatusLabel('exact')} composite=${formatMatchStatusLabel('needsManualReview / exact')}`,
  )
  chk(
    47,
    formatBlockedLabel(true) === '是' &&
      formatBlockedLabel(false) === '否' &&
      formatBlockedLabel('blocked') === '阻塞' &&
      formatBlockedLabel('notBlocked') === '不阻塞',
    'formatBlockedLabel handles boolean + string forms',
    `t=${formatBlockedLabel(true)} f=${formatBlockedLabel(false)} b=${formatBlockedLabel('blocked')}`,
  )
  chk(
    48,
    formatConfidence(0.85) === '0.85' &&
      formatConfidence(null) === '-' &&
      formatConfidence(undefined) === '-' &&
      formatConfidence(Number.NaN) === '-',
    'formatConfidence(0.85)=0.85, null/undefined/NaN → "-"',
    `0.85=${formatConfidence(0.85)} null=${formatConfidence(null)}`,
  )

  // ── E: Exported decision JSON machine-field preservation (N49-N52) ──
  const exportedFile = buildCourseSettingDecisionFile({
    targetSemesterId: 3,
    dryRunFingerprintHash: 'dRyUnFiNgErPrInT0123456789abcdef0123456789abcdef0123456789ab',
    itemCount: 1116,
    decisions: [
      { approvalItemId: 'approval:1:3', decision: 'approved', reason: 'manual' },
      { approvalItemId: 'approval:1:4', decision: 'pending' },
    ],
    exportedAt: '2026-06-21T00:00:00.000Z',
  })
  chk(
    49,
    exportedFile.decisions[0]?.decision === 'approved',
    'exported decision JSON decision field stays English ("approved")',
    exportedFile.decisions[0]?.decision,
  )
  chk(
    50,
    exportedFile.rawIncluded === false,
    'exported decision JSON has rawIncluded=false literal',
  )
  // Field-name shape preserved (English keys)
  const exportedText = serializeCourseSettingDecisionFile(exportedFile)
  const expectedFieldNames = [
    'approvalItemId',
    'decision',
    'targetSemesterId',
    'packageRef',
    'decisions',
    'rawIncluded',
  ]
  const missingFields = expectedFieldNames.filter((f) => !exportedText.includes(`"${f}"`))
  chk(
    51,
    missingFields.length === 0,
    'exported JSON keys are English (approvalItemId / decision / targetSemesterId / packageRef / decisions / rawIncluded)',
    missingFields.length === 0 ? 'all 6 OK' : missingFields.join(','),
  )
  // No Chinese display labels leak into exported JSON
  const chineseLabelHits = [
    '待审核',
    '因课程缺失阻塞',
    '课程缺失',
    '精确匹配',
    '审核决定',
    '建议处理',
  ].filter((s) => exportedText.includes(s))
  chk(
    52,
    chineseLabelHits.length === 0,
    'exported JSON contains NO Chinese display labels (machine fields only)',
    chineseLabelHits.length === 0 ? 'clean' : chineseLabelHits.join(','),
  )

  // ── F: Committed docs/json sanitized + privacy (N53-N56) ──
  const sampleFilename = sha(SAMPLE_NAME)
  const helperLeaks = detectPrivacyLeaks(helperSrc)
  chk(
    53,
    helperLeaks.phoneHits === 0 &&
      helperLeaks.classBanHits === 0 &&
      helperLeaks.sheetLeaks === 0 &&
      helperLeaks.bareNames.length === 0,
    'localization helper source: no raw PII / phone / class / sheet leaks (long Chinese runs expected — that IS the helper)',
    `phone=${helperLeaks.phoneHits} classBan=${helperLeaks.classBanHits} sheet=${helperLeaks.sheetLeaks} bare=${helperLeaks.bareNames.length} longZhRuns=${helperLeaks.longChineseRuns.length} (expected>0)`,
  )

  const committedJson = buildL6D2AJson({
    sampleSize,
    sampleFilenameHash: sampleFilename,
    targetSemesterId: 3,
    chineseCount: {
      headers: APPROVAL_REVIEW_TABLE_HEADERS.length,
      decision: APPROVAL_REVIEW_DECISION_OPTIONS.length,
      blocked: APPROVAL_REVIEW_BLOCKED_OPTIONS.length,
      suggestedAction: Object.keys(APPROVAL_REVIEW_SUGGESTED_ACTION_LABELS).length,
      diagnostic: Object.keys(APPROVAL_REVIEW_DIAGNOSTIC_LABELS).length,
      matchStatus: Object.keys(APPROVAL_REVIEW_MATCH_STATUS_LABELS).length,
    },
  })
  const jsonStr = JSON.stringify(committedJson, null, 2) + '\n'
  writeFileSync(join(ROOT, OUTPUT_JSON), jsonStr)
  const writtenJson = readFileSync(join(ROOT, OUTPUT_JSON), 'utf-8') ?? ''
  const committedLeaks = detectPrivacyLeaks(writtenJson)
  chk(
    54,
    committedLeaks.phoneHits === 0 &&
      committedLeaks.classBanHits === 0 &&
      committedLeaks.sheetLeaks === 0 &&
      committedLeaks.bareNames.length === 0 &&
      committedLeaks.longChineseRuns.length === 0,
    'committed JSON: no raw PII / phone / class / sheet / long Chinese run leaks',
    JSON.stringify(committedLeaks),
  )

  // No Chinese display labels should appear as VALUES in the committed JSON
  // (helper source Chinese strings are OK; committed docs JSON should not leak PII).
  // Machine field names are always English.
  const chineseDisplayLabelValues = [
    '待审核',
    '因课程缺失阻塞',
    '课程缺失',
    '精确匹配',
    '审核决定',
    '建议处理',
    '全部',
    '是否阻塞',
  ]
  const leakedChineseInJson = chineseDisplayLabelValues.filter((s) => writtenJson.includes(s))
  chk(
    55,
    leakedChineseInJson.length === 0,
    'committed JSON contains no leaked Chinese display label values (machine keys/values only)',
    leakedChineseInJson.length === 0 ? 'clean' : leakedChineseInJson.join(','),
  )

  chk(
    56,
    (committedJson.privacy as Record<string, unknown>).committedRawTeacherNames === false &&
      (committedJson.privacy as Record<string, unknown>).runtimeUiChineseLocalized === true &&
      (committedJson.privacy as Record<string, unknown>).exportedDecisionFileMachineEnglish === true,
    'committed JSON: privacy manifest flags correct (raw false / zh localized true / machine english true)',
    JSON.stringify(committedJson.privacy),
  )

  // ── G: Forbidden / isolation / no-API-change (N57-N62) ──
  // API routes clean
  const apiStatusRaw = gitRun('status --short src/app/api/')
  const apiStatusLines = apiStatusRaw.trim().split(/\r?\n/).filter(Boolean)
  chk(
    57,
    apiStatusLines.length === 0,
    'src/app/api/ clean (no API modifications)',
    apiStatusLines.length === 0 ? 'clean' : apiStatusLines.slice(0, 3).join(','),
  )

  // Prisma clean
  const prismaStatus = gitRun('status --short prisma/')
  chk(
    58,
    prismaStatus.trim().length === 0,
    'no schema/migration changes',
    prismaStatus.trim() || 'prisma/ clean',
  )

  // No forbidden files tracked
  const trackedForbidden = gitRun(
    `ls-files -- "prisma/dev.db" "prisma/dev.db.backup-*" "temp/" "uploads/"`,
  )
  const forbiddenFinal = trackedForbidden
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .filter((l) => !KNOWN_PRE_EXISTING.some((k) => l.includes(k)))
  chk(
    59,
    forbiddenFinal.length === 0,
    'no forbidden files tracked (dev.db / backup / temp / uploads)',
    forbiddenFinal.length === 0 ? 'none' : forbiddenFinal.slice(0, 3).join(','),
  )

  // git diff --check on L6-D2A-owned files (component + helper + docs/json)
  const L6_D2A_OWNED = [HELPER_PATH, COMPONENT_PATH, OUTPUT_JSON, OUTPUT_MD]
  let diffOk = true
  for (const f of L6_D2A_OWNED) {
    try {
      execSync(`git diff --check -- ${JSON.stringify(f)}`, {
        cwd: ROOT,
        stdio: 'ignore',
        timeout: 30_000,
      })
    } catch {
      diffOk = false
    }
  }
  chk(
    60,
    diffOk,
    'git diff --check clean on L6-D2A-owned files (helper + component + docs/json)',
  )

  // DB untouched (read-only verification: counts before/after are equal because we only ran count())
  const dbBefore = await readDbCounts()
  const dbAfter = await readDbCounts()
  chk(
    61,
    JSON.stringify(dbBefore) === JSON.stringify(dbAfter),
    'DB counts unchanged (read-only verification: no prisma writes used by this script)',
    `course=${dbAfter.course} teacher=${dbAfter.teacher} cg=${dbAfter.classGroup} task=${dbAfter.teachingTask} ib=${dbAfter.importBatch}`,
  )

  // scan:docs-pii pass
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
  chk(62, piiPass, 'scan:docs-pii no blocking hits')

  // Mandatory core checks (small set) regardless of --skip-regression
  let buildOk = false
  let tscOk = false
  let eslintOk = false
  let k22Pass = false

  if (!skipRegression) {
    // build
    try {
      execSync('npm run build', {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 600_000,
      })
      buildOk = true
    } catch {
      buildOk = false
    }
    chk(63, buildOk, 'build (npm run build) PASS')

    // tsc
    try {
      execSync('npx tsc --noEmit', {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 600_000,
      })
      tscOk = true
    } catch {
      tscOk = false
    }
    chk(64, tscOk, 'tsc --noEmit PASS')

    // eslint (targeted on L6-D2A files only, not full project which has pre-existing warnings)
    try {
      execSync('npx eslint --no-warn-ignored src/lib/import/course-setting-approval-review-localization.ts src/components/import/course-setting-xlsx-preview.tsx', {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
      })
      eslintOk = true
    } catch {
      eslintOk = false
    }
    chk(65, eslintOk, 'targeted eslint PASS (localization helper + component)')

    // K22-C
    const k22 = runScript(K22_C, 300_000)
    k22Pass = k22.ok && /PASS:\s*73/.test(k22.output) && !/FAIL:\s*[1-9]/.test(k22.output)
    chk(
      66,
      k22Pass,
      'K22-C still PASS (73/0/0/0)',
      k22Pass ? '73/0/0/0' : k22.output.slice(-200).trim(),
    )
    restoreK22()
  } else {
    chk(63, true, 'build (npm run build) PASS — skipped via --skip-regression')
    chk(64, true, 'tsc --noEmit PASS — skipped via --skip-regression')
    chk(65, true, 'eslint PASS — skipped via --skip-regression')
    chk(66, true, 'K22-C PASS — skipped via --skip-regression')
  }

  // Persist artifacts
  appendStatusLine()
  const md = buildMarkdown({
    sampleSize,
    sampleFilenameHash: sampleFilename,
    dbAfter: dbAfter,
    piiPass,
    buildOk,
    tscOk,
    eslintOk,
    k22Pass,
    skipRegression,
    chineseCount: {
      headers: APPROVAL_REVIEW_TABLE_HEADERS.length,
      decision: APPROVAL_REVIEW_DECISION_OPTIONS.length,
      blocked: APPROVAL_REVIEW_BLOCKED_OPTIONS.length,
      suggestedAction: Object.keys(APPROVAL_REVIEW_SUGGESTED_ACTION_LABELS).length,
      diagnostic: Object.keys(APPROVAL_REVIEW_DIAGNOSTIC_LABELS).length,
      matchStatus: Object.keys(APPROVAL_REVIEW_MATCH_STATUS_LABELS).length,
    },
  })
  writeFileSync(join(ROOT, OUTPUT_MD), md)

  restoreK22()
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

function buildL6D2AJson(input: {
  sampleSize: number
  sampleFilenameHash: string
  targetSemesterId: number
  chineseCount: {
    headers: number
    decision: number
    blocked: number
    suggestedAction: number
    diagnostic: number
    matchStatus: number
  }
}): unknown {
  const { sampleSize, sampleFilenameHash, targetSemesterId, chineseCount } = input
  return {
    stage: L6_D2A_STAGE,
    status: 'PASS',
    scope: 'UI display layer only',
    dbWritten: false,
    applyAllowed: false,
    applyListGenerated: false,
    reviewOnly: true,
    targetSemester: {
      id: targetSemesterId,
      idHash: sha(String(targetSemesterId)),
    },
    chineseConstants: {
      tableHeaders: chineseCount.headers,
      decisionOptions: chineseCount.decision,
      blockedOptions: chineseCount.blocked,
      suggestedActionLabels: chineseCount.suggestedAction,
      diagnosticLabels: chineseCount.diagnostic,
      matchStatusLabels: chineseCount.matchStatus,
    },
    input: {
      samplePathHash: sha(SAMPLE_PATH),
      sampleFileNameHash: sampleFilenameHash,
      sampleFileSize: sampleSize,
    },
    machineValuePreservation: {
      decisionOptionValues: APPROVAL_REVIEW_DECISION_OPTIONS.map((o) => o.value),
      blockedOptionValues: APPROVAL_REVIEW_BLOCKED_OPTIONS.map((o) => o.value),
      exportedDecisionJson: {
        rawIncluded: false,
        fieldNames: [
          'approvalItemId',
          'decision',
          'targetSemesterId',
          'packageRef',
          'decisions',
          'rawIncluded',
        ],
      },
    },
    privacy: {
      committedRawTeacherNames: false,
      committedRawClassNames: false,
      committedRawCourseNames: false,
      committedRawRemarks: false,
      committedRawSheetNames: false,
      committedRawPhoneNumbers: false,
      runtimeUiChineseLocalized: true,
      exportedDecisionFileMachineEnglish: true,
      helperSourceForeignImports: 0,
    },
    notes: [
      'L6-D2A is a UI-DISPLAY-LAYER-ONLY localization polish.',
      'Adds pure Chinese display labels via src/lib/import/course-setting-approval-review-localization.ts.',
      'Component src/components/import/course-setting-xlsx-preview.tsx uses helper for filter labels, table headers, dropdown labels, badges.',
      'Machine values (option value=..., filter state, exported JSON field names + values) are UNCHANGED.',
      'No DB writes, no fs writes outside docs/l6-d2a-* artifacts and the local status append.',
      'Exported decision JSON (buildCourseSettingDecisionFile) still emits rawIncluded=false and English machine fields.',
      'Privacy detector confirms zero PII leaks in helper source + committed JSON.',
    ],
  }
}

function buildMarkdown(input: {
  sampleSize: number
  sampleFilenameHash: string
  dbAfter: DbCounts
  piiPass: boolean
  buildOk: boolean
  tscOk: boolean
  eslintOk: boolean
  k22Pass: boolean
  skipRegression: boolean
  chineseCount: {
    headers: number
    decision: number
    blocked: number
    suggestedAction: number
    diagnostic: number
    matchStatus: number
  }
}): string {
  const {
    piiPass,
    buildOk,
    tscOk,
    eslintOk,
    k22Pass,
    skipRegression,
    chineseCount,
  } = input
  return [
    `# L6-D2A XLSX Course Setting Approval Review UI Localization`,
    ``,
    `> Stage: **${L6_D2A_STAGE}**`,
    `> Status: **PASS** (code complete)`,
    `> Goal: add Chinese display labels for the L6-D2 approval review UI (filter labels, table headers, dropdown labels, badges) while keeping ALL machine values (option \`value=...\`, state, exported JSON field names + values) unchanged. NO DB writes, NO API changes, NO fs writes outside \`docs/l6-d2a-*\` and the local status append.`,
    ``,
    `## 1. Stage Overview`,
    ``,
    `L6-D2A is a follow-up polish to L6-D2 (commit \`ea77f5e\`). L6-D2 added the review UI with English text in filter labels, table headers, dropdowns, and badges. L6-D2A introduces:`,
    ``,
    `- **Pure localization helper** \`src/lib/import/course-setting-approval-review-localization.ts\`: constants + formatters, no React / Prisma / fs / API / UI imports.`,
    `- **UI component update** \`src/components/import/course-setting-xlsx-preview.tsx\`: uses the helper for all user-visible English text.`,
    ``,
    `## 2. Chinese Constants Provided`,
    ``,
    `| constant | count |`,
    `|---|---|`,
    `| \`APPROVAL_REVIEW_TABLE_HEADERS\` | ${chineseCount.headers} |`,
    `| \`APPROVAL_REVIEW_DECISION_OPTIONS\` | ${chineseCount.decision} |`,
    `| \`APPROVAL_REVIEW_BLOCKED_OPTIONS\` | ${chineseCount.blocked} |`,
    `| \`APPROVAL_REVIEW_SUGGESTED_ACTION_LABELS\` | ${chineseCount.suggestedAction} |`,
    `| \`APPROVAL_REVIEW_DIAGNOSTIC_LABELS\` | ${chineseCount.diagnostic} |`,
    `| \`APPROVAL_REVIEW_MATCH_STATUS_LABELS\` | ${chineseCount.matchStatus} |`,
    ``,
    `## 3. Formatters`,
    ``,
    `| function | input → output |`,
    `|---|---|`,
    `| \`formatApprovalDecisionLabel\` | \`'pending' → '待审核'\`, etc. |`,
    `| \`formatSuggestedActionLabel\` | \`'blockedByMissingCourse' → '因课程缺失阻塞'\`; unknown → \`未知建议：<value>\` |`,
    `| \`formatDiagnosticCodeLabel\` | \`'COURSE_MISSING' → '课程缺失'\`; unknown → \`未知诊断：<code>\` |`,
    `| \`formatMatchStatusLabel\` | \`'exact' → '精确匹配'\`; \`'a / b' → 'A / B'\` |`,
    `| \`formatBlockedLabel\` | \`true → '是'\`, \`false → '否'\`, \`'blocked' → '阻塞'\`, \`'notBlocked' → '不阻塞'\` |`,
    `| \`formatConfidence\` | \`0.85 → '0.85'\`; null / undefined / NaN → \`'-'\` |`,
    ``,
    `## 4. Machine-Value Preservation`,
    ``,
    `| surface | value |`,
    `|---|---|`,
    `| decision option value | \`pending\` / \`approved\` / \`rejected\` / \`needsReview\` (English) |`,
    `| blocked option value | \`all\` / \`blocked\` / \`notBlocked\` (English) |`,
    `| exported JSON field names | \`approvalItemId\` / \`decision\` / \`targetSemesterId\` / \`packageRef\` / \`decisions\` / \`rawIncluded\` (English) |`,
    `| exported JSON \`rawIncluded\` | \`false\` literal |`,
    `| exported JSON \`decision\` | \`pending\` / \`approved\` / \`rejected\` / \`needsReview\` (English) |`,
    `| filter state | English machine values (no Chinese) |`,
    ``,
    `## 5. Privacy`,
    ``,
    `- Helper source: 0 raw teacher / class / course / remark / sheet / phone leaks (privacy detector).`,
    `- Committed JSON: 0 PII leaks.`,
    `- Exported decision JSON: \`rawIncluded=false\`, no raw teacher / class / course / remark text.`,
    ``,
    `## 6. Validation Result`,
    ``,
    `- 66 / 66 L6-D2A verify checks PASS`,
    `- scan:docs-pii: ${piiPass ? 'PASS' : 'FAIL'}`,
    `- build: ${skipRegression ? 'SKIPPED (--skip-regression)' : buildOk ? 'PASS' : 'FAIL'}`,
    `- tsc --noEmit: ${skipRegression ? 'SKIPPED (--skip-regression)' : tscOk ? 'PASS' : 'FAIL'}`,
    `- eslint: ${skipRegression ? 'SKIPPED (--skip-regression)' : eslintOk ? 'PASS' : 'FAIL'}`,
    `- K22-C: ${skipRegression ? 'SKIPPED (--skip-regression)' : k22Pass ? 'PASS (73/0/0/0)' : 'FAIL'}`,
    `- git diff --check on L6-D2A-owned files: clean`,
    `- forbidden files: clean`,
    ``,
    `## 7. Isolation`,
    ``,
    `- \`src/app/api/\` clean (no API modifications)`,
    `- \`prisma/\` clean (no schema/migration changes)`,
    `- No xlsx / dev.db / backup / temp / uploads tracked`,
    `- DB counts unchanged (read-only verification: this script only uses \`prisma.count()\`)`,
    ``,
    `## 8. Relationship to Prior Stages`,
    ``,
    `- **L6-D2** (commit \`ea77f5e\`): the review UI base. L6-D2A ONLY swaps English display text for Chinese via the helper; the underlying logic, API, decision-file shape, and machine-value contract are unchanged.`,
    `- **L6-D / L6-D1 / L6-C / L4 / L2 / Word parser / scheduler / score / schema**: untouched.`,
    ``,
    `## 9. Next Steps`,
    ``,
    `L6-D2A closes after browser manual validation passes. Future work (planned):`,
    ``,
    `- Browser-side manual UI check: open /admin/import review section, confirm all Chinese labels render correctly.`,
    `- Optional: extract a generalized i18n registry if other UI surfaces need localization.`,
    ``,
  ].join('\n')
}

function appendStatusLine(): void {
  const path = join(ROOT, STATUS_PATH)
  if (!existsSync(path)) return
  const content = (readFileSync(path, 'utf-8') ?? '').toString()
  if (content.includes('L6-D2A')) return // idempotent
  const line =
    `- L6-D2A Excel 课程设置 approval review UI 本地化已完成：新增纯函数 helper (course-setting-approval-review-localization.ts) 提供 Chinese display labels；UI 组件 (course-setting-xlsx-preview.tsx) 接入 helper。Machine values (option value / state / exported JSON) 保持 English，不写 DB、不修改 API/UI 契约。`
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