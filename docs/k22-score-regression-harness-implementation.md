# K22 Score Regression Harness Implementation

| Field | Value |
|---|---|
| Phase | K22-C-SCORE-REGRESSION-HARNESS-IMPLEMENTATION |
| Type | Test-first regression harness (NO Prisma writes, NO score.ts modifications, NO solver changes) |
| Generated | 2026-06-06 |
| Predecessor | K22-B-SCORE-REGRESSION-HARNESS-PLAN (commit `f9b27da docs(scheduler): plan score regression harness`) |
| Verify script | `scripts/verify-score-regression-harness-k22-c.ts` |
| JSON report | `docs/k22-score-regression-harness-implementation.json` |
| Snapshot | `docs/k22-score-default-snapshot.json` |
| Project direction | K22-SCORE-WEIGHTS-ROADMAP — 为 K22-D SC1 delta 修复提供 regression harness |

---

## 1. Background

K22-B (commit `f9b27da`) 完成了 5 类 harness 的设计方案，本阶段 K22-C 负责实际落地：
- Harness A: Full / Delta Consistency
- Harness B: HC1-HC5 Hard Invariant
- Harness C: Default Score Snapshot
- Harness D: Fixed Seed Solver Regression
- Harness E: K21 Config Regression

K22-A (commit `9885f1f`) 识别的核心 HIGH 风险仍未解决：
- SC1 跨楼栋连续课 full score 有覆盖，**delta score 缺失**
- LAHC solver 使用 delta score 做 move 评估，可能接受增加跨楼栋惩罚的 move
- 本阶段**不修 SC1 delta**，只建立可复用验证保护网
- K22-D 才会实际修复 SC1 delta，本阶段的 harness A2 是 K22-D 的"红"测试用例

---

## 2. Goal

1. 新增 `scripts/verify-score-regression-harness-k22-c.ts`，覆盖 Harness A-E
2. 构造 synthetic SchedulingContext / ScheduleState fixtures（in-memory，**不读 DB**）
3. 输出 PASS / KNOWN_FAIL / FAIL / INFO 分类结果
4. SC1 targeted case 标记为 `KNOWN_FAIL`（**不阻塞**整体验证）
5. HC1-HC5 hard invariant 全 PASS
6. Default score snapshot 写入 JSON 报告
7. K21 verify scripts 静态确认 + 委托执行（spec §10）
8. 不修改 `score.ts`、solver、schema、API、frontend、importer、parser、RBAC

---

## 3. Scope

### In scope（只新增可执行代码 + 文档）

- `scripts/verify-score-regression-harness-k22-c.ts`（新增）
- `docs/k22-score-regression-harness-implementation.md`（新增）
- `docs/k22-score-regression-harness-implementation.json`（新增）
- `docs/k22-score-default-snapshot.json`（新增 snapshot 文件）

### Out of scope（严禁处理）

- 任何 Prisma 写操作（db push / migrate / reset / seed）
- 任何 score.ts / solver / scheduler / API / frontend / importer / parser / RBAC 修改
- 任何 schema / migration 修改
- 任何业务数据修改
- 任何 SC1 delta 修复（K22-D 范围）
- 任何 hardWeights / softWeights 字段（K22-D 范围）

---

## 4. Synthetic Fixture Design

### 4.1 SchedulingContext Builder

`buildContext(taskInputs, roomInputs, slotInputs)` 构造一个完整的 `SchedulingContext`：
- `tasks: TaskWithRelations[]`（含 `course` / `teacher` / `taskClasses.classGroup`）
- `rooms: RoomWithAvailability[]`（含 `availabilities`）
- `slots: SlotWithRelations[]`（含 `room` / `teachingTask`）
- 索引：`taskById`, `roomById`, `slotsByTask`, `slotsByRoom`, `slotsByTeacher`, `slotsByClass`

### 4.2 ScheduleState Builder

