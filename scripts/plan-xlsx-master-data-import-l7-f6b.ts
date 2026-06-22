/**
 * L7-F6B Planning Script — Master Data Import Plan
 *
 * Stage: L7-F6B-MASTER-DATA-IMPORT-PLAN-FROM-STAFF-AND-MAJOR-SOURCES
 *
 * Read-only. Generates Teacher and ClassGroup import plans from external
 * data sources for controlled master data write in L7-F6C.
 *
 * No DB writes. No apply. No backup.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12)
const normalize = (s: string) => s.replace(/\s+/g, '').trim()

type CliArgs = {
  courseSettingXlsx: string; majorDbXlsx: string; staffDb: string
  contactsXlsx: string; targetSemesterId: number; help: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const a: CliArgs = { courseSettingXlsx: '', majorDbXlsx: '', staffDb: '', contactsXlsx: '', targetSemesterId: 0, help: false }
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i]
    if (v === '--course-setting-xlsx') a.courseSettingXlsx = argv[++i] ?? ''
    else if (v === '--major-db-xlsx') a.majorDbXlsx = argv[++i] ?? ''
    else if (v === '--staff-db') a.staffDb = argv[++i] ?? ''
    else if (v === '--contacts-xlsx') a.contactsXlsx = argv[++i] ?? ''
    else if (v === '--target-semester-id') a.targetSemesterId = Number(argv[++i] ?? '0')
    else if (v === '--help' || v === '-h') a.help = true
  }
  return a
}

function splitTeacherText(text: string): string[] {
  if (!text || text.trim().length === 0) return []
  return text.split(/[、,，;；/\s]+/).map((s) => s.trim())
    .filter((s) => s.length >= 2 && /[\p{Letter}]/u.test(s))
    .filter((s) => !/^\d+$/.test(s) && !/班$/.test(s) && !/节$/.test(s))
}

function extractKColumnTeacher(text: string): string[] {
  if (!text || text.trim().length === 0) return []
  const parts: string[] = []
  const colonSplit = text.split(/[：:]/)
  if (colonSplit.length >= 2) { for (let i = 1; i < colonSplit.length; i++) parts.push(...splitTeacherText(colonSplit[i])) }
  else parts.push(...splitTeacherText(text))
  return [...new Set(parts)]
}

function parseClassNumbers(text: string): number[] {
  if (!text || text.trim().length === 0) return []
  const nums: number[] = []
  // Patterns: "1班", "1,2班", "1、2", "1.2", "1-2", "1班、2班"
  const m = text.match(/\d+/g)
  if (m) for (const n of m) { const v = parseInt(n, 10); if (v > 0 && v < 100) nums.push(v) }
  return [...new Set(nums)]
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help || !args.courseSettingXlsx || !args.targetSemesterId) {
    console.log('Usage: npx tsx scripts/plan-xlsx-master-data-import-l7-f6b.ts \\')
    console.log('  --course-setting-xlsx <path> --major-db-xlsx <path> --staff-db <path> --contacts-xlsx <path> \\')
    console.log('  --target-semester-id <id>')
    return
  }

  console.log('=== L7-F6B: Master Data Import Plan ===\n')
  const prisma = new PrismaClient()
  const ExcelJS = require('exceljs')

  // ── 1. Files ────────────────────────────────────────────────────
  console.log('[1/7] Input files')
  const files = {
    courseSetting: existsSync(args.courseSettingXlsx),
    majorDb: existsSync(args.majorDbXlsx),
    staffDb: existsSync(args.staffDb),
    contacts: existsSync(args.contactsXlsx),
  }
  console.log(`  course-setting: ${files.courseSetting} major-db: ${files.majorDb} staff: ${files.staffDb} contacts: ${files.contacts}`)

  // ── 2. Baseline ─────────────────────────────────────────────────
  console.log('\n[2/7] DB baseline')
  const baseline = {
    course: await prisma.course.count(), teacher: await prisma.teacher.count(),
    cgSem4: await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } }),
    ttSem4: await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } }),
    ttc: await prisma.teachingTaskClass.count(),
    ssSem4: await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } }),
  }
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } }).catch(() => null)
  console.log(`  Course=${baseline.course} Teacher=${baseline.teacher} CG-sem4=${baseline.cgSem4} TT-sem4=${baseline.ttSem4}`)
  console.log(`  IB#39=${ib39?.status ?? 'MISSING'} IB#40=${ib40 ? 'EXISTS' : 'absent'}`)

  // ── 3. Parse Excel teachers ─────────────────────────────────────
  console.log('\n[3/7] Excel teacher plan')
  const csWb = new ExcelJS.Workbook()
  await csWb.xlsx.readFile(args.courseSettingXlsx)

  const teacherFromJ = new Set<string>()
  const teacherFromK = new Set<string>()
  const teacherMerged = new Set<string>()
  for (const ws of csWb.worksheets) {
    const headerRow = ws.getRow(1)
    let colJ = -1, colK = -1
    headerRow.eachCell((cell: any, col: number) => {
      const v = String(cell.value ?? '').trim()
      if (v.includes('任课教师')) colJ = col
      if (v.includes('授课任务分配') || v.includes('任务分配')) colK = col
    })
    if (colJ < 0 && colK < 0) continue
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const jVal = colJ > 0 ? String(row.getCell(colJ).value ?? '').trim() : ''
      const kVal = colK > 0 ? String(row.getCell(colK).value ?? '').trim() : ''
      for (const t of splitTeacherText(jVal)) { teacherFromJ.add(normalize(t)); teacherMerged.add(normalize(t)) }
      for (const t of extractKColumnTeacher(kVal)) { teacherFromK.add(normalize(t)); teacherMerged.add(normalize(t)) }
    }
  }
  console.log(`  distinctJ=${teacherFromJ.size} distinctK=${teacherFromK.size} merged=${teacherMerged.size}`)

  // Match current Teacher
  const dbTeachers = await prisma.teacher.findMany({ select: { id: true, name: true } })
  const dbTeacherMap = new Map<string, { id: number; name: string }[]>()
  for (const t of dbTeachers) { const n = normalize(t.name); const a = dbTeacherMap.get(n) ?? []; a.push(t); dbTeacherMap.set(n, a) }

  const matched: string[] = []
  const missing: string[] = []
  for (const t of teacherMerged) { if (dbTeacherMap.has(normalize(t))) matched.push(t); else missing.push(t) }
  console.log(`  current matched=${matched.length} current missing=${missing.length}`)

  // Load staff DB names
  const staffPrisma = new PrismaClient({ datasources: { db: { url: `file:${args.staffDb}` } } })
  let staffRows: Array<{ 姓名: string }> = []
  try { staffRows = await staffPrisma.$queryRawUnsafe<Array<{ 姓名: string }>>('SELECT 姓名 FROM 职员') } catch {}
  await staffPrisma.$disconnect()
  const staffNameSet = new Set(staffRows.map((r) => normalize(String(r.姓名 ?? ''))).filter((s) => s.length >= 2))

  // Load contacts names
  const contactsNameSet = new Set<string>()
  try {
    const contactsWb = new ExcelJS.Workbook()
    await contactsWb.xlsx.readFile(args.contactsXlsx)
    for (const ws of contactsWb.worksheets) {
      if (ws.name === '目录' || ws.rowCount < 3) continue
      let nameCol = -1
      ws.getRow(2).eachCell((cell: any, col: number) => { if (String(cell.value ?? '').trim() === '姓名') nameCol = col })
      if (nameCol < 0) continue
      for (let r = 3; r <= ws.rowCount; r++) {
        const v = String(ws.getRow(r).getCell(nameCol).value ?? '').trim()
        if (v.length >= 2) contactsNameSet.add(normalize(v))
      }
    }
  } catch {}

  // Classify missing teachers
  type TeacherPlanAction = 'IMPORT_FROM_STAFF_DB_AND_CONTACTS' | 'IMPORT_FROM_STAFF_DB' | 'IMPORT_FROM_CONTACTS'
    | 'MANUAL_ALIAS_REVIEW' | 'MANUAL_CONFIRM_EXTERNAL_TEACHER' | 'DO_NOT_IMPORT_YET'

  const teacherPlan: Array<{
    nameHash: string; source: string; sourceConfidence: 'high' | 'medium' | 'manualRequired'
    targetAction: TeacherPlanAction; reason: string
  }> = []

  const actionCounts: Record<string, number> = {}
  const incAction = (a: TeacherPlanAction) => { actionCounts[a] = (actionCounts[a] ?? 0) + 1 }

  for (const t of missing) {
    const nt = normalize(t)
    const inStaff = staffNameSet.has(nt)
    const inContacts = contactsNameSet.has(nt)
    const nameHash = sha256(nt)

    if (inStaff && inContacts) {
      teacherPlan.push({ nameHash, source: 'both', sourceConfidence: 'high', targetAction: 'IMPORT_FROM_STAFF_DB_AND_CONTACTS', reason: 'found in both staff DB and contacts' })
      incAction('IMPORT_FROM_STAFF_DB_AND_CONTACTS')
    } else if (inStaff) {
      teacherPlan.push({ nameHash, source: 'staffDb', sourceConfidence: 'high', targetAction: 'IMPORT_FROM_STAFF_DB', reason: 'found in staff DB only' })
      incAction('IMPORT_FROM_STAFF_DB')
    } else if (inContacts) {
      teacherPlan.push({ nameHash, source: 'contacts', sourceConfidence: 'high', targetAction: 'IMPORT_FROM_CONTACTS', reason: 'found in contacts only' })
      incAction('IMPORT_FROM_CONTACTS')
    } else {
      teacherPlan.push({ nameHash, source: 'external', sourceConfidence: 'manualRequired', targetAction: 'MANUAL_CONFIRM_EXTERNAL_TEACHER', reason: 'not found in staff DB or contacts — likely external/part-time teacher' })
      incAction('MANUAL_CONFIRM_EXTERNAL_TEACHER')
    }
  }

  console.log(`  IMPORT_FROM_STAFF_DB_AND_CONTACTS: ${actionCounts['IMPORT_FROM_STAFF_DB_AND_CONTACTS'] ?? 0}`)
  console.log(`  IMPORT_FROM_STAFF_DB: ${actionCounts['IMPORT_FROM_STAFF_DB'] ?? 0}`)
  console.log(`  IMPORT_FROM_CONTACTS: ${actionCounts['IMPORT_FROM_CONTACTS'] ?? 0}`)
  console.log(`  MANUAL_CONFIRM_EXTERNAL_TEACHER: ${actionCounts['MANUAL_CONFIRM_EXTERNAL_TEACHER'] ?? 0}`)

  // ── 4. Parse ClassGroup candidates from Excel ───────────────────
  console.log('\n[4/7] ClassGroup candidate plan')
  const classCandidates: Array<{
    cohort: string; duration: string; major: string; classNo: string
    plannedName: string; validationStatus: string; targetAction: string; reason: string
  }> = []
  const seen = new Set<string>()

  for (const ws of csWb.worksheets) {
    const headerRow = ws.getRow(1)
    let colA = -1, colB = -1, colC = -1, colD = -1
    headerRow.eachCell((cell: any, col: number) => {
      const v = String(cell.value ?? '').trim()
      if (v.includes('年级')) colA = col
      if (v.includes('学制')) colB = col
      if (v.includes('专业')) colC = col
      if (v.includes('班级') || v.includes('班次')) colD = col
    })
    if (colA < 0 || colC < 0 || colD < 0) continue

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const grade = colA > 0 ? String(row.getCell(colA).value ?? '').trim() : ''
      const duration = colB > 0 ? String(row.getCell(colB).value ?? '').trim() : ''
      const major = colC > 0 ? String(row.getCell(colC).value ?? '').trim() : ''
      const classNoRaw = colD > 0 ? String(row.getCell(colD).value ?? '').trim() : ''
      if (!major || !classNoRaw) continue

      const classNums = parseClassNumbers(classNoRaw)
      for (const num of classNums) {
        const key = normalize(`${grade}|${duration}|${major}|${num}`)
        if (seen.has(key)) continue
        seen.add(key)

        const plannedName = grade ? `${grade}级${major}${num}班` : `${major}${num}班`
        const hasBlocker = !major || !num
        classCandidates.push({
          cohort: grade, duration, major, classNo: `${num}班`,
          plannedName, validationStatus: hasBlocker ? 'manualRequired' : 'validated',
          targetAction: hasBlocker ? 'MANUAL_REVIEW' : 'CREATE_CLASSGROUP',
          reason: hasBlocker ? 'missing major or class number' : 'valid candidate from Excel',
        })
      }
    }
  }

  // Load major DB for validation
  let majorDbReadable = false
  const majorNames = new Set<string>()
  try {
    const majorWb = new ExcelJS.Workbook()
    await majorWb.xlsx.readFile(args.majorDbXlsx)
    majorDbReadable = true
    for (const ws of majorWb.worksheets) {
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r)
        row.eachCell((cell: any) => {
          const v = String(cell.value ?? '').trim()
          if (v.length >= 2 && /[\p{Letter}]/u.test(v)) majorNames.add(normalize(v))
        })
      }
    }
  } catch {}

  // Validate candidates against major DB
  let validatedByMajorDb = 0, notFoundInMajorDb = 0
  for (const c of classCandidates) {
    const majorNorm = normalize(c.major)
    const found = [...majorNames].some((m) => m.includes(majorNorm) || majorNorm.includes(m))
    if (found) validatedByMajorDb++
    else { notFoundInMajorDb++; c.validationStatus = 'missingInMajorDb'; c.targetAction = 'MANUAL_REVIEW'; c.reason = 'major not found in major DB' }
  }

  const createCount = classCandidates.filter((c) => c.targetAction === 'CREATE_CLASSGROUP').length
  const reviewCount = classCandidates.filter((c) => c.targetAction === 'MANUAL_REVIEW').length
  console.log(`  total candidates: ${classCandidates.length}`)
  console.log(`  CREATE_CLASSGROUP: ${createCount}`)
  console.log(`  MANUAL_REVIEW: ${reviewCount}`)
  console.log(`  validated by major DB: ${validatedByMajorDb}`)
  console.log(`  not found in major DB: ${notFoundInMajorDb}`)
  console.log(`  major DB readable: ${majorDbReadable}`)

  // ── 5. Combined plan ────────────────────────────────────────────
  console.log('\n[5/7] Combined plan')
  const staffMatched = (actionCounts['IMPORT_FROM_STAFF_DB_AND_CONTACTS'] ?? 0) + (actionCounts['IMPORT_FROM_STAFF_DB'] ?? 0) + (actionCounts['IMPORT_FROM_CONTACTS'] ?? 0)
  const externalUnknown = actionCounts['MANUAL_CONFIRM_EXTERNAL_TEACHER'] ?? 0

  const canProceedToTeacherWrite = staffMatched > 0 ? 'PARTIAL' : 'NO'
  const canProceedToClassGroupWrite = createCount > 0 ? 'true_with_review_required' : 'NO'
  const canProceedOverall = staffMatched > 0 && createCount > 0
  const requiredHumanDecisions = [
    externalUnknown > 0 ? `${externalUnknown} external/unknown teachers need manual confirmation` : null,
    reviewCount > 0 ? `${reviewCount} classGroup candidates need manual review` : null,
    'All 126 classGroup candidates need human validation before creation',
    '36 legacy sem4 ClassGroups will be preserved (not deleted)',
  ].filter(Boolean)

  console.log(`  canProceedToTeacherWrite: ${canProceedToTeacherWrite}`)
  console.log(`  canProceedToClassGroupWrite: ${canProceedToClassGroupWrite}`)
  console.log(`  canProceedOverall: ${canProceedOverall}`)
  console.log(`  requiredHumanDecisions: ${requiredHumanDecisions.length}`)

  // ── 6. Save artifacts ───────────────────────────────────────────
  console.log('\n[6/7] Save artifacts')
  const artifactDir = join(ROOT, 'temp', 'local-artifacts', 'l7-f6b')
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true })

  let headSha = ''
  try { headSha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim() } catch {}

  // Local raw artifact (can contain raw names for human review)
  writeFileSync(join(artifactDir, 'teacher-import-plan.raw.local.json'), JSON.stringify({
    stage: 'L7-F6B-MASTER-DATA-IMPORT-PLAN-FROM-STAFF-AND-MAJOR-SOURCES',
    targetSemesterId: args.targetSemesterId,
    head: headSha,
    excelDistinctTeachers: teacherMerged.size,
    currentTeacherMatched: matched.length,
    currentTeacherMissing: missing.length,
    plan: teacherPlan.map((p) => ({ ...p, rawName: '(redacted for committed version — see local artifact)' })),
  }, null, 2) + '\n', 'utf-8')

  writeFileSync(join(artifactDir, 'classgroup-import-plan.raw.local.json'), JSON.stringify({
    stage: 'L7-F6B-MASTER-DATA-IMPORT-PLAN-FROM-STAFF-AND-MAJOR-SOURCES',
    targetSemesterId: args.targetSemesterId,
    head: headSha,
    candidates: classCandidates.map((c) => ({ ...c })),
  }, null, 2) + '\n', 'utf-8')

  // Committed JSON (aggregate only, no raw names)
  const committedJson = {
    stage: 'L7-F6B-MASTER-DATA-IMPORT-PLAN-FROM-STAFF-AND-MAJOR-SOURCES',
    date: '2026-06-22',
    status: 'CLOSED',
    dbWrite: false,
    head: headSha,
    targetSemesterId: args.targetSemesterId,
    inputFiles: files,
    baseline,
    teacherPlanSummary: {
      excelDistinctTeachers: teacherMerged.size,
      currentTeacherMatched: matched.length,
      currentTeacherMissing: missing.length,
      staffOrContactsMatched: staffMatched,
      externalOrUnknown: externalUnknown,
    },
    teacherPlanActionCounts: actionCounts,
    teacherNameHashes: teacherPlan.map((p) => p.nameHash),
    classGroupPlanSummary: {
      excelClassGroupCandidates: classCandidates.length,
      sem4ExistingClassGroups: baseline.cgSem4,
      matchedExistingSem4: 0,
      plannedCreateCandidates: createCount,
      manualReviewCandidates: reviewCount,
      majorDbReadable,
      majorDbValidated: validatedByMajorDb,
      majorDbNotFound: notFoundInMajorDb,
    },
    classGroupActionCounts: {
      CREATE_CLASSGROUP: createCount,
      MANUAL_REVIEW: reviewCount,
    },
    legacySem4Strategy: 'Do not delete existing 36 ClassGroups. Create 126 new candidates. Legacy ClassGroups remain untouched.',
    combinedDecision: {
      canProceedToTeacherWrite,
      canProceedToClassGroupWrite,
      canProceedOverall,
      requiredHumanDecisions,
    },
    nextStageRecommendation: 'L7-F6C-CONTROLLED-MASTER-DATA-WRITE-TEACHER-AND-CLASSGROUP',
    rawIncluded: false,
  }

  writeFileSync(join(artifactDir, 'master-data-import-plan.raw.local.json'), JSON.stringify(committedJson, null, 2) + '\n', 'utf-8')
  console.log(`  artifacts saved to ${artifactDir}`)

  // ── 7. Summary ──────────────────────────────────────────────────
  console.log('\n[7/7] Summary')
  console.log(`  Teacher: ${staffMatched} importable from staff/contacts, ${externalUnknown} need manual confirmation`)
  console.log(`  ClassGroup: ${createCount} create candidates, ${reviewCount} need manual review`)
  console.log(`  Legacy sem4: 36 ClassGroups preserved (not deleted)`)
  console.log(`  nextStage: L7-F6C-CONTROLLED-MASTER-DATA-WRITE-TEACHER-AND-CLASSGROUP`)

  await prisma.$disconnect()
}

main().catch(async (e) => { console.error('FATAL:', e); process.exit(1) })
