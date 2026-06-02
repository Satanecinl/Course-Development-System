# K15-FIX-B-DEDICATED-ROUTE-PERMISSION-MIGRATION

## Stage Name

K15-FIX-B-DEDICATED-ROUTE-PERMISSION-MIGRATION

## Date

2026-06-02

## Background

K15-FIX-A-AUTH-SEED-SYNC-VALIDATION (commit `496f912`) completed auth seed sync: `schedule:write` and `teaching-task:write` exist in the DB and are granted to ADMIN. K15 audit confirmed Phase A done with Phase B (dedicated routes), Phase C (frontend), and Phase D (admin generic) pending.

This stage implements Phase B: migrate dedicated schedule-slot and teaching-task server routes from `data:write` to their new granular permissions.

## Fix Goal

Replace the coarse `data:write` permission on dedicated schedule-sensitive routes with the fine-grained permissions added in K15 Fix-A, so that:

- Schedule-slot CRUD requires `schedule:write` (not generic `data:write`)
- Teaching-task update requires `teaching-task:write` (not generic `data:write`)

This establishes the permission boundary between ordinary data writes and schedule-sensitive writes at the server route level.

## Modified Routes

### schedule-slot POST (`src/app/api/schedule-slot/route.ts`)

- `requirePermission('data:write', request)` → `requirePermission('schedule:write', request)`
- Preserved: `guardSlotCreate` conflict check, semester guard, `conflictDetails` in error response, `scheduleChangeLog` creation, response shape

### schedule-slot PUT (`src/app/api/schedule-slot/[id]/route.ts`)

- `requirePermission('data:write', request)` → `requirePermission('schedule:write', request)`
- Preserved: `guardSlotUpdate` conflict check, `conflictDetails` in error response, `scheduleChangeLog` creation, response shape

### teaching-task PUT (`src/app/api/teaching-task/[id]/route.ts`)

- `requirePermission('data:write', request)` → `requirePermission('teaching-task:write', request)`
- Preserved: `checkScheduleConflicts` room conflict check, `conflictDetails` in 409 response, transaction with TeachingTask update, ScheduleSlot updateMany, TeachingTaskClass sync, response shape

## DELETE /api/schedule-slot/[id]

Does not exist as a dedicated route. ScheduleSlot deletion is handled only through the admin generic `DELETE /api/admin/[model]` route (Phase D pending).

## What Fix-B Does NOT Do

- Does NOT modify admin generic route (`/api/admin/[model]`)
- Does NOT modify frontend gating (schedule-grid still uses `data:write`)
- Does NOT modify role mapping
- Does NOT modify `requirePermission` implementation
- Does NOT modify seed-auth permission assignments
- Does NOT delete or weaken `data:write`
- Does NOT modify `schedule:adjust` or `import:manage`
- Does NOT modify Prisma schema
- Does NOT modify solver, parser, or importer
- Does NOT add `/api/scheduler/run`
- Does NOT add UI semester selector

## Why ADMIN Is Not Affected

ADMIN has all 12 permissions (including `schedule:write` and `teaching-task:write`) since K15 Fix-A seed sync. The permission change from `data:write` to `schedule:write`/`teaching-task:write` is transparent to ADMIN — they already have both.

USER and DATA_EXPORTER do not have `data:write`, `schedule:write`, or `teaching-task:write`, so they are unaffected by this change.

## Server Guard Preservation

All existing guards remain intact:

| Route | Guard | Status |
|---|---|---|
| POST /api/schedule-slot | `guardSlotCreate` (conflict + semester) | Preserved |
| PUT /api/schedule-slot/[id] | `guardSlotUpdate` (conflict) | Preserved |
| PUT /api/teaching-task/[id] | `checkScheduleConflicts` (room conflict) | Preserved |
| All routes | `conflictDetails` in error responses | Preserved |

## Response Shape Compatibility

No response shapes were changed. All error responses still return `{ error, conflicts, conflictDetails }` as before. The `ScheduleConflictDetail` type is unchanged.

## Verification Commands and Results

```bash
# Fix-B verification (29 checks)
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-b.ts
# Result: ✅ 29 passed, 0 failed

# Fix-A verification (29 checks, Phase-B-aware)
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-a.ts
# Result: ✅ 29 passed, 0 failed (Phase B route migration detected)

# K15 audit
npx.cmd tsx scripts/audit-rbac-permission-granularity-migration.ts
# Result: Phase A DONE, Phase B DONE, Phase C PENDING, Phase D PENDING
# HIGH 0 / MEDIUM 4 / LOW 4 / NONE 4

# Auth seed sync validation
npx.cmd tsx scripts/validate-rbac-auth-seed-sync.ts
# Result: ✅ 44 passed, 0 failed

# K14 schedule write hardening audit
npx.cmd tsx scripts/audit-rbac-schedule-write-hardening.ts
# Result: HIGH 0 / MEDIUM 2 / LOW 2 / NONE 9

# K11 schedule mutation server guards audit
npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts
# Result: HIGH 0 / MEDIUM 0 / LOW 3 / NONE 8

# K13 response shape verification
npx.cmd tsx scripts/verify-schedule-conflict-response-shape-fix-d.ts
# Result: ✅ 60 passed, 0 failed

# K12 preflight verification
npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts
# Result: ✅ 23 passed, 0 failed

# Build
npm.cmd run build
# Result: ✅ Compiled successfully, 44 pages

# Lint
npx.cmd eslint (modified files)
# Result: ✅ No errors or warnings

# Auth foundation test
npm.cmd run test:auth-foundation
# Result: 53 passed, 1 failed
# - Only failure: ScheduleAdjustment ACTIVE = 0 (实际 10) — pre-existing
# - No new auth/RBAC failures
```

## Risk Change

| Risk ID | Severity Before | Severity After | Change |
|---|---|---|---|
| K15-RBAC-MEDIUM-1 | MEDIUM | MEDIUM → LOW | Dedicated routes no longer share data:write with ordinary data. Remaining scope: admin generic route. |
| K15-RBAC-MEDIUM-2 | MEDIUM | MEDIUM | Unchanged — admin generic route still uses data:write for all models |
| K15-RBAC-MEDIUM-3 | MEDIUM | MEDIUM | Unchanged — frontend schedule-grid still uses data:write |
| K15-RBAC-MEDIUM-4 | MEDIUM | MEDIUM | Unchanged — import:manage scope unchanged |
| K14-RBAC-MEDIUM-1 | MEDIUM | LOW | Dedicated schedule-slot routes now use schedule:write, not data:write |
| K14-RBAC-MEDIUM-6 | MEDIUM | LOW | data:write no longer covers dedicated schedule-sensitive routes |

## Remaining Risk

- **MEDIUM**: Admin generic route (`/api/admin/[model]`) still uses `data:write` for scheduleslot and teachingtask — Phase D pending
- **MEDIUM**: Frontend schedule-grid still uses `data:write` for drag-to-edit — Phase C pending
- **LOW**: `POST /api/teaching-task` (create) still uses `data:write` — could be migrated to `teaching-task:write` but is lower priority since it doesn't directly mutate schedule slots

## Next Stage Recommendation

- **Phase C**: Migrate frontend schedule-grid gating from `data:write` to `schedule:write`
- **Phase D**: Migrate admin generic route with model-specific permission matrix

Recommended next stage: K15-FIX-C-FRONTEND-GATING-MIGRATION
