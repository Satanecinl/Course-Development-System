# K37-B Campus Room Rules Schema & Editing

## Stage

```text
K37-B-CAMPUS-ROOM-RULES-SCHEMA-AND-EDITING
```

## 1. Schema Change

Added `isLinxiao Boolean @default(false)` to Room model in `prisma/schema.prisma`.

Migration: `20260619000000_add_room_is_linxiao_k37_b`
SQL: `ALTER TABLE "Room" ADD COLUMN "isLinxiao" BOOLEAN NOT NULL DEFAULT false;`

## 2. DB Backup

Path: `prisma/dev.db.backup-before-k37-b-campus-room-rules-20260619-143138`
Size: 62MB
Gitignored: ✅

Pre-migration room count: 42
Pre-migration name.includes('林校') count: 5

## 3. Backfill

Script: `scripts/backfill-room-is-linxiao-k37-b.ts`
- Supports `--dry-run` (default) and `--apply`
- Rule: `Room.name.includes('林校')` → `isLinxiao = true`
- Idempotent

Dry-run result: 5 rooms to update
Apply result: 5 rooms updated
Post-check: isLinxiao=true count = 5 (林校301, 303, 304, 305, 306)

## 4. API Changes

### GET `/api/admin/settings/campus-room-rules`

| Change | Before (K37-A) | After (K37-B) |
|---|---|---|
| Linxiao source of truth | `name.includes('林校')` | `Room.isLinxiao` (persistent DB field) |
| `editability.linxiaoEditable` | `false` | `true` |
| `editability.detectionMethod` | `room.name contains "林校"` | `room.isLinxiao (persistent DB field)` |
| `rooms[].linxiaoSource` | `'room.name'` | `'room.isLinxiao'` |
| `rooms[].nameSuggestsLinxiao` | absent | `boolean` (advisory) |
| `rooms[].linxiaoMismatch` | absent | `boolean` (name vs field disagreement) |
| `summary.linxiaoMismatchCount` | absent | `number` |

### PATCH `/api/admin/settings/campus-room-rules/rooms/[roomId]`

New endpoint. Request: `{ "isLinxiao": boolean }`.

| Aspect | Implementation |
|---|---|
| Permission | `requirePermission('settings:manage')` |
| Validation | roomId positive integer, body.isLinxiao boolean |
| DB writes | Only `Room.isLinxiao` |
| Does NOT modify | ScheduleSlot, TeachingTask, ScheduleAdjustment |
| Returns | updated room, refreshed summary, HC6 warning count |
| HC6 warning | If marking as linxiao causes HC6 violations, returns warning but does NOT block |

## 5. UI Changes

| Aspect | K37-A | K37-B |
|---|---|---|
| Header badge | "诊断增强版（不可编辑）" | **"基础可编辑版"** |
| Room table action column | No actions | **标记为林校 / 取消林校** buttons |
| Toggle behavior | N/A | Confirm dialog → PATCH → refresh data |
| Toast on success/error | N/A | ✅ |
| Mismatch indicator | N/A | ⚠ on rows where name vs isLinxiao disagrees |
| Notice | "不支持编辑" (amber) | **"支持林校教室标记维护"** (green) |
| HC6 lock | ✅ preserved | ✅ preserved |
| Search/filter | ✅ preserved | ✅ preserved |

## 6. Permissions

- GET: `settings:manage` (unchanged)
- PATCH: `settings:manage` (new)
- No new RBAC keys
- USER cannot PATCH

## 7. HC5/HC6 / Multi-room Coverage

| Feature | Status |
|---|---|
| HC5 room unavailability | ✅ primary + secondary (unchanged) |
| HC6 non-automotive in Linxiao | ✅ primary + secondary (now uses isLinxiao) |
| Secondary room source | ✅ preserved |
| HC6 hard rule | ✅ Not closable (unchanged) |
| Score/solver semantics | ✅ Not modified |
| K22 expected | ✅ 73/0/0/0 (restored, no drift) |

## 8. Verification Results

| Item | Result |
|---|---|
| K37-B verify | ✅ 25/25 PASS |
| K37-A verify | ✅ 25/25 PASS (updated for K37-B compatibility) |
| K36-B1A5 verify | ✅ 19/19 PASS |
| K22-C regression | ✅ 73/0/0/0 |
| PII scan | ✅ 0 BLOCKING |
| Prisma validate | ✅ valid |
| ESLint | ✅ 0 errors/0 warnings |
| Build | ✅ PASS |

## 9. Rollback Method

1. Code: `git revert` the K37-B commit
2. DB: restore from `prisma/dev.db.backup-before-k37-b-campus-room-rules-20260619-143138`
3. Or reverse backfill: `UPDATE Room SET isLinxiao = 0` (SQLite)

## 10. What NOT Written to DB

- No ScheduleSlot changes
- No TeachingTask changes
- No ScheduleAdjustment changes
- Only `Room.isLinxiao` backfill (5 rows)
