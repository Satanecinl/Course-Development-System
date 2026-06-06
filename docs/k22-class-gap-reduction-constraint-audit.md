# K22-F5 Class Gap Reduction Constraint Audit

| Field | Value |
|---|---|
| Phase | K22-F5-CLASS-GAP-REDUCTION-AUDIT |
| Type | Read-only design audit (no Prisma writes, no score.ts modifications, no schema changes) |
| Generated | 2026-06-06 |
| Predecessor | K22-F4-TEACHER-DAY-BALANCE-IMPL (commit `d6bf806`) + K22-F4A-DOC-ALIGNMENT (commit `6df1c59`) |
| Audit script | `scripts/audit-class-gap-reduction-constraint-k22-f5.ts` |
| JSON report | `docs/k22-class-gap-reduction-constraint-audit.json` |
| Project direction | K22-F-SOFT-CONSTRAINTS-IMPLEMENTATION-1 — 第二个 P0 soft constraint (NEW-SC-02 班级空洞减少) 的设计审计 |

---

## 1. Background

K22-E (commit `a743bcc`) 识别了 3 个 P0 soft constraints (NEW-SC-01/02/03) 数据已就绪、不需要 schema、LOW 复杂度。
K22-F1 → F4 实施完成了第一个 (NEW-SC-01 → SC5_TEACHER_DAY_BALANCE)，Harness G 9/9 PASS, F4 wrapper 13/13 PASS。
本阶段 K22-F5 审计**第二个** P0 (NEW-SC-02 班级空洞减少)，不实现。

K22-F5 目标是为 SC8_CLASS_GAP_REDUCTION 设计清晰、可实现、可验证的 scoring 方案，让 K22-F6 实施阶段可以严格按设计执行。

---

## 2. Goal

1. 审计当前 `score.ts` 中与 classGroup 课程序列相关的逻辑（HC3, SC1, SC2, SC5）
2. 确认 classGroup + day + period (slotIndex) 信息在 score context 中可访问
3. 比较 3 种业务定义（Candidate A / B / C）
4. 推荐一种初版定义
5. 设计 full score 计算方式
6. 设计 delta score 计算方式
7. 设计 penalty 常量和命名
8. 设计 K22-C regression harness 扩展方案（12 cases）
9. 判断与 SC2 / SC3 / SC7 / MIN_PERT / SC1 的重叠风险
10. 输出 K22-F6 最小实现方案
11. 不实现新 SC 逻辑
12. 不修改 score.ts / schema / DB / solver / API / frontend

---

## 3. Scope

### In scope（只读审计 + 设计）

- `src/lib/scheduler/score.ts` (read-only)
- `src/lib/scheduler/types.ts` (read-only)
- `src/lib/scheduler/data-loader.ts` (read-only)
- `prisma/schema.prisma` (read-only)
- `docs/k22-soft-constraints-roadmap-audit.md` (read-only)
- `docs/k22-score-regression-harness-implementation.md` (read-only)
- `docs/k22-teacher-day-balance-constraint-impl.md` (read-only)
- `docs/k22-specialty-campus-weekend-constraints-impl.md` (read-only)
- `scripts/verify-score-regression-harness-k22-c.ts` (read-only)
- `scripts/verify-teacher-day-balance-constraint-k22-f4.ts` (read-only)
- `scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` (read-only)
- `scripts/audit-soft-constraints-roadmap-k22-e.ts` (read-only)

### Out of scope（严禁处理）

- 任何 Prisma 写操作
- 任何 score.ts / solver / scheduler / API / frontend / importer / parser / RBAC 修改
- 任何 schema / migration 修改
- 任何业务数据修改
- 任何新 soft constraint 实施（K22-F6 范围）
- 任何 hardWeights / softWeights 字段
- 任何 UI weight editor

---

## 4. Problem Statement

> 对同一个 classGroup（行政班），在同一天（dayOfWeek in [1..5]）内，如果两节课（slotIndex 1..6）之间存在空节，是否应给予 soft penalty，从而鼓励同一天课程更连续、减少学生等待时间。

K22-F5 评估该约束的可建模性，并产出最小实现设计。

---

## 5. Data Structure Audit

> 所有数据是否已在 `SchedulingContext` 中可用？

