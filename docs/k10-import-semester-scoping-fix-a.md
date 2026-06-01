# K10-SEMESTER-IMPORT-SCOPING-FIX-A

## 1. 阶段名

`K10-SEMESTER-IMPORT-SCOPING-FIX-A`

## 2. 修复目标

实现 import 主链路 semesterId 线程化，使新导入的 TeachingTask / ScheduleSlot / ClassGroup 能进入目标学期并被已 scoped 链路读取。

## 3. Schema 修改说明

### ImportBatch 新增字段

```prisma
model ImportBatch {
  // ... existing fields ...
  semesterId Int?
  semester   Semester? @relation(fields: [semesterId], references: [id])
  // ... existing relations ...
  @@index([semesterId])
}
```

### Semester 新增 back-relation

```prisma
model Semester {
  // ... existing relations ...
  importBatches ImportBatch[]
}
```

### 未修改的模型

- `TeachingTask` — 已有 nullable `semesterId`（无需修改）
- `ScheduleSlot` — 已有 nullable `semesterId`（无需修改）
- `ClassGroup` — 已有 nullable `semesterId`（无需修改）
- `ClassGroup.name @unique` — 保留全局唯一（Fix-B 处理）

## 4. 数据库备份

- 备份路径：`prisma/dev.db.backup-before-k10-import-scoping-fixa-20260601171417`
- 备份时间：2026-06-01 17:14:17

## 5. db push 结果

- `npx.cmd prisma format` — 成功
- `npx.cmd prisma db push` — 成功（未使用 --accept-data-loss，未 force reset）
- `npx.cmd prisma generate` — 遇到 Windows 文件锁（DLL 被占用），需关闭 dev server 后重试

## 6. semesterId 线程化路径

### 6.1 Parse 阶段

- `src/app/api/admin/import/parse/route.ts`
- 调用 `resolveSchedulerSemester()` 解析目标学期
- 创建 ImportBatch 时写入 `semesterId: semester.id`
- 响应中返回 `semesterId`

### 6.2 Confirm 阶段

- `src/app/api/admin/import/confirm/route.ts`
- 调用 `resolveSchedulerSemester()` 解析目标学期
- 传递 `semester.id` 到 `confirmImportBatchDryRun()` 和 `confirmImportBatch()`

### 6.3 Confirm 行为

- `src/lib/import/importer.ts` — `confirmImportBatch()`
- 校验 `batch.semesterId !== semesterId` 时拒绝并抛出错误
- `batch.semesterId` 为 null 的 legacy pending batch 自动绑定到目标学期

### 6.4 Rollback 行为

- `src/app/api/admin/import/rollback/route.ts`
- 校验 `batch.semesterId !== semester.id` 时返回 409
- rollback 删除仍依赖 `importBatchId`（安全，因为 importBatchId 唯一）

### 6.5 Batches 列表

- `src/app/api/admin/import/batches/route.ts`
- 按 `semesterId` 过滤：返回目标学期的 batches + `semesterId: null` 的 legacy batches

### 6.6 Batch 详情

- `src/app/api/admin/import/batches/[id]/route.ts`
- 校验 `batch.semesterId !== semester.id` 时返回 409

### 6.7 Abandon

- `src/app/api/admin/import/batches/[id]/abandon/route.ts`
- 校验 `batch.semesterId !== semester.id` 时返回 409

## 7. Importer 修复

### 7.1 函数签名变更

- `executeImportInTransaction(tx, prepared, batchId, semesterId)`
- `confirmImportBatchDryRun(batchId, strategy, semesterId)`
- `confirmImportBatch(batchId, strategy, semesterId)`
- `simulateConfirmImportBatch(batchId, strategy, semesterId)`
- `prepareRecords(batchId, targetSemesterId?)`

### 7.2 TeachingTask 修复

- `create` 写入 `semesterId`
- `findMany` 查重增加 `semesterId` 条件
- 证据：`src/lib/import/importer.ts` 第 541-569 行

### 7.3 ScheduleSlot 修复

- `create` 写入 `semesterId`
- `findFirst` 去重增加 `semesterId` 条件
- 证据：`src/lib/import/importer.ts` 第 601-613 行

### 7.4 ClassGroup 修复

- `create` 写入 `semesterId`
- `findUnique({ where: { name } })` 保留全局唯一查询（因 `name @unique`）
- 证据：`src/lib/import/importer.ts` 第 466-479 行

## 8. ClassGroup 暂缓项

- `ClassGroup.name @unique` 全局唯一约束未修改
- 跨学期同名 ClassGroup 无法创建（受全局唯一约束限制）
- 此问题留到 Fix-B 阶段处理
- Fix-B 方案：重构为 `@@unique([semesterId, name])` + 数据迁移

## 9. Client 变更

- `src/lib/import/client.ts`
- 新增 `parseImportFile()` — 上传文件并解析
- 新增 `confirmImportDryRun()` — 确认导入干跑
- 新增 `confirmImportReal()` — 确认导入执行
- 保留现有 `fetchImportBatches()`、`rollbackImportBatch()` 等函数（无需前端传 semesterId，API 使用 active semester）

## 10. Types 变更

- `src/types/import.ts`
- `ImportParseResult` 新增 `semesterId?: number`
- `ImportBatchListItem` 新增 `semesterId: number | null`
- `ImportBatchDetail` 继承 `ImportBatchListItem`（自动包含 `semesterId`）
- `ImportBatchListResponse` 新增 `semesterId?: number`

## 11. 验证命令和结果

```bash
npx.cmd tsx scripts/verify-import-semester-scoping-fix-a.ts
npx.cmd tsx scripts/audit-import-semester-scoping.ts
npm.cmd run build
npm.cmd run lint
```

## 12. 剩余风险

| 风险 | 严重度 | 说明 | 阶段 |
|------|--------|------|------|
| ClassGroup 全局唯一 | MEDIUM | 跨学期同名班级无法创建 | Fix-B |
| Confirmed guard 全局 | MEDIUM | 任意学期有 confirmed batch 会阻塞其他学期 | Fix-B |
| Legacy null semesterId batch | LOW | 旧 batch 无 semesterId，confirm 时自动绑定 | 无 |
| UI semester selector | LOW | 前端无学期选择器，依赖 API 默认 active semester | 后续 |

## 13. 下一阶段建议

- 阶段名：`K10-SEMESTER-IMPORT-SCOPING-FIX-B`
- 目标：
  - 重构 `ClassGroup.name @unique` 为 `@@unique([semesterId, name])`
  - 将 confirmed/confirming guard 改为 semester-scoped
  - 历史数据迁移（null semesterId → 默认学期）
  - 考虑 UI semester selector
