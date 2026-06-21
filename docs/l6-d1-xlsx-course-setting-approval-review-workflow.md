# L6-D1 XLSX Course Setting Approval Decision Package

> Stage: **L6-D1-XLSX-COURSE-SETTING-APPROVAL-REVIEW-WORKFLOW**
> Status: **PASS**
> Goal: build an initial review decision overlay over the L6-D target-semester-bound approval package so the future L6-D2 (human review UI) or `importedDecisionFile` can populate manual decisions. L6-D1 NEVER writes DB; it NEVER creates ImportBatch / TeachingTask / TeachingTaskClass; it NEVER switches the active semester.

## 1. Stage Overview

L6-D1 consumes the L6-D target-semester-bound approval package unchanged. It emits a `CourseSettingDecisionPackageResult` that mirrors the L6-D `reviewItems` array but overlays a per-item decision field:

- **Initial state**: every decision item is `pending` / `systemDefaultPending` / `INITIAL_PENDING`.
- **No auto-approve**: even when the upstream L6-D package reports `autoSafeCandidates > 0`, those items remain `pending`.
- **No apply plan**: `applyAllowed: false` and `applyListGenerated: false` are literal types.
- **No DB writes**: `dbWritten: false`.

## 2. Decision Model

| field | values |
|---|---|
| `decision` | `pending` \| `approved` \| `rejected` \| `needsReview` |
| `decisionSource` | `systemDefaultPending` \| `manual` \| `ruleAssisted` \| `importedDecisionFile` |
| `decisionReasonCode` | `INITIAL_PENDING` \| `MANUAL_APPROVED` \| `MANUAL_REJECTED` \| `MANUAL_NEEDS_REVIEW` \| `BLOCKED_BY_DIAGNOSTIC` \| `BLOCKED_BY_MISSING_ENTITY` \| `LOW_CONFIDENCE` |

Initial package uses only `pending`, `systemDefaultPending`, `INITIAL_PENDING`. Other enum values are reserved for the future L6-D2 / L6-E stages and are NOT produced by L6-D1.

## 3. Approval Package Reference

| field | value |
|---|---|
| approvalPackageRef.stage | `L6-D-XLSX-COURSE-SETTING-APPROVAL-PACKAGE-WITH-TARGET-SEMESTER` |
| approvalPackageRef.packageVersion | `l6-d-approval-package-v1` |
| approvalPackageRef.targetSemesterId | `3` |
| approvalPackageRef.targetSemesterIdHash | `4e07408562be` |
| approvalPackageRef.itemCount | `1116` |
| approvalPackageRef.localPackageSha256 | `2abc072de2a5cb3dece740796c22a858f5aa3e2b441c3d34d044304aca69a302` |
| approvalPackageRef.dryRunFingerprintHash | `165ff4c6b0836da3627928902492ae516318f7839fa800977a8cd6127e62f2c9` |

## 4. Decision Package Summary

| field | value |
|---|---|
| decisionOnly | `true` |
| dryRunOnly | `true` |
| dbWritten | `false` |
| applyAllowed | `false` |
| applyListGenerated | `false` |
| totalItems | `1116` |
| pendingItems | `1116` |
| approvedItems | `0` |
| rejectedItems | `0` |
| needsReviewItems | `0` |
| blockedItems | `1069` (retained from L6-D) |
| autoSafeCandidates | `42` (informational only — NOT auto-approved) |
| allDecisionsPending | `true` |

## 5. Decision Package Gates

| gate | value |
|---|---|
| approvalPackageLoaded | `true` |
| decisionsComplete | `false` (no manual decisions yet) |
| hasApprovedItems | `false` |
| hasRejectedItems | `false` |
| hasNeedsReviewItems | `false` |
| applyReady | `false` |
| dbBackupCreated | `false` |
| dryRunReplayMatchesApprovedPackage | `false` |
| importBatchPlanGenerated | `false` |
| rollbackPlanGenerated | `false` |

## 6. Why `autoSafeCandidates` Are NOT Auto-Approved

The L6-D approval package reports `autoSafeCandidates` items that the L6-D heuristic suggests could be auto-approved (e.g. all-exact mappings with confidence >= 0.9). L6-D1 still pins every such item to `pending` because:

- the L6-D heuristic is a **suggestion**, not a confirmation — the L6-D package itself records the suggestion as `suggestedAction: 'approveCandidate'` with the blocking reason `'auto_safe_requires_human_review_in_l6_d'`;
- L6-D1 is a **review workflow** stage, not an apply stage — human review (L6-D2) is required before any item flips to `approved`;
- converting `autoSafeCandidates` into `approved` would create an apply-ready subset that bypasses the L6-D `reviewPackageApproved: false` gate;
- the validation function (N35) explicitly rejects any non-pending decision in the initial package.

## 7. Bucket Summary (Top 10)

| bucket | count | pending | approved | rejected | needsReview |
|---|---|---|---|---|---|
| `needsManualReview` | `1074` | `1074` | `0` | `0` | `0` |
| `approveCandidate` | `42` | `42` | `0` | `0` | `0` |

Full bucket distribution lives in the gitignored local artifact (`temp/local-artifacts/l6-d1/`).

## 8. Diagnostic Summary (Top 10)

