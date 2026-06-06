# K22-F4 Teacher Day Balance Constraint Implementation

| Field | Value |
|---|---|
| Phase | K22-F4-TEACHER-DAY-BALANCE-IMPL |
| Type | Implementation (SC5 in score.ts + regression harness) |
| Generated | 2026-06-06 |
| Commit | `d6bf806 feat(scheduler): implement SC5 teacher day balance constraint` |
| Predecessor | K22-F3A (commit `f55c0a7`) |
| Verify script | `scripts/verify-teacher-day-balance-constraint-k22-f4.ts` |
| K22-C harness | `scripts/verify-score-regression-harness-k22-c.ts` (Harness G, 9 cases) |

---

## 1. Background

K22-F1A corrected the SC5 definition (TEACHING_DAYS=[1,2,3,4,5], min includes 0 days, total<3 skip). K22-F4 implements SC5 in `score.ts` with full + delta consistency.

---

## 2. SC5 Definition

### Constants

```ts
const TEACHING_DAYS = [1, 2, 3, 4, 5]
const SC5_PENALTY_PER_EXCESS = -3
const SC5_THRESHOLD = 2
const SC5_MIN_TOTAL = 3
```

### Formula

For each teacher (by `teacherId`):
1. Initialize `dailyCounts` for all 5 teaching days = 0 (min includes 0-count days)
2. For each slot where `teacherId != null`, `roomId != 0`, `dayOfWeek in [1..5]`: increment `dailyCounts[dayOfWeek]`
3. `total = sum(dailyCounts)`
4. If `total < 3`: skip (no penalty)
5. `diff = max(dailyCounts) - min(dailyCounts)`
6. If `diff > 2`: penalty = `-3 * (diff - 2)`

### Skip Rules

- `teacherId == null` → skip
- `roomId == 0` (unscheduled) → skip
- `dayOfWeek` not in `[1, 2, 3, 4, 5]` (weekend) → skip (SC7 handles weekend)
- `total < 3` → skip

### Expected Examples

| Distribution | diff | Penalty |
|---|---|---|
| 4/0/0/0/0 | 4 | -6 |
| 3/1/0/0/0 | 3 | -3 |
| 2/2/0/0/0 | 2 | 0 |
| 1/1/0/0/0 (total=2) | — | 0 (skip) |
| 1/1/1/0/0 | 1 | 0 |
| 2/1/0/0/0 | 2 | 0 |

---

## 3. Implementation

### 3.1 Full Score

- Aggregation loop: iterate `positions`, group by `teacherId` into `teacherDayCounts` map
- Per teacher: call `computeTeacherDayBalancePenalty(dayMap)` → if non-zero, add to `softScore` and emit `SC5_TEACHER_DAY_BALANCE` detail
- `buildTeacherDailyCounts(teacherId, slots, state, excludeSlotId?)` — shared helper, initializes all TEACHING_DAYS to 0

### 3.2 Delta Score

- Affected teacher: `task.teacherId` of the moved slot
- Build `beforeCounts` = teacher's daily counts with slot at old position
- Build `afterCounts` = teacher's daily counts with slot at new position
- `deltaSoft += penalty(afterCounts) - penalty(beforeCounts)`
- **Local computation**: only affected teacher, not all teachers
- `buildTeacherDailyCounts` with `excludeSlotId` parameter handles the exclusion

### 3.3 Shared Helpers

| Helper | Purpose | Pure? |
|---|---|---|
| `buildTeacherDailyCounts(tid, slots, state, excludeId?)` | Build dailyCounts for a teacher | Yes |
| `computeTeacherDayBalancePenalty(counts)` | Compute SC5 penalty from counts | Yes |

Both are used by full and delta score, ensuring consistency.

### 3.4 Hard/Soft Separation

- SC5 only affects `softScore` / `deltaSoft`
- Never touches `hardScore` / `deltaHard`
- HC1-HC6, SC1-SC4, SC6, SC7, MIN_PERT are unchanged

---

## 4. MIN_PERT Isolation

F4 delta test cases use the 3rd-position `originalAssignments` trick (day=9, room=999) so that MIN_PERT fires at both old and new positions, netting zero. This isolates the SC5 delta contribution.

---

## 5. K22-C Harness G (9 cases)

| Case ID | Days | Expected | Description |
|---|---|---|---|
| G1-4_0_0_0_0 | [1,1,1,1] | soft=-6 | diff=4>2, -3*(4-2)=-6 |
| G2-3_1_0_0_0 | [1,1,1,2] | soft=-3 | diff=3>2, -3*(3-2)=-3 |
| G3-2_2_0_0_0 | [1,1,2,2] | soft=0 | diff=2=threshold |
| G4-TOTAL_LT_3 | [1,2] | soft=0 | total=2<3, skip |
| G5-1_1_1_0_0 | [1,2,3] | soft=0 | diff=1<=2 |
| G6-2_1_0_0_0 | [1,1,2] | soft=0 | diff=2=threshold |
| G7-DELTA-IMPROVE | [1,1,1,5] | deltaSoft=+3 | [3,0,0,0,1]→[2,1,0,0,1] |
| G8-DELTA-WORSEN | [1,1,5] | deltaSoft=-3 | [2,0,0,0,1]→[3,0,0,0,0] |
| G9-DELTA-SKIP | [1,5] | deltaSoft=0 | total=2<3, skip |

---

## 6. F4 Wrapper (13 cases)

8 full score cases + 5 delta cases. All use isolated fixtures (different tasks with same teacherId=10, unique slotIndex per day to avoid HC2).

---

## 7. Default Snapshot

`docs/k22-score-default-snapshot.json` **unchanged**:
- hardScore=0, softScore=-11 (SC2=1, SC3=1)
- Default fixture teachers all have `total < 3` → SC5 does not trigger
- No new constraint breakdown entries

---

## 8. Verification Results

| Command | Result |
|---|---|
| F4 wrapper | 13/13 PASS |
| K22-C | 37/0/0/0 PASS |
| F3 wrapper | 16/16 PASS |
| K22-A audit | HIGH=0, BLOCKING=NO |
| K21 config verifies | all PASS |
| mutation audit | HIGH=0/MEDIUM=0 |
| prisma validate | valid |
| build | PASS |
| lint | 314 (180 errors + 134 warnings), 0 new |
| test:auth-foundation | 53 passed / 1 failed (pre-existing) |

---

## 9. Unmodified Scope

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
- ✅ Other soft constraints (班级空洞减少, 教室稳定性, 实训课匹配, 大班优先, 教师半天集中): not implemented
