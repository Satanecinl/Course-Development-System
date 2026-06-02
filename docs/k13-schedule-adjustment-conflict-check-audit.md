# K13-SCHEDULE-ADJUSTMENT-CONFLICT-CHECK-AUDIT

## 1. 阶段名

K13-SCHEDULE-ADJUSTMENT-CONFLICT-CHECK-AUDIT

## 2. 审计日期

2026-06-02

## 3. 当前背景

K13 Fix-B 已完成（commit `9a32c1b`）：

- shared `src/lib/schedule/conflict-check.ts:checkScheduleConflicts` 已被 3 个入口复用：
  - `/api/conflict-check`
  - `src/lib/schedule/slot-mutation-guard.ts`
  - `src/app/api/teaching-task/[id]/route.ts`
- K13 audit 剩余 MEDIUM：
  - K13-CONFLICT-MEDIUM-2: `adjustments.ts` 独立冲突检查
  - K13-CONFLICT-MEDIUM-4: response shape 不统一

本阶段只审计第 1 项：判断 `adjustments.ts` 是否可安全进入 Fix-C、Fix-C 应如何限定边界。

## 4. 审计范围

| 范围 | 文件 |
|------|------|
| 核心库 | `src/lib/schedule/adjustments.ts` |
| API 路由 | `src/app/api/schedule-adjustments/route.ts`（POST create / GET list） |
| API 路由 | `src/app/api/schedule-adjustments/dry-run/route.ts`（POST dry-run） |
| API 路由 | `src/app/api/schedule-adjustments/[id]/void/route.ts`（PATCH void） |
| 前端封装 | `src/lib/schedule/adjustment-client.ts` |
| 类型 | `src/types/schedule-adjustment.ts` |
| Schema | `prisma/schema.prisma` ScheduleAdjustment model |
| 共享 helper | `src/lib/schedule/conflict-check.ts`（对比用） |
| 工具 | `src/lib/conflict.ts`（checkWeekOverlap / expandWeeks） |
| 工具 | `src/lib/schedule/week-filter.ts`（isScheduleItemActiveInWeek） |
| 调用方 | `src/app/api/schedule/route.ts`（effective schedule） |
| 调用方 | `src/app/api/export/excel/route.ts`（effective schedule） |

## 5. 审计方法

- 只读源码扫描
- 不连接数据库
- 不写数据库
- 不修改任何业务文件
- 仅新增：
  - `scripts/audit-schedule-adjustment-conflict-check.ts`
  - 本文档

审计脚本对每个公开函数（dryRunScheduleAdjustment / createScheduleAdjustment / voidScheduleAdjustment / getEffectiveScheduleForWeek）的特征做正则检测，并对比 shared helper 的能力。

## 6. adjustment 相关文件清单

| 文件 | 主要导出 / handler | 角色 |
|------|--------------------|------|
| `src/lib/schedule/adjustments.ts` | `validateScheduleAdjustmentInput` | 输入校验（type / week / dayOfWeek / slotIndex） |
| `src/lib/schedule/adjustments.ts` | `getEffectiveScheduleForWeek` | 构造 effective schedule（应用 ACTIVE adjustment） |
| `src/lib/schedule/adjustments.ts` | `dryRunScheduleAdjustment` | 检查调整是否会产生 teacher/class/room/capacity 冲突 |
| `src/lib/schedule/adjustments.ts` | `createScheduleAdjustment` | 先 dry-run，再创建 ScheduleAdjustment 记录 |
| `src/lib/schedule/adjustments.ts` | `voidScheduleAdjustment` | 撤销 ACTIVE 调整（仅改 status=VOID，不改 slot） |
| `src/app/api/schedule-adjustments/route.ts` | GET / POST | 列表 / 创建（POST 需要 `confirmText: "CONFIRM_ADJUSTMENT"`） |
| `src/app/api/schedule-adjustments/dry-run/route.ts` | POST | 单独暴露 dry-run |
| `src/app/api/schedule-adjustments/[id]/void/route.ts` | PATCH | 撤销（需要 `confirmText: "VOID_ADJUSTMENT"`） |
| `src/lib/schedule/adjustment-client.ts` | `dryRunScheduleAdjustment` / `createScheduleAdjustment` / `voidScheduleAdjustment` | 前端 fetch 封装 |
| `src/types/schedule-adjustment.ts` | `ScheduleAdjustmentInput` / `ScheduleAdjustmentConflict` / `ScheduleAdjustmentDryRunResult` | 共享类型 |

## 7. dry-run 调课审计结论