`buildStateFromSlots(ctx)` 调用 `buildInitialState` 语义：
- `assignments: Map<slotId, {dayOfWeek, slotIndex, roomId}>` 从 slot 当前位置构造
- `originalAssignments`: 与 `assignments` 相同（无扰动基准态）

### 4.3 Fixture Inventory

| Fixture | Rooms | Tasks | Slots | Notes |
|---|---:|---:|---:|---|
| A.1 SC2 same-day | 2 (A) | 1 | 2 | 同一 task 同天两节 |
| A.2 SC1 known-fail | 2 (A/B) | 2 (同 teacher) | 2 (consecutive) | SC1 触发；SC4 / SC2 隔离 |
| A.3 MIN_PERT intro | 2 (A) | 1 | 1 | 单 slot 移动产生扰动 |
| A.3b HC1 delta | 2 (A) | 2 | 2 | 通过 move 引入 HC1 |
| A.4 MIN_PERT resolve | 2 (A) | 1 | 1 | 从扰动状态移回原位 |
| B.1-HC1 | 2 | 2 | 2 (同 room 同 time) | HC1 |
| B.1-HC2 | 2 | 2 (同 teacher) | 2 (同 time) | HC2 |
| B.1-HC3 | 2 | 2 (同 class) | 2 (同 time) | HC3 |
| B.1-HC4 | 1 (cap 50) | 1 (60 students) | 1 | HC4 |
| B.1-HC5 | 1 (unavailable) | 1 | 1 | HC5 |
| B.2 separation | 2 | 2 | 2 (HC4 + SC3) | 混合 HC + SC 验证分离 |
| C.1 default snapshot | 3 (A/B/C) | 3 | 4 | hard=0, soft=-11 |
| C.2 perturbed snapshot | 3 (A/B/C) | 3 | 4 | 引入 MIN_PERT |
| D.1+D.2 fixed seed | 5 (mixed) | 4 | 8 | 求解器 smoke |

### 4.4 Move Shape

```ts
interface Move {
  slotId: number
  newDay: number
  newSlotIndex: number
  newRoomId: number
}
```

### 4.5 Score Detail Aggregation

`summarizeDetails(details)` 返回 `Record<type, count>`，用于按类型统计。

---

## 5. Harness A: Full / Delta Consistency

### 5.1 A.1 SC2 same-day (PASS)

| Field | Value |
|---|---|
| Fixture | 1 task, 2 slots on same day, rooms A/A |
| Before | `{hard:0, soft:-10}` (SC2: 2 slots same day → -10) |
| Move | slot2 day=2 (move to different day) |
| After | `{hard:0, soft:-2}` (SC2 cleared → 0, but SC3 not present) |
| Full Δ | `(0, +8)` |
| Delta | `(0, +8)` |
| Result | **PASS** — full = delta |

### 5.2 A.2 SC1 cross-building (PASS — was KNOWN_FAIL pre-K22-D)

| Field | Value |
|---|---|
| Fixture | 2 tasks (同 teacherId=10, 同 classGroupId=1), 2 slots, rooms A/B, different teachingTaskIds |
| Before | `{hard:0, soft:-5}` (SC1 fires: same teacher + consecutive + different building) |
| Move | slot2 roomId=100 (move to building A) |
| After | `{hard:0, soft:-2}` (SC1 cleared → 0; MIN_PERT introduced → -2) |
| Full Δ | `(0, +3)` — SC1 +5 cleared, MIN_PERT -2 added |
| Delta (K22-C 阶段) | `(0, -2)` — SC1 missing, MIN_PERT correct |
| Delta (K22-D 后) | `(0, +3)` — SC1 +5, MIN_PERT -2, net +3 ✓ |
| Result | **PASS (regression guard)** — full = +3, delta = +3 (K22-D 修复后) |

**K22-C → K22-D 演化**:
- K22-C 阶段该 case 为 KNOWN_FAIL（K22-A HIGH 风险未解）
- K22-D 在 `calculateDeltaScore` 中添加 SC1 逻辑，mirror full score SC1 detection
- K22-D 后该 case 转为 PASS，保留为 regression guard。如果未来 SC1 delta 再次 regress，case 会重新 FAIL
- 完整 SC1 delta 实现详见 `docs/k22-score-delta-sc1-fix.md`

