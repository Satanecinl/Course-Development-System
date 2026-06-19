# K38-A Adjustment Rules Settings — Safe Basics

## Stage

```text
K38-A-ADJUSTMENT-RULES-SETTINGS-EDITABLE-PLAN-AND-SAFE-BASICS
```

## 1. Purpose

Upgrade adjustment rules settings module from "只读基础版" to "诊断增强版":
group rules, surface editability, document hard-locked status, surface
defaultRecommendationLimit and WorkTime context. No PATCH (Route B — no
schema change).

## 2. Reconnaissance Summary

| Aspect | Finding |
|---|---|
| API route | `src/app/api/admin/settings/adjustment-rules/route.ts` (GET only) |
| UI panel | `src/components/settings/adjustment-rules-settings-panel.tsx` |
| Client helper | `src/lib/settings/adjustment-rules-client.ts` |
| Rules | Hardcoded array in route.ts (K26-M1) |
| Recommendation limit | Code: `DEFAULT_LIMIT=5, MAX_LIMIT=20` in `adjustment-plan-recommendations.ts:57-58` |
| Config table | None — `SchedulingConfig` exists but for solver config, not for adjustment rules |
| Permission | `settings:manage` |
| Hard guards | Not closable (already locked) |

## 3. Route: B (no PATCH, no schema)

**Rationale:**
- No safe persistent config location for `defaultRecommendationLimit`
- K38-B stage (future) can add `SchedulingConfig` or a new `AdjustmentConfig` table
- All rules remain hard-locked from UI; only diagnostics surface
- Backward compatible: API adds fields, no client breaking changes

## 4. API Changes

### New response fields

| Field | Type | Description |
|---|---|---|
| `moduleVersion` | `"K38-A"` | Stage marker |
| `workTimeContext` | object | Enhanced WorkTime info (config name, weekend behavior) |
| `groups` | object | Group labels and descriptions |
| `rules` | `Record<group, Rule[]>` | Grouped rules (worktime / recommendation / dry-run / apply) |
| `editability` | object | Which fields could be editable (all false) |
| `defaultRecommendationLimit` | object | Current/min/max + editability + note |

### Group taxonomy

| Group | Rules |
|---|---|
| `worktime` | workTimeConfigSource, allowWeekend, activeSlotIndexes, legacySlotIndexes |
| `recommendation` | recommendationUsesWorkTime, excludeLegacySlots, preferredDayOfWeek, defaultRecommendationLimit, roomRecommendationIntegrated |
| `dry-run` | crossWeekAdjustment, dryRunWorkTimeGuard, dryRunConflictCheck |
| `apply` | applyGuardRequiresConfirmation, noRoomAdjustmentAllowed |

### Hard guards (unchanged)

- workTimeTargetGuard, teacherConflictGuard, classGroupConflictGuard, roomConflictGuard
- capacityWarningGuard (warning severity)
- confirmationGuard
- weekendTargetGuard (controlled by WorkTime)

## 5. UI Changes

| Aspect | Before | After |
|---|---|---|
| Header badge | "只读基础版" | **"诊断增强版"** |
| Summary cards | 4 | 8 (added dry-run guard, apply guard, defaultRecommendationLimit, active slots count) |
| WorkTime context | Flat list | **Enhanced with weekendBehavior** (clickable explanation) |
| defaultRecommendationLimit | Hidden | **Surfaced with current/min/max + source + note** |
| Rules | Flat list | **Grouped (worktime / recommendation / dry-run / apply)** |
| Notice | "只读基础版" | **Editability matrix with K38-B future note** |

## 6. Editable vs Locked

| Field | Status | Reason |
|---|---|---|
| dry-run guard | **hard-locked** | System safety |
| apply guard | **hard-locked** | Confirmation gate |
| WorkTime allowWeekend | **linked to WorkTime settings** | Single source of truth |
| defaultRecommendationLimit | **code-controlled, request-overridable** | K38-B for UI persistence |
| Recommendation rules | code-fixed | Algorithm integrity |
| Conflict rules | hard-locked | Data integrity |

## 7. Permissions

- GET: `settings:manage` (unchanged)
- PATCH: not implemented (K38-B)
- No new RBAC keys

## 8. WorkTime / Recommendation / dry-run / apply Coverage

| Component | Status |
|---|---|
| WorkTime integration | ✅ surfaced with source + configName |
| Recommendation integration | ✅ grouped, all rules visible |
| dry-run guard | ✅ hard-locked, listed |
| apply guard | ✅ hard-locked, listed |
| Weekend control | ✅ linked to WorkTime, not separately editable |
| allowWeekend behavior | ✅ explained in weekendBehavior text |

## 9. Verification Results

| Item | Result |
|---|---|
| K38-A verify | ✅ 22/22 PASS |
| K37-C verify | ✅ 23/23 PASS |
| K37-B2 runtime fix | ✅ 17/17 PASS |
| K22-C regression | ✅ 73/0/0/0 (restored) |
| PII scan | ✅ 0 BLOCKING |
| Prisma validate | ✅ valid |
| Prisma migrate status | ✅ up to date (11 migrations) |
| Build | ✅ PASS |
| ESLint | ✅ 0 errors |

## 10. Risk

- No schema change
- No scheduler/score change
- K22 unchanged
- Hard guards preserved
- Backward compatible
