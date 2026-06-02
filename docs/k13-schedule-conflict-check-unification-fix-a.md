# K13-SCHEDULE-CONFLICT-CHECK-UNIFICATION-FIX-A

## 1. 阶段名

K13-SCHEDULE-CONFLICT-CHECK-UNIFICATION-FIX-A

## 2. 当前背景

K13 audit（commit `4956564`）识别出 4 项 MEDIUM / 3 项 LOW。最大风险：

- `K13-CONFLICT-MEDIUM-1`：`slot-mutation-guard.ts:checkConflictsAtTarget` 与 `/api/conflict-check:checkScheduleConflict` 两套独立 query 逻辑，存在长期漂移风险。

K12 client preflight 调用 `/api/conflict-check`。K11 server guard 调用 `slot-mutation-guard.ts`。两端规则不同步是本阶段唯一目标。

## 3. 修复目标

让 `/api/conflict-check` 与 `slot-mutation-guard.ts` 共用同一 conflict check 实现。

## 4. 修改范围

| 文件 | 变更类型 |
|------|----------|
| `src/lib/schedule/conflict-check.ts` | 新增（共享 helper） |
| `src/lib/conflict-check.ts` | 删除（重复实现） |
| `src/app/api/conflict-check/route.ts` | 改为调用共享 helper |
| `src/lib/schedule/slot-mutation-guard.ts` | 移除独立 query，改为调用共享 helper |
| `scripts/audit-schedule-conflict-check-unification.ts` | 更新（检测 shared helper 复用） |
| `scripts/verify-schedule-conflict-check-unification-fix-a.ts` | 新增（53 项检查） |
| `scripts/verify-schedule-mutation-client-preflight-fix.ts` | 路径更新 |

## 5. 共享 conflict helper 位置

- 文件：`src/lib/schedule/conflict-check.ts`
- 导出函数：`checkScheduleConflicts(input: ScheduleConflictCheckInput): Promise<ScheduleConflictCheckResult>`
- 输入类型：`ScheduleConflictCheckInput`（`scheduleSlotId? / teachingTaskId? / teacherId? / classGroupIds? / movingWeek? / targetDayOfWeek / targetSlotIndex / targetRoomId / semesterId?`）
- 输出类型：`ScheduleConflictCheckResult`（`{ hasConflict: boolean, conflicts: string[] }`）
- 依赖：仅 `prisma`（read-only）+ `@/lib/conflict.checkWeekOverlap`
- 不依赖 `NextRequest` / `NextResponse`
- 不写数据库

## 6. /api/conflict-check 改造

- 改为调用 `checkScheduleConflicts`
- request body 保持：`{ scheduleSlotId, targetDayOfWeek, targetSlotIndex, targetRoomId, semesterId? }`
- response shape 保持：`{ hasConflict, conflicts: string[] }`
- `resolveSchedulerSemester` 解析逻辑保持
- 错误处理（`SEMESTER_NOT_FOUND` / `NO_ACTIVE_SEMESTER` / `MULTIPLE_ACTIVE_SEMESTERS`）保持
- 证据：`src/app/api/conflict-check/route.ts`

## 7. slot-mutation-guard.ts 改造

- 改为调用 `checkScheduleConflicts`
- 移除内部 `checkConflictsAtTarget` 函数（约 100 行重复 query 逻辑）
- 移除对 `@/lib/conflict` 的直接 import（改由 shared helper 间接使用 `checkWeekOverlap`）
- 保留：
  - slot / task 存在性检查
  - `slot.semesterId` 与 `task.semesterId` 关系检查
  - `resolveSchedulerSemester` 调用 + 跨 semester 拒绝
  - `SlotMutationGuardResult` 错误结构（`{ ok, error?, status?, conflicts?, semesterId? }`）
  - `guardSlotUpdate / guardSlotCreate / guardAdminSlotUpdate / guardAdminSlotCreate` 四个公开函数签名
  - HTTP 状态码：404 / 400 / 403 / 409
- 证据：`src/lib/schedule/slot-mutation-guard.ts`

## 8. 验证命令与结果

| 命令 | 结果 |
|------|------|
| `npx.cmd tsx scripts/verify-schedule-conflict-check-unification-fix-a.ts` | 53 PASS / 0 FAIL |
| `npx.cmd tsx scripts/audit-schedule-conflict-check-unification.ts` | HIGH 0 / MEDIUM 3 / LOW 3 / NONE 3 |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH 0 / MEDIUM 0 / LOW 3 |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23 PASS / 0 FAIL |
| `npm.cmd run build` | Compiled successfully |

## 9. audit 风险变化

| Risk ID | Fix-A 前 | Fix-A 后 |
|---------|----------|----------|
| K13-CONFLICT-NONE-1 | NONE | NONE |
| K13-CONFLICT-MEDIUM-1 | **MEDIUM** | **NONE** |
| K13-CONFLICT-MEDIUM-2 | MEDIUM | MEDIUM（未触及，留给后续） |
| K13-CONFLICT-MEDIUM-3 | MEDIUM | MEDIUM（未触及，留给后续） |
| K13-CONFLICT-MEDIUM-4 | MEDIUM | MEDIUM（response shape） |
| K13-CONFLICT-LOW-1 | LOW | LOW |
| K13-CONFLICT-LOW-2 | LOW | LOW |
| K13-CONFLICT-LOW-3 | LOW | LOW（实现列表已更新） |
| K13-CONFLICT-NONE-2 | NONE | NONE |

**核心结果**：`K13-CONFLICT-MEDIUM-1` 已从 MEDIUM 降级为 NONE。MEDIUM 总数从 4 降到 3。

## 10. 剩余风险

- K13-CONFLICT-MEDIUM-2: `adjustments.ts` 仍有独立 conflict check
- K13-CONFLICT-MEDIUM-3: `teaching-task/[id]/route.ts` 仍有 inline room check
- K13-CONFLICT-MEDIUM-4: response shape 三套不同

## 11. 未处理范围（按设计）

- 不处理 schedule adjustment 的冲突检查统一
- 不处理 `PUT /api/teaching-task/[id]` inline room check
- 不统一 solver / LAHC hard scoring
- 不设计新的 typed conflict response shape
- 不修改前端 preflight 逻辑
- 不修改 conflict-check API 对外契约
- 不修改 RBAC
- 不修改 Prisma schema
- 不运行 db push / migrate / reset

## 12. 下一阶段建议

推荐进入 K13-Fix-B，候选：
- K13-FIX-B: 让 `teaching-task/[id]/route.ts` 的 inline room check 复用 `checkScheduleConflicts`（K13-CONFLICT-MEDIUM-3）
- 或 K13-FIX-C: 让 `adjustments.ts:dryRunScheduleAdjustment` 复用 `checkScheduleConflicts`（K13-CONFLICT-MEDIUM-2；需注意 effective schedule scope 差异）

K11 / K12 / K13 三阶段服务端 client preflight 与 server guard 全部统一，残留 MEDIUM 主要是 adjustment / teaching-task 路径和 response shape。
