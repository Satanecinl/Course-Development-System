# K22 Score Constraint Inventory Audit

| Field | Value |
|---|---|
| Phase | K22-A-SCORE-CONSTRAINT-INVENTORY-AUDIT |
| Type | Read-only audit (no Prisma writes, no score.ts modifications, no solver changes) |
| Generated | 2026-06-05 |
| Predecessor | K21-FIX-G-AUDIT-AND-LINT-ALIGNMENT (commit `ea059e0 test(scheduler): align solver config UI audit`) |
| Audit script | `scripts/audit-score-constraint-inventory-k22-a.ts` |
| JSON report | `docs/k22-score-constraint-inventory-audit.json` |
| Project direction | K22-SCORE-WEIGHTS-ROADMAP — 评分体系产品化 |

---

## 1. Background

K21-FIX-G-AUDIT-AND-LINT-ALIGNMENT 完成后，K21 主线全部关闭：

- K21-FIX-G-SOLVER-CONFIG-UI 已正式关闭
- K21-FIX-D audit: HIGH=0 / MEDIUM=1 / LOW=2 / INFO=0 / NONE=4 / BLOCKING=NO
- 唯一 MEDIUM：hard/soft weights 不可配置（设计性 deferred to K22）
- Lint baseline: 314 problems (180 errors + 134 warnings)
- Build PASS / prisma validate PASS / test:auth-foundation 53/1 (pre-existing)

K22 主线开始，但不做一次性大改。本阶段只做第一小步：盘点当前 `score.ts` 中的评分体系。

---

## 2. Goal

1. 梳理当前所有 hard constraints (HC1-HC6)
2. 梳理当前所有 soft constraints (SC1-SC4 + MIN_PERT)
3. 梳理 penalty 常量
4. 明确每个 constraint 的 full score / delta score 覆盖
5. 明确 hardScore / softScore 分离情况
6. 明确数据来源稳定性
7. 评估立即风险
8. 输出后续 K22-B regression harness 建议
9. 不修改 DB / schema / score.ts / solver / UI / API

---

## 3. Scope

### In scope（只读审计）

- `src/lib/scheduler/score.ts` (read-only)
- `src/lib/scheduler/capacity.ts` (read-only)
- `src/lib/scheduler/types.ts` (read-only)
- `src/lib/scheduler/solver.ts` (read-only)
- `prisma/schema.prisma` (read-only)
- `docs/**` (read-only)

### Out of scope（严禁处理）

- 任何 Prisma 写操作
- 任何 score.ts / solver 修改
- 任何 schema / migration
- 任何 API route 修改
- 任何 frontend 修改
- 任何业务数据修改

---

## 4. Hard Constraint Inventory

| Constraint | Meaning | Penalty | Full Score | Delta Score | Risk |
|---|---|---:|---|---|---|
| **HC1** | 教室冲突 | -1000 | ✅ | ✅ | NONE — 两个 task 在同一时间段 + 同一 roomId + 周次重叠 |
| **HC2** | 教师冲突 | -1000 | ✅ | ✅ | NONE — 同一 teacherId 在同一时间段 + 周次重叠 |
| **HC3** | 班级冲突 | -1000 | ✅ | ✅ | NONE — 同一 classGroupId 在同一时间段 + 周次重叠 |
| **HC4** | 容量超限 | -1000 | ✅ | ✅ | NONE — task 学生数 > Room.capacity |
| **HC5** | 教室不可用 | -1000 | ✅ | ✅ | NONE — RoomAvailability.available=false |
| **HC6** | 锁定课程被移动 | -1000 | ❌ (骨架) | ❌ (骨架) | INFO — 代码骨架存在但不计分，锁定通过 solver movability 控制 |

**关键观察**：
- HC1-HC5 的 full score 和 delta score 覆盖一致，无风险
- HC6 在 full score 和 delta score 中均有代码骨架，但实际不计分。注释说明 "HC6 is intentionally not counted"。锁定通过 solver 的 `lockedSlotIds` Set 控制 movability，这是正确设计

