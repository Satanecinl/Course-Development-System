/**
 * L6-D2 Approval Review UI Helper — Course-Setting XLSX Human Review Rows
 *
 * Stage: L6-D2-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI
 *
 * Pure, in-memory helper that projects an L6-D
 * `CourseSettingApprovalPackageResult.reviewItems` into UI-ready rows that an
 * authorized admin frontend can render. This helper performs NO mutation,
 * NO Prisma calls, NO filesystem writes, NO API/UI coupling.
 *
 * The projection is intentionally split from L6-D so that the in-memory
 * package remains fully redacted (no raw text) while the UI still receives
 * a structure the human reviewer can act on (raw text is supplied by the
 * caller as an OPTIONAL map; missing keys result in null raw fields, never
 * a thrown error).
 *
 * Hard constraints (rechecked):
 *  - No Prisma, no DB writes, no filesystem writes.
 *  - No `create / update / upsert / delete / executeRaw / $executeRaw` calls.
 *  - No `console.log` of any raw row data.
 *  - Pure projection: same input → identical output.
 *  - The `decision` field is ALWAYS the initial
 *    `{ value: 'pending', source: 'systemDefaultPending',
 *    reasonCode: 'INITIAL_PENDING' }`. This helper never auto-approves a
 *    row, even when the upstream `suggestedAction === 'approveCandidate'`
 *    (auto-safe). Auto-safety is preserved as an INFORMATIONAL count on
 *    `summary.autoSafeCandidates` and on `flags.autoSafeCandidate`.
 *  - `applyAllowed: false` and `applyListGenerated: false` are literal
 *    types so downstream consumers cannot accidentally treat this as an
 *    apply-ready artifact.
 *
 * Relationship to prior stages:
 *  - L6-D: produces `CourseSettingApprovalPackageResult.reviewItems` with
 *    hashes / candidate keys / classifications / diagnostic codes.
 *  - L6-D1: produces a separate `CourseSettingDecisionPackageResult` with
 *    initial pending decisions. L6-D2 is the UI projection, not a decision
 *    package — it is the lightweight shape the L6-D2 frontend renders and
 *    the L6-D2 download handler turns into a decision file.
 *  - L6-E (planned): apply stage. Still BLOCKED — L6-D2 keeps
 *    `applyAllowed: false` and `applyListGenerated: false`.
 *
 * Privacy contract:
 *  - The runtime UI raw fields (course / teacher / class / remark / sheet
 *    text) come from the caller's optional `rawByApprovalItemId` map.
 *    They are placed on `row.raw` for IN-MEMORY display only and MUST NOT
 *    be persisted, logged, or written to disk by any consumer of this
 *    helper.
 *  - The exported decision file (`course-setting-approval-decision-file`)
 *    is redacted: it carries only `approvalItemId` + `decision` (+ optional
 *    `reason`) + metadata. NO raw text is ever written to that file.
 *  - `source.sheetName` is a runtime-only convenience field. When the
 *    caller does not provide `sheetNameByIndex`, it is `null` and the
 *    hash stays. The hash is the only piece persisted in any
 *    committed/serialized artifact.
 */

import type {
  CourseSettingApprovalPackageResult,
} from './course-setting-approval-package-l6-d'

// ---------------------------------------------------------------------------
// Stage constants
// ---------------------------------------------------------------------------

export const L6_D2_STAGE =
  'L6-D2-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI' as const

export const L6_D2_REVIEW_UI_VERSION = 'l6-d2-review-ui-v1' as const

// ---------------------------------------------------------------------------
// Decision value enums (UI-side, narrow set)
// ---------------------------------------------------------------------------

export type CourseSettingApprovalReviewUiDecisionValue =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needsReview'

/**
 * Initial decision overlay. The L6-D2 helper always emits this exact
 * literal object for every row — even `approveCandidate` rows are NOT
 * auto-approved.
 */
export type CourseSettingApprovalReviewUiDecision = {
  value: 'pending'
  source: 'systemDefaultPending'
  reasonCode: 'INITIAL_PENDING'
}

// ---------------------------------------------------------------------------
// Per-row types
// ---------------------------------------------------------------------------

