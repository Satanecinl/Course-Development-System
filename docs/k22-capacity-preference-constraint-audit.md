# K22-F10 Capacity Preference Constraint Audit

| Field | Value |
|---|---|
| Phase | K22-F10-CAPACITY-PREFERENCE-AUDIT |
| Type | Read-only audit + design (no score.ts modifications, no schema changes, no implementation) |
| Generated | 2026-06-07 |
| Predecessor | K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT (commit `64b5cff`) |
| Audit script | `scripts/audit-capacity-preference-constraint-k22-f10.ts` |
| JSON report | `docs/k22-capacity-preference-constraint-audit.json` |
| Project direction | K22-F10 — assess feasibility of "大班优先大教室 / 容量余量优化" soft constraint |

---

## 1. Executive Summary

K22-F10 is a read-only audit + design stage. It does NOT implement any new constraint, does NOT
modify `score.ts`, does NOT change the schema, and does NOT add any new data path. It produces a
structured assessment of whether a `SC10_ROOM_CAPACITY_UTILIZATION` soft preference is feasible
and worth implementing.

**Headline findings**:

- **Room.capacity is real and ready**: 53 rooms, range 3-200, median 40, 23 distinct values,
  **0 zero / 0 negative / 0 default-50**. K21-FIX-A and K22-G both confirmed. Suitable for
  capacity-based soft preference without further data-quality work.
- **Task student count is computable**: 308/308 (100%) tasks have `REAL_STUDENT_COUNT` (no
  fallback). All 36 ClassGroups have `studentCount` populated. Task student count range:
  2-483, median 31. Suitable for utilization calculation without quality concerns.
- **HC4 is full + delta covered**: Penalty -1000, trigger `taskStudentCount > room.capacity`.
  **0 current HC4 violations in dev.db** (clean baseline). SC10 cannot weaken HC4 because HC4
  fires at `utilization > 1.0` and SC10 only fires at `utilization <= 1.0`.
- **SC10 design (Candidate D) is feasible**: reuses existing `getTaskStudentCount` helper
  (`src/lib/scheduler/capacity.ts`). No schema change. No new data path. Penalty scale -1 (waste)
  / -2 (tight) — within existing soft range, well below HC4 (-1000) and SC6 (-20).
- **Interaction profile is clean**: SC10 is per-slot (NOT aggregate), so no aggregate-key drift
  risk. Orthogonal to SC1-SC5, SC7, SC8. Soft-tradeoff with SC9 (room stability). Soft-priority
  with SC6/HC6 (Linxiao — SC6 -20 wins).

**Severity summary**: HIGH=0, MEDIUM=0, LOW=0, INFO=3, NONE=2, **BLOCKING=NO**.

**Recommended design** (canonical name: `SC10_ROOM_CAPACITY_UTILIZATION`):

```
utilization = taskStudentCount / room.capacity
if utilization > 1.0 → SC10 skip (HC4 owns)
if utilization > 0.90 → penalty = -2 (tight)
if utilization < 0.30 AND room.capacity >= 100 → penalty = -1 (waste)
else → penalty = 0
```

**Implementation readiness**: **READY**. All prerequisites met:
- Capacity data is real.
- Student count is computable.
- HC4 is in place.
- Scheduler context has full access to room.capacity and student count.
- Penalty scale fits existing soft range.

**Recommended next stage**: `K22-F11-CAPACITY-PREFERENCE-IMPL` (implementation + isolated
regression harness with Harness J 13 cases).

---

## 2. Current Capacity Data Quality

`Room.capacity` is `Int @default(50)` in `prisma/schema.prisma:67`. No null allowed.

| Metric | Value | Notes |
|---|---:|---|
| Room count | 53 | |
| Min | 3 | likely single-seat office / lab |
| Max | 200 | likely lecture hall / auditorium |
| Median | 40 | small classroom |
| Average | 46 | |
| Distinct values | 23 | high diversity (not all default) |
| **capacity=0 count** | **0** | (was 0 per K21-FIX-A) |
| capacity=50 (default) count | 0 | (was 0 per K21-FIX-A) |
| capacity=null count | 0 | schema disallows null |
| capacity<0 count | 0 | schema disallows negative |

