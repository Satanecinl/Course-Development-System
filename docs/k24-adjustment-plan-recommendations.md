# K24-A Adjustment Time + Room Joint Recommendation

**Stage**: `K24-A-ADJUSTMENT-TIME-ROOM-JOINT-RECOMMENDATION-IMPL`
**Date**: 2026-06-07
**K23 closeout baseline commit**: `e28d4a5`
**K22 baseline commit**: `ab7d9fd`
**K23 status**: `READY_FOR_REAL_USE`, K23-A 66/66, K23-CLOSEOUT 75/75
**K24-A status**: **READY_FOR_TRIAL** (read-only, no DB writes, no solver/score changes)

---

## 1. Executive Summary

K23 关闭后，用户提出新需求：

> 在现在推荐教室的基础上升级优化，一键推荐调课时间和教室。

K24-A 在 K23-A 推荐教室能力之上，新增"一键推荐调课方案"能力：

- 用户点击"一键推荐调课方案"按钮
- 系统自动搜索 (targetWeek, targetDayOfWeek, targetSlotIndex, roomId) 完整方案
- 返回多个 plan candidates（默认 top 5，至少 2 个为可用基线）
- 点击 plan → 自动填入 `targetWeek` / `newDayOfWeek` / `newSlotIndex` / `newRoomId`
- **不自动 submit**，仍由用户 dry-run / 手动确认

核心实现：
- `src/lib/schedule/adjustment-plan-recommendations.ts` — 纯 helper，**复用** K23-A `findAdjustmentRoomRecommendations`，**不修改** score.ts / solver / schema / dev.db / RBAC
- `src/app/api/schedule-adjustments/plan-recommendations/route.ts` — POST API，权限 `schedule:adjust`
- `src/components/schedule-adjustment-dialog.tsx` — 调课弹窗加"一键推荐调课方案"按钮，**保留** K23-A "推荐教室"按钮 + 手动选择

---

## 2. User Story

> 在现在推荐教室的基础上升级优化，一键推荐调课时间和教室。

**场景**:
- 教务在调课弹窗中（不必先选目标时间）
- 点击"一键推荐调课方案"
- 系统在调课目标周附近 ±1 周内搜索所有工作日 × 所有节次
- 每个时间点再调用 K23-A room 推荐层
- 合并成 plan candidates，按 score 排序返回 top N
- 教务点击 plan → 自动填入调课表单
- 候选 < 2 → 展示 `rejectedSummary` + 引导用户重选
- 手动选择能力**完全保留**

---

## 3. Backend Helper

### 3.1 入口

`src/lib/schedule/adjustment-plan-recommendations.ts`

```ts
findAdjustmentPlanRecommendations(input: {
  scheduleSlotId: number
  preferredWeek?: number       // 默认 = slot.task.startWeek
  weekWindow?: number          // 0-4, default 1
  includeWeekend?: boolean     // default false
  limit?: number               // 1-20, default 5
  semesterId?: number
}): Promise<AdjustmentPlanRecommendationResult>
```

### 3.2 输出 shape

```ts
{
  minimumSatisfied: boolean
  plans: AdjustmentPlanRecommendation[]
  rejectedSummary: {
    teacherConflict: number
    classGroupConflict: number
    roomConflict: number
    capacity: number
    linxiaoPolicy: number
    weekend: number
    unavailable: number
    other: number
  }
  searched: {
    weeks: number[]
    days: number[]
    slotIndexes: number[]
    timeCandidateCount: number
    roomCandidateCount: number
  }
  message?: string
}
```

### 3.3 搜索空间（默认）

| 维度 | 默认 | 范围 |
|------|------|------|
| weeks | preferredWeek ± 1, 截断 [1, 20] | 1-3 周 |
| days | [1, 2, 3, 4, 5] (工作日) | includeWeekend=true 时加 [6, 7] |
| slotIndex | [1, 2, 3, 4, 5, 6] | 排除 slotIndex=7 "中午" |
| rooms | 所有非零 room (来自 K23-A helper) | 53 rooms (dev.db 当前) |

