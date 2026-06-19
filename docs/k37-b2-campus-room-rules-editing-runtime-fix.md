# K37-B2 Campus Room Rules Editing Runtime Fix

## Stage

```text
K37-B2-CAMPUS-ROOM-RULES-EDITING-RUNTIME-FIX
```

## 1. Purpose

Fix K37-B1 browser validation failures:
1. 林校教室统计显示 0（应为 5）
2. "42 间教室 mismatch"（baseline 期望 0）
3. 点击"标记为林校"出现红色 toast "更新教室林校状态失败"

## 2. Root Cause

DB state is **fully correct** (verified by diagnose script):
- 42 rooms, 5 isLinxiao=true (林校301/303/304/305/306)
- ScheduleSlot/TeachingTask/ScheduleAdjustment unchanged
- Prisma Client can read `isLinxiao` field
- mismatch = 0

**Root cause: dev server's Prisma Client singleton was stale** (loaded before the K37-B migration). Hot-reload does NOT regenerate the Prisma client. After dev server restart, the new client correctly reads `isLinxiao`.

## 3. Fixes Applied

### API Defensive Coding
- GET route: **explicit `select`** of `isLinxiao: true` (defensive against stale client fields)
- GET route: **fallback to name inference** if `isLinxiao` is missing/undefined
- PATCH route: explicit `select` on findUnique and update
- PATCH route: **error handler logs server-side but doesn't leak stack to user**

### Prisma Helper Note
Added K37-B2 restart note to `src/lib/prisma.ts` documenting the restart requirement.

### UI Mismatch Logic
Already correctly gates on `count > 0` (K37-B verify #18). With baseline mismatch=0, the warning won't show. After dev server restart, runtime count will be correct.

## 4. DB / Migration / Backfill

| Item | State |
|---|---|
| Migration | `20260619000000_add_room_is_linxiao_k37_b` applied |
| Prisma schema | valid |
| Prisma Client | regenerated (room.isLinxiao type available) |
| Backfill state | 5 linxiao (already applied during K37-B) |
| Re-backfill needed | **No** (DB was already correct) |

## 5. Verification Results

| Item | Result |
|---|---|
| Diagnose script | ✅ Baseline correct (5/42, 0 mismatch) |
| K37-B2 runtime fix verify | ✅ 17/17 PASS |
| K37-B verify | ✅ 25/25 PASS |
| K37-A verify | ✅ 25/25 PASS |
| K36-B1A5 verify | ✅ 19/19 PASS |
| K22-C regression | ✅ 73/0/0/0 |
| PII scan | ✅ 0 BLOCKING |
| Prisma validate | ✅ valid |
| Build | ✅ PASS |
| ESLint | ✅ 0 errors |

## 6. Required Action for User

**User MUST restart the dev server** (`Ctrl+C` then `npm run dev`) for the runtime fix to take effect. After restart:
- 林校 count = 5
- mismatch count = 0
- Toggle PATCH should succeed
