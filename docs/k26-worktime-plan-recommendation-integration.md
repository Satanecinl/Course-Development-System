# K26-I1: WorkTime Plan Recommendation Integration

## 1. Executive Summary

K26-I1 将 WorkTime 接入一键推荐调课方案：

- plan recommendation search space 使用 resolved WorkTime config
- candidate slots 来自 `activeTeachingSlotIndexes`（1-5，不含 6/7）
- candidate days 尊重 `allowWeekend`（默认 false → 只有 1-5）
- preferredDayOfWeek 验证改为 WorkTime-aware（`WORKTIME_WEEKEND_DISABLED`）
- response 添加 additive WorkTime metadata（`workTimeSource`, `allowWeekend`, `allowedSlotIndexes`, `excludedLegacySlotIndexes`）
- **不改 dry-run/apply**
- **不改 room recommendation**
- **不改 frontend dialog**
- **不改 conflict-check**
- **不改 solver/score**
- **不改 K22/K23/K24/K25 expected**

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `https://github.com/Satanecinl/Course-Development-System.git` |
| Tracking branch | `origin/master` |
| Local HEAD before | `b1d5951` (CLAUDE.md update) |
| Local HEAD after | (to be filled after push) |
| Remote HEAD before | `b1d5951` |
| Remote HEAD after | (to be filled after push) |
| Ahead/behind | up to date |
| Fetch | yes |
| Pull/rebase | no |
| Push | yes |
| Force push | false |

## 3. Resolver Contract

**File**: `src/lib/worktime/worktime-schedule-resolver.ts`

```ts
export async function resolveWorkTimeConfigForSchedule(
  semesterId: number
): Promise<ResolvedWorkTimeForSchedule>
```

返回：
```ts
{
  semesterId: number
  source: 'database' | 'staticFallback'
  allowWeekend: boolean
  activeTeachingSlotIndexes: number[]  // [1,2,3,4,5]
  legacyDisplaySlotIndexes: number[]   // [6,7]
  weekendDayValues: number[]           // [6,7]
  weekdayValues: number[]              // [1,2,3,4,5]
  slotsByIndex: Record<number, ResolvedSlotDefinition>
}
```

规则：
1. 查询 `WorkTimeConfig`（`isDefault=true, isActive=true`）+ `slots`
2. DB 存在 → `source: 'database'`，提取 active/legacy slots
3. DB 不存在 → `source: 'staticFallback'`，使用 K26-D helper 常量
4. **slot 6/7 强制排除**：即使 DB 标记 `isTeachingSlot=true`，也排除
5. 只读，不写 DB

辅助函数：
- `isWorkTimeDayAllowed(workTime, dayOfWeek)` — weekday OR (allowWeekend AND weekend)
- `isWorkTimeSlotAllowed(workTime, slotIndex)` — in active AND not legacy AND not 6/7
- `getAllowedWorkTimeCandidateDays(workTime)` — allowed day list
- `getAllowedWorkTimeCandidateSlots(workTime)` — active slot list

## 4. Candidate Policy

**Day policy**：
```txt
allowed if:
  dayOfWeek in weekdayValues [1,2,3,4,5]
  OR allowWeekend=true AND dayOfWeek in weekendDayValues [6,7]
```

**Slot policy**：
```txt
allowed if:
  slotIndex in activeTeachingSlotIndexes
  AND isTeachingSlot = true
  AND isLegacyDisplay = false
  (slot 6/7 always excluded)
```

## 5. Plan Recommendation Changes

**修改文件**：

| File | Change |
|------|--------|
| `src/lib/worktime/worktime-schedule-resolver.ts` | **新增** — schedule-safe resolver |
| `src/lib/schedule/adjustment-plan-recommendations.ts` | candidate day/slot 改为 WorkTime-driven |
| `src/app/api/schedule-adjustments/plan-recommendations/route.ts` | preferredDayOfWeek 改为 WorkTime-aware；response 添加 additive WorkTime metadata |
| `scripts/audit-worktime-recommendation-integration-k26-i.ts` | 更新 B1/B2 为 stage-aware |

**具体变更**：

