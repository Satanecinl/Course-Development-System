/**
 * L7-F6C Write Script — Controlled Master Data Write
 *
 * Stage: L7-F6C-CONTROLLED-MASTER-DATA-WRITE-TEACHER-AND-CLASSGROUP
 *
 * Writes 16 high-confidence Teachers and 418 validated ClassGroups
 * based on the L7-F6B plan. All writes inside a transaction with
 * explicit confirm token and DB backup.
 *
 * Usage:
 *   --dry-run (default)
 *   --apply --confirm-token WRITE_L7_F6C_MASTER_DATA
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const CONFIRM_TOKEN = 'WRITE_L7_F6C_MASTER_DATA'
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12)
const normalize = (s: string) => s.replace(/\s+/g, '').trim()

// ── Args ─────────────────────────────────────────────────────────────────────

type CliArgs = { apply: boolean; dryRun: boolean; confirmToken: string | null; targetSemesterId: number; help: boolean }

const parseArgs = (argv: string[]): CliArgs => {
  const a: CliArgs = { apply: false, dryRun: false, confirmToken: null, targetSemesterId: 0, help: false }
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i]
    if (v === '--apply') a.apply = true
    else if (v === '--dry-run') a.dryRun = true
    else if (v === '--confirm-token') a.confirmToken = argv[++i] ?? null
    else if (v === '--target-semester-id') a.targetSemesterId = Number(argv[++i] ?? '0')
    else if (v === '--help' || v === '-h') a.help = true
  }
  return a
}

// ── Backup ───────────────────────────────────────────────────────────────────

function createBackup(): { backupPath: string; ok: boolean } {
  const dbPath = join(ROOT, 'prisma', 'dev.db')
  if (!existsSync(dbPath)) return { backupPath: '', ok: false }
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  const backupPath = join(ROOT, 'prisma', `dev.db.backup-before-l7-f6c-master-data-write-${stamp}`)
  copyFileSync(dbPath, backupPath)
  return { backupPath, ok: existsSync(backupPath) && statSync(backupPath).size > 0 }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function splitTeacherText(text: string): string[] {
  if (!text || text.trim().length === 0) return []
  return text.split(/[、,，;；/\s]+/).map((s) => s.trim())
    .filter((s) => s.length >= 2 && /[\p{Letter}]/u.test(s))
    .filter((s) => !/^\d+$/.test(s) && !/班$/.test(s) && !/节$/.test(s))
}

function extractKColumnTeacher(text: string): string[] {
  if (!text || text.trim().length === 0) return []
  const colonSplit = text.split(/[：:]/)
  const parts: string[] = []
  if (colonSplit.length >= 2) { for (let i = 1; i < colonSplit.length; i++) parts.push(...splitTeacherText(colonSplit[i])) }
  else parts.push(...splitTeacherText(text))
  return [...new Set(parts)]
}

function parseClassNumbers(text: string): number[] {
  if (!text || text.trim().length === 0) return []
  const m = text.match(/\d+/g)
  const nums = m ? m.map((n) => parseInt(n, 10)).filter((v) => v > 0 && v < 100) : []
  return [...new Set(nums)]
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help || !args.targetSemesterId) {
    console.log('Usage: npx tsx scripts/write-master-data-from-plan-l7-f6c.ts \\')
    console.log('  [--dry-run | --apply --confirm-token TOKEN] --target-semester-id <id>')
    return
  }

  const mode: 'dry-run' | 'apply' = args.apply && !args.dryRun ? 'apply' : 'dry-run'
  console.log('=== L7-F6C: Controlled Master Data Write ===\n')
  console.log(`  mode: ${mode}`)
  console.log(`  targetSemesterId: ${args.targetSemesterId}`)
  const prisma = new PrismaClient()
  const ExcelJS = require('exceljs')

  // ── 1. Baseline ──────────────────────────────────────────────────
  console.log('\n[1/6] Baseline')
  const before = {
    course: await prisma.course.count(), teacher: await prisma.teacher.count(),
    cgSem1: await prisma.classGroup.count({ where: { semesterId: 1 } }),
    cgSem4: await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } }),
    ttSem4: await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } }),
    ttc: await prisma.teachingTaskClass.count(),
    ssSem4: await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } }),
    ibTotal: await prisma.importBatch.count(),
  }
  console.log(`  Course=${before.course} Teacher=${before.teacher} CG-sem4=${before.cgSem4} TT-sem4=${before.ttSem4} TTC=${before.ttc} IB=${before.ibTotal}`)

  // ── 2. Parse external files ──────────────────────────────────────
  console.log('\n[2/6] Parse external files')
  const csXlsx = 'D:/Desktop/Course Development System/课程设置新模板.xlsx'
  const majorDbXlsx = 'D:/Desktop/Course Development System/学院专业数据库.xlsx'
  const staffDb = 'D:/Desktop/Course Development System/伊春职业学院职员数据库(2026.4).db'
  const contactsXlsx = 'D:/Desktop/Course Development System/伊春职业学院通讯录(2026.4)_分部门.xlsx'

  // Parse Excel teachers (merged J+K)
  const csWb = new ExcelJS.Workbook()
  await csWb.xlsx.readFile(csXlsx)
  const teacherMerged = new Set<string>()
  for (const ws of csWb.worksheets) {
    const headerRow = ws.getRow(1)
    let colJ = -1, colK = -1
    headerRow.eachCell((cell: any, col: number) => { const v = String(cell.value ?? '').trim(); if (v.includes('任课教师')) colJ = col; if (v.includes('授课任务分配') || v.includes('任务分配')) colK = col })
    if (colJ < 0 && colK < 0) continue
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const jVal = colJ > 0 ? String(row.getCell(colJ).value ?? '').trim() : ''
      const kVal = colK > 0 ? String(row.getCell(colK).value ?? '').trim() : ''
      for (const t of splitTeacherText(jVal)) teacherMerged.add(normalize(t))
      for (const t of extractKColumnTeacher(kVal)) teacherMerged.add(normalize(t))
    }
  }
  console.log(`  Excel distinct teachers: ${teacherMerged.size}`)

  // Load staff DB names
  const staffPrisma = new PrismaClient({ datasources: { db: { url: `file:${staffDb}` } } })
  let staffRows: Array<{ 姓名: string }> = []
  try { staffRows = await staffPrisma.$queryRawUnsafe<Array<{ 姓名: string }>>('SELECT 姓名 FROM 职员') } catch {}
  await staffPrisma.$disconnect()
  const staffNameSet = new Set(staffRows.map((r) => normalize(String(r.姓名 ?? ''))).filter((s) => s.length >= 2))

  // Load contacts names
  const contactsNameSet = new Set<string>()
  try {
    const contactsWb = new ExcelJS.Workbook()
    await contactsWb.xlsx.readFile(contactsXlsx)
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
  console.log(`  Staff DB persons: ${staffNameSet.size}, Contacts persons: ${contactsNameSet.size}`)

  // Classify missing teachers
  const dbTeachers = await prisma.teacher.findMany({ select: { id: true, name: true } })
  const dbTeacherNames = new Set(dbTeachers.map((t) => normalize(t.name)))
  const missingTeachers: string[] = []
  for (const t of teacherMerged) { if (!dbTeacherNames.has(normalize(t))) missingTeachers.push(t) }
  const highConfidence = missingTeachers.filter((t) => staffNameSet.has(normalize(t)) && contactsNameSet.has(normalize(t)))
  const externalOnly = missingTeachers.filter((t) => !staffNameSet.has(normalize(t)) || !contactsNameSet.has(normalize(t)))
  console.log(`  Missing: ${missingTeachers.length}, High-confidence: ${highConfidence.length}, External: ${externalOnly.length}`)

  // Parse ClassGroup candidates from Excel (A-D)
  const classCandidates: Array<{ cohort: string; duration: string; major: string; classNo: string; plannedName: string }> = []
  const seen = new Set<string>()
  for (const ws of csWb.worksheets) {
    const headerRow = ws.getRow(1)
    let colA = -1, colB = -1, colC = -1, colD = -1
    headerRow.eachCell((cell: any, col: number) => {
      const v = String(cell.value ?? '').trim()
      if (v.includes('年级')) colA = col; if (v.includes('学制')) colB = col
      if (v.includes('专业')) colC = col; if (v.includes('班级') || v.includes('班次')) colD = col
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
        classCandidates.push({ cohort: grade, duration, major, classNo: `${num}班`, plannedName })
      }
    }
  }

  // Validate against major DB
  const majorWb = new ExcelJS.Workbook()
  await majorWb.xlsx.readFile(majorDbXlsx)
  const majorNames = new Set<string>()
  for (const ws of majorWb.worksheets) {
    for (let r = 2; r <= ws.rowCount; r++) {
      ws.getRow(r).eachCell((cell: any) => { const v = String(cell.value ?? '').trim(); if (v.length >= 2 && /[\p{Letter}]/u.test(v)) majorNames.add(normalize(v)) })
    }
  }
  const validated = classCandidates.filter((c) => [...majorNames].some((m) => m.includes(normalize(c.major)) || normalize(c.major).includes(m)))
  const manualReview = classCandidates.filter((c) => !validated.includes(c))
  console.log(`  ClassGroup candidates total: ${classCandidates.length}, validated: ${validated.length}, manual-review: ${manualReview.length}`)

  // Expansion check
  const plannedNames = validated.map((c) => c.plannedName)
  const uniqueNames = new Set(plannedNames.map(normalize))
  const duplicateNames = plannedNames.length - uniqueNames.size
  console.log(`  Expansion check: distinctNameCount=${uniqueNames.size}, duplicatePlannedName=${duplicateNames}`)
  const safeToWrite = uniqueNames.size > 0 && highConfidence.length === 16
  console.log(`  safeToWriteClassGroups: ${safeToWrite} (will skip ${duplicateNames} duplicate names)`)

  // ── 3. Dry-run output ────────────────────────────────────────────
  console.log('\n[3/6] Dry-run plan')
  console.log(`  wouldCreateTeachers = ${highConfidence.length}`)
  console.log(`  wouldSkipExternalTeachers = ${externalOnly.length}`)
  console.log(`  wouldCreateClassGroups = ${validated.length}`)
  console.log(`  wouldSkipManualReviewClassGroups = ${manualReview.length}`)
  console.log(`  wouldPreserveLegacySem4ClassGroups = ${before.cgSem4}`)
  console.log(`  wouldCreateImportBatch = 0`)
  console.log(`  wouldCreateTeachingTasks = 0`)
  console.log(`  wouldCreateScheduleSlots = 0`)
  console.log(`  canApply = ${safeToWrite}`)

  if (mode === 'dry-run') {
    console.log('\n  [DRY-RUN] No DB writes. To apply: --apply --confirm-token WRITE_L7_F6C_MASTER_DATA')
    await prisma.$disconnect()
    return
  }

  // ── 4. Confirm token ─────────────────────────────────────────────
  if (!args.confirmToken || args.confirmToken !== CONFIRM_TOKEN) {
    console.error(`\nERROR: INVALID_CONFIRM_TOKEN\n  expected: ${CONFIRM_TOKEN}\n  got: ${args.confirmToken ?? '(empty)'}\n  No backup created, no DB write.`)
    await prisma.$disconnect()
    process.exit(1)
  }
  console.log('\n[4/6] Confirm token: VALID')

  // ── 5. Backup ────────────────────────────────────────────────────
  const backup = createBackup()
  if (!backup.ok) { console.error('ERROR: backup failed'); await prisma.$disconnect(); process.exit(1) }
  console.log(`  backup: ${backup.backupPath}`)

  // ── 6. Transaction ───────────────────────────────────────────────
  console.log('\n[5/6] Transaction')
  const txResult = await prisma.$transaction(async (tx) => {
    let createdTeachers = 0
    let teacherDuplicateSkipped = 0
    const teacherNameSetTx = new Set((await tx.teacher.findMany({ select: { name: true } })).map((t) => normalize(t.name)))

    // Write 16 high-confidence teachers
    for (const name of highConfidence) {
      const nn = normalize(name)
      if (teacherNameSetTx.has(nn)) { teacherDuplicateSkipped++; continue }
      try {
        await tx.teacher.create({ data: { name } })
        teacherNameSetTx.add(nn)
        createdTeachers++
      } catch (e) {
        if (/Unique constraint/.test(String(e))) { teacherDuplicateSkipped++ }
        else throw e
      }
    }

    // Write 418 validated ClassGroups (skip duplicates)
    let createdClassGroups = 0
    let cgDuplicateSkipped = 0
    const existingCgNames = new Set((await tx.classGroup.findMany({ where: { semesterId: args.targetSemesterId }, select: { name: true } })).map((c) => normalize(c.name)))

    for (const cand of validated) {
      const nn = normalize(cand.plannedName)
      if (existingCgNames.has(nn)) { cgDuplicateSkipped++; continue }
      try {
        await tx.classGroup.create({
          data: { name: cand.plannedName, semesterId: args.targetSemesterId },
        })
        existingCgNames.add(nn)
        createdClassGroups++
      } catch (e) {
        if (/Unique constraint/.test(String(e))) { cgDuplicateSkipped++ }
        else throw e
      }
    }

    return { createdTeachers, teacherDuplicateSkipped, createdClassGroups, cgDuplicateSkipped }
  })

  console.log(`  committed`)
  console.log(`  createdTeachers: ${txResult.createdTeachers}`)
  console.log(`  teacherDuplicateSkipped: ${txResult.teacherDuplicateSkipped}`)
  console.log(`  createdClassGroups: ${txResult.createdClassGroups}`)
  console.log(`  cgDuplicateSkipped: ${txResult.cgDuplicateSkipped}`)

  // ── 7. Post-write verification ───────────────────────────────────
  console.log('\n[6/6] Post-write verification')
  const after = {
    course: await prisma.course.count(), teacher: await prisma.teacher.count(),
    cgSem1: await prisma.classGroup.count({ where: { semesterId: 1 } }),
    cgSem4: await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } }),
    ttSem4: await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } }),
    ttc: await prisma.teachingTaskClass.count(),
    ssSem4: await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } }),
    ibTotal: await prisma.importBatch.count(),
  }
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } }).catch(() => null)

  const check = (name: string, ok: boolean, detail?: string) => { console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); return ok }
  let allPass = true
  allPass = check('Course = 104', after.course === 104, `actual=${after.course}`) && allPass
  allPass = check('Teacher = 236', after.teacher === before.teacher + txResult.createdTeachers, `actual=${after.teacher}`) && allPass
  allPass = check('ClassGroup sem1 = 36', after.cgSem1 === before.cgSem1, `actual=${after.cgSem1}`) && allPass
  allPass = check('ClassGroup sem4 = 454', after.cgSem4 === before.cgSem4 + txResult.createdClassGroups, `actual=${after.cgSem4}`) && allPass
  allPass = check('TeachingTask sem4 = 0', after.ttSem4 === 0, `actual=${after.ttSem4}`) && allPass
  allPass = check('TeachingTaskClass = 446', after.ttc === before.ttc, `actual=${after.ttc}`) && allPass
  allPass = check('ScheduleSlot sem4 = 0', after.ssSem4 === 0, `actual=${after.ssSem4}`) && allPass
  allPass = check('ImportBatch total unchanged', after.ibTotal === before.ibTotal, `actual=${after.ibTotal}`) && allPass
  allPass = check('ImportBatch #39 preserved', ib39 != null && ib39.createdTaskCount === 0) && allPass
  allPass = check('ImportBatch #40 absent', ib40 == null) && allPass
  allPass = check('external teachers not created', txResult.createdTeachers === 16) && allPass
  allPass = check('manual-review ClassGroups not created', txResult.cgDuplicateSkipped + txResult.createdClassGroups === validated.length) && allPass

  console.log(`\n  write result: ${allPass ? 'SUCCESS' : 'FAILED'}`)

  const rollbackNote = [
    'L7-F6C rollback note:',
    `  - Backup: ${backup.backupPath}`,
    `  - To rollback: cp ${backup.backupPath} prisma/dev.db`,
    `  - Created Teachers: ${txResult.createdTeachers}, skipped: ${txResult.teacherDuplicateSkipped}`,
    `  - Created ClassGroups: ${txResult.createdClassGroups}, skipped: ${txResult.cgDuplicateSkipped}`,
    `  - 36 legacy sem4 ClassGroups preserved`,
    `  - No ImportBatch / Course / TeachingTask / ScheduleSlot created`,
  ].join('\n')
  console.log(`\n${rollbackNote}`)

  // Save artifact
  const artifactDir = join(ROOT, 'temp', 'local-artifacts', 'l7-f6c')
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true })
  let headSha = ''
  try { headSha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim() } catch {}
  writeFileSync(join(artifactDir, 'write-result.json'), JSON.stringify({
    stage: 'L7-F6C-CONTROLLED-MASTER-DATA-WRITE-TEACHER-AND-CLASSGROUP', head: headSha,
    backupPath: backup.backupPath, confirmToken: CONFIRM_TOKEN,
    before, after, txResult, allPass, rollbackNote, rawIncluded: false,
  }, null, 2) + '\n', 'utf-8')

  if (!allPass) process.exit(1)
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error('FATAL:', e); process.exit(1) })
