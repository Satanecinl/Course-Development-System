# Scheduler Run Schema Design

## 1. 背景

K9-B 已关闭。Solver 已稳定在 10000 iterations 后达到 hardScore = 0。Gatekeeper plan 已完成（`docs/scheduler-run-gatekeeper-plan.md`）。本文档只做 schema 设计审计，不执行 schema 修改。

## 2. 现有模型审计

### SchedulingRun

| 字段 | 类型 | 是否足够 | 说明 |
|---|---|---|---|
| id | Int @id @default(autoincrement()) | 足够 | 主键 |
| configId | Int | 足够 | 关联 SchedulingConfig |
| status | String | **不足** | 无 enum 约束，缺少 PREVIEW/APPLYING/ROLLED_BACK 等状态 |
| hardScore | Int? | **不足** | 只有一个 score，缺少 before/after 区分 |
| softScore | Int? | **不足** | 同上 |
| iterations | Int? | 足够 | |
| durationMs | Int? | 足够 | |
| resultSnapshot | String? | **不足** | 无类型约束，缺少结构定义 |
| createdAt | DateTime | 足够 | |

**缺失字段：** mode, operatorId, startedAt, completedAt, appliedAt, rolledBackAt, rollbackOfRunId, errorMessage, hardScoreBefore, softScoreBefore, hc1-hc4 before/after, randomSeed, solverVersion, databaseFingerprint, previewExpiresAt, conflictSummary

### SchedulingConfig

| 字段 | 类型 | 是否足够 | 说明 |
|---|---|---|---|
| id | Int @id | 足够 | |
| name | String | 足够 | |
| semesterId | Int? | 足够 | |
| maxIterations | Int @default(10000) | 足够 | |
| lahcWindowSize | Int @default(500) | 足够 | |
| lockedTaskIds | String @default("[]") | 足够 | JSON 数组 |
| createdAt | DateTime | 足够 | |

**SchedulingConfig 基本足够**，无需修改。

### ScheduleSlot

| 字段 | 类型 | 是否用于 apply | 说明 |
|---|---|---|---|
| id | Int @id | 是 | 主键，solver result 中的 slotId |
| teachingTaskId | Int | 不变 | apply 不修改 |
| roomId | Int? | **是** | apply 更新此字段 |
| dayOfWeek | Int | **是** | apply 更新此字段 |
| slotIndex | Int | **是** | apply 更新此字段 |
| importBatchId | Int? | 不变 | 保留溯源 |
| createdAt | DateTime | 不变 | |
| updatedAt | DateTime | 自动更新 | Prisma 自动管理 |

**ScheduleSlot 足够**，apply 仅更新 dayOfWeek/slotIndex/roomId。

### ScheduleChangeLog

| 字段 | 类型 | 是否可复用 | 说明 |
|---|---|---|---|
| id | Int @id | - | |
| taskId | Int | **不适合** | 存 taskId 而非 slotId，语义不匹配 |
| oldDay | Int | 部分 | |
| oldSlotIndex | Int | 部分 | |
| oldRoomId | Int? | 部分 | |
| newDay | Int | 部分 | |
| newSlotIndex | Int | 部分 | |
| newRoomId | Int? | 部分 | |
| reason | String? | **不适合** | 无 runId 关联 |
| createdAt | DateTime | - | |

**不适合复用。** 缺少 runId、slotId、teachingTaskId，且语义为手动 CRUD 日志。

### ScheduleAdjustment

| 字段 | 与 scheduler apply 的关系 |
|---|---|
| originalSlotId | 关联 ScheduleSlot，onDelete: Cascade |
| status | ACTIVE/VOID |

**风险：** apply 后 ScheduleSlot 位置变更，ACTIVE 状态的 ScheduleAdjustment 引用的 originalSlot 位置已变，可能导致 adjustment 失效。建议 apply 前自动 void 所有 ACTIVE adjustments。

## 3. 代码使用审计

- SchedulingRun 当前是否被业务代码使用：**否** — 无任何 src/ 文件引用
- 是否已有 create / update SchedulingRun：**否**
- 是否已有 scheduler config UI 或 API：**否** — settings 页面为占位符
- resultSnapshot 当前是否有固定结构：**否** — 仅是 String? 字段，无类型定义
- 是否存在与未来 apply 冲突的现有实现：**否** — 完全空白
- 是否有撤销调课逻辑可参考 rollback：**是** — `ScheduleAdjustment` 的 void 逻辑（status → VOID）

## 4. RBAC / operator 审计

