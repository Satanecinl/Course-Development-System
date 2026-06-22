/**
 * L6-E2G — Course-Setting XLSX New Course Candidate Semantic Derivation
 *
 * Stage: L6-E2G-XLSX-COURSE-SETTING-NEW-COURSE-CANDIDATE-SEMANTICS-FIX
 *
 * Pure, side-effect-free helpers that derive the new course-candidate
 * semantics from existing dry-run diagnostics + the raw Excel course
 * name. The upstream `COURSE_MISSING` diagnostic is generated whenever
 * the row's course name does not match an existing Course in the
 * semester-scoped DB — that single signal conflates two semantically
 * distinct cases:
 *
 *  1. Excel course name is **empty / unparsable** → the user did not
 *     provide any course; this is a true course-name gap and must
 *     remain a hard blocker. New code: `COURSE_NAME_MISSING`.
 *  2. Excel course name is **non-empty** but no Course matches in the
 *     current DB → the row points at a course that doesn't exist yet;
 *     this is a *new course candidate* that can be created on apply
 *     (L6-F). It is NOT a hard blocker. New code: `COURSE_CREATE_CANDIDATE`.
 *
 * `COURSE_AMBIGUOUS` is preserved unchanged — DB has multiple matches
 * and the human reviewer must disambiguate.
 *
 * These helpers are intentionally tiny and pure: every consumer
 * (L6-D2 / L6-E1 / L6-E2 UI + helper) calls the same function so the
 * semantics stay consistent across stages.
 *
 * Hard constraints:
 *  - No Prisma, no fs, no React, no API.
 *  - Pure functions only — same input → identical output.
 *  - Never mutates input.
 *  - Never logs raw course names.
 */

import type { CourseSettingApprovalReviewUiRow } from './course-setting-approval-review-ui-l6-d2'

// ---------------------------------------------------------------------------
// Stage constants
// ---------------------------------------------------------------------------

export const L6_E2G_STAGE =
  'L6-E2G-XLSX-COURSE-SETTING-NEW-COURSE-CANDIDATE-SEMANTICS-FIX' as const

/** New diagnostic code: Excel course name is empty / unparsable. */
export const COURSE_NAME_MISSING = 'COURSE_NAME_MISSING' as const

/** New diagnostic code: Excel has a course name but DB has no match —
 *  the row is a new course candidate, not a blocker. */
export const COURSE_CREATE_CANDIDATE = 'COURSE_CREATE_CANDIDATE' as const

export const COURSE_DIAGNOSTIC_SEMANTIC_NEW_CANDIDATE = [
  COURSE_NAME_MISSING,
  COURSE_CREATE_CANDIDATE,
  'COURSE_MISSING',
  'COURSE_AMBIGUOUS',
] as const

// ---------------------------------------------------------------------------
// Helper predicates
// ---------------------------------------------------------------------------

const isBlank = (s: string | null | undefined): boolean =>
  s == null || s.trim().length === 0

/**
 * True iff the raw Excel course name is empty / unparsable. The raw field
 * is nullable: when null OR after trim() === '' we treat the row as
 * "no course name supplied by Excel".
 */
export const isExcelCourseNameMissing = (
  row: CourseSettingApprovalReviewUiRow,
): boolean => isBlank(row.raw.courseName)

/**
 * True iff the row points at a new course that doesn't exist in the
 * current DB yet. Concretely: Excel has a non-empty course name AND
 * the dry-run emitted `COURSE_MISSING` (i.e. the course was looked up
 * against the DB and no match was found).
 *
 * Note: the upstream `COURSE_MISSING` diagnostic can be emitted even
 * when the course name is empty (the matcher still tries to look up
 * the empty string). That's why we additionally require
 * `!isExcelCourseNameMissing` here — true "no course" is a separate
 * category.
 */
export const isNewCourseCandidate = (
  row: CourseSettingApprovalReviewUiRow,
): boolean => {
  if (isExcelCourseNameMissing(row)) return false
  return row.match.diagnosticCodes.includes('COURSE_MISSING')
}

/**
 * True iff the row's course situation is a hard blocker. Only true
 * course-name gaps (`COURSE_NAME_MISSING`) and ambiguous matches
 * (`COURSE_AMBIGUOUS`) that the user has NOT yet disambiguated count.
 *
 * New course candidates (`COURSE_CREATE_CANDIDATE`) are NOT blockers —
 * they are confirmable. The plan stage must allow them through with
 * `createCourseCandidate` resolution.
 */
