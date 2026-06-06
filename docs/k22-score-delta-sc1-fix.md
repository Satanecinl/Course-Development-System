# K22 Score Delta SC1 Fix

| Field | Value |
|---|---|
| Phase | K22-D-SCORE-DELTA-SC1-FIX |
| Type | Targeted fix (SC1 delta logic in `calculateDeltaScore`) + regression guard |
| Generated | 2026-06-06 |
| Predecessor | K22-C-SCORE-REGRESSION-HARNESS-IMPLEMENTATION (commit `27e7317 test(scheduler): add score regression harness`) |
| Wrapper verify | `scripts/verify-score-delta-sc1-fix-k22-d.ts` |
| JSON report | `docs/k22-score-delta-sc1-fix.json` |
| Project direction | K22-SCORE-WEIGHTS-ROADMAP — 修复 K22-A HIGH 风险 SC1 delta missing |

---

## 1. Background

K22-A (commit `9885f1f`) 识别的核心 HIGH 风险是 **SC1 跨楼栋连续课 delta score 缺失**：
- `calculateScoreWithDetails` (full score) 检测 SC1：同一教师 OR 共享班级 + 同一天 + |slotIndex 差| = 1 + 不同 building。
- `calculateDeltaScore` (delta score) 完全缺少 SC1 逻辑，solver 用 delta 决策 move 时不会对跨楼栋连续课产生惩罚。
- LAHC solver 可能接受 "delta 看起来更好，但 full score 会增加跨楼栋惩罚" 的 move。

K22-B (commit `f9b27da`) 设计了 regression harness 方案。
K22-C (commit `27e7317`) 落地了 harness，K22-C verify A.2 case 是 SC1 delta regression guard，**K22-C 阶段为 KNOWN_FAIL**。

本阶段 K22-D 修复 SC1 delta missing，并使 K22-C A.2 case 转为 PASS。

---

## 2. Goal

1. 在 `calculateDeltaScore` 中添加 SC1 delta 逻辑。
2. SC1 delta 逻辑 mirror full score 的 SC1 detection。
3. 修复后 K22-C A.2 case 从 `KNOWN_FAIL` 转为 `PASS`。
4. K22-C verify 脚本：`PASS` 增加，`KNOWN_FAIL` = 0，`FAIL` = 0。
5. K22-A audit：SC1 delta coverage 更新为 true，原 HIGH finding 降级为 NONE，`BLOCKING = NO`。
6. 不改 hardWeights / softWeights。
7. 不新增 soft constraints。
8. 不重构 score.ts 大结构。
9. 不改 solver algorithm / schema / DB / frontend / API / importer / parser / RBAC。

---

## 3. Scope

### In scope（最小修改）

- `src/lib/scheduler/score.ts`：仅在 `calculateDeltaScore` 中添加 SC1 delta 块
- `scripts/verify-score-regression-harness-k22-c.ts`：A.2 case 改为 regression guard
- `scripts/audit-score-constraint-inventory-k22-a.ts`：SC1 inventory + K22-A-E-1 finding 更新
- `docs/k22-score-constraint-inventory-audit.{md,json}`：记录 K22-D 状态
- `docs/k22-score-regression-harness-implementation.{md,json}`：记录 A.2 从 KNOWN_FAIL 转 PASS
- `docs/k22-score-default-snapshot.json`：保持（fixture 不含 SC1）
- `scripts/verify-score-delta-sc1-fix-k22-d.ts`：新增 K22-D wrapper verify
- `docs/k22-score-delta-sc1-fix.{md,json}`：本阶段文档

### Out of scope（严禁处理）

- Prisma schema / migrations / dev.db
- solver algorithm（仅 score.ts 的 SC1 delta，solver.ts 不动）
- scheduler run / preview / apply / rollback API
- frontend
- importer / parser
- RBAC / permissions
- hardWeights / softWeights 字段
- SchedulingConfig schema / API
- Room / ScheduleSlot / TeachingTask / TeachingTaskClass / ClassGroup / ImportBatch / SchedulingRun / SchedulingConfig 业务数据
- K18 / K19 / K20 historical repair scripts 行为
- score.ts 全面 refactor
- building inference 统一重构
- SC4 逻辑调整
- soft constraints expansion
- task-level lock
- Playwright
- lint debt cleanup

---

## 4. Root Cause

### 4.1 SC1 Full Score Logic (`calculateScoreWithDetails` lines 205-246)

