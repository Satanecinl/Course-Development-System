# K26-J1: WorkTime Solver/Score Harness Plan

## 1. Executive Summary

本阶段 `K26-J1-WORKTIME-SOLVER-SCORE-HARNESS-PLAN` 是 K26-J 审计之后的第一阶段，**只做 harness / fixtures / verification plan**。

**J1 不实现**：

- 不改 `solver.ts` 行为；
- 不改 `score.ts` 行为；
- 不改 SchedulingRun 写逻辑；
- 不改 scheduler API；
- 不改 WorkTime API / UI / recommendation；
- 不改 schema / migration / DB；
- 不改 K22 expected；
- 不写业务数据。

**为什么必须先做 harness 而不是直接接 WorkTime**：

1. K26-J 审计确认 3 项 HIGH 风险：solver candidate generation 硬编码、score full/delta 一致性、K22 expected 大范围漂移。
2. 任何对 solver / score 的 WorkTime 接入都会**改变所有排课结果**，而现有 2200+ 行 K22-C harness 是 score 行为的事实基线。
3. 必须先有 fixture 捕获 current static behavior，再设计 future behavior 的 assertion，否则无法证明 J2/J3/J4 的回归。
4. 顺序：**fixture → harness → solver/score 改动 → 期望更新**。本阶段是 step 1。

**推荐下一阶段**：`K26-J2-WORKTIME-SCHEDULINGRUN-SNAPSHOT-WRITE`。J2 仍是只 snapshot write，不改 solver / score 行为。

---

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Local HEAD before | `5bd779a` (K26-J audit) |
| Local HEAD after | `<J1 commit>` (this stage) |
| Remote HEAD after | `<J1 commit>` |
| Push | yes |
| Force push | **no** |

---

## 3. Current K26-J Audit Baseline

K26-J 审计 (`5bd779a`) 关键发现摘要（来自 `docs/k26-worktime-solver-score-integration-audit.md`）：

- **solver candidate generation**：硬编码 `day ∈ [1,7]`, `slot ∈ [1,6]`，完全忽略 WorkTime。`solver.ts:327-328`（exhaustive）和 `solver.ts:408-413`（random）。
- **score SC3**：`score.ts:503`（full）+ `score.ts:801-802`（delta）均硬编码 `slotIndex >= 5`。
- **score SC7**：`score.ts:581`（full）+ `score.ts:924-925`（delta）均硬编码 `day >= 6`。
- **score SC5**：`score.ts:165` 硬编码 `TEACHING_DAYS = [1, 2, 3, 4, 5]`，未考虑 `allowWeekend=true` 时周末也应纳入。
- **SchedulingRun.workTimeConfigSnapshot**：schema 字段存在但**从未写入**。
- **K22 harness**：无 WorkTime fixtures。
- **K21 config**：与 WorkTime 独立，无集成。

K26-J 风险等级：3 HIGH / 4 MEDIUM / 2 LOW / 2 INFO。

---

## 4. Synthetic WorkTime Fixtures

J1 设计 5 个 synthetic WorkTime fixtures，覆盖 candidate generation、score full/delta、snapshot、K22 regression、real usage 五个 harness 维度。

### Fixture A: STATIC_BASELINE

目的：捕获当前 solver / score 静态行为作为 baseline。

```ts
{
  name: "STATIC_BASELINE",
  allowWeekend: false,
  activeTeachingSlotIndexes: [1, 2, 3, 4, 5],
  legacyDisplaySlotIndexes: [6, 7],
  allowedDayOfWeeks: [1, 2, 3, 4, 5],
  weekendDayOfWeeks: [6, 7],
  earlySlotIndexes: [1, 2],
  lateSlotIndexes: [5],
  expectedCurrentSolverBehavior: {
    exhaustiveSearchMayIncludeDays: [1, 2, 3, 4, 5, 6, 7],
    exhaustiveSearchMayIncludeSlots: [1, 2, 3, 4, 5, 6],
    randomGenerationMayIncludeDays: [1, 2, 3, 4, 5, 6, 7],
    randomGenerationMayIncludeSlots: [1, 2, 3, 4, 5, 6]
  },
  expectedFutureSolverBehavior: {
    candidateDays: [1, 2, 3, 4, 5],
    candidateSlots: [1, 2, 3, 4, 5]
  }
}
```

### Fixture B: SHORT_TEACHING_DAY

目的：验证 active slots 缩小时 solver 不生成禁用节次。

