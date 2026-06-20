# L6-A-XLSX-COURSE-SETTING-TARGET-SEMESTER-SELECTION-AND-CREATION-DESIGN

## 1. 阶段名称

**L6-A-XLSX-COURSE-SETTING-TARGET-SEMESTER-SELECTION-AND-CREATION-DESIGN**

目标学期选择/新建方案设计阶段。本阶段仅做审查和设计，不写 DB，不创建 Semester，不导入业务数据。

## 2. 用户需求

> Excel 课程设置导入时，希望可以自己选择导入至指定学期，或者新建学期。

核心要求：
- 用户在 Excel 导入流程中可以**选择已有学期**作为导入目标；
- 用户在 Excel 导入流程中可以**新建学期**作为导入目标；
- 导入目标学期的选择**只影响本次导入**，不自动切换系统全局 active semester。

## 3. 为什么不应自动切换 active semester

### 3.1 active semester 的语义

`Semester.isActive` 标记系统当前使用的学期。前端通过 `semesterStore` 管理：
- `currentSemesterId`：用户当前查看/操作的学期（持久化到 localStorage）
- `isActiveSemester`：`currentSemesterId === activeSemesterId` 的派生布尔值

### 3.2 import target 与 active semester 解耦的必要性

| 场景 | active semester | import target | 是否应切换 |
|---|---|---|---|
| 导入当前学期课程 | 2025春 | 2025春 | 否（相同） |
| 导入历史学期补录 | 2025春 | 2024秋 | 否 |
| 导入下一学期预排 | 2025春 | 2025秋 | 否 |
| 新建学期后导入 | 2025春 | 2025秋（新建） | 否 |

**结论**：import target 是一次性的数据归属选择，active semester 是系统全局状态。两者解耦是正确设计。

### 3.3 风险

- 如果导入自动切换 active semester，用户正在查看的学期会突然变化，导致困惑；
- 如果导入后未切回，其他用户操作会受影响；
- 多用户并发导入时，active semester 会被频繁切换，产生竞态。

## 4. 现有 Semester Schema 审查

### 4.1 Semester 模型字段

| 字段 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | Int | 否 | autoincrement | 主键 |
| `name` | String | 否 | — | 学期名称（**非唯一**） |
| `code` | String | 否 | — | 学期代码（**@unique**） |
| `academicYear` | String? | 是 | — | 学年，如 "2025" |
| `term` | String? | 是 | — | 学期，如 "秋" |
| `startsAt` | DateTime? | 是 | — | 开始日期 |
| `endsAt` | DateTime? | 是 | — | 结束日期 |
| `isActive` | Boolean | 否 | false | 是否为当前学期 |
| `createdAt` | DateTime | 否 | now() | 创建时间 |
| `updatedAt` | DateTime | 否 | @updatedAt | 更新时间 |

### 4.2 Unique Constraints

- `code` 唯一约束：防止重复学期代码
- 无组合唯一约束
- `name` 不唯一：两个学期可以同名

### 4.3 Active 语义

- 应用层约束：同一时间只有一个 active semester
- **无 DB 层约束**：理论上可以有多个 `isActive=true` 的记录
- 前端通过 `resolveSchedulerSemester()` 解析 active semester

### 4.4 Date Fields

- `startsAt` 和 `endsAt` 均可空
- 学期可以没有日期边界

### 4.5 是否需要 Schema Change

**不需要**。现有字段已足够支持 target semester selection：
- `id` 作为 targetSemesterId
- `name` / `code` / `academicYear` / `term` 用于 UI 展示和匹配
- `isActive` 标记当前学期（import 不应修改）
- `startsAt` / `endsAt` 可选用于日期验证

## 5. 现有 Semester API/UI 审查

### 5.1 List API

**GET /api/semesters**
- 权限：无（基础列表）/ `settings:manage`（含 counts）
- 返回：`{ semesters[], activeSemesterId }`
- 含 counts 时返回每个学期的 teachingTasks、classGroups、scheduleSlots 等统计
- **可直接复用**：导入 UI 的 semester selector 可调用此 API

