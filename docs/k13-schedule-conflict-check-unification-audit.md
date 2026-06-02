# K13-SCHEDULE-CONFLICT-CHECK-UNIFICATION-AUDIT

## 1. 阶段名

K13-SCHEDULE-CONFLICT-CHECK-UNIFICATION-AUDIT

## 2. 审计日期

2026-06-02

## 3. 当前背景

K12-SCHEDULE-MUTATION-CLIENT-PREFLIGHT-FIX 已完成并关闭（commit `8707e9c`）。

K12 引入：
- `src/store/scheduleStore.ts` `moveSlot` 内部 preflight
- `src/components/schedule-grid.tsx` `handleDragEnd` 错误处理
- 验证脚本 + 文档

K11/K12 audit 最终：HIGH 0 / MEDIUM 0 / LOW 3。

LOW 风险中第 1 项是"两套或多套冲突检查实现可能漂移"。K13 专门审计此风险。

## 4. 审计范围

| 范围 | 状态 |
|------|------|
| `/api/conflict-check` (src/app/api/conflict-check/route.ts) | 已审计 |
| `src/lib/conflict-check.ts` (checkScheduleConflict) | 已审计 |
| `src/lib/schedule/slot-mutation-guard.ts` (checkConflictsAtTarget) | 已审计 |
| `src/lib/schedule/adjustments.ts` (dryRunScheduleAdjustment) | 已审计 |
| `src/app/api/teaching-task/[id]/route.ts` (inline post-update check) | 已审计 |
| `src/lib/scheduler/solver.ts` (findHardConflictParticipants / HC1-HC5) | 已审计 |
| `src/lib/scheduler/score.ts` (expandWeeks) | 已审计 |
| `src/lib/conflict.ts` (checkWeekOverlap / expandWeeks) | 已审计 |
| frontend preflight (K12 scheduleStore.ts / schedule-grid.tsx) | 已审计 |
| scripts/diagnose-*.ts (K9 HC1-HC5 诊断) | 仅引用，重复 |
| scripts/audit-*.ts (引用 conflict-check 检测 semester scoping) | 仅引用，重复 |

## 5. 审计方法

1. 静态源码扫描 `grep conflict|Conflict|checkWeekOverlap|...`
2. 读取所有 conflict-check 相关实现文件
3. 对比每套实现的：输入参数、输出结构、规则覆盖、week/semester/exclude 语义
4. 交叉对比前端 preflight 与服务端 guard 的契约

## 6. 冲突检查实现清单

| # | Implementation | File | Purpose | Caller |
|---|---|---|---|---|
| 1 | checkScheduleConflict | src/lib/conflict-check.ts | 通用 slot 移动预检 | /api/conflict-check |
| 2 | checkConflictsAtTarget | src/lib/schedule/slot-mutation-guard.ts | 写前 guard | PUT/POST /api/schedule-slot, /api/admin/[model] |
| 3 | dryRunScheduleAdjustment | src/lib/schedule/adjustments.ts | 调课预检 | POST /api/schedule-adjustments/dry-run |
| 4 | inline room check | src/app/api/teaching-task/[id]/route.ts | 教学任务批量改教室 | PUT /api/teaching-task/[id] |
| 5 | findHardConflictParticipants | src/lib/scheduler/solver.ts | LAHC 评分 | scheduler run |

## 7. /api/conflict-check 审计结论

- **输入**：`{ scheduleSlotId, targetDayOfWeek, targetSlotIndex, targetRoomId, semesterId? }`
- **输出**：`{ hasConflict: boolean, conflicts: string[] }`
- **覆盖规则**：teacher / classGroup / room / week overlap / semester scoped / exclude via `id: { not: scheduleSlotId }`
- **风险等级**：NONE
- **证据**：`src/app/api/conflict-check/route.ts` 调 `checkScheduleConflict`；`src/lib/conflict-check.ts` 三段独立 teacher/class/room 查询 + `checkWeekOverlap`；semester 通过 `resolveSchedulerSemester` 解析

## 8. slot-mutation-guard.ts 审计结论

- **输入**：`guardSlotUpdate(slotId, targetDayOfWeek, targetSlotIndex, targetRoomId)` / `guardSlotCreate(teachingTaskId, ...)` / `guardAdminSlotUpdate(slotId, data)` / `guardAdminSlotCreate(teachingTaskId, data)`
- **输出**：`SlotMutationGuardResult = { ok, error?, status?, conflicts?: string[], semesterId? }`
- **覆盖规则**：teacher / classGroup / room / week overlap（复用 `@/lib/conflict.checkWeekOverlap`）/ semester（通过 `resolveSchedulerSemester`）/ exclude via `id: { not: excludeSlotId }`
- **风险等级**：MEDIUM（K13-CONFLICT-MEDIUM-1）
- **证据**：`checkConflictsAtTarget` 内部独立实现 query 逻辑，与 `checkScheduleConflict` 查询方式完全独立；week overlap 共用 `@/lib/conflict`

