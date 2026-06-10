# K28-A1: My Adjustment Requests FindMany Fix

## 1. Bug

When a normal USER navigated to `/my-adjustment-requests`, the page
showed:

```
加载失败
请求失败：Cannot read properties of undefined (reading 'findMany')
```

## 2. Root Cause

**Stale Prisma Client.** After K28-A added the `ScheduleAdjustmentRequest`
model to `schema.prisma` and created the migration, the running dev
server held the old `query_engine-windows.dll.node` file. Running
`npx prisma generate` failed with:

```
EPERM: operation not permitted, rename '...query_engine-windows.dll.node.tmp...'
  -> '...query_engine-windows.dll.node'
```

Because the dev server had the file locked, the new Prisma Client was
never installed. At runtime, `prisma.scheduleAdjustmentRequest` was
`undefined`, so calling `.findMany()` on it threw the TypeError.

## 3. Fix

1. Kill the running dev server (`taskkill //F //IM node.exe`) to release
   the DLL file lock.
2. Run `npx prisma generate` — now succeeds.
3. Restart the dev server — the new delegate is available.
4. Added defensive error handling to the `mine` and `admin/list` API
   routes: catch TypeError and return a stable error message instead of
   leaking `Cannot read properties of undefined (reading 'findMany')`.

## 4. Files Changed

```
M  src/app/api/schedule-adjustment-requests/mine/route.ts
M  src/app/api/admin/schedule-adjustment-requests/route.ts
A  scripts/verify-user-adjustment-request-mine-fix-k28-a1.ts
A  docs/k28-user-adjustment-request-mine-fix.md
A  docs/k28-user-adjustment-request-mine-fix.json
```

No schema, migration, DB, RBAC, or K22 expected changes.

## 5. Verification

- `npx tsx scripts/verify-user-adjustment-request-mine-fix-k28-a1.ts`
  → **17/17 PASS** (includes runtime Prisma delegate check)
- `npx prisma validate` → PASS
- `npx prisma migrate status` → 9 migrations, up to date
- `npm run build` → PASS
- `npm run lint` → 331 (185/146) — same as K28-A baseline
- `npm run test:auth-foundation` → 61/1 pre-existing
- `npx tsx scripts/verify-user-adjustment-approval-flow-k28-a.ts`
  → 67/67 PASS
- `npx tsx scripts/verify-system-settings-basic-closeout-k26.ts`
  → 106/106 PASS

## 6. Browser Manual Verification

After restarting dev server:

1. Open `http://localhost:3000/login`
2. Log in as `user` (USER role)
3. Click "我的调课申请" in the sidebar
4. Page loads without error
5. Empty state shows "暂无调课申请"
6. Click refresh — no error
7. Return to dashboard, submit a request, return to my-requests —
   PENDING request appears in list

## 7. Lesson Learned

After any schema change that adds a new model:

1. Run `npx prisma generate`
2. If it fails with `EPERM` (Windows DLL lock), kill the dev server
   first, then regenerate
3. Restart the dev server

This is the same issue documented in K26-H2A (stale Prisma Client
singleton). On Windows, the Prisma query engine DLL is held open by
the running Node.js process, preventing replacement.

## 8. Recommended Next Stage

`K28-B-USER-ADJUSTMENT-APPROVAL-FLOW-MANUAL-TRIAL`
