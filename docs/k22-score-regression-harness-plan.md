# K22 Score Regression Harness Plan

| Field | Value |
|---|---|
| Phase | K22-B-SCORE-REGRESSION-HARNESS-PLAN |
| Type | Read-only plan (no Prisma writes, no score.ts modifications, no solver changes) |
| Generated | 2026-06-05 |
| Predecessor | K22-A-SCORE-CONSTRAINT-INVENTORY-AUDIT (commit `9885f1f docs(scheduler): audit score constraint inventory`) |
| Plan script | `scripts/plan-score-regression-harness-k22-b.ts` |
| JSON report | `docs/k22-score-regression-harness-plan.json` |
| Project direction | K22-SCORE-WEIGHTS-ROADMAP — 为 SC1 delta 修复建立 regression harness |

---

## 1. Background

K22-A (commit `9885f1f`) 已完成，核心发现：
- HC1-HC5 full score 与 delta score 覆盖一致
- hardScore / softScore 分离清楚
- HC6 锁定课程骨架不计分是 intentional
- SC2 / SC3 / SC4 / MIN_PERT full score 与 delta score 覆盖一致
- **核心 HIGH 风险：SC1 跨楼栋连续课 full score 有覆盖，delta score 缺失**
- LAHC solver 使用 delta score 做 move 评估，可能接受增加跨楼栋连续课惩罚的 move
- 所有 penalty 常量仍硬编码，未受 SchedulingConfig 控制
- 7 项常见软约束仍未覆盖

本阶段 K22-B 只做 regression harness 方案设计，不直接修改 score.ts，不修 SC1 delta。

---

## 2. Goal

1. 审计 score.ts 可测试边界
2. 设计 full score / delta score 一致性验证方案 (Harness A)
3. 设计 SC1 targeted regression case
4. 设计 hard invariant regression case (Harness B)
5. 设计 default score snapshot (Harness C)
6. 设计 fixed seed solver regression (Harness D)
7. 设计 K21 config regression (Harness E)
8. 明确 K22-C 如何在 harness 保护下修复 SC1 delta
9. 输出 harness 实施文件清单、数据构造方式、断言标准
10. 不修改 score.ts / solver / schema / frontend / API

---

## 3. Scope

### In scope (只读规划)

- `src/lib/scheduler/score.ts` (read-only)
- `src/lib/scheduler/capacity.ts` (read-only)
- `src/lib/scheduler/types.ts` (read-only)
- `src/lib/scheduler/solver.ts` (read-only)
- `src/lib/solver/**` (read-only)
- `prisma/schema.prisma` (read-only)
- `docs/k22-score-constraint-inventory-audit.{md,json}` (read-only)
- `scripts/audit-score-constraint-inventory-k22-a.ts` (read-only)
- `package.json` (read-only)

### Out of scope (严禁处理)

- 任何 Prisma 写操作
- 任何 score.ts / solver 修改
- 任何 schema / migration
- 任何 API route 修改
- 任何 frontend 修改
- 任何业务数据修改
- 任何 regression harness 实际测试代码 (K22-C 实施)
- 任何 SC1 delta 修复 (K22-C 实施)

---

## 4. Current Score Testability

### 4.1 Score 函数入口

```ts
// src/lib/scheduler/score.ts
export function calculateScoreWithDetails(
  ctx: SchedulingContext,
  state: ScheduleState,
): ScoreWithDetails

export function calculateInitialScore(
  ctx: SchedulingContext,
  state: ScheduleState,
): Score

export function calculateDeltaScore(
  ctx: SchedulingContext,
  state: ScheduleState,
  move: Move,
): { deltaHard: number; deltaSoft: number }

export function clearWeekCache(): void
```

### 4.2 Type 接口

```ts
// src/lib/scheduler/types.ts
Score: { hardScore: number; softScore: number }
ScoreDetail: { type, level: 'HARD' | 'SOFT', penalty, slotId?, relatedSlotId?, message }
ScoreWithDetails: { hardScore, softScore, details: ScoreDetail[] }

ScheduleState: {
  assignments: Map<slotId, { dayOfWeek, slotIndex, roomId }>
  originalAssignments: Map<slotId, { dayOfWeek, slotIndex, roomId }>
}
Move: { slotId, newDay, newSlotIndex, newRoomId }
```