## 9. schedule adjustment 审计结论

- **输入**：`ScheduleAdjustmentInput = { type, week, targetWeek?, originalSlotId, newDayOfWeek?, newSlotIndex?, newRoomId?, semesterId? }`
- **输出**：`ScheduleAdjustmentDryRunResult = { canApply, conflicts: ScheduleAdjustmentConflict[], warnings }`
- **覆盖规则**：teacher / classGroup / room / capacity（独有） / semester via `resolveSchedulerSemester` / week 通过 `isScheduleItemActiveInWeek`（基于 effective schedule 包含历史 adjustment）
- **风险等级**：MEDIUM（K13-CONFLICT-MEDIUM-2）
- **证据**：`dryRunScheduleAdjustment` 内联三段 `find` 查询 teacher/class/room；不调 `checkScheduleConflict`；不调 `checkWeekOverlap`（使用周次 filter）；capacity 独有检查

## 10. teaching-task/[id] inline check 审计结论

- **输入**：PUT body 中 `roomId`（教学任务的 roomId 变化）
- **输出**：HTTP 409 with `{ error: '教室冲突', conflicts: string[] }`
- **覆盖规则**：**仅 room**，不检查 teacher / classGroup / week overlap（复用 `checkWeekOverlap`）/ semester scoped
- **风险等级**：MEDIUM（K13-CONFLICT-MEDIUM-3）
- **证据**：`teaching-task/[id]/route.ts` lines 100-143 在 `updateMany` 后用 `for...of` 串行查询 room 冲突；无 teacher/class 检查；规则明显窄于 `/api/conflict-check`

## 11. scheduler / solver hard conflict 审计结论

- **输入**：`ScheduleState` + `SchedulingContext`
- **输出**：HC1 (room) / HC2 (teacher) / HC3 (class) / HC4 (capacity) / HC5 (availability) 评分
- **覆盖规则**：teacher / class / room / week overlap（via `expandWeeks`）/ capacity / availability
- **风险等级**：LOW（K13-CONFLICT-LOW-1）
- **证据**：`solver.ts:findHardConflictParticipants` 走 pair-wise 对比；`score.ts` 调 `expandWeeks`；HC1-HC5 scoring 仅用于 LAHC，不直接对外暴露为 API guard

## 12. week overlap / 周次语义审计结论

- **当前周次表示**：`WeekConstraint = { start, end, type: 'ALL' | 'ODD' | 'EVEN' | 'FIRST_HALF' | 'SECOND_HALF' | 'CUSTOM' }`
- **共享函数**：`src/lib/conflict.ts` 的 `checkWeekOverlap` 和 `expandWeeks`
- **复用情况**：
  - `src/lib/conflict-check.ts`：`checkWeekOverlap`
  - `src/lib/schedule/slot-mutation-guard.ts`：`checkWeekOverlap`
  - `src/lib/scheduler/score.ts`：`expandWeeks`
  - `src/lib/schedule/adjustments.ts`：`isScheduleItemActiveInWeek`（单周判断）
- **是否存在多套实现**：是（4 个入口），但底层都基于 `expandWeeks`
- **是否存在明显语义差异**：否
- **风险等级**：LOW（K13-CONFLICT-LOW-2）

## 13. frontend preflight 契约审计结论

- **输入**：`{ scheduleSlotId, targetDayOfWeek, targetSlotIndex, targetRoomId, semesterId? }`
- **输出**：`{ hasConflict, conflicts: string[] }` 解析为 thrown Error
- **覆盖规则**：与 `/api/conflict-check` 一致
- **风险等级**：NONE（K13-CONFLICT-NONE-2）
- **证据**：`src/store/scheduleStore.ts:103-126`；`src/components/schedule-grid.tsx:99-118`（UX 层 + 错误 toast）

## 14. 输入参数对比表

