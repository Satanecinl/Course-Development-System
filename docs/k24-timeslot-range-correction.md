# K24-A4 Time-Slot Range Correction

**Stage**: `K24-A4-TIMESLOT-RANGE-CORRECTION`
**Date**: 2026-06-07
**K24-A3 commit baseline**: `ebdc18c`
**K24-A4 status**: **FIXED** (requires re-verification of K24 one-click flow)

---

## 1. Bug Description

**场景**：实际教学安排只到 9-10 节 (slotIndex 1-5)，但一键推荐 / 调课相关 UI / 搜索范围仍出现 11-12 节 (slotIndex=6) 和 中午 (slotIndex=7)。

**期望**：
- 一键推荐调课方案不再搜索或返回 11-12 节
- 调课弹窗手动选择节次不再显示 11-12 节
- 推荐教室功能不再针对 11-12 节推荐
- 检查冲突入口不再将 11-12 节作为正常可选项

---

## 2. Root Cause

K24-A plan helper 中：

```ts
// src/lib/schedule/adjustment-plan-recommendations.ts:45
const DEFAULT_SLOT_INDEXES = [1, 2, 3, 4, 5, 6] as const
```

硬编码 `[1..6]`，第 6 个值是 11-12 节。

K23-A room API 防御校验：

```ts
// src/app/api/schedule-adjustments/room-recommendations/route.ts:67
if (targetSlotIndex < 1 || targetSlotIndex > 6) → 400
```

允许到 6 (11-12 节)。

调课弹窗节次下拉使用 `TIME_SLOTS.map` (来自 `types/schedule.ts`)，包含 slotIndex 1-7（含 11-12 节和 中午）。

### 关键发现

- **历史数据存在**：dev.db 中有 **2 个** `slotIndex=6` 的 ScheduleSlot（440 个中）。本阶段**不修改业务数据**。

---

## 3. Fix Strategy

### 1. 新增统一有效节次 helper

`src/lib/schedule/time-slots.ts`:

```ts
export const VALID_TEACHING_SLOT_INDEXES = [1, 2, 3, 4, 5] as const

export function getValidTeachingSlotIndexes(): number[] {
  return [...VALID_TEACHING_SLOT_INDEXES]
}

export function isValidTeachingSlotIndex(slotIndex: number): boolean {
  return (VALID_TEACHING_SLOT_INDEXES as readonly number[]).includes(slotIndex)
}

export function formatTeachingSlotLabel(slotIndex: number): string {
  switch (slotIndex) {
    case 1: return '1-2节'
    case 2: return '3-4节'
    case 3: return '5-6节'
    case 4: return '7-8节'
    case 5: return '9-10节'
    default: return `第${slotIndex}节`
  }
}

export function getTeachingSlotLabelOptions(): Array<{index, label}>
```

### 2. K24-A plan helper 修复

```ts
// Before:
const DEFAULT_SLOT_INDEXES = [1, 2, 3, 4, 5, 6] as const

// After (K24-A4):
import { getValidTeachingSlotIndexes } from './time-slots'
const DEFAULT_SLOT_INDEXES = getValidTeachingSlotIndexes() as readonly number[]
```

`searched.slotIndexes` 现在只含 [1..5]。

### 3. K23-A API 防御校验修复

```ts
// Before:
if (targetSlotIndex < 1 || targetSlotIndex > 6) → 400

// After (K24-A4):
if (targetSlotIndex < 1 || targetSlotIndex > 5) → 400
// 错误信息: 'targetSlotIndex 必须在 1-5 之间 (1-2节 .. 9-10节)'
```

### 4. 调课弹窗 UI 修复

```ts
// Before:
{TIME_SLOTS.map((t) => <option ... />)}

// After (K24-A4):
{getTeachingSlotLabelOptions().map((t) => <option ... />)}
```

`TIME_SLOTS` 仍用于**显示**已有 item / 推荐的方案（legacy 渲染兼容），但**新节次 select** 用 bounded options。

---

## 4. 不破坏 K24-A1 / A2 / A3