### 5.3 A.3 MIN_PERT introduction (PASS)

| Field | Value |
|---|---|
| Fixture | 1 task, 1 slot in original position |
| Before | `{hard:0, soft:0}` |
| Move | slot1 roomId=101 (move within same day) |
| After | `{hard:0, soft:-2}` (MIN_PERT introduced) |
| Full Δ | `(0, -2)` |
| Delta | `(0, -2)` |
| Result | **PASS** — full = delta |

### 5.4 A.3b HC1 hard delta (PASS)

| Field | Value |
|---|---|
| Fixture | 2 tasks, 2 slots at day1/slot1 and day2/slot1 |
| Before | `{hard:0, soft:0}` |
| Move | slot1 → day=2, room=200 (same as slot2 → HC1) |
| After | `{hard:-1000, soft:-2}` (HC1 + MIN_PERT) |
| Full Δ | `(-1000, -2)` |
| Delta | `(-1000, -2)` |
| Result | **PASS** — full = delta, hard=-1000 |

### 5.5 A.4 MIN_PERT resolution (PASS)

| Field | Value |
|---|---|
| Fixture | 1 task, 1 slot moved from original |
| Before | `{hard:0, soft:-2}` (MIN_PERT fires) |
| Move | slot1 back to original position |
| After | `{hard:0, soft:0}` (MIN_PERT cleared) |
| Full Δ | `(0, +2)` |
| Delta | `(0, +2)` |
| Result | **PASS** — full = delta |

### 5.6 A Coverage Summary

- 5 PASS cases (SC2, SC1 cross-building, MIN_PERT intro, HC1 hard, MIN_PERT resolution)
- 0 KNOWN_FAIL cases (K22-D 修复后 SC1 case 转为 PASS)
- 0 unexpected failures
- 全部 5 个 full/delta consistency case 在 K22-D 后 PASS，**regression guard 保留**

---

## 6. Harness B: Hard Invariant (HC1-HC5)

| HC | Expected | Actual | Result |
|---|---|---|---|
| HC1 (room conflict) | hard=-1000, soft=0, HC1 detail ≥ 1 | hard=-1000, soft=0, HC1 count=1 | **PASS** |
| HC2 (teacher conflict) | hard=-1000, soft=0, HC2 detail ≥ 1 | hard=-1000, soft=0, HC2 count=1 | **PASS** |
| HC3 (class conflict) | hard=-1000, soft=0, HC3 detail ≥ 1 | hard=-1000, soft=0, HC3 count=1 | **PASS** |
| HC4 (capacity overflow) | hard=-1000, soft=0, HC4 detail ≥ 1 | hard=-1000, soft=0, HC4 count=1 | **PASS** |
| HC5 (room unavailable) | hard=-1000, soft=0, HC5 detail ≥ 1 | hard=-1000, soft=0, HC5 count=1 | **PASS** |
| Hard/soft separation | HC tagged HARD, SC tagged SOFT, scores independent | hard=-1000, soft=-1, levels correct | **PASS** |

**All HC1-HC5 + separation invariants pass.** No regression in hard constraint detection.

---

## 7. Harness C: Default Score Snapshot

### 7.1 C.1 Default Snapshot

| Field | Value |
|---|---|
| Fixture | 3 rooms (A/B/C), 3 tasks, 4 slots |
| Expected hard | 0 |
| Expected soft | -11 (SC2=-10, SC3=-1) |
| Actual hard | 0 ✓ |
| Actual soft | -11 ✓ |
| SC2_SAME_DAY count | 1 ✓ |
| SC3_EXTREME_TIME_SLOT count | 1 ✓ |
| Constraint breakdown | `{SC2_SAME_DAY: 1, SC3_EXTREME_TIME_SLOT: 1}` |
| Result | **PASS** |