| Implementation | scheduleSlotId | targetDayOfWeek | targetSlotIndex | targetRoomId | semesterId | teachingTaskId | data |
|---|---|---|---|---|---|---|---|
| checkScheduleConflict | YES | YES | YES | YES | optional | - | - |
| guardSlotUpdate | YES | YES | YES | YES | (from slot) | (from slot) | - |
| guardSlotCreate | - | YES | YES | YES | (from task) | YES | - |
| guardAdminSlotUpdate | YES | (from data) | (from data) | (from data) | (from slot) | (from slot) | YES |
| dryRunScheduleAdjustment | (originalSlotId) | (newDayOfWeek) | (newSlotIndex) | (newRoomId) | YES | (from slot) | - |
| teaching-task inline | - | (slot's) | (slot's) | YES | (slot's) | (from route) | - |
| frontend preflight | YES | YES | YES | YES | optional | - | - |

## 15. 输出结构对比表

| Implementation | hasConflict | conflicts | conflicts shape | other fields |
|---|---|---|---|---|
| checkScheduleConflict | YES | YES | `string[]` | - |
| guardSlot* | (ok: boolean) | YES | `string[]` | error?, status?, semesterId? |
| dryRunScheduleAdjustment | (canApply: boolean) | YES | `ScheduleAdjustmentConflict[]` (typed: type/message/severity/relatedSlotIds) | warnings[] |
| teaching-task inline | - | YES | `string[]` | error: '教室冲突' |
| solver HC1-HC5 | (hardScore < 0) | (ScoreDetail[]) | (typed: type/pairKey/details) | softScore |

## 16. 规则覆盖对比表

| Implementation | Teacher | ClassGroup | Room | Week Overlap | Semester | Exclude Self | Capacity | Availability |
|---|---|---|---|---|---|---|---|---|
| /api/conflict-check | YES | YES | YES | YES | YES | YES | NO | NO |
| slot-mutation-guard | YES | YES | YES | YES | YES | YES | NO | NO |
| dryRunScheduleAdjustment | YES | YES | YES | via week filter | YES | partial | YES | NO |
| teaching-task inline | NO | NO | YES | YES | YES | YES | NO | NO |
| solver HC1-HC5 | YES | YES | YES | YES | NO | NO | YES | YES |

## 17. 风险清单

| Risk ID | Severity | Area | Description | Evidence | Recommendation |
|---|---|---|---|---|---|
| K13-CONFLICT-NONE-1 | NONE | /api/conflict-check | 存在并复用 checkScheduleConflict，规则完整 | checkScheduleConflict in conflict-check.ts:35 | N/A |
| K13-CONFLICT-MEDIUM-1 | MEDIUM | slot-mutation-guard.ts | checkConflictsAtTarget 与 checkScheduleConflict 查询逻辑独立复制 | slot-mutation-guard.ts:212-304; conflict-check.ts:35-216 | 将 checkConflictsAtTarget 抽离为共享 pure function 或直接复用 checkScheduleConflict |
| K13-CONFLICT-MEDIUM-2 | MEDIUM | adjustments.ts | 独立实现 teacher/class/room + capacity，不复用 checkScheduleConflict | adjustments.ts:281-322 | 复用 checkScheduleConflict 的核心查询逻辑；adjustment 的 effective schedule scope 是合法语义差异 |
| K13-CONFLICT-MEDIUM-3 | MEDIUM | teaching-task/[id] inline | 仅检查 room 冲突，规则窄于 /api/conflict-check | teaching-task/[id]/route.ts:100-143 | 调用 guardSlotUpdate 或 checkScheduleConflict |
| K13-CONFLICT-LOW-1 | LOW | solver HC1-HC5 | solver scoring 与 mutation guard 语义不同（额外 capacity/availability） | solver.ts:158-191 | 不需统一 |
| K13-CONFLICT-LOW-2 | LOW | week overlap | 4 个入口共享 expandWeeks/checkWeekOverlap，语义一致 | conflict.ts:18-59 | N/A |
| K13-CONFLICT-NONE-2 | NONE | frontend preflight | K12 契约与 /api/conflict-check 一致 | scheduleStore.ts:103-126 | N/A |
| K13-CONFLICT-MEDIUM-4 | MEDIUM | response shape | 3 套不同 shape：string[] / typed[] / ScoreDetail | conflict-check.ts:13-15; adjustments.ts:31-42; score.ts | 短期保留差异；长期可统一为 typed conflict |
| K13-CONFLICT-LOW-3 | LOW | implementation count | 32 处冲突相关代码在 9 个唯一文件 | grep result | 后续可考虑 1+2 合并 |

## 18. 是否建议进入统一实现 Fix 阶段

**是，建议进入 Fix 阶段。**

### 推荐统一路径

**短期（最小变更）**：
1. K14-FIX-A: 将 `slot-mutation-guard.ts:checkConflictsAtTarget` 改造为复用 `checkScheduleConflict`（`excludeSlotId=slotId`），消除独立 query 复制
2. K14-FIX-B: 将 `teaching-task/[id]/route.ts` inline room check 改为调 `checkScheduleConflict`（或 guardSlotUpdate 的简化版）
3. K14-FIX-C: 将 `adjustments.ts:dryRunScheduleAdjustment` 的 teacher/class/room 查询替换为复用 `checkScheduleConflict` 的核心查询；保留 adjustment 的 effective schedule scope 和 capacity 独有检查

**长期（API 演进）**：
- 统一 response shape 为 `{ hasConflict, conflicts: TypedConflict[] }`
- mutation guard 复用 solver 的 `findHardConflictParticipants` 底层纯函数（如果需要 capacity/availability 检查）

## 19. 推荐下一阶段名

K14-SCHEDULE-CONFLICT-CHECK-UNIFICATION-FIX（按 短期 K14-FIX-A / B / C 分阶段实施）

或：

K14-SCHEDULE-CONFLICT-CHECK-UNIFICATION-FIX-A（仅 fix slot-mutation-guard 复用 conflict-check），其余留到后续阶段