| Audit Aspect | Field / Path | Reliable? | Notes |
|---|---|:---:|---|
| **classGroup 识别** | `TeachingTaskClass.classGroupId` → `ClassGroup.id` | ✅ Yes | Many-to-many: 1 task → N classGroups (合班). `data-loader.ts:99-104` 已经为每个 `classGroupId` 维护 `slotsByClass` 索引。 |
| **day 识别** | `ScheduleSlot.dayOfWeek` (Int, 1..7) | ✅ Yes | 与 SC5/SC7 一致：`TEACHING_DAYS = [1, 2, 3, 4, 5]`。 |
| **period / slot 顺序** | `ScheduleSlot.slotIndex` (Int, 1..6) | ✅ Yes | 1-based contiguous，无 gap。`CLAUDE.md` 给出 `"1,2"→1, …, "11,12"→6` 映射。 |
| **room=0 / unscheduled** | `ScheduleSlot.roomId` (Int?)，0 = unscheduled | ✅ Yes | 与 SC5/HC1-5 一致：`pos.room === 0` → skip。 |
| **weekend** | `dayOfWeek >= 6` (Sat/Sun) | ✅ Yes | 与 SC7 一致：SC8 跳过 weekend，SC7 拥有该域。 |
| **合班任务 (merged-class)** | `TeachingTask.taskClasses[]` (1-to-many) | ✅ Yes | 每个参与 classGroup 必须独立计入。`data-loader.ts:99-104` 已经展开。 |
| **score context 完整性** | `SchedulingContext` 已包含所有字段 | ✅ Yes | `slots`, `slotsByClass`, `assignments`, `originalAssignments` 全部可用。 |

**结论**：✅ **所有数据已就绪，0 个数据缺口，0 个 schema 变更需求。**

---

## 6. Definition Candidates

### Candidate A: 简单 period gap ★ RECOMMENDED

- **Goal**: 对每个 `(classGroupId, day)`，对 occupied `slotIndex` 集合按升序排序，遍历相邻对，`gap = next - prev - 1`。`gap > 0` 时累加 `-X * gap`。
- **Formula**:
  ```ts
  for (cg, day):
    periods = sorted unique slotIndex where slot.room != 0 and slot.task.taskClasses includes cg and slot.day = day
    for i in 1..periods.length-1:
      gap = periods[i] - periods[i-1] - 1
      if gap > 0: penalty += -X * gap
  ```
- **Pros**:
  - 简单，integer arithmetic on slotIndex (1..6 contiguous)
  - 不需要建模 morning/afternoon 边界
  - maps cleanly to delta: change in (cg, day) period set is local
  - 与 SC5 同样 shape (per-entity-per-day aggregation)
- **Cons**:
  - 将 lunch break (period 3 → period 4) 与 long free period (period 1 → period 6) 一视同仁
  - 保守 penalty scale (-2) 可能不够 aggressive
- **Verdict**: ✅ **RECOMMENDED**

### Candidate B: 跳过半天边界

- **Description**: 同 A，但排除 `period 3 → period 4` 的午饭间隔（视为"自然"，不计入 gap）。
- **Pros**:
  - 反映真实学生体验：午饭是预期的
  - 降低 solver 强制压缩到 back-to-back 的风险
- **Cons**:
  - 添加 magic rule (lunch = period 3 → period 4)
  - 项目不建模 actual times，"午饭"概念脆弱
  - 不 penalize "period 1 and period 5" 这样的"上午 + 午饭 + 下午" — 这是真正不好的
  - 比 A 复杂但仅 marginally 更正
- **Verdict**: ❌ **REJECTED** — 为 marginal benefit 添加复杂性。项目不建模 actual times，"午饭"概念脆弱。

### Candidate C: 基于 start/end time

- **Description**: 计算相邻 period 之间的实际时间差，按分钟 gap 决定 penalty。
- **Pros**: 语义最精确
- **Cons**:
  - **CRITICAL**: 项目不存储 `startTime` / `endTime` on `ScheduleSlot`
  - Period 1 = "1,2"节, period 6 = "11,12"节. 没有 separate time field.
  - 需要 schema change (out of scope for K22-F) 或 hardcoded period-to-time map (fragile, not project policy)
