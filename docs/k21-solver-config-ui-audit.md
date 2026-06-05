# K21 Solver Config UI Audit

| Field | Value |
|---|---|
| Phase | K21-FIX-D-SOLVER-CONFIG-UI-AUDIT |
| Type | Read-only audit (no Prisma writes, no schema/migration, no business data mutation) |
| Generated | 2026-06-05 |
| Predecessor | K21-FIX-A-ROOM-CAPACITY-AND-SOLVER-CONFIG-AUDIT (commit `d1f9dd4 docs(scheduler): audit room capacity and solver config`) |
| Audit script | `scripts/audit-solver-config-ui-k21-fix-d.ts` |
| JSON report | `docs/k21-solver-config-ui-audit.json` |
| Project direction | K21-SCHEDULER-PRODUCTIZATION — solver config 产品化第二阶段 |

---

## 1. Background

最近完成阶段：**K21-FIX-A-ROOM-CAPACITY-AND-SOLVER-CONFIG-AUDIT** (commit `d1f9dd4`)。已关闭：

- HIGH=0 / MEDIUM=4 / LOW=1 / INFO=1 / NONE=1 / BLOCKING=NO
- Room.capacity 数据已全部为真实 (placeholder=0%, 53 个 Room 全部真实容量)
- HC4 容量约束已实现 (hard penalty -1000, 当前 0 conflict)
- 7 项常见软约束未覆盖 (教师均衡/班级空洞/教室稳定/实训匹配/大班优先等)
- SchedulingConfig 存在但 solver 实际不读取, UI 不暴露 LAHC 参数
- Preview/Apply/Rollback 闭环完整 (8 项 gate 全部实现)

K21-FIX-A 文档推荐下一阶段为 **K21-FIX-D-SOLVER-CONFIG-UI-AUDIT** (D 类别 MEDIUM, solver config + UI 暴露) — 本阶段承接该推荐, 正式进入 solver config 产品化深度设计。

**K21-FIX-D 阶段定位**：
- 审计 SchedulingConfig → solver → API → UI 的完整链路
- 审计 lockedTaskIds / lockedSlotIds 命名不一致
- 评估 config snapshot / reproducibility 完整性
- 评估 hard / soft weight 是否应纳入 config
- **不修改任何代码 / DB / schema / solver / frontend**

---

## 2. Goal

1. 审计 `SchedulingConfig` schema 字段完整性
2. 审计 solver 当前实际使用哪些 config
3. 审计 preview / apply / rollback API 如何接收 config
4. 审计当前 frontend scheduler UI 暴露了哪些参数
5. 审计 `lockedTaskIds` / `lockedSlotIds` 命名和语义不一致
6. 评估 config snapshot / reproducibility 完整性
7. 评估 hard / soft weight 是否应纳入 config
8. 输出 solver config UI 完整 roadmap
9. 给出下一阶段最小实现方案
10. 不修改 DB / schema / solver / frontend / API

---

## 3. Scope

### In scope（只读审计）

- `prisma/schema.prisma` (read-only)
- `prisma/dev.db` (Prisma read query only)
- `src/lib/scheduler/**` (read-only)
- `src/app/api/admin/scheduler/**` (read-only)
- `src/app/admin/scheduler/**` (read-only)
- `docs/k21-room-capacity-and-solver-config-audit.md` (read-only 历史报告)

### Out of scope（严禁处理）

- 任何 Prisma 写操作
- 任何 schema / migration / seed / reset
- 任何 API route 业务逻辑改动
- 任何 solver 改动
- 任何 scheduler 改动
- 任何 frontend 改动
- 任何 importer / parser 改动
- 任何 RBAC / permission 改动
- 任何 Room / ScheduleSlot / TeachingTask / TeachingTaskClass / ClassGroup / ImportBatch / SchedulingRun / SchedulingConfig 数据改动
- 任何 `prisma db push` / `migrate` / `reset` / `seed`

---

## 4. SchedulingConfig Schema Assessment

### 4.1 字段清单

`prisma/schema.prisma` SchedulingConfig model：

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int | autoincrement | PK |
| `name` | String | (required) | 业务名 |
| `semesterId` | Int? | (nullable) | semester 外键 |
| `maxIterations` | Int | 10000 | LAHC 迭代上限 |
| `lahcWindowSize` | Int | 500 | LAHC 历史窗口 |
| `lockedTaskIds` | String | "[]" | JSON 字符串 task ID 数组 |
| `createdAt` | DateTime | now() | 创建时间 |
| `runs` | relation | - | 反向关联到 SchedulingRun |

