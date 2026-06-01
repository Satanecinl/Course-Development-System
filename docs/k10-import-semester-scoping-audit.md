# K10-SEMESTER-IMPORT-SCOPING-AUDIT

## 阶段名

`K10-SEMESTER-IMPORT-SCOPING-AUDIT`

## 审计日期

2026-06-01

## 审计范围

导入链路（import pipeline）的 semester 边界审计，覆盖：

- Python parser 输出结构
- Import API routes（parse / confirm / rollback / batches / abandon）
- Import 核心逻辑（importer.ts / rollback.ts / client.ts）
- Import 类型定义（types/import.ts）
- ImportBatch Prisma schema
- 与已 scoped 链路的交叉影响

## 审计方法

1. 只读源码扫描，不连接数据库
2. 使用 `scripts/audit-import-semester-scoping.ts` 自动化扫描
3. 人工逐文件审查关键路径
4. 与已 scoped 链路（scheduler / conflict-check / data APIs）交叉对比

## 关键文件清单

### Import Pipeline 核心

| 文件 | 角色 |
|---|---|
| `src/lib/import/importer.ts` (880 行) | 核心导入逻辑：prepareRecords / executeImportInTransaction / confirmImportBatch |
| `src/lib/import/rollback.ts` (349 行) | 回滚逻辑：buildRollbackPlan / rollbackImportBatch |
| `src/lib/import/parse-utils.ts` (191 行) | 解析统计（纯内存操作，无 DB 交互） |
| `src/lib/import/quality-classifier.ts` (202 行) | 质量分类（纯内存操作，无 DB 交互） |
| `src/lib/import/client.ts` (65 行) | 前端 fetch 封装 |
| `src/types/import.ts` (240 行) | Import 相关 TypeScript 类型 |

### Import API Routes

| 文件 | 方法 | 权限 |
|---|---|---|
| `src/app/api/admin/import/parse/route.ts` | POST | import:manage |
| `src/app/api/admin/import/confirm/route.ts` | POST | import:manage |
| `src/app/api/admin/import/rollback/route.ts` | POST | import:manage |
| `src/app/api/admin/import/batches/route.ts` | GET | import:manage |
| `src/app/api/admin/import/batches/[id]/route.ts` | GET | import:manage |
| `src/app/api/admin/import/batches/[id]/abandon/route.ts` | POST | import:manage |

### Semester 基础设施

| 文件 | 角色 |
|---|---|
| `src/lib/semester.ts` | resolveSchedulerSemester() — 已有 helper，import 未使用 |
| `src/lib/scheduler/data-loader.ts` | 按 semesterId 过滤 TeachingTask/ScheduleSlot |
| `src/lib/conflict-check.ts` | 按 semesterId 范围做冲突检查 |
| `prisma/schema.prisma` | ImportBatch 无 semesterId；TeachingTask/ScheduleSlot 有 nullable semesterId |

### Python Parser

| 文件 | 角色 |
|---|---|
| `scripts/parse_schedule.py` | Word .docx 解析，输出 JSON（无 semester 概念） |
| `scripts/parse_cell.py` | 单元格内容解析引擎 |

## Import 数据流说明

```
Word .docx
    │
    ▼
parse_schedule.py (Python)
    │ 输出 JSON: ImportScheduleRecord[]
    │ 无 semester 信息
    ▼
POST /api/admin/import/parse
    │ 创建 ImportBatch (status=pending)
    │ 无 semesterId
    ▼
POST /api/admin/import/confirm (dryRun=true)
    │ confirmImportBatchDryRun()
    │ 返回 ImportPlan
    ▼
POST /api/admin/import/confirm (confirmText="CONFIRM_IMPORT")
    │ confirmImportBatch()
    │ → prepareRecords()
    │ → executeImportInTransaction()
    │   ├─ ClassGroup.findUnique({ where: { name } }) — 全局唯一
    │   ├─ Teacher.findUnique({ where: { name } }) — 全局唯一
    │   ├─ Course.findUnique({ where: { name } }) — 全局唯一
    │   ├─ Room.findUnique({ where: { name } }) — 全局唯一
    │   ├─ TeachingTask.findMany(无 semesterId) → 复用或 create(无 semesterId)
    │   ├─ TeachingTaskClass.create
    │   └─ ScheduleSlot.findFirst(无 semesterId) → 复用或 create(无 semesterId)
    ▼
ImportBatch status → confirmed
```

