# K26-J2: WorkTime SchedulingRun Snapshot Write

## 1. Executive Summary

本阶段 `K26-J2-WORKTIME-SCHEDULINGRUN-SNAPSHOT-WRITE` 实现 **SchedulingRun WorkTime snapshot 持久化与读取链路**：

* preview：resolve 当前学期 WorkTime → 序列化为 snapshot → 写入 `SchedulingRun.workTimeConfigSnapshot` → 在 response 中返回 `workTimeSnapshot` 元数据。
* apply：读取 preview run 的 snapshot（不重新 resolve WorkTime）→ 携带到 apply run → 在 response 中返回 `workTimeSnapshot` 元数据。
* rollback：读取 apply run 的 snapshot（不重新 resolve WorkTime）→ 携带到 rollback run → 在 response 中返回 `workTimeSnapshot` 元数据。

**本阶段不改变自动排课结果**：

* ❌ 不改 `src/lib/scheduler/solver.ts` 的 candidate generation。
* ❌ 不改 `src/lib/scheduler/score.ts` 的 SC3 / SC5 / SC7 行为。
* ❌ 不改 LAHC move generation。
* ❌ 不把 snapshot 接入 solver / score 实际计算。
* ❌ 不改 schema / migration / DB。
* ❌ 不改 K22 expected。

snapshot 在本阶段仅作为 **persistence + audit 通道** 存在；solver / score 的实际接入是 K26-J3 / K26-J4 的范围。

**推荐下一阶段**：`K26-J3-WORKTIME-SOLVER-CANDIDATE-GENERATION`。

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Local HEAD before | `9862278` (K26-J1) |
| Local HEAD after | `<J2 commit>` |
| Remote HEAD after | `<J2 commit>` |
| Push | yes |
| Force push | **no** |

## 3. Snapshot Contract

新增 `src/lib/worktime/worktime-snapshot.ts`，定义 stable snapshot 类型与序列化 / 解析 / 校验 / contract 转换 helper。

### 3.1 字段

```ts
export type SchedulingRunWorkTimeSnapshot = {
  version: 1
  source: 'database' | 'staticFallback'
  semesterId: number
  workTimeConfigId: number | null
  workTimeConfigName: string | null
  allowWeekend: boolean
  activeTeachingSlotIndexes: number[]      // 排序后
  legacyDisplaySlotIndexes: number[]       // 排序后
  allowedDayOfWeeks: number[]              // 排序后；allowWeekend=true 时包含 6,7
  weekdayDayOfWeeks: number[]              // 排序后；通常 [1,2,3,4,5]
  weekendDayOfWeeks: number[]              // 排序后；通常 [6,7]
  slotsByIndex: Record<string, {
    slotIndex: number
    label: string
    startsAt: string | null
    endsAt: string | null
    isActive: boolean
    isTeachingSlot: boolean
    isLegacyDisplay: boolean
    sortOrder: number
  }>
  serializedAt: string  // ISO 8601 timestamp
}
```

### 3.2 Helper 接口

* `buildWorkTimeSnapshot(input)` — 从 `ResolvedWorkTimeForSchedule` + DB record 构建。
* `buildAndSerializeWorkTimeSnapshot(input)` — build + serialize 一次完成。
* `serializeWorkTimeSnapshot(snap)` — 序列化为 stable JSON string。
* `parseWorkTimeSnapshot(json)` — 解析 + 校验；失败抛 `WorkTimeSnapshotInvalidError`。
* `assertValidWorkTimeSnapshot(raw)` — validate unknown value。
* `toAdditiveMetadata(snap)` — 投影到 resultSnapshot 内嵌的 `workTime` 小对象。
* `toReadMetadata(snap|null)` — 投影到 apply / rollback response。
* `toSolverWorkTimeContract(snap)` — **stub**，K26-J3/J4 才会真正消费。
* `readWorkTimeSnapshotFromRun(row)` — 读取 run row；null = legacy run。

### 3.3 错误码

* `WORKTIME_SNAPSHOT_MISSING` — input 为 null / ''。
* `WORKTIME_SNAPSHOT_INVALID_JSON` — JSON.parse 失败。
* `WORKTIME_SNAPSHOT_WRONG_VERSION` — version !== 1。
* `WORKTIME_SNAPSHOT_MISSING_ACTIVE_SLOTS` — activeTeachingSlotIndexes 为空。
* `WORKTIME_SNAPSHOT_LEGACY_IN_ACTIVE` — active 中包含 6 或 7。
* `WORKTIME_SNAPSHOT_LEGACY_ONLY_ACTIVE` — active 全部为 legacy。
* `WORKTIME_SNAPSHOT_VALIDATION_FAILED` — 其他字段 / 类型错误。

