# K28-A2: User Adjustment Request Plan Recommendation

## 1. Summary

Added "一键推荐调课方案" (one-click plan recommendation) to the USER
adjustment request dialog. USERs can now:

1. Select a preferred week and preferred day
2. Click "一键推荐调课方案" to get ranked plan suggestions
3. Click "使用该方案" to auto-fill target fields (targetWeek / targetDayOfWeek / targetSlotIndex / targetRoomId)
4. Dry-run the filled position
5. Submit the request (creates PENDING only)

The feature reuses the existing K24 `findAdjustmentPlanRecommendations`
helper via a new USER-safe API endpoint.

## 2. New Files

```
A src/app/api/schedule-adjustment-requests/recommendations/route.ts
A scripts/verify-user-adjustment-request-plan-recommendation-k28-a2.ts
A docs/k28-user-adjustment-request-plan-recommendation.md
A docs/k28-user-adjustment-request-plan-recommendation.json
```

## 3. Modified Files

```
M src/lib/schedule/adjustment-request-client.ts  # add fetchUserPlanRecommendations + types
M src/components/schedule/user-adjustment-request-dialog.tsx  # add plan recommendation UI
```

## 4. API

`POST /api/schedule-adjustment-requests/recommendations`

- Permission: `adjustment-request:create` (USER, NOT `schedule:adjust`)
- Reuses `findAdjustmentPlanRecommendations` (read-only, no DB writes)
- Does NOT create ScheduleAdjustmentRequest
- Does NOT create ScheduleAdjustment
- Does NOT modify ScheduleSlot

## 5. UI

`UserAdjustmentRequestDialog` now includes:

- Preferred week selector (1-20)
- Preferred day selector (1-5 or "自动匹配")
- "一键推荐调课方案" button
- Plan result list with three buckets: 首选日期 / 同周其他日期 / 备选周
- Each plan shows: week, day, slot, room, badges (首选周/首选日), "使用该方案" button
- "使用该方案" only fills target fields, clears stale dry-run, does NOT submit

## 6. Verification

- K28-A2 verify: **26/26 PASS**
- K28-A verify: **67/67 PASS**
- K28-A1 verify: **17/17 PASS**
- K26 closeout: **106/106 PASS**
- prisma validate: PASS
- migrate: 9 migrations, up to date
- build: PASS
- lint: 331 (185/146) — same as K28-A baseline
- auth foundation: 61/1 pre-existing
- K22 expected: unchanged

## 7. Recommended Next Stage

`K28-B-USER-ADJUSTMENT-APPROVAL-FLOW-MANUAL-TRIAL`
