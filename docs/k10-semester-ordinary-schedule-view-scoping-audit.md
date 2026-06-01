# K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-AUDIT

**阶段**：只读审计
**目标**：识别普通课表查看页面与普通用户 API 的学期边界读取风险
**结果**：1 个 MEDIUM 风险、19 个 SCOPED、0 个 HIGH
**建议**：进入 `K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-FIX` 修复 `/api/class-groups` 的跨学期读取

---

## 1. 当前数据状态

| 项 | 值 |
|---|---|
| Semester count | 1 |
| active Semester count | 1 |
| LEGACY-DEFAULT 是否存在 | 是（id=1, isActive=true） |
| ClassGroup null semesterId | 0 |
| TeachingTask null semesterId | 0 |
| ScheduleSlot null semesterId | 0 |
| ScheduleAdjustment null semesterId | 0 |
| SchedulingRun null semesterId | 0 |

所有目标模型均已 backfill 至 LEGACY-DEFAULT。无 null semesterId 记录。

---

## 2. 普通课表页面清单

| 页面/组件 | 用户类型 | 调用 API | 是否涉及学期模型 | 是否 scoped | 风险等级 | 后续建议 |
|---|---|---|---|---|---|---|
| `src/app/dashboard/page.tsx` | 普通用户/管理员 | （通过 dashboard-content） | 是 | SCOPED | LOW | 已复用 `/api/schedule` |
| `src/app/dashboard/dashboard-content.tsx` | 普通用户/管理员 | `/api/schedule`、`/api/entity-list`、`/api/rooms` | 是 | SCOPED | LOW | 已 scoped |
| `src/app/data/page.tsx` | 普通用户 | （通过 data-content） | 是 | SCOPED | LOW | 已 scoped |
| `src/app/data/data-content.tsx` | 普通用户 | `/api/data/summary`、`/api/data/teaching-tasks`、`/api/data/schedule-slots`、`/api/export/excel` | 是 | SCOPED | LOW | 已 scoped |
| `src/app/admin/db/admin-db-content.tsx` | 管理员 | `/api/teaching-task`、`/api/schedule-slot`、`/api/courses`、`/api/teachers` | 是 | SCOPED | LOW | 已 scoped |
| `src/components/schedule-grid.tsx` | 普通用户/管理员 | `/api/conflict-check` | 是 | SCOPED | LOW | 已 scoped |
| `src/components/schedule-sidebar.tsx` | 普通用户/管理员 | `/api/schedule` + `/api/entity-list` | 是 | SCOPED | LOW | 已 scoped |
| `src/components/schedule-card.tsx` | 普通用户/管理员 | （无 API 调用，纯展示） | 否 | LOW | LOW | 无需 |
| `src/components/schedule-adjustment-dialog.tsx` | 管理员 | `/api/schedule-adjustments/dry-run`、`/api/schedule-adjustments` | 是 | SCOPED | LOW | 已 scoped |
| `src/components/edit-task-dialog.tsx` | 管理员 | `/api/teaching-task/[id]`、`/api/teachers`、`/api/rooms`、`/api/class-groups`、`/api/entity-list` | 是 | **MEDIUM** | MEDIUM | `/api/class-groups` 未 scoped，依赖其下阶段修复 |
| `src/store/scheduleStore.ts` | 普通用户/管理员 | `/api/schedule`、`/api/schedule-slot/[id]`、`/api/entity-list` | 是 | SCOPED | LOW | 已 scoped |
| `src/lib/schedule/adjustment-client.ts` | 管理员 | `/api/schedule-adjustments/*` | 是 | SCOPED | LOW | 已 scoped |

**说明**：dashboard 页面和 data 页面是普通用户访问的入口，dashboard 复用 `/api/schedule`（已 scoped），data 页面复用 `/api/data/*`（已 scoped）。两者均依赖后端 active Semester 解析。

---

## 3. 普通课表 API 清单

