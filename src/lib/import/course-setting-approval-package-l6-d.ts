/**
 * L6-D Approval Package Helper — Course-Setting XLSX Target Semester Approval Package
 *
 * Stage: L6-D-XLSX-COURSE-SETTING-APPROVAL-PACKAGE-WITH-TARGET-SEMESTER
 *
 * Pure, in-memory helper that binds a L4 `CourseSettingTeachingTaskDryRunResult`
 * to an explicit `targetSemesterId` and produces a target-semester-bound
 * `CourseSettingApprovalPackageResult`. This is the formal approval input for
 * the future L6-E (apply) stage.
 *
 * Hard constraints:
 *  - No Prisma, no DB writes, no filesystem writes, no API/UI coupling.
 *  - All `reviewDecision` are pinned to `'pending'`; the helper never
 *    auto-approves. The `approvalSummary.approvedItems` is always 0.
 *  - `applyAllowed: false` is a literal type; the package never carries an
 *    apply list, import batch plan, or transaction draft.
 *  - Every `reviewItem` is bound to `targetSemesterRef.semesterId` so the
 *    later apply stage cannot accidentally scope to a different semester.
 *  - The output is redacted: only hashes / ids / counts / classifications /
 *    diagnostic codes / candidate keys / confidence / source row refs are
 *    emitted. NO raw teacher / class / course / remark / sheet text is
 *    placed in any field. Sheet names are emitted as sha256-prefix-12 only.
 *
 * Relationship to prior stages:
 *  - L2: pure xlsx parser → `CourseSettingXlsxParseResult`.
 *  - L4: dry-run mapper → `CourseSettingTeachingTaskDryRunResult`
 *        (consumed by this helper — `existingData` must be scoped by
 *        `targetSemesterId` BEFORE the L4 call).
 *  - L5: review package helper (also `pending` only) — L6-D does NOT
 *        reuse it because the L6-D output carries different invariants
 *        (`approvalOnly`, `targetSemesterBound`, `applyAllowed`, gates).
 *  - L6-B / L6-B1 / L6-C: UI/API only. L6-D does not depend on them.
 *  - L6-E (planned): apply stage. MUST still be blocked until the L6-D
 *        package has been user-approved.
 *
 * Privacy contract:
 *  - Runtime raw preview fields (course / teacher / class / remark / sheet
 *    text) live ONLY in the L6-B1 runtime API response for authorized admin
 *    UIs. They MUST NOT appear in any L6-D output.
 *  - Committed docs/json only contain hashes + ids + counts + classifications.
 *  - The gitignored local artifact (`temp/local-artifacts/l6-d/*.json`) is
 *    still redacted (hashes / candidate keys / diagnostics only).
 */

import { createHash } from 'node:crypto'
import type {
  CourseSettingTeachingTaskDryRunResult,
  CourseSettingTeachingTaskDryRunPreviewCandidate,
} from './course-setting-teaching-task-dry-run'

// ---------------------------------------------------------------------------
// Stage constants
// ---------------------------------------------------------------------------

export const L6_D_STAGE =
  'L6-D-XLSX-COURSE-SETTING-APPROVAL-PACKAGE-WITH-TARGET-SEMESTER' as const
export const L6_D_APPROVAL_PACKAGE_VERSION = 'l6-d-approval-package-v1' as const

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Redacted target-semester summary. The L6-D package NEVER emits the raw
 * semester name / code. It does emit `id` (as the unique key for the
 * approval flow) plus hashes so the redacted JSON can still be inspected.
 */
export type CourseSettingApprovalTargetSemester = {
  id: number
  idHash: string
  nameHash: string
  codeHash?: string | null
  isActive: boolean
  taskCount: number
  classGroupCount: number
}

/**
 * Source artifact hash contract. The sample path / filename are NEVER
 * placed in any L6-D output — only the sha256 of the artifact and the
 * sha256 of the filename.
 */
export type CourseSettingApprovalSourceArtifact = {
  artifactSha256: string
  artifactFilenameHash: string
  sizeBytes: number
  parserVersion: string
}

