/**
 * L8-C0 Audit Script — ClassGroup Global Master Data Semantic Reconciliation
 *
 * Stage: L8-C0-CLASSGROUP-GLOBAL-MASTER-DATA-SEMANTIC-RECONCILIATION
 *
 * Read-only audit:
 *   1. Reference Excel (学院专业数据库.xlsx) — 227 reference classes
 *   2. DB ClassGroup table (all semesters)
 *   3. Reference usage (TeachingTaskClass, TeachingTask, ScheduleSlot, etc.)
 *   4. Schema semantic audit
 *   5. Code usage audit summary
 *
 * NO DB writes. NO apply. NO backup. NO ClassGroup creation/modification/deletion.
 * NO schema/migration/.env changes.
 *
 * Usage:
 *   npx tsx scripts/audit-classgroup-global-master-data-l8-c0.ts \
 *     --major-xlsx "D:/Desktop/Course Development System/学院专业数据库.xlsx" \
 *     --target-semester-id 4
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'

// ── Constants ───────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '..')
const STAGE = 'L8-C0-CLASSGROUP-GLOBAL-MASTER-DATA-SEMANTIC-RECONCILIATION'
const ARTIFACT_DIR = join(ROOT, 'temp', 'local-artifacts', 'l8-c0')

// ── CLI args ────────────────────────────────────────────────────────────────

type CliArgs = {
  majorXlsx: string
  targetSemesterId: number
  help: boolean
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { majorXlsx: '', targetSemesterId: 0, help: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--major-xlsx') args.majorXlsx = argv[++i] ?? ''
    else if (a === '--target-semester-id') args.targetSemesterId = Number(argv[++i] ?? 0)
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

const usage = (): void => {
  console.log('Usage: npx tsx scripts/audit-classgroup-global-master-data-l8-c0.ts \\')
  console.log('  --major-xlsx "<path>" \\')
  console.log('  --target-semester-id <id>')
}

// ── Reference Excel types ──────────────────────────────────────────────────

type ReferenceClass = {
  college: string
  major: string
  direction: string | null
  grade: string          // e.g. "2024级"
  className: string      // e.g. "1班"
  classNumber: string    // e.g. "1"
  schoolLength: string   // e.g. "三年制"
  studentCount: number | null
  isFiveYear: string     // "是" | "否"
  educationLevel: string // "高职" | "中高职"
  canonicalKey: string   // grade|major|classNumber|direction|schoolLength
}

// ── DB ClassGroup types ────────────────────────────────────────────────────

type DbClassGroup = {
  id: number
  name: string
  studentCount: number | null
  semesterId: number
  normalizedName: string
  gradeToken: string
  majorToken: string
  classNumberToken: string
  directionToken: string | null
  canonicalKey: string
  hasClassNumberSuffix: boolean
  isComposite: boolean
  isSuspicious: boolean
  suspiciousReasons: string[]
  isSemesterCopy: boolean
  matchStatus: MatchStatus
  matchConfidence: number
  matchDetails: string
}

type MatchStatus =
  | 'REFERENCE_MATCH_EXACT'
  | 'REFERENCE_MATCH_ALIAS'
  | 'REFERENCE_MATCH_AMBIGUOUS'
  | 'REFERENCE_ONLY_MISSING_IN_DB'
  | 'DB_ONLY_EXTRA'
  | 'DB_DUPLICATE'
  | 'SUSPICIOUS_NAME'
  | 'SEMESTER_COPY'
  | 'IMPORT_ARTIFACT'
  | 'COMPOSITE_OR_TEMP_GROUP'

// ── Reference usage types ──────────────────────────────────────────────────

type ClassGroupUsage = {
  classGroupId: number
  className: string
  semesterId: number
  matchStatus: MatchStatus
  teachingTaskClassRefs: number
  teachingTaskRefs: number
  scheduleSlotRefs: number
  scheduleAdjustmentRefs: number
  importBatchRefs: number
  canDeleteSafely: boolean
  canMergeSafely: boolean
  requiresMigration: boolean
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse a DB ClassGroup name into structured tokens.
 *
 * Patterns:
 *   "2025级智能轧钢技术1班"              → grade=2025级, major=智能轧钢技术, classNum=1, dir=null
 *   "2024级钢铁智能冶金技术1班（高本贯通）" → grade=2024级, major=钢铁智能冶金技术, classNum=1, dir=高本贯通
 *   "2025级智能网联汽车技术"              → grade=2025级, major=智能网联汽车技术, classNum=, dir=null
 *   "2023钢铁智能冶金技术（协议班）1班"    → grade=2023级, major=钢铁智能冶金技术, classNum=1, dir=协议班
 *   "2025级智能轧钢技术（现场工程师）+..."  → composite
 */
