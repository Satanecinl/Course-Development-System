/**
 * L6-D2 Decision File Helper — Course-Setting Approval Decision File
 *
 * Stage: L6-D2-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI
 *
 * Pure, in-memory helper that builds a redacted `CourseSettingDecisionFile`
 * payload suitable for the browser to download. NO raw teacher / class /
 * course / remark / sheet text is placed in the file. The file is the
 * round-trip artifact that the human review UI exports and the future
 * L6-D2 import / L6-E apply stage may consume.
 *
 * Hard constraints (rechecked):
 *  - No Prisma, no DB writes, no filesystem writes.
 *  - No `create / update / upsert / delete / executeRaw / $executeRaw` calls.
 *  - The output payload is REDACTED: `rawIncluded: false` and the
 *    `decisions[]` array carries only `approvalItemId` + `decision`
 *    (+ optional `reason`) per item. No raw text is ever placed in any
 *    field of any decision item.
 *  - `exportedAt` is caller-supplied (the UI passes
 *    `new Date().toISOString()`); the helper does NOT read the clock.
 *  - Pure / deterministic: same input → identical output (modulo the
 *    caller-supplied `exportedAt` string).
 *
 * Relationship to prior stages:
 *  - L6-D: produces a redacted approval package (no raw text).
 *  - L6-D1: produces a redacted initial decision package (no raw text).
 *  - L6-D2: produces a UI projection (`buildCourseSettingApprovalReviewUi`)
 *    that the human reviewer can act on. THIS file is the export of the
 *    human's decisions (still redacted) — the round-trippable artifact
 *    that an L6-D2 import flow (planned) can read back.
 *  - L6-E (planned): apply stage. The decision file is informational
 *    ONLY at this stage; L6-E MUST NOT consume a decision file until a
 *    dedicated import stage adds the safeguards.
 *
 * Privacy contract:
 *  - `rawIncluded: false` is a literal type. Any future change must be
 *    a deliberate type-level edit, not a runtime flip.
 *  - The serialized JSON includes a `packageRef.dryRunFingerprintHash` so
 *    the importer can verify the decision file matches the same dry-run
 *    fingerprint that produced the approval package.
 *  - The serialized JSON includes `targetSemesterId` (int) so the
 *    importer can verify the decision file was produced for the same
 *    target semester the importer is about to apply to.
 */

import { L6_D2_STAGE } from './course-setting-approval-review-ui-l6-d2'

// ---------------------------------------------------------------------------
// Stage constant
// ---------------------------------------------------------------------------

export const L6_D2_DECISION_FILE_VERSION = 'l6-d2-decision-file-v1' as const

// ---------------------------------------------------------------------------
// Per-decision type
// ---------------------------------------------------------------------------

export type CourseSettingDecisionFileDecision = {
  approvalItemId: string
  decision: 'pending' | 'approved' | 'rejected' | 'needsReview'
  /**
   * Optional reviewer-supplied free-text reason. The UI is free to leave
   * this undefined for `pending` rows. NOTE: a future version may classify
   * this field as raw text — for now we keep it on the file (it is the
   * reviewer's note, NOT a row's raw teacher/class/course/remark text).
   */
  reason?: string
}

// ---------------------------------------------------------------------------
// Top-level file type
// ---------------------------------------------------------------------------

export type CourseSettingDecisionFile = {
  stage: typeof L6_D2_STAGE
  fileType: 'course-setting-decision-file'
  version: typeof L6_D2_DECISION_FILE_VERSION
  exportedAt: string
  targetSemesterId: number
  packageRef: {
    dryRunFingerprintHash: string
    itemCount: number
  }
  decisions: CourseSettingDecisionFileDecision[]
  rawIncluded: false
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a redacted decision-file payload.
 *
 * Pure: no I/O, no Prisma, no clock access. The caller supplies
 * `exportedAt` (typically `new Date().toISOString()`).
 *
 * The returned object is safe to pass to `serializeCourseSettingDecisionFile`
 * and hand to the browser for download.
 */
export const buildCourseSettingDecisionFile = (input: {
  targetSemesterId: number
  dryRunFingerprintHash: string
  itemCount: number
  decisions: CourseSettingDecisionFileDecision[]
  exportedAt: string
}): CourseSettingDecisionFile => {
  return {
    stage: L6_D2_STAGE,
    fileType: 'course-setting-decision-file',
    version: L6_D2_DECISION_FILE_VERSION,
    exportedAt: input.exportedAt,
    targetSemesterId: input.targetSemesterId,
    packageRef: {
      dryRunFingerprintHash: input.dryRunFingerprintHash,
      itemCount: input.itemCount,
    },
    decisions: input.decisions.map((d) => ({
      approvalItemId: d.approvalItemId,
      decision: d.decision,
      ...(d.reason !== undefined ? { reason: d.reason } : {}),
    })),
    rawIncluded: false,
  }
}

/**
 * Serialize a decision file to a stable JSON string. Pure: no I/O.
 *
 * Uses 2-space indentation + trailing newline so the output is friendly
 * to git diffs and to manual review. The output NEVER includes raw
 * teacher / class / course / remark / sheet text — only the redacted
 * decision fields + metadata.
 */
export const serializeCourseSettingDecisionFile = (
  file: CourseSettingDecisionFile,
): string => JSON.stringify(file, null, 2) + '\n'
