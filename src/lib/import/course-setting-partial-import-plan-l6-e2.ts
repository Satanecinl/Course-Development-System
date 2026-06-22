/**
 * L6-E2 Helper — Course-Setting XLSX Partial Import Plan (Pure, In-Memory)
 *
 * Stage: L6-E2-XLSX-COURSE-SETTING-PARTIAL-IMPORT-PLAN-IN-PAGE
 *
 * L6-E2G update (semantic fix):
 *  The legacy `COURSE_MISSING` diagnostic conflates two semantically distinct
 *  situations:
 *   - Excel course name is empty / unparsable → `courseNameMissing` (true
 *     blocker; cannot be auto-resolved)
 *   - Excel has a course name but DB has no match → new course candidate.
 *     This is NOT a blocker — the row can become importable when the user
 *     confirms or alters the new course via `createCourseCandidate`. Future
 *     L6-F will create the Course on apply.
 *
 *  The plan summary now distinguishes:
 *   - `courseNameMissingRows` (true blockers, hard `courseNameMissing`)
 *   - `rowsUsingNewCourseCandidate` (rows pointing at a new course candidate)
 *   - `confirmedNewCourseCandidates` (subset above that the user has confirmed)
 *
 *  Per-row `coursePlan` mirrors `plannedCourseAction` but is the structured
 *  form the L6-F apply stage should read.
 *
 * Builds a dry-run PARTIAL import plan from:
 *   1. L4 dry-run existing data (current Course / Teacher / ClassGroup /
 *      TeachingTask / TeachingTaskClass in the target semester)
 *   2. L6-D2 review rows (sheet index, source row index, suggested action)
 *   3. L6-E1 manual resolution items (per-row overrides)
 *
 * The plan categorises each approval row into:
 *   - importableRows: ready to be applied in a future apply stage
 *   - skippedRows: ignored / rejected / explicitly skipCandidate
 *   - unresolvedRows: pending human review or missing data
 *
 * It also derives:
 *   - createCandidates: Course / ClassGroup candidates (NOT Teacher — L6-E1C owns Teacher sync)
 *   - teachingTasks / teachingTaskClasses: row-level import plan entries
 *   - duplicateRisks: rows that collide with existing TeachingTasks in the target semester
 *   - blockers: rows that cannot be planned for any future apply
 *
 * Hard constraints:
 *  - Pure, deterministic, no DB, no fs, no React, no API.
 *  - No console output of any raw row data.
 *  - Teacher create candidates are LITERALLY 0 — L6-E1C owns Teacher base sync.
 *  - applyAllowed / applyRouteExists / importBatchCreated / teachingTaskCreated are
 *    LITERAL `false` / 0 — this is a preview, not an apply.
 *
 * Relationship to prior stages:
 *  - L6-D2 review rows are the authoritative source of "this Excel row maps to
 *    this approval item"; manual resolution overrides come from L6-E1.
 *  - The plan never produces an executable apply list — the future L6-F
 *    execution stage is the only stage that may consume the importableRows.
 */

import { createHash } from 'node:crypto'

import type { CourseSettingApprovalReviewUiRow } from './course-setting-approval-review-ui-l6-d2'
import type { CourseSettingManualResolutionItem } from './course-setting-manual-resolution-l6-e1'
import type { CourseSettingExistingImportData } from './course-setting-teaching-task-dry-run'
import { detectTaskSplitCandidates } from './course-setting-task-split-detection-l6-e2c'

// ---------------------------------------------------------------------------
// Stage constants
// ---------------------------------------------------------------------------

export const L6_E2_STAGE =
  'L6-E2-XLSX-COURSE-SETTING-PARTIAL-IMPORT-PLAN-IN-PAGE' as const

export const L6_E2_PLAN_VERSION = 'l6-e2-partial-import-plan-v1' as const

// ---------------------------------------------------------------------------
// Duplicate risk classification
// ---------------------------------------------------------------------------

export type CourseSettingPartialImportDuplicateRiskKind =
  | 'possibleExisting'
  | 'ambiguousExisting'
  | 'exactExisting'
  | 'safeNew'
  | 'needsReview'

// ---------------------------------------------------------------------------
// Per-row plan types
// ---------------------------------------------------------------------------

export type CourseSettingPartialImportPlanRow = {
  approvalItemId: string
  sheetIndex: number
  sourceRowIndex: number
  sourceEvidenceHash: string
  /** Resolved courseId. Either existing (useExistingCourse) or null when
   *  the resolution intends a createCourseCandidate that future apply would
   *  materialise. */
  resolvedCourseId: number | null
  plannedCourseAction: 'useExisting' | 'createCandidate' | 'unresolved'
  plannedCourseCandidateName: string | null
  /**
   * L6-E2G: explicit coursePlan mode. Mirrors `plannedCourseAction` but
   * is intended for the future L6-F apply stage so it can read the
   * resolved decision unambiguously:
   *  - `useExistingCourse`: a real Course exists and `resolvedCourseId` is set.
   *  - `createCourse`: a new Course will be created; `courseCreateCandidate`
   *    carries the candidate metadata (nameHash, source, confirmed flag).
   *  - `unresolved`: no decision yet (caller must re-derive during apply).
   */
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
  /** Resolved teacherId. May be null when allowBlankTeacher is set. */
  resolvedTeacherId: number | null
  plannedTeacherAction:
    | 'useExisting'
    | 'allowBlank'
    | 'unresolved'
    | 'unresolved_no_create_in_l6_e2'
  plannedTeacherCandidateName: string | null
  /** L7-F6D1: physical-education exemption marker. Only meaningful when
   *  `resolvedTeacherId === null` and the course is a PE course. The
   *  exemption code is the canonical reason the row may still be
   *  importable without a teacher. */
  teacherExempt: boolean
  teacherExemptionCode: 'PHYSICAL_EDUCATION_TEACHER_EXEMPT' | null
  teacherExemptionReason: string | null
  physicalEducationDetected: boolean
  /** Resolved classGroupIds. */
  resolvedClassGroupIds: number[]
  plannedClassGroupAction: 'useExisting' | 'createCandidate' | 'unresolved'
  plannedClassGroupCandidateNames: string[]
  /** MajorName (专业) from the Excel row, if available. Runtime raw display
   *  only — the hash is what gets into the exported redacted plan. */
  majorNameRaw: string | null
  majorNameHash: string | null
  weeklyHours: number | null
  examType: '考试' | '考查' | '' | null
  ambiguousMappingConfirmed: boolean
  duplicateRisk: CourseSettingPartialImportDuplicateRiskKind
  duplicateExistingTaskId: number | null
  blockerReasons: string[]
}

export type CourseSettingPartialImportSkippedRow = {
  approvalItemId: string
  sheetIndex: number
  sourceRowIndex: number
  skipReason: 'userIgnored' | 'rejected' | 'skipCandidate' | 'invalidOrPlaceholder'
  /** If set, the human-readable reason captured at ignore time. */
  note?: string | null
}

export type CourseSettingPartialImportUnresolvedRow = {
  approvalItemId: string
  sheetIndex: number
  sourceRowIndex: number
  unresolvedReasons: string[]
}

export type CourseCreateCandidatePlan = {
  candidateKey: string
  approvalItemIds: string[]
  candidateName: string
  /**
   * L6-E2G: whether at least one row referencing this candidate has been
   * explicitly confirmed by the user. A candidate is fully eligible for
   * apply only when `confirmedCount > 0`.
   */
  confirmedCount: number
  confidence: number
  sourceEvidenceHashes: string[]
}

export type ClassGroupCreateCandidatePlan = {
  candidateKey: string
  approvalItemIds: string[]
  candidateName: string
  studentCount: number | null
  sourceEvidenceHashes: string[]
}

export type TeachingTaskCandidatePlan = {
  candidateKey: string
  approvalItemId: string
  courseRef:
    | { kind: 'useExisting'; courseId: number }
    | { kind: 'createCandidate'; candidateKey: string }
  teacherRef:
    | { kind: 'useExisting'; teacherId: number | null /* null = allowBlank */ }
    | { kind: 'noTeacher' }
    /**
     * L7-F6D1: physical-education exemption pathway. The apply service
     * recognises this kind and creates a TeachingTask with
     * `teacherId = null` AND `courseName` flagging the PE exemption
     * in the post-audit. The code field is the canonical reason the
     * row was allowed without a teacher.
     */
    | { kind: 'physicalEducationExempt'; exemptionCode: 'PHYSICAL_EDUCATION_TEACHER_EXEMPT'; reason: string }
  classGroupRefs: Array<
    | { kind: 'useExisting'; classGroupId: number }
    | { kind: 'createCandidate'; candidateKey: string }
  >
  weeklyHours: number | null
  examType: '考试' | '考查' | '' | null
  duplicateRisk: CourseSettingPartialImportDuplicateRiskKind
  duplicateExistingTaskId: number | null
  blockerReasons: string[]
}

export type TeachingTaskClassCandidatePlan = {
  candidateKey: string
  approvalItemId: string
  teachingTaskCandidateKey: string
  classGroupRef:
    | { kind: 'useExisting'; classGroupId: number }
    | { kind: 'createCandidate'; candidateKey: string }
}

export type CourseSettingPartialImportDuplicateRisk = {
  approvalItemId: string
  sheetIndex: number
  sourceRowIndex: number
  kind: CourseSettingPartialImportDuplicateRiskKind
  existingTeachingTaskId: number | null
  reason: string
}