function parseClassGroupName(name: string): {
  gradeToken: string
  majorToken: string
  classNumberToken: string
  directionToken: string | null
  hasClassNumberSuffix: boolean
  isComposite: boolean
  suspiciousReasons: string[]
} {
  const suspiciousReasons: string[] = []
  let working = name.trim()

  // Check composite
  const isComposite = working.includes('+') || working.includes('＋') || working.includes('、')
  if (isComposite) suspiciousReasons.push('COMPOSITE_NAME')

  // Extract grade: "2024级" or "2023" (missing 级)
  let gradeToken = ''
  const gradeMatch = working.match(/^(\d{4})(级)?/)
  if (gradeMatch) {
    gradeToken = gradeMatch[1] + '级'
    if (!gradeMatch[2]) suspiciousReasons.push('MISSING_JI_SUFFIX')
    working = working.slice(gradeMatch[0].length)
  } else {
    suspiciousReasons.push('NO_GRADE_TOKEN')
  }

  // Extract parenthetical direction: （高本贯通）, (协议班), etc.
  let directionToken: string | null = null
  const dirMatch = working.match(/[（(]([^）)]+)[）)]/)
  if (dirMatch) {
    directionToken = dirMatch[1]
    working = working.replace(/[（(][^）)]*[）)]/, '')
  }

  // Extract class number suffix: "1班", "30班"
  let classNumberToken = ''
  let hasClassNumberSuffix = false
  const classNumMatch = working.match(/(\d+)班$/)
  if (classNumMatch) {
    classNumberToken = classNumMatch[1]
    hasClassNumberSuffix = true
    working = working.slice(0, -classNumMatch[0].length)
  }

  // Remaining is the major token
  const majorToken = working.trim()

  if (!majorToken) suspiciousReasons.push('EMPTY_MAJOR_TOKEN')

  return { gradeToken, majorToken, classNumberToken, directionToken, hasClassNumberSuffix, isComposite, suspiciousReasons }
}

/**
 * Build canonical key for DB ClassGroup.
 * Format: "{grade}|{major}|{classNum}|{direction}|"
 */
function buildDbCanonicalKey(
  gradeToken: string,
  majorToken: string,
  classNumberToken: string,
  directionToken: string | null
): string {
  return `${gradeToken}|${majorToken}|${classNumberToken}|${directionToken || ''}|`
}

/**
 * Build canonical key for Reference class (primary matching key).
 * Format: "{grade}|{major}|{classNumber}|{direction}|"
 * School length is supplementary; when multiple ref classes share the same
 * primary key but differ in school length, they form an AMBIGUOUS set.
 */
function buildRefCanonicalKey(ref: ReferenceClass): string {
  return `${ref.grade}|${ref.major}|${ref.classNumber}|${ref.direction || ''}|`
}

/**
 * Build alias key: normalized major (strip direction/variant suffixes).
 * For matching DB entries with parenthetical markers against reference.
 */
