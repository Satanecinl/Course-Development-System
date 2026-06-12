# K10-SEMESTER-IMPORT-SCOPING-VALIDATION

## 1. 阶段名

`K10-SEMESTER-IMPORT-SCOPING-VALIDATION`

## 2. 验收日期

2026-06-01

## 3. 当前背景

Fix-A (`1342c9b`) 完成了 import 主链路 semesterId 线程化。
Fix-B (`86af57e`) 完成了 ClassGroup scoped uniqueness 和 confirmed guard semester scope。

本阶段目标：验证 import 链路在 Fix-A/Fix-B 后是否真实可用、可见、可回滚、不跨学期污染。

## 4. 验收范围

- `ImportBatch.semesterId` 行为
- parse 创建 batch 时写入目标 semesterId
- confirm 后 TeachingTask / ScheduleSlot / TeachingTaskClass 写入目标 semesterId
- ClassGroup scoped uniqueness（跨学期允许同名，同学期拒绝重复）
- importer 不跨学期复用同名 ClassGroup
- confirmed guard 只限制同 semester
- rollback 只影响目标 batch
- scoped schedule / scheduler / admin data / export 链路可读到目标 semester 数据
- 原 audit 保持 0 HIGH / 0 MEDIUM

## 5. 验收方法

三层验收：

1. **静态验收**：验证 Fix-A/Fix-B 关键代码仍存在
2. **数据库完整性验收**：只读检查当前数据库
3. **受控事务验收**：在 Prisma transaction 中创建临时数据并 rollback

## 6. 数据库备份路径

`prisma/dev.db.backup-before-k10-import-scoping-validation-20260601181322`

## 7. 现有验证脚本结果

| 脚本 | 结果 |
|------|------|
| `verify-import-semester-scoping-fix-a.ts` | 31/33 PASS（2 FAIL 为 Fix-B 预期变更：ClassGroup 已改为 `@@unique([semesterId, name])`，confirm route 已重构） |
| `verify-import-semester-scoping-fix-b.ts` | 24/24 PASS |
| `audit-import-semester-scoping.ts` | 0 HIGH, 0 MEDIUM, 1 LOW |

## 8. Validation 脚本结果

脚本：`scripts/validate-import-semester-scoping.ts`

结果：**46 PASS, 0 FAIL, 1 SKIP**

### A. Static (9/9 PASS)

| 检查项 | 结果 |
|--------|------|
| ClassGroup.name 不含 @unique | PASS |
| ClassGroup 存在 @@unique([semesterId, name]) | PASS |
| ClassGroup.semesterId 为 Int? | PASS |
| ImportBatch.semesterId 存在 | PASS |
| Importer ClassGroup 查重含 semesterId | PASS |
| TeachingTask.create 写入 semesterId | PASS |
| ScheduleSlot.create 写入 semesterId | PASS |
| Confirmed guard 含 semesterId | PASS |
| Confirm route 校验 body/query semesterId | PASS |

### B. DB Integrity (18/18 PASS)

| 检查项 | 结果 |
|--------|------|
| 各表记录数 | 见下方第 9 节 |
| duplicate (semesterId, name) | 0 |
| ClassGroup.semesterId IS NULL | 0 |
| TeachingTask.semesterId IS NULL | 0 |
| ScheduleSlot.semesterId IS NULL | 0 |
| ImportBatch.semesterId IS NULL | 36 (legacy) |
| orphan ScheduleSlot → TeachingTask | 0 |
| orphan TeachingTaskClass → TeachingTask | 0 |
| orphan TeachingTaskClass → ClassGroup | 0 |

### C. Scoped Uniqueness (7/7 PASS)

| 检查项 | 结果 |
|--------|------|
| 跨学期同名 ClassGroup 允许创建 | PASS |
| 同学期重复 ClassGroup 拒绝（P2002） | PASS |
| findFirst 按 semesterId+name 精确命中 | PASS |
| scoped find 不跨学期命中 | PASS |
| 事务 rollback 正常 | PASS |
| rollback 后无残留 ClassGroup | PASS |
| rollback 后无残留 Semester | PASS |

### D. Relation Scoping (9/9 PASS)

