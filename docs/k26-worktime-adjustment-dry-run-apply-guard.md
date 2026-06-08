# K26-I2: WorkTime Adjustment Dry-Run / Apply Guard

## 1. Executive Summary

K26-I2 integrates the resolved WorkTime configuration into the schedule adjustment dry-run and apply flow as a **backend guard**. This ensures that:

- MOVE targets with `slotIndex=6` (11-12节) or `slotIndex=7` (中午) are blocked at the validation layer
- MOVE targets on weekend days are blocked when `allowWeekend=false`
- MOVE targets on disabled or non-teaching slots are blocked
- The guard fires **before** any conflict check or DB write

**Scope**: backend guard only. Room recommendation, frontend dialog, solver/score unchanged.

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Tracking | `origin/master` |
| Local HEAD before | `e9b409b` |
| Remote HEAD before | `e9b409b` |
| Fetch | yes |
| Pull/rebase | no |
| Push | yes |
| Push target | `origin/master` |
| Force push | no |

## 3. Guard Contract

### `checkWorkTimeTargetAllowed(workTime, target)`

Location: `src/lib/worktime/worktime-schedule-resolver.ts`

```ts
export type WorkTimeTargetCheckResult =
  | { ok: true }
  | {
      ok: false
      code: WorkTimeTargetErrorCode
      message: string
      details?: Record<string, unknown>
    }
```

**Rules** (in priority order):

1. **Day check**: weekday (1-5) always allowed. Weekend (6/7) only if `allowWeekend=true`.
2. **Legacy slot 6/7**: returns `WORKTIME_SLOT_LEGACY_ONLY` — these are historical display-only.
3. **DB-level legacy**: `isLegacyDisplay=true` slots return `WORKTIME_SLOT_LEGACY_ONLY`.
4. **Inactive/non-teaching**: returns `WORKTIME_SLOT_DISABLED`.

**Error codes**:

| Code | Meaning |
|------|---------|
| `WORKTIME_WEEKEND_DISABLED` | Weekend not allowed by WorkTime config |
| `WORKTIME_DAY_DISABLED` | Day value not in allowed set |
| `WORKTIME_SLOT_LEGACY_ONLY` | Slot is legacy display (6/7 or isLegacyDisplay) |
| `WORKTIME_SLOT_DISABLED` | Slot is inactive, non-teaching, or not in active list |

**Read-only**: never writes to DB.

## 4. Input Validation Changes

**File**: `src/lib/schedule/adjustments.ts` → `validateScheduleAdjustmentInput()`

| Before | After |
|--------|-------|
| `newSlotIndex ∈ [1, 6]` | `newSlotIndex ∈ [1, 5]` |

This blocks `newSlotIndex=6` (11-12节) and `newSlotIndex=7` (中午) at the basic numeric validation level, before any WorkTime resolution. Consistent with room-recommendation route's `targetSlotIndex ∈ [1,5]` cap.

## 5. Dry-Run Changes

**File**: `src/lib/schedule/adjustments.ts` → `dryRunScheduleAdjustment()`

After semester resolution and before the MOVE conflict check:

```ts
const workTime = await resolveWorkTimeConfigForSchedule(semesterId)
const wtCheck = checkWorkTimeTargetAllowed(workTime, { dayOfWeek, slotIndex })
if (!wtCheck.ok) {
  conflicts.push({
    type: 'WORKTIME_TARGET_BLOCKED',
    message: wtCheck.message,
    severity: 'error',
    workTimeErrorCode: wtCheck.code,
    workTimeDetails: wtCheck.details,
  })
  return { canApply: false, conflicts, warnings }
}
```

- Guard fires **before** `getEffectiveScheduleForWeek()` (no DB reads for conflict check if WorkTime fails)
- CANCEL type bypasses the WorkTime guard (no target day/slot)
- Resolution errors caught gracefully with fallback conflict

## 6. Apply Changes

