# K22-F6 Class Gap Reduction Constraint Implementation

| Field | Value |
|---|---|
| Phase | K22-F6-CLASS-GAP-REDUCTION-IMPL + K22-F6A-HARNESS-ISOLATION |
| Type | Implementation (SC8 in score.ts) + isolated regression harness (F6A) |
| Generated | 2026-06-06 |
| Predecessor | K22-F5-CLASS-GAP-REDUCTION-AUDIT (commit `82acea9`) |
| Implementation commit | `17bfea0 feat(scheduler): implement SC8 class gap reduction constraint` |
| Verify wrapper | `scripts/verify-class-gap-reduction-constraint-k22-f6.ts` (12 cases, all isolated) |
| K22-C harness | `scripts/verify-score-regression-harness-k22-c.ts` (Harness H, 12 cases, all isolated) |
| K22-C summary | 49 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO (was 37 / 0 / 0 / 0 before F6) |

---

## 0. F6A Harness Isolation Notes

K22-F6A (this update) corrected F6 harness isolation issues. The original F6 cases mixed SC2/SC3/SC5/SC7 contributions into aggregate `expectedSoft` values, which made SC8 regression detection less precise.

**Isolation strategy** (applied to both F6 wrapper and K22-C Harness H):
- **`teacherId=null` on all tasks** → SC5 skips (no teacher → skip)
- **1 slot per task (separate tasks per period)** → SC2 skips (no same-day multi per task)
- **Periods < 5 except where SC3 contribution is expected** → SC3 only fires on periods 5+ and is verified separately via component assertion
- **Weekday-only moves for delta cases** → SC7 only fires for day >= 6; isolated by avoiding weekend targets
- **3rd-position `originalAssignments = {dayOfWeek: 9, slotIndex: 1, roomId: 999}`** → MIN_PERT net 0 (K22-F3/F4 pattern)
- **Component-level assertion** for cases where SC3 or SC7 must fire (H4, H6, H8): each case asserts BOTH `total soft` AND `SC8_CLASS_GAP details count + sum`

**Corrected expected values** (H1-H8 + H9-H12): see updated tables in section 6 and 7 below.

---

## 1. Background

K22-F5 (commit `82acea9`) confirmed that `SC8_CLASS_GAP_REDUCTION` is feasible:
- `classGroupId` via `TeachingTask.taskClasses.classGroupId` is fully accessible
- `dayOfWeek` and `slotIndex` on `ScheduleSlot` are reliable
- `SchedulingContext.slotsByClass` is already populated
- Candidate A (simple period gap) is the recommended definition
- 0 schema changes required

K22-F6 implements SC8 in `score.ts` with full + delta consistency, mirroring the F3/F4 pattern.

---

## 2. SC8 Definition

### Constants

```ts
const SC8_CLASS_GAP_PENALTY_PER_EMPTY_PERIOD = -2
```

### Formula

For each `(classGroupId, dayOfWeek)` key, where `dayOfWeek in [1, 2, 3, 4, 5]`:
1. Build the set of `slotIndex` values from slots with `room != 0` and the classGroup is in the task's `taskClasses`
2. Sort the set ascending
3. If `set.size < 2`: skip (no gap possible)
4. For each adjacent pair `(prev, next)`: `gap = next - prev - 1`
5. If `gap > 0`: `penalty += -2 * gap`

### Skip Rules

- `room === 0` (unscheduled) → skip the slot
- `dayOfWeek in [6, 7]` (weekend) → skip the slot (SC7 owns)
- `taskClasses.length === 0` (orphan task) → skip the slot
- `periodSet.size < 2` (single period on that day for that classGroup) → skip the key

### Expected Examples

| Period Set | Gaps | Penalty |
|---|---|---:|
| {1, 2, 3} | 0 + 0 = 0 | 0 |
| {1, 3} | 1 | -2 |
| {1, 4} | 2 | -4 |
| {1, 3, 5} | 1 + 1 = 2 | -4 |
| {1} | (skip, size<2) | 0 |
| {1, 6} | 4 | -8 |
| {3, 4} | 0 (back-to-back) | 0 |

