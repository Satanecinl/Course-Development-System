# Import Workflow

导入模块的完整生命周期、API、安全边界与验收流程。

## 1. 模块目标

导入模块负责：

- 前端上传 Word `.docx` 课程表
- Python 解析生成结构化 JSON
- 创建 pending ImportBatch
- 用户 dry-run 检查解析质量与导入计划
- 用户确认导入（写入 TeachingTask / TeachingTaskClass / ScheduleSlot）
- 导入历史审计（查看所有批次状态与统计）
- 用户可回滚 confirmed 批次（删除本批次创建的业务数据）
- 用户可废弃 pending 批次（标记为 abandoned，不删除数据）

## 2. ImportBatch 状态机

| 当前状态 | 允许操作 | 下一个状态 | 说明 |
|---|---|---|---|
| `pending` | confirm dry-run | `pending` | 只读检查，不修改状态 |
| `pending` | confirm | `confirming` | 原子 `updateMany`，开始写入 |
| `confirming` | (成功) | `confirmed` | transaction 内完成写入 |
| `confirming` | (失败) | `failed` | transaction 外更新状态 |
| `pending` | abandon | `abandoned` | 标记为废弃，不删除数据 |
| `confirmed` | rollback dry-run | `confirmed` | 只读检查，不修改状态 |
| `confirmed` | rollback | `rolling_back` | 原子 `updateMany`，开始删除 |
| `rolling_back` | (成功) | `rolled_back` | transaction 内完成删除 |
| `rolling_back` | (失败) | `rollback_failed` | transaction 外更新状态 |
| `rolled_back` | (只读) | — | 不可再操作 |
| `abandoned` | (只读) | — | 不可再操作 |
| `failed` | (只读) | — | 后续人工处理 |
| `rollback_failed` | (只读) | — | 后续人工处理 |

状态流转图：

```
pending ──confirm──> confirming ──成功──> confirmed ──rollback──> rolling_back ──成功──> rolled_back
  │                     │                    │                        │
  │                     └──失败──> failed     └──失败──> rollback_failed
  │
  └──abandon──> abandoned
```

## 3. 数据写入范围

### Confirm 写入

confirm 会写入以下业务表：

| 表 | 操作 | 说明 |
|---|---|---|
| TeachingTask | 创建 | `importBatchId = batch.id` |
| TeachingTaskClass | 创建 | 关联 TeachingTask 与 ClassGroup |
| ScheduleSlot | 创建 | `importBatchId = batch.id` |
| ClassGroup | 创建或复用 | 按 `name` 去重 |
| Teacher | 创建或复用 | 按 `name` 去重 |
| Course | 创建或复用 | 按 `name` 去重 |
| Room | 创建或复用 | 按 `name` 去重 |

### Rollback 删除

rollback 只删除以下记录：

| 表 | 条件 |
|---|---|
| ScheduleSlot | `importBatchId = batch.id` |
| TeachingTaskClass | `teachingTask.importBatchId = batch.id` |
| TeachingTask | `importBatchId = batch.id` |

rollback **不删除**：

- ClassGroup、Teacher、Course、Room（基础数据保留）
- reused TeachingTask（其他批次创建或手动创建的任务）
- reused ScheduleSlot（其他批次创建或手动创建的时段）
- 其他 batch 的任何数据

### Abandon

abandon 不删除任何业务数据，也不删除上传文件。仅将 `ImportBatch.status` 从 `pending` 改为 `abandoned`。

## 4. 安全约束

### 前端 → 后端

- 前端**不发送** parsed records 给 confirm API
- 前端**不发送** quality 给 confirm API
- 前端**不发送** parsedJson 给 confirm API
- 后端从 `parsedJsonPath` 读取服务端保存的解析结果
- 前端只发送 `batchId` + `strategy` + `dryRun` + `confirmText`

### 后端 → 前端

- API **不暴露** `parsedJsonPath`
- API **不暴露** `originalFilePath`
- API **不返回** 完整 parsed records

### Rollback 安全

- rollback 必须先 dry-run（确认 `canRollback = true`）
- rollback 必须输入 `ROLLBACK_IMPORT` 二次确认
- `externalSlotsForImportedTasks > 0` 会阻止 rollback
- `hasOrphanSlots = true` 会阻止 rollback

### Abandon 安全

- abandon 必须输入 `ABANDON_IMPORT` 二次确认
- 只允许 `pending` 状态的 batch abandon

### CLI 脚本保护

- `confirm-import-once.ts` 需要 `CONFIRM_IMPORT=1`
- `rollback-import-once.ts` 需要 `ROLLBACK_IMPORT=1`
- `abandon-import-once.ts` 需要 `ABANDON_IMPORT=1`
- 默认运行均不写数据库

### 历史计数

- `createdTaskCount` / `createdSlotCount` 是历史新增数量
- `rolled_back` 后**不清零**，保留历史记录
- `actualCreatedTaskCount` / `actualCreatedSlotCount` / `actualTeachingTaskClassCount` 在 `rolled_back` 后应为 0
- `rollbackComplete = (status === 'rolled_back' && actualCreatedTaskCount === 0 && actualCreatedSlotCount === 0 && actualTeachingTaskClassCount === 0)`
- `metadataMatch` 在 `rolled_back` 后可能为 `false`，这是正常状态

## 5. API 清单

### POST /api/admin/import/parse

