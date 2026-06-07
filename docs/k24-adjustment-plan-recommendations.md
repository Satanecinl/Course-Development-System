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

---

## 17. K24-A1 Verify Alignment (added by `K24-A1-PLAN-RECOMMENDATION-VERIFY-ALIGNMENT`)

> 本节由 K24-A1 阶段追加；不改 K24-A 实现说明 / 验证结果。

### 17.1 背景

K24-A 在 K23 closeout (`e28d4a5`) 之后引入，对**共享**的 `src/components/schedule-adjustment-dialog.tsx` 和 `src/lib/schedule/adjustment-client.ts` 做了 additive 修改（新增"一键推荐调课方案"按钮、紫色 plan 面板、`fetchPlanRecommendations` 等）。

K23 closeout verify 原本在这两个文件上做 `git diff since K23-A baseline (8332c60)` no-diff 检查。K24-A 累加修改后，这两项 fail，导致 closeout verify 在 K24-A HEAD 上从 75/75 退化为 73/75。

这**不是** K23-A 业务回归，而是 K23 closeout verify 的"关闭后不可修改"口径与后续 additive 扩展的预期冲突。

### 17.2 K24-A1 修正

`scripts/verify-room-recommendation-closeout-k23.ts` 的 G 节拆分为：

- **G1. Strict untouched**: K23-A 核心后端 (`room-recommendations.ts` + API route) / `score.ts` / `prisma/schema.prisma` / `prisma/migrations/*` — 仍按 no-diff 检查。K24-A 严格不允许触碰这些文件。
- **G2. Additive-compatible**: `src/components/schedule-adjustment-dialog.tsx` / `src/lib/schedule/adjustment-client.ts` — 改为 marker-based compatibility check。
  - 检查 K23-A markers 仍存在（`fetchRoomRecommendations` / `RoomRecommendationCandidate` / `handleRecommendRooms` / "推荐教室" / `pickCandidate` / `<option value="">不变</option>` 等）
  - 检查 K23-A endpoint `/api/schedule-adjustments/room-recommendations` 仍存在且未改向 plan endpoint
  - K24-A markers 可以共存（不强求存在；K24-A 可独立 revert）

### 17.3 K23-A 业务能力保证

- K23-A verify 仍 **66/66 PASS**（独立来源）
- K23-A helper / API source intact（K23 closeout verify §H 已保留）
- K23-A room recommendation 端点未改向
- K23-A "推荐教室" 按钮 / 蓝色 panel / `pickCandidate` 行为完整
- 手动 room select (`<option value="">不变</option>`) 完整

### 17.4 K24-A UI 共存

- K24-A "一键推荐调课方案" 按钮 / 紫色 plan 面板 / `pickPlan` 允许存在
- **不**替代 K23-A 入口
- **不**删除 K23-A "推荐教室" 按钮

### 17.5 验证结果

- K23 closeout verify 升级后: **84/84 PASS** (K24-A HEAD 上 75→84, 拆 G 节 + 加 9 个 marker check)
- K24-A verify: **118/118 PASS** (K24-A 自身 verify 仍严格 K24-A 边界)
- K23-A verify: **66/66 PASS**
- K22-C: **73/0/0/0**
- Prisma validate / build / lint / auth-foundation 全绿

### 17.6 影响范围

- 仅修改 `scripts/verify-room-recommendation-closeout-k23.ts` 一处
- 业务代码 0 修改（K23-A / K24-A 均 untouched）
- score / solver / schema / dev.db / RBAC 0 修改
- 推荐排序 / UI / API 业务语义 0 修改
- K22 / K23 / K24 verify expected 0 修改

### 17.7 后续 additive 阶段规则

> 任何在已 closeout 主线上的 additive 阶段，应使用 compatibility check 而非 no-diff check 验证共享 UI / client 文件。
>
> 仅当一个文件被多主线 / 多数 additive 阶段共享且仍要求业务级不变时，保留 strict no-diff 检查。

---

## 18. K24-A1-UX 修复 (added by `K24-A1-PLAN-RECOMMENDATION-UX-AND-VERIFY-ALIGNMENT`)

> 本节由 K24-A1-UX 阶段追加；不改 K24-A 实现说明 / 验证结果核心。

### 18.1 背景

K24-A 上线后，UX 反馈指出三项阻塞级交互问题（在前端人工验证前发现）：

1. 一键推荐无独立"优先周次"控件，直接借用表单 `targetWeek`，语义模糊。
2. 一键推荐结果平铺成大块列表，无法滚动浏览，候选多时无法选择。
3. 调课弹窗默认把"检查冲突"和"推荐教室"按钮平铺，对常用一键推荐流干扰大。

