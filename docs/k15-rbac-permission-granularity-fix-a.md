# K15-FIX-A-MINIMAL-PERMISSION-SPLIT

## Stage Name

K15-FIX-A-MINIMAL-PERMISSION-SPLIT

## Date

2026-06-02

## Background

K15-RBAC-PERMISSION-GRANULARITY-MIGRATION-AUDIT (commit `3b820d7`) completed a full audit of the RBAC permission landscape. The audit found:

- HIGH: 0
- MEDIUM: 4 (all related to `data:write` covering schedule-sensitive operations)
- LOW: 4
- NONE: 2

The audit recommended Option A (Minimal Split): add `schedule:write` and `teaching-task:write` alongside existing permissions, without removing or weakening `data:write`.

Fix-A implements Phase A of the migration: permission definition and ADMIN seed mapping only.

## Fix Goal

Add two new granular permission constants to the system so that subsequent migration phases can gradually shift schedule-sensitive routes and frontend gating from `data:write` to the new permissions.

## What Fix-A Does

1. Adds `schedule:write` to `ALL_PERMISSIONS` in `src/lib/auth/types.ts`
2. Adds `teaching-task:write` to `ALL_PERMISSIONS` in `src/lib/auth/types.ts`
3. Adds permission descriptions in `scripts/seed-auth.ts`
4. ADMIN role automatically receives new permissions via `for (const key of ALL_PERMISSIONS)` loop in seed-auth

## What Fix-A Does NOT Do

- Does NOT migrate any API route from `data:write` to new permissions
- Does NOT modify frontend gating (schedule-grid still uses `data:write`)
- Does NOT modify admin generic route permission logic
- Does NOT delete or weaken `data:write`
- Does NOT modify `requirePermission` behavior
- Does NOT modify `schedule:adjust` or `import:manage`
- Does NOT modify USER or DATA_EXPORTER role permissions
- Does NOT modify Prisma schema
- Does NOT run database seed (new permissions applied on next seed run)
- Does NOT modify solver, parser, or importer

## New Permissions

| Permission | Description | Granted To |
|---|---|---|
| `schedule:write` | 创建、修改、删除课表时段或拖拽课表 | ADMIN (via ALL_PERMISSIONS loop) |
| `teaching-task:write` | 修改教学任务中会影响排课结果的字段 | ADMIN (via ALL_PERMISSIONS loop) |

## Permission Definition Location

`src/lib/auth/types.ts` — `ALL_PERMISSIONS` array now contains 12 entries (was 10).

## Seed-Auth Description Location

`scripts/seed-auth.ts` — `getPermissionDescription()` function now includes:
- `'schedule:write': '写入课表时段'`
- `'teaching-task:write': '写入教学任务'`

## ADMIN Role Mapping

The seed script uses `for (const key of ALL_PERMISSIONS)` to bind all permissions to ADMIN. Since `schedule:write` and `teaching-task:write` are now in `ALL_PERMISSIONS`, ADMIN will automatically receive them on the next seed run.

## USER / DATA_EXPORTER Unchanged

- USER: still only `data:read`
- DATA_EXPORTER: still only `data:read` + `data:export`

The seed script uses specific `permissionRecords.get()` calls for these roles, not the `ALL_PERMISSIONS` loop. New permissions are not granted to them.

## Routes NOT Migrated

All API routes continue to use their existing permissions:

| Route | Current Permission | Future Permission |
|---|---|---|
| `POST /api/schedule-slot` | `data:write` | `schedule:write` (Phase C) |
| `PUT /api/schedule-slot/[id]` | `data:write` | `schedule:write` (Phase C) |
| `POST /api/teaching-task` | `data:write` | `teaching-task:write` (Phase C) |
| `PUT /api/teaching-task/[id]` | `data:write` | `teaching-task:write` (Phase C) |
| `admin/[model] POST/PUT` | `data:write` | Model-specific (Phase D) |

## Frontend Gating NOT Migrated

| Component | Current Permission | Future Permission |
|---|---|---|
| `schedule-grid.tsx` drag-to-edit | `data:write` | `schedule:write` (Phase B) |
| `schedule-adjustment-dialog.tsx` | `schedule:adjust` | `schedule:adjust` (no change) |
| `dashboard-content.tsx` void | `schedule:adjust` | `schedule:adjust` (no change) |