```ts
{
  name: "SHORT_TEACHING_DAY",
  allowWeekend: false,
  activeTeachingSlotIndexes: [1, 2, 3, 4],
  legacyDisplaySlotIndexes: [5, 6, 7],
  allowedDayOfWeeks: [1, 2, 3, 4, 5],
  weekendDayOfWeeks: [6, 7],
  earlySlotIndexes: [1, 2],
  lateSlotIndexes: [4],
  expectedCurrentSolverBehavior: {
    exhaustiveSearchMayIncludeSlots: [1, 2, 3, 4, 5, 6],
    randomGenerationMayIncludeSlots: [1, 2, 3, 4, 5, 6]
  },
  expectedFutureSolverBehavior: {
    candidateDays: [1, 2, 3, 4, 5],
    candidateSlots: [1, 2, 3, 4],
    forbiddenSlots: [5, 6, 7]
  }
}
```

### Fixture C: WEEKEND_ENABLED

目的：验证 `allowWeekend=true` 时 solver 可以生成周末候选。

```ts
{
  name: "WEEKEND_ENABLED",
  allowWeekend: true,
  activeTeachingSlotIndexes: [1, 2, 3, 4, 5],
  legacyDisplaySlotIndexes: [6, 7],
  allowedDayOfWeeks: [1, 2, 3, 4, 5, 6, 7],
  weekendDayOfWeeks: [6, 7],
  earlySlotIndexes: [1, 2],
  lateSlotIndexes: [5],
  expectedCurrentSolverBehavior: {
    exhaustiveSearchMayIncludeDays: [1, 2, 3, 4, 5, 6, 7],
    exhaustiveSearchMayIncludeSlots: [1, 2, 3, 4, 5, 6]
  },
  expectedFutureSolverBehavior: {
    candidateDays: [1, 2, 3, 4, 5, 6, 7],
    candidateSlots: [1, 2, 3, 4, 5]
  },
  expectedFutureScoreBehavior: {
    sc7WeekendPenaltyDays: [6, 7]
  }
}
```

### Fixture D: LATE_SLOT_REDEFINED

目的：验证 SC3 不再硬编码 `slotIndex >= 5`，而是使用 `lateSlotIndexes`。

```ts
{
  name: "LATE_SLOT_REDEFINED",
  allowWeekend: false,
  activeTeachingSlotIndexes: [1, 2, 3, 4, 5],
  legacyDisplaySlotIndexes: [6, 7],
  lateSlotIndexes: [4, 5],
  earlySlotIndexes: [1, 2, 3],
  allowedDayOfWeeks: [1, 2, 3, 4, 5],
  expectedCurrentScoreBehavior: {
    sc3LatePenaltySlots: [5]
  },
  expectedFutureScoreBehavior: {
    sc3LatePenaltySlots: [4, 5]
  }
}
```

### Fixture E: LEGACY_SLOT_MALFORMED

目的：即使 DB 错误把 6 标为 active teaching，solver 仍不能生成 legacy slot。

```ts
{
  name: "LEGACY_SLOT_MALFORMED",
  allowWeekend: false,
  activeTeachingSlotIndexes: [1, 2, 3, 4, 5, 6],
  legacyDisplaySlotIndexes: [6, 7],
  allowedDayOfWeeks: [1, 2, 3, 4, 5],
  earlySlotIndexes: [1, 2],
  lateSlotIndexes: [5],
  expectedCurrentSolverBehavior: {
    exhaustiveSearchMayIncludeSlots: [1, 2, 3, 4, 5, 6]
  },
  expectedFutureSolverBehavior: {
    candidateDays: [1, 2, 3, 4, 5],
    candidateSlots: [1, 2, 3, 4, 5],
    forbiddenSlots: [6, 7]
  },
  notes: "solver-side hard rule: even if DB mis-marks slot 6 as active teaching, slot 6/7 are display-only and must never be generated."
}
```

### Fixtures 服务矩阵

| Fixture | Candidate Generation | Score Full/Delta | Snapshot Reproducibility | K22 Regression | Real Usage Trial |
|---------|:-:|:-:|:-:|:-:|:-:|
| A STATIC_BASELINE | ✓ | ✓ | ✓ | ✓ | ✓ |
| B SHORT_TEACHING_DAY | ✓ | ✓ | — | ✓ | — |
| C WEEKEND_ENABLED | ✓ | ✓ | ✓ | ✓ | ✓ |
| D LATE_SLOT_REDEFINED | — | ✓ | — | ✓ | ✓ |
| E LEGACY_SLOT_MALFORMED | ✓ | — | — | ✓ | — |

---

## 5. Candidate Generation Harness Plan

后续 K26-J3 的 harness 目标（本阶段不实现 solver 改动，只设计 harness）。

