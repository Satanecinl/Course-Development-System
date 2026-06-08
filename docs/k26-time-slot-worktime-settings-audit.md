# K26-C: Time-Slot / Worktime Settings Audit

## 1. Executive Summary

本阶段审计"节次与作息设置"如果进入系统设置中心会影响的代码、数据、API、UI 和排课逻辑。

**主要发现**：

- 当前系统已有 K24-A4 统一 helper `src/lib/schedule/time-slots.ts`，active slot 是 1-5 (1-2节..9-10节)
- 11-12节 (slotIndex=6) 和 "中午" (slotIndex=7) 是 legacy display-only，不应用于新推荐
- 周末 (dayOfWeek 6/7) 已有数据：21 条
- 历史 11-12 数据：2 条
- `score.ts` 中 SC3 (slotIndex>=5) 和 SC7 (dayOfWeek>=6) 是**硬编码**的阈值

**不建议直接实现**节次与作息设置 UI。本阶段给出三个 schema 方案 A/B/C 和推荐路径。

**下一阶段**：K26-D-STATIC-TIME-SLOT-EXTRACTION（只抽统一 helper，不做 DB 配置）。

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `https://github.com/Satanecinl/course-development-system.git` |
| Tracking branch | `origin/master` |
| Local HEAD before | `45f60cc` |
| Remote HEAD before | `45f60cc` |
| Local HEAD after | (to be filled after push) |
| Remote HEAD after | (to be filled after push) |
| Ahead/behind | up to date |
| Fetch | yes |
| Push | yes |
| Force push | false |

## 3. Current Time Slot Model

```json
{
  "slotIndexBase": "1-based",
  "activeTeachingSlots": ["1-2节 (1)", "3-4节 (2)", "5-6节 (3)", "7-8节 (4)", "9-10节 (5)"],
  "legacySlots": ["11-12节 (6) display-only", "中午 (7) display-only"],
  "newRecommendationMaxSlot": 5,
  "displayCompatibility": true,
  "helper": "src/lib/schedule/time-slots.ts (K24-A4)",
  "constants": "VALID_TEACHING_SLOT_INDEXES = [1, 2, 3, 4, 5]",
  "dayOfWeek": {
    "workingDays": [1, 2, 3, 4, 5],
    "weekendDays": [6, 7],
    "preferredDayValidation": "VALID_PREFERRED_DAY_VALUES = [1, 2, 3, 4, 5] (weekend excluded)"
  }
}
```

- `slotIndex` 是 1-based（不是 0-based）
- active slots 是 1-5；6 和 7 是 legacy display-only
- 工作日 = 1..5 (周一-周五)，周末 = 6..7 (周六-周日)
- `SC7_WEEKEND_PENALTY = -15` 在 `score.ts` 中以 `dayOfWeek >= 6` 触发
- `SC3_EXTREME_TIME` 阈值在 `slotIndex >= 5` 触发（即 9-10节之后被认为是"较晚"）

## 4. DB Snapshot

| Field | Value |
|-------|-------|
| Total ScheduleSlot | 440 |
| By semester | all semesterId=1 |
| Distinct days | [1, 2, 3, 4, 5, 6, 7] |
| Distinct slots | [1, 2, 3, 4, 5, 6] |
| Legacy slots (slotIndex>5) | 2 (即 11-12节 历史数据) |
| Weekend slots (dayOfWeek>=6) | 21 |

### By slotIndex

| slotIndex | count |
|-----------|------:|
| 1 (1-2节) | 111 |
| 2 (3-4节) | 119 |
| 3 (5-6节) | 88 |
| 4 (7-8节) | 96 |
| 5 (9-10节) | 24 |
| 6 (11-12节) | 2 |

### By dayOfWeek

| dayOfWeek | count |
|-----------|------:|
| 1 (周一) | 95 |
| 2 (周二) | 70 |
| 3 (周三) | 82 |
| 4 (周四) | 94 |
| 5 (周五) | 78 |
| 6 (周六) | 11 |
| 7 (周日) | 10 |

## 5. Source Inventory

