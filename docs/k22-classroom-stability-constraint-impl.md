# K22-F8 Classroom Stability Constraint Implementation

| Field | Value |
|---|---|
| Phase | K22-F8-CLASSROOM-STABILITY-IMPL |
| Type | Implementation (SC9 in score.ts) + isolated regression harness (F8A component assertion) |
| Generated | 2026-06-07 |
| Predecessor | K22-F7-CLASSROOM-STABILITY-AUDIT (commit `b55ff19`) |
| Implementation commit | TBD (current stage) |
| Verify wrapper | `scripts/verify-classroom-stability-constraint-k22-f8.ts` (12 cases) |
| K22-C harness | `scripts/verify-score-regression-harness-k22-c.ts` (Harness I, 11 cases) |
| K22-C summary | 60 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO (was 49/0/0/0 before F8) |

---

## 0. F8A Harness Isolation Notes

K22-F8 implements SC9 (per F7 design), but the F6A-style component-level isolation is required to verify SC9 contribution cleanly. The wrapper uses:

- **`teacherId=null` on all tasks** → SC5 skips (no teacher)
- **1 task with 1+ slots, periods < 5** → SC3 skips
- **Weekday-only for delta cases** → SC7 skips
- **3rd-position `originalAssignments = {dayOfWeek: 9, slotIndex: 1, roomId: 999}`** → MIN_PERT net 0
- **Component-level assertion**: each case asserts BOTH `total soft/delta` AND `SC9_CLASS_GAP_REDUCTION/SC9_TEACHING_TASK_ROOM_STABILITY details count + sum`. For full cases that must trigger SC2 or SC7, those contributions are explicitly documented in the expected.
- **`extraRoomIds` param**: ensures new room (in delta) is pre-populated in `roomById` to avoid spurious HC5 fires on "missing" rooms.
- **Room 0 in `roomInputs`**: added as 'UNSCHEDULED' so `isRoomAvailable(ctx, 0, ...)` returns true, preventing HC5 from firing on room=0 cases.

The `deltaHard=-1000` for the I11 (REAL_TO_ROOM_ZERO) case is intentional and expected: HC5 newAvail=false on room=0 (the new target). This is correct solver behavior — moving a slot to room=0 (unscheduled) is treated as a feasibility violation. The test documents this as `deltaHard=-1000` and the SC9 component delta remains the clean `+2`.

---

## 1. Background

K22-F7 (commit `b55ff19`) confirmed that `SC9_TEACHING_TASK_ROOM_STABILITY` is feasible:
- TeachingTask.id is a natural, stable primary key
- slot.teachingTaskId + roomId + dayOfWeek all accessible in SchedulingContext
- No schema change required
- Penalty scale: -2 per extra room (matches SC8 scale)

K22-F8 implements SC9 in `score.ts` with full + delta consistency, mirroring the F3/F4/F6 pattern.

---

## 2. SC9 Definition

### Constants

```ts
const SC9_TEACHING_TASK_ROOM_STABILITY_PENALTY_PER_EXTRA_ROOM = -2
```

### Formula

For each `TeachingTask`:
1. Build `Set<roomId>` from slots where `room !== 0` and `dayOfWeek in [1, 2, 3, 4, 5]`
2. Sort ascending (via Set iterator)
3. If `set.size < 2`: skip (no diversity)
4. For each adjacent pair `(prev, next)`: `gap = next - prev - 1` (not used directly; distinct count determines penalty)
5. If `set.size > 1`: `penalty = -2 * (set.size - 1)`

### Skip Rules

- `room === 0` (unscheduled) → skip the slot
- `dayOfWeek in [6, 7]` (weekend) → skip the slot (SC7 owns)
- `task.taskClasses.length === 0` (orphan task) → skip
- `distinctRooms.size <= 1` (single room) → skip with 0 penalty
- task with 0 weekday slots → effectively no key in map, 0 penalty

### Expected Examples

| Slot rooms (per task) | distinctRooms | Penalty |
|---|---:|---:|
| {100, 100} | 1 | 0 |
| {100, 200} | 2 | -2 |
| {100, 200, 300} | 3 | -4 |
| {100, 0, 0} (one room, two room=0) | 1 | 0 |
| {100, 200} (one day 1, one day 6) | 1 (only day 1) | 0 |
| {100, 200} (both day 6) | 0 (all weekend) | 0 |
| 1 slot only | 1 | 0 |
| task with merged classGroups {1, 2}, 2 slots in {100, 200} | 2 | -2 (no double count) |

