/**
 * L5 Review Package Helper — Course Setting XLSX → Manual Review Package + Safe Confirm Plan
 *
 * Stage: L5-XLSX-COURSE-SETTING-REVIEW-PACKAGE-AND-SAFE-CONFIRM-PLAN
 *
 * Pure, in-memory helper that consumes an L4 `CourseSettingTeachingTaskDryRunResult`
 * and produces:
 *   - A `CourseSettingReviewPackageResult` with `reviewItems` (every item has
 *     `reviewDecision: 'pending'` — L5 never auto-approves), bucket distribution,
 *     safe confirm plan, and a privacy manifest.
 *   - All output is sanitized: hashes / ids / counts / classifications only.
 *     No raw teacher / class / course / remark / sheet text is placed in any
 *     field. The local artifact (written by the verify script) mirrors this
 *     contract.
 *
 * Hard constraints:
 *  - No Prisma, no DB writes, no filesystem writes, no API/UI coupling.
 *  - Deterministic: same `dryRunResult + options` → identical result.
 *  - `applyAllowedInL5: false` literal; `createScheduleSlots: false` literal.
 *  - `targetSemesterConfirmed` defaults to `false`; this short-circuits all
 *    items to the `TARGET_SEMESTER_REQUIRED` bucket, which is the correct,
 *    conservative outcome for the current sample (xlsx 2025秋 vs DB 2025-2026春).
 *
 * Relationship to prior stages:
 *  - L1: structural xlsx audit (no parser).
 *  - L2: pure xlsx parser → `CourseSettingXlsxParseResult`.
 *  - L3: preview-only API/UI over L2 (no DB).
 *  - L4: dry-run candidate mapping → `CourseSettingTeachingTaskDryRunResult`.
 *  - L5 (this): review package + safe confirm plan (still no DB, no apply).
 *    L6 will be the actual apply stage (with target semester + approval gate).
 *
 * L6-0 reuse: the helpers below (`buildFullCourseSettingReviewPackage` and
 * `serializeFullReviewPackageLocalArtifact`) consume this file unchanged to
 * emit a full (uncapped) redacted review package covering every L4
 * `teachingTaskCandidate`. The L5 review-only contract
 * (`reviewOnly=true`, `dryRunOnly=true`, `dbWritten=false`,
 * `applyAllowedInL5=false`) is preserved verbatim.
 */

import { createHash } from 'node:crypto'
import type { CourseSettingTeachingTaskDryRunResult } from './course-setting-teaching-task-dry-run'

// ---------------------------------------------------------------------------
// Stage constants
// ---------------------------------------------------------------------------

export const L5_STAGE =
  'L5-XLSX-COURSE-SETTING-REVIEW-PACKAGE-AND-SAFE-CONFIRM-PLAN' as const
export const L5_REVIEW_PACKAGE_VERSION = 'l5-review-package-v1' as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CourseSettingReviewPackageOptions = {
  packageVersion?: string
  includeRawValues?: boolean // default false; L5 must keep false
  maxReviewRows?: number // default = unbounded (consume all previewCandidates)
  confidenceThreshold?: number // default 0.9 (stricter than L4's 0.8)
  targetSemesterConfirmed?: boolean // default false; no UI in L5
}

export type CourseSettingReviewBucket =
  | 'AUTO_SAFE_CANDIDATE'
  | 'TARGET_SEMESTER_REQUIRED'
  | 'MISSING_COURSE'
  | 'MISSING_TEACHER'
  | 'MISSING_CLASS_GROUP'
  | 'COUNT_ONLY_CLASS_GROUP'
  | 'UNRESOLVED_CLASS_GROUP'
  | 'TEACHER_BLANK'
  | 'TEACHER_SCOPE_SPLIT_REQUIRED'
  | 'INVALID_WEEKLY_HOURS'
  | 'INVALID_EXAM_TYPE'
  | 'MERGE_REMARK_AMBIGUOUS'
  | 'LOW_CONFIDENCE'
  | 'POSSIBLE_EXISTING_TASK'
  | 'BLOCKED'

