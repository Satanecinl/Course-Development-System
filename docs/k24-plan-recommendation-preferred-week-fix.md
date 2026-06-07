# K24-A3 Preferred-Week-First Priority Fix

**Stage**: `K24-A3-PLAN-RECOMMENDATION-PREFERRED-WEEK-PRIORITY-FIX`
**Date**: 2026-06-07
**K24-A2 commit baseline**: `3a832fd`
**K24-A3 status**: **FIXED** (requires re-verification of K24 one-click flow)

---

## 1. Bug Description

**场景**：用户选择"优先调课至第 13 周"。

**现象**：一键推荐结果列表中第 12 / 15 周方案排在前面，第 13 周方案不在 top 5 中，或被截断。用户误以为第 13 周没有可用方案。

**预期**：第 13 周方案优先展示；其他周只能作为备选；如果第 13 周无可用方案，应明确说明。

---

## 2. Root Cause

### 根因 1：全局排序 + limit 截断

K24-A helper 第 432-440 行：

```ts
plans.sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score
  ...
})
const top = plans.slice(0, limit)
```

所有周次方案**混合后**按 score 全局排序。`limit=5` 截断时，score 更高的 fallback 周方案可挤掉 preferredWeek 方案。

### 根因 2：preferredWeek 未参与排序

`preferredWeek` 仅作为搜索中心（`buildWeekList(centerWeek, weekWindow)`），在排序中没有优先级 — 没有 boost 也没有分桶。

### 根因 3：前端无分组

前端 `planResult.plans.map(...)` 直接渲染所有方案为一个平铺列表，无法区分首选周 / 备选周。

---

## 3. Fix Strategy

### 方法：分桶排序 + additive response shape

```ts
// K24-A3: 分桶
const preferredPlans = plans.filter((p) => p.targetWeek === centerWeek)
const fallbackPlans = plans.filter((p) => p.targetWeek !== centerWeek)

// 各自按 score 排序
preferredPlans.sort(sortByScore)
fallbackPlans.sort(sortByScore)

// 复合：preferred 在前，fallback 在后，cap at limit
const top = [...preferredPlans, ...fallbackPlans].slice(0, limit)
```

### 关键保证

| 保证 | 实现 |
|------|------|
| preferredWeek 方案不被挤出 | 分桶后 preferred 在前，limit 先填 preferred 再填 fallback |
| preferredWeek 有 8 个方案，limit=5 | 返回 5 个 preferred |
| preferredWeek 有 3 个，limit=5 | 返回 3 preferred + 2 fallback |
| preferredWeek 有 0 个，limit=5 | 返回 5 fallback + message "第 X 周暂无可用方案" |

### Additive response shape

每个 plan 新增：

```ts
{ isPreferredWeek: boolean }  // targetWeek === preferredWeek
```

Result 新增：

```ts
{
  preferredWeek: number,
  preferredWeekAvailable: boolean
}
```

Searched 新增：

```ts
{
  preferredWeek: number,
  preferredWeekPlanCount: number,
  fallbackPlanCount: number
}
```

### 前端分组展示

列表按 preferred / fallback 分组渲染：

- `首选周方案（第 13 周，3 个）` 分组标签（紫色边框）
- `备选周方案（2 个）` 分组标签（灰色边框）
- preferredWeek 无方案时：`第 13 周暂无可用方案，以下为邻近周备选方案`（amber 提示）
- 可滚动列表保留

---

## 4. why K24-A2 cross-week gate is preserved

- `taskActiveInTargetWeek` / `isTaskActiveInWeek` 逻辑**未改**
- 分桶逻辑在 K24-A2 gate **之后**执行（gate 在 room 循环内，分桶在循环外）
- K24-A2 verify 仍 **32/32 PASS**

---

## 5. why K24-A1 UX is preserved

- `preferredPlanWeek` 控件**未改**
- `showAdvancedTools` / `planListOpen` / `selectedPlanKey`**未改**
- "使用该方案" / 滚动容器**未改**
- K24-A1 UX markers 全部存在

---

## 6. Verification

### K24-A3 专项 verify

`scripts/verify-plan-recommendation-preferred-week-k24-a3.ts`:

**15 sections / 50 case**:
- A. helper 存在
- B. preferredWeek-first 分桶逻辑
- C. preferred plans 不被 limit 挤出
- D. result 含 preferredWeek summary
- E. plan 含 isPreferredWeek marker
- F. preferred plans 排在 fallback 前
- G. preferredWeek 无方案时明确 message
- H. 前端首选周 / 备选周标签
- I. 可滚动列表保留
- J. K24-A1 preferredPlanWeek 控件存在
- K. K24-A2 cross-week gate 存在
- L. score.ts 未改
- M. schema / DB 未改
- N. 无 DB 写入
- O. DB read-only integration

### Integration O section

- 选取真实 DB slot
- `preferredWeek = startWeek + 5`（跨周）
- `weekWindow = 1, limit = 5`
- 验证 `result.plans` 前段全是 `targetWeek === preferredWeek` 的方案
- 验证 `preferredWeekAvailable === true`（当有方案时）
- 验证 `isPreferredWeek` 标记正确

---

## 7. Unmodified Scope

| Item | 状态 |
|------|------|
| `src/lib/scheduler/score.ts` | ❌ NOT modified |
| solver algorithm | ❌ NOT modified |
| Prisma schema / migrations | ❌ NOT modified |
| `prisma/dev.db` | ❌ NOT written |
| K23-A `room-recommendations.ts` + API | ❌ NOT modified |
| `conflict-check.ts` / `conflict-rules.ts` | ❌ NOT modified |
| `adjustments.ts` / dry-run | ❌ NOT modified |
| RBAC permission model | ❌ NOT modified |
| K24-A2 cross-week self-conflict gate | ❌ NOT modified |
| recommendation ranking core | ❌ NOT modified (只是排序顺序调整) |

---

## 8. Follow-up

修复后 **需要重新做前端人工验证**。建议进入 K24-B-E2E-MANUAL-TRIAL。

---

**报告结束。K24-A3 preferredWeek-first 修复完成，需重新做前端人工验证。**
