# K14-RBAC-SCHEDULE-WRITE-HARDENING-FIX-B

## 1. 阶段名

K14-RBAC-SCHEDULE-WRITE-HARDENING-FIX-B

## 2. 当前背景

K14-FIX-A（commit `1df4385`）修复了 frontend gating 和 admin PUT scheduleslot semesterId 问题，K14 MEDIUM 6→3。

剩余 MEDIUM-2 是 admin generic `teachingtask` PUT 与专用 `PUT /api/teaching-task/[id]` 的 guard 能力不一致：

- 专用 route：有 pre-update room conflict check（当 roomId 变化时）
- admin generic route：无任何 conflict guard，teacherId 变化不会触发 teacher 冲突检查

## 3. 修复目标

1. admin generic `teachingtask` PUT 在 teacherId 变化时，检查关联 ScheduleSlot 是否会与新教师产生冲突
2. 复用已有 `checkScheduleConflicts` 引擎（与 slot-mutation-guard 和 /api/conflict-check 相同）
3. 冲突时返回 409，保留 `{ error, conflicts, conflictDetails }`
4. 不改变不影响冲突的 teachingtask 更新行为

## 4. 修改范围

| 文件 | 变更类型 |
|------|----------|
| `src/lib/schedule/teaching-task-mutation-guard.ts` | 新增（`guardAdminTaskUpdate` 函数） |
| `src/app/api/admin/[model]/route.ts` | 修改（import + teachingtask PUT 分支增加 guard 调用） |
| `scripts/audit-rbac-schedule-write-hardening.ts` | 修改（MEDIUM-2 → NONE，新增 Fix-B 检测） |
| `scripts/verify-rbac-schedule-write-hardening-fix-b.ts` | 新增（53 项验证） |
| `scripts/verify-schedule-conflict-response-shape-fix-d.ts` | 修改（admin conflictDetails 站点数 2→3） |
| `docs/k14-rbac-schedule-write-hardening-fix-b.md` | 新增（本文档） |

未修改：
- `src/lib/auth/*`（permission 定义、role mapping、requirePermission 未变）
- `prisma/schema.prisma`
- solver / parser / importer / seed / RBAC database seed
- frontend gating（schedule-grid、adjustment dialog、dashboard-content）
- dedicated `PUT /api/teaching-task/[id]`（行为不变）

## 5. 专用 teaching-task route 原 guard 说明

- 文件：`src/app/api/teaching-task/[id]/route.ts`
- 权限：`requirePermission('data:write')`
- 冲突检查：当 `roomId != null` 时，遍历所有关联 ScheduleSlot，调用 `checkScheduleConflicts` 检查教室冲突
- 传入字段：`scheduleSlotId, teachingTaskId, targetDayOfWeek, targetSlotIndex, targetRoomId, semesterId`
- 冲突时：throw Error → catch → 409 `{ error, conflicts, conflictDetails }`
- **注意**：专用 route 只检查 room 冲突，不检查 teacher 冲突

## 6. admin generic teachingtask PUT 原问题

- 文件：`src/app/api/admin/[model]/route.ts`
- 权限：`requirePermission('data:write')`
- FIELD_WHITELIST：`courseId, teacherId, weekType, startWeek, endWeek, remark`
- **原问题**：无任何 conflict guard。teacherId 变化直接执行 `delegate.update()`，不会触发 teacher 冲突检查
- **影响**：改变 TeachingTask 的 teacherId 可能导致关联 ScheduleSlot 的教师与其他时段冲突

## 7. Fix-B guard 策略

- guard 函数：`guardAdminTaskUpdate`（`src/lib/schedule/teaching-task-mutation-guard.ts`）
- 触发条件：`data.teacherId !== undefined` 且与 existing.teacherId 不同
- 关联 slots 查询：`prisma.teachingTask.findUnique` 包含 `scheduleSlots` include
- 冲突检查：对每个关联 slot 调用 `checkScheduleConflicts`，传入：
  - `scheduleSlotId: slot.id`（exclude self）
  - `teacherId: newTeacherId`（override，使用 `input.teacherId` 直接传入，不走 DB lookup）
  - `classGroupIds`（从 existing task 的 taskClasses 提取）
  - `movingWeek`（从 existing task 的 startWeek/endWeek/weekType 构建）
  - `targetDayOfWeek, targetSlotIndex, targetRoomId`（从 slot 读取）
  - `semesterId`（slot.semesterId ?? existing.semesterId）