```ts
for (const p of positions) {
  if (p.room === 0) continue
  const pRoom = ctx.roomById.get(p.room)
  if (!pRoom) continue
  const pBuilding = getBuilding(pRoom)  // Room.building ?? inferBuilding(name)
  if (pBuilding === 'UNKNOWN') continue

  for (const q of positions) {
    if (q.slot.id <= p.slot.id) continue  // dedup: p.id < q.id
    if (q.room === 0) continue
    if (q.day !== p.day) continue
    if (Math.abs(q.idx - p.idx) !== 1) continue  // consecutive

    const qRoom = ctx.roomById.get(q.room)
    if (!qRoom) continue
    const qBuilding = getBuilding(qRoom)
    if (qBuilding === 'UNKNOWN' || pBuilding === qBuilding) continue  // different building

    const sameTeacher = p.slot.teachingTask.teacherId != null &&
      p.slot.teachingTask.teacherId === q.slot.teachingTask.teacherId

    let sharedClass = false
    for (const tcP of p.slot.teachingTask.taskClasses) {
      for (const tcQ of q.slot.teachingTask.taskClasses) {
        if (tcP.classGroupId === tcQ.classGroupId) { sharedClass = true; break }
      }
      if (sharedClass) break
    }

    if (sameTeacher || sharedClass) {
      softScore += SOFT_SC1_CROSS_BUILDING  // -5
      details.push({ type: 'SC1_CROSS_BUILDING_BACK_TO_BACK', ... })
    }
  }
}
```

### 4.2 Delta Score 缺失点 (K22-A 之前)

`calculateDeltaScore` 在 K22-D 之前没有 SC1 块。solver 调用 delta 决策时完全忽略 SC1。

### 4.3 LAHC 影响

- LAHC 比较 `currentScore.hardScore + currentScore.softScore` 与 `currentScore + delta`。
- 如果一个 move 引入 SC1 触发，full score 变化 -5，delta 返回 0。LAHC 看 delta 看不到惩罚，**可能接受引入 SC1 的 move**。
- 最终 best score 用 full score 追踪（solver.ts `calculateInitialScore`），所以最终 schedule 仍是 full score 最优，但中间迭代走弯路，可能错过更好的解。

---

## 5. Delta SC1 Implementation

### 5.1 修复位置

`src/lib/scheduler/score.ts` `calculateDeltaScore` 函数体，在 SC4 块之前插入：

```ts
// SC1 跨楼栋连续课（教师 + 班级维度）
// Mirror calculateScoreWithDetails SC1 detection: for each "other" slot, check
// whether (slot, other) pair triggers SC1 at the OLD position and at the NEW position.
// deltaSoft = sum over others of (newPenalty - oldPenalty) where penalty is -5 if triggered else 0.
// Clearing a trigger: +5. Introducing a trigger: -5.
for (const other of ctx.slots) {
  if (other.id === slot.id) continue
  const oPos = getPos(other, state)
  if (oPos.room === 0) continue

  const otherRoom = ctx.roomById.get(oPos.room)
  if (!otherRoom) continue

  // Pair triggers SC1 if: same day + |idx diff| = 1 + both rooms have non-UNKNOWN building
  // + different building + (same teacher OR shared class).
  const sameTeacher = task.teacherId != null && task.teacherId === other.teachingTask.teacherId
  if (!sameTeacher) {
    let sharedClass = false
    for (const tcA of task.taskClasses) {
      for (const tcB of other.teachingTask.taskClasses) {
        if (tcA.classGroupId === tcB.classGroupId) { sharedClass = true; break }
      }
      if (sharedClass) break
    }
    if (!sharedClass) continue
  }

  // OLD position: was (slot at old) paired with (other at oPos) triggering SC1?
  if (old.roomId !== 0) {
    const oldRoomObj = ctx.roomById.get(old.roomId)
    if (oldRoomObj) {
      const oldBuilding = getBuilding(oldRoomObj)
      const otherBuilding = getBuilding(otherRoom)
      if (
        oldBuilding !== 'UNKNOWN' && otherBuilding !== 'UNKNOWN' && oldBuilding !== otherBuilding &&
        old.dayOfWeek === oPos.day && Math.abs(old.slotIndex - oPos.idx) === 1
      ) {
        // Cleared: penalty was -5, now 0 → delta -= -5 = +5
        deltaSoft -= SOFT_SC1_CROSS_BUILDING
      }
    }
  }

  // NEW position: does (slot at move) paired with (other at oPos) now trigger SC1?
  if (move.newRoomId !== 0) {
    const newRoomObj = ctx.roomById.get(move.newRoomId)
    if (newRoomObj) {
      const newBuilding = getBuilding(newRoomObj)
      const otherBuilding = getBuilding(otherRoom)
      if (
        newBuilding !== 'UNKNOWN' && otherBuilding !== 'UNKNOWN' && newBuilding !== otherBuilding &&
        move.newDay === oPos.day && Math.abs(move.newSlotIndex - oPos.idx) === 1
      ) {
        // Introduced: penalty was 0, now -5 → delta += -5
        deltaSoft += SOFT_SC1_CROSS_BUILDING
      }
    }
  }
}
```

