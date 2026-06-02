# K13-SCHEDULE-CONFLICT-CHECK-UNIFICATION-FIX-B

## 1. 阶段名

K13-SCHEDULE-CONFLICT-CHECK-UNIFICATION-FIX-B

## 2. 当前背景

K13 Fix-A 已完成（commit `4aaf1fb`）：
- 共享 helper `src/lib/schedule/conflict-check.ts:checkScheduleConflicts`
- `/api/conflict-check` + `slot-mutation-guard.ts` 共用 helper
- 旧独立实现 `src/lib/conflict-check.ts` 已删除

K13 audit 剩余 MEDIUM：
- K13-CONFLICT-MEDIUM-2: `adjustments.ts` 独立冲突检查
- K13-CONFLICT-MEDIUM-3: `teaching-task/[id]/route.ts` inline room check
- K13-CONFLICT-MEDIUM-4: response shape 不统一

Fix-B 解决 K13-CONFLICT-MEDIUM-3。

## 3. 修复目标

将 `PUT /api/teaching-task/[id]` 中的 inline room conflict check 改为复用 `checkScheduleConflicts`，并在 updateMany 前做 pre-update check，避免半写入风险。

## 4. 修改范围

| 文件 | 变更类型 |
|------|----------|
| `src/app/api/teaching-task/[id]/route.ts` | inline check → 共享 helper pre-update check |
| `scripts/audit-schedule-conflict-check-unification.ts` | 更新（检测 shared helper 复用） |
| `scripts/verify-schedule-conflict-check-unification-fix-b.ts` | 新增（39 项检查） |
| `docs/k13-schedule-conflict-check-unification-fix-b.md` | 新增 |

未修改：
- `src/lib/schedule/conflict-check.ts`（无需兼容调整）
- `src/lib/conflict.ts`（仍被 solver/adjustments 共享使用）
- 任何业务逻辑、权限、API method

## 5. teaching-task route 原 inline check 说明

原 route 在 `tx.scheduleSlot.updateMany` **之后**内联做 room conflict check：
- 使用 `checkWeekOverlap` + `WeekConstraint` 独立判断 week overlap
- `tx.scheduleSlot.findMany({ where: { id: { not: slot.id }, dayOfWeek, slotIndex, roomId, semesterId? } })` 查询房间占用
- 冲突时 throw `Error({ message: '教室冲突', conflicts: [...] })` → catch 返回 409

## 6. 共享 helper 复用说明

- 改为调用 `checkScheduleConflicts`（来自 `@/lib/schedule/conflict-check`）
- 移除 `import { checkWeekOverlap, WeekConstraint } from '@/lib/conflict'`
- 对每个受影响 slot 调用一次 helper：
  ```ts
  await checkScheduleConflicts({
    scheduleSlotId: slot.id,   // exclude self
    teachingTaskId: taskId,    // 用于派生 week/teacher/classGroup
    targetDayOfWeek: slot.dayOfWeek,
    targetSlotIndex: slot.slotIndex,
    targetRoomId: roomId,
    semesterId: slot.semesterId ?? taskSemester?.semesterId ?? undefined,
  })
  ```
- 不在 route 内手写 week overlap 判断
- 不在 route 内复制 room conflict query
- 冲突 message 来自 helper 的 `conflicts` 数组

## 7. 受影响 slot 的检查策略

- 范围：`teachingTaskId === taskId` 的所有 ScheduleSlot
- 候选目标：`{ dayOfWeek: slot.dayOfWeek, slotIndex: slot.slotIndex, targetRoomId: newRoomId }`
- 排除自身：`scheduleSlotId: slot.id`
- semester scope：`slot.semesterId ?? taskSemester?.semesterId`

## 8. 事务 / 更新顺序说明

**关键改进：从 post-update 改为 pre-update**。

- 原顺序：`updateMany` → post-check → throw（半写入风险：若事务不严格，slots 已更新但 check 失败）
- 新顺序：pre-check（共享 helper）→ `updateMany`（若 pre-check 通过）
- 整个 PUT 仍在 `prisma.$transaction` 内，失败时事务回滚
- 即使 pre-check 失败，slots 不会被更新

## 9. API 行为兼容说明

- 权限：`requirePermission('data:write', request)` 保持
- HTTP status：409 保持（throw Error → catch → 409）
- 错误 body：`{ error: '教室冲突', conflicts: [...] }` 保持
- 成功响应：`ScheduleViewData[]`（同 K11）
- PUT method 保持
- room 变更合法时仍返回 200 + 更新后数据
- non-room 字段（courseName / teacherId / weekType / startWeek / endWeek / remark / classGroupIds）更新行为保持

## 10. 验证命令与结果

| 命令 | 结果 |
|------|------|
| `npx.cmd tsx scripts/verify-schedule-conflict-check-unification-fix-b.ts` | 39 PASS / 0 FAIL |
| `npx.cmd tsx scripts/verify-schedule-conflict-check-unification-fix-a.ts` | 53 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-schedule-conflict-check-unification.ts` | HIGH 0 / MEDIUM 2 / LOW 3 / NONE 4 |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH 0 / MEDIUM 0 / LOW 3 |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23 PASS / 0 FAIL |
| `npm.cmd run build` | Compiled successfully |

## 11. audit 风险变化

| Risk ID | Fix-B 前 | Fix-B 后 |
|---------|----------|----------|
| K13-CONFLICT-NONE-1 | NONE | NONE |
| K13-CONFLICT-MEDIUM-1 | NONE | NONE |
| K13-CONFLICT-MEDIUM-2 | MEDIUM | MEDIUM（未触及） |
| K13-CONFLICT-MEDIUM-3 | **MEDIUM** | **NONE** |
| K13-CONFLICT-MEDIUM-4 | MEDIUM | MEDIUM（response shape） |
| K13-CONFLICT-LOW-1 | LOW | LOW |
| K13-CONFLICT-LOW-2 | LOW | LOW |
| K13-CONFLICT-LOW-3 | LOW | LOW（实现列表已更新） |
| K13-CONFLICT-NONE-2 | NONE | NONE |

**核心结果**：
- `K13-CONFLICT-MEDIUM-3` 降级为 NONE
- MEDIUM 总数从 3 降到 2
- 复用 shared helper 的实现：3（conflict-check / slot-mutation-guard / teaching-task）

## 12. 剩余风险

- K13-CONFLICT-MEDIUM-2: `adjustments.ts` 仍独立冲突检查（effective schedule scope 差异，复用需谨慎）
- K13-CONFLICT-MEDIUM-4: response shape 三套不同（mutation guard string[] / adjustment typed[] / solver ScoreDetail）

## 13. 未处理范围（按设计）

- 不处理 adjustments.ts
- 不设计 typed conflict response shape
- 不修改 solver / LAHC hard scoring
- 不修改 frontend moveSlot
- 不修改 /api/conflict-check response shape
- 不修改 slot-mutation-guard.ts 安全边界
- 不修改 RBAC
- 不修改 Prisma schema

## 14. 下一阶段建议

候选：
- K13-FIX-C: 让 `adjustments.ts:dryRunScheduleAdjustment` 复用 `checkScheduleConflicts`（K13-CONFLICT-MEDIUM-2）。需注意：adjustment 使用 effective schedule（应用历史 adjustment 后的 schedule），与直接 slot mutation guard 的基线 scope 不同。需评估复用方案是否影响语义。
- K13-FIX-D: 统一 response shape 为 typed conflict（K13-CONFLICT-MEDIUM-4）。需修改 /api/conflict-check、slot-mutation-guard、teaching-task、adjustments 全部 response，跨多个调用方，影响面较大。