**File**: `src/lib/schedule/adjustments.ts` → `createScheduleAdjustment()`

No direct changes — `createScheduleAdjustment` delegates to `dryRunScheduleAdjustment` first. If `canApply=false` (including WorkTime block), it returns `{ success: false, dryRun }` without writing to DB.

**Routes** (`dry-run/route.ts`, `route.ts`): No changes needed. WorkTime errors surface via the `conflicts` array in the dry-run result.

## 7. Error Codes

| Code | Used | Status |
|------|------|--------|
| `WORKTIME_SLOT_DISABLED` | Yes — inactive/non-teaching slots | Active |
| `WORKTIME_SLOT_LEGACY_ONLY` | Yes — slot 6/7 or isLegacyDisplay | Active |
| `WORKTIME_WEEKEND_DISABLED` | Yes — weekend when allowWeekend=false | Active |
| `WORKTIME_DAY_DISABLED` | Yes — day not in weekday/weekend set | Active |
| `WORKTIME_RESOLUTION_FAILED` | — | Reserved for future |

## 8. Compatibility

| Component | Status |
|-----------|--------|
| Plan recommendation | Unchanged (K26-I1 behavior preserved) |
| Room recommendation | Unchanged |
| Frontend dialog | Unchanged |
| Conflict-check kernel | Unchanged (pure conflict engine, no WorkTime awareness) |
| Solver | Unchanged |
| Score | Unchanged |
| K22 expected | Unchanged |
| K23/K24/K25 expected | Unchanged |
| Schema | Unchanged |
| Migration | Unchanged |

## 9. Verification Results

| Command | Result |
|---------|--------|
| `verify-worktime-adjustment-dry-run-apply-guard-k26-i2.ts` | **45/45 PASS** |
| `verify-worktime-plan-recommendation-integration-k26-i1.ts` | **36/36 PASS** |
| `audit-worktime-recommendation-integration-k26-i.ts` | **44/44 PASS** |
| `verify-worktime-settings-ui-acceptance-closeout-k26-h.ts` | **52/52 PASS** |
| `verify-worktime-runtime-prisma-delegate-k26-h2a.ts` | **15/15 PASS** |
| `verify-worktime-settings-ui-k26-h.ts` | **43/43 PASS** |
| `verify-worktime-api-k26-g.ts` | **40/40 PASS** |
| `verify-worktime-post-schema-regression-k26-f1.ts` | **30/30 PASS** |
| `validate-worktime-schema-k26-f.ts` | **30/30 PASS** |
| `backfill-worktime-default-config-k26-f.ts --dry-run` | **PASS** (0 missing) |
| `plan-worktime-schema-k26-e.ts` | **34/34 PASS** |
| `verify-static-time-slot-extraction-k26-d.ts` | **39/39 PASS** |
| `verify-semester-settings-acceptance-closeout-k25.ts` | **38/38 PASS** |
| `validate-multi-semester-schema-k25-c.ts` | **PASS** |
| `prisma validate` | **PASS** |
| `prisma migrate status` | **up to date** (8 migrations) |
| `npm run build` | **PASS** |
| `npm run lint` | **184 errors / 146 warnings (+0/+0 vs committed baseline)** |
| `npm run test:auth-foundation` | **53 passed / 1 failed (pre-existing)** |

**Pre-existing verify results** (not caused by K26-I2):
- K26-C audit: `blocking=true` (pre-existing audit findings, not verify failures)
- K26-A verify: `PASS=46 FAIL=1` (pre-existing: `time-slot has recommendedStage`)

## 10. Recommended Next Stage

`K26-I3-WORKTIME-ROOM-RECOMMENDATION-GUARD`

K26-I3 will integrate WorkTime guard into the room recommendation helper (`room-recommendations.ts`), ensuring `targetSlotIndex` and `targetDayOfWeek` respect the resolved WorkTime config. Still prohibited: solver/score integration (K26-J).