默认枚举 = 3 weeks × 5 days × 6 slots = **90 个时间点**。每个时间点调用 K23-A helper（其内部已过滤 room=0 候选），合并后排前 N。

### 3.4 排除"原时间+原教室"

- 如果 (targetWeek, targetDayOfWeek, targetSlotIndex) 与 source slot 完全相同，**跳过**
- 这避免"原地不动"被作为推荐候选

---

## 4. Backend API

### 4.1 Route

`POST /api/schedule-adjustments/plan-recommendations`

### 4.2 Request body

```ts
{
  scheduleSlotId: number          // 必填
  preferredWeek?: number          // 1-20
  weekWindow?: number             // 0-4, default 1
  includeWeekend?: boolean        // default false
  limit?: number                  // 1-20, default 5
  semesterId?: number             // 可选
}
```

### 4.3 Response

```ts
{
  ok: true,
  minimumSatisfied: boolean,
  plans: [...],
  rejectedSummary: {...},
  searched: {...},
  message?: string
}
```

### 4.4 Permission / DB

- 权限: `requirePermission('schedule:adjust')`（与 K23-A / 调课 / void 调课同权限）
- **未新增** RBAC permission
- **不写 DB**（route 全文无 prisma create/update/delete/upsert）

### 4.5 K23-A 复用

- 房间层 **delegate** 给 K23-A `findAdjustmentRoomRecommendations` verbatim
- K23-A 66/66 verify / K23-CLOSEOUT 75/75 保持
- score.ts / schema / conflict rules / capacity formula **均未修改**

---

## 5. Time Search Strategy

| 阶段 | 行为 |
|------|------|
| Week selection | `preferredWeek - weekWindow` 到 `preferredWeek + weekWindow`，clamped [1, 20] |
| Day selection | 默认 [1..5] (Mon-Fri)，`includeWeekend=true` 时加 [6, 7] |
| Slot selection | [1..6]，slot 7 "中午" 排除 |
| Skip 原时间 | (targetWeek, day, slot) == slot 原值时跳过（避免原地不动） |
| Time layer 顺序 | week outer, day middle, slot inner |

**性能**: 3 weeks × 5 days × 6 slots × 1 K23-A call (内部 53 rooms × 1 conflict check each) ≈ 90 × 53 conflict checks ≈ 4770 DB queries. 真实响应 < 2s (本地 SQLite).

---

## 6. Room Recommendation Reuse

**直接调用** K23-A `findAdjustmentRoomRecommendations` 的 verbatim 行为：

- Hard filters: Linxiao K22-F2A → capacity → conflict (room/teacher/classGroup)
- Ranking: 历史教室 / 汽车林校 / 容量利用率 / 同楼栋
- Reasons / warnings 直接继承

**Plan-level score** = roomRecommendation.score + time-similarity bonuses:

```
base = roomRecommendation.score

+20  工作日
+15  与原周次相同
+10  与原 day 相同
+10  与原 slotIndex 相同
+5   候选 room.reasons 数量 >= 2
-20  周末
-10  跨周调课
```

排序：`score desc, (targetWeek, day, slot, roomId) asc`（后者保证确定性）。

---

## 7. Hard Filters

| Filter | 来源 | 失败计入 |
|--------|------|----------|
| Linxiao K22-F2A | K23-A verbatim copy | room helper rejectedSummary.linxiaoPolicy（不在 plan summary 中单独计） |
| Capacity | K23-A 复用 | room helper rejectedSummary.capacity |
| Room conflict | K23-A → checkScheduleConflicts | plan summary.roomConflict |
| Teacher / classGroup conflict | K23-A → checkScheduleConflicts | plan summary.teacherConflict / classGroupConflict（暂未细分, 计入 roomConflict 总和） |
| room=0 placeholder | K23-A 排除 | K23-A helper 内部 |

