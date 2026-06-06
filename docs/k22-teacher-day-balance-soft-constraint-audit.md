# K22-F1 Teacher Day Balance Soft Constraint Audit

| Field | Value |
|---|---|
| Phase | K22-F1-SOFT-CONSTRAINT-TEACHER-DAY-BALANCE-AUDIT |
| Type | Read-only design audit (no Prisma writes, no score.ts modifications, no schema changes) |
| Generated | 2026-06-06 |
| Predecessor | K22-E-SOFT-CONSTRAINTS-ROADMAP-AUDIT (commit `a743bcc docs(scheduler): audit soft constraints roadmap`) |
| Audit script | `scripts/audit-teacher-day-balance-soft-constraint-k22-f1.ts` |
| JSON report | `docs/k22-teacher-day-balance-soft-constraint-audit.json` |
| Project direction | K22-F-SOFT-CONSTRAINTS-ROADMAP — 第一个 soft constraint (NEW-SC-01 教师工作日均衡) 的设计审计 |

---

## 1. Background

K22-E (commit `a743bcc`) 识别了 3 个 P0 soft constraints (NEW-SC-01/02/03) 数据已就绪、不需要 schema、LOW 复杂度。本阶段 K22-F1 只审计**第一个** P0 (NEW-SC-01 教师工作日均衡)，不实现。

K22-F1 目标是为 SC5_TEACHER_DAY_BALANCE 设计清晰、可实现、可验证的 scoring 方案，让 K22-F2 实施阶段可以严格按设计执行。

---

## 2. Goal

1. 审计当前 `score.ts` 中与教师工作量相关的逻辑（SC2, SC1, HC2）
2. 比较 3 种业务定义（Option A / B / C）
3. 推荐一种初版定义
4. 设计 full score 计算方式
5. 设计 delta score 计算方式
6. 设计 penalty 常量和命名
7. 设计 K22-C regression harness 扩展方案
8. 判断与 SC2 的重叠风险
9. 输出 K22-F2 最小实现方案
10. 不实现新 SC 逻辑
11. 不修改 score.ts / schema / DB / solver / API / frontend

---

## 3. Scope

### In scope（只读设计）

- `src/lib/scheduler/score.ts` (read-only)
- `src/lib/scheduler/**` (read-only)
- `src/lib/solver/**` (read-only)
- `prisma/schema.prisma` (read-only)
- `docs/k22-soft-constraints-roadmap-audit.md` (read-only)
- `docs/k22-score-regression-harness-implementation.md` (read-only)
- `docs/k22-score-delta-sc1-fix.md` (read-only)
- `scripts/verify-score-regression-harness-k22-c.ts` (read-only)
- `scripts/audit-soft-constraints-roadmap-k22-e.ts` (read-only)

### Out of scope（严禁处理）

- 任何 Prisma 写操作
- 任何 score.ts / solver / scheduler / API / frontend / importer / parser / RBAC 修改
- 任何 schema / migration 修改
- 任何业务数据修改
- 任何新 soft constraint 实施（K22-F2 范围）
- 任何 hardWeights / softWeights 字段
- 任何 UI weight editor

---

## 4. Existing Teacher-Related Score Logic

| Constraint | Key | Aggregation | Penalty | Delta |
|---|---|---|---:|---|
| **HC2** | `${teacherId}-${day}-${slot}` | teacher conflict (same time) | -1000 | ✅ K22-D + earlier |
| **SC1** | `${p.slot.id}, ${q.slot.id}` (pair) | cross-building back-to-back (same teacher OR shared class) | -5 | ✅ K22-D |
| **SC2** | `${teachingTaskId}-${day}` | per task-day (one task has >1 slot on same day) | -10 | ✅ |
| **SC5 (NEW)** | `${teacherId}-${day}` | per teacher-day (load balance) | -3 (proposed) | ⏳ K22-F2 |

**Key observations**:
- SC2 keys by **per task-day** (e.g., task A has 2 slots on Mon).
- SC5 (NEW) keys by **per teacher-day** (e.g., teacher T has 3 slots on Mon across tasks A, B, C).
- Different keys → independent triggers. No double-counting, no missed detection.
- HC2 is hard conflict; SC1 is cross-building; SC5 is day distribution — orthogonal concerns.

