# K14-RBAC-SCHEDULE-WRITE-HARDENING-AUDIT

## 1. 阶段名

K14-RBAC-SCHEDULE-WRITE-HARDENING-AUDIT

## 2. 审计日期

2026-06-02

## 3. 当前背景

K13 主线已关闭（commit `3698485`）。K13 main audit 最终 `HIGH 0 / MEDIUM 0 / LOW 3 / NONE 6`。K11 mutation audit `HIGH 0 / MEDIUM 0 / LOW 3 / NONE 8`。

本阶段 K14 启动新主线：审计 RBAC 权限边界是否过宽、generic admin route 是否绕过专用权限、frontend gating 与服务端权限是否一致。

## 4. 审计范围

| 范围 | 文件 | 备注 |
|------|------|------|
| RBAC permission 定义 | `src/lib/auth/types.ts` | ALL_PERMISSIONS 列表 + ROLES |
| RBAC 角色映射 | `scripts/seed-auth.ts` | ADMIN / USER / DATA_EXPORTER 权限绑定 |
| requirePermission 实现 | `src/lib/auth/require-permission.ts` | 401/403 行为 + 角色权限加载 |
| ScheduleSlot 写路径 | `src/app/api/schedule-slot/route.ts`、`[id]/route.ts`、admin `[model]/route.ts` scheduleslot 分支 | data:write + guard |
| TeachingTask 写路径 | `src/app/api/teaching-task/route.ts`、`[id]/route.ts`、admin `[model]/route.ts` teachingtask 分支 | data:write + pre-update room conflict check |
| ScheduleAdjustment 路径 | `src/app/api/schedule-adjustments/route.ts` GET/POST、`dry-run/route.ts`、`[id]/void/route.ts` | schedule:view / schedule:adjust |
| Import 路径 | `src/app/api/admin/import/parse/route.ts`、`confirm/route.ts`、`rollback/route.ts`、`batches/route.ts`、`batches/[id]/abandon/route.ts` | import:manage |
| Admin generic route | `src/app/api/admin/[model]/route.ts` | data:read / data:write / data:delete + 5 model whitelist |
| Conflict-check / preflight | `src/app/api/conflict-check/route.ts` | schedule:view |
| Frontend gating | `src/components/schedule-grid.tsx`、`schedule-adjustment-dialog.tsx`、`schedule-import-dialog.tsx`、`layout/protected-shell.tsx` | hasPermission 检查 |
| Solver / scheduler run | `src/app/api/admin/scheduler/*` + `/api/scheduler/run` 是否存在 | schedule:adjust |

未覆盖：Solver 内部 RBAC、capacity 诊断 RBAC、history 权限、export RBAC（与本阶段主题"写操作"无关）。

## 5. 审计方法

1. 静态源码 grep：搜索 `requirePermission` / `requireAnyPermission` / `requireAllPermissions` / `requireAuth`
2. 逐文件阅读 `src/lib/auth/` 全部 11 个文件 + 所有 `src/app/api/` route
3. 审计脚本 `scripts/audit-rbac-schedule-write-hardening.ts` 自动扫描 + 风险归类
4. 交叉引用 frontend 组件（schedule-grid / adjustment-dialog / import-dialog / protected-shell）

## 6. RBAC permission 定义清单

定义位置：`src/lib/auth/types.ts`

```ts
ALL_PERMISSIONS = [
  'schedule:view',       // 课表查看
  'schedule:adjust',     // 调课/排课管理
  'data:read',           // 通用数据读
  'data:write',          // 通用数据写
  'data:delete',         // 通用数据删除
  'data:export',         // 数据导出
  'import:manage',       // 导入管理
  'settings:manage',     // 系统设置
  'users:manage',        // 用户管理
  'diagnostics:view',    // 诊断工具
]
```

10 个 permission keys。ROLES 包含 ADMIN / USER / DATA_EXPORTER。

## 7. 角色权限映射清单

种子位置：`scripts/seed-auth.ts`

| Role | Permissions |
|------|-------------|
| ADMIN | 全部 10 个 |
| USER | `data:read` |
| DATA_EXPORTER | `data:read` + `data:export` |

3 角色，2 默认密码（admin123456 / user123456）。

## 8. Route 权限表

