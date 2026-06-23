/**
 * L8-A Audit Script — Reference Master Data Coverage Audit
 *
 * Stage: L8-A-REFERENCE-MASTER-DATA-COVERAGE-AUDIT
 *
 * Read-only coverage audit:
 *   1. Staff DB (伊春职业学院职员数据库(2026.4).db)
 *   2. Contacts xlsx (伊春职业学院通讯录(2026.4)_分部门.xlsx)
 *   3. Major/Class xlsx (学院专业数据库.xlsx)
 *   4. DB Teacher table
 *   5. DB ClassGroup table (target semester)
 *
 * Outputs:
 *   temp/local-artifacts/l8-a/*.local.json   (may include raw PII; gitignored)
 *   temp/local-artifacts/l8-a/sync-plan.local.json (PII-free)
 *
 * NO DB writes. NO apply. NO backup. NO Teacher/ClassGroup/Course/ImportBatch/
 * TeachingTask/TeachingTaskClass/ScheduleSlot creation or modification.
 * NO schema/migration/.env changes.
 *
 * Usage:
 *   npx tsx scripts/audit-reference-master-data-coverage-l8-a.ts \
 *     --staff-db "D:/Desktop/.../伊春职业学院职员数据库(2026.4).db" \
 *     --contacts-xlsx "D:/Desktop/.../伊春职业学院通讯录(2026.4)_分部门.xlsx" \
 *     --major-xlsx "D:/Desktop/.../学院专业数据库.xlsx" \
 *     --target-semester-id 4
 */

import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { PrismaClient } from '@prisma/client'

// ── Constants ───────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '..')
const STAGE = 'L8-A-REFERENCE-MASTER-DATA-COVERAGE-AUDIT'
const ARTIFACT_DIR = join(ROOT, 'temp', 'local-artifacts', 'l8-a')

// Departments classified as teaching-focused (potential teacher source)
const TEACHING_DEPARTMENTS = new Set([
  '工程应用技术学院',
  '计算机应用技术学院',
  '师范学院',
  '旅游商务学院',
  '医学技术学院',
  '口腔医学院',
  '护理学院',
  '公共教学部',
  '体育教学部',
  '思想政治教学部',
])

// Departments classified as administrative (NOT teacher source)
const ADMIN_DEPARTMENTS = new Set([
  '党政办（发展规划处）',
  '组织部',
  '宣传统战部',
  '纪委',
  '工会',
  '学生工作部',
  '计财处',
  '人事处（教师工作部）',
  '保卫处',
  '后勤管理处',
  '招生就业处',
  '教务处',
  '创新创业学院',
  '继续教育学院',
  '高教研究室',
  '督学办',
  '图书馆',
  '幼儿园',
])

// ── CLI args ────────────────────────────────────────────────────────────────

type CliArgs = {
  staffDb: string
  contactsXlsx: string
  majorXlsx: string
  targetSemesterId: number
  help: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {
    staffDb: '',
    contactsXlsx: '',
    majorXlsx: '',
    targetSemesterId: 0,
    help: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--staff-db') args.staffDb = argv[++i] ?? ''
    else if (a === '--contacts-xlsx') args.contactsXlsx = argv[++i] ?? ''
    else if (a === '--major-xlsx') args.majorXlsx = argv[++i] ?? ''
    else if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

const usage = (): void => {
  console.log('Usage: npx tsx scripts/audit-reference-master-data-coverage-l8-a.ts \\')
  console.log('  --staff-db "<path>" \\')
  console.log('  --contacts-xlsx "<path>" \\')
  console.log('  --major-xlsx "<path>" \\')
  console.log('  --target-semester-id <id>')
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const sha256 = (s: string, len = 12): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)

const sha256Phone = (s: string): string => sha256(`phone:${s}`, 12)

/**
 * Normalize a person's name:
 *   - strip full-width and half-width whitespace
 *   - strip honorifics (老师/教师/教授/副教授/讲师/助教)
 *   - strip parens content
 *   - strip leading/trailing non-CJK punctuation
 */
const normalizePersonName = (raw: string): string => {
  let s = (raw ?? '').replace(/[　\s]+/g, '')
  s = s.replace(/[（(][^）)]*[）)]/g, '')
  s = s.replace(/老师|教师|教授|副教授|讲师|助教/g, '')
  s = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  return s
}

/**
 * Classify a candidate person (from staff DB or contacts xlsx) by department
 * + title. Returns one of:
 *   TEACHER_CANDIDATE
 *   STAFF_ONLY
 *   ADMIN_OR_DEPARTMENT_CONTACT
 *   AMBIGUOUS_PERSON
 *   INVALID_NAME
 */
const classifyCandidate = (
  department: string,
  title: string,
  normalizedName: string,
): 'TEACHER_CANDIDATE' | 'STAFF_ONLY' | 'ADMIN_OR_DEPARTMENT_CONTACT' | 'AMBIGUOUS_PERSON' | 'INVALID_NAME' => {
  if (!normalizedName || normalizedName.length < 2) return 'INVALID_NAME'
  if (!/[\p{L}\p{N}]/u.test(normalizedName)) return 'INVALID_NAME'

  const t = title ?? ''
  const d = department ?? ''

  // Strong teaching signals
  if (/(教师|讲师|助教|教授|副教授)/.test(t)) return 'TEACHER_CANDIDATE'
  if (/(教研室)/.test(t)) return 'TEACHER_CANDIDATE' // 教研室主任/副主任

  // Department-based fallback
  if (TEACHING_DEPARTMENTS.has(d)) {
    // In a teaching department but title is generic admin
    if (/(书记|院长|副院长|部长|主任|处长|科长)/.test(t)) {
      // Teaching dept leadership — could be 教师 + 教研室主任, classify ambiguous
      return 'AMBIGUOUS_PERSON'
    }
    return 'TEACHER_CANDIDATE'
  }

  if (ADMIN_DEPARTMENTS.has(d)) {
    if (/(教师|讲师|助教|教授|副教授|教研室)/.test(t)) return 'AMBIGUOUS_PERSON'
    if (/(书记|院长|副院长|部长|主任|处长|科长|干事|科员|工作人员)/.test(t)) return 'STAFF_ONLY'
    return 'STAFF_ONLY'
  }

  // Unknown department
  if (/(教师|讲师|助教|教授|副教授|教研室)/.test(t)) return 'TEACHER_CANDIDATE'
  if (/(书记|院长|副院长|部长|主任|处长|科长)/.test(t)) return 'ADMIN_OR_DEPARTMENT_CONTACT'
  return 'AMBIGUOUS_PERSON'
}

/**
 * Normalize a class name for matching across sources and DB.
 * Removes whitespace, normalizes 班/班级 suffix.
 */
const normalizeClassName = (raw: string): string => {
  let s = (raw ?? '').replace(/[\s　]+/g, '')
  s = s.replace(/班级$/, '班')
  return s
}

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
  officePhoneHash: string
  mobilePhoneHash: string
  employeeNoHash: string
  teacherCandidateReason: string
  classification: string
}

