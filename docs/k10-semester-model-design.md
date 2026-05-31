# K10-SEMESTER-MODEL-DESIGN — Semester 模型设计方案

> **状态**: DRAFT — 设计阶段  
> **日期**: 2026-05-31  
> **审计脚本**: `scripts/audit-semester-model-design.ts`  
> **范围**: 只做设计审计和文档，不修改 schema 或业务逻辑

---

## 1. 当前现状

### 1.1 系统架构

当前系统是**单学期系统**。所有数据（TeachingTask、ScheduleSlot、ImportBatch、SchedulingRun）存储在同一数据库中，没有学期隔离。

```
Word .docx → Python 解析 → output.json → Import API → SQLite
                                                          │
                              Next.js App Router ─────────┘
                              /api/schedule — GET all items
                              /dashboard — 拖拽排课
                              /admin/scheduler — Preview/Apply/Rollback
```

### 1.2 数据规模（截至 2026-05-27）

| 实体 | 数量 |
|------|------|
| ClassGroup | 37 |
| Teacher | 84 |
| Course | 123 |
| Room | 53 |
| TeachingTask | 497 |
| TeachingTaskClass | 785 |
| ScheduleSlot | 630 |
| ImportBatch (confirmed) | 1 |

### 1.3 Scheduler 数据流

- `data-loader.ts` 全库加载（`findMany()` 无过滤），不按 semester 或 importBatch 过滤
- `preview.ts` / `apply.ts` / `rollback.ts` 无 `semesterId` 概念
- `SchedulingConfig` 已有一个 `semesterId: Int?` 字段，但从未被使用

---

## 2. 当前是否已有 Semester / Term / semesterId

### 2.1 审计结论：无

| 检查项 | 结果 |
|--------|------|
| `model Semester` 存在 | ❌ 否 |
| `model AcademicTerm` 存在 | ❌ 否 |
| `semesterId` 字段出现次数 | 1 次（仅 `SchedulingConfig.semesterId`） |
| `academicYear` 字段 | ❌ 无 |
| `schoolYear` 字段 | ❌ 无 |
| `term` 字段 | ❌ 无 |

### 2.2 SchedulingConfig.semesterId 分析

- **定义**: `semesterId Int?`（可选，无外键约束，无关联模型）
- **使用情况**: 代码中无任何地方读写此字段
- **语义含义**: 未定义。当前仅作为占位字段存在
- **结论**: 这是一个 dead field，可视为预留占位，但缺乏关联的 Semester 模型

### 2.3 代码中的 "semester" 引用

代码中 "semester" 出现仅在：
- `half_semester` — 导入质量分类标签（前八周/后八周），与学期模型无关
- `scripts/semester_2026.json` — 旧的种子数据文件名，不反映数据模型

---

## 3. 模型归属设计表

### 3.1 设计原则

- **全局共享模型**: 物理实体和字典表，跨学期共享，不应加 `semesterId`
- **按学期隔离模型**: 业务数据，每学期不同，应加 `semesterId`
- **关联传导规则**: 如果模型 A 通过外键关联到有 `semesterId` 的模型 B，则 A 需要 `semesterId` 或在查询时通过 B 间接过滤

### 3.2 归属表

