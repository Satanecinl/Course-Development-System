# K15-FIX-A-AUTH-SEED-SYNC-VALIDATION

## Stage Name

K15-FIX-A-AUTH-SEED-SYNC-VALIDATION

## Date

2026-06-02

## Background

K15-FIX-A-MINIMAL-PERMISSION-SPLIT (commit `6b9b423`) added `schedule:write` and `teaching-task:write` to `ALL_PERMISSIONS` in code, but did not run the auth seed to sync the local database. This caused `test:auth-foundation` to fail with 3 new auth/RBAC failures:

1. `admin 拥有全部 12 个权限 (实际 10)` — DB had 10 permissions, code expected 12
2. `admin 拥有 schedule:write` — permission not in DB
3. `admin 拥有 teaching-task:write` — permission not in DB

A 4th failure (`ScheduleAdjustment ACTIVE = 0 (实际 10)`) is pre-existing and unrelated.

This stage synchronizes the local DB auth state by running the idempotent `seed-auth.ts` script.

## Why K15 Fix-A Was Not Closed

K15 Fix-A added permission definitions in code but the local DB was out of sync. The test:auth-foundation failures proved that the new permissions did not exist in the DB and were not granted to ADMIN. This stage closes that gap.

## Database Backup

- Backup path: `prisma/dev.db.backup-before-k15-auth-seed-sync-20260602150200`
- Size: 3.4 MB
- Created before running seed

## seed-auth Idempotency Review

Reviewed `scripts/seed-auth.ts` (lines 1-252):

- Uses `prisma.permission.upsert` for all Permission records — idempotent
- Uses `prisma.role.upsert` for all Role records — idempotent
- Uses `prisma.rolePermission.upsert` for all RolePermission bindings — idempotent
- Uses `prisma.user.upsert` for User accounts — idempotent
- Uses `prisma.userRole.upsert` for UserRole bindings — idempotent
- Does NOT use `deleteMany`, `createMany`, or any destructive operations
- Does NOT write to any business tables (ScheduleSlot, TeachingTask, ClassGroup, Room, Course, Teacher, ImportBatch, ScheduleAdjustment)
- Only writes to auth tables: Permission, Role, RolePermission, UserRole, User
- ADMIN gets all permissions via `for (const key of ALL_PERMISSIONS)` loop
- USER gets only `data:read`
- DATA_EXPORTER gets only `data:read` + `data:export`

**Conclusion:** Safe to run. Fully idempotent. No business data impact.

## Pre-Seed State

```
npx.cmd tsx scripts/validate-rbac-auth-seed-sync.ts
Result: 36 passed, 8 failed

Failures:
- DB Permission count = 12 (actual 10)
- DB contains schedule:write: FAIL
- DB contains teaching-task:write: FAIL
- ADMIN has 12 permissions (actual 10): FAIL
- ADMIN has schedule:write: FAIL
- ADMIN has teaching-task:write: FAIL
- ADMIN has schedule:write (per-permission): FAIL
- ADMIN has teaching-task:write (per-permission): FAIL

Passing:
- Code ALL_PERMISSIONS = 12: PASS
- USER correct (1 permission, data:read only): PASS
- DATA_EXPORTER correct (2 permissions): PASS
```

## Auth Seed Execution

```bash
npx.cmd tsx scripts/seed-auth.ts
```

Output summary:
```
📋 Creating 12 permissions... (all 12 ✅)
👥 Creating roles... (ADMIN, USER, DATA_EXPORTER ✅)
🔗 Binding permissions to roles... (ADMIN → all 12, USER → data:read, DATA_EXPORTER → data:read + data:export ✅)
👤 Creating initial accounts... (admin, user ✅)
✨ Auth seed complete!
   Permissions: 12
   Roles: 3 (ADMIN, USER, DATA_EXPORTER)
   Accounts: admin, user
```

Did NOT run: seed_db.ts, parse_schedule.py, confirm-import-once.ts, or any other script.
Did NOT run: prisma db push / migrate / reset.

## Post-Seed State

```
npx.cmd tsx scripts/validate-rbac-auth-seed-sync.ts
Result: 44 passed, 0 failed ✅

DB Permission count = 12: PASS
DB contains schedule:write: PASS
DB contains teaching-task:write: PASS
ADMIN has 12 permissions: PASS
ADMIN has schedule:write: PASS
ADMIN has teaching-task:write: PASS
USER has 1 permission (data:read): PASS
USER does NOT have schedule:write: PASS
USER does NOT have teaching-task:write: PASS
DATA_EXPORTER has 2 permissions: PASS
DATA_EXPORTER does NOT have schedule:write: PASS
DATA_EXPORTER does NOT have teaching-task:write: PASS
```

## Permission DB Count Verification

- DB Permission records: 12
- Code ALL_PERMISSIONS: 12
- Match: YES

## ADMIN Permission Verification

- ADMIN has 12 permissions: YES
- ADMIN has schedule:write: YES
- ADMIN has teaching-task:write: YES
- ADMIN has data:write: YES (unchanged)
- ADMIN has schedule:adjust: YES (unchanged)

## USER / DATA_EXPORTER Verification

- USER has 1 permission (data:read): YES
- USER does NOT have schedule:write: YES
- USER does NOT have teaching-task:write: YES
- DATA_EXPORTER has 2 permissions (data:read, data:export): YES
- DATA_EXPORTER does NOT have schedule:write: YES
- DATA_EXPORTER does NOT have teaching-task:write: YES

## test:auth-foundation Result

- 53 passed, 1 failed
- Admin permission count (12): PASS
- Admin schedule:write: PASS
- Admin teaching-task:write: PASS
- Only remaining failure: `ScheduleAdjustment ACTIVE = 0 (实际 10)` — **pre-existing non-blocking**
- No new auth/RBAC failures

## Verification Commands and Results

```bash
# Auth seed sync validation (post-seed)
npx.cmd tsx scripts/validate-rbac-auth-seed-sync.ts
# Result: ✅ 44 passed, 0 failed

# Fix-A verification
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-a.ts
# Result: ✅ 30 passed, 0 failed

# K15 audit
npx.cmd tsx scripts/audit-rbac-permission-granularity-migration.ts
# Result: Phase A done, HIGH 0 / MEDIUM 4 / LOW 4 / NONE 3

# Auth foundation test
npm.cmd run test:auth-foundation
# Result: 53 passed, 1 failed (pre-existing ScheduleAdjustment)

# Build
npm.cmd run build
# Result: ✅ Compiled successfully, 44 pages

# Lint
npx.cmd eslint scripts/validate-rbac-auth-seed-sync.ts
# Result: ✅ No errors or warnings
```

## Routes NOT Migrated

All API routes continue to use their existing permissions. No route, frontend, or admin generic changes were made in this stage.

## Database Not Committed

`prisma/dev.db` was modified by the seed operation but is NOT staged for commit. The backup file `prisma/dev.db.backup-before-k15-auth-seed-sync-*` is also NOT committed.

## Next Stage Recommendation

- K15 Fix-A can now be closed
- Recommended next: K15-FIX-B (frontend gating migration) or K15-FIX-C (dedicated route migration)