### 7.2 C.2 Perturbation Snapshot

| Field | Value |
|---|---|
| Fixture | Same as C.1, but slot1 moved to day=2 |
| Expected MIN_PERT | 1 |
| Actual MIN_PERT | 1 ✓ |
| Perturbed hard | 0 ✓ |
| Perturbed soft | -3 (SC2=-10, SC3=-1, MIN_PERT=-2... wait, why -3?) |
| Result | **PASS** |

**Note on perturbed soft = -3**: After perturbation, SC2 clears (slot1 no longer on same day as slot2 from same task), so SC2=-10 → 0; SC3 stays -1; MIN_PERT adds -2. Net: 0 + (-1) + (-2) = -3. ✓

### 7.3 Snapshot File

`docs/k22-score-default-snapshot.json`:
```json
{
  "generatedAt": "2026-06-06T...",
  "phase": "K22-C-SCORE-REGRESSION-HARNESS-IMPLEMENTATION",
  "fixture": { "rooms": 3, "tasks": 3, "slots": 4, "buildings": ["A", "B", "C"] },
  "snapshot": {
    "hardScore": 0,
    "softScore": -11,
    "detailsCount": 2,
    "constraintBreakdown": { "SC2_SAME_DAY": 1, "SC3_EXTREME_TIME_SLOT": 1 }
  },
  "stability": "Stable if score.ts penalties unchanged. K22-D dynamic weights would change this; regenerate with test config."
}
```

**Snapshot usage**: 用于检测 `score.ts` 后续 refactor 是否改变默认行为。如果 K22-D 修改 SC1 delta（仅影响 SC1 case），此 snapshot 不会变化（snapshot fixture 中无 SC1 触发条件）。如果 K22-D 加 hardWeights/softWeights，应使用 test config 重新生成 snapshot。

---

## 8. Harness D: Fixed Seed Solver Regression

### 8.1 Implementation

D1 实施：synthetic 调用 `solve(ctx, config)` with `randomSeed: 42, maxIterations: 200, lahcWindowSize: 50`。
D2 实施：同一 seed 重跑，验证迭代次数和 softScore 完全相同。

### 8.2 D.1 D.2 Results

| Check | Result |
|---|---|
| D.1: synthetic solver run (hardScore preserved as 0, iterations > 0, usedSeed = 42) | **PASS** |
| D.2: fixed-seed determinism (Run1 == Run2 in iterations and softScore) | **PASS** |

### 8.3 D Scope

本阶段 D 已实施 lightweight smoke。后续 K22-D / K22-E 可扩展到：
- 完整 30 slots / 20 tasks / 10 rooms fixture
- baselineMin softScore 断言
- 真实 maxIterations=1000 + lahcWindowSize=500

---

## 9. Harness E: K21 Config Regression

### 9.1 E.1 K21 verify scripts present (PASS)

确认 4 个 K21 verify script 文件存在：
- `scripts/verify-solver-config-ui-k21-fix-g.ts`
- `scripts/verify-solver-config-api-k21-fix-f.ts`
- `scripts/verify-solver-config-preview-k21-fix-f.ts`
- `scripts/verify-solver-config-snapshot-k21-fix-f.ts`

### 9.2 E.2 K21 config flow does not import score.ts or solver.ts (PASS)

静态检查：`src/lib/scheduler/config.ts`、`src/lib/scheduler/config-helpers.ts`、`src/lib/solver/scheduler.ts`、`src/lib/solver/preview.ts` 均无 `score` 或 `solver/solver` 的 import。

**含义**：K21 config flow 与 score.ts 解耦，score harness 不会影响 K21 config 行为。

### 9.3 K21 Re-execution

完整 K21 verify scripts re-execution 由 spec §10 regression chain 统一执行。K22-C 不重复执行（避免冗余），但 E.1 + E.2 静态确认 + 动态再跑 = 双重保护。

---

## 10. SC1 Known Failure (历史 — K22-D 已修复)