---

## 5. Soft Constraint Inventory

| Constraint | Meaning | Penalty | Full Score | Delta Score | Risk |
|---|---|---:|---|---|---|
| **SC1** | 跨楼栋连续课 | -5 | ✅ | ❌ | **HIGH** — solver delta 不含 SC1，可能接受会增加跨楼栋惩罚的 move |
| **SC2** | 同天多节 | -10 | ✅ | ✅ | NONE — full 和 delta 均覆盖 |
| **SC3** | 极端时间 | -1 | ✅ | ✅ | NONE — full 和 delta 均覆盖 |
| **SC4** | 跨校区通勤 | -5 | ✅ | ✅ | LOW — full 和 delta 均覆盖，但 building 判断逻辑与 SC1 不一致 |
| **MIN_PERT** | 最小扰动惩罚 | -2 | ✅ | ✅ | NONE — full 和 delta 均覆盖 |

**关键观察**：
- **SC1 跨楼栋连续课缺少 delta score 覆盖** — 这是一个真实 HIGH 风险
- solver 使用 `calculateDeltaScore()` 做 LAHC 决策，delta 中没有 SC1 逻辑
- 但 `calculateScoreWithDetails()` 的 full score 会计算 SC1
- 后果：solver 可能接受 "delta 看起来更好，但 full score 会增加跨楼栋惩罚" 的 move
- 最终 best score 使用 full score 追踪（solver.ts: `calculateInitialScore`），所以最终结果是 full score 最优的
- 但中间迭代效率降低，可能错过更好的解

---

## 6. Penalty Constants

| Constant | Value | File:Line | Configurable? |
|---|---:|---|---|
| `HARD_PENALTY` | -1000 | score.ts:16 | ❌ 硬编码 |
| `SOFT_SC1_CROSS_BUILDING` | -5 | score.ts:17 | ❌ 硬编码 |
| `SOFT_SC2_SAME_DAY` | -10 | score.ts:18 | ❌ 硬编码 |
| `SOFT_SC3_EXTREME_TIME` | -1 | score.ts:19 | ❌ 硬编码 |
| `SOFT_SC4_CROSS_CAMPUS` | -5 | score.ts:20 | ❌ 硬编码 |
| `SOFT_MINIMUM_PERTURBATION` | -2 | score.ts:21 | ❌ 硬编码 |

**全部硬编码**，未受 SchedulingConfig 控制。

K21-FIX-E plan 规划推迟到 K22 K21-FIX-I-SCORE-WEIGHTS-ROADMAP：
- SchedulingConfig 加 `hardWeights` / `softWeights` JSON 字段
- score.ts refactor 接收 dynamic weights
- regression verify

---

## 7. Full Score / Delta Score Coverage

### HC Coverage

| HC | Full Score | Delta Score | Consistent? |
|---|---|---|---|
| HC1 | ✅ | ✅ | ✅ |
| HC2 | ✅ | ✅ | ✅ |
| HC3 | ✅ | ✅ | ✅ |
| HC4 | ✅ | ✅ | ✅ |
| HC5 | ✅ | ✅ | ✅ |
| HC6 | ❌ (骨架) | ❌ (骨架) | ✅ (intentional) |

**HC 覆盖一致**（HC6 骨架不计分是设计决定）

### SC Coverage

| SC | Full Score | Delta Score | Consistent? |
|---|---|---|---|
| SC1 | ✅ | ❌ | ❌ **MISMATCH** |
| SC2 | ✅ | ✅ | ✅ |
| SC3 | ✅ | ✅ | ✅ |
| SC4 | ✅ | ✅ | ✅ |
| MIN_PERT | ✅ | ✅ | ✅ |

**SC1 覆盖不一致** — 这是核心发现

---

## 8. HardScore / SoftScore Separation

**分离清楚**，无混用：