- 是否已有 schedule:run：**否** — `ALL_PERMISSIONS` 中不存在
- 是否建议新增 schedule:run：**是**
- operatorId 应关联的模型：`User` (id)
- 是否需要 operatorName / operatorEmail snapshot：**建议** — 记录操作时的 displayName，防止用户改名后审计记录不可读
- preview / apply / rollback 是否可共用 schedule:run：**是** — 操作语义紧密关联
- read report 是否可复用 schedule:view：**是** — 查看排课结果属于 schedule:view 语义

## 5. 推荐 schema 方案

### 5.1 扩展 SchedulingRun

保留现有字段，新增以下字段：

| 新增字段 | 类型 | 用途 |
|---|---|---|
| mode | String | PREVIEW / APPLY / ROLLBACK |
| operatorId | Int? | 关联 User.id |
| operatorName | String? | 操作时快照 displayName |
| startedAt | DateTime? | solver 开始时间 |
| completedAt | DateTime? | solver 完成时间 |
| appliedAt | DateTime? | 实际写入 ScheduleSlot 时间 |
| rolledBackAt | DateTime? | 回滚时间 |
| rollbackOfRunId | Int? | 如果是回滚操作，记录原 runId |
| hardScoreBefore | Int? | apply 前 hardScore |
| softScoreBefore | Int? | apply 前 softScore |
| hardScoreAfter | Int? | apply 后验证 hardScore |
| softScoreAfter | Int? | apply 后验证 softScore |
| hc1Before | Int? | apply 前 HC1 计数 |
| hc2Before | Int? | apply 前 HC2 计数 |
| hc3Before | Int? | apply 前 HC3 计数 |
| hc4Before | Int? | apply 前 HC4 计数 |
| hc1After | Int? | apply 后 HC1 计数 |
| hc2After | Int? | apply 后 HC2 计数 |
| hc3After | Int? | apply 后 HC3 计数 |
| hc4After | Int? | apply 后 HC4 计数 |
| randomSeed | Int? | solver 随机种子（可复现） |
| solverVersion | String? | solver 版本标识 |
| databaseFingerprint | String? | apply 前数据库快照 hash（用于检测并发修改） |
| previewExpiresAt | DateTime? | preview 过期时间 |
| conflictSummary | String? | JSON: { HC1: 0, HC2: 0, HC3: 0, HC4: 0 } |
| errorMessage | String? | 失败原因 |
| changedSlotCount | Int? | 变更的 ScheduleSlot 数量 |
| updatedAt | DateTime | 自动更新 |

### 5.2 新增 SchedulerRunChange

记录每条 ScheduleSlot 的 old/new values。

| 字段 | 类型 | 用途 |
|---|---|---|
| id | Int @id | 主键 |
| runId | Int | 关联 SchedulingRun |
| scheduleSlotId | Int | 变更的 ScheduleSlot.id |
| teachingTaskId | Int | 冗余存储，便于查询 |
| oldDayOfWeek | Int | 变更前 |
| oldSlotIndex | Int | 变更前 |
| oldRoomId | Int? | 变更前 |
| newDayOfWeek | Int | 变更后 |
| newSlotIndex | Int | 变更后 |
| newRoomId | Int? | 变更后 |
| courseNameSnapshot | String? | 课程名快照（便于审计阅读） |
| teacherNameSnapshot | String? | 教师名快照 |
| classGroupsSnapshot | String? | 班级名快照 JSON |
| roomNameOldSnapshot | String? | 旧教室名快照 |
| roomNameNewSnapshot | String? | 新教室名快照 |
| createdAt | DateTime | |

### 5.3 新增 enum

```prisma
enum SchedulerRunStatus {
  PENDING
  PREVIEW
  APPLYING
  COMPLETED
  FAILED
  ROLLED_BACK
}

enum SchedulerRunMode {
  PREVIEW
  APPLY
  ROLLBACK
}
```

**注意：** SQLite 不支持原生 enum。Prisma 在 SQLite 下会将 enum 映射为 String。因此实际 schema 中使用 `String` 字段 + 应用层约束即可，无需声明 enum block。

## 6. ScheduleChangeLog 复用判断

**不建议复用 ScheduleChangeLog，建议新增 SchedulerRunChange。**

原因：

1. **语义不同**：ScheduleChangeLog 记录手动 CRUD 操作（单条），SchedulerRunChange 记录 solver 批量 apply（数百条）
2. **关联不同**：ScheduleChangeLog 无 runId 关联，无法按 run 查询/回滚；SchedulerRunChange 通过 runId 关联
3. **字段不同**：ScheduleChangeLog 存 taskId 而非 slotId，缺少 teachingTaskId、name snapshot 等审计字段
4. **回滚需求**：rollback 需要按 runId 批量读取 old values，ScheduleChangeLog 无法满足

## 7. Prisma schema patch 草案

**注意：以下仅为文档草案，不实际修改 schema.prisma。**