### helper (`adjustment-plan-recommendations.ts`)

- 原：`const days = buildDayList(includeWeekend)` → `const days = workTime.weekdayValues + (allowWeekend && includeWeekend ? weekendDayValues : [])`
- 原：`const slotIndexes = [...DEFAULT_SLOT_INDEXES]` → `const slotIndexes = [...workTime.activeTeachingSlotIndexes]`
- 新增 import：`resolveWorkTimeConfigForSchedule`, `isWorkTimeDayAllowed`, `isWorkTimeSlotAllowed`
- `workTime = await resolveWorkTimeConfigForSchedule(semesterId)` 在 search space 构建前调用

### route (`plan-recommendations/route.ts`)

- `preferredDayOfWeek` 验证改为 `isWorkTimeDayAllowed(workTime, n)`，不合法时返回 `WORKTIME_WEEKEND_DISABLED`
- response 添加 additive 字段：`workTimeSource`, `allowWeekend`, `allowedSlotIndexes`, `excludedLegacySlotIndexes`
- K24 响应字段保持不变（`plans`, `searched`, `preferredWeek`, `preferredWeekAvailable`, `preferredDayOfWeek`, `preferredDayAvailable`）

## 6. Response Shape

K26-I1 采用 additive-only 策略：

**保持**（K24）：
- `ok: true`
- `minimumSatisfied`
- `plans[]`
- `rejectedSummary`
- `searched`
- `message?`
- `preferredWeek`
- `preferredWeekAvailable`
- `preferredDayOfWeek`
- `preferredDayAvailable`

**新增**（K26-I1，不破坏 K24 前端）：
- `workTimeSource: 'database' | 'staticFallback'`
- `allowWeekend: boolean`
- `allowedSlotIndexes: number[]`
- `excludedLegacySlotIndexes: number[]`

## 7. K24 Regression Compatibility

| 项 | 状态 |
|----|------|
| preferredWeek-first ordering | ✅ 保持 |
| fallbackPlans 在 preferredPlans 后 | ✅ 保持 |
| preferredWeekAvailable 字段 | ✅ 保持 |
| preferredWeekPlanCount 字段 | ✅ 保持 |
| fallbackPlanCount 字段 | ✅ 保持 |
| same-week conflict exclusion | ✅ 保持 |
| cross-week recommendation | ✅ 保持 |
| slot 11-12 不推荐 | ✅ 保持（activeTeachingSlotIndexes 不含 6/7） |
| response shape 不破坏 K24 前端 | ✅ additive-only |

## 8. Non-Goals

本阶段**未改**：

- ❌ dry-run logic
- ❌ apply adjustment logic
- ❌ room recommendation
- ❌ frontend adjustment dialog
- ❌ conflict-check logic
- ❌ solver algorithm
- ❌ `src/lib/scheduler/score.ts`
- ❌ scheduler preview / apply
- ❌ importer / parser
- ❌ RBAC permission model
- ❌ K22 / K23 / K24 / K25 expected
- ❌ `prisma/schema.prisma`
- ❌ `prisma/migrations/**`
- ❌ `prisma/dev.db`

## 9. Verification Results

| Command | Result |
|---------|--------|
| `npx tsx scripts/verify-worktime-plan-recommendation-integration-k26-i1.ts` | (TBD) |
| `npx tsx scripts/audit-worktime-recommendation-integration-k26-i.ts` | (TBD) |
| `npm run build` | **PASS** |
| `npx eslint .` | (TBD) |

## 10. Recommended Next Stage

```txt
K26-I1 WORKTIME PLAN RECOMMENDATION INTEGRATION VERIFY PASS
PASS=x FAIL=0
blocking=false
recommendedNextStage=K26-I2-WORKTIME-ADJUSTMENT-DRY-RUN-APPLY-GUARD
```

K26-I1 **建议关闭**。下一步进入 K26-I2（dry-run / apply guard）：

- `validateScheduleAdjustmentInput` 调 WorkTime guard
- 收紧 `newSlotIndex ≤ 5`（与 room-rec 一致）
- 引入新 error codes
- **不改 K24 expected**
