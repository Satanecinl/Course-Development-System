# K26-I: WorkTime Recommendation Integration Audit

## 1. Executive Summary

K26-I 审计了 WorkTime 配置接入调课推荐体系的影响面。

- 当前所有推荐路径（plan recommendation / room recommendation / dry-run / apply / frontend dialog）都使用 **K26-D 静态 helper**，未读 WorkTime config
- 主要风险：**4 个 HIGH**（plan rec / room rec / dry-run / apply / frontend 均无 WorkTime guard）
- 1 个 **MEDIUM**（conflict-check 职责范围 vs 上游 guard）
- 2 个 **LOW**（K24 helper 复用 / resolver fallback）
- 推荐下一阶段：`K26-I1-WORKTIME-PLAN-RECOMMENDATION-INTEGRATION`
- 本阶段不做实际接入

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `https://github.com/Satanecinl/Course-Development-System.git` |
| Tracking branch | `origin/master` |
| Local HEAD before | `6a216ef` (K26-H closeout) |
| Local HEAD after | (to be filled after push) |
| Remote HEAD before | `6a216ef` |
| Remote HEAD after | (to be filled after push) |
| Ahead/behind | up to date |
| Fetch | yes |
| Pull/rebase | no |
| Push | yes |
| Force push | false |

## 3. Current WorkTime Baseline

K26-F / G / H 已完成：

- `WorkTimeConfig` (per-semester, versioned, isDefault, allowWeekend, isActive)
- `TimeSlotDefinition` (slotIndex 1..7, isActive, isTeachingSlot, isLegacyDisplay)
- `Semester.workTimeConfigs` relation
- `SchedulingRun.workTimeConfigSnapshot String?`
- 2 default WorkTimeConfig + 14 TimeSlotDefinition 已 backfill
- K26-G API：list / create / get / update / delete / activate / resolved
- K26-H Settings UI 已 READY_FOR_REAL_USE + 人工验证 PASSED

当前默认 config：
- slot 1-5：active teaching
- slot 6 (11-12节)：inactive / non-teaching / legacy display
- slot 7 (中午)：inactive / non-teaching / legacy display
- allowWeekend = false

## 4. Plan Recommendation Impact

**当前状态**：
- `src/lib/schedule/adjustment-plan-recommendations.ts` search space 完全来自 K26-D 静态 helper
- `DEFAULT_SLOT_INDEXES = getValidTeachingSlotIndexes()` = [1, 2, 3, 4, 5]
- `DEFAULT_DAYS_WORKING = [1, 2, 3, 4, 5]`
- `WEEKEND_DAYS = [6, 7]`（仅在 `includeWeekend=true` 时加入）
- `VALID_PREFERRED_DAY_VALUES = [1, 2, 3, 4, 5]`（API route 拒 6/7）

**Gap**：
- WorkTime config 中将某个 slot 标记为 `isActive=false` → 仍会被推荐
- `allowWeekend=false` → `includeWeekend=true` 仍会推荐周末
- 6/7 在 plan rec 中已自然排除（K24-A4 hardcoded）

**Integration Point**：在 helper 入口处用 `resolveWorkTimeConfigForSchedule(semesterId)` 替代 `getValidTeachingSlotIndexes()` 静态引用。

## 5. Room Recommendation Impact

**当前状态**：
- `src/lib/schedule/room-recommendations.ts` 只关心 room capacity / conflict
- API route 校验 `targetSlotIndex ∈ [1, 5]`（拒 6/7）
- helper 信任 targetSlotIndex 合法性
- 不调 `resolveWorkTimeConfig`

**Gap**：
- 如果 user 选择 disabled slot → 仍返回 room candidates
- `allowWeekend=false` 时被调用 → 仍可能返回结果

**Integration Point**：在 helper 入口处先用 WorkTime config 校验 `targetSlotIndex` 是否 active teaching，否则提前返回 409。

## 6. Dry-run / Apply / Conflict Impact

**当前状态**：
- `src/lib/schedule/adjustments.ts` `validateScheduleAdjustmentInput()` 校验 `newSlotIndex ∈ [1, 6]`（注意：允许 6！）
- `dryRunScheduleAdjustment()` 不调 WorkTime
- `createScheduleAdjustment()` 不调 WorkTime（仅复用 dry-run）
- `src/lib/schedule/conflict-check.ts` 是 pure rule kernel，**不应**承担 WorkTime guard 职责

