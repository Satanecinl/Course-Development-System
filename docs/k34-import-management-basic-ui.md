# K34-A: Import Management Basic UI

## Stage Overview

**Stage**: K34-A-IMPORT-MANAGEMENT-BASIC-UI-IMPLEMENTATION
**Status**: IMPLEMENTED (pending verification)
**Type**: Frontend-only basic UI implementation
**Scope**: Replace the `/admin/import` placeholder with a functional list/detail/upload page that surfaces existing ImportBatch data.

## Problem

The `/admin/import` page was a placeholder that only displayed:

> 课程表导入管理模块
> 功能建设中，后续版本将提供完整的导入历史查看与管理能力。

The system already had a full set of import APIs, types, and a dialog-based
`ImportBatchHistory` component embedded in `/admin/db`, but there was no
dedicated standalone page where ADMINs could:

- See all import batches in a tabular layout
- Filter by status
- View batch details (warnings, errors, counts)
- Trigger upload, confirm, rollback, or abandon actions
- See warning/error data without crashing on malformed JSON

## Solution

Replace the placeholder with a full import management page that reuses all
existing API routes, client helpers, and types. **No new APIs were added** —
all write operations go through the existing import pipeline.

## Implementation

### Files Created

1. **`src/app/admin/import/import-management-content.tsx`** (new, ~600 lines)
   - Client component implementing the management UI
   - Stats cards (total, pending, confirmed, failed, latest)
   - Status filter tabs (all / pending / confirmed / failed-abandoned)
   - Batch list table with 9 columns
   - Detail dialog with comprehensive info, warnings, errors
   - Upload dialog (reuses `parseImportFile`)
   - Confirm dialog (reuses `confirmImportDryRun` + `confirmImportReal`)
   - Rollback dialog (reuses `rollbackImportBatchDryRun` + `rollbackImportBatch`)
   - Abandon dialog (reuses `abandonImportBatch`)
   - Defensive JSON parsing for `warningsJson`

2. **`scripts/verify-import-management-basic-k34-a.ts`** (new, ~280 lines)
   - Static/lightweight verify script
   - 30+ checks covering file presence, content patterns, API integrity, permission gates, no DB writes, no schema drift

3. **`docs/k34-import-management-basic-ui.md`** (this file)
4. **`docs/k34-import-management-basic-ui.json`** (machine-readable summary)

### Files Modified

- **`src/app/admin/import/page.tsx`**
  - Replaced 26-line placeholder with 18-line server page
  - Now wraps `<ImportManagementContent />` in `<ProtectedShell>`

### Reused APIs (no new routes)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/import/batches` | List batches (semester-scoped) |
| GET | `/api/admin/import/batches/[id]` | Batch detail with stats/quality/warnings |
| POST | `/api/admin/import/parse` | Upload + parse (creates pending batch) |
| POST | `/api/admin/import/confirm` | Dry-run or real confirm |
| POST | `/api/admin/import/rollback` | Dry-run or real rollback |
| POST | `/api/admin/import/batches/[id]/abandon` | Abandon pending batch |

### Reused Client Helpers

All from `src/lib/import/client.ts`:

- `fetchImportBatches()` — list
- `fetchImportBatchDetail(batchId)` — detail
- `parseImportFile(file)` — upload
- `confirmImportDryRun(batchId, strategy)` — preflight
- `confirmImportReal(batchId, strategy)` — real confirm
- `rollbackImportBatchDryRun(batchId)` — preflight
- `rollbackImportBatch(batchId)` — real rollback
- `abandonImportBatch(batchId)` — abandon pending

### ImportBatch Fields (per Prisma schema)

- `id`, `filename`, `originalFilePath`, `parsedJsonPath`
- `statsJson`, `qualityJson`, `warningsJson` (all String?)
- `status` (pending / confirming / confirmed / failed / rolling_back / rolled_back / rollback_failed / abandoned)
- `strategy`, `recordCount`, `createdTaskCount`, `createdSlotCount`
- `errorMessage`, `confirmedAt`, `rolledBackAt`
- `semesterId`, `createdAt`, `updatedAt`

## Status Filter Mapping

| UI Tab | Matched Statuses |
|---|---|
| 全部 | all |
| 待确认 | pending, confirming |
| 已确认 | confirmed, rolling_back, rolled_back, rollback_failed |
| 失败/废弃 | failed, abandoned |

## warningsJson Parsing Strategy

The server already returns `warnings: string[]` after running `safeJsonParse`.
The page **mirrors that defensive parse** on the client (`parseWarningsArray`)
to guarantee the page never crashes on a malformed payload. If parsing fails,
it returns an empty array and the page shows "无 warnings 字段警告" rather
than throwing.

## Upload Support

- **Format**: `.docx` (matches existing `parse` API)
- **UI**: file picker + "上传并解析" button
- **Result**: displays the new batch ID, filename, and record count
- **Limits**: 20MB (enforced by server)
- **Auto-refresh**: list reloads after successful upload

## Confirm Support

- **Flow**: preflight (dry-run) → user types `CONFIRM_IMPORT` → real confirm
- **Cross-cohort approvals**: not yet wired into the basic UI; the page
  shows a notice that the cross-cohort approval flow exists in the parser
  detail dialog. Real cross-cohort approval UI is a follow-up.
- **Strategy**: defaults to `UPSERT_BY_NATURAL_KEY` (only supported strategy)
- **No direct DB writes**: all confirm actions go through `/api/admin/import/confirm`

## Permission Behavior

- Uses `useHasPermission('import:manage')` to gate the entire content component
- Non-`import:manage` users see a "您没有导入管理权限" hint
- Server-side APIs independently enforce `import:manage` via `requirePermission`
- Defense in depth: page-level gate + route-level gate

## Validation Results

To be filled in after running:

```
npx tsx scripts/verify-import-management-basic-k34-a.ts
npx prisma validate
npx prisma migrate status
npm run build
npm run lint
npm run test:auth-foundation
```

## Manual Validation Required

1. ADMIN login
2. Open `/admin/import`
3. Verify list renders
4. Filter by status
5. Click "刷新" — list reloads
6. Click "详情" on a batch — detail dialog opens
7. Try upload flow (optional)
8. Try confirm on a pending batch (optional)
9. Try rollback on a confirmed batch (optional)
10. Try abandon on a pending batch (optional)
11. Switch to USER account — confirm no access

## Known Limitations

- **Cross-cohort approvals** in confirm flow: not wired into the basic UI.
  The page passes `crossCohortApprovals: undefined` to the confirm API, which
  means any cross-cohort warnings will still trigger
  `CROSS_COHORT_APPROVAL_REQUIRED` errors. A dedicated approval UI is a
  follow-up stage (analogous to K19-FIX-B2).
- **Per-semester filter**: the API is semester-scoped (resolved from
  `useSemesterStore` server-side). The page does not expose a semester
  selector because the same semester selector at the top of the shell
  applies. A dedicated semester dropdown on the import page is a follow-up.
- **No file preview**: the page does not show parsed records inline;
  records are visible in the existing `/admin/db` import dialog.

## Recommended Next Stage

**K34-B**: Import management full UI — adds cross-cohort approval UI, batch
comparison (current vs historical), and bulk operations.