### 5.2 Create API

**POST /api/semesters**
- 权限：`settings:manage`
- Body：`{ name, code, academicYear?, term?, startsAt?, endsAt?, isActive? }`
- 行为：验证 → 检查 code 唯一 → 创建
- 如果 `isActive=true`：事务性先 deactivate 所有其他学期
- **可复用**：创建新学期时调用；默认 `isActive=false`

### 5.3 Update API

**PUT /api/semesters/[id]**
- 权限：`settings:manage`
- 支持部分更新
- 不能直接 deactivate 当前学期（返回 400）

### 5.4 Delete API

**DELETE /api/semesters/[id]**
- 权限：`settings:manage`
- 保护：不能删除 active semester、最后一个 semester、有依赖的 semester

### 5.5 Set Active API

**POST /api/semesters/[id]/activate**
- 权限：`settings:manage`
- 事务性 deactivate all → activate target
- **导入流程不应调用此 API**

### 5.6 Settings UI

**SemesterSettingsPanel** (`src/components/settings/semester-settings-panel.tsx`)
- 完整 CRUD：创建、编辑、激活、删除
- 显示每个学期的依赖统计
- 对话框：SemesterFormDialog、SemesterActivateDialog、SemesterDeleteDialog

### 5.7 Semester Resolver

**resolveSchedulerSemester({ semesterId? })** (`src/lib/semester.ts`)
- 如果提供 explicit semesterId → 使用
- 否则回退到 active semester
- 已支持显式 semesterId 参数 → 导入流程可直接使用

### 5.8 可复用性总结

| API/组件 | 可否复用 | 备注 |
|---|---|---|
| GET /api/semesters | ✅ | 导入 UI 的 semester list |
| POST /api/semesters | ✅ | 创建新学期 |
| resolveSchedulerSemester | ✅ | 已支持 explicit semesterId |
| SemesterSettingsPanel | ⚠️ | 可参考但不应直接嵌入导入流程 |
| activate API | ❌ | 导入流程不应调用 |

## 6. Import Settings / Import Rules 审查

### 6.1 ImportRuleConfig

- 字段：`requireExplicitSemesterForImport`（默认 false）
- 有 Settings UI 开关："上传前必须确认目标学期"
- **缺口**：配置开关存在但**未接入任何导入流程代码**
- L3 preview route 不读取此配置
- L4 mapper 不读取此配置
- ScheduleImportDialog 不读取此配置

### 6.2 旧 Word Import 学期选择

- 旧 Word import（`/api/admin/import/parse`）调用 `resolveSchedulerSemester()` 获取 semesterId
- 默认使用 active semester
- 不提供 UI 让用户选择目标学期
- ImportBatch 创建时绑定 semesterId

### 6.3 L3 Preview Route

- **当前**：纯结构化解析，不接受 semesterId，不与 DB 交互
- **缺口**：无法提供"目标学期内已有多少匹配"的统计
- **需要改动**：接受 targetSemesterId，可选加载 semester-scoped existing data

### 6.4 L4 Mapper

- **当前**：纯函数，接收 `existingData`（hash-only refs），不感知 semester
- **设计合理**：by design，semester scoping 由 caller 负责
- **需要改动**：无需改 mapper；caller 需按 semesterId 加载 existingData

### 6.5 L5/L6-0 Review Package

- **当前**：`targetSemesterConfirmed` 布尔值控制 gate，但 output 不记录 semesterId
- **缺口**：review package 不知道目标学期是哪个
- **需要改动**：output 增加 `targetSemesterId` 字段

### 6.6 ImportBatch

- **当前**：已要求 `semesterId Int NOT NULL`
- L6 apply 创建 ImportBatch 时必须提供 targetSemesterId
- 无需改 schema

## 7. 数据模型 Semester Scoping 审查