---

## 3. Implementation

### 3.1 Shared Helpers (in `src/lib/scheduler/score.ts`)

```ts
const SC8_CLASS_GAP_PENALTY_PER_EMPTY_PERIOD = -2

/**
 * Pure function: compute SC8 penalty from a Set<number> of periods.
 * Used by both full and delta paths.
 */
function computeClassGapPenalty(periods: Iterable<number>): number {
  const sorted = [...new Set(periods)].sort((a, b) => a - b)
  if (sorted.length < 2) return 0
  let penalty = 0
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1] - 1
    if (gap > 0) penalty += SC8_CLASS_GAP_PENALTY_PER_EMPTY_PERIOD * gap
  }
  return penalty
}

/**
 * Build the period set for one (classGroupId, day) key.
 * - Excludes `excludeSlotId` (the moved slot, for delta path)
 * - Skips room=0, weekend [6,7], and classGroups not in `slot.teachingTask.taskClasses`
 * - Adds `overrideIdx` to the set if `overrideDay === day` (delta path injects
 *   the moved slot at its old or new position)
 */
function buildClassDayPeriods(
  classGroupId: number,
  day: number,
  ctx: SchedulingContext,
  state: ScheduleState,
  excludeSlotId: number,
  overrideDay: number,
  overrideIdx: number,
): Set<number> {
  const periods = new Set<number>()
  for (const slot of ctx.slots) {
    if (slot.id === excludeSlotId) continue
    const pos = getPos(slot, state)
    if (pos.room === 0) continue
    if (pos.day !== day) continue
    if (pos.day < 1 || pos.day > 5) continue
    const includes = slot.teachingTask.taskClasses.some(
      (tc) => tc.classGroupId === classGroupId,
    )
    if (!includes) continue
    periods.add(pos.idx)
  }
  if (overrideDay === day && overrideDay >= 1 && overrideDay <= 5) {
    periods.add(overrideIdx)
  }
  return periods
}
```

### 3.2 Full Score

In `calculateScoreWithDetails`, after SC5 segment:

```ts
// ── SC8: 班级空洞减少 (K22-F6) ──
const classDayPeriods = new Map<string, Set<number>>()
for (const p of positions) {
  if (p.room === 0) continue
  if (p.day < 1 || p.day > 5) continue
  const taskClasses = p.slot.teachingTask.taskClasses ?? []
  if (taskClasses.length === 0) continue
  for (const tc of taskClasses) {
    const key = `${tc.classGroupId}-${p.day}`
    let set = classDayPeriods.get(key)
    if (!set) { set = new Set<number>(); classDayPeriods.set(key, set) }
    set.add(p.idx)
  }
}
for (const [key, periodSet] of classDayPeriods) {
  const penalty = computeClassGapPenalty(periodSet)
  if (penalty !== 0) {
    softScore += penalty
    const [cgIdStr, dayStr] = key.split('-')
    details.push({
      type: 'SC8_CLASS_GAP', level: 'SOFT', penalty,
      message: `classGroup ${cgIdStr} day ${dayStr}: ${periodSet.size} periods, penalty ${penalty}`,
    })
  }
}
```

### 3.3 Delta Score

In `calculateDeltaScore`, after SC5 delta block:

```ts
// SC8 delta: 班级空洞减少 (K22-F6)
// Affected keys: per classGroupId in moved task's taskClasses, 2 keys max:
//   - (cgId, oldDay) if oldDay in [1..5]
//   - (cgId, newDay) if newDay in [1..5]
// For each affected key: compute before (override at old position) and after (override at new position).
// Local computation: only ≤ 2 * taskClasses.length keys.
const classGroupIds = task.taskClasses.map((tc) => tc.classGroupId)
if (classGroupIds.length > 0) {
  const affectedKeys = new Set<string>()
  if (old.dayOfWeek >= 1 && old.dayOfWeek <= 5) {
    for (const cgId of classGroupIds) affectedKeys.add(`${cgId}-${old.dayOfWeek}`)
  }
  if (move.newDay >= 1 && move.newDay <= 5) {
    for (const cgId of classGroupIds) affectedKeys.add(`${cgId}-${move.newDay}`)
  }
  for (const key of affectedKeys) {
    const dashIdx = key.lastIndexOf('-')
    const cgId = Number(key.slice(0, dashIdx))
    const day = Number(key.slice(dashIdx + 1))
    const beforePeriods = buildClassDayPeriods(cgId, day, ctx, state, slot.id, old.dayOfWeek, old.slotIndex)
    const beforePenalty = computeClassGapPenalty(beforePeriods)
    const afterPeriods = buildClassDayPeriods(cgId, day, ctx, state, slot.id, move.newDay, move.newSlotIndex)
    const afterPenalty = computeClassGapPenalty(afterPeriods)
    deltaSoft += afterPenalty - beforePenalty
  }
}
```

### 3.4 Hard/Soft Separation

- SC8 only affects `softScore` / `deltaSoft`
- Never touches `hardScore` / `deltaHard`
- HC1-HC6, SC1-SC7, MIN_PERT unchanged

---

## 4. Delta Consistency

- **Affected classGroups**: `task.taskClasses[].classGroupId` (handles merged-class correctly)
- **Affected day keys**: dedup'd set of `(cgId, oldDay)` + `(cgId, newDay)` (≤ 2 × classGroups.length keys)
- **Before / after penalty**: `gapPenaltyForKey`-style override — exclude moved slot, inject override at old/new position
- **Local computation**: O(affectedKeys × ctx.slots) — does not re-evaluate all classGroup-day pairs
- **MIN_PERT isolation**: harness uses 3rd-position `originalAssignments = {day: 9, slotIndex: 1, roomId: 999}` (K22-F3/F4 pattern)
- **Full / delta consistency**: both paths use the same `computeClassGapPenalty` and `buildClassDayPeriods` helpers; delta is a strict subset of full-score recomputation

---

## 5. Constraint Interaction

| Constraint | Overlap with SC8 | Recommendation |
|---|---|---|
| SC1 (cross-building) | Almost orthogonal | No change |
| SC2 (same task same day) | Different key: per task-day vs per classGroup-day | No change |
| SC3 (extreme time) | SC3 is natural brake on high indices | No change |
| SC5 (teacher day balance) | Different aggregation (teacher vs classGroup) | No change |
| SC7 (weekend) | SC8 skips weekend | No change |
| MIN_PERT | Independent | Isolated via 3rd-position originalAssignments |

**No conflicts**. SC8 keys by `(classGroupId, day)` — distinct from all existing keys.

---

## 6. K22-C Harness H (12 cases, F6A isolated)

K22-F6A isolation: `teacherId=null` + 1 slot per task + weekday-only for delta + component assertion for cases that must trigger SC3/SC7.

| ID | Title | Total Soft | SC8 Sum | SC8 Count | Note |
|---|---|---:|---:|---:|---|
| H1-NO-GAP-1_2_3 | {1,2,3} no gap | 0 | 0 | 0 | 3 separate tasks, teacherId=null. SC8 only, others skip. |
| H2-SINGLE-GAP-1_3 | {1,3} single gap | -2 | -2 | 1 | SC8-only contribution. |
| H3-MULTI-GAP-1_4 | {1,4} multi gap | -4 | -4 | 1 | SC8-only contribution. |
| H4-MULTI-SEGMENT-1_3_5 | {1,3,5} multi segment | -5 | -4 | 1 | Component: SC3 -1 also fires. SC8 = -4. |
| H5-SINGLE-LESSON-SKIP | {1} single period | 0 | 0 | 0 | size<2 skip. |
| H6-WEEKEND-SKIP | day 6 | -15 | 0 | 0 | Component: SC7 -15 (1 weekend slot). SC8 absent. |
| H7-ROOM-ZERO-SKIP | 1 scheduled + 1 room=0 | 0 | 0 | 0 | room=0 skip. |
| H8-MULTI-CLASSGROUP-MERGED | merged A(cg{1,2},p1) + B(cg{1},p3) + C(cg{2},p5) | -9 | -8 | 2 | Component: SC3 -1 also fires. SC8 = -8 (cg1 -2, cg2 -6). |
| H9-DELTA-REDUCE-GAP | {1,3}→{1,2} | +2 | +2 | — | SC8-only delta. |
| H10-DELTA-INTRODUCE-GAP | {1,2}→{1,3} | -2 | -2 | — | SC8-only delta. |
| H11-DELTA-MOVE-CROSS-DAY-WEEKDAY | day 1 → day 2 | +2 | +2 | — | F6A variant: cross-day weekday to fully isolate (was move-to-weekend in F6). |
| H12-DELTA-MULTI-CLASSGROUP | merged A p1→p2 with B at p3 | +4 | +4 | — | SC8-only delta. |