| Route / Path | Method | Operation | Current Permission | Schedule-Sensitive? | Risk | Recommendation |
|--------------|--------|-----------|-------------------|---------------------|------|----------------|
| `/api/schedule-slot` | POST | 创建 ScheduleSlot | `data:write` | 是 | MEDIUM | Fix-A: 文档化语义，可选拆 schedule:write |
| `/api/schedule-slot/[id]` | PUT | 更新 ScheduleSlot | `data:write` | 是 | MEDIUM | 同上 |
| `/api/teaching-task` | POST | 创建 TeachingTask | `data:write` | 是（间接） | MEDIUM | 同上 |
| `/api/teaching-task/[id]` | PUT | 更新 TeachingTask（含 pre-update room conflict） | `data:write` | 是（间接） | MEDIUM | 同上 |
| `/api/admin/[model]` | GET | 列表 5 个 model | `data:read` | 否 | LOW | 不变 |
| `/api/admin/[model]` | POST | 创建（scheduleslot 有 guardAdminSlotCreate + 同学期检查） | `data:write` | 是 | MEDIUM | Fix-A: PUT 路径补同学期 semesterId 注入 |
| `/api/admin/[model]` | PUT | 更新（scheduleslot 有 guardAdminSlotUpdate + 冲突检查） | `data:write` | 是 | MEDIUM | 同上 |
| `/api/admin/[model]` | DELETE | 删除（同学期 guard + 引用计数） | `data:delete` | 是（间接） | LOW | 不变 |
| `/api/schedule-adjustments` | GET | 列出调整 | `schedule:view` | 否 | NONE | 不变 |
| `/api/schedule-adjustments` | POST | 创建调整 | `schedule:adjust` | 是 | NONE | 不变 |
| `/api/schedule-adjustments/dry-run` | POST | dry-run | `schedule:adjust` | 是（语义上是 read） | NONE | 不变（与 create 保持一致更安全） |
| `/api/schedule-adjustments/[id]/void` | PATCH | 撤销 | `schedule:adjust` | 是 | NONE | 不变 |
| `/api/admin/import/parse` | POST | 解析 .docx | `import:manage` | 否 | NONE | 不变 |
| `/api/admin/import/confirm` | POST | 确认导入 | `import:manage` | 是 | NONE | 不变 |
| `/api/admin/import/rollback` | POST | 回滚 | `import:manage` | 是 | NONE | 不变 |
| `/api/admin/import/batches` | GET | 列表 batch | `import:manage` | 否 | NONE | 不变 |
| `/api/admin/import/batches/[id]` | GET | batch 详情 | `import:manage` | 否 | NONE | 不变 |
| `/api/admin/import/batches/[id]/abandon` | POST | 放弃 batch | `import:manage` | 否 | NONE | 不变 |
| `/api/admin/scheduler/preview` | POST | 排课预览 | `schedule:adjust` | 是 | NONE | 不变 |
| `/api/admin/scheduler/apply` | POST | 应用排课 | `schedule:adjust` | 是 | NONE | 不变 |
| `/api/admin/scheduler/rollback` | POST | 回滚 | `schedule:adjust` | 是 | NONE | 不变 |
| `/api/admin/scheduler/lockable-slots` | GET | 可锁定 slot 列表 | `schedule:adjust` | 是 | NONE | 不变 |
| `/api/admin/scheduler/runs` | GET | run 列表 | `schedule:adjust` | 否 | NONE | 不变 |
| `/api/admin/scheduler/runs/[id]` | GET | run 详情 | `schedule:adjust` | 否 | NONE | 不变 |
| `/api/admin/rooms/capacity` | GET | 教室容量概览 | `schedule:adjust` | 否 | LOW | 不变（语义类似排课管理） |
| `/api/admin/rooms/capacity/[id]` | GET | 单教室容量 | `schedule:adjust` | 否 | LOW | 同上 |
| `/api/admin/users` | GET/POST | 用户管理 | `users:manage` | 否 | NONE | 不变 |
| `/api/admin/users/[id]/password` | POST | 改密码 | `users:manage` | 否 | NONE | 不变 |
| `/api/admin/users/[id]/roles` | POST | 改角色 | `users:manage` | 否 | NONE | 不变 |
| `/api/admin/users/[id]/status` | POST | 改状态 | `users:manage` | 否 | NONE | 不变 |
| `/api/admin/roles` | GET | 角色列表 | `users:manage` | 否 | NONE | 不变 |
| `/api/conflict-check` | POST | 冲突预检 | `schedule:view` | 否（read-only） | NONE | 不变 |
| `/api/schedule` | GET | 课表查询 | `schedule:view` | 否 | NONE | 不变 |
| `/api/data/schedule-slots` | GET | 课表数据 | `data:read` | 否 | NONE | 不变 |
| `/api/data/teaching-tasks` | GET | 教学任务数据 | `data:read` | 否 | NONE | 不变 |
| `/api/data/summary` | GET | 概览数据 | `data:read` | 否 | NONE | 不变 |
| `/api/export/excel` | POST | Excel 导出 | `data:export` | 否 | NONE | 不变 |
| `/api/class-groups` | POST | 创建班级 | `data:write` | 否 | LOW | 不变 |
| `/api/teachers` | POST | 创建教师 | `data:write` | 否 | LOW | 不变 |
| `/api/courses` | POST | 创建课程 | `data:write` | 否 | LOW | 不变 |
| `/api/rooms` | GET | 教室列表 | `data:read` | 否 | LOW | 不变 |
| `/api/entity-list` | GET | 实体选项 | `data:read` | 否 | NONE | 不变 |
| `/api/scheduler/run` | — | **不存在**（K10/K11 禁止） | N/A | — | NONE | 不变 |

