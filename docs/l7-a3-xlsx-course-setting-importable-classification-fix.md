# L7-A3: Importable Classification and New Course Auto-Create Plan Fix

## 1. Browser Blocker

After L7-A2A fixed the dataset wiring, the user observed that the
审核模式 and 手动处理 panels were still over-reporting blockers:

```text
解析预览 toast: 识别 1167 条课程行，148 条需人工审核
审核模式:
  总计 1167
  待审核 1167
  通过 0
  拒绝 0
  需复核 0
  阻塞 1167       ← 全部都被阻塞
手动处理:
  可导入 0        ← 没有一条可导入
  需处理 1167
  新课程候选 903   ← 这 903 条不是真 blocker
```

903 of the 1167 rows are **new course candidates** (Excel has a course
name, DB has no match). These are NOT hard blockers — the future
write-DB stage can create the new Course. But the L6-D approval package
+ L6-E1 manual resolution + L6-E2 partial plan all treated them as
`blockedByMissingCourse` and reported them as full blockers.

L7-F (write-DB execution) was still blocked because:
- All rows looked blocked
- The partial plan generated `plannedImportRows = 0`
- The user couldn't even reach the "ready to import" state

## 2. Why L7-A2A Was Not Enough

L7-A2A wired the full dataset through (1167 → 1167). But the per-row
classification was still wrong: every row with `courseMatchStatus ===
'missing'` was unconditionally marked `blockedByMissingCourse` regardless
of whether the Excel course name was empty (true gap) or non-empty
(new candidate). The user saw 1167 blockers instead of 264.

## 3. Root Cause

Two upstream signals were being conflated:

| L4 diagnostic | Was emitted when | Was treated as |
|---|---|---|
| `COURSE_MISSING` | Course name had no DB match (regardless of whether Excel name was empty) | Hard blocker (`blockedByMissingCourse`) |

The L6-D `suggestAction` function:

```ts
if (courseMatchStatus === 'missing') return 'blockedByMissingCourse'
```

unconditionally treated all `COURSE_MISSING` as a hard blocker. The
L6-E1 evaluator carried this forward. The L6-E2 partial plan then
rightly did not enter these rows into `importableRows` because their
`plannedCourseAction` was unresolved.

The L6-E2G semantics helper (course-setting-new-course-candidate-l6-e2g)
had already added `COURSE_NAME_MISSING` and `COURSE_CREATE_CANDIDATE`
distinctions at the *helper* level, but L4 was still emitting only
`COURSE_MISSING`, and the L6-D approval package + L6-E1 evaluator
weren't threading the new distinction through.

## 4. Fix Summary

### L4 mapper (course-setting-teaching-task-dry-run.ts)

- `DryRunDiagnosticCode` adds `COURSE_NAME_MISSING` and
  `COURSE_CREATE_CANDIDATE`.
- The `courseCand.matchStatus === 'missing'` branch now emits:
  - `COURSE_NAME_MISSING` if the Excel course name is empty
  - `COURSE_CREATE_CANDIDATE` if the Excel course name is non-empty
- `COURSE_MISSING` is no longer emitted by L4; consumers fall back to
  the new codes.

### L6-D approval package (course-setting-approval-package-l6-d.ts)

- `CourseSettingApprovalReviewItemSuggestedAction` adds
  `'newCourseCandidate'`.
- `suggestAction`:
  - `COURSE_CREATE_CANDIDATE` → `newCourseCandidate` (NOT a blocker)
  - `COURSE_NAME_MISSING` or legacy `COURSE_MISSING` with empty name →
    `blockedByMissingCourse` (blocker)
  - legacy `COURSE_MISSING` without empty name → `newCourseCandidate`
    (treated as new candidate for backward compat with L6-E2G)
- `blockingReasonsFor` returns `['bucket:<bucket>',
  'new_course_candidate_not_blocker']` for `newCourseCandidate` — the
  reason is informational only; it does NOT count as a blocker key.
- `approvalSummary` adds two new fields:
  - `newCourseCandidateItems: number` (rows that are new candidates)
  - `courseNameMissingItems: number` (rows with true course-name gap)
- The for-loop increments `newCourseCandidateItems` instead of
  `blockedItems` for `newCourseCandidate` rows.

### L6-D2 UI projection (course-setting-approval-review-ui-l6-d2.ts)

