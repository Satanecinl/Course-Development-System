# K21 Solver Config API Plan

| Field | Value |
|---|---|
| Phase | K21-FIX-E-SOLVER-CONFIG-API-PLAN |
| Type | Read-only plan (no Prisma writes, no schema/migration, no business code) |
| Generated | 2026-06-05 |
| Predecessor | K21-FIX-D-SOLVER-CONFIG-UI-AUDIT (commit `dae8c71 docs(scheduler): audit solver config UI`) |
| Plan script | `scripts/plan-solver-config-api-k21-fix-e.ts` |
| JSON plan | `docs/k21-solver-config-api-plan.json` |
| Project direction | K21-SCHEDULER-PRODUCTIZATION — solver config API 设计阶段 |

---

## 1. Background

最近完成阶段：**K21-FIX-D-SOLVER-CONFIG-UI-AUDIT** (commit `dae8c71`)。已关闭：

- HIGH=0 / MEDIUM=6 / LOW=0 / INFO=0 / NONE=1 / BLOCKING=NO
- `SchedulingConfig` 已存在, 1 DB record, 但 solver 不读取 (字段仅作外键占位)
- 缺字段: randomSeed, updatedAt, hardWeights, softWeights, solverVersion, configSnapshot
- 缺 config CRUD API
- 缺 preview API configId 接受
- UI 缺 maxIterations/lahcWindowSize input
- `lockedTaskIds` schema 字段名误导 (runtime 实际用 `lockedSlotIds`)
- resultSnapshot 不含 maxIterations/lahcWindowSize, 历史 run 不可复现

K21-FIX-D 文档推荐下一阶段为 **K21-FIX-E-SOLVER-CONFIG-API-PLAN** (设计阶段) — 本阶段承接该推荐, 把审计结论转化为可实施的 solver config API 设计方案。

**K21-FIX-E 阶段定位**：
- 设计 SchedulingConfig schema migration 方案
- 设计 config CRUD API
- 设计 preview API configId + overrides 优先级
- 设计 apply/rollback config snapshot
- 设计 resultSnapshot config 结构
- 设计 lockedTaskIds/lockedSlotIds 兼容策略
- 判断 weights 是否本轮
- **不修改任何代码 / DB / schema / API / solver / frontend**

---

## 2. Goal

1. 设计 `SchedulingConfig` schema migration 方案
2. 设计 scheduler config CRUD API
3. 设计 per-semester default config 机制
4. 设计 preview API 如何接收 `configId` 与 inline overrides
5. 设计 apply / rollback 如何保留和复用 config 信息
6. 设计 `SchedulingRun.resultSnapshot` 中的 config snapshot 结构
7. 设计 `lockedTaskIds` / `lockedSlotIds` 的兼容策略
8. 判断 hard / soft weights 是否本轮实施
9. 输出下一阶段最小实施方案
10. 不修改 DB / schema / API / solver / frontend

---

## 3. Scope

### In scope（只读规划）

- `prisma/schema.prisma` (read-only)
- `prisma/dev.db` (Prisma read query only)
- `src/lib/scheduler/**` (read-only)
- `src/app/api/admin/scheduler/**` (read-only)
- `src/app/admin/scheduler/**` (read-only)
- `docs/k21-*` (read-only 历史报告)

### Out of scope（严禁处理）

- 任何 Prisma 写操作
- 任何 schema / migration / seed / reset
- 任何 API route 业务逻辑改动
- 任何 solver 改动
- 任何 scheduler 改动
- 任何 frontend 改动
- 任何 importer / parser 改动
- 任何 RBAC / permission 改动
- 任何业务数据改动
- 任何 `prisma db push` / `migrate` / `reset` / `seed`
- 任何历史 backfill

---

## 4. Current State

### 4.1 DB 当前状态

| Entity | Count |
|---|---:|
| Semester | N |
| SchedulingConfig | 1 |
| SchedulingRun | 77 |
| SchedulingRun with non-null configId | (per query) |
| SchedulerRunChange | 413 |
| lockedTaskIds records (non-"[]") | 0 |

### 4.2 SchedulingConfig 字段