---

## 5. Definition Options

### Option A: 教师上课日数量均衡 (number-of-teaching-days balance)

- **Goal**: ensure each teacher has a similar number of distinct teaching days per week
- **Example**: penalize teachers who teach only 1 day (out of 5 weekdays) or 5 days
- **Pros**: simple, easy to communicate
- **Cons**: too coarse — a teacher with 4/0/0/0/0 has "1 day" but actually has a serious concentration issue
- **Verdict**: ❌ REJECTED — coarse metric

### Option B: 教师每日课时负载均衡 (per-day load balance) ★ RECOMMENDED

- **Goal**: ensure each teacher has a similar number of slots on each teaching day
- **Formula**:
  - For each teacher T with total weekly slots >= 3:
    - compute dailyCounts[T] = Map<dayOfWeek 1-5, slot count>
    - if max - min (over non-zero days) > 2:
      - penalty = -3 * (max - min - 2)
    - else: penalty = 0
- **Pros**:
  - Captures the actual problem (concentration)
  - Threshold-based: simple and tunable
  - Independent of total load (with skip rule for low load)
  - Reuses per-day aggregation pattern from SC2 (different key)
- **Cons**:
  - Threshold tuning requires data analysis
  - Does not consider slot consecutiveness on the same day (refinement: combine with NEW-SC-07)
- **Verdict**: ✅ RECOMMENDED

### Option C: 教师跨周分布均衡 (cross-week distribution balance)

- **Goal**: ensure each teacher has even distribution across weeks and across days
- **Example**: 8 slots in 4 weeks → 2/week; check if week 1 has 0 while week 2 has 4
- **Pros**: theoretically most thorough
- **Cons**:
  - Cross-week variance adds a dimension that is not exercised by any existing soft constraint
  - Higher complexity, higher regression risk
  - Data is available but introduces a new aggregation dimension that has never been tested
- **Verdict**: ❌ REJECTED — too complex for v1; defer to future P1/P2 stage

---

## 6. Recommended Definition

| Field | Value |
|---|---|
| **Constraint ID** | `SC5_TEACHER_DAY_BALANCE` |
| **Name** | 教师每日课时负载均衡 |
| **Teaching days** | `TEACHING_DAYS = [1, 2, 3, 4, 5]` (Mon-Fri) |
| **统计对象** | All slots with `room != 0` and `teachingTask.teacherId != null`, grouped by `teacherId` then `dayOfWeek` |
| **`min` 包含 0 课日** | **Yes** — dailyCounts 在计数前先初始化所有 TEACHING_DAYS 为 0，min 包含 0 课日 |
| **Threshold** | `LOAD_DIFF_THRESHOLD = 2` (max - min over TEACHING_DAYS must be **strictly greater than** 2) |
| **Penalty** | `SOFT_SC5_TEACHER_DAY_BALANCE = -3` per unit of imbalance (i.e., per `(max - min - 2)`) |
| **Skip rules** | `total < 3` (MIN_SLOTS_THRESHOLD), `teacherId == null`, `room == 0` |
| **Why** | Direct measure of concentration. Lighter than SC1/SC2 (preference not hard violation). Skip rule prevents over-penalizing low-load teachers. |

### Example calculations (K22-F1A corrected, min includes 0)

| Load (Mon-Fri) | Total | Max | Min | diff | Penalty |
|---|---|---|---|---|---|
| 4/0/0/0/0 | 4 | 4 | 0 | 4 | -3 * 2 = **-6** |
| 3/1/0/0/0 | 4 | 3 | 0 | 3 | -3 * 1 = **-3** |
| 3/1/0/0/1 | 5 | 3 | 0 | 3 | -3 * 1 = **-3** |
| 3/0/0/0/1 | 4 | 3 | 0 | 3 | -3 * 1 = **-3** |
| 2/1/1/1/0 | 5 | 2 | 0 | 2 | 0 (not > 2) |
| 2/2/0/0/0 | 4 | 2 | 0 | 2 | 0 (not > 2) |
| 1/1/1/1/1 | 5 | 1 | 0 | 1 | 0 (best) |
| 5/0/0/0/0 | 5 | 5 | 0 | 5 | -3 * 3 = **-9** |
| 0/4/0/0/0 | 4 | 4 | 0 | 4 | -6 |

