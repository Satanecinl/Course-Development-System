# Scheduler Run Gatekeeper Plan

## 1. 背景

K9-B 阶段已完成以下工作：

- **数据质量修复 (K9-DQ)**：remark 合班匹配修复、TeachingTask-ClassGroup 污染清理（96 条删除）、parser course name sanitization、seed keyword filtering 同步。当前 `totalSuspiciousLinks = 0`、`targetSuspiciousLinks = 0`、`AMBIGUOUS_SUBSEQ_MATCH = 0`、`test-classgroup-matching 21/0`。
- **Room.capacity 规范化 (K9-B)**：12 个容量不足 room 按 `ceil(maxAssignedStudentCount * 1.10)` 上调；39 个历史默认 `capacity=50` room 规范化。当前 `roomsWithCapacity50 = 0`、`currentHC4Count = 0`。
- **Solver 修复 (K9-B)**：修复 move generator（hard-compatible placement 检查、ROOM_ONLY/TIME_ONLY/TIME_AND_ROOM move 类型、exhaustive search mode）、hard-first acceptance、hard=0 regression guard、FIRST_HALF/SECOND_HALF weekType 支持。连续 3 次 10000 iterations 均达到 `hardScore = 0`。

尽管 solver 已稳定收敛，仍不能直接开放 `/api/scheduler/run`。需要设计完整的安全门禁方案，确保自动排课结果的安全写入、权限控制、事务保护和回滚能力。

## 2. 总体原则

1. **dry-run 和 apply 分离**：preview 阶段只读运行 solver，返回结果摘要；apply 阶段才写数据库。
2. **apply 必须二次确认**：使用 `confirmText === 'CONFIRM_SCHEDULER_RUN'` 哨兵字符串，与现有 import/adjustment 模式一致。
3. **apply 必须有权限**：需要 `schedule:run` 权限，普通用户不可触发。
4. **apply 必须有事务**：所有 ScheduleSlot 更新在 `prisma.$transaction` 内完成。
5. **apply 前必须重新验证 hardScore = 0**：在事务内、写入前重新运行 solver 或校验结果。
6. **apply 后必须重新验证 hardScore = 0**：写入后重新加载数据并评分，确认无 hard conflict。
7. **失败必须回滚**：事务内任何异常自动回滚。
8. **不得持久化带 hard conflict 的结果**：`hardScore != 0` 时阻断写入。
9. **不得绕过 RBAC**：所有 API 路由使用 `requirePermission`。
10. **操作必须可审计**：记录操作者、时间、solver 配置、score、变更明细。

## 3. 建议 API 分层

### 3.1 POST `/api/admin/scheduler/preview`

**只读**。运行 solver 并返回结果摘要，不写数据库。

**请求体：**
```json
{
  "maxIterations": 10000,
  "lahcWindowSize": 500,
  "lockedSlotIds": []
}
```

**响应：**
```json
{
  "previewId": "uuid",
  "status": "READY",
  "score": {
    "hardScore": 0,
    "softScore": -502
  },
  "conflicts": {
    "HC1": 0,
    "HC2": 0,
    "HC3": 0,
    "HC4": 0
  },
  "changes": {
    "totalSlots": 440,
    "movedSlots": 5,
    "unchangedSlots": 435
  },
  "solverConfig": {
    "maxIterations": 10000,
    "lahcWindowSize": 500
  },
  "durationMs": 245,
  "blocked": false,
  "blockReason": null
}
```

**阻断条件：**
- `hardScore != 0` → `blocked: true`，`blockReason: "HARD_CONFLICTS_REMAIN"`
- solver 超时 → `blocked: true`

**权限：** `schedule:run`

### 3.2 POST `/api/admin/scheduler/apply`

**写数据库**。必须二次确认。

**请求体：**
```json
{
  "previewId": "uuid",
  "confirmText": "CONFIRM_SCHEDULER_RUN",
  "reason": "学期初自动排课"
}
```

**处理流程：**
1. 验证 `confirmText === 'CONFIRM_SCHEDULER_RUN'`
2. 验证 `previewId` 对应的 preview 未过期（建议 5 分钟 TTL）
3. 重新运行 solver（或从 preview 缓存获取结果）
4. 验证 `hardScore === 0`
5. 在 `prisma.$transaction` 内：
   a. 创建 `SchedulingRun` 记录（status = 'APPLYING'）
   b. 遍历 solver 结果，对有变化的 ScheduleSlot 逐条 update
   c. 记录每条变更到 `SchedulerRunChange`
   d. 更新 `SchedulingRun.status = 'COMPLETED'`
6. 写入后重新加载数据并评分，验证 `hardScore === 0`
7. 如果 post-apply 验证失败 → 事务回滚

**响应：**
```json
{
  "runId": 42,
  "status": "COMPLETED",
  "score": {
    "hardScore": 0,
    "softScore": -502
  },
  "changes": {
    "updatedSlots": 5
  }
}
```

**权限：** `schedule:run`

### 3.3 POST `/api/admin/scheduler/rollback`