### 5.1 关键问题回答

1. **如何捕获当前 solver 会生成 `day 6/7` 与 `slot 6`？**
   - 静态读取 `solver.ts:327-328`（exhaustive）`for (let day = 1; day <= 7; ...)` 与 `solver.ts:408-413`（random）`randInt(rng, 1, 7)` 字符模式，断言这两个 range 仍存在 → 即证明 current behavior 不变。

2. **如何在 future harness 中断言 solver 只生成 `allowedDayOfWeeks × activeTeachingSlotIndexes`？**
   - K26-J3 harness 应注入 synthetic fixture，运行 solver 多次（exhaustive + random），统计所有被 propose 的 `(day, slot)` 对的分布，断言集合 ⊆ `allowedDayOfWeeks × activeTeachingSlotIndexes`，且 slot 6/7 出现次数 = 0。

3. **exhaustive search 和 random generation 是否都要覆盖？**
   - 必须两者都覆盖，因为它们走不同代码路径（`solver.ts:310-369` vs `solver.ts:373-439`），且 random 路径走 `randInt` 而 exhaustive 走 `for` 循环。需要分别 fixture。

4. **randomSeed 如何保证 deterministic？**
   - J3 harness 必须传入固定 `randomSeed`（例如 Fixture A 用 `0`，Fixture C 用 `42`），记录每个 `(seed, fixture)` 组合的 candidate set，断言：
     - 相同 `(seed, fixture)` → 相同 candidate set（deterministic）；
     - 不同 seed → 集合大小可能不同但都 ⊆ allowed set。

5. **需要测试多少次 random move 才能覆盖非法 slot / day 风险？**
   - J3 harness 设计：每个 fixture 跑 `MAX_ITERATIONS = 20000`，每 200 iter 采样一次（≥ 100 个采样点），保证 random path 充分覆盖。Fixture E（legacy malformed）需要更多次（建议 50000）以对抗 random 偶发命中 6/7。

6. **是否应暴露 candidate generation helper 以便测试？**
   - 是。J3 实施时建议从 `solver.ts` 抽 `generateCandidateMove(ctx, state, workTimeSnapshot, rng, conflictParticipants, allMovable): Move | null` helper，便于单测。Helper 接受 `workTimeSnapshot` 参数，未传入时退化为 current static behavior（兼容 K22）。

7. **如果当前 solver 没有可单测的 candidate generator，后续是否应先抽 helper？**
   - 必须在 J3 第一步先抽 helper，再写 harness。J1 本阶段不抽。

8. **slot 6/7 legacy malformed fixture 如何断言？**
   - Fixture E 即使 active slots 包含 6，断言 candidate set 中 6/7 出现次数 = 0。这证明 solver 有独立的 legacy-slot 防御，不依赖 DB 标记。

9. **allowWeekend=false / true 如何断言？**
   - Fixture A（allowWeekend=false）断言 candidate days ⊆ [1..5]；
   - Fixture C（allowWeekend=true）断言 candidate days ⊆ [1..7] 且周末出现次数 > 0（足够 random 迭代）。

10. **如何避免 harness 依赖真实 DB 数据？**
    - 复用 K22-C 的 `buildContext` 模式（in-memory `SchedulingContext`），传入 fixture tasks / rooms / slots / WorkTime 即可，不读 DB。

### 5.2 Candidate Harness Plan Table

| Harness Case | Fixture | Current Expected | Future Expected | Implementation Stage |
|--------------|---------|------------------|-----------------|----------------------|
| C-EX-A | A STATIC_BASELINE | exhaustive uses day ∈ [1..7], slot ∈ [1..6] | exhaustive uses day ∈ [1..5], slot ∈ [1..5] | K26-J3 |
| C-EX-B | B SHORT_TEACHING_DAY | exhaustive still uses [1..6] | exhaustive uses slot ∈ [1..4] | K26-J3 |
| C-EX-C | C WEEKEND_ENABLED | exhaustive uses day ∈ [1..7] | exhaustive uses day ∈ [1..7] | K26-J3 |
| C-EX-E | E LEGACY_SLOT_MALFORMED | exhaustive allows slot 6 | exhaustive excludes slot 6/7 | K26-J3 |
| C-RND-A | A STATIC_BASELINE | random may pick day=6,7 / slot=6 | random ⊆ [1..5]×[1..5] | K26-J3 |
| C-RND-B | B SHORT_TEACHING_DAY | random may pick slot=5 | random ⊆ [1..4] | K26-J3 |
| C-RND-C | C WEEKEND_ENABLED | random day/slot includes weekend | random includes weekend, but not slot 6/7 | K26-J3 |
| C-RND-E | E LEGACY_SLOT_MALFORMED | random may pick slot 6 | random excludes 6/7 | K26-J3 |
| C-SEED-DET | all | same (seed, fixture) → same set | same property holds | K26-J3 |
| C-HELPER-EXISTS | n/a | helper not extracted | helper `generateCandidateMove` exposed | K26-J3 |