export type CourseSettingApprovalPackageOptions = {
  packageVersion?: string
  includeRawValues?: boolean // default false; L6-D MUST keep false
  maxReviewRows?: number // default = consume every preview candidate
}

// ---------------------------------------------------------------------------
// Review item + per-row types
// ---------------------------------------------------------------------------

export type CourseSettingApprovalReviewItemSuggestedAction =
  | 'approveCandidate'
  | 'needsHumanReview'
  | 'newCourseCandidate'
  | 'blockedByMissingCourse'
  | 'blockedByMissingTeacher'
  | 'blockedByMissingClassGroup'
  | 'blockedByAmbiguousMapping'
  | 'blockedByInvalidHours'
  | 'blockedByInvalidExamType'
  | 'blockedByLowConfidence'
  | 'blockedByTargetSemesterMismatch'

export type CourseSettingApprovalReviewItem = {
  approvalItemId: string
  reviewDecision: 'pending'

  sourceRef: {
    sheetIndex: number
    sheetNameHash: string
    sourceRowIndex: number
    sourceCourseNameHash?: string
    sourceTeacherRawHash?: string
    sourceClassCountRawHash?: string
    sourceRemarkHash?: string
    sourceMergeRemarkHash?: string
  }

  targetSemesterRef: {
    semesterId: number
    semesterIdHash: string
  }

  candidateRefs: {
    teachingTaskCandidateKey: string
    courseCandidateKey?: string
    teacherCandidateKeys: string[]
    classGroupCandidateKeys: string[]
    teachingTaskClassCandidateKeys: string[]
  }

  classifications: {
    splitPlan?: string
    taskMatchStatus?: string
    courseMatchStatus?: string
    teacherMatchStatusSummary?: Record<string, number>
    classGroupMatchStatusSummary?: Record<string, number>
    weeklyHoursClassification?: string
    examTypeClassification?: string
  }

  suggestedAction: CourseSettingApprovalReviewItemSuggestedAction
  blockingReasons: string[]
  diagnosticCodes: string[]
  confidence: number
}

// ---------------------------------------------------------------------------
// Approval package result
// ---------------------------------------------------------------------------

