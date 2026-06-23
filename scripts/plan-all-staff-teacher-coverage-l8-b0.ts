/**
 * L8-B0 Plan Script — All-Staff Teacher Coverage Plan
 *
 * Stage: L8-B0-ALL-STAFF-TEACHER-COVERAGE-PLAN
 *
 * Product decision (overrides L8-A classification):
 *   Teacher = ALL_STAFF_PERSON_TABLE (全体教职工人员表)
 *
 * This means L8-A's STAFF_ONLY_DO_NOT_IMPORT (count=123) is REJECTED as a
 * skip reason. All valid staff/contacts persons must enter the Teacher
 * coverage plan unless they are duplicates, invalid names, or ambiguous.
 *
 * Read-only plan:
 *   1. Re-read staff DB + contacts xlsx (full record sets, not just L8-A subsets).
 *   2. Rebuild union people using normalizedName as primary key, with
 *      department/role/phone/email hash corroborators.
 *   3. Reclassify every union person into a mutually exclusive
 *      coverageStatus (no STAFF_ONLY_DO_NOT_IMPORT).
 *   4. Generate local raw union artifact + sync plan artifact + workbook.
 *   5. Inspect Teacher schema writable fields and report a planned
 *      create payload shape that does NOT include non-existent fields.
 *
 * NO DB writes. NO apply. NO backup. NO Teacher/ClassGroup/Course/
 * ImportBatch/TeachingTask/TeachingTaskClass/ScheduleSlot creation or
 * modification. NO schema/migration/.env changes.
 *
 * Usage:
 *   npx tsx scripts/plan-all-staff-teacher-coverage-l8-b0.ts \
 *     --staff-db "D:/Desktop/Course Development System/伊春职业学院职员数据库(2026.4).db" \
 *     --contacts-xlsx "D:/Desktop/Course Development System/伊春职业学院通讯录(2026.4)_分部门.xlsx" \
 *     --target-semester-id 4
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { PrismaClient } from '@prisma/client'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJS = require('exceljs') as typeof import('exceljs')

// ── Constants ───────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '..')
const STAGE = 'L8-B0-ALL-STAFF-TEACHER-COVERAGE-PLAN' as const
const ARTIFACT_DIR = join(ROOT, 'temp', 'local-artifacts', 'l8-b0')

const TEACHER_SEMANTIC_DECISION = 'ALL_STAFF_PERSON_TABLE' as const

// ── CLI args ────────────────────────────────────────────────────────────────

type CliArgs = {
  staffDb: string
  contactsXlsx: string
  targetSemesterId: number
  help: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {
    staffDb: '',
    contactsXlsx: '',
    targetSemesterId: 0,
    help: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--staff-db') args.staffDb = argv[++i] ?? ''
    else if (a === '--contacts-xlsx') args.contactsXlsx = argv[++i] ?? ''
    else if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

const usage = (): void => {
  console.log('Usage: npx tsx scripts/plan-all-staff-teacher-coverage-l8-b0.ts \\')
  console.log('  --staff-db "<path>" \\')
  console.log('  --contacts-xlsx "<path>" \\')
  console.log('  --target-semester-id <id>')
}

// ── Hashing ─────────────────────────────────────────────────────────────────

const sha256 = (s: string, len = 16): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)

const sha256Phone = (s: string): string => sha256(`phone:${s}`, 16)
const sha256Email = (s: string): string => sha256(`email:${s}`, 16)

// ── Name normalization ──────────────────────────────────────────────────────

/**
 * Normalize a person's name:
 *   - strip full-width and half-width whitespace
 *   - strip honorifics (老师/教师/教授/副教授/讲师/助教/主任/副主任/科长/处长)
 *   - strip parenthetical content
 *   - strip leading/trailing non-letter/digit punctuation
 */
const normalizePersonName = (raw: string): string => {
  let s = (raw ?? '').replace(/[　\s]+/g, '')
  s = s.replace(/[（(][^）)]*[）)]/g, '')
  s = s.replace(/老师|教师|教授|副教授|讲师|助教|教研室主任|教研室副主任/g, '')
  s = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  return s
}

const INVALID_TOKENS = /^(全部|所有|未知|外聘待定|null|undefined|暂无|待定|无|all|unknown|blank|none|空)$/i
const isInvalidPersonName = (s: string): boolean =>
  INVALID_TOKENS.test(s) || s.length < 2 || !/[\p{L}\p{N}]/u.test(s)

// ── Stage 1: Staff DB ───────────────────────────────────────────────────────

type StaffRawRecord = {
  source: 'staffDb'
  sourceTable: string
  sourceRowId: number
  rawName: string
  normalizedName: string
  normalizedNameHash: string
  department: string
  departmentHash: string
  titleOrRole: string
  titleHash: string
  rank: string
  employeeNo: string
  employeeNoHash: string
  officePhone: string
  officePhoneHash: string
  mobilePhone: string
  mobilePhoneHash: string
  email: string
  emailHash: string
}