- Hard constraints（HC1-HC5）仅影响 `hardScore`
- Soft constraints（SC1-SC4, MIN_PERT）仅影响 `softScore`
- `calculateScoreWithDetails()` 返回 `{ hardScore, softScore, details }`
- `calculateDeltaScore()` 返回 `{ deltaHard, deltaSoft }`
- Solver 使用 `hardScore + softScore` 的总和做 LAHC 比较，但 hard-first 排斥保证 hard score 不会因 soft 而被忽视

---

## 9. Data Source Readiness

| Data | Source | Stable? |
|---|---|---|
| roomId | `ScheduleSlot.roomId` (FK to Room) | ✅ |
| teacherId | `TeachingTask.teacherId` (FK to Teacher, nullable) | ✅ |
| classGroupIds | `TeachingTaskClass.classGroupId` (FK to ClassGroup) | ✅ |
| Room.capacity | `Room.capacity` (K21-FIX-A: all 53 rooms real capacity) | ✅ |
| studentCount | `ClassGroup.studentCount` (nullable, fallback 50) | ✅ |
| RoomAvailability | `RoomAvailability` table (default all available) | ✅ |
| building | `Room.building` (nullable, `inferBuilding()` fallback) | ✅ |
| originalAssignments | `ScheduleState.originalAssignments` (built at solver init) | ✅ |

---

## 10. Immediate Risks

### HIGH: SC1 delta missing

**问题**：`calculateDeltaScore()` 中没有 SC1（跨楼栋连续课）的逻辑。

**影响**：
- solver 使用 delta score 做 LAHC 决策，不会对跨楼栋连续课产生惩罚
- 但 `calculateScoreWithDetails()` 的 full score 会计算 SC1
- 后果：solver 可能接受 "delta 看起来更好，但 full score 会增加跨楼栋惩罚" 的 move
- 最终 best score 使用 full score 追踪，所以最终结果是 full score 最优的
- 但中间迭代效率降低，可能错过更好的解

**根因**：SC1 的 delta 计算比 HC 复杂（需要检查同一教师/班级的相邻 slot 是否跨楼栋），实现成本较高，当时未实现。

**建议**：K22-B: 为 SC1 添加 delta score 逻辑

### MEDIUM: All penalty constants hardcoded

**问题**：所有 penalty 常量硬编码，不同高校无法调整权重。

**影响**：限制产品化，不构成 bug。

**建议**：K22 K21-FIX-I-SCORE-WEIGHTS-ROADMAP

### INFO: HC6 not scored (intentional)

**问题**：HC6 代码骨架存在但不计分。

**影响**：无风险。锁定通过 solver 的 movability 控制。

### INFO: 7 items missing soft constraints

**问题**：教师均衡、班级空洞减少、教室稳定、实训匹配、大班优先、同班连续课少切换、教师连续课少切换。

**影响**：影响排课质量，不构成 bug。

---

## 11. Findings Summary

| ID | Severity | Category | Finding |
|---|---|---|---|
| K22-A-A-1 | HIGH | Full/delta consistency | SC1 跨楼栋连续课 full=✅ delta=❌，solver 使用 delta 可能接受增加跨楼栋惩罚的 move |
| K22-A-B-1 | NONE | Hard/soft separation | HardScore 和 softScore 分离清楚，无混用 |
| K22-A-C-1 | MEDIUM | Penalty constants | 所有 penalty 常量硬编码，未受 SchedulingConfig 控制 |
| K22-A-D-1 | INFO | Data source readiness | 所有 constraint 数据来源稳定 |
| K22-A-E-1 | HIGH | Immediate risk | SC1 缺少 delta score，solver 迭代效率降低 |
| K22-A-E-2 | INFO | HC6 not scored | 代码骨架存在但不计分，锁定通过 movability 控制 |
| K22-A-E-3 | LOW | SC1 vs SC4 building inconsistency | SC1 使用 inferBuilding fallback，SC4 仅用 Room.building |
| K22-A-E-4 | INFO | Missing soft constraints | 7 items 常见软约束未覆盖 |

