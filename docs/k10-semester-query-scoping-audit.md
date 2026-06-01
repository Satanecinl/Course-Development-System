# K10-SEMESTER-QUERY-SCOPING-AUDIT

## 概述

审计当前系统所有可能读取、展示、导入、排课、应用、回滚、历史查询业务数据的入口，明确后续哪些地方必须按 Semester 过滤。

## 当前数据状态

| 项 | 值 |
|---|---|
| Semester count | 1 |
| active Semester count | 1 |
| LEGACY-DEFAULT 是否存在 | 是 |
| 目标模型 null semesterId 是否为 0 | 是 |

## 查询入口审计结果

| 入口 | 当前状态 | 风险等级 | 推荐 scoping 策略 |
|---|---|---|---|
| scheduler data-loader | 全库加载，无 semesterId filter | **高** | 接受 `semesterId` 参数，对 TeachingTask/ScheduleSlot 加 `{ semesterId }` where |
| preview API/helper | 无 semesterId 参数；创建 SchedulingRun 不设 semesterId | **高** | 接收 `semesterId`，写入 SchedulingRun，传给 data-loader |
| apply API/helper | 无 semesterId 校验；fingerprint/score 全库加载 | **高** | 校验 previewRun.semesterId，fingerprint/score 按 semester 计算 |
| rollback API/helper | 无 semesterId 校验；fingerprint/score 全库加载 | **高** | 校验 applyRun.semesterId，fingerprint/score 按 semester 计算 |
| runs history API | 返回全部学期 runs，无 filter | **中** | 接收可选 `semesterId` filter，response 带 semesterCode |
| lockable-slots API | 全库加载 ScheduleSlot，无 where | **高** | 接受 `semesterId`，只返回该学期 slots |
| import flow | ImportBatch 无 semesterId；创建 Task/Slot 无 semesterId | **高** | ImportBatch 增加 semesterId；importer 写入 semesterId |
| normal schedule view | getEffectiveScheduleForWeek 全库加载 | **高** | 前端 semester selector → 传 semesterId → API 按 semester 过滤 |
| admin data pages | CRUD 无 semester filter | **高** | 默认使用 active semester；创建/编辑时写入 semesterId |
| room capacity | Room 全局，maxAssignedStudentCount 跨学期聚合 | **中** | Room.capacity 保持全局；占用人数可按 semester 维度展示 |
| conflict check | 跨全学期检查冲突 | **高** | 只检查同一 semester 内的冲突 |
| Excel export | 导出全学期数据 | **高** | 接收 semesterId，只导出该学期数据 |

## 全库查询风险清单

审计发现 **65 个无 semesterId filter 的读查询**，分布在以下文件：

### Scheduler 核心 (CRITICAL)

| 文件 | 查询对象 | 是否已有 semesterId filter | 风险 | 后续建议 |
|---|---|---|---|---|
| `src/lib/scheduler/data-loader.ts` | teachingTask.findMany | 否 | CRITICAL | 加 `{ semesterId }` where |
| `src/lib/scheduler/data-loader.ts` | scheduleSlot.findMany | 否 | CRITICAL | 加 `{ semesterId }` where |
| `src/lib/scheduler/preview.ts` | schedulingConfig.findFirst | 否 | HIGH | 按 semesterId 或 active 查找 |
| `src/lib/scheduler/preview.ts` | schedulingRun.create | 否 | HIGH | 写入 semesterId |
| `src/lib/scheduler/apply.ts` | scheduleSlot.findMany (fingerprint) | 否 | CRITICAL | 加 `{ semesterId }` where |
| `src/lib/scheduler/apply.ts` | loadSchedulingContextWithClient | 否 | CRITICAL | 传 semesterId |
| `src/lib/scheduler/rollback.ts` | scheduleSlot.findMany (fingerprint) | 否 | CRITICAL | 加 `{ semesterId }` where |
| `src/lib/scheduler/rollback.ts` | loadSchedulingContextWithClient | 否 | CRITICAL | 传 semesterId |

### Schedule / Adjustments (CRITICAL)

| 文件 | 查询对象 | 是否已有 semesterId filter | 风险 | 后续建议 |
|---|---|---|---|---|
| `src/lib/schedule/adjustments.ts` | scheduleSlot.findMany (getEffectiveScheduleForWeek) | 否 | CRITICAL | 加 `{ semesterId }` where |
| `src/lib/schedule/adjustments.ts` | scheduleAdjustment.findMany | 否 | HIGH | 加 `{ semesterId }` where |
| `src/app/api/schedule/route.ts` | scheduleSlot.findMany | 否 | HIGH | 加 `{ semesterId }` where |
| `src/lib/conflict-check.ts` | scheduleSlot.findMany (x3) | 否 | HIGH | 加 `{ semesterId }` where |

### Import (CRITICAL)

| 文件 | 查询对象 | 是否已有 semesterId filter | 风险 | 后续建议 |
|---|---|---|---|---|
| `src/lib/import/importer.ts` | teachingTask.findMany (dedup) | 否 | CRITICAL | 加 `{ semesterId }` where |
| `src/lib/import/importer.ts` | scheduleSlot.findFirst (dedup) | 否 | CRITICAL | 加 `{ semesterId }` where |
| `src/lib/import/importer.ts` | teachingTask.create | 否 | HIGH | 写入 semesterId |
| `src/lib/import/importer.ts` | scheduleSlot.create | 否 | HIGH | 写入 semesterId |

### Admin API (HIGH)

| 文件 | 查询对象 | 是否已有 semesterId filter | 风险 | 后续建议 |
|---|---|---|---|---|
| `src/app/api/schedule-slot/route.ts` | scheduleSlot.create | 否 | HIGH | 写入 semesterId |
| `src/app/api/teaching-task/route.ts` | teachingTask.create | 否 | HIGH | 写入 semesterId |
| `src/app/api/export/excel/route.ts` | scheduleSlot.findMany | 否 | HIGH | 加 semesterId filter |

