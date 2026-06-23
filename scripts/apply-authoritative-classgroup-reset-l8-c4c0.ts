/**
 * L8-C4C0 Apply Script — Authoritative ClassGroup Reset from Reference
 *
 * Stage: L8-C4C0-CLASSGROUP-AUTHORITATIVE-RESET-FROM-REFERENCE
 *
 * Reads the authoritative 227-class reference from 学院专业数据库.xlsx and resets
 * ClassGroup master data in targetSemesterId=4 (sem4):
 *   - Creates missing canonical ClassGroups (with disambiguated names from C4B)
 *   - Updates existing canonical ClassGroups with structured fields
 *   - Deactivates non-canonical legacy ClassGroups
 *   - Does NOT touch TeachingTaskClass, TeachingTask, Course, Teacher, ScheduleSlot, ScheduleAdjustment, ImportBatch
 *
 * Modes:
 *   --dry-run                                               (read-only, no DB writes)
 *   --confirm-token INVALID_TOKEN                           (rejected, no DB writes)
 *   --confirm-token WRITE_L8_C4C0_AUTHORITATIVE_CLASSGROUP_RESET  (real apply in single transaction)
 *
 * Usage:
 *   npx tsx scripts/apply-authoritative-classgroup-reset-l8-c4c0.ts --dry-run --target-semester-id 4
 *   npx tsx scripts/apply-authoritative-classgroup-reset-l8-c4c0.ts --confirm-token WRITE_L8_C4C0_AUTHORITATIVE_CLASSGROUP_RESET --target-semester-id 4
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'

const ROOT = resolve(__dirname, '..')
const STAGE = 'L8-C4C0-CLASSGROUP-AUTHORITATIVE-RESET-FROM-REFERENCE'
const MAJOR_XLSX = 'D:/Desktop/Course Development System/学院专业数据库.xlsx'
const VALID_TOKEN = 'WRITE_L8_C4C0_AUTHORITATIVE_CLASSGROUP_RESET'

// ── CLI ─────────────────────────────────────────────────────────────────────

type CliArgs = { dryRun: boolean; confirmToken: string; targetSemesterId: number; help: boolean }
const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { dryRun: false, confirmToken: '', targetSemesterId: 4, help: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true
    else if (argv[i] === '--confirm-token') args.confirmToken = argv[++i] ?? ''
    else if (argv[i] === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? 4)
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
  }
  return args
}

// ── Canonical key / name builders ──────────────────────────────────────────

function buildCanonicalKey(grade: string, major: string, classNumber: string, direction: string, educationLevel: string, schoolLength: string): string {
  return `${grade}|${major}|${classNumber}|${direction}|${educationLevel}|${schoolLength}`
}

function buildBaseName(grade: string, major: string, classNumber: string, direction: string): string {
  let n = `${grade}${major}`
  if (classNumber) n += `${classNumber}班`
  if (direction) n += `（${direction}）`
  return n
}

/**
 * C4B disambiguated plannedName:
 *   - group entries by (grade, majorName, classNumber)
 *   - if schoolLength varies within the group, append （educationLevel schoolLength） to ALL members
 *   - otherwise, use the base name unchanged
 */
function buildDisambiguatedPlannedName(
  grade: string, major: string, classNumber: string, direction: string,
  educationLevel: string, schoolLength: string, groupHasSchoolLengthVariance: boolean
): string {
  const base = buildBaseName(grade, major, classNumber, direction)
  if (groupHasSchoolLengthVariance) return `${base}（${educationLevel}${schoolLength}）`
  return base
}

// ── Reference parser ───────────────────────────────────────────────────────

type RefClass = {
  canonicalKey: string
  plannedName: string
  grade: string
  majorName: string
  classNumber: string
  direction: string
  educationLevel: string
  schoolLength: string
  studentCount: number | null
  sourceType: 'reference_xlsx'
  sourceEvidenceLocalOnly: string
}