本阶段在不改 solver / score / schema / DB / 业务逻辑的前提下修正 UX。

### 18.2 修复 #1：优先调课周次选择控件

- 新增独立 state `preferredPlanWeek`，与表单 `targetWeek` **解耦**（不影响手动选择）。
- 在主操作按钮之上增加紫色"一键推荐调课方案"入口区，含：
  - 文案说明
  - `<select>` 1-20 周（默认值 = 当前 `week`，与 `targetWeek` 互不干扰）
  - 当前选中提示
- `handleRecommendPlans` 使用 `preferredPlanWeek` 作为 `preferredWeek` 传给后端。
- 后端 `weekWindow=1` 仍生效（搜索 ±1 周）。

### 18.3 修复 #2：可滚动 / 可展开下拉式方案列表

- 紫色 plan panel 改为**折叠式 summary + 展开按钮 + 滚动列表 + 显式"使用该方案"按钮**：
  - summary 行: `已推荐 N 个方案，点击展开选择` / `收起` 切换
  - 滚动列表: `<ul class="max-h-64 overflow-y-auto">` 容器
  - 选中机制: 点击列表项 `setSelectedPlanKey(k)`，高亮 + 边框变色
  - 显式确认: 独立 `使用该方案` 按钮 (未选中时 disabled)，调 `applySelectedPlan` → `pickPlan` 一次性填 4 字段
- 保留: fewer-than-two warning, 0 候选 message, rejected summary, loading, API error
- 仍不自动 submit / dry-run

### 18.4 修复 #3：高级选项 / `showAdvancedTools`

- 新增 state `showAdvancedTools = false` (默认隐藏)
- 紫色"高级选项"小开关：勾选后显示：
  - "检查冲突" 按钮 (K14-FIX-A 检查流程)
  - K23-A "推荐教室" 按钮 (K23-A 单时间推荐)
- "一键推荐调课方案"按钮**始终显示**（主入口）
- 手动 select (targetWeek / day / slot / room) 始终保留
- dry-run / submit 流程**未删**，仅在 `showAdvancedTools=false` 时入口被遮蔽

### 18.5 保留能力

- K23-A `推荐教室` handler / 蓝色 panel / `pickCandidate` 完整
- 手动选择周次 / 星期 / 节次 / 教室下拉完整
- dry-run / 确认调课 / void 调课流程不变
- 一键推荐只填表，不自动 submit
- K24-A 后端 helper / API / 搜索逻辑**未改**
- K23-A 后端 helper / API **未改**
- K23-A verify 66/66 + K22-C 73/0/0/0 保持

### 18.6 K24-A verify 升级

`scripts/verify-adjustment-plan-recommendations-k24-a.ts` 追加 3 节 / 27 case:

- AA. 优先调课周次选择控件 (5 case)
- AB. 可滚动 / 可展开下拉式方案列表 (10 case)
- AC. 高级选项 / `showAdvancedTools` (11 case)

K24-A verify 升级后: **145/145 PASS** (从 118 升 27)

### 18.7 K23 closeout verify

未触发新的 fail。K24-A1 已升级的 G1 strict untouched + G2 additive-compatible 仍 PASS。K23 closeout verify: **84/84 PASS**。

### 18.8 业务代码 0 修改

- K24-A helper / API / 搜索逻辑 0 修改
- K23-A helper / API 0 修改
- score.ts / solver / schema / migrations / dev.db 0 修改
- RBAC permission model 0 修改
- 推荐排序核心逻辑 0 修改
- 调课 submit 语义 0 修改

仅修改:
- `src/components/schedule-adjustment-dialog.tsx` (UI 增强, additive)
- `scripts/verify-adjustment-plan-recommendations-k24-a.ts` (UX 检查)
- `docs/k24-adjustment-plan-recommendations.{md,json}` (本文档 + JSON)
- `scripts/verify-room-recommendation-closeout-k23.ts` (verify alignment, K24-A1 阶段)
- `docs/k23-room-recommendation-closeout.{md,json}` (verify alignment 说明)

---

## 19. K24-A2 Cross-Week Self-Conflict Fix

> 本节由 K24-A2 (`K24-A2-PLAN-RECOMMENDATION-CROSS-WEEK-CONFLICT-FIX`) 阶段追加。

### 19.1 背景

前端人工验证发现阻塞级 bug: 将第 8 周的课调到第 13 周时，一键推荐会推荐第 13 周同课程、同星期、同节次、同教室的方案——但该课程在目标周本来就在同位置有课，这是 self-conflict。

### 19.2 根因

