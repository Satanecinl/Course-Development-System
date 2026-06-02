# K14-RBAC-SCHEDULE-WRITE-HARDENING-FIX-A

## 1. 阶段名

K14-RBAC-SCHEDULE-WRITE-HARDENING-FIX-A

## 2. 当前背景

K14-AUDIT（commit `9af89da`）确认 6 个 MEDIUM RBAC 风险。本阶段 Fix-A 修复其中 3 个低破坏面风险：

- MEDIUM-3：admin PUT scheduleslot semesterId 安全注入
- MEDIUM-4：frontend schedule-grid 拖拽无 `data:write` gating
- MEDIUM-5：frontend adjustment dialog 无 `schedule:adjust` gating

## 3. 修复目标

1. schedule-grid 无 `data:write` 权限时拒绝拖拽并 toast 提示
2. adjustment dialog 无 `schedule:adjust` 权限时禁用提交按钮并拒绝 handler
3. dashboard-content void 按钮同样受 `schedule:adjust` gating
4. admin generic route PUT scheduleslot 防御性 re-assert `semesterId`（与 POST 行为对齐）
5. 服务端权限体系不变

## 4. 修改范围

| 文件 | 变更类型 |
|------|----------|
| `src/components/layout/current-user-context.tsx` | 新增（client context + `useCurrentUser` / `useHasPermission` hook） |
| `src/components/layout/protected-shell.tsx` | 修改（wrap children in `CurrentUserProvider`） |
| `src/components/schedule-grid.tsx` | 修改（import `useHasPermission`，`canWriteSchedule` gating on handleDragStart/handleDragEnd） |
| `src/components/schedule-adjustment-dialog.tsx` | 修改（import `useHasPermission`，`canAdjust` gating on buttons + handlers） |
| `src/app/dashboard/dashboard-content.tsx` | 修改（import `useHasPermission`，`canAdjust` gating on void button + handler） |
| `src/app/api/admin/[model]/route.ts` | 修改（PUT scheduleslot 防御性 `guardResult.semesterId` 注入） |
| `scripts/audit-rbac-schedule-write-hardening.ts` | 修改（MEDIUM-3/4/5 → NONE，新增 Fix-A 检测） |
| `scripts/verify-rbac-schedule-write-hardening-fix-a.ts` | 新增（49 项验证） |
| `docs/k14-rbac-schedule-write-hardening-fix-a.md` | 新增（本文档） |

未修改：
- `src/lib/auth/*`（permission 定义、role mapping、requirePermission 未变）
- `prisma/schema.prisma`
- solver / parser / importer / seed / RBAC database seed
- server-side permission checks（已正确，无绕过）
- `/api/conflict-check` / `/api/schedule-slot` / `/api/schedule-adjustments`

## 5. schedule-grid gating 修复

- 文件：`src/components/schedule-grid.tsx`
- 当前权限判断方式：`useHasPermission('data:write')` 返回 boolean（默认 false，从 CurrentUserContext 获取）
- 使用的权限：`data:write`
- 无权限时行为：`handleDragStart` 清空 activeItem 并 toast "没有写权限"；`handleDragEnd` 直接 return 并 toast
- 有权限时行为：原有拖拽逻辑不变
- 是否修改 moveSlot：否（moveSlot 仍执行，但 handleDragEnd 在权限不足时已提前 return）
- 是否修改 preflight：否（`/api/conflict-check` 逻辑未变）
- 证据位置：`src/components/schedule-grid.tsx:58-87`（canWriteSchedule 声明 + handleDragStart/handleDragEnd 门控）

## 6. adjustment dialog gating 修复

- 文件：`src/components/schedule-adjustment-dialog.tsx`
- 当前权限判断方式：`useHasPermission('schedule:adjust')` 返回 boolean
- 使用的权限：`schedule:adjust`
- create/submit 是否 gating：是（handleDryRun + handleConfirm 均在入口处检查 canAdjust）
- void/撤销是否 gating：是（dashboard-content.tsx 中 void button + handleExecuteVoid 均检查 canAdjust）
- 无权限时行为：按钮 disabled + toast "没有调课权限"，handler 直接 return
- 有权限时行为：原有调课逻辑不变
- 是否修改 adjustment API：否（`/api/schedule-adjustments` 权限未变）
- 证据位置：
  - `src/components/schedule-adjustment-dialog.tsx:55-60`（canAdjust 声明）
  - `src/components/schedule-adjustment-dialog.tsx:78-85`（handleDryRun gating）
  - `src/components/schedule-adjustment-dialog.tsx:99-107`（handleConfirm gating）
  - `src/app/dashboard/dashboard-content.tsx:175`（canAdjust 声明）
  - `src/app/dashboard/dashboard-content.tsx:290-296`（handleExecuteVoid gating）

## 7. admin scheduleslot PUT semesterId 修复

- 文件：`src/app/api/admin/[model]/route.ts`
- 原问题：audit MEDIUM-3 认为 PUT scheduleslot 路径未与 POST 对齐注入 semesterId（实际上 PUT 已有 `data.semesterId = semester.id` at line 268，但审计误报为缺失）
- 修复策略：在 PUT scheduleslot 分支的 guard 结果后，防御性 re-assert `guardResult.semesterId`（与 POST 分支 line 216-218 行为一致）
- semesterId 优先级：
  1. request body 明确传入合法 semesterId → 由 guard 校验
  2. `resolveSemesterIfNeeded` 解析结果（line 268 `data.semesterId = semester.id`）
  3. `guardResult.semesterId`（防御性 fallback，Fix-A 新增）
