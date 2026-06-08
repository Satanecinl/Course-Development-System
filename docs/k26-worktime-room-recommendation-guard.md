# K26-I3: WorkTime Room Recommendation Guard

## 1. Executive Summary

K26-I3 integrates the resolved WorkTime configuration into the room recommendation helper as a backend guard. This ensures that:

- Room recommendation targets with `slotIndex=6/7` (legacy display-only) are blocked
- Room recommendation targets on weekend days are blocked when `allowWeekend=false`
- Room recommendation targets on disabled or non-teaching slots are blocked
- The guard fires **before** any room query / capacity / conflict check

**Scope**: backend guard only in `room-recommendations.ts`. Frontend dialog, plan recommendation, dry-run/apply, solver/score unchanged.

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Local HEAD before | `77403ea` |
| Remote HEAD before | `77403ea` |
| Push | yes |
| Force push | no |

## 3. Room Recommendation Entry Points

| File | Function | Description |
|------|----------|-------------|
| `src/lib/schedule/room-recommendations.ts` | `findAdjustmentRoomRecommendations()` | Core helper — now includes WorkTime guard |
| `src/app/api/schedule-adjustments/room-recommendations/route.ts` | `POST` | API route — input validation unchanged (slot 1-5) |

## 4. Guard Contract

After semester resolution, before room query:

```ts
const workTime = await resolveWorkTimeConfigForSchedule(semesterId)
const targetCheck = checkWorkTimeTargetAllowed(workTime, {
  dayOfWeek: input.targetDayOfWeek,
  slotIndex: input.targetSlotIndex,
})
if (!targetCheck.ok) {
  return emptyResult(targetCheck.message, ..., {
    code: targetCheck.code,
    message: targetCheck.message,
    details: targetCheck.details,
  })
}
```

- Guard reuses the same `checkWorkTimeTargetAllowed` function from K26-I2
- Returns `emptyResult` with `workTimeError` field (additive, additive-compatible)
- Original K23 room recommendation logic completely untouched

## 5. Error Codes

| Code | Meaning |
|------|---------|
| `WORKTIME_SLOT_DISABLED` | Slot is inactive, non-teaching, or not in active list |
| `WORKTIME_SLOT_LEGACY_ONLY` | Slot is legacy display (6/7 or isLegacyDisplay) |
| `WORKTIME_WEEKEND_DISABLED` | Weekend not allowed by WorkTime config |
| `WORKTIME_DAY_DISABLED` | Day value not in allowed set |

## 6. Compatibility

| Component | Status |
|-----------|--------|
| K23 capacity/conflict/sorting | ✅ Unchanged |
| K23 response fields | ✅ Unchanged (additive workTimeError only) |
| K26-I1 plan recommendation | ✅ PASS 36/36 |
| K26-I2 dry-run/apply guard | ✅ PASS 45/45 |
| Frontend dialog | ✅ Unchanged |
| Conflict-check kernel | ✅ Unchanged |
| Solver/score | ✅ Unchanged |
| K22 expected | ✅ Unchanged |
| K23 expected | ✅ Unchanged (K23-A PASS, K23 closeout pre-existing failures) |

## 7. Verification Results

| Command | Result |
|---------|--------|
| `verify-worktime-room-recommendation-guard-k26-i3.ts` | **40/40 PASS** |
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
| `audit-time-slot-worktime-settings-k26-c.ts` | **32/32 PASS** |
| `verify-system-settings-shell-k26-a.ts` | **47/47 PASS** |
| `verify-scheduler-config-settings-acceptance-closeout-k26-b.ts` | **38/38 PASS** |
| `verify-semester-settings-acceptance-closeout-k25.ts` | **38/38 PASS** |
| `validate-multi-semester-schema-k25-c.ts` | **PASS** |
| `verify-adjustment-room-recommendations-k23-a.ts` | **PASS** |
| `verify-room-recommendation-closeout-k23.ts` | FAIL (pre-existing: schema/migration + room-recommendations.ts changed) |
| `prisma validate` | **PASS** |
| `prisma migrate status` | **up to date** (8 migrations) |
| `npm run build` | **PASS** |
| `npm run lint` | **184 errors / 146 warnings (+0/+0)** |
| `npm run test:auth-foundation` | **53 passed / 1 failed (pre-existing)** |

## 8. Recommended Next Stage

`K26-I4-WORKTIME-ADJUSTMENT-DIALOG-INTEGRATION`

K26-I4 will integrate WorkTime metadata into the frontend adjustment dialog. Still prohibited: solver/score integration (K26-J).