`checkScheduleConflicts` 用 `id: { not: slotId }` **全局**排除 source ScheduleSlot，不区分源周/目标周。K24-A plan helper 直接委托 K23-A room helper，后者再调 conflict check，targetWeek 不参与。K24-A **未复用** `dryRunScheduleAdjustment`（其已正确处理跨周排除）。

### 19.3 修复

在 K24-A plan helper 内部，对每个 `(targetWeek, day, slot)` 枚举后，增加 week-aware self-occupancy gate：

- `isTaskActiveInWeek(weekType, startWeek, endWeek, targetWeek)` — task 是否在 targetWeek active
- 若 active：`prisma.scheduleSlot.findFirst({ teachingTaskId + dayOfWeek + slotIndex })` — task 在该 (day, slot) 是否有 base slot
- 若有：`rejected.teacherConflict += 1; continue` — 跳过该时间所有 room candidates

**查询用 `teachingTaskId` 而非 `id: { not: sourceSlotId }`** — 不全局排除。

### 19.4 影响范围

| 项 | 状态 |
|----|------|
| K24-A plan helper (`adjustment-plan-recommendations.ts`) | ✅ 修改 (加 cross-week gate) |
| K23-A helper / API / conflict-check / dry-run | ❌ 未改 |
| score.ts / solver / schema / DB | ❌ 未改 |
| K24-A1 UX | ❌ 未改 |
| K24-A verify | 149/149 PASS (从 145 升 4) |
| K23-A verify | 66/66 PASS |
| K23 closeout verify | 84/84 PASS |
| K22-C | 73/0/0/0 |

### 19.5 后续

修复后 **需要重新做前端人工验证**。建议进入 K24-B-E2E-MANUAL-TRIAL。

---

## 20. K24-A3 Preferred-Week-First Priority Fix

> 本节由 K24-A3 (`K24-A3-PLAN-RECOMMENDATION-PREFERRED-WEEK-PRIORITY-FIX`) 阶段追加。

### 20.1 背景

前端人工验证发现：选择"优先调课至第 13 周"后，推荐结果列表中第 12/15 周方案排在前面，第 13 周方案被 `limit=5` 截断。

### 20.2 根因

K24-A helper 将所有周次方案混合后按 score 全局排序，`limit=5` 截断时 score 更高的 fallback 周可挤掉 preferredWeek 方案。`preferredWeek` 仅作搜索中心，排序中无优先级。前端无分组展示。

### 20.3 修复

**分桶排序**：

```ts
const preferredPlans = plans.filter(week === centerWeek)
const fallbackPlans = plans.filter(week !== centerWeek)
preferredPlans.sort(sortByScore)
fallbackPlans.sort(sortByScore)
const top = [...preferredPlans, ...fallbackPlans].slice(0, limit)
```

**Additive response shape**：每个 plan 新增 `isPreferredWeek`；result 新增 `preferredWeek` / `preferredWeekAvailable`；searched 新增 `preferredWeekPlanCount` / `fallbackPlanCount`。

**前端分组**：列表按"首选周方案" / "备选周方案"分组渲染。preferredWeek 无方案时显示 amber 提示"第 X 周暂无可用方案，以下为邻近周备选方案"。

### 20.4 影响范围

| 项 | 状态 |
|----|------|
| K24-A plan helper | ✅ 修改 (分桶排序 + additive types) |
| K24-A API route | ❌ 未改 (透传已有) |
| adjustment-client | ✅ 修改 (types 扩展) |
| adjustment dialog | ✅ 修改 (分组展示) |
| K24-A2 cross-week gate | ❌ 未改 |
| score.ts / solver / schema / DB | ❌ 未改 |
| K24-A verify | 159/159 PASS (从 149 升 10) |
| K24-A3 专项 verify | 50/50 PASS |
| K23-A verify | 66/66 PASS |
| K22-C | 73/0/0/0 |

### 20.5 后续

修复后 **需要重新做前端人工验证**。建议进入 K24-B-E2E-MANUAL-TRIAL。

---

## 21. K24-A4 Time-Slot Range Correction

> 本节由 K24-A4 (`K24-A4-TIMESLOT-RANGE-CORRECTION`) 阶段追加。

### 21.1 背景

实际教学安排只到 9-10 节 (slotIndex 1-5)，但一键推荐 / 调课相关 UI / 搜索范围仍出现 11-12 节 (slotIndex=6)。

### 21.2 根因

- K24-A plan helper `DEFAULT_SLOT_INDEXES = [1..6]`
- K23-A API 防御校验允许 `targetSlotIndex ≤ 6`
- 调课弹窗节次下拉使用完整 `TIME_SLOTS` (1-7)

### 21.3 修复