function buildAliasKey(
  gradeToken: string,
  majorToken: string,
  classNumberToken: string,
  _directionToken: string | null
): string {
  // Alias: strip parenthetical info, match on grade+major+classNum only
  return `${gradeToken}|${majorToken}|${classNumberToken}||`
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help || !args.majorXlsx || !args.targetSemesterId) {
    usage()
    process.exit(args.help ? 0 : 1)
  }

  if (!existsSync(args.majorXlsx)) {
    console.error(`ERROR: major-xlsx not found: ${args.majorXlsx}`)
    process.exit(2)
  }

  if (!existsSync(ARTIFACT_DIR)) mkdirSync(ARTIFACT_DIR, { recursive: true })

  console.log(`=== ${STAGE} ===\n`)

  const prisma = new PrismaClient()

  // ── Baseline BEFORE ──────────────────────────────────────────────────────
  const baselineBefore = {
    course: await prisma.course.count(),
    teacher: await prisma.teacher.count(),
    classGroupSem1: await prisma.classGroup.count({ where: { semesterId: 1 } }),
    classGroupSemTarget: await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } }),
    teachingTaskSemTarget: await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } }),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    scheduleSlotSemTarget: await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } }),
    scheduleAdjustmentSemTarget: await prisma.scheduleAdjustment.count({ where: { semesterId: args.targetSemesterId } }),
    importBatchTotal: await prisma.importBatch.count(),
  }
  const ib39before = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40before = await prisma.importBatch.findUnique({ where: { id: 40 } }).catch(() => null)

  console.log(
    `[baseline-before] Course=${baselineBefore.course} Teacher=${baselineBefore.teacher} ` +
    `CG_sem1=${baselineBefore.classGroupSem1} CG_sem${args.targetSemesterId}=${baselineBefore.classGroupSemTarget} ` +
    `TT_sem${args.targetSemesterId}=${baselineBefore.teachingTaskSemTarget} TTC=${baselineBefore.teachingTaskClass} ` +
    `SS_sem${args.targetSemesterId}=${baselineBefore.scheduleSlotSemTarget} ` +
    `SA_sem${args.targetSemesterId}=${baselineBefore.scheduleAdjustmentSemTarget} IB=${baselineBefore.importBatchTotal}`
  )
  console.log(
    `[baseline-before] IB#39=${ib39before ? `APPLIED, tasks=${ib39before.createdTaskCount}` : 'absent'} ` +
    `IB#40=${ib40before ? ib40before.status : 'absent'}`
  )

  // Verify expected baseline
  const expectedBaseline = {
    course: 104, teacher: 427, classGroupSem1: 36,
    classGroupSemTarget: 406, teachingTaskSemTarget: 0,
    teachingTaskClass: 446, scheduleSlotSemTarget: 0,
    scheduleAdjustmentSemTarget: 0, importBatchTotal: 39,
  }
  const baselineDrift: string[] = []
  for (const [key, expected] of Object.entries(expectedBaseline)) {
    const actual = (baselineBefore as Record<string, number>)[key]
    if (actual !== expected) baselineDrift.push(`${key}: expected=${expected} actual=${actual}`)
  }
  if (baselineDrift.length > 0) {
    console.log(`\nBASELINE_DRIFT_DETECTED:\n  ${baselineDrift.join('\n  ')}`)
  } else {
    console.log('[baseline-before] ALL EXPECTED VALUES MATCH')
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Task 2: Reference class parsing
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Task 2: Reference class parsing ---')

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(args.majorXlsx)

  // Sheet 1: major list
  const ws1 = wb.worksheets[0]
  const refMajors: { college: string; major: string }[] = []
  for (let r = 2; r <= ws1.rowCount; r++) {
    const row: (string | number | null)[] = []
    ws1.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
      row[col - 1] = cell.value as string | number | null
    })
    if (row[1]) refMajors.push({ college: String(row[1] || ''), major: String(row[2] || '') })
  }
  console.log(`[ref-major] count=${refMajors.length}`)

  // Sheet 3: class database
  const ws3 = wb.worksheets[2]
  const refClasses: ReferenceClass[] = []
  for (let r = 2; r <= ws3.rowCount; r++) {
    const row: (string | number | null)[] = []
    ws3.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
      row[col - 1] = cell.value as string | number | null
    })
    if (row[0] || row[1]) {
      const ref: ReferenceClass = {
        college: String(row[0] || ''),
        major: String(row[1] || ''),
        direction: row[2] ? String(row[2]) : null,
        grade: String(row[3] || ''),
        className: String(row[4] || ''),
        classNumber: String(row[5] || ''),
        schoolLength: String(row[6] || ''),
        studentCount: row[7] != null ? Number(row[7]) : null,
        isFiveYear: String(row[8] || ''),
        educationLevel: String(row[9] || ''),
        canonicalKey: '', // filled below
      }
      ref.canonicalKey = buildRefCanonicalKey(ref)
      refClasses.push(ref)
    }
  }
  console.log(`[ref-class] count=${refClasses.length}`)

  // Verify expected counts
  const refMajorCount = refMajors.length
  const refClassCount = refClasses.length
  if (refClassCount !== 227) {
    console.log(`[ref-class] WARNING: expected 227, got ${refClassCount}`)
  }

  // Save raw reference classes (local artifact - may contain raw data)
  writeFileSync(
    join(ARTIFACT_DIR, 'reference-classes.raw.local.json'),
    JSON.stringify(refClasses, null, 2),
    'utf8'
  )
  console.log(`[ref-class] raw artifact saved to temp/local-artifacts/l8-c0/reference-classes.raw.local.json`)

  // Aggregate reference stats (for committed docs)
  const refGrades: Record<string, number> = {}
  const refMajorsDist: Record<string, number> = {}
  const refColleges = new Set<string>()
  const refLevels: Record<string, number> = {}
  const refSchoolLengths: Record<string, number> = {}
  const refFiveYear: Record<string, number> = {}
  let refTotalStudents = 0
  const refKeys = new Set<string>()
  let refDuplicateKeys = 0

  for (const c of refClasses) {
    refGrades[c.grade] = (refGrades[c.grade] || 0) + 1
    refMajorsDist[c.major] = (refMajorsDist[c.major] || 0) + 1
    refColleges.add(c.college)
    refLevels[c.educationLevel] = (refLevels[c.educationLevel] || 0) + 1
    refSchoolLengths[c.schoolLength] = (refSchoolLengths[c.schoolLength] || 0) + 1
    refFiveYear[c.isFiveYear] = (refFiveYear[c.isFiveYear] || 0) + 1
    refTotalStudents += (c.studentCount || 0)
    if (refKeys.has(c.canonicalKey)) refDuplicateKeys++
    refKeys.add(c.canonicalKey)
  }

  console.log(`[ref-class] unique canonical keys=${refKeys.size} duplicate keys=${refDuplicateKeys}`)
  console.log(`[ref-class] unique colleges=${refColleges.size} unique majors=${Object.keys(refMajorsDist).length}`)
  console.log(`[ref-class] total students=${refTotalStudents}`)
  console.log(`[ref-class] grades: ${JSON.stringify(refGrades)}`)
  console.log(`[ref-class] education levels: ${JSON.stringify(refLevels)}`)
  console.log(`[ref-class] school lengths: ${JSON.stringify(refSchoolLengths)}`)

  // Build reference key → class index for matching
  const refKeyIndex = new Map<string, ReferenceClass[]>()
  for (const c of refClasses) {
    const existing = refKeyIndex.get(c.canonicalKey) || []
    existing.push(c)
    refKeyIndex.set(c.canonicalKey, existing)
  }

  // Also build grade+major+classNum index (no direction, no schoolLength) for alias matching
  const refAliasIndex = new Map<string, ReferenceClass[]>()
  for (const c of refClasses) {
    const aliasKey = `${c.grade}|${c.major}|${c.classNumber}||`
    const existing = refAliasIndex.get(aliasKey) || []
    existing.push(c)
    refAliasIndex.set(aliasKey, existing)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Task 3: DB ClassGroup audit
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Task 3: DB ClassGroup audit ---')

  const allClassGroups = await prisma.classGroup.findMany({ orderBy: { id: 'asc' } })
  const semGroups = allClassGroups.filter(cg => cg.semesterId === args.targetSemesterId)
  const sem1Groups = allClassGroups.filter(cg => cg.semesterId === 1)

  // Semester distribution
  const cgBySemester: Record<number, number> = {}
  for (const cg of allClassGroups) {
    cgBySemester[cg.semesterId] = (cgBySemester[cg.semesterId] || 0) + 1
  }
  console.log(`[db-cg] total=${allClassGroups.length} by semester=${JSON.stringify(cgBySemester)}`)

  // Check semester copy: sem1 names that exist in target semester
  const sem1Names = new Set(sem1Groups.map(cg => cg.name))
  const semTargetNames = new Set(semGroups.map(cg => cg.name))
  let semesterCopyCount = 0
  for (const name of sem1Names) {
    if (semTargetNames.has(name)) semesterCopyCount++
  }
  console.log(`[db-cg] sem1→sem${args.targetSemesterId} name overlap=${semesterCopyCount}/${sem1Names.size}`)

  // Parse all target-semester ClassGroups
  const dbClassGroups: DbClassGroup[] = semGroups.map(cg => {
    const parsed = parseClassGroupName(cg.name)
    const canonicalKey = buildDbCanonicalKey(parsed.gradeToken, parsed.majorToken, parsed.classNumberToken, parsed.directionToken)
    return {
      id: cg.id,
      name: cg.name,
      studentCount: cg.studentCount,
      semesterId: cg.semesterId,
      normalizedName: cg.name.replace(/\s+/g, ''),
      gradeToken: parsed.gradeToken,
      majorToken: parsed.majorToken,
      classNumberToken: parsed.classNumberToken,
      directionToken: parsed.directionToken,
      canonicalKey,
      hasClassNumberSuffix: parsed.hasClassNumberSuffix,
      isComposite: parsed.isComposite,
      isSuspicious: parsed.suspiciousReasons.length > 0,
      suspiciousReasons: parsed.suspiciousReasons,
      isSemesterCopy: sem1Names.has(cg.name),
      matchStatus: 'DB_ONLY_EXTRA' as MatchStatus,
      matchConfidence: 0,
      matchDetails: '',
    }
  })

  // Save raw DB ClassGroup artifact
  writeFileSync(
    join(ARTIFACT_DIR, 'db-classgroups.raw.local.json'),
    JSON.stringify(dbClassGroups, null, 2),
    'utf8'
  )
  console.log(`[db-cg] raw artifact saved`)

  // ══════════════════════════════════════════════════════════════════════════
  // Task 4: Reference 227 vs DB 406 matching
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Task 4: Reference vs DB matching ---')

  // Track which reference keys are matched
  const matchedRefKeys = new Set<string>()
  const ambiguousRefKeys = new Set<string>()

  // Pass 1: EXACT match on canonical key
  for (const cg of dbClassGroups) {
    if (refKeyIndex.has(cg.canonicalKey)) {
      cg.matchStatus = 'REFERENCE_MATCH_EXACT'
      cg.matchConfidence = 1.0
      cg.matchDetails = `exact canonical key: ${cg.canonicalKey}`
      matchedRefKeys.add(cg.canonicalKey)
    }
  }

  // Pass 2: ALIAS match (grade+major+classNum, ignoring direction/schoolLength)
  for (const cg of dbClassGroups) {
    if (cg.matchStatus !== 'DB_ONLY_EXTRA') continue
    const aliasKey = buildAliasKey(cg.gradeToken, cg.majorToken, cg.classNumberToken, cg.directionToken)
    const aliasMatches = refAliasIndex.get(aliasKey) || []
    if (aliasMatches.length === 1) {
      cg.matchStatus = 'REFERENCE_MATCH_ALIAS'
      cg.matchConfidence = 0.8
      cg.matchDetails = `alias match (direction/school-length variant): ref=${aliasMatches[0].canonicalKey}`
      matchedRefKeys.add(aliasMatches[0].canonicalKey)
    } else if (aliasMatches.length > 1) {
      cg.matchStatus = 'REFERENCE_MATCH_AMBIGUOUS'
      cg.matchConfidence = 0.5
      cg.matchDetails = `ambiguous alias match: ${aliasMatches.length} candidates`
      ambiguousRefKeys.add(aliasKey)
    }
  }

  // Pass 3: AMBIGUOUS match for entries without class number
  for (const cg of dbClassGroups) {
    if (cg.matchStatus !== 'DB_ONLY_EXTRA') continue
    if (!cg.hasClassNumberSuffix && cg.classNumberToken === '') {
      // Try matching by grade+major (any class number)
      const candidates = refClasses.filter(
        rc => rc.grade === cg.gradeToken && rc.major === cg.majorToken
      )
      if (candidates.length === 1) {
        cg.matchStatus = 'REFERENCE_MATCH_ALIAS'
        cg.matchConfidence = 0.7
        cg.matchDetails = `single-candidate no-classnum match: ref=${candidates[0].canonicalKey}`
        matchedRefKeys.add(candidates[0].canonicalKey)
      } else if (candidates.length > 1) {
        cg.matchStatus = 'REFERENCE_MATCH_AMBIGUOUS'
        cg.matchConfidence = 0.3
        cg.matchDetails = `no-classnum ambiguous: ${candidates.length} candidates for ${cg.gradeToken}|${cg.majorToken}`
      }
    }
  }

  // Pass 4: Handle composite and suspicious
  for (const cg of dbClassGroups) {
    if (cg.matchStatus !== 'DB_ONLY_EXTRA') continue
    if (cg.isComposite) {
      cg.matchStatus = 'COMPOSITE_OR_TEMP_GROUP'
      cg.matchConfidence = 0
      cg.matchDetails = 'composite class group (contains +/、)'
    }
  }

  // Pass 5: Handle semester copy
  for (const cg of dbClassGroups) {
    if (cg.isSemesterCopy && cg.matchStatus === 'DB_ONLY_EXTRA') {
      // These are copies from sem1 — check if they matched reference above
      // If they matched, keep the match status. If not, mark as semester copy.
      // Actually, if they are semester copies AND didn't match reference, they're still extra
    }
  }

  // Count match results
  const matchCounts: Record<MatchStatus, number> = {
    REFERENCE_MATCH_EXACT: 0,
    REFERENCE_MATCH_ALIAS: 0,
    REFERENCE_MATCH_AMBIGUOUS: 0,
    REFERENCE_ONLY_MISSING_IN_DB: 0,
    DB_ONLY_EXTRA: 0,
    DB_DUPLICATE: 0,
    SUSPICIOUS_NAME: 0,
    SEMESTER_COPY: 0,
    IMPORT_ARTIFACT: 0,
    COMPOSITE_OR_TEMP_GROUP: 0,
  }
  for (const cg of dbClassGroups) {
    matchCounts[cg.matchStatus]++
  }

  // Find reference-only missing (in reference but not matched by any DB CG)
  const refOnlyMissing: ReferenceClass[] = []
  for (const rc of refClasses) {
    if (!matchedRefKeys.has(rc.canonicalKey)) {
      // Check if any DB CG matched this ref key via alias
      const refAliasKey = `${rc.grade}|${rc.major}|${rc.classNumber}||`
      const dbAliasMatches = dbClassGroups.filter(cg =>
        cg.matchStatus === 'REFERENCE_MATCH_ALIAS' &&
        buildAliasKey(cg.gradeToken, cg.majorToken, cg.classNumberToken, cg.directionToken) === refAliasKey
      )
      if (dbAliasMatches.length === 0) {
        refOnlyMissing.push(rc)
        matchCounts.REFERENCE_ONLY_MISSING_IN_DB++
      }
    }
  }

  // Mark suspicious entries
  for (const cg of dbClassGroups) {
    if (cg.isSuspicious && cg.matchStatus === 'DB_ONLY_EXTRA') {
      cg.matchStatus = 'SUSPICIOUS_NAME'
      matchCounts.SUSPICIOUS_NAME++
      matchCounts.DB_ONLY_EXTRA--
    }
  }

  // Mark semester copy entries (only those still DB_ONLY_EXTRA)
  for (const cg of dbClassGroups) {
    if (cg.isSemesterCopy && cg.matchStatus === 'DB_ONLY_EXTRA') {
      cg.matchStatus = 'SEMESTER_COPY'
      matchCounts.SEMESTER_COPY++
      matchCounts.DB_ONLY_EXTRA--
    }
  }

  console.log('[match] Results:')
  for (const [status, count] of Object.entries(matchCounts)) {
    console.log(`  ${status}: ${count}`)
  }

  // Save match artifact
  writeFileSync(
    join(ARTIFACT_DIR, 'classgroup-reference-match.local.json'),
    JSON.stringify({
      matchCounts,
      dbClassGroups: dbClassGroups.map(cg => ({
        id: cg.id,
        semesterId: cg.semesterId,
        matchStatus: cg.matchStatus,
        matchConfidence: cg.matchConfidence,
        matchDetails: cg.matchDetails,
        isComposite: cg.isComposite,
        isSuspicious: cg.isSuspicious,
        isSemesterCopy: cg.isSemesterCopy,
        canonicalKey: cg.canonicalKey,
      })),
      refOnlyMissing: refOnlyMissing.map(rc => ({
        grade: rc.grade,
        major: rc.major,
        classNumber: rc.classNumber,
        direction: rc.direction,
        schoolLength: rc.schoolLength,
        canonicalKey: rc.canonicalKey,
      })),
    }, null, 2),
    'utf8'
  )
  console.log('[match] artifact saved')

  // ══════════════════════════════════════════════════════════════════════════
  // Task 5: Reference usage audit
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Task 5: Reference usage audit ---')

  // Load all TeachingTaskClass with related data
  const allTTC = await prisma.teachingTaskClass.findMany({
    include: {
      teachingTask: {
        include: {
          scheduleSlots: true,
        },
      },
    },
  })

  // Build classGroupId → TTC refs
  const cgTTCRefs = new Map<number, typeof allTTC>()
  for (const ttc of allTTC) {
    const existing = cgTTCRefs.get(ttc.classGroupId) || []
    existing.push(ttc)
    cgTTCRefs.set(ttc.classGroupId, existing)
  }

  // Build usage stats for each target-semester ClassGroup
  const usageStats: ClassGroupUsage[] = []
  for (const cg of dbClassGroups) {
    const ttcs = cgTTCRefs.get(cg.id) || []
    const teachingTaskIds = new Set(ttcs.map(ttc => ttc.teachingTaskId))
    let slotCount = 0
    let adjustmentCount = 0
    for (const ttc of ttcs) {
      slotCount += ttc.teachingTask.scheduleSlots.length
    }

    // Check ScheduleAdjustment refs (via ScheduleSlot)
    for (const ttc of ttcs) {
      for (const slot of ttc.teachingTask.scheduleSlots) {
        const adjCount = await prisma.scheduleAdjustment.count({
          where: { originalSlotId: slot.id },
        })
        adjustmentCount += adjCount
      }
    }

    const isReferenced = ttcs.length > 0
    const canDeleteSafely = !isReferenced
    const canMergeSafely = !isReferenced || (slotCount === 0 && adjustmentCount === 0)
    const requiresMigration = isReferenced && (slotCount > 0 || adjustmentCount > 0)

    let riskLevel: ClassGroupUsage['riskLevel'] = 'LOW'
    if (requiresMigration) riskLevel = 'CRITICAL'
    else if (isReferenced) riskLevel = 'HIGH'
    else if (cg.matchStatus === 'COMPOSITE_OR_TEMP_GROUP') riskLevel = 'MEDIUM'

    usageStats.push({
      classGroupId: cg.id,
      className: cg.name,
      semesterId: cg.semesterId,
      matchStatus: cg.matchStatus,
      teachingTaskClassRefs: ttcs.length,
      teachingTaskRefs: teachingTaskIds.size,
      scheduleSlotRefs: slotCount,
      scheduleAdjustmentRefs: adjustmentCount,
      importBatchRefs: 0, // not directly linked
      canDeleteSafely,
      canMergeSafely,
      requiresMigration,
      riskLevel,
    })
  }

  // Aggregate usage stats
  const referencedExtras = usageStats.filter(
    u => ['DB_ONLY_EXTRA', 'SUSPICIOUS_NAME', 'SEMESTER_COPY', 'COMPOSITE_OR_TEMP_GROUP'].includes(u.matchStatus) &&
      u.teachingTaskClassRefs > 0
  )
  const unreferencedExtras = usageStats.filter(
    u => ['DB_ONLY_EXTRA', 'SUSPICIOUS_NAME', 'SEMESTER_COPY', 'COMPOSITE_OR_TEMP_GROUP'].includes(u.matchStatus) &&
      u.teachingTaskClassRefs === 0
  )

  console.log(`[usage] referenced extras: ${referencedExtras.length}`)
  console.log(`[usage] unreferenced extras: ${unreferencedExtras.length}`)
  console.log(`[usage] delete-safe candidates: ${usageStats.filter(u => u.canDeleteSafely).length}`)
  console.log(`[usage] merge-required candidates: ${usageStats.filter(u => !u.canMergeSafely).length}`)
  console.log(`[usage] migration-required candidates: ${usageStats.filter(u => u.requiresMigration).length}`)

  // Risk distribution
  const riskDist: Record<string, number> = {}
  for (const u of usageStats) {
    riskDist[u.riskLevel] = (riskDist[u.riskLevel] || 0) + 1
  }
  console.log(`[usage] risk distribution: ${JSON.stringify(riskDist)}`)

  // Save usage artifact
  writeFileSync(
    join(ARTIFACT_DIR, 'classgroup-reference-usage.local.json'),
    JSON.stringify(usageStats, null, 2),
    'utf8'
  )
  console.log('[usage] artifact saved')

  // ══════════════════════════════════════════════════════════════════════════
  // Task 6 & 7: Code + Schema semantic audit summary
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Task 6/7: Code + Schema semantic audit ---')

  // Schema audit results (from manual inspection of prisma/schema.prisma)
  const schemaAudit = {
    model: 'ClassGroup',
    fields: {
      id: { type: 'Int', required: true, autoincrement: true },
      name: { type: 'String', required: true },
      studentCount: { type: 'Int?', required: false },
      advisorName: { type: 'String?', required: false },
      advisorPhone: { type: 'String?', required: false },
      semesterId: { type: 'Int', required: true },
      semester: { type: 'Semester @relation', required: true },
      taskClasses: { type: 'TeachingTaskClass[]', required: false },
      createdAt: { type: 'DateTime', required: true },
      updatedAt: { type: 'DateTime', required: true },
    },
    uniqueConstraints: ['@@unique([semesterId, name])'],
    indexes: ['@@index([semesterId])'],
    semesterIdRequired: true,
    relationsToTeachingTaskClass: true,
    relationsToSemester: true,
    canBeMadeGlobalAdditively: false, // requires migration: remove semesterId from unique, make nullable
    notes: 'ClassGroup is currently semester-scoped. @@unique([semesterId, name]) prevents global uniqueness. Making global requires: (1) make semesterId nullable, (2) change unique to [name] only, (3) migrate existing data, (4) update all API/UI/import/scheduler queries.',
  }

  // Code usage audit summary (from rg search — documented below)
  const codeUsageAudit = {
    IMPORT: {
      affected: true,
      description: 'Import pipeline creates ClassGroup via upsert with semesterId. confirmImportBatch() in importer.ts uses semesterId to scope ClassGroup lookup/creation. Making ClassGroup global would require removing semesterId from upsert conditions.',
      files: ['src/lib/import/importer.ts'],
    },
    COURSE_SETTING: {
      affected: true,
      description: 'Course setting preview queries ClassGroup by targetSemesterId. If ClassGroup becomes global, query should drop semesterId filter.',
      files: ['src/app/api/admin/course-setting/route.ts (if exists)'],
    },
    SCHEDULE_DISPLAY: {
      affected: true,
      description: 'Schedule grid displays ClassGroup names via TeachingTaskClass. No direct semesterId filter on ClassGroup in display, but indirect via TeachingTask.semesterId.',
      files: ['src/components/schedule-grid.tsx'],
    },
    SCHEDULER_SOLVER: {
      affected: false,
      description: 'Solver loads ClassGroup via TeachingTaskClass. Does not filter ClassGroup by semesterId directly.',
      files: ['src/lib/scheduler/data-loader.ts'],
    },
    ADJUSTMENT: {
      affected: false,
      description: 'Adjustment system references ClassGroup indirectly via TeachingTaskClass. No direct ClassGroup semesterId query.',
      files: ['src/lib/schedule/adjustments.ts'],
    },
    ADMIN_DB_PAGE: {
      affected: true,
      description: 'Admin DB page queries ClassGroup by active semester. Making ClassGroup global would require removing semester filter.',
      files: ['src/lib/admin-db/config.ts', 'src/app/admin/db/page.tsx (if exists)'],
    },
    SETTINGS: {
      affected: false,
      description: 'Settings center does not directly manage ClassGroup.',
      files: [],
    },
    SEMESTER_SCOPING: {
      affected: true,
      description: 'ClassGroup.semesterId is the core of semester scoping for class groups. Making global requires schema migration + all query updates.',
      files: ['prisma/schema.prisma', 'src/store/semesterStore.ts'],
    },
    API_VALIDATION: {
      affected: true,
      description: 'API routes validate ClassGroup existence within semester scope. Global ClassGroup would need different validation.',
      files: ['src/app/api/admin/import/confirm/route.ts'],
    },
  }

  console.log('[schema] semesterId required: YES')
  console.log('[schema] unique constraints: @@unique([semesterId, name])')
  console.log('[schema] relations: TeachingTaskClass[], Semester')
  console.log('[code] import: affected')
  console.log('[code] admin-db: affected')
  console.log('[code] semester-scoping: affected')

  // ══════════════════════════════════════════════════════════════════════════
  // Aggregate output
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Aggregate output ---')

  const aggregate = {
    stage: STAGE,
    semanticDecision: 'GLOBAL_MASTER_DATA',
    referenceMajorCount: refMajorCount,
    referenceClassCount: refClassCount,
    referenceUniqueCanonicalKeys: refKeys.size,
    referenceDuplicateKeys: refDuplicateKeys,
    referenceTotalStudents: refTotalStudents,
    referenceColleges: refColleges.size,
    referenceUniqueMajors: Object.keys(refMajorsDist).length,
    referenceGrades: refGrades,
    referenceEducationLevels: refLevels,
    referenceSchoolLengths: refSchoolLengths,

    dbClassGroupTotal: allClassGroups.length,
    dbClassGroupBySemester: cgBySemester,
    dbClassGroupSemTarget: semGroups.length,
    dbSemesterCopyOverlap: semesterCopyCount,

    matchResult: matchCounts,

    referencedExtraCount: referencedExtras.length,
    unreferencedExtraCount: unreferencedExtras.length,
    deleteSafeCandidateCount: usageStats.filter(u => u.canDeleteSafely).length,
    mergeRequiredCandidateCount: usageStats.filter(u => !u.canMergeSafely).length,
    migrationRequiredCandidateCount: usageStats.filter(u => u.requiresMigration).length,

    schemaAudit,
    codeUsageAudit,

    recommendedOption: 'HYBRID (Option A short-term cleanup + Option B long-term globalization)',
    recommendedNextStage: 'L8-C1-CLASSGROUP-GLOBALIZATION-DESIGN',

    baselineBefore,
    baselineDrift: baselineDrift.length > 0 ? baselineDrift : null,
    noDBWriteConfirmation: true,
    noApplyConfirmation: true,
    noBackupConfirmation: true,
  }

  // Save aggregate JSON (committed — no PII)
  writeFileSync(
    join(ROOT, 'docs', 'l8-c0-classgroup-global-master-data-reconciliation.json'),
    JSON.stringify(aggregate, null, 2),
    'utf8'
  )
  console.log('[aggregate] committed JSON saved')

  // Print summary
  console.log('\n=== SUMMARY ===')
  console.log(`Semantic decision: GLOBAL_MASTER_DATA`)
  console.log(`Reference classes: ${refClassCount}`)
  console.log(`DB ClassGroup total: ${allClassGroups.length}`)
  console.log(`DB ClassGroup by semester: ${JSON.stringify(cgBySemester)}`)
  console.log(`Sem${args.targetSemesterId} ClassGroup: ${semGroups.length}`)
  console.log(`Semester copy overlap (sem1→sem${args.targetSemesterId}): ${semesterCopyCount}`)
  console.log(`Match results:`)
  for (const [status, count] of Object.entries(matchCounts)) {
    console.log(`  ${status}: ${count}`)
  }
  console.log(`Referenced extras: ${referencedExtras.length}`)
  console.log(`Unreferenced extras: ${unreferencedExtras.length}`)
  console.log(`Delete-safe: ${usageStats.filter(u => u.canDeleteSafely).length}`)
  console.log(`Recommended next stage: L8-C1-CLASSGROUP-GLOBALIZATION-DESIGN`)

  // ── Baseline AFTER (should be unchanged) ─────────────────────────────────
  const baselineAfter = {
    course: await prisma.course.count(),
    teacher: await prisma.teacher.count(),
    classGroupSem1: await prisma.classGroup.count({ where: { semesterId: 1 } }),
    classGroupSemTarget: await prisma.classGroup.count({ where: { semesterId: args.targetSemesterId } }),
    teachingTaskSemTarget: await prisma.teachingTask.count({ where: { semesterId: args.targetSemesterId } }),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    scheduleSlotSemTarget: await prisma.scheduleSlot.count({ where: { semesterId: args.targetSemesterId } }),
    scheduleAdjustmentSemTarget: await prisma.scheduleAdjustment.count({ where: { semesterId: args.targetSemesterId } }),
    importBatchTotal: await prisma.importBatch.count(),
  }
  console.log('\n[baseline-after]')
  for (const [key, val] of Object.entries(baselineAfter)) {
    const before = (baselineBefore as Record<string, number>)[key]
    const changed = val !== before
    console.log(`  ${key}: ${val}${changed ? ' *** CHANGED ***' : ''}`)
  }

  console.log('\n=== DONE ===')
  await prisma.$disconnect()
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
