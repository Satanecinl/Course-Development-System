# K22-F11 Capacity Preference Constraint Implementation

| Field | Value |
|---|---|
| Phase | K22-F11-CAPACITY-PREFERENCE-IMPL |
| Type | Implementation (SC10 in score.ts) + isolated regression harness (F11 component assertion) + K22-C Harness J |
| Generated | 2026-06-07 |
| Predecessor | K22-F10-CAPACITY-PREFERENCE-AUDIT (commit `a5224ec`) |
| Implementation commit | TBD (current stage) |
| Verify wrapper | `scripts/verify-capacity-preference-constraint-k22-f11.ts` (13 cases, all isolated) |
| K22-C harness | `scripts/verify-score-regression-harness-k22-c.ts` (Harness J, 13 cases, F11A component-isolation) |
| K22-C summary | **73 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO** (was 60/0/0/0 before F11) |

---

## 0. F11A Harness Isolation Notes

K22-F11 implements SC10 (per F10 design), with F6A/F8-style component-level isolation in both F11
wrapper and K22-C Harness J. The isolation strategy:

- **`teacherId=null` on all tasks** → SC5 skips (no teacher)
- **1 slot per task** for delta cases → SC2 skips (no same-day multi), SC9 skips (1 distinct room)
- **Weekday-only** for delta cases → SC7 skips
- **3rd-position `originalAssignments = {dayOfWeek: 9, slotIndex: 1, roomId: 999}`** → MIN_PERT net 0
- **Component-level assertion**: each case asserts BOTH `total soft / deltaSoft / deltaHard` AND
  `SC10_ROOM_CAPACITY_UTILIZATION details count + sum`
- **`extraRoomIds` param** (delta cases only): ensures new room is pre-populated in `roomById` so
  the `calculateDeltaScore` "after" branch can read its capacity. Without this, the new room
  would not exist in `roomById` and the SC10 after-penalty would silently be 0.
- **Per-room `capacity` field** on slots: each room in the fixture can carry its own capacity
  (default 100). Enables fixtures that exercise different utilization bands without
  cross-coupling.

Pre-F11 fixtures that were affected by SC10 (K22-C H8, F3 MIXED cases) received surgical
`classGroupStudentCounts: [40, 40]` updates to keep their original semantics and prevent SC10
from firing on merged-class fixtures where the FALLBACK=50 × N classes would otherwise hit
utilization = 1.0.

---

## 1. Background

K22-F10 (commit `a5224ec`) confirmed that `SC10_ROOM_CAPACITY_UTILIZATION` is feasible:

- `Room.capacity` is real: 53 rooms, range 3-200, median 40, 0 zero/negative/default-50 (K21-FIX-A confirmed).
- TeachingTask student count is computable via existing `getTaskStudentCount` (capacity.ts).
- HC4 full + delta covered; 0 current violations in dev.db.
- No schema change required.
- Recommended Candidate D (combined utilization band): -2 tight / -1 waste.

K22-F11 implements SC10 in `score.ts` with full + delta consistency, mirroring the F3/F4/F6/F8 pattern.

---

## 2. SC10 Definition

### Constants (score.ts:27-32)

```ts
const SC10_CAPACITY_TIGHT_FIT_PENALTY = -2
const SC10_CAPACITY_WASTE_PENALTY = -1
const SC10_TIGHT_UTILIZATION_THRESHOLD = 0.90
const SC10_WASTE_UTILIZATION_THRESHOLD = 0.30
const SC10_WASTE_ROOM_CAPACITY_THRESHOLD = 100
```

### Formula

For each slot position:
```
utilization = studentCount / room.capacity

if utilization > 1.0 → SC10 skip (HC4 owns)
if utilization > 0.90 → penalty = -2 (tight)
else if utilization < 0.30 AND room.capacity >= 100 → penalty = -1 (waste)
else → penalty = 0
```

### Skip Rules

- `room === 0` (unscheduled)
- `room` missing in `roomById` (defensive)
- `room.capacity <= 0` (room is not usable)
- `taskStudentCount <= 0` (defensive)
- `utilization > 1.0` (HC4 owns; SC10 must not double-count)

### Expected Examples