## Parser 输出分析

- **结论**：parser 输出不包含 semester 信息，也不应该包含
- **理由**：Python parser 是纯文本解析，不感知数据库模型。semester 是数据库层面的概念，应在 commit 阶段注入
- **建议**：semesterId 应在 confirm 阶段注入，通过 API 参数传入

## Preview / Confirm 分析

- **Preview（dryRun=true）**：不写库，只返回计划。当前无 semesterId 参数。
- **Confirm（dryRun=false）**：写库。当前无 semesterId 参数。
- **风险**：用户无法指定目标学期。所有导入数据默认 semesterId=null。
- **batch 数据**：ImportBatch 模型无 semesterId 字段，无法记录目标学期。

## ClassGroup Scoping 分析

| 检查项 | 结果 |
|---|---|
| 是否写入 semesterId | 否（ClassGroup 无 semesterId 字段在 create 时设置） |
| 查重方式 | `classGroup.findUnique({ where: { name } })` — 全局唯一 |
| 是否按 semester 隔离 | 否，依赖 name 全局唯一 |
| 是否存在未 scoped deleteMany | 否 |

- **风险等级**：MEDIUM
- **理由**：ClassGroup.name 有 `@unique` 约束，当前全局查重是安全的。但如果未来需要同名班级跨学期存在，需要改为 semester-scoped 查重。
- **当前行为**：import 会复用已有同名 ClassGroup（跨学期共享），这是设计意图还是缺陷取决于业务需求。

## TeachingTask Scoping 分析

| 检查项 | 结果 |
|---|---|
| 是否写入 semesterId | **否** — `teachingTask.create()` 未设置 semesterId |
| 关联 ClassGroup 是否同 semester | 不适用（semesterId 为 null） |
| 查重方式 | `teachingTask.findMany({ where: { courseId, teacherId, weekType, startWeek, endWeek, remark } })` — 无 semesterId |
| 是否存在未 scoped deleteMany | 否（rollback 使用 importBatchId） |

- **风险等级**：**HIGH**
- **证据**：
  - `importer.ts` line 560-569：`teachingTask.create()` 不含 semesterId
  - `importer.ts` line 541-544：`teachingTask.findMany()` 查重不含 semesterId
  - `data-loader.ts` line 30：`{ where: { semesterId } }` — semesterId=null 的 TeachingTask 不会被加载
- **影响**：
  1. 导入的 TeachingTask 对 scheduler 不可见
  2. 可能复用其他学期的 TeachingTask（跨学期污染）
  3. 冲突检查可能行为异常（null semesterId fallback）

## ScheduleSlot Scoping 分析

| 检查项 | 结果 |
|---|---|
| 是否写入 semesterId | **否** — `scheduleSlot.create()` 未设置 semesterId |
| 关联 TeachingTask | 通过 teachingTaskId（无 semester 验证） |
| 查重方式 | `scheduleSlot.findFirst({ where: { teachingTaskId, dayOfWeek, slotIndex, roomId } })` — 无 semesterId |
| 是否存在未 scoped deleteMany | 否（rollback 使用 importBatchId） |

- **风险等级**：**HIGH**
- **证据**：
  - `importer.ts` line 608-609：`scheduleSlot.create()` 不含 semesterId
  - `data-loader.ts` line 31：`{ where: { semesterId } }` — semesterId=null 的 ScheduleSlot 不会被加载
- **影响**：导入的 ScheduleSlot 对 scheduler 和已 scoped 的读取链路不可见

## 批量写操作风险分析

