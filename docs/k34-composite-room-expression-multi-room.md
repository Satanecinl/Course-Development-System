# K34-A3: Composite Room Expression Multi-room Support

## Stage Overview

**Stage**: K34-A3-IMPORT-COMPOSITE-ROOM-EXPRESSION-MULTI-ROOM-SUPPORT
**Type**: Feature + bug fix
**Scope**: Parse "A 或 B" composite room expressions in import pipeline; add `ScheduleSlotAdditionalRoom` schema; fix existing data; update schedule display, data-loader, and score for secondary rooms.

## Problem

The DOCX parser produces room strings like `"11-322 或 10-104"` which the importer stored verbatim as a single `Room.name`. This created 10 composite Room rows in the dev DB, each representing a single physical room that is actually two rooms (typically a classroom + a lab). The composite room was treated as a single entity by the scheduler, capacity page, and conflict checks — all of which produced incorrect results.

## Solution

### 1. Composite Room Parser

`src/lib/rooms/composite-room-expression.ts` provides `parseCompositeRoomExpression(raw)`:
- Splits on "或者" (longer match first) then "或".
- Validates both sides are plausible room names (contain at least one digit, letter, or Chinese character).
- Returns `{ rooms, isComposite, delimiter }` — if not composite, returns the original string as a single-element list.
- Handles: `"11-322 或 10-104"`, `"11-322或10-104"`, `"A 或 B 或 C"`, null/undefined/empty.

### 2. Schema Change

Added `ScheduleSlotAdditionalRoom` model via additive migration:
```
model ScheduleSlotAdditionalRoom {
  id             Int          @id @default(autoincrement())
  scheduleSlotId Int
  roomId         Int
  role           String       @default("SECONDARY")
  createdAt      DateTime     @default(now())

  scheduleSlot   ScheduleSlot @relation(fields: [scheduleSlotId], references: [id], onDelete: Cascade)
  room           Room         @relation(fields: [roomId], references: [id], onDelete: Restrict)

  @@unique([scheduleSlotId, roomId])
  @@index([roomId])
}
```

Added reverse relations:
- `ScheduleSlot.additionalRooms: ScheduleSlotAdditionalRoom[]`
- `Room.slotAdditionalRooms: ScheduleSlotAdditionalRoom[]`

The primary room stays in `ScheduleSlot.roomId`. Secondary rooms are stored in the new table. Fully backward-compatible.

### 3. Importer Forward Fix

Modified `src/lib/import/importer.ts`:
- **Room creation phase**: Before building the normalized-key map, each raw room name is parsed for "或". If composite, each component name is added to the set of names to create/match. The composite raw name maps to the primary component in `roomMap`. A `compositeComponentsMap` tracks all component room ids for each composite raw name.
- **Slot creation phase**: After creating a ScheduleSlot, if the raw room was composite, `ScheduleSlotAdditionalRoom` records are created for the secondary components.
- **Dry-run phase**: `existingRoomNames` check now expands composite expressions — a composite room is "existing" only if ALL its component rooms exist in the DB.

### 4. Schedule Display

Modified `src/app/api/schedule/route.ts`:
- Includes `additionalRooms` in the ScheduleSlot query.
- Builds composite `roomName` by concatenating primary + secondary names with " 或 " separator.
- The existing `schedule-card.tsx` renders `item.roomName` directly — no UI change needed.

### 5. Data-Loader & Score

Modified `src/lib/scheduler/data-loader.ts` and `src/lib/scheduler/apply.ts`:
- Both include `additionalRooms` in the ScheduleSlot query.
- Both index slots by primary AND secondary rooms in `slotsByRoom`, so HC3 room-conflict detection works on both.

Modified `src/lib/scheduler/score.ts`:
- Added `getAllRoomIds(slot)` helper: returns primary + secondary room ids.
- HC5 (unavailable rooms): now checks all rooms. If any room is unavailable at that time slot, the penalty applies.
- HC6/SC6 (Linxiao constraint): now checks all rooms. If any room is a Linxiao room and the task is non-automotive, the penalty applies.