### 5.2 Affected Pair Calculation

- 只迭代 `ctx.slots` 中除 moved slot 之外的所有 slot（O(n)）。
- 对每个 other slot，检查 (moved slot, other) pair 在 old / new position 是否触发 SC1。
- `deltaSoft` 累加 = (newPenalty - oldPenalty) per pair。

### 5.3 Move Before / After 比较

- **before (old position)**: moved slot 在 `old.dayOfWeek, old.slotIndex, old.roomId`，其他 slot 在当前 `state.assignments` 位置。
- **after (new position)**: moved slot 在 `move.newDay, move.newSlotIndex, move.newRoomId`，其他 slot 仍在当前位置。
- 唯一变化是 moved slot，其他 slot 位置固定。

### 5.4 Building 判断 mirror full score

- 使用 `getBuilding(room)` helper（与 full score 相同）。
- `getBuilding` 优先用 `room.building`，fallback 到 `inferBuilding(room.name)`。
- 排除 `UNKNOWN`（与 full score 相同）。

### 5.5 deltaSoft 累加规则

- `SOFT_SC1_CROSS_BUILDING = -5`。
- 解除 SC1 trigger (penalty -5 → 0)：`deltaSoft -= SOFT_SC1_CROSS_BUILDING` 即 `deltaSoft -= (-5)` = `+5`。
- 引入 SC1 trigger (penalty 0 → -5)：`deltaSoft += SOFT_SC1_CROSS_BUILDING` 即 `deltaSoft += (-5)` = `-5`。

### 5.6 避免重复计算

- 每个 (moved slot, other) unordered pair 只被一个方向处理（moved slot 在循环主体，other 在 ctx.slots 迭代），与 full score 的 `q.slot.id > p.slot.id` dedup 语义一致。
- 全量 full score 用 O(n²)，delta 用 O(n) per move，性能可接受。

### 5.7 不改变 full score

- K22-D **未修改** `calculateScoreWithDetails`。
- K22-D **未修改** `score.ts` 中除 SC1 delta 块以外的任何代码。

### 5.8 不影响 hardScore

- SC1 delta 块只累加 `deltaSoft`。
- `deltaHard` 不受 SC1 影响（与 full score 行为一致：SC1 只贡献 softScore）。

---

## 6. Affected Pair Calculation — 边界条件

| 场景 | old position | new position | deltaSoft 变化 |
|---|---|---|---|
| 解除 SC1 trigger (A.2 case) | pair triggers | pair does not trigger | `+= +5` (cleared) |
| 引入 SC1 trigger | pair does not trigger | pair triggers | `+= -5` (introduced) |
| 维持 SC1 trigger (e.g., move preserves cross-building) | pair triggers | pair triggers | `0` (5 - 5) |
| 维持 SC1 non-trigger | pair does not trigger | pair does not trigger | `0` (0 - 0) |
| old position has `roomId = 0` (unassigned) | pair cannot trigger | (similar) | 0 |
| building inference returns 'UNKNOWN' | pair cannot trigger | (similar) | 0 |
| `sameTeacher` and `sharedClass` both false | early continue | — | 0 |
| Other slot has `roomId = 0` (unassigned) | pair cannot trigger | (similar) | 0 |

---

## 7. Full / Delta Consistency Result

### 7.1 K22-C A.2 Case

| Field | Before K22-D | After K22-D |
|---|---|---|
| `delta.deltaSoft` | -2 (only MIN_PERT, SC1 missing) | +3 (SC1 +5 cleared, MIN_PERT -2) |
| `fullSoftDelta` | +3 | +3 |
| `delta == full` | false (gap = +5) | **true** ✓ |
| Status | KNOWN_FAIL | **PASS** |

### 7.2 Other Consistency Cases (K22-C harness)

| Case | Status | Notes |
|---|---|---|
| A.1 SC2 same-day | PASS | Unchanged |
| A.2 SC1 cross-building | **PASS (was KNOWN_FAIL)** | K22-D fix |
| A.3 MIN_PERT introduction | PASS | Unchanged |
| A.3b HC1 hard delta | PASS | Unchanged |
| A.4 MIN_PERT resolution | PASS | Unchanged |
| B.1-HC1 through HC5 | PASS | Unchanged |
| B.2 Separation | PASS | Unchanged |
| C.1 Default snapshot | PASS | Unchanged (fixture has no SC1) |
| C.2 Perturbation | PASS | Unchanged |
| D.1/D.2 Fixed seed | PASS | Unchanged |
| E.1/E.2 K21 config | PASS | Unchanged |

