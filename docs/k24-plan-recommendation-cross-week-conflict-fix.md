# K24-A2 Cross-Week Self-Conflict Fix

**Stage**: `K24-A2-PLAN-RECOMMENDATION-CROSS-WEEK-CONFLICT-FIX`
**Date**: 2026-06-07
**K24-A1 commit baseline**: `60423dc`
**K24-A2 status**: **FIXED** (requires re-verification of K24 one-click flow)

---

## 1. Bug Description

**场景**：将第 8 周的某门课调到第 13 周。

**现象**：一键推荐方案优先推荐到第 13 周同课程、同星期、同节次、同教室的方案。但该课程在第 13 周本来就在同位置有课，这是 **hard self-conflict**。

**预期**：推荐结果不应返回任何与源 recurring slot 在目标周冲突的方案。rejectedSummary 应记录此类冲突。

---

## 2. Root Cause

### 根因 1: `scheduleSlotId` 全局排除（不论周）

`checkScheduleConflicts` (`conflict-check.ts:200`) 使用：

```ts
timeWhere.id = { not: input.scheduleSlotId }
```

把 source ScheduleSlot **全周排除** — 不区分源周 / 目标周。

### 根因 2: K24-A 未做 targetWeek-aware 拦截

K24-A plan helper 枚举 (week, day, slot) 后直接委托 K23-A room helper, 后者再调 `checkScheduleConflicts`。targetWeek **未参与**冲突判断（`checkScheduleConflicts` 只用 `movingWeek`，不接受 `targetWeek` 参数）。

### 根因 3: `dryRunScheduleAdjustment` 已正确处理但未复用

`adjustments.ts:289`：

```ts
if (targetWeek === sourceWeek && item.slotId === input.originalSlotId) return false
```

只在同周时排除 source slot；跨周不排除。但 K24-A **从未调用** `dryRunScheduleAdjustment` 做 final gate。

### 为什么第 13 周同位置被误推荐

1. 枚举到 (week=13, day=X, slot=Y)
2. K23-A room helper 调 `checkScheduleConflicts({ scheduleSlotId=sourceId, ... })`
3. `timeWhere.id = { not: sourceId }` 排除了 source ScheduleSlot (唯一的 recurring row)
4. 没有其他 row 在 (day=X, slot=Y) → conflict check passed
5. 返回 room candidates → 成为 plan
6. 但实际上 source task 在第 13 周仍 active，(day=X, slot=Y) 仍被占用 → **self-conflict**

---

## 3. Fix Strategy

### 方法：K24-A2 cross-week self-occupancy gate

在 K24-A plan helper 内部，对每个 `(targetWeek, targetDayOfWeek, targetSlotIndex)` **枚举后、K23-A room 查询前**，增加 week-aware self-occupancy 检查：

```ts
const taskActiveInTargetWeek = isTaskActiveInWeek(weekType, startWeek, endWeek, targetWeek)
if (taskActiveInTargetWeek) {
  const selfRow = await prisma.scheduleSlot.findFirst({
    where: {
      semesterId,
      teachingTaskId: slot.teachingTaskId,  // ← 按 teachingTaskId 查, 非 scheduleSlotId 全局排除
      dayOfWeek: targetDayOfWeek,
      slotIndex: targetSlotIndex,
    },
    select: { id: true },
  })
  if (selfRow) {
    rejected.teacherConflict += 1
    continue  // 跳过该时间的所有 room candidates
  }
}
```

**关键差异**：查询使用 `teachingTaskId`（按任务过滤）而非 `id: { not: sourceSlotId }`（全局排除）。当 task 在 targetWeek active 且该 task 有 base ScheduleSlot 在 (day, slot) 位置时，判定为 cross-week self-occupancy，直接跳过。

### 设计决策

| 决策 | 理由 |
|------|------|
| 不改 `checkScheduleConflicts` | 会影响 K23-A 66/66 和 K22-C 73/0/0/0 |
| 不改 `conflict-rules.ts` | K23-A 66/66 依赖 |
| 不改 `adjustments.ts` dry-run | 现有 dry-run 语义正确 |
| `isTaskActiveInWeek` 纯本地 helper | 避免循环 import, 逻辑与 `week-filter.ts` 一致 |
| rejectedSummary 走 `teacherConflict` | 语义上 closest match (同 task 同 teacher 同班级) |
| 不排除 source slotId | schema 里 source slot 就是 target-week occupancy 的 presence 信号 |

