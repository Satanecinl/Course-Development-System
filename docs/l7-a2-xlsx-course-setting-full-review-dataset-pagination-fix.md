# L7-A2: Full Review Dataset and Pagination Fix

## 1. Browser Blocker

User reported `/admin/import` review mode showing "总计 50 / 待审核 50 / 显示 50/50" even though the new template has ~1167 course rows. The system was retaining the old 200-row limit in the approval-review API.

## 2. Root Cause

- `approval-review/route.ts`: `DEFAULT_MAX_ROWS = 200`, `ABSOLUTE_MAX_ROWS = 5000`
- `preview/route.ts`: `maxPreviewRows` defaults to 50, max 200
- Frontend had no pagination — rendered all received rows in a single table

## 3. Fix Summary

### Backend
- Raised `DEFAULT_MAX_ROWS` and `ABSOLUTE_MAX_ROWS` to 100000 in `approval-review/route.ts`
- Raised `maxPreviewRows` default to 10000, max to 100000 in `preview/route.ts`

### Frontend
- Added `PAGE_SIZE = 50` constant in orchestrator
- Added `reviewPage` and `resolutionPage` state
- Computed `paginatedFilteredRows` from `filteredRows.slice((page-1)*50, page*50)`
- Computed `paginatedFilteredResolutionItems` similarly
- Page auto-clamps to valid range via `Math.min(page, totalPages)`
- Filters/search operate on full dataset before pagination
- State (decisions, resolutions) keyed by `approvalItemId`, preserved across pages
- Export functions iterate full arrays (`reviewResult.rows`, `resolutionItems`), not paginated subsets
- Partial plan receives all `resolutionItems`, not paginated

### UI
- Approval Review Section: added pagination controls (首页/上一页/下一页/末页) with page info
- Manual Resolution Section: added pagination controls with page info
- Counter display: "筛选结果 N 条，当前显示 X-Y / N，第 P/T 页"
- Export button text: "导出全量审核决策 JSON" / "导出全量处理结果 JSON"

## 4. No DB Write Proof

- No Prisma write methods
- No Course/Teacher/ClassGroup/TeachingTask/ImportBatch creation
- No apply route
- No apply buttons

## 5. Validation Results

- L7-A verify: 105/105 PASS
- L6-E2G1 regression: 54/54 PASS
- L6-E2F regression: 45/45 PASS
- L6-E2A regression: 85/85 PASS
- L6-E2 regression: 144/144 PASS
- prisma validate: PASS
- migrate status: PASS
- build: PASS
- tsc: PASS
- eslint: 0 errors, 3 pre-existing warnings

## 6. Browser Validation Checklist

> L7-A2 code complete; browser manual validation pending.

1. 打开 `/admin/import`，选择目标学期，上传 `课程设置新模板.xlsx`
2. 生成审核视图
3. Summary 显示真实总数（约 1167），不再显示 50
4. 页面显示 "当前显示 1-50 / 1167，第 1/24 页"
5. 下一页按钮可点击，显示 51-100
6. 首页/末页按钮正常
7. 筛选后分页重置为第一页
8. 翻页后已选决策不丢失
9. 手动处理区也有分页
10. 导出审核 JSON 为全量数据
11. 生成部分导入计划基于全量数据
12. 新模板规则不回退
13. 无 apply/write DB button
14. Browser console 无 React error

## 7. Next Stage Recommendation

L7-F-XLSX-COURSE-SETTING-NEW-TEMPLATE-PARTIAL-IMPORT-EXECUTION (after browser validation)
