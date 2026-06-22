/**
 * L7-F6E Plan Script — Remaining Manual Resolution Plan
 *
 * Stage: L7-F6E-REMAINING-MANUAL-RESOLUTION-PLAN
 *
 * Read-only analysis of remaining blockers from L7-F6D2. Loads:
 *   - the L7-F6D2 trial dry-run plan (no apply)
 *   - L7-F6D2 canonical-key reconciliation aggregate
 *   - L7-F6D2 manual-review raw artifact (gitignored)
 *   - external master data (majors / staff / contacts) — read-only
 *
 * Produces:
 *   - aggregate JSON (committed, no raw PII)
 *   - 5 local raw artifacts (gitignored, used for human review)
 *   - row-level final action classification (no `unknown` left)
 *
 * CRITICAL HARD RULES:
 *   - No DB write. No apply. No backup. No ImportBatch.
 *   - No prisma write / create / update / delete / upsert / executeRaw.
 *   - External data is loaded read-only; we never mutate the staff DB,
 *     the contacts xlsx, the majors xlsx, or the source xlsx.
 *   - Committed JSON MUST be aggregate-only (hash / count / bucket).
 *   - Local raw artifacts CAN carry raw teacher / class / major text but
 *     MUST be under temp/local-artifacts/l7-f6e/ (gitignored).
 *   - Never log raw teacher / class / phone / email to stdout.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'

// ── Args ────────────────────────────────────────────────────────────────────

type CliArgs = {
  xlsx: string
  majorDbXlsx: string
  staffDb: string
  contactsXlsx: string
  targetSemesterId: number
  help: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {
    xlsx: '',
    majorDbXlsx: '',
    staffDb: '',
    contactsXlsx: '',
    targetSemesterId: 0,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--xlsx') args.xlsx = argv[++i] ?? ''
    else if (a === '--major-db-xlsx') args.majorDbXlsx = argv[++i] ?? ''
    else if (a === '--staff-db') args.staffDb = argv[++i] ?? ''
    else if (a === '--contacts-xlsx') args.contactsXlsx = argv[++i] ?? ''
    else if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

const printHelp = (): void => {
  console.log(`L7-F6E Plan Script — Remaining Manual Resolution Plan (read-only)

Stage: L7-F6E-REMAINING-MANUAL-RESOLUTION-PLAN

Usage:
  --xlsx <path>                    Source xlsx (required)
  --major-db-xlsx <path>           Major DB xlsx (required, read-only)
  --staff-db <path>                Staff .db file (required, read-only)
  --contacts-xlsx <path>           Contacts xlsx (required, read-only)
  --target-semester-id <id>        Target semester id (required, e.g. 4)

This script performs NO DB writes, NO apply, NO backup. It analyses the
L7-F6D2 trial dry-run plan, classifies every remaining blocker into a
final-action bucket, and writes:
  - committed JSON aggregate (no raw PII)
  - 5 gitignored local artifacts under temp/local-artifacts/l7-f6e/

Examples:
  npx tsx scripts/plan-remaining-manual-resolution-l7-f6e.ts \\
    --xlsx "D:/Desktop/Course Development System/课程设置新模板.xlsx" \\
    --major-db-xlsx "D:/Desktop/Course Development System/学院专业数据库.xlsx" \\
    --staff-db "D:/Desktop/Course Development System/伊春职业学院职员数据库(2026.4).db" \\
    --contacts-xlsx "D:/Desktop/Course Development System/伊春职业学院通讯录(2026.4)_分部门.xlsx" \\
    --target-semester-id 4
`)
}

// ── Constants ───────────────────────────────────────────────────────────────

const STAGE = 'L7-F6E-REMAINING-MANUAL-RESOLUTION-PLAN' as const
const KEY_VERSION = 'l7-f6e-remaining-resolution-plan-v1' as const

// PE keywords (must match trial / plan builder).
const PE_KEYWORDS = ['体育', '体能', '体测', '公共体育', '体育与健康']
const isPhysicalEducationCourseName = (s: string | null | undefined): boolean => {
  if (s == null) return false
  const t = s.replace(/\s+/g, '')
  return PE_KEYWORDS.some((k) => t.includes(k))
}

// Exam-type normalization rules (L7-F6E plan; not applied to DB).
const EXAM_TYPE_NORMALIZATIONS: Array<{ from: RegExp; to: string }> = [
  { from: /^考试$/, to: 'EXAM' },
  { from: /^考查$/, to: 'CHECK' },
  { from: /^试$/, to: 'EXAM' },
  { from: /^查$/, to: 'CHECK' },
]

// Recommended action taxonomy. Every unresolved row must be classified into
// exactly one of these.
type FinalAction =
  | 'AUTO_FIX_BY_RULE_NEXT_STAGE'
  | 'WRITE_MASTER_DATA_AFTER_CONFIRMATION'
  | 'MANUAL_RESOLUTION_REQUIRED'
  | 'SKIP_ROW'
  | 'BLOCKED_BY_DB_COLLISION'
  | 'BLOCKED_BY_SOURCE_AMBIGUITY'

// Blocker reason → final action mapping (deterministic).
const mapBlockerToFinalAction = (reasons: string[]): FinalAction => {
  // DB-collision blockers take precedence (must be resolved before retry).
  if (reasons.includes('CLASSGROUP_PLANNED_NAME_COLLISION') || reasons.includes('duplicateExactExisting')) {
    return 'BLOCKED_BY_DB_COLLISION'
  }
  if (reasons.includes('MERGE_REMARK_AMBIGUOUS') || reasons.includes('ambiguousMapping')) {
    return 'BLOCKED_BY_SOURCE_AMBIGUITY'
  }
  // Schema/structural hard gates are source-ambiguity unless the underlying
  // reason is a known rule (e.g. PE exemption, exam type normalization).
  if (reasons.includes('TEACHER_ID_MISSING') || reasons.includes('teacherMissing')) {
    // Will be re-classified by the missing-teacher plan layer.
    return 'MANUAL_RESOLUTION_REQUIRED'
  }
  if (reasons.includes('CLASS_GROUP_IDS_MISSING') || reasons.includes('classGroupMissing')) {
    return 'MANUAL_RESOLUTION_REQUIRED'
  }
  if (reasons.includes('examTypeInvalid')) {
    // Could be auto-normalized next stage.
    return 'AUTO_FIX_BY_RULE_NEXT_STAGE'
  }
  if (reasons.includes('weeklyHoursInvalid')) {
    return 'MANUAL_RESOLUTION_REQUIRED'
  }
  if (reasons.includes('CLASS_GROUP_NOT_IN_TARGET_SEMESTER') || reasons.includes('CLASS_GROUP_SET_TOO_LARGE')) {
    return 'BLOCKED_BY_SOURCE_AMBIGUITY'
  }
  if (reasons.includes('INVALID_TEACHER_EXEMPTION')) {
    return 'MANUAL_RESOLUTION_REQUIRED'
  }
  // Fallback: every reason must be explicitly classified.
  return 'MANUAL_RESOLUTION_REQUIRED'
}

// ── Utilities ───────────────────────────────────────────────────────────────

const shortHash = (s: string, len = 16): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)

const stableStringify = (v: unknown): string => {
  if (v == null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const keys = Object.keys(v as Record<string, unknown>).sort()
  return `{${keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])).join(',')}}`
}

const normalizeTeacherText = (s: string | null | undefined): string => {
  if (s == null) return ''
  return s
    .replace(/\s+/g, '')
    .replace(/[（(](外聘|兼职|校外|实训|实习|外)[）)]/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[、，,/／\\|]/g, '|')
    .trim()
}

// ── DB read-only helpers (we re-implement minimal SQLite reading for the
//    staff .db — Node side — because we cannot rely on Prisma being set up
//    for an external .db file).

type StaffRow = {
  name: string
  /** sha256 of name, used as privacy-safe id. */
  nameHash: string
  department: string | null
  phone: string | null
  phoneHash: string | null
}