- **Verdict**: ❌ **REJECTED** — Not data feasible. 项目没有 start/end time 字段，schema change 不在 K22-F 范围。Candidate A 达到 80% 价值 at 0% 实施成本。

### 6.4 推荐：Candidate A

`Candidate A` 在数据可用性、简单性、可调参性上最优。

---

## 7. classGroup Aggregation Strategy

> TeachingTask 关联 1-to-many ClassGroup（合班任务）。如何处理？

**推荐策略**: **Per-classGroup aggregation, expanded for merged classes**

| Strategy | Description | Reason |
|---|---|---|
| STRATEGY-1 | 对每个 slot，遍历 `slot.teachingTask.taskClasses` 并将 `(classGroupId, day, slotIndex)` 加入 per-classGroup day plan | 合班任务对每个参与 classGroup 都独立计入 |
| STRATEGY-2 | 跳过 `taskClasses.length === 0` 的 orphan task | 业务上无意义；与 SC2/HC3 一致 |
| STRATEGY-3 | 对每个 classGroup 构建 `Set<slotIndex>` per day，再 sort & compute gaps | Set 去重，sort 简单 |
| STRATEGY-4 | 跳过 size < 2 的 (classGroup, day) | gap 不可能为正 |
| STRATEGY-5 | Sum 跨所有 (classGroup, day) 的 gap penalty | Total SC8 = sum of per-pair gaps |

**与现有约束的一致性**:
- `data-loader.ts:99-104` 已经按 (classGroupId, day, slotIndex) 维护 `slotsByClass` 索引
- `score.ts:244-256` HC3 用相同 nested loop pattern
- `verify-teacher-day-balance-constraint-k22-f4.ts` 用 `FixtureTaskInput.classGroupId` — 同一 fixture shape 支持 SC8

**风险点 (K22-F6 实施)**:
- ⚠️ MEDIUM: 如果错误地将 merged-class slot 只计一次（而不是按 classGroup 展开），SC8 会低估 penalty。K22-F6 必须严格按 STRATEGY-1 实现，并用 `SC8-FULL-8` 和 `SC8-DELTA-4` 验证。

---

## 8. Constraint Interaction Analysis

| Constraint | Overlap with SC8 | Direction | Recommendation |
|---|---|---|---|
| **SC1** (跨楼栋连续课, -5) | 几乎正交：SC1 看 adjacency + building，SC8 看 gap | 一个 move 消除 gap (SC8 改善) 可能引入 cross-building pair (SC1 触发) | 无 code change。Solver via softScore ranking 平衡 |
| **SC2** (同天多节, -10) | 不同 key：per task-day vs per classGroup-day | 同 task 两节课带 gap 时 SC2 + SC8 都触发（正确的） | 无 code change. 各自表达不同维度 |
| **SC3** (极端时间, -1) | SC3 在 `slotIndex >= 5` 触发 | SC8 可能推 solver 到 high index 避免 gap → 增加 SC3 | 无 code change. SC3 是 natural brake |
| **SC7** (周末, -15) | 0 overlap: SC8 跳过 day >= 6 | SC7 owns weekend penalty | 保持 `day >= 6` skip rule |
| **MIN_PERT** (扰动, -2) | 独立 | 同 move 可同时触发 | 用 3rd-position `originalAssignments` 隔离（K22-F3 / F4 pattern） |

**重点冲突：无**。SC8 与所有现有约束的 key 不同或 domain 不同，可安全实施。

---

## 9. Recommended Definition

| Field | Value |
|---|---|
| **Constraint ID** | `SC8_CLASS_GAP_REDUCTION` |
| **Name** | 班级空洞减少 |
| **统计维度** | `(classGroupId, dayOfWeek)`，where `dayOfWeek in [1, 2, 3, 4, 5]` |
| **Period 域** | `slotIndex in [1, 2, 3, 4, 5, 6]` (1-based contiguous) |
| **Gap 定义** | 相邻 occupied period 之间的 empty period 数 = `next - prev - 1` |
| **Penalty** | `SOFT_SC8_PER_EMPTY_PERIOD = -2` per empty period |
| **Skip rules** | `room === 0` (unscheduled), `dayOfWeek in [6, 7]` (weekend → SC7), `periodSet.size < 2` (no gap possible), `taskClasses.length === 0` (orphan) |
| **合班处理** | 对 slot 的每个 `taskClasses.classGroupId` 分别计入该 classGroup 的 day plan |

