# K26-J4: WorkTime Score SC3/SC7 Alignment

## 1. Executive Summary

本阶段 `K26-J4-WORKTIME-SCORE-SC3-SC7-ALIGNMENT` 让 `score.ts` 的 SC3 和 SC7 使用 WorkTimeForScore 派生 contract，full score / delta score 保持一致。

主要变更：

* `WorkTimeForScore` contract 新增字段：`lateSlotIndexes`, `earlySlotIndexes`, `weekendDayOfWeeks`, `weekdayDayOfWeeks`。
* `toScoreWorkTimeContract(solverContract)` 从 `SolverWorkTimeContract` 派生 score 用的 contract。
* `createLegacyStaticScoreWorkTimeContract()` 提供 backward compat（`lateSlotIndexes=[5]`, `weekendDayOfWeeks=[6,7]`，与 pre-J4 硬编码完全一致）。
* `score.ts` 的 `calculateScoreWithDetails` / `calculateDeltaScore` / `calculateInitialScore` 接受可选 `workTimeForScore?: WorkTimeForScore` 参数；不传入时 fallback 到 legacy static。
* SC3 full score：`lateSlotIndexes.includes(p.idx)` 替代 `p.idx >= 5`。
* SC3 delta score：与 full 同一 `lateSlotIndexes`。
* SC7 full score：`weekendDayOfWeeks.includes(p.day)` 替代 `p.day >= 6`。
* SC7 delta score：与 full 同一 `weekendDayOfWeeks`。
* `solver.ts` 从 `SolverWorkTimeContract` 派生 `WorkTimeForScore`，传给所有 score 调用。
* preview 不重新 resolve WorkTime（K26-J2 snapshot → J3 solver contract → J4 score contract，链路一致）。

**本阶段不改 SC5 / HC 行为**。K22-C `73/0/0/0` 保持。

推荐下一阶段：`K26-J5-WORKTIME-SOLVER-REAL-SCHEDULING-TRIAL`。

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Local HEAD before | `a62c36a` (K26-J3) |
| Local HEAD after | `<J4 commit>` |
| Remote HEAD after | `<J4 commit>` |
| Push | yes |
| Force push | **no** |

## 3. WorkTimeForScore Contract

### 3.1 Fields

```ts
export interface WorkTimeForScore {
  source: 'database' | 'staticFallback' | 'snapshot' | 'legacyStatic'
  snapshotVersion?: 1
  semesterId?: number
  workTimeConfigId?: number | null
  allowWeekend: boolean
  activeTeachingSlotIndexes: number[]
  legacyDisplaySlotIndexes: number[]
  earlySlotIndexes: number[]
  lateSlotIndexes: number[]
  weekendDayOfWeeks: number[]
  weekdayDayOfWeeks: number[]
}
```

### 3.2 lateSlotIndexes strategy

* 当前 WorkTime schema **没有** explicit late/early category 字段。
* `toScoreWorkTimeContract` 默认派生：`activeTeachingSlotIndexes.filter(s => s >= 5)`。
* Legacy static fallback：`lateSlotIndexes = [5]`（与 pre-J4 `slotIndex >= 5` 等价）。
* Fixture D（LATE_SLOT_REDEFINED）的 `lateSlotIndexes=[4,5]` 由 verify 脚本直接传入 synthetic contract 验证，无需 production snapshot 自动推导。
* **未来策略**：若 WorkTime schema 增加 late/early category，只需改 `toScoreWorkTimeContract` mapper，score.ts 不变。

### 3.3 weekendDayOfWeeks strategy

* 从 `SolverWorkTimeContract.weekendDayOfWeeks` 直接复制。
* Legacy static fallback：`weekendDayOfWeeks = [6, 7]`（与 pre-J4 `day >= 6` 等价）。
* `allowWeekend=true` 不自动取消 SC7 penalty（业务决策不在本阶段范围）。
* 周末 penalty 仍 `-15`，仅 weekend day definition 改由 contract 决定。

### 3.4 Legacy fallback strategy

* `createLegacyStaticScoreWorkTimeContract()` 返回 hardcoded `lateSlotIndexes=[5]`, `weekendDayOfWeeks=[6,7]`，与 pre-J4 完全一致。
* 当 `workTimeForScore` 为 `undefined` 时，score.ts 自动 fallback。
* 任何 pre-J4 callsite（K22-C harness、低层测试）继续产生 identical 结果。

## 4. SC3 Alignment

### 4.1 Previous behavior

```ts
if (p.idx >= 5) {
  softScore += SOFT_SC3_EXTREME_TIME  // -1
}
```

### 4.2 New behavior

```ts
const lateSlotSet = new Set(wf.lateSlotIndexes)
if (lateSlotSet.has(p.idx)) {
  softScore += SOFT_SC3_EXTREME_TIME
}
```

### 4.3 Full score

* 默认 `lateSlotIndexes = [5]`，与 pre-J4 一致。
* Fixture D `lateSlotIndexes=[4,5]`：slot 4 和 slot 5 都触发 SC3。

### 4.4 Delta score

```ts
if (lateSlotSetDelta.has(old.slotIndex)) deltaSoft -= SOFT_SC3_EXTREME_TIME
if (lateSlotSetDelta.has(move.newSlotIndex)) deltaSoft += SOFT_SC3_EXTREME_TIME
```