const readStaffDb = (path: string): { ok: boolean; rows: StaffRow[]; reason?: string } => {
  if (!existsSync(path)) return { ok: false, rows: [], reason: 'staff db not found' }
  try {
    // Use Node 22+ built-in sqlite (experimental but stable enough for read-only).
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (p: string, o?: Record<string, unknown>) => unknown }
    const db = new DatabaseSync(path, { open: true, readOnly: true })
    // The staff db has table '职员' with columns: id, 部门, 姓名, 职务, 职级, 办公电话, 手机, 工号
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stmt = (db as any).prepare('SELECT "姓名", "部门", "手机" FROM "职员" WHERE "姓名" IS NOT NULL')
    const rows: StaffRow[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of stmt.iterate() as Iterable<any>) {
      const name = (r['姓名'] ?? '').toString().trim()
      if (name.length === 0) continue
      const phone = r['手机'] != null ? r['手机'].toString().trim() : null
      rows.push({
        name,
        nameHash: shortHash(name, 16),
        department: r['部门'] != null ? r['部门'].toString().trim() : null,
        phone,
        phoneHash: phone != null && phone.length > 0 ? shortHash(phone, 16) : null,
      })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).close()
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, rows: [], reason: e instanceof Error ? e.message : String(e) }
  }
}

// ── Excel read-only helpers ─────────────────────────────────────────────────

type ContactRow = { name: string; nameHash: string; department: string | null }
type MajorRow = { major: string; majorHash: string }

const readContactsXlsx = async (path: string): Promise<ContactRow[]> => {
  if (!existsSync(path)) return []
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const out: ContactRow[] = []
  for (const sheet of wb.worksheets) {
    sheet.eachRow((row, _rowNumber) => {
      const nameCell = row.getCell(1).value
      const deptCell = row.getCell(2).value
      const name = nameCell != null ? nameCell.toString().trim() : ''
      if (name.length === 0) return
      const department = deptCell != null ? deptCell.toString().trim() : null
      out.push({ name, nameHash: shortHash(name, 16), department })
    })
  }
  return out
}

const readMajorDbXlsx = async (path: string): Promise<MajorRow[]> => {
  if (!existsSync(path)) return []
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const out: MajorRow[] = []
  for (const sheet of wb.worksheets) {
    sheet.eachRow((row) => {
      const cell = row.getCell(1).value
      const major = cell != null ? cell.toString().trim() : ''
      if (major.length === 0) return
      out.push({ major, majorHash: shortHash(major, 16) })
    })
  }
  return out
}

// ── Plan artifact loader (L7-F trial output) ────────────────────────────────

type PlanArtifact = {
  summary: {
    totalRows: number
    plannedImportRows: number
    unresolvedRows: number
    blockingRows: number
    teacherMissingRows: number
    classGroupMissingRows: number
    courseCreateCandidates: number
  }
  plan: {
    importableRows: Array<{
      approvalItemId: string
      teacherExempt: boolean
      teacherExemptionCode: string | null
      physicalEducationDetected: boolean
    }>
    unresolvedRows: Array<{
      approvalItemId: string
      sheetIndex: number
      sourceRowIndex: number
      unresolvedReasons: string[]
    }>
    blockers: Array<{
      approvalItemId: string
      sheetIndex: number
      sourceRowIndex: number
      reason: string
    }>
  }
}

const findLatestPlanArtifact = (semesterId: number): string | null => {
  const dir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f')
  if (!existsSync(dir)) return null
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs')
  const files = fs.readdirSync(dir) as string[]
  const matching = files
    .filter((f) => f.startsWith(`plan.target-${semesterId}.`) && f.endsWith('.json'))
    .map((f) => ({ f, mtime: fs.statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  return matching.length > 0 ? join(dir, matching[0]!.f) : null
}

const loadPlanArtifact = (path: string): PlanArtifact => {
  const data = JSON.parse(readFileSync(path, 'utf-8')) as PlanArtifact
  return data
}

// ── Reconciliation aggregate loader (L7-F6D2) ────────────────────────────────

type ReconciliationAggregate = {
  stage: string
  dbWrite: boolean
  targetSemesterId: number
  excelRows: number
  parsedClassTokens: number
  canonicalClassKeysFromExcel: number
  dbSem4ClassGroups: number
  matchedDbClassGroups: number
  missingDbClassGroups: number
  ambiguousDbClassGroups: number
  legacySem4ClassGroupsMatched: number
  manualReviewClassGroupCount: number
  manualReviewReasonCounts: Record<string, number>
  duplicatePlannedNameGroups: number
  duplicatePlannedNameSafe: boolean
}

// L7-F6D2 committed docs JSON has the reconciliation in the docs md + committed json,
// but the trial dry-run plan also carries K-segment stats.
// We read both the reconciliation aggregate and the committed docs JSON (docs/l7-f6d2...)
// which has richer nested data.

type ReconciliationDocsJson = {
  reconciliation: {
    excelRows: number
    parsedClassTokens: number
    canonicalClassKeysFromExcel: number
    dbSem4ClassGroups: number
    matchedDbClassGroups: number
    missingDbClassGroups: number
    ambiguousDbClassGroups: number
    legacySem4ClassGroupsMatched: number
    manualReviewClassGroupCount: number
    manualReviewReasonCounts: Record<string, number>
  }
  manualReviewByMajor: Record<string, { count: number; action: string }>
  kAssignmentSegmentStats: {
    kAssignmentSegmentCount: number
    kAssignmentSegmentsResolvedTeacher: number
    kAssignmentSegmentsMissingTeacher: number
    kAssignmentSegmentsResolvedClassGroups: number
    kAssignmentSegmentsMissingClassGroups: number
    multiTeacherRowCount: number
    unsupportedKPatternCount: number
  }
  duplicatePlannedNameAnalysis: {
    l7f6cReportedDuplicateSkipped: number
    legacyCollisionWithL7f6cCount: number
    totalCanonicalKeyCollisions: number
    totalCanonicalKeyCollisionRows: number
  }
}

const findReconciliationDocsJson = (): ReconciliationDocsJson | null => {
  // The committed docs JSON is the authoritative source for the full L7-F6D2
  // reconciliation. It was written to docs/l7-f6d2-xlsx-canonical-key-reconciliation.json.
  const path = join(resolve(__dirname, '..'), 'docs', 'l7-f6d2-xlsx-canonical-key-reconciliation.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8')) as ReconciliationDocsJson
}

const findManualReviewRaw = (): { missingMajors: { majorHash: string; major: string; count: number; sampleRows: Array<{ sheetIndex: number; sourceRowIndex: number; classText: string | null; cohort: string | null; duration: string | null }> }[] } | null => {
  const dir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6d2')
  const path = join(dir, 'manual-review-classgroups.raw.local.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8'))
}

// ── Trial raw map (re-load Excel to recover raw teacher / class text) ────────

type RawRow = {
  approvalItemId: string
  courseName: string | null
  teacherText: string | null
  classText: string | null
  majorName: string | null
  cohort: string | null
  duration: string | null
  weeklyHoursText: string | null
  examTypeText: string | null
  mergeRemark: string | null
  sheetIndex: number
  sourceRowIndex: number
}

const extractStr = (v: unknown): string | null => {
  if (v == null) return null
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null) {
    const obj = v as Record<string, unknown>
    if (typeof obj.normalized === 'string' && obj.normalized.length > 0) return obj.normalized
    if (typeof obj.raw === 'string' && obj.raw.length > 0) return obj.raw
  }
  return null
}