| 项 | 结果 |
|------|------|
| 函数 | `src/lib/schedule/adjustments.ts:dryRunScheduleAdjustment`（line 185-340） |
| 输入 | `ScheduleAdjustmentInput { type, week, targetWeek?, originalSlotId, newDayOfWeek?, newSlotIndex?, newRoomId?, reason?, semesterId? }` |
| 入口 | `POST /api/schedule-adjustments/dry-run`（permission: `schedule:adjust`） |
| 同入口复用 | `createScheduleAdjustment` 内部调用 dryRun |
| 检查 teacher | YES（effective 内存比对） |
| 检查 classGroup | YES（effective 内存比对） |
| 检查 room | YES（effective 内存比对） |
| 检查 capacity | YES（studentCount 合计 vs room.capacity，severity=`warning`） |
| 检查 targetWeek | YES（通过 effective schedule，仅 targetWeek） |
| 检查 same-semester | YES（`originalSlot.semesterId !== semesterId` 拒绝跨学期） |
| 使用 effective schedule | YES（`getEffectiveScheduleForWeek(targetWeek, semesterId)`） |
| 独立 Prisma query | 是（originalSlot + duplicate active + effective schedule + room.findUnique） |
| 使用 `checkWeekOverlap` | NO（effective items 已应用周次过滤） |
| 可直接复用 `checkScheduleConflicts` | NO |
| 风险等级 | MEDIUM |

直接复用 shared helper 的阻碍：
1. helper 的数据源是原始 `ScheduleSlot`，dry-run 的数据源是 `effective schedule`（应用 ACTIVE adjustment 后）。两者范围不同。
2. helper 的 `movingWeek` 是整段 `WeekConstraint`，dry-run 的检查范围是单 `targetWeek`。把单周 targetWeek 喂给 helper 的 movingWeek，会误报所有 `startWeek..endWeek` 范围内的占用。
3. helper 不覆盖 capacity。

## 8. 真实调课审计结论

| 项 | 结果 |
|------|------|
| API route | `POST /api/schedule-adjustments`（permission: `schedule:adjust`） |
| 是否调用 dry-run | YES（`createScheduleAdjustment` 内部 await `dryRunScheduleAdjustment`） |
| 是否重复检查冲突 | NO（依赖 dry-run 结果） |
| 是否创建 ScheduleAdjustment | YES |
| 是否修改 ScheduleSlot | NO（slot 在源周移出，在目标周加入，由 effective schedule 体现） |
| 是否可能绕过 dry-run | NO（create 内部必走 dry-run） |
| 风险等级 | NONE |

真实调课完全依赖 dry-run，没有独立的冲突检查分支。这条链路没有规则漂移风险。

## 9. 撤销调课审计结论

| 项 | 结果 |
|------|------|
| API route | `PATCH /api/schedule-adjustments/[id]/void`（permission: `schedule:adjust`） |
| 是否恢复 original slot | NO（slot 物理未变；撤销 = 把 ScheduleAdjustment.status 改为 VOID，让 effective schedule 不再应用该调整） |
| 是否删除 adjusted slot | NO（无物理 adjusted slot） |
| 是否检查冲突 | NO |
| 是否依赖 adjustment-specific 语义 | YES（仅检查 status=ACTIVE、semester、originalSlot 存在） |
| 是否可复用 `checkScheduleConflicts` | 不需要（撤销不引入新占用） |
| 风险等级 | LOW |

撤销不重做冲突检查是合理设计：撤销 = 反向应用 adjustment，让 effective schedule 回到 dry-run 已验证的状态。冲突检查在创建时已完成。

## 10. targetWeek / 周次语义结论

| 项 | 结果 |
|------|------|
| 普通 slot 周次表示 | `TeachingTask { weekType, startWeek, endWeek }` + `WeekConstraint` 推导 |
| adjustment targetWeek 表示 | `ScheduleAdjustment.targetWeek: Int?`，`null` = 单周（同 sourceWeek） |
| 是否存在跨周调课 | YES（MOVE 支持 `sourceWeek → targetWeek`，两者可不同） |
| 是否与 `checkScheduleConflicts.movingWeek` 兼容 | NO（movingWeek 是整段周次，targetWeek 是单周） |
| 风险等级 | MEDIUM |

直接传 `targetWeek` 给 shared helper 的 `movingWeek` 会产生误判：例如 sourceWeek=6, targetWeek=6, 任务整段 1-16 周，helper 会扫描 1-16 周内的所有相关 slot，把不相关的 7-16 周占用也报告为冲突。

adjustment 的正确做法是先把 effective schedule 限定到 targetWeek，再在内存中比对 target 位置（day/slot）。

## 11. capacity 逻辑结论