- `CourseSettingApprovalReviewUiFlags` adds `newCourseCandidate: boolean`.
- `computeFlags` sets it when `suggestedAction === 'newCourseCandidate'`.
- `CourseSettingApprovalReviewUiSummary` adds:
  - `newCourseCandidateItems`
  - `courseNameMissingItems`
  - `importableAfterTeacherOrClassResolutionItems` (informational)

### L6-E1 manual resolution (course-setting-manual-resolution-l6-e1.ts)

- `CourseSettingResolutionStatus` adds `'autoAllowedNewCourse'`.
- `buildInitialManualResolutionState`:
  - For rows with `flags.newCourseCandidate === true`, sets
    `resolutionStatus = 'autoAllowedNewCourse'`.
  - Pre-fills the resolution with
    `resolution.course = { action: 'createCourseCandidate', candidateName: <Excel course name> }`
    so the partial plan can use it as
    `coursePlan.mode = "createCourse"` directly.
- `evaluateManualResolutionItem` is restructured:
  - The `if (baseBlocked)` wrapper is removed.
  - Each dimension (course / teacher / class / hours / exam / task split
    / ambiguous) is now checked independently against the underlying
    diagnostic, not against the global `baseBlocked` flag.
  - A new course candidate can still be a blocker if it has teacher
    or class group issues — but the course dimension itself is satisfied
    by the pre-filled `createCourseCandidate` resolution.
- `summarizeManualResolutionState` counts `autoAllowedNewCourse` as
  `importableItems` (the row IS importable in the partial plan).

### L6-E2G semantics helper (course-setting-new-course-candidate-l6-e2g.ts)

- `isNewCourseCandidate` now matches either `COURSE_CREATE_CANDIDATE`
  (L7-A3) or legacy `COURSE_MISSING` (L6-E2G and earlier).
- `classifyCourseSituation` also recognizes
  `COURSE_NAME_MISSING` distinctly from the legacy `COURSE_MISSING`.
- `COURSE_DIAGNOSTIC_SEMANTIC_NEW_CANDIDATE` drops the legacy
  `COURSE_MISSING` token; a new `COURSE_DIAGNOSTIC_LEGACY_SUPERSEDED`
  is exported for backward compat.

### L6-E2 partial plan (course-setting-partial-import-plan-l6-e2.ts)

- New helper variable `hasCourseCandidateSignal` that covers both
  `COURSE_MISSING` and `COURSE_CREATE_CANDIDATE` (the latter is the
  common L7-A3 case).
- All four "new candidate" branches in the plan-row builder now use
  `hasCourseCandidateSignal && !isExcelCourseNameBlank` instead of
  `hasCourseMissingDiag && !isExcelCourseNameBlank`.
- `CourseSettingPartialImportPlanSummary` adds:
  - `teacherMissingRows: number`
  - `classGroupMissingRows: number`
  - `taskAssignmentReviewRows: number`
  - `rowsUsingExistingCourse: number`
- The summary block counter is now granular per-blocker-kind.

### Client types (course-setting-xlsx-client.ts)

Mirror types updated to include:
- `CourseSettingApprovalReviewUiRowFlags.newCourseCandidate: boolean`
- `CourseSettingApprovalReviewUiSummary.{newCourseCandidateItems,
  courseNameMissingItems, importableAfterTeacherOrClassResolutionItems}`
- `CourseSettingPartialImportSummary.{teacherMissingRows,
  classGroupMissingRows, taskAssignmentReviewRows, rowsUsingExistingCourse}`

### UI components

- `course-setting-approval-review-section.tsx` summary cards now show
  4 cards: 总计 / 新课程候选 (success) / 课程名缺失 (danger) / 阻塞.
- `course-setting-manual-resolution-section.tsx` filter now offers
  `autoAllowedNewCourse` as a status option.
- `course-setting-partial-import-plan-section.tsx` adds a granular
  blocker breakdown: 教师缺失行 / 班级缺失行 / 任务分配需复核 /
  使用现有课程行.

## 5. No DB writes / no apply

- No Prisma write methods introduced.
- No `Course` / `Teacher` / `ClassGroup` / `TeachingTask` /
  `TeachingTaskClass` / `ImportBatch` creation. The `createCourse`
  mode in the partial plan is a *plan-only* artifact — the apply
  stage (L7-F) will be a separate gated stage.