**Bucket distribution**:

| Bucket | Count | Percent | Notes |
|---|---:|---:|---|
| <30 | 10 | 18.9% | small room / single-seat / lab |
| 30-49 | 29 | 54.7% | small classroom |
| 50-79 | 7 | 13.2% | standard classroom |
| 80-119 | 6 | 11.3% | large classroom |
| >=120 | 1 | 1.9% | lecture hall / auditorium |

**Suspicious rooms** (5, all explained by specialty / small-seat):

| ID | Name | Capacity | Reason |
|---:|---|---:|---|
| (5 rooms with capacity <10) | (likely single-seat labs) | <10 | Very small — may be specialty labs |
| (1 room with capacity >150) | (likely lecture hall) | 200 | Very large |

No bugs. Capacity values are real and reflect the school's actual room inventory (small-school
profile with many small classrooms).

**Cross-audit confirmation**:

- K21-FIX-A: 53 rooms; capacity=0 count is 0; no placeholders; capacity range 3-200; median 40.
- K22-G: All 53 rooms have real capacity (K21-FIX-A confirmed); range 3-200, median 40, avg 46.
- K22-F10: Confirmed (this audit).

**Conclusion**: Capacity is real and ready for capacity-based soft preference.

---

## 3. TeachingTask Student Count Audit

### How student count is computed

`src/lib/scheduler/capacity.ts:39` provides `getTaskStudentCount(task, ctx)`:

```
For each task.taskClasses (with dedup by classGroupId):
  if ClassGroup.studentCount is not null and > 0:
    add to total
    hasReal = true
  else:
    add FALLBACK (50)
    hasFallback = true
If taskClasses is empty: total = FALLBACK, hasFallback = true
Return { studentCount, countSource: REAL | FALLBACK | MIXED, ... }
```

The function already tracks `countSource` so downstream code can distinguish real from fallback.

### Task student count statistics

| Metric | Value |
|---|---:|
| Total TeachingTask | 308 |
| Tasks with classes | 308 (100.0%) |
| Tasks without classes | 0 (0.0%) |
| ClassGroup count | 36 |
| ClassGroup with studentCount | 36 (100.0%) |
| ClassGroup without studentCount | 0 (0.0%) |
| Duplicated class links | 0 |
| Count source: REAL_STUDENT_COUNT | 308 (100.0%) |
| Count source: FALLBACK_50_PER_CLASS | 0 (0.0%) |
| Count source: MIXED | 0 (0.0%) |

**Distribution**:

| Metric | Value |
|---|---:|
| Min | 2 |
| Max | 483 |
| Median | 31 |
| Average | 37 |

**Bucket distribution**:

| Bucket | Count | Percent | Notes |
|---|---:|---:|---|
| <30 | 132 | 42.9% | small class |
| 30-49 | 107 | 34.7% | small-medium |
| 50-79 | 59 | 19.2% | medium-large |
| 80-119 | 9 | 2.9% | large |
| >=120 | 1 | 0.3% | very large / merged-class (483 students) |

**Quality assessment**: Excellent. 100% of tasks have REAL_STUDENT_COUNT, 100% of ClassGroups
have studentCount, 0 duplicated class links. No fallback contamination.

**Score context access**: `getTaskStudentCount` is called by HC4 (full + delta) and by the
diagnostics. The `SchedulingContext` has the full task tree with `taskClasses[].classGroup.studentCount`.
No new data path is needed for SC10.

---

## 4. HC4 Current Behavior

**HC4 = capacity overflow** (`src/lib/scheduler/score.ts:364-378` and `score.ts:706-711`):

### Full score

```ts
for (const p of positions) {
  if (p.room === 0) continue
  const room = ctx.roomById.get(p.room)
  if (!room) continue
  const studentInfo = getTaskStudentCount(p.slot.teachingTask, ctx)
  if (studentInfo.studentCount > room.capacity) {
    hardScore += HARD_PENALTY // -1000
    details.push({ type: 'HC4_CAPACITY', level: 'HARD', penalty: HARD_PENALTY, ... })
  }
}
```