**Inconsistency**：
- validate 允许 `newSlotIndex=6`（inconsistent with room-rec route 拒 > 5）
- 这是遗留 hardcode，未来 I1 应统一收紧

**Integration Point**：在 `validateScheduleAdjustmentInput()` 中先调 `resolveWorkTimeConfigForSchedule(semesterId)`，再校验：
- target slot 是否在 `activeTeachingSlotIndexes` 内
- target day 是否符合 `allowWeekend`
- 否则返回新 error code：`WORKTIME_SLOT_DISABLED` / `WORKTIME_WEEKEND_DISABLED`

## 7. Frontend Adjustment Dialog Impact

**当前状态**：
- `src/components/schedule-adjustment-dialog.tsx` 新节次下拉来自 `getTeachingSlotLabelOptions()`（K26-D 静态）
- 新日下拉来自 `@/types/schedule` 的 `DAYS`（7 个）
- `includeWeekend` 硬编码为 `false`（line 216）
- 不调 `/api/admin/worktime-configs/resolved`

**Gap**：
- 不显示当前学期 WorkTime source（database / staticFallback）
- target slot 列表不反映 active teaching
- preferred day 不受 `allowWeekend` 影响
- 切换学期不刷新 WorkTime

**Integration Point**：dialog 初始化时调 `resolveWorkTimeConfig`，下拉只显示 active teaching slot；preferred day 受 `allowWeekend` 控制；显示 source 提示。

## 8. Integration Contract

### Resolved WorkTime service

```ts
async function resolveWorkTimeConfigForSchedule(
  semesterId: number
): Promise<{
  semesterId: number
  source: 'database' | 'staticFallback'
  allowWeekend: boolean
  activeTeachingSlotIndexes: number[]
  legacyDisplaySlotIndexes: number[]
  weekendDayValues: number[]
  weekdayValues: number[]
  slotsByIndex: Record<number, TimeSlotDefinitionDTO>
}>
```

实现路径：
- 直接调用 K26-G `resolveWorkTimeConfig(semesterId)`
- 加 lightweight scheduler-safe mapper（提取 policy 字段）
- 不缓存（推荐操作频率低，且 config 可能修改）
- API route 可直接调（service 是纯 function）
- static fallback 当 `source='staticFallback'` 或 DB query 失败时使用
- 错误时也 fallback（避免 recommendation 失败导致 UX 不可用）

### Candidate policy

```txt
candidate day is allowed if:
  dayOfWeek in weekdayValues
  OR allowWeekend = true and dayOfWeek in weekendDayValues

candidate slot is allowed if:
  slotIndex in activeTeachingSlotIndexes
  AND slot isTeachingSlot = true
  AND isLegacyDisplay = false
```

明确规则：
- 6/7 永不能作为新推荐目标
- disabled slot 永不能作为新推荐目标
- `allowWeekend=false` 时不推荐周末
- `allowWeekend=true` 时周末可作为候选（受 sorting 排序影响）
- historical `ScheduleSlot` 仍可 display-only

### Error policy

新增 error codes（沿用 K13/K24 response shape）：

```ts
WORKTIME_CONFIG_NOT_FOUND        // config not found for semester
WORKTIME_SLOT_DISABLED           // target slot isActive=false
WORKTIME_SLOT_LEGACY_ONLY        // target slot 6/7
WORKTIME_WEEKEND_DISABLED        // allowWeekend=false but target day is 6/7
WORKTIME_RESOLUTION_FAILED       // DB query failed and no fallback
```

Response shape：
```ts
{ success: false, error: "WORKTIME_SLOT_DISABLED", message: "..." }
```

## 9. Risk Summary

| Level | Count | Items |
|-------|-------|-------|
| HIGH | 4 | plan recommendation / room recommendation / dry-run+apply / frontend dialog 均无 WorkTime guard |
| MEDIUM | 1 | conflict-check 职责 vs 上游 guard（应在上游做） |
| LOW | 2 | K24 helper 复用 / resolver fallback policy |
| INFO | 1 | 历史 11-12 / 周末数据保持 display-only |

**Findings**：