### 4.3 可测试性评估

| 项 | 评估 |
|---|---|
| full score 入口 | `calculateScoreWithDetails` 纯函数 (输入 ctx, state → 返回 ScoreWithDetails) |
| delta score 入口 | `calculateDeltaScore` 纯函数 (输入 ctx, state, move → 返回 deltaHard, deltaSoft) |
| 可构造 synthetic fixture | ✅ 是 (mock rooms/tasks/slots) |
| 可不写 DB 测试 | ✅ 是 (不依赖 data-loader.ts) |
| 当前限制 | data-loader.ts 无纯 export, harness 必须 mock SchedulingContext 或使用 test DB |

### 4.4 关键依赖

- `ctx.slots`, `ctx.rooms`, `ctx.taskById`, `ctx.roomById`, `ctx.slotsByTask`
- `hasWeekOverlap(taskA, taskB)` — 来自 score.ts
- `getTaskStudentCount(task, ctx)` — 来自 capacity.ts
- `inferBuilding(roomName)`, `getBuilding(room)` — 来自 score.ts

---

## 5. Harness Plan

| Harness | Purpose | Fixture | Expected Assertions |
|---|---|---|---|
| **A. Full/Delta Consistency** | 验证每个 constraint 的 full score 和 delta score 覆盖一致 | Synthetic: 3 slots, 1 teacher, 3 rooms (building A, B, A) | fullScore(state) + deltaScore(state, move) == fullScore(stateAfterMove). SC1 case 期望 delta 反映 -5 (当前 missing) |
| **B. Hard Invariant** | HC1-HC5 不得回退; hardScore 不被 softScore 覆盖 | Synthetic: per HC 2 slots 最小 fixture | HC1-HC5 each: hardScore == -1000, softScore == 0. hardScore never decreases due to soft improvement |
| **C. Default Score Snapshot** | 默认权重下 score snapshot 固定; refactor 必须保持 default behavior | Synthetic: 10 rooms, 20 tasks, 30 slots, mixed buildings | hardScore/softScore/per-constraint breakdown matches snapshot value (tolerance 0) |
| **D. Fixed Seed Solver Regression** | 固定 seed + config 下 solver 结果可重复; SC1 fix 后 hardScore 不得变差 | Synthetic: 30 slots, 20 tasks, 10 rooms, seed=42, maxIter=1000 | hardScore >= 0, softScore >= baselineMin, iteration count within bounds. NO exact schedule assertion |
| **E. K21 Config Regression** | K21-F/G configId + overrides + resultSnapshot.config + apply/rollback config 不因 score harness 变化回退 | Existing K21 verify scripts | verify-solver-config-api-k21-fix-f: 27/0, verify-solver-config-preview-k21-fix-f: 16/0, verify-solver-config-snapshot-k21-fix-f: 19/0, verify-solver-config-ui-k21-fix-g: 22/0 |

---

## 6. SC1 Targeted Case