**回滚**。将 solver run 的变更恢复到 run 前状态。

**请求体：**
```json
{
  "runId": 42,
  "confirmText": "ROLLBACK_SCHEDULER_RUN"
}
```

**权限：** `schedule:run`

## 4. 权限设计

### 4.1 建议新增权限

| 权限 key | 描述 | 推荐 |
|---|---|---|
| `schedule:run` | 运行自动排课（preview + apply + rollback） | **是** |

不建议拆分为 `schedule:preview` / `schedule:apply` / `schedule:rollback`，因为：
- 操作语义紧密关联，同一用户通常需要全部能力
- 拆分会增加 RBAC 配置复杂度
- 现有 `import:manage` 权限覆盖了 parse/confirm/rollback 三个操作，是合理的参照

### 4.2 推荐授权角色

| 角色 | schedule:run | 说明 |
|---|---|---|
| ADMIN | 是 | 管理员默认拥有 |
| USER | 否 | 普通用户不可运行自动排课 |
| DATA_EXPORTER | 否 | 仅数据导出 |

### 4.3 操作者记录

- `SchedulingRun.operatorId` 记录执行者 userId
- `SchedulerRunChange` 不需要单独记录操作者（通过 runId 关联）

## 5. 持久化策略

### 5.1 已有 Prisma Model

项目已有 `SchedulingConfig` 和 `SchedulingRun` 模型：

```prisma
model SchedulingConfig {
  id              Int              @id @default(autoincrement())
  name            String
  semesterId      Int?
  maxIterations   Int              @default(10000)
  lahcWindowSize  Int              @default(500)
  lockedTaskIds   String           @default("[]")
  createdAt       DateTime         @default(now())
  runs            SchedulingRun[]
}

model SchedulingRun {
  id              Int              @id @default(autoincrement())
  configId        Int
  config          SchedulingConfig @relation(fields: [configId], references: [id])
  status          String
  hardScore       Int?
  softScore       Int?
  iterations      Int?
  durationMs      Int?
  resultSnapshot  String?
  createdAt       DateTime         @default(now())
}
```

当前状态：**模型已存在但无 API 路由使用**。

### 5.2 建议 Schema 修改

需要扩展 `SchedulingRun` 并新增 `SchedulerRunChange`：

**SchedulingRun 扩展：**
```prisma
model SchedulingRun {
  id              Int              @id @default(autoincrement())
  configId        Int
  config          SchedulingConfig @relation(fields: [configId], references: [id])
  status          String           // PENDING | PREVIEW | APPLYING | COMPLETED | FAILED | ROLLED_BACK
  hardScore       Int?
  softScore       Int?
  iterations      Int?
  durationMs      Int?
  resultSnapshot  String?          // JSON: { assignments: [{slotId, dayOfWeek, slotIndex, roomId}] }
  operatorId      Int?             // 执行者 userId
  reason          String?          // 操作原因
  appliedAt       DateTime?        // 实际写入时间
  rolledBackAt    DateTime?        // 回滚时间
  createdAt       DateTime         @default(now())
  changes         SchedulerRunChange[]
}
```

**新增 SchedulerRunChange：**
```prisma
model SchedulerRunChange {
  id            Int          @id @default(autoincrement())
  runId         Int
  run           SchedulingRun @relation(fields: [runId], references: [id])
  scheduleSlotId Int
  oldDayOfWeek  Int
  oldSlotIndex  Int
  oldRoomId     Int?
  newDayOfWeek  Int
  newSlotIndex  Int
  newRoomId     Int?
  createdAt     DateTime     @default(now())
}
```

### 5.3 直接更新 ScheduleSlot

Apply 阶段直接更新 `ScheduleSlot.dayOfWeek`、`ScheduleSlot.slotIndex`、`ScheduleSlot.roomId`。不创建新 ScheduleSlot，不删除旧 ScheduleSlot。

### 5.4 ScheduleAdjustment 处理

- Solver 运行基于 `ScheduleSlot` 的基础排课，不考虑 `ScheduleAdjustment`
- Apply 后，已有的 `ScheduleAdjustment` 可能失效（因为原始 slot 位置已变）
- 建议：apply 时自动将所有 `ACTIVE` 状态的 `ScheduleAdjustment` 设为 `VOID`，并在响应中提示用户
- 或者：在 preview 阶段检查是否存在 ACTIVE adjustments，提示用户需要先处理

### 5.5 不应更新的表

- `TeachingTask` — 不变
- `TeachingTaskClass` — 不变
- `ClassGroup` — 不变
- `Teacher` — 不变
- `Course` — 不变
- `Room` — 不变
- `ImportBatch` — 不变

## 6. 事务与回滚

### 6.1 事务策略