---

## 6. Score Full / Delta Harness Plan

后续 K26-J4 的 harness 目标。

### 6.1 关键问题回答

1. **哪些 SC 需要 WorkTime context？**
   - **必须**：SC3（极端时间 / lateSlotIndexes）、SC7（周末 / weekendDayOfWeeks）。
   - **建议**：SC5（教师每日课时负载均衡 / `TEACHING_DAYS` 由 `weekdayDayOfWeeks` 派生）、SC8（班级空洞 / 同 SC5）、SC9（教室稳定性 / 同 SC5）。
   - **不需**：HC1-HC6、SC1、SC2、SC4、SC6、SC10、MIN_PERT。

2. **SC3 full score 如何从 `lateSlotIndexes` 派生？**
   - 替换 `score.ts:503` 的 `p.idx >= 5` 为 `lateSlotIndexes.includes(p.idx)`。
   - J4 harness 用 Fixture D 注入 `lateSlotIndexes = [4, 5]`，断言 full score 在 idx=4 也会触发 SC3。

3. **SC3 delta score 如何使用相同 `lateSlotIndexes`？**
   - 替换 `score.ts:801-802`：
     - `if (old.slotIndex >= 5) deltaSoft -= SOFT_SC3_EXTREME_TIME` → `if (lateSlotIndexes.includes(old.slotIndex)) deltaSoft -= SOFT_SC3_EXTREME_TIME`
     - 同样 new 侧。
   - J4 harness 用 Fixture D 注入，断言 delta 在 old.slotIndex=4 / newSlotIndex=5 时 deltaSoft = +(-1) = -1。

4. **SC7 full score 如何从 `weekendDayOfWeeks` 派生？**
   - 替换 `score.ts:581` 的 `p.day >= 6` 为 `weekendDayOfWeeks.includes(p.day)`。
   - Fixture C 注入 `weekendDayOfWeeks = [6, 7]`，断言 full score 在 day=6 触发 SC7。

5. **SC7 delta score 如何使用相同 `weekendDayOfWeeks`？**
   - 替换 `score.ts:924-925`（同 SC3 模式）。

6. **SC5 teacher balance 是否要支持 weekend？**
   - 是。`TEACHING_DAYS = [1, 2, 3, 4, 5]` 应替换为 `weekdayDayOfWeeks`（默认 `[1..5]`，allowWeekend=true 时不变除非扩展）。
   - **决策（暂定）**：SC5 仍只在 weekday 上做平衡，不把周末课程纳入 balance 域。原因：周末课程是"额外"，不应破坏 weekday 内部平衡。周末本身的密度问题由 SC7 解决。
   - J4 harness 记录此决策为 contract；未来若改 `weekdayDayOfWeeks` 含义，必须更新 contract。

7. **full / delta 一致性如何断言？**
   - J4 核心 gate：每个 SC 的 full 与 delta 必须使用**相同**的 `lateSlotIndexes` / `weekendDayOfWeeks` / `weekdayDayOfWeeks`。
   - 测试方法：构造一个 state + 一个 move，分别跑 `calculateScoreWithDetails` 和 `calculateDeltaScore`，断言 `fullAfter - fullBefore == deltaSoft`（针对受影响的 SC 切片）。
   - K22-C 已有 Harness A "Full / Delta Consistency"，J4 需扩展为 K / L 群组的对应 SC。

8. **是否需要 component-level score extraction？**
   - 是。J4 建议扩展 `ScoreWithDetails.details`（或新增 parallel map）按 type 分组聚合：
     - `sumByType(type: 'SC3_*')` → 单独 SC3 penalty
     - `sumByType(type: 'SC7_*')` → 单独 SC7 penalty
   - 这是 K22-C "component-level extraction" 的延伸。

9. **是否需要保留 current static snapshot？**
   - **是**。J4 实施前，K22-C 默认 fixture 必须保持 100% 不变（baseline `73/0/0/0`），证明 current static behavior。
   - J4 实施后，新 fixture 加入 K/L 群组；K22-C 老 fixture 不动。

10. **是否需要新 K22 Harness K / L？**
    - **是**。见 §8 K22 extension。