### 4.2 缺失字段

| Missing Field | Severity | Rationale |
|---|:---:|---|
| `randomSeed` (Int?) | MEDIUM | 同一 config 不能保存 "可复现" 的种子, 历史 run 不可复现 |
| `updatedAt` (DateTime @updatedAt) | MEDIUM | 字段修改无法追溯 |
| `hardWeights` (String? JSON) | MEDIUM | HC1-HC5 权重不可配置 |
| `softWeights` (String? JSON) | MEDIUM | SC1-SC4 权重不可配置 |
| `solverVersion` (String?) | LOW | solver 升级时无版本标记 |
| `configSnapshot` (String? JSON) | MEDIUM | 完整 config snapshot, for per-run reproducibility |

**DB 当前状态**: 1 条记录 (id=1, maxIterations=10000, lahcWindowSize=500, lockedTaskIds="[]").

### 4.3 评估结论

**D 类别 MEDIUM**:
- 当前 schema 仅支持 maxIterations + lahcWindowSize 2 个核心字段
- 缺 randomSeed / updatedAt / hardWeights / softWeights / solverVersion / configSnapshot
- 缺 `lockedSlotIds` 字段 (当前只叫 `lockedTaskIds`, 命名误导)
- **需要 schema migration** 加上述字段

**关键问题**: `lockedTaskIds` 字段名误导 — 维护者可能认为 solver 解析此字段, 实际未解析 (solver 用 local `SolverConfig.lockedSlotIds`).

---

## 5. Solver Config Usage

### 5.1 实际使用情况

| Parameter | Source | Used? | Evidence |
|---|---|:---:|---|
| `maxIterations` | local SolverConfig (destructured from config) | ✅ | `solver.ts:246 const { maxIterations, ... } = config` |
| `lahcWindowSize` | local SolverConfig | ✅ | `solver.ts:246` |
| `randomSeed` | local SolverConfig | ✅ | `solver.ts:235 const usedSeed = config.randomSeed ?? 0` |
| `lockedSlotIds` | local SolverConfig | ✅ | `solver.ts:256 if (!lockedSlotIds?.has(slot.id))` |
| `SchedulingConfig.maxIterations` (DB) | preview.ts only (for configId FK) | ❌ | solver never reads DB |
| `SchedulingConfig.lahcWindowSize` (DB) | (同上) | ❌ | solver never reads DB |
| `SchedulingConfig.lockedTaskIds` (DB) | (同上) | ❌ | **schema 字段从未被解析** |
| `hardWeights` / `softWeights` (DB) | n/a — schema 不存在 | ❌ | 全部硬编码 |
| `solverVersion` (DB) | n/a — schema 不存在 | ❌ | 硬编码 `lahc-hard-first-v3` |

### 5.2 评估结论

**B 类别 NONE (相对完整)**:
- 4 个 LAHC params (maxIterations, lahcWindowSize, randomSeed, lockedSlotIds) 通过 `local SolverConfig` 接口 + `preview.ts` 的 `PreviewOptions` 完整传递
- solver 实际使用所有 4 个参数 (从 destructured local config)
- preview.ts 接受 API request body, 缺省 fallback 到 server-side default
- SchedulingConfig 仅作为 `configId` 外键用于 `SchedulingRun` 关联, **不参与 solver 参数解析**

**核心发现**: 当前实现能完成 LAHC 求解, 但 `SchedulingConfig` model 实际**只是外键占位符**, 字段未被 solver 解析. 后果:
- 用户创建多个 `SchedulingConfig` 记录无意义 (字段从未被读)
- config 字段修改不影响任何 run
- 历史 config 修改不可追溯

---

## 6. Scheduler API Config Flow

### 6.1 API 端点

| Endpoint | Method | Permission | Accepts | Notes |
|---|---|---|---|---|
| `/api/admin/scheduler/preview` | POST | schedule:adjust | maxIterations, lahcWindowSize, randomSeed, lockedSlotIds, semesterId | (无 configId) |
| `/api/admin/scheduler/apply` | POST | schedule:adjust | previewRunId, confirmApply | 复用 previewRun.configId |
| `/api/admin/scheduler/rollback` | POST | schedule:adjust | applyRunId, confirmRollback | 复用 applyRun.configId |
| `/api/admin/scheduler/runs` | GET | schedule:adjust | (list query) | history list |
| `/api/admin/scheduler/runs/[id]` | GET | schedule:adjust | (detail) | run detail |
| `/api/admin/scheduler/lockable-slots` | GET | schedule:adjust | semesterId? | lockable slots |
| **/api/admin/scheduler/configs** (CRUD) | — | — | — | **不存在** |