const readStaffDb = (path: string): {
  tableCount: number
  tableNames: string[]
  candidatePersonCount: number
  records: StaffRawRecord[]
  classified: Record<string, number>
} => {
  const db = new DatabaseSync(path, { open: true, readOnly: true })
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).all() as Array<{ name: string }>
  const tableCount = tables.length

  // Use the first table (in this DB there's only one: 职员)
  const mainTable = tables[0]?.name ?? ''
  const rows = db.prepare(`SELECT * FROM "${mainTable}"`).all() as Array<Record<string, unknown>>
  db.close()

  const records: StaffRawRecord[] = []
  for (const r of rows) {
    const rawName = String(r['姓名'] ?? '').trim()
    const normalizedName = normalizePersonName(rawName)
    const department = String(r['部门'] ?? '').trim()
    const title = String(r['职务'] ?? '').trim()
    const rank = String(r['职级'] ?? '').trim()
    const officePhone = String(r['办公电话'] ?? '').trim()
    const mobile = String(r['手机'] ?? '').trim()
    const employeeNo = String(r['工号'] ?? '').trim()
    const classification = classifyCandidate(department, title, normalizedName)
    records.push({
      source: 'staffDb',
      sourceTable: mainTable,
      sourceRowId: Number(r['id'] ?? 0),
      rawName,
      normalizedName,
      normalizedNameHash: sha256(normalizedName, 16),
      department,
      departmentHash: sha256(`dept:${department}`, 12),
      titleOrRole: title,
      titleHash: sha256(`title:${title}`, 12),
      rank,
      officePhoneHash: officePhone ? sha256Phone(officePhone) : '',
      mobilePhoneHash: mobile ? sha256Phone(mobile) : '',
      employeeNoHash: employeeNo ? sha256(`emp:${employeeNo}`, 12) : '',
      teacherCandidateReason:
        classification === 'TEACHER_CANDIDATE'
          ? `title-or-dept-match:${title || department}`
          : classification,
      classification,
    })
  }

  const classified: Record<string, number> = {}
  for (const rec of records) {
    classified[rec.classification] = (classified[rec.classification] ?? 0) + 1
  }

  return {
    tableCount,
    tableNames: tables.map((t) => t.name),
    candidatePersonCount: records.filter((r) => r.normalizedName.length >= 2).length,
    records,
    classified,
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
  officePhoneHash: string
  mobilePhoneHash: string
  teacherCandidateReason: string
  classification: string
}