11. **是否需要 scoreSnapshotVersion bump？**
    - **否**。J1 决策：score 函数式 + 无状态，参数即"version"。同一 fixture 同一参数必须给出相同结果，不需要 runtime version。
    - K22 现有的 `docs/k22-score-default-snapshot.json` 保持原 generatedAt 即可。

12. **如果 allowWeekend=true，SC7 是否仍处罚 weekend，还是只记录 warning？**
    - **决策（暂定）**：SC7 仍处罚（penalty 仍 = `-15`），但仅当 `weekendDayOfWeeks` 非空。如果 `allowWeekend=true` 且某天仍被识别为 weekend，**不豁免**——`weekendDayOfWeeks` 由 admin 配置控制（可以设置为空 `[]` 表示完全豁免）。
    - J4 contract 文档化：SC7 是否处罚 = `weekendDayOfWeeks.includes(p.day)`。

### 6.2 Score Harness Plan Table

| Harness Case | Fixture | Constraint | Current Expected | Future Expected | Risk |
|--------------|---------|------------|------------------|-----------------|------|
| S-FULL-D | D LATE_SLOT_REDEFINED | SC3 full | only idx=5 triggers | idx ∈ [4,5] triggers | MEDIUM |
| S-DELTA-D | D LATE_SLOT_REDEFINED | SC3 delta | only 5→6 / 4→5 boundary | symmetric on 4,5 | MEDIUM |
| S-FULL-C | C WEEKEND_ENABLED | SC7 full | day=6/7 triggers (allowWeekend ignored) | day ∈ weekendDayOfWeeks triggers | MEDIUM |
| S-DELTA-C | C WEEKEND_ENABLED | SC7 delta | symmetric on day=6/7 | symmetric on weekendDayOfWeeks | MEDIUM |
| S-FULL-A | A STATIC_BASELINE | SC3/SC7 | current static | identical to current (backward compat) | LOW |
| S-FULL-E | E LEGACY_SLOT_MALFORMED | SC3/SC7 | only 6/7 not in lateSlotIndexes | n/a (legacy slots are not score-relevant) | LOW |
| S-CONSIST-D | D LATE_SLOT_REDEFINED | SC3 full ≡ delta | boundary 5 only | boundary [4,5] | HIGH |
| S-CONSIST-C | C WEEKEND_ENABLED | SC7 full ≡ delta | day 6/7 only | weekendDayOfWeeks | HIGH |
| S-EXTRACT-S | A STATIC_BASELINE | component-level extraction | n/a (no aggregate) | sumByType works for SC3/SC7 | MEDIUM |
| S-VERSION-A | A STATIC_BASELINE | deterministic | same input → same output | same property | INFO |
| S-SC5-A | A STATIC_BASELINE | SC5 teacher balance | TEACHING_DAYS=[1..5] | weekdayDayOfWeeks (default same) | LOW |

---

## 7. SchedulingRun Snapshot Harness Plan

后续 K26-J2 的 snapshot harness。

### 7.1 关键问题回答

1. **preview 成功时如何断言 `workTimeConfigSnapshot` 已写入？**
   - 读 `SchedulingRun.workTimeConfigSnapshot` 字段，断言：
     - 非 null；
     - 符合 §7.2 schema；
     - `source === 'database'`（即非 fallback）；
     - 包含 `activeTeachingSlotIndexes`、`allowedDayOfWeeks`、`weekendDayOfWeeks`。
   - Harness 阶段（K26-J2）：用 `npx prisma db push --force-reset` 创建临时 DB → run preview → 读 run → 断言。但 K26-J2 实施时仍可走 dry-run plan 而不真正 run solver。

2. **snapshot JSON schema 应有哪些字段？**
   - 复用 K26-J 审计中的 `ResolvedWorkTimeForSolver` 形态：
     ```ts
     {
       workTimeConfigId: number | null,
       name: string,
       isDefault: boolean,
       allowWeekend: boolean,
       lunchStart: string | null,
       lunchEnd: string | null,
       semesterId: number,
       source: 'database' | 'staticFallback',
       snapshotAt: string,  // ISO timestamp
       activeTeachingSlotIndexes: number[],
       legacyDisplaySlotIndexes: number[],
       allowedDayOfWeeks: number[],
       weekdayDayOfWeeks: number[],
       weekendDayOfWeeks: number[],
       slotsByIndex: Record<number, { slotIndex, label, startsAt, endsAt, isTeachingSlot, isLegacyDisplay, sortOrder }>
     }
     ```
   - 字段尽量"自描述"，即使 WorkTimeConfig 在 snapshot 之后被删除/修改也能复现。