### 6.2 Config 流转

| 阶段 | Config 处理 |
|---|---|
| Preview 请求 | API 接受 maxIterations/lahcWindowSize/randomSeed/lockedSlotIds (request body) |
| Preview 服务 | `createSchedulerPreview(options: PreviewOptions)` 用 options 字段, **不读 SchedulingConfig** |
| SchedulingConfig 解析 | preview.ts line 269-287: 仅解析 configId 外键, **不解析字段** |
| SchedulingRun 写入 | `configId: configId` (FK), `randomSeed: usedSeed`, `resultSnapshot` 含 lockedSlotIds |
| Apply 请求 | API 接受 previewRunId, **不接收 config 参数** |
| Apply 服务 | `applySchedulerPreview({ previewRunId })`, 复用 `previewRun.configId` |
| Rollback 请求 | API 接受 applyRunId |
| Rollback 服务 | 复用 `applyRun.configId` |

### 6.3 resultSnapshot 实际内容

`preview.ts:247-260`:
```ts
const resultSnapshot = JSON.stringify({
  scoreBefore, scoreAfter, hcBefore, hcAfter,
  proposedChanges, blockReasons,
  solverMetrics: solveResult.metrics ?? null,
  lockedSlotIds, lockedSlotCount: lockedSlotIds.length,
  semesterId: semester.id, semesterCode, semesterName,
})
```

| Field | In resultSnapshot? |
|---|:---:|
| `maxIterations` | ❌ |
| `lahcWindowSize` | ❌ |
| `randomSeed` (as field) | ❌ (但 SchedulingRun.randomSeed 字段存在) |
| `lockedSlotIds` | ✅ |
| `semesterId/Code/Name` | ✅ |
| `solverMetrics` | ✅ |
| `hardPenalty/softPenalty` | ❌ |

### 6.4 评估结论

**C 类别 MEDIUM**:
- preview API 接受核心 LAHC params (4 个), 但 **不接受 configId** (不能从 DB 加载)
- apply/rollback 复用 configId (✅ 正确)
- **无 config CRUD API** (用户无法创建/修改 config)
- resultSnapshot **不含 maxIterations/lahcWindowSize**, 历史 run 不可复现
- preview 验证 lockedSlotIds (✅ 防止 DB 中不存在的 slot ID)
- 缺 config 持久化和编辑能力

---

## 7. Frontend Config UI Exposure

### 7.1 UI 暴露参数清单

| Parameter | Exposed? | UI Element |
|---|:---:|---|
| `randomSeed` | ✅ | "随机种子" input (scheduler-content.tsx) |
| `lockedSlotIds` | ✅ | "锁定课表槽位" section (lockable slots 表格 + checkbox) |
| `maxIterations` | ❌ | 无 |
| `lahcWindowSize` | ❌ | 无 |
| `configPicker` (configId) | ❌ | 无 |
| `saveConfig` / `resetConfig` | ❌ | 无 |
| `hardWeights` / `softWeights` | ❌ | 无 |
| `configPreset` | ❌ | 无 |
| `perSemesterConfig` | ❌ | 无 |
| `validation` | ✅ (部分) | input 范围检查 (randomSeed 0-2147483647) |
| `lockedSlotManager` | ✅ | 已存在, 完善 |

### 7.2 UI 关键元素

`src/app/admin/scheduler/scheduler-content.tsx`:
- 随机种子 input
- 锁定课表槽位 (从 `/api/admin/scheduler/lockable-slots` 拉取)
- 运行 Preview 按钮
- 应用排课 按钮
- 撤销应用 按钮
- 重置 按钮

**缺少元素**:
- maxIterations input
- lahcWindowSize input
- config 下拉选择器
- 保存/重置 config 按钮
- config 预设/模板

### 7.3 评估结论

**D 类别 MEDIUM**:
- UI 只暴露 randomSeed + lockedSlotIds
- maxIterations / lahcWindowSize 不可调
- 无 config 选择器 / 保存按钮
- 用户每次排课都用 server-side default (10000/500)
- 不同学期需不同调参 (e.g. 春季实验课多需更长 iteration) 不可行

---

## 8. lockedTaskIds / lockedSlotIds Assessment

### 8.1 命名矩阵