| 模型 | 当前状态 | 归属建议 | 理由 | 备注 |
|------|---------|---------|------|------|
| **Room** | 全局 | **全局共享** | 教室是物理场所，跨学期不变 | `capacity` 继续作为全局固定运行参数，不随学期自动重算 |
| **Teacher** | 全局 | **全局共享** | 教师是人员字典，跨学期复用 | |
| **Course** | 全局 | **全局共享** | 课程名称是字典，跨学期复用（如"高等数学"每学期都开） | 如需区分"秋季高等数学"和"春季高等数学"，应在 TeachingTask 层区分，而非 Course 层 |
| **ClassGroup** | 全局 | **需判断** | 当前 37 个班级是长期行政班级 | 如果班级跨学期不变（同一批学生），则全局共享即可；如果每学期重新分班，则需要 `semesterId`。当前数据为行政班级（如"森林草原防火技术1班"），建议保持全局 |
| **TeachingTask** | 全局 | **按学期隔离** | 每个学期的教学任务不同 | 核心学期数据 |
| **TeachingTaskClass** | 全局 | **按学期隔离** | 随 TeachingTask 隔离 | 通过 TeachingTask → semester 间接关联 |
| **ScheduleSlot** | 全局 | **按学期隔离** | 每个学期的排课结果不同 | 核心学期数据 |
| **ScheduleAdjustment** | 全局 | **按学期隔离** | 调课记录依附于 ScheduleSlot | 通过 ScheduleSlot → TeachingTask → semester 间接关联 |
| **SchedulingRun** | 全局 | **按学期隔离** | 排课运行应归属特定学期 | 已有的 `configId` 可链到 `SchedulingConfig.semesterId` |
| **SchedulerRunChange** | 全局 | **按学期隔离** | 随 SchedulingRun 隔离 | |
| **SchedulingConfig** | 全局 | **按学期隔离** | 已有 `semesterId: Int?` | `lockedTaskIds` 不是 semester 设计的一部分，是调度器的锁定机制 |
| **ImportBatch** | 全局 | **按学期隔离** | 每个学期独立导入 | |
| **User / Role / Permission** | 全局 | **全局共享** | RBAC 模型，不随学期变化 | |
| **RoomAvailability** | 全局 | **全局共享** | 教室可用性，跨学期通用 | |
| **Session** | 全局 | **全局共享** | 会话管理 | |
| **ScheduleChangeLog** | 全局 | **全局共享** | 历史操作日志 | 或可考虑加 `semesterId` 以便追溯 |

### 3.3 关联传导分析

```
Semester
  ├── ImportBatch (直接关联)
  │     ├── TeachingTask (间接: 可通过 importBatch 定位学期，也建议直接关联)
  │     │     ├── TeachingTaskClass (间接)
  │     │     └── ScheduleSlot (间接)
  │     │           └── ScheduleAdjustment (间接)
  │     └── ScheduleSlot (直接: 通过 importBatch)
  ├── SchedulingConfig (直接关联: semesterId)
  │     └── SchedulingRun (间接: 通过 config)
  │           └── SchedulerRunChange (间接: 通过 run)
  └── (Room / Teacher / Course / ClassGroup / User 不关联)
```

**关键设计决策**: TeachingTask 和 ScheduleSlot 已有 `importBatchId`，而 ImportBatch 如果加了 `semesterId`，则可以通过 JOIN 间接确定学期归属。但为了查询性能，建议 TeachingTask 和 ScheduleSlot 也直接加 `semesterId`（少量冗余换查询简单性）。

---

## 4. 推荐 Semester Schema 方案

### 4.1 Semester 模型定义

```prisma
model Semester {
  id          Int      @id @default(autoincrement())
  name        String   @unique   // e.g. "2026年春季学期"
  academicYear String              // e.g. "2025-2026"
  term        String              // "SPRING" | "FALL"
  startDate   DateTime?           // 学期开始日期
  endDate     DateTime?           // 学期结束日期
  isActive    Boolean  @default(false)  // 当前活跃学期
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  importBatches     ImportBatch[]
  teachingTasks     TeachingTask[]
  scheduleSlots     ScheduleSlot[]
  schedulingConfigs SchedulingConfig[]
  schedulingRuns    SchedulingRun[]
}
```

### 4.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `String @unique` | 人类可读的学期名称，唯一 |
| `academicYear` | `String` | 学年标识，如 "2025-2026" |
| `term` | `String` | "SPRING"（春季） / "FALL"（秋季） |
| `startDate` | `DateTime?` | 学期开始日期，可选 |
| `endDate` | `DateTime?` | 学期结束日期，可选 |
| `isActive` | `Boolean @default(false)` | 标记当前活跃学期，便于 UI 默认选中 |