* full / delta 使用同一 `lateSlotSetDelta`（从同一 `workTimeForScore` 派生）。
* 一致性：move 4→5，full score 增加一个 -1；deltaSoft 也增加 -1（不带 HC 干扰）。

### 4.5 Fallback compatibility

* 不传 `workTimeForScore` → 使用 `createLegacyStaticScoreWorkTimeContract()` → `lateSlotIndexes=[5]`。
* K22-C harness 不传 contract → 结果与 pre-J4 完全一致。

## 5. SC7 Alignment

### 5.1 Previous behavior

```ts
if (p.day >= 6) {
  softScore += SC7_WEEKEND_PENALTY  // -15
}
```

### 5.2 New behavior

```ts
const weekendDaySet = new Set(wf.weekendDayOfWeeks)
if (weekendDaySet.has(p.day)) {
  softScore += SC7_WEEKEND_PENALTY
}
```

### 5.3 Full score

* 默认 `weekendDayOfWeeks = [6, 7]`，与 pre-J4 一致。
* Fixture C `weekendDayOfWeeks=[6,7]`：`allowWeekend=true` 也不豁免 SC7。
* Synthetic `weekendDayOfWeeks=[5,6]`：day=5（周五）也算 weekend。

### 5.4 Delta score

```ts
if (weekendDaySetDelta.has(old.dayOfWeek)) deltaSoft -= SC7_WEEKEND_PENALTY
if (weekendDaySetDelta.has(move.newDay)) deltaSoft += SC7_WEEKEND_PENALTY
```

* full / delta 使用同一 `weekendDaySetDelta`。

### 5.5 allowWeekend relation

* `allowWeekend=true` **不**改变 SC7 行为。
* 业务决策（是否取消 SC7 penalty）留给后续 score weights stage。

### 5.6 Fallback compatibility

* 不传 `workTimeForScore` → `weekendDayOfWeeks=[6,7]`。
* K22-C baseline preserved。

## 6. Full / Delta Consistency

验证方法：

1. 构造 before state（slot 在 day=5, slotIdx=4）。
2. 构造 after state（slot 移到 day=5, slotIdx=5）。
3. 计算 full score before / after。
4. 计算 deltaSoft for the same move。
5. 断言：deltaSoft 包含 expected SC3 贡献（-1），full score 中 SC3 details 数量增加 1。

实际验证（Harness L check #18 / #27）：

* SC3: move 4→5 → SC3 details 从 1 → 2 → SC3 soft delta = -1
* SC7: move day 5→6 → SC7 details 从 1 → 2 → SC7 soft delta = -15
* deltaSoft 包含对应贡献且 ≤ 0

## 7. K22 Regression / Expected Policy

* K22-C score harness 必须保持 `73/0/0/0`。
* 不更新 `docs/k22-score-default-snapshot.json` / `docs/k22-score-regression-harness-implementation.json`。
* 任何 K22-C 运行产生的 `generatedAt` 漂移 → `git restore`，不提交。
* K22 expected 更新需**独立 commit + PR review**。

## 8. Non-Goals

- ❌ schema / migration / DB structure
- ❌ solver candidate generation 行为
- ❌ SC5 行为（仅文档说明，不改）
- ❌ HC 行为
- ❌ K22 expected
- ❌ recommendation / adjustment / room recommendation
- ❌ WorkTime Settings UI / WorkTime API
- ❌ reset / force-reset / seed

## 9. Verification Results

| Command | Result |
|---------|--------|
| `verify-worktime-score-sc3-sc7-alignment-k26-j4.ts` | **44+ PASS** |
| `verify-worktime-solver-candidate-generation-k26-j3.ts` | **53/53 PASS** |
| `verify-worktime-schedulingrun-snapshot-k26-j2.ts` | **52/52 PASS** |
| `plan-worktime-solver-score-harness-k26-j1.ts` | **56/56 PASS** |
| `audit-worktime-solver-score-integration-k26-j.ts` | **48/48 PASS** |
| K26-I closeout | **64/64 PASS** |
| K26-I4/I3/I2/I1 | **49+40+45+36 PASS** |
| K26-I audit | **44/44 PASS** |
| K26-H closeout | **52/52 PASS** |
| K26-H2A | **15/15 PASS** |
| K26-H UI | **43/43 PASS** |
| K26-G API | **40/40 PASS** |
| K26-F1 | **30/30 PASS** |
| K26-F | **30/30 PASS** |
| K26-F backfill dry-run | **0 missing** |
| K26-E | **34/34 PASS** |
| K26-D | **39/39 PASS** |
| K26-C | **32/32 PASS** |
| K26-A | **47/47 PASS** |
| K26-B | **38/38 PASS** |
| K25 closeout | **38/38 PASS** |
| K25-C | **PASS** |
| K22-C score harness | **PASS** (73/0/0/0 preserved) |
| Prisma validate | **PASS** |
| migrate status | **up to date** (8 migrations) |
| build | **PASS** |
| lint | **184 errors / 146 warnings** (no new) |
| auth foundation | **53 passed / 1 failed** (pre-existing `ScheduleAdjustment ACTIVE count mismatch`) |
| `git status --short` | **clean** |
| local / remote | **up to date** |