| 项 | 结果 |
|------|------|
| 是否存在 capacity 检查 | YES（dry-run 路径） |
| capacity 检查位置 | `src/lib/schedule/adjustments.ts:325-337` |
| capacity 来源 | `task.taskClasses.reduce((sum, tc) => sum + (tc.classGroup.studentCount ?? 50), 0)` |
| 阈值 | `> room.capacity` |
| severity | `warning`（不阻塞 canApply=true） |
| 当前 `checkScheduleConflicts` 是否覆盖 | NO |
| 是否应保留在 adjustment 层 | YES |
| 风险等级 | MEDIUM |

capacity 是 adjustment 独有的规则，不应进入 shared helper（避免扩大 mutation guard 的语义）。如果未来要让 slot mutation guard 也覆盖 capacity，应在 helper 中显式添加 capacity 选项，不应通过复用 adjustment 实现达成。

## 12. same-semester guard 结论

| 项 | 结果 |
|------|------|
| dry-run 解析 semester | YES（`resolveSchedulerSemester`） |
| originalSlot semester 校验 | YES（拒绝跨学期） |
| effective schedule 作用域 | YES（semesterId 过滤） |
| create 重新 resolve | YES（避免外部传入错误 semesterId） |
| void 校验 adjustment.semesterId | YES |
| void 校验 originalSlot.semesterId === adjustment.semesterId | YES |
| 与 K10/K11 一致 | YES |
| 风险等级 | NONE |

## 13. 与 checkScheduleConflicts 能力对比表

| Capability | Adjustment Current Logic | checkScheduleConflicts | Reusable? | Notes |
|---|---|---|---|---|
| teacher conflict | YES（effective 内存比对） | YES（Prisma findMany + checkWeekOverlap） | 部分 | 数据源不同；调整 helper 复用策略时需保留 effective 内存层 |
| classGroup conflict | YES（effective 内存比对） | YES（Prisma findMany + checkWeekOverlap） | 部分 | 同上 |
| room conflict | YES（effective 内存比对） | YES（Prisma findMany + checkWeekOverlap） | 部分 | 同上 |
| week overlap | YES（effective 已在 targetWeek 过滤） | YES（checkWeekOverlap） | NO | 周次语义不同（targetWeek 单周 vs WeekConstraint 整段） |
| movingWeek | N/A | YES | NO | helper 用整段，adjustment 用单周 |
| targetWeek | YES（input 字段） | NO | NO | adjustment 独有 |
| semesterId 作用域 | YES（effective 过滤 + dry-run 校验） | YES（timeWhere.semesterId） | YES | 语义一致 |
| exclude self | YES（`targetWeek === sourceWeek && item.slotId === input.originalSlotId`） | YES（`id: { not: input.scheduleSlotId }`） | YES | 语义一致 |
| effective schedule | YES（getEffectiveScheduleForWeek） | NO | NO | adjustment 独有语义 |
| capacity | YES（warning severity） | NO | NO | adjustment 独有规则 |
| response shape | `ScheduleAdjustmentConflict { type, message, severity, relatedSlotIds }` | `string[]` | NO | K13-MEDIUM-4 关注；Fix-C 不动 |

## 14. 风险清单

| Risk ID | Severity | Area | Description | Evidence | Recommendation |
|---|---|---|---|---|---|
| K13-ADJUSTMENT-MEDIUM-1 | MEDIUM | dry-run 冲突逻辑 | dryRunScheduleAdjustment 实现独立 teacher/class/room 检查（effective 内存比对），未复用 shared helper | teacher=YES class=YES room=YES callsSharedHelper=NO | Fix-C 抽纯函数 `findConflictsInSchedule` 给 helper + dry-run 共享 |
| K13-ADJUSTMENT-MEDIUM-2 | MEDIUM | capacity | dry-run 检查 room capacity，helper 不覆盖；mutation guard 不强制 capacity | capacityInDryRun=YES helperExcludesCapacity=YES | 保留 capacity 在 adjustment 层，不进 helper |
| K13-ADJUSTMENT-MEDIUM-3 | MEDIUM | targetWeek vs movingWeek | adjustment 单周 targetWeek 与 helper 整段 WeekConstraint 不兼容 | targetWeek=YES helperExcludesTargetWeek=YES | 不直接传 targetWeek 给 helper；保留 effective 内存过滤 |
| K13-ADJUSTMENT-MEDIUM-4 | MEDIUM | effective schedule | dry-run 用 effective schedule，helper 用原始 slot，语义差异 | effectiveFnExists=YES helperExcludesEffective=YES | effective schedule 视为 adjustment 边界语义，必须保留 |
| K13-ADJUSTMENT-LOW-2 | LOW | void 语义 | void 不重做冲突检查 | noRecheck=YES | 保持现状（撤销不引入新占用） |
| K13-ADJUSTMENT-LOW-3 | LOW | 规则维护 | 两套实现文本逻辑相似但数据源不同 | adjustmentChecksTeacher=YES helperExists=YES | Fix-C 抽纯函数统一规则文本 |
| K13-ADJUSTMENT-NONE-1 | NONE | same-semester guard | 全链路有 semester 校验 | resolveSemester=YES origCheck=YES effectiveScoped=YES | 无需修改 |
| K13-ADJUSTMENT-NONE-2 | NONE | cancel 语义 | CANCEL 不做 teacher/class/room 检查（合理） | cancelEarlyReturn=YES | 无需修改 |
| K13-ADJUSTMENT-NONE-3 | NONE | 跨周调课 | MOVE 支持 sourceWeek → targetWeek 跨周 | moveCrossWeek=YES | 无需修改 |
| K13-ADJUSTMENT-NONE-4 | NONE | void 不改 slot | void 只改 status=VOID | originalSlotNotModified=YES | 无需修改 |
| K13-ADJUSTMENT-NONE-5 | NONE | create 链路 | create 必经过 dry-run，无独立冲突检查 | createCallsDryRun=YES apiDoesNotReRun=YES | 无需修改 |

