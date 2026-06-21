/**
 * L6-E1 Manual Resolution State Helper — Course-Setting XLSX Review Row Resolution
 *
 * Stage: L6-E1-XLSX-COURSE-SETTING-MANUAL-RESOLUTION-UI
 *
 * Pure, in-memory state model for tracking how a human reviewer resolves
 * each row from the L6-D2 review UI before the row becomes importable.
 * This helper performs NO DB writes, NO fs writes, NO React rendering,
 * NO API calls.
 *
 * Lifecycle:
 *  1. L6-D2 produces `CourseSettingApprovalReviewUiRow[]` (review UI rows).
 *  2. L6-E1 consumes those rows and builds a `CourseSettingManualResolutionItem[]`
 *     state array with initial resolution status and validation.
 *  3. The UI calls `applyManualResolutionUpdate` as the reviewer assigns
 *     course/teacher/classGroup overrides, weekly-hour corrections, exam-type
 *     corrections, or ambiguous-mapping confirmations.
 *  4. After each update, `evaluateManualResolutionItem` re-computes
 *     blockers and warnings so the UI can show real-time progress.
 *  5. `summarizeManualResolutionState` provides aggregate counts for
 *     progress indicators.
 *  6. `serializeManualResolutionDraftExport` produces a redacted JSON draft
 *     that can be saved/loaded without ever including raw Excel text.
 *
 * Hard constraints:
 *  - No Prisma, no DB, no filesystem, no React, no API.
 *  - No `console.log` / `console.error`.
 *  - No `any`. All types are explicit.
 *  - Pure functions: same input → identical output, no side effects.
 *  - Never mutates input arrays or objects; always returns new copies.
 *  - The serialized draft MUST NOT include raw course/teacher/class/remark/sheet text.
 */

import type {
  CourseSettingApprovalReviewUiRow,
} from './course-setting-approval-review-ui-l6-d2'

// ---------------------------------------------------------------------------
// Stage constants
// ---------------------------------------------------------------------------

export const L6_E1_STAGE =
  'L6-E1-XLSX-COURSE-SETTING-MANUAL-RESOLUTION-UI' as const

export const L6_E1_RESOLUTION_DRAFT_VERSION = 'l6-e1-resolution-draft-v1' as const

// ---------------------------------------------------------------------------
// Status / action enums
// ---------------------------------------------------------------------------

export type CourseSettingResolutionStatus =
  | 'importable'
  | 'needsResolution'
  | 'ignored'
  | 'pending'

export type CourseSettingResolutionAction =
  | 'none'
  | 'useExistingCourse'
  | 'createCourseCandidate'
  | 'useExistingTeacher'
  | 'createTeacherCandidate'
  | 'allowBlankTeacher'
  | 'useExistingClassGroup'
  | 'createClassGroupCandidate'
  | 'overrideWeeklyHours'
  | 'overrideExamType'
  | 'confirmAmbiguousMapping'
  | 'markNeedsReview'
  | 'ignoreRow'

// ---------------------------------------------------------------------------
// Per-item types
// ---------------------------------------------------------------------------

export type CourseSettingManualResolutionCourse = {
  action: 'none' | 'useExistingCourse' | 'createCourseCandidate'
  existingCourseId?: number
  candidateName?: string
}

export type CourseSettingManualResolutionTeacher = {
  action: 'none' | 'useExistingTeacher' | 'createTeacherCandidate' | 'allowBlankTeacher'
  existingTeacherId?: number
  candidateName?: string
  allowBlankReason?: string
}

export type CourseSettingManualResolutionClassGroups = {
  action: 'none' | 'useExistingClassGroup' | 'createClassGroupCandidate'
  existingClassGroupIds?: number[]
  candidateNames?: string[]
}

export type CourseSettingManualResolutionWeeklyHours = {
  action: 'none' | 'overrideWeeklyHours'
  value?: number
}

export type CourseSettingManualResolutionExamType = {
  action: 'none' | 'overrideExamType'
  value?: '考试' | '考查' | ''
}

export type CourseSettingManualResolutionAmbiguousMapping = {
  action: 'none' | 'confirmAmbiguousMapping' | 'markNeedsReview'
  note?: string
}