- 冲突时：返回 409 `{ error, conflicts, conflictDetails }`
- 无冲突时：返回 `{ ok: true, semesterId }`

## 8. same-semester guard 说明

- admin generic route 已有 same-semester guard：`resolveSemesterIfNeeded` + existing record semesterId 校验
- TeachingTask.semesterId 不会被错误清空（guard 不修改 semesterId）
- 关联 ScheduleSlot 的 semester 一致性由 checkScheduleConflicts 的 `semesterId` 参数保证
- guard 传入 `slot.semesterId ?? existing.semesterId`，确保冲突检查在正确学期范围内

## 9. response shape 兼容说明

- 冲突 response：`{ error: string, conflicts: string[], conflictDetails: ScheduleConflictDetail[] }`
- 与 K13-FIX-D 完全兼容
- 与 slot-mutation-guard 和 dedicated teaching-task route 的 response shape 一致

## 10. 保留的权限模型

- 10 个 permissions：schedule:view, schedule:adjust, data:read, data:write, data:delete, data:export, import:manage, settings:manage, users:manage, diagnostics:view
- 3 个 roles：ADMIN（全 10 个）、USER（仅 data:read）、DATA_EXPORTER（data:read + data:export）
- requirePermission：401/403 行为未变
- admin generic teachingtask PUT 仍使用 `data:write`

## 11. 未处理范围

- **不**拆分 `data:write`
- **不**新增 permission
- **不**修改 role mapping
- **不**修改 requirePermission
- **不**修改 frontend gating
- **不**修改 solver / parser / importer / seed
- **不**新增 `/api/scheduler/run`
- **不**修改 Prisma schema
- **不**修改数据库
- **不**修改 dedicated teaching-task route 行为

## 12. 验证命令与结果

| 命令 | 结果 |
|------|------|
| `npx.cmd tsx scripts/verify-rbac-schedule-write-hardening-fix-b.ts` | 53 PASS / 0 FAIL / 0 SKIP |
| `npx.cmd tsx scripts/verify-rbac-schedule-write-hardening-fix-a.ts` | 49 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-rbac-schedule-write-hardening.ts` | HIGH 0 / MEDIUM 2 / LOW 2 / NONE 9 |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH 0 / MEDIUM 0 / LOW 3 / NONE 8 |
| `npx.cmd tsx scripts/verify-schedule-conflict-response-shape-fix-d.ts` | 60 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-schedule-conflict-check-unification-fix-b.ts` | 39 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23 PASS / 0 FAIL |
| `npm.cmd run build` | ✓ Compiled successfully |

## 13. 风险变化

- Fix-B 前 K14 HIGH：0
- Fix-B 后 K14 HIGH：0
- Fix-B 前 K14 MEDIUM：3
- Fix-B 后 K14 MEDIUM：**2**（降低 1）
- Fix-B 前 K14 LOW：2
- Fix-B 后 K14 LOW：2
- 已消除风险：K14-RBAC-MEDIUM-2（admin generic teachingtask PUT 无 conflict guard）
- 剩余 MEDIUM：K14-RBAC-MEDIUM-1（data:write 跨 schedule + entity）、K14-RBAC-MEDIUM-6（data:write 过宽）

## 14. 禁止事项确认

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
- 未修改 frontend gating：✓
- 未修改 solver：✓
- 未修改 parser/importer/seed：✓
- 未新增 `/api/scheduler/run`：✓
- 未新增 Re-run 按钮：✓
- 未新增 UI semester selector：✓

## 15. 提交信息

- commit hash：`待定`
- commit message：`fix(rbac): guard admin teaching task updates`

## 16. 阶段关闭建议

- 本阶段是否建议关闭：**是**
- 是否仍存在 HIGH：否
- 是否仍存在 MEDIUM：是（2 项，均为 data:write 粒度问题，非安全）
- K14 主线是否建议关闭：**是**（剩余 MEDIUM-1/6 为可选的权限粒度优化，非安全风险）
- 是否需要后续阶段：可选（data:write 拆分为独立阶段，非必须）
- 推荐下一阶段名：K14-FIX-C（如需拆分 data:write），否则 K14 主线关闭