async function parseReferenceClasses(): Promise<RefClass[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(MAJOR_XLSX)
  const ws = wb.worksheets[2]
  const classes: RefClass[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row: (string | number | null)[] = []
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
      row[col - 1] = cell.value as string | number | null
    })
    if (row[0] || row[1]) {
      const grade = String(row[3] || '').trim()
      const major = String(row[1] || '').trim()
      const classNumber = String(row[5] || '').trim()
      const educationLevel = String(row[9] || '').trim()
      const schoolLength = String(row[6] || '').trim()
      const studentCount = row[7] != null ? Number(row[7]) : null
      const direction = row[2] ? String(row[2]).trim() : ''
      const canonicalKey = buildCanonicalKey(grade, major, classNumber, direction, educationLevel, schoolLength)
      classes.push({
        canonicalKey,
        plannedName: '',
        grade, majorName: major, classNumber, direction,
        educationLevel, schoolLength, studentCount,
        sourceType: 'reference_xlsx',
        sourceEvidenceLocalOnly: `${grade} ${major} ${classNumber}班 ${direction ? `(${direction}) ` : ''}${educationLevel} ${schoolLength}`,
      })
    }
  }
  return classes
}

function applySchoolLengthDisambiguation(refClasses: RefClass[]): void {
  const baseGroup = new Map<string, RefClass[]>()
  for (const rc of refClasses) {
    const k = `${rc.grade}|${rc.majorName}|${rc.classNumber}`
    const arr = baseGroup.get(k) || []
    arr.push(rc)
    baseGroup.set(k, arr)
  }
  const groupHasVariance = new Map<string, boolean>()
  for (const [k, arr] of baseGroup) {
    const sls = new Set(arr.map(x => x.schoolLength))
    groupHasVariance.set(k, sls.size > 1)
  }
  for (const rc of refClasses) {
    const k = `${rc.grade}|${rc.majorName}|${rc.classNumber}`
    rc.plannedName = buildDisambiguatedPlannedName(
      rc.grade, rc.majorName, rc.classNumber, rc.direction,
      rc.educationLevel, rc.schoolLength, groupHasVariance.get(k) || false
    )
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseDbName(name: string): { grade: string; major: string; classNum: string; direction: string } {
  let w = name.trim()
  const gm = w.match(/^(\d{4})(级)?/)
  const grade = gm ? gm[1] + '级' : ''
  if (gm) w = w.slice(gm[0].length)
  let direction = ''
  const dm = w.match(/[（(]([^）)]+)[）)]/)
  if (dm) { direction = dm[1]; w = w.replace(/[（(][^）)]*[）)]/, '') }
  const cn = w.match(/(\d+)班$/)
  const classNum = cn ? cn[1] : ''
  if (cn) w = w.slice(0, -cn[0].length)
  return { grade, major: w.trim(), classNum, direction }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help) { console.log('Usage: ... [--dry-run] [--confirm-token TOKEN] [--target-semester-id N]'); process.exit(0) }

  const isDryRun = args.dryRun
  const isWrite = !isDryRun && args.confirmToken === VALID_TOKEN
  const isInvalidToken = !isDryRun && args.confirmToken !== '' && args.confirmToken !== VALID_TOKEN

  if (!isDryRun && !isWrite && !isInvalidToken) {
    console.error('ERROR: specify --dry-run or --confirm-token <token>')
    process.exit(1)
  }
  if (!existsSync(MAJOR_XLSX)) { console.error(`ERROR: xlsx not found: ${MAJOR_XLSX}`); process.exit(2) }

  console.log(`=== ${STAGE} ===`)
  console.log(`mode: ${isDryRun ? 'DRY-RUN' : isWrite ? 'WRITE' : 'INVALID_TOKEN'}`)
  console.log(`targetSemesterId: ${args.targetSemesterId}`)

  const prisma = new PrismaClient()

  // ── Phase 1: Parse reference + validate ──────────────────────────────
  console.log('\n[1/5] Parsing reference classes...')
  const refClasses = await parseReferenceClasses()
  console.log(`  referenceCanonicalClassCount: ${refClasses.length}`)

  applySchoolLengthDisambiguation(refClasses)

  const ckCount = new Map<string, number>()
  const nameCount = new Map<string, number>()
  for (const rc of refClasses) {
    ckCount.set(rc.canonicalKey, (ckCount.get(rc.canonicalKey) || 0) + 1)
    nameCount.set(rc.plannedName, (nameCount.get(rc.plannedName) || 0) + 1)
  }
  const ckDuplicates = [...ckCount.values()].filter(c => c > 1).reduce((a, b) => a + b - 1, 0)
  const nameDuplicates = [...nameCount.values()].filter(c => c > 1).reduce((a, b) => a + b - 1, 0)
  console.log(`  canonicalKeyDuplicateCount: ${ckDuplicates}`)
  console.log(`  plannedNameDuplicateCount: ${nameDuplicates}`)
  if (ckDuplicates > 0 || nameDuplicates > 0) {
    console.error('BLOCKED_PLANNED_NAME_COLLISION')
    await prisma.$disconnect()
    process.exit(1)
  }

  // ── Phase 2: Snapshot DB before hashes ─────────────────────────────
  console.log('\n[2/5] Capturing DB baseline...')
  const before = {
    cgTotal: await prisma.classGroup.count(),
    ttcTotal: await prisma.teachingTaskClass.count(),
    courseCount: await prisma.course.count(),
    teacherCount: await prisma.teacher.count(),
  }
  console.log(`  ClassGroup total before: ${before.cgTotal}`)
  console.log(`  TeachingTaskClass total before: ${before.ttcTotal}`)

  // ── Phase 3: Load DB ClassGroups + match to canonical ──────────────
  console.log('\n[3/5] Matching DB ClassGroups to canonical...')
  const allDbCgs = await prisma.classGroup.findMany({ orderBy: { id: 'asc' } })
  console.log(`  DB ClassGroups: ${allDbCgs.length}`)

  // Canonical index (canonicalKey → [RefClass])
  const canonicalIndex = new Map<string, RefClass[]>()
  for (const rc of refClasses) {
    const arr = canonicalIndex.get(rc.canonicalKey) || []
    arr.push(rc)
    canonicalIndex.set(rc.canonicalKey, arr)
  }

  // For each DB CG, find best canonical match
  type DbPlan = { dbCgId: number; semesterId: number; name: string; isActive: boolean; matchedCanonicalKey: string | null; matchType: 'EXACT' | 'AMBIGUOUS_RESOLVED' | 'NO_MATCH' | 'COMPOSITE' | 'NEEDS_REVIEW' }
  const dbPlans: DbPlan[] = []
  for (const cg of allDbCgs) {
    const parsed = parseDbName(cg.name)
    if (!parsed.grade || !parsed.major) {
      dbPlans.push({ dbCgId: cg.id, semesterId: cg.semesterId, name: cg.name, isActive: cg.isActive, matchedCanonicalKey: null, matchType: 'NEEDS_REVIEW' })
      continue
    }
    if (cg.name.includes('+') || cg.name.includes('、')) {
      dbPlans.push({ dbCgId: cg.id, semesterId: cg.semesterId, name: cg.name, isActive: cg.isActive, matchedCanonicalKey: null, matchType: 'COMPOSITE' })
      continue
    }
    const candidates: string[] = []
    for (const ck of canonicalIndex.keys()) {
      const parts = ck.split('|')
      if (parts[0] === parsed.grade && parts[1] === parsed.major && parts[2] === parsed.classNum && parts[3] === parsed.direction) candidates.push(ck)
    }
    if (candidates.length === 1) {
      dbPlans.push({ dbCgId: cg.id, semesterId: cg.semesterId, name: cg.name, isActive: cg.isActive, matchedCanonicalKey: candidates[0], matchType: 'EXACT' })
    } else if (candidates.length > 1) {
      const sorted = candidates.sort((a, b) => { const sa = a.split('|')[5], sb = b.split('|')[5]; return sa === '三年制' && sb !== '三年制' ? -1 : sb === '三年制' && sa !== '三年制' ? 1 : 0 })
      dbPlans.push({ dbCgId: cg.id, semesterId: cg.semesterId, name: cg.name, isActive: cg.isActive, matchedCanonicalKey: sorted[0], matchType: 'AMBIGUOUS_RESOLVED' })
    } else {
      dbPlans.push({ dbCgId: cg.id, semesterId: cg.semesterId, name: cg.name, isActive: cg.isActive, matchedCanonicalKey: null, matchType: 'NO_MATCH' })
    }
  }

  // Select canonical DB rows: sem4 exact > sem1 exact > sem4 ambiguous
  const canonicalRowSelection = new Map<string, number>()
  const sem4Exact = dbPlans.filter(p => p.matchType === 'EXACT' && p.semesterId === args.targetSemesterId)
  const otherExact = dbPlans.filter(p => p.matchType === 'EXACT' && p.semesterId !== args.targetSemesterId)
  for (const p of [...sem4Exact, ...otherExact]) {
    if (p.matchedCanonicalKey && !canonicalRowSelection.has(p.matchedCanonicalKey))
      canonicalRowSelection.set(p.matchedCanonicalKey, p.dbCgId)
  }
  for (const p of dbPlans.filter(x => x.matchType === 'AMBIGUOUS_RESOLVED')) {
    if (p.matchedCanonicalKey && !canonicalRowSelection.has(p.matchedCanonicalKey))
      canonicalRowSelection.set(p.matchedCanonicalKey, p.dbCgId)
  }

  // Operations
  const toCreate = refClasses.filter(rc => !canonicalRowSelection.has(rc.canonicalKey))
  const toUpdate: Array<{ dbId: number; ref: RefClass }> = []
  for (const [ck, dbId] of canonicalRowSelection) {
    const ref = canonicalIndex.get(ck)?.[0]
    if (ref) toUpdate.push({ dbId, ref })
  }
  const protectedIds = new Set(canonicalRowSelection.values())
  const toDeactivate = dbPlans.filter(p => !protectedIds.has(p.dbCgId))
  const deactivatedIds = new Set<number>()

  console.log(`  create: ${toCreate.length}`)
  console.log(`  update: ${toUpdate.length}`)
  console.log(`  deactivate: ${toDeactivate.length}`)
  console.log(`  canonicalRowSelection size: ${canonicalRowSelection.size} / 227`)

  const result = {
    referenceCanonicalClassCount: refClasses.length,
    canonicalKeyDuplicateCount: ckDuplicates,
    plannedNameDuplicateCount: nameDuplicates,
    createClassGroups: toCreate.length,
    updateClassGroups: toUpdate.length,
    deactivateLegacyClassGroups: toDeactivate.length,
    hardDeleteClassGroups: 0,
    ttcMigrate: 0,
    ttcDelete: 0,
    ttcCreate: 0,
    expectedActiveReferenceXlsxClassGroups: 227,
    expectedCanonicalKeyNonNullCount: 227,
    expectedTeachingTaskClassTotal: 446,
    expectedTeachingTaskClassHashUnchanged: true,
  }

  // ── Phase 4: Execute ──────────────────────────────────────────────
  console.log('\n[4/5] Executing...')

  if (isDryRun) {
    console.log('  [DRY-RUN] No DB writes')
    console.log('  result:', JSON.stringify(result, null, 2))
  } else if (isInvalidToken) {
    console.log(`  REJECTED: invalid token "${args.confirmToken}" — expected "${VALID_TOKEN}"`)
    console.log('  dbWritten = false')
    console.log('  ClassGroup count unchanged')
    console.log('  TeachingTaskClass hash unchanged')
  } else if (isWrite) {
    console.log('  [WRITE] Starting single-transaction apply...')

    await prisma.$transaction(async (tx) => {
      let created = 0
      for (const rc of toCreate) {
        await tx.classGroup.create({
          data: {
            name: rc.plannedName,
            studentCount: rc.studentCount,
            semesterId: args.targetSemesterId,
            canonicalKey: rc.canonicalKey,
            grade: rc.grade,
            majorName: rc.majorName,
            classNumber: rc.classNumber,
            educationLevel: rc.educationLevel,
            schoolLength: rc.schoolLength,
            sourceType: 'reference_xlsx',
            isActive: true,
          }
        })
        created++
      }
      console.log(`    created: ${created}`)

      let updated = 0
      for (const { dbId, ref } of toUpdate) {
        await tx.classGroup.update({
          where: { id: dbId },
          data: {
            name: ref.plannedName,
            semesterId: args.targetSemesterId,
            canonicalKey: ref.canonicalKey,
            grade: ref.grade,
            majorName: ref.majorName,
            classNumber: ref.classNumber,
            educationLevel: ref.educationLevel,
            schoolLength: ref.schoolLength,
            sourceType: 'reference_xlsx',
            isActive: true,
            studentCount: ref.studentCount,
          }
        })
        updated++
      }
      console.log(`    updated: ${updated}`)

      let deactivated = 0
      for (const p of toDeactivate) {
        if (deactivatedIds.has(p.dbCgId)) continue
        let srcType = 'legacy_extra'
        if (p.name.includes('+') || p.name.includes('、')) srcType = 'composite'
        else if (p.semesterId === 1) srcType = 'semester_copy'
        else if (p.matchType === 'NO_MATCH') srcType = 'old_error'
        else srcType = 'import_artifact'
        await tx.classGroup.update({ where: { id: p.dbCgId }, data: { isActive: false, sourceType: srcType } })
        deactivatedIds.add(p.dbCgId)
        deactivated++
      }
      console.log(`    deactivated: ${deactivated}`)

      // Post-transaction verification
      const afterActive = await tx.classGroup.count({ where: { isActive: true, sourceType: 'reference_xlsx', semesterId: args.targetSemesterId } })
      const afterCkNonNull = await tx.classGroup.count({ where: { canonicalKey: { not: null } } })
      const afterTtcTotal = await tx.teachingTaskClass.count()
      console.log(`    [verify] active reference_xlsx: ${afterActive} (expect 227)`)
      console.log(`    [verify] canonicalKey non-null: ${afterCkNonNull} (expect 227)`)
      console.log(`    [verify] TeachingTaskClass total: ${afterTtcTotal} (expect 446)`)
    })

    console.log('  [WRITE] Transaction committed')
  }

  // ── Phase 5: Post-apply invariant check ───────────────────────────
  // Post-apply invariant check only runs after a real WRITE
  if (isWrite) {
    const after = {
      cgTotal: await prisma.classGroup.count(),
      activeRefXlsx: await prisma.classGroup.count({ where: { sourceType: 'reference_xlsx', isActive: true } }),
      sem4ActiveRefXlsx: await prisma.classGroup.count({ where: { sourceType: 'reference_xlsx', isActive: true, semesterId: args.targetSemesterId } }),
      ckNonNull: await prisma.classGroup.count({ where: { canonicalKey: { not: null } } }),
      ttcTotal: await prisma.teachingTaskClass.count(),
      courseCount: await prisma.course.count(),
      teacherCount: await prisma.teacher.count(),
      ttSem4: await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } }),
      ssSem4: await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } }),
      saSem4: await prisma.scheduleAdjustment.count({ where: { semesterId: args.targetSemesterId } }),
      ibTotal: await prisma.importBatch.count(),
      ib39Status: (await prisma.importBatch.findUnique({ where: { id: 39 }, select: { status: true } }))?.status ?? 'UNKNOWN',
    }

    const invariants: Array<[string, number, number]> = [
      ['activeRefXlsx', after.activeRefXlsx, 227],
      ['sem4ActiveRefXlsx', after.sem4ActiveRefXlsx, 227],
      ['ckNonNull', after.ckNonNull, 227],
      ['ttcTotal', after.ttcTotal, 446],
      ['courseCount', after.courseCount, 104],
      ['teacherCount', after.teacherCount, 427],
      ['ttSem4', after.ttSem4, 0],
      ['ssSem4', after.ssSem4, 0],
      ['saSem4', after.saSem4, 0],
      ['ibTotal', after.ibTotal, 39],
    ]
    let allPass = true
    for (const [name, actual, expected] of invariants) {
      const pass = actual === expected
      if (!pass) allPass = false
      console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}: actual=${actual} expected=${expected}`)
    }
    console.log(`\n=== INVARIANTS: ${allPass ? 'ALL PASS' : 'FAIL'} ===`)
  } else {
    console.log('  [SKIP] Post-apply invariant check (no DB write in dry-run / invalid-token mode)')
  }

  console.log('dbWritten: ' + (isWrite ? 'yes' : 'no'))

  await prisma.$disconnect()
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