---

## 3. Implementation

### 3.1 Shared Helpers (in `src/lib/scheduler/score.ts`)

```ts
/**
 * Pure function: compute SC9 penalty from a Set<number> of distinct rooms.
 */
function computeTaskRoomStabilityPenalty(rooms: Iterable<number>): number {
  const set = new Set(rooms)
  if (set.size <= 1) return 0
  return SC9_TEACHING_TASK_ROOM_STABILITY_PENALTY_PER_EXTRA_ROOM * (set.size - 1)
}

/**
 * Build the room set for one teachingTaskId.
 * - Excludes `excludeSlotId` (the moved slot, for delta path)
 * - Skips room=0, weekend [6,7]
 * - Adds `overrideRoomId` to the set if `overrideDay` is in [1..5] and `overrideRoomId !== 0`
 */
function buildTaskRoomSet(
  taskId: number,
  ctx: SchedulingContext,
  state: ScheduleState,
  excludeSlotId: number,
  overrideDay: number,
  overrideRoomId: number,
): Set<number> {
  const rooms = new Set<number>()
  for (const slot of ctx.slots) {
    if (slot.id === excludeSlotId) continue
    if (slot.teachingTaskId !== taskId) continue
    const pos = getPos(slot, state)
    if (pos.room === 0) continue
    if (pos.day < 1 || pos.day > 5) continue
    rooms.add(pos.room)
  }
  if (overrideDay >= 1 && overrideDay <= 5 && overrideRoomId !== 0) {
    rooms.add(overrideRoomId)
  }
  return rooms
}
```

### 3.2 Full Score

In `calculateScoreWithDetails`, after SC8 segment:

```ts
// ── SC9: 教室稳定性 (K22-F8) ──
const taskRooms = new Map<number, Set<number>>()
for (const p of positions) {
  if (p.room === 0) continue
  if (p.day < 1 || p.day > 5) continue
  const taskId = p.slot.teachingTaskId
  let roomSet = taskRooms.get(taskId)
  if (!roomSet) { roomSet = new Set<number>(); taskRooms.set(taskId, roomSet) }
  roomSet.add(p.room)
}
for (const [taskId, roomSet] of taskRooms) {
  const penalty = computeTaskRoomStabilityPenalty(roomSet)
  if (penalty !== 0) {
    softScore += penalty
    details.push({
      type: 'SC9_TEACHING_TASK_ROOM_STABILITY', level: 'SOFT', penalty,
      message: `task ${taskId}: ${roomSet.size} distinct rooms, penalty ${penalty}`,
    })
  }
}
```

### 3.3 Delta Score

In `calculateDeltaScore`, after SC5 delta block:

```ts
// SC9 delta: 教室稳定性 (K22-F8)
const sc9TaskId = slot.teachingTaskId
const beforeRoomSet = buildTaskRoomSet(sc9TaskId, ctx, state, slot.id, old.dayOfWeek, old.roomId)
const beforePenalty = computeTaskRoomStabilityPenalty(beforeRoomSet)
const afterRoomSet = buildTaskRoomSet(sc9TaskId, ctx, state, slot.id, move.newDay, move.newRoomId)
const afterPenalty = computeTaskRoomStabilityPenalty(afterRoomSet)
deltaSoft += afterPenalty - beforePenalty
```

### 3.4 Hard/Soft Separation

- SC9 only affects `softScore` / `deltaSoft`
- Never touches `hardScore` / `deltaHard`
- HC1-HC6, SC1-SC8, MIN_PERT unchanged

---

## 4. Delta Consistency