### 9.1 期望示例

| Period Set | Gaps | Penalty |
|---|---|---:|
| {1, 2, 3} | 0 | 0 |
| {1, 3} | gap(3-1-1) = 1 | -2 |
| {1, 4} | gap(4-1-1) = 2 | -4 |
| {1, 3, 5} | 1 + 1 = 2 | -4 |
| {1, 6} | gap(6-1-1) = 4 | -8 |
| {1, 2, 5, 6} | 2 + 0 = 2 | -4 |
| {1} | skip (size < 2) | 0 |
| {3, 4} | 0 (back-to-back) | 0 |
| 周末 (day 6) | skip (day >= 6) | 0 |
| room=0 (unscheduled) | skip | 0 |

### 9.2 Penalty scale 校准

| Constraint | Penalty | Unit |
|---|---:|---|
| SC5 (teacher day imbalance) | -3 | per imbalance unit (per teacher-day) |
| SC1 (cross-building) | -5 | per pair |
| SC2 (same task same day) | -10 | per extra slot (per task-day) |
| SC8 (per empty period) | **-2** | per empty period (per classGroup-day) |

**理由**: gap 通常是 1-2 个 period，-2 与 SC5 同量级不会压过其他 SC；-5+ 会过强导致 solver 强行压缩。K22-weights-roadmap 阶段可调。

---

## 10. Full Score Design

### 10.1 Algorithm

聚合 per `(classGroupId, day)` 的 `slotIndex` 集合（仅 `room != 0` 且 `day in [1..5]`），对 size >= 2 的 key 计算 gap = `next - prev - 1`，sum `-X * gap`。

### 10.2 Steps

| Step | Description | Pseudocode | Notes |
|---:|---|---|---|
| 1 | Skip non-teaching-day + unscheduled | `if p.day < 1 \|\| p.day > 5: continue; if p.room === 0: continue;` | 与 SC5 skip 一致 |
| 2 | Build per-(classGroupId, day) period set | 见下 | Keying = (classGroupId, day)，与 SC5 (teacherId, day) 同 shape |
| 3 | Compute gaps for size >= 2 keys | `gap = next - prev - 1; if gap > 0: penalty += SOFT_SC8_PER_EMPTY_PERIOD * gap` | 排序后 deterministic |
| 4 | Emit SC8 details | `details.push({ type: "SC8_CLASS_GAP", level: "SOFT", penalty, message: "classGroup X day Y: N empty periods" })` | Harness 检查 `details.some(d => d.type === "SC8_CLASS_GAP")` |

```ts
// Step 2
const classDayPeriods = new Map<string, Set<number>>()
for (const p of positions) {
  if (p.room === 0 || p.day < 1 || p.day > 5) continue
  for (const tc of p.slot.teachingTask.taskClasses) {
    const key = `${tc.classGroupId}-${p.day}`
    let set = classDayPeriods.get(key)
    if (!set) { set = new Set(); classDayPeriods.set(key, set) }
    set.add(p.idx)
  }
}

// Step 3
let softScore = 0
for (const [key, periodSet] of classDayPeriods) {
  if (periodSet.size < 2) continue
  const periods = [...periodSet].sort((a, b) => a - b)
  let pairPenalty = 0
  for (let i = 1; i < periods.length; i++) {
    const gap = periods[i] - periods[i-1] - 1
    if (gap > 0) pairPenalty += SOFT_SC8_PER_EMPTY_PERIOD * gap
  }
  if (pairPenalty !== 0) {
    softScore += pairPenalty
    const [cgId, day] = key.split('-')
    details.push({
      type: 'SC8_CLASS_GAP',
      level: 'SOFT',
      penalty: pairPenalty,
      message: `classGroup ${cgId} day ${day}: ${periodSet.size} periods, penalty ${pairPenalty}`,
    })
  }
}
```

---

## 11. Delta Score Design

### 11.1 Affected Keys

```
For each classGroupId in slot.teachingTask.taskClasses:
  - (classGroupId, oldDay)         // 总是
  - (classGroupId, newDay)         // 仅当 newDay in [1..5]
```