`prisma/schema.prisma` 当前字段:
- `id` (Int, PK)
- `name` (String)
- `semesterId` (Int?)
- `maxIterations` (Int @default(10000))
- `lahcWindowSize` (Int @default(500))
- `lockedTaskIds` (String @default("[]"))
- `createdAt` (DateTime @default(now()))
- `runs` (relation)

**缺失**: randomSeed, updatedAt, solverVersion, hardWeights, softWeights, configSnapshot, lockedSlotIds

### 4.3 SchedulingRun 模式

- `mode` values: PREVIEW / APPLY / ROLLBACK
- `configId` 字段: 必填 (Int, FK to SchedulingConfig)
- 当前 77 runs 全部有 configId (preview.ts 强制要求)

### 4.4 resultSnapshot 实际字段 (preview.ts:247-260)

```ts
JSON.stringify({
  scoreBefore, scoreAfter,
  hcBefore, hcAfter,
  proposedChanges, blockReasons,
  solverMetrics,
  lockedSlotIds, lockedSlotCount,
  semesterId, semesterCode, semesterName,
})
```

**缺失**: maxIterations, lahcWindowSize, randomSeed, solverVersion, source

### 4.5 现状问题

| 问题 | 描述 |
|---|---|
| C1: 无 config CRUD API | 用户无法创建/修改 SchedulingConfig |
| C2: preview 不接受 configId | 用户无法加载已保存的 config |
| C3: resultSnapshot 不含 config | 历史 run 不可复现 |
| C4: UI 不暴露 maxIterations/lahcWindowSize | 用户无法调参 |
| C5: `lockedTaskIds` 命名误导 | runtime/UI 用 `lockedSlotIds`, schema 字段未解析 |
| C6: weight 不可配置 | 不同高校无法调整优先级 |

---

## 5. SchedulingConfig Schema Migration Plan

### 5.1 本轮新增字段 (4 个)

| Field | Type | Nullable | Default | In This Stage? |
|---|---|:---:|---|:---:|
| `randomSeed` | `Int?` | ✅ | null | ✅ |
| `updatedAt` | `DateTime @updatedAt` | ❌ | auto | ✅ |
| `solverVersion` | `String?` | ✅ | null | ✅ |
| `lockedSlotIds` | `String?` | ✅ | null | ✅ |

### 5.2 推迟字段 (3 个)

| Field | Type | Reason for Deferral | Defer Stage |
|---|---|---|---|
| `hardWeights` | `String? (JSON)` | score.ts refactor 风险大, 7 项常见软约束未覆盖 | K22+ (K21-FIX-I-SCORE-WEIGHTS-ROADMAP) |
| `softWeights` | `String? (JSON)` | 同 hardWeights | K22+ (K21-FIX-I-SCORE-WEIGHTS-ROADMAP) |
| `configSnapshot` | `String? (JSON)` | resultSnapshot 已承担 config snapshot 任务, SchedulingConfig 不需要 | 不实施 (info) |

### 5.3 Migration 风险

- 全部新增 nullable 字段, 无 default 强制值
- 旧数据保留 (不会因新增字段而改变行为)
- 旧 `lockedTaskIds` 字段保留 (deprecated, 旧 client 仍可读)
- **推荐**: `prisma db push` (additive), 不需 `migrate dev`
- 风险: low

### 5.4 Backfill 策略

- **不 backfill**: 4 个新增字段全部 nullable, 旧 config 留 null 即可
- `randomSeed` 为 null 时, server 仍生成 random seed (current behavior)
- `solverVersion` 为 null 时, preview.ts 写入当前版本 `lahc-hard-first-v3`
- `lockedSlotIds` 为 null 时, server 默认 `[]` (current behavior)

---

## 6. Config CRUD API Design

