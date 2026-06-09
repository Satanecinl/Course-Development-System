# K26-J3: WorkTime Solver Candidate Generation

## 1. Executive Summary

本阶段 `K26-J3-WORKTIME-SOLVER-CANDIDATE-GENERATION` 让 solver candidate generation 使用 WorkTime snapshot 派生出的 allowed day / slot。

主要变更：

* `SolverWorkTimeContract` 新增 `candidateSlotIndexes` 字段（`activeTeachingSlotIndexes - legacyDisplaySlotIndexes`，过滤 legacy 6/7）。
* `toSolverWorkTimeContract(snapshot)` 从 snapshot 构建 contract，包含 sanitize / reject 逻辑。
* `createLegacyStaticSolverWorkTimeContract()` 提供测试用 fallback（days 1-5, slots 1-5）。
* `preview.ts` 在调用 solver 前构建 contract 并传入。
* `solver.ts` 接受可选 `workTime?: SolverWorkTimeContract`：
  * 有 contract：`candidateDays = allowedDayOfWeeks`，`candidateSlots = candidateSlotIndexes`
  * 无 contract（fallback）：`candidateDays = [1..7]`，`candidateSlots = [1..6]`（向后兼容）
* exhaustive search 使用 `for (day of candidateDays) × for (si of candidateSlots)`。
* random generation 使用 `pickRandom(rng, candidateDays)` / `pickRandom(rng, candidateSlots)`。
* slot 6/7 永远不能作为 candidate，即使 DB 误标为 active。
* `allowWeekend=false` → candidate days ⊆ [1..5]；`allowWeekend=true` → 含 [6,7]。

**本阶段不改 score.ts**。SC3 / SC5 / SC7 行为不变。K22 expected 不变。

推荐下一阶段：`K26-J4-WORKTIME-SCORE-SC3-SC7-ALIGNMENT`。

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Local HEAD before | `985528b` (K26-J2) |
| Local HEAD after | `<J3 commit>` |
| Remote HEAD after | `<J3 commit>` |
| Push | yes |
| Force push | **no** |

## 3. Solver WorkTime Contract

### 3.1 Fields

```ts
export interface SolverWorkTimeContract {
  semesterId: number
  source: WorkTimeSnapshotSource
  workTimeConfigId: number | null
  allowWeekend: boolean
  allowedDayOfWeeks: number[]        // [1..5] or [1..7] based on allowWeekend
  candidateSlotIndexes: number[]     // active \ legacy, max 5 slots
  activeTeachingSlotIndexes: number[]
  legacyDisplaySlotIndexes: number[]
  weekdayDayOfWeeks: number[]
  weekendDayOfWeeks: number[]
}
```

### 3.2 Sanitize / reject strategy

* `candidateSlotIndexes` = `activeTeachingSlotIndexes` minus `legacyDisplaySlotIndexes` minus `{6,7}` (hard guard).
* Sorted + deduplicated.
* Empty `candidateSlotIndexes` → throw `WORKTIME_CONTRACT_NO_CANDIDATE_SLOTS`.
* Empty `allowedDayOfWeeks` → throw `WORKTIME_CONTRACT_NO_ALLOWED_DAYS`.
* Slot 6/7 are **always** excluded even if DB marks them as active teaching.

### 3.3 Legacy slot policy

* Slot 6/7 are display-only legacy slots.
* `toSolverWorkTimeContract` always removes them from `candidateSlotIndexes`.
* Solver's `candidateSlots` array will never contain 6 or 7.

### 3.4 allowWeekend policy

* `allowWeekend=false` → `allowedDayOfWeeks = [1,2,3,4,5]` (from snapshot).
* `allowWeekend=true` → `allowedDayOfWeeks = [1,2,3,4,5,6,7]` (from snapshot).
* The contract does **not** override or re-compute these; it trusts the snapshot's `allowedDayOfWeeks` which was built by `buildWorkTimeSnapshot`.

## 4. Preview Integration

* preview.ts calls `toSolverWorkTimeContract(workTimeSnapshot)` after building the snapshot (K26-J2).
* The contract is passed as the 4th argument to `solve(ctx, config, undefined, solverWorkTimeContract)`.
* Preview does NOT re-resolve WorkTime; the snapshot is the single source of truth.
* If contract construction fails (e.g., no candidate slots), preview fails fast with a typed error.
* Result metadata remains additive (`workTimeSnapshot` field in `PreviewResult`).

## 5. Candidate Generation Changes

### 5.1 Exhaustive search

* Before: `for (let day = 1; day <= 7; ...) for (let si = 1; si <= 6; ...)`
* After: `for (const day of candidateDays) for (const si of candidateSlots)`
* `candidateDays` = `workTime.allowedDayOfWeeks` when contract present.
* `candidateSlots` = `workTime.candidateSlotIndexes` when contract present.
* No contract: `candidateDays = [1..7]`, `candidateSlots = [1..6]` (backward compat).

### 5.2 Random generation

* Before: `newDay = randInt(rng, 1, 7)`, `newSlotIndex = randInt(rng, 1, 6)`
* After: `newDay = pickRandom(rng, candidateDays)`, `newSlotIndex = pickRandom(rng, candidateSlots)`
* `pickRandom(rng, arr)` is deterministic given the same seed and array.

