# K11-SCHEDULE-MUTATION-SERVER-GUARD-AUDIT

## 1. 阶段名

`K11-SCHEDULE-MUTATION-SERVER-GUARD-AUDIT`

## 2. 审计日期

2026-06-01

## 3. 当前背景

K10 semester scoping 主线已关闭。外部静态审查指出：

- `PUT /api/schedule-slot/[id]` 可能直接 `prisma.scheduleSlot.update(...)` 无 server guard
- 客户端拖拽前的 conflict check 可能是唯一闸门
- `/api/admin/[model]` 对 `scheduleslot` 的 PUT 也可能允许直接修改核心字段
- 如果属实，具备 `data:write` 权限的用户可通过 curl 绕过前端，制造硬冲突

本阶段用当前代码做只读审计，确认风险是否真实存在。

## 4. 审计范围

- `PUT /api/schedule-slot/[id]`
- `POST /api/schedule-slot`
- `/api/admin/[model]` scheduleslot PUT / POST / DELETE
- `PUT /api/teaching-task/[id]`（批量更新 slot roomId）
- `checkScheduleConflict` 实现及调用链
- `scheduleStore.moveSlot` 客户端逻辑
- `schedule/adjustments.ts` 冲突检查实现
- RBAC 权限体系
- ScheduleAdjustment 一致性影响
- semester scoping guard 覆盖

## 5. 审计方法

- 代码静态扫描（grep + 文件读取）
- 只读审计脚本 `scripts/audit-schedule-mutation-server-guards.ts`
- 不连接数据库，不写入任何数据

## 6. 关键文件清单

| 文件 | 用途 |
|------|------|
| `src/app/api/schedule-slot/[id]/route.ts` | 专用 slot PUT |
| `src/app/api/schedule-slot/route.ts` | 专用 slot POST (create) |
| `src/app/api/admin/[model]/route.ts` | 通用 admin CRUD |
| `src/app/api/teaching-task/[id]/route.ts` | Teaching task PUT |
| `src/app/api/conflict-check/route.ts` | Conflict check advisory endpoint |
| `src/lib/conflict-check.ts` | checkScheduleConflict 实现 |
| `src/lib/conflict.ts` | 纯周次重叠数学 |
| `src/store/scheduleStore.ts` | 客户端 Zustand store |
| `src/lib/schedule/adjustments.ts` | 调课 dry-run + 独立冲突检查 |
| `src/lib/scheduler/apply.ts` | Scheduler apply |
| `src/lib/scheduler/rollback.ts` | Scheduler rollback |
| `src/lib/import/importer.ts` | Import confirm |
| `src/lib/import/rollback.ts` | Import rollback |

## 7. ScheduleSlot mutation 入口清单

| 路径 | 操作 | 冲突检查 | semester guard | 权限 |
|------|------|---------|----------------|------|
| `PUT /api/schedule-slot/[id]` | update | 无 | 无 | data:write |
| `POST /api/schedule-slot` | create | 无 | 无 | data:write |
| `PUT /api/admin/[model]` (scheduleslot) | update | 无 | 有 | data:write |
| `POST /api/admin/[model]` (scheduleslot) | create | 无 | 有 | data:write |
| `DELETE /api/admin/[model]` (scheduleslot) | delete | 无 | 有 | data:delete |
| `PUT /api/teaching-task/[id]` | updateMany roomId | 无 | 无 | data:write |
| Scheduler apply | update | 有 (post-apply scoring) | 有 | schedule:adjust |
| Scheduler rollback | update | 有 (state mismatch) | 有 | schedule:adjust |
| Import confirm | create | 无 | 有 | import:manage |
| Import rollback | deleteMany | 无 | 间接 (batchId) | import:manage |

## 8. PUT /api/schedule-slot/[id] 审计结论

- 是否存在：是
- 权限：`data:write`
- 是否允许修改核心字段：是（dayOfWeek, slotIndex, roomId）
- 是否调用 conflict check：**否**
- 是否有 same-semester guard：**否**
- 是否 transaction check + update：**否**
- 风险等级：**HIGH**
- 证据：route 直接 `prisma.scheduleSlot.update()` 无任何校验

## 9. /api/admin/[model] scheduleslot PUT 审计结论

- 是否存在：是
- 权限：`data:write`
- 是否允许修改核心字段：是（FIELD_WHITELIST: teachingTaskId, roomId, dayOfWeek, slotIndex）
- 是否调用 conflict check：**否**
- 是否有 same-semester guard：**是**（SEMESTER_SCOPED_MODELS 包含 scheduleslot）
- 是否可绕过 schedule-slot route：**是**（两个入口并存，相同权限）
- 风险等级：**MEDIUM**
- 证据：有 semester guard 但无 conflict check，仍可制造硬冲突