---

## 7. SC2 Interaction

**SC2 and SC5 are independent and complementary.**

| Scenario | SC2 fires? | SC5 fires? |
|---|---|---|
| Teacher T has 1 task with 4 slots on Mon | YES (-30) | depends on T's other tasks |
| Teacher T has 4 tasks each with 1 slot on Mon | NO | YES (-6) |
| Teacher T has 2 tasks: A (2 slots Mon), B (1 slot Mon) | YES for A (-10) | YES (-3) |
| Teacher T has 1 task with 1 slot on Mon | NO | NO (total < 3) |
| Teacher T has 1 task with 2 slots on Mon | YES (-10) | NO (total < 3) |

**No double-counting**: SC2 fires per task-day pair; SC5 fires per teacher-day imbalance. They sum but not duplicate.

**Effect on existing SC2**: NONE — SC5 does not modify SC2 logic, threshold, or aggregation.

---

## 7A. K22-F1A Definition Correction

> **Stage**: K22-F1A-TEACHER-DAY-BALANCE-DEFINITION-CORRECTION
> **Status**: K22-F1 had a pseudocode-vs-harness contradiction; K22-F1A unifies the definition.

### 7A.1 Original issue

K22-F1's pseudocode used `Math.min(...dayMap.values())` after `dayMap.set(p.day, ...)` only for days that have at least one slot. This means:

- For a teacher with 4 slots on Monday only, `dayMap = {1: 4}`. `Math.min(...dayMap.values())` = 4. `max = 4`. `diff = 0`. **No penalty**.
- But the K22-F1 harness case `SC5-FULL-1` expected `penalty = -6` for this scenario.

This is a real contradiction: the recommended definition, pseudocode, and harness expectations were inconsistent.

### 7A.2 Correction

K22-F1A unifies the SC5 v1 definition:

- **`TEACHING_DAYS = [1, 2, 3, 4, 5]`** is fixed (Mon-Fri, the default 高校排课 工作日范围).
- **`dailyCounts` is initialized to 0 for all 5 teaching days BEFORE slot counting** (not lazily populated only for days that have slots).
- **`min` includes 0-count days** (max - min spans the full 5-day array, not just non-zero days).
- This is consistent with the harness expectation `4/0/0/0/0 → diff=4 → penalty=-6`.

### 7A.3 Corrected examples (K22-F1A)

| Load (Mon-Fri) | Total | Max | Min | diff | Penalty |
|---|---|---|---|---|---|
| 4/0/0/0/0 | 4 | 4 | 0 | 4 | -6 |
| 3/1/0/0/0 | 4 | 3 | 0 | 3 | -3 |
| 2/2/0/0/0 | 4 | 2 | 0 | 2 | 0 (not > 2) |
| 1/1/1/1/1 | 5 | 1 | 0 | 1 | 0 (best) |
| total = 2 (any pattern) | 2 | - | - | - | 0 (skip, total < 3) |

### 7A.4 Delta examples (K22-F1A)

- **Resolve**: `3/0/0/0/1` → `2/1/0/0/1`. Before: max=3, min=0, diff=3, penalty=-3. After: max=2, min=0, diff=2, no penalty. `deltaSoft = 0 - (-3) = +3`.
- **Introduce**: `2/0/0/0/1` → `3/0/0/0/0`. Before: max=2, min=0, diff=2, no penalty. After: max=3, min=0, diff=3, penalty=-3. `deltaSoft = -3 - 0 = -3`.

### 7A.5 Next stage implementation guidance

`K22-F2-SOFT-CONSTRAINT-TEACHER-DAY-BALANCE-IMPL` must use the K22-F1A corrected definition verbatim:

```ts
const TEACHING_DAYS = [1, 2, 3, 4, 5]

// FULL SCORE
for (const [tid, dayMap] of teacherDayCounts) {
  const loads = TEACHING_DAYS.map(d => dayMap.get(d) ?? 0)  // 5 values, includes 0
  const total = loads.reduce((a, b) => a + b, 0)
  if (total < 3) continue
  const maxLoad = Math.max(...loads)
  const minLoad = Math.min(...loads)  // includes 0
  if (maxLoad - minLoad > 2) {
    softScore += -3 * (maxLoad - minLoad - 2)
  }
}
```

Any future SC5 modifications must preserve: (a) `TEACHING_DAYS = [1,2,3,4,5]`, (b) zero-initialization, (c) min-includes-zero semantics.

---

## 8. Full Score Design

### Algorithm (K22-F1A corrected)

```
const TEACHING_DAYS = [1, 2, 3, 4, 5]

// 1. Group slots by (teacherId, dayOfWeek) using current assignment
//    K22-F1A: initialize each teacher's dayMap with all TEACHING_DAYS = 0
const teacherDayCounts = new Map<number, Map<number, number>>()
for (const p of positions) {
  if (p.room === 0) continue                          // skip unassigned
  const tid = p.slot.teachingTask.teacherId
  if (tid == null) continue                           // skip null teacher
  let dayMap = teacherDayCounts.get(tid)
  if (!dayMap) {
    dayMap = new Map()
    for (const d of TEACHING_DAYS) dayMap.set(d, 0)
    teacherDayCounts.set(tid, dayMap)
  }
  dayMap.set(p.day, (dayMap.get(p.day) ?? 0) + 1)
}

// 2. For each teacher, compute penalty
//    K22-F1A: use TEACHING_DAYS-mapped values so min can return 0
for (const [tid, dayMap] of teacherDayCounts) {
  const loads = TEACHING_DAYS.map(d => dayMap.get(d) ?? 0)
  const total = loads.reduce((a, b) => a + b, 0)
  if (total < MIN_SLOTS_THRESHOLD) continue
  const maxLoad = Math.max(...loads)
  const minLoad = Math.min(...loads)  // includes 0-count days
  if (maxLoad - minLoad > LOAD_DIFF_THRESHOLD) {
    const penalty = SOFT_SC5_TEACHER_DAY_BALANCE * (maxLoad - minLoad - LOAD_DIFF_THRESHOLD)
    softScore += penalty
    details.push({
      type: 'SC5_TEACHER_DAY_BALANCE',
      level: 'SOFT',
      penalty,
      message: `教师 ${tid}: 跨天负载 ${maxLoad}/${minLoad}`,
    })
  }
}
```

### Properties

- **Complexity**: O(n) where n = number of slots
- **Iteration**: single pass to build teacherDayCounts, single pass to compute penalty
- **Excludes**: skips `room === 0`, skips `teacherId === null`, skips teachers with total < 3
- **Details emitted**: one `SC5_TEACHER_DAY_BALANCE` detail per (teacher, imbalance) pair (not per slot)

---

## 9. Delta Score Design

### Algorithm (K22-F1A corrected)

```
const TEACHING_DAYS = [1, 2, 3, 4, 5]

// 1. Only the moved slot's teacher is affected
const task = slot.teachingTask
const tid = task.teacherId
if (tid == null) return { deltaHard, deltaSoft }   // null teacher exempt

// 2. Build dailyCounts for teacher T at OLD state (all TEACHING_DAYS initialized to 0)
const oldDailyCounts = buildTeacherDailyCounts(tid, ctx, state, excludeSlotId: slot.id, atPosition: old)

// 3. Build dailyCounts for teacher T at NEW state
const newDailyCounts = buildTeacherDailyCounts(tid, ctx, state, excludeSlotId: slot.id, atPosition: move)

// 4. Compute before / after penalty using same helper as full score
const beforePenalty = teacherImbalancePenalty(oldDailyCounts)   // shared helper
const afterPenalty = teacherImbalancePenalty(newDailyCounts)

// 5. deltaSoft += afterPenalty - beforePenalty
deltaSoft += afterPenalty - beforePenalty

// Helper: build teacher T's daily counts, with all TEACHING_DAYS initialized to 0
function buildTeacherDailyCounts(teacherId, ctx, state, excludeSlotId, atPosition) {
  const counts = new Map()
  for (const d of TEACHING_DAYS) counts.set(d, 0)   // K22-F1A: zero-initialize
  for (const slot of ctx.slots) {
    if (slot.id === excludeSlotId) continue
    if (slot.teachingTask.teacherId !== teacherId) continue
    const pos = getPos(slot, state)
    if (pos.room === 0) continue
    counts.set(pos.day, (counts.get(pos.day) ?? 0) + 1)
  }
  counts.set(atPosition.day, (counts.get(atPosition.day) ?? 0) + 1)  // re-add moved slot
  return counts
}
```