### 7.1 Global 模型（无 semesterId）

| 模型 | Unique Key | 导入行为 |
|---|---|---|
| **Course** | `name` | 跨学期共享；按 name upsert |
| **Teacher** | `name` | 跨学期共享；按 name upsert |
| **Room** | `name` | 跨学期共享（如导入涉及） |

### 7.2 Semester-scoped 模型（有 semesterId NOT NULL）

| 模型 | 组合唯一约束 | 导入行为 |
|---|---|---|
| **ClassGroup** | `[semesterId, name]` | 按目标学期创建；(semesterId, nameHash) 匹配 |
| **TeachingTask** | 无 | 按目标学期创建；关联 Course + Teacher |
| **TeachingTaskClass** | `[teachingTaskId, classGroupId]` | 间接 scoped（通过 TeachingTask + ClassGroup） |
| **ImportBatch** | 无 | 按目标学期创建一个 batch |
| **ScheduleSlot** | 无 | 课程设置导入不创建（xlsx 无课表） |

### 7.3 Target Semester 应写入的实体

导入到目标学期时，以下实体必须绑定 `targetSemesterId`：
- `ImportBatch.semesterId`
- `ClassGroup.semesterId`
- `TeachingTask.semesterId`
- `TeachingTaskClass`（通过 TeachingTask 间接绑定）

### 7.4 跨学期共享的实体

以下实体在导入时**不应按学期隔离**，应跨学期复用：
- `Course`（全局唯一 by name）
- `Teacher`（全局唯一 by name）
- `Room`（全局唯一 by name，如有导入）

## 8. Target Semester Selection Contract

### 8.1 Type Definition

```typescript
export type CourseSettingTargetSemesterSelection =
  | {
      mode: "existing";
      targetSemesterId: number;
      setAsActive?: false; // default false; never true in L6-B/L6-C
    }
  | {
      mode: "createNew";
      newSemester: {
        name: string;
        code: string;
        academicYear?: string;
        term?: string;
        startDate?: string; // ISO date string
        endDate?: string;   // ISO date string
      };
      setAsActive?: false; // default false; future checkbox, not L6-B
    };
```

### 8.2 Validation Result

```typescript
export type CourseSettingTargetSemesterValidationResult = {
  valid: boolean;
  mode: "existing" | "createNew";
  targetSemesterId?: number; // resolved after createNew
  newSemesterDraftHash?: string; // sha256 of createNew draft for audit trail
  warnings: string[];
  blockers: string[];
};
```

### 8.3 setAsActive 默认值

- **默认 false**：导入流程不切换 active semester
- L6-A 不实现 `setAsActive` 功能
- 未来如需支持，必须是独立 checkbox + 显式确认 + DB backup

### 8.4 Blockers

| Blocker | Mode | 说明 |
|---|---|---|
| semester code already exists | createNew | code 唯一约束冲突 |
| semester not found | existing | ID 不存在 |
| no semesters available | existing | DB 无学期记录 |

### 8.5 Warnings

| Warning | 说明 |
|---|---|
| target differs from active | 目标学期不是当前活跃学期（正常但需告知） |
| semester has existing tasks | 目标学期内已有 TeachingTask |
| semester is active | 选择了 active semester（可能误操作） |
| semester has no date range | startsAt/endsAt 为空 |

## 9. Create New Semester Contract

### 9.1 流程

```
1. 用户在导入 UI 选择 "新建学期" 模式
2. 填写 name / code / startDate / endDate
3. 前端调用 POST /api/semesters 创建（已有 API）
4. 新学期以 isActive=false 创建
5. 前端获得新学期 ID
6. 导入流程以新 ID 作为 targetSemesterId 继续
7. 不切换 active semester
```

### 9.2 与导入的分离

- Semester 创建发生在 import dry-run 之前
- 如果导入被放弃，用户可手动在 Settings 删除空学期
- **不在同一个 transaction 中既创建 Semester 又导入 TeachingTask**