```
prisma.$transaction(async (tx) => {
  // 1. 创建 SchedulingRun (status = APPLYING)
  const run = await tx.schedulingRun.create({ data: { ... } })

  // 2. 遍历 solver 结果，逐条更新 ScheduleSlot
  for (const change of changes) {
    const oldSlot = await tx.scheduleSlot.findUnique({ where: { id: change.slotId } })
    await tx.scheduleSlot.update({
      where: { id: change.slotId },
      data: { dayOfWeek: change.newDay, slotIndex: change.newSlotIndex, roomId: change.newRoomId }
    })
    await tx.schedulerRunChange.create({ data: { runId: run.id, ...oldValues, ...newValues } })
  }

  // 3. 标记完成
  await tx.schedulingRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', appliedAt: new Date() } })
})
```

### 6.2 回滚策略

**自动回滚：** 事务内任何异常导致 Prisma 自动 rollback。

**手动回滚 API：** `POST /api/admin/scheduler/rollback`
1. 读取 `SchedulerRunChange` 中的 old values
2. 在事务内逐条恢复 `ScheduleSlot` 到 old values
3. 更新 `SchedulingRun.status = 'ROLLED_BACK'`

### 6.3 Post-Apply 验证

写入后重新加载 `SchedulingContext`，运行 `calculateScoreWithDetails`，验证 `hardScore === 0`。如果非 0，抛错触发事务回滚。

## 7. 安全阻断条件

Apply 被阻断的条件：

1. `hardScore != 0` — solver 结果存在硬冲突
2. `HC1/HC2/HC3/HC4` 任一非 0 — 存在具体冲突类型
3. solver 未完成 — `status != 'READY'`
4. solver result 缺少 `scheduleSlotId` — 结果数据不完整
5. solver result 引用不存在的 `roomId` — 教室数据不一致
6. solver result 引用不存在的 `teachingTaskId` — 任务数据不一致
7. `Room.capacity` 缺失 — 容量数据不完整
8. 存在 `capacity=50` 默认占位残留 — 容量未规范化
9. 存在 suspicious TeachingTaskClass link — 数据质量未清理
10. 存在 ambiguous classgroup match — 匹配不确定
11. 用户无 `schedule:run` 权限 — 权限不足
12. preview 已过期（> 5 分钟） — 需要重新 preview
13. preview 与当前数据库版本不一致 — 数据已变更

## 8. 前端交互要求

### 8.1 Preview 页面

- 显示 solver 运行状态（loading / done / blocked）
- 显示 hardScore / softScore
- 显示 HC1/HC2/HC3/HC4 冲突数
- 显示 affected slots 数量和明细
- 显示 room / teacher / class conflicts 为 0 时的绿色状态
- `hardScore != 0` 时禁用 apply 按钮
- 显示 solver 配置（iterations、duration）

### 8.2 Apply 确认

- 弹出确认对话框
- 显示 `confirmText` 输入框（用户需输入 `CONFIRM_SCHEDULER_RUN`）
- 显示 affected slots 数量
- 显示可回滚说明
- 显示操作者和时间

### 8.3 防误触发

- 不允许前端直接绕过 preview 调 apply
- apply 按钮仅在 preview 成功且 `hardScore = 0` 时启用
- 前端路由守卫：需要 `schedule:run` 权限才能访问自动排课页面

## 9. 与现有调课逻辑的关系

### 9.1 ScheduleAdjustment 影响

- Solver 运行基于 `ScheduleSlot` 基础排课，不考虑 `ScheduleAdjustment`
- Apply 后，已有 `ACTIVE` 状态的 `ScheduleAdjustment` 引用的 `originalSlot` 位置已变，可能导致 adjustment 失效
- **建议：** apply 前检查是否存在 ACTIVE adjustments，如果有则提示用户先处理（void 或确认）
- **或者：** apply 时自动 void 所有 ACTIVE adjustments，并在响应中说明

### 9.2 ScheduleChangeLog

- 现有 `ScheduleChangeLog` 仅记录手动 CRUD 操作
- Solver apply 不需要写入 `ScheduleChangeLog`（使用 `SchedulerRunChange` 替代）
- 两种日志独立共存

### 9.3 ImportBatch 关系

- `ScheduleSlot.importBatchId` 记录 slot 来源
- Solver apply 不应清除 `importBatchId`（保留溯源信息）
- Solver apply 不应创建新的 `ImportBatch`

## 10. 推荐实施阶段拆分

1. **K9-C-SCHEDULER-RUN-SCHEMA-DESIGN** — 扩展 `SchedulingRun` 模型，新增 `SchedulerRunChange` 模型，运行 `prisma db push`
2. **K9-C-SCHEDULER-RUN-PREVIEW-API** — 实现 `POST /api/admin/scheduler/preview`，只读运行 solver，返回结果摘要
3. **K9-C-SCHEDULER-RUN-APPLY-TRANSACTION** — 实现 `POST /api/admin/scheduler/apply`，事务写入 + rollback + post-apply 验证
4. **K9-C-SCHEDULER-RUN-FRONTEND-GATEKEEPER** — 实现前端 preview 页面、apply 确认对话框、权限守卫
5. **K9-C-SCHEDULER-RUN-E2E** — 端到端测试：preview → apply → verify → rollback