/**
 * Raw text fields (runtime-only). The keys mirror the field names exposed
 * by the L6-B1 preview response (`CourseSettingXlsxPreviewRowRaw`) so the
 * UI can copy them through unchanged. All values are nullable: when the
 * caller does not supply the map, or the approvalItemId is not in the map,
 * every field is `null`.
 */
export type CourseSettingApprovalReviewUiRaw = {
  courseName: string | null
  teacherText: string | null
  classText: string | null
  remark: string | null
  mergeRemark: string | null
  weeklyHoursText?: string | null
  examTypeText?: string | null
  majorName?: string | null
}

/**
 * Sanitized parsed-view of a row. Mirrors `CourseSettingXlsxPreviewRowParsed`
 * for the hashes the UI may want to display. All optional because the
 * helper cannot derive hashes from the approval package (it only has the
 * upstream sha256-prefix-12 hashes from L6-D); the caller is free to
 * populate these from the runtime preview if it has them.
 */
export type CourseSettingApprovalReviewUiParsed = {
  courseNameHash?: string
  teacherRawHash?: string
  classCountRawHash?: string
  remarkHash?: string
  mergeRemarkHash?: string
  weeklyHours?: number | null
  examType?: string | null
}

export type CourseSettingApprovalReviewUiSource = {
  sheetIndex: number
  /** Runtime-only display name. `null` when the caller does not supply
   *  `sheetNameByIndex`. The companion `sheetNameHash` is always present
   *  (copied from the L6-D sourceRef). */
  sheetName: string | null
  sheetNameHash: string
  sourceRowIndex: number
}

/**
 * The match view the UI shows next to each row. `confidence`,
 * `blockingReasons`, and `diagnosticCodes` are passed through from L6-D
 * unchanged. `teacherMatchStatusSummary` / `classGroupMatchStatusSummary`
 * are copied from the upstream `classifications` map.
 */
export type CourseSettingApprovalReviewUiMatch = {
  suggestedAction: string
  blockingReasons: string[]
  diagnosticCodes: string[]
  confidence: number
  courseMatchStatus?: string
  teacherMatchStatusSummary?: Record<string, number>
  classGroupMatchStatusSummary?: Record<string, number>
  taskMatchStatus?: string
}

/**
 * UI flags derived from `match.suggestedAction`. These NEVER affect the
 * decision value — they are presentation hints for the human reviewer.
 */
export type CourseSettingApprovalReviewUiFlags = {
  /** `suggestedAction.startsWith('blockedBy')`. */
  blocked: boolean
  /** `suggestedAction === 'approveCandidate'`. Informational only. */
  autoSafeCandidate: boolean
  /** `suggestedAction === 'needsHumanReview'`. */
  needsHumanReview: boolean
}

