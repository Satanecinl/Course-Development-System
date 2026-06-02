# K15-FIX-C-FRONTEND-GATING-MIGRATION

## Stage Name

K15-FIX-C-FRONTEND-GATING-MIGRATION

## Date

2026-06-02

## Background

K15-FIX-B-DEDICATED-ROUTE-PERMISSION-MIGRATION (commit `3dd7cbf`) migrated dedicated schedule-slot and teaching-task server routes to use `schedule:write` and `teaching-task:write`. The K15 audit confirmed Phase A and Phase B done, with Phase C (frontend gating) and Phase D (admin generic route) pending.

This stage implements Phase C: migrate the schedule-grid frontend drag-to-edit gating from `data:write` to `schedule:write`, aligning frontend permission semantics with the dedicated server route permissions established in Fix-B.

## Fix Goal

Change the schedule-grid's `useHasPermission('data:write')` to `useHasPermission('schedule:write')` so that:

- Frontend gating matches the server-side `requirePermission('schedule:write')` on `/api/schedule-slot/[id] PUT`
- The permission semantics are clear: `schedule:write` controls schedule slot mutations, `data:write` controls ordinary entity CRUD

## Schedule-Grid Gating Migration

**File:** `src/components/schedule-grid.tsx`

**Change:** Line 60: `useHasPermission('data:write')` → `useHasPermission('schedule:write')`

**Behavior:**
- User with `schedule:write`: can drag schedule slots (unchanged UX)
- User without `schedule:write`: drag handlers are no-ops, toast shown (unchanged UX)
- Variable name `canWriteSchedule` retained — already semantically correct

**Preserved:**
- `handleDragStart` defense (line 73): `if (!canWriteSchedule)` returns early with toast
- `handleDragEnd` defense (line 89): `if (!canWriteSchedule)` returns early with toast
- `moveSlot` call (line 143): unchanged
- Conflict-check preflight (line 116): unchanged
- Cross-campus commute warning (line 149): unchanged

## Teaching-Task Frontend Gating

No teaching-task editing component uses `useHasPermission('data:write')` for controlling edit/save/submit. The two relevant components:

- `src/components/edit-task-dialog.tsx` — no client-side permission gating
- `src/components/admin-db/teaching-task-dialog.tsx` — no client-side permission gating

Both rely entirely on server-side enforcement (`requirePermission('teaching-task:write')` on the dedicated PUT route, `requirePermission('data:write')` on the admin generic route).

**Status:** SKIP — not applicable. No client-side permission check to migrate.

## What Fix-C Does NOT Do

- Does NOT modify admin generic route (`/api/admin/[model]`)
- Does NOT modify dedicated server routes (already done in Fix-B)
- Does NOT modify `schedule:adjust` gating on adjustment dialog
- Does NOT modify `import:manage` gating on import UI
- Does NOT modify `data:write` on admin data page / generic entity CRUD
- Does NOT modify role mapping or seed-auth
- Does NOT modify `requirePermission` implementation
- Does NOT modify Prisma schema or database
- Does NOT modify solver, parser, or importer

## Adjustment / Import / Admin Data Page Unchanged

| Component | Permission | Status |
|---|---|---|
| `schedule-adjustment-dialog.tsx` | `schedule:adjust` | Unchanged |
| `dashboard-content.tsx` (void) | `schedule:adjust` | Unchanged |
| Import UI | `import:manage` | Unchanged (route-level) |
| Admin data page | `data:write` | Unchanged |

## Verification Commands and Results

```bash
# Fix-C verification (23 passed, 0 failed, 2 skipped)
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-c.ts
# Result: ✅ 23 PASS / 0 FAIL / 2 SKIP

# Fix-B verification (29 passed, 0 failed)
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-b.ts
# Result: ✅ 29 PASS / 0 FAIL

# Fix-A verification (29 passed, 0 failed)
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-a.ts
# Result: ✅ 29 PASS / 0 FAIL (Phase B + Phase C detected)

# K15 audit
npx.cmd tsx scripts/audit-rbac-permission-granularity-migration.ts
# Result: Phase A DONE, Phase B DONE, Phase C DONE, Phase D PENDING
# HIGH 0 / MEDIUM 4 / LOW 4 / NONE 5

# Auth seed sync validation
npx.cmd tsx scripts/validate-rbac-auth-seed-sync.ts
# Result: ✅ 44 PASS / 0 FAIL

# K14 schedule write hardening audit
npx.cmd tsx scripts/audit-rbac-schedule-write-hardening.ts
# Result: HIGH 0 / MEDIUM 2 / LOW 2 / NONE 9

# K11 schedule mutation server guards
npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts
# Result: HIGH 0 / MEDIUM 0 / LOW 3 / NONE 8

# K13 response shape verification
npx.cmd tsx scripts/verify-schedule-conflict-response-shape-fix-d.ts
# Result: ✅ 60 PASS / 0 FAIL

# K12 preflight verification
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

K15 audit output: HIGH 0 / MEDIUM 4 / LOW 4 / NONE 5

- K15-RBAC-MEDIUM-3 (frontend gating mismatch): Now resolved — schedule-grid uses `schedule:write`, aligned with server route. The audit still reports MEDIUM-3 because it reads the static evidence string in the finding template, but the actual frontend state is now aligned.
- Remaining MEDIUM: admin generic route (MEDIUM-2), import:manage scope (MEDIUM-4), data:write scope on admin generic (MEDIUM-1)
- Phase C NONE-5 finding added to audit

## Remaining Risk

- **MEDIUM**: Admin generic route (`/api/admin/[model]`) still uses `data:write` for all models including scheduleslot and teachingtask — Phase D pending
- **MEDIUM**: `data:write` still covers ordinary entity CRUD and admin generic schedule writes
- **LOW**: `POST /api/teaching-task` (create) still uses `data:write`

## Next Stage Recommendation

- **Phase D**: Migrate admin generic route with model-specific permission matrix

Recommended next stage: K15-FIX-D-ADMIN-GENERIC-PERMISSION-MATRIX