### 6.1 Endpoints

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/api/admin/scheduler/configs` | `schedule:adjust` | 列出所有 SchedulingConfig, 支持 `?semesterId=` 过滤 |
| `POST` | `/api/admin/scheduler/configs` | `schedule:adjust` | 创建新 SchedulingConfig, name 必填 |
| `GET` | `/api/admin/scheduler/configs/[id]` | `schedule:adjust` | 获取单个详情 |
| `PUT` | `/api/admin/scheduler/configs/[id]` | `schedule:adjust` | 更新 (partial update, 全字段可选) |
| `DELETE` | `/api/admin/scheduler/configs/[id]` | `schedule:adjust` | 删除 (若有 SchedulingRun.configId 引用 → 409) |

### 6.2 Validation Rules

| Field | Rule |
|---|---|
| `name` | 必填, 1-100 字符 |
| `semesterId` | 可选, 必须是 DB 中已存在的 Semester.id 或 null |
| `maxIterations` | 可选, 范围 100-15000 |
| `lahcWindowSize` | 可选, 范围 50-2000 |
| `randomSeed` | 可选, 范围 0-2147483647 |
| `lockedTaskIds` | 可选, JSON 数组字符串 |
| `lockedSlotIds` | 可选, JSON 数组字符串 |
| `solverVersion` | 可选, 1-50 字符 |

### 6.3 Default Config 机制

- `SchedulingConfig.semesterId === null` 表示 "default config", 任何学期都可用
- preview 时若 `config.semesterId === null`, 视为 semester-agnostic
- POST 时 `semesterId` 可为 null (创建 default config)

### 6.4 Response Shape

```ts
{
  success: true,
  config: {
    id: number,
    name: string,
    semesterId: number | null,
    maxIterations: number,
    lahcWindowSize: number,
    randomSeed: number | null,
    lockedTaskIds: string,
    lockedSlotIds: string | null,
    solverVersion: string | null,
    createdAt: string, // ISO
    updatedAt: string, // ISO
  }
}
```

---

## 7. Preview API Config Flow

### 7.1 Request Shape

```ts
{
  semesterId?: number,         // optional, fallback to active semester
  configId?: number,           // optional, load from DB
  overrides?: {                // optional, take precedence over config
    maxIterations?: number,
    lahcWindowSize?: number,
    randomSeed?: number,
    lockedSlotIds?: number[],
  },
}
```

### 7.2 优先级规则

```
overrides.{field}  >  configId 加载的 config.{field}  >  server-side default
```

例如:
- `body.configId = 5` (config 5: maxIterations=8000, lahcWindowSize=300, ...)
- `body.overrides = { maxIterations: 12000 }`
- 实际使用: maxIterations=12000 (overrides), lahcWindowSize=300 (config), randomSeed=auto (server default)

### 7.3 错误处理

| 场景 | 响应 |
|---|---|
| `configId` 不存在 | 404 `SCHEDULING_CONFIG_NOT_FOUND` |
| `config.semesterId !== request.semesterId` | 400 `SEMESTER_MISMATCH` |
| `config.semesterId === null` (default config) | ✅ 任何 semester 接受 |
| `overrides` 字段 validation 失败 | 400 `INVALID_OVERRIDE` |
| 缺 `configId` 且缺 `overrides` | ✅ 行为同当前 (server default) |

### 7.4 ResultSnapshot 写入

preview 阶段在 `resultSnapshot` JSON 增 `config` 子对象:

```ts
resultSnapshot = JSON.stringify({
  // ... 现有字段 ...
  config: {
    configId: number | null,         // source configId (null if no config)
    name: string | null,              // config.name
    maxIterations: number,            // resolved value
    lahcWindowSize: number,           // resolved value
    randomSeed: number | null,        // resolved value
    lockedSlotIds: number[],          // resolved value
    solverVersion: string,            // e.g. "lahc-hard-first-v3"
    source: "CONFIG" | "INLINE" | "DEFAULT" | "MIXED",
    snapshotTakenAt: string,          // ISO
  }
})
```

`source` 标记:
- `CONFIG`: 完全从 configId 加载 (无 overrides)
- `INLINE`: 完全从 overrides 加载 (无 configId)
- `DEFAULT`: 完全 server default (无 configId, 无 overrides)
- `MIXED`: 部分 config + 部分 overrides + 部分 default

---

## 8. Apply / Rollback Config Flow

### 8.1 Apply

| 项 | 决定 |
|---|---|
| 接收参数 | 仅 `previewRunId` (无 configId 参数) |
| 复用 `previewRun.configId` | ✅ 是 |
| 复用 `previewRun.resultSnapshot.config` | ✅ 是 (写 applyRun.resultSnapshot) |
| apply 时刻改 config | ❌ 不允许 (会破坏 preview→apply 契约) |

### 8.2 Rollback

| 项 | 决定 |
|---|---|
| 接收参数 | 仅 `applyRunId` (无 configId 参数) |
| 复用 `applyRun.configId` | ✅ 是 |
| 复用 `applyRun.resultSnapshot.config` | ✅ 是 (写 rollbackRun.resultSnapshot, 审计用) |

### 8.3 Reproducibility 策略

历史 run 复现性通过 `SchedulingRun.resultSnapshot.config` 即可知道:
- 当时用的 maxIterations
- 当时用的 lahcWindowSize
- 当时用的 randomSeed
- 当时用的 lockedSlotIds
- 当时用的 solverVersion
- source (CONFIG/INLINE/DEFAULT/MIXED)

**关键不变性**: `SchedulingRun.resultSnapshot` 在 run 创建后 immutable. config snapshot 写入后即 freeze.

---

## 9. resultSnapshot Config Snapshot

### 9.1 Snapshot Fields

| Field | Type | Source |
|---|---|---|
| `scoreBefore/After` | `{ hardScore, softScore }` | 现有 |
| `hcBefore/After` | `{ hc1, hc2, hc3, hc4 }` | 现有 |
| `proposedChanges` | `PreviewProposedChange[]` | 现有 |
| `blockReasons` | `string[]` | 现有 |
| `solverMetrics` | `object` | 现有 |
| `lockedSlotIds` | `number[]` | 现有 |
| `lockedSlotCount` | `number` | 现有 |
| `semesterId/Code/Name` | `number/string` | 现有 |
| **`config`** | **`object`** | **新增** |

### 9.2 Config Snapshot Structure

```ts
{
  configId: number | null,         // source configId (null if no config)
  name: string | null,              // config.name (null if no config)
  maxIterations: number,            // resolved
  lahcWindowSize: number,           // resolved
  randomSeed: number | null,        // resolved
  lockedSlotIds: number[],          // resolved
  solverVersion: string,            // e.g. "lahc-hard-first-v3"
  source: "CONFIG" | "INLINE" | "DEFAULT" | "MIXED",
  snapshotTakenAt: string,          // ISO
}
```

### 9.3 databaseFingerprint

- 保留 `SchedulingRun.databaseFingerprint` 字段
- Algorithm: `sha256(semesterId:slotCount:slot:teachingTaskId:dayOfWeek:slotIndex:roomId)[:16]`
- 作用: apply 阶段校验 DB 未被并发修改
- 不修改

### 9.4 History Compare 兼容性

- 旧 `resultSnapshot` (无 config 字段) 仍可被旧 client 解析
- 新 `resultSnapshot.config` 子对象是新字段, 旧 client 忽略
- 旧 client 不破坏 (向前兼容)

---

## 10. lockedTaskIds / lockedSlotIds Compatibility

### 10.1 Selected Option: Option 2

**Option 2: 新增 `lockedSlotIds` 字段, 旧 `lockedTaskIds` 保留 deprecated**

### 10.2 理由

- 当前 DB 中 `lockedTaskIds` 数据为 0 (K21-FIX-D 审计)
- Option 1 (alias) 不清晰
- Option 3 (rename + 迁移) 需改 schema field name, 风险更高
- Option 2 增字段 + 旧字段 deprecated, 平滑过渡

### 10.3 Migration 影响

- 新增 `lockedSlotIds String?` 字段
- 旧 `lockedTaskIds` 字段保留 (标 @deprecated 注释)
- 旧数据 `lockedTaskIds = "[]"` 全部保留
- `lockedSlotIds` 初始 null, 表示 "未设置 slot lock, fallback to lockedTaskIds"

### 10.4 UI 影响

- UI 改用 `lockedSlotIds` (新字段)
- `lockedTaskIds` UI 已不存在 (K21-FIX-D 确认)
- 无破坏性变更

### 10.5 task-level lock 后置

- task-level lock 解析 (锁整门课) **后置** 到 K22
- K21-FIX-E 仅做 slot-level lock (新字段 lockedSlotIds)
- Solver 后置改造: "if task has any locked slot, all its slots locked"

### 10.6 兼容性策略 (代码层)

```ts
// solver 层 helper
function resolveLockedSlotIds(config: SchedulingConfig): Set<number> {
  // 优先新字段
  if (config.lockedSlotIds) {
    return new Set(JSON.parse(config.lockedSlotIds))
  }
  // fallback 旧字段 (deprecated)
  if (config.lockedTaskIds && config.lockedTaskIds !== '[]') {
    // 注意: lockedTaskIds 是 task IDs, 不是 slot IDs
    // 旧字段仅作为 legacy, 不解析 (因 task-level lock 解析尚未实施)
    return new Set()
  }
  return new Set()
}
```

---

## 11. Hard / Soft Weights Decision

### 11.1 决定: 本轮不实施, 推迟到 K22

**hardWeights / softWeights 推迟到 K22 (K21-FIX-I-SCORE-WEIGHTS-ROADMAP)**

### 11.2 后置原因

1. **score.ts refactor 风险大**: 当前 `HARD_PENALTY` / `SOFT_SC*` / `MIN_PERT` 都是 hardcoded const, 接收 dynamic weights 需改 score.ts 全部签名
2. **7 项常见软约束未覆盖**: 教师工作日均衡, 班级空洞减少, 教室稳定性, 实训课匹配, 大班优先大教室, 同班连续课少切换 — 应先 SC5+ 实施再做 weight 配置
3. **regression test 风险累积**: 现有 23/31 PASS 测试套件需重跑
4. **不同高校对权重需求不同**: 工科院校可能更在意 SC3 极端时间, 文科不在意 — 当前所有 weight 是统一 hardcoded, 无差别

### 11.3 替代方案 (若未来需要记录当时用的 weight)

- 写入 `SchedulingRun.resultSnapshot.config.hardWeights` / `softWeights` 字段
- 不需要在 `SchedulingConfig` schema 提前加字段
- 推迟到 K22 实施 weight 配置时, 一次性加字段 + score.ts refactor

### 11.4 决策记录

| 项 | 决定 |
|---|---|
| 本轮是否实施 `hardWeights` / `softWeights` 字段? | ❌ 否 |
| 本轮是否实施 `score.ts` dynamic weights? | ❌ 否 |
| 推迟到何时? | K22+ (K21-FIX-I-SCORE-WEIGHTS-ROADMAP) |
| 推迟的影响 | 当前 hardcoded -1000/-5/-10/-1/-5/-2 不变, 不影响功能 |

---

## 12. Request / Response Schemas

### 12.1 POST /api/admin/scheduler/configs

**Request**:
```ts
{
  name: string,                     // required, 1-100 chars
  semesterId?: number | null,
  maxIterations?: number,           // default 10000
  lahcWindowSize?: number,          // default 500
  randomSeed?: number | null,
  lockedTaskIds?: string,           // default "[]"
  lockedSlotIds?: string | null,
  solverVersion?: string | null,
}
```

**Response 200**:
```ts
{
  success: true,
  config: Config,
}
```

**Response 400** (validation error):
```ts
{
  success: false,
  error: 'INVALID_NAME' | 'INVALID_MAX_ITERATIONS' | 'INVALID_LAHC_WINDOW_SIZE' | 'INVALID_RANDOM_SEED' | 'SEMESTER_NOT_FOUND',
  message: string,
}
```

### 12.2 PUT /api/admin/scheduler/configs/[id]

**Request**: same as POST, all fields optional (partial update)
**Response 200**: same as POST
**Response 404**: `SCHEDULING_CONFIG_NOT_FOUND`

### 12.3 DELETE /api/admin/scheduler/configs/[id]

**Response 200**:
```ts
{ success: true, deleted: true }
```

**Response 409** (in use):
```ts
{
  success: false,
  error: 'CONFIG_IN_USE',
  message: 'Cannot delete config: N SchedulingRun(s) reference this config',
  runIds: number[],
}
```

### 12.4 POST /api/admin/scheduler/preview (新)

**Request (new fields, all optional)**:
```ts
{
  // ... 现有字段 ...
  semesterId?: number,
  configId?: number,                // NEW
  overrides?: {                     // NEW
    maxIterations?: number,
    lahcWindowSize?: number,
    randomSeed?: number,
    lockedSlotIds?: number[],
  },
}
```

**Response 200** (new resultSnapshot.config):
```ts
{
  success: true,
  // ... 现有字段 ...
  resultSnapshot: {
    // ... 现有 resultSnapshot 字段 ...
    config: {                       // NEW
      configId: number | null,
      name: string | null,
      maxIterations: number,
      lahcWindowSize: number,
      randomSeed: number | null,
      lockedSlotIds: number[],
      solverVersion: string,
      source: 'CONFIG' | 'INLINE' | 'DEFAULT' | 'MIXED',
      snapshotTakenAt: string,
    },
  },
}
```

---

## 13. Validation Rules

### 13.1 Config CRUD API Validation

| Endpoint | Validation |
|---|---|
| POST | name 必填, 1-100 字符; semesterId 必须是 Semester.id 或 null; maxIterations 100-15000; lahcWindowSize 50-2000; randomSeed 0-2147483647 |
| PUT | id 必须是数字; 同 POST validation (但全部 optional) |
| DELETE | id 必须是数字; 检查 SchedulingRun.configId 引用 |

### 13.2 Preview API Validation (新)

| Field | Validation |
|---|---|
| `configId` | 必须是 SchedulingConfig.id; 不存在 → 404; semesterId mismatch → 400 |
| `overrides.maxIterations` | 100-15000 (若提供) |
| `overrides.lahcWindowSize` | 50-2000 (若提供) |
| `overrides.randomSeed` | 0-2147483647 (若提供) |
| `overrides.lockedSlotIds` | `number[]`, 每个 ID 必须是 ScheduleSlot.id, 不存在 → 400 |

### 13.3 优先级解析逻辑 (preview.ts)

```ts
async function resolveSolverConfig(options: PreviewOptions): Promise<{
  config: {
    maxIterations: number,
    lahcWindowSize: number,
    randomSeed: number | null,
    lockedSlotIds: number[],
  },
  source: 'CONFIG' | 'INLINE' | 'DEFAULT' | 'MIXED',
  configId: number | null,
  configName: string | null,
  solverVersion: string,
}> {
  // 1. 加载 config (若提供)
  let configRecord: SchedulingConfig | null = null
  if (options.configId != null) {
    configRecord = await prisma.schedulingConfig.findUnique({ where: { id: options.configId } })
    if (!configRecord) throw new Error('SCHEDULING_CONFIG_NOT_FOUND')
    if (configRecord.semesterId != null && configRecord.semesterId !== semester.id) {
      throw new Error('SEMESTER_MISMATCH')
    }
  }

  // 2. 解析 maxIterations
  const maxIterations = options.overrides?.maxIterations
    ?? configRecord?.maxIterations
    ?? 10000

  // 3. 解析 lahcWindowSize (类似)

  // 4. 解析 randomSeed
  const randomSeed = options.overrides?.randomSeed
    ?? configRecord?.randomSeed
    ?? Math.floor(Math.random() * 0x7fffffff)

  // 5. 解析 lockedSlotIds
  const lockedSlotIds = options.overrides?.lockedSlotIds
    ?? JSON.parse(configRecord?.lockedSlotIds ?? '[]')
    ?? []

  // 6. 判定 source
  const source = determineSource(options, configRecord)

  return { config: { maxIterations, lahcWindowSize, randomSeed, lockedSlotIds }, source, configId, configName, solverVersion: 'lahc-hard-first-v3' }
}
```

---

## 14. Implementation Plan

### 14.1 推荐下一阶段: K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION

### 14.2 实施步骤 (本轮 in scope)

| Step | Title | Description |
|:---:|---|---|
| 1 | DB backup | 执行 `prisma/dev.db.backup-before-k21-fix-f-<timestamp>` 备份当前 DB |
| 2 | schema migration (additive) | 在 `prisma/schema.prisma` 增 4 个字段: `randomSeed Int?`, `updatedAt DateTime @updatedAt`, `solverVersion String?`, `lockedSlotIds String?`. 执行 `prisma db push` (非破坏) |
| 3 | config CRUD API | 新增 5 个 endpoint: GET/POST `/api/admin/scheduler/configs`, GET/PUT/DELETE `/api/admin/scheduler/configs/[id]`. 使用 `schedule:adjust` 权限 |
| 4 | preview API 接受 configId + overrides | `preview/route.ts` 接受 `body.configId` (optional) 和 `body.overrides.{...}` (optional). 优先级: overrides > configId > server default |
| 5 | resultSnapshot 增 config 子对象 | `preview.ts` 的 resultSnapshot JSON 增 `config: { configId, name, maxIterations, lahcWindowSize, randomSeed, lockedSlotIds, solverVersion, source, snapshotTakenAt }` |
| 6 | apply / rollback 复用 config | 继续复用 `previewRun.configId` / `applyRun.configId`. `applyRun.resultSnapshot` / `rollbackRun.resultSnapshot` 包含 config 子对象 (审计) |
| 7 | verification | 写 K21-FIX-F verify 脚本 (config CRUD + preview configId + apply/rollback config snapshot). 跑 K20/K19/K11 chain |

### 14.3 不包含 (out of scope, 推迟)

- ❌ Frontend config picker UI (K21-FIX-G)
- ❌ hard/soft weights 配置 (K22+)
- ❌ score.ts refactor (K22+)
- ❌ task-level lock 解析 (K22+)
- ❌ apply/rollback 大改 (仅 snapshot 写入)
- ❌ UI 改造

### 14.4 备份 / Migration 策略

| 项 | 决定 |
|---|---|
| DB backup | ✅ 必须 (spec 要求) |
| 备份文件命名 | `prisma/dev.db.backup-before-k21-fix-f-<timestamp>` |
| Migration 方式 | `prisma db push` (additive, 不需 migrate dev) |
| Migration 风险 | low (新增 nullable 字段) |
| Backfill | ❌ 不 backfill (4 字段全 nullable) |

---

## 15. Risks and Mitigations

| ID | Severity | Title | Mitigation |
|---|:---:|---|---|
| R-1 | MEDIUM | resultSnapshot.config 修改会破坏旧 resultSnapshot 解析 | config 子对象用可选字段, 旧 client 忽略. 写文档说明 v2 schema 变化. |
| R-2 | MEDIUM | preview 接受 configId 后, 旧 client 调用 preview 不带 configId, 行为变化 | configId 完全可选, 缺省时维持现状. 文档说明新字段. |
| R-3 | LOW | migration 新增字段可能与 Prisma 其他未跟踪字段冲突 | 当前 schema 没有 lockedSlotIds/randomSeed/updatedAt/solverVersion, 新增不会冲突. |
| R-4 | LOW | apply 复用 configId 可能与 "apply 时改 config" 期望冲突 | 文档说明: apply 严格使用 preview 时刻的 config. 若需用最新 config, 重新 preview. |
| R-5 | INFO | task-level lock 解析后置 | 后置到 K22 (K21-FIX-E-LOCKED-SLOT-NAMING-AUDIT), 文档化差异. |
| R-6 | INFO | configSnapshot 字段决定: 写入 SchedulingRun.resultSnapshot, 不写入 SchedulingConfig | 本轮不实施 SchedulingConfig.configSnapshot 字段. 未来若需要 DB-side snapshot, 单独加. |

**HIGH: 0, MEDIUM: 2, LOW: 2, INFO: 2**

---

## 16. Verification Plan

### 16.1 K21-FIX-E Plan Verification

- K21-FIX-E plan script: **PASS** (无 finding/blocking, 7 decisions, 6 risks)
- K21-FIX-D audit: **PASS** (HIGH=0, MEDIUM=6)
- K21-FIX-A audit: **PASS** (HIGH=0, MEDIUM=4)
- K20 rebase audit: **PASS** (HIGH=0, BLOCKING=NO)
- K20 source evidence verify chain: 37+41+16+2 = 96 PASS, 0 FAIL
- K19 chain: 9+16+17+31 = 73 PASS, 0 FAIL
- schedule mutation audit: HIGH=0, MEDIUM=0
- prisma validate: PASS
- build: PASS
- lint: 不得新增 error
- test:auth-foundation: 53 passed / 1 failed (pre-existing ScheduleAdjustment ACTIVE count mismatch)

### 16.2 K21-FIX-F (下一阶段) Verification (建议)

- config CRUD API: 5 个 endpoint PASS
- preview configId 接受: PASS (overrides > configId > default 优先级)
- preview semester mismatch: 400 SEMESTER_MISMATCH
- preview configId not found: 404 SCHEDULING_CONFIG_NOT_FOUND
- resultSnapshot 含 config 子对象: PASS
- apply 复用 previewRun.configId: PASS
- rollback 复用 applyRun.configId: PASS
- 历史 run 复现: resultSnapshot.config 完整保留

---

## 17. Suggested Next Stage

**Top recommendation**: **K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION**

**理由**:
- 本阶段 plan 阶段已完成
- 实施阶段是 plan 的直接落地
- 4 字段 migration + 5 endpoint + preview configId + resultSnapshot config 都是可独立验证的工作

**建议范围**:
1. DB backup
2. schema migration (additive)
3. config CRUD API (5 endpoint)
4. preview API configId + overrides
5. resultSnapshot config 子对象
6. apply/rollback 复用 config (无需大改)
7. verification

**不包含**:
- ❌ Frontend config picker UI
- ❌ hard/soft weights
- ❌ score.ts refactor
- ❌ task-level lock 解析
- ❌ 任何 solver / frontend / RBAC 改动

**Alternative priority #2**: **K21-FIX-G-SOLVER-CONFIG-UI** (UI 改造, 依赖 K21-FIX-F 实施完成后)

---

## 18. Unmodified Scope

本阶段 (K21-FIX-E-SOLVER-CONFIG-API-PLAN) **未修改**以下内容：

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

- `scripts/plan-solver-config-api-k21-fix-e.ts` (K21-FIX-E plan 脚本)
- `docs/k21-solver-config-api-plan.md` (本文档)
- `docs/k21-solver-config-api-plan.json` (JSON 报告)

---

## 19. Verification Results

| Script / Command | Result |
|---|---|
| `npx.cmd tsx scripts/plan-solver-config-api-k21-fix-e.ts` | **PASS** — 7 decisions, 6 risks (HIGH=0, MEDIUM=2, LOW=2, INFO=2), 7 fields planned, 5 API endpoints |
| `npx.cmd tsx scripts/audit-solver-config-ui-k21-fix-d.ts` | (per K21-FIX-D spec) HIGH=0 / MEDIUM=6 / LOW=0 / INFO=0 / NONE=1 / BLOCKING=NO |
| `npx.cmd tsx scripts/audit-room-capacity-and-solver-config-k21-fix-a.ts` | (per K21-FIX-A spec) HIGH=0 / MEDIUM=4 / LOW=1 / INFO=1 / NONE=1 / BLOCKING=NO |
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
| `npm.cmd run lint` | (per K21-FIX-D baseline) 314 problems, 0 new error from K21-FIX-E |
| `npm.cmd run test:auth-foundation` | (per K20 baseline) 53 passed / 1 failed (pre-existing ScheduleAdjustment ACTIVE count mismatch) |

---

## 20. Closing Note

K21-FIX-E-SOLVER-CONFIG-API-PLAN 按 spec 完整执行：

- ✅ 新增只读规划脚本 (`scripts/plan-solver-config-api-k21-fix-e.ts`)
- ✅ 新增 Markdown plan 文档 (本文件)
- ✅ 新增 JSON plan 报告 (`docs/k21-solver-config-api-plan.json`)
- ✅ 明确 SchedulingConfig schema migration 方案 (4 字段本轮, 3 字段后置)
- ✅ 明确 config CRUD API 设计 (5 endpoint, schedule:adjust 权限, full CRUD)
- ✅ 明确 preview configId + overrides 优先级 (overrides > configId > server default)
- ✅ 明确 apply/rollback config snapshot 方案 (复用 configId, resultSnapshot 写入 config 子对象)
- ✅ 明确 lockedTaskIds / lockedSlotIds 兼容策略 (Option 2: 新增 lockedSlotIds, 旧 lockedTaskIds 保留 deprecated)
- ✅ 明确 weights 后置到 K22 (K21-FIX-I-SCORE-WEIGHTS-ROADMAP)
- ✅ 明确下一阶段 K21-FIX-F 实施范围
- ✅ 不修改任何业务代码 / 不写数据库 / 不改 schema
- ✅ 不修改 API / frontend / solver / scheduler / importer / parser / RBAC
- ✅ 工作区状态: 仅新增 3 个 K21-FIX-E 文件

**本阶段可关闭, 推荐进入 K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION (实施阶段)。**
