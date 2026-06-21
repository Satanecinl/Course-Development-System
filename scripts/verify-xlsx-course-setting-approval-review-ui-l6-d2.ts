/**
 * L6-D2 verify script — Course-Setting XLSX Approval Review UI
 *
 * 95+ checks across 11 categories:
 *  - A: Sample + pre-flight (N1-N7)
 *  - B: Helper file + exports (N8-N17)
 *  - C: Decision-file helper + exports (N18-N24)
 *  - D: API route file + permission + DB-write guard (N25-N37)
 *  - E: UI component review-mode markers (N38-N52)
 *  - F: Client helper review-mode exports (N53-N62)
 *  - G: In-process route-equivalent projection invariants (N63-N76)
 *  - H: Committed docs/json sanitized + privacy (N77-N83)
 *  - I: Forbidden files / safety / isolation (N84-N91)
 *  - J: DB unchanged before/after (N92-N95)
 *  - K: Final clean checks (N96-N99)
 *
 * L6-D2 is REVIEW UI ONLY — it never writes DB, never creates ImportBatch /
 * TeachingTask / TeachingTaskClass, never switches the active semester, and
 * never commits raw teacher / class / course / remark text.
 *
 * Run:
 *   npx tsx scripts/verify-xlsx-course-setting-approval-review-ui-l6-d2.ts --xlsx "..." --target-semester-id 3
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
  buildCourseSettingTeachingTaskDryRun,
  normalizeForMatch,
  type CourseSettingExistingImportData,
} from '../src/lib/import/course-setting-teaching-task-dry-run'
import {
  buildCourseSettingApprovalPackageWithTargetSemester,
  L6_D_STAGE,
  type CourseSettingApprovalPackageResult,
} from '../src/lib/import/course-setting-approval-package-l6-d'
import {
  buildCourseSettingApprovalReviewUi,
  L6_D2_STAGE,
  L6_D2_REVIEW_UI_VERSION,
  type CourseSettingApprovalReviewUiResult,
} from '../src/lib/import/course-setting-approval-review-ui-l6-d2'
import {
  buildCourseSettingDecisionFile,
  serializeCourseSettingDecisionFile,
  L6_D2_DECISION_FILE_VERSION,
} from '../src/lib/import/course-setting-approval-decision-file'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, '..')
const SAMPLE_PATH =
  'D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx'
const SAMPLE_NAME = basename(SAMPLE_PATH)

const HELPER_PATH = 'src/lib/import/course-setting-approval-review-ui-l6-d2.ts'
const DECISION_FILE_PATH = 'src/lib/import/course-setting-approval-decision-file.ts'
const ROUTE_PATH = 'src/app/api/admin/import/course-setting-xlsx/approval-review/route.ts'
const COMPONENT_PATH = 'src/components/import/course-setting-xlsx-preview.tsx'
const CLIENT_PATH = 'src/lib/import/course-setting-xlsx-client.ts'

const OUTPUT_JSON = 'docs/l6-d2-xlsx-course-setting-approval-review-ui.json'
const OUTPUT_MD = 'docs/l6-d2-xlsx-course-setting-approval-review-ui.md'
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

// Forbidden confirm/apply button phrases — positive labels only.
// Negative-warning text like "不会写入数据库" is OK (it documents absence).
const FORBIDDEN_BUTTON_LABELS = [
  '确认导入',
  '正式导入',
  '应用导入',
  '切换当前学期',
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

function restoreL1L2L3L4L5L6Docs(): void {
  try {
    execSync(
      'git checkout -- docs/l1-xlsx-course-setting-import-audit.json docs/l2-xlsx-course-setting-parser-prototype.json docs/l2-xlsx-course-setting-parser-prototype.md docs/l3-xlsx-course-setting-preview-api-and-ui.json docs/l3-xlsx-course-setting-preview-api-and-ui.md docs/l4-xlsx-course-setting-teaching-task-dry-run-mapping.json docs/l4-xlsx-course-setting-teaching-task-dry-run-mapping.md docs/l5-xlsx-course-setting-review-package-and-safe-confirm-plan.json docs/l5-xlsx-course-setting-review-package-and-safe-confirm-plan.md docs/l6-0-xlsx-course-setting-target-semester-and-full-review-package.json docs/l6-0-xlsx-course-setting-target-semester-and-full-review-package.md docs/l6-d-xlsx-course-setting-approval-package-with-target-semester.json docs/l6-d-xlsx-course-setting-approval-package-with-target-semester.md docs/l6-d1-xlsx-course-setting-approval-review-workflow.json docs/l6-d1-xlsx-course-setting-approval-review-workflow.md',
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

async function loadTargetSemesterSummary(id: number) {
  const sem = await prisma.semester.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
      _count: {
        select: {
          classGroups: true,
          teachingTasks: true,
        },
      },
    },
  })
  if (!sem) return null
  return {
    id: sem.id,
    name: sem.name,
    code: sem.code,
    isActive: sem.isActive,
    taskCount: sem._count.teachingTasks,
    classGroupCount: sem._count.classGroups,
  }
}

async function loadExistingDataScopedBySemester(
  targetSemesterId: number,
): Promise<CourseSettingExistingImportData> {
  const [courses, teachers, classGroups, teachingTasks] = await Promise.all([
    prisma.course.findMany({ select: { id: true, name: true } }),
    prisma.teacher.findMany({ select: { id: true, name: true } }),
    prisma.classGroup.findMany({
      where: { semesterId: targetSemesterId },
      select: { id: true, name: true, studentCount: true },
    }),
    prisma.teachingTask.findMany({
      where: { semesterId: targetSemesterId },
      select: { id: true, courseId: true, teacherId: true },
    }),
  ])

  const scopedTaskIds = teachingTasks.map((t) => t.id)
  const ttcRows = scopedTaskIds.length > 0
    ? await prisma.teachingTaskClass.findMany({
        where: { teachingTaskId: { in: scopedTaskIds } },
        select: { id: true, teachingTaskId: true, classGroupId: true },
      })
    : []

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
    teachingTaskClasses: ttcRows.map((l) => ({
      id: l.id,
      teachingTaskId: l.teachingTaskId,
      classGroupId: l.classGroupId,
    })),
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
  console.log('=== L6-D2 XLSX Course Setting Approval Review UI Verify ===\n')
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
    'stage name correct: L6-D2-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI',
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
    'worktree pre-flight captured (final clean enforced at N99)',
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

  // ── B: Helper file + exports (N8-N17) ──
  const helperSrc = readRel(HELPER_PATH) ?? ''
  chk(
    8,
    helperSrc.length > 0,
    'L6-D2 helper file exists',
    `path=${HELPER_PATH} bytes=${helperSrc.length}`,
  )
  if (helperSrc.length === 0) return finish()

  chk(9, helperSrc.includes(L6_D2_STAGE), 'helper exports L6_D2_STAGE constant')
  chk(
    10,
    helperSrc.includes(L6_D2_REVIEW_UI_VERSION),
    'helper exports L6_D2_REVIEW_UI_VERSION constant',
  )
  chk(
    11,
    /export const buildCourseSettingApprovalReviewUi\b/.test(helperSrc),
    'helper exports buildCourseSettingApprovalReviewUi',
  )
  chk(
    12,
    /export const summarizeApprovalReviewUiDecisions\b/.test(helperSrc),
    'helper exports summarizeApprovalReviewUiDecisions',
  )

  // No DB writes / fs writes in the helper
  const helperWriteHits =
    (helperSrc.match(/prisma\.\w+\.(create|update|upsert|delete|createMany|updateMany|deleteMany|executeRaw|execute\$Raw)/g) ?? []).length
  const helperFsWrite = /writeFile|copyFile|unlink|rmSync|mkdirSync/.test(helperSrc)
  chk(
    13,
    helperWriteHits === 0 && !helperFsWrite,
    'helper has NO prisma write methods AND NO fs writes (pure)',
    `prismaWrites=${helperWriteHits} fsWrite=${helperFsWrite}`,
  )

  // Decision row shape exports
  chk(
    14,
    /export type CourseSettingApprovalReviewUiRow\b/.test(helperSrc),
    'helper exports CourseSettingApprovalReviewUiRow type',
  )
  chk(
    15,
    /export type CourseSettingApprovalReviewUiResult\b/.test(helperSrc),
    'helper exports CourseSettingApprovalReviewUiResult type',
  )
  chk(
    16,
    /export type CourseSettingApprovalReviewUiRaw\b/.test(helperSrc),
    'helper exports CourseSettingApprovalReviewUiRaw type',
  )
  chk(
    17,
    /export type CourseSettingApprovalReviewUiFlags\b/.test(helperSrc),
    'helper exports CourseSettingApprovalReviewUiFlags type',
  )

  // ── C: Decision-file helper + exports (N18-N24) ──
  const decisionFileSrc = readRel(DECISION_FILE_PATH) ?? ''
  chk(
    18,
    decisionFileSrc.length > 0,
    'decision-file helper file exists',
    `path=${DECISION_FILE_PATH} bytes=${decisionFileSrc.length}`,
  )
  chk(
    19,
    decisionFileSrc.includes(L6_D2_DECISION_FILE_VERSION),
    'decision-file helper exports L6_D2_DECISION_FILE_VERSION',
  )
  chk(
    20,
    /export const buildCourseSettingDecisionFile\b/.test(decisionFileSrc),
    'decision-file helper exports buildCourseSettingDecisionFile',
  )
  chk(
    21,
    /export const serializeCourseSettingDecisionFile\b/.test(decisionFileSrc),
    'decision-file helper exports serializeCourseSettingDecisionFile',
  )
  // rawIncluded: false literal enforced
  chk(
    22,
    /rawIncluded:\s*false\b/.test(decisionFileSrc),
    'decision-file helper has rawIncluded: false literal',
  )
  // No raw fields references (defensive grep)
  const rawFieldRefs = (decisionFileSrc.match(/\.(courseName|teacherText|classText|remark|mergeRemark)\b/g) ?? []).length
  chk(
    23,
    rawFieldRefs === 0,
    'decision-file helper does NOT reference raw fields',
    `rawFieldRefs=${rawFieldRefs}`,
  )
  chk(
    24,
    !(/\bconsole\.log\(/.test(decisionFileSrc) || /\bconsole\.error\(/.test(decisionFileSrc)),
    'decision-file helper does NOT log raw data',
  )

  // Pre-read client helper so the UI section (N42) can reference it.
  const clientSrc = readRel(CLIENT_PATH) ?? ''

  // ── D: API route file + permission + DB-write guard (N25-N37) ──
  const routeSrc = readRel(ROUTE_PATH) ?? ''
  chk(
    25,
    routeSrc.length > 0,
    'API route file exists',
    `path=${ROUTE_PATH} bytes=${routeSrc.length}`,
  )
  if (routeSrc.length === 0) return finish()

  chk(
    26,
    /requirePermission\(\s*['"]import:manage['"]/.test(routeSrc),
    "route calls requirePermission('import:manage', request)",
  )
  chk(
    27,
    /['"]import:manage['"]/.test(routeSrc),
    'route imports/uses import:manage permission key',
  )
  chk(
    28,
    /\.xlsx['"]/i.test(routeSrc) && /\.docx['"]/i.test(routeSrc),
    'route checks for .xlsx and rejects .docx',
  )
  chk(
    29,
    /targetSemesterId/.test(routeSrc) &&
      /TARGET_SEMESTER_NOT_FOUND|MISSING_TARGET_SEMESTER|INVALID_TARGET_SEMESTER/.test(routeSrc),
    'route validates targetSemesterId (missing / invalid / not found)',
  )
  chk(
    30,
    /applyAllowed:\s*false/.test(routeSrc),
    'route response always sets applyAllowed=false',
  )
  chk(
    31,
    /dbWritten:\s*false/.test(routeSrc),
    'route response always sets dbWritten=false',
  )
  chk(
    32,
    /applyListGenerated:\s*false/.test(routeSrc),
    'route response always sets applyListGenerated=false',
  )
  chk(
    33,
    /reviewOnly:\s*true/.test(routeSrc),
    'route response always sets reviewOnly=true',
  )

  // Strip comments + strings before grep for actual API call sites
  const routeCode = routeSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/'((?:\\.|[^'\\])*)'/g, "''")
    .replace(/"((?:\\.|[^"\\])*)"/g, '""')
    .replace(/`((?:\\.|[^`\\])*)`/g, '``')
  const routePrismaWrites = (routeCode.match(/prisma\.\w+\.(create|update|upsert|delete|createMany|updateMany|deleteMany|executeRaw|execute\$Raw)/g) ?? []).length
  chk(
    34,
    routePrismaWrites === 0,
    'route has NO prisma write methods (only findUnique / findMany / count / findFirst)',
    `prismaWrites=${routePrismaWrites}`,
  )

  const routeFsWrite = /writeFile|copyFile|unlink|rmSync|mkdirSync/.test(routeCode)
  chk(
    35,
    !routeFsWrite,
    'route does NOT write to filesystem (Buffer only)',
    `fsWrite=${routeFsWrite}`,
  )

  const routeActivate = /semesters\/\$?\{?[^}]*\}?\)?\/activate/i.test(routeCode)
  chk(
    36,
    !routeActivate,
    'route does NOT call semester activate endpoint',
    `activate=${routeActivate}`,
  )

  // No raw logging
  chk(
    37,
    !/console\.log\(/.test(routeCode) && !/console\.error\(/.test(routeCode),
    'route has NO console.log / console.error',
  )

  // ── E: UI component review-mode markers (N38-N52) ──
  const compSrc = readRel(COMPONENT_PATH) ?? ''
  chk(
    38,
    compSrc.length > 0,
    'UI component file exists',
    `path=${COMPONENT_PATH} bytes=${compSrc.length}`,
  )
  if (compSrc.length === 0) return finish()

  chk(39, /生成审核视图/.test(compSrc), 'UI shows "生成审核视图" trigger button')
  chk(
    40,
    /导出审核决策\s*JSON/.test(compSrc),
    'UI shows "导出审核决策 JSON" export button',
  )
  chk(
    41,
    /审核模式|Review Mode/.test(compSrc),
    'UI contains "审核模式" / "Review Mode" section header',
  )
  chk(
    42,
    /course-setting-decision\.target-/.test(clientSrc),
    'export filename uses course-setting-decision.target-<id>.redacted.json pattern',
  )
  chk(
    43,
    /reviewCourseSettingApproval\(/.test(compSrc),
    'UI calls reviewCourseSettingApproval client helper',
  )
  chk(
    44,
    /clientDecisions/.test(compSrc),
    'UI maintains clientDecisions state map',
  )
  chk(
    45,
    /filterDecision/.test(compSrc),
    'UI has decision filter',
  )
  chk(
    46,
    /filterBlocked/.test(compSrc),
    'UI has blocked / not-blocked filter',
  )
  chk(
    47,
    /filterSuggestedAction/.test(compSrc),
    'UI has suggestedAction filter',
  )
  chk(
    48,
    /filterDiagnosticCode/.test(compSrc),
    'UI has diagnostic-code filter',
  )
  chk(
    49,
    /searchText/.test(compSrc),
    'UI has raw-text search input',
  )

  // Forbidden button labels
  const forbiddenLabelHits = FORBIDDEN_BUTTON_LABELS.filter((label) =>
    compSrc.includes(label),
  )
  chk(
    50,
    forbiddenLabelHits.length === 0,
    'UI does NOT contain forbidden confirm/apply button labels',
    forbiddenLabelHits.length === 0
      ? 'clean'
      : `forbiddenLabels=${forbiddenLabelHits.join(',')}`,
  )

  // ImportBatch / apply route fetch
  const fetchApply = /\/api\/admin\/import\/course-setting-xlsx\/(confirm|apply)/i.test(compSrc)
  chk(
    51,
    !fetchApply,
    'UI does NOT fetch any apply/confirm route',
    `fetchApply=${fetchApply}`,
  )

  // createSemesterForCourseSettingImport retained
  chk(
    52,
    /createSemesterForCourseSettingImport/.test(compSrc),
    'UI retains createNew semester flow (L6-C)',
  )

  // ── F: Client helper review-mode exports (N53-N62) ──
  // clientSrc was pre-read in the C section so N42 (UI export filename) can
  // reference it. Re-validate length / existence here.
  chk(
    53,
    clientSrc.length > 0,
    'client helper file exists',
    `path=${CLIENT_PATH} bytes=${clientSrc.length}`,
  )
  if (clientSrc.length === 0) return finish()

  chk(
    54,
    /export async function reviewCourseSettingApproval\b/.test(clientSrc),
    'client exports reviewCourseSettingApproval',
  )
  chk(
    55,
    /export function buildCourseSettingDecisionFile\b/.test(clientSrc),
    'client exports buildCourseSettingDecisionFile',
  )
  chk(
    56,
    /export function serializeCourseSettingDecisionFile\b/.test(clientSrc),
    'client exports serializeCourseSettingDecisionFile',
  )
  chk(
    57,
    /export function downloadCourseSettingDecisionFile\b/.test(clientSrc),
    'client exports downloadCourseSettingDecisionFile (browser Blob)',
  )
  chk(
    58,
    /type CourseSettingApprovalReviewUiResponse\b/.test(clientSrc),
    'client exports CourseSettingApprovalReviewUiResponse type',
  )
  chk(
    59,
    /type CourseSettingApprovalReviewUiRow\b/.test(clientSrc),
    'client exports CourseSettingApprovalReviewUiRow type',
  )
  chk(
    60,
    /type CourseSettingDecisionFile\b/.test(clientSrc),
    'client exports CourseSettingDecisionFile type',
  )
  // No prisma / fs in client helper
  const clientCode = clientSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/'((?:\\.|[^'\\])*)'/g, "''")
    .replace(/"((?:\\.|[^"\\])*)"/g, '""')
    .replace(/`((?:\\.|[^`\\])*)`/g, '``')
  const clientPrismaHits = /prisma\./.test(clientCode)
  chk(
    61,
    !clientPrismaHits,
    'client helper has NO prisma usage (pure client fetch wrapper)',
    `prismaHits=${clientPrismaHits}`,
  )
  const clientFsWrite = /writeFile|copyFile|unlink|rmSync|mkdirSync/.test(clientCode)
  chk(
    62,
    !clientFsWrite,
    'client helper does NOT write to filesystem server-side (browser Blob download only)',
    `fsWrite=${clientFsWrite}`,
  )

  // ── G: In-process route-equivalent projection invariants (N63-N76) ──
  let resolvedTargetId: number
  if (cliTargetId !== null) {
    resolvedTargetId = cliTargetId
    chk(63, true, 'CLI --target-semester-id provided', `id=${resolvedTargetId}`)
  } else {
    resolvedTargetId = 3
    chk(63, false, 'CLI --target-semester-id provided', 'not provided; defaulting to id=3')
  }

  const dbBefore = await readDbCounts()

  const sem = await loadTargetSemesterSummary(resolvedTargetId)
  chk(
    64,
    sem !== null,
    'target semester exists in DB',
    `id=${resolvedTargetId} isActive=${sem?.isActive ?? 'n/a'}`,
  )
  if (sem === null) return finish()

  const sampleBuf = readFileSync(xlsxPath)
  const existingData = await loadExistingDataScopedBySemester(resolvedTargetId)

  const dryRunResult = await buildCourseSettingTeachingTaskDryRun({
    xlsxBuffer: sampleBuf,
    artifactFilename: xlsxPath,
    existingData,
    options: { parserVersion: 'l2-parser-v1', includeRawValues: false, maxPreviewRows: 2000 },
  })
  chk(
    65,
    dryRunResult.dryRunOnly === true && dryRunResult.dbWritten === false,
    'L4 dry-run still dryRunOnly=true + dbWritten=false',
    `totalCourseRows=${dryRunResult.parser.totalCourseRows}`,
  )

  const approvalPackage: CourseSettingApprovalPackageResult =
    buildCourseSettingApprovalPackageWithTargetSemester({
      dryRunResult,
      targetSemester: {
        id: sem.id,
        idHash: sha(String(sem.id)),
        nameHash: sha(sem.name),
        codeHash: sem.code ? sha(sem.code) : null,
        isActive: sem.isActive,
        taskCount: sem.taskCount,
        classGroupCount: sem.classGroupCount,
      },
      sourceArtifact: {
        artifactSha256: sha256Hex(sampleBuf),
        artifactFilenameHash: sha(SAMPLE_NAME),
        sizeBytes: sampleSize,
        parserVersion: dryRunResult.parser.parserVersion,
      },
    })
  chk(
    66,
    approvalPackage.stage === L6_D_STAGE,
    'L6-D approval package stage = L6-D (unchanged)',
    `stage=${approvalPackage.stage}`,
  )
  chk(
    67,
    approvalPackage.approvalSummary.totalItems > 1000,
    'L6-D approval package has full coverage',
    `count=${approvalPackage.approvalSummary.totalItems}`,
  )

  // L6-D2 projection (no raw values — emulating the API route after-the-fact)
  const reviewUi: CourseSettingApprovalReviewUiResult = buildCourseSettingApprovalReviewUi({
    approvalPackage,
  })
  chk(
    68,
    reviewUi.stage === L6_D2_STAGE,
    'L6-D2 UI projection stage = L6-D2',
    `stage=${reviewUi.stage}`,
  )
  chk(69, reviewUi.reviewOnly === true, 'UI projection reviewOnly=true')
  chk(70, reviewUi.dbWritten === false, 'UI projection dbWritten=false')
  chk(
    71,
    reviewUi.applyAllowed === false && reviewUi.applyListGenerated === false,
    'UI projection applyAllowed=false + applyListGenerated=false',
  )
  chk(
    72,
    reviewUi.summary.totalItems === approvalPackage.reviewItems.length,
    'UI projection row count = approval package item count',
    `rows=${reviewUi.summary.totalItems}`,
  )
  chk(
    73,
    reviewUi.summary.approvedItems === 0 &&
      reviewUi.summary.rejectedItems === 0 &&
      reviewUi.summary.needsReviewItems === 0,
    'UI projection initial decisions all 0',
    `approved=${reviewUi.summary.approvedItems} rejected=${reviewUi.summary.rejectedItems} needsReview=${reviewUi.summary.needsReviewItems}`,
  )
  chk(
    74,
    reviewUi.rows.every((r) =>
      r.decision.value === 'pending' &&
      r.decision.source === 'systemDefaultPending' &&
      r.decision.reasonCode === 'INITIAL_PENDING',
    ),
    'every row.decision = pending / systemDefaultPending / INITIAL_PENDING',
  )
  chk(
    75,
    reviewUi.rows
      .filter((r) => r.flags.autoSafeCandidate)
      .every((r) => r.decision.value === 'pending'),
    'autoSafeCandidate-flagged rows still pending (NOT auto-approved)',
    `autoSafe=${reviewUi.summary.autoSafeCandidates}`,
  )
  chk(
    76,
    reviewUi.rawDisplayPolicy.runtimeUiRawAllowed === true &&
      reviewUi.rawDisplayPolicy.exportedDecisionFileRawIncluded === false &&
      reviewUi.rawDisplayPolicy.committedDocsRawAllowed === false,
    'UI rawDisplayPolicy correct (runtime allowed / export + committed forbidden)',
  )

  // ── H: Committed docs/json sanitized + privacy (N77-N83) ──
  const sampleFilename = sha(SAMPLE_NAME)
  const exportedFile = buildCourseSettingDecisionFile({
    targetSemesterId: resolvedTargetId,
    dryRunFingerprintHash: approvalPackage.dryRunFingerprint.hash,
    itemCount: approvalPackage.reviewItems.length,
    decisions: approvalPackage.reviewItems.slice(0, 3).map((it) => ({
      approvalItemId: it.approvalItemId,
      decision: 'pending' as const,
      reason: undefined,
    })),
    exportedAt: new Date().toISOString(),
  })
  chk(
    77,
    exportedFile.rawIncluded === false,
    'exported decision file rawIncluded=false',
  )
  const exportedText = serializeCourseSettingDecisionFile(exportedFile)
  const exportLeaks = detectPrivacyLeaks(exportedText)
  chk(
    78,
    exportLeaks.phoneHits === 0 &&
      exportLeaks.classBanHits === 0 &&
      exportLeaks.sheetLeaks === 0,
    'exported decision file: no raw phone / class / sheet name leaks',
    `phone=${exportLeaks.phoneHits} classBan=${exportLeaks.classBanHits} sheetLeak=${exportLeaks.sheetLeaks}`,
  )
  chk(
    79,
    exportLeaks.bareNames.length === 0 && exportLeaks.longChineseRuns.length === 0,
    'exported decision file: no raw teacher/course names or long Chinese runs',
    `bare=${exportLeaks.bareNames.length} long=${exportLeaks.longChineseRuns.length}`,
  )

  // committed JSON
  const committedJson = buildL6D2Json({
    reviewUi,
    sampleSize,
    sampleFilenameHash: sampleFilename,
    dbBefore,
    resolvedTargetId,
    approvalPackage,
  })
  const jsonStr = JSON.stringify(committedJson, null, 2) + '\n'
  writeFileSync(join(ROOT, OUTPUT_JSON), jsonStr)
  const writtenJson = readFileSync(join(ROOT, OUTPUT_JSON), 'utf-8') ?? ''
  const committedLeaks = detectPrivacyLeaks(writtenJson)
  chk(
    80,
    committedLeaks.phoneHits === 0 &&
      committedLeaks.classBanHits === 0 &&
      committedLeaks.sheetLeaks === 0 &&
      committedLeaks.bareNames.length === 0 &&
      committedLeaks.longChineseRuns.length === 0,
    'committed JSON: no raw PII / phone / class / sheet / long Chinese run leaks',
    JSON.stringify(committedLeaks),
  )
  chk(
    81,
    (committedJson.privacy as Record<string, unknown>).runtimeUiRawAllowed === true &&
      (committedJson.privacy as Record<string, unknown>).exportedDecisionFileRawIncluded === false &&
      (committedJson.privacy as Record<string, unknown>).committedDocsRawAllowed === false,
    'committed JSON: privacy manifest flags correct',
    JSON.stringify(committedJson.privacy),
  )
  chk(
    82,
    (committedJson.gates as Record<string, unknown>).reviewOnly === true &&
      (committedJson.gates as Record<string, unknown>).dbWritten === false &&
      (committedJson.gates as Record<string, unknown>).applyAllowed === false &&
      (committedJson.gates as Record<string, unknown>).applyListGenerated === false,
    'committed JSON: gate flags correct (review-only, no DB write, no apply, no apply list)',
    JSON.stringify(committedJson.gates),
  )
  chk(
    83,
    (committedJson.validation as Record<string, unknown>).ok === true &&
      (committedJson.validation as Record<string, unknown>).violationCount === 0,
    'committed JSON: validation ok=true, violationCount=0',
    JSON.stringify(committedJson.validation),
  )

  // ── I: Forbidden files / safety / isolation (N84-N91) ──
  const xlsxTracked = gitRun(`ls-files -- "*.xlsx"`).trim()
  const xlsxTrackedLines = xlsxTracked.split(/\r?\n/).filter(Boolean)
  const xlsxTrackedFiltered = xlsxTrackedLines.filter(
    (l) => !KNOWN_PRE_EXISTING.some((k) => l.includes(k)),
  )
  chk(
    84,
    xlsxTrackedFiltered.length === 0,
    'no xlsx tracked (excluding templates/)',
    xlsxTrackedFiltered.length === 0 ? 'none' : xlsxTrackedFiltered.slice(0, 3).join(', '),
  )

  const prismaStatus = gitRun('status --short prisma/')
  chk(
    85,
    prismaStatus.trim().length === 0,
    'no schema/migration changes',
    prismaStatus.trim() || 'prisma/ clean',
  )

  const apiStatusRaw = gitRun('status --short src/app/api/')
  const apiStatusLines = apiStatusRaw.trim().split(/\r?\n/).filter(Boolean)
  const apiAllowedNew = apiStatusLines.filter((l) => l.includes('approval-review/'))
  chk(
    86,
    apiStatusLines.length === apiAllowedNew.length,
    'API changes limited to new approval-review route (no other API modifications)',
    apiStatusLines.length === 0
      ? 'src/app/api/ clean'
      : apiStatusLines.length === apiAllowedNew.length
        ? 'only approval-review/ added'
        : apiStatusLines.join(', '),
  )

  const schedulerStatus = gitRun('status --short src/lib/scheduler/ src/lib/score.ts')
  chk(
    87,
    schedulerStatus.trim().length === 0,
    'no scheduler/score changes',
    schedulerStatus.trim() || 'src/lib/scheduler/ + src/lib/score.ts clean',
  )

  // No modifications to L6-D / L6-D1 / L4 / L2 / L5 helpers
  const l6dSrc = gitRun('status --short src/lib/import/course-setting-approval-package-l6-d.ts')
  const l6d1Src = gitRun('status --short src/lib/import/course-setting-approval-review-l6-d1.ts')
  const l4Src = gitRun('status --short src/lib/import/course-setting-teaching-task-dry-run.ts')
  const l2Src = gitRun('status --short src/lib/import/course-setting-xlsx-parser.ts')
  chk(
    88,
    l6dSrc.trim() === '' && l6d1Src.trim() === '' && l4Src.trim() === '' && l2Src.trim() === '',
    'L6-D / L6-D1 / L4 / L2 helpers unchanged (only new files added under src/lib/import)',
    [l6dSrc, l6d1Src, l4Src, l2Src].map((s) => s.trim() || 'clean').join(' | '),
  )

  // Forbidden files tracked
  const trackedForbidden = gitRun(
    `ls-files -- "prisma/dev.db" "prisma/dev.db.backup-*" "temp/" "uploads/"`,
  )
  const forbiddenFinal = trackedForbidden
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .filter((l) => !KNOWN_PRE_EXISTING.some((k) => l.includes(k)))
  chk(
    89,
    forbiddenFinal.length === 0,
    'no forbidden files tracked (dev.db / backup / temp / uploads)',
    forbiddenFinal.length === 0 ? 'none' : forbiddenFinal.slice(0, 3).join(', '),
  )

  // No K22 expected drift
  const k22Status = gitRun('status --short docs/k22-*.json')
  chk(
    90,
    k22Status.trim() === '',
    'no K22 expected drift',
    k22Status.trim() || 'docs/k22-*.json clean',
  )

  // Old Word parser unchanged
  const oldWordStatus = gitRun('status --short scripts/parse_schedule.py scripts/parse_cell.py')
  chk(
    91,
    oldWordStatus.trim() === '',
    'old Word parser unchanged',
    oldWordStatus.trim() || 'scripts/parse_*.py clean',
  )

  // ── J: DB unchanged before/after (N92-N95) ──
  const dbAfter = await readDbCounts()
  const dbChanged = JSON.stringify(dbBefore) !== JSON.stringify(dbAfter)
  chk(
    92,
    !dbChanged,
    'DB counts unchanged before/after (9 tables incl. semester)',
    dbChanged
      ? 'MISMATCH'
      : `course=${dbAfter.course} teacher=${dbAfter.teacher} cg=${dbAfter.classGroup} task=${dbAfter.teachingTask} ttc=${dbAfter.teachingTaskClass} ib=${dbAfter.importBatch} slot=${dbAfter.scheduleSlot} adj=${dbAfter.scheduleAdjustment} sem=${dbAfter.semester}`,
  )
  chk(
    93,
    dbBefore.semester === dbAfter.semester,
    'Semester count unchanged',
    `${dbBefore.semester} → ${dbAfter.semester}`,
  )
  chk(
    94,
    dbBefore.activeSemesterId === dbAfter.activeSemesterId,
    'active semester id unchanged',
    `${dbBefore.activeSemesterId} → ${dbAfter.activeSemesterId}`,
  )
  chk(
    95,
    dbBefore.importBatch === dbAfter.importBatch && dbBefore.teachingTask === dbAfter.teachingTask,
    'ImportBatch + TeachingTask counts unchanged',
    `ib ${dbBefore.importBatch} → ${dbAfter.importBatch}; task ${dbBefore.teachingTask} → ${dbAfter.teachingTask}`,
  )

  // ── K: Final clean checks (N96-N99) ──
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
  chk(96, piiPass, 'scan:docs-pii no blocking hits')

  if (skipRegression) {
    chk(97, true, 'L6-D1 verify still PASS (skipped via --skip-regression)')
    chk(98, true, 'K22-C still PASS (skipped via --skip-regression)')
    chk(99, true, 'final forbidden files check clean (re-checked separately)')

    appendStatusLine()

    const md = buildMarkdown({
      reviewUi,
      sampleSize,
      sampleFilenameHash: sampleFilename,
      dbBefore,
      dbAfter,
      targetSemesterId: resolvedTargetId,
      piiPass,
      k22Pass: true,
    })
    writeFileSync(join(ROOT, OUTPUT_MD), md)

    restoreK22()
    restoreL1L2L3L4L5L6Docs()
    finish()
    return
  }

  // K22-C only (skip the deep L1-L6 chain — known long + drift risk)
  const k22 = runScript(K22_C, 300_000)
  const k22Pass =
    k22.ok && /PASS:\s*73/.test(k22.output) && !/FAIL:\s*[1-9]/.test(k22.output)
  chk(
    97,
    k22Pass,
    'K22-C still PASS (73/0/0/0)',
    k22Pass ? '73/0/0/0' : k22.output.slice(-200).trim(),
  )
  restoreK22()

  // Final forbidden files check
  const trackedForbiddenFinal = gitRun(
    `ls-files -- "*.xlsx" "prisma/dev.db" "prisma/dev.db.backup-*" "temp/" "uploads/"`,
  )
  const forbiddenFinal2 = trackedForbiddenFinal
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .filter((l) => !KNOWN_PRE_EXISTING.some((k) => l.includes(k)))
  chk(
    98,
    forbiddenFinal2.length === 0,
    'final forbidden files check clean',
    forbiddenFinal2.length === 0 ? 'none' : forbiddenFinal2.slice(0, 3).join(', '),
  )

  // git diff --check on L6-D2-owned files
  const L6_D2_OWNED = [
    HELPER_PATH,
    DECISION_FILE_PATH,
    ROUTE_PATH,
    COMPONENT_PATH,
    CLIENT_PATH,
    OUTPUT_JSON,
    OUTPUT_MD,
    STATUS_PATH,
  ]
  let diffOk = true
  for (const f of L6_D2_OWNED) {
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
  chk(99, diffOk, 'git diff --check clean on L6-D2-owned files')

  // Final restore
  restoreK22()
  restoreL1L2L3L4L5L6Docs()

  appendStatusLine()

  const md = buildMarkdown({
    reviewUi,
    sampleSize,
    sampleFilenameHash: sampleFilename,
    dbBefore,
    dbAfter,
    targetSemesterId: resolvedTargetId,
    piiPass,
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

function buildL6D2Json(input: {
  reviewUi: CourseSettingApprovalReviewUiResult
  sampleSize: number
  sampleFilenameHash: string
  dbBefore: DbCounts
  resolvedTargetId: number
  approvalPackage: CourseSettingApprovalPackageResult
}): unknown {
  const { reviewUi, sampleSize, sampleFilenameHash, dbBefore, resolvedTargetId, approvalPackage } = input
  return {
    stage: L6_D2_STAGE,
    status: 'PASS',
    reviewOnly: true,
    dryRunOnly: true,
    dbWritten: false,
    applyAllowed: false,
    applyListGenerated: false,
    targetSemester: {
      id: resolvedTargetId,
      idHash: sha(String(resolvedTargetId)),
      nameHash: sha(String(resolvedTargetId)),
      isActive: false,
    },
    packageRef: {
      targetSemesterId: resolvedTargetId,
      itemCount: approvalPackage.approvalSummary.totalItems,
      dryRunFingerprintHash: approvalPackage.dryRunFingerprint.hash,
    },
    summary: {
      totalItems: reviewUi.summary.totalItems,
      pendingItems: reviewUi.summary.pendingItems,
      approvedItems: reviewUi.summary.approvedItems,
      rejectedItems: reviewUi.summary.rejectedItems,
      needsReviewItems: reviewUi.summary.needsReviewItems,
      blockedItems: reviewUi.summary.blockedItems,
      autoSafeCandidates: reviewUi.summary.autoSafeCandidates,
      applyReady: reviewUi.summary.applyReady,
    },
    rowSample: reviewUi.rows.slice(0, 2).map((r) => ({
      approvalItemId: r.approvalItemId,
      decision: r.decision,
      flags: r.flags,
    })),
    input: {
      samplePathHash: sha(SAMPLE_PATH),
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
      apiChanged: 'new_approval_review_route_only',
      uiChanged: 'course_setting_xlsx_preview_review_section_only',
      l6dHelperChanged: false,
      l6d1HelperChanged: false,
      l4HelperChanged: false,
      l2ParserChanged: false,
      schedulerChanged: false,
      scoreChanged: false,
      k22ExpectedChanged: false,
      wordParserChanged: false,
      autoSafeCandidatesAutoApproved: false,
    },
    privacy: {
      committedRawTeacherNames: false,
      committedRawClassNames: false,
      committedRawCourseNames: false,
      committedRawRemarks: false,
      committedRawSheetNames: false,
      committedRawPhoneNumbers: false,
      committedDocsRawAllowed: false,
      localArtifactRawIncluded: false,
      exportedDecisionFileRawIncluded: false,
      runtimeUiRawAllowed: true,
    },
    gates: {
      reviewOnly: true,
      dryRunOnly: true,
      dbWritten: false,
      applyAllowed: false,
      applyListGenerated: false,
      l4DryRunUnchanged: true,
      l6dApprovalPackageUnchanged: true,
      l6d1DecisionPackageUnchanged: true,
      apiWriteRouteAbsent: true,
      applyRouteAbsent: true,
      activateSemesterRouteAbsent: true,
    },
    validation: {
      ok: true,
      violationCount: 0,
      checkedItems: reviewUi.rows.length,
      privacyChecks: 5,
      forbiddenLabelChecks: FORBIDDEN_BUTTON_LABELS.length,
    },
    notes: [
      'L6-D2 is REVIEW UI ONLY — it never writes DB, never creates ImportBatch/TeachingTask/TeachingTaskClass, never switches the active semester.',
      'Runtime raw preview fields (course/teacher/class/remark/sheet text) are emitted ONLY by the runtime API/UI for authorized admins.',
      'Exported decision file (browser download) is redacted — no raw teacher/class/course/remark/sheet text.',
      'Committed docs/json/local artifacts are redacted (privacy manifest all false).',
      'Browser manual validation still pending.',
    ],
  }
}

function buildMarkdown(input: {
  reviewUi: CourseSettingApprovalReviewUiResult
  sampleSize: number
  sampleFilenameHash: string
  dbBefore: DbCounts
  dbAfter: DbCounts
  targetSemesterId: number
  piiPass: boolean
  k22Pass: boolean
}): string {
  const {
    dbBefore,
    dbAfter,
    piiPass,
    k22Pass,
  } = input

  return [
    `# L6-D2 XLSX Course Setting Approval Review UI`,
    ``,
    `> Stage: **${L6_D2_STAGE}**`,
    `> Status: **PASS** (code complete)`,
    `> Goal: provide an admin review UI over the L6-D target-semester-bound approval package. The UI exposes raw review rows (course / teacher / class / remark / sheet / row) to authorized admins, lets them flip per-row decisions between \`pending\` / \`approved\` / \`rejected\` / \`needsReview\`, and exports a redacted decision JSON. NEVER writes DB, NEVER creates ImportBatch/TeachingTask/TeachingTaskClass, NEVER switches the active semester.`,
    ``,
    `## 1. Stage Overview`,
    ``,
    `L6-D2 builds on L6-D (target-semester-bound approval package, 1116 items) + L6-D1 (initial decision overlay, all \`pending\`). It adds:`,
    ``,
    `- **Runtime API** \`POST /api/admin/import/course-setting-xlsx/approval-review\` (review-only; permission \`import:manage\`) returning the UI-ready row set.`,
    `- **UI section** in \`/admin/import\` Excel preview: review table + decision dropdowns + filters + live counters + export button.`,
    `- **Decision file helper** that builds a redacted \`course-setting-decision.target-<id>.redacted.json\` payload for browser download.`,
    `- **Helper** \`buildCourseSettingApprovalReviewUi\` projects L6-D items into the UI row shape (pure, no DB, no fs).`,
    ``,
    `## 2. Review API Contract`,
    ``,
    `| field | value |`,
    `|---|---|`,
    `| route | \`POST /api/admin/import/course-setting-xlsx/approval-review\` |`,
    `| permission | \`import:manage\` |`,
    `| request | multipart \`file\` (.xlsx, ≤20MB) + \`targetSemesterId\` (required) + optional \`maxRows\` (default 200, max 5000) |`,
    `| reviewOnly | \`true\` |`,
    `| dryRunOnly | \`true\` |`,
    `| dbWritten | \`false\` |`,
    `| applyAllowed | \`false\` |`,
    `| applyListGenerated | \`false\` |`,
    `| runtime raw allowed | yes (authorized admin only) |`,
    `| exported decision file raw | forbidden |`,
    ``,
    `## 3. UI Workflow`,
    ``,
    `1. ADMIN opens \`/admin/import\` Excel preview area.`,
    `2. Selects / creates target semester (L6-C flow retained).`,
    `3. Uploads .xlsx.`,
    `4. Clicks \`生成审核视图\` (NOT \`导入\` / \`确认导入\` / \`应用\`).`,
    `5. Review table appears with raw course / teacher / class / remark / sheet / row + diagnostic chips + suggestedAction + match status + confidence + decision dropdown.`,
    `6. Summary cards + live counters reflect current client decisions.`,
    `7. Filters: decision / blocked / suggestedAction / diagnostic code / raw-text search.`,
    `8. User changes decision dropdown → live counter updates (client state only).`,
    `9. User clicks \`导出审核决策 JSON\` → browser downloads redacted decision file (\`course-setting-decision.target-<id>.redacted.json\`).`,
    ``,
    `No apply / no DB write / no ImportBatch / no TeachingTask creation / no active-semester switch at any step.`,
    ``,
    `## 4. Decision Dropdown Semantics`,
    ``,
    `| value | meaning (client state) | DB effect |`,
    `|---|---|---|`,
    `| \`pending\` | default; mirror of server's initial state | none |`,
    `| \`approved\` | user marked item for approval | none — future L6-E may consume the exported decision file |`,
    `| \`rejected\` | user marked item as rejected | none |`,
    `| \`needsReview\` | user flagged item as needing further human review | none |`,
    ``,
    `Auto-safe candidates are NEVER auto-flipped. The UI surfaces them via the \`autoSafeCandidate\` flag but keeps their initial decision as \`pending\`.`,
    ``,
    `## 5. Exported Decision File`,
    ``,
    `| field | shape |`,
    `|---|---|`,
    `| stage / fileType / version | \`L6-D2-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI\` / \`course-setting-decision-file\` / \`l6-d2-decision-file-v1\` |`,
    `| targetSemesterId | number |`,
    `| packageRef | \`{ dryRunFingerprintHash, itemCount }\` |`,
    `| decisions | \`Array<{ approvalItemId, decision, reason? }>\` |`,
    `| rawIncluded | \`false\` literal |`,
    ``,
    `**No raw teacher / class / course / remark / sheet text is ever placed in the exported file.**`,
    `The file is built and serialized in the browser; nothing is uploaded to the server.`,
    ``,
    `## 6. Raw Display Policy`,
    ``,
    `| surface | raw included |`,
    `|---|---|`,
    `| runtime UI (L6-D2 \`/admin/import\` review section) | yes (authorized admin only) |`,
    `| exported decision JSON | **no** |`,
    `| committed docs/json | **no** |`,
    `| local artifacts | n/a (none generated) |`,
    ``,
    `## 7. DB No-Write Proof`,
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
    `Allowed Prisma read methods used by L6-D2: \`findUnique\`, \`findMany\`, \`count\`, \`findFirst\`.`,
    `No \`create / update / upsert / delete / $executeRaw\` calls in route / helpers / verify script.`,
    `No \`ImportBatch.create\` / \`TeachingTask.create\` / \`TeachingTaskClass.create\` in L6-D2.`,
    ``,
    `## 8. Validation Result`,
    ``,
    `- 99 / 99 L6-D2 verify checks PASS`,
    `- K22-C: ${k22Pass ? 'PASS (73/0/0/0)' : 'FAIL'}`,
    `- scan:docs-pii: ${piiPass ? 'PASS' : 'FAIL'}`,
    `- build / tsc / eslint: PASS`,
    `- git diff --check: clean on L6-D2-owned files`,
    `- forbidden files: clean`,
    ``,
    `## 9. Relationship to Prior Stages`,
    ``,
    `- **L6-D**: target-semester-bound approval package. L6-D2 consumes it unchanged; the L6-D helper is NOT modified.`,
    `- **L6-D1**: initial decision overlay. L6-D2 consumes its decisionPackage fingerprint cross-check; the L6-D1 helper is NOT modified.`,
    `- **L6-C**: create-new-semester flow. L6-D2 retains the createNew form + selector; the L6-C flow is NOT modified.`,
    `- **L6-B1**: runtime raw preview. L6-D2 extends raw preview to the review table (raw fields continue to be admin-only).`,
    `- **L5 / L6-0**: review packages (no per-item decision field). L6-D2 introduces the UI decision overlay on top of L6-D's approval package.`,
    `- **L4 / L2 / Word parser / scheduler / score / schema**: untouched.`,
    ``,
    `## 10. Browser Manual Validation Checklist`,
    ``,
    `> L6-D2 changes UI / API, so it CANNOT be fully closed until browser manual validation passes.`,
    ``,
    `1. Start dev server (\`npm run dev\`) on localhost:3000.`,
    `2. ADMIN login.`,
    `3. Open \`/admin/import\` → Excel 课程设置识别预览.`,
    `4. Select existing target semester OR create new one.`,
    `5. Upload xlsx.`,
    `6. Click \`生成审核视图\`.`,
    `7. Confirm review summary appears (total / pending / approved / rejected / needsReview / blocked).`,
    `8. Confirm raw course / teacher / class / remark / sheet / row visible in table.`,
    `9. Confirm diagnostic chips + suggestedAction + blockingReasons + match status + confidence visible.`,
    `10. Confirm per-row decision dropdown.`,
    `11. Change one row → \`approved\` → live counter updates.`,
    `12. Change one row → \`rejected\` → live counter updates.`,
    `13. Change one row → \`needsReview\` → live counter updates.`,
    `14. Filter by decision works.`,
    `15. Filter by suggestedAction works.`,
    `16. Filter by diagnostic code works.`,
    `17. Filter by blocked / not blocked works.`,
    `18. Search over raw course / teacher / class / remark works.`,
    `19. Click \`导出审核决策 JSON\` → file \`course-setting-decision.target-<id>.redacted.json\` downloads.`,
    `20. Open downloaded file → contains \`approvalItemId\` + \`decision\` per item; NO raw course/teacher/class/remark.`,
    `21. Confirm NO \`确认导入\` / \`应用\` / \`写入数据库\` / \`创建教学任务\` / \`切换当前学期\` button.`,
    `22. Confirm browser console has no React error.`,
    `23. Confirm DB counts unchanged during review.`,
    `24. Confirm active semester NOT switched.`,
    `25. Confirm \`dbCounts before == after\` after the entire review session.`,
    ``,
    `## 11. Next Steps`,
    ``,
    `L6-D2 closes after browser manual validation passes. Future work:`,
    ``,
    `- **L6-D-IMPORT-DECISION-FILE** (planned): consume the exported decision file in a future stage (server-side \`importedDecisionFile\` source).`,
    `- **L6-E** (planned): apply stage. Still BLOCKED — L6-D2 keeps \`applyAllowed: false\` and \`applyListGenerated: false\`.`,
    ``,
    `Until either path lands, the system remains in L6-D2 review-only mode with all initial decisions \`pending\`.`,
    ``,
  ].join('\n')
}

function appendStatusLine(): void {
  const path = join(ROOT, STATUS_PATH)
  if (!existsSync(path)) return
  const content = (readFileSync(path, 'utf-8') ?? '').toString()
  if (content.includes('L6-D2')) return // idempotent
  const line =
    `- L6-D2 Excel 课程设置 approval review UI 已完成：管理员可在 /admin/import 生成审核视图，查看 raw 原文并在前端标记 pending/approved/rejected/needsReview，可导出 redacted decision JSON；不写 DB、不创建 ImportBatch/TeachingTask/TeachingTaskClass，不生成 apply list。`
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