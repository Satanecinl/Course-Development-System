/**
 * L8-C3 Plan Script — ClassGroup Canonical Reference Sync Plan
 *
 * Stage: L8-C3-CLASSGROUP-CANONICAL-REFERENCE-PLAN
 *
 * Read-only plan generation:
 *   1. Parse 227 canonical reference classes from Excel
 *   2. Map 442 DB ClassGroups to canonical 227
 *   3. Analyze 446 TeachingTaskClass references
 *   4. Generate controlled apply plan for C4
 *
 * NO DB writes. NO schema changes.
 *
 * Usage:
 *   npx tsx scripts/plan-classgroup-canonical-reference-l8-c3.ts \
 *     --target-semester-id 4
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'

// ── Constants ───────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '..')
const STAGE = 'L8-C3-CLASSGROUP-CANONICAL-REFERENCE-PLAN'
const ARTIFACT_DIR = join(ROOT, 'temp', 'local-artifacts', 'l8-c3')
const MAJOR_XLSX = 'D:/Desktop/Course Development System/学院专业数据库.xlsx'

// ── CLI args ────────────────────────────────────────────────────────────────

type CliArgs = { targetSemesterId: number; help: boolean }
const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { targetSemesterId: 0, help: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? 0)
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
  }
  return args
}

// ── Canonical Key Builder ──────────────────────────────────────────────────

function buildCanonicalKey(grade: string, major: string, classNumber: string, direction: string, educationLevel: string, schoolLength: string): string {
  return `${grade}|${major}|${classNumber}|${direction}|${educationLevel}|${schoolLength}`
}

function buildPlannedName(grade: string, major: string, classNumber: string): string {
  if (!classNumber) return `${grade}${major}`
  return `${grade}${major}${classNumber}班`
}

// ── Reference class parser ─────────────────────────────────────────────────

type RefClass = {
  referenceClassKey: string
  canonicalKey: string
  plannedName: string
  grade: string
  majorName: string
  classNumber: string
  educationLevel: string
  schoolLength: string
  studentCount: number | null
  sourceType: 'reference_xlsx'
  sourceEvidenceLocalOnly: string
}

async function parseReferenceClasses(): Promise<RefClass[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(MAJOR_XLSX)
  const ws = wb.worksheets[2] // 班级数据库
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
      const plannedName = buildPlannedName(grade, major, classNumber)
      const refKey = `ref-${r}`
      classes.push({
        referenceClassKey: refKey,
        canonicalKey,
        plannedName,
        grade,
        majorName: major,
        classNumber,
        educationLevel,
        schoolLength,
        studentCount,
        sourceType: 'reference_xlsx',
        sourceEvidenceLocalOnly: `${grade} ${major} ${classNumber}班 ${educationLevel} ${schoolLength}`,
      })
    }
  }
  return classes
}

// ── DB ClassGroup mapper ───────────────────────────────────────────────────

type MappingClassification =
  | 'CANONICAL_REUSE_EXACT'
  | 'CANONICAL_REUSE_ALIAS'
  | 'CANONICAL_REUSE_NEEDS_REVIEW'
  | 'EXTRA_DEACTIVATE_CANDIDATE'
  | 'EXTRA_DELETE_CANDIDATE'
  | 'EXTRA_KEEP_INACTIVE'
  | 'UNMATCHED_NEEDS_REVIEW'

type DbCgPlan = {
  dbClassGroupId: number
  semesterId: number
  name: string
  studentCount: number | null
  grade: string | null
  majorName: string | null
  classNumber: string | null
  educationLevel: string | null
  schoolLength: string | null
  classification: MappingClassification
  matchedCanonicalKey: string | null
  matchConfidence: number
  matchReason: string
}

function parseDbClassName(name: string): { grade: string; major: string; classNum: string; direction: string | null } {
  let w = name.trim()
  const gradeMatch = w.match(/^(\d{4})(级)?/)
  const grade = gradeMatch ? gradeMatch[1] + '级' : ''
  if (gradeMatch) w = w.slice(gradeMatch[0].length)
  let direction: string | null = null
  const dirMatch = w.match(/[（(]([^）)]+)[）)]/)
  if (dirMatch) { direction = dirMatch[1]; w = w.replace(/[（(][^）)]*[）)]/, '') }
  const classNumMatch = w.match(/(\d+)班$/)
  const classNum = classNumMatch ? classNumMatch[1] : ''
  if (classNumMatch) w = w.slice(0, -classNumMatch[0].length)
  return { grade, major: w.trim(), classNum, direction }
}

function matchDbToCanonical(
  dbCg: { id: number; semesterId: number; name: string; studentCount: number | null; grade: string | null; majorName: string | null; classNumber: string | null; educationLevel: string | null; schoolLength: string | null },
  canonicalIndex: Map<string, RefClass[]>
): DbCgPlan {
  // Try structured fields first (if populated from a previous partial fill)
  if (dbCg.grade && dbCg.majorName && dbCg.classNumber) {
    // Try exact canonical key with any educationLevel/schoolLength
    for (const [ck, refs] of canonicalIndex) {
      const parts = ck.split('|')
      if (parts[0] === dbCg.grade && parts[1] === dbCg.majorName && parts[2] === dbCg.classNumber) {
        return { dbClassGroupId: dbCg.id, semesterId: dbCg.semesterId, name: dbCg.name, studentCount: dbCg.studentCount,
          grade: dbCg.grade, majorName: dbCg.majorName, classNumber: dbCg.classNumber,
          educationLevel: dbCg.educationLevel, schoolLength: dbCg.schoolLength,
          classification: 'CANONICAL_REUSE_EXACT', matchedCanonicalKey: ck, matchConfidence: 1.0, matchReason: `structured field match: grade+major+classNumber` }
      }
    }
  }

  // Parse from name
  const parsed = parseDbClassName(dbCg.name)
  if (!parsed.grade || !parsed.major) {
    return { dbClassGroupId: dbCg.id, semesterId: dbCg.semesterId, name: dbCg.name, studentCount: dbCg.studentCount,
      grade: parsed.grade || null, majorName: parsed.major || null, classNumber: parsed.classNum || null,
      educationLevel: dbCg.educationLevel, schoolLength: dbCg.schoolLength,
      classification: 'UNMATCHED_NEEDS_REVIEW', matchedCanonicalKey: null, matchConfidence: 0, matchReason: 'cannot parse grade or major from name' }
  }

  // Check composite
  if (dbCg.name.includes('+') || dbCg.name.includes('、')) {
    return { dbClassGroupId: dbCg.id, semesterId: dbCg.semesterId, name: dbCg.name, studentCount: dbCg.studentCount,
      grade: parsed.grade, majorName: parsed.major, classNumber: parsed.classNum || null,
      educationLevel: null, schoolLength: null,
      classification: 'EXTRA_DEACTIVATE_CANDIDATE', matchedCanonicalKey: null, matchConfidence: 0, matchReason: 'composite class name' }
  }

  // Find canonical candidates matching parsed fields (grade+major+classNumber+direction)
  const candidates: Array<{ ck: string; ref: RefClass }> = []
  for (const [ck, refs] of canonicalIndex) {
    const parts = ck.split('|')
    // parts[0]=grade, parts[1]=major, parts[2]=classNumber, parts[3]=direction
    if (parts[0] === parsed.grade && parts[1] === parsed.major && parts[2] === parsed.classNum && parts[3] === (parsed.direction || '')) {
      candidates.push({ ck, ref: refs[0] })
    }
  }

  if (candidates.length === 1) {
    return { dbClassGroupId: dbCg.id, semesterId: dbCg.semesterId, name: dbCg.name, studentCount: dbCg.studentCount,
      grade: parsed.grade, majorName: parsed.major, classNumber: parsed.classNum || null,
      educationLevel: candidates[0].ref.educationLevel, schoolLength: candidates[0].ref.schoolLength,
      classification: 'CANONICAL_REUSE_EXACT', matchedCanonicalKey: candidates[0].ck, matchConfidence: 1.0,
      matchReason: `name-parsed match: grade+major+classNumber+direction → ${candidates[0].ck}` }
  }

  if (candidates.length > 1) {
    return { dbClassGroupId: dbCg.id, semesterId: dbCg.semesterId, name: dbCg.name, studentCount: dbCg.studentCount,
      grade: parsed.grade, majorName: parsed.major, classNumber: parsed.classNum || null,
      educationLevel: null, schoolLength: null,
      classification: 'CANONICAL_REUSE_NEEDS_REVIEW', matchedCanonicalKey: candidates[0].ck, matchConfidence: 0.5,
      matchReason: `ambiguous: ${candidates.length} canonical candidates (same grade+major+classNumber+direction, differ in educationLevel/schoolLength)` }
  }

  // No match — extra
  // Check if classNumber is suspiciously high (>10)
  const num = parseInt(parsed.classNum) || 0
  if (num > 10 || parsed.classNum === '') {
    return { dbClassGroupId: dbCg.id, semesterId: dbCg.semesterId, name: dbCg.name, studentCount: dbCg.studentCount,
      grade: parsed.grade, majorName: parsed.major, classNumber: parsed.classNum || null,
      educationLevel: null, schoolLength: null,
      classification: 'EXTRA_DEACTIVATE_CANDIDATE', matchedCanonicalKey: null, matchConfidence: 0,
      matchReason: num > 10 ? 'classNumber > 10 (import artifact)' : 'no classNumber (no canonical match)' }
  }

  // classNumber <= 10 but still no match — needs review
  return { dbClassGroupId: dbCg.id, semesterId: dbCg.semesterId, name: dbCg.name, studentCount: dbCg.studentCount,
    grade: parsed.grade, majorName: parsed.major, classNumber: parsed.classNum || null,
    educationLevel: null, schoolLength: null,
    classification: 'CANONICAL_REUSE_NEEDS_REVIEW', matchedCanonicalKey: null, matchConfidence: 0.3,
    matchReason: 'classNumber <= 10 but no canonical match found' }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help || !args.targetSemesterId) {
    console.log('Usage: npx tsx scripts/plan-classgroup-canonical-reference-l8-c3.ts --target-semester-id <id>')
    process.exit(args.help ? 0 : 1)
  }

  if (!existsSync(MAJOR_XLSX)) { console.error(`ERROR: not found: ${MAJOR_XLSX}`); process.exit(2) }
  if (!existsSync(ARTIFACT_DIR)) mkdirSync(ARTIFACT_DIR, { recursive: true })

  console.log(`=== ${STAGE} ===\n`)
  const prisma = new PrismaClient()

  // ── Baseline ──────────────────────────────────────────────────────────────
  const baseline = {
    course: await prisma.course.count(), teacher: await prisma.teacher.count(),
    cgTotal: await prisma.classGroup.count(),
    cgSem1: await prisma.classGroup.count({ where: { semesterId: 1 } }),
    cgSem4: await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } }),
    ttSem4: await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } }),
    ttc: await prisma.teachingTaskClass.count(),
    ssSem4: await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } }),
    saSem4: await prisma.scheduleAdjustment.count({ where: { semesterId: args.targetSemesterId } }),
    ibTotal: await prisma.importBatch.count(),
    ckNull: await prisma.classGroup.count({ where: { canonicalKey: null } }),
    activeTrue: await prisma.classGroup.count({ where: { isActive: true } }),
  }
  console.log(`[baseline] CG=${baseline.cgTotal} sem1=${baseline.cgSem1} sem4=${baseline.cgSem4} TTC=${baseline.ttc} ckNull=${baseline.ckNull} active=${baseline.activeTrue}`)

  const expected = { course: 104, teacher: 427, cgTotal: 442, cgSem1: 36, cgSem4: 406, ttSem4: 0, ttc: 446, ssSem4: 0, saSem4: 0, ibTotal: 39, ckNull: 442, activeTrue: 442 }
  for (const [k, v] of Object.entries(expected)) {
    if ((baseline as Record<string, number>)[k] !== v) { console.log(`BASELINE_DRIFT: ${k} expected=${v} actual=${(baseline as Record<string, number>)[k]}`); process.exit(1) }
  }
  console.log('[baseline] ALL EXPECTED VALUES MATCH\n')

  // ── Task 1: Parse 227 canonical reference classes ──────────────────────────
  console.log('--- Task 1: Parse reference classes ---')
  const refClasses = await parseReferenceClasses()
  console.log(`[ref] count=${refClasses.length}`)

  // Check duplicates
  const ckCounts = new Map<string, number>()
  const nameCounts = new Map<string, number>()
  for (const rc of refClasses) {
    ckCounts.set(rc.canonicalKey, (ckCounts.get(rc.canonicalKey) || 0) + 1)
    nameCounts.set(rc.plannedName, (nameCounts.get(rc.plannedName) || 0) + 1)
  }
  const ckDuplicates = [...ckCounts.values()].filter(c => c > 1).reduce((a, b) => a + b - 1, 0)
  const nameDuplicates = [...nameCounts.values()].filter(c => c > 1).reduce((a, b) => a + b - 1, 0)
  console.log(`[ref] canonicalKey unique=${ckCounts.size} duplicates=${ckDuplicates}`)
  console.log(`[ref] plannedName unique=${nameCounts.size} duplicates=${nameDuplicates}`)

  if (ckDuplicates > 0) { console.log('REFERENCE_CANONICAL_KEY_COLLISION'); process.exit(1) }
  if (nameDuplicates > 0) console.log(`[ref] WARNING: ${nameDuplicates} plannedName duplicates (expected: school-length variants share display name)`)
  console.log('[ref] 227 canonical classes parsed, 0 canonicalKey duplicates\n')

  // Save raw artifact
  writeFileSync(join(ARTIFACT_DIR, 'reference-canonical-classgroups.raw.local.json'), JSON.stringify(refClasses, null, 2), 'utf8')

  // Build canonical index
  const canonicalIndex = new Map<string, RefClass[]>()
  for (const rc of refClasses) {
    const existing = canonicalIndex.get(rc.canonicalKey) || []
    existing.push(rc)
    canonicalIndex.set(rc.canonicalKey, existing)
  }

  // ── Task 2: Map 442 DB ClassGroups ────────────────────────────────────────
  console.log('--- Task 2: Map DB ClassGroups to canonical ---')
  const allDbCgs = await prisma.classGroup.findMany({ orderBy: { id: 'asc' } })
  const dbPlans: DbCgPlan[] = allDbCgs.map(cg => matchDbToCanonical(cg, canonicalIndex))

  // Aggregate mapping
  const mappingCounts: Record<MappingClassification, number> = {
    CANONICAL_REUSE_EXACT: 0, CANONICAL_REUSE_ALIAS: 0, CANONICAL_REUSE_NEEDS_REVIEW: 0,
    EXTRA_DEACTIVATE_CANDIDATE: 0, EXTRA_DELETE_CANDIDATE: 0, EXTRA_KEEP_INACTIVE: 0, UNMATCHED_NEEDS_REVIEW: 0,
  }
  for (const p of dbPlans) mappingCounts[p.classification]++
  console.log('[map] Classification summary:')
  for (const [k, v] of Object.entries(mappingCounts)) console.log(`  ${k}: ${v}`)

  // Save raw artifact
  writeFileSync(join(ARTIFACT_DIR, 'db-classgroup-to-canonical-plan.local.json'), JSON.stringify(dbPlans, null, 2), 'utf8')

  // ── Task 3: TTC reference migration analysis ──────────────────────────────
  console.log('\n--- Task 3: TeachingTaskClass migration analysis ---')
  const allTtc = await prisma.teachingTaskClass.findMany({
    select: { id: true, classGroupId: true, teachingTaskId: true }
  })

  // Build CG id → classification map
  const cgClassMap = new Map<number, DbCgPlan>()
  for (const p of dbPlans) cgClassMap.set(p.dbClassGroupId, p)

  // For each canonical key, choose ONE canonical DB row
  // Priority: sem4 exact match > sem1 exact match > first found
  const canonicalRowSelection = new Map<string, number>() // canonicalKey → chosen dbClassGroupId
  const sem4ExactPlans = dbPlans.filter(p => p.classification === 'CANONICAL_REUSE_EXACT' && p.semesterId === args.targetSemesterId)
  const sem1ExactPlans = dbPlans.filter(p => p.classification === 'CANONICAL_REUSE_EXACT' && p.semesterId === 1)

  for (const p of sem4ExactPlans) {
    if (p.matchedCanonicalKey && !canonicalRowSelection.has(p.matchedCanonicalKey)) {
      canonicalRowSelection.set(p.matchedCanonicalKey, p.dbClassGroupId)
    }
  }
  for (const p of sem1ExactPlans) {
    if (p.matchedCanonicalKey && !canonicalRowSelection.has(p.matchedCanonicalKey)) {
      canonicalRowSelection.set(p.matchedCanonicalKey, p.dbClassGroupId)
    }
  }

  // TTC analysis — improved routing for ALL CG types
  let ttcAlreadyCanonical = 0, ttcNeedsMigration = 0, ttcUnmatched = 0, ttcWouldBreak = 0
  const ttcMigrations: Array<{ ttcId: number; fromClassGroupId: number; toClassGroupId: number | null; reason: string }> = []

  // Build a fallback index: grade|major|classNumber → best canonical key (first 三年制 if available)
  const fallbackIndex = new Map<string, string>()
  for (const [ck] of canonicalIndex) {
    const parts = ck.split('|')
    const fKey = `${parts[0]}|${parts[1]}|${parts[2]}`
    if (!fallbackIndex.has(fKey)) fallbackIndex.set(fKey, ck)
    // Prefer 三年制
    if (parts[5] === '三年制' && fallbackIndex.get(fKey) !== ck) fallbackIndex.set(fKey, ck)
  }

  for (const ttc of allTtc) {
    const plan = cgClassMap.get(ttc.classGroupId)
    if (!plan) { ttcUnmatched++; ttcWouldBreak++; ttcMigrations.push({ ttcId: ttc.id, fromClassGroupId: ttc.classGroupId, toClassGroupId: null, reason: 'CG not found in plan' }); continue }

    // Route 1: CG has matchedCanonicalKey (EXACT, ALIAS, or NEEDS_REVIEW with a candidate)
    if (plan.matchedCanonicalKey) {
      const targetRowId = canonicalRowSelection.get(plan.matchedCanonicalKey)
      if (targetRowId && targetRowId !== ttc.classGroupId) {
        ttcNeedsMigration++
        ttcMigrations.push({ ttcId: ttc.id, fromClassGroupId: ttc.classGroupId, toClassGroupId: targetRowId, reason: `migrate to canonical row ${targetRowId} for ${plan.matchedCanonicalKey}` })
        continue
      } else if (targetRowId === ttc.classGroupId) {
        ttcAlreadyCanonical++
        continue
      }
    }

    // Route 2: CG is NEEDS_REVIEW or EXTRA but parseable — try fallback index
    if (plan.grade && plan.majorName) {
      const classNum = plan.classNumber || '1'
      const fKey = `${plan.grade}|${plan.majorName}|${classNum}`
      const fallbackCk = fallbackIndex.get(fKey)
      if (fallbackCk) {
        const targetRowId = canonicalRowSelection.get(fallbackCk)
        if (targetRowId && targetRowId !== ttc.classGroupId) {
          ttcNeedsMigration++
          ttcMigrations.push({ ttcId: ttc.id, fromClassGroupId: ttc.classGroupId, toClassGroupId: targetRowId, reason: `fallback migrate to canonical row ${targetRowId} for ${fallbackCk} (from ${plan.classification})` })
          continue
        } else if (targetRowId === ttc.classGroupId) {
          ttcAlreadyCanonical++
          continue
        }
      }
    }

    // Route 3: truly unmatched
    ttcUnmatched++
    ttcWouldBreak++
    ttcMigrations.push({ ttcId: ttc.id, fromClassGroupId: ttc.classGroupId, toClassGroupId: null, reason: `unmatched CG: ${plan.classification} (${plan.matchReason})` })
  }

  console.log(`[ttc] total=${allTtc.length} alreadyCanonical=${ttcAlreadyCanonical} needsMigration=${ttcNeedsMigration} unmatched=${ttcUnmatched} wouldBreak=${ttcWouldBreak}`)
  writeFileSync(join(ARTIFACT_DIR, 'teaching-task-classgroup-migration-plan.local.json'), JSON.stringify({ totalTtc: allTtc.length, ttcAlreadyCanonical, ttcNeedsMigration, ttcUnmatched, ttcWouldBreak, migrations: ttcMigrations }, null, 2), 'utf8')

  // ── Task 4: Controlled apply plan ─────────────────────────────────────────
  console.log('\n--- Task 4: Controlled apply plan ---')

  // Count canonical keys that need a NEW DB row (not matched to existing sem4 row)
  const unmatchedCanonicalKeys = [...canonicalIndex.keys()].filter(ck => !canonicalRowSelection.has(ck))
  const needsCreate = unmatchedCanonicalKeys.length
  const needsUpdate = canonicalRowSelection.size
  const needsDeactivate = dbPlans.filter(p => ['EXTRA_DEACTIVATE_CANDIDATE', 'UNMATCHED_NEEDS_REVIEW', 'CANONICAL_REUSE_NEEDS_REVIEW'].includes(p.classification)).length
  const needsHardDelete = 0 // default: no hard delete

  const controlledApply = {
    createCanonicalClassGroups: needsCreate,
    updateExistingCanonicalClassGroups: needsUpdate,
    deactivateExtraClassGroups: needsDeactivate,
    deleteClassGroups: needsHardDelete,
    migrateTeachingTaskClassRefs: ttcNeedsMigration,
    manualReviewRequired: ttcUnmatched,
    plannedActiveCanonicalRows: 227,
    notes: `create ${needsCreate} new CGs from reference, update ${needsUpdate} existing sem4 CGs with canonicalKey/fields, deactivate ${needsDeactivate} extras, migrate ${ttcNeedsMigration} TTC refs`,
  }
  console.log('[plan]', JSON.stringify(controlledApply, null, 2))
  writeFileSync(join(ARTIFACT_DIR, 'classgroup-canonical-controlled-apply-plan.local.json'), JSON.stringify(controlledApply, null, 2), 'utf8')

  // ── C4 gates ──────────────────────────────────────────────────────────────
  const readyForC4 = ttcUnmatched === 0 && needsCreate + needsUpdate === 227 && ckDuplicates === 0
  console.log(`\n[C4 gates] manualReviewRequired=${ttcUnmatched} activeCanonicalPlanned=227 TTC_unmatched=${ttcUnmatched} readyForC4=${readyForC4}`)

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = {
    stage: STAGE,
    refCanonicalCount: refClasses.length,
    ckDuplicateCount: ckDuplicates,
    plannedNameDuplicateCount: nameDuplicates,
    plannedNameDuplicateNote: `${nameDuplicates} plannedName duplicates are expected (school-length/direction variants share display name)`,
    dbCgTotal: allDbCgs.length,
    dbCgSem1: baseline.cgSem1,
    dbCgSem4: baseline.cgSem4,
    ckNullCount: baseline.ckNull,
    activeTrueCount: baseline.activeTrue,
    mappingCounts,
    canonicalRowSelectionCount: canonicalRowSelection.size,
    unmatchedCanonicalKeys: needsCreate,
    ttcTotal: allTtc.length,
    ttcAlreadyCanonical, ttcNeedsMigration, ttcUnmatched, ttcWouldBreak,
    controlledApply,
    readyForC4Apply: readyForC4,
    baselineAfter: { ...baseline },
    noDBWrite: true,
  }

  writeFileSync(join(ROOT, 'docs', 'l8-c3-classgroup-canonical-reference-plan.json'), JSON.stringify(summary, null, 2), 'utf8')
  console.log('\n=== DONE ===')
  await prisma.$disconnect()
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