- **用途**：上传 `.docx` 文件，Python 解析，创建 pending ImportBatch
- **请求**：`multipart/form-data`，字段 `file`
- **返回**：`{ success, batchId, filename, stats, quality, records }`
- **写数据库**：是（创建 ImportBatch + 保存文件）
- **前端发送 records**：否（前端只上传文件）

### POST /api/admin/import/confirm

- **用途**：dry-run 检查或真实确认导入
- **请求**：`{ batchId, strategy, dryRun?, confirmText? }`
- **dryRun=true 返回**：`{ success, dryRun: true, plan }`
- **dryRun=false 返回**：`{ success, dryRun: false, result }`
- **写数据库**：dryRun=false 时是（创建 TeachingTask 等）
- **前端发送 records/quality/parsedJson**：否
- **关键 guard**：`confirmText = "CONFIRM_IMPORT"`、batch 必须是 `pending`

### GET /api/admin/import/batches

- **用途**：获取所有 ImportBatch 列表
- **返回**：`{ success, batches: [{ id, filename, status, recordCount, ... }] }`
- **写数据库**：否
- **不暴露**：`parsedJsonPath`、`originalFilePath`

### GET /api/admin/import/batches/[id]

- **用途**：获取单个 ImportBatch 详情
- **返回**：`{ success, batch: { ..., actualCreatedTaskCount, metadataMatch, rollbackComplete, ... } }`
- **写数据库**：否
- **不暴露**：`parsedJsonPath`、`originalFilePath`

### POST /api/admin/import/rollback

- **用途**：dry-run 检查或真实回滚
- **请求**：`{ batchId, dryRun?, confirmText? }`
- **dryRun=true 返回**：`{ success, dryRun: true, plan }`
- **dryRun=false 返回**：`{ success, dryRun: false, result }`
- **写数据库**：dryRun=false 时是（删除 TeachingTask 等）
- **关键 guard**：`confirmText = "ROLLBACK_IMPORT"`、batch 必须是 `confirmed`、`externalSlotsForImportedTasks === 0`、`hasOrphanSlots === false`

### POST /api/admin/import/batches/[id]/abandon

- **用途**：废弃 pending batch
- **请求**：`{ confirmText }`
- **返回**：`{ success, batchId, status: "abandoned" }`
- **写数据库**：是（更新 ImportBatch.status）
- **关键 guard**：`confirmText = "ABANDON_IMPORT"`、batch 必须是 `pending`

## 6. 前端入口

### /admin/db 页面

- **右上角「导入课程表」**：打开 `ScheduleImportDialog`，支持上传、解析、dry-run、confirm
- **右上角「导入历史」**：打开 `ImportBatchHistory`，支持查看所有批次、详情、rollback、abandon

### ImportBatchHistory 组件行为

| Batch 状态 | 显示按钮 |
|---|---|
| `pending` | 废弃 |
| `confirmed` | 回滚前检查、回滚 |
| `rolled_back` | （只读展示） |
| `abandoned` | （只读展示） |
| `failed` | （只读展示） |
| `rollback_failed` | （只读展示） |

## 7. 验收命令

```bash
# 综合验收（不写库）
npm run test:import-workflow

# 完整验收（含 build + audit）
npm run test:import-workflow:full

# 单项测试
npm run test:import-quality           # 解析质量回归
npm run test:import-batches           # 批次 API 审计
npm run test:confirm-import-dry-run   # Confirm dry-run 不变量
npm run test:rollback-dry-run         # Rollback dry-run 不变量
npm run test:rollback-api-guards      # Rollback API guard
npm run test:abandon-import-batch     # Abandon API guard

# 审计（无 confirmed batch 时正常 skip）
npm run audit:confirmed-import        # Confirmed batch 审计
npm run audit:import-coverage         # 导入覆盖率审计

# 构建
npm run build
```

无 confirmed batch 时正常 skip 的命令：

- `audit:confirmed-import`
- `audit:import-coverage`
- `test:rollback-api-guards`

## 8. 手动浏览器验收流程

仅在明确要做真实链路验收时执行。**执行前必须备份 SQLite `prisma/dev.db`。**

1. 打开 `/admin/db`
2. 点击「导入课程表」，上传 `.docx` 文件
3. 点击「解析」，查看解析质量
4. 点击「导入前检查 (Dry Run)」，确认 `canImport = true`
5. 点击「确认导入数据库」，二次确认后执行
6. 点击「导入历史」，确认新 batch 显示为「已确认」
7. 查看详情，确认 `metadataMatch = true`
8. 点击「回滚前检查」，确认 `canRollback = true`
9. 点击「回滚」，输入 `ROLLBACK_IMPORT`，确认
10. 确认 batch 变为「已回滚」，`rollbackComplete = true`
11. 确认业务表数量恢复到执行前

## 9. 已知边界

- **无多学期版本隔离**：当前不支持跨学期的导入版本管理
- **单 confirmed 限制**：同一时刻只允许一个 confirmed batch，避免重复确认
- **pending 可 abandoned**：abandon 不删除上传文件，文件留在 `uploads/imports/`
- **rollback 有限**：rollback 不处理用户后续手工改动导致的复杂依赖；`externalSlotsForImportedTasks > 0` 会阻止 rollback
- **容量与人数**：当前容量数据和班级人数仍需要后续治理
- **solver 联动**：当前 solver 与导入批次尚未正式联动