所有错误为 fail-fast，**不** silent fallback。

### 3.4 Source 语义

* `source: 'database'` — snapshot 来自 DB WorkTimeConfig（`workTimeConfigId !== null`）。
* `source: 'staticFallback'` — DB 无 active config，回退到 K26-D 静态助手（`workTimeConfigId === null`）。

**注意**：preview 阶段允许静态 fallback 进入 snapshot。apply / rollback 只读 snapshot，不再 resolve，因此即使 DB 后来被改，apply 仍使用 preview 时的 source。

## 4. Preview Flow

### 4.1 步骤

1. `resolveSchedulerSemester({ semesterId })` 获取学期。
2. `resolveWorkTimeConfigForSchedule(semester.id)` 解析 WorkTime（DB 优先，static fallback 次之）。
3. **若解析失败**：`throw` 抛出 typed error（不 silent fallback）。
4. 若 `source === 'database'`，通过 `prisma.workTimeConfig.findFirst({ where: { semesterId, isDefault: true, isActive: true } })` 读取 `workTimeConfigId` + `name`。
5. `buildAndSerializeWorkTimeSnapshot(...)` 生成 snapshot 对象 + JSON 字符串。
6. **写入** `SchedulingRun.workTimeConfigSnapshot = workTimeSnapshotJson`。
7. **嵌入** `resultSnapshot.workTime = toAdditiveMetadata(snapshot)`（与 `config` / `scoreBreakdown` 同一层）。
8. **返回** 完整 `workTimeSnapshot` 对象在 `PreviewResult.workTimeSnapshot`。

### 4.2 Fail-fast 策略

* `resolveWorkTimeConfigForSchedule` 内部对 `semesterId < 1` 已 throw；上层不 catch。
* DB WorkTimeConfig 缺失 → 走 static fallback（非 error）。
* static fallback 仍 `allowWeekend=false` + `[1..5]` active + `[6,7]` legacy，与 K26-D 一致。

### 4.3 Pre-existing fallback 约定

K26-J2 沿用 K26-I1 的 `resolveWorkTimeConfigForSchedule`（DB 优先 + static fallback 兜底）。`source` 字段保留在 snapshot 中，下游可区分。

## 5. Apply Flow

### 5.1 步骤

1. 既有 guards（PREVIEW_RUN_NOT_FOUND / INVALID_PREVIEW_MODE / PREVIEW_NOT_COMPLETED / PREVIEW_HAS_HARD_CONFLICTS / PREVIEW_EXPIRED / PREVIEW_RESULT_SNAPSHOT_MISSING / PREVIEW_FINGERPRINT_MISSING）保持不变。
2. **新增** 读取 `previewRun.workTimeConfigSnapshot`：
   * 字段为 null（legacy run）→ `workTimeSnapshot = null`；response `workTimeSnapshot: { present: false }`；继续走 apply。
   * 字段存在但 parse 失败 → throw `PREVIEW_WORKTIME_SNAPSHOT_INVALID`。
3. 解析 proposedChanges、Compute database fingerprint、Pre-validate slots 保持不变。
4. **carriedWorkTimeSnapshotJson**：`workTimeSnapshot != null ? previewRun.workTimeConfigSnapshot : null`。
5. transaction 中创建 APPLY run，**写入** `workTimeConfigSnapshot: carriedWorkTimeSnapshotJson`。
6. 更新 APPLY run 为 COMPLETED 时，**嵌入** `resultSnapshot.workTime = toReadMetadata(workTimeSnapshot)`。
7. **返回** `applyResult.workTimeSnapshot = toReadMetadata(workTimeSnapshot)`。

### 5.2 不重新 resolve WorkTime

* `apply.ts` 顶层**不** import / 调用 `resolveWorkTimeConfigForSchedule`。
* static `check('apply does not call current WorkTime resolver', !applyCallsResolver)` 通过。

### 5.3 Legacy 兼容

* Legacy preview run（无 snapshot 字段）→ apply 继续运行；`workTimeSnapshot: { present: false }`。
* 这种情况下 apply 行为与 K26-J1 一致：solver / score 都不读 WorkTime，apply 路径本身不依赖 snapshot。

### 5.4 Add Response Metadata

