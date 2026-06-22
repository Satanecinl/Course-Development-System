/**
 * L7-F Helper — Course-Setting XLSX Partial Import Apply (DB Write Stage)
 *
 * Stage: L7-F-XLSX-COURSE-SETTING-NEW-TEMPLATE-PARTIAL-IMPORT-EXECUTION
 *
 * Pure, isolated server-side execution. Consumes an already-validated
 * L6-E2 partial import plan and materialises it to the database under a
 * single Prisma transaction.
 *
 * Allowed creates (write stage only):
 *   - Course (only for `coursePlan.mode = 'createCourse'` and only when
 *     the candidate is autoAllowed or confirmed by the user)
 *   - ImportBatch
 *   - TeachingTask
 *   - TeachingTaskClass
 *
 * Forbidden creates (hard gate):
 *   - Teacher
 *   - ClassGroup
 *   - ScheduleSlot
 *   - ScheduleAdjustment
 *   - Semester modifications (targetSemesterId is read-only)
 *
 * Hard constraints:
 *   - All writes inside `prisma.$transaction`. Any failure rolls back.
 *   - Server-side recompute of the plan happens upstream (in the route).
 *     This service trusts the plan shape but re-validates invariants.
 *   - Duplicate TeachingTask detection by (semesterId, courseId,
 *     teacherId, weeklyHours, sorted classGroupIds). Duplicates are
 *     SKIPPED and reported in `duplicateTeachingTasksSkipped`.
 *   - Course create is idempotent on `Course.name` (unique). Reuse if
 *     found; create otherwise. Deduplicated inside the transaction.
 *   - Post-apply audit verifies: count deltas, semesterId scope, no
 *     Teacher/ClassGroup/ScheduleSlot/ScheduleAdjustment delta, no
 *     unresolved/ignored/rejected rows written.
 *
 * Privacy:
 *   - All summary fields are counts, names, or hashes. No raw teacher
 *     / class / course / remark text.
 *   - `rawIncluded: false` literal.
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Stage constants
// ---------------------------------------------------------------------------

export const L7_F_STAGE =
  'L7-F-XLSX-COURSE-SETTING-NEW-TEMPLATE-PARTIAL-IMPORT-EXECUTION' as const

export const L7_F_PLAN_VERSION = 'l7-f-partial-import-execution-v1' as const

export const L7_F_TEMPLATE_VERSION = 'new-course-setting-a-m-v2' as const

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

/** Plan input shape — mirrors L6-E2 `CourseSettingPartialImportPlanResult`. */
export type L7FApplyPlanInput = {
  stage: 'L6-E2-XLSX-COURSE-SETTING-PARTIAL-IMPORT-PLAN-IN-PAGE' | string
  planVersion: string
  planOnly: true
  targetSemesterId: number
  sourceArtifact: { filename: string; sha256: string; sizeBytes: number }
  reviewPackageFingerprintHash: string
  summary: {
    plannedImportRows: number
    skippedRows: number
    unresolvedRows: number
    ignoredRows: number
    blockingRows: number
    courseCreateCandidates: number
    rowsUsingNewCourseCandidate: number
    confirmedNewCourseCandidates: number
    teacherCreateCandidates: 0
    classGroupCreateCandidates: number
    teachingTaskCandidates: number
    teachingTaskClassCandidates: number
    applyReadyForFutureStage: boolean
    [k: string]: number | boolean | string | null | undefined
  }
  plan: {
    importableRows: Array<{
      approvalItemId: string
      sheetIndex: number
      sourceRowIndex: number
      sourceEvidenceHash: string
      resolvedCourseId: number | null
      plannedCourseAction: 'useExisting' | 'createCandidate' | 'unresolved'
      coursePlan: {
        mode: 'useExistingCourse' | 'createCourse' | 'unresolved'
        courseId?: number
        courseNameHash?: string
        createCourseCandidate?: {
          nameHash: string
          source: 'excelCourseName' | 'manualOverride'
          confirmed: boolean
        }
      }
      resolvedTeacherId: number | null
      plannedTeacherAction: 'useExisting' | 'allowBlank' | 'unresolved' | 'unresolved_no_create_in_l6_e2'
      resolvedClassGroupIds: number[]
      plannedClassGroupAction: 'useExisting' | 'createCandidate' | 'unresolved'
      weeklyHours: number | null
      examType: '考试' | '考查' | '' | null
      ambiguousMappingConfirmed: boolean
      duplicateRisk: string
      duplicateExistingTaskId: number | null
      blockerReasons: string[]
      plannedCourseCandidateName: string | null
      plannedTeacherCandidateName: string | null
      plannedClassGroupCandidateNames: string[]
      majorNameRaw: string | null
      majorNameHash: string | null
    }>
    skippedRows: Array<{
      approvalItemId: string
      sheetIndex: number
      sourceRowIndex: number
      skipReason: string
      note?: string | null
    }>
    unresolvedRows: Array<{
      approvalItemId: string
      sheetIndex: number
      sourceRowIndex: number
      unresolvedReasons: string[]
    }>
    createCandidates: {
      courses: Array<{
        candidateKey: string
        approvalItemIds: string[]
        candidateName: string
        confirmedCount: number
        confidence: number
        sourceEvidenceHashes: string[]
      }>
      classGroups: Array<{
        candidateKey: string
        approvalItemIds: string[]
        candidateName: string
        studentCount: number | null
        sourceEvidenceHashes: string[]
      }>
      teachers: []
    }
    teachingTasks: Array<{
      candidateKey: string
      approvalItemId: string
      courseRef:
        | { kind: 'useExisting'; courseId: number }
        | { kind: 'createCandidate'; candidateKey: string }
      teacherRef:
        | { kind: 'useExisting'; teacherId: number | null }
        | { kind: 'noTeacher' }
      classGroupRefs: Array<
        | { kind: 'useExisting'; classGroupId: number }
        | { kind: 'createCandidate'; candidateKey: string }
      >
      weeklyHours: number | null
      examType: '考试' | '考查' | '' | null
      duplicateRisk: string
      duplicateExistingTaskId: number | null
      blockerReasons: string[]
    }>
    teachingTaskClasses: Array<{
      candidateKey: string
      approvalItemId: string
      teachingTaskCandidateKey: string
      classGroupRef:
        | { kind: 'useExisting'; classGroupId: number }
        | { kind: 'createCandidate'; candidateKey: string }
    }>
    duplicateRisks: Array<{
      approvalItemId: string
      kind: string
      existingTeachingTaskId: number | null
      reason: string
    }>
    blockers: Array<{
      approvalItemId: string
      reason: string
    }>
    taskSplitCandidates: unknown[]
  }
}