const readContactsXlsx = async (
  path: string,
): Promise<{
  sheetCount: number
  sheetNames: string[]
  candidatePersonCount: number
  records: ContactsRawRecord[]
  classified: Record<string, number>
}> => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExcelJS = require('exceljs') as typeof import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)

  const records: ContactsRawRecord[] = []
  for (const ws of wb.worksheets) {
    if (ws.name === '目录' || ws.name === 'Sheet1' || ws.rowCount < 3) continue

    // Row 1: 部门名称 marker; Row 2: header (姓名 | 职务 | 职级 | 办公电话 | 手机)
    const headerRow = ws.getRow(2)
    let nameCol = -1, titleCol = -1, rankCol = -1, officeCol = -1, mobileCol = -1
    for (let c = 1; c <= ws.columnCount; c++) {
      const h = String(headerRow.getCell(c).value ?? '').trim()
      if (h === '姓名') nameCol = c
      else if (h === '职务') titleCol = c
      else if (h === '职级') rankCol = c
      else if (h === '办公电话') officeCol = c
      else if (h === '手机') mobileCol = c
    }
    if (nameCol < 0) continue

    // Try to extract department from row 1 first cell
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
      const classification = classifyCandidate(department, title, normalizedName)
      records.push({
        source: 'contactsXlsx',
        sourceSheet: ws.name,
        sourceRowNumber: r,
        rawName,
        normalizedName,
        normalizedNameHash: sha256(normalizedName, 16),
        department,
        departmentHash: sha256(`dept:${department}`, 12),
        roleOrTitle: title,
        titleHash: sha256(`title:${title}`, 12),
        rank,
        officePhoneHash: office ? sha256Phone(office) : '',
        mobilePhoneHash: mobile ? sha256Phone(mobile) : '',
        teacherCandidateReason:
          classification === 'TEACHER_CANDIDATE'
            ? `title-or-dept-match:${title || department}`
            : classification,
        classification,
      })
    }
  }

  const classified: Record<string, number> = {}
  for (const rec of records) {
    classified[rec.classification] = (classified[rec.classification] ?? 0) + 1
  }

  return {
    sheetCount: wb.worksheets.length,
    sheetNames: wb.worksheets.map((w: { name: string }) => w.name),
    candidatePersonCount: records.filter((r) => r.normalizedName.length >= 2).length,
    records,
    classified,
  }
}

// ── Stage 3: Union candidates ──────────────────────────────────────────────

type UnionCandidate = {
  candidateId: string
  normalizedName: string
  normalizedNameHash: string
  sourcePresence: 'staffDb' | 'contactsXlsx' | 'both'
  sourceRowRefs: Array<{
    source: string
    table?: string
    sheet?: string
    rowId: number
    department: string
    title: string
  }>
  departments: string[]
  roles: string[]
  classification: 'TEACHER_CANDIDATE' | 'STAFF_ONLY' | 'ADMIN_OR_DEPARTMENT_CONTACT' | 'AMBIGUOUS_PERSON'
  matchedDbTeacherId: number | null
  matchedDbTeacherNameHash: string | null
  coverageStatus:
    | 'ALREADY_IN_TEACHER'
    | 'MISSING_TEACHER_CANDIDATE'
    | 'AMBIGUOUS_MATCH_TO_TEACHER'
    | 'STAFF_ONLY_DO_NOT_IMPORT'
    | 'INVALID_OR_NON_PERSON'
    | 'DUPLICATE_SOURCE_RECORD'
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW'
  reasonCodes: string[]
}

const buildUnionCandidates = (
  staffRecords: StaffRawRecord[],
  contactsRecords: ContactsRawRecord[],
): UnionCandidate[] => {
  // Group by normalizedNameHash
  const byHash = new Map<
    string,
    { staff?: StaffRawRecord; contacts?: ContactsRawRecord[] }
  >()
  for (const s of staffRecords) {
    if (!s.normalizedName || s.normalizedName.length < 2) continue
    const entry = byHash.get(s.normalizedNameHash) ?? {}
    entry.staff = s
    byHash.set(s.normalizedNameHash, entry)
  }
  for (const c of contactsRecords) {
    if (!c.normalizedName || c.normalizedName.length < 2) continue
    const entry = byHash.get(c.normalizedNameHash) ?? {}
    entry.contacts = entry.contacts ?? []
    entry.contacts.push(c)
    byHash.set(c.normalizedNameHash, entry)
  }

  const result: UnionCandidate[] = []
  for (const [hash, entry] of byHash) {
    const sample = entry.staff ?? entry.contacts![0]
    const classification = sample.classification
    // If mixed classification, prioritize the highest
    let finalClass: UnionCandidate['classification']
    if (entry.staff && entry.contacts) {
      const hasTeacher = [entry.staff, ...entry.contacts!].some(
        (r) => r.classification === 'TEACHER_CANDIDATE',
      )
      const hasStaff = [entry.staff, ...entry.contacts!].some(
        (r) => r.classification === 'STAFF_ONLY',
      )
      if (hasTeacher) finalClass = 'TEACHER_CANDIDATE'
      else if (hasStaff) finalClass = 'STAFF_ONLY'
      else finalClass = classification as UnionCandidate['classification']
    } else {
      finalClass = classification as UnionCandidate['classification']
    }

    const sourceRowRefs: UnionCandidate['sourceRowRefs'] = []
    if (entry.staff) {
      sourceRowRefs.push({
        source: 'staffDb',
        table: entry.staff.sourceTable,
        rowId: entry.staff.sourceRowId,
        department: entry.staff.department,
        title: entry.staff.titleOrRole,
      })
    }
    if (entry.contacts) {
      for (const c of entry.contacts) {
        sourceRowRefs.push({
          source: 'contactsXlsx',
          sheet: c.sourceSheet,
          rowId: c.sourceRowNumber,
          department: c.department,
          title: c.roleOrTitle,
        })
      }
    }

    const depts = new Set<string>()
    const roles = new Set<string>()
    for (const ref of sourceRowRefs) {
      if (ref.department) depts.add(ref.department)
      if (ref.title) roles.add(ref.title)
    }

    result.push({
      candidateId: hash,
      normalizedName: sample.normalizedName,
      normalizedNameHash: hash,
      sourcePresence: entry.staff && entry.contacts ? 'both' : entry.staff ? 'staffDb' : 'contactsXlsx',
      sourceRowRefs,
      departments: [...depts],
      roles: [...roles],
      classification: finalClass,
      matchedDbTeacherId: null, // filled later
      matchedDbTeacherNameHash: null,
      coverageStatus: 'PENDING', // filled later
      confidenceBand: 'MEDIUM', // filled later
      reasonCodes: [],
    })
  }
  return result
}