## 10. ScheduleSlot DELETE 审计结论

- 是否存在：是（admin generic route）
- 是否检查 ScheduleAdjustment 引用：**否**（countReferences 未覆盖 scheduleslot）
- 是否存在 cascade 删除 adjustment 风险：**否**（不会自动删除 adjustment，但删除 slot 后 adjustment 引用的 originalSlotId 变成孤儿）
- 风险等级：**MEDIUM**
- 证据：countReferences switch 无 scheduleslot case

## 11. ScheduleAdjustment 一致性结论

- 手动调课路径是否有 guard：**是**（dry-run + 独立 conflict check）
- 直接 PUT 是否绕过 adjustment：**是**
- 直接 DELETE 是否影响撤销调课：**是**（slot 被删除后撤销调课目标丢失）
- 风险等级：**LOW**（手动调课路径自身安全，但直接 mutation 可绕过）

## 12. Semester guard 结论

- mutation 是否校验 slot semester：admin route 是，专用 route **否**
- mutation 是否校验 TeachingTask semester：**否**
- mutation 是否可能跨学期：专用 route **是**
- 风险等级：**MEDIUM**

## 13. RBAC 结论

- mutation 使用的权限：`data:write` / `data:delete`
- 是否普通 USER 可写：取决于 USER 角色的权限分配（默认 ADMIN 有 data:write/data:delete）
- 是否 admin data page 可绕过更严格 guard：**是**（admin data page 使用 data:write，schedule-adjustments 使用 schedule:adjust）
- 风险等级：**LOW**

## 14. 风险清单

| Risk ID | Severity | Area | Description | Evidence | Recommendation |
|---------|----------|------|-------------|----------|----------------|
| K11-MUTATION-HIGH-1 | HIGH | PUT /api/schedule-slot/[id] | 无 conflict check，无 semester guard | route.ts 直接 update | 增加 checkScheduleConflict + same-semester guard |
| K11-MUTATION-HIGH-2 | HIGH | POST /api/schedule-slot | 无 conflict check，无 semesterId 写入 | route.ts 直接 create | 增加 conflict check + semesterId |
| K11-MUTATION-HIGH-3 | HIGH | Server-side enforcement | 无任何 mutation route 调用 conflict check | 仅 advisory endpoint 调用 | 所有 mutation 路径增加 conflict check |
| K11-MUTATION-MEDIUM-1 | MEDIUM | Admin scheduleslot PUT | 无 conflict check，有 semester guard | admin [model] route | 增加 conflict check 或提升权限 |
| K11-MUTATION-MEDIUM-2 | MEDIUM | Admin scheduleslot DELETE | countReferences 未覆盖 scheduleslot | switch 无 scheduleslot case | 增加 scheduleslot 引用检查 |
| K11-MUTATION-MEDIUM-3 | MEDIUM | PUT /api/teaching-task/[id] | updateMany 批量更新 roomId 无 conflict check | route.ts line 81 | 增加 post-update 冲突验证 |
| K11-MUTATION-MEDIUM-4 | MEDIUM | Client moveSlot | 拖拽直接 PUT 不做冲突预检 | scheduleStore.ts | moveSlot 先调 conflict-check |
| K11-MUTATION-MEDIUM-5 | MEDIUM | Semester guard coverage | 专用 route 无 semester guard | route.ts 无 semesterId | 专用 route 增加 same-semester guard |
| K11-MUTATION-LOW-1 | LOW | Parallel conflict checks | 两套独立冲突检查实现 | conflict-check.ts + adjustments.ts | 统一入口 |
| K11-MUTATION-LOW-2 | LOW | Adjustment consistency | 直接 PUT 绕过 ScheduleAdjustment | 两个并行路径 | 考虑禁止直接 mutation |
| K11-MUTATION-LOW-3 | LOW | RBAC | slot mutation 用 data:write 而非 schedule:adjust | 权限对比 | 提升至 schedule:adjust |

## 15. 下一阶段建议

- 推荐进入 `K11-SCHEDULE-MUTATION-SERVER-GUARD-FIX` 阶段
- 优先修复 HIGH：为 PUT/POST schedule-slot 增加 server-side conflict check + same-semester guard
- 次优先修复 MEDIUM：admin route 增加 conflict check，DELETE 增加引用检查
- 长期考虑：统一冲突检查入口，提升 RBAC 权限