| Layer | Variable Name | Type | Source |
|---|---|---|---|
| **Schema** | `SchedulingConfig.lockedTaskIds` | String (JSON array) | DB |
| **Local TS** | `SolverConfig.lockedSlotIds` | `Set<number>` | API request body |
| **API request** | `body.lockedSlotIds` | `number[]` | Frontend |
| **UI** | `lockedSlotIds` (checkbox state) | `number[]` | User |
| **Solver 实际读取** | `lockedSlotIds` | `Set<number>` | solver.ts:256 |

### 8.2 语义差异

- **`lockedTaskIds` (schema)**: 锁定整门课 (all its slots). 若 task 有 3 个 slot, 加 1 个 task ID 到 array, 3 个 slot 全部锁定.
- **`lockedSlotIds` (runtime)**: 锁定单个 slot. 若 task 有 3 个 slot, 加 1 个 slot ID 到 array, 仅该 1 个 slot 锁定, 其他 2 个仍可移动.

**风险**: 多 slot 课程 (e.g. 3 节连堂实验课) 用户预期"锁定整门课"但实际只锁 1 个 slot, 行为反直觉.

### 8.3 Schema 字段使用情况

- solver 实际使用 `lockedSlotIds` (local SolverConfig)
- `SchedulingConfig.lockedTaskIds` 字段**从未被 preview.ts 或 solver 解析**
- preview API 验证 scheduleSlot ID (不是 task ID)
- frontend 选的是 slot level

### 8.4 评估结论

**E 类别 MEDIUM**:
- 字段名误导 (维护者以为 `SchedulingConfig.lockedTaskIds` 被使用, 实际未解析)
- 任务级 vs 槽位级语义差异未文档化
- 当前 0 条数据使用 `lockedTaskIds` 字段, migration 风险低

### 8.5 推荐修复

**K21-FIX-E-LOCKED-SLOT-NAMING-AUDIT** (parallel decision):
- 阶段 1 选 A (compat): 保留双名 + alias, 文档化差异
- 阶段 2 选 C (task-level lock): 在 solver 层增加 task-level lock 解析: "if task has any locked slot, all its slots locked"
- 不需要 rename schema 字段 (当前数据为 0, 但保留向后兼容)
- 文档化: lockedTaskIds vs lockedSlotIds 语义差异

---

## 9. Config Snapshot / Reproducibility

### 9.1 当前 Snapshot 内容

`SchedulingRun.resultSnapshot` (preview.ts:247-260):
- scoreBefore, scoreAfter, hcBefore, hcAfter
- proposedChanges, blockReasons
- solverMetrics (attempted/accepted/rejected moves)
- lockedSlotIds, lockedSlotCount
- semesterId/Code/Name

**缺失**:
- `maxIterations` (历史 run 不可复现)
- `lahcWindowSize` (同上)
- `randomSeed` (但 SchedulingRun.randomSeed 字段独立存储)
- `hardPenalty` / `softPenalty` (硬编码, 修改 score.ts 会影响所有 run)
- `solverVersion` (但 SchedulingRun.solverVersion 字段独立存储)

### 9.2 databaseFingerprint 现状

`SchedulingRun.databaseFingerprint`:
- 字段存在 ✅
- Algorithm: `sha256(semesterId:slotCount:slot:teachingTaskId:dayOfWeek:slotIndex:roomId)[:16]`
- 用于 apply 阶段 DB 一致性校验 (防止 concurrent modification)
- 不用于 config snapshot, 仅用于 slot placement fingerprint

### 9.3 评估结论

**F 类别 MEDIUM** (DOWNGRADED from K21-FIX-A LOW because detailed inspection found 缺失):
- `resultSnapshot` **不含 maxIterations/lahcWindowSize**
- 若 config 修改后, 旧 run 仍引用 configId, 但内容已变, **历史 run 不可复现**
- `databaseFingerprint` 存在但仅用于 DB state check, 不用于 config snapshot
- 风险: 用户修改 config 后, 看到旧 run "看似相同" 但实际是不同参数跑出的结果

### 9.4 推荐修复

**K21-FIX-H-SCHEDULINGRUN-CONFIG-SNAPSHOT**:
- 方案 A: `resultSnapshot` 增 maxIterations/lahcWindowSize 字段
- 方案 B: 新增 `SchedulingRun.configSnapshot` String 字段, 存完整 config JSON
- 保留 `databaseFingerprint` 字段
- `SchedulingRun.randomSeed` / `solverVersion` 字段已独立存储, 保留

---

## 10. Hard / Soft Weight Configuration