### Delta score

```ts
const oldRoom = ctx.roomById.get(old.roomId)
const newRoom = ctx.roomById.get(move.newRoomId)
const studentInfo = getTaskStudentCount(task, ctx)
if (oldRoom && studentInfo.studentCount > oldRoom.capacity) deltaHard -= HARD_PENALTY
if (newRoom && studentInfo.studentCount > newRoom.capacity) deltaHard += HARD_PENALTY
```

### Summary

| Aspect | Status |
|---|:---:|
| Exists in `score.ts` | ✅ |
| Full score coverage | ✅ |
| Delta score coverage | ✅ |
| Penalty | -1000 (HARD) |
| Trigger | `taskStudentCount > room.capacity` |
| K22-C harness section | Harness B (HC invariant) |
| Current violations in dev.db | **0** (clean baseline) |
| Reuses `getTaskStudentCount` | ✅ |

**Boundary with SC10**: SC10 must NOT weaken HC4. SC10 only fires at `utilization <= 1.0`. If a
move brings a slot into `utilization > 1.0`, only HC4 penalty applies (deltaHard += -1000);
SC10 does not add anything (skipped).

---

## 5. Candidate Strategy Comparison

| ID | Strategy | Risk | Recommended | Rationale |
|---|---|:---:|:---:|---|
| **A** | Large class prefers larger room (threshold-based) | MEDIUM | ❌ | Narrow, threshold-tuning risk |
| **B** | Capacity buffer / margin preference (utilization ratio) | MEDIUM | ✅ | Smooth, naturally aligns with HC4 |
| **C** | Avoid wasting large rooms for small classes | MEDIUM | ❌ | Too narrow; better as sub-bucket of B |
| **D** | Combined utilization band (tight + waste) | LOW | ✅✅ | Best balance; combines B + C |

### Candidate A: Threshold-based large-class preference

**Approach**: Trigger only when `taskStudentCount >= 50`. If `room.capacity < taskStudentCount * 1.2`, apply -3.

**Pros**: Simple, easy to reason about, no penalty for small classes.

**Cons**: Threshold (50) is hard-coded; does not address waste; arbitrary buffer (1.2).

**Verdict**: Not recommended for primary design.

### Candidate B: Utilization ratio

**Approach**: `utilization = taskStudentCount / room.capacity`. If `utilization > 0.90`, apply -2.

**Pros**: Smooth, naturally complements HC4, single threshold, reuses helper.

**Cons**: Does not penalize waste; one-sided.

**Verdict**: Recommended; clean baseline.

### Candidate C: Avoid wasting large rooms

**Approach**: `taskStudentCount < 30 AND room.capacity >= 100` → -1.

**Pros**: Improves resource utilization, complements large-class preference.

**Cons**: Hard threshold; may conflict with SC9 stability; sub-bucket of B.

**Verdict**: Not standalone; fold into D.

### Candidate D: Combined utilization band (RECOMMENDED)

**Approach**: `utilization > 0.90 → -2; utilization < 0.30 AND capacity >= 100 → -1; else 0`.

**Pros**: Single helper, covers both directions, easy to test, smooth.

**Cons**: Two thresholds (0.90, 0.30, 100) need calibration.

**Verdict**: ✅ **Recommended as canonical SC10 design**.

---

## 6. Recommended SC10 Design

### 6.1 Canonical name

`SC10_ROOM_CAPACITY_UTILIZATION`

### 6.2 Skip rules

- `room === 0` (unscheduled)
- `room` missing in `roomById` (defensive)
- `taskStudentCount <= 0` (defensive)
- `room.capacity <= 0` (room is not usable)
- `utilization > 1.0` (HC4 owns this case; SC10 skips to avoid double-counting)

### 6.3 Formula

```
utilization = taskStudentCount / room.capacity

if utilization > 0.90 → penalty = -2 (tight)
else if utilization < 0.30 AND room.capacity >= 100 → penalty = -1 (waste)
else → penalty = 0
```

### 6.4 Penalty scale