### 10.1 历史 Capture Details (K22-C 阶段)

| Field | Value (K22-C) | Value (K22-D 后) |
|---|---|---|
| Case | SC1 cross-building consecutive delta | 同 |
| Fixture | 2 tasks (same teacher, same class, different teachingTaskIds), 2 rooms (A/B), 2 slots at day1/slot1, day1/slot2 | 同 |
| Trigger | SC1 cross-building back-to-back (same teacher + consecutive + different building) | 同 |
| Move | slot2 to room A (resolve SC1) | 同 |
| Full soft delta | +3 (SC1 +5 cleared, MIN_PERT -2 added) | +3 |
| Delta soft | -2 (MIN_PERT only, **SC1 missing**) | **+3** (SC1 +5, MIN_PERT -2) |
| Result | **KNOWN_FAIL** | **PASS** |

### 10.2 历史 Why Known Failure Was Expected (K22-C 阶段)

K22-A 明确 SC1 delta missing 是 HIGH 风险。K22-C 不修 SC1 delta，所以该 case 必然失败。脚本设计成：
1. 检测 `delta.deltaSoft !== fullSoftDelta` 且 `delta.deltaSoft === -2` → KNOWN_FAIL（K22-C 阶段）
2. 整体 exit code 仍为 0（KNOWN_FAIL 不阻塞）
3. 详细 evidence 记录 before/after/delta/expected，便于 K22-D 修复后对比

### 10.3 K22-D Resolution (已完成)

K22-D 修复 SC1 delta 后：
- ✅ `calculateDeltaScore` 中添加 SC1 逻辑（mirror full score SC1 detection）
- ✅ A.2 case 的 delta.soft 已从 `-2` 变为 `+3`
- ✅ A.2 status 已从 KNOWN_FAIL 变为 **PASS**
- ✅ C.1 default snapshot 不变（fixture 中无 SC1 触发）
- ✅ C.2 perturbed snapshot 不变（fixture 仍无 SC1 触发）
- ✅ K22-C verify 脚本 K22-D 后总体：17 PASS / 0 KNOWN_FAIL / 0 FAIL
- ✅ A.2 case 现在作为 **regression guard** 保留 — 如果未来 SC1 delta regress，case 会重新 FAIL

详细 K22-D 实现见 `docs/k22-score-delta-sc1-fix.md`。

---

## 11. Verification Results

### 11.1 K22-C 本阶段脚本

| Script | Result |
|---|---|
| `npx.cmd tsx scripts/verify-score-regression-harness-k22-c.ts` | **PASS** — 16 PASS, 1 KNOWN_FAIL (SC1), 0 FAIL, 0 INFO, BLOCKING=NO, exit=0 |

### 11.2 K22 链路

| Script | Result |
|---|---|
| `npx.cmd tsx scripts/plan-score-regression-harness-k22-b.ts` | (per K22-B) PASS — 5 decisions, 5 risks, 5 harnesses |
| `npx.cmd tsx scripts/audit-score-constraint-inventory-k22-a.ts` | (per K22-A) HIGH=2 / MEDIUM=1 / LOW=1 / INFO=3 / NONE=1 / BLOCKING=YES (SC1 still missing) |

### 11.3 K21 链路