### 10.1 当前 Hardcoded Values

`src/lib/scheduler/score.ts`:

| Constant | Value | Constraint |
|---|---:|---|
| `HARD_PENALTY` | -1000 | HC1-HC5 (全部 hard) |
| `SOFT_SC1_CROSS_BUILDING` | -5 | SC1 |
| `SOFT_SC2_SAME_DAY` | -10 | SC2 |
| `SOFT_SC3_EXTREME_TIME` | -1 | SC3 |
| `SOFT_SC4_CROSS_CAMPUS` | -5 | SC4 |
| `SOFT_MINIMUM_PERTURBATION` | -2 | MIN_PERT |

**全部硬编码常量**, `score.ts` 不接受 dynamic weights.

### 10.2 评估结论

**G 类别 MEDIUM**:
- 所有 weight 硬编码, 不同高校无法调整
- 工科院校可能更在意 SC3 极端时间, 文科不在意 — 当前无差别
- score.ts refactor 接收 dynamic weights 风险大, 需 regression verify
- 影响 23/31 PASS 现有 test 套件

### 10.3 推荐后置

**K21-FIX-I-SCORE-WEIGHTS-ROADMAP** (后置到 K22+):
- 阶段 1 (本阶段): 仅暴露 LAHC params (maxIterations / lahcWindowSize / randomSeed / lockedSlotIds), 不做 weight 配置
- 阶段 2 (K22): score.ts refactor 接收 dynamic weights + SchedulingConfig 加 hardWeights/softWeights JSON 字段 + regression verify

---

## 11. Findings Summary

| Severity | Count | IDs |
|---|---:|---|
| **HIGH** | **0** | — |
| **MEDIUM** | **6** | K21-D-A-1, K21-D-C-1, K21-D-D-1, K21-D-E-1, K21-D-F-1, K21-D-G-1 |
| **LOW** | **0** | — |
| **INFO** | **0** | — |
| **ACCEPTED** | **0** | — |
| **NONE** | **1** | K21-D-B-1 |
| **TOTAL** | **7** | — |
| **BLOCKING** | **NO** | — |

### 11.1 Findings 列表

| ID | Rule | Severity | Title |
|---|---|:---:|---|
| K21-D-A-1 | A. SchedulingConfig schema | MEDIUM | 缺 randomSeed, updatedAt, hardWeights, softWeights, solverVersion, configSnapshot |
| K21-D-B-1 | B. Solver config usage | NONE | local SolverConfig + API request body 完整传递 4 个 LAHC params |
| K21-D-C-1 | C. API config flow | MEDIUM | preview/apply/rollback 接受 config 不完整; 无 config CRUD API |
| K21-D-D-1 | D. Frontend UI exposure | MEDIUM | UI 缺 maxIterations / lahcWindowSize / config picker / save/reset |
| K21-D-E-1 | E. lockedTaskIds naming | MEDIUM | Schema "lockedTaskIds" vs runtime "lockedSlotIds" — 命名不一致 + 语义未文档化 |
| K21-D-F-1 | F. Config snapshot | MEDIUM | resultSnapshot 不含 maxIterations/lahcWindowSize, 历史 run 不可复现 |
| K21-D-G-1 | G. Weight config | MEDIUM | 全部 hard penalty / soft penalty 硬编码, 不支持配置 |

### 11.2 严重度分布

- **MEDIUM 6 项**：
  - A 类别：schema 字段缺失 6 项 (randomSeed, updatedAt, hardWeights, softWeights, solverVersion, configSnapshot)
  - C 类别：API 缺 configId 接受 + 无 config CRUD + resultSnapshot 不含 config
  - D 类别：UI 缺 4 项 (maxIterations, lahcWindowSize, config picker, save/reset)
  - E 类别：lockedTaskIds 命名误导 + 语义差异未文档化
  - F 类别：config snapshot 不完整
  - G 类别：weight 不可配置
- **NONE 1 项**：B 类别 solver 实际使用 4 个 LAHC params (虽然不读 DB)
- **HIGH 0 / LOW 0 / INFO 0 / ACCEPTED 0**

**主线状态**：BLOCKING: NO, 6 项 MEDIUM 不阻塞, 但建议按 roadmap 顺序处理.

---

## 12. Recommended Options

### Option A. 短期 (推荐): config CRUD API + UI 暴露 maxIterations/lahcWindowSize + resultSnapshot 加 config 字段