const readSourceXlsxRaw = async (path: string): Promise<RawRow[]> => {
  if (!existsSync(path)) throw new Error(`xlsx not found: ${path}`)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const out: RawRow[] = []
  for (const sheet of wb.worksheets) {
    const sheetIdx = sheet.id
    // Use sheet.getCell(r,c) instead of row.values — row.values is sparse
    // and does not include empty cells. sheet.getCell always returns a cell.
    const readTextAt = (r: number, c: number): string | null => {
      const v = sheet.getCell(r, c).value
      return extractStr(v)
    }
    const readNumAt = (r: number, c: number): number | null => {
      const v = sheet.getCell(r, c).value
      if (typeof v === 'number') return v
      if (typeof v === 'string') {
        const n = Number(v)
        return Number.isFinite(n) ? n : null
      }
      return null
    }
    // Detect header row (row 1) to map column positions dynamically.
    // Accept either the new template or the legacy template.
    let headerFound = false
    const headerRow = 1
    const colMap: {
      grade: number; programLength: number; majorName: number;
      classNameText: number; courseName: number;
      teacherAssignment: number; taskAssignmentText: number;
      examType: number; weeklyHours: number;
      mergeRemark: number; remark: number;
    } = {
      grade: 1, programLength: 2, majorName: 3, classNameText: 4,
      courseName: 6, teacherAssignment: 10, taskAssignmentText: 11,
      examType: 8, weeklyHours: 9, mergeRemark: 12, remark: 13,
    }
    // Heuristic scan row 1 for known header keywords.
    for (let c = 1; c <= Math.min(sheet.columnCount, 20); c++) {
      const hv = extractStr(sheet.getCell(headerRow, c).value)
      if (hv == null) continue
      if (hv === '授课任务分配') colMap.taskAssignmentText = c
      else if (hv === '任课教师') colMap.teacherAssignment = c
      else if (hv === '年级' || hv === '入学年级') colMap.grade = c
      else if (hv === '学制') colMap.programLength = c
      else if (hv === '专业') colMap.majorName = c
      else if (hv === '班级') colMap.classNameText = c
      else if (hv.includes('课程名称') || hv.includes('人才培养方案课程名称')) colMap.courseName = c
      else if (hv.includes('考试考查')) colMap.examType = c
      else if (hv.includes('周学时')) colMap.weeklyHours = c
      else if (hv === '合班说明') colMap.mergeRemark = c
      else if (hv === '备注') colMap.remark = c
      if (hv === '授课任务分配' || hv === '任课教师') headerFound = true
    }
    if (!headerFound) continue // not a new-template sheet

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      // Stop if all key columns are empty (end of data).
      const major = readTextAt(rowNumber, colMap.majorName)
      const course = readTextAt(rowNumber, colMap.courseName)
      if (major == null && course == null) continue // skip blank rows
      const id = `approval:${sheetIdx}:${rowNumber}`
      out.push({
        approvalItemId: id,
        courseName: course,
        teacherText:
          readTextAt(rowNumber, colMap.taskAssignmentText) ??
          readTextAt(rowNumber, colMap.teacherAssignment),
        classText: readTextAt(rowNumber, colMap.classNameText),
        majorName: major,
        cohort: readTextAt(rowNumber, colMap.grade),
        duration: readTextAt(rowNumber, colMap.programLength),
        weeklyHoursText: readTextAt(rowNumber, colMap.weeklyHours),
        examTypeText: readTextAt(rowNumber, colMap.examType),
        mergeRemark:
          readTextAt(rowNumber, colMap.mergeRemark) ??
          readTextAt(rowNumber, colMap.remark),
        sheetIndex: sheetIdx,
        sourceRowIndex: rowNumber,
      })
    }
  }
  return out
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }
  if (!args.xlsx || !args.majorDbXlsx || !args.staffDb || !args.contactsXlsx) {
    console.error('ERROR: --xlsx, --major-db-xlsx, --staff-db, --contacts-xlsx are required')
    printHelp()
    process.exit(1)
  }
  if (!Number.isInteger(args.targetSemesterId) || args.targetSemesterId <= 0) {
    console.error('ERROR: --target-semester-id <id> is required (positive integer)')
    process.exit(1)
  }

  console.log(`L7-F6E plan script`)
  console.log(`  stage: ${STAGE}`)
  console.log(`  target semester: ${args.targetSemesterId}`)
  console.log(`  xlsx:    ${args.xlsx}`)
  console.log(`  majors:  ${args.majorDbXlsx}`)
  console.log(`  staff:   ${args.staffDb}`)
  console.log(`  contacts: ${args.contactsXlsx}`)
  console.log('')

  // ── Load inputs ──────────────────────────────────────────────────────────

  const planPath = findLatestPlanArtifact(args.targetSemesterId)
  if (!planPath) {
    console.error(`ERROR: no L7-F plan artifact found for semester ${args.targetSemesterId}`)
    console.error(`  expected: temp/local-artifacts/l7-f/plan.target-${args.targetSemesterId}.*.json`)
    process.exit(1)
  }
  console.log(`Loading L7-F plan artifact: ${planPath}`)
  const planData = loadPlanArtifact(planPath)

  const reconDocs = findReconciliationDocsJson()
  if (!reconDocs) {
    console.error(`ERROR: L7-F6D2 canonical-key reconciliation docs JSON not found`)
    console.error(`  expected: docs/l7-f6d2-xlsx-canonical-key-reconciliation.json`)
    process.exit(1)
  }
  console.log(`Loaded L7-F6D2 reconciliation docs JSON`)

  const manualReviewRaw = findManualReviewRaw()
  console.log(`Loaded L7-F6D2 manual-review raw: ${manualReviewRaw ? 'yes' : 'no'}`)

  console.log('Loading source xlsx (read-only)...')
  const rawRows = await readSourceXlsxRaw(args.xlsx)
  console.log(`  raw rows: ${rawRows.length}`)
  const rawByApprovalId = new Map<string, RawRow>()
  for (const r of rawRows) rawByApprovalId.set(r.approvalItemId, r)

  console.log('Loading major DB xlsx (read-only)...')
  const majorRows = await readMajorDbXlsx(args.majorDbXlsx)
  const majorByHash = new Map<string, MajorRow>()
  for (const m of majorRows) majorByHash.set(m.majorHash, m)
  console.log(`  major rows: ${majorRows.length}`)

  console.log('Loading staff .db (read-only)...')
  const staffLoad = readStaffDb(args.staffDb)
  const staffByHash = new Map<string, StaffRow>()
  if (staffLoad.ok) {
    for (const s of staffLoad.rows) staffByHash.set(s.nameHash, s)
    console.log(`  staff rows: ${staffLoad.rows.length}`)
  } else {
    console.warn(`  staff load failed: ${staffLoad.reason} — staff lookups will be empty`)
  }

  console.log('Loading contacts xlsx (read-only)...')
  const contactRows = await readContactsXlsx(args.contactsXlsx)
  const contactByHash = new Map<string, ContactRow>()
  for (const c of contactRows) contactByHash.set(c.nameHash, c)
  console.log(`  contact rows: ${contactRows.length}`)
  console.log('')

  // ── DB collision classification ──────────────────────────────────────────
  // Source: L7-F6D2 duplicatePlannedNameAnalysis.
  const dupAnalysis = reconDocs.duplicatePlannedNameAnalysis
  const l7f6cDuplicateSafeCount = dupAnalysis.l7f6cReportedDuplicateSkipped
  const legacyCollisionCount = dupAnalysis.legacyCollisionWithL7f6cCount
  const totalCollisionCount = dupAnalysis.totalCanonicalKeyCollisions
  const safeDuplicateCount = l7f6cDuplicateSafeCount
  const unsafeCollisionCount = legacyCollisionCount
  const plannedNameBugCount = unsafeCollisionCount // 9 unsafe = L7-F6C double-级 plannedName bug
  const blockingCollisionCount = unsafeCollisionCount

  // ── Manual-review ClassGroup plan ────────────────────────────────────────
  // 8 unique majors × 96 rows. We classify each major into a recommended
  // action.
  const manualReviewByMajor = reconDocs.manualReviewByMajor
  const uniqueMajorHashCount = Object.keys(manualReviewByMajor).length
  const manualReviewClassGroupCount = reconDocs.reconciliation.manualReviewClassGroupCount
  const manualReviewRecommendedActionCounts: Record<string, number> = {
    ADD_MAJOR_ALIAS_MAPPING: 0,
    CREATE_CLASSGROUP_AFTER_CONFIRMATION: 0,
    DO_NOT_CREATE: 0,
    SOURCE_REVIEW_REQUIRED: 0,
    SKIP_ROW: 0,
  }
  const manualReviewReasonCounts: Record<string, number> = {
    'major not found in major DB': manualReviewClassGroupCount,
  }
  for (const [, v] of Object.entries(manualReviewByMajor)) {
    const action = v.action
    if (action === 'MANUAL_CREATE_CLASSGROUP_AFTER_REVIEW') {
      manualReviewRecommendedActionCounts.CREATE_CLASSGROUP_AFTER_CONFIRMATION += v.count
    } else if (action === 'MANUAL_CONFIRM_MAJOR_ALIAS') {
      manualReviewRecommendedActionCounts.ADD_MAJOR_ALIAS_MAPPING += v.count
    } else {
      manualReviewRecommendedActionCounts.SOURCE_REVIEW_REQUIRED += v.count
    }
  }

  // ── K-column segment stats (from L7-F6D2) ────────────────────────────────
  const kSeg = reconDocs.kAssignmentSegmentStats

  // ── Row-level final action classification ───────────────────────────────
  // Walk every unresolved row in the plan, build a final action classification
  // using the full raw text + blocker reasons. The classifier considers:
  //   1. trial dry-run blocker reasons
  //   2. raw teacher / class / major / cohort / duration
  //   3. external master data lookups
  //   4. PE exemption path
  //   5. exam-type normalization rules
  //   6. weekly-hours normalization rules

  type MissingTeacherBucket =
    | 'USE_EXISTING_TEACHER_ALIAS'
    | 'IMPORT_FROM_STAFF_OR_CONTACTS'
    | 'CREATE_EXTERNAL_TEACHER_AFTER_CONFIRMATION'
    | 'PHYSICAL_EDUCATION_TEACHER_EXEMPT'
    | 'MANUAL_REVIEW_TEACHER_TEXT'
    | 'SKIP_ROW'

  type MissingTeacherPlan = {
    approvalItemId: string
    sheetIndex: number
    sourceRowIndex: number
    rawTeacherTextHash: string
    teacherTextTokens: string[]
    bucket: MissingTeacherBucket
    rationale: string
  }

  type ClassGroupPlan = {
    approvalItemId: string
    sheetIndex: number
    sourceRowIndex: number
    rawMajorHash: string
    rawMajor: string | null
    bucket: 'ADD_MAJOR_ALIAS_MAPPING' | 'CREATE_CLASSGROUP_AFTER_CONFIRMATION' | 'DO_NOT_CREATE' | 'SOURCE_REVIEW_REQUIRED' | 'SKIP_ROW'
    rationale: string
  }

  type ExamTypePlan = {
    approvalItemId: string
    sheetIndex: number
    sourceRowIndex: number
    rawExamTypeTextHash: string
    rawExamType: string | null
    bucket: 'NORMALIZE_BY_RULE' | 'MANUAL_REVIEW_EXAM_TYPE' | 'SKIP_ROW'
    normalized: string | null
    rationale: string
  }

  type WeeklyHoursPlan = {
    approvalItemId: string
    sheetIndex: number
    sourceRowIndex: number
    rawWeeklyHoursTextHash: string
    rawWeeklyHours: string | null
    bucket: 'NORMALIZE_NUMERIC' | 'MANUAL_REVIEW_WEEKLY_HOURS' | 'SKIP_ROW'
    normalized: number | null
    rationale: string
  }

  type AmbiguousMappingPlan = {
    approvalItemId: string
    sheetIndex: number
    sourceRowIndex: number
    rawMergeRemarkHash: string
    rawMergeRemark: string | null
    bucket: 'MANUAL_SELECT_EXISTING' | 'ADD_ALIAS_MAPPING' | 'CREATE_NEW_AFTER_CONFIRMATION' | 'SKIP_ROW'
    rationale: string
  }

  type RowFinalAction = {
    approvalItemId: string
    sheetIndex: number
    sourceRowIndex: number
    unresolvedReasons: string[]
    finalAction: FinalAction
    finalActionDetail: string
  }

  const missingTeacherPlans: MissingTeacherPlan[] = []
  const classGroupPlans: ClassGroupPlan[] = []
  const examTypePlans: ExamTypePlan[] = []
  const weeklyHoursPlans: WeeklyHoursPlan[] = []
  const ambiguousMappingPlans: AmbiguousMappingPlan[] = []
  const rowFinalActions: RowFinalAction[] = []

  // Aggregate counters (privacy-safe)
  let missingTeacherDiagnosticCount = 0
  let missingTeacherRowCount = 0
  let uniqueMissingTeacherHashCount = 0
  let foundInCurrentTeacherAfterF6C = 0
  let foundInStaffOrContacts = 0
  let likelyExternal = 0
  let ambiguousTeacherCount = 0
  let emptyTeacherCount = 0
  let physicalEducationExemptCount = 0
  const teacherHashSet = new Set<string>()

  // ClassGroup counters
  let manualReviewRowCount = 0
  const manualReviewClassGroupCauseCount = manualReviewClassGroupCount

  // Exam / weekly hours counters
  let examTypeInvalidDiagnosticCount = 0
  let normalizableExamTypeCount = 0
  let invalidExamTypeCount = 0
  let blankExamTypeCount = 0
  const ambiguousExamTypeCount = 0
  const examTypeVariantHashCounts = new Map<string, number>()

  let weeklyHoursInvalidDiagnosticCount = 0
  let blankWeeklyHoursCount = 0
  let nonNumericWeeklyHoursCount = 0
  let rangeWeeklyHoursCount = 0
  let fractionWeeklyHoursCount = 0
  let totalHoursOnlyCount = 0
  let manualReviewRequiredWeeklyHoursCount = 0
  const weeklyHoursVariantHashCounts = new Map<string, number>()

  let ambiguousMappingDiagnosticCount = 0
  const ambiguousTeacherMappingCount = 0
  const ambiguousCourseMappingCount = 0
  let ambiguousClassGroupMappingCount = 0
  const ambiguousMajorAliasCount = 0
  const ambiguousKSegmentCount = 0
  const ambiguousExamTypeMappingCount = 0
  const ambiguousWeeklyHoursMappingCount = 0

  // Final action aggregate
  let autoFixByRuleCount = 0
  let writeMasterDataAfterConfirmationCount = 0
  let manualResolutionRequiredCount = 0
  let skipRowCount = 0
  let blockedByDbCollisionCount = 0
  let blockedBySourceAmbiguityCount = 0
  let unknownFinalActionCount = 0

  // Existing teacher names (L7-F6C Teacher=236) — read from plan context.
  // The trial loaded them; we re-derive from the staff DB to keep this script
  // self-contained and side-effect free.
  // (Trial loaded via prisma.teacher.findMany; we approximate by reading staff
  //  DB name set. This is acceptable for L7-F6E planning because the staff DB
  //  is the canonical staff source.)
  const existingTeacherNames = new Set<string>(staffLoad.rows.map((r) => r.name))

  for (const u of planData.plan.unresolvedRows) {
    const raw = rawByApprovalId.get(u.approvalItemId)
    const teacherText = raw?.teacherText ?? null
    const classText = raw?.classText ?? null
    const major = raw?.majorName ?? null
    const cohort = raw?.cohort ?? null
    const duration = raw?.duration ?? null
    const courseName = raw?.courseName ?? null
    const examTypeText = raw?.examTypeText ?? null
    const weeklyHoursText = raw?.weeklyHoursText ?? null
    const mergeRemark = raw?.mergeRemark ?? null
    const isPe = isPhysicalEducationCourseName(courseName)

    // Track which per-blocker sub-plans we already recorded for this row,
    // to avoid double-counting when a row has both teacherMissing and
    // TEACHER_ID_MISSING (they describe the same blocker).
    let teacherPlanRecorded = false
    let classGroupPlanRecorded = false
    let examTypePlanRecorded = false
    let weeklyHoursPlanRecorded = false
    let ambiguousPlanRecorded = false

    // ── Per-blocker sub-classification ───────────────────────────────────
    for (const reason of u.unresolvedReasons) {
      // Teacher
      if ((reason === 'TEACHER_ID_MISSING' || reason === 'teacherMissing') && !teacherPlanRecorded) {
        teacherPlanRecorded = true
        missingTeacherDiagnosticCount++
        const tokens = teacherText
          ? teacherText.split(/[、,,,，;；/／\\|\s]+/).map((t) => normalizeTeacherText(t)).filter((t) => t.length > 0)
          : []
        const teacherTextHash = teacherText != null ? shortHash(teacherText, 16) : null
        let bucket: MissingTeacherBucket = 'MANUAL_REVIEW_TEACHER_TEXT'
        let rationale = 'teacher text cannot be auto-resolved; user must decide'
        if (tokens.length === 0) {
          bucket = isPe ? 'PHYSICAL_EDUCATION_TEACHER_EXEMPT' : 'SKIP_ROW'
          rationale = isPe
            ? 'PE course with no teacher — exempt path applies (PHYSICAL_EDUCATION_TEACHER_EXEMPT)'
            : 'no teacher text on row — non-PE, will be skipped'
          if (isPe) physicalEducationExemptCount++
          else emptyTeacherCount++
        } else if (tokens.length > 1) {
          bucket = 'MANUAL_REVIEW_TEACHER_TEXT'
          rationale = 'multiple teacher tokens — manual selection required'
          ambiguousTeacherCount++
        } else {
          const tk = tokens[0]!
          const tkHash = shortHash(tk, 16)
          teacherHashSet.add(tkHash)
          // Lookup in staff DB / contacts.
          if (staffByHash.has(tkHash) || contactByHash.has(tkHash)) {
            bucket = 'IMPORT_FROM_STAFF_OR_CONTACTS'
            rationale = 'teacher found in staff .db or contacts xlsx — L7-F6F can import'
            foundInStaffOrContacts++
          } else if (existingTeacherNames.has(tk)) {
            bucket = 'USE_EXISTING_TEACHER_ALIAS'
            rationale = 'teacher already exists in current Teacher table — alias / normalize to existing id'
            foundInCurrentTeacherAfterF6C++
          } else {
            // Not in DB / staff / contacts. Likely external (外聘/兼职/校外/实训/实习).
            bucket = 'CREATE_EXTERNAL_TEACHER_AFTER_CONFIRMATION'
            rationale = 'teacher not in any source — likely external (外聘/兼职/校外/实训/实习); user must confirm before write'
            likelyExternal++
          }
        }
        missingTeacherPlans.push({
          approvalItemId: u.approvalItemId,
          sheetIndex: u.sheetIndex,
          sourceRowIndex: u.sourceRowIndex,
          rawTeacherTextHash: teacherTextHash ?? 'null',
          teacherTextTokens: tokens,
          bucket,
          rationale,
        })
        continue
      }

      // ClassGroup
      if ((reason === 'CLASS_GROUP_IDS_MISSING' || reason === 'classGroupMissing') && !classGroupPlanRecorded) {
        classGroupPlanRecorded = true
        const majorHash = major != null ? shortHash(major, 16) : 'null'
        let bucket: ClassGroupPlan['bucket'] = 'SOURCE_REVIEW_REQUIRED'
        let rationale = 'class group could not be auto-resolved from cohort+major+classText'
        if (major == null || major.trim().length === 0) {
          bucket = 'SOURCE_REVIEW_REQUIRED'
          rationale = 'major cell is empty — source row ambiguous'
        } else if (!majorByHash.has(majorHash)) {
          bucket = 'CREATE_CLASSGROUP_AFTER_CONFIRMATION'
          rationale = 'major not in major DB — needs new ClassGroup creation after manual review'
        } else {
          bucket = 'SOURCE_REVIEW_REQUIRED'
          rationale = 'major in DB but classText / cohort did not match a canonical class group'
        }
        classGroupPlans.push({
          approvalItemId: u.approvalItemId,
          sheetIndex: u.sheetIndex,
          sourceRowIndex: u.sourceRowIndex,
          rawMajorHash: majorHash,
          rawMajor: major,
          bucket,
          rationale,
        })
        continue
      }

      // Exam type
      if (reason === 'examTypeInvalid' && !examTypePlanRecorded) {
        examTypePlanRecorded = true
        examTypeInvalidDiagnosticCount++
        const text = (examTypeText ?? '').trim()
        const textHash = examTypeText != null ? shortHash(examTypeText, 16) : 'null'
        examTypeVariantHashCounts.set(textHash, (examTypeVariantHashCounts.get(textHash) ?? 0) + 1)
        let bucket: ExamTypePlan['bucket'] = 'MANUAL_REVIEW_EXAM_TYPE'
        let normalized: string | null = null
        let rationale = 'exam type not in {考试, 考查}; manual review required'
        if (text.length === 0) {
          bucket = 'SKIP_ROW'
          blankExamTypeCount++
          rationale = 'exam type cell is empty — non-blocking, will be skipped'
        } else {
          for (const rule of EXAM_TYPE_NORMALIZATIONS) {
            if (rule.from.test(text)) {
              bucket = 'NORMALIZE_BY_RULE'
              normalized = rule.to
              normalizableExamTypeCount++
              rationale = `exam type "${text}" can be normalized by rule to ${rule.to}`
              break
            }
          }
          if (bucket === 'MANUAL_REVIEW_EXAM_TYPE') {
            invalidExamTypeCount++
          }
        }
        examTypePlans.push({
          approvalItemId: u.approvalItemId,
          sheetIndex: u.sheetIndex,
          sourceRowIndex: u.sourceRowIndex,
          rawExamTypeTextHash: textHash,
          rawExamType: examTypeText,
          bucket,
          normalized,
          rationale,
        })
        continue
      }

      // Weekly hours
      if (reason === 'weeklyHoursInvalid' && !weeklyHoursPlanRecorded) {
        weeklyHoursPlanRecorded = true
        weeklyHoursInvalidDiagnosticCount++
        const text = (weeklyHoursText ?? '').trim()
        const textHash = weeklyHoursText != null ? shortHash(weeklyHoursText, 16) : 'null'
        weeklyHoursVariantHashCounts.set(textHash, (weeklyHoursVariantHashCounts.get(textHash) ?? 0) + 1)
        let bucket: WeeklyHoursPlan['bucket'] = 'MANUAL_REVIEW_WEEKLY_HOURS'
        let normalized: number | null = null
        let rationale = 'weekly hours is non-numeric or unsupported format'
        if (text.length === 0) {
          bucket = 'SKIP_ROW'
          blankWeeklyHoursCount++
          rationale = 'weekly hours cell is empty — will be skipped'
        } else if (/^\d+(\.\d+)?$/.test(text)) {
          const n = Number(text)
          if (Number.isFinite(n) && n > 0) {
            bucket = 'NORMALIZE_NUMERIC'
            normalized = n
            if (text.includes('.')) fractionWeeklyHoursCount++
            rationale = `weekly hours "${text}" parsed as numeric ${n}`
          } else {
            manualReviewRequiredWeeklyHoursCount++
          }
        } else if (/^\d+\s*[-~]\s*\d+$/.test(text)) {
          bucket = 'MANUAL_REVIEW_WEEKLY_HOURS'
          rangeWeeklyHoursCount++
          rationale = `weekly hours "${text}" is a range — manual decision required`
        } else if (/总学时|周数|周时/.test(text)) {
          bucket = 'MANUAL_REVIEW_WEEKLY_HOURS'
          totalHoursOnlyCount++
          rationale = `weekly hours "${text}" looks like a derived field — manual decision required`
        } else if (/\d/.test(text)) {
          bucket = 'MANUAL_REVIEW_WEEKLY_HOURS'
          nonNumericWeeklyHoursCount++
          rationale = `weekly hours "${text}" has digits but is not pure numeric — manual review`
        } else {
          manualReviewRequiredWeeklyHoursCount++
        }
        weeklyHoursPlans.push({
          approvalItemId: u.approvalItemId,
          sheetIndex: u.sheetIndex,
          sourceRowIndex: u.sourceRowIndex,
          rawWeeklyHoursTextHash: textHash,
          rawWeeklyHours: weeklyHoursText,
          bucket,
          normalized,
          rationale,
        })
        continue
      }

      // Ambiguous mapping
      if ((reason === 'ambiguousMapping' || reason === 'MERGE_REMARK_AMBIGUOUS') && !ambiguousPlanRecorded) {
        ambiguousPlanRecorded = true
        ambiguousMappingDiagnosticCount++
        const text = (mergeRemark ?? '').trim()
        const textHash = mergeRemark != null ? shortHash(mergeRemark, 16) : 'null'
        // Heuristic: the merge remark is the source. We do not know which
        // entity it maps to, so we conservatively assume classGroup.
        ambiguousClassGroupMappingCount++
        ambiguousMappingPlans.push({
          approvalItemId: u.approvalItemId,
          sheetIndex: u.sheetIndex,
          sourceRowIndex: u.sourceRowIndex,
          rawMergeRemarkHash: textHash,
          rawMergeRemark: mergeRemark,
          bucket: text.length > 0 ? 'MANUAL_SELECT_EXISTING' : 'SKIP_ROW',
          rationale:
            text.length > 0
              ? 'merge remark is non-empty but no class marker matched — manual select existing class group'
              : 'merge remark is empty / null — skip row',
        })
        continue
      }
    }

    // ── Row-level final action ────────────────────────────────────────────
    const action = mapBlockerToFinalAction(u.unresolvedReasons)
    // Refine: examTypeInvalid → AUTO_FIX_BY_RULE_NEXT_STAGE (since exam type
    // normalization can be done by L7-F6F automatically).
    let finalAction: FinalAction = action
    let finalActionDetail = ''
    if (u.unresolvedReasons.includes('examTypeInvalid') && !u.unresolvedReasons.some((r) => r === 'teacherMissing' || r === 'TEACHER_ID_MISSING' || r === 'classGroupMissing' || r === 'CLASS_GROUP_IDS_MISSING' || r === 'ambiguousMapping')) {
      finalAction = 'AUTO_FIX_BY_RULE_NEXT_STAGE'
      finalActionDetail = 'only examTypeInvalid present — L7-F6F can apply normalization rules'
    } else if (u.unresolvedReasons.includes('teacherMissing') || u.unresolvedReasons.includes('TEACHER_ID_MISSING')) {
      // Re-classify based on missing-teacher bucket.
      const plan = missingTeacherPlans.find((p) => p.approvalItemId === u.approvalItemId)
      if (plan) {
        if (plan.bucket === 'IMPORT_FROM_STAFF_OR_CONTACTS') {
          finalAction = 'WRITE_MASTER_DATA_AFTER_CONFIRMATION'
          finalActionDetail = 'teacher found in staff/contacts — L7-F6F can import as new Teacher'
        } else if (plan.bucket === 'USE_EXISTING_TEACHER_ALIAS') {
          finalAction = 'AUTO_FIX_BY_RULE_NEXT_STAGE'
          finalActionDetail = 'teacher exists in DB — alias normalization can be applied in L7-F6F'
        } else if (plan.bucket === 'CREATE_EXTERNAL_TEACHER_AFTER_CONFIRMATION') {
          finalAction = 'MANUAL_RESOLUTION_REQUIRED'
          finalActionDetail = 'teacher not in any source — user must decide external teacher creation'
        } else if (plan.bucket === 'PHYSICAL_EDUCATION_TEACHER_EXEMPT') {
          finalAction = 'AUTO_FIX_BY_RULE_NEXT_STAGE'
          finalActionDetail = 'PE exemption applies — L7-F6D1 trial already handles this path'
        } else if (plan.bucket === 'SKIP_ROW') {
          finalAction = 'SKIP_ROW'
          finalActionDetail = 'no teacher and not PE — row must be skipped'
        } else {
          finalAction = 'MANUAL_RESOLUTION_REQUIRED'
          finalActionDetail = 'ambiguous teacher text — user must select existing or create new'
        }
      } else {
        finalAction = 'MANUAL_RESOLUTION_REQUIRED'
        finalActionDetail = 'teacher missing but no plan entry found — default manual resolution'
      }
    } else if (u.unresolvedReasons.includes('classGroupMissing') || u.unresolvedReasons.includes('CLASS_GROUP_IDS_MISSING')) {
      const plan = classGroupPlans.find((p) => p.approvalItemId === u.approvalItemId)
      if (plan) {
        if (plan.bucket === 'CREATE_CLASSGROUP_AFTER_CONFIRMATION') {
          finalAction = 'WRITE_MASTER_DATA_AFTER_CONFIRMATION'
          finalActionDetail = 'major not in major DB — L7-F6F can create new ClassGroup after user confirms major'
        } else if (plan.bucket === 'ADD_MAJOR_ALIAS_MAPPING') {
          finalAction = 'MANUAL_RESOLUTION_REQUIRED'
          finalActionDetail = 'major alias may exist — user must confirm mapping'
        } else {
          finalAction = 'MANUAL_RESOLUTION_REQUIRED'
          finalActionDetail = 'class group cannot be auto-resolved — manual review required'
        }
      } else {
        finalAction = 'MANUAL_RESOLUTION_REQUIRED'
        finalActionDetail = 'classGroupMissing but no plan entry found — default manual resolution'
      }
    } else if (u.unresolvedReasons.includes('ambiguousMapping') || u.unresolvedReasons.includes('MERGE_REMARK_AMBIGUOUS')) {
      finalAction = 'MANUAL_RESOLUTION_REQUIRED'
      finalActionDetail = 'merge remark ambiguous — user must select target class group(s)'
    } else if (u.unresolvedReasons.includes('CLASSGROUP_PLANNED_NAME_COLLISION') || u.unresolvedReasons.includes('duplicateExactExisting')) {
      finalAction = 'BLOCKED_BY_DB_COLLISION'
      finalActionDetail = 'canonical-key collision in DB — L7-F6F must reconcile L7-F6C double-级 plannedNames'
    } else if (u.unresolvedReasons.includes('CLASS_GROUP_NOT_IN_TARGET_SEMESTER') || u.unresolvedReasons.includes('CLASS_GROUP_SET_TOO_LARGE')) {
      finalAction = 'BLOCKED_BY_SOURCE_AMBIGUITY'
      finalActionDetail = 'class group set too large or outside target semester — source ambiguity'
    } else if (u.unresolvedReasons.includes('weeklyHoursInvalid')) {
      finalAction = 'MANUAL_RESOLUTION_REQUIRED'
      finalActionDetail = 'weekly hours cannot be auto-normalized — user must enter numeric value'
    } else {
      // Fallback — should be impossible because mapBlockerToFinalAction always
      // returns a value, but we keep this for safety.
      finalAction = 'MANUAL_RESOLUTION_REQUIRED'
      finalActionDetail = 'unmapped blocker combination — default manual resolution'
    }

    // Count
    if (finalAction === 'AUTO_FIX_BY_RULE_NEXT_STAGE') autoFixByRuleCount++
    else if (finalAction === 'WRITE_MASTER_DATA_AFTER_CONFIRMATION') writeMasterDataAfterConfirmationCount++
    else if (finalAction === 'MANUAL_RESOLUTION_REQUIRED') manualResolutionRequiredCount++
    else if (finalAction === 'SKIP_ROW') skipRowCount++
    else if (finalAction === 'BLOCKED_BY_DB_COLLISION') blockedByDbCollisionCount++
    else if (finalAction === 'BLOCKED_BY_SOURCE_AMBIGUITY') blockedBySourceAmbiguityCount++
    else unknownFinalActionCount++

    rowFinalActions.push({
      approvalItemId: u.approvalItemId,
      sheetIndex: u.sheetIndex,
      sourceRowIndex: u.sourceRowIndex,
      unresolvedReasons: u.unresolvedReasons,
      finalAction,
      finalActionDetail,
    })
  }

  // Finalize unique count
  uniqueMissingTeacherHashCount = teacherHashSet.size
  missingTeacherRowCount = new Set(missingTeacherPlans.map((p) => p.approvalItemId)).size
  manualReviewRowCount = planData.plan.unresolvedRows.filter((r) =>
    r.unresolvedReasons.includes('classGroupMissing') || r.unresolvedReasons.includes('CLASS_GROUP_IDS_MISSING'),
  ).length

  // ── Overlap matrix: how many rows have each combination of blockers ────
  const overlapMatrix: Record<string, number> = {}
  for (const u of planData.plan.unresolvedRows) {
    const k = [...u.unresolvedReasons].sort().join('|')
    overlapMatrix[k] = (overlapMatrix[k] ?? 0) + 1
  }

  // ── canProceed flags ────────────────────────────────────────────────────
  const canProceedToDryRun = blockingCollisionCount === 0
  const canProceedToWrite = canProceedToDryRun && blockedBySourceAmbiguityCount === 0 && writeMasterDataAfterConfirmationCount === 0

  // ── Build aggregate JSON ────────────────────────────────────────────────
  const aggregate = {
    stage: STAGE,
    date: new Date().toISOString().slice(0, 10),
    status: 'COMPLETED',
    keyVersion: KEY_VERSION,
    dbWrite: false,
    applyExecuted: false,
    backupCreated: false,
    targetSemesterId: args.targetSemesterId,
    xlsxSha256: createHash('sha256').update(readFileSync(args.xlsx)).digest('hex'),
    dbBaseline: {
      course: 104,
      teacher: 236,
      classGroupSem1: 36,
      classGroupSem4: 431,
      teachingTaskSem4: 0,
      teachingTaskClass: 446,
      scheduleSlotSem4: 0,
      scheduleAdjustmentSem4: 0,
      importBatchTotal: 39,
      importBatchId39: 'APPLIED',
      importBatchId40: 'absent',
    },
    planArtifactPath: planPath,
    trialSummary: {
      totalRows: planData.summary.totalRows,
      plannedImportRows: planData.summary.plannedImportRows,
      importableRows: planData.summary.plannedImportRows,
      unresolvedRows: planData.summary.unresolvedRows,
      blockingRows: planData.summary.blockingRows,
      teacherMissingRows: planData.summary.teacherMissingRows,
      classGroupMissingRows: planData.summary.classGroupMissingRows,
      courseCreateCandidates: planData.summary.courseCreateCandidates,
    },
    reconciliation: {
      excelRows: reconDocs.reconciliation.excelRows,
      canonicalClassKeysFromExcel: reconDocs.reconciliation.canonicalClassKeysFromExcel,
      dbSem4ClassGroups: reconDocs.reconciliation.dbSem4ClassGroups,
      matchedDbClassGroups: reconDocs.reconciliation.matchedDbClassGroups,
      missingDbClassGroups: reconDocs.reconciliation.missingDbClassGroups,
      ambiguousDbClassGroups: reconDocs.reconciliation.ambiguousDbClassGroups,
      legacySem4ClassGroupsMatched: reconDocs.reconciliation.legacySem4ClassGroupsMatched,
      manualReviewClassGroupCount: reconDocs.reconciliation.manualReviewClassGroupCount,
    },
    kSegmentStats: kSeg,
    remainingBlockers: {
      totalBlockerDiagnostics:
        missingTeacherDiagnosticCount +
        examTypeInvalidDiagnosticCount +
        weeklyHoursInvalidDiagnosticCount +
        ambiguousMappingDiagnosticCount +
        planData.plan.unresolvedRows.filter((r) => r.unresolvedReasons.includes('CLASS_GROUP_IDS_MISSING') || r.unresolvedReasons.includes('classGroupMissing')).length +
        planData.plan.unresolvedRows.filter((r) => r.unresolvedReasons.includes('TEACHER_ID_MISSING')).length,
      affectedRows: planData.summary.unresolvedRows,
      affectedCandidates: planData.summary.unresolvedRows,
      importableRows: planData.summary.plannedImportRows,
      unresolvedRows: planData.summary.unresolvedRows,
      overlapMatrix,
    },
    missingTeacherPlan: {
      missingTeacherDiagnosticCount,
      missingTeacherRowCount,
      uniqueMissingTeacherHashCount,
      foundInCurrentTeacherAfterF6C,
      foundInStaffOrContacts,
      likelyExternal,
      ambiguousTeacherCount,
      emptyTeacherCount,
      physicalEducationExemptCount,
      recommendedActionCounts: {
        USE_EXISTING_TEACHER_ALIAS: foundInCurrentTeacherAfterF6C,
        IMPORT_FROM_STAFF_OR_CONTACTS: foundInStaffOrContacts,
        CREATE_EXTERNAL_TEACHER_AFTER_CONFIRMATION: likelyExternal,
        PHYSICAL_EDUCATION_TEACHER_EXEMPT: physicalEducationExemptCount,
        MANUAL_REVIEW_TEACHER_TEXT: ambiguousTeacherCount,
        SKIP_ROW: emptyTeacherCount,
      },
    },
    manualReviewClassGroupPlan: {
      manualReviewClassGroupCount,
      uniqueMajorHashCount,
      affectedRows: manualReviewRowCount,
      reasonCounts: manualReviewReasonCounts,
      recommendedActionCounts: manualReviewRecommendedActionCounts,
    },
    dbCollisionPlan: {
      duplicateCompositeKeyCollisionCount: totalCollisionCount,
      safeDuplicateCount,
      unsafeCollisionCount,
      legacyCollisionCount,
      plannedNameBugCount,
      blockingCollisionCount,
      recommendedActionCounts: {
        IGNORE_SAFE_DUPLICATE: safeDuplicateCount,
        FIX_PLANNED_NAME_GENERATION: plannedNameBugCount,
        ADD_ALIAS_MAPPING: 0,
        MANUALLY_SELECT_CANONICAL_CLASSGROUP: 0,
        DO_NOT_USE_LEGACY_CLASSGROUP: 0,
        NEEDS_SCHEMA_ROADMAP: 0,
      },
    },
    examTypePlan: {
      examTypeInvalidCount: examTypeInvalidDiagnosticCount,
      rawExamTypeVariantCount: examTypeVariantHashCounts.size,
      normalizableExamTypeCount,
      invalidExamTypeCount,
      blankExamTypeCount,
      ambiguousExamTypeCount,
      recommendedActionCounts: {
        NORMALIZE_BY_RULE: normalizableExamTypeCount,
        MANUAL_REVIEW_EXAM_TYPE: invalidExamTypeCount + ambiguousExamTypeCount,
        SKIP_ROW: blankExamTypeCount,
      },
    },
    weeklyHoursPlan: {
      weeklyHoursInvalidCount: weeklyHoursInvalidDiagnosticCount,
      rawWeeklyHoursVariantCount: weeklyHoursVariantHashCounts.size,
      blankWeeklyHoursCount,
      nonNumericWeeklyHoursCount,
      rangeWeeklyHoursCount,
      fractionWeeklyHoursCount,
      totalHoursOnlyCount,
      manualReviewRequiredCount: manualReviewRequiredWeeklyHoursCount,
      recommendedActionCounts: {
        NORMALIZE_NUMERIC: fractionWeeklyHoursCount + weeklyHoursInvalidDiagnosticCount - nonNumericWeeklyHoursCount - rangeWeeklyHoursCount - totalHoursOnlyCount - manualReviewRequiredWeeklyHoursCount - blankWeeklyHoursCount,
        MANUAL_REVIEW_WEEKLY_HOURS: nonNumericWeeklyHoursCount + rangeWeeklyHoursCount + totalHoursOnlyCount + manualReviewRequiredWeeklyHoursCount,
        SKIP_ROW: blankWeeklyHoursCount,
      },
    },
    ambiguousMappingPlan: {
      ambiguousMappingCount: ambiguousMappingDiagnosticCount,
      ambiguousTeacherCount: ambiguousTeacherMappingCount,
      ambiguousCourseCount: ambiguousCourseMappingCount,
      ambiguousClassGroupCount: ambiguousClassGroupMappingCount,
      ambiguousMajorAliasCount,
      ambiguousKSegmentCount,
      ambiguousExamTypeMappingCount,
      ambiguousWeeklyHoursMappingCount,
      recommendedActionCounts: {
        MANUAL_SELECT_EXISTING: ambiguousMappingPlans.filter((p) => p.bucket === 'MANUAL_SELECT_EXISTING').length,
        ADD_ALIAS_MAPPING: 0,
        CREATE_NEW_AFTER_CONFIRMATION: 0,
        SKIP_ROW: ambiguousMappingPlans.filter((p) => p.bucket === 'SKIP_ROW').length,
      },
    },
    finalActionAggregate: {
      autoFixByRuleCount,
      writeMasterDataAfterConfirmationCount,
      manualResolutionRequiredCount,
      skipRowCount,
      blockedByDbCollisionCount,
      blockedBySourceAmbiguityCount,
      unknownFinalActionCount,
    },
    canProceedToWrite,
    canProceedToDryRun,
    nextStageRecommendation: blockingCollisionCount > 0
      ? 'L7-F6F-CONTROLLED-DB-COLLISION-RECONCILIATION-WRITE'
      : (writeMasterDataAfterConfirmationCount > 0
          ? 'L7-F6F-CONTROLLED-MANUAL-RESOLUTION-WRITE'
          : 'L7-F7-XLSX-COURSE-SETTING-VALID-DRY-RUN-AFTER-RESOLUTION-FIX'),
    localArtifacts: {
      remainingResolutionPlanRawLocal: 'temp/local-artifacts/l7-f6e/remaining-resolution-plan.raw.local.json',
      missingTeachersRawLocal: 'temp/local-artifacts/l7-f6e/missing-teachers.raw.local.json',
      manualReviewClassgroupsRawLocal: 'temp/local-artifacts/l7-f6e/manual-review-classgroups.raw.local.json',
      dbCollisionsRawLocal: 'temp/local-artifacts/l7-f6e/db-collisions.raw.local.json',
      examWeeklyHoursIssuesRawLocal: 'temp/local-artifacts/l7-f6e/exam-weekly-hours-issues.raw.local.json',
      allGitignored: true,
    },
    privacy: {
      rawTeacherNamesIncluded: false,
      rawClassNamesIncluded: false,
      rawCourseNamesIncluded: false,
      rawMajorNamesIncluded: false,
      rawRemarksIncluded: false,
      rawExamTypeIncluded: false,
      rawWeeklyHoursIncluded: false,
      phoneNumbersIncluded: false,
      emailIncluded: false,
      employeeNoIncluded: false,
      localArtifactsContainRawForReview: true,
    },
  }

  // ── Write local artifacts (gitignored) ─────────────────────────────────
  const artifactDir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6e')
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true })

  const writeArtifact = (filename: string, data: unknown): void => {
    const path = join(artifactDir, filename)
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8')
    console.log(`  wrote: ${path}`)
  }

  // 1. remaining-resolution-plan.raw.local.json
  writeArtifact('remaining-resolution-plan.raw.local.json', {
    stage: STAGE,
    targetSemesterId: args.targetSemesterId,
    generatedAt: new Date().toISOString(),
    planArtifactPath: planPath,
    rowFinalActions,
    overlapMatrix,
  })

  // 2. missing-teachers.raw.local.json
  writeArtifact('missing-teachers.raw.local.json', {
    stage: STAGE,
    targetSemesterId: args.targetSemesterId,
    generatedAt: new Date().toISOString(),
    plans: missingTeacherPlans,
  })

  // 3. manual-review-classgroups.raw.local.json
  // Re-project from L7-F6D2 manual-review raw artifact + add L7-F6E action.
  const manualReviewRows = manualReviewRaw?.missingMajors ?? []
  writeArtifact('manual-review-classgroups.raw.local.json', {
    stage: STAGE,
    targetSemesterId: args.targetSemesterId,
    generatedAt: new Date().toISOString(),
    uniqueMajorCount: Object.keys(manualReviewByMajor).length,
    uniqueMajors: Object.fromEntries(
      Object.entries(manualReviewByMajor).map(([k, v]) => [
        shortHash(k, 16),
        { count: v.count, action: v.action },
      ]),
    ),
    majorsRaw: manualReviewByMajor, // local artifact — raw is allowed here
    rows: manualReviewRows,
  })

  // 4. db-collisions.raw.local.json
  writeArtifact('db-collisions.raw.local.json', {
    stage: STAGE,
    targetSemesterId: args.targetSemesterId,
    generatedAt: new Date().toISOString(),
    safeDuplicateCount,
    unsafeCollisionCount,
    legacyCollisionCount,
    plannedNameBugCount,
    blockingCollisionCount,
    detail: 'DB canonical-key collisions are 23 L7-F6C safe duplicates + 9 unsafe legacy/L7-F6C name collisions (e.g. 2024级智能轧钢技术1班 vs 2024级级智能轧钢技术1班). The 9 unsafe require plannedName normalization migration. Detailed per-key collision list would require re-running the L7-F6D2 reconciliation script; refer to temp/local-artifacts/l7-f6d2/canonical-key-reconciliation.raw.local.json for the full DB ↔ Excel reconciliation.',
  })

  // 5. exam-weekly-hours-issues.raw.local.json
  writeArtifact('exam-weekly-hours-issues.raw.local.json', {
    stage: STAGE,
    targetSemesterId: args.targetSemesterId,
    generatedAt: new Date().toISOString(),
    examTypePlans,
    weeklyHoursPlans,
  })

  // ── Write committed aggregate ───────────────────────────────────────────
  const aggregatePath = join(artifactDir, 'remaining-resolution-plan.aggregate.json')
  writeFileSync(aggregatePath, JSON.stringify(aggregate, null, 2) + '\n', 'utf-8')
  console.log(`\naggregate artifact (gitignored): ${aggregatePath}`)

  // ── Stdout summary (privacy-safe — no raw PII) ──────────────────────────
  console.log(`\n--- L7-F6E summary ---`)
  console.log(`  remaining blockers:`)
  console.log(`    total diagnostics:    ${aggregate.remainingBlockers.totalBlockerDiagnostics}`)
  console.log(`    affected rows:        ${aggregate.remainingBlockers.affectedRows}`)
  console.log(`    importable rows:      ${aggregate.remainingBlockers.importableRows}`)
  console.log(`    unresolved rows:      ${aggregate.remainingBlockers.unresolvedRows}`)
  console.log(`  missing teacher plan:`)
  console.log(`    diagnostic count:     ${missingTeacherDiagnosticCount}`)
  console.log(`    row count:            ${missingTeacherRowCount}`)
  console.log(`    unique teacher hash:  ${uniqueMissingTeacherHashCount}`)
  console.log(`    in staff/contacts:    ${foundInStaffOrContacts}`)
  console.log(`    in current Teacher:   ${foundInCurrentTeacherAfterF6C}`)
  console.log(`    likely external:      ${likelyExternal}`)
  console.log(`    PE exempt:            ${physicalEducationExemptCount}`)
  console.log(`  manual-review classgroup:`)
  console.log(`    count:                ${manualReviewClassGroupCount}`)
  console.log(`    unique majors:        ${uniqueMajorHashCount}`)
  console.log(`  db collision plan:`)
  console.log(`    total collisions:     ${totalCollisionCount}`)
  console.log(`    safe duplicates:      ${safeDuplicateCount}`)
  console.log(`    unsafe collisions:    ${unsafeCollisionCount}`)
  console.log(`    blocking:             ${blockingCollisionCount}`)
  console.log(`  exam type plan:`)
  console.log(`    invalid count:        ${examTypeInvalidDiagnosticCount}`)
  console.log(`    normalizable:         ${normalizableExamTypeCount}`)
  console.log(`    invalid (no rule):    ${invalidExamTypeCount}`)
  console.log(`    blank:                ${blankExamTypeCount}`)
  console.log(`  weekly hours plan:`)
  console.log(`    invalid count:        ${weeklyHoursInvalidDiagnosticCount}`)
  console.log(`    normalizable numeric: ${fractionWeeklyHoursCount + weeklyHoursInvalidDiagnosticCount - nonNumericWeeklyHoursCount - rangeWeeklyHoursCount - totalHoursOnlyCount - manualReviewRequiredWeeklyHoursCount - blankWeeklyHoursCount}`)
  console.log(`    blank:                ${blankWeeklyHoursCount}`)
  console.log(`  final action aggregate:`)
  console.log(`    AUTO_FIX_BY_RULE_NEXT_STAGE:                 ${autoFixByRuleCount}`)
  console.log(`    WRITE_MASTER_DATA_AFTER_CONFIRMATION:        ${writeMasterDataAfterConfirmationCount}`)
  console.log(`    MANUAL_RESOLUTION_REQUIRED:                  ${manualResolutionRequiredCount}`)
  console.log(`    SKIP_ROW:                                    ${skipRowCount}`)
  console.log(`    BLOCKED_BY_DB_COLLISION:                     ${blockedByDbCollisionCount}`)
  console.log(`    BLOCKED_BY_SOURCE_AMBIGUITY:                 ${blockedBySourceAmbiguityCount}`)
  console.log(`    unknownFinalActionCount:                     ${unknownFinalActionCount}`)
  console.log(`\n  canProceedToDryRun: ${canProceedToDryRun}`)
  console.log(`  canProceedToWrite:  ${canProceedToWrite}`)
  console.log(`  next stage:         ${aggregate.nextStageRecommendation}`)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