| Area | File | Current assumption |
|------|------|-------------------|
| Time-slot helper (K24-A4) | `src/lib/schedule/time-slots.ts` | `VALID_TEACHING_SLOT_INDEXES=[1..5]`; 6/7 are display-only |
| Display map (legacy compat) | `src/types/schedule.ts` | `SLOT_INDEX_MAP` 包含 1-7 (含 11-12节, 中午) |
| Schedule grid | `src/components/schedule-grid.tsx` | 渲染使用 `TIME_SLOTS` (来自 `types/schedule.ts`) |
| Schedule adjustment dialog | `src/components/schedule-adjustment-dialog.tsx` | 引用 `DAYS, TIME_SLOTS` (display) + `getTeachingSlotLabelOptions` (新) |
| Admin db schedule slot dialog | `src/components/admin-db/schedule-slot-dialog.tsx` | `slotIndex` 是 number select |
| Adjustment plan recommendation | `src/lib/schedule/adjustment-plan-recommendations.ts` | `DEFAULT_DAYS_WORKING=[1..5]`, `WEEKEND_DAYS=[6,7]`, `DEFAULT_SLOT_INDEXES = getValidTeachingSlotIndexes()` |
| Room recommendation | `src/lib/schedule/room-recommendations.ts` | 不做 slot/day 过滤 (delegated) |
| Conflict check | `src/lib/schedule/conflict-check.ts` | 读 `slot.dayOfWeek / slot.slotIndex` (无 range 假设) |
| Score | `src/lib/scheduler/score.ts` | `slotIndex >= 5` (SC3 extreme); `dayOfWeek >= 6` (SC7 weekend) |
| Solver | `src/lib/scheduler/solver.ts` | 读 `slotIndex/dayOfWeek` 来自 DB |
| Importer | `src/lib/import/importer.ts` | `slotIndex` 来自 parser；与 historical data 兼容 |
| seed | `scripts/seed_db.ts` | 不在 K26-B 范围；时间相关逻辑已 base |

## 6. UI Impact

| UI Component | Current source of slots | Needs config? | Risk |
|--------------|--------------------------|---------------|------|
| `schedule-grid.tsx` | `TIME_SLOTS` (7 entries) | YES (display only) | LOW (display 兼容 legacy 11-12) |
| `schedule-adjustment-dialog.tsx` | `DAYS, TIME_SLOTS` + `getTeachingSlotLabelOptions` | YES (display) | LOW (helper 切换) |
| `admin-db/schedule-slot-dialog.tsx` | `slotIndex` number select | YES (display) | LOW |
| `admin-db/columns.ts` | `getSlotLabelByIndex` | YES (display) | LOW |
| `dashboard/dashboard-content.tsx` | `TIME_SLOTS` | YES (display) | LOW |
| `store/scheduleStore.ts` | `TIME_SLOTS` | YES (display) | LOW |

UI 影响仅限 display-only (label/start/end)；当前没有可配置 disabled/enabled 概念。

## 7. Adjustment / Conflict Impact

| Backend / helper | Fixed assumption | Config impact | Risk |
|------------------|------------------|---------------|------|
| `adjustment-plan-recommendations.ts` | `DEFAULT_DAYS_WORKING=[1..5]`, `WEEKEND_DAYS=[6,7]`, `VALID_PREFERRED_DAY_VALUES=[1..5]` | 若"允许周末"运行时配置化，需要参数化 | MEDIUM |
| `room-recommendations.ts` | 不假设 slot range (delegated) | LOW | LOW |
| `conflict-check.ts` | 读 row data, 无 range 假设 | LOW | LOW |
| `dry-run` | uses conflict-check | LOW | LOW |
| `teaching-task-mutation-guard.ts` | 读 row data | LOW | LOW |
| `schedule-adjustment client` | uses adjustment-plan-recs | MEDIUM (preferred-day 过滤) | MEDIUM |

## 8. Scheduler / Score Impact

| Area | Current assumption | If configurable | Severity |
|------|-------------------|----------------|----------|
| `score.ts` SC3 extreme time | `slotIndex >= 5` 触发 -1 penalty | 若"较晚"节次可配置，阈值 + penalty 都需参数化 | HIGH |
| `score.ts` SC7 weekend | `dayOfWeek >= 6` 触发 -15 penalty | 若"周末开关"可配置，SC7 应从 SOFT penalty 改为 hard filter 或可调 penalty | HIGH |
| `solver.ts` candidate generation | 读 row data，无 range 过滤 | 若要"禁用某节次"，solver 需要过滤 candidates | MEDIUM |
| K22 score harness | 假设 SC3/SC7 阈值 | 任何变更需更新 K22 expected | HIGH (expected 改变) |
| Class gap (SC8) | 依赖 `Math.abs(slotIndex diff)` | LOW (只是距离) | LOW |
| Teacher day balance | 计数 `dayOfWeek` | LOW | LOW |
| SC9 room stability | 计数 room 切换 | LOW | LOW |