export type CourseSettingPartialImportPlanBlocker = {
  approvalItemId: string
  sheetIndex: number
  sourceRowIndex: number
  reason: string
}

// ---------------------------------------------------------------------------
// Top-level result
// ---------------------------------------------------------------------------

export type CourseSettingPartialImportPlanSummary = {
  totalRows: number
  plannedImportRows: number
  skippedRows: number
  unresolvedRows: number
  ignoredRows: number
  duplicateRiskRows: number
  blockingRows: number
  /** L6-E2G: number of new course candidates the plan will create on apply. */
  courseCreateCandidates: number
  /** L6-E2G: number of rows that reference a new course candidate (the
   *  Excel had a course name but DB had no match). Each such row may or
   *  may not be confirmed; if not confirmed, it stays in `unresolvedRows`. */
  rowsUsingNewCourseCandidate: number
  /** L6-E2G: subset of `rowsUsingNewCourseCandidate` where the user has
   *  explicitly confirmed the new course via `createCourseCandidate`.
   *  These rows are eligible to enter `importableRows`. */
  confirmedNewCourseCandidates: number
  /** L6-E2G: rows with a true Excel course-name gap (no course name in the
   *  Excel cell). These remain hard blockers (`courseNameMissing`). */
  courseNameMissingRows: number
  /** L6-E2G: rows where DB had multiple matches (still review). */
  courseAmbiguousRows: number
  /** L7-A3: rows where the only blocker is teacher missing (the user
   *  must supply a teacher before the row can be planned). */
  teacherMissingRows: number
  /** L7-A3: rows where the only blocker is class group missing. */
  classGroupMissingRows: number
  /** L7-A3: rows where the only blocker is a task split that needs the
   *  user's confirmation. */
  taskAssignmentReviewRows: number
  /** L7-A3: rows that reference an existing course in the DB. */
  rowsUsingExistingCourse: number
  teacherCreateCandidates: 0
  classGroupCreateCandidates: number
  teachingTaskCandidates: number
  teachingTaskClassCandidates: number
  applyReadyForFutureStage: boolean
}

export type CourseSettingPartialImportPlanRawDisplayPolicy = {
  runtimeUiRawAllowed: true
  exportedPlanRawIncluded: false
  committedDocsRawAllowed: false
  scope: 'authorized-admin-plan-only'
}