---

## 8. Harness Result

| Field | K22-C (before K22-D) | K22-D (this phase) |
|---|---|---|
| PASS | 16 | **17** |
| KNOWN_FAIL | 1 (SC1) | **0** |
| FAIL | 0 | 0 |
| INFO | 0 | 0 |
| BLOCKING | NO | **NO** |
| Exit code | 0 | **0** |

---

## 9. K22-A Audit Alignment

| Field | K22-C baseline | K22-D |
|---|---|---|
| SC1 full coverage | true | true (unchanged) |
| SC1 delta coverage | false (HIGH) | **true** |
| K22-A-A-1 severity | HIGH (SC1 不一致) | **NONE** (HC + SC 都一致) |
| K22-A-E-1 severity | HIGH (SC1 delta missing) | **NONE** (RESOLVED in K22-D) |
| HIGH total | 2 | **0** |
| MEDIUM total | 1 | 1 (penalty constants 仍 hardcoded) |
| LOW total | 1 | 1 (SC1/SC4 building inference inconsistency) |
| INFO total | 3 | 3 (data source, HC6, 7 missing soft constraints) |
| NONE total | 1 | **3** |
| BLOCKING | YES | **NO** |

---

## 10. Verification Results

| Command | Result |
|---|---|
| `npx.cmd tsx scripts/verify-score-delta-sc1-fix-k22-d.ts` | **PASS** — 6/6 checks PASS, exit 0 |
| `npx.cmd tsx scripts/verify-score-regression-harness-k22-c.ts` | **PASS** — 17/0/0/0, BLOCKING=NO |
| `npx.cmd tsx scripts/audit-score-constraint-inventory-k22-a.ts` | **PASS** — HIGH=0, MEDIUM=1, LOW=1, INFO=3, NONE=3, BLOCKING=NO |
| `npx.cmd tsx scripts/plan-score-regression-harness-k22-b.ts` | (per K22-B) PASS |
| `npx.cmd tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | (per K21-FIX-G) 22/0 |
| `npx.cmd tsx scripts/verify-solver-config-api-k21-fix-f.ts` | (per K21-FIX-F) 27/0 |
| `npx.cmd tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | (per K21-FIX-F) 16/0 |
| `npx.cmd tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | (per K21-FIX-F) 19/0 |
| `npx.cmd tsx scripts/audit-solver-config-ui-k21-fix-d.ts` | (per K21-FIX-G-AUDIT) MEDIUM=1/LOW=2/NONE=4 |
| `npx.cmd tsx scripts/audit-room-capacity-and-solver-config-k21-fix-a.ts` | (per K21-FIX-A) HIGH=0 |
| `npx.cmd tsx scripts/audit-remaining-risk-rebase-k20.ts` | (per K20) HIGH=0 |
| `npx.cmd tsx scripts/verify-source-evidence-schema-k20-fix-b.ts` | 37/0 |
| `npx.cmd tsx scripts/verify-source-evidence-importer-k20-fix-b.ts` | 41/0 |
| `npx.cmd tsx scripts/verify-source-evidence-query-k20-fix-b.ts` | 16/0 |
| `npx.cmd tsx scripts/audit-source-evidence-backfill-gap-k20-fix-b.ts` | 2/0 |
| `npx.cmd tsx scripts/verify-import-approval-browser-e2e-k19-fix-c.ts` | 9/0/1 SKIP |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-ui-k19-fix-b2.ts` | 16/0 |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts` | 17/0 |
| `npx.cmd tsx scripts/verify-import-matching-cohort-guard-k19-fix-a.ts` | 31/0 |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH=0/MEDIUM=0 |
| `npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | BLOCKING=NO |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23/0 |
| `npx prisma validate` | valid |
| `npm.cmd run build` | PASS |
| `npm.cmd run lint` | 314 (180 errors + 134 warnings), 0 new |
| `npm.cmd run test:auth-foundation` | 53 passed / 1 failed (pre-existing) |

---

## 11. Unmodified Scope (K22-D)

- ✅ 未修改 Prisma schema
- ✅ 未修改 `prisma/migrations/**`
- ✅ 未修改 `prisma/dev.db`
- ✅ 未运行 `db push` / `migrate` / `reset` / `seed`
- ✅ 未改 hardWeights / softWeights
- ✅ 未新增 soft constraints
- ✅ 未修改 solver algorithm
- ✅ 未修改 scheduler API
- ✅ 未修改 frontend
- ✅ 未修改 importer / parser
- ✅ 未修改 RBAC / permissions
- ✅ 未修改业务数据
- ✅ 未提交 DB backup
- ✅ 未改 `calculateScoreWithDetails`（full score 不变）
- ✅ 未改 SC4 逻辑
- ✅ 未改 building inference