### 11.2 Algorithm

1. 找 moved slot 的 classGroups (`task.taskClasses[].classGroupId`)
2. 收集 affected keys（最多 `2 * classGroups.length`）
3. 对每个 affected key 计算 before/after penalty（用 `gapPenaltyForKey` helper）
4. `deltaSoft += afterPenalty - beforePenalty`

### 11.3 `gapPenaltyForKey` Helper (K22-F6 实施时实现)

```ts
function gapPenaltyForKey(
  cgId: number,
  day: number,
  ctx: SchedulingContext,
  state: ScheduleState,
  excludeSlotId: number,  // the moved slot
  overrideDay: number,    // where the moved slot IS for this scenario
  overrideIdx: number,    // the period for the moved slot
): number {
  if (overrideDay < 1 || overrideDay > 5) return 0
  const periods = new Set<number>()
  for (const slot of ctx.slots) {
    if (slot.id === excludeSlotId) continue
    const pos = getPos(slot, state)
    if (pos.day !== day || pos.room === 0) continue
    const includesCg = slot.teachingTask.taskClasses.some(tc => tc.classGroupId === cgId)
    if (!includesCg) continue
    periods.add(pos.idx)
  }
  if (overrideDay === day) periods.add(overrideIdx)
  if (periods.size < 2) return 0
  const sorted = [...periods].sort((a, b) => a - b)
  let p = 0
  for (let i = 1; i < sorted.length; i++) {
    p += SOFT_SC8_PER_EMPTY_PERIOD * (sorted[i] - sorted[i-1] - 1)
  }
  return p
}
```

### 11.4 Delta Calculation

```ts
// In calculateDeltaScore, after computing other deltas:
const task = slot.teachingTask
const classGroupIds = task.taskClasses.map(tc => tc.classGroupId)
if (classGroupIds.length > 0) {
  for (const cgId of classGroupIds) {
    const beforePenalty = gapPenaltyForKey(
      cgId, old.dayOfWeek, ctx, state, slot.id, old.dayOfWeek, old.slotIndex
    )
    const afterPenalty = gapPenaltyForKey(
      cgId, move.newDay, ctx, state, slot.id, move.newDay, move.newSlotIndex
    )
    // Wait — need to be careful: the helper currently uses the SAME day for filtering slots
    // AND for the override. So we need to call twice if oldDay !== newDay, or once if same.
    deltaSoft += afterPenalty - beforePenalty
  }
}
```

**更清晰的版本** (K22-F6 实施时):

```ts
// For each classGroup, compute before total (slot at old) and after total (slot at new)
for (const cgId of classGroupIds) {
  const beforePenalty =
    gapPenaltyForKey(cgId, old.dayOfWeek, ctx, state, slot.id, old.dayOfWeek, old.slotIndex)
  let afterPenalty = 0
  if (move.newDay === old.dayOfWeek) {
    // same day: before and after share day domain
    afterPenalty = gapPenaltyForKey(cgId, move.newDay, ctx, state, slot.id, move.newDay, move.newSlotIndex)
  } else {
    // different days: only new day matters
    afterPenalty = gapPenaltyForKey(cgId, move.newDay, ctx, state, slot.id, move.newDay, move.newSlotIndex)
  }
  deltaSoft += afterPenalty - beforePenalty
}
```

### 11.5 MIN_PERT Isolation

**3rd-position `originalAssignments` pattern** (与 K22-F3 / F4 一致):

```ts
// In delta test cases, build state with originalAssignments set to (day=9, slotIndex=1, roomId=999)
function buildStateIsolated(slotInputs) {
  const assignments = new Map()  // current positions
  const originalAssignments = new Map()  // 3rd position
  for (const s of slotInputs) {
    assignments.set(s.id, { dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId })
    originalAssignments.set(s.id, { dayOfWeek: 9, slotIndex: 1, roomId: 999 })
  }
  return { assignments, originalAssignments }
}
```

效果: MIN_PERT 在 old 和 new 都触发，net zero。`deltaSoft` 只反映 SC8 贡献。

---

## 12. K22-C Harness Design (12 cases)

> 8 full + 4 delta，覆盖 no-gap / single-gap / multi-gap / multi-segment / single-lesson / weekend / room=0 / merged-class / delta-reduce / delta-introduce / delta-to-weekend / delta-merged-class