| code | count |
|---|---|
| `COURSE_MISSING` | `866` |
| `TEACHER_MISSING` | `686` |
| `EXAM_TYPE_OTHER` | `142` |
| `CLASS_COUNT_OTHER_REQUIRES_REVIEW` | `134` |
| `CLASS_COUNT_ONLY_REQUIRES_REVIEW` | `125` |
| `TASK_SPLIT_REQUIRED` | `92` |
| `TEACHER_BLANK` | `86` |
| `TEACHER_ASSIGNMENT_OTHER_REQUIRES_REVIEW` | `62` |
| `MERGE_REMARK_AMBIGUOUS` | `62` |
| `LOW_CONFIDENCE_ROW` | `40` |

## 9. Local Redacted Decision Package

- Path: `temp/local-artifacts/l6-d1/xlsx-course-setting-decision-package.target-3.redacted.json`
- sha256: `51d24de46343b3591dff73185b1f7bccf5ed500f7286ba6ed93c18ff351475fa`
- item count: `1116`
- all decisions: `pending`
- Git tracked: **NO** (under gitignored `temp/`)

## 10. Raw Display Policy

| surface | raw included |
|---|---|
| runtime UI (L6-B1) | yes (authorized admin only) |
| L6-D approval package | **no** |
| L6-D1 decision package | **no** |
| committed docs/json | **no** |
| local artifact (`temp/local-artifacts/l6-d1/`) | **no** (gitignored) |

## 11. Source Evidence

- Source artifact size: `131200` bytes
- Source artifact filename hash: `d5c590e19e3f` (filename path NOT committed)
- L6-D approval package SHA256: `2abc072de2a5cb3dece740796c22a858f5aa3e2b441c3d34d044304aca69a302` (stored in `approvalPackageRef.localPackageSha256` + gitignored local artifact only)
- L6-D1 decision package SHA256: `51d24de46343b3591dff73185b1f7bccf5ed500f7286ba6ed93c18ff351475fa` (gitignored local artifact only)

## 12. Privacy / Redaction Proof

The decision package and the committed JSON / markdown contain only:

- `approvalItemId`, `targetSemesterRef.{semesterId, semesterIdHash}`
- `suggestedAction` (enum string from L6-D)
- `blockingReasons` (L6-D blocking reasons + bucket tokens)
- `diagnosticCodes` (L6-D diagnostic codes)
- `confidence` (numeric)
- `sourceRef.{sheetIndex, sheetNameHash, sourceRowIndex, *Hash?}`
- `candidateRefs.{teachingTaskCandidateKey, teacherCandidateKeys, classGroupCandidateKeys, teachingTaskClassCandidateKeys}`
- bucket counts, diagnostic counts, gate flags, privacy manifest.

No raw teacher / class / course / remark / sheet text is placed in any field.

## 13. DB No-Write Proof

| table | before | after |
|---|---|---|
| Semester | `3` | `3` |
| Course | `104` | `104` |
| Teacher | `84` | `84` |
| ClassGroup | `36` | `36` |
| TeachingTask | `308` | `308` |
| TeachingTaskClass | `446` | `446` |
| ImportBatch | `38` | `38` |
| ScheduleSlot | `440` | `440` |
| ScheduleAdjustment | `67` | `67` |
| active semester id | `1` | `1` |

Allowed Prisma read methods used by L6-D1: `count`, `findFirst`.
No `create / update / upsert / delete / $executeRaw` calls in the L6-D1 helper or verify script.
No `ImportBatch.create` / `TeachingTask.create` / `TeachingTaskClass.create` in L6-D1.

## 14. Validation Result

- validation.ok: `true`
- violation count: `0`
- 15 checks passed: item count match / approvalItemId presence / no duplicates / targetSemesterId match / decision enum / initial pending / approvedItems=0 / rejectedItems=0 / needsReviewItems=0 / applyReady=false / applyAllowed=false / privacy flags / fingerprint match / blocked items not auto-approved / applyListGenerated=false

## 15. Relationship to Prior Stages

- **L6-D**: target-semester-bound approval package. L6-D1 consumes it unchanged; the L6-D helper is NOT modified.
- **L6-C**: create-new-semester flow. L6-D1 consumes the L6-D package's existing targetSemester row but does NOT modify the Semester table itself.
- **L6-B1**: runtime raw preview for authorized admins — raw fields live here only. L6-D1 does NOT include them.
- **L5 / L6-0**: review packages (no per-item decision field). L6-D1 introduces the decision overlay on top of L6-D's approval package.
- **L4 / L2 / Word parser / scheduler / score / schema**: untouched.

## 16. Validation

- L6-D1 verify: PASS (86/0/0/0)
- L6-D verify: PASS
- K22-C: PASS (73/0/0/0)
- scan:docs-pii: PASS
- git diff --check: clean
- forbidden files: clean

## 17. Next Steps (Recommendation)

L6-D1 closes. The next stage MAY be:

- **L6-D2** (planned): human review UI that lets an authorized admin flip individual decision items between `pending` / `approved` / `rejected` / `needsReview`. The decision source will be `manual` and the reason code will be `MANUAL_*`. L6-D2 will NOT write DB; it will regenerate the local decision artifact.
- **L6-D-IMPORT-DECISION-FILE** (planned): support importing an `importedDecisionFile` that carries per-approvalItemId decisions.
- **L6-E** (planned): apply stage. Still BLOCKED — L6-D1 keeps `applyAllowed: false` and `applyListGenerated: false`.

Until either path lands, the system remains in L6-D1 review-only mode with all decisions `pending`.