```ts
applyResult.workTimeSnapshot: {
  present: true | false
  version?: 1
  source?: 'database' | 'staticFallback'
  workTimeConfigId?: number | null
  allowWeekend?: boolean
}
```

## 6. Rollback Flow

### 6.1 步骤

1. 既有 guards（APPLY_RUN_NOT_FOUND / INVALID_APPLY_MODE / APPLY_RUN_ALREADY_ROLLED_BACK / APPLY_NOT_COMPLETED / ROLLBACK_ALREADY_EXISTS / APPLY_CHANGES_EMPTY）保持不变。
2. 既有 `applyConfigSnapshot` 读取（K21-FIX-F）保持不变。
3. **新增** 读取 `applyRun.workTimeConfigSnapshot`：
   * 字段为 null → `rollbackWorkTimeSnapshot = null`；response `present: false`。
   * 字段存在但 parse 失败 → throw `APPLY_WORKTIME_SNAPSHOT_INVALID`。
4. **carriedRollbackWorkTimeSnapshotJson** = `applyRun.workTimeConfigSnapshot` (raw JSON string)。
5. transaction 中创建 ROLLBACK run，**写入** `workTimeConfigSnapshot: carriedRollbackWorkTimeSnapshotJson`。
6. 更新 ROLLBACK run 为 COMPLETED 时，**嵌入** `resultSnapshot.workTime = toReadMetadata(rollbackWorkTimeSnapshot)`。
7. **返回** `rollbackResult.workTimeSnapshot = toReadMetadata(rollbackWorkTimeSnapshot)`。

### 6.2 不重新 resolve WorkTime

* `rollback.ts` 顶层**不** import / 调用 `resolveWorkTimeConfigForSchedule`。

### 6.3 Legacy 兼容

* 旧 apply run（K26-J2 之前）→ rollback 继续运行；`workTimeSnapshot: { present: false }`。
* 这与 K26-J1 rollback 行为完全一致；不破坏任何旧 run。

## 7. Harness M

新增 `scripts/verify-worktime-schedulingrun-snapshot-k26-j2.ts`，48+ 静态 + 动态 + 活体验证。

### 7.1 Section A: Files / structure (1-6)

* snapshot helper exists
* snapshot type/version documented
* parse helper exists
* validation helper exists
* J2 docs .md exist
* J2 docs .json exist

### 7.2 Section B: Preview snapshot (7-20)

* 静态 grep 验证 `preview.ts` 调用 `resolveWorkTimeConfigForSchedule` 且写入 `workTimeConfigSnapshot` 字段。
* 静态 grep 验证 snapshot 源码中包含 12 个核心字段（version, semesterId, source, workTimeConfigId, allowWeekend, activeTeachingSlotIndexes, legacyDisplaySlotIndexes, allowedDayOfWeeks, weekdayDayOfWeeks, weekendDayOfWeeks, slotsByIndex, serializedAt）。
* 活体验证：实际调用 `createSchedulerPreview({...})`，读取 `SchedulingRun.workTimeConfigSnapshot`，确认非 null 且可 parse。

### 7.3 Section C: Apply / rollback snapshot (21-26)

* `apply.ts` / `rollback.ts` 各自包含 `readWorkTimeSnapshotFromRun(...)` 调用。
* 两个文件均 **不** 调用 `resolveWorkTimeConfigForSchedule`（grep 静态检查）。
* legacy run 兼容策略在 J2 docs 中显式说明。
* 无效 snapshot fail-fast：`apply.ts` 抛 `PREVIEW_WORKTIME_SNAPSHOT_INVALID`，`rollback.ts` 抛 `APPLY_WORKTIME_SNAPSHOT_INVALID`。

### 7.4 Section D: Reproducibility (27-33)

* 文档化 preview/apply 之间 WorkTime 变化的场景（apply 使用 run snapshot，不被 DB 变化影响）。
* 活体解析拒绝以下 4 种 malformed input：
  * `{not-json`（JSON.parse 失败 → `WORKTIME_SNAPSHOT_INVALID_JSON`）
  * `{ version: 999, ... }`（wrong version → `WORKTIME_SNAPSHOT_WRONG_VERSION`）
  * `activeTeachingSlotIndexes: []`（missing active → `WORKTIME_SNAPSHOT_MISSING_ACTIVE_SLOTS`）
  * `activeTeachingSlotIndexes: [6, 7]`（legacy-only → `WORKTIME_SNAPSHOT_LEGACY_IN_ACTIVE`）