### 5.3 Deterministic randomSeed

* `createSeededRandom(usedSeed)` is unchanged.
* `pickRandom(rng, arr)` consumes exactly one `rng()` call per invocation, same as `randInt`.
* Same seed + same contract → identical candidate sequence → identical solver result.

### 5.4 All move generators coverage

* Both TIME_ONLY and TIME_AND_ROOM move types use `pickRandom(rng, candidateDays)`.
* Exhaustive search uses both `candidateDays` and `candidateSlots` (two locations: initial search + rooms.length > 1 retry).
* No other day/slot generation points exist in solver.ts.

## 6. Fixture Coverage

| Fixture | active | legacy | candidateDays | candidateSlots | Key assertion |
|---------|--------|--------|--------------|----------------|---------------|
| A STATIC_BASELINE | [1..5] | [6,7] | [1,2,3,4,5] | [1,2,3,4,5] | Default: weekday only, slots 1-5 |
| B SHORT_TEACHING_DAY | [1..4] | [5,6,7] | [1,2,3,4,5] | [1,2,3,4] | Slot 5 excluded from candidate |
| C WEEKEND_ENABLED | [1..5] | [6,7] | [1,2,3,4,5,6,7] | [1,2,3,4,5] | Days include 6/7; slots still 1-5 |
| E LEGACY_SLOT_MALFORMED | [1..6] | [6,7] | [1,2,3,4,5] | [1,2,3,4,5] | Slot 6 excluded despite active |

Fixture D (LATE_SLOT_REDEFINED) is reserved for K26-J4 score alignment.

## 7. Harness K

52 checks across 10 sections covering:

* Files/structure: contract exists, preview integration, solver reads contract.
* Fixtures A/B/C/E: contract construction correctness, slot exclusion, allowWeekend behavior, malformed legacy rejection.
* Exhaustive generation: no hardcoded ranges, uses candidateDays/candidateSlots.
* Random generation: uses pickRandom, no randInt(1,7)/randInt(1,6), deterministic seed, 1000-iteration legal bounds.
* Non-goals: score.ts / SC3/SC5/SC7 / K22 expected / schema / migration / recommendation / UI unchanged.
* Regression: J2/J1/J audit/K22-C scripts exist.

## 8. Non-Goals

本阶段**未改**：

- ❌ `src/lib/scheduler/score.ts`（无 `K26-J3` marker）。
- ❌ SC3 `slotIndex >= 5`（score.ts 中仍在）。
- ❌ SC5 `TEACHING_DAYS=[1..5]`（score.ts 中仍在）。
- ❌ SC7 `day >= 6`（score.ts 中仍在）。
- ❌ K22 expected（`k22-score-default-snapshot.json` / `k22-score-regression-harness-implementation.json` 未动）。
- ❌ `prisma/schema.prisma`（无 `K26-J3` marker）。
- ❌ `prisma/migrations/**`（无 `k26_j3` migration）。
- ❌ Recommendation behavior（`adjustment-plan-recommendations.ts` / `room-recommendations.ts` 无 `K26-J3`）。
- ❌ WorkTime Settings UI / WorkTime API semantics。
- ❌ adjustment dialog UI。
- ❌ reset / force-reset / seed。
- ❌ score full/delta WorkTime alignment（J4 scope）。
- ❌ SchedulingRun snapshot schema（J2 scope）。

## 9. Verification Results

| Command | Result |
|---------|--------|
| `verify-worktime-solver-candidate-generation-k26-j3.ts` | **52/52 PASS** |
| `verify-worktime-schedulingrun-snapshot-k26-j2.ts` | **52/52 PASS** |
| `plan-worktime-solver-score-harness-k26-j1.ts` | **56/56 PASS** |
| `audit-worktime-solver-score-integration-k26-j.ts` | **48/48 PASS** |
| K26-I closeout | **64/64 PASS** |
| K26-I4 / I3 / I2 / I1 | **49 + 40 + 45 + 36 PASS** |
| K26-I audit | **44/44 PASS** |
| K26-H closeout | **52/52 PASS** |
| K26-H2A | **15/15 PASS** |
| K26-H UI | **43/43 PASS** |
| K26-G API | **40/40 PASS** |
| K26-F1 | **30/30 PASS** |
| K26-F validation | **30/30 PASS** |
| K26-F backfill dry-run | **0 missing** |
| K26-E | **34/34 PASS** |
| K26-D | **39/39 PASS** |
| K26-C | **32/32 PASS** |
| K26-A | **47/47 PASS** |
| K26-B closeout | **38/38 PASS** |
| K25 closeout | **38/38 PASS** |
| K25-C | **PASS** |
| K22-C score harness | **PASS** (73/0/0/0) |
| Prisma validate | **PASS** |
| Prisma migrate status | **up to date** (8 migrations) |
| build | **PASS** |
| lint | **184 errors / 146 warnings** (no new) |
| auth foundation | **53 passed / 1 failed** (pre-existing) |
| `git status --short` | **clean** |
| local / remote | **up to date** |