export type CourseSettingApprovalPackageResult = {
  stage: typeof L6_D_STAGE
  packageVersion: string

  approvalOnly: true
  dryRunOnly: true
  dbWritten: false
  applyAllowed: false

  targetSemester: CourseSettingApprovalTargetSemester
  sourceArtifact: CourseSettingApprovalSourceArtifact

  dryRunFingerprint: {
    totalCourseRows: number
    teachingTaskCandidates: number
    teachingTaskClassCandidates: number
    rowsNeedingManualReview: number
    sourceEvidenceCoverage: number
    hash: string
  }

  approvalSummary: {
    totalItems: number
    allDecisionsPending: boolean
    approvedItems: 0
    rejectedItems: 0
    needsReviewItems: number
    blockedItems: number
    autoSafeCandidates: number
    /** L7-A3: rows where Excel has a course name but DB has no match.
     *  These are NOT blockers — they can enter the dry-run importable
     *  plan with `coursePlan.mode = "createCourse"`. */
    newCourseCandidateItems: number
    /** L7-A3: rows where Excel course name is empty / unparsable. These
     *  ARE hard blockers — counted separately from
     *  `newCourseCandidateItems`. */
    courseNameMissingItems: number
  }

  reviewItems: CourseSettingApprovalReviewItem[]

  gates: {
    targetSemesterBound: true
    reviewPackageApproved: false
    dbBackupCreated: false
    dryRunReplayMatchesApprovedPackage: false
    importBatchPlanGenerated: false
    rollbackPlanGenerated: false
    sourceEvidencePlanConfirmed: false
  }

  rawDisplayPolicy: {
    runtimeUiRawAllowed: true
    approvalPackageRawIncluded: false
    committedDocsRawAllowed: false
    localArtifactRawIncluded: false
    scope: 'authorized-admin-preview-only'
  }

  privacy: {
    rawTeacherNamesIncluded: false
    rawClassNamesIncluded: false
    rawCourseNamesIncluded: false
    rawRemarksIncluded: false
    rawRowsIncluded: false
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const hash = (s: string, len = 12): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)

const sha256Hex = (s: string): string =>
  createHash('sha256').update(s, 'utf8').digest('hex')

const sheetNameHash = (sheetIndex: number): string =>
  hash(`sheet:${sheetIndex}`)

const teacherStatusSummary = (
  statuses: string[],
): Record<string, number> => {
  const m: Record<string, number> = {}
  for (const s of statuses) m[s] = (m[s] ?? 0) + 1
  return m
}

const classGroupStatusSummary = (
  statuses: string[],
): Record<string, number> => {
  const m: Record<string, number> = {}
  for (const s of statuses) m[s] = (m[s] ?? 0) + 1
  return m
}

/**
 * Suggest a per-item action from the dry-run classifications.
 *
 * This is a heuristic (the apply stage L6-E will compute its own). The
 * rules are:
 *  - `missing` course + `COURSE_NAME_MISSING` → blockedByMissingCourse
 *  - `missing` course + `COURSE_CREATE_CANDIDATE` → newCourseCandidate
 *    (NOT a blocker; the row will be plan-eligible in the partial plan)
 *  - `ambiguous` course / class / teacher → blockedByAmbiguousMapping
 *  - `missing` teacher → blockedByMissingTeacher
 *  - `missing` class group → blockedByMissingClassGroup
 *  - `weekly_hours_non_numeric` diagnostic → blockedByInvalidHours
 *  - `exam_type_other` diagnostic → blockedByInvalidExamType
 *  - `low_confidence_row` diagnostic OR confidence < 0.5 → blockedByLowConfidence
 *  - all-exact + no risky diagnostic + confidence >= 0.9 → approveCandidate
 *    (the review decision is STILL `pending` — this is only a suggested
 *    action so the apply stage knows what the package considers safe)
 *  - otherwise → needsHumanReview
 *
 * Note: the package is consumed by humans before any apply. The
 * `approveCandidate` suggestion is informational; the L6-D helper itself
 * never flips the decision.
 */
const suggestAction = (
  courseMatchStatus: string,
  teacherMatchStatuses: string[],
  classGroupMatchStatuses: string[],
  diagnosticCodes: string[],
  confidence: number,
): CourseSettingApprovalReviewItemSuggestedAction => {
  if (courseMatchStatus === 'missing') {
    // L7-A3: new course candidates (Excel has a name, DB has no match) are
    // NOT a blocker. Only a truly empty course name is a hard blocker.
    if (diagnosticCodes.includes('COURSE_CREATE_CANDIDATE')) {
      return 'newCourseCandidate'
    }
    if (diagnosticCodes.includes('COURSE_NAME_MISSING')) {
      return 'blockedByMissingCourse'
    }
    // Legacy COURSE_MISSING (rare; L4 still emits it for empty input
    // paths). Treat conservatively as a hard blocker.
    return 'blockedByMissingCourse'
  }
  if (
    courseMatchStatus === 'ambiguous' ||
    classGroupMatchStatuses.includes('ambiguous') ||
    teacherMatchStatuses.includes('ambiguous')
  ) {
    return 'blockedByAmbiguousMapping'
  }
  if (
    classGroupMatchStatuses.includes('missing') ||
    classGroupMatchStatuses.includes('unresolved')
  ) {
    return 'blockedByMissingClassGroup'
  }
  if (teacherMatchStatuses.includes('missing')) return 'blockedByMissingTeacher'
  if (diagnosticCodes.includes('WEEKLY_HOURS_NON_NUMERIC')) {
    return 'blockedByInvalidHours'
  }
  if (diagnosticCodes.includes('EXAM_TYPE_OTHER')) {
    return 'blockedByInvalidExamType'
  }
  if (diagnosticCodes.includes('LOW_CONFIDENCE_ROW') || confidence < 0.5) {
    return 'blockedByLowConfidence'
  }
  const allExact =
    courseMatchStatus === 'exact' &&
    teacherMatchStatuses.every((s) => s === 'exact' || s === 'blank') &&
    classGroupMatchStatuses.every(
      (s) => s === 'exact' || s === 'countOnly',
    ) &&
    confidence >= 0.9
  if (allExact) return 'approveCandidate'
  return 'needsHumanReview'
}

const blockingReasonsFor = (
  suggested: CourseSettingApprovalReviewItemSuggestedAction,
  bucket: string,
): string[] => {
  if (suggested === 'approveCandidate') {
    return ['auto_safe_requires_human_review_in_l6_d']
  }
  // L7-A3: newCourseCandidate is NOT a blocker. Surface the underlying
  // bucket only as informational reason (no blocker key).
  if (suggested === 'newCourseCandidate') {
    return [`bucket:${bucket}`, 'new_course_candidate_not_blocker']
  }
  switch (suggested) {
    case 'blockedByMissingCourse':
      return ['course_missing', `bucket:${bucket}`]
    case 'blockedByMissingTeacher':
      return ['teacher_missing', `bucket:${bucket}`]
    case 'blockedByMissingClassGroup':
      return ['class_group_missing', `bucket:${bucket}`]
    case 'blockedByAmbiguousMapping':
      return ['ambiguous_mapping', `bucket:${bucket}`]
    case 'blockedByInvalidHours':
      return ['weekly_hours_non_numeric', `bucket:${bucket}`]
    case 'blockedByInvalidExamType':
      return ['exam_type_other', `bucket:${bucket}`]
    case 'blockedByLowConfidence':
      return ['low_confidence', `bucket:${bucket}`]
    case 'blockedByTargetSemesterMismatch':
      return ['target_semester_mismatch', `bucket:${bucket}`]
    case 'needsHumanReview':
      return ['manual_review_required', `bucket:${bucket}`]
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a target-semester-bound approval package from an L4 dry-run result.
 *
 * Pure, deterministic, no I/O, no Prisma. The caller is responsible for:
 *  - Running the L4 dry-run with `existingData` already scoped to the
 *    target semester (via `loadCourseSettingExistingDataForSemester`).
 *  - Passing the resulting `CourseSettingTeachingTaskDryRunResult` plus
 *    a redacted `CourseSettingApprovalTargetSemester` and a redacted
 *    `CourseSettingApprovalSourceArtifact`.
 *
 * Output invariants:
 *  - Every `reviewItem.reviewDecision === 'pending'`.
 *  - `approvalSummary.approvedItems === 0` and `rejectedItems === 0`.
 *  - `applyAllowed === false` literal type.
 *  - All 7 gates are explicitly `false` except `targetSemesterBound: true`.
 *  - Raw teacher / class / course / remark / sheet text NEVER appears in
 *    the returned object.
 */
export const buildCourseSettingApprovalPackageWithTargetSemester = (input: {
  dryRunResult: CourseSettingTeachingTaskDryRunResult
  targetSemester: CourseSettingApprovalTargetSemester
  sourceArtifact: CourseSettingApprovalSourceArtifact
  options?: CourseSettingApprovalPackageOptions
}): CourseSettingApprovalPackageResult => {
  const { dryRunResult, targetSemester, sourceArtifact } = input
  const options = input.options ?? {}
  const packageVersion =
    options.packageVersion ?? L6_D_APPROVAL_PACKAGE_VERSION
  const maxReviewRows =
    options.maxReviewRows ?? Number.POSITIVE_INFINITY

  const reviewItems: CourseSettingApprovalReviewItem[] = []
  let needsReviewItems = 0
  let blockedItems = 0
  let autoSafeCandidates = 0
  // L7-A3: separate counter for new course candidates (NOT blockers).
  let newCourseCandidateItems = 0

  const previews: CourseSettingTeachingTaskDryRunPreviewCandidate[] =
    dryRunResult.previewCandidates

  for (let i = 0; i < previews.length && reviewItems.length < maxReviewRows; i++) {
    const pc = previews[i]!

    // candidateKey format is `task:<sheet>:<row>` per L4 (see L5 helper parsing
    // logic). Fall back to pc.sheetIndex / pc.sourceRowIndex if the regex
    // doesn't match (defensive — should always match for L4 output).
    const m = /^task:(\d+):(\d+)$/.exec(pc.candidateKey)
    const sheetIndex = m && m[1] ? parseInt(m[1], 10) : pc.sheetIndex
    const sourceRowIndex =
      m && m[2] ? parseInt(m[2], 10) : pc.sourceRowIndex

    const approvalItemId = `approval:${sheetIndex}:${sourceRowIndex}`

    const suggested = suggestAction(
      pc.courseMatchStatus,
      pc.teacherMatchStatuses,
      pc.classGroupMatchStatuses,
      pc.diagnosticCodes,
      pc.confidence,
    )

    const blockingReasons = blockingReasonsFor(
      suggested,
      pc.taskMatchStatus ?? pc.splitPlan ?? 'unknown',
    )

    if (suggested === 'approveCandidate') autoSafeCandidates += 1
    else if (suggested === 'newCourseCandidate') {
      // L7-A3: new course candidates are NOT blockers. Tracked separately
      // in approvalSummary.newCourseCandidateItems.
      newCourseCandidateItems += 1
    } else if (suggested.startsWith('blockedBy')) blockedItems += 1
    else needsReviewItems += 1

    const item: CourseSettingApprovalReviewItem = {
      approvalItemId,
      reviewDecision: 'pending',
      sourceRef: {
        sheetIndex,
        sheetNameHash: sheetNameHash(sheetIndex),
        sourceRowIndex,
      },
      targetSemesterRef: {
        semesterId: targetSemester.id,
        semesterIdHash: targetSemester.idHash,
      },
      candidateRefs: {
        teachingTaskCandidateKey: pc.candidateKey,
        teacherCandidateKeys: [],
        classGroupCandidateKeys: [],
        teachingTaskClassCandidateKeys: [],
      },
      classifications: {
        splitPlan: pc.splitPlan,
        taskMatchStatus: pc.taskMatchStatus,
        courseMatchStatus: pc.courseMatchStatus,
        teacherMatchStatusSummary: teacherStatusSummary(pc.teacherMatchStatuses),
        classGroupMatchStatusSummary: classGroupStatusSummary(
          pc.classGroupMatchStatuses,
        ),
        weeklyHoursClassification: pc.weeklyHoursClassification,
        examTypeClassification: pc.examTypeClassification,
      },
      suggestedAction: suggested,
      blockingReasons,
      diagnosticCodes: pc.diagnosticCodes,
      confidence: pc.confidence,
    }
    reviewItems.push(item)
  }

  // -- Compute dry-run fingerprint -----------------------------------------
  // SHA256 over a stable canonical projection of the dry-run summary + the
  // approval-item fingerprints (so the fingerprint changes iff the dry-run
  // input or the per-item classifications change). No raw values are mixed
  // in. The verifier recomputes this and compares.
  const fingerprintParts: string[] = [
    `mapper:${dryRunResult.mapperVersion}`,
    `parser:${dryRunResult.parser.parserVersion}`,
    `totalCourseRows:${dryRunResult.parser.totalCourseRows}`,
    `teachingTaskCandidates:${dryRunResult.candidateSummary.teachingTaskCandidates}`,
    `teachingTaskClassCandidates:${dryRunResult.candidateSummary.teachingTaskClassCandidates}`,
    `rowsNeedingManualReview:${dryRunResult.candidateSummary.rowsNeedingManualReview}`,
    `existingDataSummary:${JSON.stringify(dryRunResult.existingDataSummary)}`,
    `matchSummary:${JSON.stringify(dryRunResult.matchSummary)}`,
    `sourceEvidenceSummary:${JSON.stringify(dryRunResult.sourceEvidenceSummary)}`,
    `diagnosticsSummary:${JSON.stringify(dryRunResult.diagnosticsSummary)}`,
    `targetSemesterId:${targetSemester.id}`,
    `approvalItems:${reviewItems.length}`,
  ]
  for (const it of reviewItems) {
    fingerprintParts.push(
      `${it.approvalItemId}|${it.classifications.taskMatchStatus ?? ''}|${it.classifications.splitPlan ?? ''}|${it.classifications.courseMatchStatus ?? ''}|${it.confidence}|${it.diagnosticCodes.join(',')}`,
    )
  }
  const fingerprintHash = sha256Hex(fingerprintParts.join('\n'))

  return {
    stage: L6_D_STAGE,
    packageVersion,
    approvalOnly: true,
    dryRunOnly: true,
    dbWritten: false,
    applyAllowed: false,

    targetSemester,
    sourceArtifact,

    dryRunFingerprint: {
      totalCourseRows: dryRunResult.parser.totalCourseRows,
      teachingTaskCandidates: dryRunResult.candidateSummary.teachingTaskCandidates,
      teachingTaskClassCandidates:
        dryRunResult.candidateSummary.teachingTaskClassCandidates,
      rowsNeedingManualReview:
        dryRunResult.candidateSummary.rowsNeedingManualReview,
      sourceEvidenceCoverage:
        dryRunResult.sourceEvidenceSummary.coveragePercent,
      hash: fingerprintHash,
    },

    approvalSummary: {
      totalItems: reviewItems.length,
      allDecisionsPending: true,
      approvedItems: 0,
      rejectedItems: 0,
      needsReviewItems,
      blockedItems,
      autoSafeCandidates,
      newCourseCandidateItems,
      courseNameMissingItems: reviewItems.filter(
        (it) => it.suggestedAction === 'blockedByMissingCourse',
      ).length,
    },

    reviewItems,

    gates: {
      targetSemesterBound: true,
      reviewPackageApproved: false,
      dbBackupCreated: false,
      dryRunReplayMatchesApprovedPackage: false,
      importBatchPlanGenerated: false,
      rollbackPlanGenerated: false,
      sourceEvidencePlanConfirmed: false,
    },

    rawDisplayPolicy: {
      runtimeUiRawAllowed: true,
      approvalPackageRawIncluded: false,
      committedDocsRawAllowed: false,
      localArtifactRawIncluded: false,
      scope: 'authorized-admin-preview-only',
    },

    privacy: {
      rawTeacherNamesIncluded: false,
      rawClassNamesIncluded: false,
      rawCourseNamesIncluded: false,
      rawRemarksIncluded: false,
      rawRowsIncluded: false,
    },
  }
}

/**
 * Serialize a redacted local-artifact JSON string for the gitignored local
 * approval package. Pure: no I/O. The caller writes the string to a file.
 *
 * The local artifact mirrors the in-memory `CourseSettingApprovalPackageResult`
 * with the following additions:
 *  - `generatedAt` (informational ISO timestamp)
 *  - `packageSha256` (caller-computed SHA256 of the artifact — pinned after
 *    the first write so the SHA256 reflects the artifact itself)
 *  - `approvalPackageRawIncluded: false` (privacy manifest)
 *
 * The artifact remains redacted: hashes / candidate keys / classifications /
 * diagnostic codes / counts only. No raw teacher / class / course / remark /
 * sheet text is placed in any field. Sheet names are sha256-prefix-12.
 */
export const serializeCourseSettingApprovalPackageLocalArtifact = (
  result: CourseSettingApprovalPackageResult,
  generatedAt: string,
  packageSha256?: string,
): string => {
  const obj = {
    stage: result.stage,
    packageType: 'target-semester-approval-package' as const,
    packageVersion: result.packageVersion,
    generatedAt,
    approvalOnly: true,
    dryRunOnly: true,
    dbWritten: false,
    applyAllowed: false,
    approvalPackageRawIncluded: false,

    targetSemester: result.targetSemester,
    sourceArtifact: result.sourceArtifact,
    dryRunFingerprint: result.dryRunFingerprint,
    approvalSummary: result.approvalSummary,
    gates: result.gates,
    rawDisplayPolicy: result.rawDisplayPolicy,
    privacy: result.privacy,

    reviewItemCount: result.reviewItems.length,
    packageSha256: packageSha256 ?? null,
    items: result.reviewItems,
  }
  return JSON.stringify(obj, null, 2) + '\n'
}