| Slot (studentCount, room.capacity) | utilization | Penalty | Notes |
|---|---:|---:|---|
| (50, 100) | 0.50 | 0 | In band |
| (95, 100) | 0.95 | -2 | Tight |
| (120, 100) | 1.20 | 0 | Over-capacity, SC10 skip (HC4) |
| (20, 120) | 0.17 | -1 | Waste (cap >= 100) |
| (24, 60) | 0.40 | 0 | In band, cap<100 (waste skip) |
| (50, 0) | n/a | 0 | capacity=0 skip |
| (0, 100) | 0 | 0 | count=0 skip |
| (90, 100) | 0.90 | 0 | Boundary (strict > 0.90) |
| (95, 200) | 0.475 | 0 | In band |

---

## 3. Implementation

### 3.1 Shared Helper (score.ts:307-331)

```ts
function computeSC10CapacityUtilizationPenalty(studentCount: number, roomCapacity: number): number {
  if (studentCount <= 0) return 0
  if (roomCapacity <= 0) return 0
  const utilization = studentCount / roomCapacity
  if (utilization > 1.0) return 0 // HC4 owns over-capacity
  if (utilization > SC10_TIGHT_UTILIZATION_THRESHOLD) return SC10_CAPACITY_TIGHT_FIT_PENALTY
  if (utilization < SC10_WASTE_UTILIZATION_THRESHOLD && roomCapacity >= SC10_WASTE_ROOM_CAPACITY_THRESHOLD) {
    return SC10_CAPACITY_WASTE_PENALTY
  }
  return 0
}
```

### 3.2 Full Score (score.ts:660-686)

```ts
// ── SC10: 教室容量利用率 (K22-F11) ──
for (const p of positions) {
  if (p.room === 0) continue
  const room = ctx.roomById.get(p.room)
  if (!room || room.capacity <= 0) continue
  const studentInfo = getTaskStudentCount(p.slot.teachingTask, ctx)
  if (studentInfo.studentCount <= 0) continue
  const penalty = computeSC10CapacityUtilizationPenalty(studentInfo.studentCount, room.capacity)
  if (penalty !== 0) {
    const utilization = studentInfo.studentCount / room.capacity
    const reason = penalty === SC10_CAPACITY_TIGHT_FIT_PENALTY ? 'tight' : 'waste'
    softScore += penalty
    details.push({
      type: 'SC10_ROOM_CAPACITY_UTILIZATION', level: 'SOFT', penalty,
      slotId: p.slot.id,
      message: `容量利用率 ${(utilization * 100).toFixed(1)}% (${reason}): 任务 ${p.slot.teachingTask.id} ${studentInfo.studentCount} 人 (${studentInfo.countSource})，教室 ${room.name} 容量 ${room.capacity}`,
    })
  }
}
```

### 3.3 Delta Score (score.ts:995-1014)

```ts
// SC10 delta: 教室容量利用率 (K22-F11)
// Per-slot O(1): re-evaluate SC10 on the moved slot at old and new positions.
// Skip rules: room=0 / room missing / capacity<=0 / count<=0 / utilization>1.0 (HC4 owns).
// Only deltaSoft (never touches deltaHard).
// MIN_PERT 隔离: harness 用 3rd-position originalAssignments.
{
  const studentInfo = getTaskStudentCount(task, ctx)
  if (studentInfo.studentCount > 0) {
    if (old.roomId !== 0) {
      const oldRoom = ctx.roomById.get(old.roomId)
      if (oldRoom && oldRoom.capacity > 0) {
        const beforePenalty = computeSC10CapacityUtilizationPenalty(studentInfo.studentCount, oldRoom.capacity)
        deltaSoft -= beforePenalty
      }
    }
    const newRoom = ctx.roomById.get(move.newRoomId)
    if (newRoom && newRoom.capacity > 0) {
      const afterPenalty = computeSC10CapacityUtilizationPenalty(studentInfo.studentCount, newRoom.capacity)
      deltaSoft += afterPenalty
    }
  }
}
```

### 3.4 Hard/Soft Separation

- SC10 only affects `softScore` / `deltaSoft`.
- Never touches `hardScore` / `deltaHard`.
- HC1-HC6, SC1-SC9, MIN_PERT unchanged.
- HC4 still owns `utilization > 1.0` (strict). SC10 skips on that case.

---