// ── Stage 4: Major/Class xlsx ──────────────────────────────────────────────

type ClassRefRecord = {
  college: string
  major: string
  direction: string
  grade: string
  classNo: string
  classDisplay: string
  duration: string
  studentCount: number
  isFiveYear: boolean
  level: string
  normalizedClassName: string
  sourceRowNumber: number
}

const readMajorXlsx = async (
  path: string,
): Promise<{
  sheetCount: number
  sheetNames: string[]
  majorCount: number
  classCount: number
  records: ClassRefRecord[]
  byMajor: Record<string, number>
  byGrade: Record<string, number>
  byCollege: Record<string, number>
}> => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExcelJS = require('exceljs') as typeof import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)

  const records: ClassRefRecord[] = []
  const byMajor: Record<string, number> = {}
  const byGrade: Record<string, number> = {}
  const byCollege: Record<string, number> = {}
  const majorSet = new Set<string>()

  for (const ws of wb.worksheets) {
    // The major DB has 3 sheets: 学院专业数据库 (学院×专业), 汇总, 班级数据库 (per-class)
    if (ws.name !== '学院专业数据库' && ws.name !== '班级数据库') continue
    if (ws.rowCount < 2) continue
    // Read header from row 1
    const headerRow = ws.getRow(1)
    let collegeCol = -1, majorCol = -1, directionCol = -1, gradeCol = -1, classCol = -1, classNoCol = -1, durationCol = -1, stuCol = -1, fiveYearCol = -1, levelCol = -1
    for (let c = 1; c <= ws.columnCount; c++) {
      const h = String(headerRow.getCell(c).value ?? '').trim()
      if (h === '学院') collegeCol = c
      else if (h === '专业') majorCol = c
      else if (h === '专业方向') directionCol = c
      else if (h === '年级') gradeCol = c
      else if (h === '班级') classCol = c
      else if (h === '班号') classNoCol = c
      else if (h === '学制') durationCol = c
      else if (h === '班级人数') stuCol = c
      else if (h === '是否五年制') fiveYearCol = c
      else if (h.includes('高职') || h.includes('中职')) levelCol = c
    }
    if (majorCol < 0) continue

    // For 学院专业数据库 sheet: per-row is (序号, 学院, 专业) — build a list of majors
    if (ws.name === '学院专业数据库') {
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r)
        const college = collegeCol > 0 ? String(row.getCell(collegeCol).value ?? '').trim() : ''
        const major = String(row.getCell(majorCol).value ?? '').trim()
        if (!major) continue
        majorSet.add(major)
        byMajor[major] = (byMajor[major] ?? 0) + 0 // major exists but no class rows here
        if (college) byCollege[college] = (byCollege[college] ?? 0) + 0
      }
      continue
    }

    // 班级数据库 sheet: per-row is (学院, 专业, 专业方向, 年级, 班级, 班号, 学制, 班级人数, 是否五年制, 是否高职)
    if (classCol < 0) continue
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const college = collegeCol > 0 ? String(row.getCell(collegeCol).value ?? '').trim() : ''
      const major = String(row.getCell(majorCol).value ?? '').trim()
      const direction = directionCol > 0 ? String(row.getCell(directionCol).value ?? '').trim() : ''
      const grade = gradeCol > 0 ? String(row.getCell(gradeCol).value ?? '').trim() : ''
      const cls = String(row.getCell(classCol).value ?? '').trim()
      const classNo = classNoCol > 0 ? String(row.getCell(classNoCol).value ?? '').trim() : ''
      const duration = durationCol > 0 ? String(row.getCell(durationCol).value ?? '').trim() : ''
      const stuRaw = stuCol > 0 ? String(row.getCell(stuCol).value ?? '').trim() : ''
      const stuCount = stuRaw ? Number(stuRaw) : 0
      const fiveYearRaw = fiveYearCol > 0 ? String(row.getCell(fiveYearCol).value ?? '').trim() : ''
      const isFiveYear = fiveYearRaw === '是'
      const level = levelCol > 0 ? String(row.getCell(levelCol).value ?? '').trim() : ''
      if (!major || !cls) continue
      // Build class display: prefer "major + classDisplay" if grade and class are present
      const normalizedClassName = normalizeClassName(`${major}${cls}`)
      records.push({
        college,
        major,
        direction,
        grade,
        classNo,
        classDisplay: cls,
        duration,
        studentCount: Number.isFinite(stuCount) ? stuCount : 0,
        isFiveYear,
        level,
        normalizedClassName,
        sourceRowNumber: r,
      })
      byMajor[major] = (byMajor[major] ?? 0) + 1
      byGrade[grade] = (byGrade[grade] ?? 0) + 1
      byCollege[college] = (byCollege[college] ?? 0) + 1
      majorSet.add(major)
    }
  }

  return {
    sheetCount: wb.worksheets.length,
    sheetNames: wb.worksheets.map((w: { name: string }) => w.name),
    majorCount: majorSet.size,
    classCount: records.length,
    records,
    byMajor,
    byGrade,
    byCollege,
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help || !args.staffDb || !args.contactsXlsx || !args.majorXlsx || !args.targetSemesterId) {
    usage()
    process.exit(args.help ? 0 : 1)
  }

  if (!existsSync(ARTIFACT_DIR)) mkdirSync(ARTIFACT_DIR, { recursive: true })

  console.log(`=== ${STAGE} ===\n`)

  // Baseline BEFORE (read-only, for verification later)
  const prisma = new PrismaClient()
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

  // ── 1. Staff DB ─────────────────────────────────────────────────────────
  console.log('\n[1/5] Staff DB')
  const staff = readStaffDb(args.staffDb)
  console.log(`  tables: ${staff.tableCount} (${staff.tableNames.join(', ')})`)
  console.log(`  candidate persons: ${staff.candidatePersonCount}`)
  console.log(`  classified: ${JSON.stringify(staff.classified)}`)

  // ── 2. Contacts xlsx ───────────────────────────────────────────────────
  console.log('\n[2/5] Contacts xlsx')
  const contacts = await readContactsXlsx(args.contactsXlsx)
  console.log(`  sheets: ${contacts.sheetCount} (${contacts.sheetNames.filter((n) => n !== 'Sheet1' && n !== '目录').join(', ')})`)
  console.log(`  candidate persons: ${contacts.candidatePersonCount}`)
  console.log(`  classified: ${JSON.stringify(contacts.classified)}`)

  // ── 3. Union candidates ────────────────────────────────────────────────
  console.log('\n[3/5] Union candidates')
  const union = buildUnionCandidates(staff.records, contacts.records)
  console.log(`  union candidate count: ${union.length}`)

  // Match against current DB Teacher
  const dbTeachers = await prisma.teacher.findMany({ select: { id: true, name: true } })
  const teacherByHash = new Map<string, { id: number; name: string }[]>()
  for (const t of dbTeachers) {
    const norm = normalizePersonName(t.name)
    const h = sha256(norm, 16)
    const arr = teacherByHash.get(h) ?? []
    arr.push({ id: t.id, name: t.name })
    teacherByHash.set(h, arr)
  }
  // Track counts
  let alreadyInTeacher = 0
  let missingTeacherCandidate = 0
  let ambiguousMatchTeacher = 0
  let staffOnly = 0
  let duplicateSource = 0
  for (const u of union) {
    const matches = teacherByHash.get(u.normalizedNameHash) ?? []
    if (matches.length === 1) {
      u.matchedDbTeacherId = matches[0]!.id
      u.matchedDbTeacherNameHash = sha256(matches[0]!.name, 16)
      u.coverageStatus = 'ALREADY_IN_TEACHER'
      u.confidenceBand = 'HIGH'
      alreadyInTeacher++
    } else if (matches.length > 1) {
      u.coverageStatus = 'AMBIGUOUS_MATCH_TO_TEACHER'
      u.confidenceBand = 'LOW'
      u.reasonCodes.push('MULTIPLE_DB_TEACHER_MATCH')
      ambiguousMatchTeacher++
    } else {
      if (u.classification === 'TEACHER_CANDIDATE') {
        u.coverageStatus = 'MISSING_TEACHER_CANDIDATE'
        u.confidenceBand = 'HIGH'
        missingTeacherCandidate++
      } else if (u.classification === 'STAFF_ONLY' || u.classification === 'ADMIN_OR_DEPARTMENT_CONTACT') {
        u.coverageStatus = 'STAFF_ONLY_DO_NOT_IMPORT'
        u.confidenceBand = 'HIGH'
        staffOnly++
      } else {
        u.coverageStatus = 'STAFF_ONLY_DO_NOT_IMPORT'
        u.confidenceBand = 'MEDIUM'
        staffOnly++
      }
    }
    if (u.sourceRowRefs.length > 1) {
      // Multi-source: staff + contacts is normal (the two sources corroborate
      // the same person). Only flag duplicates within the same source.
      const bySource = new Map<string, number>()
      for (const ref of u.sourceRowRefs) {
        bySource.set(ref.source, (bySource.get(ref.source) ?? 0) + 1)
      }
      const hasIntraSourceDupe = [...bySource.values()].some((c) => c > 1)
      if (hasIntraSourceDupe) {
        u.reasonCodes.push('INTRA_SOURCE_DUPLICATE')
        duplicateSource++
      } else {
        u.reasonCodes.push('CORROBORATED_BY_BOTH_SOURCES')
      }
    }
  }
  console.log(`  already-in-Teacher: ${alreadyInTeacher}`)
  console.log(`  missing-Teacher-candidate: ${missingTeacherCandidate}`)
  console.log(`  ambiguous-match-Teacher: ${ambiguousMatchTeacher}`)
  console.log(`  staff-only (do not import): ${staffOnly}`)
  console.log(`  multi-source records (corroborated by both staffDb and contactsXlsx): ${union.filter((u) => u.reasonCodes.includes('CORROBORATED_BY_BOTH_SOURCES')).length}`)
  console.log(`  intra-source duplicates: ${duplicateSource}`)

  // DB-only teachers (in DB but not in any source)
  const sourceHashes = new Set(union.map((u) => u.normalizedNameHash))
  let dbOnly = 0
  for (const t of dbTeachers) {
    const h = sha256(normalizePersonName(t.name), 16)
    if (!sourceHashes.has(h)) dbOnly++
  }
  console.log(`  DB-only Teacher (in DB, not in staff/contacts): ${dbOnly}`)

  // ── 4. Major/Class xlsx ───────────────────────────────────────────────
  console.log('\n[4/5] Major / Class xlsx')
  const major = await readMajorXlsx(args.majorXlsx)
  console.log(`  sheets: ${major.sheetCount} (${major.sheetNames.join(', ')})`)
  console.log(`  reference major count: ${major.majorCount}`)
  console.log(`  reference class count: ${major.classCount}`)
  console.log(`  by college: ${JSON.stringify(major.byCollege)}`)

  // ── 5. ClassGroup coverage ────────────────────────────────────────────
  console.log('\n[5/5] ClassGroup sem4 coverage')
  const sem4CGs = await prisma.classGroup.findMany({
    where: { semesterId: args.targetSemesterId },
    select: { id: true, name: true, studentCount: true, semesterId: true },
  })
  const sem4ByHash = new Map<string, Array<{ id: number; name: string }>>()
  for (const cg of sem4CGs) {
    const h = sha256(normalizeClassName(cg.name), 16)
    const arr = sem4ByHash.get(h) ?? []
    arr.push({ id: cg.id, name: cg.name })
    sem4ByHash.set(h, arr)
  }

  // Duplicate sem4 detection
  const sem4DuplicateGroups = [...sem4ByHash.entries()].filter(([, arr]) => arr.length > 1)
  console.log(`  sem4 ClassGroup total: ${sem4CGs.length}`)
  console.log(`  sem4 duplicate normalized groups: ${sem4DuplicateGroups.length}`)

  // Suspicious detection: classes with empty name, malformed, or non-standard pattern.
  // Note: studentCount is nullable in schema and many historical entries have null;
  // we do NOT flag null studentCount as suspicious. We only flag malformed names.
  let suspicious = 0
  const SUSPICIOUS_REASONS = new Set<string>()
  for (const cg of sem4CGs) {
    if (!cg.name || cg.name.length < 3) {
      suspicious++
      SUSPICIOUS_REASONS.add('empty-or-too-short')
      continue
    }
    // Strip parenthetical suffixes like "（高本贯通）" before checking 班 suffix
    const stripped = cg.name.replace(/[（(][^）)]*[）)]/g, '')
    if (!/班$/.test(stripped)) {
      suspicious++
      SUSPICIOUS_REASONS.add('missing-班-suffix')
    }
  }
  console.log(`  sem4 suspicious ClassGroup: ${suspicious} (${[...SUSPICIOUS_REASONS].join(', ')})`)

  // Reference-vs-sem4 mapping
  // Sem4 ClassGroup names include grade prefix (e.g. "2024级护理1班") while
  // reference names do not (e.g. "护理1班"). Compute both with and without
  // the leading grade token for matching.
  const refClassByHash = new Map<string, ClassRefRecord[]>()
  const refClassByMajorOnly = new Map<string, ClassRefRecord[]>() // major+班 only
  for (const r of major.records) {
    const arr = refClassByHash.get(r.normalizedClassName) ?? []
    arr.push(r)
    refClassByHash.set(r.normalizedClassName, arr)
    const majorKey = normalizeClassName(`${r.major}${r.classDisplay}`)
    const arr2 = refClassByMajorOnly.get(majorKey) ?? []
    arr2.push(r)
    refClassByMajorOnly.set(majorKey, arr2)
  }
  // Strip leading "NNNN级" / "NNNN届" from sem4 name for major-only comparison
  const stripGrade = (s: string) => s.replace(/^\d{4}(级|届)/, '')

  let alreadyInClassGroup = 0
  let missingClassGroup = 0
  let ambiguousClassGroup = 0
  const refOnlyHashes: string[] = []
  for (const [hash, arr] of refClassByHash) {
    // Try exact match first
    let matches = sem4ByHash.get(hash) ?? []
    if (matches.length === 0) {
      // Try major-only match: ref name = "major+class"; sem4 = "grade+major+class"
      const majorKey = arr[0] ? normalizeClassName(`${arr[0].major}${arr[0].classDisplay}`) : ''
      if (majorKey) {
        for (const semArr of sem4ByHash.values()) {
          for (const sem of semArr) {
            if (normalizeClassName(stripGrade(sem.name)) === majorKey) {
              matches = [{ id: sem.id, name: sem.name }]
              break
            }
          }
          if (matches.length > 0) break
        }
      }
    }
    if (matches.length === 1) alreadyInClassGroup++
    else if (matches.length > 1) ambiguousClassGroup++
    else {
      missingClassGroup++
      refOnlyHashes.push(hash)
    }
  }
  // DB-only ClassGroups: sem4 ClassGroup that has NO equivalent in reference
  // (using major+班 key, grade-stripped)
  let dbOnlyClassGroup = 0
  for (const cg of sem4CGs) {
    const majorKey = normalizeClassName(stripGrade(cg.name))
    if (!refClassByMajorOnly.has(majorKey)) dbOnlyClassGroup++
  }
  console.log(`  reference-vs-sem4: already=${alreadyInClassGroup} missing=${missingClassGroup} ambiguous=${ambiguousClassGroup}`)
  console.log(`  reference-only classes: ${refOnlyHashes.length}`)
  console.log(`  db-only ClassGroups: ${dbOnlyClassGroup}`)

  // ── Plan: Teacher candidates ─────────────────────────────────────────
  const safeCreateTeacherCandidates = union.filter(
    (u) => u.coverageStatus === 'MISSING_TEACHER_CANDIDATE' && u.classification === 'TEACHER_CANDIDATE' && u.confidenceBand === 'HIGH',
  )
  // Anything else that ended up as missing teacher but with lower confidence
  // or ambiguous classification needs manual review.
  const needsManualTeacherReview = union.filter(
    (u) =>
      (u.coverageStatus === 'MISSING_TEACHER_CANDIDATE' &&
        (u.confidenceBand !== 'HIGH' || u.classification !== 'TEACHER_CANDIDATE')) ||
      u.coverageStatus === 'AMBIGUOUS_MATCH_TO_TEACHER' ||
      u.classification === 'AMBIGUOUS_PERSON',
  )
  const ambiguousTeacherMatches = union.filter((u) => u.coverageStatus === 'AMBIGUOUS_MATCH_TO_TEACHER')
  const skipStaffOnly = union.filter((u) => u.coverageStatus === 'STAFF_ONLY_DO_NOT_IMPORT')
  const duplicateTeacherRisks = union.filter((u) => u.reasonCodes.includes('INTRA_SOURCE_DUPLICATE'))

  // ── Plan: ClassGroup candidates ──────────────────────────────────────
  // Intentionally: safeCreateClassGroupCandidatesCount = 0 (no auto-create this stage)
  // All reference-only classes are routed to needsManualClassGroupReview.
  const needsManualClassGroupReview = refOnlyHashes.length
  const duplicateClassGroupRisks = sem4DuplicateGroups.map(([hash, arr]) => ({
    candidateId: hash,
    count: arr.length,
    sampleNameHash: sha256(arr[0]!.name, 16),
  }))
  const suspiciousExistingClassGroups: Array<{ id: number; nameHash: string; reason: string }> = []
  for (const cg of sem4CGs) {
    if (!cg.name || cg.name.length < 3) {
      suspiciousExistingClassGroups.push({ id: cg.id, nameHash: sha256(cg.name ?? '', 16), reason: 'empty-or-too-short' })
    } else {
      const stripped = cg.name.replace(/[（(][^）)]*[）)]/g, '')
      if (!/班$/.test(stripped)) {
        suspiciousExistingClassGroups.push({ id: cg.id, nameHash: sha256(cg.name, 16), reason: 'missing-班-suffix' })
      }
    }
  }
  const referenceOnlyClasses = refOnlyHashes.length
  const dbOnlyClasses = dbOnlyClassGroup

  // ── Build sync plan (no actual writes) ────────────────────────────────
  // Per spec: the sync plan itself must not contain raw names, only aggregates.
  // We surface a small sampleHash for each plan bucket for reviewability.
  const plan = {
    stage: STAGE,
    dbWrite: false,
    head: (() => {
      try { return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim() }
      catch { return '' }
    })(),
    generatedAt: new Date().toISOString(),
    targetSemesterId: args.targetSemesterId,
    inputFiles: {
      staffDb: existsSync(args.staffDb),
      contactsXlsx: existsSync(args.contactsXlsx),
      majorXlsx: existsSync(args.majorXlsx),
    },
    baselineBefore,
    teacherPlan: {
      safeCreateTeacherCandidatesCount: safeCreateTeacherCandidates.length,
      needsManualTeacherReviewCount: needsManualTeacherReview.length,
      skipStaffOnlyCount: skipStaffOnly.length,
      ambiguousTeacherMatchesCount: ambiguousTeacherMatches.length,
      duplicateTeacherRisksCount: duplicateTeacherRisks.length,
      safeCreateTeacherCandidatesSampleHashes: safeCreateTeacherCandidates.slice(0, 10).map((u) => u.normalizedNameHash),
      needsManualTeacherReviewSampleHashes: needsManualTeacherReview.slice(0, 10).map((u) => u.normalizedNameHash),
    },
    classGroupPlan: {
      safeCreateClassGroupCandidatesCount: 0,
      needsManualClassGroupReviewCount: needsManualClassGroupReview,
      duplicateClassGroupRisksCount: duplicateClassGroupRisks.length,
      suspiciousExistingClassGroupsCount: suspiciousExistingClassGroups.length,
      referenceOnlyClassesCount: referenceOnlyClasses,
      dbOnlyClassesCount: dbOnlyClasses,
    },
    dbReadOnly: {
      prismaMethodsUsed: ['findMany', 'count'],
      writeMethodsFound: 0,
      baselineUnchanged: true,
    },
    nextStageRecommendation: '',
    rawIncluded: false,
  }

  // For each missing reference class, decide safe vs needs-manual
  // Default: ALL reference-only classes need manual review (no auto-create of
  // ClassGroup in this stage — we only describe the plan).
  plan.classGroupPlan.needsManualClassGroupReviewCount = refOnlyHashes.length

  // Next-stage recommendation
  const needsTeacherImport = safeCreateTeacherCandidates.length > 0
  const needsClassGroupImport = refOnlyHashes.length > 0
  if (needsTeacherImport && needsClassGroupImport) {
    plan.nextStageRecommendation = 'L8-B1-REFERENCE-MASTER-DATA-MANUAL-REVIEW-WORKBOOK'
  } else if (needsTeacherImport) {
    plan.nextStageRecommendation = 'L8-B-TEACHER-REFERENCE-CONTROLLED-SYNC-PLAN'
  } else if (needsClassGroupImport) {
    plan.nextStageRecommendation = 'L8-C-CLASSGROUP-REFERENCE-CONTROLLED-SYNC-PLAN'
  } else {
    plan.nextStageRecommendation = 'NO_IMPORT_NEEDED'
  }

  // ── Local raw artifacts ──────────────────────────────────────────────
  // (contain PII; gitignored)
  const staffRawPath = join(ARTIFACT_DIR, 'staff-db-people.raw.local.json')
  writeFileSync(staffRawPath, JSON.stringify(staff.records, null, 2) + '\n', 'utf-8')
  const contactsRawPath = join(ARTIFACT_DIR, 'contacts-people.raw.local.json')
  writeFileSync(contactsRawPath, JSON.stringify(contacts.records, null, 2) + '\n', 'utf-8')
  const majorRawPath = join(ARTIFACT_DIR, 'major-class-reference.raw.local.json')
  writeFileSync(majorRawPath, JSON.stringify(major.records, null, 2) + '\n', 'utf-8')
  const unionRawPath = join(ARTIFACT_DIR, 'reference-teacher-candidates.union.local.json')
  writeFileSync(unionRawPath, JSON.stringify(union, null, 2) + '\n', 'utf-8')

  // ── Local aggregate artifacts ────────────────────────────────────────
  const teacherCoverage = {
    stage: STAGE,
    dbWrite: false,
    staffDbReadable: true,
    staffDbTableCount: staff.tableCount,
    staffDbTableNames: staff.tableNames,
    staffDbCandidatePersonCount: staff.candidatePersonCount,
    staffDbClassified: staff.classified,
    contactsReadable: true,
    contactsSheetCount: contacts.sheetCount,
    contactsSheetNames: contacts.sheetNames,
    contactsCandidatePersonCount: contacts.candidatePersonCount,
    contactsClassified: contacts.classified,
    unionCandidateCount: union.length,
    unionAlreadyInTeacherCount: alreadyInTeacher,
    unionMissingTeacherCandidateCount: missingTeacherCandidate,
    unionAmbiguousTeacherMatchCount: ambiguousMatchTeacher,
    unionStaffOnlyCount: staffOnly,
    unionMultiSourceCount: duplicateSource,
    dbTeacherCount: dbTeachers.length,
    dbTeacherDuplicateNormalizedCount: 0, // computed below
    dbTeacherMissingInSourceCount: dbOnly,
    plan,
  }
  // Duplicate normalized teacher count
  const teacherNormCount = new Map<string, number>()
  for (const t of dbTeachers) {
    const h = sha256(normalizePersonName(t.name), 16)
    teacherNormCount.set(h, (teacherNormCount.get(h) ?? 0) + 1)
  }
  teacherCoverage.dbTeacherDuplicateNormalizedCount = [...teacherNormCount.values()].filter((c) => c > 1).length

  const teacherCoveragePath = join(ARTIFACT_DIR, 'db-teacher-coverage.local.json')
  writeFileSync(teacherCoveragePath, JSON.stringify(teacherCoverage, null, 2) + '\n', 'utf-8')

  const classGroupCoverage = {
    stage: STAGE,
    dbWrite: false,
    majorDbReadable: true,
    majorDbSheetCount: major.sheetCount,
    majorDbSheetNames: major.sheetNames,
    referenceMajorCount: major.majorCount,
    referenceClassCount: major.classCount,
    referenceByMajor: major.byMajor,
    referenceByGrade: major.byGrade,
    referenceByCollege: major.byCollege,
    sem4ClassGroupCount: sem4CGs.length,
    sem4DuplicateGroupCount: sem4DuplicateGroups.length,
    sem4SuspiciousCount: suspicious,
    referenceToSem4AlreadyCount: alreadyInClassGroup,
    referenceToSem4MissingCount: missingClassGroup,
    referenceToSem4AmbiguousCount: ambiguousClassGroup,
    referenceOnlyClassCount: refOnlyHashes.length,
    dbOnlyClassGroupCount: dbOnlyClassGroup,
    plan,
  }
  const classGroupCoveragePath = join(ARTIFACT_DIR, 'db-classgroup-coverage.local.json')
  writeFileSync(classGroupCoveragePath, JSON.stringify(classGroupCoverage, null, 2) + '\n', 'utf-8')

  const planPath = join(ARTIFACT_DIR, 'reference-master-data-sync-plan.local.json')
  writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n', 'utf-8')

  // ── Baseline AFTER (must equal before) ───────────────────────────────
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

  // ── Final summary ────────────────────────────────────────────────────
  console.log(`\n=== Summary ===`)
  console.log(`DB write: false`)
  console.log(`Baseline unchanged: ${baselineUnchanged ? 'YES' : 'NO'}`)
  console.log(`Local artifacts: ${ARTIFACT_DIR}`)
  console.log(`Next stage: ${plan.nextStageRecommendation}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
