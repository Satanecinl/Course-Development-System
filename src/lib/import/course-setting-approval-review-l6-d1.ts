/**
 * L6-D1 Approval Decision Package Helper — Course-Setting XLSX Review Workflow
 *
 * Stage: L6-D1-XLSX-COURSE-SETTING-APPROVAL-REVIEW-WORKFLOW
 *
 * Pure, in-memory helper that consumes an L6-D
 * `CourseSettingApprovalPackageResult` and produces an initial
 * `CourseSettingDecisionPackageResult`. Every decision item starts as
 * `pending` / `systemDefaultPending` / `INITIAL_PENDING` — this helper
 * NEVER auto-approves, even when the upstream L6-D package reports
 * `autoSafeCandidates > 0`.
 *
 * Hard constraints:
 *  - No Prisma, no DB writes, no filesystem writes, no API/UI coupling.
 *  - All initial decisions are pinned to `'pending'`. The helper never
 *    auto-flips a `pending` decision to `approved`/`rejected`/`needsReview`.
 *  - `applyAllowed: false` is a literal type; the package NEVER carries
 *    an apply list, import batch plan, or transaction draft.
 *  - Every decision item preserves the upstream `approvalItemId` so the
 *    future L6-D2 (human review UI) or `importedDecisionFile` can align
 *    its decisions by id.
 *  - The output is redacted: hashes / ids / counts / classifications /
 *    diagnostic codes / candidate keys / confidence / source row refs are
 *    emitted. NO raw teacher / class / course / remark / sheet text is
 *    placed in any field.
 *
 * Relationship to prior stages:
 *  - L6-D: target-semester-bound approval package. L6-D1 consumes that
 *    package unchanged; the only output of L6-D1 is the initial decision
 *    overlay + validation.
 *  - L6-D2 (planned): human review UI. Will receive a `manual` decision
 *    source and `MANUAL_*` reason codes.
 *  - L6-E (planned): apply stage. Still BLOCKED — L6-D1 keeps
 *    `applyAllowed: false` and `applyListGenerated: false`.
 *
 * Privacy contract:
 *  - The gitignored local artifact
 *    (`temp/local-artifacts/l6-d1/*.json`) is redacted (hashes / candidate
 *    keys / diagnostics only). NO raw teacher / class / course / remark
 *    / sheet text is placed in any field.
 *  - Committed docs/json only contain hashes + ids + counts + classifications.
 *  - Runtime raw preview fields live ONLY in the L6-B1 runtime API/UI for
 *    authorized admins — they MUST NOT appear in any L6-D1 output.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type {
  CourseSettingApprovalPackageResult,
  CourseSettingApprovalReviewItem,
} from './course-setting-approval-package-l6-d'

// ---------------------------------------------------------------------------
// Stage constants
// ---------------------------------------------------------------------------

export const L6_D1_STAGE =
  'L6-D1-XLSX-COURSE-SETTING-APPROVAL-REVIEW-WORKFLOW' as const
export const L6_D1_DECISION_PACKAGE_VERSION = 'l6-d1-decision-package-v1' as const

// ---------------------------------------------------------------------------
// Decision enums
// ---------------------------------------------------------------------------

export type CourseSettingApprovalDecision =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needsReview'

export type CourseSettingApprovalDecisionSource =
  | 'systemDefaultPending'
  | 'manual'
  | 'ruleAssisted'
  | 'importedDecisionFile'

export type CourseSettingApprovalDecisionReasonCode =
  | 'INITIAL_PENDING'
  | 'MANUAL_APPROVED'
  | 'MANUAL_REJECTED'
  | 'MANUAL_NEEDS_REVIEW'
  | 'BLOCKED_BY_DIAGNOSTIC'
  | 'BLOCKED_BY_MISSING_ENTITY'
  | 'LOW_CONFIDENCE'

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type CourseSettingDecisionPackageOptions = {
  /** Override the package version (default = L6_D1_DECISION_PACKAGE_VERSION). */
  packageVersion?: string
}

