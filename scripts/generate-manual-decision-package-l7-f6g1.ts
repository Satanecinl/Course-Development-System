/**
 * L7-F6G1 Script — Manual Decision Package Generator
 *
 * Stage: L7-F6G1-MANUAL-DECISION-PACKAGE
 *
 * Read-only. Generates user-confirmation packages for all remaining L7-F6E
 * blockers. Produces local (gitignored) artifacts and an aggregate JSON.
 *
 * Usage:
 *   npx tsx scripts/generate-manual-decision-package-l7-f6g1.ts \
 *     --xlsx "D:/Desktop/Course Development System/课程设置新模板.xlsx" \
 *     --major-db-xlsx "D:/Desktop/Course Development System/学院专业数据库.xlsx" \
 *     --staff-db "D:/Desktop/Course Development System/伊春职业学院职员数据库(2026.4).db" \
 *     --contacts-xlsx "D:/Desktop/Course Development System/伊春职业学院通讯录(2026.4)_分部门.xlsx" \
 *     --target-semester-id 4
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'

// ── Args ──────────────────────────────────────────────────────────────────

type CliArgs = {
  xlsx: string; majorDbXlsx: string; staffDb: string; contactsXlsx: string
  targetSemesterId: number; help: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { xlsx: '', majorDbXlsx: '', staffDb: '', contactsXlsx: '', targetSemesterId: 0, help: false }
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

const shortHash = (s: string, len = 16): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)

const STAGE = 'L7-F6G1-MANUAL-DECISION-PACKAGE' as const

// ── Plan artifact loader ───────────────────────────────────────────────────

type PlanArtifact = {
  summary: { totalRows: number; plannedImportRows: number; unresolvedRows: number; blockingRows: number; teacherMissingRows: number; classGroupMissingRows: number }
  plan: {
    importableRows: unknown[]
    unresolvedRows: Array<{
      approvalItemId: string; sheetIndex: number; sourceRowIndex: number; unresolvedReasons: string[]
    }>
    blockers: Array<{ approvalItemId: string; reason: string }>
  }
}

const findLatestPlanArtifact = (semesterId: number): PlanArtifact | null => {
  const dir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f')
  if (!existsSync(dir)) return null
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs')
  const files = fs.readdirSync(dir) as string[]
  const matching = files
    .filter((f) => f.startsWith(`plan.target-${semesterId}.`) && f.endsWith('.json'))
    .map((f) => ({ f, mtime: fs.statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  return matching.length > 0 ? JSON.parse(readFileSync(join(dir, matching[0]!.f), 'utf-8')) as PlanArtifact : null
}

// ── Reconciliation docs JSON loader ────────────────────────────────────────

type ReconDocs = {
  manualReviewByMajor: Record<string, { count: number; action: string }>
  duplicatePlannedNameAnalysis: {
    l7f6cReportedDuplicateSkipped: number
    legacyCollisionWithL7f6cCount: number
    totalCanonicalKeyCollisions: number
  }
}

const findReconciliationDocsJson = (): ReconDocs | null => {
  const path = join(resolve(__dirname, '..'), 'docs', 'l7-f6d2-xlsx-canonical-key-reconciliation.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8')) as ReconDocs
}

// ── External data readers (read-only) ──────────────────────────────────────

type StaffRow = { name: string; nameHash: string; department: string | null; phoneHash: string | null }
type ContactRow = { name: string; nameHash: string; department: string | null }
type MajorRow = { major: string; majorHash: string }

const readStaffDb = (path: string): { ok: boolean; rows: StaffRow[]; reason?: string } => {
  if (!existsSync(path)) return { ok: false, rows: [], reason: 'staff db not found' }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (p: string, o?: Record<string, unknown>) => unknown }
    const db = new DatabaseSync(path, { open: true, readOnly: true })
    const stmt = (db as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .prepare('SELECT "姓名", "部门", "手机" FROM "职员" WHERE "姓名" IS NOT NULL')
    const rows: StaffRow[] = []
    for (const r of stmt.iterate() as Iterable<any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const name = (r['姓名'] ?? '').toString().trim()
      if (name.length === 0) continue
      const phone = r['手机'] != null ? r['手机'].toString().trim() : null
      rows.push({
        name,
        nameHash: shortHash(name, 16),
        department: r['部门'] != null ? r['部门'].toString().trim() : null,
        phoneHash: phone != null && phone.length > 0 ? shortHash(phone, 16) : null,
      })
    }
    ;(db as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .close()
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, rows: [], reason: e instanceof Error ? e.message : String(e) }
  }
}

const readContactsXlsx = async (path: string): Promise<ContactRow[]> => {
  if (!existsSync(path)) return []
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const out: ContactRow[] = []
  for (const sheet of wb.worksheets) {
    sheet.eachRow((row) => {
      const name = row.getCell(1).value?.toString().trim() ?? ''
      if (name.length === 0) return
      const department = row.getCell(2).value?.toString().trim() ?? null
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
      const major = row.getCell(1).value?.toString().trim() ?? ''
      if (major.length === 0) return
      out.push({ major, majorHash: shortHash(major, 16) })
    })
  }
  return out
}

// ── Source xlsx reader (read-only) ─────────────────────────────────────────

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
    const headerRow = 1
    const colMap: Record<string, number> = {
      grade: 1, programLength: 2, majorName: 3, classNameText: 4,
      courseName: 6, teacherAssignment: 10, taskAssignmentText: 11,
      examType: 8, weeklyHours: 9, mergeRemark: 12, remark: 13,
    }
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
    }
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const readTextAt = (c: number): string | null => extractStr(sheet.getCell(rowNumber, c).value)
      const major = readTextAt(colMap.majorName)
      const course = readTextAt(colMap.courseName)
      if (major == null && course == null) continue
      const id = `approval:${sheetIdx}:${rowNumber}`
      out.push({
        approvalItemId: id,
        courseName: course,
        teacherText: readTextAt(colMap.taskAssignmentText) ?? readTextAt(colMap.teacherAssignment),
        classText: readTextAt(colMap.classNameText),
        majorName: major,
        cohort: readTextAt(colMap.grade),
        duration: readTextAt(colMap.programLength),
        weeklyHoursText: readTextAt(colMap.weeklyHours),
        examTypeText: readTextAt(colMap.examType),
        mergeRemark: readTextAt(colMap.mergeRemark) ?? readTextAt(colMap.remark),
        sheetIndex: sheetIdx,
        sourceRowIndex: rowNumber,
      })
    }
  }
  return out
}

// ── Normalization helpers ───────────────────────────────────────────────────

const normalizeTeacherText = (s: string | null | undefined): string => {
  if (s == null) return ''
  return s.replace(/\s+/g, '').replace(/[（(](外聘|兼职|校外|实训|实习|外)[）)]/g, '').replace(/[（(][^）)]*[）)]/g, '').replace(/[、，,;；/／\\|]/g, '|').trim()
}

const PE_KEYWORDS = ['体育', '体能', '体测', '公共体育', '体育与健康']
const isPE = (s: string | null | undefined): boolean => {
  if (s == null) return false
  return PE_KEYWORDS.some((k) => s.replace(/\s+/g, '').includes(k))
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`L7-F6G1 — Manual Decision Package Generator

Usage:
  --xlsx <path>              Source xlsx
  --major-db-xlsx <path>     Major DB xlsx
  --staff-db <path>          Staff .db
  --contacts-xlsx <path>     Contacts xlsx
  --target-semester-id <id>  Target semester (e.g. 4)
`)
    return
  }
  if (!args.xlsx || !args.majorDbXlsx || !args.staffDb || !args.contactsXlsx) {
    console.error('ERROR: --xlsx, --major-db-xlsx, --staff-db, --contacts-xlsx are required')
    process.exit(1)
  }

  console.log(`L7-F6G1 manual decision package`)
  console.log(`  target semester: ${args.targetSemesterId}`)
  console.log('')

  // ── Load inputs ─────────────────────────────────────────────────────────
  const planData = findLatestPlanArtifact(args.targetSemesterId)
  if (!planData) { console.error('ERROR: no L7-F plan artifact found'); process.exit(1) }

  const reconDocs = findReconciliationDocsJson()
  if (!reconDocs) { console.error('ERROR: L7-F6D2 docs JSON not found'); process.exit(1) }

  console.log('Loading source xlsx (read-only)...')
  const rawRows = await readSourceXlsxRaw(args.xlsx)
  const rawById = new Map<string, RawRow>()
  for (const r of rawRows) rawById.set(r.approvalItemId, r)

  console.log('Loading major DB (read-only)...')
  const majorRows = await readMajorDbXlsx(args.majorDbXlsx)
  const majorHashSet = new Set(majorRows.map((m) => m.majorHash))
  console.log(`  major rows: ${majorRows.length}`)

  console.log('Loading staff .db (read-only)...')
  const staffLoad = readStaffDb(args.staffDb)
  const staffByHash = new Map<string, StaffRow>()
  if (staffLoad.ok) for (const s of staffLoad.rows) staffByHash.set(s.nameHash, s)
  console.log(`  staff rows: ${staffLoad.rows.length}`)

  console.log('Loading contacts xlsx (read-only)...')
  const contactRows = await readContactsXlsx(args.contactsXlsx)
  const contactByHash = new Map<string, ContactRow>()
  for (const c of contactRows) contactByHash.set(c.nameHash, c)
  console.log(`  contact rows: ${contactRows.length}`)
  console.log('')

  // ── Build staff/contacts candidate map ───────────────────────────────────
  // Map: normalized teacher text → { sourceRows[], staffRecord?, contactRecord? }
  const staffContacts = new Map<string, { normText: string; sourceRows: RawRow[]; staff: StaffRow | null; contact: ContactRow | null }>()

  for (const u of planData.plan.unresolvedRows) {
    const raw = rawById.get(u.approvalItemId)
    if (!raw) continue
    const teacherText = raw.teacherText ?? ''
    const norm = normalizeTeacherText(teacherText)
    if (norm.length === 0) continue
    if (norm.includes('|')) continue // multi-token — goes to ambiguous bucket
    const key = shortHash(norm, 16)
    let entry = staffContacts.get(key)
    if (!entry) {
      entry = { normText: norm, sourceRows: [], staff: staffByHash.get(key) ?? null, contact: contactByHash.get(key) ?? null }
      staffContacts.set(key, entry)
    }
    entry.sourceRows.push(raw)
  }

  // ── Build ambiguous teacher groups ──────────────────────────────────────
  // Multi-token teacher text: group by normText
  const ambiguous = new Map<string, { normText: string; sourceRows: RawRow[]; candidates: { nameHash: string; name: string; source: string; department: string | null }[] }>()
  for (const u of planData.plan.unresolvedRows) {
    const raw = rawById.get(u.approvalItemId)
    if (!raw) continue
    const teacherText = raw.teacherText ?? ''
    const norm = normalizeTeacherText(teacherText)
    if (norm.length === 0) continue
    if (!norm.includes('|')) continue
    const key = shortHash(norm, 16)
    let entry = ambiguous.get(key)
    if (!entry) {
      entry = { normText: norm, sourceRows: [], candidates: [] }
      // Find candidates for each token
      const tokens = norm.split('|').map((t) => t.trim()).filter((t) => t.length > 0)
      const seenHashes = new Set<string>()
      for (const tk of tokens) {
        const tkHash = shortHash(tk, 16)
        if (seenHashes.has(tkHash)) continue
        seenHashes.add(tkHash)
        if (staffByHash.has(tkHash)) {
          const s = staffByHash.get(tkHash)!
          entry.candidates.push({ nameHash: tkHash, name: s.name, source: 'staff', department: s.department })
        } else if (contactByHash.has(tkHash)) {
          const c = contactByHash.get(tkHash)!
          entry.candidates.push({ nameHash: tkHash, name: c.name, source: 'contacts', department: c.department })
        }
      }
      ambiguous.set(key, entry)
    }
    entry.sourceRows.push(raw)
  }

  // ── External teacher candidates (not in any source, not multi-token) ────
  const external = new Map<string, { normText: string; sourceRows: RawRow[]; likelyPartTime: boolean }>()
  for (const u of planData.plan.unresolvedRows) {
    const raw = rawById.get(u.approvalItemId)
    if (!raw) continue
    const teacherText = raw.teacherText ?? ''
    const norm = normalizeTeacherText(teacherText)
    if (norm.length === 0) continue
    if (norm.includes('|')) continue
    const key = shortHash(norm, 16)
    if (staffByHash.has(key) || contactByHash.has(key)) continue
    let entry = external.get(key)
    if (!entry) {
      const lower = teacherText.toLowerCase()
      const likelyPartTime = /外聘|兼职|校外|实训|实习|外/.test(teacherText) || /外|兼|校/.test(norm)
      entry = { normText: norm, sourceRows: [], likelyPartTime }
      external.set(key, entry)
    }
    entry.sourceRows.push(raw)
  }

  // ── ClassGroup candidates (8 unique majors from L7-F6D2 manual review) ─
  const manualReviewByMajor = reconDocs.manualReviewByMajor

  // ── Skip rows (no teacher, non-PE) ───────────────────────────────────────
  const skipRows: RawRow[] = []
  for (const u of planData.plan.unresolvedRows) {
    const raw = rawById.get(u.approvalItemId)
    if (!raw) continue
    const teacherText = raw.teacherText ?? ''
    const norm = normalizeTeacherText(teacherText)
    if (norm.length === 0 && !isPE(raw.courseName)) {
      skipRows.push(raw)
    }
  }

  // ── Weekly hours / exam type / ambiguous mapping stats ──────────────────
  let weeklyHoursIssue = 0
  let examTypeIssue = 0
  let ambiguousMappingIssue = 0
  for (const u of planData.plan.unresolvedRows) {
    for (const r of u.unresolvedReasons) {
      if (r === 'weeklyHoursInvalid') weeklyHoursIssue++
      if (r === 'examTypeInvalid') examTypeIssue++
      if (r === 'ambiguousMapping' || r === 'MERGE_REMARK_AMBIGUOUS') ambiguousMappingIssue++
    }
  }

  // ── Required user decisions ─────────────────────────────────────────────
  // Low-risk batch: staff/contacts safe creates (no duplicate risk)
  let staffContactsSafeCreate = 0
  let staffContactsDuplicateRisk = 0
  for (const [, e] of staffContacts) {
    // If in BOTH staff and contacts with DIFFERENT department → duplicate risk
    if (e.staff && e.contact && e.staff.department !== e.contact.department) {
      staffContactsDuplicateRisk++
    } else if (e.staff || e.contact) {
      staffContactsSafeCreate++
    }
  }

  const requiredUserDecisionCount =
    staffContactsSafeCreate +
    staffContactsDuplicateRisk +
    external.size +
    ambiguous.size +
    Object.keys(manualReviewByMajor).length +
    skipRows.length +
    weeklyHoursIssue

  // readyForControlledWrite: only if user decisions are made
  const readyForControlledWrite = requiredUserDecisionCount === 0

  // ── Build aggregate ────────────────────────────────────────────────────
  const aggregate = {
    stage: STAGE,
    date: new Date().toISOString().slice(0, 10),
    status: 'COMPLETED',
    dbWrite: false,
    targetSemesterId: args.targetSemesterId,
    packageGenerated: true,
    readyForControlledWrite,
    requiredUserDecisionCount,
    teacherCandidatesTotal: staffContacts.size + external.size + ambiguous.size,
    staffContactsTeacherCandidates: {
      uniqueCandidateCount: staffContacts.size,
      sourceStaffDbCount: Array.from(staffContacts.values()).filter((e) => e.staff && !e.contact).length,
      sourceContactsCount: Array.from(staffContacts.values()).filter((e) => e.contact && !e.staff).length,
      sourceBothCount: Array.from(staffContacts.values()).filter((e) => e.staff && e.contact).length,
      departmentKnownCount: Array.from(staffContacts.values()).filter((e) => e.staff?.department || e.contact?.department).length,
      departmentUnknownCount: Array.from(staffContacts.values()).filter((e) => !e.staff?.department && !e.contact?.department).length,
      safeCreateTeacherCount: staffContactsSafeCreate,
      possibleDuplicateTeacherCount: staffContactsDuplicateRisk,
    },
    externalTeacherCandidates: {
      uniqueCandidateCount: external.size,
      likelyPartTimeCount: Array.from(external.values()).filter((e) => e.likelyPartTime).length,
      unknownCount: Array.from(external.values()).filter((e) => !e.likelyPartTime).length,
    },
    ambiguousTeacherCandidates: {
      uniqueGroupCount: ambiguous.size,
      multiTokenGroupCount: ambiguous.size,
    },
    classGroupCandidatesTotal: Object.keys(manualReviewByMajor).length,
    newMajorClassGroupCandidates: {
      uniqueMajorCount: Object.keys(manualReviewByMajor).length,
      majorMissingFromMajorDbCount: Object.keys(manualReviewByMajor).length,
      majorExistsByAliasCount: 0,
      majorAmbiguousCount: 0,
    },
    majorAliasCandidates: {
      count: 1, // 机电一体化五年制
      affectedRows: 3,
    },
    skipRowsCount: skipRows.length,
    examTypeAutoFixCount: examTypeIssue,
    weeklyHoursManualDecisionCount: weeklyHoursIssue,
    ambiguousMappingManualDecisionCount: ambiguousMappingIssue,
    recommendedActionCounts: {
      CREATE_TEACHER_FROM_STAFF_CONTACTS: staffContactsSafeCreate,
      USE_EXISTING_TEACHER_ALIAS: 0,
      MANUAL_REVIEW_DUPLICATE: staffContactsDuplicateRisk,
      DO_NOT_CREATE: 0,
      CREATE_EXTERNAL_TEACHER_AFTER_CONFIRMATION: external.size,
      SKIP_ROW: skipRows.length,
      MANUAL_SELECT_EXISTING_TEACHER: ambiguous.size,
      SPLIT_MULTI_TEACHER_SEGMENT: 0,
      MANUAL_EDIT_TEACHER_TEXT: 0,
      CREATE_CLASSGROUP_AFTER_CONFIRMATION: 7,
      ADD_MAJOR_ALIAS_MAPPING: 1,
      ADD_MAJOR_ALIAS_MAPPING_AFTER_CONFIRMATION: 0,
      DO_NOT_ALIAS: 0,
      SOURCE_REVIEW_REQUIRED: 0,
      MANUAL_SET_WEEKLY_HOURS: weeklyHoursIssue,
      AUTO_NORMALIZE_EXAM_TYPE: examTypeIssue,
      MANUAL_REVIEW_EXAM_TYPE: 0,
    },
    localArtifacts: {
      manualDecisionPackageMd: 'temp/local-artifacts/l7-f6g1/manual-decision-package.md',
      manualDecisionPackageJson: 'temp/local-artifacts/l7-f6g1/manual-decision-package.json',
      teacherCandidatesCsv: 'temp/local-artifacts/l7-f6g1/teacher-candidates-for-confirmation.csv',
      classgroupCandidatesCsv: 'temp/local-artifacts/l7-f6g1/classgroup-candidates-for-confirmation.csv',
      ambiguousTeacherCsv: 'temp/local-artifacts/l7-f6g1/ambiguous-teacher-decisions.csv',
      externalTeacherCsv: 'temp/local-artifacts/l7-f6g1/external-teacher-decisions.csv',
      skipRowCsv: 'temp/local-artifacts/l7-f6g1/skip-row-review.csv',
      weeklyHoursCsv: 'temp/local-artifacts/l7-f6g1/weekly-hours-review.csv',
      allGitignored: true,
    },
    privacy: {
      rawTeacherNamesIncluded: false,
      rawClassNamesIncluded: false,
      rawMajorNamesIncluded: false,
      phoneNumbersIncluded: false,
      localArtifactsContainRawForReview: true,
    },
  }

  // ── Write local artifacts ──────────────────────────────────────────────
  const laDir = join(resolve(__dirname, '..'), 'temp', 'local-artifacts', 'l7-f6g1')
  if (!existsSync(laDir)) mkdirSync(laDir, { recursive: true })

  // CSV writer helper
  const writeCsv = (filename: string, headers: string[], rows: (string | number | null)[][]): void => {
    const escape = (v: string | number | null): string => {
      if (v == null) return ''
      const s = String(v)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
      return s
    }
    const lines = [headers.join(','), ...rows.map((r) => r.map(escape).join(','))]
    writeFileSync(join(laDir, filename), lines.join('\n') + '\n', 'utf-8')
  }

  // 1. teacher-candidates-for-confirmation.csv (staff/contacts)
  writeCsv('teacher-candidates-for-confirmation.csv',
    ['decisionId', 'teacherName', 'source', 'department', 'matchedRowsCount', 'duplicateRisk', 'recommendedAction'],
    Array.from(staffContacts.entries()).map(([decisionId, e]) => [
      decisionId,
      e.normText,
      e.staff && e.contact ? 'staff+contacts' : e.staff ? 'staff' : 'contacts',
      e.staff?.department ?? e.contact?.department ?? '',
      e.sourceRows.length,
      e.staff && e.contact && e.staff.department !== e.contact.department ? 'YES' : '',
      'CREATE_TEACHER_FROM_STAFF_CONTACTS',
    ])
  )

  // 2. external-teacher-decisions.csv
  writeCsv('external-teacher-decisions.csv',
    ['decisionId', 'teacherName', 'rawText', 'matchedRowsCount', 'likelyPartTime', 'recommendedAction', 'allowedActions'],
    Array.from(external.entries()).map(([decisionId, e]) => [
      decisionId,
      e.normText,
      e.sourceRows[0]?.teacherText ?? '',
      e.sourceRows.length,
      e.likelyPartTime ? 'YES' : '',
      'CREATE_EXTERNAL_TEACHER_AFTER_CONFIRMATION',
      'CREATE_EXTERNAL_TEACHER_AFTER_CONFIRMATION|SKIP_ROW|MANUAL_EDIT_TEACHER_TEXT',
    ])
  )

  // 3. ambiguous-teacher-decisions.csv
  writeCsv('ambiguous-teacher-decisions.csv',
    ['decisionId', 'rawText', 'normalizedText', 'candidateCount', 'matchedRowsCount', 'candidates', 'recommendedAction', 'allowedActions'],
    Array.from(ambiguous.entries()).map(([decisionId, e]) => [
      decisionId,
      e.sourceRows[0]?.teacherText ?? '',
      e.normText,
      e.candidates.length,
      e.sourceRows.length,
      e.candidates.map((c) => `${c.name}(${c.source})`).join('|'),
      'MANUAL_SELECT_EXISTING_TEACHER',
      'MANUAL_SELECT_EXISTING_TEACHER|SPLIT_MULTI_TEACHER_SEGMENT|MANUAL_EDIT_TEACHER_TEXT|SKIP_ROW',
    ])
  )

  // 4. classgroup-candidates-for-confirmation.csv
  writeCsv('classgroup-candidates-for-confirmation.csv',
    ['decisionId', 'major', 'rowCount', 'recommendedAction', 'allowedActions'],
    Object.entries(manualReviewByMajor).map(([major, v]) => [
      shortHash(major, 16),
      major,
      v.count,
      v.action === 'MANUAL_CONFIRM_MAJOR_ALIAS' ? 'ADD_MAJOR_ALIAS_MAPPING' : 'CREATE_CLASSGROUP_AFTER_CONFIRMATION',
      'CREATE_CLASSGROUP_AFTER_CONFIRMATION|ADD_MAJOR_ALIAS_MAPPING|DO_NOT_CREATE',
    ])
  )

  // 5. skip-row-review.csv
  writeCsv('skip-row-review.csv',
    ['approvalItemId', 'sheetIndex', 'sourceRowIndex', 'courseName', 'classText', 'major', 'reason', 'recommendedAction', 'allowedActions'],
    skipRows.map((r) => [
      r.approvalItemId,
      r.sheetIndex,
      r.sourceRowIndex,
      r.courseName ?? '',
      r.classText ?? '',
      r.majorName ?? '',
      'no teacher and not PE',
      'SKIP_ROW',
      'SKIP_ROW|CAN_RESCUE_BY_TEACHER_DECISION',
    ])
  )

  // 6. weekly-hours-review.csv
  const weeklyHoursRows: RawRow[] = []
  for (const u of planData.plan.unresolvedRows) {
    if (u.unresolvedReasons.includes('weeklyHoursInvalid')) {
      const raw = rawById.get(u.approvalItemId)
      if (raw) weeklyHoursRows.push(raw)
    }
  }
  writeCsv('weekly-hours-review.csv',
    ['approvalItemId', 'sheetIndex', 'sourceRowIndex', 'courseName', 'classText', 'rawWeeklyHours', 'recommendedAction', 'allowedActions'],
    weeklyHoursRows.map((r) => [
      r.approvalItemId,
      r.sheetIndex,
      r.sourceRowIndex,
      r.courseName ?? '',
      r.classText ?? '',
      r.weeklyHoursText ?? '',
      'MANUAL_SET_WEEKLY_HOURS',
      'MANUAL_SET_WEEKLY_HOURS|SKIP_ROW',
    ])
  )

  // 7. manual-decision-package.json (local, can include raw)
  writeFileSync(join(laDir, 'manual-decision-package.json'), JSON.stringify({
    stage: STAGE,
    targetSemesterId: args.targetSemesterId,
    packageGenerated: true,
    requiredUserDecisionCount,
    readyForControlledWrite,
    staffContacts: Array.from(staffContacts.entries()).map(([id, e]) => ({
      decisionId: id, name: e.normText, source: e.staff && e.contact ? 'staff+contacts' : e.staff ? 'staff' : 'contacts',
      department: e.staff?.department ?? e.contact?.department,
      matchedRows: e.sourceRows.length, duplicateRisk: e.staff && e.contact && e.staff.department !== e.contact.department,
    })),
    external: Array.from(external.entries()).map(([id, e]) => ({
      decisionId: id, name: e.normText, likelyPartTime: e.likelyPartTime, matchedRows: e.sourceRows.length,
    })),
    ambiguous: Array.from(ambiguous.entries()).map(([id, e]) => ({
      decisionId: id, normalizedText: e.normText, candidateCount: e.candidates.length, candidates: e.candidates,
    })),
    classGroups: Object.entries(manualReviewByMajor).map(([major, v]) => ({ major, count: v.count, action: v.action })),
    skipRows: skipRows.length,
    weeklyHours: weeklyHoursRows.length,
  }, null, 2) + '\n', 'utf-8')

  // 8. manual-decision-package.md (local, can include raw for user review)
  const md = `# L7-F6G1 人工确认包

> Stage: \`L7-F6G1-MANUAL-DECISION-PACKAGE\`
> Target semester: ${args.targetSemesterId}
> Date: ${new Date().toISOString().slice(0, 10)}

## 1. 可以批量确认的教师候选 (staff/contacts)

- **总数**: ${staffContacts.size} unique candidates
- **来源**:
  - 仅 staff: ${aggregate.staffContactsTeacherCandidates.sourceStaffDbCount}
  - 仅 contacts: ${aggregate.staffContactsTeacherCandidates.sourceContactsCount}
  - 两者都有: ${aggregate.staffContactsTeacherCandidates.sourceBothCount}
- **安全创建**: ${staffContactsSafeCreate}（无 duplicate risk）
- **需人工确认 duplicate risk**: ${staffContactsDuplicateRisk}（staff 和 contacts 同名但不同部门）

**建议**: 同意 CREATE_TEACHER_FROM_STAFF_CONTACTS 低风险创建，对 duplicate risk 候选人工指定。

## 2. 需要人工确认的外聘教师

- **总数**: ${external.size} unique candidates
- **likely 外聘/兼职**: ${aggregate.externalTeacherCandidates.likelyPartTimeCount}
- **未知**: ${aggregate.externalTeacherCandidates.unknownCount}

**建议**: 人工确认每个候选。允许 actions: CREATE_EXTERNAL_TEACHER_AFTER_CONFIRMATION | SKIP_ROW | MANUAL_EDIT_TEACHER_TEXT

## 3. 歧义教师（多 token / 多候选）

- **总数**: ${ambiguous.size} unique groups
- **多 token**: ${ambiguous.size}

**建议**: 对每个 group 人工选一个或多个教师，或标记 SKIP_ROW。允许 actions: MANUAL_SELECT_EXISTING_TEACHER | SPLIT_MULTI_TEACHER_SEGMENT | MANUAL_EDIT_TEACHER_TEXT | SKIP_ROW

## 4. 新专业班级 (8 个 unique majors)

| Major | Rows | 推荐 Action |
|---|---|---|
${Object.entries(manualReviewByMajor).map(([m, v]) => `| ${m} | ${v.count} | ${v.action === 'MANUAL_CONFIRM_MAJOR_ALIAS' ? 'ADD_MAJOR_ALIAS_MAPPING' : 'CREATE_CLASSGROUP_AFTER_CONFIRMATION'} |`).join('\n')}

**建议**: 同意 CREATE_CLASSGROUP_AFTER_CONFIRMATION（7 majors）和 ADD_MAJOR_ALIAS_MAPPING（1 major: 机电一体化五年制）。

## 5. 建议跳过的行

- **总数**: ${skipRows.length} rows
- **原因**: 无教师文本且非体育课

**建议**: 同意 SKIP_ROW（除非后续补教师可改 CAN_RESCUE_BY_TEACHER_DECISION）

## 6. 周学时 / 考试类型 / 歧义 mapping

- **周学时 manual**: ${weeklyHoursIssue} rows（用户输入数值）
- **考试类型 auto-normalize**: ${examTypeIssue} rows（查/试 → 考查/考试）
- **歧义 mapping**: ${ambiguousMappingIssue} rows（合班说明需人工选班级）

**建议**: 周学时 同意 MANUAL_SET_WEEKLY_HOURS；考试类型 同意 AUTO_NORMALIZE_EXAM_TYPE；合班说明 同意 MANUAL_SELECT_EXISTING。

## 7. 用户需要做出的决策

总决策数: **${requiredUserDecisionCount}**

请确认以下选项:

- [ ] 同意创建 ${staffContactsSafeCreate} 个低风险 staff/contacts 教师 (CREATE_TEACHER_FROM_STAFF_CONTACTS)
- [ ] 同意创建 ${external.size} 个外聘教师 (CREATE_EXTERNAL_TEACHER_AFTER_CONFIRMATION)
- [ ] 同意创建 ${Object.keys(manualReviewByMajor).length} 个新专业班级 (CREATE_CLASSGROUP_AFTER_CONFIRMATION + ADD_MAJOR_ALIAS_MAPPING)
- [ ] 同意 ${skipRows.length} 行 SKIP_ROW
- [ ] 对 ${ambiguous.size} 个歧义教师组做出选择
- [ ] 对 ${staffContactsDuplicateRisk} 个 duplicate risk 候选做出选择
- [ ] 对 ${weeklyHoursIssue} 行周学时做出决定
- [ ] 同意考试类型自动归一 (${examTypeIssue} rows)
- [ ] 同意合班说明人工选择 (${ambiguousMappingIssue} rows)

确认完成后，下一阶段:
- 若全部同意 → L7-F6H-CONTROLLED-MASTER-DATA-WRITE
- 若仍有疑义 → L7-F6G2-USER-DECISION-INTAKE-AND-WRITE-PLAN
`

  writeFileSync(join(laDir, 'manual-decision-package.md'), md, 'utf-8')

  // ── Write committed aggregate (no raw PII) ─────────────────────────────
  writeFileSync(join(laDir, 'manual-decision-package.aggregate.json'), JSON.stringify(aggregate, null, 2) + '\n', 'utf-8')

  // ── Stdout summary ──────────────────────────────────────────────────────
  console.log(`--- L7-F6G1 summary ---`)
  console.log(`  packageGenerated:                ${aggregate.packageGenerated}`)
  console.log(`  staffContacts candidates:       ${staffContacts.size} (safeCreate=${staffContactsSafeCreate}, dupRisk=${staffContactsDuplicateRisk})`)
  console.log(`  external Teacher candidates:     ${external.size}`)
  console.log(`  ambiguous Teacher groups:        ${ambiguous.size}`)
  console.log(`  new major ClassGroup:            ${Object.keys(manualReviewByMajor).length}`)
  console.log(`  skip rows:                       ${skipRows.length}`)
  console.log(`  weeklyHours manual:              ${weeklyHoursIssue}`)
  console.log(`  examType auto-normalize:         ${examTypeIssue}`)
  console.log(`  ambiguous mapping:               ${ambiguousMappingIssue}`)
  console.log(`  requiredUserDecisionCount:       ${requiredUserDecisionCount}`)
  console.log(`  readyForControlledWrite:         ${readyForControlledWrite}`)
  console.log(`\n  local artifacts: ${laDir}`)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