3. **apply 如何断言没有重新 resolve 当前 WorkTime？**
   - apply route handler 接收 preview 的 `runId`，从 DB 读 `SchedulingRun.workTimeConfigSnapshot`，再传给 apply 逻辑。
   - J2 harness 模拟场景：preview → 改 DB WorkTimeConfig → apply，断言 apply 仍使用 preview 时的 snapshot 字段值（不重新查询 DB）。

4. **rollback 是否只读取 run snapshot？**
   - 是。rollback 走 apply 的反向路径，apply 已固化使用 snapshot，rollback 同理只读 snapshot。
   - 风险：如果 snapshot 损坏，rollback 应 fail-fast，不重新 resolve。

5. **如果 WorkTime settings 在 preview 与 apply 之间改变，如何测试 apply 仍使用旧 snapshot？**
   - J2 harness 设计：
     - step 1: create WorkTimeConfig V1（allowWeekend=false）
     - step 2: preview → snapshot = V1
     - step 3: update WorkTimeConfig → V2（allowWeekend=true）
     - step 4: apply → 断言 apply 路径中 snapshot 仍 = V1（不是 V2）

6. **是否需要创建 fake run / synthetic run？**
   - 是。J2 harness 建议支持 `SchedulingRunFactory.create({ workTimeConfigSnapshot: <fixture> })`，跳过真实 solver run，直接注入 snapshot，便于单测 apply 路径。

7. **是否需要 DB write test？**
   - J2 需要创建 SchedulingRun（preview 路径）→ 读 snapshot 字段 → 验证 schema。所以 J2 阶段允许 DB 写。
   - J1 plan 不写 DB。
   - 建议：J2 实施时，使用临时 in-memory DB 或 test db，避免污染 dev.db。

8. **如果本阶段不写 DB，如何只做 plan？**
   - 已在 J1 plan 中。J1 只设计 schema 和 flow，不创建任何 fixture run。

9. **snapshot parser 失败时应该怎么处理？**
   - fail-fast。`parseWorkTimeConfigSnapshot(json)` 抛 typed error → 调度器 API 返回 `400 SnapshotCorrupt`，不 fallback。

10. **preview resolve 失败应 fail-fast 还是 fallback？**
    - **fail-fast**。preview 阶段必须明确使用哪个 WorkTimeConfig；如果 DB 中无 active config，preview 应返回 `400 NoActiveWorkTimeConfig`，**不使用 static fallback**。
    - apply 阶段也必须使用 snapshot，不重新 resolve，**不使用 static fallback**。
    - 静态 fallback 仅用于 read-only recommendation / UI 路径。

11. **static fallback 是否允许写入 snapshot？**
    - 不允许。`source === 'staticFallback'` 永远不应进入 snapshot。preview resolve 失败时直接 fail-fast。

12. **snapshot 是否应包含 slot labels / startsAt / endsAt 以便复现？**
    - **是**。`slotsByIndex` 字段保存 label / startsAt / endsAt，便于旧 run 在 audit log 中显示人类可读时间。

### 7.2 Snapshot Harness Plan Table

| Harness Case | Flow | Expected | Implementation Stage | DB Write Needed |
|--------------|------|----------|---------------------|-----------------|
| P-WRITE-1 | preview normal | snapshot written, source=database | K26-J2 | yes (SchedulingRun) |
| P-WRITE-2 | preview with default config | snapshot.workTimeConfigId === default.id | K26-J2 | yes |
| P-FAIL-1 | preview no active config | fail-fast 400, no row written | K26-J2 | no (transactional fail) |
| A-REUSE-1 | preview → mutate WorkTimeConfig → apply | apply uses old snapshot, not new DB | K26-J2 | yes |
| A-REUSE-2 | preview → delete WorkTimeConfig → apply | apply still uses snapshot (snapshot not broken) | K26-J2 | yes |
| R-REUSE-1 | preview → apply → rollback | rollback reads apply run snapshot | K26-J2 | yes |
| R-PARSE-1 | run snapshot corrupted | rollback fail-fast, no DB mutation | K26-J2 | no |
| F-LEGACY-1 | WorkTimeConfig slot 6 mis-marked active | snapshot.legacyDisplaySlotIndexes includes 6 | K26-J2 | yes (DB write to config) |
| F-WEEKEND-1 | allowWeekend=true | snapshot.allowedDayOfWeeks includes 6,7 | K26-J2 | yes |
| F-FALLBACK-1 | preview static fallback path | snapshot.source !== 'staticFallback' (fail-fast) | K26-J2 | no |
| DETERM-1 | same WorkTimeConfig → 2 previews | snapshots equal (modulo snapshotAt timestamp) | K26-J2 | yes |