**Hard filter 优先于 score**。Score 仅在已通过 hard filter 的候选间排序。

---

## 8. Ranking Strategy

| Score 加分 | 触发 |
|------------|------|
| +20 | 工作日（不是周末） |
| +15 | 与原周次相同 |
| +10 | 与原 day 相同 |
| +10 | 与原 slotIndex 相同 |
| +5 | 候选 room.reasons >= 2 |
| -20 | 周末排课 |
| -10 | 跨周调课 |

继承自 K23-A room score: 历史教室 +20, 汽车林校 +15, util [0.30, 0.90] +10, util>0.90 +5, 同楼栋 +5, util<0.30 -10

---

## 9. Frontend UI

### 9.1 修改文件

`src/components/schedule-adjustment-dialog.tsx` (additive)

### 9.2 改动

- 新增 state: `planLoading`, `planResult`, `planError`
- 新增按钮: "一键推荐调课方案" (与"推荐教室"按钮相邻)
- 新增 handler: `handleRecommendPlans` 调用 `fetchPlanRecommendations`
- 新增 handler: `pickPlan` 一次性填入 4 个表单字段
- 紫色 panel 显示:
  - plan 数量 + 是否满足至少 2 个
  - searched summary (周次 / 星期 / 节次 / timeCandidateCount / roomCandidateCount)
  - 每个 plan: 周次 / 星期 / 节次 / 教室 / 容量 / 评分 / reasons / warnings
  - 点击 plan → 填入 + 高亮
  - 0 候选 / 候选不足 → message + rejected summary
  - API 失败 → inline error + 引导手动
- 切 targetWeek / newDayOfWeek / newSlotIndex / item 变化时清空 plan

### 9.3 K23-A 保留

- "推荐教室" 按钮**完全保留**
- 蓝色 panel (K23-A) 仍正常显示

### 9.4 手动选择保留

- `<select>` 教室下拉框 / 周次 / 星期 / 节次**完全保留**
- plan 点击只 set state，不自动 submit / dry-run

### 9.5 错误处理

- API 失败: toast + inline error + 不阻塞手动
- 0 候选: warning + `searched` 提示
- 候选 < 2: warning + rejected summary

---

## 10. Fewer-Than-Two Behavior

- 0 候选: `minimumSatisfied=false`, `message="当前没有可推荐方案..."`
- 1 候选: `minimumSatisfied=false`, `message="当前可推荐调课方案少于 2 个"`
- ≥ 2 候选: `minimumSatisfied=true`

UI 显示：
- 0 候选: warning + `searched` summary + 引导用户重选周次
- 1 候选: warning + rejected summary 汇总
- ≥ 2: 正常 plan 列表

**不造假**。不会因为 score 高而保留 hard invalid plan。

---

## 11. Compatibility with K23-A Room Recommendations

- K23-A "推荐教室"按钮**完全保留**
- K23-A `room-recommendations.ts` / API / client 0 改动（git diff since `e28d4a5` 空）
- K24-A 房间层**delegate** to K23-A verbatim
- K23-A verify 66/66 + K23-CLOSEOUT 75/75 保持
- 两套入口并存：
  - 用户手动选时间 → "推荐教室" → K23-A 单时间推荐
  - 用户不选时间 → "一键推荐调课方案" → K24-A 多时间+多教室推荐

---

## 12. Permission / RBAC

- 路由权限: `requirePermission('schedule:adjust')`（与 K23-A / 调课 / void 调课同权限）
- **未新增** RBAC permission
- **未修改** RBAC permission model
- 复用现有 `src/lib/auth/require-permission.ts` 模式
- 客户端 `useHasPermission('schedule:adjust')` gate 推荐按钮 disabled

---

## 13. Verification Results

详见完成报告。