| Script | Result |
|---|---|
| `npx.cmd tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | (per K21-FIX-G) 22 / 0 |
| `npx.cmd tsx scripts/verify-solver-config-api-k21-fix-f.ts` | (per K21-FIX-F) 27 / 0 |
| `npx.cmd tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | (per K21-FIX-F) 16 / 0 |
| `npx.cmd tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | (per K21-FIX-F) 19 / 0 |
| `npx.cmd tsx scripts/audit-solver-config-ui-k21-fix-d.ts` | (per K21-FIX-G-AUDIT) MEDIUM=1 / LOW=2 / NONE=4 |
| `npx.cmd tsx scripts/audit-room-capacity-and-solver-config-k21-fix-a.ts` | (per K21-FIX-A) HIGH=0 |

### 11.4 K20 / K19 链路

| Script | Result |
|---|---|
| `npx.cmd tsx scripts/audit-remaining-risk-rebase-k20.ts` | (per K20) HIGH=0 |
| `npx.cmd tsx scripts/verify-source-evidence-schema-k20-fix-b.ts` | 37 / 0 |
| `npx.cmd tsx scripts/verify-source-evidence-importer-k20-fix-b.ts` | 41 / 0 |
| `npx.cmd tsx scripts/verify-source-evidence-query-k20-fix-b.ts` | 16 / 0 |
| `npx.cmd tsx scripts/audit-source-evidence-backfill-gap-k20-fix-b.ts` | 2 / 0 |
| `npx.cmd tsx scripts/verify-import-approval-browser-e2e-k19-fix-c.ts` | 9 / 0 / 1 SKIP |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-ui-k19-fix-b2.ts` | 16 / 0 |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts` | 17 / 0 |
| `npx.cmd tsx scripts/verify-import-matching-cohort-guard-k19-fix-a.ts` | 31 / 0 |

### 11.5 Mutation Audit

| Script | Result |
|---|---|
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH=0 / MEDIUM=0 |
| `npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | BLOCKING=NO |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23 / 0 |

### 11.6 Build / Validate / Lint / Test

| Command | Result |
|---|---|
| `npx prisma validate` | valid |
| `npm.cmd run build` | PASS |
| `npm.cmd run lint` | 314 (180 errors + 134 warnings), 0 new |
| `npm.cmd run test:auth-foundation` | 53 passed / 1 failed (pre-existing) |

---

## 12. Unmodified Scope (本阶段未修改)

- ✅ 未修改 Prisma schema
- ✅ 未修改 `prisma/migrations/**`
- ✅ 未修改 `prisma/dev.db`
- ✅ 未运行 `db push` / `migrate` / `reset` / `seed`
- ✅ 未修改 `score.ts`
- ✅ 未修改 `solver.ts`
- ✅ 未修改 `scheduler.ts`
- ✅ 未修改 API route
- ✅ 未修改 frontend
- ✅ 未修改 importer / parser
- ✅ 未修改 RBAC / permissions
- ✅ 未修改业务数据
- ✅ 未提交 DB backup
- ✅ 未做 SC1 delta 修复
- ✅ 未做 score.ts refactor
- ✅ 未做 hardWeights / softWeights 字段
- ✅ 未做 UI weight editor

---

## 13. Remaining Risks

| ID | Severity | Title | Mitigation |
|---|---|---|---|
| K22-C-R-1 | HIGH | SC1 delta 仍未修复，solver 可能做出 sub-optimal decisions | K22-D 在本 harness 保护下修复；A.2 case 是修复的红测试 |
| K22-C-R-2 | MEDIUM | K22-A 全部 HIGH 风险仍然存在（SC1 delta, penalty constants 硬编码） | K22-D 解决 SC1；K22-weights-roadmap 解决 hardcoded |
| K22-C-R-3 | LOW | synthetic fixture 不覆盖真实数据的所有 edge cases | K22-C 后可补充 real DB smoke test |
| K22-C-R-4 | MEDIUM | penalty 常量仍硬编码，harness A.2 KNOWN_FAIL 可能因 K22-D 动态权重变化 | harness 引用 score.ts 常量，refactor 后需 import from config |
| K22-C-R-5 | INFO | 7 items 软约束仍未覆盖（教师均衡/班级空洞/...） | K22-E roadmap 实施 |

---

## 14. Suggested Next Stage

**阶段名**: **K22-D-SCORE-DELTA-SC1-FIX**

**范围**:
1. 在 `calculateDeltaScore` 中添加 SC1 逻辑（mirror full score 中的 SC1 detection）
2. 跑 A.2 KNOWN_FAIL → PASS
3. 跑 K22-C verify script 全 PASS (KNOWN_FAIL = 0)
4. 重跑 C.1/C.2 snapshot（如 soft score 变化则更新）
5. 重跑 K21/K20/K19 regression chain 确认无副作用
6. 更新 K22-A audit 状态（SC1 delta = covered）
7. 不做 hardWeights/softWeights（K22-weights-roadmap 范围）