## Seed-Auth Initialization Note

This stage updates the seed/init logic to include new permissions. The actual `prisma/dev.db` database has NOT been re-seeded. The new permissions will be created in the database when `npx.cmd tsx scripts/seed-auth.ts` is executed in a deployment or initialization context.

Running `test:auth-foundation` after Fix-A but before re-seeding will show the admin user having 10 permissions instead of 12 — this is expected and correct. The test dynamically checks against `ALL_PERMISSIONS.length` which now reflects 12.

## Verification Commands and Results

```bash
# Fix-A verification (30 checks)
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-a.ts
# Result: ✅ 30 passed, 0 failed

# K15 audit script (Phase A detection)
npx.cmd tsx scripts/audit-rbac-permission-granularity-migration.ts
# Result: Phase A complete, MEDIUM 4, LOW 4, NONE 3

# Build
npm.cmd run build
# Result: ✅ Compiled successfully, 44 pages

# Lint (modified files)
npx.cmd eslint scripts/verify-rbac-permission-granularity-fix-a.ts scripts/audit-rbac-permission-granularity-migration.ts src/lib/auth/types.ts scripts/seed-auth.ts
# Result: ✅ No errors or warnings

# Auth foundation test
npm.cmd run test:auth-foundation
# Result: 50 passed, 4 failed
# - 3 new failures: admin permission count (10 vs 12), schedule:write missing, teaching-task:write missing
# - These are expected: DB not re-seeded yet
# - 1 pre-existing failure: ScheduleAdjustment ACTIVE count mismatch
```

## test:auth-foundation Failure Classification

| Failure | Type | Cause | Action |
|---|---|---|---|
| `admin 拥有全部 12 个权限 (实际 10)` | Expected | DB not re-seeded | Will resolve after running seed-auth |
| `admin 拥有 schedule:write` | Expected | DB not re-seeded | Will resolve after running seed-auth |
| `admin 拥有 teaching-task:write` | Expected | DB not re-seeded | Will resolve after running seed-auth |
| `ScheduleAdjustment ACTIVE = 0 (实际 10)` | Pre-existing | DB state issue | NOT modified — non-blocking |

No new auth/RBAC failures beyond the expected seed-not-run cases.

## Risk Change

| Risk ID | Severity Before | Severity After | Change |
|---|---|---|---|
| K15-RBAC-MEDIUM-1 | MEDIUM | MEDIUM | Unchanged — routes still use data:write |
| K15-RBAC-MEDIUM-2 | MEDIUM | MEDIUM | Unchanged — admin generic route unchanged |
| K15-RBAC-MEDIUM-3 | MEDIUM | MEDIUM | Unchanged — frontend gating unchanged |
| K15-RBAC-MEDIUM-4 | MEDIUM | MEDIUM | Unchanged — import:manage scope unchanged |
| K15-RBAC-LOW-1 | LOW | LOW | Unchanged — naming still broad |
| K15-RBAC-LOW-2 | LOW | LOW | Unchanged |
| K15-RBAC-LOW-3 | LOW | LOW | Unchanged |
| K15-RBAC-LOW-4 | LOW | LOW | Unchanged |
| K15-RBAC-NONE-1 | NONE | NONE | Unchanged |
| K15-RBAC-NONE-2 | NONE | NONE | Unchanged |
| K15-RBAC-NONE-3 | — | NONE | NEW — Phase A completion recognized |

## Remaining Risk

All MEDIUM findings from K15 audit remain. Fix-A is a foundation step — it does not reduce risk by itself. Risk reduction occurs when subsequent phases migrate routes and frontend gating to use the new granular permissions.

## Next Stage Recommendation

- **Phase B**: Migrate frontend schedule-grid gating from `data:write` to `schedule:write`
- **Phase C**: Migrate dedicated schedule-slot/teaching-task routes from `data:write` to new permissions
- **Phase D**: Migrate admin generic route with model-specific permission matrix

Recommended next stage: K15-FIX-B (frontend gating migration) or K15-FIX-C (dedicated route migration).
