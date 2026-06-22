/**
 * L7-F6A Audit Script — Master Data Coverage Audit
 *
 * Stage: L7-F6A-XLSX-MASTER-DATA-COVERAGE-AUDIT
 *
 * Read-only. Compares teacher text and class group candidates from the
 * course setting Excel against current Teacher table, staff DB, contacts
 * xlsx, and sem4 ClassGroups.
 *
 * No DB writes. No apply. No backup. No PII in committed docs.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12)
const normalize = (s: string) => s.replace(/\s+/g, '').trim()

type CliArgs = {
  courseSettingXlsx: string
  majorDbXlsx: string
  staffDb: string
  contactsXlsx: string
  targetSemesterId: number
  help: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { courseSettingXlsx: '', majorDbXlsx: '', staffDb: '', contactsXlsx: '', targetSemesterId: 0, help: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--course-setting-xlsx') args.courseSettingXlsx = argv[++i] ?? ''
    else if (a === '--major-db-xlsx') args.majorDbXlsx = argv[++i] ?? ''
    else if (a === '--staff-db') args.staffDb = argv[++i] ?? ''
    else if (a === '--contacts-xlsx') args.contactsXlsx = argv[++i] ?? ''
    else if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? '0')
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function splitTeacherText(text: string): string[] {
  if (!text || text.trim().length === 0) return []
  return text.split(/[、,，;；/\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && /[\p{Letter}]/u.test(s))
    .filter((s) => !/^\d+$/.test(s)) // pure numbers are class numbers, not teacher names
    .filter((s) => !/班$/.test(s) && !/节$/.test(s)) // "1班", "3-4节" not teacher
}

function extractKColumnTeacher(text: string): string[] {
  if (!text || text.trim().length === 0) return []
  // K column patterns: "1,2:张三", "1-2:张三", "1.2:张三", "1班、2班：张三", "1-2节 张三/李四"
  // Split on pattern like "N,M...:name" or "N-M:name" then extract after colon
  const parts: string[] = []
  // Pattern 1: colon-separated "N,M:teacher"
  const colonSplit = text.split(/[：:]/)
  if (colonSplit.length >= 2) {
    // Last part after colon is teacher(s)
    for (let i = 1; i < colonSplit.length; i++) {
      parts.push(...splitTeacherText(colonSplit[i]))
    }
  } else {
    // No colon — might be just teacher names
    parts.push(...splitTeacherText(text))
  }
  return [...new Set(parts)]
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help || !args.courseSettingXlsx || !args.targetSemesterId) {
    console.log('Usage: npx tsx scripts/audit-xlsx-master-data-coverage-l7-f6a.ts \\')
    console.log('  --course-setting-xlsx <path> --major-db-xlsx <path> --staff-db <path> --contacts-xlsx <path> \\')
    console.log('  --target-semester-id <id>')
    return
  }

  console.log('=== L7-F6A: Master Data Coverage Audit ===\n')
  const prisma = new PrismaClient()

  // ── 1. File existence ────────────────────────────────────────────
  console.log('[1/6] Input files')
  const files = {
    courseSetting: existsSync(args.courseSettingXlsx),
    majorDb: existsSync(args.majorDbXlsx),
    staffDb: existsSync(args.staffDb),
    contacts: existsSync(args.contactsXlsx),
  }
  console.log(`  course-setting-xlsx: ${files.courseSetting}`)
  console.log(`  major-db-xlsx: ${files.majorDb}`)
  console.log(`  staff-db: ${files.staffDb}`)
  console.log(`  contacts-xlsx: ${files.contacts}`)

  // ── 2. DB baseline ───────────────────────────────────────────────
  console.log('\n[2/6] DB baseline')
  const baseline = {
    course: await prisma.course.count(),
    teacher: await prisma.teacher.count(),
    cgSem1: await prisma.classGroup.count({ where: { semesterId: 1 } }),
    cgSem4: await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } }),
    ttSem4: await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } }),
    ttc: await prisma.teachingTaskClass.count(),
    ssSem4: await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } }),
  }
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } }).catch(() => null)
  console.log(`  Course=${baseline.course} Teacher=${baseline.teacher} CG-sem4=${baseline.cgSem4} TT-sem4=${baseline.ttSem4} TTC=${baseline.ttc}`)
  console.log(`  IB#39=${ib39?.status ?? 'MISSING'} IB#40=${ib40 ? 'EXISTS' : 'absent'}`)

  // ── 3. Parse course setting Excel (J + K columns) ────────────────
  console.log('\n[3/6] Course setting Excel — teacher coverage')
  const ExcelJS = require('exceljs')
  const csWb = new ExcelJS.Workbook()
  await csWb.xlsx.readFile(args.courseSettingXlsx)

  const teacherFromJ = new Set<string>()
  const teacherFromK = new Set<string>()
  const teacherMerged = new Set<string>()
  let excelRowsTotal = 0
  let excelRowsWithTeacherJ = 0
  let excelRowsWithTeacherK = 0
  let emptyTeacherRows = 0
  let teacherTextParseWarnings = 0

  // ClassGroup candidate extraction (columns A-D)
  const classGroupCandidates = new Map<string, { grade: string; major: string; classNo: string }>()

  for (const ws of csWb.worksheets) {
    const headerRow = ws.getRow(1)
    // Find column indices for J (任课教师) and K (授课任务分配)
    let colJ = -1, colK = -1, colA = -1, colB = -1, colC = -1, colD = -1
    headerRow.eachCell((cell, col) => {
      const v = String(cell.value ?? '').trim()
      if (v.includes('任课教师')) colJ = col
      if (v.includes('授课任务分配') || v.includes('任务分配')) colK = col
      if (v.includes('年级')) colA = col
      if (v.includes('学制')) colB = col
      if (v.includes('专业')) colC = col
      if (v.includes('班级') || v.includes('班次')) colD = col
    })
    if (colJ < 0 && colK < 0) continue

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const jVal = colJ > 0 ? String(row.getCell(colJ).value ?? '').trim() : ''
      const kVal = colK > 0 ? String(row.getCell(colK).value ?? '').trim() : ''
      if (!jVal && !kVal) continue

      excelRowsTotal++
      const jTeachers = splitTeacherText(jVal)
      const kTeachers = extractKColumnTeacher(kVal)
      if (jTeachers.length > 0) excelRowsWithTeacherJ++
      if (kTeachers.length > 0) excelRowsWithTeacherK++
      if (jTeachers.length === 0 && kTeachers.length === 0) emptyTeacherRows++

      for (const t of jTeachers) { teacherFromJ.add(normalize(t)); teacherMerged.add(normalize(t)) }
      for (const t of kTeachers) { teacherFromK.add(normalize(t)); teacherMerged.add(normalize(t)) }

      // ClassGroup candidate extraction
      if (colA > 0 && colC > 0 && colD > 0) {
        const grade = String(row.getCell(colA).value ?? '').trim()
        const major = String(row.getCell(colC).value ?? '').trim()
        const classNo = String(row.getCell(colD).value ?? '').trim()
        if (major && classNo) {
          const key = normalize(grade + major + classNo)
          if (!classGroupCandidates.has(key)) {
            classGroupCandidates.set(key, { grade, major, classNo })
          }
        }
      }
    }
  }

  const teacherFromJHashes = new Set([...teacherFromJ].map(sha256))
  const teacherFromKHashes = new Set([...teacherFromK].map(sha256))
  const teacherMergedHashes = new Set([...teacherMerged].map(sha256))

  console.log(`  excelRowsTotal: ${excelRowsTotal}`)
  console.log(`  excelRowsWithTeacherJ: ${excelRowsWithTeacherJ}`)
  console.log(`  excelRowsWithTeacherK: ${excelRowsWithTeacherK}`)
  console.log(`  emptyTeacherRows: ${emptyTeacherRows}`)
  console.log(`  distinctTeacherTextsFromJ: ${teacherFromJ.size} (${teacherFromJHashes.size} unique hashes)`)
  console.log(`  distinctTeacherTextsFromK: ${teacherFromK.size} (${teacherFromKHashes.size} unique hashes)`)
  console.log(`  distinctTeacherTextsMerged: ${teacherMerged.size} (${teacherMergedHashes.size} unique hashes)`)

  // ── 4. Match against current Teacher table ───────────────────────
  console.log('\n[4/6] Current Teacher coverage')
  const dbTeachers = await prisma.teacher.findMany({ select: { id: true, name: true } })
  const dbTeacherNames = new Map<string, number[]>()
  for (const t of dbTeachers) {
    const n = normalize(t.name)
    const arr = dbTeacherNames.get(n) ?? []
    arr.push(t.id)
    dbTeacherNames.set(n, arr)
  }

  let matchedCurrent = 0, missingCurrent = 0, ambiguousCurrent = 0
  const missingTeacherHashes: string[] = []
  for (const t of teacherMerged) {
    const nt = normalize(t)
    const ids = dbTeacherNames.get(nt)
    if (ids && ids.length === 1) matchedCurrent++
    else if (ids && ids.length > 1) { ambiguousCurrent++; matchedCurrent++ }
    else { missingCurrent++; missingTeacherHashes.push(sha256(nt)) }
  }

  console.log(`  dbTeacherCount: ${dbTeachers.length}`)
  console.log(`  excelDistinctTeacherCount: ${teacherMerged.size}`)
  console.log(`  matchedInCurrentTeacher: ${matchedCurrent}`)
  console.log(`  missingInCurrentTeacher: ${missingCurrent}`)
  console.log(`  ambiguousInCurrentTeacher: ${ambiguousCurrent}`)
  const coverageCurrent = teacherMerged.size > 0 ? (matchedCurrent / teacherMerged.size * 100).toFixed(1) : '0.0'
  console.log(`  coverageRateCurrentTeacher: ${coverageCurrent}%`)
  console.log(`  teacherRowsBlockedIfOnlyCurrentTeacher: ${missingCurrent} teachers missing`)

  // ── 5. Staff DB coverage ─────────────────────────────────────────
  console.log('\n[5/6] Staff DB coverage')
  let staffDbReadable = false
  let staffNames: string[] = []
  let matchedStaff = 0, missingStaff = 0
  let currentMissingButStaffMatched = 0

  if (files.staffDb) {
    try {
      const staffPrisma = new PrismaClient({
        datasources: { db: { url: `file:${args.staffDb}` } },
      })
      const staffRows = await staffPrisma.$queryRawUnsafe<Array<{ 姓名: string }>>('SELECT 姓名 FROM 职员')
      staffDbReadable = true
      staffNames = staffRows.map((r) => normalize(String(r.姓名 ?? ''))).filter((s) => s.length >= 2)
      await staffPrisma.$disconnect()

      const staffNameSet = new Set(staffNames)
      for (const t of teacherMerged) {
        if (staffNameSet.has(normalize(t))) matchedStaff++
        else missingStaff++
      }
      // Check missing current teachers against staff DB
      for (const t of teacherMerged) {
        const nt = normalize(t)
        if (!dbTeacherNames.has(nt) && staffNameSet.has(nt)) {
          currentMissingButStaffMatched++
        }
      }
      console.log(`  staffDbReadable: true`)
      console.log(`  staffDbCandidatePersonCount: ${staffNames.length}`)
      console.log(`  matchedInStaffDb: ${matchedStaff}`)
      console.log(`  missingInStaffDb: ${missingStaff}`)
      console.log(`  currentTeacherMissingButStaffDbMatched: ${currentMissingButStaffMatched}`)
      console.log(`  staffDbCoverageRate: ${teacherMerged.size > 0 ? (matchedStaff / teacherMerged.size * 100).toFixed(1) : 0}%`)
    } catch (e) {
      console.log(`  staffDbReadable: false (${(e as Error).message})`)
    }
  } else {
    console.log('  staffDbReadable: false (file not found)')
  }

  // ── 6. Contacts xlsx coverage ────────────────────────────────────
  console.log('\n[6/6] Contacts xlsx coverage')
  let contactsReadable = false
  let contactsNames: string[] = []
  let matchedContacts = 0, missingContacts = 0
  let currentMissingButContactsMatched = 0

  if (files.contacts) {
    try {
      const contactsWb = new ExcelJS.Workbook()
      await contactsWb.xlsx.readFile(args.contactsXlsx)
      contactsReadable = true
      let sheetsInspected = 0
      for (const ws of contactsWb.worksheets) {
        if (ws.name === '目录' || ws.rowCount < 3) continue
        sheetsInspected++
        const headerRow = ws.getRow(2)
        let nameCol = -1
        headerRow.eachCell((cell, col) => {
          if (String(cell.value ?? '').trim() === '姓名') nameCol = col
        })
        if (nameCol < 0) continue
        for (let r = 3; r <= ws.rowCount; r++) {
          const v = String(ws.getRow(r).getCell(nameCol).value ?? '').trim()
          if (v.length >= 2) contactsNames.push(normalize(v))
        }
      }
      const contactsNameSet = new Set(contactsNames)
      for (const t of teacherMerged) {
        if (contactsNameSet.has(normalize(t))) matchedContacts++
        else missingContacts++
      }
      for (const t of teacherMerged) {
        const nt = normalize(t)
        if (!dbTeacherNames.has(nt) && contactsNameSet.has(nt)) {
          currentMissingButContactsMatched++
        }
      }
      console.log(`  contactsReadable: true`)
      console.log(`  contactsSheetsInspected: ${sheetsInspected}`)
      console.log(`  contactsCandidatePersonCount: ${contactsNames.length}`)
      console.log(`  matchedInContacts: ${matchedContacts}`)
      console.log(`  missingInContacts: ${missingContacts}`)
      console.log(`  currentTeacherMissingButContactsMatched: ${currentMissingButContactsMatched}`)
      console.log(`  contactsCoverageRate: ${teacherMerged.size > 0 ? (matchedContacts / teacherMerged.size * 100).toFixed(1) : 0}%`)
    } catch (e) {
      console.log(`  contactsReadable: false (${(e as Error).message})`)
    }
  } else {
    console.log('  contactsReadable: false (file not found)')
  }

  // ── ClassGroup coverage ──────────────────────────────────────────
  console.log('\n=== ClassGroup coverage ===')
  const sem4CGs = await prisma.classGroup.findMany({ where: { semesterId: args.targetSemesterId }, select: { id: true, name: true } })
  const sem4CGNames = new Set(sem4CGs.map((c) => normalize(c.name)))

  // Major DB readability
  let majorDbReadable = false
  let majorCount = 0
  let majorDbClassGroupCandidateCount = 0
  if (files.majorDb) {
    try {
      const majorWb = new ExcelJS.Workbook()
      await majorWb.xlsx.readFile(args.majorDbXlsx)
      majorDbReadable = true
      let sheetsInspected = 0
      for (const ws of majorWb.worksheets) {
        sheetsInspected++
        majorDbClassGroupCandidateCount += Math.max(0, ws.rowCount - 1)
      }
      console.log(`  majorDbReadable: true`)
      console.log(`  majorDbSheetsInspected: ${sheetsInspected}`)
      console.log(`  majorDbClassGroupCandidateCount: ${majorDbClassGroupCandidateCount}`)
    } catch (e) {
      console.log(`  majorDbReadable: false (${(e as Error).message})`)
    }
  } else {
    console.log('  majorDbReadable: false (file not found)')
  }

  console.log(`  excelClassGroupCandidateCount: ${classGroupCandidates.size}`)
  console.log(`  sem4ClassGroupCount: ${sem4CGs.length}`)

  // Check sem4 ClassGroups against Excel candidates
  let matchedSem4 = 0, missingSem4 = 0, ambiguousSem4 = 0
  for (const [key, cand] of classGroupCandidates) {
    // Try to find matching ClassGroup by searching for class number in sem4 names
    const classNoMatch = cand.classNo.replace(/[^0-9]/g, '')
    const majorNorm = normalize(cand.major)
    const found = sem4CGs.filter((cg) => {
      const cn = normalize(cg.name)
      return cn.includes(majorNorm) && cn.includes(classNoMatch)
    })
    if (found.length === 1) matchedSem4++
    else if (found.length > 1) ambiguousSem4++
    else missingSem4++
  }

  const coverageSem4 = classGroupCandidates.size > 0 ? (matchedSem4 / classGroupCandidates.size * 100).toFixed(1) : '0.0'
  console.log(`  matchedSem4ClassGroups: ${matchedSem4}`)
  console.log(`  missingSem4ClassGroups: ${missingSem4}`)
  console.log(`  ambiguousSem4ClassGroups: ${ambiguousSem4}`)
  console.log(`  coverageRateSem4ClassGroups: ${coverageSem4}%`)

  // ── Attribution matrix ───────────────────────────────────────────
  console.log('\n=== Attribution Matrix ===')
  const teacherDbIncomplete = currentMissingButStaffMatched > 0 ? 'YES' : missingCurrent > matchedCurrent ? 'PARTIAL' : 'NO'
  const teacherParserBroken = matchedCurrent === 0 && teacherMerged.size > 0 ? 'YES' : 'NO'
  const classGroupDbIncomplete = missingSem4 > matchedSem4 ? 'YES' : missingSem4 > 0 ? 'PARTIAL' : 'NO'
  const classGroupResolutionUnsafe = false // L7-F5D confirmed over-match, but rollback fixed it
  const applyHardGateMissing = 'YES'

  console.log(`  Teacher DB incomplete: ${teacherDbIncomplete}`)
  console.log(`  Teacher parser/resolution broken: ${teacherParserBroken}`)
  console.log(`  ClassGroup DB incomplete: ${classGroupDbIncomplete}`)
  console.log(`  ClassGroup resolution heuristic unsafe: YES (confirmed by L7-F5)`)
  console.log(`  Apply hard gate missing: ${applyHardGateMissing}`)

  // ── Next-stage recommendation ────────────────────────────────────
  console.log('\n=== Recommendation ===')
  const needsTeacherImport = missingCurrent > 0
  const needsClassGroupImport = missingSem4 > 0
  let nextStage = ''
  if (needsTeacherImport && needsClassGroupImport) {
    nextStage = 'L7-F6B-MASTER-DATA-IMPORT-PLAN-FROM-STAFF-AND-MAJOR-SOURCES'
    console.log('  Both Teacher and ClassGroup master data are incomplete.')
  } else if (needsTeacherImport) {
    nextStage = 'L7-F6B-TEACHER-MASTER-DATA-IMPORT-PLAN'
    console.log('  Teacher master data incomplete; ClassGroup adequate.')
  } else if (needsClassGroupImport) {
    nextStage = 'L7-F6B-CLASSGROUP-MASTER-DATA-IMPORT-PLAN'
    console.log('  ClassGroup master data incomplete; Teacher adequate.')
  } else {
    nextStage = 'L7-F6B-TEACHER-CLASSGROUP-RESOLUTION-HARD-GATE-FIX'
    console.log('  Master data adequate; code resolution needs hard gates.')
  }
  console.log(`  nextStage: ${nextStage}`)

  // ── Save artifact ────────────────────────────────────────────────
  const artifactDir = join(ROOT, 'temp', 'local-artifacts', 'l7-f6a')
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true })
  let headSha = ''
  try { headSha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim() } catch {}

  const result = {
    stage: 'L7-F6A-XLSX-MASTER-DATA-COVERAGE-AUDIT',
    dbWrite: false,
    head: headSha,
    targetSemesterId: args.targetSemesterId,
    inputFiles: files,
    baseline,
    teacherCoverage: {
      excelRowsTotal,
      excelRowsWithTeacherJ,
      excelRowsWithTeacherK,
      emptyTeacherRows,
      distinctTeacherTextsFromJ: teacherFromJ.size,
      distinctTeacherTextsFromK: teacherFromK.size,
      distinctTeacherTextsMerged: teacherMerged.size,
      dbTeacherCount: dbTeachers.length,
      matchedInCurrentTeacher: matchedCurrent,
      missingInCurrentTeacher: missingCurrent,
      ambiguousInCurrentTeacher: ambiguousCurrent,
      coverageRateCurrentTeacher: parseFloat(coverageCurrent),
      matchedInStaffDb: matchedStaff,
      missingInStaffDb: missingStaff,
      staffDbReadable,
      staffDbPersonCount: staffNames.length,
      currentMissingButStaffDbMatched: currentMissingButStaffMatched,
      matchedInContacts: matchedContacts,
      missingInContacts: missingContacts,
      contactsReadable,
      contactsPersonCount: contactsNames.length,
      currentMissingButContactsMatched: currentMissingButContactsMatched,
      missingTeacherHashSample: missingTeacherHashes.slice(0, 10),
    },
    classGroupCoverage: {
      excelClassGroupCandidateCount: classGroupCandidates.size,
      sem4ClassGroupCount: sem4CGs.length,
      matchedSem4ClassGroups: matchedSem4,
      missingSem4ClassGroups: missingSem4,
      ambiguousSem4ClassGroups: ambiguousSem4,
      coverageRateSem4ClassGroups: parseFloat(coverageSem4),
      majorDbReadable,
      majorDbClassGroupCandidateCount,
    },
    attributionMatrix: {
      teacherDbIncomplete,
      teacherParserResolutionBroken: teacherParserBroken,
      classGroupDbIncomplete,
      classGroupResolutionUnsafe: 'YES',
      applyHardGateMissing,
    },
    nextStageRecommendation: nextStage,
    rawIncluded: false,
  }

  const artifactPath = join(artifactDir, 'audit.json')
  writeFileSync(artifactPath, JSON.stringify(result, null, 2) + '\n', 'utf-8')
  console.log(`\nartifact: ${artifactPath}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