| API | 读取模型 | 是否 scoped | 是否复用 `/api/schedule` | 权限保护 | 风险等级 | 后续建议 |
|---|---|---|---|---|---|---|
| `GET /api/schedule` | `scheduleSlot`, `teachingTaskClass`, `room`, `teacher`, `course` | ✓ | N/A | `schedule:view` | SCOPED | 已 scoped，使用 `resolveSchedulerSemester` |
| `GET /api/schedule?week=&applyAdjustments=true` | `scheduleSlot` + `scheduleAdjustment` | ✓ | N/A | `schedule:view` | SCOPED | 已 scoped，调用 `getEffectiveScheduleForWeek(week, semesterId)` |
| `GET /api/data/summary` | `course`, `teacher`, `room`, `classGroup`, `teachingTask`, `scheduleSlot` | ✓ | 否 | `data:read` | SCOPED | 已 scoped |
| `GET /api/data/teaching-tasks` | `teachingTask`, `classGroup`, `teacher` | ✓ | 否 | `data:read` | SCOPED | 已 scoped |
| `GET /api/data/schedule-slots` | `scheduleSlot`, `room`, `teachingTask`, `course`, `teacher` | ✓ | 否 | `data:read` | SCOPED | 已 scoped |
| `GET /api/entity-list?type=classgroup` | `classGroup` | ✓ | 否 | `data:read` | SCOPED | 已 scoped |
| `GET /api/entity-list?type=teacher` | `teacher` | N/A（全局模型） | 否 | `data:read` | SCOPED | 全局模型，无需 scoped |
| `GET /api/entity-list?type=room` | `room` | N/A（全局模型） | 否 | `data:read` | SCOPED | 全局模型，无需 scoped |
| `GET /api/entity-list?type=course` | `course` | N/A（全局模型） | 否 | `data:read` | SCOPED | 全局模型，无需 scoped |
| `GET /api/schedule-adjustments` | `scheduleAdjustment` | ✓ | 否 | `schedule:view` | SCOPED | 已 scoped |
| `POST /api/schedule-adjustments/dry-run` | 通过 `dryRunScheduleAdjustment` | ✓ | 否 | `schedule:adjust` | SCOPED | 已 scoped |
| `PATCH /api/schedule-adjustments/[id]/void` | 通过 `voidScheduleAdjustment` | ✓ | 否 | `schedule:adjust` | SCOPED | 已 scoped |
| `POST /api/conflict-check` | `scheduleSlot`, `room`, `teachingTask`, `classGroup` | ✓ | 否 | `schedule:view` | SCOPED | 已 scoped |
| `GET /api/export/excel` | `classGroup`, `teacher`, `room`, `scheduleSlot`, `teachingTaskClass` | ✓ | 否 | `data:export` | SCOPED | 已 scoped（export 阶段已修复） |
| `GET /api/rooms` | `room` | N/A（全局模型） | 否 | `data:read` | SCOPED | 全局模型 |
| `GET /api/teachers` | `teacher` | N/A（全局模型） | 否 | `data:read` | SCOPED | 全局模型 |
| `POST /api/teaching-task` | （write endpoint） | N/A | 否 | `data:write` | SCOPED | write path，不在读审计范围 |
| `PUT /api/teaching-task/[id]` | （write endpoint） | N/A | 否 | `data:write` | SCOPED | write path |
| `POST /api/schedule-slot` | （write endpoint） | N/A | 否 | `data:write` | SCOPED | write path |
| `PUT /api/schedule-slot/[id]` | （write endpoint） | N/A | 否 | `data:write` | SCOPED | write path |
| **`GET /api/class-groups`** | **`classGroup`** | **✗** | **否** | **`data:read`** | **MEDIUM** | **需下阶段 fix** |

**关键发现**：所有普通课表查看 API 均已 scoped（直接或通过 active Semester helper）。**唯一未 scoped 的 API 是 `GET /api/class-groups`**，它读取 `classGroup` 但未添加 `semesterId` filter。

---

## 4. 学期模型全库读取风险清单

| 文件 | 查询对象 | 是否已有 semesterId | 风险 | 后续建议 |
|---|---|---|---|---|
| `src/app/api/class-groups/route.ts` | `classGroup.findMany` | ✗ | **MEDIUM** | 下一阶段 fix：调用 `resolveSchedulerSemester` 并添加 `where: { semesterId }` |
| `src/app/api/teaching-task/route.ts` | `teachingTask.create` | N/A（write） | LOW | write endpoint，无读取 |
| `src/app/api/teaching-task/[id]/route.ts` | `teachingTask.update` | N/A（write） | LOW | write endpoint |
| `src/app/api/schedule-slot/route.ts` | `scheduleSlot.create` | N/A（write） | LOW | write endpoint |
| `src/app/api/schedule-slot/[id]/route.ts` | `scheduleSlot.update` | N/A（write） | LOW | write endpoint |