const readStaffDb = (path: string): {
  tableCount: number
  tableNames: string[]
  recordCount: number
  records: StaffRawRecord[]
} => {
  const db = new DatabaseSync(path, { open: true, readOnly: true })
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).all() as Array<{ name: string }>
  const mainTable = tables[0]?.name ?? ''

  const rows = db.prepare(`SELECT * FROM "${mainTable}"`).all() as Array<Record<string, unknown>>
  db.close()

  const records: StaffRawRecord[] = rows.map((r) => {
    const rawName = String(r['姓名'] ?? '').trim()
    const normalizedName = normalizePersonName(rawName)
    const department = String(r['部门'] ?? '').trim()
    const title = String(r['职务'] ?? '').trim()
    const rank = String(r['职级'] ?? '').trim()
    const officePhone = String(r['办公电话'] ?? '').trim()
    const mobile = String(r['手机'] ?? '').trim()
    const employeeNo = String(r['工号'] ?? '').trim()
    const email = String(r['邮箱'] ?? r['电子邮件'] ?? '').trim()
    return {
      source: 'staffDb',
      sourceTable: mainTable,
      sourceRowId: Number(r['id'] ?? 0),
      rawName,
      normalizedName,
      normalizedNameHash: sha256(normalizedName),
      department,
      departmentHash: sha256(`dept:${department}`),
      titleOrRole: title,
      titleHash: sha256(`title:${title}`),
      rank,
      employeeNo,
      employeeNoHash: employeeNo ? sha256(`emp:${employeeNo}`) : '',
      officePhone,
      officePhoneHash: officePhone ? sha256Phone(officePhone) : '',
      mobilePhone: mobile,
      mobilePhoneHash: mobile ? sha256Phone(mobile) : '',
      email,
      emailHash: email ? sha256Email(email) : '',
    }
  })

  return {
    tableCount: tables.length,
    tableNames: tables.map((t) => t.name),
    recordCount: records.length,
    records,
  }
}

// ── Stage 2: Contacts xlsx ──────────────────────────────────────────────────

type ContactsRawRecord = {
  source: 'contactsXlsx'
  sourceSheet: string
  sourceRowNumber: number
  rawName: string
  normalizedName: string
  normalizedNameHash: string
  department: string
  departmentHash: string
  roleOrTitle: string
  titleHash: string
  rank: string
  officePhone: string
  officePhoneHash: string
  mobilePhone: string
  mobilePhoneHash: string
  email: string
  emailHash: string
}

const readContactsXlsx = async (path: string): Promise<{
  sheetCount: number
  sheetNames: string[]
  recordCount: number
  records: ContactsRawRecord[]
}> => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)

  const records: ContactsRawRecord[] = []
  for (const ws of wb.worksheets) {
    if (ws.name === '目录' || ws.name === 'Sheet1' || ws.rowCount < 3) continue
    const headerRow = ws.getRow(2)
    let nameCol = -1, titleCol = -1, rankCol = -1, officeCol = -1, mobileCol = -1, emailCol = -1
    for (let c = 1; c <= ws.columnCount; c++) {
      const h = String(headerRow.getCell(c).value ?? '').trim()
      if (h === '姓名') nameCol = c
      else if (h === '职务') titleCol = c
      else if (h === '职级') rankCol = c
      else if (h === '办公电话') officeCol = c
      else if (h === '手机') mobileCol = c
      else if (h.includes('邮箱') || h.includes('邮件')) emailCol = c
    }
    if (nameCol < 0) continue
    let department = String(ws.getRow(1).getCell(1).value ?? '').trim()
    department = department.replace(/^部门名称[:：]\s*/, '').trim()

    for (let r = 3; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const rawName = String(row.getCell(nameCol).value ?? '').trim()
      const normalizedName = normalizePersonName(rawName)
      const title = titleCol > 0 ? String(row.getCell(titleCol).value ?? '').trim() : ''
      const rank = rankCol > 0 ? String(row.getCell(rankCol).value ?? '').trim() : ''
      const office = officeCol > 0 ? String(row.getCell(officeCol).value ?? '').trim() : ''
      const mobile = mobileCol > 0 ? String(row.getCell(mobileCol).value ?? '').trim() : ''
      const email = emailCol > 0 ? String(row.getCell(emailCol).value ?? '').trim() : ''
      records.push({
        source: 'contactsXlsx',
        sourceSheet: ws.name,
        sourceRowNumber: r,
        rawName,
        normalizedName,
        normalizedNameHash: sha256(normalizedName),
        department,
        departmentHash: sha256(`dept:${department}`),
        roleOrTitle: title,
        titleHash: sha256(`title:${title}`),
        rank,
        officePhone: office,
        officePhoneHash: office ? sha256Phone(office) : '',
        mobilePhone: mobile,
        mobilePhoneHash: mobile ? sha256Phone(mobile) : '',
        email,
        emailHash: email ? sha256Email(email) : '',
      })
    }
  }

  return {
    sheetCount: wb.worksheets.length,
    sheetNames: wb.worksheets.map((w: { name: string }) => w.name),
    recordCount: records.length,
    records,
  }
}

// ── Stage 3: Union people ───────────────────────────────────────────────────

type CoverageStatus =
  | 'ALREADY_IN_TEACHER'
  | 'SAFE_CREATE_TEACHER'
  | 'NEEDS_MANUAL_REVIEW'
  | 'DUPLICATE_SOURCE_PERSON'
  | 'INVALID_PERSON_RECORD'
  | 'AMBIGUOUS_EXISTING_TEACHER_MATCH'

type UnionPerson = {
  personKey: string
  rawName: string
  normalizedName: string
  normalizedNameHash: string
  sourcePresence: 'staffDb' | 'contactsXlsx' | 'both'
  sourceRowRefs: Array<{
    source: 'staffDb' | 'contactsXlsx'
    sourceTable?: string
    sourceSheet?: string
    rowId: number
    department: string
    title: string
  }>
  departments: string[]
  roles: string[]
  employeeNoHash: string | null
  officePhoneHash: string | null
  mobilePhoneHash: string | null
  emailHash: string | null
  matchedTeacherId: number | null
  matchedTeacherNameHash: string | null
  coverageStatus: CoverageStatus
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW'
  reasonCodes: string[]
}