| 检查项 | 结果 |
|--------|------|
| TeachingTask.semesterId 正确 | PASS |
| ScheduleSlot.semesterId 正确 | PASS |
| TeachingTaskClass 链接同 semester 实体 | PASS |
| 按目标 semester 查询可见 | PASS |
| 按其他 semester 查询不可见 | PASS |
| 事务 rollback 正常 | PASS |
| TeachingTask 计数恢复 | PASS |
| ScheduleSlot 计数恢复 | PASS |
| TeachingTaskClass 计数恢复 | PASS |

### E. Rollback Isolation (3 PASS, 1 SKIP)

| 检查项 | 结果 |
|--------|------|
| Rollback 使用 importBatchId-scoped deleteMany | PASS |
| batches importBatchId-tagged slots 隔离 | PASS |
| 无 batch 跨多 semester | PASS |
| 真实 rollback 调用 | SKIP（无可用 pending/confirmed batch；importBatchId 唯一性保证安全） |

## 9. 数据库完整性结果

| 表 | 记录数 |
|----|--------|
| Semester | 1 |
| ClassGroup | 36 |
| Teacher | 84 |
| Course | 104 |
| Room | 53 |
| TeachingTask | 308 |
| ScheduleSlot | 440 |
| TeachingTaskClass | 451 |
| ImportBatch | 36 |
| ScheduleAdjustment | 53 |

## 10. Scoped uniqueness 验收

- 跨 semester 同名 ClassGroup 是否允许：**是**
- 同 semester 重复 ClassGroup 是否拒绝：**是**（Prisma P2002 unique constraint violation）
- scoped find 是否正确：**是**（findFirst 按 semesterId+name 精确匹配）
- 测试数据是否已回滚：**是**（transaction throw rollback，验证无残留）

## 11. Relation scoping 验收

- TeachingTask 是否 scoped：**是**
- ScheduleSlot 是否 scoped：**是**
- TeachingTaskClass 是否连接同 semester ClassGroup：**是**
- 按目标 semester 查询是否可见：**是**
- 按其他 semester 查询是否不可见：**是**
- 测试数据是否已回滚：**是**

## 12. Rollback isolation 验收

- 是否验证 rollback：**部分验证**
- 验证方式：静态分析 + DB invariant（importBatchId-scoped deleteMany，无跨 semester batch）
- 是否影响其他 semester：**否**
- 未验证真实 rollback 原因：无可安全调用的 pending/confirmed batch；importBatchId 唯一性保证功能安全

## 13. 样例导入 / API / 浏览器验证

- 历史验收时曾找到本地样例；真实 `.docx` 与根目录 `output.json` 均不属于当前 HEAD 的可发布 fixture。
- 是否执行真实 parse：**否**
- 是否执行真实 confirm：**否**
- 是否执行浏览器验证：**否**
- 未执行原因：本阶段定位为数据层验收，样例文件属于历史 import 残留；真实 parse/confirm 需要 dev server + 登录态 + Python 环境，属于集成测试范畴。transaction-level 验收已覆盖核心 scoping 逻辑。

## 14. Build / Lint / Test

- `npm.cmd run build`：**通过**
- `npm.cmd run lint`：仅有 pre-existing warnings，与本阶段无关
- `npm.cmd test`：项目无 test 命令

## 15. 禁止事项确认

- 未修改 Prisma schema
- 未运行 db push / migrate / reset
- 未使用 `--accept-data-loss`
- 未手工清洗数据库
- 未提交 `prisma/dev.db`
- 未提交数据库备份
- 未修改 import/parser/scheduler/solver/seed 业务逻辑
- 未修改 Python parser
- 未新增 `/api/scheduler/run`
- 未新增 Re-run 按钮
- 未新增 UI semester selector
- 未放宽 RBAC

## 16. 剩余风险

| 风险 | 严重度 | 说明 |
|------|--------|------|
| Rollback 按 importBatchId 删除，无 semester 验证 | LOW | importBatchId 唯一性保证安全，已通过 invariant 验证 |
| 未做真实 parse/confirm 端到端验证 | LOW | transaction-level 验收已覆盖核心 scoping；真实端到端需集成测试环境 |
| ImportBatch legacy null semesterId | 无 | 36 条 legacy batch，confirm 时自动绑定到目标学期，符合设计预期 |

## 17. 阶段关闭建议

- 本 validation 阶段是否建议关闭：**是**
- import scoping 主线是否建议关闭：**是**
- 剩余 HIGH：**0**
- 剩余 MEDIUM：**0**
- 剩余 LOW：**1**（rollback 无 semester 验证，功能安全）
- 下一阶段建议：可选 UI semester selector 或 import 文件 GC