---

## 8. K22 Harness Extension Plan

### 8.1 不改 K22 expected / 不更新 generated snapshot / 不动现有 fixture

- `scripts/verify-score-regression-harness-k22-c.ts` 保持原状。
- K22-C 现有 baseline `73/0/0/0`（Harness A 73 checks）必须保持。
- `docs/k22-score-default-snapshot.json` 不动。
- `docs/k22-score-regression-harness-implementation.json` 不动。

### 8.2 新增 Harness 群组（K / L / M）

| Harness Group | 目标 | Fixture 来源 | 实施阶段 |
|---------------|------|--------------|----------|
| **Harness K: WorkTime candidate generation** | 断言 solver 候选 ⊆ `allowedDays × activeTeachingSlots`；slot 6/7 排除；allowWeekend honored | Fixture A/B/C/E | K26-J3 |
| **Harness L: WorkTime score full/delta** | 断言 SC3/SC7 改用 `lateSlotIndexes` / `weekendDayOfWeeks`；full ≡ delta；K22-A 的 full/delta 一致性风格扩展 | Fixture A/C/D | K26-J4 |
| **Harness M: WorkTime snapshot reproducibility** | 断言 preview 写 snapshot；apply 复用；rollback 复用；corrupt snapshot fail-fast | Fixture 配合临时 WorkTimeConfig | K26-J2 |

### 8.3 目标与实施阶段映射

| Harness | 目标 | 实施阶段 | 是否需要 DB | 是否更新 K22 expected |
|---------|------|----------|-------------|----------------------|
| K | candidate generation 回归 | K26-J3 | 否（in-memory） | 否（独立群组） |
| L | score full/delta 一致性 | K26-J4 | 否（in-memory） | 否（独立群组） |
| M | snapshot 写读 & 复现 | K26-J2 | 是（SchedulingRun） | 否 |

### 8.4 K22-C Baseline 保持

- 现有 K22-C `73/0/0/0` 任何修改都视为 K26-J 后续阶段的 scope creep。
- J4 实施时，K22-C 的 Harness A（full/delta consistency）应**复用**而不是复制。
- K / L / M 是**新增**群组，不修改 K22-C 任何 check id。

### 8.5 Expected Update Approval Gate

- K22 / K26 score expected 任何更新必须经**显式 approval**（独立 commit + PR review），不允许 J2/J3/J4 阶段顺手改 expected。
- 实施 K/L/M 群组时，新群组**不带** K22 expected。expected 由后续 K26-K / K26-L 等 stage 显式引入。
- 原因：J1-J5 是 harness / fixture / score 接入阶段，K22 expected 是 score 行为的"金标准"。expected update 是另一回事。

### 8.6 GeneratedAt Drift Prevention

- K22 score default snapshot 的 `generatedAt` 字段在 K22-C 每次运行时会更新。
- J1-J5 实施过程中：
  - 跑 K22-C verify 时**不** commit `docs/k22-score-default-snapshot.json` 的 generatedAt 变更。
  - 实施 K/L 群组时，新群组不依赖 K22 expected，K22 snapshot 更新可被 git 忽略（除非有真实 expected 改变）。
  - 建议：CI 增加 `git status --short docs/k22-score-default-snapshot.json` 断言，禁止无 explicit approval 的 generatedAt 漂移。

---

## 9. Verification Gates

后续阶段的 close conditions。

### K26-J2 close gate

- ✅ preview writes `workTimeConfigSnapshot`（DB row 非 null，schema 合法，source=database）。
- ✅ apply reads snapshot（不重新 resolve DB）。
- ✅ apply 路径在 preview 后 WorkTimeConfig 变化时仍使用旧 snapshot。
- ✅ rollback reads apply run snapshot。
- ✅ corrupt snapshot fail-fast，无 DB 写。
- ✅ no solver candidate behavior change（exhaustive / random 范围与 K26-J 一样）。
- ✅ K22-C `73/0/0/0` 保持不变。
- ✅ SchedulingRun snapshot verify PASS（Harness M）。

### K26-J3 close gate

- ✅ candidate days = `allowedDayOfWeeks`（从 snapshot）。
- ✅ candidate slots = `activeTeachingSlotIndexes`（从 snapshot）。
- ✅ slot 6/7 excluded（即使 Fixture E DB mis-marked active）。
- ✅ allowWeekend honored（Fixture A 只 weekday，Fixture C 包含 weekend）。
- ✅ exhaustive + random 两条路径都覆盖。
- ✅ randomSeed deterministic：same (seed, fixture) → same candidate set。
- ✅ score unchanged（K22-C 仍 PASS）。
- ✅ Harness K candidate harness PASS。