### 4.3 需要添加 semesterId 的模型

| 模型 | 新增字段 | 类型 | 外键 |
|------|---------|------|------|
| ImportBatch | `semesterId` | `Int` | → `Semester.id` |
| TeachingTask | `semesterId` | `Int` | → `Semester.id` |
| ScheduleSlot | `semesterId` | `Int` | → `Semester.id` |
| SchedulingConfig | `semesterId` | `Int`（改为必填） | → `Semester.id` |
| SchedulingRun | `semesterId` | `Int` | → `Semester.id` |

### 4.4 不需要添加 semesterId 的模型

- Room, Teacher, Course — 全局字典
- ClassGroup — 当前为行政班级，建议保持全局（如需学期班级，后续可用 TeachingTaskClass 关联区分）
- TeachingTaskClass — 通过 TeachingTask 间接关联
- ScheduleAdjustment — 通过 ScheduleSlot 间接关联
- SchedulerRunChange — 通过 SchedulingRun 间接关联
- RoomAvailability — 全局可用性
- User / Role / Permission / Session — RBAC
- ScheduleChangeLog — 保留为全局操作日志（`taskId` 可追溯到具体学期）

### 4.5 SchedulingConfig.lockedTaskIds 说明

`lockedTaskIds` 是调度器的**任务锁定机制**，存储为 JSON 字符串（如 `"[1,2,3]"`）。它锁定的是具体 TeachingTask ID，不是 semester 级别概念。在 semester 模型中，lockedTaskIds 仍然指代具体的 TeachingTask ID，不因学期变化而改变语义。**此字段不属于 semester 设计的一部分。**

---

## 5. 导入流程影响

### 5.1 当前导入流程

```
Word .docx → Python 解析 → output.json → Import API → ImportBatch + TeachingTask + ScheduleSlot
```

- 导入时创建 `ImportBatch`（status: pending → confirming → confirmed）
- `TeachingTask.importBatchId` 和 `ScheduleSlot.importBatchId` 指向导入批次
- 没有学期选择步骤

### 5.2 需要变更的点

| 阶段 | 变更 | 影响程度 |
|------|------|---------|
| **Import API** | 上传/解析时需要指定 `semesterId` | 中等 |
| **ImportBatch** | 新增 `semesterId` 字段 | 低 |
| **confirm 逻辑** | 创建 TeachingTask/ScheduleSlot 时写入 `semesterId` | 低 |
| **UI** | 导入对话框增加学期选择器 | 中等 |
| **质量检查** | 质量分类和检查可能需要按学期范围 | 低 |

### 5.3 向后兼容

- 实施 `semesterId` 后，现有数据（无 `semesterId`）需要 backfill
- 建议先创建默认学期（如 "2026年春季学期"），将所有现有数据关联到此学期
- 新的导入必须先选择学期才能执行

---

## 6. 自动排课影响

### 6.1 当前调度器数据流

```
data-loader.ts → 全库 findMany()
  → score.ts → 计算硬约束 HC1-HC5 + 软约束 SC1-SC4
  → solver.ts → LAHC 算法求解
  → preview.ts / apply.ts / rollback.ts → 创建 SchedulingRun + SchedulerRunChange
```

### 6.2 需要变更的点

| 组件 | 变更 | 影响程度 |
|------|------|---------|
| **data-loader.ts** | 增加 `semesterId` 过滤参数 | 低 |
| **score.ts** | 无需变更（评分逻辑不涉及学期） | 无 |
| **capacity.ts** | 无需变更（容量计算不涉及学期） | 无 |
| **solver.ts** | 无需变更（求解器无感知） | 无 |
| **preview.ts** | SchedulingRun 写入 `semesterId` | 低 |
| **apply.ts** | SchedulingRun 写入 `semesterId` | 低 |
| **rollback.ts** | 无需变更（通过 run 间接定位） | 无 |
| **diagnostics.ts** | 无需变更（诊断与学期无关） | 无 |
| **API 路由** | `/api/scheduler/preview` 等接收 `semesterId` 参数 | 中等 |