| 操作 | 文件 | 风险 |
|---|---|---|
| `teachingTask.create()` | importer.ts:560 | HIGH — 无 semesterId |
| `scheduleSlot.create()` | importer.ts:608 | HIGH — 无 semesterId |
| `classGroup.create()` | importer.ts:478 | LOW — name 全局唯一 |
| `teacher.create()` | importer.ts:491 | NONE — 全局实体 |
| `course.create()` | importer.ts:504 | NONE — 全局实体 |
| `room.create()` | importer.ts:517 | NONE — 全局实体 |
| `teachingTaskClass.create()` | importer.ts:576 | LOW — 依赖 teachingTaskId |

## deleteMany / updateMany / upsert 风险分析

| 操作 | 文件 | 范围 | 风险 |
|---|---|---|---|
| `scheduleSlot.deleteMany({ importBatchId })` | rollback.ts:293 | 按 batchId | LOW — importBatchId 唯一 |
| `teachingTaskClass.deleteMany({ teachingTask.importBatchId })` | rollback.ts:298 | 按 batchId | LOW |
| `teachingTask.deleteMany({ importBatchId })` | rollback.ts:303 | 按 batchId | LOW |
| `importBatch.updateMany({ status: 'pending' })` | importer.ts:830 | 按 batchId+status | NONE — 原子状态机 |

- **结论**：rollback 的 deleteMany 使用 importBatchId 范围，功能安全。但缺少 semester 上下文，无法验证操作是否在正确的学期范围内。

## RBAC 分析

| Route | 权限 | 结果 |
|---|---|---|
| POST /api/admin/import/parse | import:manage | PASS |
| POST /api/admin/import/confirm | import:manage | PASS |
| POST /api/admin/import/rollback | import:manage | PASS |
| GET /api/admin/import/batches | import:manage | PASS |
| GET /api/admin/import/batches/[id] | import:manage | PASS |
| POST /api/admin/import/batches/[id]/abandon | import:manage | PASS |

- **结论**：所有 import API 均有 `requirePermission('import:manage', request)` 保护。
- **未发现绕过路径**。
- **风险等级**：NONE

## 与已 Scoped 链路的交叉影响

| 已 Scoped 链路 | 过滤条件 | 受 import null semesterId 影响 |
|---|---|---|
| `loadSchedulingContext()` | `{ where: { semesterId } }` | **YES — 导入数据不可见** |
| `checkScheduleConflict()` | `input.semesterId ?? slot.semesterId` | **YES — null fallback 异常** |
| GET /api/data/teaching-tasks | `resolveSchedulerSemester()` | **YES — null semesterId 不匹配** |
| GET /api/data/schedule-slots | `resolveSchedulerSemester()` | **YES — null semesterId 不匹配** |
| GET /api/schedule | `resolveSchedulerSemester()` | **YES — null semesterId 不匹配** |
| GET /api/export/excel | `resolveSchedulerSemester()` | **YES — null semesterId 不匹配** |
| POST /api/admin/scheduler/preview | `resolveSchedulerSemester()` | **YES — null semesterId 不匹配** |

- **核心问题**：import 创建的数据（TeachingTask、ScheduleSlot）semesterId=null，但所有已 scoped 链路都使用 `resolveSchedulerSemester()` 获取有效 semesterId 并过滤。这导致导入数据在所有已 scoped 视图中完全不可见。

## 风险清单