**Pros**:
- 解 4 项 MEDIUM 优先级最高 (A, C, D, F)
- 用户能调 LAHC 参数, 不需改 score.ts
- 历史 run 可复现
- 无 solver algorithm 改动风险

**Cons**:
- 不解决 G 类别 weight 不可配置
- lockedTaskIds 命名仍存在
- config 字段需要新 schema migration

### Option B. 中期: 加 weight 配置 (hardWeights / softWeights JSON) + score.ts refactor

**Pros**:
- 彻底解 G 类别
- 不同高校可调权重
- 为 soft constraint expansion 铺路

**Cons**:
- score.ts refactor 风险大
- 需要 regression verify
- 可能影响现有 23/31 PASS 测试

### Option C. 命名修复: 改 schema lockedTaskIds → lockedSlotIds + task-level lock 解析

**Pros**:
- 命名一致, 维护更清晰
- 支持 task-level lock (粒度粗, 防止整门课被拆散)

**Cons**:
- 需要 migration (rename field)
- 破坏性变更, 需 backward compat
- 当前 0 lockedTaskIds 数据, 风险低

### Option D. 长线: 闭环 polish (进度条, 多级 rollback, history copy-as-new-run)

**Pros**:
- 闭环体验提升
- 降低用户操作风险

**Cons**:
- 不解决 config 产品化核心问题
- 需要更多 UI 改动

### 推荐组合: A + C + B (分阶段)

- **阶段 1**: Option A (config CRUD + UI + snapshot)
- **阶段 2**: Option C (命名修复 + task-level lock)
- **阶段 3 (K22+)**: Option B (weight 配置)

---

## 13. Recommended Roadmap

### 阶段 1: K21-FIX-E-SOLVER-CONFIG-API-PLAN (top suggestion)

| Field | Value |
|---|---|
| Reason | A/C/F 类别都需要先有 config CRUD API. 当前 DB 1 条 config, 用户无法创建/修改. 是后续所有 config 产品化工作的前置. |
| Scope | 只读 audit + 设计: (1) SchedulingConfig schema migration (加 randomSeed, updatedAt, hardWeights, softWeights, solverVersion, configSnapshot); (2) /api/admin/scheduler/configs GET/POST/PUT/DELETE 设计; (3) per-semester default config 设计; (4) request/response schema. 不实施. |
| Out of scope | 不实施 migration. 不实施 API. 不改 solver. 不改 UI. |

### 阶段 2: K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION

| Field | Value |
|---|---|
| Reason | K21-FIX-E plan 完成后, 实施 config CRUD API + schema migration + solver 解析 config 字段. |
| Scope | 实施: (1) migration 加 randomSeed, updatedAt, hardWeights (JSON), softWeights (JSON), solverVersion, configSnapshot; (2) GET/POST/PUT/DELETE /api/admin/scheduler/configs; (3) preview/apply/rollback 复用 config; (4) resultSnapshot 增 solver config 字段; (5) per-semester default config resolver. 不做 weight 配置. |
| Out of scope | 不改 score.ts. 不改 UI. 不实施 hard/soft weight UI. |

### 阶段 3: K21-FIX-G-SOLVER-CONFIG-UI

| Field | Value |
|---|---|
| Reason | D 类别 MEDIUM. 用户无法 UI 调参. 当前 UI 只暴露 randomSeed + lockedSlotIds. |
| Scope | 实施 UI: (1) maxIterations input (100-15000); (2) lahcWindowSize input (50-2000); (3) randomSeed input (已存在); (4) config picker (下拉选 semester-scoped config); (5) save/reset 按钮 (保存为新 config); (6) lockedSlotIds manager (已存在, 完善); (7) input validation. |
| Out of scope | 不做 hard/soft weight UI. 不做 weight config. 不改 solver. |

### 阶段 4: K21-FIX-H-SCHEDULINGRUN-CONFIG-SNAPSHOT

| Field | Value |
|---|---|
| Reason | F 类别 MEDIUM. 当前 resultSnapshot 不含 maxIterations/lahcWindowSize. 历史 run 不可复现. |
| Scope | 实施: (1) SchedulingRun.resultSnapshot 增 maxIterations/lahcWindowSize 字段; (2) 或新增 configSnapshot String 字段存完整 config JSON; (3) databaseFingerprint 保留; (4) history 比较 readiness. |
| Out of scope | 不改 solver algorithm. 不改 apply/rollback 流程. |

### 阶段 5: K21-FIX-I-SCORE-WEIGHTS-ROADMAP (后置)