- `Teacher` is still NOT auto-creatable. `ClassGroup` is still NOT
  auto-creatable. Both remain hard blockers.
- No `partial-import-apply` route directory.
- No `applyAllowed: true` / `canApply: true` / `执行导入` / `正式导入`
  button text.
- No schema / migration change.
- No scheduler / score change.
- No Word parser change.
- No `package.json` / `package-lock.json` change.

## 6. Validation Results

- L7-A3 verify: 88/88
- L7-A2A regression: 78/78
- L7-A2 regression: 62/63 (only worktree-clean expected during dev)
- L7-A regression: 105/105
- L6-E2G1 regression: 54/54
- L6-E2G regression: 117/117 (stage-aware updated)
- L6-E2F / L6-E2E / L6-E2D / L6-E2C / L6-E2 regression: all pass
- L6-E1 regression: 87/87
- `prisma validate`: PASS
- `prisma migrate status`: PASS
- `K22-C`: PASS (no unexpected failures)
- `scan:docs-pii`: PASS (no blocking hits, no L7-A3 hits)
- `npm run build`: PASS
- `npx tsc --noEmit`: PASS (no errors)
- `eslint`: 0 errors (3 pre-existing warnings on review section file,
  not from L7-A3)
- `git diff --check`: clean
- Forbidden files: clean (no .xlsx/.csv/dev.db/sqlite/.sql/.accdb/.mdb
  in temp/uploads)

## 7. Before / After Metrics (new template, semesterId=4)

| Metric | Before L7-A3 | After L7-A3 |
|---|---|---|
| Approval package blockedItems | 1167 | 264 |
| Approval package newCourseCandidateItems | 0 | 903 |
| Approval package courseNameMissingItems | 0 (legacy combined) | 0 (true gaps) |
| Manual resolution importableItems | 0 | 903 |
| Manual resolution needsResolutionItems | 1167 | 264 |
| Manual resolution newCourseCandidateItems | 0 | 903 |
| Manual resolution confirmedNewCourseCandidateItems | 0 | 903 |
| Partial plan plannedImportRows | 0 | 795 |
| Partial plan courseCreateCandidates | 0 | 248 |
| Partial plan rowsUsingNewCourseCandidate | 0 | 620 |
| Partial plan confirmedNewCourseCandidates | 0 | 620 |
| Partial plan teacherMissingRows | 0 | 207 |

## 8. Browser Validation Checklist (manual, post-commit)

1. Open `/admin/import`
2. Select target semester
3. Upload `课程设置新模板.xlsx`
4. Click 解析预览 → confirm full dataset (1167 course rows)
5. Click 生成审核视图
6. Confirm summary shows: 总计 1167 / 新课程候选 903 / 课程名缺失 0 / 阻塞 264
7. Confirm 阻塞 < 1167 (only teacher / class / task-split / exam / hours
   rows are blocked)
8. Confirm manual resolution: 可导入 903 / 需处理 264 / 新课程候选 903 /
   新课程候选（已确认）903
9. Confirm 新课程候选 rows default to createCourseCandidate resolution
   (auto-allowed)
10. Generate partial import plan
11. Confirm plan shows: 计划导入 ~795 / 仍需处理 ~372 / 阻塞项 ~434
12. Confirm 课程名缺失行 = 0; 课程匹配歧义行 = 0
13. Confirm 课程候选 = 248 / 新课程候选（已确认）= 620
14. Confirm 教师缺失行 = 207 / 班级缺失行 = 0 / 任务分配需复核 = 0
15. Confirm UI still has no apply / write-DB button
16. Confirm DB counts unchanged
17. Confirm browser console has no React error

## 9. Next Stage Recommendation

L7-A3 closes once browser validation passes. After that, re-evaluate
entering L7-F (XLSX course setting new template partial import
execution). L7-F can now safely:
- Create new Course rows for confirmed new course candidates
- Use existing Course for matched candidates
- Use existing Teacher for matched candidates (no Teacher auto-create)
- Use existing ClassGroup for matched candidates (no ClassGroup
  auto-create)
- Produce one TeachingTask per importable row
- Produce one TeachingTaskClass per (TeachingTask, ClassGroup) link
- All inside a single atomic `pending → confirming → confirmed/failed`
  ImportBatch (L6-E pattern)

L7-F remains blocked until L7-A3 is browser-validated.