**Summary: HIGH=2 / MEDIUM=1 / LOW=1 / INFO=3 / NONE=1 / BLOCKING=YES**

**BLOCKING=YES**: SC1 delta missing 是真实 HIGH 风险，需要在 K22-B 中解决。

---

## 12. Recommended Next Stage

**阶段名**: **K22-B-SCORE-REGRESSION-HARNESS-PLAN**

**原因**:
- SC1 delta missing 是核心 HIGH 风险，需要先建立 regression harness 才能安全修复
- penalty constants 硬编码是 MEDIUM，需要 score.ts refactor，也需要 regression harness
- 7 items missing soft constraints 需要评估优先级，也需要 regression harness

**范围**:
1. 设计 score.ts regression test 套件（full score + delta score 一致性验证）
2. 为 SC1 添加 delta score 逻辑（在 harness 保护下）
3. 评估 7 items missing soft constraints 的优先级和实施顺序
4. 为 penalty constants 动态化设计 API + schema 方案

**不包含**:
- ❌ 实现新的 soft constraints（K22-B 设计，K22-C+ 实施）
- ❌ score.ts refactor（K22-B 设计，K22-C+ 实施）
- ❌ hardWeights/softWeights JSON 字段（K22-B 设计，K22-C+ 实施）
- ❌ UI weight editor（K22-C+）
- ❌ 新 soft constraints 实施（K22-C+）

---

## 13. Unmodified Scope

本阶段 (K22-A-SCORE-CONSTRAINT-INVENTORY-AUDIT) **未修改**以下内容：

- **Prisma schema** — 未修改
- **`prisma/migrations/**`** — 未修改
- **`prisma/dev.db`** — 未修改
- **DB 操作** — 未运行 `prisma db push` / `migrate` / `reset` / `seed`
- **score.ts** — 未修改
- **solver.ts** — 未修改
- **scheduler.ts** — 未修改
- **API route** — 未修改
- **Frontend** — 未修改
- **Importer / Parser** — 未修改
- **RBAC / Permissions** — 未修改
- **业务数据** — 未修改

---

## 14. Verification Results

| Script / Command | Result |
|---|---|
| `npx.cmd tsx scripts/audit-score-constraint-inventory-k22-a.ts` | **PASS** — HIGH=2 / MEDIUM=1 / LOW=1 / INFO=3 / NONE=1 / BLOCKING=YES |
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

## 15. Closing Note

K22-A-SCORE-CONSTRAINT-INVENTORY-AUDIT 按 spec 完整执行：

- ✅ 新增只读 audit 脚本 (`scripts/audit-score-constraint-inventory-k22-a.ts`)
- ✅ 新增 Markdown 审计文档 (本文件)
- ✅ 新增 JSON 报告 (`docs/k22-score-constraint-inventory-audit.json`)
- ✅ 明确 hard constraints: HC1-HC5 (full+delta 一致), HC6 (骨架, 不计分, intentional)
- ✅ 明确 soft constraints: SC1 (HIGH: delta 缺失), SC2-SC4 (full+delta 一致), MIN_PERT (一致)
- ✅ 明确 penalty constants: 全部硬编码, 未受 SchedulingConfig 控制
- ✅ 明确 full/delta 覆盖: HC 一致, SC1 不一致 (HIGH)
- ✅ 明确 hardScore/softScore 分离: 清晰, 无混用
- ✅ 明确数据来源: 稳定, K21-FIX-A 已确认
- ✅ 立即风险: SC1 delta missing (HIGH), penalty constants hardcoded (MEDIUM), missing soft constraints (INFO)
- ✅ 不修改任何业务代码 / 不写数据库 / 不改 score.ts
- ✅ 工作区状态: 仅新增 3 个 K22-A 文件

**本阶段可关闭, 推荐进入 K22-B-SCORE-REGRESSION-HARNESS-PLAN (建立 regression harness, 然后安全修复 SC1 delta)。**