## Preview / Apply / Rollback scoping 设计

### Preview

1. **Request 接收 `semesterId`**（必填，或默认 active Semester）
2. **校验 Semester 存在且有效**
3. **传给 data-loader**：`loadSchedulingContext({ semesterId })`
4. **SchedulingRun.semesterId 写入**：create 时设置 semesterId
5. **lockedSlotIds 校验**：验证所有 locked slots 的 semesterId == preview semesterId
6. **randomSeed 不受 semester 影响**：纯随机数，无需关联
7. **databaseFingerprint**：包含 semesterId，只 hash 该 semester 的 slots

### Apply

1. **校验 previewRun.semesterId**：确认 preview 属于某学期
2. **proposedChanges 中的 ScheduleSlot**：已属于该学期（preview 时已加载）
3. **fingerprint 只计算该学期 slots**
4. **post-apply score 只检查该学期数据**
5. **不重新求解**：仍只基于 Preview proposedChanges

### Rollback

1. **校验 applyRun.semesterId**：确认 apply 属于某学期
2. **rollback targets**：通过 changes → slotId 关联，已隐含 semester
3. **fingerprint 只计算该学期 slots**
4. **post-rollback score 只检查该学期数据**
5. **不重新求解**

### databaseFingerprint 改进

当前：hash ALL scheduleSlots

改后：hash `semesterId + count(slots WHERE semesterId=X) + hash(slots WHERE semesterId=X)`

防止不同学期并发操作导致 fingerprint 误报冲突。

## History / audit scoping 设计

1. **runs list**：接收可选 `semesterId` query param，response 每条 run 带 `semesterCode`
2. **run detail**：返回 `semesterId` + `semesterCode`；SchedulerRunChange 通过 run 间接归属
3. **history 页面**：增加 semester filter dropdown
4. **历史页仍只读**：无 Apply / Rollback / Re-run 按钮

## Import scoping 设计

1. **ImportBatch 增加 semesterId**（nullable，后续可改 required）
2. **import 页面增加 semester selector**
3. **importer 写入 semesterId**：TeachingTask 和 ScheduleSlot 创建时设置
4. **dedup 按 semester 隔离**：teachingTask.findMany 加 `{ semesterId }` where
5. **重复导入不同 semester 应隔离**：不同学期可独立导入

## Normal schedule / admin pages scoping 设计

1. **普通课表页面**：增加 semester selector（默认 active semester）
2. **scheduleStore**：增加 `semesterId` state，传给所有 API 调用
3. **admin data pages**：默认使用 active semester filter
4. **export**：接收 semesterId，只导出该学期数据
5. **conflict check**：只检查同一 semester 内的冲突

## Room.capacity 特别说明

- **Room.capacity 保持全局**：是
- **maxAssignedStudentCount 后续是否应按 semester 计算**：建议是，但非阻塞
- **本阶段是否修改容量逻辑**：否
- 容量页面后续可增加"按学期查看当前占用"功能，但 Room 本身不加 semesterId

## 分阶段实施建议

### Phase 1: K10-SEMESTER-SCHEDULER-SCOPING-PREP (推荐优先)

**范围**：
- `SchedulingContext` 增加 `semesterId` 字段
- `data-loader.ts` 接受 `semesterId`，对 TeachingTask/ScheduleSlot 加 where
- `preview.ts` 接收 semesterId 参数，写入 SchedulingRun
- `lockable-slots` API 接受 semesterId
- Apply / Rollback 校验 semesterId 一致性
- `databaseFingerprint` 包含 semesterId

**不改**：import / normal schedule / admin pages / UI selector

**理由**：scheduler 是核心路径，且改动范围集中（5-6 个文件），风险可控。

### Phase 2: K10-SEMESTER-CONFLICT-ADJUSTMENT-SCOPING

**范围**：
- `conflict-check.ts` 加 semesterId filter
- `adjustments.ts` 的 `getEffectiveScheduleForWeek` 加 semesterId
- schedule API / export API 加 semesterId

**理由**：conflict check 和 adjustments 是 scheduler 之后的第二优先级。

### Phase 3: K10-SEMESTER-IMPORT-SCOPING

**范围**：
- ImportBatch 增加 semesterId
- importer 写入 semesterId
- dedup 按 semester 隔离
- import 页面 semester selector

**理由**：import 是数据入口，需要在 scheduler scoping 之后处理。

### Phase 4: K10-SEMESTER-UI-SELECTOR

**范围**：
- 全局 semester context/provider
- dashboard semester selector
- admin pages semester filter
- history semester filter

**理由**：UI 层面的统一 semester 选择，依赖后端 API 已支持 semesterId。

## 验证命令结果

```
npx.cmd tsx scripts/audit-semester-query-scoping.ts
  PASSED: 12, WARNING: 3, RISK: 1
  65 unscoped reads, 18 unscoped writes
  Entry-point risks: 10 HIGH, 2 MEDIUM
```

## 安全边界确认

| 检查项 | 结果 |
|---|---|
| 是否修改 Prisma schema | 否 |
| 是否运行 db push/migrate/reset | 否 |
| 是否写业务数据 | 否 |
| 是否做 query scoping 实施 | 否 |
| 是否做 UI selector | 否 |
| 是否修改 solver | 否 |
| 是否修改 parser/importer/seed | 否 |
| 是否修改 Preview/Apply/Rollback | 否 |
| 是否新增 /api/scheduler/run | 否 |
| 是否提交 prisma/dev.db | 否 |
| 是否提交数据库备份文件 | 否 |