```ts
{
  caseName: "SC1 cross-building consecutive delta",
  setup: {
    rooms: [
      { id: 100, name: 'A101', building: 'A' },
      { id: 200, name: 'B201', building: 'B' },
      { id: 300, name: 'A102', building: 'A' },
    ],
    tasks: [
      { id: 1, teacherId: 10, courseId: 1, weekType: 'ALL', startWeek: 1, endWeek: 16,
        taskClasses: [{ classGroupId: 1 }] },
    ],
    slots: [
      { id: 1, teachingTaskId: 1, dayOfWeek: 1, slotIndex: 1, roomId: 100 },
      { id: 2, teachingTaskId: 1, dayOfWeek: 1, slotIndex: 2, roomId: 200 },
    ],
  },
  before: {
    assignments: {
      1: { dayOfWeek: 1, slotIndex: 1, roomId: 100 },
      2: { dayOfWeek: 1, slotIndex: 2, roomId: 200 },
    },
    fullSoftScore: -5, // SC1 cross-building: slot1(A) + slot2(B) same teacher, consecutive
  },
  sc1ResolutionMove: {
    slotId: 2,
    newDay: 1,
    newSlotIndex: 2,
    newRoomId: 100, // Move slot2 to building A (same as slot1) — should resolve SC1
  },
  afterSC1Resolution: {
    fullSoftScore: 0, // SC1 resolved
  },
  expectedFullSoftDelta: 5, // +5 (resolved -5)
  expectedCurrentDeltaBeforeFix: 0, // BUG: delta ignores SC1
  expectedDeltaAfterFix: 5, // After K22-C fix, delta correctly reflects +5
  whyCapturesK22AHIGH: 'Currently delta returns 0 for sc1Resolution, but full score returns +5. Harness A detects this mismatch. K22-C SC1 fix should make delta return +5.'
}
```

**为什么能捕获 K22-A HIGH 风险**：
- 当前 calculateDeltaScore 中没有 SC1 逻辑
- 上述 case 调用 delta score 应该返回 `deltaSoft = 0` (因为没正确检测 SC1 resolution)
- 但 full score 实际变化是 +5
- Harness A 断言: `fullScore(before) + deltaScore(before, move) == fullScore(after)`
- 当前会失败 (断言 -5 + 0 != 0)
- K22-C 修复后断言通过 (-5 + 5 == 0)

---

## 7. Hard Invariant Plan

每个 HC 构造 minimal fixture:

```ts
// HC1 Room Conflict
{
  fixture: '2 slots, same room, same time, same week',
  before: { slot1: { roomId: 100 }, slot2: { roomId: 100 } },
  expected: { hardScore: -1000, softScore: 0 }
}

// HC2 Teacher Conflict
{
  fixture: '2 slots, same teacher, same time, different room, same week',
  before: { slot1: { teacherId: 10, roomId: 100 }, slot2: { teacherId: 10, roomId: 200 } },
  expected: { hardScore: -1000, softScore: 0 }
}

// HC3 Class Conflict
{
  fixture: '2 slots, same classGroup, same time, different teacher, same week',
  before: { slot1: { taskClasses: [{ classGroupId: 1 }] }, slot2: { taskClasses: [{ classGroupId: 1 }] } },
  expected: { hardScore: -1000, softScore: 0 }
}

// HC4 Capacity Overflow
{
  fixture: '1 slot, studentCount=60, room.capacity=50',
  before: { slot1: { roomId: 100, roomCapacity: 50 }, studentCount: 60 },
  expected: { hardScore: -1000, softScore: 0 }
}

// HC5 Room Unavailable
{
  fixture: '1 slot, room has RoomAvailability(available=false)',
  before: { slot1: { roomId: 100, dayOfWeek: 1, slotIndex: 1 } },
  availability: { dayOfWeek: 1, slotIndex: 1, available: false },
  expected: { hardScore: -1000, softScore: 0 }
}
```

**expected behavior**:
- hardScore 累加 -1000 per HC violation
- softScore 不受 HC 影响
- solver: hardScore === 0 是 Apply gate 的前提
- hardScore 永不被 softScore 改善覆盖

---

## 8. Default Snapshot Plan

```ts
{
  fixture: {
    rooms: 10,
    tasks: 20,
    slots: 30,
    buildings: ['A', 'B', 'C'],
    seed: 'deterministic (synthetic)',
  },
  expectedHardScore: 'snapshot — actual value captured at K22-C implementation',
  expectedSoftScore: 'snapshot — actual value captured at K22-C implementation',
  expectedBreakdown: 'Per-constraint count: HC1, HC2, HC3, HC4, HC5, SC1, SC2, SC3, SC4, MIN_PERT',
}
```

**snapshot stability**:
- 如果 penalty 不变则稳定
- K22-C SC1 fix 后: soft score breakdown 变化 (更多 SC1 details), snapshot 必须更新
- K22-D dynamic weights 后: 用 test config 重新生成 snapshot