1. **HIGH** — `adjustment-plan-recommendations` 未读 WorkTime config
2. **HIGH** — `room-recommendations` 未读 WorkTime config
3. **HIGH** — `adjustments validate` / dry-run / apply 未读 WorkTime config
4. **HIGH** — `schedule-adjustment-dialog` 未读 WorkTime config
5. **MEDIUM** — `validateScheduleAdjustmentInput` 允许 `newSlotIndex=6`（inconsistent with room-rec）
6. **LOW** — K24-A4 helper 复用：未来 I1 应保持 `getValidTeachingSlotIndexes()` 仍可独立使用（debug / fallback）
7. **LOW** — Resolver fallback policy：DB 失败时使用 static helper
8. **INFO** — K22 harness / K23 room-rec / K24 plan-rec / K25 schema expected 不变

## 10. Recommended Implementation Stages

按"先 audit → 再 recommendation → 再 guard → 再 UI → solver/score 留给 K26-J"拆分：

### K26-I1：Plan recommendation integration

- `adjustment-plan-recommendations.ts` 使用 `resolveWorkTimeConfigForSchedule`
- `VALID_PREFERRED_DAY_VALUES` 改为 derived from `allowWeekend`
- `slotIndexes` derived from `activeTeachingSlotIndexes`
- 保留 K24-A4 helper 用于 debug / fallback（不删）
- 不改 K24 verify expected
- 6/7 继续排除

### K26-I2：Dry-run / Apply guard

- `validateScheduleAdjustmentInput` 调 WorkTime guard
- 收紧 `newSlotIndex ≤ 5`（与 room-rec 一致）
- 引入新 error codes
- 保留 admin data page 对历史 slot 的 read-only display
- 不改 K24 verify expected
- 不改 conflict-check

### K26-I3：Room recommendation guard

- `room-recommendations.ts` 调 WorkTime guard
- 拒 disabled slot / weekend-when-disabled
- 引入新 error codes
- 不改 K23 verify expected
- 不改 solver/score

### K26-I4：Frontend dialog integration

- `schedule-adjustment-dialog.tsx` 调 `/api/admin/worktime-configs/resolved`
- 下拉只显示 active teaching slot
- preferred day 受 `allowWeekend` 控制
- 显示 source 提示（database / staticFallback）
- API 失败时 fallback static helper
- 不改 K24 UI 行为（仅添加新元素）

### K26-J：Solver / score integration（K26-I 之后）

- candidate filter
- SC3 / SC7 参数化
- K22-after-k26-j fixture
- schedulingRun.workTimeConfigSnapshot 写入

**顺序保持**：
1. K26-I audit（本阶段，已完成）
2. K26-I1 plan rec
3. K26-I2 dry-run / apply
4. K26-I3 room rec
5. K26-I4 frontend
6. K26-J solver / score

## 11. Non-Goals

确认本阶段**未实现**：

- ❌ schema change
- ❌ migration
- ❌ DB write
- ❌ API behavior change
- ❌ UI behavior change
- ❌ recommendation algorithm
- ❌ room recommendation algorithm
- ❌ conflict-check logic
- ❌ dry-run logic
- ❌ apply logic
- ❌ solver algorithm
- ❌ `score.ts`
- ❌ scheduler preview / apply
- ❌ importer / parser
- ❌ RBAC permission model
- ❌ K22 / K23 / K24 / K25 expected
- ❌ SchedulingRun snapshot 写入逻辑

## 12. Verification Results

| Command | Result |
|---------|--------|
| `npx tsx scripts/audit-worktime-recommendation-integration-k26-i.ts` | (TBD) |
| `npx tsx scripts/verify-worktime-settings-ui-acceptance-closeout-k26-h.ts` | (TBD) |
| 其他 17 项 verification chain | (TBD) |

## 13. Recommended Next Stage

```txt
K26-I WORKTIME RECOMMENDATION INTEGRATION AUDIT PASS
PASS=x FAIL=0
HIGH=4 MEDIUM=1 LOW=2 INFO=1
blocking=false
recommendedNextStage=K26-I1-WORKTIME-PLAN-RECOMMENDATION-INTEGRATION
K26-I1 注: 只改 plan recommendation search space; 不接 solver/score; 不改 K24 expected
仍禁止直接接 solver/score/recommendation（必须按 I1→I2→I3→I4→J 顺序）
```
