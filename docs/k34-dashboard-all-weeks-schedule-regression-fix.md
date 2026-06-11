# K34-A3B: Dashboard All-Weeks Schedule Regression Fix

## Stage Overview

**Stage**: K34-A3B-DASHBOARD-ALL-WEEKS-SCHEDULE-REGRESSION-FIX
**Type**: Bug fix (stale dev server + enhancement)
**Scope**: Verify "全部显示" mode works correctly; add secondary room IDs to schedule API response; fix dashboard room filter for secondary rooms.

## Problem

After K34-A3, the user tested `/dashboard` in the browser and found:
- "全部显示" mode showed 0 courses
- "第 1 周" mode showed courses normally

## Root Cause

The dev server (PID 4556) was running **stale code from before K34-A1**. The dev log contained 9 occurrences of the "Objects are not valid as a React child" error — the exact bug K34-A1 fixed. The React crash prevented the schedule grid from rendering, making it appear that 0 courses were returned.

**This was NOT a code regression.** The current code is correct:
- ALL-week mode: 440 items returned from the Prisma query ✓
- Week=1 mode: 412 items returned ✓
- Frontend parsing: correctly extracts `items` from `{ items, semesterId, semesterSource }` ✓
- `additionalRooms` include: works correctly, returns 13 slots with secondary rooms ✓

**Fix**: User needs to restart the dev server (`taskkill /PID 4556 /F` then `npm run dev`).

## Enhancements Made

While investigating, two improvements were made:

### 1. `additionalRoomIds` in schedule API response

Added `additionalRoomIds: number[]` to the schedule API response. This exposes secondary room IDs separately from the display string, enabling the dashboard room filter to match on secondary rooms.

### 2. Dashboard room filter supports secondary rooms

Updated `applyViewFilter` in `dashboard-content.tsx` to check `item.additionalRoomIds` when filtering by room. Previously only `item.roomId` (primary) was checked. Now a slot appears in the room filter results if EITHER the primary OR any secondary room matches.

## Files Changed

| File | Change |
|---|---|
| `src/app/api/schedule/route.ts` | Added `additionalRoomIds` to viewData response |
| `src/types/schedule.ts` | Added `additionalRoomIds?: number[]` to `ScheduleViewData` |
| `src/app/dashboard/dashboard-content.tsx` | Room filter now checks secondary rooms via `additionalRoomIds` |
| `scripts/verify-dashboard-all-weeks-schedule-k34-a3b.ts` | **new** — 18 checks |

## Validation Results

```
K34-A3B verify:        18/18 passed
K34-A3 verify:         42/42 passed
K34-A2 verify:         45/45 passed
K34-A verify:          64/64 passed
prisma validate:       PASS
migrate status:        up to date
build:                 PASS
lint:                  342/189/153 — same as baseline (no new issues)
auth foundation:       60/62 — 2 pre-existing failures
```

## Manual Browser Validation Required

**Yes** — the fix requires restarting the dev server:
1. `taskkill /PID 4556 /F`
2. `npm run dev`
3. Open `/dashboard`
4. Select "全部显示" — should show 440+ courses
5. Select "第 1 周" — should show 412 courses
6. Filter by room with a secondary room — should match
7. Multi-room slots should show "11-322 或 10-104"

## Closure Decision

**Can K34-A3B close**: YES
**Can K34-A3 close after manual validation**: YES (restart dev server first)
**Recommended next stage**: K34-B (full import management) or real-use validation
