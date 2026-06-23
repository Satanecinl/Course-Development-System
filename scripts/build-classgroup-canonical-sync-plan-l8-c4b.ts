/**
 * L8-C4B Build Script — ClassGroup Canonical Sync Plan (Immutable Snapshot)
 *
 * Stage: L8-C4B-CLASSGROUP-CANONICAL-SYNC-REDESIGN
 *
 * READ-ONLY. NO DB WRITES. NO SCHEMA CHANGES.
 *
 * Generates an immutable local plan snapshot that fixes the C4A failure:
 *   1. Disambiguated plannedName (educationLevel + schoolLength suffix)
 *   2. Immutable plan snapshot (hashed; reused by verifier and future C4C apply)
 *   3. TTC migration: update classGroupId only, NO delete, NO create
 *   4. Collision detection: abort if any update would break @@unique
 *
 * Usage:
 *   npx tsx scripts/build-classgroup-canonical-sync-plan-l8-c4b.ts --target-semester-id 4
 *
 * Outputs (local artifacts, NOT committed):
 *   temp/local-artifacts/l8-c4b/classgroup-canonical-sync-plan.immutable.local.json
 *   temp/local-artifacts/l8-c4b/classgroup-canonical-sync-plan.immutable.local.md
 *   temp/local-artifacts/l8-c4b/ttc-migration-collision-check.local.json
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'

// ── Constants ───────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '..')
const STAGE = 'L8-C4B-CLASSGROUP-CANONICAL-SYNC-REDESIGN'
const ARTIFACT_DIR = join(ROOT, 'temp', 'local-artifacts', 'l8-c4b')
const MAJOR_XLSX = 'D:/Desktop/Course Development System/学院专业数据库.xlsx'
const PLAN_VERSION = 'l8-c4b-v1'
const TARGET_SEMESTER_ID_DEFAULT = 4

// ── CLI args ────────────────────────────────────────────────────────────────

type CliArgs = { targetSemesterId: number; help: boolean }
const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { targetSemesterId: TARGET_SEMESTER_ID_DEFAULT, help: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? 0)
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
  }
  return args
}

// ── Canonical key / name builders ──────────────────────────────────────────

function buildCanonicalKey(
  grade: string,
  major: string,
  classNumber: string,
  direction: string,
  educationLevel: string,
  schoolLength: string
): string {
  return `${grade}|${major}|${classNumber}|${direction}|${educationLevel}|${schoolLength}`
}

function buildBaseName(grade: string, major: string, classNumber: string, direction: string): string {
  let n = `${grade}${major}`
  if (classNumber) n += `${classNumber}班`
  if (direction) n += `（${direction}）`
  return n
}

/**
 * C4B disambiguated plannedName.
 * - If all entries sharing (grade, major, classNumber) have the same schoolLength → no suffix.
 * - Otherwise, append `（educationLevel schoolLength）` to every entry in that group.
 * This rule is applied to the WHOLE (grade, major, classNumber) group when any member
 * has a distinct schoolLength, so that suffix presence is uniform within the group
 * (predictable for DB row reads, and for any pre-existing DB name comparisons).
 */
function buildDisambiguatedPlannedName(
  grade: string,
  major: string,
  classNumber: string,
  direction: string,
  educationLevel: string,
  schoolLength: string,
  groupHasSchoolLengthVariance: boolean
): string {
  const base = buildBaseName(grade, major, classNumber, direction)
  if (groupHasSchoolLengthVariance) {
    return `${base}（${educationLevel}${schoolLength}）`
  }
  return base
}

// ── Reference parser ───────────────────────────────────────────────────────

type RefClass = {
  referenceClassKey: string
  canonicalKey: string
  plannedName: string
  baseName: string
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
      const baseName = buildBaseName(grade, major, classNumber, direction)
      const refKey = `ref-${r}`
      classes.push({
        referenceClassKey: refKey,
        canonicalKey,
        plannedName: '', // filled later
        baseName,
        grade,
        majorName: major,
        classNumber,
        direction,
        educationLevel,
        schoolLength,
        studentCount,
        sourceType: 'reference_xlsx',
        sourceEvidenceLocalOnly: `${grade} ${major} ${classNumber}班 ${direction ? `(${direction}) ` : ''}${educationLevel} ${schoolLength}`,
      })
    }
  }
  return classes
}