**Coverage**:
- ✅ no gap → SC8 0
- ✅ single gap → SC8 -2
- ✅ multi gap → SC8 -4
- ✅ multi segment → SC8 -4 (component assertion)
- ✅ single lesson skip → SC8 absent
- ✅ weekend skip → SC8 absent (SC7 fires; component assertion)
- ✅ room=0 skip → SC8 absent
- ✅ multi-classGroup / 合班 expansion → 2 SC8 details, sum -8 (component assertion)
- ✅ delta reduce gap +2
- ✅ delta introduce gap -2
- ✅ delta cross-day weekday (F6A redesign) +2
- ✅ delta multi-classGroup +4

---

## 7. F6 Wrapper (12 cases, F6A isolated)

`scripts/verify-class-gap-reduction-constraint-k22-f6.ts` — same 12 cases as K22-C Harness H with F6A isolation. Each case asserts BOTH total soft score AND SC8 component contribution (count + sum). **12/12 PASS**.

| ID | Total | SC8 Sum | SC8 Count |
|---|---:|---:|---:|
| SC8-CLASS-GAP-NO-GAP-1_2_3 | 0 | 0 | 0 |
| SC8-CLASS-GAP-SINGLE-GAP-1_3 | -2 | -2 | 1 |
| SC8-CLASS-GAP-MULTI-GAP-1_4 | -4 | -4 | 1 |
| SC8-CLASS-GAP-MULTI-SEGMENT-1_3_5 | -5 | -4 | 1 |
| SC8-CLASS-GAP-SINGLE-LESSON-SKIP | 0 | 0 | 0 |
| SC8-CLASS-GAP-WEEKEND-SKIP | -15 | 0 | 0 |
| SC8-CLASS-GAP-ROOM_ZERO-SKIP | 0 | 0 | 0 |
| SC8-CLASS-GAP-MULTI-CLASSGROUP | -9 | -8 | 2 |
| SC8-DELTA-REDUCE-GAP-1_3-TO-1_2 | +2 | +2 | — |
| SC8-DELTA-INTRODUCE-GAP-1_2-TO-1_3 | -2 | -2 | — |
| SC8-DELTA-MOVE-CROSS-DAY-WEEKDAY | +2 | +2 | — |
| SC8-DELTA-MULTI-CLASSGROUP | +4 | +4 | — |

---

## 8. Default Snapshot

`docs/k22-score-default-snapshot.json` **unchanged**:
- `hardScore=0`, `softScore=-11`, breakdown `SC2_SAME_DAY=1, SC3_EXTREME_TIME_SLOT=1`
- Default fixture (3 rooms, 3 tasks, 4 slots) has no `(classGroup, day)` key with `set.size >= 2` and a gap
- All classGroup-day pairs: classGroup 1 has {1, 2} (no gap), classGroup 2 has {1} (size<2), classGroup 3 has {5} (size<2)
- SC8 doesn't fire on the default fixture

---

## 9. Verification Results