Modified `src/lib/scheduler/types.ts`:
- `SlotWithRelations` type now includes `additionalRooms`.

### 6. Data Repair

`scripts/repair-composite-room-expressions-k34-a3.ts`:
- `--dry-run` (default): detects all rooms with "或" in name, parses components, checks existing rooms, plans migrations.
- `--apply`: creates timestamped backup, creates/matches component rooms, migrates `ScheduleSlot.roomId` to primary component, creates `ScheduleSlotAdditionalRoom` for secondary components, deletes composite Room rows with zero remaining references.

**Apply results**: 10 composite rooms repaired, 4 new component rooms created, 13 slots migrated, 13 additional room records created, 0 retained.

### 7. Verify & Documentation

- `scripts/verify-composite-room-expression-k34-a3.ts` — 40 checks including tsx-eval behavioral tests for the parser.
- Updated `scripts/verify-room-name-normalization-k34-a2.ts` — stage-aware for K34-A3 schema/score changes.
- Updated `scripts/verify-import-management-basic-k34-a.ts` — stage-aware for K34-A3 schema change.
- `docs/k34-composite-room-expression-multi-room.md` + `.json`.

## Files Changed

| File | Change |
|---|---|
| `src/lib/rooms/composite-room-expression.ts` | **new** — parser |
| `prisma/schema.prisma` | added `ScheduleSlotAdditionalRoom` model + relations |
| `prisma/migrations/20260611000000_add_schedule_slot_additional_rooms/migration.sql` | **new** — additive migration |
| `src/lib/import/importer.ts` | room creation + slot creation + dry-run changes |
| `src/app/api/schedule/route.ts` | includes additionalRooms, builds composite roomName |
| `src/lib/scheduler/data-loader.ts` | includes additionalRooms, indexes by secondary rooms |
| `src/lib/scheduler/apply.ts` | same as data-loader |
| `src/lib/scheduler/score.ts` | getAllRoomIds helper, HC5/HC6 check all rooms |
| `src/lib/scheduler/types.ts` | SlotWithRelations includes additionalRooms |
| `scripts/repair-composite-room-expressions-k34-a3.ts` | **new** — dry-run / apply repair |
| `scripts/verify-composite-room-expression-k34-a3.ts` | **new** — 40 checks |
| `scripts/verify-room-name-normalization-k34-a2.ts` | stage-aware for K34-A3 |
| `scripts/verify-import-management-basic-k34-a.ts` | stage-aware for K34-A3 |
| `docs/k34-composite-room-expression-multi-room.md` | **new** — this file |
| `docs/k34-composite-room-expression-multi-room.json` | **new** |

## Validation Results

```
K34-A3 verify:         40/40 passed
K34-A2 verify:         45/45 passed
K34-A1 verify:         55/55 passed
K34-A verify:          65/65 passed
repair --dry-run:      PASS
repair --apply:        PASS (10 composites → 4 new rooms, 13 slots migrated)
prisma validate:       PASS
migrate status:        up to date (10 migrations)
build:                 PASS
lint:                  340/188/152 — same baseline; 0 new from K34-A3
auth foundation:       60/62 — 2 pre-existing failures
```

## Manual Browser Validation Required

**Yes**:
1. `/admin/rooms/capacity` — confirm no "或" composite rooms.
2. `/dashboard` — find a slot with secondary rooms, confirm card shows "11-322 或 10-104".
3. `/admin/settings` → 校区/教室规则 — confirm HC5=0, HC6=0.

## Closure Decision

**Can K34-A3 close**: YES
**Feature status**: Composite room parser, schema, importer, display, data-loader, score, repair all complete and verified.
**Recommended next stage**: K34-B (full import management) or continue with real-use validation.