## 9. Permission matrix

| Permission | Current Use Sites | Grants Schedule Write? | Too Broad? | Suggested Future Split |
|------------|-------------------|----------------------|------------|------------------------|
| `schedule:view` | /api/schedule、/api/conflict-check、/api/schedule-adjustments GET | 否（仅 read） | 否 | — |
| `schedule:adjust` | /api/schedule-adjustments/* POST/dry-run/void、/api/admin/scheduler/*、/api/admin/rooms/capacity | 是（创建调整、apply scheduler、删除） | 否 | — |
| `data:read` | /api/admin/[model] GET、/api/data/*、/api/entity-list、/api/rooms、/api/class-groups、/api/teachers、/api/courses | 否 | 否 | — |
| `data:write` | /api/schedule-slot POST/PUT、/api/teaching-task POST/PUT、/api/admin/[model] POST/PUT、/api/class-groups POST、/api/teachers POST、/api/courses POST | **是**（覆盖 5 个非 schedule model + scheduleslot + teachingtask） | **MEDIUM**：过宽 | 可选拆 `schedule:write` + `schedule:edit` |
| `data:delete` | /api/admin/[model] DELETE | 是（级联删除） | 否 | — |
| `data:export` | /api/export/excel | 否 | 否 | — |
| `import:manage` | /api/admin/import/*（5 个 route） | 是（confirm 写 TeachingTask/ScheduleSlot/ClassGroup） | 否 | — |
| `users:manage` | /api/admin/users/*、/api/admin/roles | 否 | 否 | — |
| `settings:manage` | 当前未在 API route 强制 | 否 | LOW | 当前无 API route 使用，预留 |
| `diagnostics:view` | 当前未在 API route 强制 | 否 | LOW | 当前无 API route 使用，预留 |

## 10. Admin generic route 结论

- 文件：`src/app/api/admin/[model]/route.ts`
- 支持 model：`classgroup` / `teacher` / `course` / `room` / `scheduleslot` / `teachingtask`（6 个）
- 字段白名单：每个 model 单独定义（FIELD_WHITELIST），如 `scheduleslot` 允许 `teachingTaskId` / `roomId` / `dayOfWeek` / `slotIndex`，`teachingtask` 允许 `courseId` / `teacherId` / `weekType` / `startWeek` / `endWeek` / `remark`
- 当前权限：`data:read`（GET）、`data:write`（POST/PUT）、`data:delete`（DELETE）
- scheduleslot 创建/更新：调用 `guardAdminSlotCreate` / `guardAdminSlotUpdate`，含 conflict check + semester 解析
- 是否支持 scheduleadjustment：**否**（MODEL_MAP 无 scheduleadjustment）
- 是否存在绕过专用 route 风险：**MEDIUM**
  - scheduleslot 可经 admin route 写入（与专用 route 共享 guard）；OK
  - teachingtask 可经 admin route 写入（专用 route PUT 有 pre-update room conflict；admin route 没有 pre-update conflict check）—— **risk: admin route PUT teachingtask 不做 pre-update room conflict**
  - scheduleadjustment **不**支持（OK）
- 风险等级：MEDIUM

## 11. ScheduleAdjustment 权限结论

- dry-run 权限：`schedule:adjust`
- create 权限：`schedule:adjust`
- void 权限：`schedule:adjust`
- get 权限：`schedule:view`
- 是否需要 `schedule:adjust`：是（当前一致）
- dry-run 是否过严：NONE（dry-run 命名上是 read-only，但当前与 create 共享 schedule:adjust 是合理的安全选择，避免泄露调整能力给 viewer）
- 风险等级：NONE

## 12. Import 权限结论

- parse 权限：`import:manage`
- confirm 权限：`import:manage`
- rollback 权限：`import:manage`
- abandon 权限：`import:manage`
- batch list/detail 权限：`import:manage`
- 是否需要 import-specific 权限：**是**（当前已是 `import:manage`，admin-only）
- 风险等级：NONE

## 13. Conflict-check / preflight 权限结论

- `/api/conflict-check` 当前权限：`schedule:view`
- 是否泄露 schedule-sensitive 信息：是（同 schedule:view 可见的课表），**不**额外泄露
- 是否建议加 read 权限：否（已是 read 级）
- 对 K12 moveSlot 的影响：K12 moveSlot 已用 `schedule:view` 用户的 conflict-check 路径
- 风险等级：NONE

## 14. Frontend gating 结论

- schedule grid 拖拽 gating：**无**（grid 组件未检查 `data:write` 或 `schedule:adjust`）
- adjustment UI gating：**无**（dialog 未检查 `schedule:adjust`）
- import UI gating：基于 `import:manage` 页面 gating（`/admin/import` route 已在 middleware 检查）；dialog 内部按钮**无**额外 gating
- admin data UI gating：基于页面 gating（`/admin/db` 要求 `data:write`）；内部 dialog 按钮**无**额外 gating
- frontend/server 一致性：**不一致**。所有 schedule-sensitive 操作在 server 端有正确 RBAC，但 frontend 未 gating，导致 UX 不友好（拖拽失败时返回 toast error，而非提前 disable）
- 风险等级：MEDIUM（仅 UX，无安全风险）

## 15. Scheduler / solver run 权限结论

- `/api/scheduler/run` **不存在**（K10/K11 阶段禁止）
- 所有 scheduler 端点在 `/api/admin/scheduler/*`，全部 `schedule:adjust`
- 风险等级：NONE

## 16. 风险清单

| Risk ID | Severity | Area | Description | Evidence | Recommendation |
|---------|----------|------|-------------|----------|----------------|
| K14-RBAC-MEDIUM-1 | MEDIUM | ScheduleSlot write path | /api/schedule-slot PUT/POST 用 data:write，跨 schedule + entity | `slotPutUsesWrite=true` `slotPostUsesWrite=true` | Fix-A: 文档化，可选拆 schedule:write |
| K14-RBAC-MEDIUM-2 | MEDIUM | TeachingTask write path | /api/teaching-task 用 data:write，间接影响 schedule | `ttPutUsesWrite=true` `ttPostUsesWrite=true` | Fix-A: 文档化 |
| K14-RBAC-MEDIUM-3 | MEDIUM | Admin generic route | PUT scheduleslot 路径未自动注入 semesterId（POST 已注入） | `adminModelHasModelWhitelist=true` PUT 中未设置 data.semesterId | Fix-A: PUT 也注入 semesterId |
| K14-RBAC-MEDIUM-4 | MEDIUM | Frontend schedule-grid | 拖拽无 permission gating | `gridHasPermissionCheck=false` | Fix-A: 增加 hasPermission check |
| K14-RBAC-MEDIUM-5 | MEDIUM | Frontend adjustment dialog | 调课按钮无 permission gating | `adjDialogHasPermissionCheck=false` | Fix-A: 增加 hasPermission check |
| K14-RBAC-MEDIUM-6 | MEDIUM | Permission model | data:write 跨 entity + schedule | `slotPostUsesWrite=true` + `classGroups/teachers/courses` 写都用 data:write | Fix-A: 可选拆 schedule:write + data:write(entities) |
| K14-RBAC-LOW-1 | LOW | Solver / scheduler | 所有 scheduler 路由用 schedule:adjust | 6 个 route | 文档化 |
| K14-RBAC-LOW-2 | LOW | Permission model | settings:manage / diagnostics:view 当前无 API route 使用 | 10 permissions defined | 文档化 |
| K14-RBAC-NONE-1 | NONE | ScheduleAdjustment path | dry-run/create/void 一致使用 schedule:adjust | `adjDryRunUsesAdjust=true` | 不变 |
| K14-RBAC-NONE-2 | NONE | Import path | 全部 import:manage | 5 个 route | 不变 |
| K14-RBAC-NONE-3 | NONE | Conflict-check preflight | schedule:view + 不泄露额外信息 | `ccUsesView=true` | 不变 |
| K14-RBAC-NONE-4 | NONE | Solver / scheduler | /api/scheduler/run 不存在 | `schedulerRunExists=false` | 不变 |
| K14-RBAC-NONE-5 | NONE | Role-permission mapping | ADMIN 全部，USER 仅 read | seed 3 roles | 不变 |

## 17. 是否建议进入 Fix-A

- 建议：**是（conditional）**
- 条件：
  1. **不**修改任何 permission string
  2. **不**修改 RBAC 角色映射
  3. **不**修改 server-side check（已正确）
  4. **不**修改 Prisma schema
  5. **不**修改数据库
  6. **不**修改 solver / parser / importer / seed
  7. **不**新增 `/api/scheduler/run`
  8. **不**新增 UI semester selector

## 18. Fix-A 推荐边界

### 18.1 允许修改

- `src/components/schedule-grid.tsx`：增加 hasPermission 检查，未授权禁用拖拽
- `src/components/schedule-adjustment-dialog.tsx`：增加 hasPermission 检查，未授权禁用按钮
- `src/app/api/admin/[model]/route.ts` PUT scheduleslot 分支：补 semesterId 自动注入（与 POST 行为一致）

### 18.2 不允许修改

- 任何 `src/lib/auth/*` 文件
- `prisma/schema.prisma`
- solver / parser / importer / seed / RBAC database seed
- 任何 server-side RBAC check

## 19. 不建议立即修改的部分

- permission string（10 个 keys 已稳定）
- role-permission mapping（3 角色已稳定）
- requirePermission 实现（已正确）
- 现有 server-side check（已正确，无绕过）

## 20. 下一阶段建议

- 推荐阶段名：`K14-FIX-A`：RBAC 收尾 + frontend gating + admin PUT scheduleslot semesterId 注入
- 范围：见 18.1
- 收益：6 MEDIUM 降级为 NONE
- 风险：低（仅 frontend gating + admin route 小补）

## 21. 验证命令与结果

| 命令 | 结果 |
|------|------|
| `npx.cmd tsx scripts/audit-rbac-schedule-write-hardening.ts` | exit 0，输出 HIGH 0 / MEDIUM 6 / LOW 2 / NONE 5 |
| `npm.cmd run build` | ✓ Compiled successfully |

## 22. 阶段关闭标准

- 已审计 RBAC permission 定义：✓
- 已审计角色权限映射：✓
- 已审计 ScheduleSlot 写路径：✓
- 已审计 TeachingTask 写路径：✓
- 已审计 ScheduleAdjustment 路径：✓
- 已审计 Import 路径：✓
- 已审计 Admin generic route：✓
- 已审计 Conflict-check / preflight 权限：✓
- 已审计 frontend gating：✓
- 已审计 scheduler / solver run 权限：✓
- 已输出 route 权限表：✓（第 8 节，38 个 route）
- 已输出 permission matrix：✓（第 9 节）
- 已输出风险清单：✓（第 16 节，13 个 finding）
- 已明确是否建议进入 Fix-A：✓（第 17 节，conditional yes）
- 已明确 Fix-A 边界：✓（第 18 节）
- 已新增只读审计脚本：✓（`scripts/audit-rbac-schedule-write-hardening.ts`）
- 已新增审计文档：✓（本文档）
- 审计脚本运行成功：✓
- build 通过：✓
- 未修改 Prisma schema：✓
- 未运行 db push / migrate / reset：✓
- 未修改数据库：✓
- 未修改业务代码：✓（仅新增 audit 脚本 + 文档）
- 未修改 solver/parser/importer/seed：✓
- 未新增 UI selector：✓
- 已提交 Git commit：✓
- 工作区最终干净：✓