| 阶段 | 标记 | 状态 |
|------|------|------|
| K24-A1 preferredPlanWeek state | `preferredPlanWeek` | ❌ 未改 |
| K24-A1 showAdvancedTools | `showAdvancedTools` | ❌ 未改 |
| K24-A1 overflow-y-auto | `overflow-y-auto` | ❌ 未改 |
| K24-A2 cross-week gate | `taskActiveInTargetWeek` | ❌ 未改 |
| K24-A3 preferredWeek-first | `preferredPlans` / `fallbackPlans` | ❌ 未改 |
| K24-A3 isPreferredWeek | `isPreferredWeek` | ❌ 未改 |
| K23-A 推荐教室 (helper) | `findAdjustmentRoomRecommendations` | ❌ 未改 (K23-A helper intact) |
| K23-A API route | targetSlotIndex 校验 | ✅ 改了 (defensive check 5 vs 6) |
| 手动选择 | `roomOptions.map` | ❌ 未改 |

**K23-A verify 66/66 仍 PASS**（helper 本身未改）。K23-A API route 改的是**防御性校验上限**（6→5），不破坏 K23-A 业务逻辑（API 本来就接受 1-5；只是 1-6 / 1-7 现在会被拒）。

---

## 5. 历史数据 slotIndex=6 状态

dev.db 中**存在** 2 个 `slotIndex=6` 的 ScheduleSlot 记录：

```text
slotIndex=6 count: 2  (out of 440)
slotIndex=7 count: 0
```

本阶段**未迁移、删除、修改**这些数据。它们是历史遗留：K24-A4 文档化为 data cleanup candidate（建议下一阶段 K24-FutureDataCleanup 或 K24-A5 处理）。

**K24-A4 不动业务数据**。

---

## 6. Verification

### K24-A4 专项 verify

`scripts/verify-timeslot-range-correction-k24-a4.ts`:

**11 sections / 42 case**:
- A. 共享 time-slot helper 存在
- B. K24-A plan helper 使用 [1..5]
- C. K23-A room API 防御校验 (≤ 5)
- D. dialog 节次下拉使用 bounded options
- E. K24-A1/A2/A3 markers 保留
- F. K23-A 推荐教室仍可用
- G. 手动选择仍存在
- H. score.ts 未改
- I. schema / DB 未改
- J. 无 DB writes
- K. DB read-only integration

### K 节 DB integration

- 调用 `findAdjustmentPlanRecommendations`
- 验证 `result.searched.slotIndexes = [1, 2, 3, 4, 5]`
- 验证 `result.plans[*].targetSlotIndex ∈ [1..5]`
- 不写 DB

---

## 7. Unmodified Scope

| Item | 状态 |
|------|------|
| `src/lib/scheduler/score.ts` | ❌ NOT modified |
| solver algorithm | ❌ NOT modified |
| Prisma schema | ❌ NOT modified |
| Migration | ❌ NOT modified |
| `prisma/dev.db` (2 个 slotIndex=6 记录) | ❌ NOT written |
| K23-A `room-recommendations.ts` (helper) | ❌ NOT modified (66/66 保持) |
| K24-A2 cross-week self-conflict gate | ❌ NOT modified |
| K24-A3 preferredWeek-first 逻辑 | ❌ NOT modified |
| RBAC permission model | ❌ NOT modified |
| 调课 submit 语义 | ❌ NOT modified |
| 自动 apply 调课 | ❌ NOT introduced |

K23-A API route 是**唯一**的 K24-A4 改动的 K23-A 表面 — 加了 `targetSlotIndex ≤ 5` 防御校验（**减少**允许范围，不影响既有 K23-A 业务）。

---

## 8. Follow-up

修复后 **需要重新做前端人工验证**。重点确认：

1. 一键推荐调课方案不再出现 11-12 节
2. 调课弹窗"新节次"下拉只显示 1-2 / 3-4 / 5-6 / 7-8 / 9-10
3. 一键推荐结果不显示 11-12
4. K23-A 推荐教室功能仍工作
5. 手动调课仍工作
6. 历史 slotIndex=6 数据**仍存在**（不删、不迁移）
7. K24-A1/A2/A3 既有修复仍工作

### 后续可选

- K24-A5: 历史 slotIndex=6 记录 data cleanup (迁移到 slotIndex=5 或标记 retired)
- K24-B-E2E-MANUAL-TRIAL: 重新真实试用

---

**报告结束。K24-A4 节次范围修复完成，需重新做前端人工验证。**