其他所有读路径（`/api/schedule`、`/api/data/*`、`/api/entity-list`、`/api/schedule-adjustments` 等）均已通过 `resolveSchedulerSemester` 显式 scoped。

---

## 5. 已 scoped 复用路径

普通课表页面已完整复用以下已 scoped 端点：

| 入口 | 调用 | 复用目标 |
|---|---|---|
| `/dashboard` | `fetchSchedule()` | `/api/schedule?viewType=...&targetId=...`（scoped） |
| `/dashboard` | `fetchEffectiveSchedule(week)` | `/api/schedule?week=&applyAdjustments=true`（scoped，调用 `getEffectiveScheduleForWeek(week, semesterId)`） |
| `/dashboard` | `loadEntityOptions()` | `/api/entity-list?type=classgroup`（scoped） |
| `/dashboard` | drag-and-drop | `/api/conflict-check`（scoped） |
| `/data` | summary tab | `/api/data/summary`（scoped） |
| `/data` | teaching tasks tab | `/api/data/teaching-tasks`（scoped） |
| `/data` | schedule slots tab | `/api/data/schedule-slots`（scoped） |
| `/data` | export | `/api/export/excel`（scoped） |
| 调课 | dry-run | `/api/schedule-adjustments/dry-run`（scoped） |
| 调课 | confirm | `/api/schedule-adjustments`（scoped） |
| 撤销 | void | `/api/schedule-adjustments/[id]/void`（scoped） |

---

## 6. 绕过 `/api/schedule` 的路径

| 路径 | 绕过方式 | 风险 |
|---|---|---|
| `GET /api/class-groups` | 直接查询 `classGroup.findMany()`，未走 `/api/schedule` 路径 | **MEDIUM** |

**仅 1 条绕过路径**，且仅被 `edit-task-dialog.tsx` 在编辑课程时使用。普通课表查看（dashboard、data 页面）均不调用此端点。

---

## 7. Effective schedule / adjustment-aware 审计

| 项 | 状态 |
|---|---|
| 是否存在 effective schedule 路径 | 是：`/api/schedule?week=&applyAdjustments=true` |
| 是否调用 `getEffectiveScheduleForWeek` | 是（`src/app/api/schedule/route.ts` 第 27 行） |
| 是否传入 `semesterId` | 是（`getEffectiveScheduleForWeek(week, semester.id)`） |
| 是否查询 `ScheduleAdjustment` | 是（helper `getEffectiveScheduleForWeek` 内部第 119-121 行使用 `adjustmentWhere.semesterId = semesterId`） |
| 是否只应用同 semester 调课记录 | 是（`adjustmentWhere.semesterId = semesterId`） |
| `getEffectiveScheduleForWeek` 自身是否接受 semesterId | 是（`semesterId?: number` 参数，第 62、119 行使用） |
| 是否存在绕过路径 | 否（`dryRunScheduleAdjustment` 第 268 行也调用 `getEffectiveScheduleForWeek(targetWeek, semesterId)`） |
| `createScheduleAdjustment` 是否在同 semester 创建 | 是（`createScheduleAdjustment` 第 351-364 行显式写入 `semesterId`） |
| `voidScheduleAdjustment` 是否校验同 semester | 是（第 384-389 行 `if (adjustment.semesterId !== semester.id)` 拒绝跨学期撤销） |

**结论**：effective schedule 链路完全 semester-scoped，不存在跨学期调整风险。

---

## 8. 权限边界审计