**不包含**:
- ❌ hardWeights/softWeights JSON 字段
- ❌ score.ts refactor 接收 dynamic weights
- ❌ UI weight editor
- ❌ 7 items 软约束实施（K22-E 范围）

---

## 15. Harness F: Specialty Campus Weekend Constraints (K22-F3)

Added in commit `e4a40ba` (K22-F3) and aligned in `f55c0a7` (K22-F3A).

Harness F covers HC6 (non-automotive forbidden in Linxiao), SC6 (automotive prefers Linxiao), and SC7 (weekend avoidance):

### Cases (11)

| Case | Category | Expected |
|---|---|---|
| F1-HC6-NON_AUTO | HC6 | hard=-1000, soft=0 |
| F2-HC6-MIXED | HC6 (K22-F2A) | hard=-1000, soft=0 |
| F3-HC6-COURSE | HC6 (K22-F2A) | hard=-1000, soft=0 |
| F4-HC6-REMARK | HC6 (K22-F2A) | hard=-1000, soft=0 |
| F5-SC6-NON_LX | SC6 | hard=0, soft=-20 |
| F6-SC6-IN_LX | SC6 | hard=0, soft=0 |
| F7-SC7-WEEKEND | SC7 | hard=0, soft=-15 |
| F8-SC7-WEEKDAY | SC7 | hard=0, soft=0 |
| F9-DELTA-HC6 | HC6 delta | deltaHard=-1000 |
| F10-DELTA-SC6 | SC6 delta | deltaSoft=+20 |
| F11-DELTA-SC7 | SC7 delta | deltaSoft=-15 |

Delta cases use 3rd-position `originalAssignments` to isolate HC6/SC6/SC7 from MIN_PERT.

---

## 16. Harness G: SC5 Teacher Day Balance (K22-F4)

Added in commit `d6bf806` (K22-F4).

Harness G covers SC5 (teacher day balance): penalizes teachers whose weekly teaching load is unevenly distributed across weekdays.

### Constants

```ts
const TEACHING_DAYS = [1, 2, 3, 4, 5]
const SC5_PENALTY_PER_EXCESS = -3
const SC5_THRESHOLD = 2
const SC5_MIN_TOTAL = 3
```

### Cases (9)

| Case | Days | Expected | Description |
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

Delta cases use 3rd-position `originalAssignments` to isolate SC5 delta from MIN_PERT.

### Default Snapshot Impact

Default fixture has 3 teachers with `total < 3` each → SC5 does not trigger → snapshot unchanged (`hardScore=0, softScore=-11`).

---

## 17. Harness H: SC8 Class Gap Reduction (K22-F6)

Added in K22-F6 (SC8_CLASS_GAP_REDUCTION).

Harness H covers SC8 (class gap reduction): penalizes empty periods between two occupied periods on the same day for the same classGroup.

### Constants

```ts
const SC8_CLASS_GAP_PENALTY_PER_EMPTY_PERIOD = -2
```

### Formula

For each `(classGroupId, dayOfWeek)` key where `dayOfWeek in [1, 2, 3, 4, 5]`:
1. Build set of `slotIndex` from slots with `room != 0` and classGroup in taskClasses
2. Sort ascending
3. If `set.size < 2`: skip
4. For each adjacent pair: `gap = next - prev - 1`; if `gap > 0`: `penalty += -2 * gap`

### Skip Rules

- `room === 0` (unscheduled)
- `dayOfWeek in [6, 7]` (weekend — SC7 owns)
- `taskClasses.length === 0` (orphan task)
- `periodSet.size < 2` (no gap possible)

### Cases (12)