### K26-J4 close gate

- ✅ SC3 uses `lateSlotIndexes`（Fixture D 验证 idx=4 触发）。
- ✅ SC7 uses `weekendDayOfWeeks`（Fixture C 验证 day=6 触发）。
- ✅ SC5 / SC8 / SC9 决策记录（weekday-only 默认不变）。
- ✅ full ≡ delta consistency for SC3 / SC7。
- ✅ score snapshot expected 仍不变（K22 行为未变）。
- ✅ no solver candidate additional drift（K26-J3 行为未变）。
- ✅ Harness L score harness PASS。
- ✅ K22-C Harness A 仍 PASS（与 K/L 共存）。

### K26-J5 close gate

- ✅ real solver preview run on dev DB（手工）。
- ✅ hardScore remains valid（无 HC 违例）。
- ✅ soft score breakdown reviewed（K22 breakdown UI 可视化）。
- ✅ user manual validation。
- ✅ rollback/apply reviewed。
- ✅ WorkTime settings change 期间无 crash。

---

## 10. Non-Goals

本阶段**未实现**：

- ❌ schema change（`prisma/schema.prisma` 未改）。
- ❌ migration（无新 `prisma/migrations/**`）。
- ❌ DB write（plan-only，不写业务数据）。
- ❌ solver behavior change（`solver.ts` 未改）。
- ❌ score change（`score.ts` 未改）。
- ❌ scheduler API behavior change（preview/apply/runs 路由未改）。
- ❌ SchedulingRun write logic change（preview 未写 snapshot，apply 未读 snapshot）。
- ❌ K22 expected change（K22-C harness 未改，K22 expected 未更新）。
- ❌ recommendation behavior change（plan / room recommendation 未改）。
- ❌ UI change（adjustment dialog / settings panel 未改）。
- ❌ reset / force reset / seed 未运行。
- ❌ K22-C 现有 73 checks 未动。

---

## 11. Verification Results

| Command | Result |
|---------|--------|
| `plan-worktime-solver-score-harness-k26-j1.ts` | **56/56 PASS** |
| `audit-worktime-solver-score-integration-k26-j.ts` | **48/48 PASS** |
| K26-I closeout | **64/64 PASS** |
| K26-I4 | **49/49 PASS** |
| K26-I3 | **40/40 PASS** |
| K26-I2 | **45/45 PASS** |
| K26-I1 | **36/36 PASS** |
| K26-I audit | **44/44 PASS** |
| K26-H closeout | **52/52 PASS** |
| K26-H2A | **15/15 PASS** |
| K26-H UI | **43/43 PASS** |
| K26-G API | **40/40 PASS** |
| K26-F1 | **30/30 PASS** |
| K26-F validation | **30/30 PASS** |
| backfill dry-run | **0 missing** |
| K26-E | **34/34 PASS** |
| K26-D | **39/39 PASS** |
| K26-C | **32/32 PASS** |
| K26-A | **47/47 PASS** |
| K26-B closeout | **38/38 PASS** |
| K25 closeout | **38/38 PASS** |
| K25-C | **PASS** |
| K22-C score harness | **PASS** |
| Prisma validate | **PASS** |
| Prisma migrate status | **up to date** (8 migrations) |
| build | **PASS** |
| lint | **184 errors / 146 warnings** (no new) |
| auth foundation | **53 passed / 1 failed** (pre-existing ScheduleAdjustment ACTIVE count) |

---

## 12. Stage Close Recommendation

- **K26-J1 可关闭**：所有 56 checks PASS，docs/json 齐备，stage-aware acceptance 满足。
- **推荐下一阶段**：`K26-J2-WORKTIME-SCHEDULINGRUN-SNAPSHOT-WRITE`。J2 仍可保持 solver / score 不变（snapshot write 只新增字段、preview/apply 路径调整）。
- **是否允许进入 K26-J2**：
  - 允许。
  - J2 范围：preview 写 snapshot + apply 读 snapshot + rollback 读 snapshot + Harness M。
  - J2 仍不改 solver / score / K22 expected / K22 baseline。
- **是否仍禁止直接实现 solver / score**：
  - 仍禁止。J1 / J2 / J3 / J4 是按顺序逐步放宽：
    - J1: plan fixtures
    - J2: snapshot write（不改 solver/score）
    - J3: solver candidate generation（首次 solver 改动；score 不变）
    - J4: score SC3/SC7（首次 score 改动；candidate 不变）
  - 任何跳过 J2 / J3 直接改 score 的 PR 视为 scope creep。