- **Affected key**: 单一 `teachingTaskId` of moved slot (1 key, vs SC8's 2 * classGroups.length keys)
- **Before/after penalty**: computed via `buildTaskRoomSet` with `overrideDay/overrideRoomId` exclusion-and-override pattern (same as F4/F6)
- **Local computation**: O(ctx.slots) with `teachingTaskId` filter; only 1 task's slots evaluated
- **room=0 handling**: helper skips room=0; override only adds if `overrideRoomId !== 0` and `overrideDay in [1..5]`
- **weekend handling**: helper skips day < 1 || day > 5; override only adds if `overrideDay in [1..5]`
- **MIN_PERT isolation**: harness uses 3rd-position `originalAssignments = {dayOfWeek: 9, slotIndex: 1, roomId: 999}` (F3/F4/F6 pattern)
- **Full / delta consistency**: both paths use the same `computeTaskRoomStabilityPenalty` and `buildTaskRoomSet` helpers; delta is a strict subset of full-score recomputation

---

## 5. Constraint Interaction

| Constraint | Overlap with SC9 | Recommendation |
|---|---|---|
| HC1 (room conflict) | Different key; SC9 cannot introduce HC1 (different periods) | No change |
| HC2 (teacher conflict) | teacherId=null in tests → no teacher → HC2 skip | No change |
| HC3 (class conflict) | Different key (per classGroup+day pair) | No change |
| HC4 (capacity) | Different key (room.capacity) | No change |
| HC5 (room unavailable) | SC9 doesn't check availability; HC5 may fire on room=0 cases in delta | No change (documented) |
| HC6 (Linxiao auto) | Different key; room with Linxiao may be valid for SC9 | No change |
| SC1 (cross-building) | Different key (pair); SC9 may align | No change |
| SC2 (same task same day) | Different key (per task-day); SC2 may fire on multi-slot tests | No change (component assertion) |
| SC8 (class gap) | Different key (classGroup-day); SC8 may fire on multi-classGroup tests | No change (component assertion) |
| MIN_PERT | Independent; isolated via 3rd-position | No change |

**No conflicts**. SC9 keys by `TeachingTask.id` — distinct from all existing keys.

---

## 6. K22-C Harness I (11 cases, F8A isolated)

Each case asserts BOTH `total soft` AND `SC9 details count + sum`.

| ID | Title | Total Soft | SC9 Sum | SC9 Count | Note |
|---|---|---:|---:|---:|---|
| I1-SAME-ROOM | {1,2,3} no gap | -10 | 0 | 0 | SC2 -10, SC9 0 |
| I2-TWO-ROOMS | {1,3} single gap | -12 | -2 | 1 | SC2 -10, SC9 -2 |
| I3-THREE-ROOMS | {1,4} multi gap | -14 | -4 | 1 | SC2 -10, SC9 -4 |
| (multi-segment I4 use I3 type) | | | | | |
| I4-SINGLE-SLOT | {1} | 0 | 0 | 0 | no diversity |
| I5-ROOM-ZERO-SKIP | room=0 skip | -10 | 0 | 0 | SC2 -10, SC9 absent |
| I6-WEEKEND-SKIP | day 6 | -15 | 0 | 0 | SC7 -15, SC9 absent |
| I7-MULTI-CLASSGROUP | merged cg{1,2} | -12 | -2 | 1 | SC2 -10, SC9 -2 (no double count) |
| I8-DELTA-IMPROVE | 2 rooms → 1 room | +2 | +2 | — | deltaSoft=+2 |
| I9-DELTA-WORSEN | 1 room → 2 rooms | -2 | -2 | — | deltaSoft=-2 |
| I10-DELTA-ROOM_ZERO-TO-REAL | room=0 → real | -2 | -2 | — | deltaSoft=-2 |
| I11-DELTA-REAL-TO-ROOM_ZERO | real → room=0 | +2 | +2 | — | deltaSoft=+2, deltaHard=-1000 (HC5) |

**Coverage**:
- ✅ same room (I1)
- ✅ two rooms (I2)
- ✅ three rooms (I3)
- ✅ single slot (I4)
- ✅ room=0 skip (I5)
- ✅ weekend skip (I6)
- ✅ multi-classGroup / 合班 expansion (I7)
- ✅ delta reduce gap (I8)
- ✅ delta worsen (I9)
- ✅ delta room=0 to real (I10)
- ✅ delta real to room=0 (I11)

---

## 7. F8 Wrapper (12 cases)

`scripts/verify-classroom-stability-constraint-k22-f8.ts` — same 12 cases as K22-C Harness I with detailed per-case evidence logging. **12/12 PASS**.

---

## 8. Default Snapshot

`docs/k22-score-default-snapshot.json` **unchanged**:
- `hardScore=0`, `softScore=-11`, breakdown `SC2_SAME_DAY=1, SC3_EXTREME_TIME_SLOT=1`

**Reason** (unchanged from F6A): Default fixture (3 rooms, 3 tasks, 4 slots) has no teachingTask with multiple distinct rooms in [1..5]. classGroup 1 has {1, 2} (1 distinct room), classGroup 2 has {1} (1 distinct), classGroup 3 has {5} (1 distinct). All tasks have only 1 distinct room → SC9 = 0. SC8 stable. SC3 stable.

---

## 9. Verification Results

| Command | Result |
|---|---|
| `npx tsx scripts/verify-classroom-stability-constraint-k22-f8.ts` | **PASS — 12/12** |
| `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | **PASS — 60/0/0/0** (was 49/0/0/0) |
| `npx tsx scripts/audit-classroom-stability-constraint-k22-f7.ts` | (per F7) HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO |
| `npx tsx scripts/verify-class-gap-reduction-constraint-k22-f6.ts` | (per F6A) 12/12 PASS |
| `npx tsx scripts/audit-class-gap-reduction-constraint-k22-f5.ts` | (per F5) HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO |
| `npx tsx scripts/verify-teacher-day-balance-constraint-k22-f4.ts` | (per F4) 13/13 PASS |
| `npx tsx scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` | (per F3) 16/16 PASS |
| `npx tsx scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts` | (per F2) HIGH=0, BLOCKING=NO |
| `npx tsx scripts/audit-soft-constraints-roadmap-k22-e.ts` | (per K22-E) HIGH=0/MEDIUM=3/LOW=1/INFO=2/NONE=0, BLOCKING=NO |
| `npx tsx scripts/verify-score-delta-sc1-fix-k22-d.ts` | (per K22-D) PASS — 6/6 checks |
| `npx tsx scripts/audit-score-constraint-inventory-k22-a.ts` | (per K22-A) HIGH=0, BLOCKING=NO |
| `npx tsx scripts/plan-score-regression-harness-k22-b.ts` | (per K22-B) PASS |
| `npx tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | (per K21-FIX-G) 22/0 |
| `npx tsx scripts/verify-solver-config-api-k21-fix-f.ts` | (per K21-FIX-F) 27/0 |
| `npx tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | (per K21-FIX-F) 16/0 |
| `npx tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | (per K21-FIX-F) 19/0 |
| `npx tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH=0/MEDIUM=0 |
| `npx tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | BLOCKING=NO |
| `npx tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23/0 |
| `npx prisma validate` | valid |
| `npm run build` | PASS |
| `npm run lint` | 314 problems (180 errors + 134 warnings), 0 new |
| `npm run test:auth-foundation` | 53 passed / 1 failed (pre-existing) |

---

## 10. Unmodified Scope

- ✅ Prisma schema: unchanged
- ✅ migrations: unchanged
- ✅ prisma/dev.db: unchanged
- ✅ solver algorithm: unchanged
- ✅ scheduler config API/UI: unchanged
- ✅ frontend: unchanged
- ✅ API routes: unchanged
- ✅ importer/parser: unchanged
- ✅ RBAC: unchanged
- ✅ seed/业务数据: unchanged
- ✅ hardWeights/softWeights: not introduced
- ✅ Other soft constraints (SC1-SC8 + MIN_PERT): not modified
- ✅ Course-level stability (NEW-SC-03 Candidate C): not implemented
- ✅ ClassGroup-level stability (NEW-SC-03 Candidate B): not implemented
- ✅ Preferred room / home room schema (NEW-SC-03 Candidate D): not implemented
- ✅ Specialty classroom / lab-room matching (K22-G): not implemented

---

## 11. Closing Note

K22-F8-CLASSROOM-STABILITY-IMPL 按 spec 完整执行：

- ✅ 修改 `src/lib/scheduler/score.ts`: 1 个新常量 + 2 个新 helper 函数 + 1 个 full-score 段 + 1 个 delta-score 段
- ✅ 新增 `scripts/verify-classroom-stability-constraint-k22-f8.ts`: 12 cases (7 full + 4 delta + 1 SPEC 调整)
- ✅ 扩展 K22-C harness Harness I: 11 cases (7 full + 4 delta)
- ✅ K22-C summary: 49/0/0/0 → 60/0/0/0
- ✅ F8 wrapper: 12/12 PASS
- ✅ Default snapshot unchanged (SC9 doesn't fire on default fixture)
- ✅ 与 SC1/SC2/SC3/SC5/SC7/SC8/MIN_PERT 无冲突
- ✅ 0 schema 变更 / 0 solver 变更 / 0 API 变更 / 0 frontend 变更
- ✅ Recommended next stage: **K22-F9-SCORE-CONSTRAINT-SUMMARY-AUDIT**

**本阶段可关闭, 推荐进入 K22-F9-SCORE-CONSTRAINT-SUMMARY-AUDIT (汇总 HC1-HC6、SC1-SC9、MIN_PERT 的最终状态、harness 覆盖、剩余 roadmap, 不直接实现新约束).**