### 9.3 不需要新 API

现有 `POST /api/semesters` 已满足需求：
- 接受 name, code, academicYear, term, startsAt, endsAt
- 默认 isActive=false
- 有 settings:manage 权限保护
- 有 code 唯一性验证

## 10. Preview API 扩展设计

### 10.1 Available Semesters

可复用 `GET /api/semesters`，无需新增 API。

响应格式（前端已支持）：
```json
{
  "success": true,
  "semesters": [
    { "id": 1, "name": "...", "code": "...", "isActive": true, ... },
    { "id": 3, "name": "...", "code": "...", "isActive": false, ... }
  ],
  "activeSemesterId": 1
}
```

### 10.2 Preview API 扩展

未来 L6-B 可扩展 `POST /api/admin/import/course-setting-xlsx/preview`：

请求额外字段：
```typescript
// FormData field
targetSemesterMode: "existing" | "createNew"
targetSemesterId?: string // for existing mode
newSemesterName?: string  // for createNew mode (or pre-created ID)
```

响应额外字段：
```typescript
{
  targetSemesterSelection: CourseSettingTargetSemesterSelection,
  targetSemesterValidation: CourseSettingTargetSemesterValidationResult,
  semesterScopedStats?: {
    existingCoursesInSemester: number,
    existingClassGroupsInSemester: number,
    existingTeachingTasksInSemester: number,
  }
}
```

### 10.3 New Semester Creation API

**不需要新增 API**。复用 `POST /api/semesters`。

如未来需要更严格的控制，可新增：
```
POST /api/admin/import/course-setting-xlsx/target-semester
```
但 L6-B 阶段不需要。

## 11. UI 设计

### 11.1 导入对话框 Semester 选择区

位置：Excel 导入对话框顶部，文件上传之前。

```
┌──────────────────────────────────────────────────┐
│ 导入目标学期                                       │
│                                                    │
│ ○ 选择已有学期    [ 2025-2026秋季学期 ▼ ]          │
│                                                    │
│ ○ 新建学期                                          │
│   学期名称: [________________________]              │
│   学期代码: [________________________]              │
│   开始日期: [____-__-__]  结束日期: [____-__-__]  │
│                                                    │
│ ☐ 新建后设为当前学期（默认不勾选；L6-B 不实现）     │
│                                                    │
│ ⓘ 该选择只决定本次 Excel 课程设置导入的目标学期，  │
│   不会自动切换系统当前学期。                        │
├──────────────────────────────────────────────────┤
│ [选择文件上传 .xlsx]                               │
│ ...                                                │
└──────────────────────────────────────────────────┘
```

### 11.2 Recommended Target

GET /api/semesters 返回所有学期。前端可基于以下规则推荐目标：
- 如果 xlsx 文件名包含 "2025秋" → 推荐 code 含 "2025" + term="秋" 的学期
- 如果只有 1 个非 active 学期 → 推荐该学期
- 如果无法判断 → 不推荐，让用户选择

### 11.3 No Apply Guard

- 选择目标学期后，不会触发任何 DB 写入
- 选择只影响 preview / dry-run / review 的上下文
- 真正的 apply 在 L6-F 阶段，且需要显式 approval gate

## 12. 后续阶段拆分

### L6-B: Target Semester Preview Integration

**目标**：将 targetSemesterId 接入 preview UI/API 和 dry-run mapping。

**范围**：
- `/admin/import` Excel preview UI 增加 semester selector
- preview API 接受 targetSemesterId
- caller 按 targetSemesterId 加载 existingData
- L4 dry-run 以 target semester context 重新匹配
- review package 记录 targetSemesterId

**禁止**：
- 不创建 Semester
- 不写 TeachingTask / ImportBatch
- 不切换 active semester

### L6-C: Create New Semester From Import Flow

**目标**：支持从导入流程创建新 Semester。

**范围**：
- Import UI 增加 "新建学期" 表单
- 调用现有 POST /api/semesters 创建
- 新学期默认 isActive=false
- 创建后自动选中为目标学期