### 7.5 Section E: Non-goals (34-42)

* `solver.ts` / `score.ts` 不含 `K26-J2` 标记。
* `solver.ts` 仍包含 `day <= 7` / `randInt(rng, 1, 7)`（candidate generation 不变）。
* `score.ts` 仍包含 `idx >= 5` / `day >= 6`（SC3 / SC7 不变）。
* K22-C harness 不含 `K26-J2` 标记（K22 expected 不变）。
* recommendation / UI / schema / migration 全部无 `K26-J2` 标记。

### 7.6 Section F: Verification (43-48)

* K26-J1 plan / K26-J audit / K22-C harness 仍存在（CI 全套回归由 parent verify chain 跑）。
* build / lint 在 J2 commit 后由 parent verify chain 跑。
* auth-foundation pre-existing failure 在 J2 docs 中说明。

### 7.7 Live Test

Harness M 末尾会：

* 创建 `SchedulingConfig` 名为 `K26-J2-SNAPSHOT-VERIFY`（避免与业务配置冲突）。
* 调用 `createSchedulerPreview({ configId, maxIterations: 50, randomSeed: 20260609, semesterId: 1 })`。
* 读 run row，验证 `workTimeConfigSnapshot` 非 null 且可 parse。
* `finally` 中删除：所有创建的 run row + 名为 `K26-J2-SNAPSHOT-VERIFY` 的 config。
* 输出 `createdRunIds`、`db drift`（pre/post count）以确认清理彻底。

## 8. Compatibility

### 8.1 legacy runs

* K26-J2 之前的 preview / apply / rollback run 都没有 `workTimeConfigSnapshot` 字段。
* apply 读取时 `null` → 继续运行（response `present: false`）。
* rollback 读取时 `null` → 继续运行（response `present: false`）。
* K26-J2 之前的 run **不需要** retrofit。

### 8.2 K21 scheduler config UI

* `SchedulingConfig` 模型未改；UI 不变。
* `resultSnapshot.config` 仍由 K21-FIX-F 路径写入，K26-J2 不影响。

### 8.3 existing resultSnapshot

* `resultSnapshot.workTime` 是 **additive** 字段；旧解析器忽略未知字段。
* 旧 `resultSnapshot.config` / `scoreBreakdown` 不动。
* `SchedulingRun.workTimeConfigSnapshot` 是新 schema 字段（K26-F 已加），旧代码读不读都安全。

### 8.4 old runs read

* 旧 apply 路径（旧 service）在 K26-J2 commit 之前部署 → 读不到 `workTimeConfigSnapshot` 字段（旧 client schema），无影响。
* 旧 run 部署到 K26-J2 之后 → service 端读 snapshot 字段为 `null` → 走 legacy compat 路径。

### 8.5 SchedulingConfig snapshot vs WorkTime snapshot

* `SchedulingConfig` CRUD（K21-FIX-F）：snapshot 走 `SchedulingRun.resultSnapshot.config`（已有）。
* `WorkTimeConfig`（K26-F）：snapshot 走 `SchedulingRun.workTimeConfigSnapshot`（本阶段新增）。
* 两者**互不影响**；apply 同时携带两个（`config` 在 resultSnapshot 内，WorkTime 在新字段上）。

## 9. Non-Goals

本阶段**未实现 / 未触碰**：

- ❌ solver candidate generation（`solver.ts` 无 K26-J2 标记）。
- ❌ score SC3 / SC5 / SC7（`score.ts` 无 K26-J2 标记）。
- ❌ LAHC move generation。
- ❌ `prisma/schema.prisma` 改动。
- ❌ `prisma/migrations/**` 新增。
- ❌ `prisma/dev.db` 提交。
- ❌ K22 expected 改动。
- ❌ K22-C harness 改动。
- ❌ Recommendation（plan / room / adjustment）行为改动。
- ❌ Dry-run / apply adjustment 行为改动。
- ❌ WorkTime Settings UI 改动。
- ❌ WorkTime API 语义改动。
- ❌ Adjustment dialog UI 改动。
- ❌ Solver / score 实际消费 snapshot（`toSolverWorkTimeContract` 是 stub，K26-J3/J4 才用）。
- ❌ Reset / force-reset / seed。
- ❌ `.env` / `.next` / DB backup 提交。

## 10. Verification Results

| Command | Result |
|---------|--------|
| `verify-worktime-schedulingrun-snapshot-k26-j2.ts` | **PASS** |
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