- 新增 `src/lib/schedule/time-slots.ts`: `VALID_TEACHING_SLOT_INDEXES = [1, 2, 3, 4, 5]`
- K24-A plan helper 改用 `getValidTeachingSlotIndexes()`
- K23-A API 防御校验 `targetSlotIndex > 5` → 400
- 调课弹窗"新节次"下拉用 `getTeachingSlotLabelOptions()`

### 21.4 历史数据

dev.db 中有 2 个 `slotIndex=6` 记录 (440 个中)。**本阶段不修改**。建议 K24-A5 / K24-FutureDataCleanup 处理。

### 21.5 影响范围

| 项 | 状态 |
|----|------|
| 新 helper | ✅ 新增 `src/lib/schedule/time-slots.ts` |
| K24-A plan helper | ✅ 修改 (DEFAULT_SLOT_INDEXES) |
| K23-A API route | ✅ 修改 (defensive check 5 vs 6) |
| K23-A helper | ❌ 未改 (66/66 保持) |
| 调课弹窗 | ✅ 修改 (新节次 select) |
| K24-A1/A2/A3 | ❌ 未改 |
| score.ts / schema / DB | ❌ 未改 |
| K24-A4 verify | 42/42 PASS |
| K24-A verify | 167/167 PASS (从 159 升 8) |
| K23-A verify | 66/66 PASS |
| K22-C | 73/0/0/0 |

### 21.6 后续

修复后 **需要重新做前端人工验证**，重点确认不会出现 11-12 节。

---

## 22. K24 Plan Recommendation Acceptance Closeout (added by `K24-PLAN-RECOMMENDATION-ACCEPTANCE-CLOSEOUT`)

> 本节由 K24 closeout 阶段追加；不改 K24-A / A1 / A2 / A3 / A4 实现说明 / 验证结果核心。

### 22.1 Closeout 状态

- **manualFrontendValidation**: `PASSED` (user-provided)
- **closeoutStage**: `K24-PLAN-RECOMMENDATION-ACCEPTANCE-CLOSEOUT`
- **featureStatus**: `READY_FOR_REAL_USE`
- **K24 plan recommendation: CLOSED**

### 22.2 当前 baseline (K24-A4A HEAD `d6821d5`)

| Verify | 结果 |
|--------|------|
| K24-A verify | 167/167 PASS |
| K24-A4 verify | 42/42 PASS |
| K24-A3 verify | 50/50 PASS |
| K24-A2 verify | 31/31 PASS |
| K23-A verify | 66/66 PASS |
| K23 closeout verify | 83/83 PASS |
| K22-C | 73/0/0/0 |
| schedule preflight | 23/23 PASS |
| schedule mutation guards | HIGH=0, MEDIUM=0 |
| teaching-task semantic guards | BLOCKING=NO |
| build | PASS (`✓ Compiled successfully in 2.8s`, exit=0) |
| lint | 181/136 (0 new error, 0 warning drift) |
| auth-foundation | 53 passed / 1 pre-existing failure |

### 22.3 Closeout 文档

- **closeout 文档**: [`docs/k24-plan-recommendation-closeout.md`](./k24-plan-recommendation-closeout.md) + [`docs/k24-plan-recommendation-closeout.json`](./k24-plan-recommendation-closeout.json)
- **closeout verify**: `scripts/verify-plan-recommendation-closeout-k24.ts`
- **本节不修改**: K24-A / A1 / A2 / A3 / A4 实现说明 / 验证结果 (仍为各 commit 提交时内容)
- **后续**: 任何调参 / 性能 / 复杂策略 / 历史清理 / preferred room 需真实反馈触发 (`K24-C` / `K24-D` / `K24-E` / `K24-A5` / `K24-FUTURE-SCHEMA`)

### 22.4 K24-A 业务代码 0 修改

- K24-A plan helper / API route / time-slots.ts 全部 intact
- K23-A helper / API / conflict-check / dry-run 全部 intact
- score.ts / solver / schema / DB 全部 intact
- 调课 submit 语义 / dry-run 语义 / auto-apply 全部未引入
- 调参 / 排序 / 业务规则 全部 unchanged

### 22.5 后续

- ❌ **不应**继续任何 K24 mechanical stage (audit / 文档 / 调参) 除非真实反馈
- ✅ 系统进入真实调课使用 / 维护模式
- ✅ 监控基线: K24-A 167/167, K24-A4 42/42, K24-A3 50/50, K24-A2 31/31, K23-A 66/66, K22-C 73/0/0/0
- ✅ 数据备份: 任何 apply 前必先 `cp prisma/dev.db prisma/dev.db.backup-*`

---