export type CourseSettingApprovalReviewUiRow = {
  approvalItemId: string
  source: CourseSettingApprovalReviewUiSource
  raw: CourseSettingApprovalReviewUiRaw
  parsed: CourseSettingApprovalReviewUiParsed
  decision: CourseSettingApprovalReviewUiDecision
  match: CourseSettingApprovalReviewUiMatch
  flags: CourseSettingApprovalReviewUiFlags
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Aggregate summary emitted alongside the rows. `approvedItems`,
 * `rejectedItems`, and `needsReviewItems` are LITERAL 0 because every
 * initial decision is `pending`. `applyReady` is LITERAL false because
 * the package is review-only.
 */
export type CourseSettingApprovalReviewUiSummary = {
  totalItems: number
  pendingItems: number
  approvedItems: 0
  rejectedItems: 0
  needsReviewItems: 0
  /** Count of `flags.blocked === true`. */
  blockedItems: number
  /** Passthrough from `approvalPackage.approvalSummary.autoSafeCandidates`.
   *  Informational — does NOT imply any decision is approved. */
  autoSafeCandidates: number
  applyReady: false
}

/**
 * Raw-display policy. The helper does NOT enforce this policy; it simply
 * records the rules so the UI / decision file writer can render / omit
 * raw text correctly.
 */
export type CourseSettingApprovalReviewUiRawDisplayPolicy = {
  runtimeUiRawAllowed: true
  /** The exported decision file (course-setting-decision-file) MUST NOT
   *  include raw text. */
  exportedDecisionFileRawIncluded: false
  /** Committed docs / persisted snapshots MUST NOT include raw text. */
  committedDocsRawAllowed: false
  scope: 'authorized-admin-review-only'
}

export type CourseSettingApprovalReviewUiResult = {
  stage: typeof L6_D2_STAGE
  version: string
  reviewOnly: true
  dryRunOnly: true
  dbWritten: false
  applyAllowed: false
  applyListGenerated: false
  summary: CourseSettingApprovalReviewUiSummary
  rawDisplayPolicy: CourseSettingApprovalReviewUiRawDisplayPolicy
  rows: CourseSettingApprovalReviewUiRow[]
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type BuildApprovalReviewUiInput = {
  approvalPackage: CourseSettingApprovalPackageResult
  /**
   * Optional map from `approvalItemId` → raw row text. Keys MUST exist as
   * `approvalItemId` values in the approval package. Missing keys result in
   * null raw fields (pure helper, no error). The map is NEVER mutated.
   */
  rawByApprovalItemId?: Map<string, CourseSettingApprovalReviewUiRaw>
  /**
   * Optional map from `sheetIndex` → sheet display name. If absent, the
   * resulting `source.sheetName` is `null` and the `sheetNameHash` from
   * the L6-D package is preserved. The map is NEVER mutated.
   */
  sheetNameByIndex?: Map<number, string>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the initial pending decision overlay. Lifted to a function so the
 * literal type is enforced in one place and tests can compare against a
 * canonical object.
 */
const initialDecision = (): CourseSettingApprovalReviewUiDecision => ({
  value: 'pending',
  source: 'systemDefaultPending',
  reasonCode: 'INITIAL_PENDING',
})

const computeFlags = (
  suggestedAction: string,
): CourseSettingApprovalReviewUiFlags => ({
  blocked: suggestedAction.startsWith('blockedBy'),
  autoSafeCandidate: suggestedAction === 'approveCandidate',
  needsHumanReview: suggestedAction === 'needsHumanReview',
})

/**
 * Default raw view: every field null. Used when the caller does not supply
 * a raw map (or the map does not contain the row's approvalItemId).
 */
const emptyRaw = (): CourseSettingApprovalReviewUiRaw => ({
  courseName: null,
  teacherText: null,
  classText: null,
  remark: null,
  mergeRemark: null,
  weeklyHoursText: null,
  examTypeText: null,
  majorName: null,
})

/**
 * Shallow-merge a default raw view with the caller's raw entry. We copy
 * the caller's fields verbatim when defined, otherwise we keep `null`.
 */
const mergeRaw = (
  base: CourseSettingApprovalReviewUiRaw,
  override: CourseSettingApprovalReviewUiRaw | undefined,
): CourseSettingApprovalReviewUiRaw => {
  if (!override) return base
  return {
    courseName: override.courseName ?? base.courseName,
    teacherText: override.teacherText ?? base.teacherText,
    classText: override.classText ?? base.classText,
    remark: override.remark ?? base.remark,
    mergeRemark: override.mergeRemark ?? base.mergeRemark,
    weeklyHoursText:
      override.weeklyHoursText !== undefined
        ? override.weeklyHoursText
        : base.weeklyHoursText,
    examTypeText:
      override.examTypeText !== undefined
        ? override.examTypeText
        : base.examTypeText,
    majorName: override.majorName !== undefined ? override.majorName : base.majorName,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the L6-D2 review-UI projection from an L6-D approval package.
 *
 * Pure, deterministic, no I/O. For every `approvalPackage.reviewItems[i]`
 * exactly one `CourseSettingApprovalReviewUiRow` is emitted, in the same
 * order. Every decision is the initial `pending` overlay. Flags are
 * derived from `suggestedAction`. Raw text is taken from the optional
 * caller-supplied map (never from the L6-D package — which never carries
 * raw text in the first place).
 *
 * Output invariants:
 *  - `decision` is the same literal object (by value) for every row.
 *  - `applyAllowed === false` and `applyListGenerated === false` literal
 *    types.
 *  - `summary.approvedItems === 0`, `summary.rejectedItems === 0`,
 *    `summary.needsReviewItems === 0`, `summary.applyReady === false`.
 *  - `summary.autoSafeCandidates` is the upstream passthrough — it does
 *    NOT imply any decision has been flipped to `approved`.
 *  - `rawDisplayPolicy.exportedDecisionFileRawIncluded === false` so the
 *    decision-file serializer knows to omit raw text.
 */
export const buildCourseSettingApprovalReviewUi = (
  input: BuildApprovalReviewUiInput,
): CourseSettingApprovalReviewUiResult => {
  const { approvalPackage, rawByApprovalItemId, sheetNameByIndex } = input

  const rows: CourseSettingApprovalReviewUiRow[] = approvalPackage.reviewItems.map(
    (it) => {
      const suggestedAction = it.suggestedAction
      const flags = computeFlags(suggestedAction)
      const sheetName =
        sheetNameByIndex !== undefined
          ? sheetNameByIndex.get(it.sourceRef.sheetIndex) ?? null
          : null

      const raw = mergeRaw(emptyRaw(), rawByApprovalItemId?.get(it.approvalItemId))

      const match: CourseSettingApprovalReviewUiMatch = {
        suggestedAction,
        blockingReasons: it.blockingReasons,
        diagnosticCodes: it.diagnosticCodes,
        confidence: it.confidence,
        courseMatchStatus: it.classifications.courseMatchStatus,
        teacherMatchStatusSummary: it.classifications.teacherMatchStatusSummary,
        classGroupMatchStatusSummary:
          it.classifications.classGroupMatchStatusSummary,
        taskMatchStatus: it.classifications.taskMatchStatus,
      }

      const row: CourseSettingApprovalReviewUiRow = {
        approvalItemId: it.approvalItemId,
        source: {
          sheetIndex: it.sourceRef.sheetIndex,
          sheetName,
          sheetNameHash: it.sourceRef.sheetNameHash,
          sourceRowIndex: it.sourceRef.sourceRowIndex,
        },
        raw,
        // parsed is intentionally left as an empty object: the helper has
        // no way to derive hashes from the L6-D package alone (L6-D
        // carries only sha256-prefix-12 hashes, which the UI already has
        // from L6-B1). The UI is expected to overlay these from the
        // preview response keyed by approvalItemId.
        parsed: {},
        decision: initialDecision(),
        match,
        flags,
      }
      return row
    },
  )

  const blockedItems = rows.reduce((n, r) => n + (r.flags.blocked ? 1 : 0), 0)

  const summary: CourseSettingApprovalReviewUiSummary = {
    totalItems: rows.length,
    pendingItems: rows.length,
    approvedItems: 0,
    rejectedItems: 0,
    needsReviewItems: 0,
    blockedItems,
    autoSafeCandidates: approvalPackage.approvalSummary.autoSafeCandidates,
    applyReady: false,
  }

  const rawDisplayPolicy: CourseSettingApprovalReviewUiRawDisplayPolicy = {
    runtimeUiRawAllowed: true,
    exportedDecisionFileRawIncluded: false,
    committedDocsRawAllowed: false,
    scope: 'authorized-admin-review-only',
  }

  return {
    stage: L6_D2_STAGE,
    version: L6_D2_REVIEW_UI_VERSION,
    reviewOnly: true,
    dryRunOnly: true,
    dbWritten: false,
    applyAllowed: false,
    applyListGenerated: false,
    summary,
    rawDisplayPolicy,
    rows,
  }
}

/**
 * Summarize decisions across a flat array of rows. Convenience helper for
 * the UI; the result is a pure derivation and contains NO raw text.
 *
 * Returns literal `0` for `approved` / `rejected` / `needsReview` to keep
 * the type narrow (the L6-D2 review-only invariant says these counts
 * should be zero for the initial package).
 */
export const summarizeApprovalReviewUiDecisions = (
  rows: Array<{ decision: { value: CourseSettingApprovalReviewUiDecisionValue } }>,
): {
  total: number
  pending: number
  approved: 0
  rejected: 0
  needsReview: 0
} => {
  let pending = 0
  for (const r of rows) {
    if (r.decision.value === 'pending') pending += 1
  }
  return {
    total: rows.length,
    pending,
    approved: 0,
    rejected: 0,
    needsReview: 0,
  }
}