**default behavior guarantee**:
- K22 任何变更前先 capture baseline snapshot
- K22-C SC1 fix: soft score 可能改善, hard score 不变
- K22-D dynamic weights: snapshot 用 test config 重新生成

---

## 9. Fixed Seed Solver Plan

```ts
{
  approach: 'synthetic (recommended) — not real DB',
  syntheticDataset: '30 slots, 20 tasks, 10 rooms, mixed buildings',
  seed: 42,
  maxIterations: 1000,
  lahcWindowSize: 500,
  expectedAssertions: [
    'hardScore >= 0 (must be feasible)',
    'softScore >= baselineMin',
    'iteration count within bounds (e.g. 800-1000)',
    'metrics.attemptedMoves > 0, metrics.acceptedMoves > 0',
  ],
}
```

**为什么不用 exact schedule**:
- Exact schedule 在 delta score 变化下很脆弱
- LAHC acceptance path 依赖 delta score, SC1 delta fix 改变 acceptance trajectory
- Score bounds 确保正确性而不脆弱

**为什么不用 real DB**:
- Real DB 有 440+ slots, 53 rooms, 308 tasks
- 测试慢且耦合重
- Synthetic 确定性、快、focus 在 solver convergence behavior

---

## 10. K21 Regression Plan

```ts
{
  configId: 'K21-F configId loading + resultSnapshot.config',
  overrides: 'K21-G preview body uses overrides',
  resultSnapshotConfig: 'K21-F writes resultSnapshot.config sub-object',
  applyRollback: 'K21-F apply/rollback reuse previewRun.configId + resultSnapshot.config',
  requiredVerifyScripts: [
    'verify-solver-config-api-k21-fix-f.ts',  // 27 / 0
    'verify-solver-config-preview-k21-fix-f.ts', // 16 / 0
    'verify-solver-config-snapshot-k21-fix-f.ts', // 19 / 0
    'verify-solver-config-ui-k21-fix-g.ts', // 22 / 0
  ],
  noNewIntegrationCheckNeeded: 'Existing verify scripts cover config flow end-to-end',
}
```

**K21 config regression 通过重跑现有 K21 verify scripts 实现，无需新 integration check**。

---

## 11. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|:---:|---|
| R-1: SC1 delta fix may introduce bugs in delta score calculation | HIGH | Harness A test-first: 写 failing test for SC1 introduce/resolve scenarios 先于实现。仔细 review SC1 full score 逻辑 (lines 205-246) 并在 delta 中 mirror |
| R-2: SC1 delta fix may change solver convergence behavior | MEDIUM | Harness D (score bounds): 断言 hardScore >= 0, softScore >= baseline. 不断言 exact schedule. 监控 iteration count 和 final score quality |
| R-3: Synthetic fixtures may not cover all real-world edge cases | LOW | Harness 通过后, 在 real dev.db 上 fixed seed run solver 作为 smoke test. 文档化 synthetic 限制 |
| R-4: Penalty constants 仍硬编码 — harness 可能 lock in 硬编码值 | MEDIUM | Harness 应该 import score.ts 的 penalty constants, 不 duplicate values. 若 score.ts refactor 移到 config-based weights, update harness 加载 test config |
| R-5: 7 items missing soft constraints 不被 harness 覆盖 | INFO | Harness A/C extensible. K22-C+ 实施新 constraint 时加新 case. 在 K22-B plan 中文档化为 future work |

---

## 12. Decisions (Recommended)

| ID | Decision |
|---|---|
| D-1 | Harness A (Full/Delta) 是 SC1 delta fix 的 safety net. Test-first (red → green) |
| D-2 | SC1 delta fix 必须在 Harness A 保护下开发. Harness A SC1 test 先 (red), 然后 implement fix (green) |
| D-3 | Harness D (Fixed Seed Solver) 用 score bounds, 不用 exact schedule. Score bounds 比 exact schedule 更稳定 |
| D-4 | SC1 delta fix 实施应 minimal and isolated. 只加 SC1 delta to calculateDeltaScore, 不做 full refactor |
| D-5 | Harness C (Default Snapshot) 用 synthetic fixture, 不用 real DB run. Snapshot 关注 score function behavior, 不是 solver behavior |