export type CourseSettingReviewItemSuggestedAction =
  | 'approveCandidate'
  | 'rejectCandidate'
  | 'needsHumanReview'
  | 'blockedUntilTargetSemesterConfirmed'
  | 'blockedByMissingCourse'
  | 'blockedByMissingTeacher'
  | 'blockedByMissingClassGroup'
  | 'blockedByAmbiguousMapping'
  | 'blockedByInvalidHours'
  | 'blockedByInvalidExamType'
  | 'blockedByLowConfidence'

export type CourseSettingReviewItem = {
  reviewItemId: string
  source: {
    sheetIndex: number
    sourceRowIndex: number
    sourceSheetNameHash: string
    sourceCourseNameHash?: string
    sourceTeacherRawHash?: string
    sourceClassCountRawHash?: string
    sourceRemarkHash?: string
    sourceMergeRemarkHash?: string
  }
  candidateRefs: {
    teachingTaskCandidateKey?: string
    courseCandidateKey?: string
    teacherCandidateKeys: string[]
    classGroupCandidateKeys: string[]
    teachingTaskClassCandidateKeys: string[]
  }
  classifications: {
    courseMatchStatus?: string
    teacherMatchStatusSummary?: Record<string, number>
    classGroupMatchStatusSummary?: Record<string, number>
    splitPlan?: string
    taskMatchStatus?: string
  }
  reviewDecision: 'pending'
  suggestedAction: CourseSettingReviewItemSuggestedAction
  blockingReasons: string[]
  diagnosticCodes: string[]
  confidence: number
}

export type CourseSettingReviewBucketSummary = {
  bucket: CourseSettingReviewBucket
  count: number
  description: string
}

export type CourseSettingSafeConfirmPlan = {
  recommendedNextStage: string
  applyAllowedInL5: false
  requiredGates: {
    targetSemesterConfirmed: false
    reviewPackageApproved: false
    dbBackupCreated: false
    dryRunReplayMatchesApprovedPackage: false
    importBatchPlanGenerated: false
    rollbackPlanGenerated: false
    sourceEvidencePlanConfirmed: false
  }
  targetSemesterStrategy: {
    status: 'required'
    reason: string
    options: Array<{
      option: string
      description: string
      risk: 'low' | 'medium' | 'high'
      recommended: boolean
    }>
  }
  transactionPlan: { steps: string[]; rollbackStrategy: string[]; idempotencyStrategy: string[] }
  applyPlanDraft: {
    createImportBatch: true
    createMissingCourses: true
    createMissingTeachers: true
    createMissingClassGroups: true
    createTeachingTasks: true
    createTeachingTaskClasses: true
    writeSourceEvidence: true
    createScheduleSlots: false
  }
  safetyChecksBeforeApply: string[]
  safetyChecksAfterApply: string[]
}

export type CourseSettingReviewPrivacySummary = {
  rawTeacherNamesCommitted: false
  rawClassNamesCommitted: false
  rawCourseNamesCommitted: false
  rawRemarksCommitted: false
  rawRowsCommitted: false
  rawSheetNamesCommitted: false
  phoneNumbersCommitted: false
}