| Risk ID | Severity | Area | Description | Evidence | Recommendation |
|---|---|---|---|---|---|
| K10-IMPORT-HIGH-1 | HIGH | Schema | ImportBatch 无 semesterId 字段 | schema.prisma ImportBatch model (L266-287) | 添加 semesterId Int? + @@index |
| K10-IMPORT-HIGH-2 | HIGH | Import | TeachingTask 创建无 semesterId | importer.ts L560-569 | executeImportInTransaction 接收并写入 semesterId |
| K10-IMPORT-HIGH-3 | HIGH | Import | ScheduleSlot 创建无 semesterId | importer.ts L608-609 | executeImportInTransaction 接收并写入 semesterId |
| K10-IMPORT-HIGH-4 | HIGH | Import | TeachingTask 查重无 semesterId 范围 | importer.ts L541-544 | findMany where 添加 semesterId |
| K10-IMPORT-HIGH-5 | HIGH | Scheduler | 导入数据对 scheduler 不可见 | data-loader.ts L30-31: { where: { semesterId } } | Import 必须写入正确 semesterId |
| K10-IMPORT-MEDIUM-1 | MEDIUM | Import | ClassGroup 查重依赖全局 name 唯一 | importer.ts L466 | 若需跨学期同名班级，需改为 semester-scoped |
| K10-IMPORT-MEDIUM-2 | MEDIUM | Import | ScheduleSlot 查重无 semesterId 范围 | importer.ts L601-603 | 修复 HIGH-4 后验证级联影响 |
| K10-IMPORT-MEDIUM-3 | MEDIUM | API | parse route 无 semesterId 参数 | parse/route.ts | 添加 semesterId 参数 |
| K10-IMPORT-MEDIUM-4 | MEDIUM | API | confirm route 无 semesterId 参数 | confirm/route.ts | 添加 semesterId 参数 |
| K10-IMPORT-MEDIUM-5 | MEDIUM | API | rollback route 无 semesterId 参数 | rollback/route.ts | 添加 semesterId 参数 |
| K10-IMPORT-MEDIUM-6 | MEDIUM | API | batches list 无 semesterId 参数 | batches/route.ts | 添加 semesterId 参数 |
| K10-IMPORT-MEDIUM-7 | MEDIUM | API | batch detail 无 semesterId 参数 | batches/[id]/route.ts | 添加 semesterId 参数 |
| K10-IMPORT-MEDIUM-8 | MEDIUM | API | abandon 无 semesterId 参数 | batches/[id]/abandon/route.ts | 添加 semesterId 参数 |
| K10-IMPORT-MEDIUM-9 | MEDIUM | Client | client.ts 不传 semesterId | client.ts | 添加 semesterId 参数 |
| K10-IMPORT-MEDIUM-10 | MEDIUM | Import | confirmed guard 全局而非按学期 | importer.ts L821-826 | 按 semesterId 范围检查 |
| K10-IMPORT-MEDIUM-11 | MEDIUM | Conflict | 冲突检查 null fallback 行为异常 | conflict-check.ts L61 | 确保导入数据有正确 semesterId |
| K10-IMPORT-MEDIUM-12 | MEDIUM | Import | import 链路未使用 resolveSchedulerSemester | semester.ts (helper 存在但未调用) | 在 import API 中调用 resolveSchedulerSemester |
| K10-IMPORT-LOW-1 | LOW | Rollback | rollback 按 importBatchId 删除无 semester 验证 | rollback.ts L293-305 | 当前安全；ImportBatch 获得 semesterId 后添加验证 |
| K10-IMPORT-LOW-2 | LOW | Types | import 类型定义无 semesterId 字段 | types/import.ts | 添加 semesterId 到相关类型 |

## 下一阶段建议

### 推荐阶段名

`K10-SEMESTER-IMPORT-SCOPING-FIX`

### 修复范围

1. **Schema**：ImportBatch 添加 `semesterId Int?` + `@@index([semesterId])` + `Semester` relation
2. **semester.ts**：无需修改，现有 `resolveSchedulerSemester()` 可直接复用
3. **importer.ts**：
   - `executeImportInTransaction()` 接收 `semesterId` 参数
   - TeachingTask.create 写入 semesterId
   - ScheduleSlot.create 写入 semesterId
   - TeachingTask.findMany 查重添加 semesterId
   - confirmed/confirming guard 按 semesterId 范围检查
4. **rollback.ts**：rollback 可选添加 semester 验证（非阻塞）
5. **API routes**：parse / confirm / rollback / batches 均添加 semesterId 参数，调用 resolveSchedulerSemester
6. **client.ts**：添加 semesterId 参数
7. **types/import.ts**：添加 semesterId 到相关类型
8. **UI**：import 页面添加 semester selector（可选，非阻塞）

### 优先级

- **阻塞级**（必须修复）：HIGH-1 ~ HIGH-5 — 不修复则导入数据对所有已 scoped 链路不可见
- **建议级**（推荐修复）：MEDIUM-3 ~ MEDIUM-12 — 完善 semester 线程化
- **可选级**：LOW-1 ~ LOW-2 — 锦上添花