---

## 13. Implementation Plan

1. **K22-C-SCORE-REGRESSION-HARNESS-IMPLEMENTATION**: Build harness scripts (A-E) 作为 test files (vitest/Jest). Synthetic fixture builders for SchedulingContext + ScheduleState
2. **K22-C**: Implement Harness A (Full/Delta) with SC1 targeted failing test (red). Run to confirm failure
3. **K22-C**: Implement SC1 delta fix in score.ts (minimal addition to calculateDeltaScore). Run Harness A: test passes (green)
4. **K22-C**: Verify Harness B (Hard Invariant) still passes. No HC regression
5. **K22-C**: Run Harness C (Default Snapshot). Update snapshot if soft score changes
6. **K22-C**: Run Harness D (Fixed Seed Solver). Verify hardScore >= 0, softScore >= baseline. No exact schedule assertion
7. **K22-C**: Run K21 regression verify scripts (E). All pass
8. **K22-C**: Run full K21/K20/K19 regression chain. All PASS
9. **K22-C**: Update K22-A audit (SC1 delta now covered). Re-run audit: HIGH=1 (weights only)
10. **K22-D**: Weight configuration (hardWeights/softWeights) — separate stage with harness protection
11. **K22-E**: Missing soft constraints (7 items) — prioritize and implement under harness protection

---

## 14. Suggested Next Stage

**阶段名**: **K22-C-SCORE-REGRESSION-HARNESS-IMPLEMENTATION**

**范围**:
1. 新增 score regression verify script (vitest/Jest test file)
2. 构造 synthetic fixtures (SchedulingContext + ScheduleState builders)
3. 覆盖 full / delta consistency (Harness A)
4. 覆盖 SC1 targeted failing case (red)
5. 覆盖 HC1-HC5 hard invariant (Harness B)
6. 覆盖 default score snapshot (Harness C)
7. **暂不修 SC1**, 只让 SC1 case 作为 expected known failure 或 marked TODO

**不包含**:
- ❌ SC1 delta 修复 (K22-C+ 后续阶段, 在 harness 保护下做)
- ❌ score.ts refactor
- ❌ hardWeights/softWeights
- ❌ 7 items missing soft constraints 实施
- ❌ UI weight editor

**为什么先实现 harness 再修 SC1**:
- TDD (test-first) 确保 fix 正确且立即验证
- Harness 是 score.ts 任何后续修改的 safety net
- 避免修复引入新 bug (regression)
- 保持小步迭代, 每步可验证

---

## 15. Unmodified Scope (本阶段未修改)