### 6.3 Semester 边界内冲突检测

- 冲突检测（room/teacher/class/capacity）只在**同一学期内**进行
- 不同学期的 ScheduleSlot 互不冲突
- 这是语义正确的行为：教室、教师、班级在不同学期的使用不冲突

### 6.4 SchedulingConfig 的作用

- `SchedulingConfig` 已有的 `semesterId` 使得不同学期可以有独立的排课配置
- `lockedTaskIds` 在配置中存储的是具体 TeachingTask ID，每个学期的 locking 独立
- `maxIterations`、`lahcWindowSize` 等全局参数可按学期调整

---

## 7. UI / API 影响

### 7.1 API 层

| API 路由 | 当前行为 | 所需变更 |
|----------|---------|---------|
| `GET /api/schedule` | 返回所有 ScheduleSlot | 增加可选 `?semesterId=` 查询参数 |
| `POST /api/conflict-check` | 按全库检查冲突 | 增加 `semesterId` 参数，限定检查范围 |
| `POST /api/admin/import/parse` | 上传并解析 | 增加 `semesterId` 参数 |
| `POST /api/admin/import/confirm` | 确认导入 | 增加 `semesterId` 参数 |
| `POST /api/scheduler/preview` | 排课预览 | 增加 `semesterId` 参数 |
| `POST /api/scheduler/apply` | 应用排课 | 增加 `semesterId` 参数 |
| `POST /api/scheduler/rollback` | 回滚排课 | 通过 `runId` 间接关联 |
| `GET /api/admin/semester` | 不存在 | **新增** CRUD API |

### 7.2 UI 层

| 页面/组件 | 所需变更 |
|-----------|---------|
| `/dashboard` | 顶部增加学期选择器，默认显示活跃学期 |
| `schedule-grid.tsx` | 按学期过滤显示 |
| `schedule-sidebar.tsx` | 按学期过滤筛选选项 |
| `schedule-import-dialog.tsx` | 导入前增加学期选择步骤 |
| `/admin/scheduler` | 增加学期选择器，Preview/Apply 传 `semesterId` |
| `/admin/db` | 各表增加学期过滤（可选） |

### 7.3 前端 store

- `scheduleStore.ts`: `fetchSchedule()` 增加 `semesterId` 参数
- 学期切换时重新 fetch 数据

---

## 8. 分阶段实施方案

### 阶段 A: Schema 设计与审计（当前阶段） ✅ K10-SEMESTER-MODEL-DESIGN

- ✅ 审计当前 schema 和代码
- ✅ 编写设计文档
- ✅ 运行审计脚本

### 阶段 B: Schema 实施 + Nullable 准备（下一阶段） → K10-SEMESTER-SCHEMA-NULLABLE-PREP

- 在 schema 中添加 `Semester` 模型
- 为 `ImportBatch`、`TeachingTask`、`ScheduleSlot`、`SchedulingConfig`、`SchedulingRun` 添加 `semesterId Int?`
- 运行 `prisma db push`（不重置数据）
- 所有新字段设置为 optional（`Int?`），现有数据不受影响

### 阶段 C: Backfill 现有数据 → K10-SEMESTER-DATA-BACKFILL

- 创建默认学期 "2026年春季学期"（`isActive: true`）
- 编写 backfill 脚本，将所有现有 TeachingTask/ScheduleSlot/ImportBatch 的 `semesterId` 指向默认学期
- 验证 backfill 结果

### 阶段 D: Semester 必填化 → K10-SEMESTER-REQUIRED

- 将 `semesterId` 从 `Int?` 改为 `Int`（必填）
- 更新所有创建逻辑（Import、Scheduler）确保写入 `semesterId`