export const isCourseBlocked = (
  row: CourseSettingApprovalReviewUiRow,
): boolean => {
  const codes = row.match.diagnosticCodes
  if (isExcelCourseNameMissing(row) && codes.includes('COURSE_MISSING')) {
    return true
  }
  if (codes.includes('COURSE_AMBIGUOUS')) return true
  return false
}

/**
 * Compute the human-readable course situation label, matching the
 * planned UI text. Returns:
 *  - 'courseNameMissing' → "课程名缺失" (blocker)
 *  - 'newCourseCandidate' → "新课程候选" (confirmable)
 *  - 'courseAmbiguous' → "课程匹配歧义" (review)
 *  - 'courseResolved' → null when no course issue
 *
 * Pure: never returns raw course names.
 */
export type CourseSituation =
  | 'courseNameMissing'
  | 'newCourseCandidate'
  | 'courseAmbiguous'
  | 'courseResolved'

export const classifyCourseSituation = (
  row: CourseSettingApprovalReviewUiRow,
): CourseSituation => {
  if (isExcelCourseNameMissing(row) && row.match.diagnosticCodes.includes('COURSE_MISSING')) {
    return 'courseNameMissing'
  }
  if (isNewCourseCandidate(row)) {
    return 'newCourseCandidate'
  }
  if (row.match.diagnosticCodes.includes('COURSE_AMBIGUOUS')) {
    return 'courseAmbiguous'
  }
  return 'courseResolved'
}

/**
 * Effective diagnostic codes for the row's course situation, with the
 * legacy `COURSE_MISSING` re-classified into either
 * `COURSE_NAME_MISSING` or `COURSE_CREATE_CANDIDATE` based on whether
 * the Excel course name was empty. `COURSE_AMBIGUOUS` is preserved
 * unchanged. The original diagnostic codes are NOT mutated — the
 * caller is responsible for adding the re-classified codes to its own
 * derived list (e.g. a UI summary count).
 *
 * Order:
 *  1. Strip `COURSE_MISSING` from the upstream list.
 *  2. Append `COURSE_NAME_MISSING` if the Excel course name was empty.
 *  3. Append `COURSE_CREATE_CANDIDATE` if the Excel course name was
 *     non-empty AND the upstream had `COURSE_MISSING`.
 *
 * Returns a NEW array — no mutation.
 */
export const effectiveCourseDiagnostics = (
  row: CourseSettingApprovalReviewUiRow,
): string[] => {
  const codes = row.match.diagnosticCodes.filter((c) => c !== 'COURSE_MISSING')
  const situation = classifyCourseSituation(row)
  if (situation === 'courseNameMissing') {
    codes.push(COURSE_NAME_MISSING)
  } else if (situation === 'newCourseCandidate') {
    codes.push(COURSE_CREATE_CANDIDATE)
  }
  return codes
}

/**
 * True iff the course-resolution action stored in the manual resolution
 * state counts as "the user confirmed this new course will be created".
 * The action is `createCourseCandidate` AND the candidate name is
 * non-empty.
 */
export const isCreateCourseCandidateResolution = (
  resolution: { course?: { action?: string; candidateName?: string | null } } | null
  | undefined,
): boolean => {
  if (!resolution || !resolution.course) return false
  if (resolution.course.action !== 'createCourseCandidate') return false
  return !isBlank(resolution.course.candidateName ?? null)
}

/**
 * True iff the user has resolved the course situation — either by
 * choosing an existing course, or by confirming/renaming a new course
 * candidate. Used by L6-E1 validation to short-circuit course blockers.
 */
export const isCourseResolutionSatisfied = (
  resolution: { course?: { action?: string; existingCourseId?: number | null; candidateName?: string | null } } | null
  | undefined,
): boolean => {
  if (!resolution || !resolution.course) return false
  const action = resolution.course.action
  if (action === 'useExistingCourse' && resolution.course.existingCourseId != null) {
    return true
  }
  if (action === 'createCourseCandidate') {
    return !isBlank(resolution.course.candidateName ?? null)
  }
  return false
}