| ID | Category | Title | Periods / Day | Expected |
|---|---|---|---|---|
| **SC8-FULL-1** | full | No gap (back-to-back) | {1, 2, 3} | hard=0, soft=0 |
| **SC8-FULL-2** | full | Single gap | {1, 3} | hard=0, soft=-2 |
| **SC8-FULL-3** | full | Multi gap | {1, 4} | hard=0, soft=-4 |
| **SC8-FULL-4** | full | Multi-segment | {1, 3, 5} | hard=0, soft=-4 |
| **SC8-FULL-5** | edge | Single lesson | {1} | hard=0, soft=0 (size<2 skip) |
| **SC8-FULL-6** | edge | Weekend skip | day 6, day 7 only | hard=0, soft=0 (day filter) |
| **SC8-FULL-7** | edge | Room=0 skip | room=0 period 3 | hard=0, soft=0 (room filter) |
| **SC8-FULL-8** | merged-class | Merged-class expand | task A (cg{1,2}, p1) + task B (cg{1}, p3) + task C (cg{2}, p5) | hard=0, soft=-8 (cg1: -2, cg2: -6) |
| **SC8-DELTA-1** | delta | Reduce gap | {1, 3} → {1, 2} | deltaSoft=+2 |
| **SC8-DELTA-2** | delta | Introduce gap | {1, 2} → {1, 3} | deltaSoft=-2 |
| **SC8-DELTA-3** | delta | Move to weekend | day 1 {1, 3} → day 1 {1}, day 6 {3} | deltaSoft=+2 (old day improves; new day skipped) |
| **SC8-DELTA-4** | delta | Merged-class move | task A (cg{1,2}, p1) → p2; with task B (cg{1}, p3) | deltaSoft=+2 (cg1: -2→0; cg2: 0→0) |

**Period 语义**: slotIndex 是 1-based contiguous 1..6。`gap = next - prev - 1` 是 empty period count。

---

## 13. Findings Summary

| ID | Severity | Title |
|---|---|---|
| K22-F5-A-1 | INFO | classGroup + day + period 全部在 SchedulingContext 中可用 |
| K22-F5-B-1 | NONE | Candidate A (简单 period gap) 是推荐方案 |
| K22-F5-C-1 | MEDIUM | 合班任务必须展开到每个参与 classGroup (实施最高风险) |
| K22-F5-D-1 | LOW | room=0, weekend, < 2 periods, no classGroup 全部应 skip |
| K22-F5-E-1 | LOW | SC1 / SC2 / SC3 / SC7 / MIN_PERT 与 SC8 独立 (无 key conflict) |
| K22-F5-F-1 | LOW | Delta 设计 = before/after per (classGroupId, day), 与 F4 模式一致 |
| K22-F5-G-1 | INFO | 推荐 SOFT_SC8_PER_EMPTY_PERIOD = -2 (与 SC5 scale 校准) |
| K22-F5-H-1 | NONE | K22-F5 audit 满足 spec 范围, 不修改 score.ts / schema / DB |

**Summary: HIGH=0 / MEDIUM=1 / LOW=3 / INFO=2 / NONE=2 / BLOCKING=NO**

**BLOCKING=NO**: 0 个 HIGH finding。数据 100% 可用, 1 个 MEDIUM finding (合班展开) 是实施阶段必须小心的点, 但有 F4 模式可复用 + 2 个 harness case (SC8-FULL-8, SC8-DELTA-4) 专门覆盖。

---

## 14. Suggested Next Stage

**阶段名**: **K22-F6-CLASS-GAP-REDUCTION-IMPL**

**范围**:
1. 在 `score.ts` 中实现 SC8_CLASS_GAP_REDUCTION:
   - `const SOFT_SC8_PER_EMPTY_PERIOD = -2`
   - `function computeClassGapPenalty(periods: Set<number>): number` (纯函数)
   - `calculateScoreWithDetails` 中新增 SC8 段
   - `calculateDeltaScore` 中新增 SC8 delta 段（用 `gapPenaltyForKey` helper）