## 15. Fix-C 是否建议进入

**Conditional Yes**。

直接复用 `checkScheduleConflicts` 不可行，原因：
1. effective schedule scope 不可直接套用 helper 的 Prisma findMany
2. targetWeek 单周语义与 movingWeek 整段语义冲突
3. capacity 是 adjustment 独有规则

推荐 Fix-C 策略：

1. **抽纯函数** `findConflictsInSchedule(targetDay, targetSlot, teacherId, classGroupIds, roomId, weekConstraint, items, excludeSlotId?)`：
   - 输入：目标位置 + 占用者身份 + 内存中的 items 数组
   - 输出：`{ hasConflict, conflicts: string[] }`（或 typed）
   - 纯函数，无 Prisma 依赖
2. **重构 shared helper**：
   - `checkScheduleConflicts` 改为先 Prisma findMany 拿 baseItems，再调用同款纯函数
   - 输出 shape 保持 `string[]`（不破坏 Fix-A 已建立的契约）
3. **dry-run 复用纯函数**：
   - 直接传入 effectiveItems（targetWeek 已应用）
   - 不再独立写 in-memory 循环
4. **capacity 保留在 adjustment 层**：
   - 不进入纯函数 / helper
5. **response shape 不动**：
   - dry-run 仍返回 typed `ScheduleAdjustmentConflict`
   - shared helper 仍返回 `string[]`
   - 统一 shape 留待 Fix-D

## 16. 不建议直接统一的部分

- effective schedule 的构造逻辑（getEffectiveScheduleForWeek）：仍是 adjustment 独有入口
- targetWeek 的单周过滤：保留在 effective schedule 构造时
- capacity 检查：保留在 dry-run 内
- ScheduleAdjustment 的 status 转换：与冲突检查无关
- 撤销调课的语义：不引入新占用，不做冲突检查

## 17. 验证命令与结果

| 命令 | 结果 |
|------|------|
| `npx.cmd tsx scripts/audit-schedule-adjustment-conflict-check.ts` | HIGH 0 / MEDIUM 4 / LOW 2 / NONE 5 |
| `npm.cmd run build` | （待运行） |
| `npm.cmd run lint` | （待运行） |

## 18. 未处理范围（按设计）

- 不修改 `adjustments.ts` 业务逻辑
- 不修改 `checkScheduleConflicts`
- 不修改 `/api/conflict-check`
- 不修改 `slot-mutation-guard.ts`
- 不修改 `teaching-task/[id]/route.ts`
- 不修改 solver / parser / importer / seed
- 不修改前端 moveSlot
- 不修改前端 adjustment dialog
- 不修改 RBAC
- 不修改 Prisma schema
- 不运行 db push / migrate / reset

## 19. 下一阶段建议

候选：

- `K13-FIX-C`: 让 `adjustments.ts:dryRunScheduleAdjustment` 抽/复用纯函数，与 shared helper 共享规则文本
  - 范围：纯函数抽取 + helper 重构（输入不破坏）+ dry-run 替换 in-memory 循环
  - 风险：MEDIUM（需重写 helper 内部以使用纯函数 + dry-run 调整）
  - 受益：消除 K13-ADJUSTMENT-MEDIUM-1 / K13-ADJUSTMENT-LOW-3
- 或 `K13-FIX-D`: 统一 response shape 为 typed conflict（K13-CONFLICT-MEDIUM-4 / K13-ADJUSTMENT-MEDIUM-5 共同关注）
  - 范围：影响 /api/conflict-check、slot-mutation-guard、teaching-task、adjustments 全部 response
  - 跨多个调用方，影响面大
  - 推荐放在 Fix-C 之后