### 阶段 E: UI 集成 → K10-SEMESTER-UI

- 添加学期 CRUD API 和 UI
- 添加学期选择器
- 导入流程集成学期选择

### 阶段 F: 多学期验证 → K10-SEMESTER-VALIDATION

- 端到端测试：导入两个学期数据
- 验证学期隔离：切换学期时数据正确
- 验证冲突检测在同一学期内正确工作

---

## 9. 风险清单与缓解措施

| 风险 | 严重程度 | 缓解措施 |
|------|---------|---------|
| **现有数据无 semesterId** | 高 | 分阶段实施：先 nullable → backfill → required。现有数据先保持 NULL，backfill 后再约束 |
| **Room.capacity 被误改为学期相关** | 中 | 明确 `capacity` 是全局固定参数，不随 semester 变化。在代码 review 中检查 |
| **lockedTaskIds 跨学期混淆** | 中 | lockedTaskIds 存储的是具体的 TeachingTask ID，不同学期的 task 不会重复 ID，语义已天然隔离。文档明确标注 |
| **Prisma migration 失败** | 中 | 使用 `db push`（非 migrate）添加字段，避免 migration 冲突 |
| **冲突检测跨学期误报** | 中 | 确保 data-loader 按 `semesterId` 过滤后，冲突检测自动限定在单学期内 |
| **调度器性能下降** | 低 | 添加 `semesterId` 后数据量更大（多学期累加），但查询加了 `WHERE semesterId = ?` 索引后单学期查询量不变 |
| **ClassGroup 学期归属不明确** | 低 | 当前行政班级为全局字典，不随学期变化。如未来需要学期班级，可新增 `SemesterClassGroup` 关联表 |

---

## 10. 推荐下一阶段

### 10.1 推荐: K10-SEMESTER-SCHEMA-NULLABLE-PREP

**目标**: 在 Prisma schema 中添加 `Semester` 模型和相关 `semesterId` 字段（全部 nullable），不破坏现有数据和功能。

**交付物**:
1. 更新 `prisma/schema.prisma`，添加 `model Semester`
2. 为 `ImportBatch`、`TeachingTask`、`ScheduleSlot`、`SchedulingRun` 添加 `semesterId Int?`
3. `SchedulingConfig.semesterId` 保持不变
4. 运行 `npx prisma db push`，验证 schema 同步成功
5. 运行 `npm run build`，验证编译通过
6. 运行现有测试套件，验证功能不受影响

### 10.2 前提条件

- ✅ K10-SEMESTER-MODEL-DESIGN 设计完成并审核通过（当前阶段）

---

## A. 附录：审计脚本输出摘要

```
═══ K10-SEMESTER-MODEL-DESIGN 审计 ═══

1. Schema 存在性检查:
   - model Semester: 否
   - model AcademicTerm: 否
   - semesterId 出现次数: 1 (仅 SchedulingConfig)
   - academicYear/schoolYear/year/term: 均无

2. 核心模型清单:
   - 有 semesterId 的模型: SchedulingConfig (仅此一个)
   - 有 importBatchId 的模型: TeachingTask, ScheduleSlot

3. 导入流程:
   - 5 个导入相关文件全部存在
   - ImportBatch 无 semesterId

4. Scheduler 流程:
   - data-loader 全库加载，无 semester 过滤
   - Preview/Apply/Rollback 均无 semesterId

5. 设计建议:
   - Room/Teacher/Course/RBAC → 全局共享
   - TeachingTask/ScheduleSlot/ImportBatch → 按学期隔离
   - ClassGroup: 需要判断（当前为行政班级）
```

---

> **设计阶段结论**: 当前系统是单学期系统。需要引入 `Semester` 模型，为 5 个核心业务模型添加 `semesterId`，并分 6 个阶段实施。推荐下一阶段为 K10-SEMESTER-SCHEMA-NULLABLE-PREP。