**禁止**：
- 不导入 TeachingTask
- 不切换 active（setAsActive checkbox 不实现）
- 如果导入被放弃，用户手动清理空学期

### L6-D: Approval Package With Target Semester

**目标**：基于 targetSemesterId 重新生成 full review package。

**范围**：
- L5/L6 review package 输出包含 targetSemesterId
- re-run L4 mapper 以目标学期 context
- 所有 review decisions pending
- 不 apply

### L6-E: Controlled Apply Plan

**目标**：只做 apply plan，不执行。

**范围**：
- backup / rollback / transaction / approval gate 设计
- importBatchPlan 生成
- dry-run replay 设计
- source evidence plan

### L6-F: Controlled Apply Execution

**目标**：在用户明确批准后写 DB。

**范围**：
- DB backup
- atomic transaction: create ImportBatch + Course + Teacher + ClassGroup + TeachingTask + TeachingTaskClass
- post-apply audit
- rollback plan
- **仅在 approval gate 通过后执行**

## 13. No-Write Proof

本阶段严格只读：

- **Prisma read-only methods used**：`findMany`, `count`
- **Prisma write methods found**：NONE
- **Semester create/update/delete**：NONE
- **ImportBatch create**：NONE
- **TeachingTask/ClassGroup create**：NONE
- **Schema/migration changes**：NONE
- **API route changes**：NONE
- **UI component changes**：NONE

## 14. DB Counts Unchanged Proof

| 表 | Before | After | Unchanged |
|---|---|---|---|
| Semester | 3 | 3 | ✅ |
| Course | 104 | 104 | ✅ |
| Teacher | 84 | 84 | ✅ |
| ClassGroup | 36 | 36 | ✅ |
| TeachingTask | 308 | 308 | ✅ |
| TeachingTaskClass | 446 | 446 | ✅ |
| ImportBatch | 38 | 38 | ✅ |
| ScheduleSlot | 440 | 440 | ✅ |
| ScheduleAdjustment | 67 | 67 | ✅ |

## 15. Privacy Proof

- committed JSON 中无真实教师姓名（hash-only）
- committed JSON 中无真实班级名（hash-only）
- committed JSON 中无真实课程名（hash-only）
- committed JSON 中无原始备注
- committed JSON 中无手机号
- xlsx 样本未提交
- dev.db 未提交
- DB backup 未提交
- temp/uploads 未提交

## 16. 验证结果

- ✅ L6-A audit script: 50/50 PASS
- ✅ L6-0 verify: PASS (回归)
- ✅ L5 verify: PASS (回归)
- ✅ L4 verify: PASS (回归)
- ✅ L3 verify: PASS (回归)
- ✅ L2 parser verify: PASS (回归)
- ✅ L1 audit: PASS (回归)
- ✅ K39-B1: PASS
- ✅ K39-B1A: PASS
- ✅ K39-C2: PASS
- ✅ K39-C4: PASS
- ✅ K22-C: PASS
- ✅ scan:docs-pii: 0 blocking
- ✅ build: PASS
- ✅ tsc --noEmit: PASS
- ✅ targeted eslint: PASS
- ✅ git diff --check: clean
- ✅ forbidden files check: clean

## 17. 下一阶段建议

**推荐进入 L6-B**：`L6-B-XLSX-COURSE-SETTING-TARGET-SEMESTER-PREVIEW-INTEGRATION`

L6-B 将：
1. 在 Excel 导入 UI 增加 semester selector
2. preview API 接受 targetSemesterId
3. caller 按 target semester 加载 existingData
4. L4 dry-run 以目标学期 context 重新匹配
5. review package 记录 targetSemesterId

L6-B 仍然**禁止写 DB**、**禁止创建 TeachingTask / ImportBatch**、**禁止切换 active semester**。

---

*Stage: L6-A | Version: 1.0.0 | Generated: 2026-06-20*