## 4. Delta Consistency

- **Affected key**: per-slot (moved slot is the only affected key). SC10 is NOT aggregate.
- **Before penalty**: `computeSC10CapacityUtilizationPenalty(studentCount, oldRoomCapacity)`
- **After penalty**: `computeSC10CapacityUtilizationPenalty(studentCount, newRoomCapacity)`
- **`deltaSoft += afterPenalty - beforePenalty`**
- **Local computation**: O(1) per move (just two utilization calculations).
- **`room=0` handling**: old/new room=0 → SC10 skip (no penalty subtracted/added). MIN_PERT / HC4 handle unscheduled.
- **Missing room handling**: defensive skip if `roomById.get(...)` returns undefined.
- **`utilization > 1.0`**: both before and after SC10 return 0; HC4 delta path handles the violation.
- **MIN_PERT isolation**: harness uses 3rd-position `originalAssignments = {dayOfWeek: 9, slotIndex: 1, roomId: 999}`.
- **Full / delta consistency**: both paths use the same `computeSC10CapacityUtilizationPenalty` helper. Delta is a strict subset of full-score recomputation.

---

## 5. Constraint Interaction

| Constraint | Relationship | Notes |
|---|---|---|
| **HC4 capacity** | **hard-orthogonal** | SC10 skips at utilization > 1.0. HC4 still fires. No double-counting. |
| **SC9 room stability** | **soft-tradeoff** | Both at -2. LAHC solver weighs. If SC10 is wrong (penalizing a stable match), bestScore converges to global optimum. No hard conflict. |
| **SC8 class gap** | orthogonal | Different key (classGroup-day vs slot-room). |
| **SC6 / HC6 Linxiao** | **soft-priority** | SC6 -20 wins over SC10 -1/-2. Solver prefers Linxiao match over capacity. Intended. |
| **SC7 weekend** | orthogonal | SC10 is day-independent. Capacity preference is structural, not time-based. |
| **MIN_PERT** | orthogonal | SC10 doesn't depend on `originalAssignments`. |
| **SC1 / SC2 / SC3 / SC4 / SC5** | orthogonal | Different keys. No interaction. |

**No conflicts**. SC10 keys by slot-room (per-slot evaluation), distinct from all existing keys.

---

## 6. K22-C Harness J (13 cases, F11A isolated)

Each case asserts BOTH `total soft / deltaSoft / deltaHard` AND `SC10 details count + sum`.

| ID | Type | Total | SC10 sum | SC10 count | Note |
|---|---|---:|---:|---:|---|
| J1-CAPACITY-GOOD-FIT | full | 0 | 0 | 0 | utilization 0.50 in band, no fire |
| J2-CAPACITY-TIGHT-FIT | full | -2 | -2 | 1 | utilization 0.95 > 0.90 |
| J3-CAPACITY-OVER-CAPACITY | full | 0 | 0 | 0 | utilization 1.20 > 1.0, SC10 skip (HC4 fires) |
| J4-CAPACITY-SMALL-CLASS-HUGE-ROOM | full | -1 | -1 | 1 | utilization 0.17, cap 120 >= 100 → waste |
| J5-CAPACITY-SMALL-CLASS-NORMAL-ROOM | full | 0 | 0 | 0 | utilization 0.40, cap 60 < 100 (waste skip) |
| J6-CAPACITY-ROOM-ZERO-SKIP | full | 0 | 0 | 0 | room=0 → SC10 skip |
| J7-CAPACITY-MISSING-STUDENT-COUNT-SKIP | full | 0 | 0 | 0 | studentCount=0 → SC10 skip (defensive) |
| J8-CAPACITY-EXACT-0.90-BOUNDARY | full | 0 | 0 | 0 | utilization=0.90 (strict >, no fire) |
| J9-DELTA-IMPROVE-TIGHT-TO-GOOD | delta | +2 | +2 | — | tight 0.95 → good 0.475, SC10 only |
| J10-DELTA-WORSEN-GOOD-TO-TIGHT | delta | -2 | -2 | — | good 0.475 → tight 0.95 |
| J11-DELTA-SMALL-HUGE-TO-NORMAL | delta | +1 | +1 | — | waste 0.17 → good 0.50 |
| J12-DELTA-NORMAL-TO-HUGE | delta | -1 | -1 | — | good 0.50 → waste 0.17 |
| J13-DELTA-OVER-CAPACITY-INTRODUCED | delta | 0 | 0 | — | util 1.25, SC10 skip (HC4 fires, deltaHard=-1000) |