export type CourseSettingReviewPackageResult = {
  stage: typeof L5_STAGE
  packageVersion: string
  reviewOnly: true
  dryRunOnly: true
  dbWritten: false
  inputSummary: {
    totalCourseRows: number
    teachingTaskCandidates: number
    teachingTaskClassCandidates: number
    rowsNeedingManualReview: number
  }
  reviewSummary: {
    totalReviewItems: number
    autoSafeCandidates: number
    blockedCandidates: number
    manualReviewRequired: number
    rejectedByRule: number
    allDecisionsPending: true
  }
  buckets: CourseSettingReviewBucketSummary[]
  reviewItems: CourseSettingReviewItem[]
  safeConfirmPlan: CourseSettingSafeConfirmPlan
  diagnosticsSummary: { total: number; byCode: Record<string, number> }
  privacy: CourseSettingReviewPrivacySummary
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const BUCKET_DESCRIPTIONS: Record<CourseSettingReviewBucket, string> = {
  AUTO_SAFE_CANDIDATE: 'all entities exact, no risky diagnostics, confidence >= threshold; still requires human review in L5',
  TARGET_SEMESTER_REQUIRED: 'gate-level bucket: target semester not confirmed yet; all rows route here when targetSemesterConfirmed=false',
  MISSING_COURSE: 'course not found in existing courses',
  MISSING_TEACHER: 'teacher not found in existing teachers',
  MISSING_CLASS_GROUP: 'constructed class group name not found in existing class groups',
  COUNT_ONLY_CLASS_GROUP: 'class count has only a student count, no class label resolvable',
  UNRESOLVED_CLASS_GROUP: 'class count did not match any known pattern (other)',
  TEACHER_BLANK: 'teacher assignment is blank (business-empty)',
  TEACHER_SCOPE_SPLIT_REQUIRED: 'bankSplit or numbered teacher scope requires task split review',
  INVALID_WEEKLY_HOURS: 'weekly hours not numeric',
  INVALID_EXAM_TYPE: 'exam type not 试 or 查',
  MERGE_REMARK_AMBIGUOUS: 'merge remark is non-empty with no class marker',
  LOW_CONFIDENCE: 'parsed row confidence below threshold',
  POSSIBLE_EXISTING_TASK: 'course exact AND an existing teaching task has the same courseId (potential duplicate)',
  BLOCKED: 'catch-all blocked bucket for items that did not match a more specific bucket',
}

const BLOCKED_BUCKETS = new Set<CourseSettingReviewBucket>([
  'TARGET_SEMESTER_REQUIRED',
  'MISSING_COURSE',
  'MISSING_TEACHER',
  'MISSING_CLASS_GROUP',
  'COUNT_ONLY_CLASS_GROUP',
  'UNRESOLVED_CLASS_GROUP',
  'INVALID_WEEKLY_HOURS',
  'INVALID_EXAM_TYPE',
  'LOW_CONFIDENCE',
])

const MANUAL_REVIEW_BUCKETS = new Set<CourseSettingReviewBucket>([
  'TEACHER_SCOPE_SPLIT_REQUIRED',
  'MERGE_REMARK_AMBIGUOUS',
  'POSSIBLE_EXISTING_TASK',
  'BLOCKED',
])

const bucketFor = (
  courseMatchStatus: string,
  classGroupMatchStatuses: string[],
  teacherMatchStatuses: string[],
  splitPlan: string,
  diagnosticCodes: string[],
  confidence: number,
  confidenceThreshold: number,
  taskMatchStatus: string,
  targetSemesterConfirmed: boolean,
): CourseSettingReviewBucket => {
  if (!targetSemesterConfirmed) return 'TARGET_SEMESTER_REQUIRED'
  if (taskMatchStatus === 'possibleExisting') return 'POSSIBLE_EXISTING_TASK'
  if (taskMatchStatus === 'needsManualReview') {
    if (courseMatchStatus === 'missing') return 'MISSING_COURSE'
    if (classGroupMatchStatuses.includes('unresolved')) return 'UNRESOLVED_CLASS_GROUP'
    if (classGroupMatchStatuses.includes('countOnly')) return 'COUNT_ONLY_CLASS_GROUP'
    if (classGroupMatchStatuses.includes('missing') || classGroupMatchStatuses.includes('ambiguous')) {
      return 'MISSING_CLASS_GROUP'
    }
    if (teacherMatchStatuses.includes('missing')) return 'MISSING_TEACHER'
    if (splitPlan === 'splitByTeacherScope') return 'TEACHER_SCOPE_SPLIT_REQUIRED'
    if (diagnosticCodes.includes('WEEKLY_HOURS_NON_NUMERIC')) return 'INVALID_WEEKLY_HOURS'
    if (diagnosticCodes.includes('EXAM_TYPE_OTHER')) return 'INVALID_EXAM_TYPE'
    if (diagnosticCodes.includes('MERGE_REMARK_AMBIGUOUS')) return 'MERGE_REMARK_AMBIGUOUS'
    if (confidence < confidenceThreshold) return 'LOW_CONFIDENCE'
    return 'BLOCKED'
  }
  // taskMatchStatus === 'newCandidate' / 'ambiguousExisting' / 'skipped'
  // Strict auto-safe requires every signal to be clean.
  const allClean =
    courseMatchStatus === 'exact' &&
    teacherMatchStatuses.every((s) => s === 'exact' || s === 'blank') &&
    classGroupMatchStatuses.every((s) => s === 'exact') &&
    !diagnosticCodes.includes('WEEKLY_HOURS_NON_NUMERIC') &&
    !diagnosticCodes.includes('EXAM_TYPE_OTHER') &&
    !diagnosticCodes.includes('MERGE_REMARK_AMBIGUOUS') &&
    !diagnosticCodes.includes('LOW_CONFIDENCE_ROW') &&
    confidence >= confidenceThreshold
  if (allClean) return 'AUTO_SAFE_CANDIDATE'
  return 'BLOCKED'
}

const suggestedActionFor = (bucket: CourseSettingReviewBucket): CourseSettingReviewItemSuggestedAction => {
  switch (bucket) {
    case 'AUTO_SAFE_CANDIDATE':
      return 'approveCandidate'
    case 'TARGET_SEMESTER_REQUIRED':
      return 'blockedUntilTargetSemesterConfirmed'
    case 'MISSING_COURSE':
      return 'blockedByMissingCourse'
    case 'MISSING_TEACHER':
      return 'blockedByMissingTeacher'
    case 'MISSING_CLASS_GROUP':
    case 'COUNT_ONLY_CLASS_GROUP':
    case 'UNRESOLVED_CLASS_GROUP':
      return 'blockedByMissingClassGroup'
    case 'INVALID_WEEKLY_HOURS':
      return 'blockedByInvalidHours'
    case 'INVALID_EXAM_TYPE':
      return 'blockedByInvalidExamType'
    case 'LOW_CONFIDENCE':
      return 'blockedByLowConfidence'
    case 'MERGE_REMARK_AMBIGUOUS':
    case 'TEACHER_SCOPE_SPLIT_REQUIRED':
    case 'POSSIBLE_EXISTING_TASK':
    case 'BLOCKED':
    case 'TEACHER_BLANK':
      return 'needsHumanReview'
  }
}

const blockingReasonsFor = (bucket: CourseSettingReviewBucket): string[] => {
  switch (bucket) {
    case 'TARGET_SEMESTER_REQUIRED':
      return ['target_semester_not_confirmed']
    case 'MISSING_COURSE':
      return ['course_missing']
    case 'MISSING_TEACHER':
      return ['teacher_missing']
    case 'MISSING_CLASS_GROUP':
      return ['class_group_missing']
    case 'COUNT_ONLY_CLASS_GROUP':
      return ['class_group_count_only']
    case 'UNRESOLVED_CLASS_GROUP':
      return ['class_group_unresolved']
    case 'TEACHER_BLANK':
      return ['teacher_blank']
    case 'TEACHER_SCOPE_SPLIT_REQUIRED':
      return ['teacher_scope_split_required']
    case 'INVALID_WEEKLY_HOURS':
      return ['weekly_hours_non_numeric']
    case 'INVALID_EXAM_TYPE':
      return ['exam_type_other']
    case 'MERGE_REMARK_AMBIGUOUS':
      return ['merge_remark_ambiguous']
    case 'LOW_CONFIDENCE':
      return ['low_confidence']
    case 'POSSIBLE_EXISTING_TASK':
      return ['possible_existing_teaching_task']
    case 'BLOCKED':
      return ['unclassified_blocked']
    case 'AUTO_SAFE_CANDIDATE':
      return ['auto_safe_requires_human_review_in_l5']
  }
}

const teacherStatusSummary = (statuses: string[]): Record<string, number> => {
  const m: Record<string, number> = {}
  for (const s of statuses) m[s] = (m[s] ?? 0) + 1
  return m
}

const classGroupStatusSummary = (statuses: string[]): Record<string, number> => {
  const m: Record<string, number> = {}
  for (const s of statuses) m[s] = (m[s] ?? 0) + 1
  return m
}

const safeConfirmPlan = (): CourseSettingSafeConfirmPlan => ({
  recommendedNextStage: 'L6-XLSX-COURSE-SETTING-APPLY-CONFIRMED',
  applyAllowedInL5: false,
  requiredGates: {
    targetSemesterConfirmed: false,
    reviewPackageApproved: false,
    dbBackupCreated: false,
    dryRunReplayMatchesApprovedPackage: false,
    importBatchPlanGenerated: false,
    rollbackPlanGenerated: false,
    sourceEvidencePlanConfirmed: false,
  },
  targetSemesterStrategy: {
    status: 'required',
    reason:
      'xlsx is 2025秋季学期; current DB is 2025-2026春季学期; L4 cross-semester match is low (22/408 course, 71/306 teacher, 14/184 classGroup exact) which is expected. Future apply MUST be scoped to a confirmed 2025秋季 Semester (Option A).',
    options: [
      {
        option: 'A-confirm-or-create-2025-fall-semester',
        description:
          'Confirm or create 2025秋季 Semester via K25-C-style insert; re-run L4 against the confirmed semester; ClassGroup/TeachingTask scoped by semesterId.',
        risk: 'medium',
        recommended: true,
      },
      {
        option: 'B-force-active-semester',
        description:
          'Force-apply to the currently active semester (2025-2026春季). This will produce 1099/1116 manual-review rows AND pollute the spring DB with fall courses/teachers/classes. NOT recommended.',
        risk: 'high',
        recommended: false,
      },
      {
        option: 'C-keep-review-only',
        description:
          'Defer any DB apply. Continue refining the L4 parser/mapper and let the user confirm xlsx contents and target semester. L6 will not run until Option A is selected.',
        risk: 'low',
        recommended: false,
      },
    ],
  },
  transactionPlan: {
    steps: [
      'BEGIN TRANSACTION',
      'UPSERT Course (idempotent by nameHash)',
      'UPSERT Teacher (idempotent by nameHash)',
      'UPSERT ClassGroup scoped to targetSemesterId (idempotent by (semesterId, nameHash))',
      'CREATE TeachingTask (idempotent by (semesterId, courseId, teacherId, remark))',
      'CREATE TeachingTaskClass (idempotent by (teachingTaskId, classGroupId))',
      'FORWARD-FILL source evidence on TeachingTaskClass (importBatchId, sourceArtifactFilename, sourceRowIndex, sourceSheetNameHash, sourceKeyword, sourceClassName, sourceRemark, matchStrategy, matchConfidence)',
      'CREATE ImportBatch provenance record',
      'COMMIT',
    ],
    rollbackStrategy: [
      'capture DB backup before BEGIN (prisma/dev.db.backup-before-l6-<timestamp>)',
      'on any error during transaction: ROLLBACK',
      'if transaction commits but post-apply audit fails: restore from pre-L6 backup',
      'log dry-run plan + actual diff for audit trail',
    ],
    idempotencyStrategy: [
      'match Course by nameHash (sha256-prefix-12)',
      'match Teacher by nameHash',
      'match ClassGroup by (semesterId, nameHash)',
      'match TeachingTask by (semesterId, courseId, teacherId, remark)',
      'match TeachingTaskClass by (teachingTaskId, classGroupId)',
      'use upsert with the above match keys so re-running the same approved package is a no-op',
    ],
  },
  applyPlanDraft: {
    createImportBatch: true,
    createMissingCourses: true,
    createMissingTeachers: true,
    createMissingClassGroups: true,
    createTeachingTasks: true,
    createTeachingTaskClasses: true,
    writeSourceEvidence: true,
    createScheduleSlots: false,
  },
  safetyChecksBeforeApply: [
    'review package approved by ADMIN',
    'target semester confirmed (Option A selected and Semester row exists)',
    'DB backup created and SHA256 verified',
    'dry-run replay produces identical result to approved package (re-execute L4 against same xlsx + existingData, compare JSON-strip-generatedAt)',
    'no parallel writers (single-instance apply gate)',
    'confirmText entered verbatim ("CONFIRM_APPLY_L5")',
  ],
  safetyChecksAfterApply: [
    'row count diff vs dry-run plan (TeachingTask / TeachingTaskClass / ClassGroup counts within tolerance)',
    'TeachingTaskClass source evidence coverage (every link has importBatchId + sourceRowIndex + sourceArtifactFilename)',
    'no orphan rows (every ClassGroup linked to a TeachingTask)',
    'K22-C regression still PASS (73/0/0/0)',
    'audit log emitted to docs/l6-audit.json with sha256 fingerprints',
  ],
})

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a review package from an L4 dry-run result.
 *
 * Pure, deterministic, no I/O, no Prisma. The returned `reviewItems` all have
 * `reviewDecision: 'pending'`; the helper never auto-approves. The returned
 * `safeConfirmPlan` always has `applyAllowedInL5: false`.
 */
export const buildCourseSettingReviewPackage = (
  dryRunResult: CourseSettingTeachingTaskDryRunResult,
  options: CourseSettingReviewPackageOptions = {},
): CourseSettingReviewPackageResult => {
  const confidenceThreshold = options.confidenceThreshold ?? 0.9
  const maxReviewRows = options.maxReviewRows ?? Number.POSITIVE_INFINITY
  const targetSemesterConfirmed = options.targetSemesterConfirmed ?? false
  const packageVersion = options.packageVersion ?? L5_REVIEW_PACKAGE_VERSION

  // -- Build review items from L4 preview candidates -----------------------
  const reviewItems: CourseSettingReviewItem[] = []
  const bucketCounts: Record<CourseSettingReviewBucket, number> = {
    AUTO_SAFE_CANDIDATE: 0,
    TARGET_SEMESTER_REQUIRED: 0,
    MISSING_COURSE: 0,
    MISSING_TEACHER: 0,
    MISSING_CLASS_GROUP: 0,
    COUNT_ONLY_CLASS_GROUP: 0,
    UNRESOLVED_CLASS_GROUP: 0,
    TEACHER_BLANK: 0,
    TEACHER_SCOPE_SPLIT_REQUIRED: 0,
    INVALID_WEEKLY_HOURS: 0,
    INVALID_EXAM_TYPE: 0,
    MERGE_REMARK_AMBIGUOUS: 0,
    LOW_CONFIDENCE: 0,
    POSSIBLE_EXISTING_TASK: 0,
    BLOCKED: 0,
  }

  for (const pc of dryRunResult.previewCandidates) {
    if (reviewItems.length >= maxReviewRows) break
    // Parse sheetIndex / sourceRowIndex from candidateKey (`task:<sheet>:<row>`)
    const m = /^task:(\d+):(\d+)$/.exec(pc.candidateKey)
    const sheetIndex = m && m[1] ? parseInt(m[1], 10) : pc.sheetIndex
    const sourceRowIndex = m && m[2] ? parseInt(m[2], 10) : pc.sourceRowIndex

    const bucket = bucketFor(
      pc.courseMatchStatus,
      pc.classGroupMatchStatuses,
      pc.teacherMatchStatuses,
      pc.splitPlan,
      pc.diagnosticCodes,
      pc.confidence,
      confidenceThreshold,
      pc.taskMatchStatus,
      targetSemesterConfirmed,
    )
    bucketCounts[bucket] += 1

    const reviewItemId = `review:${sheetIndex}:${sourceRowIndex}`
    const item: CourseSettingReviewItem = {
      reviewItemId,
      source: {
        sheetIndex,
        sourceRowIndex,
        sourceSheetNameHash: createHash('sha256')
          .update(`sheet:${sheetIndex}`)
          .digest('hex')
          .slice(0, 12),
      },
      candidateRefs: {
        teachingTaskCandidateKey: pc.candidateKey,
        teacherCandidateKeys: [],
        classGroupCandidateKeys: [],
        teachingTaskClassCandidateKeys: [],
      },
      classifications: {
        courseMatchStatus: pc.courseMatchStatus,
        teacherMatchStatusSummary: teacherStatusSummary(pc.teacherMatchStatuses),
        classGroupMatchStatusSummary: classGroupStatusSummary(pc.classGroupMatchStatuses),
        splitPlan: pc.splitPlan,
        taskMatchStatus: pc.taskMatchStatus,
      },
      reviewDecision: 'pending',
      suggestedAction: suggestedActionFor(bucket),
      blockingReasons: blockingReasonsFor(bucket),
      diagnosticCodes: pc.diagnosticCodes,
      confidence: pc.confidence,
    }
    reviewItems.push(item)
  }

  // -- Aggregate diagnostics ---------------------------------------------
  const byCode: Record<string, number> = {}
  for (const it of reviewItems) {
    for (const c of it.diagnosticCodes) byCode[c] = (byCode[c] ?? 0) + 1
  }

  // -- Bucket summary (all 15 buckets always emitted, even if count=0) ----
  const allBuckets: CourseSettingReviewBucket[] = [
    'AUTO_SAFE_CANDIDATE',
    'TARGET_SEMESTER_REQUIRED',
    'MISSING_COURSE',
    'MISSING_TEACHER',
    'MISSING_CLASS_GROUP',
    'COUNT_ONLY_CLASS_GROUP',
    'UNRESOLVED_CLASS_GROUP',
    'TEACHER_BLANK',
    'TEACHER_SCOPE_SPLIT_REQUIRED',
    'INVALID_WEEKLY_HOURS',
    'INVALID_EXAM_TYPE',
    'MERGE_REMARK_AMBIGUOUS',
    'LOW_CONFIDENCE',
    'POSSIBLE_EXISTING_TASK',
    'BLOCKED',
  ]
  const buckets: CourseSettingReviewBucketSummary[] = allBuckets.map((b) => ({
    bucket: b,
    count: bucketCounts[b],
    description: BUCKET_DESCRIPTIONS[b],
  }))

  // -- review summary ------------------------------------------------------
  let autoSafeCandidates = 0
  let blockedCandidates = 0
  let manualReviewRequired = 0
  for (const b of allBuckets) {
    if (b === 'AUTO_SAFE_CANDIDATE') autoSafeCandidates = bucketCounts[b]
    else if (BLOCKED_BUCKETS.has(b)) blockedCandidates += bucketCounts[b]
    else if (MANUAL_REVIEW_BUCKETS.has(b)) manualReviewRequired += bucketCounts[b]
  }
  const reviewSummary = {
    totalReviewItems: reviewItems.length,
    autoSafeCandidates,
    blockedCandidates,
    manualReviewRequired,
    rejectedByRule: 0, // L5 never auto-rejects; all decisions are pending.
    allDecisionsPending: true as const,
  }

  // -- Result -------------------------------------------------------------
  return {
    stage: L5_STAGE,
    packageVersion,
    reviewOnly: true,
    dryRunOnly: true,
    dbWritten: false,
    inputSummary: {
      totalCourseRows: dryRunResult.parser.totalCourseRows,
      teachingTaskCandidates: dryRunResult.candidateSummary.teachingTaskCandidates,
      teachingTaskClassCandidates: dryRunResult.candidateSummary.teachingTaskClassCandidates,
      rowsNeedingManualReview: dryRunResult.candidateSummary.rowsNeedingManualReview,
    },
    reviewSummary,
    buckets,
    reviewItems,
    safeConfirmPlan: safeConfirmPlan(),
    diagnosticsSummary: {
      total: Object.values(byCode).reduce((a, b) => a + b, 0),
      byCode,
    },
    privacy: {
      rawTeacherNamesCommitted: false,
      rawClassNamesCommitted: false,
      rawCourseNamesCommitted: false,
      rawRemarksCommitted: false,
      rawRowsCommitted: false,
      rawSheetNamesCommitted: false,
      phoneNumbersCommitted: false,
    },
  }
}

/**
 * Serialize a redacted local-artifact JSON string for the gitignored local
 * review package. Pure: no I/O. Caller writes the string to a file.
 *
 * The local artifact mirrors the committed reviewItems structure but adds:
 *  - `generatedAt` (informational timestamp)
 *  - `rawContentIncluded: false` (manifest)
 *  - `packageSha256` (optional caller-computed SHA256 of the artifact)
 */
export const serializeCourseSettingReviewPackageLocalArtifact = (
  result: CourseSettingReviewPackageResult,
  generatedAt: string,
  packageSha256?: string,
): string => {
  const obj = {
    stage: result.stage,
    packageVersion: result.packageVersion,
    generatedAt,
    reviewOnly: true,
    rawContentIncluded: false,
    allDecisionsPending: true,
    reviewItemCount: result.reviewItems.length,
    autoSafeCandidates: result.reviewSummary.autoSafeCandidates,
    blockedCandidates: result.reviewSummary.blockedCandidates,
    manualReviewRequired: result.reviewSummary.manualReviewRequired,
    rejectedByRule: result.reviewSummary.rejectedByRule,
    packageSha256: packageSha256 ?? null,
    items: result.reviewItems,
    buckets: result.buckets,
  }
  return JSON.stringify(obj, null, 2) + '\n'
}

// ---------------------------------------------------------------------------
// L6-0 full-package helpers
//
// These wrap the helpers above so L6-0 can emit a full (uncapped) review
// package covering every L4 `teachingTaskCandidate` (expected 1116) without
// changing the L5 review-only contract. `buildCourseSettingReviewPackage`
// already accepts `maxReviewRows: Number.POSITIVE_INFINITY` as the default;
// the wrapper simply makes that intent explicit at the call site and pins the
// other review-only invariants.
// ---------------------------------------------------------------------------

/**
 * L6-0 stage constant — surfaces in the serialized artifact's `stage` field
 * so the local review package is unambiguously identified as the L6-0
 * target-semester + full-package artifact (not an L5 preview-capped one).
 */
export const L6_0_STAGE =
  'L6-0-XLSX-COURSE-SETTING-TARGET-SEMESTER-AND-FULL-REVIEW-PACKAGE' as const

/**
 * Options for the L6-0 full review package. Deliberately omits
 * `maxReviewRows`: the full variant is always uncapped. All other L5
 * options remain tunable (e.g. `confidenceThreshold`, `packageVersion`,
 * `targetSemesterConfirmed`).
 */
export type CourseSettingFullReviewPackageOptions = Omit<
  CourseSettingReviewPackageOptions,
  'maxReviewRows'
>

/**
 * Build a full (uncapped) review package from an L4 dry-run result.
 *
 * Thin wrapper over `buildCourseSettingReviewPackage` that pins
 * `maxReviewRows` to `Number.POSITIVE_INFINITY` so every entry in
 * `dryRunResult.previewCandidates` is consumed. Same review-only
 * invariants: `reviewOnly=true`, `dryRunOnly=true`, `dbWritten=false`,
 * `applyAllowedInL5=false`, every `reviewDecision='pending'`.
 *
 * Pure, deterministic, no I/O, no Prisma.
 */
export const buildFullCourseSettingReviewPackage = (
  dryRunResult: CourseSettingTeachingTaskDryRunResult,
  options: CourseSettingFullReviewPackageOptions = {},
): CourseSettingReviewPackageResult => {
  return buildCourseSettingReviewPackage(dryRunResult, {
    ...options,
    maxReviewRows: Number.POSITIVE_INFINITY,
  })
}

/**
 * Serialize a full redacted local-artifact JSON string for the gitignored
 * local L6-0 review package. Pure: no I/O. Caller writes the string to a
 * file.
 *
 * The shape is intentionally distinct from the L5 preview artifact
 * (`serializeCourseSettingReviewPackageLocalArtifact`):
 *  - `stage` is pinned to `L6_0_STAGE` so the artifact cannot be confused
 *    with an L5 preview-capped one.
 *  - `packageType` declares `full-redacted-review-package`.
 *  - `dryRunOnly`, `dbWritten`, `targetSemesterConfirmed` are surfaced as
 *    top-level invariants so any consumer can assert them in one read.
 *  - `reviewItemCount`, `allDecisionsPending`, `autoSafeCandidates`,
 *    `blockedCandidates` mirror the same fields from the helper result
 *    for at-a-glance inspection without parsing `items`.
 *  - `items` and `buckets` use the exact same shape as the L5 helper
 *    produces (no new fields introduced on `CourseSettingReviewItem` or
 *    `CourseSettingReviewBucketSummary`).
 */
export const serializeFullReviewPackageLocalArtifact = (
  result: CourseSettingReviewPackageResult,
  generatedAt: string,
  packageSha256?: string,
): string => {
  const obj = {
    stage: L6_0_STAGE,
    packageType: 'full-redacted-review-package' as const,
    generatedAt,
    rawContentIncluded: false,
    reviewOnly: true,
    dryRunOnly: true,
    dbWritten: false,
    targetSemesterConfirmed: false,
    reviewItemCount: result.reviewItems.length,
    allDecisionsPending: true,
    autoSafeCandidates: result.reviewSummary.autoSafeCandidates,
    blockedCandidates: result.reviewSummary.blockedCandidates,
    packageSha256: packageSha256 ?? null,
    items: result.reviewItems,
    buckets: result.buckets,
  }
  return JSON.stringify(obj, null, 2) + '\n'
}