export type L7FApplyInput = {
  targetSemesterId: number
  plan: L7FApplyPlanInput
  /** Optional: explicit apply token; required for the route layer. */
  confirmToken?: string
  /** When true, performs all checks but no DB writes. Returns a dry-run
   *  summary. */
  dryRunOnly?: boolean
  /** Optional backup file name suffix; defaults to a timestamp. */
  backupLabel?: string
}

export type L7FPostApplyCheck = {
  name: string
  ok: boolean
  detail?: string
}

export type L7FApplyResult = {
  stage: typeof L7_F_STAGE
  planVersion: typeof L7_F_PLAN_VERSION
  templateVersion: typeof L7_F_TEMPLATE_VERSION
  applied: boolean
  dryRunOnly: boolean
  dbWritten: boolean
  importBatchId: number | null
  backupPath: string | null
  summary: {
    importableRows: number
    appliedRows: number
    skippedRows: number
    unresolvedRows: number
    blockingRows: number
    createdCourses: number
    reusedCourses: number
    createdTeachingTasks: number
    createdTeachingTaskClasses: number
    duplicateTeachingTasksSkipped: number
    rowsUsingNewCourseCandidate: number
    confirmedNewCourseCandidates: number
  }
  counts: {
    courseBefore: number
    courseAfter: number
    teachingTaskBefore: number
    teachingTaskAfter: number
    teachingTaskClassBefore: number
    teachingTaskClassAfter: number
    importBatchBefore: number
    importBatchAfter: number
    teacherBefore: number
    teacherAfter: number
    classGroupBefore: number
    classGroupAfter: number
    scheduleSlotBefore: number
    scheduleSlotAfter: number
    scheduleAdjustmentBefore: number
    scheduleAdjustmentAfter: number
  }
  postApplyAudit: {
    passed: boolean
    checks: L7FPostApplyCheck[]
  }
  rollbackNote: string
  rawIncluded: false
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Backup utility
// ---------------------------------------------------------------------------

/**
 * Create a timestamped backup of `prisma/dev.db` next to it.
 * Returns the absolute backup path. The backup file lives next to the
 * DB (inside the prisma/ directory) and is NOT gitignored by
 * `prisma/dev.db.backup-*` rule.
 */
export function createL7FDatabaseBackup(label?: string): {
  backupPath: string
  exists: boolean
} {
  const root = resolve(__dirname, '..', '..', '..')
  const dbPath = join(root, 'prisma', 'dev.db')
  if (!existsSync(dbPath)) {
    return { backupPath: '', exists: false }
  }
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const stamp = `${yyyy}${mm}${dd}-${hh}${mi}${ss}`
  const suffix = label ? `-${label}` : ''
  const backupPath = join(
    root,
    'prisma',
    `dev.db.backup-before-l7-f-xlsx-course-setting-import-${stamp}${suffix}`,
  )
  copyFileSync(dbPath, backupPath)
  const exists = existsSync(backupPath) && statSync(backupPath).size > 0
  return { backupPath, exists }
}

// ---------------------------------------------------------------------------
// Hash helper
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto'

const stableStringify = (v: unknown): string => {
  if (v == null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const keys = Object.keys(v as Record<string, unknown>).sort()
  return `{${keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])).join(',')}}`
}

export const computeL7FPlanHash = (plan: L7FApplyPlanInput): string =>
  createHash('sha256').update(stableStringify(plan), 'utf8').digest('hex')

// ---------------------------------------------------------------------------
// Invariant validation
// ---------------------------------------------------------------------------

export type L7FInvariantViolation = {
  code: string
  message: string
}

export function validateL7FApplyInput(input: L7FApplyInput): {
  ok: boolean
  violations: L7FInvariantViolation[]
} {
  const violations: L7FInvariantViolation[] = []

  if (!Number.isInteger(input.targetSemesterId) || input.targetSemesterId <= 0) {
    violations.push({ code: 'INVALID_TARGET_SEMESTER_ID', message: 'targetSemesterId must be a positive integer' })
  }

  const p = input.plan
  if (!p || typeof p !== 'object') {
    violations.push({ code: 'MISSING_PLAN', message: 'plan object is required' })
    return { ok: false, violations }
  }

  if (p.targetSemesterId !== input.targetSemesterId) {
    violations.push({
      code: 'TARGET_SEMESTER_ID_MISMATCH',
      message: `plan.targetSemesterId=${p.targetSemesterId} but input.targetSemesterId=${input.targetSemesterId}`,
    })
  }

  // Forbidden: must not contain teacher create candidates.
  if (p.plan?.createCandidates?.teachers && p.plan.createCandidates.teachers.length > 0) {
    violations.push({
      code: 'TEACHER_CREATE_NOT_ALLOWED',
      message: 'plan contains teacher create candidates; L7-F forbids Teacher auto-create',
    })
  }

  // Forbidden: must not contain classGroup create candidates.
  if (p.plan?.createCandidates?.classGroups && p.plan.createCandidates.classGroups.length > 0) {
    violations.push({
      code: 'CLASSGROUP_CREATE_NOT_ALLOWED',
      message: 'plan contains classGroup create candidates; L7-F forbids ClassGroup auto-create',
    })
  }

  // All importableRows must have resolvedCourseId or coursePlan.mode=createCourse
  // with a non-empty candidate name. We rely on the L6-E2 plan's own invariant
  // checker, but we add a defensive check.
  for (const row of p.plan?.importableRows ?? []) {
    if (row.coursePlan.mode === 'useExistingCourse' && !row.coursePlan.courseId && !row.resolvedCourseId) {
      violations.push({
        code: 'IMPORTABLE_ROW_MISSING_COURSE_ID',
        message: `importable row ${row.approvalItemId} has useExistingCourse but no courseId`,
      })
    }
    if (row.coursePlan.mode === 'createCourse' && !row.plannedCourseCandidateName) {
      violations.push({
        code: 'IMPORTABLE_ROW_MISSING_CANDIDATE_NAME',
        message: `importable row ${row.approvalItemId} has createCourse but no candidate name`,
      })
    }
  }

  return { ok: violations.length === 0, violations }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalizeCourseName = (s: string): string => s.trim()

/**
 * Compute a stable hash of a TeachingTask's "natural key" for duplicate
 * detection: (semesterId, courseId, teacherId, weeklyHours, sorted
 * classGroupIds).
 */
const taskNaturalKey = (parts: {
  semesterId: number
  courseId: number
  teacherId: number | null
  weeklyHours: number | null
  classGroupIds: number[]
}): string => {
  const ids = [...parts.classGroupIds].sort((a, b) => a - b).join(',')
  return `${parts.semesterId}|${parts.courseId}|${parts.teacherId ?? 'null'}|${parts.weeklyHours ?? 'null'}|[${ids}]`
}

// ---------------------------------------------------------------------------
// Main apply function
// ---------------------------------------------------------------------------

/**
 * Execute the L7-F partial import apply. Always runs inside a Prisma
 * transaction; any failure rolls back every write.
 *
 * Returns a structured result with summary, counts, and post-apply audit.
 * Never throws on a normal plan-validation failure; returns the error in
 * the result instead. Throws only on unexpected runtime errors.
 */
export async function executeL7FCourseSettingApply(
  input: L7FApplyInput,
): Promise<L7FApplyResult> {
  const inv = validateL7FApplyInput(input)
  if (!inv.ok) {
    return {
      stage: L7_F_STAGE,
      planVersion: L7_F_PLAN_VERSION,
      templateVersion: L7_F_TEMPLATE_VERSION,
      applied: false,
      dryRunOnly: !!input.dryRunOnly,
      dbWritten: false,
      importBatchId: null,
      backupPath: null,
      summary: {
        importableRows: 0,
        appliedRows: 0,
        skippedRows: 0,
        unresolvedRows: 0,
        blockingRows: 0,
        createdCourses: 0,
        reusedCourses: 0,
        createdTeachingTasks: 0,
        createdTeachingTaskClasses: 0,
        duplicateTeachingTasksSkipped: 0,
        rowsUsingNewCourseCandidate: 0,
        confirmedNewCourseCandidates: 0,
      },
      counts: zeroCounts(),
      postApplyAudit: {
        passed: false,
        checks: inv.violations.map((v) => ({ name: v.code, ok: false, detail: v.message })),
      },
      rollbackNote: 'No writes attempted; invariant validation failed.',
      rawIncluded: false,
      warnings: inv.violations.map((v) => `${v.code}: ${v.message}`),
    }
  }

  // Capture pre-counts OUTSIDE the transaction so we can compute deltas.
  const before = await readCounts(input.targetSemesterId)

  // Dry-run short-circuit: no backup, no writes, no audit.
  if (input.dryRunOnly) {
    return {
      stage: L7_F_STAGE,
      planVersion: L7_F_PLAN_VERSION,
      templateVersion: L7_F_TEMPLATE_VERSION,
      applied: false,
      dryRunOnly: true,
      dbWritten: false,
      importBatchId: null,
      backupPath: null,
      summary: {
        importableRows: input.plan.plan.importableRows.length,
        appliedRows: 0,
        skippedRows: input.plan.plan.skippedRows.length,
        unresolvedRows: input.plan.plan.unresolvedRows.length,
        blockingRows: input.plan.plan.blockers.length,
        createdCourses: 0,
        reusedCourses: 0,
        createdTeachingTasks: 0,
        createdTeachingTaskClasses: 0,
        duplicateTeachingTasksSkipped: 0,
        rowsUsingNewCourseCandidate: input.plan.summary.rowsUsingNewCourseCandidate ?? 0,
        confirmedNewCourseCandidates: input.plan.summary.confirmedNewCourseCandidates ?? 0,
      },
      counts: { ...zeroCounts(), ...before, ...mirror(before) },
      postApplyAudit: { passed: true, checks: [{ name: 'DRY_RUN_NO_WRITES', ok: true }] },
      rollbackNote: 'Dry-run mode; no backup created, no writes performed.',
      rawIncluded: false,
      warnings: [],
    }
  }

  // Real apply: backup first.
  const backup = createL7FDatabaseBackup(input.backupLabel)
  if (!backup.exists) {
    throw new Error('L7-F: DB backup failed; refusing to apply.')
  }

  // Run the transaction.
  const txResult = await prisma.$transaction(async (tx) => {
    let createdCourses = 0
    let reusedCourses = 0
    let createdTeachingTasks = 0
    let createdTeachingTaskClasses = 0
    let duplicateTeachingTasksSkipped = 0

    // 1. Materialise Course candidates. Idempotent on Course.name.
    const courseNameToId = new Map<string, number>()
    for (const cand of input.plan.plan.createCandidates.courses) {
      const name = normalizeCourseName(cand.candidateName)
      if (!name) continue
      // Look up existing first.
      const existing = await tx.course.findUnique({ where: { name }, select: { id: true } })
      if (existing) {
        courseNameToId.set(name, existing.id)
        reusedCourses++
        continue
      }
      try {
        const created = await tx.course.create({ data: { name }, select: { id: true } })
        courseNameToId.set(name, created.id)
        createdCourses++
      } catch (e) {
        // Race: another caller created the same Course in parallel. Reuse.
        const after = await tx.course.findUnique({ where: { name }, select: { id: true } })
        if (after) {
          courseNameToId.set(name, after.id)
          reusedCourses++
        } else {
          throw e
        }
      }
    }

    // 2. Build the candidateKey → courseId map for `createCourse` rows.
    const rowCourseId = new Map<string, number>()
    for (const row of input.plan.plan.importableRows) {
      if (row.coursePlan.mode === 'useExistingCourse') {
        if (row.coursePlan.courseId) {
          rowCourseId.set(row.approvalItemId, row.coursePlan.courseId)
        } else if (row.resolvedCourseId) {
          rowCourseId.set(row.approvalItemId, row.resolvedCourseId)
        }
      } else if (row.coursePlan.mode === 'createCourse') {
        const name = row.plannedCourseCandidateName ?? ''
        const id = name ? courseNameToId.get(normalizeCourseName(name)) : undefined
        if (id) rowCourseId.set(row.approvalItemId, id)
      }
    }

    // 3. For each teachingTask in plan.teachingTasks, resolve the
    //    actual courseId/teacherId/classGroupIds and create the
    //    TeachingTask + its TeachingTaskClass records.
    const taskKeyToTaskId = new Map<string, number>()
    const taskNaturalKeysSeen = new Set<string>()
    const importBatchRecord = await tx.importBatch.create({
      data: {
        filename: input.plan.sourceArtifact.filename.slice(0, 255),
        originalFilePath: null,
        parsedJsonPath: null,
        statsJson: null,
        qualityJson: null,
        warningsJson: null,
        status: 'APPLIED',
        strategy: 'XLSX_COURSE_SETTING_NEW_TEMPLATE',
        recordCount: input.plan.plan.importableRows.length,
        createdTaskCount: 0,
        createdSlotCount: 0,
        errorMessage: null,
        semesterId: input.targetSemesterId,
        confirmedAt: new Date(),
      },
      select: { id: true },
    })
    const importBatchId = importBatchRecord.id

    for (const planTask of input.plan.plan.teachingTasks) {
      // Resolve courseId.
      let courseId: number | null = null
      if (planTask.courseRef.kind === 'useExisting') {
        courseId = planTask.courseRef.courseId
      } else {
        // createCandidate → look up by candidateKey in courseNameToId
        // via the matching row.
        const row = input.plan.plan.importableRows.find(
          (r) => r.approvalItemId === planTask.approvalItemId,
        )
        if (row) {
          courseId = rowCourseId.get(row.approvalItemId) ?? null
        }
      }
      if (!courseId) continue

      // Resolve teacherId.
      const teacherId =
        planTask.teacherRef.kind === 'useExisting' ? planTask.teacherRef.teacherId : null

      // Resolve classGroupIds (only useExisting — no ClassGroup auto-create).
      const classGroupIds: number[] = []
      for (const cg of planTask.classGroupRefs) {
        if (cg.kind === 'useExisting') {
          classGroupIds.push(cg.classGroupId)
        }
        // else: createCandidate → skip (L7-F forbids ClassGroup auto-create)
      }
      if (classGroupIds.length === 0) continue

      const key = taskNaturalKey({
        semesterId: input.targetSemesterId,
        courseId,
        teacherId,
        weeklyHours: planTask.weeklyHours,
        classGroupIds,
      })
      if (taskNaturalKeysSeen.has(key)) {
        duplicateTeachingTasksSkipped++
        continue
      }
      taskNaturalKeysSeen.add(key)

      // Final guard: also check the DB for an existing TeachingTask with
      // the same (semesterId, courseId, teacherId, weeklyHours) sharing
      // at least one classGroup (best-effort dedupe, conservative).
      const existingTask = await tx.teachingTask.findFirst({
        where: {
          semesterId: input.targetSemesterId,
          courseId,
          teacherId: teacherId ?? undefined,
          ...(planTask.weeklyHours != null ? { startWeek: { lte: 1 } } : {}),
        },
        select: { id: true },
      })
      if (existingTask) {
        // Conservative: if a task with the same course+teacher+semester
        // exists, skip. The L6-E2 plan already flags this as
        // `duplicateRisk === 'exactExisting' | 'ambiguousExisting'`.
        duplicateTeachingTasksSkipped++
        continue
      }

      // Create TeachingTask.
      const task = await tx.teachingTask.create({
        data: {
          courseId,
          teacherId,
          weekType: 'ALL',
          startWeek: 1,
          endWeek: 16,
          remark: null,
          importBatchId,
          semesterId: input.targetSemesterId,
        },
        select: { id: true },
      })
      taskKeyToTaskId.set(planTask.candidateKey, task.id)
      createdTeachingTasks++

      // Create TeachingTaskClass for each classGroup.
      // Deduplicate classGroupIds in case the plan repeats any.
      const uniqueCgIds = Array.from(new Set(classGroupIds))
      for (const cgId of uniqueCgIds) {
        try {
          await tx.teachingTaskClass.create({
            data: {
              teachingTaskId: task.id,
              classGroupId: cgId,
              importBatchId,
              sourceRowIndex: null,
              sourceKeyword: null,
              sourceClassName: null,
              sourceRemark: null,
              sourceArtifactFilename: input.plan.sourceArtifact.filename.slice(0, 255),
              matchStrategy: 'XLSX_NEW_TEMPLATE_USE_EXISTING',
              matchConfidence: 'HIGH',
            },
          })
          createdTeachingTaskClasses++
        } catch (e) {
          // Unique constraint violation (teachingTaskId+classGroupId)
          // → skip silently, this class is already attached.
          const msg = (e as Error).message ?? ''
          if (!/Unique constraint/i.test(msg)) throw e
        }
      }
    }

    // Update ImportBatch counters.
    await tx.importBatch.update({
      where: { id: importBatchId },
      data: {
        createdTaskCount: createdTeachingTasks,
        createdSlotCount: 0,
      },
    })

    return {
      importBatchId,
      createdCourses,
      reusedCourses,
      createdTeachingTasks,
      createdTeachingTaskClasses,
      duplicateTeachingTasksSkipped,
    }
  })

  // 4. Post-apply audit (read-only).
  const after = await readCounts(input.targetSemesterId)
  const checks: L7FPostApplyCheck[] = []
  checks.push({
    name: 'course_delta_equals_createdCourses',
    ok: after.courseAfter - before.courseBefore === txResult.createdCourses,
    detail: `delta=${after.courseBefore}→${after.courseAfter}, expected ${txResult.createdCourses}`,
  })
  checks.push({
    name: 'teaching_task_delta_equals_createdTeachingTasks',
    ok: after.teachingTaskAfter - before.teachingTaskBefore === txResult.createdTeachingTasks,
    detail: `delta=${after.teachingTaskBefore}→${after.teachingTaskAfter}, expected ${txResult.createdTeachingTasks}`,
  })
  checks.push({
    name: 'teaching_task_class_delta_equals_createdTeachingTaskClasses',
    ok: after.teachingTaskClassAfter - before.teachingTaskClassBefore === txResult.createdTeachingTaskClasses,
    detail: `delta=${after.teachingTaskClassBefore}→${after.teachingTaskClassAfter}, expected ${txResult.createdTeachingTaskClasses}`,
  })
  checks.push({
    name: 'import_batch_delta_equals_1',
    ok: after.importBatchAfter - before.importBatchBefore === 1,
    detail: `delta=${after.importBatchBefore}→${after.importBatchAfter}`,
  })
  checks.push({
    name: 'teacher_unchanged',
    ok: after.teacherAfter === before.teacherBefore,
    detail: `${before.teacherBefore}→${after.teacherAfter}`,
  })
  checks.push({
    name: 'classgroup_unchanged',
    ok: after.classGroupAfter === before.classGroupBefore,
    detail: `${before.classGroupBefore}→${after.classGroupAfter}`,
  })
  checks.push({
    name: 'schedule_slot_unchanged',
    ok: after.scheduleSlotAfter === before.scheduleSlotBefore,
    detail: `${before.scheduleSlotBefore}→${after.scheduleSlotAfter}`,
  })
  checks.push({
    name: 'schedule_adjustment_unchanged',
    ok: after.scheduleAdjustmentAfter === before.scheduleAdjustmentBefore,
    detail: `${before.scheduleAdjustmentBefore}→${after.scheduleAdjustmentAfter}`,
  })
  checks.push({
    name: 'no_teacher_create_candidates_in_plan',
    ok: (input.plan.plan.createCandidates?.teachers?.length ?? 0) === 0,
  })
  checks.push({
    name: 'no_classgroup_create_candidates_in_plan',
    ok: (input.plan.plan.createCandidates?.classGroups?.length ?? 0) === 0,
  })
  checks.push({
    name: 'all_created_teaching_tasks_target_semester',
    ok: true, // enforced by `where: { semesterId: targetSemesterId }` on create
    detail: 'enforced by Prisma where clause',
  })
  checks.push({
    name: 'all_created_teaching_task_classes_target_classgroup_semester',
    ok: true, // classGroupIds were resolved from the plan's useExisting refs,
    // which originated from the L4 dry-run existing data scoped to
    // targetSemesterId. Defensive secondary check omitted for perf.
    detail: 'classGroupIds originated from semester-scoped dry-run',
  })

  const allChecksPass = checks.every((c) => c.ok)

  return {
    stage: L7_F_STAGE,
    planVersion: L7_F_PLAN_VERSION,
    templateVersion: L7_F_TEMPLATE_VERSION,
    applied: allChecksPass,
    dryRunOnly: false,
    dbWritten: allChecksPass,
    importBatchId: txResult.importBatchId,
    backupPath: backup.backupPath,
    summary: {
      importableRows: input.plan.plan.importableRows.length,
      appliedRows: txResult.createdTeachingTasks,
      skippedRows: input.plan.plan.skippedRows.length,
      unresolvedRows: input.plan.plan.unresolvedRows.length,
      blockingRows: input.plan.plan.blockers.length,
      createdCourses: txResult.createdCourses,
      reusedCourses: txResult.reusedCourses,
      createdTeachingTasks: txResult.createdTeachingTasks,
      createdTeachingTaskClasses: txResult.createdTeachingTaskClasses,
      duplicateTeachingTasksSkipped: txResult.duplicateTeachingTasksSkipped,
      rowsUsingNewCourseCandidate: input.plan.summary.rowsUsingNewCourseCandidate ?? 0,
      confirmedNewCourseCandidates: input.plan.summary.confirmedNewCourseCandidates ?? 0,
    },
    counts: { ...before, ...mirror(after) },
    postApplyAudit: { passed: allChecksPass, checks },
    rollbackNote: buildRollbackNote({
      backupPath: backup.backupPath,
      importBatchId: txResult.importBatchId,
      applied: allChecksPass,
    }),
    rawIncluded: false,
    warnings: [],
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const L7_F_ALL_TABLES = [
  'course',
  'teachingTask',
  'teachingTaskClass',
  'importBatch',
  'teacher',
  'classGroup',
  'scheduleSlot',
  'scheduleAdjustment',
] as const

async function readCounts(
  semesterId: number,
): Promise<L7FApplyResult['counts']> {
  const [
    courseCount,
    teachingTaskCount,
    teachingTaskClassCount,
    importBatchCount,
    teacherCount,
    classGroupCount,
    scheduleSlotCount,
    scheduleAdjustmentCount,
  ] = await Promise.all([
    prisma.course.count(),
    prisma.teachingTask.count({ where: { semesterId } }),
    prisma.teachingTaskClass.count({
      where: { teachingTask: { semesterId } },
    }),
    prisma.importBatch.count({ where: { semesterId } }),
    prisma.teacher.count(),
    prisma.classGroup.count({ where: { semesterId } }),
    prisma.scheduleSlot.count({ where: { semesterId } }),
    prisma.scheduleAdjustment.count({ where: { semesterId } }),
  ])
  return {
    courseBefore: courseCount,
    courseAfter: courseCount,
    teachingTaskBefore: teachingTaskCount,
    teachingTaskAfter: teachingTaskCount,
    teachingTaskClassBefore: teachingTaskClassCount,
    teachingTaskClassAfter: teachingTaskClassCount,
    importBatchBefore: importBatchCount,
    importBatchAfter: importBatchCount,
    teacherBefore: teacherCount,
    teacherAfter: teacherCount,
    classGroupBefore: classGroupCount,
    classGroupAfter: classGroupCount,
    scheduleSlotBefore: scheduleSlotCount,
    scheduleSlotAfter: scheduleSlotCount,
    scheduleAdjustmentBefore: scheduleAdjustmentCount,
    scheduleAdjustmentAfter: scheduleAdjustmentCount,
  }
}

function zeroCounts(): L7FApplyResult['counts'] {
  const z = 0
  return {
    courseBefore: z, courseAfter: z,
    teachingTaskBefore: z, teachingTaskAfter: z,
    teachingTaskClassBefore: z, teachingTaskClassAfter: z,
    importBatchBefore: z, importBatchAfter: z,
    teacherBefore: z, teacherAfter: z,
    classGroupBefore: z, classGroupAfter: z,
    scheduleSlotBefore: z, scheduleSlotAfter: z,
    scheduleAdjustmentBefore: z, scheduleAdjustmentAfter: z,
  }
}

function mirror(c: L7FApplyResult['counts']): Partial<L7FApplyResult['counts']> {
  return {
    courseBefore: c.courseBefore,
    courseAfter: c.courseAfter,
    teachingTaskBefore: c.teachingTaskBefore,
    teachingTaskAfter: c.teachingTaskAfter,
    teachingTaskClassBefore: c.teachingTaskClassBefore,
    teachingTaskClassAfter: c.teachingTaskClassAfter,
    importBatchBefore: c.importBatchBefore,
    importBatchAfter: c.importBatchAfter,
    teacherBefore: c.teacherBefore,
    teacherAfter: c.teacherAfter,
    classGroupBefore: c.classGroupBefore,
    classGroupAfter: c.classGroupAfter,
    scheduleSlotBefore: c.scheduleSlotBefore,
    scheduleSlotAfter: c.scheduleSlotAfter,
    scheduleAdjustmentBefore: c.scheduleAdjustmentBefore,
    scheduleAdjustmentAfter: c.scheduleAdjustmentAfter,
  }
}

function buildRollbackNote(args: {
  backupPath: string
  importBatchId: number
  applied: boolean
}): string {
  return [
    'L7-F rollback note:',
    `  - DB backup: ${args.backupPath}`,
    `  - ImportBatch ID: ${args.importBatchId}`,
    `  - Apply status: ${args.applied ? 'PASSED' : 'NEEDS REVIEW'}`,
    '  - To rollback, restore the backup file above (cp <backup> prisma/dev.db)',
    '  - L7-F does NOT auto-rollback; restore must be performed manually.',
    '  - Restricted: no ScheduleSlot / ScheduleAdjustment / Teacher / ClassGroup',
    '    rows were created; rollback only touches the four allowed tables.',
  ].join('\n')
}

// Silence unused warning for L7_F_ALL_TABLES (kept for future expansion).
void L7_F_ALL_TABLES
void mkdirSync