**Coverage**:
- ✅ good fit
- ✅ tight fit
- ✅ over-capacity skip
- ✅ small-class huge-room waste
- ✅ small-class normal-room (cap<100, waste skip)
- ✅ room=0 skip
- ✅ missing student count skip
- ✅ exact 0.90 boundary
- ✅ delta improve tight to good
- ✅ delta worsen good to tight
- ✅ delta small huge to normal
- ✅ delta normal to huge
- ✅ delta over-capacity introduced (HC4 + SC10 skip)

---

## 7. F11 Wrapper (13 cases, same coverage as Harness J)

`scripts/verify-capacity-preference-constraint-k22-f11.ts` — 13/13 PASS.

---

## 8. Default Snapshot

`docs/k22-score-default-snapshot.json` **unchanged**:
- `hardScore=0`, `softScore=-11`, breakdown `SC2_SAME_DAY=1, SC3_EXTREME_TIME_SLOT=1`

**Reason**: The default fixture (3 rooms, 3 tasks, 4 slots) has 1 class per task (classGroupNames
default to 'G{id}' without classGroupStudentCounts, so studentCount = 50 FALLBACK per class).
With 1 class, taskStudentCount = 50. With room capacity 50 (default in K22-C harness):
utilization = 1.0 → SC10 tight -2 would fire... but actually, the default snapshot's harness
uses `classGroupStudentCounts: [30]` for single-class tasks (or empty), so utilization is 0.30-0.50.
Let me re-check — the actual default fixture used by K22-C Harness C uses single-class tasks with
studentCount 30 (per `classGroupStudentCounts: [30]`). With room capacity 50 (the harness default
in `buildContext` line 134 `capacity: r.capacity ?? 50`), utilization = 0.60 (in band, no SC10).
SC10 does not fire on the default snapshot fixture, so the snapshot is unchanged.

---

## 9. Pre-F11 Fixture Updates

The following pre-F11 fixtures received surgical `classGroupStudentCounts` updates to keep their
original semantics and prevent SC10 from firing on merged-class fixtures (where the
FALLBACK=50 × N classes would otherwise hit utilization = 1.0 in cap=100 rooms):

### K22-C H8 (F8 SC9 isolation)

`scripts/verify-score-regression-harness-k22-c.ts`:
- `H8-MULTI-CLASSGROUP-MERGED` taskSpecs: added `classGroupStudentCounts: [20, 20]` for merged task A,
  `[40]` for B, `[40]` for C. Keeps SC8 detection (gaps in (1,3) and (1,5)) while keeping utilization
  in 0.30-0.90 band (no SC10 fire).

### F3 MIXED (K22-F3 specialty campus weekend)

`scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts`:
- `MIXED-LINXIAO`, `MIXED-NON_LINXIAO`, `DELTA-MIXED-NON_LINXIAO-TO-LINXIAO`: added
  `classGroupStudentCounts: [40, 40]` (total 80, util 0.80 in cap=100). Keeps MIXED semantics
  while avoiding SC10 fire.

These updates are documented in code comments. No semantic change to the original test goals.

---

## 10. Verification Results