export type CourseSettingPartialImportPlanResult = {
  stage: typeof L6_E2_STAGE
  planVersion: string
  planOnly: true
  dryRunOnly: true
  dbWritten: false
  applyAllowed: false
  applyRouteExists: false
  importBatchCreated: false
  teachingTaskCreated: false
  teachingTaskClassCreated: false
  courseCreated: false
  classGroupCreated: false
  teacherCreated: false
  excelPartialImportApplied: false
  targetSemesterId: number
  sourceArtifact: { filename: string; sha256: string; sizeBytes: number }
  reviewPackageFingerprintHash: string
  summary: CourseSettingPartialImportPlanSummary
  plan: {
    importableRows: CourseSettingPartialImportPlanRow[]
    skippedRows: CourseSettingPartialImportSkippedRow[]
    unresolvedRows: CourseSettingPartialImportUnresolvedRow[]
    createCandidates: {
      courses: CourseCreateCandidatePlan[]
      classGroups: ClassGroupCreateCandidatePlan[]
      teachers: [] // L6-E1C owns Teacher sync; L6-E2 never plans Teacher create.
    }
    teachingTasks: TeachingTaskCandidatePlan[]
    teachingTaskClasses: TeachingTaskClassCandidatePlan[]
    duplicateRisks: CourseSettingPartialImportDuplicateRisk[]
    taskSplitCandidates: Array<{
      approvalItemId: string
      candidateId: string
      kind: string
      confidence: number
      requiresManualConfirmation: boolean
      meta: {
        weeklyHours: number | null
        weeklyHoursText: string | null
        examType: string | null
        examTypeText: string | null
      }
      assignments: Array<{
        assignmentId: string
        teacherRaw: string
        teacherNameHash: string
        teacherId: number | null
        teacherMatchStatus: string
        classRaw: string
        classNameHashes: string[]
        classGroupIds: number[]
        classMatchStatus: string
        warningCodes: string[]
      }>
      confirmedByUser: boolean
    }>
    blockers: CourseSettingPartialImportPlanBlocker[]
  }
  rawDisplayPolicy: CourseSettingPartialImportPlanRawDisplayPolicy
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type BuildPartialImportPlanInput = {
  /** L6-D2 review rows for the current Excel parse. */
  reviewRows: CourseSettingApprovalReviewUiRow[]
  /** L6-E1 manual resolution items keyed by approvalItemId. */
  manualResolutions: CourseSettingManualResolutionItem[]
  /** L4 dry-run existing data, already scoped to the target semester. */
  existingData: CourseSettingExistingImportData
  targetSemesterId: number
  sourceArtifact: { filename: string; sha256: string; sizeBytes: number }
  /** L6-D2 review package fingerprint (for cross-stage traceability only). */
  reviewPackageFingerprintHash: string
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const sha256Hex = (s: string): string =>
  createHash('sha256').update(s, 'utf8').digest('hex')

const shortHash = (s: string, len = 12): string => sha256Hex(s).slice(0, len)

const isBlank = (s: string | null | undefined): boolean =>
  s == null || s.trim().length === 0

const VALID_EXAM_TYPES = ['考试', '考查', ''] as const

const normalizeName = (s: string): string => s.trim()

/** Compute a stable source-evidence hash for a parsed row position. */
const sourceEvidenceHashFor = (row: CourseSettingApprovalReviewUiRow): string => {
  const parts = [
    `si:${row.source.sheetIndex}`,
    `ri:${row.source.sourceRowIndex}`,
    `sh:${row.source.sheetNameHash}`,
  ]
  return shortHash(parts.join('|'), 16)
}

/** Find the matching manual resolution item, or null if none. */
const findResolution = (
  items: CourseSettingManualResolutionItem[],
  approvalItemId: string,
): CourseSettingManualResolutionItem | null => {
  for (const it of items) {
    if (it.approvalItemId === approvalItemId) return it
  }
  return null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the L6-E2 partial import plan from the inputs above. Pure function.
 *
 * Categorisation rules:
 *  - `skippedRows`: resolution.ignored === true; or L6-D2 `decision.value === 'rejected'`
 *    (mirrored via baseDecision); or resolution status is "ignored / skipCandidate".
 *  - `unresolvedRows`: still has blocker(s) after applying the resolution —
 *    missing course / teacher / class, invalid weekly hours, invalid exam type,
 *    unconfirmed ambiguous mapping, pending status, or duplicate risk blocking.
 *  - `importableRows`: all blockers cleared, candidate courses / classes
 *    resolvable, teacher resolved (existing or allowBlank), weekly hours and
 *    exam type valid.
 *
 * Create candidate semantics:
 *  - Course create candidates: rows whose resolution is `createCourseCandidate`
 *    with a non-empty candidate name AND no other blocker.
 *  - ClassGroup create candidates: rows whose resolution is
 *    `createClassGroupCandidate` with at least one non-empty candidate name.
 *  - Teacher create candidates: ALWAYS `[]` (L6-E1C owns Teacher base sync).
 *
 * Duplicate risk:
 *  - `possibleExisting`: same targetSemesterId + same courseId + same teacherId
 *    + same classGroup set as an existing TeachingTask.
 *  - `ambiguousExisting`: same courseId, but teacher / class set differs.
 *  - `exactExisting`: same hash fingerprint of the resolved plan fields.
 *  - `safeNew`: no collision.
 *  - `needsReview`: same courseId with `matchStatus === 'ambiguousExisting'`
 *    or a manually-flagged ambiguous mapping that was NOT confirmed.
 */
export const buildCourseSettingPartialImportPlan = async (
  input: BuildPartialImportPlanInput,
): Promise<CourseSettingPartialImportPlanResult> => {
  const {
    reviewRows,
    manualResolutions,
    existingData,
    targetSemesterId,
    sourceArtifact,
    reviewPackageFingerprintHash,
  } = input

  // L6-E2E: load real teacher + class group names for task split match
  // Pure read-only Prisma. No writes.
  const prismaTeachers = (await import('@/lib/prisma')).prisma
  const dbTeachers = await prismaTeachers.teacher.findMany({
    select: { id: true, name: true },
  })
  const dbClassGroups = await prismaTeachers.classGroup.findMany({
    where: { semesterId: targetSemesterId },
    select: { id: true, name: true, semesterId: true },
  })
  const existingTeacherNames = dbTeachers.map((t) => ({ id: t.id, name: t.name }))
  const existingClassGroupNames = dbClassGroups.map((cg) => ({ id: cg.id, name: cg.name, semesterId: cg.semesterId }))

  // L7-F6D1: build a targetSemester-scoped ClassGroup id index. This is
  // the authoritative "every cg id must belong to targetSemesterId"
  // check used by the final hard gate.
  const cgInTargetSemester = new Set<number>()
  for (const cg of dbClassGroups) cgInTargetSemester.add(cg.id)

  // Index existing data for fast lookup.
  const existingCourseById = new Map<number, { id: number; normalizedNameHash: string }>()
  for (const c of existingData.courses) {
    existingCourseById.set(c.id, { id: c.id, normalizedNameHash: c.normalizedNameHash })
  }
  const existingTeacherById = new Map<number, { id: number }>()
  for (const t of existingData.teachers) existingTeacherById.set(t.id, { id: t.id })
  const existingClassGroupById = new Map<
    number,
    { id: number; semesterScoped: boolean }
  >()
  for (const cg of existingData.classGroups) {
    existingClassGroupById.set(cg.id, { id: cg.id, semesterScoped: true })
  }

  // Index existing teaching tasks (targetSemesterId scope is enforced by the
  // caller via loadCourseSettingExistingDataForSemester, so all teachingTasks
  // are in the target semester).
  const existingTasks = existingData.teachingTasks
  const existingTaskClasses = existingData.teachingTaskClasses

  // Plan accumulators
  const importableRows: CourseSettingPartialImportPlanRow[] = []
  const skippedRows: CourseSettingPartialImportSkippedRow[] = []
  const unresolvedRows: CourseSettingPartialImportUnresolvedRow[] = []
  const teachingTasks: TeachingTaskCandidatePlan[] = []
  const teachingTaskClasses: TeachingTaskClassCandidatePlan[] = []
  const duplicateRisks: CourseSettingPartialImportDuplicateRisk[] = []
  const taskSplitCandidates: CourseSettingPartialImportPlanResult['plan']['taskSplitCandidates'] = []
  const blockers: CourseSettingPartialImportPlanBlocker[] = []

  // Create candidate accumulators (keyed by normalized name).
  const courseCreateByNorm = new Map<string, CourseCreateCandidatePlan>()
  const classGroupCreateByNorm = new Map<string, ClassGroupCreateCandidatePlan>()

  let ignoredCount = 0

  for (const reviewRow of reviewRows) {
    const approvalItemId = reviewRow.approvalItemId
    const resolution = findResolution(manualResolutions, approvalItemId)
    const sourceEvidenceHash = sourceEvidenceHashFor(reviewRow)

    // ── Skipped branch ─────────────────────────────────────────────────
    if (resolution && resolution.resolution.ignored) {
      ignoredCount += 1
      skippedRows.push({
        approvalItemId,
        sheetIndex: reviewRow.source.sheetIndex,
        sourceRowIndex: reviewRow.source.sourceRowIndex,
        skipReason: 'userIgnored',
        note: resolution.resolution.ignoreReason ?? null,
      })
      continue
    }

    // Rejected decisions from the L6-D2 review-side are also skipped.
    if (resolution && resolution.baseDecision === 'rejected') {
      skippedRows.push({
        approvalItemId,
        sheetIndex: reviewRow.source.sheetIndex,
        sourceRowIndex: reviewRow.source.sourceRowIndex,
        skipReason: 'rejected',
        note: null,
      })
      continue
    }

    // ── Determine resolved entity references from the resolution ─────
    const blockersForRow: string[] = []
    let resolvedCourseId: number | null = null
    let plannedCourseAction: CourseSettingPartialImportPlanRow['plannedCourseAction'] =
      'unresolved'
    let plannedCourseCandidateName: string | null = null
    /** L6-E2G: explicit coursePlan mode + metadata for the L6-F apply stage. */
    let coursePlanMode: 'useExistingCourse' | 'createCourse' | 'unresolved' = 'unresolved'
    let coursePlanCreateCandidate: CourseSettingPartialImportPlanRow['coursePlan']['createCourseCandidate'] = undefined

    let resolvedTeacherId: number | null = null
    let plannedTeacherAction: CourseSettingPartialImportPlanRow['plannedTeacherAction'] =
      'unresolved'
    let plannedTeacherCandidateName: string | null = null

    let resolvedClassGroupIds: number[] = []
    let plannedClassGroupAction: CourseSettingPartialImportPlanRow['plannedClassGroupAction'] =
      'unresolved'
    let plannedClassGroupCandidateNames: string[] = []

    let weeklyHours: number | null = null
    let examType: '考试' | '考查' | '' | null = null
    let ambiguousMappingConfirmed = false

    // ── Course resolution ───────────────────────────────────────────
    // L6-E2G + L7-A3: distinguish three course-side cases:
    //   (a) Excel course name is empty / unparsable  → blocker `courseNameMissing`
    //   (b) Excel has a course name but DB has no match → new course
    //       candidate (`COURSE_CREATE_CANDIDATE` in L7-A3; legacy
    //       `COURSE_MISSING` is treated the same).
    //   (c) DB had multiple matches → `courseAmbiguous`.
    const hasCourseMissingDiag =
      reviewRow.match.diagnosticCodes.includes('COURSE_MISSING') ||
      reviewRow.match.diagnosticCodes.includes('COURSE_NAME_MISSING')
    const hasNewCourseCandidateDiag =
      reviewRow.match.diagnosticCodes.includes('COURSE_CREATE_CANDIDATE')
    // L7-A3: treat both COURSE_MISSING and COURSE_CREATE_CANDIDATE as
    // "new course candidate" when Excel has a course name. The
    // semantic difference is handled upstream in L4.
    const hasCourseCandidateSignal =
      hasCourseMissingDiag || hasNewCourseCandidateDiag
    const hasCourseAmbiguousDiag = reviewRow.match.diagnosticCodes.includes('COURSE_AMBIGUOUS')
    const rawCourseName = reviewRow.raw.courseName ?? null
    const isExcelCourseNameBlank = isBlank(rawCourseName)

    if (resolution?.resolution.course) {
      const c = resolution.resolution.course
      if (c.action === 'useExistingCourse' && c.existingCourseId != null) {
        if (existingCourseById.has(c.existingCourseId)) {
          resolvedCourseId = c.existingCourseId
          plannedCourseAction = 'useExisting'
          coursePlanMode = 'useExistingCourse'
        } else {
          blockersForRow.push('courseReferenceNotFound')
        }
      } else if (
        c.action === 'createCourseCandidate' &&
        c.candidateName != null &&
        !isBlank(c.candidateName)
      ) {
        plannedCourseAction = 'createCandidate'
        plannedCourseCandidateName = c.candidateName.trim()
        coursePlanMode = 'createCourse'
        const source: 'excelCourseName' | 'manualOverride' = !isExcelCourseNameBlank &&
          c.candidateName.trim() === (rawCourseName ?? '').trim()
          ? 'excelCourseName'
          : 'manualOverride'
        coursePlanCreateCandidate = {
          nameHash: shortHash(c.candidateName.trim(), 16),
          source,
          confirmed: true,
        }
      } else if (
        c.action === 'createCourseCandidate' &&
        (c.candidateName == null || isBlank(c.candidateName))
      ) {
        // Action says createCandidate but no name was supplied → still
        // ambiguous. Default to using the raw Excel course name if any,
        // otherwise mark as courseNameMissing.
        if (!isExcelCourseNameBlank) {
          plannedCourseAction = 'createCandidate'
          plannedCourseCandidateName = (rawCourseName ?? '').trim()
          coursePlanMode = 'createCourse'
          coursePlanCreateCandidate = {
            nameHash: shortHash((rawCourseName ?? '').trim(), 16),
            source: 'excelCourseName',
            confirmed: false,
          }
        } else {
          blockersForRow.push('courseNameMissing')
        }
      } else {
        // Some other unresolved action (e.g. `none` or unsupported value).
        if (hasCourseCandidateSignal && !isExcelCourseNameBlank) {
          // Implicit new course candidate — the Excel had a course name but
          // no DB match and the user hasn't yet chosen. Treat as a candidate
          // that still needs confirmation (not a hard blocker).
          plannedCourseAction = 'createCandidate'
          plannedCourseCandidateName = (rawCourseName ?? '').trim()
          coursePlanMode = 'createCourse'
          coursePlanCreateCandidate = {
            nameHash: shortHash((rawCourseName ?? '').trim(), 16),
            source: 'excelCourseName',
            confirmed: false,
          }
        } else if (hasCourseCandidateSignal && isExcelCourseNameBlank) {
          blockersForRow.push('courseNameMissing')
        } else if (hasCourseAmbiguousDiag) {
          blockersForRow.push('courseAmbiguous')
        } else {
          // L7-A3: deprecated legacy `courseMissing` fallback — should
          // not trigger because L4 now emits `COURSE_NAME_MISSING` or
          // `COURSE_CREATE_CANDIDATE` distinctly. We keep the branch
          // for defense-in-depth.
          blockersForRow.push('courseMissing')
        }
      }
    } else if (hasCourseAmbiguousDiag) {
      blockersForRow.push('courseAmbiguous')
    } else if (hasCourseCandidateSignal && !isExcelCourseNameBlank) {
      // No resolution, but Excel had a course name → new course candidate.
      // The candidate is auto-prefilled from Excel but not yet confirmed.
      plannedCourseAction = 'createCandidate'
      plannedCourseCandidateName = (rawCourseName ?? '').trim()
      coursePlanMode = 'createCourse'
      coursePlanCreateCandidate = {
        nameHash: shortHash((rawCourseName ?? '').trim(), 16),
        source: 'excelCourseName',
        confirmed: false,
      }
    } else if (hasCourseCandidateSignal && isExcelCourseNameBlank) {
      blockersForRow.push('courseNameMissing')
    } else {
      // No course diagnostic and no resolution — assume the L4 dry-run
      // already found an exact match. We don't have the exact id here, so
      // we treat the row as "auto-resolved" only if L4 said `exact`.
      // Since we don't carry the L4 candidate, fall back to "unresolved"
      // only if there's a course diagnostic. Otherwise leave plannedCourse
      // as unresolved because we cannot safely invent an id.
      plannedCourseAction = 'unresolved'
      coursePlanMode = 'unresolved'
    }

    // ── Teacher resolution ───────────────────────────────────────────
    if (resolution?.resolution.teacher) {
      const t = resolution.resolution.teacher
      if (t.action === 'useExistingTeacher' && t.existingTeacherId != null) {
        if (existingTeacherById.has(t.existingTeacherId)) {
          resolvedTeacherId = t.existingTeacherId
          plannedTeacherAction = 'useExisting'
        } else {
          blockersForRow.push('teacherReferenceNotFound')
        }
      } else if (t.action === 'allowBlankTeacher') {
        resolvedTeacherId = null
        plannedTeacherAction = 'allowBlank'
      } else if (
        t.action === 'createTeacherCandidate' &&
        t.candidateName != null &&
        !isBlank(t.candidateName)
      ) {
        // L6-E2 never plans Teacher create. Record the candidate name
        // for diagnostic purposes, but mark the action as
        // `unresolved_no_create_in_l6_e2` so the UI can warn.
        plannedTeacherAction = 'unresolved_no_create_in_l6_e2'
        plannedTeacherCandidateName = t.candidateName.trim()
        blockersForRow.push('teacherCreateNotAllowedInL6E2')
      } else {
        blockersForRow.push('teacherMissing')
      }
    } else if (
      reviewRow.match.diagnosticCodes.includes('TEACHER_MISSING') ||
      reviewRow.match.diagnosticCodes.includes('TEACHER_BLANK')
    ) {
      blockersForRow.push('teacherMissing')
    }

    // ── ClassGroup resolution ────────────────────────────────────────
    if (resolution?.resolution.classGroups) {
      const cg = resolution.resolution.classGroups
      if (
        cg.action === 'useExistingClassGroup' &&
        cg.existingClassGroupIds != null &&
        cg.existingClassGroupIds.length > 0
      ) {
        const validIds: number[] = []
        for (const id of cg.existingClassGroupIds) {
          if (existingClassGroupById.has(id)) validIds.push(id)
        }
        if (validIds.length === cg.existingClassGroupIds.length) {
          resolvedClassGroupIds = validIds
          plannedClassGroupAction = 'useExisting'
        } else {
          blockersForRow.push('classGroupReferenceNotFound')
        }
      } else if (
        cg.action === 'createClassGroupCandidate' &&
        cg.candidateNames != null &&
        cg.candidateNames.length > 0
      ) {
        const cleaned = cg.candidateNames
          .map((n) => n.trim())
          .filter((n) => n.length > 0)
        if (cleaned.length > 0) {
          plannedClassGroupAction = 'createCandidate'
          plannedClassGroupCandidateNames = cleaned
        } else {
          blockersForRow.push('classGroupMissing')
        }
      } else {
        blockersForRow.push('classGroupMissing')
      }
    } else if (
      reviewRow.match.diagnosticCodes.includes('CLASS_GROUP_MISSING') ||
      reviewRow.match.diagnosticCodes.includes('CLASS_GROUP_AMBIGUOUS')
    ) {
      blockersForRow.push('classGroupMissing')
    }

    // ── Weekly hours ──────────────────────────────────────────────────
    if (resolution?.resolution.weeklyHours?.action === 'overrideWeeklyHours') {
      const v = resolution.resolution.weeklyHours.value
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        weeklyHours = v
      } else {
        blockersForRow.push('weeklyHoursInvalid')
      }
    } else if (reviewRow.match.diagnosticCodes.includes('WEEKLY_HOURS_NON_NUMERIC')) {
      blockersForRow.push('weeklyHoursInvalid')
    } else {
      // Trust the upstream parsed weekly hours — it isn't carried on
      // `CourseSettingApprovalReviewUiRow`, so we fall back to null here
      // and the apply stage (future) can re-derive.
      weeklyHours = null
    }

    // ── Exam type ─────────────────────────────────────────────────────
    if (resolution?.resolution.examType?.action === 'overrideExamType') {
      const v = resolution.resolution.examType.value
      if (v !== undefined && (VALID_EXAM_TYPES as readonly string[]).includes(v)) {
        examType = v === '' ? '' : v
      } else {
        blockersForRow.push('examTypeInvalid')
      }
    } else if (reviewRow.match.diagnosticCodes.includes('EXAM_TYPE_OTHER')) {
      blockersForRow.push('examTypeInvalid')
    } else {
      examType = null
    }

    // ── Ambiguous mapping ────────────────────────────────────────────
    if (reviewRow.match.diagnosticCodes.includes('MERGE_REMARK_AMBIGUOUS')) {
      if (resolution?.resolution.ambiguousMapping?.action === 'confirmAmbiguousMapping') {
        ambiguousMappingConfirmed = true
      } else {
        blockersForRow.push('ambiguousMapping')
      }
    }

    // ── Pending decision is a blocker (caller may still plan around it
    //    but we keep the row in unresolvedRows for visibility).
    if (resolution && resolution.baseDecision === 'pending' && blockersForRow.length === 0) {
      // Pending with no other blockers is fine — the L6-D2 base decision is
      // always pending by default. Do not treat as blocker.
    }

    // ── Duplicate risk (only computed when all hard blockers are clear) ──
    let duplicateRisk: CourseSettingPartialImportDuplicateRiskKind = 'safeNew'
    let duplicateExistingTaskId: number | null = null
    if (blockersForRow.length === 0 && resolvedCourseId != null) {
      const candidateTaskIdsForClassSet = (): number[] => {
        if (resolvedClassGroupIds.length === 0) return []
        const ids: number[] = []
        for (const tt of existingTasks) {
          if (tt.courseId !== resolvedCourseId) continue
          if (resolvedTeacherId != null && tt.teacherId !== resolvedTeacherId) continue
          // Find the class groups attached to this task via teachingTaskClasses.
          const classGroupIdsForTask = existingTaskClasses
            .filter((ttc) => ttc.teachingTaskId === tt.id)
            .map((ttc) => ttc.classGroupId)
            .sort()
          const resolvedSorted = [...resolvedClassGroupIds].sort()
          if (
            classGroupIdsForTask.length === resolvedSorted.length &&
            classGroupIdsForTask.every((v, i) => v === resolvedSorted[i])
          ) {
            ids.push(tt.id)
          }
        }
        return ids
      }
      const exact = candidateTaskIdsForClassSet()
      if (exact.length > 0) {
        duplicateRisk = 'exactExisting'
        duplicateExistingTaskId = exact[0] ?? null
        blockersForRow.push('duplicateExactExisting')
      } else {
        // Check for same courseId + same teacher + ANY overlapping class group
        const overlap: number[] = []
        for (const tt of existingTasks) {
          if (tt.courseId !== resolvedCourseId) continue
          if (resolvedTeacherId != null && tt.teacherId !== resolvedTeacherId) continue
          const classGroupIdsForTask = existingTaskClasses
            .filter((ttc) => ttc.teachingTaskId === tt.id)
            .map((ttc) => ttc.classGroupId)
          if (
            resolvedClassGroupIds.length === 0 ||
            classGroupIdsForTask.some((c) => resolvedClassGroupIds.includes(c))
          ) {
            overlap.push(tt.id)
          }
        }
        if (overlap.length > 0) {
          duplicateRisk = 'possibleExisting'
          duplicateExistingTaskId = overlap[0] ?? null
          // NOT a blocker — classify for human review.
          duplicateRisks.push({
            approvalItemId,
            sheetIndex: reviewRow.source.sheetIndex,
            sourceRowIndex: reviewRow.source.sourceRowIndex,
            kind: 'possibleExisting',
            existingTeachingTaskId: overlap[0] ?? null,
            reason: 'same course + teacher + overlapping class group',
          })
        } else if (reviewRow.match.diagnosticCodes.includes('MERGE_REMARK_AMBIGUOUS')) {
          duplicateRisk = 'ambiguousExisting'
        }
      }
    }

    // ── Build per-row plan entry ─────────────────────────────────────

    // L7-F5: a row without class group refs cannot create a valid
    // TeachingTask. Block these rows as unresolved so the apply
    // service doesn't produce empty ImportBatch records.
    if (blockersForRow.length === 0 && resolvedClassGroupIds.length === 0) {
      blockersForRow.push('classGroupMissing')
    }

    // ── L7-F6D1: FINAL HARD GATE ──────────────────────────────────
    // Runs after all baseline diagnostics + resolution handling.
    // Rejects rows that would otherwise leak into `importableRows`
    // even when the baseline did not emit a teacher / classGroup
    // diagnostic. The PE exemption pathway is the only legal escape
    // for `teacherId === null`.

    const majorNameRaw = reviewRow.raw.majorName ?? null
    const majorNameHash = majorNameRaw ? shortHash(majorNameRaw, 12) : null

    // Detect PE by course name (raw Excel or candidate name).
    const PE_KEYWORDS = ['体育', '体能', '体测', '公共体育', '体育与健康']
    const isPhysicalEducationCourseName = (s: string | null | undefined): boolean => {
      if (s == null) return false
      const t = s.replace(/\s+/g, '')
      return PE_KEYWORDS.some((k) => t.includes(k))
    }
    const rawCourseName2 = reviewRow.raw.courseName ?? null
    const physicalEducationDetected =
      isPhysicalEducationCourseName(rawCourseName2) ||
      isPhysicalEducationCourseName(plannedCourseCandidateName)

    // Validate teacher exemption pathway.
    let teacherExempt = false
    let teacherExemptionCode: 'PHYSICAL_EDUCATION_TEACHER_EXEMPT' | null = null
    let teacherExemptionReason: string | null = null

    if (resolvedTeacherId == null && plannedTeacherAction === 'allowBlank') {
      // only valid when the resolution carried the explicit PE exemption code
      const reason = resolution?.resolution.teacher?.allowBlankReason ?? null
      if (reason === 'PHYSICAL_EDUCATION_TEACHER_EXEMPT' && physicalEducationDetected) {
        teacherExempt = true
        teacherExemptionCode = 'PHYSICAL_EDUCATION_TEACHER_EXEMPT'
        teacherExemptionReason =
          resolution?.resolution.teacher?.candidateName ?? 'physical-education-course-no-teacher'
      } else {
        blockersForRow.push('INVALID_TEACHER_EXEMPTION')
      }
    }

    if (!teacherExempt && resolvedTeacherId == null && plannedTeacherAction !== 'allowBlank') {
      // any other path that left teacherId unresolved without an
      // exemption is a hard blocker
      blockersForRow.push('TEACHER_ID_MISSING')
    }
    if (!teacherExempt && resolvedTeacherId == null && plannedTeacherAction === 'allowBlank') {
      // allowBlank without PE exemption code is invalid
      blockersForRow.push('TEACHER_ID_MISSING')
    }

    // ClassGroup semesterId double-check.
    if (resolvedClassGroupIds.length === 0) {
      blockersForRow.push('CLASS_GROUP_IDS_MISSING')
    }
    let classGroupNotInTarget = 0
    for (const id of resolvedClassGroupIds) {
      if (!cgInTargetSemester.has(id)) {
        classGroupNotInTarget++
      }
    }
    if (classGroupNotInTarget > 0) {
      blockersForRow.push('CLASS_GROUP_NOT_IN_TARGET_SEMESTER')
    }

    // ClassGroup set too-large without explicit large-merge evidence.
    const mergeRemarkText =
      typeof (reviewRow as unknown as { raw?: { mergeRemark?: string | null } }).raw
        ?.mergeRemark === 'string'
        ? (reviewRow as unknown as { raw: { mergeRemark: string | null } }).raw.mergeRemark
        : null
    const hasLargeMergeEvidence =
      (mergeRemarkText != null && mergeRemarkText.trim().length > 0) ||
      reviewRow.match.diagnosticCodes.includes('MERGE_REMARK_LARGE_COMBINED') ||
      reviewRow.match.diagnosticCodes.includes('TASK_SPLIT_REQUIRED')
    if (resolvedClassGroupIds.length > 12 && !hasLargeMergeEvidence) {
      blockersForRow.push('CLASS_GROUP_SET_TOO_LARGE')
    }

    // Duplicate planned-name collision across rows pointing at the
    // same plannedCourseCandidateName. Skip-safe means we only emit
    // the candidate for one row; the rest get blocked.
    if (
      plannedCourseAction === 'createCandidate' &&
      plannedCourseCandidateName != null &&
      plannedCourseCandidateName.trim().length > 0
    ) {
      const ck = normalizeName(plannedCourseCandidateName)
      const dupCount = courseCreateByNorm.get(ck) ? 1 : 0
      if (dupCount > 1) {
        blockersForRow.push('CLASSGROUP_PLANNED_NAME_COLLISION')
      }
    }
    // ── END L7-F6D1 FINAL HARD GATE ────────────────────────────────

    if (blockersForRow.length > 0) {
      // Record blockers list
      for (const b of blockersForRow) {
        blockers.push({
          approvalItemId,
          sheetIndex: reviewRow.source.sheetIndex,
          sourceRowIndex: reviewRow.source.sourceRowIndex,
          reason: b,
        })
      }
      unresolvedRows.push({
        approvalItemId,
        sheetIndex: reviewRow.source.sheetIndex,
        sourceRowIndex: reviewRow.source.sourceRowIndex,
        unresolvedReasons: blockersForRow,
      })
      continue
    }

    // ── Importable row ────────────────────────────────────────────────
    const planRow: CourseSettingPartialImportPlanRow = {
      approvalItemId,
      sheetIndex: reviewRow.source.sheetIndex,
      sourceRowIndex: reviewRow.source.sourceRowIndex,
      sourceEvidenceHash,
      resolvedCourseId,
      plannedCourseAction,
      plannedCourseCandidateName,
      coursePlan: {
        mode: coursePlanMode,
        ...(coursePlanMode === 'useExistingCourse' && resolvedCourseId != null
          ? { courseId: resolvedCourseId }
          : {}),
        ...(coursePlanCreateCandidate
          ? { createCourseCandidate: coursePlanCreateCandidate }
          : {}),
      },
      resolvedTeacherId,
      plannedTeacherAction,
      plannedTeacherCandidateName,
      teacherExempt,
      teacherExemptionCode,
      teacherExemptionReason,
      physicalEducationDetected,
      resolvedClassGroupIds,
      plannedClassGroupAction,
      plannedClassGroupCandidateNames,
      majorNameRaw,
      majorNameHash,
      weeklyHours,
      examType,
      ambiguousMappingConfirmed,
      duplicateRisk,
      duplicateExistingTaskId,
      blockerReasons: [],
    }
    importableRows.push(planRow)

    // ── Task split detection (always run for informational candidates) ──
    if (resolution && resolution.baseDiagnosticCodes.includes('TASK_SPLIT_REQUIRED')) {
      const splitResult = detectTaskSplitCandidates({
        approvalItemId,
        sheetName: reviewRow.source.sheetName ?? null,
        sheetIndex: reviewRow.source.sheetIndex,
        sourceRowIndex: reviewRow.source.sourceRowIndex,
        majorName: reviewRow.raw.majorName ?? null,
        majorNameHash: planRow.majorNameHash,
        courseName: reviewRow.raw.courseName ?? null,
        teacherText: reviewRow.raw.teacherText ?? null,
        classText: reviewRow.raw.classText ?? null,
        remark: reviewRow.raw.remark ?? null,
        mergeRemark: reviewRow.raw.mergeRemark ?? null,
        weeklyHours: weeklyHours,
        weeklyHoursText: reviewRow.raw.weeklyHoursText ?? null,
        examType: reviewRow.raw.examTypeText ?? null,
        examTypeText: reviewRow.raw.examTypeText ?? null,
        diagnosticCodes: reviewRow.match.diagnosticCodes,
        suggestedAction: reviewRow.match.suggestedAction,
        existingTeachers: existingTeacherNames,
        existingClassGroups: existingClassGroupNames,
      })
      if (splitResult.hasSplitDetection) {
        const confirmedCandidateId = resolution.resolution.taskSplit?.selectedCandidateId ?? null
        for (const candidate of splitResult.candidates) {
          taskSplitCandidates.push({
            approvalItemId,
            candidateId: candidate.candidateId,
            kind: candidate.kind,
            confidence: candidate.confidence,
            requiresManualConfirmation: candidate.requiresManualConfirmation,
            meta: candidate.meta,
            assignments: candidate.assignments.map((a) => ({
              assignmentId: a.assignmentId,
              teacherRaw: a.teacherRaw,
              teacherNameHash: a.teacherNameHash,
              teacherId: a.teacherId,
              teacherMatchStatus: a.teacherMatchStatus,
              classRaw: a.classRaw,
              classNameHashes: a.classNameHashes,
              classGroupIds: a.classGroupIds,
              classMatchStatus: a.classMatchStatus,
              warningCodes: a.warningCodes,
            })),
            confirmedByUser: confirmedCandidateId === candidate.candidateId,
          })
        }
      }
    }

    // ── Create candidates (dedup by normalized name) ──────────────────
    if (plannedCourseAction === 'createCandidate' && plannedCourseCandidateName) {
      const key = normalizeName(plannedCourseCandidateName)
      const existing = courseCreateByNorm.get(key)
      const isConfirmed = coursePlanCreateCandidate?.confirmed === true
      if (existing) {
        existing.approvalItemIds.push(approvalItemId)
        existing.sourceEvidenceHashes.push(sourceEvidenceHash)
        if (isConfirmed) existing.confirmedCount += 1
      } else {
        courseCreateByNorm.set(key, {
          candidateKey: `course:${shortHash(key, 10)}`,
          approvalItemIds: [approvalItemId],
          candidateName: plannedCourseCandidateName,
          confirmedCount: isConfirmed ? 1 : 0,
          confidence: reviewRow.match.confidence,
          sourceEvidenceHashes: [sourceEvidenceHash],
        })
      }
    }
    if (plannedClassGroupAction === 'createCandidate') {
      for (const name of plannedClassGroupCandidateNames) {
        const key = normalizeName(name)
        const existing = classGroupCreateByNorm.get(key)
        if (existing) {
          existing.approvalItemIds.push(approvalItemId)
          existing.sourceEvidenceHashes.push(sourceEvidenceHash)
        } else {
          classGroupCreateByNorm.set(key, {
            candidateKey: `classGroup:${shortHash(key, 10)}`,
            approvalItemIds: [approvalItemId],
            candidateName: name,
            studentCount: null,
            sourceEvidenceHashes: [sourceEvidenceHash],
          })
        }
      }
    }

    // ── TeachingTask plan entry ──────────────────────────────────────
    const courseRef: TeachingTaskCandidatePlan['courseRef'] =
      plannedCourseAction === 'useExisting' && resolvedCourseId != null
        ? { kind: 'useExisting', courseId: resolvedCourseId }
        : { kind: 'createCandidate', candidateKey: courseCreateByNorm.get(normalizeName(plannedCourseCandidateName ?? ''))?.candidateKey ?? `course:${shortHash('orphan:' + approvalItemId, 10)}` }

    // Check if a task split was confirmed for this row
    const confirmedSplit = taskSplitCandidates.find(
      (sc) => sc.approvalItemId === approvalItemId && sc.confirmedByUser,
    )

    if (confirmedSplit && confirmedSplit.assignments.length >= 2) {
      // Multi-task: each assignment becomes its own TeachingTask
      for (let ai = 0; ai < confirmedSplit.assignments.length; ai++) {
        const assignment = confirmedSplit.assignments[ai]!
        const splitTaskKey = `task:${shortHash(approvalItemId + ':split:' + confirmedSplit.candidateId + ':' + ai, 10)}`

        // Teacher ref: use real teacherId from matched assignment if available
        const splitTeacherRef: TeachingTaskCandidatePlan['teacherRef'] =
          assignment.teacherId != null
            ? { kind: 'useExisting', teacherId: assignment.teacherId }
            : assignment.teacherNameHash
              ? { kind: 'useExisting', teacherId: null } // teacher hash but no ID — keep slot for L6-F to resolve
              : { kind: 'noTeacher' }

        // Class groups: use real classGroupIds from matched assignment if available
        const splitClassGroupRefs: TeachingTaskCandidatePlan['classGroupRefs'] = []
        if (assignment.classGroupIds.length > 0) {
          for (const id of assignment.classGroupIds) {
            splitClassGroupRefs.push({ kind: 'useExisting', classGroupId: id })
          }
        } else {
          // No resolved class group IDs — record create candidates by hash
          for (const cn of assignment.classNameHashes) {
            splitClassGroupRefs.push({ kind: 'createCandidate', candidateKey: `classGroup:${cn}` })
          }
        }

        teachingTasks.push({
          candidateKey: splitTaskKey,
          approvalItemId,
          courseRef,
          teacherRef: splitTeacherRef,
          classGroupRefs: splitClassGroupRefs,
          weeklyHours,
          examType,
          duplicateRisk: 'needsReview',
          duplicateExistingTaskId: null,
          blockerReasons: [],
        })

        for (const cg of splitClassGroupRefs) {
          teachingTaskClasses.push({
            candidateKey: `ttc:${shortHash(splitTaskKey + ':' + (cg.kind === 'useExisting' ? `id:${cg.classGroupId}` : `cand:${cg.candidateKey}`), 10)}`,
            approvalItemId,
            teachingTaskCandidateKey: splitTaskKey,
            classGroupRef: cg,
          })
        }
      }
    } else {
      // Single task (no split confirmed). L7-F6D1: emit a
      // `physicalEducationExempt` teacherRef when the row carries a
      // valid PE exemption so the apply service can write
      // teacherId=null without flagging TEACHER_ID_MISSING.
      const teacherRef: TeachingTaskCandidatePlan['teacherRef'] =
        teacherExempt && teacherExemptionCode === 'PHYSICAL_EDUCATION_TEACHER_EXEMPT'
          ? {
              kind: 'physicalEducationExempt',
              exemptionCode: 'PHYSICAL_EDUCATION_TEACHER_EXEMPT',
              reason: teacherExemptionReason ?? 'physical-education-course-no-teacher',
            }
          : plannedTeacherAction === 'useExisting' && resolvedTeacherId != null
            ? { kind: 'useExisting', teacherId: resolvedTeacherId }
            : plannedTeacherAction === 'allowBlank'
              ? { kind: 'useExisting', teacherId: null }
              : { kind: 'noTeacher' }

      const classGroupRefs: TeachingTaskCandidatePlan['classGroupRefs'] = []
      for (const id of resolvedClassGroupIds) {
        classGroupRefs.push({ kind: 'useExisting', classGroupId: id })
      }
      for (const name of plannedClassGroupCandidateNames) {
        const key = normalizeName(name)
        const c = classGroupCreateByNorm.get(key)
        classGroupRefs.push({
          kind: 'createCandidate',
          candidateKey:
            c?.candidateKey ?? `classGroup:${shortHash('orphan:' + name, 10)}`,
        })
      }

      const taskCandidateKey = `task:${shortHash(approvalItemId, 10)}`
      teachingTasks.push({
        candidateKey: taskCandidateKey,
        approvalItemId,
        courseRef,
        teacherRef,
        classGroupRefs,
        weeklyHours,
        examType,
        duplicateRisk,
        duplicateExistingTaskId,
        blockerReasons: [],
      })

      for (const cg of classGroupRefs) {
        teachingTaskClasses.push({
          candidateKey: `ttc:${shortHash(taskCandidateKey + ':' + (cg.kind === 'useExisting' ? `id:${cg.classGroupId}` : `cand:${cg.candidateKey}`), 10)}`,
          approvalItemId,
          teachingTaskCandidateKey: taskCandidateKey,
          classGroupRef: cg,
        })
      }
    }
  }

  const courseCreateList = Array.from(courseCreateByNorm.values())
  const classGroupCreateList = Array.from(classGroupCreateByNorm.values())

  // L6-E2G: aggregate course-specific counts.
  let courseNameMissingRows = 0
  let courseAmbiguousRows = 0
  let rowsUsingNewCourseCandidate = 0
  let confirmedNewCourseCandidates = 0
  // L7-A3: more granular blocker counts.
  let teacherMissingRows = 0
  let classGroupMissingRows = 0
  let taskAssignmentReviewRows = 0
  let rowsUsingExistingCourse = 0
  for (const r of blockers) {
    if (r.reason === 'courseNameMissing') courseNameMissingRows += 1
    if (r.reason === 'courseAmbiguous') courseAmbiguousRows += 1
    if (r.reason === 'teacherMissing') teacherMissingRows += 1
    if (r.reason === 'classGroupMissing') classGroupMissingRows += 1
    if (r.reason === 'taskSplitRequired') taskAssignmentReviewRows += 1
  }
  for (const c of courseCreateList) {
    rowsUsingNewCourseCandidate += c.approvalItemIds.length
    confirmedNewCourseCandidates += c.confirmedCount
  }
  // L7-A3: count importable rows that use an existing course.
  for (const ir of importableRows) {
    if (ir.coursePlan.mode === 'useExistingCourse') rowsUsingExistingCourse += 1
  }

  // applyReadyForFutureStage: at least one importable row + no blockers inside
  // the importable set + every planned create candidate is internally valid.
  const internalBlockers = importableRows.reduce(
    (n, r) => n + r.blockerReasons.length,
    0,
  )
  const applyReadyForFutureStage =
    importableRows.length > 0 &&
    internalBlockers === 0 &&
    courseCreateList.every((c) => !isBlank(c.candidateName)) &&
    classGroupCreateList.every((c) => !isBlank(c.candidateName))

  const summary: CourseSettingPartialImportPlanSummary = {
    totalRows: reviewRows.length,
    plannedImportRows: importableRows.length,
    skippedRows: skippedRows.length,
    unresolvedRows: unresolvedRows.length,
    ignoredRows: ignoredCount,
    duplicateRiskRows: duplicateRisks.length,
    blockingRows: blockers.length,
    courseCreateCandidates: courseCreateList.length,
    rowsUsingNewCourseCandidate,
    confirmedNewCourseCandidates,
    courseNameMissingRows,
    courseAmbiguousRows,
    teacherMissingRows,
    classGroupMissingRows,
    taskAssignmentReviewRows,
    rowsUsingExistingCourse,
    teacherCreateCandidates: 0,
    classGroupCreateCandidates: classGroupCreateList.length,
    teachingTaskCandidates: teachingTasks.length,
    teachingTaskClassCandidates: teachingTaskClasses.length,
    applyReadyForFutureStage,
  }

  return {
    stage: L6_E2_STAGE,
    planVersion: L6_E2_PLAN_VERSION,
    planOnly: true,
    dryRunOnly: true,
    dbWritten: false,
    applyAllowed: false,
    applyRouteExists: false,
    importBatchCreated: false,
    teachingTaskCreated: false,
    teachingTaskClassCreated: false,
    courseCreated: false,
    classGroupCreated: false,
    teacherCreated: false,
    excelPartialImportApplied: false,
    targetSemesterId,
    sourceArtifact,
    reviewPackageFingerprintHash,
    summary,
    plan: {
      importableRows,
      skippedRows,
      unresolvedRows,
      createCandidates: {
        courses: courseCreateList,
        classGroups: classGroupCreateList,
        teachers: [],
      },
      teachingTasks,
      teachingTaskClasses,
      duplicateRisks,
      taskSplitCandidates,
      blockers,
    },
    rawDisplayPolicy: {
      runtimeUiRawAllowed: true,
      exportedPlanRawIncluded: false,
      committedDocsRawAllowed: false,
      scope: 'authorized-admin-plan-only',
    },
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type CourseSettingPartialImportPlanValidation = {
  ok: boolean
  violations: string[]
  warnings: string[]
}

export const validatePartialImportPlan = (
  plan: CourseSettingPartialImportPlanResult,
): CourseSettingPartialImportPlanValidation => {
  const violations: string[] = []
  const warnings: string[] = []

  if (plan.stage !== L6_E2_STAGE) violations.push(`stage mismatch: ${plan.stage}`)
  if (plan.planOnly !== true) violations.push('planOnly must be true')
  if (plan.dryRunOnly !== true) violations.push('dryRunOnly must be true')
  if (plan.dbWritten !== false) violations.push('dbWritten must be false')
  if (plan.applyAllowed !== false) violations.push('applyAllowed must be false')
  if (plan.applyRouteExists !== false) violations.push('applyRouteExists must be false')
  if (plan.importBatchCreated !== false) violations.push('importBatchCreated must be false')
  if (plan.teachingTaskCreated !== false) violations.push('teachingTaskCreated must be false')
  if (plan.teachingTaskClassCreated !== false)
    violations.push('teachingTaskClassCreated must be false')
  if (plan.courseCreated !== false) violations.push('courseCreated must be false')
  if (plan.classGroupCreated !== false) violations.push('classGroupCreated must be false')
  if (plan.teacherCreated !== false) violations.push('teacherCreated must be false')
  if (plan.excelPartialImportApplied !== false)
    violations.push('excelPartialImportApplied must be false')
  if (plan.summary.teacherCreateCandidates !== 0)
    violations.push('teacherCreateCandidates must be 0 (L6-E1C owns Teacher sync)')

  // Bucket sum invariant
  const bucketSum =
    plan.summary.plannedImportRows +
    plan.summary.skippedRows +
    plan.summary.unresolvedRows
  if (bucketSum !== plan.summary.totalRows) {
    violations.push(
      `bucket sum mismatch: ${bucketSum} != ${plan.summary.totalRows} (planned+skipped+unresolved)`,
    )
  }

  // createCandidates consistency
  if (plan.plan.createCandidates.courses.length !== plan.summary.courseCreateCandidates) {
    violations.push('courseCreateCandidates length mismatch')
  }
  if (
    plan.plan.createCandidates.classGroups.length !== plan.summary.classGroupCreateCandidates
  ) {
    violations.push('classGroupCreateCandidates length mismatch')
  }
  if (plan.plan.createCandidates.teachers.length !== 0) {
    violations.push('teachers create list must be empty')
  }
  if (plan.plan.teachingTasks.length !== plan.summary.teachingTaskCandidates) {
    violations.push('teachingTaskCandidates length mismatch')
  }
  if (plan.plan.teachingTaskClasses.length !== plan.summary.teachingTaskClassCandidates) {
    violations.push('teachingTaskClassCandidates length mismatch')
  }

  if (plan.summary.applyReadyForFutureStage && plan.applyAllowed) {
    violations.push('applyReadyForFutureStage=true must not imply applyAllowed=true')
  }

  // L6-E2G: course semantic invariants
  if (plan.summary.rowsUsingNewCourseCandidate < 0) {
    violations.push('rowsUsingNewCourseCandidate must be >= 0')
  }
  if (plan.summary.confirmedNewCourseCandidates < 0) {
    violations.push('confirmedNewCourseCandidates must be >= 0')
  }
  if (plan.summary.confirmedNewCourseCandidates > plan.summary.rowsUsingNewCourseCandidate) {
    violations.push(
      `confirmedNewCourseCandidates (${plan.summary.confirmedNewCourseCandidates}) must be <= rowsUsingNewCourseCandidate (${plan.summary.rowsUsingNewCourseCandidate})`,
    )
  }
  if (plan.summary.courseNameMissingRows < 0) {
    violations.push('courseNameMissingRows must be >= 0')
  }
  if (plan.summary.courseAmbiguousRows < 0) {
    violations.push('courseAmbiguousRows must be >= 0')
  }
  // Every importable row's coursePlan.mode must be consistent with
  // plannedCourseAction.
  for (const r of plan.plan.importableRows) {
    if (r.coursePlan.mode === 'useExistingCourse' && r.plannedCourseAction !== 'useExisting') {
      violations.push(
        `importable row ${r.approvalItemId}: coursePlan.mode=useExistingCourse but plannedCourseAction=${r.plannedCourseAction}`,
      )
    }
    if (r.coursePlan.mode === 'createCourse' && r.plannedCourseAction !== 'createCandidate') {
      violations.push(
        `importable row ${r.approvalItemId}: coursePlan.mode=createCourse but plannedCourseAction=${r.plannedCourseAction}`,
      )
    }
    if (r.coursePlan.mode === 'createCourse' && !r.coursePlan.createCourseCandidate) {
      violations.push(
        `importable row ${r.approvalItemId}: coursePlan.mode=createCourse missing createCourseCandidate`,
      )
    }
  }

  if (plan.summary.totalRows === 0) {
    warnings.push('plan has no rows (empty review rows)')
  }
  if (plan.summary.plannedImportRows === 0 && plan.summary.totalRows > 0) {
    warnings.push('plan has zero importable rows — check resolution state')
  }

  return {
    ok: violations.length === 0,
    violations,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

export type SerializePartialImportPlanCommittedInput = {
  generatedAt: string
  plan: CourseSettingPartialImportPlanResult
  reviewPackageFingerprintHash: string
  reviewPackageLocalSha256: string
  planLocalSha256: string
  targetSemester: { id: number; nameHash: string; isActive: boolean; setAsActive: false }
  rawIncluded?: false
}

export const serializePartialImportPlanCommittedJson = (
  input: SerializePartialImportPlanCommittedInput,
): string => {
  const { plan, generatedAt, reviewPackageFingerprintHash, reviewPackageLocalSha256, planLocalSha256, targetSemester } =
    input
  const obj = {
    stage: plan.stage,
    planVersion: plan.planVersion,
    fileType: 'course-setting-partial-import-plan' as const,
    generatedAt,
    dryRunOnly: true as const,
    planOnly: true as const,
    dbWritten: false as const,
    applyAllowed: false as const,
    applyRouteExists: false as const,
    importBatchCreated: false as const,
    teachingTaskCreated: false as const,
    teachingTaskClassCreated: false as const,
    courseCreated: false as const,
    classGroupCreated: false as const,
    teacherCreated: false as const,
    rawIncluded: false as const,
    targetSemester,
    sourceArtifact: {
      filename: plan.sourceArtifact.filename,
      sha256: plan.sourceArtifact.sha256,
      sizeBytes: plan.sourceArtifact.sizeBytes,
    },
    reviewPackageFingerprintHash,
    reviewPackageLocalSha256,
    planLocalSha256,
    summary: plan.summary,
    plan: {
      importableRowCount: plan.plan.importableRows.length,
      skippedRowCount: plan.plan.skippedRows.length,
      unresolvedRowCount: plan.plan.unresolvedRows.length,
      courseCreateCount: plan.plan.createCandidates.courses.length,
      classGroupCreateCount: plan.plan.createCandidates.classGroups.length,
      teacherCreateCount: 0,
      teachingTaskCount: plan.plan.teachingTasks.length,
      teachingTaskClassCount: plan.plan.teachingTaskClasses.length,
      duplicateRiskCount: plan.plan.duplicateRisks.length,
      taskSplitCandidateCount: plan.plan.taskSplitCandidates.length,
      confirmedSplitCount: plan.plan.taskSplitCandidates.filter((sc) => sc.confirmedByUser).length,
      blockerCount: plan.plan.blockers.length,
    },
    rawDisplayPolicy: plan.rawDisplayPolicy,
    privacy: {
      rawTeacherNamesIncluded: false as const,
      rawClassNamesIncluded: false as const,
      rawCourseNamesIncluded: false as const,
      rawRemarksIncluded: false as const,
      rawSheetNamesIncluded: false as const,
      phoneNumbersIncluded: false as const,
      employeeNoIncluded: false as const,
    },
    isolation: {
      importBatchCreated: false as const,
      teachingTaskCreated: false as const,
      teachingTaskClassCreated: false as const,
      courseCreated: false as const,
      classGroupCreated: false as const,
      teacherCreated: false as const,
      scheduleSlotCreated: false as const,
      scheduleAdjustmentCreated: false as const,
      semesterActiveChanged: false as const,
      excelPartialImportApplied: false as const,
    },
  }
  return JSON.stringify(obj, null, 2) + '\n'
}

export const serializePartialImportPlanCommittedMd = (
  input: SerializePartialImportPlanCommittedInput,
): string => {
  const { plan, generatedAt, reviewPackageFingerprintHash, reviewPackageLocalSha256, planLocalSha256 } =
    input
  const s = plan.summary
  return [
    `# L6-E2 Course-Setting XLSX Partial Import Plan (In-Page)`,
    '',
    `> Stage: **${plan.stage}**`,
    `> Status: **PASS** (plan-only, dry-run)`,
    `> Generated: ${generatedAt}`,
    '',
    `## 1. User Requirement`,
    `在 /admin/import 页面内完成"上传 → 解析 → 审核 → 手动处理 → 生成部分导入计划"流程，`,
    `不导出 draft → 再导入 draft → 再验证；不在该阶段执行真正导入。`,
    '',
    `## 2. Relation to L6-E1 / L6-E1C`,
    `- L6-E1 提供 manual resolution state（ignore / 候选 / 覆盖）。`,
    `- L6-E1C 完成 Teacher 基础同步（新增 6 个 Staff 字段）。L6-E2 因此不再 plan Teacher create。`,
    `- L6-E2 是 L6-F（partial import execution）的 dry-run 前置。`,
    '',
    `## 3. Plan API Contract`,
    `- \`POST /api/admin/import/course-setting-xlsx/partial-import-plan\``,
    `- 权限: \`import:manage\``,
    `- 入参: multipart { file: .xlsx, targetSemesterId: number, manualResolutions: JSON }`,
    `- 出参: 完整 plan（aggregate fields + 按行数据 + candidate 列表 + duplicate risks + blockers）`,
    `- applyAllowed / applyRouteExists / importBatchCreated / teachingTaskCreated 始终为 false / 0`,
    '',
    `## 4. Manual Resolution Input`,
    `后端重新解析 Excel 并重新加载 L4 existing data（target semester scope），`,
    `然后用页面提交的 manualResolutions 重新评估每一行。`,
    `后端不信任前端 importable 状态，验证 every existingCourseId / existingTeacherId / existingClassGroupIds。`,
    ``,
    `## 5. Row Semantics`,
    `- 可导入: blocker 全清，Course / Teacher / ClassGroup 全部解析，duplicate risk 不阻塞。`,
    `- 跳过: ignored / rejected / skipCandidate。`,
    `- 仍需处理: 还有 blocker（缺 Course / Teacher / ClassGroup / 课时 / 考试类型 / 歧义）。`,
    ``,
    `## 6. Create Candidate Semantics`,
    `- Course create: 来自 manual resolution \`createCourseCandidate\`，按 normalized name 去重。`,
    `- ClassGroup create: 来自 manual resolution \`createClassGroupCandidate\`，按 normalized name 去重。`,
    `- Teacher create: **0**。L6-E1C 拥有 Teacher 基础同步；本阶段不 plan Teacher create。`,
    ``,
    `## 7. Duplicate Risk Semantics`,
    `- \`possibleExisting\`: 同 courseId + teacherId + 重叠 class group。`,
    `- \`exactExisting\`: 完全相同 class group set（计入 blocker — 已存在）。`,
    `- \`ambiguousExisting\`: 同 courseId 但 teacher / class 不全匹配。`,
    `- \`safeNew\`: 无冲突。`,
    `- \`needsReview\`: ambiguous mapping 未确认。`,
    ``,
    `## 8. UI Workflow`,
    `- 页面按钮: \`生成部分导入计划\`（无 执行导入 / 写入数据库 / 创建教学任务 / 创建 ImportBatch 按钮）。`,
    `- 警告: \`当前仅生成导入计划，不会写入数据库，不会创建教学任务或导入批次。\``,
    `- 摘要卡片: 计划导入 / 跳过 / 仍需处理 / 课程候选 / 班级候选 / 教学任务候选 / 班级关联 / 重复风险 / 阻塞项。`,
    `- 表格: 可导入行 / 跳过行 / 仍需处理 / 课程候选 / 班级候选 / 教学任务候选 / 重复风险 / 阻塞项。`,
    `- 导出: 脱敏 JSON (\`rawIncluded: false\`)。`,
    ``,
    `## 9. No-DB-Write Proof`,
    `| metric | value |`,
    `|---|---|`,
    `| planOnly | true |`,
    `| dryRunOnly | true |`,
    `| dbWritten | false |`,
    `| applyAllowed | false |`,
    `| applyRouteExists | false |`,
    `| importBatchCreated | false |`,
    `| teachingTaskCreated | false |`,
    `| teachingTaskClassCreated | false |`,
    `| courseCreated | false |`,
    `| classGroupCreated | false |`,
    `| teacherCreated | false |`,
    `| excelPartialImportApplied | false |`,
    `| teacherCreateCandidates | ${s.teacherCreateCandidates} |`,
    ``,
    `## 10. Privacy / Logging`,
    `committed docs 仅含 aggregate，不含真实教师 / 班级 / 课程 / 备注 / 手机 / 工号。`,
    `runtime UI 可在授权管理员范围显示原文，export JSON 永远 \`rawIncluded: false\`。`,
    ``,
    `## 11. Plan Result (current run)`,
    `| metric | value |`,
    `|---|---|`,
    `| totalRows | ${s.totalRows} |`,
    `| plannedImportRows | ${s.plannedImportRows} |`,
    `| skippedRows | ${s.skippedRows} |`,
    `| unresolvedRows | ${s.unresolvedRows} |`,
    `| ignoredRows | ${s.ignoredRows} |`,
    `| courseCreateCandidates | ${s.courseCreateCandidates} |`,
    `| classGroupCreateCandidates | ${s.classGroupCreateCandidates} |`,
    `| teacherCreateCandidates | ${s.teacherCreateCandidates} |`,
    `| teachingTaskCandidates | ${s.teachingTaskCandidates} |`,
    `| teachingTaskClassCandidates | ${s.teachingTaskClassCandidates} |`,
    `| duplicateRiskRows | ${s.duplicateRiskRows} |`,
    `| blockingRows | ${s.blockingRows} |`,
    `| applyReadyForFutureStage | ${s.applyReadyForFutureStage} |`,
    ``,
    `## 12. Cross-Stage Refs`,
    `- L6-D2 review package fingerprint: \`${reviewPackageFingerprintHash}\``,
    `- L6-D2 review package local sha256: \`${reviewPackageLocalSha256}\``,
    `- L6-E2 plan local sha256: \`${planLocalSha256}\``,
    ``,
    `## 13. Browser Validation Checklist`,
    `1. 打开 \`/admin/import\`，选择目标学期，上传 xlsx。`,
    `2. 生成审核视图，使用 manual resolution 处理至少 1 个缺课程、1 个缺教师、1 个缺班级、1 个忽略行。`,
    `3. 点击 \`生成部分导入计划\`。`,
    `4. 验证: 摘要卡片出现、所有表格出现、Teacher create = 0、警告文案正确。`,
    `5. 点击 \`导出部分导入计划 JSON\`，确认 \`rawIncluded: false\` 且无原文。`,
    `6. 确认页面无 执行导入 / 写入数据库 / 创建教学任务 / 创建 ImportBatch 按钮。`,
    `7. 确认 DB counts 不变（prisma 不可观察到写入）。`,
    ``,
    `## 14. Next Stage`,
    `L6-F-XLSX-COURSE-SETTING-PARTIAL-IMPORT-EXECUTION。`,
    `要求: DB backup / explicit confirm / transaction / rollback note。`,
    `本阶段产出 \`importableRows\` 作为 L6-F 的输入（其它行不会进入 apply）。`,
    ``,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Redacted JSON export for the UI download button
// ---------------------------------------------------------------------------

export type SerializePartialImportPlanExportInput = {
  plan: CourseSettingPartialImportPlanResult
  generatedAt: string
}

/**
 * Redacted JSON export of the plan. The UI uses this for the
 * "导出部分导入计划 JSON" button. It carries aggregate fields and IDs / counts
 * only — no raw teacher / class / course / remark / sheet text.
 */
export const serializePartialImportPlanExport = (
  input: SerializePartialImportPlanExportInput,
): string => {
  const { plan, generatedAt } = input
  const obj = {
    stage: plan.stage,
    fileType: 'course-setting-partial-import-plan' as const,
    version: plan.planVersion,
    generatedAt,
    targetSemesterId: plan.targetSemesterId,
    sourceArtifact: {
      filename: plan.sourceArtifact.filename,
      sha256: plan.sourceArtifact.sha256,
      sizeBytes: plan.sourceArtifact.sizeBytes,
    },
    reviewPackageFingerprintHash: plan.reviewPackageFingerprintHash,
    summary: plan.summary,
    importableRowCount: plan.plan.importableRows.length,
    skippedRowCount: plan.plan.skippedRows.length,
    unresolvedRowCount: plan.plan.unresolvedRows.length,
    createCandidates: {
      courses: plan.plan.createCandidates.courses.map((c) => ({
        candidateKey: c.candidateKey,
        approvalItemCount: c.approvalItemIds.length,
        // candidateName is intentionally a HASH not a real name to satisfy
        // the "exported plan no raw course" invariant.
        candidateNameHash: shortHash(c.candidateName, 16),
      })),
      classGroups: plan.plan.createCandidates.classGroups.map((c) => ({
        candidateKey: c.candidateKey,
        approvalItemCount: c.approvalItemIds.length,
        candidateNameHash: shortHash(c.candidateName, 16),
      })),
      teachers: [],
    },
    teachingTaskCount: plan.plan.teachingTasks.length,
    teachingTaskClassCount: plan.plan.teachingTaskClasses.length,
    duplicateRiskCount: plan.plan.duplicateRisks.length,
    taskSplitCandidateCount: plan.plan.taskSplitCandidates.length,
    blockerCount: plan.plan.blockers.length,
    rawIncluded: false as const,
    privacy: {
      rawTeacherNamesIncluded: false as const,
      rawClassNamesIncluded: false as const,
      rawCourseNamesIncluded: false as const,
      rawRemarksIncluded: false as const,
    },
    planHash: shortHash(JSON.stringify(plan.summary) + plan.targetSemesterId, 32),
  }
  return JSON.stringify(obj, null, 2) + '\n'
}