export type CourseSettingManualResolution = {
  ignored: boolean
  ignoreReason?: string
  course?: CourseSettingManualResolutionCourse
  teacher?: CourseSettingManualResolutionTeacher
  classGroups?: CourseSettingManualResolutionClassGroups
  weeklyHours?: CourseSettingManualResolutionWeeklyHours
  examType?: CourseSettingManualResolutionExamType
  ambiguousMapping?: CourseSettingManualResolutionAmbiguousMapping
}

export type CourseSettingManualResolutionValidation = {
  importable: boolean
  blockers: string[]
  warnings: string[]
}

export type CourseSettingManualResolutionItem = {
  approvalItemId: string
  targetSemesterId: number
  baseDecision: 'pending' | 'approved' | 'rejected' | 'needsReview'
  baseSuggestedAction: string
  baseDiagnosticCodes: string[]
  baseBlocked: boolean
  baseAutoSafeCandidate: boolean
  resolutionStatus: CourseSettingResolutionStatus
  resolution: CourseSettingManualResolution
  validation: CourseSettingManualResolutionValidation
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export type CourseSettingManualResolutionSummary = {
  totalItems: number
  importableItems: number
  needsResolutionItems: number
  ignoredItems: number
  pendingItems: number
  manuallyResolvedItems: number
  unresolvedBlockers: Record<string, number>
}

// ---------------------------------------------------------------------------
// Serialisation input
// ---------------------------------------------------------------------------

export type SerializeManualResolutionDraftInput = {
  targetSemesterId: number
  packageRef: { dryRunFingerprintHash: string; itemCount: number }
  items: CourseSettingManualResolutionItem[]
}

// ---------------------------------------------------------------------------
// Validation evaluator
// ---------------------------------------------------------------------------

const VALID_EXAM_TYPES = ['考试', '考查', ''] as const

/**
 * Evaluate a single resolution item and return its current validation state.
 *
 * Rules:
 *  - If `resolution.ignored` is true → not importable, blocker: `rowIgnored`.
 *  - If `baseBlocked` is true → check each resolution dimension; any
 *    unresolved dimension produces a blocker string.
 *  - If NOT baseBlocked (autoSafe or needsHumanReview) → importable (unless ignored).
 */
export const evaluateManualResolutionItem = (
  item: CourseSettingManualResolutionItem,
): CourseSettingManualResolutionValidation => {
  const { resolution, baseBlocked, baseDiagnosticCodes } = item
  const blockers: string[] = []
  const warnings: string[] = []

  // --- Ignored check (highest priority) ---
  if (resolution.ignored) {
    return { importable: false, blockers: ['rowIgnored'], warnings: [] }
  }

  // --- Blocked rows: check each dimension ---
  if (baseBlocked) {
    // Course blocker (only if course diagnostic present)
    if (baseDiagnosticCodes.includes('COURSE_MISSING') || baseDiagnosticCodes.includes('COURSE_AMBIGUOUS')) {
      const courseAction = resolution.course?.action ?? 'none'
      if (courseAction === 'useExistingCourse' || courseAction === 'createCourseCandidate') {
        // resolved
      } else {
        blockers.push('courseMissing')
      }
    }

    // Teacher blocker (only if teacher diagnostic present)
    if (baseDiagnosticCodes.includes('TEACHER_MISSING') || baseDiagnosticCodes.includes('TEACHER_BLANK')) {
      const teacherAction = resolution.teacher?.action ?? 'none'
      if (
        teacherAction === 'useExistingTeacher' ||
        teacherAction === 'createTeacherCandidate' ||
        teacherAction === 'allowBlankTeacher'
      ) {
        // resolved
      } else {
        blockers.push('teacherMissing')
      }
    }

    // Class group blocker (only if class diagnostic present)
    if (baseDiagnosticCodes.includes('CLASS_GROUP_MISSING') || baseDiagnosticCodes.includes('CLASS_GROUP_AMBIGUOUS')) {
      const classGroupAction = resolution.classGroups?.action ?? 'none'
      if (
        classGroupAction === 'useExistingClassGroup' ||
        classGroupAction === 'createClassGroupCandidate'
      ) {
        // resolved
      } else {
        blockers.push('classGroupMissing')
      }
    }

    // Weekly hours blocker (only if diagnostic present)
    if (baseDiagnosticCodes.includes('WEEKLY_HOURS_NON_NUMERIC')) {
      const hoursAction = resolution.weeklyHours?.action ?? 'none'
      if (hoursAction === 'overrideWeeklyHours') {
        const hoursValue = resolution.weeklyHours?.value
        if (typeof hoursValue === 'number' && isFinite(hoursValue) && hoursValue > 0) {
          // resolved
        } else {
          blockers.push('weeklyHoursInvalid')
        }
      } else {
        blockers.push('weeklyHoursInvalid')
      }
    }

    // Exam type blocker (only if diagnostic present)
    if (baseDiagnosticCodes.includes('EXAM_TYPE_OTHER')) {
      const examAction = resolution.examType?.action ?? 'none'
      if (examAction === 'overrideExamType') {
        const examValue = resolution.examType?.value
        if (examValue !== undefined && (VALID_EXAM_TYPES as readonly string[]).includes(examValue)) {
          // resolved
        } else {
          blockers.push('examTypeInvalid')
        }
      } else {
        blockers.push('examTypeInvalid')
      }
    }

    // Ambiguous mapping blocker (only if diagnostic present)
    if (baseDiagnosticCodes.includes('MERGE_REMARK_AMBIGUOUS')) {
      const ambiguousAction = resolution.ambiguousMapping?.action ?? 'none'
      if (ambiguousAction === 'confirmAmbiguousMapping') {
        // resolved
      } else {
        blockers.push('ambiguousMapping')
      }
    }

    // --- Warnings ---
    if (baseDiagnosticCodes.includes('LOW_CONFIDENCE_ROW')) {
      warnings.push('lowConfidence')
    }
  } else {
    // --- Not blocked (autoSafe or needsHumanReview) ---
    // These rows are importable unless ignored (already handled above).
    // No blockers; warnings may be informational but are currently empty.
  }

  return {
    importable: blockers.length === 0,
    blockers,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// buildInitialManualResolutionState
// ---------------------------------------------------------------------------

/**
 * Build the initial manual-resolution state array from L6-D2 review rows.
 *
 * Each row is projected into a `CourseSettingManualResolutionItem` with:
 *  - Base fields copied from the review row.
 *  - Initial `resolutionStatus` derived from flags.
 *  - Resolution starting at all-`'none'`, `ignored: false`.
 *  - Validation computed via `evaluateManualResolutionItem`.
 *
 * Pure function: no mutation, no I/O.
 */
export const buildInitialManualResolutionState = (
  rows: CourseSettingApprovalReviewUiRow[],
  targetSemesterId: number,
): CourseSettingManualResolutionItem[] => {
  return rows.map((row) => {
    // Determine initial resolution status
    let resolutionStatus: CourseSettingResolutionStatus

    if (row.flags.blocked === false && row.flags.autoSafeCandidate === true) {
      resolutionStatus = 'importable'
    } else if (row.flags.blocked === true) {
      resolutionStatus = 'needsResolution'
    } else if (row.flags.needsHumanReview === true) {
      resolutionStatus = 'pending'
    } else {
      resolutionStatus = 'pending'
    }

    const resolution: CourseSettingManualResolution = {
      ignored: false,
    }

    const item: CourseSettingManualResolutionItem = {
      approvalItemId: row.approvalItemId,
      targetSemesterId,
      baseDecision: row.decision.value,
      baseSuggestedAction: row.match.suggestedAction,
      baseDiagnosticCodes: row.match.diagnosticCodes,
      baseBlocked: row.flags.blocked,
      baseAutoSafeCandidate: row.flags.autoSafeCandidate,
      resolutionStatus,
      resolution,
      validation: { importable: false, blockers: [], warnings: [] },
    }

    item.validation = evaluateManualResolutionItem(item)

    return item
  })
}

// ---------------------------------------------------------------------------
// applyManualResolutionUpdate
// ---------------------------------------------------------------------------

export type ManualResolutionPatch = {
  resolution?: Partial<CourseSettingManualResolution>
}

/**
 * Deep-merge a resolution patch into an existing resolution object.
 *
 * Top-level scalar fields (`ignored`, `ignoreReason`) replace the existing
 * value. Nested objects (`course`, `teacher`, `classGroups`, `weeklyHours`,
 * `examType`, `ambiguousMapping`) are themselves shallow-merged so that
 * updating one nested field does not wipe siblings (e.g. setting `course`
 * must not clobber `teacher`).
 */
const deepMergeResolution = (
  old: CourseSettingManualResolution,
  patch: Partial<CourseSettingManualResolution>,
): CourseSettingManualResolution => {
  const merged: CourseSettingManualResolution = { ...old }
  for (const k of Object.keys(patch) as Array<keyof CourseSettingManualResolution>) {
    const newVal = patch[k]
    if (newVal === undefined) continue
    if (
      k === 'course' ||
      k === 'teacher' ||
      k === 'classGroups' ||
      k === 'weeklyHours' ||
      k === 'examType' ||
      k === 'ambiguousMapping'
    ) {
      // Nested object — shallow-merge with the old sibling (or replace
      // entirely if the old sibling is undefined / patch sends a fresh
      // shape). The shallow merge keeps scalar siblings within that
      // nested object intact (e.g. updating `action` does not wipe
      // `existingCourseId` if a fresh patch only sets `action`).
      const oldNested = (old as Record<string, unknown>)[k] as
        | Record<string, unknown>
        | undefined
      const base = oldNested ?? {}
      merged[k] = { ...base, ...(newVal as Record<string, unknown>) } as never
    } else {
      // Scalar (ignored, ignoreReason): replace
      merged[k] = newVal as never
    }
  }
  return merged
}

/**
 * Apply a partial resolution patch to the item identified by `approvalItemId`.
 * Returns a NEW array with the patched item; the input arrays and objects
 * are never mutated.
 *
 * Accepts both the canonical `{ resolution: { ... } }` shape and a flat
 * `{ course: {...}, teacher: {...}, ... }` shape for UI ergonomics — the
 * flat shape is the form every L6-E1 UI control uses, so we accept it
 * directly here. Re-evaluation + status recompute happen on every patch.
 */
export const applyManualResolutionUpdate = (
  state: CourseSettingManualResolutionItem[],
  approvalItemId: string,
  patch: ManualResolutionPatch | Partial<CourseSettingManualResolution>,
): CourseSettingManualResolutionItem[] => {
  return state.map((item) => {
    if (item.approvalItemId !== approvalItemId) {
      return item
    }

    // Accept both `{ resolution: {...} }` and the flat `{...}` shape.
    // Detection: the canonical shape has a `resolution` key whose value
    // is an object; the flat shape has resolution-shaped keys at top
    // level (course / teacher / classGroups / weeklyHours / examType /
    // ambiguousMapping / ignored / ignoreReason).
    const isCanonicalShape =
      'resolution' in (patch as Record<string, unknown>) &&
      typeof (patch as Record<string, unknown>)['resolution'] === 'object' &&
      (patch as { resolution?: unknown }).resolution !== null &&
      !Array.isArray((patch as { resolution?: unknown }).resolution) &&
      Object.keys(patch as Record<string, unknown>).length === 1

    const resolutionPatch: Partial<CourseSettingManualResolution> = isCanonicalShape
      ? ((patch as ManualResolutionPatch).resolution ?? {})
      : (patch as Partial<CourseSettingManualResolution>)

    // Deep-merge so nested fields coexist (course/teacher/classGroups etc.)
    const mergedResolution = deepMergeResolution(item.resolution, resolutionPatch)

    const updatedItem: CourseSettingManualResolutionItem = {
      ...item,
      resolution: mergedResolution,
    }

    // Re-evaluate validation
    updatedItem.validation = evaluateManualResolutionItem(updatedItem)

    // Recompute resolutionStatus based on updated validation and resolution
    updatedItem.resolutionStatus = deriveResolutionStatus(updatedItem)

    return updatedItem
  })
}

/**
 * Derive the resolution status from the current resolution + validation state.
 */
const deriveResolutionStatus = (
  item: CourseSettingManualResolutionItem,
): CourseSettingResolutionStatus => {
  if (item.resolution.ignored) {
    return 'ignored'
  }
  if (item.validation.importable) {
    return 'importable'
  }
  if (item.baseBlocked) {
    return 'needsResolution'
  }
  return 'pending'
}

// ---------------------------------------------------------------------------
// summarizeManualResolutionState
// ---------------------------------------------------------------------------

/**
 * Produce aggregate summary counts across the resolution state array.
 *
 * `manuallyResolvedItems` counts items where at least one resolution action
 * is not `'none'` or where `ignored === true`.
 *
 * `unresolvedBlockers` aggregates all remaining blocker strings across
 * non-importable, non-ignored items.
 */
export const summarizeManualResolutionState = (
  state: CourseSettingManualResolutionItem[],
): CourseSettingManualResolutionSummary => {
  let importableItems = 0
  let needsResolutionItems = 0
  let ignoredItems = 0
  let pendingItems = 0
  let manuallyResolvedItems = 0

  const unresolvedBlockerCounts: Record<string, number> = {}

  for (const item of state) {
    // Count by status
    switch (item.resolutionStatus) {
      case 'importable':
        importableItems += 1
        break
      case 'needsResolution':
        needsResolutionItems += 1
        break
      case 'ignored':
        ignoredItems += 1
        break
      case 'pending':
        pendingItems += 1
        break
    }

    // Count manually resolved items
    if (isManuallyResolved(item)) {
      manuallyResolvedItems += 1
    }

    // Aggregate unresolved blockers
    if (!item.validation.importable && item.resolutionStatus !== 'ignored') {
      for (const blocker of item.validation.blockers) {
        unresolvedBlockerCounts[blocker] = (unresolvedBlockerCounts[blocker] ?? 0) + 1
      }
    }
  }

  return {
    totalItems: state.length,
    importableItems,
    needsResolutionItems,
    ignoredItems,
    pendingItems,
    manuallyResolvedItems,
    unresolvedBlockers: unresolvedBlockerCounts,
  }
}

/**
 * Check whether an item has been manually resolved — meaning at least one
 * resolution dimension has a non-`'none'` action, or the item is ignored.
 */
const isManuallyResolved = (item: CourseSettingManualResolutionItem): boolean => {
  const { resolution } = item

  if (resolution.ignored) return true

  if (resolution.course && resolution.course.action !== 'none') return true
  if (resolution.teacher && resolution.teacher.action !== 'none') return true
  if (resolution.classGroups && resolution.classGroups.action !== 'none') return true
  if (resolution.weeklyHours && resolution.weeklyHours.action !== 'none') return true
  if (resolution.examType && resolution.examType.action !== 'none') return true
  if (resolution.ambiguousMapping && resolution.ambiguousMapping.action !== 'none') return true

  return false
}

// ---------------------------------------------------------------------------
// serializeManualResolutionDraftExport
// ---------------------------------------------------------------------------

/**
 * Serialize the resolution state into a JSON draft string that can be saved
 * and loaded without ever including raw Excel text.
 *
 * The exported structure carries only `approvalItemId`, `resolutionStatus`,
 * `resolution` (which contains IDs or candidate names, not raw text),
 * `validation`, and `rawIncluded: false`.
 */
export const serializeManualResolutionDraftExport = (
  input: SerializeManualResolutionDraftInput,
): string => {
  const { targetSemesterId, packageRef, items } = input

  const summary = summarizeManualResolutionState(items)

  const serializedItems = items.map((item) => ({
    approvalItemId: item.approvalItemId,
    resolutionStatus: item.resolutionStatus,
    resolution: item.resolution,
    validation: item.validation,
    rawIncluded: false as const,
  }))

  const obj = {
    stage: L6_E1_STAGE,
    fileType: 'course-setting-resolution-draft',
    version: L6_E1_RESOLUTION_DRAFT_VERSION,
    exportedAt: new Date().toISOString(),
    targetSemesterId,
    packageRef,
    summary,
    items: serializedItems,
    rawIncluded: false as const,
  }

  return JSON.stringify(obj, null, 2) + '\n'
}
