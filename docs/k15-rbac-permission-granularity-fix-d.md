# K15-FIX-D-ADMIN-GENERIC-PERMISSION-MATRIX

## Stage Name

K15-FIX-D-ADMIN-GENERIC-PERMISSION-MATRIX

## Date

2026-06-02

## Background

K15-FIX-D-ADMIN-GENERIC-PERMISSION-MATRIX-AUDIT (commit `6d8a970`) analyzed the `/api/admin/[model]` generic route and found that all 6 models use uniform `data:write` for POST/PUT, creating an inconsistency with dedicated routes that use granular permissions. The audit recommended Option A: minimal server-only matrix migration.

This stage implements the model-specific write permission matrix in the admin generic route.

## Fix Goal

Add a `getAdminWritePermission(model)` helper to the admin generic route so that:

- `scheduleslot` POST/PUT → `schedule:write` (aligned with dedicated `/api/schedule-slot`)
- `teachingtask` POST/PUT → `teaching-task:write` (aligned with dedicated `/api/teaching-task/[id]`)
- `classgroup`/`teacher`/`course`/`room` POST/PUT → `data:write` (unchanged)
- DELETE for all models → `data:delete` (unchanged)
- GET for all models → `data:read` (unchanged)

## Permission Matrix

| Model | POST Permission | PUT Permission | DELETE Permission | Decision |
|---|---|---|---|---|
| classgroup | `data:write` | `data:write` | `data:delete` | Keep `data:write` |
| teacher | `data:write` | `data:write` | `data:delete` | Keep `data:write` |
| course | `data:write` | `data:write` | `data:delete` | Keep `data:write` |
| room | `data:write` | `data:write` | `data:delete` | Keep `data:write` |
| scheduleslot | **`schedule:write`** | **`schedule:write`** | `data:delete` | Migrated |
| teachingtask | **`teaching-task:write`** | **`teaching-task:write`** | `data:delete` | Migrated |

## Implementation

**File:** `src/app/api/admin/[model]/route.ts`

**Added:** `getAdminWritePermission(model)` helper (returns `PermissionKey`):
```typescript
function getAdminWritePermission(model: string): PermissionKey {
  const m = model.toLowerCase()
  if (m === 'scheduleslot') return 'schedule:write'
  if (m === 'teachingtask') return 'teaching-task:write'
  return 'data:write'
}
```

**Changed:** POST handler (line ~192): `requirePermission(getAdminWritePermission(model), req)`
**Changed:** PUT handler (line ~245): `requirePermission(getAdminWritePermission(model), req)`
**Unchanged:** GET handler: `requirePermission('data:read', req)`
**Unchanged:** DELETE handler: `requirePermission('data:delete', req)`

## Scheduleslot Generic Route

- POST: `data:write` → `schedule:write` ✅
- PUT: `data:write` → `schedule:write` ✅
- DELETE: `data:delete` (unchanged) ✅
- Mutation guard (guardAdminSlotCreate/guardAdminSlotUpdate): preserved ✅
- Semester guard: preserved ✅
- Conflict check: preserved ✅
- `conflictDetails`: preserved ✅
- Response shape: unchanged ✅

## Teachingtask Generic Route

- POST: `data:write` → `teaching-task:write` ✅
- PUT: `data:write` → `teaching-task:write` ✅
- DELETE: `data:delete` (unchanged) ✅
- Teacher conflict guard (guardAdminTaskUpdate): preserved ✅
- Conflict check: preserved ✅
- `conflictDetails`: preserved ✅
- Response shape: unchanged ✅

## What Fix-D Does NOT Do

- Does NOT modify frontend admin data page
- Does NOT modify schedule-grid (still `schedule:write` from Fix-C)
- Does NOT modify dedicated routes (still `schedule:write`/`teaching-task:write` from Fix-B)
- Does NOT modify role mapping or seed-auth
- Does NOT modify `requirePermission` implementation
- Does NOT add, remove, or rename permissions
- Does NOT modify Prisma schema or database
- Does NOT modify solver, parser, or importer

## Verification Commands and Results

```bash
# Fix-D verification (28 passed, 0 failed)
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-d.ts
# Result: ✅ 28 PASS / 0 FAIL

# Admin matrix audit (35 passed, 0 failed)
npx.cmd tsx scripts/audit-rbac-admin-generic-permission-matrix.ts
# Result: ✅ 35 PASS / 0 FAIL. HIGH 0 / MEDIUM 1 / LOW 2 / NONE 4

# K15 main audit
npx.cmd tsx scripts/audit-rbac-permission-granularity-migration.ts
# Result: Phase A/B/C/D DONE, Phase E PENDING

# Fix-C/B/A verifications
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-c.ts
# Result: ✅ 23 PASS / 0 FAIL / 2 SKIP
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-b.ts
# Result: ✅ 29 PASS / 0 FAIL
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-a.ts
# Result: ✅ 29 PASS / 0 FAIL

# Auth seed sync
npx.cmd tsx scripts/validate-rbac-auth-seed-sync.ts
# Result: ✅ 44 PASS / 0 FAIL

# K14/K11/K13/K12 regression
npx.cmd tsx scripts/audit-rbac-schedule-write-hardening.ts
# Result: HIGH 0 / MEDIUM 2 / LOW 2 / NONE 9
npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts
# Result: HIGH 0 / MEDIUM 0 / LOW 3 / NONE 8
npx.cmd tsx scripts/verify-schedule-conflict-response-shape-fix-d.ts
# Result: ✅ 60 PASS / 0 FAIL
npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts
# Result: ✅ 23 PASS / 0 FAIL

# Build
npm.cmd run build
# Result: ✅ Compiled successfully, 44 pages

# Lint
npx.cmd eslint (modified files)
# Result: ✅ No errors or warnings

# Auth foundation test
npm.cmd run test:auth-foundation
# Result: 53 passed, 1 failed (pre-existing ScheduleAdjustment)
```

## Risk Change

Admin matrix audit: HIGH 0 / MEDIUM 1 / LOW 2 / NONE 4 (was MEDIUM 3)

- K15-ADMIN-MATRIX-MEDIUM-1 (uniform permission): **Resolved** — model-specific matrix implemented
- K15-ADMIN-MATRIX-MEDIUM-2 (dedicated vs generic inconsistency): **Resolved** — aligned
- K15-ADMIN-MATRIX-MEDIUM-3 (frontend no model-specific gating): **Unchanged** — Phase E pending

## Remaining Risk

- **MEDIUM**: Admin frontend data page has no model-specific permission checks — users with `data:write` but lacking `schedule:write`/`teaching-task:write` will see buttons but get 403 on click (Phase E)
- **LOW**: `POST /api/teaching-task` (create) still uses `data:write` (not `teaching-task:write`)
- **LOW**: DELETE for schedule-sensitive models uses `data:delete` (has referential integrity)

## Next Stage Recommendation

- **Phase E**: Add frontend model-specific permission gating to admin data page

Recommended next stage: K15-FIX-E-ADMIN-FRONTEND-MODEL-GATING
