# L7-F1-XLSX-COURSE-SETTING-APPLY-TRIAL-SEMANTIC-DIAGNOSTIC

> Stage: `L7-F1-XLSX-COURSE-SETTING-APPLY-TRIAL-SEMANTIC-DIAGNOSTIC`
> Date: 2026-06-22
> Status: **CLOSED** (read-only diagnostic complete)

## 一、Background

L7-F committed `9882916` with apply framework + trial execution. The CLI
trial produced ImportBatch #39 with 0 created tasks. Meanwhile L7-A3
reported "importableItems=903". The two numbers clearly contradict. This
stage identifies the three root causes.

## 二、ImportBatch #39

| Field | Value |
|---|---|
| id | 39 |
| status | APPLIED |
| strategy | XLSX_COURSE_SETTING_NEW_TEMPLATE |
| createdTaskCount | 0 |
| createdSlotCount | 0 |
| semesterId | 4 |
| createdAt | 2026-06-22T09:25:52Z |

**Decision**: defer (no rollback needed). The batch is harmless. A future
valid apply will create a new batch.

## 三、Three-Level Root Cause

### Level 1 — maxPreviewRows = 50 (MOST IMPACTFUL)

The L4 mapper (`course-setting-teaching-task-dry-run.ts:518`) defaults
`maxPreviewRows` to 50. The CLI trial therefore only processed 50 of
1167 rows, producing only 4 importable rows. When the diagnostic re-runs
with `maxPreviewRows: 100000`, the full 1167 rows yield 175 importable
rows.

The L7-A2A fix for this was applied to the approval-review route but
**not** to the partial-import-plan or partial-import-apply routes. All
three plan/apply paths still use the default 50.

**Fix required**: add `maxPreviewRows: 100000` to the L4 mapper call
in `partial-import-plan/route.ts` and `partial-import-apply/route.ts`.

### Level 2 — L7-A3 "903 importable" ≠ L6-E2 "175 importable"

L7-A3 measures `importableItems` from L6-E1's
`summarizeManualResolutionState()`, which counts
`resolutionStatus='autoAllowedNewCourse'` rows as importable. This
status is set by `buildInitialManualResolutionState()` for all rows
where `row.flags.newCourseCandidate=true`.

L6-E2 counts `plannedImportRows` from `buildCourseSettingPartialImportPlan()`,
which requires rows to have **zero blockers** (teacherMissing,
classGroupMissing, ambiguousMapping, etc.) to be importable.

The difference: 903 "autoAllowed" rows include 207 teacherMissing + 63
ambiguousMapping + 145 examTypeInvalid + 19 weeklyHoursInvalid = 434
rows with at least one blocker. So only 903 − 434 ≈ 469 new course
candidates are truly blocker-free (but the actual importable count is
175 because the 903 includes all rows in the plan, not just new course
candidates).

**Recommendation**: update L7-A3 summary to distinguish "auto-allowed"
from "fully resolved". The current UI wording of "903 可导入" is
misleading.

### Level 3 — semester 4 has 0 ClassGroups

Semester 4 (`2025-2026秋季学期`) has 0 ClassGroups, 0 TeachingTasks.
Historical data is in the LEGACY-DEFAULT semester. Even with all 1167
rows processed, no TeachingTaskClass links can be created because
`classGroupIds` would be empty for every row.

**Fix required**: user must either import ClassGroups into semester 4 or
select a semester that already has ClassGroups.

## 四、Three Code Paths Compared

| Metric | L7-A3 (status-based) | Browser-equivalent (L6-E2) | CLI trial (L6-E2, no resolutions) |
|---|---|---|---|
| importable | 903 | 175 | 175 |
| unresolved | 264 | 992 | 992 |
| maxPreviewRows | 100000 | 100000 | 100000 (L7-F1 fix) |
| manualResolutions | buildInitial... | buildInitial... | [] (empty) |
| diverges from L7-A3? | — | YES (175 ≠ 903) | YES (same as browser) |

## 五、Unresolved Reason Breakdown (full 1167 rows)

| Reason | Count |
|---|---|
| courseNameMissing | 903 |
| teacherMissing | 207 |
| examTypeInvalid | 145 |
| ambiguousMapping | 63 |
| weeklyHoursInvalid | 19 |

Note: courseNameMissing here refers to rows where the L6-E2 plan
**without** `buildInitialManualResolutionState()` treats newCourseCandidate
as "no course candidate signal" (because the resolution's
`course.action` was not set). This is a side effect of passing empty
manualResolutions. With the initial resolution state pre-filled
(createCourseCandidate), these rows would NOT be courseNameMissing.

## 六、Recommendations

1. **ESSENTIAL**: Fix `maxPreviewRows` in `partial-import-plan/route.ts`
   and `partial-import-apply/route.ts` (add `maxPreviewRows: 100000`).
2. **ESSENTIAL**: Fix `maxPreviewRows` in the CLI trial script.
3. **ESSENTIAL**: User must ensure the target semester has ClassGroups
   before running apply.
4. **RECOMMENDED**: Reconcile "importable" definitions between L7-A3 and
   L6-E2 in UI/docs.
5. **DEFER**: ImportBatch #39 — no action needed, empty batch is harmless.
6. **L7-F code is correct**: the apply endpoint correctly recomputes the
   plan server-side and applies only importable rows. The trial produced
   empty results due to the three root causes above.

## 七、Next Stage

After fixing root causes (Level 1 + Level 3), L7-F can re-run the trial
with correct inputs. No business logic change is needed — only the
`maxPreviewRows` parameter and ClassGroup scope.