const buildUnionPeople = (
  staffRecords: StaffRawRecord[],
  contactsRecords: ContactsRawRecord[],
): UnionPerson[] => {
  // Group by normalizedNameHash (skip invalid names — track separately)
  const validStaff = staffRecords.filter((s) => !isInvalidPersonName(s.normalizedName))
  const validContacts = contactsRecords.filter((c) => !isInvalidPersonName(c.normalizedName))

  const invalidStaff = staffRecords.filter((s) => isInvalidPersonName(s.normalizedName))
  const invalidContacts = contactsRecords.filter((c) => isInvalidPersonName(c.normalizedName))

  const byHash = new Map<
    string,
    { staff: StaffRawRecord[]; contacts: ContactsRawRecord[] }
  >()

  for (const s of validStaff) {
    const entry = byHash.get(s.normalizedNameHash) ?? { staff: [], contacts: [] }
    entry.staff.push(s)
    byHash.set(s.normalizedNameHash, entry)
  }
  for (const c of validContacts) {
    const entry = byHash.get(c.normalizedNameHash) ?? { staff: [], contacts: [] }
    entry.contacts.push(c)
    byHash.set(c.normalizedNameHash, entry)
  }

  const result: UnionPerson[] = []

  for (const [hash, entry] of byHash) {
    const sample = entry.staff[0] ?? entry.contacts[0]!
    const sourceRowRefs: UnionPerson['sourceRowRefs'] = []
    const depts = new Set<string>()
    const roles = new Set<string>()
    let employeeNoHash: string | null = null
    let officePhoneHash: string | null = null
    let mobilePhoneHash: string | null = null
    let emailHash: string | null = null

    for (const s of entry.staff) {
      sourceRowRefs.push({
        source: 'staffDb',
        sourceTable: s.sourceTable,
        rowId: s.sourceRowId,
        department: s.department,
        title: s.titleOrRole,
      })
      if (s.department) depts.add(s.department)
      if (s.titleOrRole) roles.add(s.titleOrRole)
      if (!employeeNoHash && s.employeeNoHash) employeeNoHash = s.employeeNoHash
      if (!officePhoneHash && s.officePhoneHash) officePhoneHash = s.officePhoneHash
      if (!mobilePhoneHash && s.mobilePhoneHash) mobilePhoneHash = s.mobilePhoneHash
      if (!emailHash && s.emailHash) emailHash = s.emailHash
    }
    for (const c of entry.contacts) {
      sourceRowRefs.push({
        source: 'contactsXlsx',
        sourceSheet: c.sourceSheet,
        rowId: c.sourceRowNumber,
        department: c.department,
        title: c.roleOrTitle,
      })
      if (c.department) depts.add(c.department)
      if (c.roleOrTitle) roles.add(c.roleOrTitle)
      if (!officePhoneHash && c.officePhoneHash) officePhoneHash = c.officePhoneHash
      if (!mobilePhoneHash && c.mobilePhoneHash) mobilePhoneHash = c.mobilePhoneHash
      if (!emailHash && c.emailHash) emailHash = c.emailHash
    }

    // DUPLICATE_SOURCE_PERSON: more than one row from the same source
    // (i.e. staffDB has 2+ rows with the same normalizedName, or contacts
    // has 2+ rows with the same normalizedName). Two-source (staffDb + contactsXlsx)
    // is normal corroboration, not duplicate.
    const staffCount = entry.staff.length
    const contactsCount = entry.contacts.length
    const hasIntraSourceDuplicate = staffCount > 1 || contactsCount > 1

    const sourcePresence: UnionPerson['sourcePresence'] =
      staffCount > 0 && contactsCount > 0 ? 'both' : staffCount > 0 ? 'staffDb' : 'contactsXlsx'

    const reasonCodes: string[] = []
    if (sourcePresence === 'both') reasonCodes.push('CORROBORATED_BY_BOTH_SOURCES')
    if (hasIntraSourceDuplicate) reasonCodes.push('INTRA_SOURCE_DUPLICATE')

    result.push({
      personKey: hash,
      rawName: sample.rawName,
      normalizedName: sample.normalizedName,
      normalizedNameHash: hash,
      sourcePresence,
      sourceRowRefs,
      departments: [...depts],
      roles: [...roles],
      employeeNoHash,
      officePhoneHash,
      mobilePhoneHash,
      emailHash,
      matchedTeacherId: null,
      matchedTeacherNameHash: null,
      coverageStatus: 'SAFE_CREATE_TEACHER', // placeholder; replaced after DB match
      confidenceBand: 'HIGH',
      reasonCodes,
    })
  }

  // Emit invalid persons as separate entries with INVALID_PERSON_RECORD status
  for (const s of invalidStaff) {
    const key = `invalid-staff-${s.sourceRowId}-${sha256(s.rawName)}`
    result.push({
      personKey: key,
      rawName: s.rawName,
      normalizedName: s.normalizedName || s.rawName,
      normalizedNameHash: sha256(s.normalizedName || s.rawName),
      sourcePresence: 'staffDb',
      sourceRowRefs: [
        {
          source: 'staffDb',
          sourceTable: s.sourceTable,
          rowId: s.sourceRowId,
          department: s.department,
          title: s.titleOrRole,
        },
      ],
      departments: s.department ? [s.department] : [],
      roles: s.titleOrRole ? [s.titleOrRole] : [],
      employeeNoHash: s.employeeNoHash || null,
      officePhoneHash: s.officePhoneHash || null,
      mobilePhoneHash: s.mobilePhoneHash || null,
      emailHash: s.emailHash || null,
      matchedTeacherId: null,
      matchedTeacherNameHash: null,
      coverageStatus: 'INVALID_PERSON_RECORD',
      confidenceBand: 'HIGH',
      reasonCodes: ['INVALID_NAME'],
    })
  }
  for (const c of invalidContacts) {
    const key = `invalid-contacts-${c.sourceSheet}-${c.sourceRowNumber}-${sha256(c.rawName)}`
    result.push({
      personKey: key,
      rawName: c.rawName,
      normalizedName: c.normalizedName || c.rawName,
      normalizedNameHash: sha256(c.normalizedName || c.rawName),
      sourcePresence: 'contactsXlsx',
      sourceRowRefs: [
        {
          source: 'contactsXlsx',
          sourceSheet: c.sourceSheet,
          rowId: c.sourceRowNumber,
          department: c.department,
          title: c.roleOrTitle,
        },
      ],
      departments: c.department ? [c.department] : [],
      roles: c.roleOrTitle ? [c.roleOrTitle] : [],
      employeeNoHash: null,
      officePhoneHash: c.officePhoneHash || null,
      mobilePhoneHash: c.mobilePhoneHash || null,
      emailHash: c.emailHash || null,
      matchedTeacherId: null,
      matchedTeacherNameHash: null,
      coverageStatus: 'INVALID_PERSON_RECORD',
      confidenceBand: 'HIGH',
      reasonCodes: ['INVALID_NAME'],
    })
  }

  return result
}