| Field | Value |
|---|---|
| Reason | G 类别 MEDIUM. 7 项常见软约束未覆盖 + weight 不可配置. 后置, 因为 score.ts refactor 风险大. |
| Scope | 只读 audit + 设计: (1) score.ts refactor 接收 dynamic weights; (2) hardWeights / softWeights JSON 字段; (3) regression verify plan; (4) 实施推迟到 K22+. |
| Out of scope | K21 不实施, K22 路线. |

### 阶段 6: K21-FIX-E-LOCKED-SLOT-NAMING-AUDIT (parallel decision)

| Field | Value |
|---|---|
| Reason | E 类别 MEDIUM. lockedTaskIds / lockedSlotIds 命名不一致. 当前 0 lockedTaskIds 数据, migration 风险低. |
| Scope | 实施: (1) 决策 task-level vs slot-level lock; (2) 推荐方案 C (task-level lock 解析); (3) migration rename lockedTaskIds → lockedSlotIds (optional, 当前数据为 0); (4) 文档化语义差异. |
| Out of scope | 不改 solver algorithm. 不改 preview API shape. 不改 UI label. |

---

## 14. Suggested Next Stage

**Top recommendation**: **K21-FIX-E-SOLVER-CONFIG-API-PLAN**

**理由**:
- C 类别 MEDIUM: 无 config CRUD API, 用户无法创建/修改 config
- F 类别 MEDIUM: resultSnapshot 不含完整 config, 历史 run 不可复现
- 是后续所有 config 产品化工作的前置 (UI/CRUD/snapshot 都依赖 schema 设计)

**Alternative priority #2**: **K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION** (直接做, 跳过 plan 阶段)

**理由**: plan 阶段较长, 可直接进入实施. 但建议先完成 plan 阶段以避免 schema 反复 migration.

**推荐执行顺序**:
1. K21-FIX-E-SOLVER-CONFIG-API-PLAN (config CRUD + schema 设计, 前置)
2. K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION (实施)
3. K21-FIX-G-SOLVER-CONFIG-UI (UI 暴露)
4. K21-FIX-H-SCHEDULINGRUN-CONFIG-SNAPSHOT (snapshot 增强)
5. K21-FIX-E-LOCKED-SLOT-NAMING-AUDIT (命名修复, parallel)
6. K22: K21-FIX-I-SCORE-WEIGHTS-ROADMAP (后置, weight 配置)

**关键决策点**:
- **是否先做 config API 还是 UI**: 先做 API (前置), UI 依赖 API
- **是否先修命名还是保留兼容**: 保留兼容 (当前数据 0, 风险低, 但保留向后兼容)
- **score weights 是否应后置**: 是, 后置到 K22+ (refactor 风险大)
- **preview/apply/rollback 是否应在本主线后处理**: 闭环完整, 仅 polish 工作, 后置

---

## 15. Unmodified Scope

本阶段 (K21-FIX-D-SOLVER-CONFIG-UI-AUDIT) **未修改**以下内容：

- **Prisma schema** — 未修改
- **`prisma/migrations/**`** — 未修改
- **`prisma/dev.db`** — 未修改 (read-only query only)
- **DB 操作** — 未运行 `prisma db push` / `migrate` / `reset` / `seed`
- **API route 业务逻辑** — 未修改 `src/app/api/**` 任何 handler
- **Frontend** — 未修改 `src/components/**` / `src/store/**` / `src/app/**` 任何客户端代码
- **Solver implementation** — 未修改 `src/lib/scheduler/score.ts` / `solver.ts` / `preview.ts` / `apply.ts` / `rollback.ts`
- **Scheduler implementation** — 未修改 `src/lib/scheduler/**` 任何文件
- **Importer / Parser** — 未修改 `src/lib/import/**` / `scripts/parse_*`
- **RBAC / permissions** — 未修改 `requirePermission` / RBAC seed / role mapping
- **seed-auth** — 未修改 `prisma/seed-auth.*` / RBAC seed 脚本
- **业务数据** — 未新增 / 修改 / 删除任何 Room / ScheduleSlot / TeachingTask / TeachingTaskClass / ClassGroup / Teacher / Course / ScheduleAdjustment / ImportBatch / SchedulingRun / SchedulingConfig 记录
- **DB backup** — 未创建, 未提交
- **re-import 历史文件** — 未执行

**本阶段唯一新增文件**：

- `scripts/audit-solver-config-ui-k21-fix-d.ts` (K21-FIX-D audit 脚本)
- `docs/k21-solver-config-ui-audit.md` (本文档)
- `docs/k21-solver-config-ui-audit.json` (JSON 报告)