仅修改：

- `src/lib/scheduler/score.ts`：在 `calculateDeltaScore` 中新增 SC1 delta 块（约 50 行）
- `scripts/verify-score-regression-harness-k22-c.ts`：A.2 case 改为 PASS 期望（regression guard）
- `scripts/audit-score-constraint-inventory-k22-a.ts`：SC1 inventory + K22-A-E-1 finding 更新
- 新增 `scripts/verify-score-delta-sc1-fix-k22-d.ts`（K22-D wrapper verify）
- 文档更新：4 个 docs 文件

---

## 12. Remaining Risks

| ID | Severity | Title | Mitigation |
|---|---|---|---|
| K22-D-R-1 | MEDIUM | penalty constants 仍硬编码 | K22-SCORE-WEIGHTS-ROADMAP 解决 |
| K22-D-R-2 | LOW | SC1 vs SC4 building inference inconsistency | 未来 getBuilding() helper 统一（不影响正确性） |
| K22-D-R-3 | INFO | 7 items 常见软约束未覆盖 | K22-B-SOFT-CONSTRAINTS-ROADMAP-AUDIT 评估 |
| K22-D-R-4 | LOW | Synthetic fixture 可能不覆盖所有 edge cases | K22-D 之后可补充 real DB smoke test |
| K22-D-R-5 | INFO | LAHC solver 迭代行为可能因 SC1 delta 改变 | harness D.1/D.2 fixed seed smoke 仍 PASS，但迭代路径已变；不影响最终 best score（full score 追踪） |

---

## 13. Suggested Next Stage

**Option A: K22-SCORE-WEIGHTS-ROADMAP (penalty 动态化)**
- 解决 K22-A-C-1 MEDIUM（penalty constants 硬编码）
- 范围：(1) score.ts refactor 接收 dynamic weights；(2) SchedulingConfig 加 hardWeights/softWeights JSON 字段；(3) regression verify (复用 K22-C harness + K22-D wrapper)
- 风险：score.ts refactor 影响大，需要在 K22-C/K22-D harness 保护下做
- 推荐（解决产品化路径）

**Option B: K22-B-SOFT-CONSTRAINTS-ROADMAP-AUDIT (7 items 软约束评估)**
- 解决 K22-A-E-4 INFO（7 items 软约束未覆盖）
- 范围：评估教师均衡 / 班级空洞 / 教室稳定 / 实训匹配 / 大班优先 / 同班连续课少切换 / 教师连续课少切换 的优先级和实施顺序
- 风险：新增 soft constraints 影响 solver 收敛

**Option C: K22-SCORE-SOLVER-INTEGRATION-TEST (real DB smoke)**
- 在真实 dev.db 上跑 fixed-seed solver，验证 K22-D fix 不引入新 bug
- 范围：loadSchedulingContext → solve → 验证 bestScore 与 baseline 一致
- 风险：real DB 数据耦合，需要 baseline 快照

**推荐**: Option A（K22-SCORE-WEIGHTS-ROADMAP）—— K22-A-C-1 MEDIUM 是产品化路径，K22-C/K22-D harness 已就绪。

---

## 14. Closing Note

K22-D-SCORE-DELTA-SC1-FIX 按 spec 完整执行：

- ✅ 在 `calculateDeltaScore` 中添加 SC1 delta 逻辑（mirror full score SC1 detection）
- ✅ K22-C A.2 case 从 `KNOWN_FAIL` 转为 `PASS`
- ✅ K22-C verify: 17 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO / BLOCKING=NO
- ✅ K22-A audit: SC1 delta coverage = true, HIGH=0, BLOCKING=NO
- ✅ K22-D wrapper verify: 6/6 checks PASS
- ✅ 未改 `calculateScoreWithDetails`（full score 不变）
- ✅ 未改 solver algorithm / schema / DB / frontend / API / importer / parser / RBAC
- ✅ 未改 hardWeights / softWeights
- ✅ 未新增 soft constraints
- ✅ 工作区状态: 仅新增/修改 K22-D 相关文件

**本阶段可关闭, 推荐进入 K22-SCORE-WEIGHTS-ROADMAP (penalty 动态化) 或 K22-B-SOFT-CONSTRAINTS-ROADMAP-AUDIT (7 items 软约束评估)。**