- **-2 for tight match** (utilization > 0.90). Matches SC8 / SC9 base unit (per-gap / per-extra-room).
- **-1 for waste** (utilization < 0.30 with large room). Lighter than tight penalty.
- Both are within the existing soft penalty range (-1 to -20) and well below HC4 (-1000).

### 6.5 Hard / soft separation

- SC10 only affects `softScore` / `deltaSoft`.
- Never touches `hardScore` / `deltaHard`.
- HC1-HC6, SC1-SC9, MIN_PERT remain unchanged.

### 6.6 Class group / weekday / weekend

- No classGroup keying (per-slot, not aggregate).
- No weekday-only filter (capacity preference is structural, not time-based).
- No weekend skip (capacity is independent of day).
- HC6 / SC6 specialty rules take precedence on Linxiao (handled by their -1000 / -20 penalties).

### 6.7 Pseudo-code (full score)

```ts
// In calculateScoreWithDetails, after HC4 / SC9, before MIN_PERT:
for (const p of positions) {
  if (p.room === 0) continue
  const room = ctx.roomById.get(p.room)
  if (!room || room.capacity <= 0) continue
  const studentInfo = getTaskStudentCount(p.slot.teachingTask, ctx)
  if (studentInfo.studentCount <= 0) continue
  const utilization = studentInfo.studentCount / room.capacity
  if (utilization > 1.0) continue // HC4 owns
  let penalty = 0
  if (utilization > 0.90) penalty = -2
  else if (utilization < 0.30 && room.capacity >= 100) penalty = -1
  if (penalty !== 0) {
    softScore += penalty
    details.push({
      type: 'SC10_ROOM_CAPACITY_UTILIZATION', level: 'SOFT', penalty,
      slotId: p.slot.id,
      message: `容量利用率 ${(utilization * 100).toFixed(1)}%: 任务 ${studentInfo.studentCount} 人, 教室 ${room.name} 容量 ${room.capacity}`,
    })
  }
}
```

---

## 7. Full Score Design

(See Section 6.7 pseudo-code.)

**Key properties**:
- Per-slot evaluation, no aggregation.
- Reuses existing `getTaskStudentCount` helper.
- Detail type emitted: `SC10_ROOM_CAPACITY_UTILIZATION`.
- Skip rules: 5 (room=0, room missing, count=0, capacity=0, utilization>1.0).
- Helper function `computeSC10Penalty(utilization, capacity)` shared with delta.

---

## 8. Delta Score Design

### 8.1 Affected key

**Per-slot** (moved slot is the only affected key). SC10 is NOT an aggregate constraint; it
evaluates one slot at a time. Therefore the delta computation is **O(1)**.

### 8.2 Algorithm

```ts
// In calculateDeltaScore, after HC4 delta, before SC9 delta:
const studentInfo = getTaskStudentCount(task, ctx)
if (studentInfo.studentCount > 0) {
  // Old position
  if (old.roomId !== 0) {
    const oldRoom = ctx.roomById.get(old.roomId)
    if (oldRoom && oldRoom.capacity > 0 && studentInfo.studentCount <= oldRoom.capacity) {
      const oldUtil = studentInfo.studentCount / oldRoom.capacity
      const oldPenalty = computeSC10Penalty(oldUtil, oldRoom.capacity)
      deltaSoft -= oldPenalty
    }
  }
  // New position
  const newRoom = ctx.roomById.get(move.newRoomId)
  if (newRoom && newRoom.capacity > 0 && studentInfo.studentCount <= newRoom.capacity) {
    const newUtil = studentInfo.studentCount / newRoom.capacity
    const newPenalty = computeSC10Penalty(newUtil, newRoom.capacity)
    deltaSoft += newPenalty
  }
}

function computeSC10Penalty(utilization: number, capacity: number): number {
  if (utilization > 1.0) return 0
  if (utilization > 0.90) return -2
  if (utilization < 0.30 && capacity >= 100) return -1
  return 0
}
```

### 8.3 Complexity

O(1) per delta (just two utilization calculations and two penalty lookups).

### 8.4 MIN_PERT isolation