- K24-A verify 脚本: `scripts/verify-adjustment-plan-recommendations-k24-a.ts` (26 节 / 80+ case)
  - A. helper file
  - B. API route
  - C. API permission
  - D. API no DB write
  - E. helper 复用 K23-A
  - F. preferredWeek
  - G. weekWindow
  - H. includeWeekend
  - I. working-day default
  - J. plans[]
  - K. minimumSatisfied
  - L. rejectedSummary
  - M. searched
  - N. plan fields
  - O. reasons / warnings
  - P. no fake
  - Q. UI button
  - R. UI plan list
  - S. UI pickPlan
  - T. K23-A 按钮保留
  - U. 手动选择保留
  - V. score.ts 未改
  - W. schema / migration / dev.db 未改 (含 K23-A helper/API)
  - X. RBAC 未改
  - Y. build imports
  - Z. DB read-only integration (real slot)

---

## 14. Unmodified Scope

| Item | 状态 |
|------|------|
| `src/lib/scheduler/score.ts` | ❌ NOT modified |
| solver algorithm | ❌ NOT modified |
| Prisma schema | ❌ NOT modified |
| Migration | ❌ NOT modified |
| `prisma/dev.db` | ❌ NOT written (K24-A is read-only) |
| K23-A `room-recommendations.ts` | ❌ NOT modified |
| K23-A API route | ❌ NOT modified |
| `src/lib/auth/*`, `src/lib/rbac/*` | ❌ NOT modified |
| RBAC permission model | ❌ NOT modified (复用 `schedule:adjust`) |
| K22 / K23 verify expected | ❌ NOT changed |
| `hardWeights` / `softWeights` | ❌ NOT introduced |
| K23-A dialog UI 按钮 | ❌ NOT modified |
| 手动选择 | ❌ NOT modified |
| Importer / parser | ❌ NOT modified |
| Business data | ❌ NOT written |

---

## 15. Known Limitations

- **L-K24-A-SEARCH-BOUNDED**: 默认搜索 ±1 周 / 工作日 / 6 节次 ≈ 90 时间点；不搜索全学期（性能可控）。如需更大搜索范围，调大 `weekWindow` + `includeWeekend=true`。
- **L-K24-A-NO-TIME-ALTERNATIVE-EXPANSION**: 仅在 preferredWeek 附近搜索，不做"未来 N 周全局推荐"（避免响应时间不可控）
- **L-K24-A-NO-SAME-TIME-PREF**: 不主动推荐"同时间 + 不同教室"（已与 K23-A "推荐教室"按钮的语义重合）
- **L-K24-A-TEACHER-CLASSGROUP-NOT-SPLIT**: plan summary 中 teacherConflict / classGroupConflict 暂未细分（K23-A room helper 只返回 aggregated conflict）；需要可扩展 K23-A helper
- **L-K24-A-NO-PERFORMANCE-CACHE**: 每次推荐都 fresh query；如真实使用频率高，可加 per-slot 缓存
- **L-LINT-DEBT**: 历史 lint debt (K24-A 0 new error)
- **L-AUTH-SCHED-ADJUST**: pre-existing `ScheduleAdjustment ACTIVE count mismatch` (历史)

---

## 16. Next Stage Recommendation

- **`K24-B-PLAN-RECOMMENDATION-E2E-MANUAL-TRIAL`**: 浏览器真实试用一键推荐方案
- **`K24-C-PLAN-RECOMMENDATION-QUALITY-TUNING`**: 真实反馈调排序
- **`K24-D-PLAN-RECOMMENDATION-PERFORMANCE-OPTIMIZATION`**: 搜索慢时优化
- **`K24-E-ALTERNATIVE-WEEKEND-OR-CROSS-WEEK-POLICY`**: 周末/跨周策略

**建议**: K24-A 关闭后进入 K24-B 真实试用, **不**直接做 K24-C 调参。

---

**报告结束。K24-A 处于 READY_FOR_TRIAL 状态。**