| 项 | 状态 |
|---|---|
| 普通用户是否可访问全校全量课表 | 是，但 `data:read` 权限仅允许读取受 active Semester scoped 的数据 |
| 普通用户是否可跨学期访问 ClassGroup | **是**（通过 `GET /api/class-groups`，此 API 未 scoped） |
| 未登录用户是否可访问敏感课表接口 | 否（middleware + `requirePermission('schedule:view' \| 'data:read' \| 'data:write')` 全部检查） |
| 管理员课表查看是否有权限保护 | 是（`schedule:adjust` permission） |
| 是否发现 `/api/scheduler/run` | 否（仅存在 `/api/admin/scheduler/preview`、`/apply`、`/rollback`，已 K10 scheduler 阶段完成 RBAC） |
| 是否发现 Re-run 入口 | 否（admin scheduler UI 仅提供 Preview/Apply/Rollback，无 Re-run 按钮） |
| 是否存在 RBAC 绕过 | 否（所有 schedule API 均要求至少 `schedule:view` 权限） |
| middleware 路由规则 | `/dashboard → schedule:view`、`/data → data:read`、`/admin/scheduler → schedule:adjust`、`/admin/db → data:write` |
| 未匹配规则路径 | 默认允许（`hasRequiredRoutePermission` 中 `if (!required) return true`），但 API 层有 `requirePermission` 兜底 |

**关键风险**：`/api/class-groups` 是 `data:read` 权限可访问的接口，**普通用户可读取全库 ClassGroup（含未来其他学期）**。这是本阶段唯一需要修复的 MEDIUM 风险。

---

## 9. 是否需要 UI selector

**短期**：不需要。

- 当前所有 scoped 端点（`/api/schedule`、`/api/data/*`、`/api/schedule-adjustments` 等）已接受可选 `semesterId` 查询参数。
- 未传 `semesterId` 时，后端默认 `resolveSchedulerSemester` 返回 active Semester。
- LEGACY-DEFAULT（id=1）当前是唯一 Semester，不传 `semesterId` 即访问正确数据。

**后续**：待 K10-SEMESTER-UI-SELECTOR 阶段单独处理 UI 选择器。

---

## 10. 推荐 scoping 策略

### 10.1 下一阶段必须修复（K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-FIX）

| 路径 | 修复方案 |
|---|---|
| `GET /api/class-groups` | 复用 `/api/entity-list?type=classgroup` 的 scoped 模式：调用 `resolveSchedulerSemester` + 添加 `where: { semesterId: semester.id }` |
| `edit-task-dialog.tsx` | 改用 `/api/entity-list?type=classgroup` 或保留 `/api/class-groups`（修复后） |

### 10.2 不需要修改

- `/api/schedule`（已 scoped）
- `/api/data/summary`、`/api/data/teaching-tasks`、`/api/data/schedule-slots`（已 scoped）
- `/api/entity-list?type=classgroup`（已 scoped）
- `/api/schedule-adjustments` 系列（已 scoped）
- `/api/conflict-check`（已 scoped）
- `/api/export/excel`（已 scoped）
- `/api/rooms`、`/api/teachers`、`/api/courses`（全局模型，不需要 scoped）
- 所有 dashboard、data 页面（已复用 scoped 端点）

### 10.3 后续 UI selector 阶段

当 K10-SEMESTER-UI-SELECTOR 实施时：
- dashboard 顶部添加学期选择下拉框
- data 页面添加学期选择下拉框
- 编辑课程对话框添加学期选择
- 调课对话框添加学期选择
- 所有 semesterId 已通过 query string 透传

---

## 11. 后续修复阶段拆分建议

### K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-FIX（推荐下一阶段）

**目标**：修复 `GET /api/class-groups` 的跨学期读取

**范围**：
1. `src/app/api/class-groups/route.ts`：添加 `resolveSchedulerSemester` + `where: { semesterId: semester.id }`
2. `src/components/edit-task-dialog.tsx`：可改为调用 `/api/entity-list?type=classgroup`（已 scoped），或保留 `/api/class-groups`（修复后等价）
3. 更新 admin-db-content.tsx 如果使用 `/api/class-groups`（实际上使用 `/api/entity-list`）

**不允许修改**：
- Prisma schema
- `/api/schedule` 业务逻辑
- `/api/data/*` 业务逻辑
- `/api/admin/[model]` 业务逻辑
- scheduler / conflict / export / import 业务逻辑
- 写业务数据

### 后续阶段