### 性能影响

- 每个 (week, day, slot) 一次额外 `prisma.scheduleSlot.findFirst` (~1ms)
- 90 时间点 × 1 查询 = 90 次小查询，总体增量 < 200ms
- 不改 K23-A room helper (仍保持原性能)

---

## 4. why K23-A is not affected

- `src/lib/schedule/room-recommendations.ts` **未修改**
- `src/app/api/schedule-adjustments/room-recommendations/route.ts` **未修改**
- `checkScheduleConflicts` **未修改**
- `conflict-rules.ts` **未修改**
- `adjustments.ts` **未修改**
- K23-A verify 仍 **66/66 PASS**
- K22-C 仍 **73/0/0/0**

---

## 5. why K24-A1 UX is preserved

- `showAdvancedTools` / `preferredPlanWeek` / `planListOpen` / `selectedPlanKey` / `overflow-y-auto` / "使用该方案" 全部 intact
- K24-A1 UX verify markers 全部存在
- K24-A verify 升级到 **149/149 PASS** (从 145 升 4 AD section)

---

## 6. Verification

### K24-A2 专项 verify

`scripts/verify-plan-recommendation-cross-week-conflict-k24-a2.ts`:

**12 sections / 32 case**:
- A. K24-A plan helper 存在
- B. K24-A2 fix markers 存在
- C. no global scheduleSlotId exclusion for target week (by teachingTaskId)
- D. targetWeek participates in the conflict check
- E. final cross-week gate marker exists (taskActiveInTargetWeek → rejected.teacherConflict → continue)
- F. DB integration: real cross-week self-occupancy (bugPlan=0, rejectedTeacherConflict≥1)
- G. K23-A room recommendation intact
- H. K24-A1 UX markers preserved
- I. score.ts NOT modified
- J. schema / migration / dev.db NOT modified
- K. K23-A helper / API not modified
- L. no DB writes

### Integration F section

- 选取一个跨多周的 teachingTask (startWeek≤4, endWeek≥12)
- 用其 source slot 作为 `scheduleSlotId`
- `preferredWeek = startWeek + 5`（跨周）
- `weekWindow = 0`
- 验证 bug case (同 day/slot 在 targetWeek) **不在** plans 里
- 验证 `rejectedSummary.teacherConflict ≥ 1`

---

## 7. Unmodified Scope

| Item | 状态 |
|------|------|
| `src/lib/scheduler/score.ts` | ❌ NOT modified |
| solver algorithm | ❌ NOT modified |
| Prisma schema / migrations | ❌ NOT modified |
| `prisma/dev.db` | ❌ NOT written |
| K23-A `room-recommendations.ts` | ❌ NOT modified |
| K23-A API route | ❌ NOT modified |
| `conflict-check.ts` / `conflict-rules.ts` | ❌ NOT modified |
| `adjustments.ts` / dry-run | ❌ NOT modified |
| RBAC permission model | ❌ NOT modified |
| K24-A1 UX (dialog) | ❌ NOT modified (K24-A2 only modifies plan helper) |
| recommendation ranking | ❌ NOT modified |

---

## 8. Follow-up

### 为什么需要重新人工验证

修复改变了推荐结果：原来被误推荐的跨周自冲突方案现在会被过滤。需人工确认：

1. 正常场景（同周调课）推荐结果是否不受影响
2. 跨周场景推荐结果是否正确过滤自冲突
3. rejectedSummary 能否帮助用户理解为什么方案少
4. K24-A1 UX（优先周次 / 可滚动列表 / 高级选项）仍正常工作

### 后续可选

- K24-B-PLAN-RECOMMENDATION-E2E-MANUAL-TRIAL: 重新做真实浏览器试用
- K24-C: 排序调优（如有真实反馈）
- K24-D: 性能优化（如有慢查询反馈）

---

**报告结束。K24-A2 cross-week self-conflict 已修复，需重新做前端人工验证。**
