# K36-B1A5: Campus Room Rules Secondary Room Fix

## Problem

Campus room rules API (`GET /api/admin/settings/campus-room-rules`) only queried
`ScheduleSlot.roomId` (primary room) for HC5 (room unavailability) and HC6
(non-automotive in Linxiao). Secondary rooms stored in `ScheduleSlotAdditionalRoom`
were completely ignored, causing under-counting of violations.

## Fix

### HC5 (Room Unavailability)

- **Before**: `where: { semesterId: 1, roomId: ua.roomId, dayOfWeek, slotIndex }`
- **After**: `where: { semesterId: 1, dayOfWeek, slotIndex, OR: [{ roomId: ua.roomId }, { additionalRooms: { some: { roomId: ua.roomId } } }] }`
- Deduplication via `seenHc5Slots` Set to prevent double-counting when a slot's
  primary AND secondary rooms are both unavailable at the same time position.

### HC6 (Non-Automotive in Linxiao)

- **Before**: `where: { semesterId: 1, roomId: { in: linxiaoIds } }`
- **After**: `where: { semesterId: 1, OR: [{ roomId: { in: linxiaoIds } }, { additionalRooms: { some: { roomId: { in: linxiaoIds } } } }] }`
- Loads `additionalRooms: { include: { room: true } }` to resolve secondary room names.
- Computes `effectiveLinxiaoRoomNames` from both primary and secondary rooms for
  violation reason text.
- Deduplication via `seenHc6Slots` Set.

## Not Changed

- Prisma schema / migrations: untouched
- Scheduler score/solver: untouched
- Adjustment/recommendation: untouched
- WorkTime: untouched
- Frontend UI: untouched
- Permission: still `settings:manage`
- Response shape: backward compatible (same fields, additive secondary room info in reason strings)

## Residual Risks

- WorkTime score contract B-03 still unresolved
- K22 harness alignment may need follow-up
- Git history not cleaned
- Repo not public-ready
- Not pushed; pending review