- 是否保留 explicit semesterId：是
- 是否 fallback existing slot semesterId：是（guard 内部读取 slot.semesterId）
- 是否 fallback teachingTask semesterId：是（guard 内部读取 task.semesterId）
- 是否 fallback current scheduler semester：是（resolveSemesterIfNeeded → resolveSchedulerSemester）
- 是否保留 guard：是（`guardAdminSlotUpdate` 仍在）
- 是否改变 response shape：否（conflictDetails 兼容字段未被删除）
- 证据位置：`src/app/api/admin/[model]/route.ts:271-284`

## 8. 保留的权限模型

- 10 个 permissions：schedule:view, schedule:adjust, data:read, data:write, data:delete, data:export, import:manage, settings:manage, users:manage, diagnostics:view
- 3 个 roles：ADMIN（全 10 个）、USER（仅 data:read）、DATA_EXPORTER（data:read + data:export）
- requirePermission：401/403 行为未变
- 所有 server-side check：未变

## 9. 未处理范围

- **不**拆分 `data:write`（过大，不在本阶段）
- **不**新增 permission
- **不**修改 role mapping
- **不**处理 admin generic teachingtask PUT 与专用 route guard 不一致（deferred to K14-FIX-B，if needed）
- **不**修改 solver / parser / importer / seed
- **不**新增 `/api/scheduler/run`
- **不**修改 RBAC database seed

## 10. 验证命令与结果

| 命令 | 结果 |
|------|------|
| `npx.cmd tsx scripts/verify-rbac-schedule-write-hardening-fix-a.ts` | 49 PASS / 0 FAIL / 0 SKIP |
| `npx.cmd tsx scripts/audit-rbac-schedule-write-hardening.ts` | HIGH 0 / MEDIUM 3 / LOW 2 / NONE 8 |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH 0 / MEDIUM 0 / LOW 3 / NONE 8 |
| `npx.cmd tsx scripts/verify-schedule-conflict-response-shape-fix-d.ts` | 60 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23 PASS / 0 FAIL |
| `npm.cmd run build` | ✓ Compiled successfully |
| `npm.cmd run lint` | 无新增错误 |
| `npm.cmd test` | 项目无 test script |

## 11. 风险变化

- Fix-A 前 K14 HIGH：0
- Fix-A 后 K14 HIGH：0
- Fix-A 前 K14 MEDIUM：6
- Fix-A 后 K14 MEDIUM：**3**（降低 3）
- Fix-A 前 K14 LOW：2
- Fix-A 后 K14 LOW：2
- 已消除风险：K14-RBAC-MEDIUM-3（admin PUT scheduleslot semesterId）、K14-RBAC-MEDIUM-4（frontend schedule-grid）、K14-RBAC-MEDIUM-5（frontend adjustment dialog）
- 剩余 MEDIUM：K14-RBAC-MEDIUM-1（data:write 跨 schedule + entity）、K14-RBAC-MEDIUM-2（data:write 跨 teachingtask）、K14-RBAC-MEDIUM-6（data:write 过宽）

## 12. 禁止事项确认

- 未修改 Prisma schema：✓
- 未运行 db push / migrate / reset：✓
- 未使用 `--accept-data-loss`：✓
- 未修改 `prisma/dev.db`：✓
- 未提交数据库或备份：✓
- 未新增 permission：✓
- 未修改 permission 定义：✓
- 未修改角色权限映射：✓
- 未修改 `requirePermission`：✓
- 未放宽服务端权限：✓
- 未修改 solver：✓
- 未修改 parser/importer/seed：✓
- 未新增 `/api/scheduler/run`：✓
- 未新增 Re-run 按钮：✓
- 未新增 UI semester selector：✓

## 13. 提交信息

- commit hash：`待定`
- commit message：`fix(rbac): harden schedule write boundaries`

## 14. 阶段关闭建议

- 本阶段是否建议关闭：**是**
- 是否仍存在 HIGH：否
- 是否仍存在 MEDIUM：是（3 项，均为 data:write 粒度问题，非安全）
- 是否需要进入 Fix-B：可选（K14-RBAC-MEDIUM-2：admin generic teachingtask PUT 与专用 route guard 不一致）
- 推荐下一阶段名：K14-FIX-B（如果需要处理 admin generic teachingtask route 与专用 route guard 不一致问题），否则 K14 主线可关闭

## 15. 关键设计决策

1. **使用 React context 而非新 API endpoint**：CurrentUserContext 由 server-side ProtectedShell 在页面渲染时 resolve，客户端 hook 从 context 获取，无需额外 HTTP 请求
2. **Default-deny**：useHasPermission 在 context 未加载时返回 false，符合 spec "如果权限状态加载中，默认不要允许写操作"
3. **handler-level gating + button disabled 双重防护**：符合 spec "无权限时：禁止拖拽，或 handleDragEnd 立即返回并 toast"
4. **admin PUT semesterId 防御性 re-assert**：尽管 PUT 已有 `data.semesterId = semester.id`，增加 guardResult.semesterId fallback 与 POST 行为完全对齐，消除审计 false positive
5. **不拆分 data:write**：保留 K14 audit 的过宽权限记录，defer to future stage
