# K15-FIX-E-ADMIN-FRONTEND-MODEL-GATING

## Stage Name

K15-FIX-E-ADMIN-FRONTEND-MODEL-GATING

## Date

2026-06-02

## Background

K15-FIX-D-ADMIN-GENERIC-PERMISSION-MATRIX (commit `7fd88f4`) added a `getAdminWritePermission(model)` helper to the admin generic route so that `scheduleslot` POST/PUT uses `schedule:write` and `teachingtask` POST/PUT uses `teaching-task:write`. However, the admin data page frontend still had no model-specific permission checks — all write buttons were always visible, and users without the correct permission would see buttons but get 403 on click.

This stage adds frontend model-specific permission gating to align the admin data page UI with the server permission matrix.

## Fix Goal

Add frontend model-specific permission gating to admin data page so that:

- Create/Edit/Save buttons are gated by model-specific write permission
- Delete buttons are gated by `data:delete`
- Import button is gated by `import:manage`
- Defensive no-op checks prevent handler execution without permission
- Toast messages inform users of missing permissions

## Frontend Permission Matrix

| Model | Create/Update/Edit/Save Permission | Delete Permission |
|---|---|---|
| classgroup | `data:write` | `data:delete` |
| teacher | `data:write` | `data:delete` |
| course | `data:write` | `data:delete` |
| room | `data:write` | `data:delete` |
| scheduleslot | **`schedule:write`** | `data:delete` |
| teachingtask | **`teaching-task:write`** | `data:delete` |

## Implementation

### 1. Model Permission Helper

**File:** `src/lib/admin-db/config.ts`

Added `getAdminModelWritePermission(model)` helper:
```typescript
import type { PermissionKey } from '@/lib/auth/types'

export function getAdminModelWritePermission(model: string): PermissionKey {
  const m = model.toLowerCase()
  if (m === 'scheduleslot') return 'schedule:write'
  if (m === 'teachingtask') return 'teaching-task:write'
  return 'data:write'
}
```

### 2. Admin Data Page Permission Gating

**File:** `src/app/admin/db/admin-db-content.tsx`

Added permission computation:
```typescript
const canWriteCurrentModel = useHasPermission(getAdminModelWritePermission(activeTable))
const canDelete = useHasPermission('data:delete')
const canImport = useHasPermission('import:manage')
```

Added defensive no-op checks in all write handlers:
- `openCreate()` — blocks with toast if `!canWriteCurrentModel`
- `openEdit()` — blocks with toast if `!canWriteCurrentModel`
- `handleSave()` — blocks with toast if `!canWriteCurrentModel`
- `handleTaskSave()` — blocks with toast if `!canWriteCurrentModel`
- `handleSlotSave()` — blocks with toast if `!canWriteCurrentModel`
- `deleteRecord()` — blocks with toast if `!canDelete`

Passed permission props to child components:
- `AdminToolbar`: `canCreate={canWriteCurrentModel}`, `canImport={canImport}`
- `AdminDataTable`: `canEdit={canWriteCurrentModel}`, `canDelete={canDelete}`

### 3. AdminToolbar Permission Props

**File:** `src/components/admin-db/admin-toolbar.tsx`

Added `canCreate` and `canImport` props (default `true`):
- "新增" button: `disabled={!canCreate}` with opacity/cursor styling
- "导入课程表" button: `disabled={!canImport}` with opacity/cursor styling

### 4. AdminDataTable Permission Props

**File:** `src/components/admin-db/admin-data-table.tsx`

Added `canEdit` and `canDelete` props (default `true`):
- "编辑" button: conditionally rendered with `{canEdit && (...)}`
- "删除" button: conditionally rendered with `{canDelete && (...)}`

## Behavior

### scheduleslot without schedule:write
- "新增" button: disabled (grayed out)
- "编辑" button: hidden per row
- If handler is triggered: toast "无权限: 当前模型需要 schedule:write"
- Read-only browsing: preserved

### teachingtask without teaching-task:write
- "新增" button: disabled (grayed out)
- "编辑" button: hidden per row
- If handler is triggered: toast "无权限: 当前模型需要 teaching-task:write"
- Read-only browsing: preserved

### ordinary model without data:write
- "新增" button: disabled (grayed out)
- "编辑" button: hidden per row
- If handler is triggered: toast "无权限: 当前模型需要 data:write"
- Read-only browsing: preserved

### without data:delete
- "删除" button: hidden per row
- If handler is triggered: toast "无权限: 删除操作需要 data:delete 权限"
- Read-only browsing: preserved

### without import:manage
- "导入课程表" button: disabled (grayed out)

## What Fix-E Does NOT Do

- Does NOT modify server route permissions
- Does NOT modify admin generic route `getAdminWritePermission` helper
- Does NOT modify dedicated routes
- Does NOT modify `requirePermission` implementation
- Does NOT modify role mapping or seed-auth
- Does NOT add, remove, or rename permissions
- Does NOT modify Prisma schema or database
- Does NOT modify solver, parser, or importer
- Does NOT change page access policy (still requires `data:write` for `/admin/db`)

## Verification Commands and Results

```bash
# Fix-E verification
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-e.ts
# Result: ✅ All checks passed

# K15 main audit
npx.cmd tsx scripts/audit-rbac-permission-granularity-migration.ts
# Result: Phase A/B/C/D/E DONE

# Admin matrix audit
npx.cmd tsx scripts/audit-rbac-admin-generic-permission-matrix.ts
# Result: HIGH 0 / MEDIUM 0 / LOW 2 / NONE 5

# Fix-D/C/B/A verifications
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-d.ts
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-c.ts
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-b.ts
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-a.ts
# Result: All passed

# Auth seed sync
npx.cmd tsx scripts/validate-rbac-auth-seed-sync.ts
# Result: ✅ All passed

# Build
npm.cmd run build
# Result: ✅ Compiled successfully

# Lint
npm.cmd run lint
# Result: ✅ No errors or warnings

# Auth foundation test
npm.cmd run test:auth-foundation
# Result: 53 passed, 1 failed (pre-existing ScheduleAdjustment)
```

## Risk Change

Admin matrix audit: HIGH 0 / MEDIUM 0 / LOW 2 / NONE 5 (was MEDIUM 1)

- K15-ADMIN-MATRIX-MEDIUM-3 (frontend no model-specific gating): **Resolved** — Phase E done

## Remaining Risk

- **LOW**: `POST /api/teaching-task` (create) still uses `data:write` (not `teaching-task:write`)
- **LOW**: DELETE for schedule-sensitive models uses `data:delete` (has referential integrity)
- **LOW**: Page access still requires `data:write` — a user with only `schedule:write` cannot access `/admin/db`

## K15 Migration Status

All phases complete:
- Phase A: DONE — schedule:write and teaching-task:write defined and seeded
- Phase B: DONE — dedicated routes use granular permissions
- Phase C: DONE — schedule-grid uses schedule:write
- Phase D: DONE — admin generic route uses model-specific permissions
- Phase E: DONE — admin frontend uses model-specific permission gating