- ✅ 未修改 Prisma schema
- ✅ 未修改 prisma/migrations/**
- ✅ 未修改 prisma/dev.db
- ✅ 未运行 db push / migrate / reset / seed
- ✅ 未修改 score.ts
- ✅ 未修改 solver.ts
- ✅ 未修改 scheduler.ts
- ✅ 未修改 API route
- ✅ 未修改 frontend
- ✅ 未修改 importer / parser
- ✅ 未修改 RBAC / permissions
- ✅ 未修改业务数据
- ✅ 未提交 DB backup
- ✅ 未做功能实现 (仅 plan / design)
- ✅ 未做 SC1 delta 修复 (K22-C 后续)
- ✅ 未做 harness 实际测试代码 (K22-C 后续)

---

## 16. Verification Results

| Script / Command | Result |
|---|---|
| `npx.cmd tsx scripts/plan-score-regression-harness-k22-b.ts` | **PASS** — 5 decisions, 5 risks (HIGH=1, MEDIUM=2, LOW=1, INFO=1), 5 harnesses, SC1_TARGETED_CASE designed |
| `npx.cmd tsx scripts/audit-score-constraint-inventory-k22-a.ts` | (per K22-A) HIGH=2 / MEDIUM=1 / LOW=1 / INFO=3 / NONE=1 / BLOCKING=YES |
| `npx.cmd tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | (per K21-FIX-G) 22 / 0 |
| `npx.cmd tsx scripts/verify-solver-config-api-k21-fix-f.ts` | (per K21-FIX-F) 27 / 0 |
| `npx.cmd tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | (per K21-FIX-F) 16 / 0 |
| `npx.cmd tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | (per K21-FIX-F) 19 / 0 |
| `npx.cmd tsx scripts/audit-solver-config-ui-k21-fix-d.ts` | (per K21-FIX-G-AUDIT) MEDIUM=1 / LOW=2 / NONE=4 |
| `npx.cmd tsx scripts/audit-room-capacity-and-solver-config-k21-fix-a.ts` | (per K21-FIX-A) HIGH=0 |
| `npx.cmd tsx scripts/audit-remaining-risk-rebase-k20.ts` | (per K20) HIGH=0 |
| `npx.cmd tsx scripts/verify-source-evidence-schema-k20-fix-b.ts` | 37 / 0 |
| `npx.cmd tsx scripts/verify-source-evidence-importer-k20-fix-b.ts` | 41 / 0 |
| `npx.cmd tsx scripts/verify-source-evidence-query-k20-fix-b.ts` | 16 / 0 |
| `npx.cmd tsx scripts/audit-source-evidence-backfill-gap-k20-fix-b.ts` | 2 / 0 |
| `npx.cmd tsx scripts/verify-import-approval-browser-e2e-k19-fix-c.ts` | 9 / 0 / 1 SKIP |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-ui-k19-fix-b2.ts` | 16 / 0 |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts` | 17 / 0 |
| `npx.cmd tsx scripts/verify-import-matching-cohort-guard-k19-fix-a.ts` | 31 / 0 |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH=0 / MEDIUM=0 |
| `npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | BLOCKING=NO |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23 / 0 |
| `npx prisma validate` | valid |
| `npm.cmd run build` | PASS |
| `npm.cmd run lint` | 314 (180 errors + 134 warnings), 0 new |
| `npm.cmd run test:auth-foundation` | 53 passed / 1 failed (pre-existing) |

---

## 17. Closing Note

K22-B-SCORE-REGRESSION-HARNESS-PLAN 按 spec 完整执行：

- ✅ 新增只读 plan 脚本 (`scripts/plan-score-regression-harness-k22-b.ts`)
- ✅ 新增 Markdown plan 文档 (本文件)
- ✅ 新增 JSON plan 报告 (`docs/k22-score-regression-harness-plan.json`)
- ✅ 明确 5 个 harness 类别 (A: Full/Delta, B: Hard Invariant, C: Default Snapshot, D: Fixed Seed Solver, E: K21 Config)
- ✅ 明确 SC1 targeted case (before/after/expected/current-buggy-state)
- ✅ 明确 Hard Invariant plan (HC1-HC5 minimal fixtures)
- ✅ 明确 Default Snapshot plan (synthetic, 10/20/30 fixture)
- ✅ 明确 Fixed Seed Solver plan (seed=42, score bounds, no exact schedule)
- ✅ 明确 K21 Config Regression plan (重跑现有 verify scripts)
- ✅ 明确 5 个 decisions (test-first, minimal scope, score bounds, etc.)
- ✅ 明确 5 个 risks (HIGH: SC1 fix bugs, MEDIUM: convergence, hardcoded lock-in, etc.)
- ✅ 明确 Implementation Plan (11 步, harness-first, K22-C 起)
- ✅ 明确 Suggested Next Stage: K22-C (harness implementation, 暂不修 SC1)
- ✅ 不修改任何业务代码 / 不写数据库 / 不改 score.ts
- ✅ 工作区状态: 仅新增 3 个 K22-B 文件

**本阶段可关闭, 推荐进入 K22-C-SCORE-REGRESSION-HARNESS-IMPLEMENTATION (实施 harness, 暂不修 SC1)。**