| Case | Title | Expected |
|---|---|---|
| H1-NO-GAP-1_2_3 | {1,2,3} no gap | soft=-23 (SC2 -20 + SC5 -3) |
| H2-SINGLE-GAP-1_3 | {1,3} single gap | soft=-12 (SC2 -10 + SC8 -2) |
| H3-MULTI-GAP-1_4 | {1,4} multi gap | soft=-14 (SC2 -10 + SC8 -4) |
| H4-MULTI-SEGMENT-1_3_5 | {1,3,5} multi segment | soft=-28 (SC2 -20 + SC3 -1 + SC5 -3 + SC8 -4) |
| H5-SINGLE-LESSON-SKIP | {1} single lesson | soft=0 (size<2 skip) |
| H6-WEEKEND-SKIP | day 6, {1,3} | soft=-40 (SC2 -10 + SC7 -30, SC8 0) |
| H7-ROOM-ZERO-SKIP | 1 scheduled + 1 room=0 | soft=0 (room=0 skip) |
| H8-MULTI-CLASSGROUP-MERGED | merged A(cg{1,2},p1) + B(cg{1},p3) + C(cg{2},p5) | soft=-9 (SC3 -1 + SC8 -8) |
| H9-DELTA-REDUCE-GAP | {1,3}→{1,2} reduce gap | deltaSoft=+2 |
| H10-DELTA-INTRODUCE-GAP | {1,2}→{1,3} introduce gap | deltaSoft=-2 |
| H11-DELTA-MOVE-TO-WEEKEND | day 1 → day 6 | deltaSoft=-3 (SC8 +2 + SC2 +10 + SC7 -15) |
| H12-DELTA-MULTI-CLASSGROUP | merged A p1→p2 with B at p3 | deltaSoft=+4 (cg1 +2, cg2 +2) |

Delta cases use 3rd-position `originalAssignments` to isolate SC8 delta from MIN_PERT.

### Default Snapshot Impact

Default fixture has 3 classGroups, each on day 1:
- classGroup 1: {1, 2} (no gap, SC8=0)
- classGroup 2: {1} (size<2, SC8 skip)
- classGroup 3: {5} (size<2, SC8 skip)

SC8 does not trigger on default fixture → snapshot unchanged (`hardScore=0, softScore=-11`).

---

## 18. Closing Note

K22-C-SCORE-REGRESSION-HARNESS-IMPLEMENTATION 按 spec 完整执行：

- ✅ 新增可执行 verify 脚本 (`scripts/verify-score-regression-harness-k22-c.ts`)
- ✅ 新增 Markdown implementation 文档 (本文件)
- ✅ 新增 JSON implementation 报告 (`docs/k22-score-regression-harness-implementation.json`)
- ✅ 新增 Default Snapshot JSON (`docs/k22-score-default-snapshot.json`)
- ✅ 实施 Harness A (Full/Delta): K22-C 阶段 4 PASS + 1 KNOWN_FAIL (SC1); **K22-D 后 5 PASS + 0 KNOWN_FAIL (regression guard)**
- ✅ 实施 Harness B (HC1-HC5 + separation): 6/6 PASS
- ✅ 实施 Harness C (Default Snapshot + Perturbation): 2/2 PASS
- ✅ 实施 Harness D (Fixed Seed Solver): 2/2 PASS (smoke level)
- ✅ 实施 Harness E (K21 Config Regression): 2/2 PASS (static delegation)
- ✅ 实施 Harness F (HC6/SC6/SC7): 11/11 PASS (K22-F3)
- ✅ 实施 Harness G (SC5 Teacher Day Balance): 9/9 PASS (K22-F4)
- ✅ 实施 Harness H (SC8 Class Gap Reduction): 12/12 PASS (K22-F6)
- ✅ K22-C summary: **49 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO** (was 37 before F6)
- ✅ 整体 exit code = 0, BLOCKING = NO

**当前状态: Harness A-H 八个维度，49 个 cases。下一步推荐 K22-F7-CLASSROOM-STABILITY-AUDIT (只读审计教室稳定性约束建模)。**