// ── Stage 4: Match against DB Teacher ───────────────────────────────────────

const matchUnionToTeacher = (
  union: UnionPerson[],
  dbTeachers: Array<{ id: number; name: string }>,
): void => {
  // Build teacher index by normalizedNameHash
  const teacherByHash = new Map<string, Array<{ id: number; name: string }>>()
  for (const t of dbTeachers) {
    const norm = normalizePersonName(t.name)
    const h = sha256(norm)
    const arr = teacherByHash.get(h) ?? []
    arr.push({ id: t.id, name: t.name })
    teacherByHash.set(h, arr)
  }

  for (const u of union) {
    if (u.coverageStatus === 'INVALID_PERSON_RECORD') continue
    const matches = teacherByHash.get(u.normalizedNameHash) ?? []
    if (matches.length === 1) {
      u.matchedTeacherId = matches[0]!.id
      u.matchedTeacherNameHash = sha256(matches[0]!.name)
      // ALREADY_IN_TEACHER takes precedence over DUPLICATE_SOURCE_PERSON
      u.coverageStatus = 'ALREADY_IN_TEACHER'
      u.confidenceBand = 'HIGH'
    } else if (matches.length > 1) {
      u.matchedTeacherId = matches[0]!.id
      u.matchedTeacherNameHash = sha256(matches[0]!.name)
      u.coverageStatus = 'AMBIGUOUS_EXISTING_TEACHER_MATCH'
      u.confidenceBand = 'LOW'
      u.reasonCodes.push('MULTIPLE_DB_TEACHER_MATCH')
    } else {
      // No DB match. Determine SAFE_CREATE_TEACHER vs NEEDS_MANUAL_REVIEW
      // vs DUPLICATE_SOURCE_PERSON.
      if (u.reasonCodes.includes('INTRA_SOURCE_DUPLICATE')) {
        u.coverageStatus = 'DUPLICATE_SOURCE_PERSON'
        u.confidenceBand = 'HIGH'
      } else if (u.sourceRowRefs.length === 1) {
        // Single source, no DB match: SAFE_CREATE_TEACHER if at least one
        // of the source rows carries an employeeNo OR a phone hash OR an
        // email hash (so we have SOME corroborating evidence). If NONE of
        // those exist, route to NEEDS_MANUAL_REVIEW.
        const hasEvidence =
          (u.employeeNoHash ?? '') !== '' ||
          (u.officePhoneHash ?? '') !== '' ||
          (u.mobilePhoneHash ?? '') !== '' ||
          (u.emailHash ?? '') !== ''
        if (hasEvidence) {
          u.coverageStatus = 'SAFE_CREATE_TEACHER'
          u.confidenceBand = 'HIGH'
        } else {
          u.coverageStatus = 'NEEDS_MANUAL_REVIEW'
          u.confidenceBand = 'MEDIUM'
          u.reasonCodes.push('NO_CORROBORATING_HASH')
        }
      } else {
        // 2+ source rows from different sources (staffDb + contactsXlsx) — corroborated
        u.coverageStatus = 'SAFE_CREATE_TEACHER'
        u.confidenceBand = 'HIGH'
      }
    }
  }
}

// ── Stage 5: DB-only Teacher audit ─────────────────────────────────────────

type DbOnlyTeacher = {
  teacherId: number
  teacherNameHash: string
  sourcePresence: 'NONE'
  reasonCodes: string[]
}

const auditDbOnlyTeachers = (
  dbTeachers: Array<{ id: number; name: string }>,
  union: UnionPerson[],
): DbOnlyTeacher[] => {
  const sourceHashes = new Set(union.map((u) => u.normalizedNameHash))
  const result: DbOnlyTeacher[] = []
  for (const t of dbTeachers) {
    const norm = normalizePersonName(t.name)
    const h = sha256(norm)
    if (!sourceHashes.has(h)) {
      result.push({
        teacherId: t.id,
        teacherNameHash: sha256(t.name),
        sourcePresence: 'NONE',
        reasonCodes: ['DB_ONLY_NOT_IN_STAFF_OR_CONTACTS'],
      })
    }
  }
  return result
}

// ── Stage 6: Teacher schema writable fields ────────────────────────────────

type TeacherSchemaInfo = {
  modelName: string
  fields: Array<{ name: string; type: string; required: boolean; unique: boolean }>
  uniqueConstraints: string[]
  relations: string[]
  canWriteDepartment: boolean
  canWritePosition: boolean
  canWritePhone: boolean
  canWriteOfficePhone: boolean
  canWriteEmployeeNo: boolean
  canWriteRank: boolean
  minimumRequiredForCreate: string[]
  proposedCreatePayloadShape: Record<string, 'String?' | 'String' | 'Int'>
}

