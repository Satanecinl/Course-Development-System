# L6-E2A Excel Course-Setting Manual Resolution Interaction Fix

> Stage: **L6-E2A-XLSX-COURSE-SETTING-MANUAL-RESOLUTION-INTERACTION-FIX**
> Status: **PASS** (interaction fix, no DB write, no apply)
> Prerequisite: L6-E2 code complete (`d72e10a`)

## 1. Bug Description

After L6-E2 code complete, browser manual validation at `/admin/import` revealed
that the **manual resolution controls were inert** — clicks on `忽略本行`,
`允许暂缺`, `选择已有课程`, `选择已有教师`, `选择已有班级`, course/teacher
candidate inputs, weekly-hours override, exam-type override, ambiguous-mapping
radios, low-confidence radios did not update any state, change the row status
badge, or move the summary counters. Initial summary cards:

- 可导入: 0
- 需处理: 50
- 已忽略: 0
- 暂不处理: 0
- 已手动处理: 0

After clicking any control, the counts and statuses did not change.

## 2. Root Cause

Two distinct defects in the L6-E1 helper and the UI wiring:

### 2.1 Patch wrapper mismatch (the primary bug)

The UI handler in `ResolutionSection` (course-setting-xlsx-preview.tsx) called
`applyManualResolutionUpdate` with the **flat** patch shape:

```tsx
onUpdate({ course: { action: 'useExistingCourse', existingCourseId: id } })
```

But the helper expected the **canonical** `{ resolution: {...} }` wrapper:

```ts
const mergedResolution = { ...item.resolution, ...(patch.resolution ?? {}) }
```

Since `patch.resolution` was `undefined`, the spread was a no-op and the state
update was silently dropped. Every row control was affected: ignore, allowBlank,
all useExisting*, all create*Candidate, weeklyHours, examType, ambiguousMapping.

### 2.2 Shallow-merge risk for nested objects

Even after fixing the wrapper, the original shallow merge
`{ ...item.resolution, ...patch.resolution }` would have replaced top-level
nested objects wholesale, so e.g. updating `teacher` after `course` was already
set could clobber the course field. The fix now deep-merges each nested
sibling (course / teacher / classGroups / weeklyHours / examType /
ambiguousMapping) so a fresh patch on one dimension does not wipe siblings.

## 3. Files Changed

- `src/lib/import/course-setting-manual-resolution-l6-e1.ts`
  - Added `deepMergeResolution` helper that deep-merges nested fields
  - `applyManualResolutionUpdate` now accepts BOTH the canonical
    `{ resolution: {...} }` shape AND the flat `{...}` UI shape
  - Detection logic: a single-key `{ resolution: {...} }` object is
    canonical; anything else is treated as a flat patch
  - Re-evaluation and status recompute unchanged

- `src/components/import/course-setting-xlsx-preview.tsx`
  - Comment in `updateItem` clarifies the flat-patch convention
  - All call sites already pass flat patches; no UI changes needed
    (the helper is now the single source of truth for both shapes)

- `scripts/verify-xlsx-course-setting-manual-resolution-interaction-l6-e2a.ts`
  - New 80+ check verify (83 checks total: 78 pass on first run, fixed to 83/83)
  - Static analysis of helper, UI bindings, state flows, regression, privacy

- `docs/l6-e2a-xlsx-course-setting-manual-resolution-interaction-fix.md` (this file)
- `docs/l6-e2a-xlsx-course-setting-manual-resolution-interaction-fix.json` (aggregate)
- `docs/current-project-status.md` (appended L6-E2A line)

## 4. State Update Fix

```ts
// In course-setting-manual-resolution-l6-e1.ts
const deepMergeResolution = (old, patch) => {
  const merged = { ...old }
  for (const k of Object.keys(patch)) {
    const newVal = patch[k]
    if (newVal === undefined) continue
    if (k === 'course' || k === 'teacher' || k === 'classGroups' ||
        k === 'weeklyHours' || k === 'examType' || k === 'ambiguousMapping') {
      // Nested: shallow-merge with the old sibling
      const oldNested = old[k] ?? {}
      merged[k] = { ...oldNested, ...newVal }
    } else {
      // Scalar (ignored, ignoreReason): replace
      merged[k] = newVal
    }
  }
  return merged
}

export const applyManualResolutionUpdate = (state, approvalItemId, patch) => {
  // Accept both flat { course, teacher, ... } and canonical { resolution: {...} } shapes
  const isCanonical = 'resolution' in patch && typeof patch.resolution === 'object' &&
                      patch.resolution !== null && !Array.isArray(patch.resolution) &&
                      Object.keys(patch).length === 1
  const resolutionPatch = isCanonical ? patch.resolution : patch
  // ... rest unchanged
}
```