### Properties

- **Complexity**: O(1) per move (only one teacher's slots touched; teacher has ~few slots in practice)
- **Affected teacher**: only the moved slot's teacher
- **Hard score impact**: NONE
- **Reuses K22-D SC1 delta pattern**: per-teacher iteration, before/after compare, single shared helper
- **Helper `teacherImbalancePenalty`**: same code path as full score → consistency guaranteed

### Why not scan all teachers?

A move only changes the position of ONE slot. The slot belongs to ONE teaching task with ONE teacher. Only that teacher's daily count changes. All other teachers' counts are unaffected. Full scan of all teachers would be O(teachers × slots) = O(n²) worst case, but per-move we can do O(1) by scoping to the moved slot's teacher.

---

## 10. Penalty Design

| Field | Value | Rationale |
|---|---|---|
| `constraintId` | `SC5_TEACHER_DAY_BALANCE` | Following SC1-SC4 naming pattern |
| `defaultPenalty` | `-3` per unit of imbalance | Lighter than SC1 (-5) and SC2 (-10) because imbalance is preference, not violation |
| `MIN_SLOTS_THRESHOLD` | `3` | Skip rule: 1-2 slot teachers cannot meaningfully be imbalanced |
| `LOAD_DIFF_THRESHOLD` | `2` (strictly >) | Prevents penalizing minor variations like 2/1/1 |
| `configurable` | `false` (v1) | Hardcoded alongside SOFT_SC1-4 in score.ts |
| `configurableNote` | K22-weights-roadmap will move to SchedulingConfig.softWeights | |
| `inResultSnapshotConfig` | `false` (v1) | Consistent with SC1-SC4 |

### Why -3 not -5?

- SC1 = -5: cross-building affects commute time, real impact
- SC2 = -10: same task multi-session affects student focus, real impact
- SC3 = -1: extreme time slot, mild preference
- SC5 = -3: load balance, preference; less severe than SC1/SC2 but more than SC3

### Why MIN_SLOTS = 3?

- 1 slot: trivially "balanced" (any day = 1 day, no min)
- 2 slots: could be 2/0/0/0/0 or 1/1/0/0/0; the former has 1 day count but only 2 slots, the latter has 2 days
- 3 slots: minimum to compute max - min with at least 2 non-zero days; below 3 the metric becomes noisy
- 4+ slots: meaningful distribution

### Why LOAD_DIFF = 2?

- 2/2/0/0/0 (diff = 2) is balanced — both days have 2 slots, no clear winner
- 3/1/0/0/0 (diff = 2) is borderline — one day has 3, another has 1
- 3/0/0/0/0 (diff = 3) is clearly imbalanced
- 4/1/0/0/0 (diff = 3) is more imbalanced
- 4/0/0/0/0 (diff = 4) is heavily imbalanced

A threshold of 2 captures "clear imbalance" without penalizing minor variation.

---

## 11. Harness Extension Plan

9 cases proposed (4 minimum + 5 additional for thoroughness):

| Case | Category | Purpose | Expected |
|---|---|---|---|
| SC5-FULL-1 | FULL | 4 slots on Mon only → SC5 fires | hard=0, soft Δ = -6, SC5 details = 1 |
| SC5-FULL-2 | FULL | 2/2/0/0/0 (diff=2 not > 2) → no SC5 | hard=0, soft Δ = 0, SC5 details = 0 |
| SC5-FULL-3 | FULL | 2 slots only (total < 3) → no SC5 | hard=0, soft Δ = 0, SC5 details = 0 |
| SC5-DELTA-RESOLVE | DELTA_RESOLVE | Move from high-load to low-load day | hard=0, soft Δ = +3, SC5 details = 0 |
| SC5-DELTA-INTRODUCE | DELTA_INTRODUCE | Move to high-load day | hard=0, soft Δ = -3, SC5 details = 1 |
| SC5-EDGE-LOW-LOAD | EDGE | Move when total < 3 | hard=0, soft Δ = 0, SC5 details = 0 |
| SC5-EDGE-NULL-TEACHER | EDGE | Move null-teacher slot | hard=0, soft Δ = 0, SC5 details = 0 |
| SC5-EDGE-EXACT-THRESHOLD | EDGE | Boundary diff = 2 not > 2 | hard=0, soft Δ = 0, SC5 details = 0 |
| SC5-ISOLATION-SC2 | SC2_ISOLATION | SC5 + SC2 fire independently | hard=0, soft Δ = +3 (SC5 only, SC2 unchanged) |

All cases extend the existing K22-C `buildContext` / `applyMoveToState` helpers — no new helper file needed.

---

## 12. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Threshold (LOAD_DIFF=2) hardcoded; tuning may need data | LOW | Document choice; K22-weights-roadmap will move to softWeights |
| Encourages "balanced" distributions that may not match teacher preferences | LOW | Light penalty (-3) makes it preference, not requirement. K22-H NEW-SC-08 (teacher preference) lets teachers opt out |
| Skip rule for total < 3 may over-exempt low-load teachers | LOW | Acceptable trade-off. K22-F+ can add Teacher.maxDailyLoad in future schema extension |
| SC5 delta may not match full exactly when moved slot crosses teacher boundary | LOW | TeachingTask.teacherId is fixed; cannot change at solver time. Delta mirroring stays valid |
| SC5 v1 may overlap with future NEW-SC-07 (half-day balance) | INFO | SC5 = per-day, SC7 = per-half-day. Different granularity. Can coexist if implemented carefully |

---

## 13. Suggested Next Stage

**阶段名**: **K22-F2-SOFT-CONSTRAINT-TEACHER-DAY-BALANCE-IMPL**

**范围**:
1. 在 `src/lib/scheduler/score.ts` 中添加 `SC5_TEACHER_DAY_BALANCE` 块：
   - `calculateScoreWithDetails` 中实现 full score
   - `calculateDeltaScore` 中实现 delta score
   - 共享 helper `teacherImbalancePenalty(dailyCounts)` 用于一致性
2. 扩展 K22-C verify 脚本添加 9 个 SC5 cases
3. 更新 K22-C implementation doc / K22-A audit
4. 不改 schema / DB / solver / API / frontend / importer / parser / RBAC

**不包含**:
- ❌ NEW-SC-02 (班级空洞减少) — 留给 K22-F3+
- ❌ NEW-SC-03 (教室稳定性) — 留给 K22-F4+
- ❌ hardWeights / softWeights 字段（K22-weights-roadmap 范围）
- ❌ SC7 (half-day balance) — 留给 K22-G

### 为什么一次只做一个 P0

K22-E 推荐 3 个 P0 (NEW-SC-01/02/03) 一起做，但 K22-F1/F2 选择**只做 NEW-SC-01**，原因：
1. **降低实施风险**: 每个 P0 独立可测，先做 SC5 验证设计 + 流程，再做 SC6 和 SC7
2. **积累 K22-C harness 模式**: SC5 的 9 个 cases 建立 pattern，SC6/SC7 直接复用
3. **避免一次性引入 3 个新 soft constraint 的 solver 收敛性影响**: LAHC 的 acceptance path 对每个新增 delta 都敏感
4. **符合 TDD 原则**: SC5 → SC6 → SC7 顺序实施，每步都可通过 K22-C verify

---

## 14. Unmodified Scope (K22-F1)

- ✅ 未修改 Prisma schema
- ✅ 未修改 `prisma/migrations/**`
- ✅ 未修改 `prisma/dev.db`
- ✅ 未运行 `db push` / `migrate` / `reset` / `seed`
- ✅ 未修改 score.ts
- ✅ 未修改 solver algorithm
- ✅ 未修改 scheduler implementation
- ✅ 未修改 API route
- ✅ 未修改 frontend
- ✅ 未修改 importer / parser
- ✅ 未修改 RBAC / permissions
- ✅ 未修改业务数据
- ✅ 未提交 DB backup
- ✅ 未实现新 soft constraint
- ✅ 未做 score.ts refactor
- ✅ 未引入 hardWeights / softWeights 字段

---

## 15. Verification Results

| Script / Command | Result |
|---|---|
| `npx.cmd tsx scripts/audit-teacher-day-balance-soft-constraint-k22-f1.ts` | **PASS** — HIGH=0 / MEDIUM=1 / LOW=1 / INFO=1 / BLOCKING=NO |
| `npx.cmd tsx scripts/audit-soft-constraints-roadmap-k22-e.ts` | (per K22-E) PASS |
| `npx.cmd tsx scripts/verify-score-delta-sc1-fix-k22-d.ts` | (per K22-D) PASS — 6/6 checks |
| `npx.cmd tsx scripts/verify-score-regression-harness-k22-c.ts` | (per K22-C) PASS — 17/0/0/0 |
| `npx.cmd tsx scripts/audit-score-constraint-inventory-k22-a.ts` | (per K22-D) PASS — HIGH=0 |
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

## 16. Closing Note

K22-F1-SOFT-CONSTRAINT-TEACHER-DAY-BALANCE-AUDIT 按 spec 完整执行：

- ✅ 新增只读 audit 脚本 (`scripts/audit-teacher-day-balance-soft-constraint-k22-f1.ts`)
- ✅ 新增 Markdown audit 文档 (本文件)
- ✅ 新增 JSON audit 报告 (`docs/k22-teacher-day-balance-soft-constraint-audit.json`)
- ✅ 比较 3 种定义选项（A 数量 / B per-day load / C cross-week）
- ✅ 推荐 Option B (per-day load balance) — `SC5_TEACHER_DAY_BALANCE`
- ✅ 设计 full score + delta score + 共享 helper
- ✅ 设计 penalty = -3 per imbalance unit (LOAD_DIFF > 2, total >= 3)
- ✅ 9 个 harness cases (4 minimum + 5 additional)
- ✅ SC2 vs SC5 独立分析：no overlap, no double-counting
- ✅ 复用 K22-C fixture builder — 无新 helper 需要
- ✅ 下一阶段：K22-F2-SOFT-CONSTRAINT-TEACHER-DAY-BALANCE-IMPL
- ✅ 不修改 DB / schema / score.ts / solver / API / frontend / importer / parser / RBAC
- ✅ 工作区状态：仅新增 3 个 K22-F1 文件

### K22-F1A follow-up (correction)

> K22-F1A-TEACHER-DAY-BALANCE-DEFINITION-CORRECTION unifies the SC5 v1 definition.

- ✅ K22-F1A 修正 SC5 v1 定义：min 包含 0 课日，TEACHING_DAYS = [1,2,3,4,5] 固定
- ✅ 修正伪代码（buildFullScoreDesign、buildDeltaScoreDesign、buildRecommendedDefinition）
- ✅ 修正 harness case descriptions（SC5-FULL-1, SC5-DELTA-RESOLVE, SC5-DELTA-INTRODUCE, SC5-EDGE-EXACT-THRESHOLD）
- ✅ 修正 example calculation table (3/1/0/0/0 → -3, 3/0/0/0/1 → -3 等)
- ✅ 新增 finding K22-F1A-D-1 (LOW severity)
- ✅ JSON 报告新增 `correctionNote` 字段
- ✅ Markdown §7A 完整记录原问题、修正、修正后示例、下一阶段实现指南

**K22-F1 + K22-F1A 都可关闭, 推荐进入 K22-F2-SOFT-CONSTRAINT-TEACHER-DAY-BALANCE-IMPL (实施 SC5 full + delta, 必须使用 K22-F1A 修正后的定义)。**
