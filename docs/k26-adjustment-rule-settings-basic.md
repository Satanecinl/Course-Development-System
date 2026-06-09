# K26-M1: Adjustment Rule Settings — Basic Implementation

## 1. Executive Summary

K26-M1 implements a **read-only** adjustment rules settings panel in the system settings center.

**What was built**:
- `GET /api/admin/settings/adjustment-rules` — returns rules, safeguards, WorkTime context
- `AdjustmentRulesSettingsPanel` — UI panel with summary, WorkTime context, rules list, safeguards, read-only notice
- Settings module registry: `adjustment-rules` status `planned` → `ready`

## 2. API Structure

```
GET /api/admin/settings/adjustment-rules
Permission: settings:manage

Response: { summary, rules[], safeguards[] }
```

## 3. Rules Displayed

| Key | Label | Status |
|-----|-------|--------|
| crossWeekAdjustment | 跨周调课 | active |
| weekendAdjustment | 周末调课 | active (controlled by WorkTime) |
| recommendationUsesWorkTime | 推荐使用 WorkTime | active |
| excludeLegacySlots | 排除 Legacy Slot 6/7 | active |
| preferredDayOfWeek | preferredDayOfWeek 支持 | active |
| defaultRecommendationLimit | 默认推荐方案数量 (5) | active |
| dryRunWorkTimeGuard | dry-run WorkTime guard | active |
| dryRunConflictCheck | dry-run 冲突检查 | active |
| applyGuardRequiresConfirmation | apply 需要确认 | active |
| noRoomAdjustmentAllowed | 无教室调课 | fixed |

## 4. Safeguards

All 7 safeguards active: WorkTime target guard, teacher/class/room conflict guards, capacity warning, confirmation guard, weekend target restriction.

## 5. Verification Results

| Command | Result |
|---------|--------|
| K26-M1 verify | **PASS** |
| K26-L1 verify | **PASS** |
| K26-K closeout | **PASS** |
| K22-C | **73/0/0/0** |
| build | **PASS** |
| lint | **184/146** |
| auth | **53/1** |

## 6. Next Stage

`K26-M2-ADJUSTMENT-RULE-SETTINGS-MANUAL-TRIAL`