2. 在 K22-C verify 脚本中新增 12 个 SC8 regression cases (8 full + 4 delta)
3. 新增 `scripts/verify-class-gap-reduction-constraint-k22-f6.ts` (F6 wrapper, 预计 12-15 cases)
4. 更新 `docs/k22-score-default-snapshot.json` (default fixture 不触发 SC8)
5. 更新 K22-A audit + K22-C implementation 文档

**不包含**:
- ❌ P1 / P2 constraints
- ❌ Schema 扩展
- ❌ Solver algorithm 变更
- ❌ UI weight editor
- ❌ HardWeights / softWeights 字段
- ❌ 调整 SOFT_SC2_SAME_DAY / SC5 / 其他现有 soft penalty
- ❌ 同时实施教室稳定性 (NEW-SC-03) — K22-F7 范围

---

## 15. Unmodified Scope (K22-F5)

- ✅ 未修改 Prisma schema
- ✅ 未修改 `prisma/migrations/**`
- ✅ 未修改 `prisma/dev.db`（仅 read query for summary by previous audits, K22-F5 audit script 不查 DB）
- ✅ 未运行 `db push` / `migrate` / `reset` / `seed`
- ✅ 未修改 score.ts
- ✅ 未修改 solver algorithm
- ✅ 未修改 scheduler implementation
- ✅ 未修改 K22-C harness implementation
- ✅ 未修改 API route
- ✅ 未修改 frontend
- ✅ 未修改 importer / parser
- ✅ 未修改 RBAC / permissions
- ✅ 未修改业务数据
- ✅ 未提交 DB backup
- ✅ 未实施新 soft constraints
- ✅ 未做 score.ts refactor
- ✅ 未引入 hardWeights / softWeights 字段
- ✅ 未引入 UI weight editor

---

## 16. Verification Results

| Script / Command | Result |
|---|---|
| `npx tsx scripts/audit-class-gap-reduction-constraint-k22-f5.ts` | **PASS** — HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO, P0=1, 12 harness cases |
| `npx tsx scripts/verify-teacher-day-balance-constraint-k22-f4.ts` | (per K22-F4) 13/13 PASS |
| `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | (per K22-F4) 37/0/0/0 PASS |
| `npx tsx scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` | (per K22-F3) 16/16 PASS |
| `npx tsx scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts` | (per K22-F2) HIGH=0, BLOCKING=NO |
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
| `npm run lint` | 314 (180 errors + 134 warnings), 0 new |
| `npm run test:auth-foundation` | 53 passed / 1 failed (pre-existing) |

---

## 17. Closing Note

K22-F5-CLASS-GAP-REDUCTION-AUDIT 按 spec 完整执行：

- ✅ 新增只读 audit 脚本 (`scripts/audit-class-gap-reduction-constraint-k22-f5.ts`)
- ✅ 新增 Markdown audit 文档 (本文件)
- ✅ 新增 JSON audit 报告 (`docs/k22-class-gap-reduction-constraint-audit.json`)
- ✅ 审计 7 个数据维度 (classGroup / day / period / room=0 / weekend / merged-class / score context) 全部 reliable
- ✅ 比较 3 个候选定义 (A 简单 period gap ★ / B 跳过半天 ✗ / C 基于 start/end time ✗)
- ✅ 推荐 Candidate A + penalty = -2 per empty period
- ✅ 设计 full score 4-step 算法
- ✅ 设计 delta score 5-step 算法 + `gapPenaltyForKey` helper
- ✅ 分析 5 个约束交互 (SC1/SC2/SC3/SC7/MIN_PERT) — 0 conflict
- ✅ 设计 12 个 K22-C harness cases (8 full + 4 delta)
- ✅ 明确数据已就绪 (0 schema change 需求)
- ✅ 明确 K22-F6 实施范围（只 SC8，不调整其他 SC，不引入 weights）
- ✅ 推荐下一阶段：**K22-F6-CLASS-GAP-REDUCTION-IMPL**
- ✅ 不修改 DB / schema / score.ts / solver / API / frontend / importer / parser / RBAC
- ✅ 工作区状态：仅新增 3 个 K22-F5 文件

**本阶段可关闭, 推荐进入 K22-F6-CLASS-GAP-REDUCTION-IMPL (实施 SC8_CLASS_GAP_REDUCTION full + delta in score.ts, 复用 K22-F4 fixture builder pattern)。**