Use 3rd-position `originalAssignments` (F3/F4/F6/F8 pattern) to isolate MIN_PERT in delta tests.
SC10 does not depend on `originalAssignments`, but Harness J's delta cases must still isolate
MIN_PERT to keep delta tests clean.

### 8.5 How to handle room=0 / missing room

- `old.roomId === 0` → skip old penalty calculation (SC10 doesn't apply to unscheduled).
- `move.newRoomId === 0` → skip new penalty calculation (or treat as "removed" — see below).
- `room` missing in `roomById` → defensive skip.
- For "moved to room=0" delta cases, the new penalty is 0 (SC10 skips), so the only delta is
  `-oldPenalty`. This is correct: moving a slot out of a real room removes its SC10 contribution.

---

## 9. Interaction with Existing Constraints

| Constraint | Relationship | Notes |
|---|---|---|
| **HC4 capacity** | **hard-orthogonal** | SC10 cannot weaken HC4. SC10 skips at utilization > 1.0. HC4 still fires. |
| **SC9 room stability** | **soft-tradeoff** | Both at -2. LAHC weighs them. If SC10 is wrong (penalizing a stable match), bestScore still converges to global optimum. No hard conflict. |
| **SC8 class gap** | orthogonal | Different key (classGroup-day vs slot-room). |
| **SC6 / HC6 Linxiao** | **soft-priority** | SC6 -20 wins over SC10 -1/-2. Solver prefers Linxiao match. Intended. |
| **SC7 weekend** | orthogonal | SC10 is independent of day. Capacity is structural. |
| **MIN_PERT** | orthogonal | SC10 doesn't depend on originalAssignments. Harness must still isolate. |
| **SC1 cross-building** | orthogonal | Different key. |
| **SC2 same-day** | orthogonal | Different key. |
| **SC3 extreme time** | orthogonal | Different key. |
| **SC4 cross-campus** | orthogonal | Different key. |
| **SC5 teacher day balance** | orthogonal | Different key. |

**Boundary checks**:
- Moving a slot to utilization > 1.0: only HC4 fires (-1000). SC10 contributes 0.
- Moving a slot from utilization 0.95 to 0.50: SC10 delta = +2. HC4 unchanged.
- Moving a slot into Linxiao (cap 30, students 50): HC6 fires if non-automotive, SC10 fires (utilization 1.67 → skipped because > 1.0, so HC4 fires). Combined: HC4 +1000, HC6 +1000 for non-automotive. Solver will avoid this if possible.

---

## 10. Harness Plan (K22-C Harness J)

13 cases (8 full + 5 delta). Isolation strategy mirrors F6A / F8.

| ID | Type | Title | Expected soft | Isolation notes |
|---|---|---|---:|---|
| J1-CAPACITY-GOOD-FIT | full | Good fit: utilization 0.50 → soft=0 | 0 | teacherId=null (SC5), 1 slot/task (SC2), period<5 (SC3), weekday (SC7). Utilization 0.50 in 0.30-0.90 band. |
| J2-CAPACITY-TIGHT-FIT | full | Tight fit: utilization 0.95 → soft=-2 | -2 | Same isolation. Utilization > 0.90 fires. |
| J3-CAPACITY-OVER-CAPACITY | full | Over capacity: utilization 1.20 → hard=-1000, soft=0 | 0 | HC4 fires. SC10 skips. Component assertion: SC10 details=0. |
| J4-CAPACITY-SMALL-CLASS-HUGE-ROOM | full | Small class in huge room: utilization 0.20, cap=120 → soft=-1 | -1 | Waste branch. |
| J5-CAPACITY-SMALL-CLASS-NORMAL-ROOM | full | Small class in normal room: utilization 0.40, cap=60 → soft=0 | 0 | In band. |
| J6-CAPACITY-ROOM-ZERO-SKIP | full | room=0: SC10 skip → soft=0 | 0 | room=0 → SC10 skip. |
| J7-CAPACITY-MISSING-STUDENT-COUNT-SKIP | full | taskStudentCount=0: SC10 skip → soft=0 | 0 | Defensive. |
| J8-CAPACITY-EXACT-0.90-BOUNDARY | full | Boundary: utilization = 0.90 → soft=0 | 0 | Strict > 0.90. |
| J9-DELTA-IMPROVE-TIGHT-TO-GOOD | delta | Move from tight (0.95) to good (0.50) → deltaSoft=+2 | 2 | 3rd-position originalAssignments. SC10 only. |
| J10-DELTA-WORSEN-GOOD-TO-TIGHT | delta | Move from good (0.50) to tight (0.95) → deltaSoft=-2 | -2 | Same isolation. |
| J11-DELTA-SMALL-HUGE-TO-NORMAL | delta | Move small from huge (0.20, cap=120) to normal (0.50, cap=60) → deltaSoft=+1 | 1 | Waste penalty removed. |
| J12-DELTA-NORMAL-TO-HUGE | delta | Move small from normal (0.50, cap=60) to huge (0.20, cap=120) → deltaSoft=-1 | -1 | Waste penalty introduced. |
| J13-DELTA-OVER-CAPACITY-INTRODUCED | delta | Move into over-capacity (utilization 1.10) → deltaHard=-1000, deltaSoft=0 | 0 | SC10 skips. HC4 fires. Component assertion. |

**Component-level assertion**: For J3 and J13, assert BOTH `total soft + deltaHard` AND
`SC10_ROOM_CAPACITY_UTILIZATION details count + sum` to verify SC10 doesn't double-count with HC4.

**MIN_PERT isolation**: All delta cases (J9-J13) use 3rd-position `originalAssignments`.

**Isolation summary**:
- teacherId=null: SC5 skips.
- 1 slot per task: SC2 skips.
- periods <5: SC3 skips.
- weekday only: SC7 skips.
- teacher=null: SC6 specialty classification may still fire if classGroup has 汽车/林校 keyword → ensure fixture uses generic classGroup names.

---

## 11. Findings Summary

| ID | Severity | Category | Title |
|---|:---:|---|---|
| F10-F-1 | NONE | F10-F. Capacity data quality | Room.capacity is real: range 3-200, median 40, no null/0/negative |
| F10-F-2 | INFO | F10-F. TeachingTask student count quality | Task student count distribution: min=2, max=483, median=31, 100% REAL_STUDENT_COUNT |
| F10-F-3 | NONE | F10-F. HC4 completeness | HC4: full + delta covered; 0 current violations in dev.db |
| F10-F-4 | INFO | F10-F. SC10 design feasibility | SC10 design (Candidate D) is feasible: reuses getTaskStudentCount, no schema change |
| F10-F-5 | INFO | F10-F. SC10 interaction | SC10 is orthogonal to SC1-SC5, SC7, SC8; soft-tradeoff with SC9; soft-priority with SC6/HC6 |

**Severity summary**: HIGH=0, MEDIUM=0, LOW=0, INFO=3, NONE=2, **BLOCKING=NO**.

**Implementation readiness**: **READY** for `K22-F11-CAPACITY-PREFERENCE-IMPL`.

---

## 12. Recommended Next Stage

Per F10 spec, K22-F10 is a planning/audit stage. It does NOT prescribe a single next implementation.
It offers three options:

### Option A: `K22-F11-CAPACITY-PREFERENCE-IMPL` (recommended)

- **Scope**: Implement SC10 in `score.ts` with full + delta, mirroring F4/F6/F8 pattern.
  - Add `SC10_ROOM_CAPACITY_UTILIZATION_PENALTY_TIGHT = -2` and `SC10_PENALTY_WASTE = -1` constants.
  - Add `computeSC10Penalty(utilization, capacity)` helper.
  - Add full-score segment after HC4 / SC9, before MIN_PERT.
  - Add delta-score segment after HC4 delta, before SC9 delta.
  - Add Harness J with 13 cases (8 full + 5 delta) to K22-C regression harness.
  - Update K22-C summary: 60 → 73 PASS.
  - Confirm default snapshot unchanged (SC10 doesn't fire on default fixture).
- **Rationale**: This is the cleanest P1 implementation. All data is real, HC4 is in place,
  helper exists, no schema change.
- **Estimated effort**: LOW (mirrors F4/F6/F8 implementation).

### Option B: `K22-I-SCORE-WEIGHTS-AUDIT`

- **Scope**: Read-only audit of how `hardWeights` / `softWeights` could enter `SchedulingConfig`
  without implementing schema changes.
- **Rationale**: If weight calibration risk is high (e.g. SC10 penalty scale is too speculative),
  audit weights first.
- **Estimated effort**: LOW (audit only).

### Option C: `K22-G2-ROOM-TYPE-SCHEMA-PLAN`

- **Scope**: Read-only planning of `Room.type` / `Course.type` schema migration + admin UI +
  importer + backfill.
- **Rationale**: If room type is more important than capacity preference, do schema plan first.
- **Estimated effort**: LOW (planning only).

### Final recommendation

Open **Option A** (`K22-F11-CAPACITY-PREFERENCE-IMPL`) first since all prerequisites are met and
it is the safest P1 implementation.

K22-F10 is read-only. It does **NOT** implement anything.

---

## 13. Verification Results

| Command | Result | Notes |
|---|---|---|
| `npx tsx scripts/audit-capacity-preference-constraint-k22-f10.ts` | **PASS** — HIGH=0 / MEDIUM=0 / LOW=0 / INFO=3 / NONE=2 / BLOCKING=NO | Implementation: READY |
| `npx tsx scripts/audit-room-type-data-quality-k22-g.ts` | (per K22-G) HIGH=0 / MEDIUM=2 / LOW=3 / INFO=1 / NONE=2, BLOCKING=NO | K22-G baseline |
| `npx tsx scripts/audit-score-constraint-summary-k22-f9.ts` | (per F9) HIGH=0 / MEDIUM=1 / LOW=2 / INFO=6 / NONE=1, BLOCKING=NO | F9 summary |
| `npx tsx scripts/verify-classroom-stability-constraint-k22-f8.ts` | (per F8) 11/11 PASS | F8 wrapper |
| `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | (per F8 commit `ceb9bc7`) 60 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO | Canonical K22-C baseline |
| `npx tsx scripts/audit-classroom-stability-constraint-k22-f7.ts` | (per F7) HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO | F7 audit |
| `npx tsx scripts/verify-class-gap-reduction-constraint-k22-f6.ts` | (per F6A) 12/12 PASS | F6 wrapper |
| `npx tsx scripts/audit-class-gap-reduction-constraint-k22-f5.ts` | (per F5) HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO | F5 audit |
| `npx tsx scripts/verify-teacher-day-balance-constraint-k22-f4.ts` | (per F4) 13/13 PASS | F4 wrapper |
| `npx tsx scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` | (per F3) 16/16 PASS | F3 wrapper |
| `npx tsx scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts` | (per F2) HIGH=0, BLOCKING=NO | F2 audit |
| `npx tsx scripts/audit-soft-constraints-roadmap-k22-e.ts` | (per K22-E) HIGH=0/MEDIUM=3/LOW=1/INFO=2/NONE=0, BLOCKING=NO | K22-E |
| `npx tsx scripts/verify-score-delta-sc1-fix-k22-d.ts` | (per K22-D) 6/6 PASS | K22-D |
| `npx tsx scripts/audit-score-constraint-inventory-k22-a.ts` | (per K22-A) HIGH=0/MEDIUM=1/LOW=1/INFO=3/NONE=3, BLOCKING=NO | K22-A |
| `npx tsx scripts/plan-score-regression-harness-k22-b.ts` | (per K22-B) PASS | K22-B |
| `npx tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | (per K21-FIX-G) 22/0 PASS | K21 regression |
| `npx tsx scripts/verify-solver-config-api-k21-fix-f.ts` | (per K21-FIX-F) 27/0 PASS | K21 regression |
| `npx tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | (per K21-FIX-F) 16/0 PASS | K21 regression |
| `npx tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | (per K21-FIX-F) 19/0 PASS | K21 regression |
| `npx tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH=0 / MEDIUM=0 | audit |
| `npx tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | BLOCKING=NO | audit |
| `npx tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23/0 PASS | verify |
| `npx prisma validate` | valid | schema |
| `npm run build` | PASS | build |
| `npm run lint` | 314 problems (180 errors + 134 warnings), 0 new | lint baseline |
| `npm run test:auth-foundation` | 53 passed / 1 failed (pre-existing) | pre-existing `ScheduleAdjustment ACTIVE count mismatch` |

K22-F10 itself re-ran only the K22-F10 audit script + build/lint/prisma/test:auth-foundation.
Other commands are re-stated for the report.

---

## 14. Unmodified Scope Confirmation

K22-F10-CAPACITY-PREFERENCE-AUDIT is a read-only audit + design. It **did not modify** any of:

- `src/lib/scheduler/score.ts`
- `src/lib/scheduler/solver.ts`
- `src/lib/scheduler/types.ts`
- `src/lib/scheduler/capacity.ts`
- `src/lib/scheduler/capacity-diagnostics.ts`
- `src/lib/scheduler/data-loader.ts`
- `scripts/verify-score-regression-harness-k22-c.ts`
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `prisma/dev.db`
- `src/lib/admin-db/config.ts`
- `src/lib/admin-db/columns.ts`
- `src/lib/admin-db/api.ts`
- `src/lib/import/importer.ts`
- `scripts/parse_cell.py` / `scripts/parse_schedule.py`
- Scheduler config API / UI
- Frontend (any)
- API routes (any)
- Importer / parser (any)
- RBAC / permissions
- Seed scripts
- Business data (read-only DB inspection only)
- hardWeights / softWeights (not introduced)
- Any new constraint implementations
- Any harness logic
- HC4 (NOT weakened; SC10 skips at utilization > 1.0)

K22-F10 only **added** three files:

- `scripts/audit-capacity-preference-constraint-k22-f10.ts` (new)
- `docs/k22-capacity-preference-constraint-audit.md` (this file)
- `docs/k22-capacity-preference-constraint-audit.json` (new)

---

## 15. Closing Note

K22-F10-CAPACITY-PREFERENCE-AUDIT 按 spec 完整执行：

- ✅ 新增只读 audit + design 脚本 (`scripts/audit-capacity-preference-constraint-k22-f10.ts`)
- ✅ 新增 Markdown 审计文档 (本文件)
- ✅ 新增 JSON 报告 (`docs/k22-capacity-preference-constraint-audit.json`)
- ✅ 明确 Room.capacity: 53 rooms, range 3-200, median 40, 0 zero/negative (real data)
- ✅ 明确 TeachingTask student count: 100% REAL_STUDENT_COUNT (308/308); 100% ClassGroup with studentCount
- ✅ 明确 HC4: full + delta covered, 0 current violations, NOT weakened
- ✅ 比较 4 candidate strategies (A threshold / B utilization / C waste / D combined)
- ✅ 推荐 Candidate D as canonical SC10 design
- ✅ Canonical name: `SC10_ROOM_CAPACITY_UTILIZATION`
- ✅ Penalty: -1 (waste) / -2 (tight), within soft range, well below HC4
- ✅ Full + delta share `computeSC10Penalty` helper (F4/F6/F8 pattern)
- ✅ Delta is O(1) per move (per-slot, not aggregate)
- ✅ Interaction analysis: orthogonal to SC1-SC5/SC7/SC8, soft-tradeoff with SC9, soft-priority with SC6/HC6
- ✅ Harness J plan: 13 cases (8 full + 5 delta) with F6A-style isolation
- ✅ Implementation readiness: **READY** (all data available, helper exists, no schema change)
- ✅ Findings: HIGH=0 / MEDIUM=0 / LOW=0 / INFO=3 / NONE=2 / BLOCKING=NO
- ✅ 不修改任何业务代码 / 不写数据库 / 不改 score.ts / 不改 harness / 不改 schema / 不改 importer
- ✅ 不实现任何新约束

**本阶段 (K22-F10) 可关闭. 推荐进入 K22-F11-CAPACITY-PREFERENCE-IMPL (preferred) — 实施 SC10_ROOM_CAPACITY_UTILIZATION full + delta + Harness J 13 cases, K22-C summary 60 → 73 PASS.**