const detectTeacherSchema = (): TeacherSchemaInfo => {
  // Hardcoded read of the current Prisma schema (read-only inspection).
  // Updated by L6-E1C; the fields below mirror prisma/schema.prisma lines 51-66.
  return {
    modelName: 'Teacher',
    fields: [
      { name: 'id', type: 'Int', required: false, unique: true },
      { name: 'name', type: 'String', required: true, unique: true },
      { name: 'employeeNo', type: 'String?', required: false, unique: false },
      { name: 'department', type: 'String?', required: false, unique: false },
      { name: 'position', type: 'String?', required: false, unique: false },
      { name: 'rank', type: 'String?', required: false, unique: false },
      { name: 'phone', type: 'String?', required: false, unique: false },
      { name: 'officePhone', type: 'String?', required: false, unique: false },
      { name: 'createdAt', type: 'DateTime', required: false, unique: false },
      { name: 'updatedAt', type: 'DateTime', required: false, unique: false },
    ],
    uniqueConstraints: ['name (UNIQUE)'],
    relations: ['tasks (TeachingTask[])', 'via teacherId in TeachingTask'],
    canWriteDepartment: true,
    canWritePosition: true,
    canWritePhone: true,
    canWriteOfficePhone: true,
    canWriteEmployeeNo: true,
    canWriteRank: true,
    minimumRequiredForCreate: ['name'],
    proposedCreatePayloadShape: {
      name: 'String',
      employeeNo: 'String?',
      department: 'String?',
      position: 'String?',
      rank: 'String?',
      phone: 'String?',
      officePhone: 'String?',
    },
  }
}

// ── Stage 7: Build planned create payload (read-only shape) ────────────────

type PlannedCreatePayload = {
  name: string
  employeeNo?: string | null
  department?: string | null
  position?: string | null
  rank?: string | null
  phone?: string | null
  officePhone?: string | null
}

/**
 * Compute the planned create payload from a union person's source evidence.
 * Raw values stay LOCAL ONLY (do not commit them). The committed docs only
 * reference field names and counts.
 */