| 阶段 | 目标 |
|---|---|
| K10-SEMESTER-IMPORT-SCOPING-AUDIT | 审计 import 链路（parser / importer / import batches） |
| K10-SEMESTER-IMPORT-SCOPING-FIX | 修复 import 跨学期问题 |
| K10-SEMESTER-UI-SELECTOR | 实施学期 UI 选择器 |
| K10-SEMESTER-REQUIRED-CONSTRAINT | 将 `semesterId` 改为 NOT NULL |

---

## 12. 验证命令结果

| 命令 | 结果 |
|---|---|
| `npx.cmd tsx scripts/audit-semester-ordinary-schedule-view-scoping.ts` | ✅ 通过（1 MEDIUM, 19 SCOPED, 0 HIGH） |
| `npx.cmd tsx scripts/test-semester-admin-data-pages-scoping-fix.ts` | ✅ Passed: 67, Failed: 0 |
| `npx.cmd tsx scripts/audit-semester-admin-data-pages-scoping.ts` | ✅ 通过（历史阶段，admin data 已 scoped） |
| `npx.cmd tsx scripts/test-semester-export-scoping-fix.ts` | ✅ Passed: 35, Failed: 0 |
| `npx.cmd tsx scripts/audit-semester-export-scoping.ts` | ✅ 通过（export 已 scoped） |
| `npx.cmd tsx scripts/test-semester-conflict-adjustment-scoping.ts` | ✅ Passed: 42, Failed: 0 |
| `npx.cmd tsx scripts/test-semester-scheduler-scoping-prep.ts` | ✅ Passed: 75, Failed: 0 |
| `npx.cmd tsx scripts/test-semester-backfill-default.ts` | ✅ Passed: 29, Failed: 0 |
| `npx.cmd tsx scripts/test-scheduler-final-safety-regression.ts` | ✅ Passed: 54, Failed: 0 |
| `npx.cmd tsx scripts/test-scheduler-seeded-prng.ts` | ✅ Passed: 27, Failed: 0 |
| `npm.cmd run build` | ✓ Compiled successfully |

---

## 13. 安全边界确认

| 项 | 状态 |
|---|---|
| 是否修改 Prisma schema | 否 |
| 是否运行 db push/migrate/reset | 否 |
| 是否写业务数据 | 否 |
| 是否实施 ordinary schedule view scoping | 否（仅审计） |
| 是否修改普通课表页面业务逻辑 | 否 |
| 是否修改普通用户 API 业务逻辑 | 否 |
| 是否做 import scoping | 否 |
| 是否做 UI selector | 否 |
| 是否修改 scheduler/export/conflict/admin data 逻辑 | 否 |
| 是否修改 solver | 否 |
| 是否修改 parser/importer/seed | 否 |
| 是否新增 `/api/scheduler/run` | 否 |
| 是否新增 Re-run | 否 |
| 是否提交 prisma/dev.db | 否（git ls-files 验证） |
| 是否提交数据库备份文件 | 否（git ls-files 验证） |

---

## 14. 风险与遗留问题

### 14.1 普通课表路径仍需修复

- `GET /api/class-groups`（MEDIUM）：读取 `ClassGroup` 未添加 `semesterId` filter

### 14.2 尚未 scoping

- Import 链路（parser / importer / import batches / confirmed imports）— K10-SEMESTER-IMPORT-SCOPING-AUDIT 待办

### 14.3 尚未实施

- UI semester selector — K10-SEMESTER-UI-SELECTOR 待办
- `semesterId` required constraint — K10-SEMESTER-REQUIRED-CONSTRAINT 待办

### 14.4 是否阻塞关闭

**不阻塞**。1 个 MEDIUM 风险属于可修复范围，且为唯一遗留，可由下一阶段单独处理。

---

## 15. 推荐下一阶段

**K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-FIX**

**目标**：
- 修复 `GET /api/class-groups` 的跨学期 ClassGroup 读取
- 不扩大到 import
- 不做 UI selector
- 不改 schema
- 不写业务数据

**预估修复量**：1 个 API 端点 + 1 个测试脚本。

---

## 16. 阶段关闭建议

| 项 | 答案 |
|---|---|
| K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-AUDIT 是否建议关闭 | **是** |
| 是否可以进入下一阶段 | **是** |
| 推荐下一阶段 | **K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-FIX** |
| 是否存在阻塞项 | **否** |
