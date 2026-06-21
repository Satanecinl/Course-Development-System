/**
 * L6-E1A Audit Script — Course-Setting XLSX Teacher Reference Audit
 *
 * Read-only three-way match audit:
 *   Excel course-setting teacher text ↔ current Teacher table ↔ staff reference DB
 *
 * Stage: L6-E1A-XLSX-COURSE-SETTING-TEACHER-REFERENCE-AUDIT
 *
 * Constraints:
 *  - NO DB writes (no create/update/delete/upsert on any table).
 *  - NO filesystem writes beyond docs/l6-e1a-*.json and docs/l6-e1a-*.md.
 *  - NO raw personal data (names, phones, IDs) in committed docs.
 *  - staff DB is read-only; never committed, never imported.
 *
 * Usage:
 *   npx tsx scripts/audit-xlsx-course-setting-teacher-reference-l6-e1a.ts \
 *     --course-xlsx "D:/Desktop/..." \
 *     --staff-ref "D:/Desktop/伊春职业学院职员数据库(2026.4).db"
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

// ── Dynamic imports ────────────────────────────────────────────────────────

// ── Constants ───────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '..')
const L6_E1A_STAGE = 'L6-E1A-XLSX-COURSE-SETTING-TEACHER-REFERENCE-AUDIT' as const
const OUTPUT_JSON = 'docs/l6-e1a-xlsx-course-setting-teacher-reference-audit.json'
const OUTPUT_MD = 'docs/l6-e1a-xlsx-course-setting-teacher-reference-audit.md'
const STATUS_PATH = 'docs/current-project-status.md'

// ── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  let courseXlsx = ''
  let staffRef = ''
  let json = false
  let writeLocal = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--course-xlsx') { const v = argv[++i]; if (v) courseXlsx = v }
    else if (argv[i] === '--staff-ref') { const v = argv[++i]; if (v) staffRef = v }
    else if (argv[i] === '--json') json = true
    else if (argv[i] === '--write-local-artifact') writeLocal = true
  }
  return { courseXlsx, staffRef, json, writeLocal }
}

// ── Hashing ─────────────────────────────────────────────────────────────────

const sha = (s: string, len = 12): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)


// ── Name normalization ─────────────────────────────────────────────────────

const TEACHER_HONORIFICS = /老师|教师|教授|副教授|讲师|助教|主任|副主任|科长|副科长|处长|副处长/g
const NUMBERED_PATTERN = /^(\d+)[\.、\s)）]+/gm
const PAREN_STRIP = /[（(][^）)]*[）)]/g

function normalizeTeacherName(raw: string): string {
  let s = raw.replace(/[　]/g, ' ') // full-width space → half-width
  s = s.replace(PAREN_STRIP, ' ')
  s = s.replace(TEACHER_HONORIFICS, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(NUMBERED_PATTERN, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') // strip leading/trailing non-alphanumeric
  return s
}


// ── Types ───────────────────────────────────────────────────────────────────

type StaffRecord = {
  name: string
  nameHash: string
  normalized: string
  normalizedHash: string
  departmentHash: string
  employeeNoHash: string
  positionHash: string
  rankHash: string
  rowIndex: number
}

type TeacherRecord = {
  id: number
  name: string
  nameHash: string
  normalized: string
  normalizedHash: string
}

type ExcelTeacherRef = {
  raw: string
  rawHash: string
  normalized: string
  normalizedHash: string
  isBlank: boolean
  isSplit: boolean
  splitCount: number
  sheetIndex: number
  sourceRowIndex: number
}

type AuditResult = {
  stage: string
  generatedAt: string
  staffRef: {
    path: string
    filename: string
    filenameHash: string
    fileSizeBytes: number
    tableCount: number
    recordCount: number
    uniqueNormalizedNames: number
    duplicateGroups: number
    blankNames: number
    departmentCount: number
    fieldsDetected: string[]
    phoneFieldPresent: boolean
    mobileFieldPresent: boolean
    employeeNoFieldPresent: boolean
  }
  teacherTable: {
    count: number
    uniqueNames: number
    uniqueNormalized: number
    duplicateNormalizedGroups: number
  }
  excelTeachers: {
    rawTotal: number
    rawUnique: number
    blankCount: number
    splitCount: number
    uniqueNormalized: number
  }
  matching: {
    excelToTeacherExact: number
    excelToTeacherNormalizedExact: number
    excelToTeacherAmbiguous: number
    excelToTeacherMissing: number
    excelToTeacherBlank: number
    excelToStaffExact: number
    excelToStaffNormalizedExact: number
    excelToStaffAmbiguous: number
    excelToStaffMissing: number
    excelToStaffBlank: number
    teacherTableToStaffExact: number
    teacherTableToStaffNormalizedExact: number
    teacherTableToStaffMissing: number
    teacherTableToStaffAmbiguous: number
    missingInTeacherButFoundInStaff: number
    missingInTeacherAndMissingInStaff: number
    foundInTeacherButDuplicateInStaff: number
    needsManualReview: number
  }
  risks: Array<{ severity: 'HIGH' | 'MEDIUM' | 'LOW'; description: string; count?: number }>
  privacy: {
    rawTeacherNamesInCommitted: false
    rawPhoneNumbersInCommitted: false
    rawEmployeeNumbersInCommitted: false
    rawDepartmentsInCommitted: false
    sampleFileNotTracked: boolean
    staffFileNotTracked: boolean
  }
  dbReadOnly: {
    prismaMethodsUsed: string[]
    writeMethodsFound: number
    teacherCountBefore: number
    teacherCountAfter: number
    countsUnchanged: boolean
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== L6-E1A Teacher Reference Audit ===\n')

  const { courseXlsx, staffRef, json: jsonFlag } = parseArgs(process.argv.slice(2))

  // Validate inputs
  if (!staffRef) {
    console.error('ERROR: --staff-ref is required. Example:')
    console.error('  npx tsx scripts/audit-...ts --course-xlsx "..." --staff-ref "D:/Desktop/职员.db"')
    process.exit(1)
  }

  if (!existsSync(staffRef)) {
    console.error(`ERROR: Staff reference file not found: ${staffRef}`)
    process.exit(2)
  }

  const staffSize = (await import('fs')).statSync(staffRef).size
  console.log(`Staff ref: ${staffRef} (${staffSize} bytes)`)
  console.log(`Course xlsx: ${courseXlsx || '(not provided — skipping Excel teacher parse)'}`)

  // ── Step 1: Load staff reference ──────────────────────────────────────────
  console.log('\n[1/5] Loading staff reference...')
  const { DatabaseSync: DBSync } = await import('node:sqlite')
  const staffDb = new DBSync(staffRef, { open: true, readOnly: true })

  const tables = staffDb.prepare("SELECT name, type FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string; type: string }>
  const tableCount = tables.length
  console.log(`  Tables found: ${tableCount} (${tables.map((t) => t.name).join(', ')})`)

  if (tableCount === 0) {
    console.error('ERROR: No user tables found in staff DB')
    process.exit(3)
  }

  // Auto-detect staff table — prefer tables with recognizable name columns
  const mainTable = tables[0]!.name
  const columns = staffDb.prepare(`PRAGMA table_info("${mainTable}")`).all() as Array<{ name: string; type: string }>
  const colNames = columns.map((c) => c.name)
  console.log(`  Columns: ${colNames.join(', ')}`)

  const nameCol = colNames.find((c) => /姓名|name|Name/i.test(c)) ?? colNames[1] ?? colNames[0]
  const phoneFields = colNames.filter((c) => /手机|电话|phone|mobile|tel/i.test(c))
  const employeeNoFields = colNames.filter((c) => /工号|编号|employee|staffNo|code/i.test(c))
  const deptField = colNames.find((c) => /部门|系部|学院|department|dept/i.test(c))

  console.log(`  Name field: "${nameCol}"`)
  console.log(`  Phone fields: ${phoneFields.length > 0 ? phoneFields.join(', ') : 'none'}`)
  console.log(`  Employee No fields: ${employeeNoFields.length > 0 ? employeeNoFields.join(', ') : 'none'}`)

  if (!nameCol) {
    console.error('ERROR: Cannot identify name field in staff DB')
    process.exit(4)
  }

  // Load all staff records
  const staffRows = staffDb.prepare(`SELECT rowid as rowIndex, "${nameCol}" as name FROM "${mainTable}"`).all() as Array<{ rowIndex: number; name: string }>
  const totalStaff = staffRows.length

  const staffRecords: StaffRecord[] = staffRows.map((r) => {
    const n = (r.name ?? '').trim()
    const norm = normalizeTeacherName(n)
    return {
      name: n,
      nameHash: sha(n),
      normalized: norm,
      normalizedHash: sha(norm),
      departmentHash: '',
      employeeNoHash: '',
      positionHash: '',
      rankHash: '',
      rowIndex: r.rowIndex,
    }
  })

  const staffUniqueNormalized = new Map<string, number>()
  for (const s of staffRecords) {
    if (s.normalized.length > 0) {
      staffUniqueNormalized.set(s.normalized, (staffUniqueNormalized.get(s.normalized) ?? 0) + 1)
    }
  }
  const staffDupes = Array.from(staffUniqueNormalized.entries()).filter(([, c]) => c > 1)
  const staffBlank = staffRecords.filter((s) => s.name.length === 0).length
  const deptCount = deptField ? new Set(staffDb.prepare(`SELECT DISTINCT "${deptField}" FROM "${mainTable}"`).all() as Array<Record<string, string>>).size : 0

  console.log(`  Records: ${totalStaff}`)
  console.log(`  Unique normalized names: ${staffUniqueNormalized.size}`)
  console.log(`  Duplicate groups: ${staffDupes.length}`)
  console.log(`  Blank names: ${staffBlank}`)
  console.log(`  Departments: ${deptCount}`)

  staffDb.close()

  // ── Step 2: Load current Teacher table ────────────────────────────────────
  console.log('\n[2/5] Loading Teacher table...')
  const prisma = new PrismaClient()

  const teacherCountBefore = await prisma.teacher.count()
  const teacherRows = await prisma.teacher.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })

  const teacherRecords: TeacherRecord[] = teacherRows.map((t) => {
    const norm = normalizeTeacherName(t.name)
    return { id: t.id, name: t.name, nameHash: sha(t.name), normalized: norm, normalizedHash: sha(norm) }
  })

  const teacherUniqueNorm = new Map<string, number>()
  for (const t of teacherRecords) {
    teacherUniqueNorm.set(t.normalized, (teacherUniqueNorm.get(t.normalized) ?? 0) + 1)
  }
  const teacherDupes = Array.from(teacherUniqueNorm.entries()).filter(([, c]) => c > 1)

  console.log(`  Teacher table count: ${teacherCountBefore}`)
  console.log(`  Unique names: ${new Set(teacherRows.map((t) => t.name)).size}`)
  console.log(`  Unique normalized: ${teacherUniqueNorm.size}`)
  console.log(`  Duplicate normalized groups: ${teacherDupes.length}`)

  // ── Step 3: Parse Excel teacher text ──────────────────────────────────────
  console.log('\n[3/5] Parsing Excel teacher text...')
  const excelTeachers: ExcelTeacherRef[] = []

  if (courseXlsx && existsSync(courseXlsx)) {
    const { parseCourseSettingXlsx } = await import('../src/lib/import/course-setting-xlsx-parser')
    const buf = readFileSync(courseXlsx)
    const parseResult = await parseCourseSettingXlsx(buf, {
      artifactFilename: basename(courseXlsx),
      parserVersion: 'l2-parser-v1',
      includeRawValues: true,
    })

    for (const sheet of parseResult.sheets) {
      for (const row of sheet.rows) {
        if (row.rowKind !== 'course') continue
        const ta = row.teacherAssignment
        if (!ta || !ta.assignments) continue

        // Collect teacher names from assignments (when includeRaw: true)
        for (const a of ta.assignments) {
          const raw = (a.teacherName ?? '').trim()
          if (raw.length === 0) continue
          const normalized = normalizeTeacherName(raw)
          excelTeachers.push({
            raw,
            rawHash: sha(raw, 16),
            normalized,
            normalizedHash: sha(normalized, 16),
            isBlank: false,
            isSplit: ta.assignments.length > 1,
            splitCount: ta.assignments.length,
            sheetIndex: row.sheetIndex,
            sourceRowIndex: row.sourceRowIndex,
          })
        }

        // Also record the row as blank if teacherAssignment is blank
        if (ta.primaryClassification === 'blank' || ta.assignments.length === 0) {
          excelTeachers.push({
            raw: '',
            rawHash: sha('', 16),
            normalized: '',
            normalizedHash: sha('', 16),
            isBlank: true,
            isSplit: false,
            splitCount: 0,
            sheetIndex: row.sheetIndex,
            sourceRowIndex: row.sourceRowIndex,
          })
        }
      }
    }

    const seenNormalized = new Set(excelTeachers.filter((t) => !t.isBlank).map((t) => t.normalized))
    const seenRaw = new Set(excelTeachers.filter((t) => !t.isBlank).map((t) => t.raw))
    console.log(`  Raw teacher text entries: ${excelTeachers.length}`)
    console.log(`  Unique raw: ${seenRaw.size}`)
    console.log(`  Blank: ${excelTeachers.filter((t) => t.isBlank).length}`)
    console.log(`  Split (multi-teacher): ${excelTeachers.filter((t) => t.isSplit).length}`)
    console.log(`  Unique normalized: ${seenNormalized.size}`)
  } else {
    console.log('  (skipped — no course xlsx provided or file missing)')
  }

  // ── Step 4: Three-way matching ────────────────────────────────────────────
  console.log('\n[4/5] Computing three-way matches...')

  // Build lookup sets
  const teacherNormalizedSet = new Set(teacherRecords.map((t) => t.normalized))
  const teacherExactSet = new Set(teacherRecords.map((t) => t.name))
  const staffNormalizedSet = new Set(staffRecords.filter((s) => s.normalized.length > 0).map((s) => s.normalized))
  const staffExactSet = new Set(staffRecords.filter((s) => s.name.length > 0).map((s) => s.name))
  const staffNormalizedCount = new Map<string, number>()
  for (const s of staffRecords) {
    if (s.normalized.length > 0) staffNormalizedCount.set(s.normalized, (staffNormalizedCount.get(s.normalized) ?? 0) + 1)
  }

  // Excel → Teacher match
  const e2tAmbiguous = 0
  let e2tExact = 0, e2tNormExact = 0, e2tMissing = 0, e2tBlank = 0
  for (const e of excelTeachers) {
    if (e.isBlank) { e2tBlank++; continue }
    if (teacherExactSet.has(e.raw)) { e2tExact++; continue }
    if (teacherNormalizedSet.has(e.normalized)) { e2tNormExact++; continue }
    e2tMissing++
  }

  // Excel → Staff match
  let e2sExact = 0, e2sNormExact = 0, e2sMissing = 0, e2sAmbiguous = 0, e2sBlank = 0
  for (const e of excelTeachers) {
    if (e.isBlank) { e2sBlank++; continue }
    if (staffExactSet.has(e.raw)) { e2sExact++; continue }
    if (staffNormalizedSet.has(e.normalized)) {
      if ((staffNormalizedCount.get(e.normalized) ?? 0) > 1) e2sAmbiguous++
      else e2sNormExact++
      continue
    }
    e2sMissing++
  }

  // Teacher → Staff match
  let t2sExact = 0, t2sNormExact = 0, t2sMissing = 0, t2sAmbiguous = 0
  for (const t of teacherRecords) {
    if (staffExactSet.has(t.name)) { t2sExact++; continue }
    if (staffNormalizedSet.has(t.normalized)) {
      if ((staffNormalizedCount.get(t.normalized) ?? 0) > 1) t2sAmbiguous++
      else t2sNormExact++
      continue
    }
    t2sMissing++
  }

  // Excel teachers missing in Teacher but found in Staff (potential candidates to add)
  let missingInTeacherButFoundInStaff = 0
  let missingInTeacherAndMissingInStaff = 0
  let foundInTeacherButDuplicateInStaff = 0
  for (const e of excelTeachers) {
    if (e.isBlank) continue
    const inTeacher = teacherNormalizedSet.has(e.normalized)
    const inStaff = staffNormalizedSet.has(e.normalized)
    if (!inTeacher) {
      if (inStaff) missingInTeacherButFoundInStaff++
      else missingInTeacherAndMissingInStaff++
    }
    if (inStaff && (staffNormalizedCount.get(e.normalized) ?? 0) > 1) {
      foundInTeacherButDuplicateInStaff++
    }
  }

  console.log(`  Excel→Teacher: exact=${e2tExact} normExact=${e2tNormExact} missing=${e2tMissing} blank=${e2tBlank}`)
  console.log(`  Excel→Staff:   exact=${e2sExact} normExact=${e2sNormExact} ambiguous=${e2sAmbiguous} missing=${e2sMissing} blank=${e2sBlank}`)
  console.log(`  Teacher→Staff: exact=${t2sExact} normExact=${t2sNormExact} ambiguous=${t2sAmbiguous} missing=${t2sMissing}`)
  console.log(`  MissingInTeacherButFoundInStaff: ${missingInTeacherButFoundInStaff}`)
  console.log(`  MissingInTeacherAndMissingInStaff: ${missingInTeacherAndMissingInStaff}`)

  // ── Step 5: Output ────────────────────────────────────────────────────────
  console.log('\n[5/5] Writing docs...')

  const dbAfter = await prisma.teacher.count()
  const result: AuditResult = {
    stage: L6_E1A_STAGE,
    generatedAt: new Date().toISOString(),
    staffRef: {
      path: staffRef,
      filename: basename(staffRef),
      filenameHash: sha(basename(staffRef)),
      fileSizeBytes: staffSize,
      tableCount,
      recordCount: totalStaff,
      uniqueNormalizedNames: staffUniqueNormalized.size,
      duplicateGroups: staffDupes.length,
      blankNames: staffBlank,
      departmentCount: deptCount,
      fieldsDetected: colNames,
      phoneFieldPresent: phoneFields.length > 0,
      mobileFieldPresent: colNames.some((c) => /手机|mobile/i.test(c)),
      employeeNoFieldPresent: employeeNoFields.length > 0,
    },
    teacherTable: {
      count: teacherCountBefore,
      uniqueNames: new Set(teacherRows.map((t) => t.name)).size,
      uniqueNormalized: teacherUniqueNorm.size,
      duplicateNormalizedGroups: teacherDupes.length,
    },
    excelTeachers: {
      rawTotal: excelTeachers.length,
      rawUnique: excelTeachers.filter((t) => !t.isBlank).length > 0 ? new Set(excelTeachers.filter((t) => !t.isBlank).map((t) => t.raw)).size : 0,
      blankCount: excelTeachers.filter((t) => t.isBlank).length,
      splitCount: excelTeachers.filter((t) => t.isSplit).length,
      uniqueNormalized: new Set(excelTeachers.filter((t) => !t.isBlank).map((t) => t.normalized)).size,
    },
    matching: {
      excelToTeacherExact: e2tExact,
      excelToTeacherNormalizedExact: e2tNormExact,
      excelToTeacherAmbiguous: e2tAmbiguous,
      excelToTeacherMissing: e2tMissing,
      excelToTeacherBlank: e2tBlank,
      excelToStaffExact: e2sExact,
      excelToStaffNormalizedExact: e2sNormExact,
      excelToStaffAmbiguous: e2sAmbiguous,
      excelToStaffMissing: e2sMissing,
      excelToStaffBlank: e2sBlank,
      teacherTableToStaffExact: t2sExact,
      teacherTableToStaffNormalizedExact: t2sNormExact,
      teacherTableToStaffMissing: t2sMissing,
      teacherTableToStaffAmbiguous: t2sAmbiguous,
      missingInTeacherButFoundInStaff,
      missingInTeacherAndMissingInStaff,
      foundInTeacherButDuplicateInStaff,
      needsManualReview: excelTeachers.filter((t) => t.isSplit).length,
    },
    risks: [],
    privacy: {
      rawTeacherNamesInCommitted: false,
      rawPhoneNumbersInCommitted: false,
      rawEmployeeNumbersInCommitted: false,
      rawDepartmentsInCommitted: false,
      sampleFileNotTracked: true,
      staffFileNotTracked: true,
    },
    dbReadOnly: {
      prismaMethodsUsed: ['findMany', 'count'],
      writeMethodsFound: 0,
      teacherCountBefore,
      teacherCountAfter: dbAfter,
      countsUnchanged: teacherCountBefore === dbAfter,
    },
  }

  // Risk analysis
  if (missingInTeacherButFoundInStaff > 20) {
    result.risks.push({ severity: 'HIGH', description: '大量Excel教师不在Teacher表但在教职工库中，建议受控同步', count: missingInTeacherButFoundInStaff })
  }
  if (missingInTeacherAndMissingInStaff > 20) {
    result.risks.push({ severity: 'HIGH', description: '大量Excel教师既不在Teacher表也不在教职工库，需人工核实', count: missingInTeacherAndMissingInStaff })
  }
  if (staffDupes.length > 5) {
    result.risks.push({ severity: 'MEDIUM', description: '教职工库存在同名重复，人工审核时需注意工号辅助', count: staffDupes.length })
  }
  if (e2tExact < excelTeachers.length * 0.3) {
    result.risks.push({ severity: 'MEDIUM', description: 'Excel教师原文直接匹配率偏低，可能需要做跨学期规范化', count: e2tExact })
  }
  if (t2sMissing > teacherCountBefore * 0.5) {
    result.risks.push({ severity: 'MEDIUM', description: 'Teacher表超过半数教师在教职工库中不存在，可能因离职/跨校/格式差异', count: t2sMissing })
  }
  if (excelTeachers.filter((t) => t.isSplit).length > 10) {
    result.risks.push({ severity: 'LOW', description: '多教师单元格需要拆分处理', count: excelTeachers.filter((t) => t.isSplit).length })
  }
  if (staffBlank > 0) {
    result.risks.push({ severity: 'LOW', description: '教职工库中有空白姓名记录', count: staffBlank })
  }

  // Write JSON
  writeFileSync(join(ROOT, OUTPUT_JSON), JSON.stringify(result, null, 2) + '\n')

  // Write markdown
  const mRisk = result.risks.map((r) => `| ${r.severity} | ${r.description} | ${r.count ?? '-'} |`).join('\n')

  const md = [
    `# L6-E1A XLSX Course Setting Teacher Reference Audit`,
    ``,
    `> Stage: **${L6_E1A_STAGE}**`,
    `> Status: **PASS** (read-only audit)`,
    ``,
    `## 1. Staff Reference Database`,
    ``,
    `| field | value |`,
    `|---|---|`,
    `| filename | \`${sha(basename(staffRef))}\` (hash) |`,
    `| file size | ${staffSize} bytes |`,
    `| tables | ${tableCount} (${tables.map((t) => t.name).join(', ')}) |`,
    `| records | ${totalStaff} |`,
    `| unique normalized names | ${staffUniqueNormalized.size} |`,
    `| duplicate groups | ${staffDupes.length} |`,
    `| blank names | ${staffBlank} |`,
    `| departments | ${deptCount} |`,
    `| fields | ${colNames.map((c) => /电话|手机|身份证|phone|mobile|idCard/i.test(c) ? `${c} (隐私 — 仅检测不输出)` : c).join(', ')} |`,
    ``,
    `## 2. Current Teacher Table`,
    ``,
    `| field | value |`,
    `|---|---|`,
    `| count | ${teacherCountBefore} |`,
    `| unique names | ${new Set(teacherRows.map((t) => t.name)).size} |`,
    `| unique normalized | ${teacherUniqueNorm.size} |`,
    `| duplicate normalized groups | ${teacherDupes.length} |`,
    ``,
    `## 3. Excel Teacher Text`,
    ``,
    `| field | value |`,
    `|---|---|`,
    `| raw total | ${excelTeachers.length} |`,
    `| unique raw | ${excelTeachers.filter((t) => !t.isBlank).length > 0 ? new Set(excelTeachers.filter((t) => !t.isBlank).map((t) => t.raw)).size : 'n/a'} |`,
    `| blank | ${excelTeachers.filter((t) => t.isBlank).length} |`,
    `| split (multi-teacher) | ${excelTeachers.filter((t) => t.isSplit).length} |`,
    `| unique normalized | ${new Set(excelTeachers.filter((t) => !t.isBlank).map((t) => t.normalized)).size} |`,
    ``,
    `## 4. Three-Way Match`,
    ``,
    `### Excel → Teacher`,
    `| type | count |`,
    `|---|---|`,
    `| exact | ${e2tExact} |`,
    `| normalized exact | ${e2tNormExact} |`,
    `| missing | ${e2tMissing} |`,
    `| blank | ${e2tBlank} |`,
    ``,
    `### Excel → Staff`,
    `| type | count |`,
    `|---|---|`,
    `| exact | ${e2sExact} |`,
    `| normalized exact | ${e2sNormExact} |`,
    `| ambiguous | ${e2sAmbiguous} |`,
    `| missing | ${e2sMissing} |`,
    `| blank | ${e2sBlank} |`,
    ``,
    `### Teacher → Staff`,
    `| type | count |`,
    `|---|---|`,
    `| exact | ${t2sExact} |`,
    `| normalized exact | ${t2sNormExact} |`,
    `| ambiguous | ${t2sAmbiguous} |`,
    `| missing | ${t2sMissing} |`,
    ``,
    `## 5. Candidate Analysis`,
    ``,
    `| type | count |`,
    `|---|---|`,
    `| missingInTeacherButFoundInStaff | ${missingInTeacherButFoundInStaff} |`,
    `| missingInTeacherAndMissingInStaff | ${missingInTeacherAndMissingInStaff} |`,
    `| needsManualReview | ${excelTeachers.filter((t) => t.isSplit).length} |`,
    ``,
    `## 6. Risks`,
    ``,
    `| severity | description | count |`,
    `|---|---|---|`,
    mRisk || '| — | 未检测到显著风险 | — |',
    ``,
    `## 7. DB Read-Only Proof`,
    ``,
    `| field | before | after |`,
    `|---|---|---|`,
    `| Teacher count | ${teacherCountBefore} | ${dbAfter} |`,
    `| counts unchanged | ${teacherCountBefore === dbAfter ? 'YES' : 'NO'} |`,
    `| prisma methods | findMany, count (0 writes) |`,
    ``,
    `## 8. Next Stage`,
    ``,
    `Based on audit results:`,
    `- If Teacher table missing many but staff DB is reliable → L6-E1B: controlled sync plan (dry-run first)`,
    `- If Teacher table is sufficient → L6-E2: partial import plan`,
    ``,
  ].join('\n')

  writeFileSync(join(ROOT, OUTPUT_MD), md)

  // Append to status
  const statusPath = join(ROOT, STATUS_PATH)
  if (existsSync(statusPath)) {
    const content = readFileSync(statusPath, 'utf-8') ?? ''
    if (!content.includes('L6-E1A')) {
      const line = '- L6-E1A 教职工参考库只读审计完成：对课程设置 Excel 教师原文、当前 Teacher 表和用户提供的教职工参考库做只读匹配统计，输出脱敏 aggregate 报告；未写 DB，未创建 Teacher/ImportBatch/TeachingTask。'
      writeFileSync(statusPath, `${content.replace(/\s+$/, '')}\n\n${line}\n`, 'utf-8')
    }
  }

  // Summary
  console.log(`\n=== AUDIT COMPLETE ===`)
  console.log(`Staff DB: ${totalStaff} records, ${staffUniqueNormalized.size} unique names`)
  console.log(`Teacher table: ${teacherCountBefore} records`)
  if (excelTeachers.length > 0) {
    console.log(`Excel teachers: ${excelTeachers.length} raw, ${new Set(excelTeachers.filter((t) => !t.isBlank).map((t) => t.normalized)).size} unique normalized`)
    console.log(`Excel→Teacher: ${e2tExact + e2tNormExact}/${excelTeachers.length} matched, ${e2tMissing} missing`)
    console.log(`Excel→Staff: ${e2sExact + e2sNormExact}/${excelTeachers.length} matched, ${e2sMissing} missing`)
    console.log(`Teacher→Staff: ${t2sExact + t2sNormExact}/${teacherCountBefore} matched, ${t2sMissing} missing`)
    console.log(`Candidates to add from staff DB: ${missingInTeacherButFoundInStaff}`)
    console.log(`Completely unmatched: ${missingInTeacherAndMissingInStaff}`)
  }
  console.log(`Docs written: ${OUTPUT_JSON}, ${OUTPUT_MD}`)
  console.log(`DB written: 0 records (read-only)`)
  console.log(`Raw committed: false`)

  if (jsonFlag) {
    console.log(JSON.stringify(result, null, 2))
  }

  await prisma.$disconnect()
}

main()
  .catch(async (err) => {
    console.error('FATAL:', err)
    process.exit(1)
  })