```prisma
// ─── 对 SchedulingRun 的扩展 ───

model SchedulingRun {
  id                    Int              @id @default(autoincrement())
  configId              Int
  config                SchedulingConfig @relation(fields: [configId], references: [id])
  mode                  String           @default("APPLY")  // PREVIEW | APPLY | ROLLBACK
  status                String           @default("PENDING") // PENDING | PREVIEW | APPLYING | COMPLETED | FAILED | ROLLED_BACK
  operatorId            Int?
  operator              User?            @relation(fields: [operatorId], references: [id])
  operatorNameSnapshot  String?
  startedAt             DateTime?
  completedAt           DateTime?
  appliedAt             DateTime?
  rolledBackAt          DateTime?
  rollbackOfRunId       Int?
  iterations            Int?
  durationMs            Int?
  randomSeed            Int?
  solverVersion         String?
  hardScore             Int?
  softScore             Int?
  hardScoreBefore       Int?
  softScoreBefore       Int?
  hardScoreAfter        Int?
  softScoreAfter        Int?
  hc1Before             Int?
  hc2Before             Int?
  hc3Before             Int?
  hc4Before             Int?
  hc1After              Int?
  hc2After              Int?
  hc3After              Int?
  hc4After              Int?
  resultSnapshot        String?          // JSON: { assignments: [{slotId, dayOfWeek, slotIndex, roomId}] }
  conflictSummary       String?          // JSON: { HC1: 0, HC2: 0, HC3: 0, HC4: 0 }
  databaseFingerprint   String?
  previewExpiresAt      DateTime?
  changedSlotCount      Int?
  errorMessage          String?
  createdAt             DateTime         @default(now())
  updatedAt             DateTime         @updatedAt
  changes               SchedulerRunChange[]
}

// ─── 新增 SchedulerRunChange ───

model SchedulerRunChange {
  id                  Int          @id @default(autoincrement())
  runId               Int
  run                 SchedulingRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  scheduleSlotId      Int
  teachingTaskId      Int
  oldDayOfWeek        Int
  oldSlotIndex        Int
  oldRoomId           Int?
  newDayOfWeek        Int
  newSlotIndex        Int
  newRoomId           Int?
  courseNameSnapshot   String?
  teacherNameSnapshot  String?
  classGroupsSnapshot  String?
  roomNameOldSnapshot  String?
  roomNameNewSnapshot  String?
  createdAt           DateTime     @default(now())
}

// ─── User 模型新增反向关系 ───

model User {
  // ... existing fields ...
  schedulingRuns SchedulingRun[]
}
```

## 8. 数据库迁移风险

- 下一阶段是否需要备份 dev.db：**是** — 必须在 schema 修改前备份
- 下一阶段是否需要 prisma db push：**是** — 使用 `npx prisma db push`
- 是否允许 migrate：**否** — 项目使用 db push 而非 migrate
- 是否允许 force-reset：**否** — 不允许 `--force-reset`
- 是否允许删除业务数据：**否**
- dev.db 是否允许提交：**否**
- 下一阶段需要哪些验证：
  1. 备份 dev.db
  2. prisma db push
  3. 验证现有数据完整（test-capacity, test-diagnostics, test-classgroup-matching）
  4. 验证新模型可读写
  5. 不提交 dev.db

## 9. preview / apply / rollback 映射

### Preview

- 是否创建 SchedulingRun 记录：**是** — mode=PREVIEW, status=PREVIEW
- 是否创建 SchedulerRunChange：**否** — preview 不写 ScheduleSlot
- 是否保存 resultSnapshot：**是** — 保存 solver 结果 JSON
- 是否需要 previewExpiresAt：**是** — 建议 5 分钟 TTL
- 是否写库：**仅写 SchedulingRun 记录**，不写 ScheduleSlot。理由：需要持久化 previewId 供 apply 引用，且 SchedulingRun 记录本身不影响排课数据

### Apply

- 是否创建 / 更新 SchedulingRun：**创建新记录** — mode=APPLY, status=APPLYING → COMPLETED
- 是否写 SchedulerRunChange：**是** — 每条变更记录 old/new
- 是否事务更新 ScheduleSlot：**是** — prisma.$transaction
- 是否 apply 前后验证 hardScore=0：**是**
- 是否保存 old/new values：**是** — 通过 SchedulerRunChange

### Rollback

- 是否读取 SchedulerRunChange：**是** — 按 runId 读取
- 是否逐条恢复 old values：**是** — 在事务内恢复 dayOfWeek/slotIndex/roomId
- 是否生成新的 rollback run：**是** — mode=ROLLBACK, status=COMPLETED
- 是否更新原 run status：**是** — 更新为 ROLLED_BACK
