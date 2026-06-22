# L7-A2A: Approval Review Full Dataset Wiring Fix

## 1. Browser Blocker

After L7-A2 raised `DEFAULT_MAX_ROWS` and `ABSOLUTE_MAX_ROWS` to 100000 in
the approval-review API and added client-side pagination, the user still
observed the bug:

```text
解析预览：能展示全量课程行（约 1167 条）
生成审核视图：仍然只有 50 条
审核模式显示：总计 50 / 待审核 50 / 当前显示 1-50 / 50 / 第 1/1 页
```

The L7-A2 verify script reported all green, but the user still saw 50. The
L7-F write-DB stage remained blocked because the chain ended in a truncated
review dataset.

## 2. Why L7-A2 Failed

L7-A2 raised the route-level caps but missed that the L4 mapper has its own
internal cap. The approval-review route called
`buildCourseSettingTeachingTaskDryRun` WITHOUT passing `maxPreviewRows`,
so the L4 mapper's default of 50 silently capped `previewCandidates` at
50. The approval package then had only 50 `reviewItems`, which the route
returned as the `rows` array.

In other words: the route-level `maxRows` slice at the end of the response
build was never the bottleneck — the upstream mapper was the bottleneck.

## 3. Root Cause (verified by direct call)

Running the L4 mapper against the new template with NO `maxPreviewRows`
option:

```text
totalCourseRows: 1167
teachingTaskCandidates: 1167
previewCandidates.length: 50    <-- the bug
rowsNeedingManualReview: 1167
```

With `maxPreviewRows: 100000`:

```text
previewCandidates.length: 1167  <-- correct
```

## 4. Fix Summary

### approval-review route (root-cause fix)

The route now explicitly passes `maxPreviewRows: ABSOLUTE_MAX_ROWS` to the
L4 mapper, so `previewCandidates` carries the full dataset. Without this,
the L4 mapper's default of 50 would silently cap the upstream that feeds
the approval package, regardless of route-level `maxRows`.

```ts
const dryRunResult = await buildCourseSettingTeachingTaskDryRun({
  xlsxBuffer: buffer,
  artifactFilename: file.name,
  existingData,
  options: {
    parserVersion: 'l2-parser-v1',
    includeRawValues: true,
    maxPreviewRows: ABSOLUTE_MAX_ROWS,   // <-- L7-A2A fix
  },
})
```

### reviewDatasetSummary surface

The response now carries a `reviewDatasetSummary` block that the client
can read to confirm it received the full dataset. The block reports:

| Field                     | Meaning                                                 |
|---------------------------|---------------------------------------------------------|
| `templateVersion`         | Detected template version                              |
| `totalRows`               | Total rows in the Excel workbook                       |
| `totalCourseRows`         | Number of course rows                                   |
| `skippedSubtotalRows`     | Rows that are subtotal / blank / header                 |
| `totalReviewItems`        | Review items built by the L6-D approval package         |
| `approvalItemsReturned`   | Rows actually included in the response (full dataset)   |
| `paginationMode`          | `'client-side'` (L7-A2A standard)                      |
| `pageSize`                | `50`                                                    |
| `dataScope`               | `'fullDataset'`                                         |
| `maxRowsSafetyCap`        | `100000` (the route-level safety cap)                   |
| `rowsSafetyTruncated`     | `0` for the standard main path                          |

Invariants:

- `approvalItemsReturned === totalReviewItems` (the route returns the
  full array, not a slice)
- `dataScope === 'fullDataset'`
- `paginationMode === 'client-side'`
- `rowsSafetyTruncated === 0`

### preview helper (defensive consistency)

The preview helper also forwards `maxPreviewRows` to the L4 mapper. The
preview route's bottom table was already showing the full dataset, but
the underlying `previewCandidates` array was being capped at 50. This
keeps the preview path consistent with the approval-review path.

### Client-side types

`CourseSettingApprovalReviewUiResponse` now declares an optional
`reviewDatasetSummary` field of type
`CourseSettingApprovalReviewUiDatasetSummary`. The response `stage` literal
includes the new `'L7-A2A-XLSX-COURSE-SETTING-APPROVAL-REVIEW-FULL-DATASET-WIRING-FIX'`
value.

### UI summary uses full dataset total

The orchestrator's `handleReview` toast now reads:

```ts
const total = data.reviewDatasetSummary?.totalReviewItems ?? data.summary.totalItems
toast.success('审核视图已生成', {
  description: `共 ${total} 条审核项（${data.reviewDatasetSummary?.dataScope ?? 'fullDataset'}），不会写入数据库`,
})
```

The new "全量数据集 / fullDataset" banner in the approval review section
displays the `reviewDatasetSummary` fields directly so the user can see
the totals and confirm `approvalItemsReturned === totalReviewItems`.

## 5. No DB writes / no apply

- No Prisma write methods introduced (`create`, `update`, `upsert`,
  `delete`, `createMany`, `updateMany`, `deleteMany`, `executeRaw`,
  `$executeRaw`)
- No `Course` / `Teacher` / `ClassGroup` / `TeachingTask` /
  `TeachingTaskClass` / `ImportBatch` creation
- No `partial-import-apply` route directory
- No `applyAllowed: true` / `canApply: true` / `执行导入` / `正式导入`
  button text
- No schema / migration change
- No scheduler / score change
- No Word parser change
- No `package.json` / `package-lock.json` change

## 6. Validation Results

- L7-A2A verify: 78/78 checks pass (this script)
- L7-A2 regression: re-run after L7-A2A fix
- L7-A regression: re-run after L7-A2A fix
- L6-E2G1 / L6-E2G / L6-E2F / L6-E2E / L6-E2D / L6-E2C / L6-E1 / L6-E2
  regression: re-run after L7-A2A fix
- `prisma validate`: PASS
- `prisma migrate status`: PASS
- `scan:docs-pii`: PASS
- `npm run build`: PASS
- `npx tsc --noEmit`: PASS
- `npx eslint`: PASS on touched files
- `K22-C`: PASS
- `git diff --check`: clean

## 7. Browser Validation Checklist (manual, post-commit)

1. Open `/admin/import`
2. Select target semester
3. Upload `课程设置新模板.xlsx`
4. Click 解析预览 → confirm full dataset (1167 course rows)
5. Click 生成审核视图
6. Confirm banner shows:
   - `全量数据集 / fullDataset`
   - `审核项总数: 1167`
   - `已返回: 1167`
7. Confirm summary cards show `总计: 1167`
8. Confirm counter line shows `当前显示 1-50 / 1167，第 1/24 页`
9. Click 下一页 → confirm `当前显示 51-100 / 1167`
10. Confirm page count is 24 (not 1/1)
11. Apply a filter or search → confirm filter runs on full 1167 set, then
    pagination re-slices the filtered subset
12. Click 导出审核决策 JSON → confirm JSON contains all 1167 decisions
13. Click 生成部分导入计划 → confirm plan uses full resolution items
14. Confirm no apply / write-DB button appears
15. Confirm browser console has no React error
16. DB counts unchanged

## 8. Next Stage Recommendation

L7-A2A closes once browser validation passes. After that, re-evaluate
entering L7-F (XLSX course setting new template partial import execution).
L7-F remains blocked until L7-A2A is browser-validated.
