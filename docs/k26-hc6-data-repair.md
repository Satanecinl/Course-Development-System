# K26-K4A: HC6 Data Repair

## 1. Executive Summary

K26-K4A repairs the last remaining HC6 data violation in the current DB.

**Problem**: `slot383` (林业法规与执法实务, teacher 徐厚朴, classGroup 2024级林业技术1班)
was placed in room 23 (林校304), which is a Linxiao room. Since the task's classGroup
contains no automotive keyword, this triggers `HC6_NON_AUTOMOTIVE_FORBID_LINXIAO`.

**Repair**: Moved `slot383.roomId` from 23 → 31 (10-124, non-Linxiao, capacity 30 ≥ 27 students).

**Post-repair state**: `HC6=0`, `existingDbHC6=0`, no new HC1-HC6 conflicts introduced.

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` |
| Local HEAD before | `720893a` (K26-K4C) |
| Local HEAD after | `<K26-K4A commit>` |
| Push | yes |
| Force push | **no** |

## 3. Slot383 Pre-Repair State

| Field | Value |
|-------|-------|
| slotId | 383 |
| teachingTaskId | 276 |
| courseName | 林业法规与执法实务 |
| teacher | 徐厚朴 |
| classGroups | 2024级林业技术1班 (id=31) |
| studentCount | 27 |
| dayOfWeek | 1 |
| slotIndex | 2 |
| roomId | 23 |
| roomName | 林校304 |
| isLinxiaoRoom | true |
| specialtyClassification | `NON_AUTOMOTIVE_ONLY` |
| HC6 penalty | -1000 |

## 4. Canonical Room Source

The canonical room source is `ScheduleSlot.roomId` (the column directly on the slot record).
The scheduler reads this via `loadSchedulingContext` / `data-loader.ts`, which includes the room
via `Prisma.scheduleSlot.findMany({ include: { room: true } })`.

## 5. Candidate Analysis

| Metric | Value |
|--------|-------|
| Total candidates | 53 |
| Accepted (non-Linxiao, unoccupied, capacity ≥ 27) | 17 |
| Rejected (Linxiao / occupied / too small) | 36 |

### Top 5 accepted candidates

| Room | Name | Capacity | Type |
|------|------|----------|------|
| 31 | 10-124 | 30 | NORMAL |
| 37 | 11-504 | 33 | NORMAL |
| 16 | 11-209 | 37 | NORMAL |
| 47 | 11-328 或 11-105 | 38 | NORMAL |
| 48 | 11-204 或 12-111 | 38 | NORMAL |

**Selected**: Room 31 (10-124), capacity 30 — smallest non-Linxiao room with sufficient capacity.

### Candidate rejection reasons

- Linxiao rooms (IDs 21-29, 49): rejected — would trigger HC6
- Rooms at (day=1, slotIdx=2) occupied by other slots: rejected — would trigger HC1 (room conflict)
- Rooms with capacity < 27: rejected — would trigger HC4 (capacity overflow)

## 6. Mutation

```
UPDATE ScheduleSlot SET roomId=31 WHERE id=383
```

No other tables modified. No other slots changed.

## 7. Data Safety

| Item | Status |
|------|--------|
| Backup path | `prisma/dev.db.backup-before-k26-k4a-slot383-repair-2026-06-09T08-04-38-179Z` |
| Backup committed | no |
| Slot count unchanged | true (440 → 440) |
| Only slot383 changed | true |
| Post-repair HC6 | 0 |
| Post-repair HC1-HC5 | 0 |
| Post-repair existingDbHC6 | 0 |

## 8. Post-Repair HC Breakdown

| Constraint | Before repair | After repair |
|-----------|--------------|--------------|
| HC1 | 0 | 0 |
| HC2 | 0 | 0 |
| HC3 | 0 | 0 |
| HC4 | 0 | 0 |
| HC5 | 0 | 0 |
| HC6 | 1 | 0 |
| hardScore | -1000 | 0 |

## 9. Verification Results

| Command | Result |
|---------|--------|
| Repair dry-run | PASS (plan confirmed) |
| Repair apply | PASS (slot383 roomId 23→31, HC6=0) |
| K26-K4A verify | **32/32 PASS** |
| K26-K4C verify | **PASS** |
| K26-K4 verify | **PASS** |
| K26-K3 verify | **PASS** |
| K26-K2 debug | **PASS** |
| K26-J closeout | **PASS** |
| J3 candidate | **PASS** |
| J2 snapshot | **PASS** |
| K22-C | **73/0/0/0** |
| Prisma validate | **PASS** |
| migrate status | **up to date** |
| build | **PASS** |
| lint | **184/146** (baseline) |
| auth foundation | **53/1** (pre-existing) |

## 10. Known Boundaries

- **prisma/dev.db modified locally** — the repair changed a row in the SQLite DB. This file is
  not staged, not committed, and must not be pushed.
- **No solver/score changes** — K26-K4A is a data-only repair.
- **K22 expected unchanged** — no score semantics changed.
- **HC6 penalty unchanged** — still -1000.
- **No exception mechanism** — course-level exception for forestry courses not implemented.

## 11. Final Decision

```
k26K4AStatus=PASSED
recommendedNextStage=K26-K-CONTROLLED-APPLY-ROLLBACK-TRIAL
existingDbHC6=0
solverIntroducedHC6=0
```

K26-K4A **passes**: the pre-existing HC6 violation is repaired by moving slot383 from
林校304 to 10-124. The next step is to run the K26-K controlled apply/rollback trial,
which should now pass (hardScore=0).
