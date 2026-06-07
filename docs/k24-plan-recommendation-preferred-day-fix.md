# K24-A5 Plan Recommendation Preferred-Day Priority Fix

**Stage**: `K24-A5-PLAN-RECOMMENDATION-PREFERRED-DAY-PRIORITY`
**Date**: 2026-06-07
**K24 closeout baseline commit**: `5d90921` (K24-PLAN-RECOMMENDATION-ACCEPTANCE-CLOSEOUT)
**K24-A5 status**: **FIXED** (requires re-verification of K24 one-click flow)

---

## 1. Requirement Description

在"一键推荐调课方案"优先设置区新增"优先星期"选择：

- 用户可选择"优先调课至第 X 周"（K24-A1 已有）
- 用户可选择"优先星期：自动匹配 / 周一 / 周二 / 周三 / 周四 / 周五"
- 默认"自动匹配"（保持 K24-A3 行为）
- 指定星期时：首选周 + 指定日 > 首选周 + 其他日 > 备选周

---

## 2. Default Behavior (自动匹配)

`preferredDayOfWeek = null`：

- K24-A3 行为完全保留：preferredWeek > fallbackWeek
- 不偏向具体星期

---

## 3. Day-Priority Behavior (指定星期)

`preferredDayOfWeek = 1..5` (周一..周五)：

- **首选日期** (preferredWeek + preferredDayOfWeek)：排前
- **同周其他日期** (preferredWeek + otherDay)：第二
- **备选周** (fallbackWeek, *)：最后

示例：

| preferredDayPlans | sameWeekOtherPlans | fallbackPlans | limit=5 | 实际返回 |
|---|---|---|---|---|
| 3 | 5 | 8 | 5 | 3 preferredDay + 2 sameWeekOther |
| 8 | 2 | 4 | 5 | 5 preferredDay |
| 0 | 4 | 5 | 5 | 4 sameWeekOther + 1 fallback + message "周X暂无可用方案" |

---

## 4. Three-Bucket Implementation

`src/lib/schedule/adjustment-plan-recommendations.ts`:

```ts
// Mark each plan with isPreferredWeek and isPreferredDay
for (const p of plans) {
  p.isPreferredWeek = p.targetWeek === centerWeek
  p.isPreferredDay = preferredDayOfWeek != null
    && p.targetWeek === centerWeek
    && p.targetDayOfWeek === preferredDayOfWeek
}

// 3-bucket partition (when preferredDayOfWeek set)
if (preferredDayOfWeek != null) {
  preferredDayPlans = plans.filter(p =>
    p.targetWeek === centerWeek && p.targetDayOfWeek === preferredDayOfWeek)
  sameWeekOtherDayPlans = plans.filter(p =>
    p.targetWeek === centerWeek && p.targetDayOfWeek !== preferredDayOfWeek)
  fallbackPlans = plans.filter(p => p.targetWeek !== centerWeek)
} else {
  // K24-A3 two-bucket (auto mode)
  sameWeekOtherDayPlans = plans.filter(p => p.targetWeek === centerWeek)
  fallbackPlans = plans.filter(p => p.targetWeek !== centerWeek)
}

// Composite: 3-bucket, capped at limit
const top = [...preferredDayPlans, ...sameWeekOtherDayPlans, ...fallbackPlans].slice(0, limit)
```

---

## 5. preferredDay 无方案 Message

```ts
} else if (preferredDayOfWeek != null && !preferredDayAvailable) {
  message = `第 ${centerWeek} 周${dayOfWeekLabel(preferredDayOfWeek)}暂无可用方案，以下为同周其他日期 / 邻近周备选方案`
}
```

---

## 6. Frontend Display

调课弹窗 "一键推荐调课方案" 区域：

```ts
<select aria-label="优先调课星期">
  <option value="">自动匹配</option>
  <option value="1">周一</option>
  <option value="2">周二</option>
  <option value="3">周三</option>
  <option value="4">周四</option>
  <option value="5">周五</option>
</select>
```

注：6/7 (周末) **不**在 dropdown 中（业务约束：建议不支持周末作为优先星期）。

plan list 三级分组：

```
首选日期方案（第 X 周 周一，3 个）  ← K24-A5
同周其他日期方案（5 个）            ← K24-A5
备选周方案（2 个）                  ← K24-A3 (保留)
```

---

## 7. 不破坏

| 阶段 | 标记 | 状态 |
|------|------|------|
| K24-A1 preferredPlanWeek / showAdvancedTools / overflow-y-auto | ❌ 未改 | 保留 |
| K24-A2 cross-week gate | ❌ 未改 | 保留 |
| K24-A3 preferredWeek-first | ⚠️ 扩展 | 3-bucket 包含 2-bucket (auto mode 仍 K24-A3) |
| K24-A4 time-slots [1..5] | ❌ 未改 | 保留 |
| K23-A room helper | ❌ 未改 | 66/66 保持 |
| K24 closeout status | ⚠️ 暂停 | K24-A5 后 K24 重新进入 trial, 关闭 K24 closeout |

---

## 8. Verification

### K24-A5 专项 verify: 60/60 PASS

`scripts/verify-plan-recommendation-preferred-day-k24-a5.ts`:

- A. Helper supports preferredDayOfWeek
- B. API route accepts preferredDayOfWeek
- C. Client fetch sends preferredDayOfWeek
- D. Frontend has 优先星期 control
- E. Plan list three-bucket grouping
- F. K24-A1/A2/A3/A4 markers preserved
- G. score.ts NOT modified
- H. Schema / DB NOT modified
- I. No DB writes
- J. DB read-only integration (auto + day 模式)

### K24-A verify: 179/179 PASS (从 167 升 12)

---

## 9. Unmodified Scope

| Item | 状态 |
|------|------|
| `src/lib/scheduler/score.ts` | ❌ NOT modified |
| solver algorithm | ❌ NOT modified |
| Prisma schema | ❌ NOT modified |
| Migration | ❌ NOT modified |
| `prisma/dev.db` | ❌ NOT written |
| K23-A room-recommendations helper | ❌ NOT modified (66/66) |
| K24-A1/A2/A4 markers | ❌ NOT modified |
| RBAC permission model | ❌ NOT modified |
| 调课 submit 语义 | ❌ NOT modified |
| 自动 apply 调课 | ❌ NOT introduced |

K24-A3 业务逻辑被 K24-A5 扩展（不是覆盖）：preferredPlans 变量名在 3-bucket 实现中保留，但 composite 现在是 3-way。auto 模式（preferredDayOfWeek=null）行为 100% 等同 K24-A3。

---

## 10. Follow-up

修复后 **需要重新做前端人工验证**。重点确认：

1. 自动匹配：与 K24-A3 行为完全一致（无回归）
2. 选择周一：周一方案排前
3. 周一无方案：提示"第 X 周周一暂无可用方案..."
4. K24-A1/A2/A3/A4 既有功能仍正常

### 后续

- K24-A 重新进入 trial, 关闭 K24 closeout → 重新进入 K24-PLAN-RECOMMENDATION-ACCEPTANCE-CLOSEOUT (使用最新 HEAD)

---

**报告结束。K24-A5 preferred-day priority 修复完成，需重新做前端人工验证。**