| Command | Result |
|---|---|
| `npx tsx scripts/verify-class-gap-reduction-constraint-k22-f6.ts` | **PASS — 12/12** |
| `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | **PASS — 49/0/0/0** (was 37/0/0/0) |
| `npx tsx scripts/audit-class-gap-reduction-constraint-k22-f5.ts` | (per F5) PASS — HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO |
| `npx tsx scripts/verify-teacher-day-balance-constraint-k22-f4.ts` | (per F4) 13/13 PASS |
| `npx tsx scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` | (per F3) 16/16 PASS |
| `npx tsx scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts` | (per F2) HIGH=0, BLOCKING=NO |
| `npx tsx scripts/audit-soft-constraints-roadmap-k22-e.ts` | (per K22-E) HIGH=0/MEDIUM=3/LOW=1/INFO=2/NONE=0, BLOCKING=NO |
| `npx tsx scripts/verify-score-delta-sc1-fix-k22-d.ts` | (per K22-D) PASS — 6/6 checks |
| `npx tsx scripts/audit-score-constraint-inventory-k22-a.ts` | (per K22-A) HIGH=0, BLOCKING=NO |
| `npx tsx scripts/plan-score-regression-harness-k22-b.ts` | (per K22-B) PASS |
| `npx tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | (per K21-FIX-G) 22/0 PASS |
| `npx tsx scripts/verify-solver-config-api-k21-fix-f.ts` | (per K21-FIX-F) 27/0 PASS |
| `npx tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | (per K21-FIX-F) 16/0 PASS |
| `npx tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | (per K21-FIX-F) 19/0 PASS |
| `npx tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH=0/MEDIUM=0 |
| `npx tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | BLOCKING=NO |
| `npx tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23/0 PASS |
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
- ✅ Other soft constraints (教室稳定性, 实训课匹配, 大班优先, 教师半天集中): not implemented
- ✅ SC1 / SC2 / SC3 / SC4 / SC5 / SC6 / SC7 / MIN_PERT: unchanged

---

## 11. Closing Note

K22-F6-CLASS-GAP-REDUCTION-IMPL + K22-F6A-HARNESS-ISOLATION 按 spec 完整执行：

**F6 (initial implementation, commit `17bfea0`)**:
- ✅ 修改 `src/lib/scheduler/score.ts`: 1 个新常量 + 2 个新 helper 函数 + 1 个 full-score 段 + 1 个 delta-score 段
- ✅ 新增 `scripts/verify-class-gap-reduction-constraint-k22-f6.ts`: 12 cases (8 full + 4 delta)
- ✅ 扩展 K22-C harness Harness H: 12 cases (8 full + 4 delta)
- ✅ K22-C summary: 37/0/0/0 → 49/0/0/0
- ✅ Default snapshot unchanged (SC8 doesn't fire on default fixture)
- ✅ 与 SC1/SC2/SC3/SC5/SC7/MIN_PERT 无冲突
- ✅ 0 schema 变更 / 0 solver 变更 / 0 API 变更 / 0 frontend 变更

**F6A (this update — harness isolation)**:
- ✅ 修正 F6 wrapper: 所有 12 cases 现断言 SC8-only contribution（通过 teacherId=null, 1 slot/task, weekday-only for delta, 3rd-position MIN_PERT 隔离）
- ✅ 修正 K22-C Harness H: 同上策略
- ✅ 添加 component-level assertion (extractSC8Contribution helper): H4/H6/H8 显式断言 SC8 count + sum
- ✅ H11 从 move-to-weekend (F6) 改为 cross-day weekday (F6A)，完全隔离 SC8 from SC2/SC7
- ✅ K22-C summary 保持 49/0/0/0 PASS
- ✅ F6 wrapper summary 保持 12/12 PASS
- ✅ score.ts 未改（isolation tests 未发现 SC8 实现 bug）
- ✅ Default snapshot 保持不变

**Recommended next stage**: **K22-F7-CLASSROOM-STABILITY-AUDIT**

**本阶段可关闭, 推荐进入 K22-F7-CLASSROOM-STABILITY-AUDIT (只读审计"同一班级/课程尽量使用稳定教室"建模方式)。**