## 9. Schema Options

### Option A: Constant Config File Only

- 仅维护 label / start-end time 常量
- 不支持运行时管理
- 低风险
- **不满足**系统设置 UI 真正可编辑

### Option B: System Config JSON Field

- 单一 `SystemSetting` 表，存 JSON
- 迁移小，类型安全弱
- 版本管理复杂
- 可快速进入 UI，但需要 K22 score harness 重大调整

### Option C: Independent WorkTime / TimeSlotConfig Tables

- `WorkTimeConfig`
- `TimeSlotDefinition` (id, slotIndex, label, startTime, endTime, enabled)
- `SemesterTimeSlotConfig` (per-semester override)
- `dayOfWeekRule` (per-day disabledDays, allowWeekend, lunchBreak)

可支持：
- 不同学期不同作息
- 启用/禁用节次
- 起止时间
- 午休
- 是否允许周末
- 历史兼容

但：
- migration 大
- solver 需过滤 disabled slots
- score SC3/SC7 阈值需参数化
- K22 score harness expected 必变
- 历史 11-12 数据需要保留 read 路径

**推荐**：先做 K26-D static helper extraction（不动 schema），再决定是否进入 Option C。

## 10. Recommendation

**Direct implementation: BLOCKED**. K26-C 关闭后可继续 K26-D 静态 helper 抽取。

不允许直接实现 WorkTime 设置 UI 进入 K26-D：

- SC3/SC7 硬编码阈值未解
- 历史 11-12/周末 数据需保留
- K22 score harness 会变

```txt
是否可以直接实现系统设置 UI: 否 / 高风险
推荐下一阶段: K26-D-STATIC-TIME-SLOT-EXTRACTION
  - 只把所有 UI / helper 统一从 src/lib/schedule/time-slots.ts (或新 helper) 读取
  - 保持 1-5 有效节次
  - 兼容 legacy 11-12 / 中午 display
  - 不做设置 UI
  - 不动 schema
  - 不改 solver/score
blocked: direct WorkTime settings UI implementation
```

## 11. Non-Goals

本阶段**未做**：

- schema change
- migration
- DB 数据修改
- API 语义修改
- frontend UI 功能
- solver algorithm
- score.ts
- scheduler preview / apply
- adjustment recommendation
- room recommendation
- importer / parser
- RBAC permission model
- K22/K23/K24/K25 expected

## 12. Verification Results

| Command | Result |
|---------|--------|
| `npx tsx scripts/audit-time-slot-worktime-settings-k26-c.ts` | **PASS** (32/32) |
| `npx tsx scripts/verify-system-settings-shell-k26-a.ts` | **47/47 PASS** |
| `npx tsx scripts/verify-scheduler-config-settings-acceptance-closeout-k26-b.ts` | **38/38 PASS** |
| `npx tsx scripts/verify-scheduler-config-settings-integration-k26-b.ts` | **47/47 PASS** |
| `npx tsx scripts/verify-semester-settings-acceptance-closeout-k25.ts` | **38/38 PASS** |
| `npx tsx scripts/validate-multi-semester-schema-k25-c.ts` | **37/37 PASS** |
| `npx prisma validate` | **PASS** |
| `npx prisma migrate status` | **up to date** |
| `npm run build` | **PASS** |
| `npx eslint .` | **184 errors / 136 warnings (+0/+0 vs K26-B baseline)** |
| `npm run test:auth-foundation` | **53 passed / 1 failed (pre-existing)** |

### Risk Summary

| Level | Count | Items |
|-------|-------|-------|
| HIGH | 2 | SC3/SC7 硬编码阈值 (score.ts) ; Solver candidate filter 未实现 |
| MEDIUM | 2 | Adjustment plan search space 假设 ; 推荐算法 preferred-day 过滤 |
| LOW | 2 | UI 全部使用 display 兼容 ; Conflict-check 无 range 假设 |

**Direct implementation: BLOCKED**. K26-C 关闭后可继续 K26-D 静态 helper 抽取。