const buildPlannedPayload = (
  u: UnionPerson,
  staffByHash: Map<string, StaffRawRecord>,
): PlannedCreatePayload | null => {
  if (u.coverageStatus !== 'SAFE_CREATE_TEACHER') return null
  const payload: PlannedCreatePayload = { name: u.normalizedName }
  // Prefer staffDb record (richer: has employeeNo); fall back to contacts record.
  const staff = [...u.sourceRowRefs]
    .map((r) => (r.source === 'staffDb' ? staffByHash.get(u.normalizedNameHash) : null))
    .find((x): x is StaffRawRecord => !!x)
  if (staff) {
    if (staff.employeeNo) payload.employeeNo = staff.employeeNo
    if (staff.department) payload.department = staff.department
    if (staff.titleOrRole) payload.position = staff.titleOrRole
    if (staff.rank) payload.rank = staff.rank
    if (staff.mobilePhone) payload.phone = staff.mobilePhone
    if (staff.officePhone) payload.officePhone = staff.officePhone
  }
  return payload
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help || !args.staffDb || !args.contactsXlsx || !args.targetSemesterId) {
    usage()
    process.exit(args.help ? 0 : 1)
  }
  if (!existsSync(args.staffDb)) {
    console.error(`ERROR: staff-db not found: ${args.staffDb}`)
    process.exit(2)
  }
  if (!existsSync(args.contactsXlsx)) {
    console.error(`ERROR: contacts-xlsx not found: ${args.contactsXlsx}`)
    process.exit(2)
  }
  if (!existsSync(ARTIFACT_DIR)) mkdirSync(ARTIFACT_DIR, { recursive: true })

  console.log(`=== ${STAGE} ===\n`)
  console.log(`Teacher semantic decision: ${TEACHER_SEMANTIC_DECISION}`)

  const prisma = new PrismaClient()

  // ── Baseline BEFORE (read-only) ─────────────────────────────────────
  const baselineBefore = {
    course: await prisma.course.count(),
    teacher: await prisma.teacher.count(),
    classGroupSem1: await prisma.classGroup.count({ where: { semesterId: 1 } }),
    classGroupSem4: await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } }),
    teachingTaskSem4: await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } }),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    scheduleSlotSem4: await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } }),
    scheduleAdjustmentSem4: await prisma.scheduleAdjustment.count({ where: { semesterId: args.targetSemesterId } }),
    importBatchTotal: await prisma.importBatch.count(),
  }
  const ib39before = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40before = await prisma.importBatch.findUnique({ where: { id: 40 } }).catch(() => null)
  console.log(
    `[baseline-before] Course=${baselineBefore.course} Teacher=${baselineBefore.teacher} CG_sem1=${baselineBefore.classGroupSem1} CG_sem4=${baselineBefore.classGroupSem4} TT_sem4=${baselineBefore.teachingTaskSem4} TTC=${baselineBefore.teachingTaskClass} SS_sem4=${baselineBefore.scheduleSlotSem4} SA_sem4=${baselineBefore.scheduleAdjustmentSem4} IB=${baselineBefore.importBatchTotal} IB39=${ib39before?.status ?? 'MISSING'} IB40=${ib40before ? 'EXISTS' : 'absent'}`,
  )

  // ── 1. Staff DB ─────────────────────────────────────────────────────
  console.log('\n[1/6] Staff DB')
  const staff = readStaffDb(args.staffDb)
  console.log(`  tables: ${staff.tableCount} (${staff.tableNames.join(', ')})`)
  console.log(`  records: ${staff.recordCount}`)

  // ── 2. Contacts xlsx ────────────────────────────────────────────────
  console.log('\n[2/6] Contacts xlsx')
  const contacts = await readContactsXlsx(args.contactsXlsx)
  console.log(`  sheets: ${contacts.sheetCount}`)
  console.log(`  records: ${contacts.recordCount}`)

  // ── 3. Union people ─────────────────────────────────────────────────
  console.log('\n[3/6] Union people (normalizedNameHash key)')
  const union = buildUnionPeople(staff.records, contacts.records)
  console.log(`  union people: ${union.length}`)

  // ── 4. Match against DB Teacher ─────────────────────────────────────
  console.log('\n[4/6] Match union → DB Teacher')
  const dbTeachers = await prisma.teacher.findMany({ select: { id: true, name: true } })
  console.log(`  DB Teacher rows: ${dbTeachers.length}`)

  matchUnionToTeacher(union, dbTeachers)

  // Tally mutually exclusive coverageStatus counts
  const counts: Record<CoverageStatus, number> = {
    ALREADY_IN_TEACHER: 0,
    SAFE_CREATE_TEACHER: 0,
    NEEDS_MANUAL_REVIEW: 0,
    DUPLICATE_SOURCE_PERSON: 0,
    INVALID_PERSON_RECORD: 0,
    AMBIGUOUS_EXISTING_TEACHER_MATCH: 0,
  }
  for (const u of union) counts[u.coverageStatus]++

  console.log(`  already-in-Teacher: ${counts.ALREADY_IN_TEACHER}`)
  console.log(`  safe-create-Teacher: ${counts.SAFE_CREATE_TEACHER}`)
  console.log(`  needs-manual-review: ${counts.NEEDS_MANUAL_REVIEW}`)
  console.log(`  duplicate-source-person: ${counts.DUPLICATE_SOURCE_PERSON}`)
  console.log(`  invalid-person-record: ${counts.INVALID_PERSON_RECORD}`)
  console.log(`  ambiguous-existing-Teacher-match: ${counts.AMBIGUOUS_EXISTING_TEACHER_MATCH}`)

  const totalTallied = Object.values(counts).reduce((a, b) => a + b, 0)
  if (totalTallied !== union.length) {
    console.error(
      `FATAL: ALL_STAFF_CLASSIFICATION_NOT_MUTUALLY_EXCLUSIVE (tallied=${totalTallied} union=${union.length})`,
    )
    process.exit(3)
  }

  // ── 5. DB-only Teacher audit ────────────────────────────────────────
  console.log('\n[5/6] DB-only Teacher audit')
  const dbOnly = auditDbOnlyTeachers(dbTeachers, union)
  console.log(`  db-only Teacher (not in staff/contacts): ${dbOnly.length}`)

  // Duplicate normalized teacher detection in DB
  const teacherNormCount = new Map<string, number>()
  for (const t of dbTeachers) {
    const h = sha256(normalizePersonName(t.name))
    teacherNormCount.set(h, (teacherNormCount.get(h) ?? 0) + 1)
  }
  const dbTeacherDuplicateNormalizedCount = [...teacherNormCount.values()].filter((c) => c > 1).length
  console.log(`  DB Teacher duplicate normalized groups: ${dbTeacherDuplicateNormalizedCount}`)

  // ── 6. Teacher schema writable fields ───────────────────────────────
  console.log('\n[6/6] Teacher schema writable fields')
  const schemaInfo = detectTeacherSchema()
  console.log(`  fields: ${schemaInfo.fields.map((f) => f.name).join(', ')}`)
  console.log(`  minimum required: ${schemaInfo.minimumRequiredForCreate.join(', ')}`)
  console.log(`  can write department: ${schemaInfo.canWriteDepartment}`)
  console.log(`  can write position: ${schemaInfo.canWritePosition}`)
  console.log(`  can write phone: ${schemaInfo.canWritePhone}`)
  console.log(`  can write officePhone: ${schemaInfo.canWriteOfficePhone}`)
  console.log(`  can write employeeNo: ${schemaInfo.canWriteEmployeeNo}`)
  console.log(`  can write rank: ${schemaInfo.canWriteRank}`)

  // ── Build planned create payloads (LOCAL only) ──────────────────────
  // Map normalizedNameHash → first staff record (for richer evidence).
  const staffByHash = new Map<string, StaffRawRecord>()
  for (const s of staff.records) {
    if (!staffByHash.has(s.normalizedNameHash)) staffByHash.set(s.normalizedNameHash, s)
  }
  const safeCreateTeacherCandidates = union.filter((u) => u.coverageStatus === 'SAFE_CREATE_TEACHER')
  const needsManualReview = union.filter((u) => u.coverageStatus === 'NEEDS_MANUAL_REVIEW')
  const duplicateSourcePeople = union.filter((u) => u.coverageStatus === 'DUPLICATE_SOURCE_PERSON')
  const invalidPersonRecords = union.filter((u) => u.coverageStatus === 'INVALID_PERSON_RECORD')
  const ambiguousExistingTeacherMatch = union.filter((u) => u.coverageStatus === 'AMBIGUOUS_EXISTING_TEACHER_MATCH')
  const alreadyCoveredTeachers = union.filter((u) => u.coverageStatus === 'ALREADY_IN_TEACHER')

  const safeCreateWithPayload = safeCreateTeacherCandidates.map((u) => ({
    personKey: u.personKey,
    rawName: u.rawName,
    normalizedName: u.normalizedName,
    normalizedNameHash: u.normalizedNameHash,
    sourcePresence: u.sourcePresence,
    sourceEvidenceLocalOnly: {
      departments: u.departments,
      roles: u.roles,
      employeeNoHash: u.employeeNoHash,
      officePhoneHash: u.officePhoneHash,
      mobilePhoneHash: u.mobilePhoneHash,
      emailHash: u.emailHash,
    },
    plannedTeacherCreatePayload: buildPlannedPayload(u, staffByHash),
    riskFlags: u.reasonCodes,
    confidenceBand: u.confidenceBand,
  }))

  // ── Mutually-exclusive invariant check ─────────────────────────────
  // Note: ALREADY_IN_TEACHER + DB-only Teachers cover the DB side.
  // Total union people MUST equal sum of coverageStatus counts.
  console.log(`\n[invariant] mutually exclusive: union=${union.length} tallied=${totalTallied} PASS`)

  // ── Local raw artifacts (contain PII; gitignored) ──────────────────
  // Full union people list (with hashes + ref pointers, NOT raw names)
  const unionRawPath = join(ARTIFACT_DIR, 'all-staff-union-people.raw.local.json')
  writeFileSync(
    unionRawPath,
    JSON.stringify(
      {
        stage: STAGE,
        generatedAt: new Date().toISOString(),
        teacherSemanticDecision: TEACHER_SEMANTIC_DECISION,
        staffRecordCount: staff.recordCount,
        contactsRecordCount: contacts.recordCount,
        unionCount: union.length,
        union: union.map((u) => ({
          personKey: u.personKey,
          normalizedNameHash: u.normalizedNameHash,
          // rawName IS intentionally stored locally for human review (gitignored)
          rawName: u.rawName,
          sourcePresence: u.sourcePresence,
          sourceRowRefs: u.sourceRowRefs,
          departments: u.departments,
          roles: u.roles,
          employeeNoHash: u.employeeNoHash,
          officePhoneHash: u.officePhoneHash,
          mobilePhoneHash: u.mobilePhoneHash,
          emailHash: u.emailHash,
          matchedTeacherId: u.matchedTeacherId,
          matchedTeacherNameHash: u.matchedTeacherNameHash,
          coverageStatus: u.coverageStatus,
          confidenceBand: u.confidenceBand,
          reasonCodes: u.reasonCodes,
        })),
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  )
  console.log(`\n[artifact] union raw: ${unionRawPath}`)

  // Sync plan JSON (LOCAL only — contains planned payloads with raw values)
  const syncPlanPath = join(ARTIFACT_DIR, 'all-staff-teacher-sync-plan.local.json')
  writeFileSync(
    syncPlanPath,
    JSON.stringify(
      {
        stage: STAGE,
        generatedAt: new Date().toISOString(),
        teacherSemanticDecision: TEACHER_SEMANTIC_DECISION,
        schemaInfo,
        baselineBefore,
        counts,
        totalUnionPeople: union.length,
        dbTeacherCount: dbTeachers.length,
        dbTeacherDuplicateNormalizedCount,
        dbOnlyTeacherCount: dbOnly.length,
        dbOnlyTeacherList: dbOnly,
        safeCreateTeacherCandidates: safeCreateWithPayload,
        needsManualReview: needsManualReview.map((u) => ({
          personKey: u.personKey,
          normalizedNameHash: u.normalizedNameHash,
          rawName: u.rawName,
          sourcePresence: u.sourcePresence,
          departments: u.departments,
          roles: u.roles,
          reasonCodes: u.reasonCodes,
          confidenceBand: u.confidenceBand,
        })),
        duplicateSourcePeople: duplicateSourcePeople.map((u) => ({
          personKey: u.personKey,
          normalizedNameHash: u.normalizedNameHash,
          rawName: u.rawName,
          sourceRowRefs: u.sourceRowRefs,
          reasonCodes: u.reasonCodes,
        })),
        invalidPersonRecords: invalidPersonRecords.map((u) => ({
          personKey: u.personKey,
          rawName: u.rawName,
          sourceRowRefs: u.sourceRowRefs,
          reasonCodes: u.reasonCodes,
        })),
        alreadyCoveredTeachers: alreadyCoveredTeachers.map((u) => ({
          personKey: u.personKey,
          normalizedNameHash: u.normalizedNameHash,
          rawName: u.rawName,
          matchedTeacherId: u.matchedTeacherId,
          matchedTeacherNameHash: u.matchedTeacherNameHash,
        })),
        ambiguousExistingTeacherMatch: ambiguousExistingTeacherMatch.map((u) => ({
          personKey: u.personKey,
          normalizedNameHash: u.normalizedNameHash,
          rawName: u.rawName,
          matchedTeacherId: u.matchedTeacherId,
          reasonCodes: u.reasonCodes,
        })),
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  )
  console.log(`[artifact] sync plan json: ${syncPlanPath}`)

  // Sync plan XLSX workbook (LOCAL only — has raw values for human review)
  try {
    const wb = new ExcelJS.Workbook()
    wb.creator = STAGE
    wb.created = new Date()
    const ws = wb.addWorksheet('safeCreateTeacherCandidates')
    ws.columns = [
      { header: 'personKey', key: 'personKey', width: 30 },
      { header: 'normalizedNameHash', key: 'normalizedNameHash', width: 24 },
      { header: 'rawName', key: 'rawName', width: 20 },
      { header: 'sourcePresence', key: 'sourcePresence', width: 16 },
      { header: 'department', key: 'department', width: 24 },
      { header: 'position', key: 'position', width: 24 },
      { header: 'rank', key: 'rank', width: 16 },
      { header: 'phone', key: 'phone', width: 16 },
      { header: 'officePhone', key: 'officePhone', width: 16 },
      { header: 'employeeNo', key: 'employeeNo', width: 16 },
      { header: 'confidenceBand', key: 'confidenceBand', width: 12 },
      { header: 'reasonCodes', key: 'reasonCodes', width: 24 },
    ]
    for (const c of safeCreateWithPayload) {
      const p = c.plannedTeacherCreatePayload ?? { name: c.normalizedName }
      ws.addRow({
        personKey: c.personKey,
        normalizedNameHash: c.normalizedNameHash,
        rawName: c.rawName,
        sourcePresence: c.sourcePresence,
        department: p.department ?? '',
        position: p.position ?? '',
        rank: p.rank ?? '',
        phone: p.phone ?? '',
        officePhone: p.officePhone ?? '',
        employeeNo: p.employeeNo ?? '',
        confidenceBand: c.confidenceBand,
        reasonCodes: c.riskFlags.join('|'),
      })
    }
    const wsManual = wb.addWorksheet('needsManualReview')
    wsManual.columns = [
      { header: 'personKey', key: 'personKey', width: 30 },
      { header: 'normalizedNameHash', key: 'normalizedNameHash', width: 24 },
      { header: 'rawName', key: 'rawName', width: 20 },
      { header: 'sourcePresence', key: 'sourcePresence', width: 16 },
      { header: 'department', key: 'department', width: 24 },
      { header: 'reasonCodes', key: 'reasonCodes', width: 32 },
      { header: 'confidenceBand', key: 'confidenceBand', width: 16 },
    ]
    for (const u of needsManualReview) {
      wsManual.addRow({
        personKey: u.personKey,
        normalizedNameHash: u.normalizedNameHash,
        rawName: u.rawName,
        sourcePresence: u.sourcePresence,
        department: u.departments.join('|'),
        reasonCodes: u.reasonCodes.join('|'),
        confidenceBand: u.confidenceBand,
      })
    }
    const wsDbOnly = wb.addWorksheet('dbOnlyTeachers')
    wsDbOnly.columns = [
      { header: 'teacherId', key: 'teacherId', width: 12 },
      { header: 'teacherNameHash', key: 'teacherNameHash', width: 24 },
      { header: 'reasonCodes', key: 'reasonCodes', width: 48 },
    ]
    for (const t of dbOnly) {
      wsDbOnly.addRow({
        teacherId: t.teacherId,
        teacherNameHash: t.teacherNameHash,
        reasonCodes: t.reasonCodes.join('|'),
      })
    }
    const wbPath = join(ARTIFACT_DIR, 'all-staff-teacher-sync-plan.local.xlsx')
    await wb.xlsx.writeFile(wbPath)
    console.log(`[artifact] sync plan xlsx: ${wbPath}`)
  } catch (e) {
    console.warn(`WARN: failed to write xlsx artifact: ${(e as Error).message}`)
  }

  // ── Baseline AFTER (must equal before) ─────────────────────────────
  const baselineAfter = {
    course: await prisma.course.count(),
    teacher: await prisma.teacher.count(),
    classGroupSem1: await prisma.classGroup.count({ where: { semesterId: 1 } }),
    classGroupSem4: await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } }),
    teachingTaskSem4: await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } }),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    scheduleSlotSem4: await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } }),
    scheduleAdjustmentSem4: await prisma.scheduleAdjustment.count({ where: { semesterId: args.targetSemesterId } }),
    importBatchTotal: await prisma.importBatch.count(),
  }
  const ib39after = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40after = await prisma.importBatch.findUnique({ where: { id: 40 } }).catch(() => null)
  console.log(
    `[baseline-after]  Course=${baselineAfter.course} Teacher=${baselineAfter.teacher} CG_sem1=${baselineAfter.classGroupSem1} CG_sem4=${baselineAfter.classGroupSem4} TT_sem4=${baselineAfter.teachingTaskSem4} TTC=${baselineAfter.teachingTaskClass} SS_sem4=${baselineAfter.scheduleSlotSem4} SA_sem4=${baselineAfter.scheduleAdjustmentSem4} IB=${baselineAfter.importBatchTotal} IB39=${ib39after?.status ?? 'MISSING'} IB40=${ib40after ? 'EXISTS' : 'absent'}`,
  )

  const baselineUnchanged = JSON.stringify(baselineBefore) === JSON.stringify(baselineAfter)
  if (!baselineUnchanged) {
    console.error('FATAL: baseline drift detected')
    process.exit(2)
  }

  // ── Final summary ──────────────────────────────────────────────────
  const notRepresented = union.length - counts.ALREADY_IN_TEACHER
  const recommendedNextStage =
    counts.NEEDS_MANUAL_REVIEW + counts.AMBIGUOUS_EXISTING_TEACHER_MATCH + counts.DUPLICATE_SOURCE_PERSON > 0
      ? 'L8-B1-ALL-STAFF-TEACHER-MANUAL-REVIEW-WORKBOOK'
      : 'L8-B2-ALL-STAFF-TEACHER-CONTROLLED-SYNC-APPLY'

  console.log(`\n=== Summary ===`)
  console.log(`DB write: false`)
  console.log(`Baseline unchanged: ${baselineUnchanged ? 'YES' : 'NO'}`)
  console.log(`Union people: ${union.length}`)
  console.log(`  already-in-Teacher: ${counts.ALREADY_IN_TEACHER}`)
  console.log(`  not represented in Teacher: ${notRepresented}`)
  console.log(`  safe-create-Teacher: ${counts.SAFE_CREATE_TEACHER}`)
  console.log(`  needs-manual-review: ${counts.NEEDS_MANUAL_REVIEW}`)
  console.log(`  duplicate-source-person: ${counts.DUPLICATE_SOURCE_PERSON}`)
  console.log(`  invalid-person-record: ${counts.INVALID_PERSON_RECORD}`)
  console.log(`  ambiguous-existing-Teacher-match: ${counts.AMBIGUOUS_EXISTING_TEACHER_MATCH}`)
  console.log(`DB-only Teacher (review list, NOT deleted): ${dbOnly.length}`)
  console.log(`Recommended next stage: ${recommendedNextStage}`)
  console.log(`Local artifacts: ${ARTIFACT_DIR}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