| Command | Result | Notes |
|---|---|---|
| `npx tsx scripts/verify-capacity-preference-constraint-k22-f11.ts` | **PASS — 13/13** | F11 wrapper, all isolated |
| `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | **PASS — 73/0/0/0** | Was 60/0/0/0 before F11 |
| `npx tsx scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` | **PASS — 16/16** | After MIXED fixture update |
| `npx tsx scripts/verify-classroom-stability-constraint-k22-f8.ts` | PASS — 11/11 | |
| `npx tsx scripts/verify-class-gap-reduction-constraint-k22-f6.ts` | PASS — 12/12 | |
| `npx tsx scripts/verify-teacher-day-balance-constraint-k22-f4.ts` | PASS — 13/13 | |
| `npx tsx scripts/audit-score-constraint-summary-k22-f9.ts` | HIGH=0/MEDIUM=1/LOW=2/INFO=6/NONE=1, BLOCKING=NO | |
| `npx tsx scripts/audit-capacity-preference-constraint-k22-f10.ts` | Implementation readiness: READY | |
| `npx tsx scripts/audit-room-type-data-quality-k22-g.ts` | HIGH=0/MEDIUM=2/LOW=3/INFO=1/NONE=2, BLOCKING=NO | |
| `npx tsx scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts` | HIGH=0, BLOCKING=NO | |
| `npx tsx scripts/audit-class-gap-reduction-constraint-k22-f5.ts` | HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO | |
| `npx tsx scripts/audit-classroom-stability-constraint-k22-f7.ts` | HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO | |
| `npx tsx scripts/audit-soft-constraints-roadmap-k22-e.ts` | HIGH=0/MEDIUM=3/LOW=1/INFO=2/NONE=0, BLOCKING=NO | |
| `npx tsx scripts/verify-score-delta-sc1-fix-k22-d.ts` | PASS — 6/6 | |
| `npx tsx scripts/audit-score-constraint-inventory-k22-a.ts` | HIGH=0/MEDIUM=1/LOW=1/INFO=3/NONE=3, BLOCKING=NO | |
| `npx tsx scripts/plan-score-regression-harness-k22-b.ts` | PASS | |
| `npx tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | PASS — 22/0 | |
| `npx tsx scripts/verify-solver-config-api-k21-fix-f.ts` | PASS — 27/0 | |
| `npx tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | PASS — 16/0 | |
| `npx tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | PASS — 19/0 | |
| `npx tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH=0/MEDIUM=0 | |
| `npx tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | BLOCKING=NO | |
| `npx tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | PASS — 23/0 | |
| `npx prisma validate` | valid | |
| `npm run build` | PASS | |
| `npm run lint` | 314 problems (180 errors + 134 warnings), 0 new | |
| `npm run test:auth-foundation` | 53 passed / 1 failed (pre-existing) | Pre-existing `ScheduleAdjustment ACTIVE count mismatch` |

---

## 11. Unmodified Scope

- ✅ HC1-HC5 (NOT modified)
- ✅ HC6 specialty (NOT modified)
- ✅ SC1-SC9 (NOT modified)
- ✅ MIN_PERT (NOT modified)
- ✅ Solver algorithm (NOT modified)
- ✅ K22-C Harness A-I (NOT modified; H8 received surgical classGroupStudentCounts update for SC10 isolation)
- ✅ Scheduler config API/UI
- ✅ Frontend
- ✅ API routes
- ✅ Importer / parser
- ✅ RBAC
- ✅ Seed / 业务数据
- ✅ hardWeights / softWeights (not introduced)
- ✅ Room.type / Course.type schema
- ✅ Room suitability / specialty classroom
- ✅ Other P1/P2 constraints
- ✅ Default snapshot

---

## 12. Closing Note

K22-F11-CAPACITY-PREFERENCE-IMPL 按 spec 完整执行：

- ✅ 修改 `src/lib/scheduler/score.ts`: 5 个新常量 + 1 个新 helper + 1 个 full-score 段 + 1 个 delta-score 段
- ✅ 新增 `scripts/verify-capacity-preference-constraint-k22-f11.ts`: 13 cases (8 full + 5 delta)
- ✅ 扩展 K22-C harness Harness J: 13 cases (8 full + 5 delta)
- ✅ K22-C summary: 60/0/0/0 → 73/0/0/0
- ✅ F11 wrapper: 13/13 PASS
- ✅ F3 wrapper: 16/16 PASS (after MIXED fixture update)
- ✅ Pre-F11 fixture updates: H8 + F3 MIXED cases (documented in code)
- ✅ Default snapshot unchanged (SC10 doesn't fire on default fixture)
- ✅ 与 HC1-HC6、SC1-SC9、MIN_PERT 无冲突
- ✅ 0 schema 变更 / 0 solver 变更 / 0 API 变更 / 0 frontend 变更
- ✅ Recommended next stage: **K22-F12-SCORE-CONSTRAINT-SUMMARY-AUDIT-REFRESH** (read-only refresh of HC1-HC6、SC1-SC10、MIN_PERT、K22-C Harness A-J、default snapshot、remaining roadmap)