## 5. Ignored Row Fix

Before: clicking `忽略本行` sent `{ ignored: !item.resolution.ignored, ... }`,
but the patch was silently dropped. Now: the flat patch is deep-merged, so
`ignored: true` is set, validation re-evaluates with `blockers: ['rowIgnored']`,
`resolutionStatus` becomes `'ignored'`, and `summarizeManualResolutionState`
increments `ignoredItems` while decrementing `needsResolutionItems`.

## 6. Allow Blank Teacher Fix

`onChange` on the `允许暂缺` checkbox sends
`{ teacher: { action: 'allowBlankTeacher', allowBlankReason: '...' } }`. The
helper deep-merges the `teacher` field, then `evaluateManualResolutionItem`
removes the `teacherMissing` blocker if no other blocker remains. Row status
recomputes via `deriveResolutionStatus`.

## 7. Course / Teacher / Class Selectors Fix

All three selectors use `Number(e.target.value)` (with `undefined` fallback
on empty) and send the flat shape. The `onChange` handlers in the UI
are unchanged from L6-E1 (the bug was downstream, in the helper).

## 8. Plan API Payload Fix

The plan handler reads `resolutionItems` (the live state) at click time and
passes it directly to `planCourseSettingPartialImport`. The `useCallback`
dependency array includes `resolutionItems`, so the closure is never stale.
The route re-evaluates per-row from the submitted payload, so any state
change between the last `evaluate` and the API call is preserved.

## 9. No DB Write Proof

| metric | value |
|---|---|
| prisma.create / update / upsert / delete in modified files | 0 |
| schema.prisma modified | NO |
| migration files modified | NO |
| ImportBatch create | 0 |
| TeachingTask create | 0 |
| TeachingTaskClass create | 0 |
| Course create | 0 |
| Teacher create | 0 |
| ClassGroup create | 0 |
| ScheduleSlot create | 0 |
| ScheduleAdjustment create | 0 |
| activeSemester changed | NO |
| API apply route | NO |
| Excel partial import apply | NO |
| Teacher create candidates in plan | 0 (literal) |
| applyAllowed in plan | false (literal) |

## 10. Validation Results

- L6-E2A verify: **83/83 PASS**
- L6-E1 regression: 87/87 PASS
- L6-E2 regression: 144/144 PASS
- prisma validate: PASS
- migrate status: 14 migrations, schema up to date
- K22-C: 73/0/0/0 PASS
- scan:docs-pii: no blocking hits
- build: PASS
- tsc: PASS
- targeted eslint: 0 errors, 0 warnings
- git diff --check: clean
- forbidden files: clean (only legitimate tracked: 1 xlsx template, 2 csv templates, 14 migration SQL, 1 temp/README.md)

## 11. Browser Validation Checklist

1. Open `/admin/import`.
2. Select target semester.
3. Upload xlsx.
4. Click `生成审核视图`.
5. Find a row with `教师缺失`.
6. Click `忽略本行`.
7. Verify: row status badge → `已忽略`; `已忽略` counter +1; `需处理` counter -1.
8. Find a row with `教师缺失` (different row).
9. Toggle `允许暂缺` checkbox.
10. Verify: status / counters change; teacher blocker cleared if it was the only blocker.
11. Find a row with `课程缺失`.
12. Choose a course in `选择已有课程` dropdown.
13. Verify: course blocker cleared; status badge / counters change.
14. Find a row with `班级缺失`.
15. Choose a class in `选择已有班级` dropdown.
16. Verify: class blocker cleared; status / counters change.
17. Click `生成部分导入计划`.
18. Verify: plan uses the latest manual resolution state (not the initial pending state).
19. Verify: no `执行导入` / `正式导入` / `应用导入` / `写入数据库` buttons.
20. Verify: browser console has no React error.
21. Verify: DB counts unchanged (prisma 不可观察到写入).

## 12. Privacy / Redaction

The committed JSON has `rawIncluded: false`; the MD has no raw teacher /
class / course / remark text. The plan helper never logs raw rows to stdout.

## 13. Next Stage

L6-F-XLSX-COURSE-SETTING-PARTIAL-IMPORT-EXECUTION.

Requirements: DB backup, explicit confirm, transaction, rollback note.

This stage's plan (L6-E2) is the input to L6-F. L6-F should only import rows
where `plan.summary.plannedImportRows > 0` and `applyReadyForFutureStage === true`.
