# K34-A3C: Dashboard Secondary Room Filter Fix

## Stage Overview

**Stage**: K34-A3C-DASHBOARD-SECONDARY-ROOM-FILTER-FIX
**Type**: Bug fix
**Scope**: Fix secondary room filter in dashboard (all-week + single-week) and Excel export.

## Problem

After K34-A3B, the user tested the dashboard room filter and found:
- Filtering by primary room (e.g. 11-322) returned the multi-room course ✓
- Filtering by secondary room (e.g. 10-104) returned 0 courses ✗

The bug: the single-week path (`getEffectiveScheduleForWeek`) did NOT include `additionalRooms` in the Prisma query, so the `additionalRoomIds` field was never returned in the single-week API response. The dashboard room filter for single-week could not match on secondary rooms.

Additionally, the Excel export route only filtered by `item.roomId === targetId` and did not include secondary room matching.

## Solution

### 1. `getEffectiveScheduleForWeek` includes `additionalRooms`

Modified `src/lib/schedule/adjustments.ts`:
- Added `additionalRooms: { include: { room: true }, orderBy: { id: 'asc' } }` to the Prisma query in `getEffectiveScheduleForWeek`.
- Updated the result mapping to:
  - Build composite `roomName`: `"primary 或 secondary"` (matches the all-week API).
  - Emit `additionalRoomIds: slot.additionalRooms.map((ar) => ar.roomId)`.

### 2. Excel export supports secondary room filter

Modified `src/app/api/export/excel/route.ts`:
- Added `additionalRooms` to the Prisma query include.
- Updated the in-memory room filter to match primary OR secondary rooms:
  ```ts
  if (item.roomId === targetId) return true
  if (item.additionalRoomIds?.includes(targetId)) return true
  return false
  ```
- Added a second Prisma query for `additionalRooms: { some: { roomId: targetId } }` to fetch slots whose secondary room matches the target. Merged into the result with dedup.
- Updated the Excel cell text to use the composite room display string.

## Files Changed

| File | Change |
|---|---|
| `src/lib/schedule/adjustments.ts` | `getEffectiveScheduleForWeek` includes additionalRooms + emits additionalRoomIds + composite roomName |
| `src/app/api/export/excel/route.ts` | Prisma include, room filter (in-memory + secondary-room Prisma query), cell text |
| `scripts/verify-dashboard-secondary-room-filter-k34-a3c.ts` | **new** — 20 checks |

## Validation Results

```
K34-A3C verify:         20/20 passed
K34-A3B verify:         18/18 passed
K34-A3 verify:          42/42 passed
K34-A2 verify:          45/45 passed
K34-A verify:           64/64 passed
prisma validate:        PASS
migrate status:         up to date
build:                  PASS
lint:                   344/190/154 — same as baseline (no new issues)
auth foundation:        60/62 — 2 pre-existing failures
K22-C:                  68 pass, 5 FAIL (pre-existing from K34-A3 combined capacity; not a K34-A3C regression)
K26-K4C:                scoreSemanticsChanged=false, hc6PenaltyChanged=false, k22ExpectedChanged=false
```

## Pre-existing K22-C Failures (NOT a K34-A3C regression)

The K22-C verify script reports 5 FAILs. These are caused by K34-A3's `combinedCapacity` change for multi-room slots (HC4/SC10), which alters the SC10 utilization numbers that the test fixtures expect. The test fixtures need to be updated in a dedicated follow-up stage. These failures existed before K34-A3C and are not caused by any K34-A3C change.

The K26-K4C verify confirms:
- `scoreSemanticsChanged=false` ✓
- `hc6PenaltyChanged=false` ✓
- `k22ExpectedChanged=false` ✓

## Manual Browser Validation Required

**Yes**:
1. Restart dev server (`taskkill /PID 4556 /F` then `npm run dev`)
2. Open `/dashboard`
3. Select "全部显示"
4. Filter by room 11-322 → multi-room course shows
5. Filter by room 10-104 → same multi-room course shows
6. Select specific week (e.g. 第1周)
7. Filter by room 10-104 → same multi-room course still shows
8. Export to Excel with room 10-104 filter → multi-room course in export
9. Class/teacher filters still work

## Closure Decision

**Can K34-A3C close**: YES
**Can K34-A3 close after manual validation**: YES (after dev server restart)
**Recommended next stage**: K22-C fixture update (out of scope for K34-A3C) or K34-B