// ---------------------------------------------------------------------------
// Decision item type
// ---------------------------------------------------------------------------

export type CourseSettingDecisionItem = {
  approvalItemId: string

  targetSemesterRef: {
    semesterId: number
    semesterIdHash: string
  }

  /** Initial value: always `'pending'`. */
  decision: CourseSettingApprovalDecision
  /** Initial value: always `'systemDefaultPending'`. */
  decisionSource: CourseSettingApprovalDecisionSource
  /** Initial value: always `'INITIAL_PENDING'`. */
  decisionReasonCode: CourseSettingApprovalDecisionReasonCode

  /** Copied from the upstream L6-D approval item (informational). */
  suggestedAction: string
  /** Copied from the upstream L6-D approval item. */
  blockingReasons: string[]
  /** Copied from the upstream L6-D approval item. */
  diagnosticCodes: string[]
  /** Copied from the upstream L6-D approval item. */
  confidence: number

  candidateRefs: {
    teachingTaskCandidateKey?: string
    courseCandidateKey?: string
    teacherCandidateKeys: string[]
    classGroupCandidateKeys: string[]
    teachingTaskClassCandidateKeys: string[]
  }

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
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type CourseSettingDecisionBucketSummary = {
  bucket: string
  count: number
  pending: number
  approved: number
  rejected: number
  needsReview: number
}

export type CourseSettingDecisionPackageResult = {
  stage: typeof L6_D1_STAGE
  packageVersion: string

  approvalPackageRef: {
    stage: string
    packageVersion: string
    localPackageSha256: string
    dryRunFingerprintHash: string
    targetSemesterId: number
    targetSemesterIdHash: string
    itemCount: number
  }

  decisionOnly: true
  dryRunOnly: true
  dbWritten: false
  applyAllowed: false
  applyListGenerated: false

  targetSemester: {
    id: number
    idHash: string
    nameHash: string
    codeHash?: string | null
    isActive: boolean
  }

  summary: {
    totalItems: number
    pendingItems: number
    approvedItems: 0
    rejectedItems: 0
    needsReviewItems: 0
    blockedItems: number
    autoSafeCandidates: number
    allDecisionsPending: true
  }

  decisions: CourseSettingDecisionItem[]

  buckets: CourseSettingDecisionBucketSummary[]

  diagnostics: Record<string, number>

  gates: {
    approvalPackageLoaded: true
    decisionsComplete: false
    hasApprovedItems: false
    hasRejectedItems: false
    hasNeedsReviewItems: false
    applyReady: false
    dbBackupCreated: false
    dryRunReplayMatchesApprovedPackage: false
    importBatchPlanGenerated: false
    rollbackPlanGenerated: false
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
// Validation result
// ---------------------------------------------------------------------------

export type CourseSettingDecisionPackageValidationResult = {
  ok: boolean
  violations: string[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the sha256 of a string. Used by the verify script for fingerprint
 * matching against the upstream L6-D dry-run fingerprint.
 */
const sha256Hex = (s: string): string =>
  createHash('sha256').update(s, 'utf8').digest('hex')

/**
 * Compute a sha256 of the local-artifact file at `path`. The verify script
 * uses this for the `approvalPackageRef.localPackageSha256` cross-check.
 */
const sha256OfFile = (path: string): string | null => {
  if (!existsSync(path)) return null
  const buf = readFileSync(path)
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * Derive the bucket label from a single L6-D approval review item. The bucket
 * is the first non-empty token in `blockingReasons` that starts with `bucket:`,
 * falling back to the `suggestedAction`, falling back to `'unknown'`.
 *
 * Buckets are used purely for grouping in `summary.buckets`; they do not
 * affect any decision value.
 */
const bucketFor = (item: CourseSettingApprovalReviewItem): string => {
  const br = item.blockingReasons.find((r) => r.startsWith('bucket:'))
  if (br) return br.slice('bucket:'.length)
  return item.suggestedAction || 'unknown'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the initial decision package from an L6-D approval package.
 *
 * Pure, deterministic, no I/O, no Prisma. Every decision item is initialized
 * to `pending` / `systemDefaultPending` / `INITIAL_PENDING`. The
 * `autoSafeCandidates` count from the upstream package is preserved as
 * informational — it is NEVER converted into an `approved` decision.
 *
 * Caller responsibilities:
 *  - Provide a valid L6-D approval package (load via
 *    `loadL6DApprovalPackageFromLocalArtifact` or compute via the L6-D
 *    helper).
 *  - Compute `localPackageSha256` (sha256 of the local artifact file) and
 *    pass it via `options.localPackageSha256` so the result can be
 *    cross-checked by the verify script. Optional but recommended.
 */
export const buildInitialCourseSettingDecisionPackage = (input: {
  approvalPackage: CourseSettingApprovalPackageResult
  options?: CourseSettingDecisionPackageOptions & {
    localPackageSha256?: string
  }
}): CourseSettingDecisionPackageResult => {
  const { approvalPackage } = input
  const options = input.options ?? {}
  const packageVersion =
    options.packageVersion ?? L6_D1_DECISION_PACKAGE_VERSION

  const decisions: CourseSettingDecisionItem[] = approvalPackage.reviewItems.map(
    (it) => ({
      approvalItemId: it.approvalItemId,
      targetSemesterRef: {
        semesterId: it.targetSemesterRef.semesterId,
        semesterIdHash: it.targetSemesterRef.semesterIdHash,
      },
      decision: 'pending',
      decisionSource: 'systemDefaultPending',
      decisionReasonCode: 'INITIAL_PENDING',
      suggestedAction: it.suggestedAction,
      blockingReasons: it.blockingReasons,
      diagnosticCodes: it.diagnosticCodes,
      confidence: it.confidence,
      candidateRefs: {
        teachingTaskCandidateKey: it.candidateRefs.teachingTaskCandidateKey,
        teacherCandidateKeys: it.candidateRefs.teacherCandidateKeys,
        classGroupCandidateKeys: it.candidateRefs.classGroupCandidateKeys,
        teachingTaskClassCandidateKeys:
          it.candidateRefs.teachingTaskClassCandidateKeys,
      },
      sourceRef: {
        sheetIndex: it.sourceRef.sheetIndex,
        sheetNameHash: it.sourceRef.sheetNameHash,
        sourceRowIndex: it.sourceRef.sourceRowIndex,
        sourceCourseNameHash: it.sourceRef.sourceCourseNameHash,
        sourceTeacherRawHash: it.sourceRef.sourceTeacherRawHash,
        sourceClassCountRawHash: it.sourceRef.sourceClassCountRawHash,
        sourceRemarkHash: it.sourceRef.sourceRemarkHash,
        sourceMergeRemarkHash: it.sourceRef.sourceMergeRemarkHash,
      },
    }),
  )

  // Bucket summary (informational only — bucket labels come from the
  // upstream blockingReasons `bucket:` token, falling back to
  // suggestedAction).
  const bucketMap = new Map<
    string,
    { count: number; pending: number; approved: number; rejected: number; needsReview: number }
  >()
  for (const it of approvalPackage.reviewItems) {
    const b = bucketFor(it)
    const cur = bucketMap.get(b) ?? {
      count: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      needsReview: 0,
    }
    cur.count += 1
    cur.pending += 1 // all initial decisions are pending
    bucketMap.set(b, cur)
  }
  const buckets: CourseSettingDecisionBucketSummary[] = Array.from(
    bucketMap.entries(),
  )
    .map(([bucket, v]) => ({
      bucket,
      count: v.count,
      pending: v.pending,
      approved: v.approved,
      rejected: v.rejected,
      needsReview: v.needsReview,
    }))
    .sort((a, b) => (b.count - a.count) || a.bucket.localeCompare(b.bucket))

  // Diagnostics summary (informational — top-level counts of upstream
  // diagnostic codes across all items).
  const diagnostics: Record<string, number> = {}
  for (const it of approvalPackage.reviewItems) {
    for (const code of it.diagnosticCodes) {
      diagnostics[code] = (diagnostics[code] ?? 0) + 1
    }
  }

  const totalItems = decisions.length

  return {
    stage: L6_D1_STAGE,
    packageVersion,

    approvalPackageRef: {
      stage: approvalPackage.stage,
      packageVersion: approvalPackage.packageVersion,
      localPackageSha256: options.localPackageSha256 ?? '',
      dryRunFingerprintHash: approvalPackage.dryRunFingerprint.hash,
      targetSemesterId: approvalPackage.targetSemester.id,
      targetSemesterIdHash: approvalPackage.targetSemester.idHash,
      itemCount: approvalPackage.reviewItems.length,
    },

    decisionOnly: true,
    dryRunOnly: true,
    dbWritten: false,
    applyAllowed: false,
    applyListGenerated: false,

    targetSemester: {
      id: approvalPackage.targetSemester.id,
      idHash: approvalPackage.targetSemester.idHash,
      nameHash: approvalPackage.targetSemester.nameHash,
      codeHash: approvalPackage.targetSemester.codeHash ?? null,
      isActive: approvalPackage.targetSemester.isActive,
    },

    summary: {
      totalItems,
      pendingItems: totalItems,
      approvedItems: 0,
      rejectedItems: 0,
      needsReviewItems: 0,
      blockedItems: approvalPackage.approvalSummary.blockedItems,
      autoSafeCandidates: approvalPackage.approvalSummary.autoSafeCandidates,
      allDecisionsPending: true,
    },

    decisions,
    buckets,
    diagnostics,

    gates: {
      approvalPackageLoaded: true,
      decisionsComplete: false,
      hasApprovedItems: false,
      hasRejectedItems: false,
      hasNeedsReviewItems: false,
      applyReady: false,
      dbBackupCreated: false,
      dryRunReplayMatchesApprovedPackage: false,
      importBatchPlanGenerated: false,
      rollbackPlanGenerated: false,
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
 * Validate an initial decision package against the upstream approval package.
 *
 * Pure, no I/O. Returns `{ ok, violations }`. The 15 checks are:
 *
 *  1.  approval item count == decision item count
 *  2.  every decision item has an `approvalItemId` present in the approval
 *      package
 *  3.  no duplicated `approvalItemId`
 *  4.  every decision item's `targetSemesterRef.semesterId` matches the
 *      approval package's `targetSemester.id`
 *  5.  every `decision` value is one of the four allowed enum values
 *  6.  initial package has all pending decisions
 *  7.  `approvedItems === 0`
 *  8.  `rejectedItems === 0`
 *  9.  `needsReviewItems === 0`
 *  10. `applyReady === false`
 *  11. `applyAllowed === false`
 *  12. no raw fields present (privacy manifest flags are all `false`)
 *  13. `dryRunFingerprint.hash` matches between decision package ref and
 *      approval package
 *  14. no item with a blocked suggested action has been auto-approved (i.e.
 *      items with `suggestedAction.startsWith('blockedBy')` remain
 *      `pending` in the initial package)
 *  15. no apply list has been generated
 */
export const validateCourseSettingDecisionPackage = (input: {
  approvalPackage: CourseSettingApprovalPackageResult
  decisionPackage: CourseSettingDecisionPackageResult
}): CourseSettingDecisionPackageValidationResult => {
  const violations: string[] = []
  const { approvalPackage, decisionPackage } = input

  // 1. item count
  if (
    decisionPackage.decisions.length !== approvalPackage.reviewItems.length
  ) {
    violations.push(
      `[count] decision items (${decisionPackage.decisions.length}) != approval items (${approvalPackage.reviewItems.length})`,
    )
  }

  // 2. every decision item has an approvalItemId present in the approval package
  const approvalIds = new Set(approvalPackage.reviewItems.map((i) => i.approvalItemId))
  for (const d of decisionPackage.decisions) {
    if (!approvalIds.has(d.approvalItemId)) {
      violations.push(`[missing-id] decision ${d.approvalItemId} not in approval package`)
    }
  }

  // 3. no duplicated approvalItemId
  const seenIds = new Set<string>()
  for (const d of decisionPackage.decisions) {
    if (seenIds.has(d.approvalItemId)) {
      violations.push(`[dup-id] duplicate approvalItemId=${d.approvalItemId}`)
    }
    seenIds.add(d.approvalItemId)
  }

  // 4. targetSemesterId match
  for (const d of decisionPackage.decisions) {
    if (d.targetSemesterRef.semesterId !== approvalPackage.targetSemester.id) {
      violations.push(
        `[semester-mismatch] decision ${d.approvalItemId} semester=${d.targetSemesterRef.semesterId} != approval=${approvalPackage.targetSemester.id}`,
      )
    }
  }

  // 5. decision enum
  const allowedDecisions: ReadonlyArray<string> = [
    'pending',
    'approved',
    'rejected',
    'needsReview',
  ]
  for (const d of decisionPackage.decisions) {
    if (!allowedDecisions.includes(d.decision)) {
      violations.push(`[bad-decision] ${d.approvalItemId} decision=${d.decision}`)
    }
  }

  // 6. all initial pending
  const allPending = decisionPackage.decisions.every((d) => d.decision === 'pending')
  if (!allPending) {
    violations.push(`[initial-pending] not all decisions are 'pending'`)
  }

  // 7/8/9. counts
  if (decisionPackage.summary.approvedItems !== 0) {
    violations.push(`[approved-count] approvedItems=${decisionPackage.summary.approvedItems} != 0`)
  }
  if (decisionPackage.summary.rejectedItems !== 0) {
    violations.push(`[rejected-count] rejectedItems=${decisionPackage.summary.rejectedItems} != 0`)
  }
  if (decisionPackage.summary.needsReviewItems !== 0) {
    violations.push(`[needs-review-count] needsReviewItems=${decisionPackage.summary.needsReviewItems} != 0`)
  }

  // 10/11. gates
  if (decisionPackage.gates.applyReady !== false) {
    violations.push(`[apply-ready] applyReady is not false`)
  }
  if (decisionPackage.applyAllowed !== false) {
    violations.push(`[apply-allowed] applyAllowed is not false`)
  }

  // 12. no raw fields
  const p = decisionPackage.privacy
  if (
    p.rawTeacherNamesIncluded ||
    p.rawClassNamesIncluded ||
    p.rawCourseNamesIncluded ||
    p.rawRemarksIncluded ||
    p.rawRowsIncluded
  ) {
    violations.push(`[privacy] privacy flags include a raw value (decision package must be redacted)`)
  }

  // 13. dryRunFingerprint match
  if (
    decisionPackage.approvalPackageRef.dryRunFingerprintHash !==
    approvalPackage.dryRunFingerprint.hash
  ) {
    violations.push(
      `[fingerprint] decision.approvalPackageRef.dryRunFingerprintHash != approval.dryRunFingerprint.hash`,
    )
  }

  // 14. blocked items not auto-approved
  for (const d of decisionPackage.decisions) {
    if (d.suggestedAction.startsWith('blockedBy') && d.decision !== 'pending') {
      violations.push(
        `[blocked-auto-approved] ${d.approvalItemId} suggestedAction=${d.suggestedAction} decision=${d.decision}`,
      )
    }
  }

  // 15. no apply list
  if (decisionPackage.applyListGenerated !== false) {
    violations.push(`[apply-list] applyListGenerated is not false`)
  }

  return { ok: violations.length === 0, violations }
}

/**
 * Serialize a decision package to a local-artifact JSON string. Pure: no I/O.
 *
 * The caller writes the string to a gitignored local file. The artifact
 * mirrors the in-memory `CourseSettingDecisionPackageResult` with the
 * following additions:
 *  - `generatedAt` (informational ISO timestamp)
 *  - `packageSha256` (caller-computed SHA256 of the artifact)
 *  - `localArtifactRawIncluded: false` (privacy manifest)
 *
 * The artifact is redacted: hashes / candidate keys / classifications /
 * diagnostic codes / counts only. No raw teacher / class / course /
 * remark / sheet text is placed in any field.
 */
export const serializeCourseSettingDecisionPackageLocalArtifact = (
  result: CourseSettingDecisionPackageResult,
  generatedAt: string,
  packageSha256?: string,
): string => {
  const obj = {
    stage: result.stage,
    packageType: 'course-setting-approval-decision-package' as const,
    packageVersion: result.packageVersion,
    generatedAt,
    decisionOnly: true,
    dryRunOnly: true,
    dbWritten: false,
    applyAllowed: false,
    applyListGenerated: false,
    localArtifactRawIncluded: false,

    approvalPackageRef: result.approvalPackageRef,
    targetSemester: result.targetSemester,
    summary: result.summary,
    buckets: result.buckets,
    diagnostics: result.diagnostics,
    gates: result.gates,
    privacy: result.privacy,

    decisionItemCount: result.decisions.length,
    packageSha256: packageSha256 ?? null,
    items: result.decisions,
  }
  return JSON.stringify(obj, null, 2) + '\n'
}

/**
 * Convenience loader: load an L6-D approval package from its local-artifact
 * file. Pure except for the file read — the caller is responsible for the
 * gitignored path.
 *
 * Returns `null` if the file does not exist (the verify script treats this
 * as a blocker; the L6-D verify must run first to produce the artifact).
 *
 * The loader is read-only and never mutates DB or filesystem state.
 */
export const loadL6DApprovalPackageFromLocalArtifact = (input: {
  localArtifactPath: string
}): CourseSettingApprovalPackageResult | null => {
  const path = input.localArtifactPath
  if (!existsSync(path)) return null
  const text = readFileSync(path, 'utf-8')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = JSON.parse(text) as any
  // The local artifact mirrors the in-memory result with the same
  // `reviewItems` array. Re-shape into the strict type.
  return {
    stage: obj.stage,
    packageVersion: obj.packageVersion,
    approvalOnly: obj.approvalOnly,
    dryRunOnly: obj.dryRunOnly,
    dbWritten: obj.dbWritten,
    applyAllowed: obj.applyAllowed,
    targetSemester: obj.targetSemester,
    sourceArtifact: obj.sourceArtifact,
    dryRunFingerprint: obj.dryRunFingerprint,
    approvalSummary: obj.approvalSummary,
    reviewItems: obj.items as CourseSettingApprovalReviewItem[],
    gates: obj.gates,
    rawDisplayPolicy: obj.rawDisplayPolicy,
    privacy: obj.privacy,
  } as CourseSettingApprovalPackageResult
}

/**
 * Compute the sha256 of the local-artifact file. Used by the verify script
 * to cross-check `approvalPackageRef.localPackageSha256`. Returns `''` if
 * the file does not exist.
 */
export const sha256OfApprovalPackageLocalArtifact = (path: string): string =>
  sha256OfFile(path) ?? ''

/**
 * Compute the basename hash of the sample file (for the committed docs
 * privacy manifest). Pure except for the file read.
 */
export const sampleFilenameHash = (samplePath: string, len = 12): string => {
  const name = basename(samplePath)
  return createHash('sha256').update(name, 'utf8').digest('hex').slice(0, len)
}

/**
 * sha256 helper exposed for the verify script. Hex form.
 */
export const sha256HexOf = (s: string): string => sha256Hex(s)