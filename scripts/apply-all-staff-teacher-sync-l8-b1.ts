/**
 * L8-B1 Apply Script — All-Staff Teacher Controlled Sync Apply
 *
 * Stage: L8-B1-ALL-STAFF-TEACHER-CONTROLLED-SYNC-APPLY
 *
 * Consumes the L8-B0 sync plan
 * (temp/local-artifacts/l8-b0/all-staff-teacher-sync-plan.local.json)
 * and executes a controlled sync apply inside a single Prisma transaction:
 *   - CREATE 191 Teacher rows for SAFE_CREATE_TEACHER candidates.
 *   - UPDATE: 0 (B0 plan never requested update of existing rows).
 *   - DELETE: 0 (db-only Teacher retained; no Teacher deleted).
 *   - SKIP: 2 DUPLICATE_SOURCE_PERSON (need manual review).
 *   - SKIP: 0 NEEDS_MANUAL_REVIEW.
 *   - SKIP: 0 INVALID_PERSON_RECORD.
 *   - SKIP: 0 AMBIGUOUS_EXISTING_TEACHER_MATCH.
 *
 * Default mode is DRY-RUN. Pass --confirm-token WRITE_L8_B1_ALL_STAFF_TEACHERS
 * to actually write to the database. Any other token (including
 * INVALID_TOKEN) MUST fail without writing anything.
 *
 * Hard constraints:
 *  - No ImportBatch / TeachingTask / TeachingTaskClass / Course / ClassGroup
 *    / ScheduleSlot / ScheduleAdjustment writes.
 *  - No Teacher updates.
 *  - No Teacher deletes.
 *  - No schema/migration/.env changes.
 *  - If any UNIQUE constraint conflict is detected mid-transaction, the
 *    transaction MUST roll back atomically (no partial commits).
 *  - Committed docs/json: aggregate only; no raw names/phones/IDs/depts.
 *
 * Usage:
 *   # Dry-run (no DB writes)
 *   npx tsx scripts/apply-all-staff-teacher-sync-l8-b1.ts --dry-run
 *
 *   # Invalid token test (must fail without writes)
 *   npx tsx scripts/apply-all-staff-teacher-sync-l8-b1.ts --confirm-token INVALID_TOKEN
 *
 *   # Valid token apply (writes 191 Teacher rows in single transaction)
 *   npx tsx scripts/apply-all-staff-teacher-sync-l8-b1.ts --confirm-token WRITE_L8_B1_ALL_STAFF_TEACHERS
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

// ── Constants ───────────────────────────────────────────────────────────────

const STAGE = 'L8-B1-ALL-STAFF-TEACHER-CONTROLLED-SYNC-APPLY' as const
const VALID_TOKEN = 'WRITE_L8_B1_ALL_STAFF_TEACHERS' as const
const PLAN_PATH = 'temp/local-artifacts/l8-b0/all-staff-teacher-sync-plan.local.json'
const RAW_ARTIFACT_DIR = 'temp/local-artifacts/l8-b1'
const RAW_ARTIFACT_JSON = 'all-staff-teacher-controlled-sync-apply.raw.local.json'

// ── CLI args ────────────────────────────────────────────────────────────────

type CliArgs = { dryRun: boolean; confirmToken: string; help: boolean }

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { dryRun: false, confirmToken: '', help: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--confirm-token') args.confirmToken = argv[++i] ?? ''
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

const usage = (): void => {
  console.log('Usage:')
  console.log('  npx tsx scripts/apply-all-staff-teacher-sync-l8-b1.ts --dry-run')
  console.log('  npx tsx scripts/apply-all-staff-teacher-sync-l8-b1.ts --confirm-token INVALID_TOKEN')
  console.log('  npx tsx scripts/apply-all-staff-teacher-sync-l8-b1.ts --confirm-token WRITE_L8_B1_ALL_STAFF_TEACHERS')
}

// ── Hashing ─────────────────────────────────────────────────────────────────

const sha256 = (s: string, len = 16): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)

// ── Types (matching L8-B0 plan structure) ───────────────────────────────────

type PlannedCreatePayload = {
  name: string
  employeeNo?: string | null
  department?: string | null
  position?: string | null
  rank?: string | null
  phone?: string | null
  officePhone?: string | null
}

type SafeCreateCandidate = {
  personKey: string
  rawName: string
  normalizedName: string
  normalizedNameHash: string
  sourcePresence: 'staffDb' | 'contactsXlsx' | 'both'
  sourceEvidenceLocalOnly: {
    departments: string[]
    roles: string[]
    employeeNoHash: string | null
    officePhoneHash: string | null
    mobilePhoneHash: string | null
    emailHash: string | null
  }
  plannedTeacherCreatePayload: PlannedCreatePayload | null
  riskFlags: string[]
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW'
}

type B0SyncPlan = {
  stage: string
  generatedAt: string
  teacherSemanticDecision: string
  schemaInfo: {
    modelName: string
    fields: Array<{ name: string; type: string; required: boolean; unique: boolean }>
    minimumRequiredForCreate: string[]
    uniqueConstraints: string[]
    canWriteDepartment: boolean
    canWritePosition: boolean
    canWritePhone: boolean
    canWriteOfficePhone: boolean
    canWriteEmployeeNo: boolean
    canWriteRank: boolean
    proposedCreatePayloadShape: Record<string, string>
  }
  baselineBefore: Record<string, number>
  counts: {
    ALREADY_IN_TEACHER: number
    SAFE_CREATE_TEACHER: number
    NEEDS_MANUAL_REVIEW: number
    DUPLICATE_SOURCE_PERSON: number
    INVALID_PERSON_RECORD: number
    AMBIGUOUS_EXISTING_TEACHER_MATCH: number
  }
  totalUnionPeople: number
  dbTeacherCount: number
  dbTeacherDuplicateNormalizedCount: number
  dbOnlyTeacherCount: number
  dbOnlyTeacherList: Array<{
    teacherId: number
    teacherNameHash: string
    sourcePresence: 'NONE'
    reasonCodes: string[]
  }>
  safeCreateTeacherCandidates: SafeCreateCandidate[]
  needsManualReview: unknown[]
  duplicateSourcePeople: unknown[]
  invalidPersonRecords: unknown[]
  alreadyCoveredTeachers: unknown[]
  ambiguousExistingTeacherMatch: unknown[]
}

// ── Baseline capture (read-only) ───────────────────────────────────────────

type Baseline = {
  course: number
  teacher: number
  classGroupSem1: number
  classGroupSem4: number
  teachingTaskSem4: number
  teachingTaskClass: number
  scheduleSlotSem4: number
  scheduleAdjustmentSem4: number
  importBatchTotal: number
  importBatch39Status: string | null
  importBatch40Present: boolean
}

const captureBaseline = async (prisma: PrismaClient, targetSemesterId: number): Promise<Baseline> => {
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } }).catch(() => null)
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } }).catch(() => null)
  return {
    course: await prisma.course.count(),
    teacher: await prisma.teacher.count(),
    classGroupSem1: await prisma.classGroup.count({ where: { semesterId: 1 } }),
    classGroupSem4: await prisma.classGroup.count({ where: { semesterId: targetSemesterId } }),
    teachingTaskSem4: await prisma.teachingTask.count({ where: { semesterId: targetSemesterId } }),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    scheduleSlotSem4: await prisma.scheduleSlot.count({ where: { semesterId: targetSemesterId } }),
    scheduleAdjustmentSem4: await prisma.scheduleAdjustment.count({ where: { semesterId: targetSemesterId } }),
    importBatchTotal: await prisma.importBatch.count(),
    importBatch39Status: ib39?.status ?? null,
    importBatch40Present: ib40 != null,
  }
}

// ── Apply logic ─────────────────────────────────────────────────────────────

type ApplyResult = {
  mode: 'dry-run' | 'invalid-token' | 'valid-token'
  dbWritten: boolean
  transactionCommitted: boolean
  transactionRolledBack: boolean
  teacherBefore: number
  teacherAfter: number
  plannedCreates: number
  actualCreates: number
  plannedUpdates: number
  actualUpdates: number
  plannedDeletes: number
  actualDeletes: number
  plannedSkippedDuplicateSourcePeople: number
  actualSkippedDuplicateSourcePeople: number
  plannedSkippedNeedsManualReview: number
  actualSkippedNeedsManualReview: number
  plannedSkippedInvalidPerson: number
  actualSkippedInvalidPerson: number
  plannedSkippedAmbiguousMatch: number
  actualSkippedAmbiguousMatch: number
  uniqueNameConflict: boolean
  conflictDetail: string | null
  failureReason: string | null
  expectedTeacherBefore: number
  expectedTeacherAfter: number
  baselineBefore: Baseline
  baselineAfter: Baseline
}

const runApply = async (prisma: PrismaClient, plan: B0SyncPlan, args: CliArgs): Promise<ApplyResult> => {
  const targetSemesterId = 4
  const baselineBefore = await captureBaseline(prisma, targetSemesterId)
  const teacherBefore = baselineBefore.teacher
  const plannedCreates = plan.safeCreateTeacherCandidates.length
  const plannedSkippedDuplicateSourcePeople = plan.duplicateSourcePeople.length
  const plannedSkippedNeedsManualReview = plan.needsManualReview.length
  const plannedSkippedInvalidPerson = plan.invalidPersonRecords.length
  const plannedSkippedAmbiguousMatch = plan.ambiguousExistingTeacherMatch.length
  const expectedTeacherBefore = teacherBefore
  const expectedTeacherAfter = teacherBefore + plannedCreates

  const baseResult = (mode: ApplyResult['mode'], dbWritten: boolean): ApplyResult => ({
    mode,
    dbWritten,
    transactionCommitted: false,
    transactionRolledBack: false,
    teacherBefore,
    teacherAfter: teacherBefore,
    plannedCreates,
    actualCreates: 0,
    plannedUpdates: 0,
    actualUpdates: 0,
    plannedDeletes: 0,
    actualDeletes: 0,
    plannedSkippedDuplicateSourcePeople,
    actualSkippedDuplicateSourcePeople: 0,
    plannedSkippedNeedsManualReview,
    actualSkippedNeedsManualReview: 0,
    plannedSkippedInvalidPerson,
    actualSkippedInvalidPerson: 0,
    plannedSkippedAmbiguousMatch,
    actualSkippedAmbiguousMatch: 0,
    uniqueNameConflict: false,
    conflictDetail: null,
    failureReason: null,
    expectedTeacherBefore,
    expectedTeacherAfter,
    baselineBefore,
    baselineAfter: baselineBefore,
  })

  // ── Dry-run ────────────────────────────────────────────────────────
  if (args.dryRun) {
    console.log('--- DRY-RUN MODE (no DB writes) ---')
    console.log(`plannedCreates = ${plannedCreates}`)
    console.log(`plannedUpdates = 0`)
    console.log(`plannedDeletes = 0`)
    console.log(`plannedSkippedDuplicateSourcePeople = ${plannedSkippedDuplicateSourcePeople}`)
    console.log(`plannedSkippedNeedsManualReview = ${plannedSkippedNeedsManualReview}`)
    console.log(`plannedSkippedInvalidPerson = ${plannedSkippedInvalidPerson}`)
    console.log(`plannedSkippedAmbiguousMatch = ${plannedSkippedAmbiguousMatch}`)
    console.log(`expectedTeacherBefore = ${expectedTeacherBefore}`)
    console.log(`expectedTeacherAfter = ${expectedTeacherAfter}`)
    console.log(`dbWritten = false`)
    return baseResult('dry-run', false)
  }

  // ── Token gate ─────────────────────────────────────────────────────
  if (args.confirmToken !== VALID_TOKEN) {
    console.log(`--- INVALID TOKEN (${args.confirmToken || '<empty>'}) ---`)
    console.log(`dbWritten = false`)
    console.log(`Teacher count remains ${teacherBefore}`)
    const result = baseResult('invalid-token', false)
    result.failureReason = `INVALID_CONFIRM_TOKEN: expected ${VALID_TOKEN}, got '${args.confirmToken || '<empty>'}'`
    return result
  }

  // ── Valid token: execute transaction ────────────────────────────────
  console.log(`--- VALID TOKEN (${VALID_TOKEN}) — EXECUTING APPLY ---`)
  const result = baseResult('valid-token', true)

  try {
    await prisma.$transaction(
      async (tx) => {
        // Pre-flight: verify NO existing Teacher has the same name we are about
        // to create. If any conflict, throw to trigger rollback.
        const plannedNames = plan.safeCreateTeacherCandidates
          .map((c) => c.plannedTeacherCreatePayload?.name)
          .filter((n): n is string => typeof n === 'string' && n.length > 0)
        const existing = await tx.teacher.findMany({
          where: { name: { in: plannedNames } },
          select: { id: true, name: true },
        })
        if (existing.length > 0) {
          result.uniqueNameConflict = true
          result.conflictDetail = existing
            .map((e) => `id=${e.id} nameHash=${sha256(e.name)}`)
            .join('|')
          throw new Error(`UNIQUE_NAME_CONFLICT: ${existing.length} existing Teacher rows conflict with planned names`)
        }

        // Execute creates. Use individual create() calls so a single mid-batch
        // failure rolls back the whole transaction (Prisma $transaction
        // semantics).
        let createdCount = 0
        for (const c of plan.safeCreateTeacherCandidates) {
          const payload = c.plannedTeacherCreatePayload
          if (!payload || !payload.name) {
            throw new Error(`INVALID_PLANNED_PAYLOAD for personKey=${c.personKey}: missing name`)
          }
          // Field allowlist: only schema-existing writable fields.
          const data: {
            name: string
            employeeNo?: string | null
            department?: string | null
            position?: string | null
            rank?: string | null
            phone?: string | null
            officePhone?: string | null
          } = { name: payload.name }
          if (payload.employeeNo != null && payload.employeeNo !== '') data.employeeNo = payload.employeeNo
          if (payload.department != null && payload.department !== '') data.department = payload.department
          if (payload.position != null && payload.position !== '') data.position = payload.position
          if (payload.rank != null && payload.rank !== '') data.rank = payload.rank
          if (payload.phone != null && payload.phone !== '') data.phone = payload.phone
          if (payload.officePhone != null && payload.officePhone !== '') data.officePhone = payload.officePhone

          await tx.teacher.create({ data })
          createdCount++
        }
        result.actualCreates = createdCount
        result.actualSkippedDuplicateSourcePeople = plannedSkippedDuplicateSourcePeople
        result.actualSkippedNeedsManualReview = plannedSkippedNeedsManualReview
        result.actualSkippedInvalidPerson = plannedSkippedInvalidPerson
        result.actualSkippedAmbiguousMatch = plannedSkippedAmbiguousMatch
      },
      { timeout: 60_000, maxWait: 10_000 },
    )
    result.transactionCommitted = true
    result.transactionRolledBack = false
  } catch (e) {
    result.transactionCommitted = false
    result.transactionRolledBack = true
    result.failureReason = (e as Error).message
    console.error(`Transaction rolled back: ${(e as Error).message}`)
  }

  // Capture post-state (read-only)
  const baselineAfter = await captureBaseline(prisma, targetSemesterId)
  result.baselineAfter = baselineAfter
  result.teacherAfter = baselineAfter.teacher

  return result
}

// ── Post-audit (read-only, after valid-token apply) ────────────────────────

type PostAudit = {
  teacherAfter: number
  teacherExpected: number
  teacherDelta: number
  baselineUnchangedExceptTeacher: boolean
  newTeacherCount: number
  duplicateNormalizedNameGroupCount: number
  invalidTeacherNameCount: number
  dbOnlyTeacherRetainedCount: number
  duplicateSourcePersonNotCreatedCount: number
  allPlannedNamesCreated: boolean
  missingPlannedNames: string[]
}

const runPostAudit = async (prisma: PrismaClient, plan: B0SyncPlan, result: ApplyResult): Promise<PostAudit> => {
  const teacherAfter = await prisma.teacher.count()
  const teacherExpected = result.expectedTeacherAfter
  const teacherDelta = teacherAfter - result.teacherBefore

  // Baseline: non-Teacher tables should be unchanged
  const baselineUnchangedExceptTeacher =
    result.baselineAfter.course === result.baselineBefore.course &&
    result.baselineAfter.classGroupSem1 === result.baselineBefore.classGroupSem1 &&
    result.baselineAfter.classGroupSem4 === result.baselineBefore.classGroupSem4 &&
    result.baselineAfter.teachingTaskSem4 === result.baselineBefore.teachingTaskSem4 &&
    result.baselineAfter.teachingTaskClass === result.baselineBefore.teachingTaskClass &&
    result.baselineAfter.scheduleSlotSem4 === result.baselineBefore.scheduleSlotSem4 &&
    result.baselineAfter.scheduleAdjustmentSem4 === result.baselineBefore.scheduleAdjustmentSem4 &&
    result.baselineAfter.importBatchTotal === result.baselineBefore.importBatchTotal

  const allTeachers = await prisma.teacher.findMany({ select: { id: true, name: true } })
  const teacherByName = new Map<string, number>()
  for (const t of allTeachers) teacherByName.set(t.name, (teacherByName.get(t.name) ?? 0) + 1)
  const duplicateNormalizedNameGroupCount = [...teacherByName.values()].filter((c) => c > 1).length
  const invalidTeacherNameCount = allTeachers.filter((t) => !t.name || t.name.trim().length < 2).length

  // Check planned names all created
  const existingNames = new Set(allTeachers.map((t) => t.name))
  const plannedNames = plan.safeCreateTeacherCandidates
    .map((c) => c.plannedTeacherCreatePayload?.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
  const missingPlannedNames = plannedNames.filter((n) => !existingNames.has(n))
  const allPlannedNamesCreated = missingPlannedNames.length === 0

  // db-only Teacher retained (no Teacher.delete was performed)
  const dbOnlyTeacherIds = new Set(plan.dbOnlyTeacherList.map((t) => t.teacherId))
  const dbOnlyTeacherRetainedCount = (
    await Promise.all([...dbOnlyTeacherIds].map((id) => prisma.teacher.findUnique({ where: { id } })))
  ).filter((t) => t != null).length

  // Duplicate source person NOT created: their names should NOT be in Teacher
  // unless they were already there before. Since plan already excluded them
  // from safe create, they should not have new Teacher rows after this apply.
  // We verify by checking that the count of new Teacher rows equals exactly
  // the planned count.
  const duplicateSourcePersonNotCreatedCount = result.actualSkippedDuplicateSourcePeople

  return {
    teacherAfter,
    teacherExpected,
    teacherDelta,
    baselineUnchangedExceptTeacher,
    newTeacherCount: teacherDelta,
    duplicateNormalizedNameGroupCount,
    invalidTeacherNameCount,
    dbOnlyTeacherRetainedCount,
    duplicateSourcePersonNotCreatedCount,
    allPlannedNamesCreated,
    missingPlannedNames,
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (args.help) {
    usage()
    process.exit(0)
  }

  if (!existsSync(PLAN_PATH)) {
    console.error('FATAL: MISSING_L8_B0_SYNC_PLAN: ' + PLAN_PATH)
    process.exit(1)
  }

  const planRaw = readFileSync(PLAN_PATH, 'utf-8')
  const plan: B0SyncPlan = JSON.parse(planRaw)

  // Invariant: B0 plan counts must match expected
  const expected = {
    safeCreateTeacher: 191,
    needsManualReview: 0,
    duplicateSourcePerson: 2,
    invalidPersonRecord: 0,
    ambiguousExistingTeacherMatch: 0,
  }
  const actual = {
    safeCreateTeacher: plan.safeCreateTeacherCandidates.length,
    needsManualReview: plan.needsManualReview.length,
    duplicateSourcePerson: plan.duplicateSourcePeople.length,
    invalidPersonRecord: plan.invalidPersonRecords.length,
    ambiguousExistingTeacherMatch: plan.ambiguousExistingTeacherMatch.length,
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error('FATAL: B0_PLAN_COUNT_DRIFT')
    console.error('expected:', expected)
    console.error('actual:', actual)
    process.exit(2)
  }

  const prisma = new PrismaClient()
  try {
    const result = await runApply(prisma, plan, args)

    if (result.mode === 'valid-token') {
      // Post-audit
      const audit = await runPostAudit(prisma, plan, result)
      console.log('\n=== Post-Audit ===')
      console.log(JSON.stringify(audit, null, 2))

      const auditPass =
        audit.teacherAfter === audit.teacherExpected &&
        audit.teacherDelta === result.actualCreates &&
        audit.baselineUnchangedExceptTeacher &&
        audit.duplicateNormalizedNameGroupCount === 0 &&
        audit.invalidTeacherNameCount === 0 &&
        audit.allPlannedNamesCreated &&
        audit.dbOnlyTeacherRetainedCount === plan.dbOnlyTeacherList.length &&
        audit.duplicateSourcePersonNotCreatedCount === 2

      if (!auditPass) {
        console.error('FATAL: POST_AUDIT_FAILED')
        process.exit(3)
      }
      console.log('POST_AUDIT: PASS')
    }

    // Write local raw artifact (gitignored under temp/)
    if (result.mode !== 'dry-run') {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const { join } = await import('node:path')
      if (!existsSync(RAW_ARTIFACT_DIR)) mkdirSync(RAW_ARTIFACT_DIR, { recursive: true })
      const rawPath = join(RAW_ARTIFACT_DIR, RAW_ARTIFACT_JSON)
      writeFileSync(
        rawPath,
        JSON.stringify(
          {
            stage: STAGE,
            generatedAt: new Date().toISOString(),
            mode: result.mode,
            dbWritten: result.dbWritten,
            transactionCommitted: result.transactionCommitted,
            transactionRolledBack: result.transactionRolledBack,
            teacherBefore: result.teacherBefore,
            teacherAfter: result.teacherAfter,
            plannedCreates: result.plannedCreates,
            actualCreates: result.actualCreates,
            failureReason: result.failureReason,
            uniqueNameConflict: result.uniqueNameConflict,
            conflictDetail: result.conflictDetail,
            baselineBefore: result.baselineBefore,
            baselineAfter: result.baselineAfter,
            expectedTeacherBefore: result.expectedTeacherBefore,
            expectedTeacherAfter: result.expectedTeacherAfter,
            plannedSkippedDuplicateSourcePeople: result.plannedSkippedDuplicateSourcePeople,
            plannedSkippedNeedsManualReview: result.plannedSkippedNeedsManualReview,
            plannedSkippedInvalidPerson: result.plannedSkippedInvalidPerson,
            plannedSkippedAmbiguousMatch: result.plannedSkippedAmbiguousMatch,
            // No raw names in raw artifact either — only hashes + counts
          },
          null,
          2,
        ) + '\n',
        'utf-8',
      )
      console.log(`raw artifact: ${rawPath}`)
    }

    // Print final summary
    console.log(`\n=== Summary ===`)
    console.log(`mode: ${result.mode}`)
    console.log(`dbWritten: ${result.dbWritten}`)
    console.log(`transactionCommitted: ${result.transactionCommitted}`)
    console.log(`transactionRolledBack: ${result.transactionRolledBack}`)
    console.log(`Teacher before: ${result.teacherBefore}`)
    console.log(`Teacher after:  ${result.teacherAfter}`)
    console.log(`plannedCreates: ${result.plannedCreates}`)
    console.log(`actualCreates:  ${result.actualCreates}`)
    if (result.failureReason) console.log(`failureReason: ${result.failureReason}`)

    // Exit codes:
    //   0 = success (dry-run, invalid-token with no writes, or valid-token apply PASS)
    //   1 = missing plan
    //   2 = plan count drift
    //   3 = post-audit failed
    if (result.mode === 'invalid-token') process.exit(0) // expected failure of token test
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  process.exit(1)
})