---

## 16. Verification Results

| Script / Command | Result |
|---|---|
| `npx.cmd tsx scripts/audit-solver-config-ui-k21-fix-d.ts` | **PASS** — HIGH=0 / MEDIUM=6 / LOW=0 / INFO=0 / NONE=1 / TOTAL=7 / BLOCKING=NO |
| `npx.cmd tsx scripts/audit-room-capacity-and-solver-config-k21-fix-a.ts` | (per K21-FIX-A spec) HIGH=0 / MEDIUM=4 / LOW=1 / INFO=1 / NONE=1 / TOTAL=7 / BLOCKING=NO |
| `npx.cmd tsx scripts/audit-remaining-risk-rebase-k20.ts` | (per K20 spec) HIGH=0 / MEDIUM=1 / LOW=6 / ACCEPTED=1 / NONE=2 / TOTAL=10 / BLOCKING=NO |
| `npx.cmd tsx scripts/verify-source-evidence-schema-k20-fix-b.ts` | (per K20-FIX-B spec) 37 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-source-evidence-importer-k20-fix-b.ts` | (per K20-FIX-B spec) 41 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-source-evidence-query-k20-fix-b.ts` | (per K20-FIX-B spec) 16 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-source-evidence-backfill-gap-k20-fix-b.ts` | (per K20-FIX-B spec) 2 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-import-approval-browser-e2e-k19-fix-c.ts` | (per K19 spec) 9 PASS / 0 FAIL / 1 SKIP |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-ui-k19-fix-b2.ts` | (per K19 spec) 16 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts` | (per K19 spec) 17 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-import-matching-cohort-guard-k19-fix-a.ts` | (per K19 spec) 31 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | (per K14 spec) HIGH=0 / MEDIUM=0 |
| `npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | (per K16 spec) HIGH=0 / MEDIUM=0 |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | (per K16 spec) 23 PASS / 0 FAIL |
| `npx.cmd prisma validate` | valid |
| `npm.cmd run build` | (per K20-BUILD-CORRECTION) PASS |
| `npm.cmd run lint` | (per K21-FIX-A baseline) 313 problems, 0 new error |
| `npm.cmd run test:auth-foundation` | (per K20 baseline) 53 passed / 1 failed (pre-existing ScheduleAdjustment ACTIVE count mismatch) |

---

## 17. Closing Note

K21-FIX-D-SOLVER-CONFIG-UI-AUDIT 按 spec 完整执行：

- ✅ 新增只读 audit 脚本 (`scripts/audit-solver-config-ui-k21-fix-d.ts`)
- ✅ 新增 Markdown 审计文档 (本文件)
- ✅ 新增 JSON 报告 (`docs/k21-solver-config-ui-audit.json`)
- ✅ 明确 SchedulingConfig schema 字段: 缺 randomSeed, updatedAt, hardWeights, softWeights, solverVersion, configSnapshot
- ✅ 明确 solver 通过 local SolverConfig 接口取参数 (4 个 LAHC params), 不读 DB SchedulingConfig
- ✅ 明确 API 接受 4 个 LAHC params (maxIterations/lahcWindowSize/randomSeed/lockedSlotIds), 不接受 configId; apply/rollback 复用 configId; 无 config CRUD API
- ✅ 明确 UI 只暴露 randomSeed + lockedSlotIds; 缺 maxIterations/lahcWindowSize/config picker/save/reset
- ✅ 明确 lockedTaskIds (schema) vs lockedSlotIds (runtime) 命名不一致 + 语义差异未文档化
- ✅ 明确 resultSnapshot 不含 maxIterations/lahcWindowSize, 历史 run 不可复现
- ✅ 明确 hard/soft weight 全部硬编码, 不支持配置 (后置到 K22+)
- ✅ 明确下一阶段 roadmap: K21-FIX-E-API-PLAN → K21-FIX-F-API-IMPLEMENT → K21-FIX-G-UI → K21-FIX-H-SNAPSHOT → ...
- ✅ 不修改任何业务代码 / 不写数据库 / 不改 schema
- ✅ 不修改 API / frontend / solver / scheduler / importer / parser / RBAC
- ✅ 工作区状态: 仅新增 3 个 K21-FIX-D 文件

**本阶段可关闭, 推荐进入 K21-FIX-E-SOLVER-CONFIG-API-PLAN (设计阶段) 或 K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION (直接实施)。**