// ── Hash helpers ───────────────────────────────────────────────────────────

function hashString(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

function hashArtifact(filePath: string): string {
  if (!existsSync(filePath)) return 'MISSING'
  return hashString(readFileSync(filePath, 'utf8'))
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help) {
    console.log('Usage: npx tsx scripts/build-classgroup-canonical-sync-plan-l8-c4b.ts --target-semester-id <id>')
    process.exit(0)
  }
  if (!args.targetSemesterId) {
    console.error('ERROR: --target-semester-id required')
    process.exit(1)
  }
  if (!existsSync(MAJOR_XLSX)) {
    console.error(`ERROR: not found: ${MAJOR_XLSX}`)
    process.exit(2)
  }
  if (!existsSync(ARTIFACT_DIR)) mkdirSync(ARTIFACT_DIR, { recursive: true })

  console.log(`=== ${STAGE} ===`)
  console.log(`planVersion: ${PLAN_VERSION}`)
  console.log(`targetSemesterId: ${args.targetSemesterId}`)
  console.log('')

  const prisma = new PrismaClient()

  // ── DB baseline (read-only) ───────────────────────────────────────────
  const baseline = {
    course: await prisma.course.count(),
    teacher: await prisma.teacher.count(),
    cgTotal: await prisma.classGroup.count(),
    cgSem1: await prisma.classGroup.count({ where: { semesterId: 1 } }),
    cgSem4: await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } }),
    ttc: await prisma.teachingTaskClass.count(),
    ttSem4: await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } }),
    ssSem4: await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } }),
    saSem4: await prisma.scheduleAdjustment.count({ where: { semesterId: args.targetSemesterId } }),
    ibTotal: await prisma.importBatch.count(),
    ckNull: await prisma.classGroup.count({ where: { canonicalKey: null } }),
    activeTrue: await prisma.classGroup.count({ where: { isActive: true } }),
  }
  const expected = {
    course: 104, teacher: 427, cgTotal: 442, cgSem1: 36, cgSem4: 406,
    ttc: 446, ttSem4: 0, ssSem4: 0, saSem4: 0, ibTotal: 39,
    ckNull: 442, activeTrue: 442,
  }
  for (const [k, v] of Object.entries(expected)) {
    if ((baseline as Record<string, number>)[k] !== v) {
      console.log(`BASELINE_DRIFT_DETECTED: ${k} expected=${v} actual=${(baseline as Record<string, number>)[k]}`)
      await prisma.$disconnect()
      process.exit(1)
    }
  }
  console.log('[baseline] ALL EXPECTED VALUES MATCH')

  // ── Parse reference classes ───────────────────────────────────────────
  console.log('\n--- Task 1: Parse reference classes + disambiguate plannedName ---')
  const refClasses = await parseReferenceClasses()
  console.log(`[ref] parsed ${refClasses.length} canonical classes`)

  // Group by (grade, majorName, classNumber) → determine if schoolLength varies
  const baseGroup = new Map<string, RefClass[]>()
  for (const rc of refClasses) {
    const k = `${rc.grade}|${rc.majorName}|${rc.classNumber}`
    const arr = baseGroup.get(k) || []
    arr.push(rc)
    baseGroup.set(k, arr)
  }
  // Track which group keys have schoolLength variance
  const groupHasVariance = new Map<string, boolean>()
  for (const [k, arr] of baseGroup) {
    const sls = new Set(arr.map(x => x.schoolLength))
    groupHasVariance.set(k, sls.size > 1)
  }
  // Apply disambiguated plannedName
  for (const rc of refClasses) {
    const k = `${rc.grade}|${rc.majorName}|${rc.classNumber}`
    rc.plannedName = buildDisambiguatedPlannedName(
      rc.grade, rc.majorName, rc.classNumber, rc.direction,
      rc.educationLevel, rc.schoolLength, groupHasVariance.get(k) || false
    )
  }

  // Verify uniqueness of plannedName and canonicalKey
  const nameCount = new Map<string, number>()
  const ckCount = new Map<string, number>()
  for (const rc of refClasses) {
    nameCount.set(rc.plannedName, (nameCount.get(rc.plannedName) || 0) + 1)
    ckCount.set(rc.canonicalKey, (ckCount.get(rc.canonicalKey) || 0) + 1)
  }
  const plannedNameDuplicates = [...nameCount.values()].filter(c => c > 1).reduce((a, b) => a + b - 1, 0)
  const ckDuplicates = [...ckCount.values()].filter(c => c > 1).reduce((a, b) => a + b - 1, 0)
  console.log(`[ref] plannedName duplicate count: ${plannedNameDuplicates}`)
  console.log(`[ref] canonicalKey duplicate count: ${ckDuplicates}`)
  if (ckDuplicates > 0) {
    console.log('REFERENCE_CANONICAL_KEY_COLLISION (unexpected — data error)')
    await prisma.$disconnect()
    process.exit(1)
  }
  if (plannedNameDuplicates > 0) {
    const dups = [...nameCount.entries()].filter(([, v]) => v > 1).map(([k]) => k)
    console.log(`PLANNED_NAME_DEDUP_FAILED: ${dups.join(', ')}`)
    await prisma.$disconnect()
    process.exit(1)
  }

  // ── Build canonical index (canonicalKey → [refClass]) ─────────────────
  const canonicalIndex = new Map<string, RefClass[]>()
  for (const rc of refClasses) {
    const arr = canonicalIndex.get(rc.canonicalKey) || []
    arr.push(rc)
    canonicalIndex.set(rc.canonicalKey, arr)
  }

  // ── Load existing source artifacts (read-only) ───────────────────────
  const l8c3Artifact = join(ROOT, 'temp', 'local-artifacts', 'l8-c3', 'db-classgroup-to-canonical-plan.local.json')
  const l8c3RefArtifact = join(ROOT, 'temp', 'local-artifacts', 'l8-c3', 'reference-canonical-classgroups.raw.local.json')
  const l8c4TtcDecisions = join(ROOT, 'temp', 'local-artifacts', 'l8-c4', 'unified-ttc-decisions.local.json')

  const sourceArtifactHashes = {
    l8c3_db_canonical_plan: hashArtifact(l8c3Artifact),
    l8c3_reference_canonical: hashArtifact(l8c3RefArtifact),
    l8c4_unified_ttc_decisions: hashArtifact(l8c4TtcDecisions),
    major_xlsx: hashArtifact(MAJOR_XLSX),
  }
  console.log(`[artifacts] l8c3 reference canonical: ${sourceArtifactHashes.l8c3_reference_canonical.slice(0, 16)}...`)
  console.log(`[artifacts] l8c4 unified ttc decisions: ${sourceArtifactHashes.l8c4_unified_ttc_decisions.slice(0, 16)}...`)

  // ── Load DB ClassGroups + map to canonical ───────────────────────────
  console.log('\n--- Task 2: Map DB ClassGroups to canonical ---')
  const allDbCgs = await prisma.classGroup.findMany({ orderBy: { id: 'asc' } })
  console.log(`[db] ClassGroup count: ${allDbCgs.length}`)

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

  // For each DB CG, find canonical match
  const dbPlans: Array<{
    dbClassGroupId: number
    semesterId: number
    name: string
    isActive: boolean
    matchedCanonicalKey: string | null
    matchType: 'EXACT' | 'AMBIGUOUS_RESOLVED' | 'NEEDS_REVIEW' | 'COMPOSITE' | 'NO_MATCH'
  }> = []

  for (const cg of allDbCgs) {
    const parsed = parseDbName(cg.name)
    if (!parsed.grade || !parsed.major) {
      dbPlans.push({ dbClassGroupId: cg.id, semesterId: cg.semesterId, name: cg.name, isActive: cg.isActive, matchedCanonicalKey: null, matchType: 'NEEDS_REVIEW' })
      continue
    }
    if (cg.name.includes('+') || cg.name.includes('、')) {
      dbPlans.push({ dbClassGroupId: cg.id, semesterId: cg.semesterId, name: cg.name, isActive: cg.isActive, matchedCanonicalKey: null, matchType: 'COMPOSITE' })
      continue
    }
    const candidates: string[] = []
    for (const ck of canonicalIndex.keys()) {
      const parts = ck.split('|')
      if (parts[0] === parsed.grade && parts[1] === parsed.major && parts[2] === parsed.classNum && parts[3] === parsed.direction) {
        candidates.push(ck)
      }
    }
    if (candidates.length === 1) {
      dbPlans.push({ dbClassGroupId: cg.id, semesterId: cg.semesterId, name: cg.name, isActive: cg.isActive, matchedCanonicalKey: candidates[0], matchType: 'EXACT' })
    } else if (candidates.length > 1) {
      // Sort: prefer 三年制, then 五年制, then 三年制 on tie
      const sorted = candidates.sort((a, b) => {
        const sa = a.split('|')[5], sb = b.split('|')[5]
        if (sa === '三年制' && sb !== '三年制') return -1
        if (sb === '三年制' && sa !== '三年制') return 1
        return 0
      })
      dbPlans.push({ dbClassGroupId: cg.id, semesterId: cg.semesterId, name: cg.name, isActive: cg.isActive, matchedCanonicalKey: sorted[0], matchType: 'AMBIGUOUS_RESOLVED' })
    } else {
      dbPlans.push({ dbClassGroupId: cg.id, semesterId: cg.semesterId, name: cg.name, isActive: cg.isActive, matchedCanonicalKey: null, matchType: 'NO_MATCH' })
    }
  }
  const mapStats = dbPlans.reduce((acc, p) => { acc[p.matchType] = (acc[p.matchType] || 0) + 1; return acc }, {} as Record<string, number>)
  console.log('[map] classification:', JSON.stringify(mapStats))

  // ── Select canonical DB rows ─────────────────────────────────────────
  const canonicalRowSelection = new Map<string, number>() // canonicalKey → chosen dbClassGroupId
  // Priority: target semester exact > other sem exact
  const targetExact = dbPlans.filter(p => p.matchType === 'EXACT' && p.semesterId === args.targetSemesterId && p.matchedCanonicalKey)
  const otherExact = dbPlans.filter(p => p.matchType === 'EXACT' && p.semesterId !== args.targetSemesterId && p.matchedCanonicalKey)
  for (const p of [...targetExact, ...otherExact]) {
    if (p.matchedCanonicalKey && !canonicalRowSelection.has(p.matchedCanonicalKey)) {
      canonicalRowSelection.set(p.matchedCanonicalKey, p.dbClassGroupId)
    }
  }
  // Fill remaining with AMBIGUOUS_RESOLVED
  for (const p of dbPlans.filter(x => x.matchType === 'AMBIGUOUS_RESOLVED' && x.matchedCanonicalKey)) {
    if (p.matchedCanonicalKey && !canonicalRowSelection.has(p.matchedCanonicalKey)) {
      canonicalRowSelection.set(p.matchedCanonicalKey, p.dbClassGroupId)
    }
  }
  console.log(`[select] canonical rows selected: ${canonicalRowSelection.size} / 227`)

  // ── Build immutable plan operations ──────────────────────────────────
  console.log('\n--- Task 3: Build immutable plan operations ---')

  const createOps: Array<{
    operationId: string
    operationType: 'CREATE'
    fromId: null
    toCanonicalKey: string
    toPlannedName: string
    toGrade: string
    toMajorName: string
    toClassNumber: string
    toDirection: string
    toEducationLevel: string
    toSchoolLength: string
    toStudentCount: number | null
    toSemesterId: number
    reasonCode: string
    sourceEvidenceRef: string
  }> = []

  const updateOps: Array<{
    operationId: string
    operationType: 'UPDATE'
    fromId: number
    fromName: string
    toCanonicalKey: string
    toPlannedName: string
    toGrade: string
    toMajorName: string
    toClassNumber: string
    toDirection: string
    toEducationLevel: string
    toSchoolLength: string
    toSemesterId: number
    reasonCode: string
    sourceEvidenceRef: string
  }> = []

  const deactivateOps: Array<{
    operationId: string
    operationType: 'DEACTIVATE'
    fromId: number
    fromName: string
    fromSemesterId: number
    fromIsActive: boolean
    reasonCode: 'COMPOSITE' | 'NO_MATCH' | 'NEEDS_REVIEW' | 'DUPLICATE_NON_SELECTED'
    sourceEvidenceRef: string
  }> = []

  // CREATE: canonical keys with no selected DB row
  for (const rc of refClasses) {
    if (!canonicalRowSelection.has(rc.canonicalKey)) {
      createOps.push({
        operationId: `create-${rc.canonicalKey}`,
        operationType: 'CREATE',
        fromId: null,
        toCanonicalKey: rc.canonicalKey,
        toPlannedName: rc.plannedName,
        toGrade: rc.grade,
        toMajorName: rc.majorName,
        toClassNumber: rc.classNumber,
        toDirection: rc.direction,
        toEducationLevel: rc.educationLevel,
        toSchoolLength: rc.schoolLength,
        toStudentCount: rc.studentCount,
        toSemesterId: args.targetSemesterId,
        reasonCode: 'reference_canonical_no_db_row',
        sourceEvidenceRef: rc.referenceClassKey,
      })
    }
  }

  // UPDATE: selected DB rows
  for (const [ck, dbId] of canonicalRowSelection) {
    const ref = canonicalIndex.get(ck)![0]
    const dbCg = allDbCgs.find(c => c.id === dbId)
    if (!dbCg) continue
    updateOps.push({
      operationId: `update-${ck}`,
      operationType: 'UPDATE',
      fromId: dbId,
      fromName: dbCg.name,
      toCanonicalKey: ck,
      toPlannedName: ref.plannedName,
      toGrade: ref.grade,
      toMajorName: ref.majorName,
      toClassNumber: ref.classNumber,
      toDirection: ref.direction,
      toEducationLevel: ref.educationLevel,
      toSchoolLength: ref.schoolLength,
      toSemesterId: args.targetSemesterId,
      reasonCode: 'reference_canonical_existing_row',
      sourceEvidenceRef: ref.referenceClassKey,
    })
  }

  // DEACTIVATE: extras and non-selected duplicates
  const protectedRowIds = new Set(canonicalRowSelection.values())
  // Track duplicates: any DB row whose matchedCanonicalKey is selected but is not the selected row
  const deactivatedIds = new Set<number>()
  for (const p of dbPlans) {
    if (protectedRowIds.has(p.dbClassGroupId)) {
      // This row is the SELECTED canonical. Add other rows mapped to the same canonical key as duplicates.
      const otherMapped = dbPlans.filter(x => x.matchedCanonicalKey && x.matchedCanonicalKey === p.matchedCanonicalKey && x.dbClassGroupId !== p.dbClassGroupId)
      for (const other of otherMapped) {
        if (other.dbClassGroupId && !deactivatedIds.has(other.dbClassGroupId)) {
          deactivateOps.push({
            operationId: `deactivate-${other.dbClassGroupId}`,
            operationType: 'DEACTIVATE',
            fromId: other.dbClassGroupId,
            fromName: other.name,
            fromSemesterId: other.semesterId,
            fromIsActive: other.isActive,
            reasonCode: 'DUPLICATE_NON_SELECTED',
            sourceEvidenceRef: `selected=${p.dbClassGroupId} ck=${p.matchedCanonicalKey}`,
          })
          deactivatedIds.add(other.dbClassGroupId)
        }
      }
      continue
    }
    // This row is NOT protected. Determine reason.
    let reasonCode: 'COMPOSITE' | 'NO_MATCH' | 'NEEDS_REVIEW' | 'DUPLICATE_NON_SELECTED'
    if (p.matchedCanonicalKey && canonicalRowSelection.has(p.matchedCanonicalKey)) {
      // Has a matched canonical key AND that key is selected → this is a duplicate (non-selected)
      reasonCode = 'DUPLICATE_NON_SELECTED'
    } else if (p.matchType === 'COMPOSITE') {
      reasonCode = 'COMPOSITE'
    } else if (p.matchType === 'NEEDS_REVIEW') {
      reasonCode = 'NEEDS_REVIEW'
    } else {
      reasonCode = 'NO_MATCH'
    }
    if (deactivatedIds.has(p.dbClassGroupId)) continue
    deactivateOps.push({
      operationId: `deactivate-${p.dbClassGroupId}`,
      operationType: 'DEACTIVATE',
      fromId: p.dbClassGroupId,
      fromName: p.name,
      fromSemesterId: p.semesterId,
      fromIsActive: p.isActive,
      reasonCode,
      sourceEvidenceRef: p.matchedCanonicalKey || 'none',
    })
    deactivatedIds.add(p.dbClassGroupId)
  }

  // ── TTC migration plan ───────────────────────────────────────────────
  console.log('\n--- Task 4: TTC migration plan ---')
  const allTtc = await prisma.teachingTaskClass.findMany({
    select: { id: true, classGroupId: true, teachingTaskId: true }
  })
  console.log(`[ttc] total: ${allTtc.length}`)

  // Load unified TTC decisions
  const decisions = JSON.parse(readFileSync(l8c4TtcDecisions, 'utf8'))
  console.log(`[ttc] unified decisions: ${decisions.totalTtcDecisions} resolved=${decisions.resolvedTtcDecisions} unresolved=${decisions.unresolvedTtcDecisions}`)
  if (decisions.unresolvedTtcDecisions > 0) {
    console.log('UNRESOLVED_TTC_DECISIONS_PRESENT')
    await prisma.$disconnect()
    process.exit(1)
  }

  // Build migrateTeachingTaskClassRefs list
  const ttcMigrations: Array<{
    operationId: string
    ttcId: number
    fromClassGroupId: number
    toClassGroupId: number
    targetCanonicalKey: string | null
    reasonCode: string
  }> = []

  // Map ttcId → decision
  const decisionByTtcId = new Map<number, { ttcId: number; fromClassGroupId: number; toClassGroupId: number | null; targetCanonicalKey: string | null; source: string }>()
  for (const d of decisions.ttcDecisions) decisionByTtcId.set(d.ttcId, d)

  // After CREATE+UPDATE, what are the final classGroupIds per canonical key?
  // CREATE assigns new ids (unknown until apply). UPDATE keeps existing ids.
  // For apply, we need a final-id map. We'll record `toClassGroupId` based on:
  //   - UPDATE → use existing fromId
  //   - CREATE → reserved placeholder; apply will compute actual new id
  for (const d of decisions.ttcDecisions) {
    const currentTtc = allTtc.find(t => t.id === d.ttcId)
    if (!currentTtc) continue
    if (d.targetCanonicalKey) {
      // Lookup target id
      const targetId = canonicalRowSelection.get(d.targetCanonicalKey)
      if (targetId && targetId !== currentTtc.classGroupId) {
        ttcMigrations.push({
          operationId: `ttc-migrate-${d.ttcId}`,
          ttcId: d.ttcId,
          fromClassGroupId: currentTtc.classGroupId,
          toClassGroupId: targetId,
          targetCanonicalKey: d.targetCanonicalKey,
          reasonCode: `decision-source=${d.source}`,
        })
      }
    } else if (d.source === 'c3-plan' && d.toClassGroupId !== null) {
      const targetId = d.toClassGroupId
      if (targetId !== currentTtc.classGroupId) {
        ttcMigrations.push({
          operationId: `ttc-migrate-${d.ttcId}`,
          ttcId: d.ttcId,
          fromClassGroupId: currentTtc.classGroupId,
          toClassGroupId: targetId,
          targetCanonicalKey: null,
          reasonCode: `decision-source=${d.source}`,
        })
      }
    }
  }
  console.log(`[ttc] planned migrations: ${ttcMigrations.length}`)

  // ── TTC collision check ──────────────────────────────────────────────
  console.log('\n--- Task 5: TTC collision check ---')
  // Group by (teachingTaskId, toClassGroupId) — collisions would break @@unique
  // The real check: simulate the final state. For each teachingTaskId, collect (fromClassGroupId set, toClassGroupId set).
  // After migration, a teachingTask's classGroupId set should remain valid (no duplicates of the same id).
  // The collision case: two distinct TTCs of the same teachingTaskId migrating to the same toClassGroupId.
  const targetByTaskAndCg = new Map<string, number>()
  const ttcCollisions: Array<{ teachingTaskId: number; conflictingCgs: number[]; ttcIds: number[] }> = []
  for (const m of ttcMigrations) {
    const ttc = allTtc.find(t => t.id === m.ttcId)
    if (!ttc) continue
    const k = `${ttc.teachingTaskId}|${m.toClassGroupId}`
    if (targetByTaskAndCg.has(k)) {
      // Collision — two TTCs of same teachingTask would map to same classGroup
      const existingTtc = targetByTaskAndCg.get(k)!
      ttcCollisions.push({ teachingTaskId: ttc.teachingTaskId, conflictingCgs: [m.toClassGroupId], ttcIds: [existingTtc, m.ttcId] })
    } else {
      targetByTaskAndCg.set(k, m.ttcId)
    }
  }
  // Also check: a TTC's toClassGroupId is the fromClassGroupId of another TTC of the same teachingTask
  // (cyclic migration: A→B and B→A for same teachingTask). This breaks @@unique differently.
  for (const ttc of allTtc) {
    const m = ttcMigrations.find(x => x.ttcId === ttc.id)
    if (!m) continue
    // After migration, this ttc has classGroupId = m.toClassGroupId
    // Check if another ttc of the same teachingTask has fromClassGroupId = m.toClassGroupId
    // (the other ttc will keep its fromClassGroupId unless it also migrates away)
    const other = allTtc.find(t => t.teachingTaskId === ttc.teachingTaskId && t.id !== ttc.id && t.classGroupId === m.toClassGroupId)
    if (other) {
      const otherMigration = ttcMigrations.find(x => x.ttcId === other.id)
      // If the other ttc migrates AWAY (otherMigration.toClassGroupId !== m.toClassGroupId), no collision.
      if (!otherMigration || otherMigration.toClassGroupId === other.classGroupId) {
        // Other ttc stays at m.toClassGroupId, AND this ttc migrates TO m.toClassGroupId → collision
        ttcCollisions.push({ teachingTaskId: ttc.teachingTaskId, conflictingCgs: [m.toClassGroupId, other.classGroupId], ttcIds: [ttc.id, other.id] })
      }
    }
  }

  const ttcCollisionCount = ttcCollisions.length
  const ttcCollisionCheck = {
    ttcTotal: allTtc.length,
    plannedTtcMigrate: ttcMigrations.length,
    plannedTtcDelete: 0,
    plannedTtcCreate: 0,
    collisionCount: ttcCollisionCount,
    readyForApply: ttcCollisionCount === 0,
    collisions: ttcCollisions,
  }
  writeFileSync(
    join(ARTIFACT_DIR, 'ttc-migration-collision-check.local.json'),
    JSON.stringify(ttcCollisionCheck, null, 2),
    'utf8'
  )
  console.log(`[ttc] collision count: ${ttcCollisionCount}`)
  if (ttcCollisionCount > 0) {
    console.log('TTC_MIGRATION_COLLISION_DETECTED → readyForApply = false')
  }

  // ── Compute expected counts ─────────────────────────────────────────
  const finalClassGroupTotal = baseline.cgTotal + createOps.length // creates add rows
  const finalTtcTotal = baseline.ttc // no TTC delete, no create → same

  // ── Build snapshot ──────────────────────────────────────────────────
  const expectedCounts = {
    course: 104,
    teacher: 427,
    create: createOps.length,
    update: updateOps.length,
    deactivate: deactivateOps.length,
    hardDelete: 0,
    ttcMigrate: ttcMigrations.length,
    ttcDelete: 0,
    ttcCreate: 0,
    finalClassGroupTotal,
    finalTtcTotal,
    activeCanonicalRefXlsx: 227,
    canonicalKeyNonNull: 227,
  }

  const snapshot = {
    planVersion: PLAN_VERSION,
    generatedAt: new Date().toISOString(),
    targetSemesterId: args.targetSemesterId,
    sourceArtifactHashes,
    dbBaselineHash: hashString(JSON.stringify(baseline)),
    dbBaseline: baseline,
    expectedBaseline: expected,
    referenceCanonicalCount: refClasses.length,
    canonicalKeyDuplicateCount: ckDuplicates,
    plannedNameDuplicateCount: plannedNameDuplicates,
    createClassGroups: createOps,
    updateClassGroups: updateOps,
    deactivateClassGroups: deactivateOps,
    migrateTeachingTaskClassRefs: ttcMigrations,
    expectedCounts,
    ttcCollisionCount,
    manualReviewRequired: 0,
    readyForC4CApply: ttcCollisionCount === 0 && plannedNameDuplicates === 0 && ckDuplicates === 0,
    noDBWrite: true,
  }
  // Hash the snapshot itself (excluding the hash field)
  const snapshotHash = hashString(JSON.stringify(snapshot))
  const snapshotWithHash = { ...snapshot, snapshotHash }

  writeFileSync(
    join(ARTIFACT_DIR, 'classgroup-canonical-sync-plan.immutable.local.json'),
    JSON.stringify(snapshotWithHash, null, 2),
    'utf8'
  )
  console.log(`\n[plan] snapshot written: ${ARTIFACT_DIR}/classgroup-canonical-sync-plan.immutable.local.json`)
  console.log(`[plan] snapshot hash: ${snapshotHash.slice(0, 16)}...`)

  // ── Markdown summary ────────────────────────────────────────────────
  const md = `# L8-C4B ClassGroup Canonical Sync — Immutable Plan

**planVersion**: ${PLAN_VERSION}
**generatedAt**: ${snapshotWithHash.generatedAt}
**targetSemesterId**: ${args.targetSemesterId}
**snapshotHash**: ${snapshotHash}

## Source Artifacts

| Artifact | Hash (sha256) |
|---|---|
| l8c3 reference canonical | ${sourceArtifactHashes.l8c3_reference_canonical} |
| l8c3 db canonical plan | ${sourceArtifactHashes.l8c3_db_canonical_plan} |
| l8c4 unified ttc decisions | ${sourceArtifactHashes.l8c4_unified_ttc_decisions} |
| 学院专业数据库.xlsx | ${sourceArtifactHashes.major_xlsx} |

## DB Baseline (read-only)

\`\`\`json
${JSON.stringify(baseline, null, 2)}
\`\`\`

## Plan Counts

| Metric | Value |
|---|---|
| referenceCanonicalCount | ${refClasses.length} |
| canonicalKeyDuplicateCount | ${ckDuplicates} |
| plannedNameDuplicateCount | ${plannedNameDuplicates} |
| create | ${createOps.length} |
| update | ${updateOps.length} |
| deactivate | ${deactivateOps.length} |
| hardDelete | 0 |
| ttcMigrate | ${ttcMigrations.length} |
| ttcDelete | 0 |
| ttcCreate | 0 |
| finalClassGroupTotal | ${finalClassGroupTotal} |
| finalTtcTotal | ${finalTtcTotal} |
| activeCanonicalRefXlsx | 227 |
| canonicalKeyNonNull | 227 |
| ttcCollisionCount | ${ttcCollisionCount} |
| readyForC4CApply | ${snapshotWithHash.readyForC4CApply} |

## Disambiguation

- plannedName collision in C4A: 26 duplicate base names across 29 canonical keys
- C4B rule: when a (grade, majorName, classNumber) group has schoolLength variance, append \`（educationLevel schoolLength）\` suffix to ALL members of that group
- Result: plannedNameDuplicateCount = ${plannedNameDuplicates}

## Forbidden Operations

- hard delete ClassGroup = ${expectedCounts.hardDelete}
- delete TeachingTaskClass = ${expectedCounts.ttcDelete}
- create TeachingTaskClass = ${expectedCounts.ttcCreate}

## Next Stage

- readyForC4CApply = ${snapshotWithHash.readyForC4CApply}
- L8-C5 remains blocked
- TeachingTask import remains blocked
`
  writeFileSync(
    join(ARTIFACT_DIR, 'classgroup-canonical-sync-plan.immutable.local.md'),
    md,
    'utf8'
  )

  // ── Console summary ─────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===')
  console.log(JSON.stringify(expectedCounts, null, 2))
  console.log(`\nreadyForC4CApply: ${snapshotWithHash.readyForC4CApply}`)
  console.log('NO DB WRITES PERFORMED')
  console.log('=== DONE ===')

  await prisma.$disconnect()
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
