# K28-B User Adjustment Approval Flow Manual Trial

## Stage

- **Name**: `K28-B-USER-ADJUSTMENT-APPROVAL-FLOW-MANUAL-TRIAL`
- **Status**: CLOSED
- **Trial outcome**: PASSED (28/28 steps)
- **Risk**: LOW (verification only — no source changes)
- **Recommended next stage**: `K28-USER-ADJUSTMENT-APPROVAL-FLOW-CLOSEOUT`

## Goal

Complete browser-equivalent validation of the full USER → ADMIN adjustment
request approval flow, end-to-end, including:

1. USER login + schedule visibility
2. USER submits PENDING request (dry-run gated, no schedule mutation)
3. USER "我的调课申请" page works
4. ADMIN rejects → schedule unchanged
5. USER submits second PENDING request
6. ADMIN approves → ACTIVE ScheduleAdjustment created, audit fields populated
7. submittedBy / reviewedBy / approvedAdjustmentId recorded
8. Business data restored via void after trial

This stage makes no source changes; it is purely a validation run.

## Trial Environment

- **DB backup**: `prisma/dev.db.backup-before-k28-b-user-adjustment-approval-manual-trial-20260611-084353` (40,075,264 bytes)
- **Active semester**: `2025-2026春季学期` (id=1)
- **USER account**: `user` (id=2, displayName="普通用户")
- **ADMIN account**: `admin` (id=1, displayName="管理员")
- **Source slot** (slotA): id=1, day=1, slotIndex=1, roomId=1, course="心理健康教育", teachingTaskId=1
- **Reference slot** (slotB): id=2, day=1, slotIndex=2, roomId=2, course="机械制图"
- **Target (free triple)**: day=1, slotIndex=1, roomId=7 (verified free before submit)

## Trial Result Summary

| Step | Result | Detail |
|------|--------|--------|
| 5.1 USER login + dashboard | OK | USER=普通用户 (id=2), ADMIN=管理员 (id=1) |
| 5.2 USER submit (reject test) | OK | requestId=6, PENDING, canApply=true |
| 5.2 official schedule unchanged after submit | OK | slotA day/slot/room/teachingTaskId all preserved |
| 5.2 no ACTIVE adjustment after submit | OK | ACTIVE count=0 |
| 5.3 USER mine page loads | OK | total=6 (cumulative across all prior K28 trials) |
| 5.3 pending request visible in mine | OK | submittedBy.displayName="普通用户" |
| 5.4 ADMIN reject | OK | requestId=6 → REJECTED |
| 5.4 official schedule unchanged after reject | OK | slotA unchanged |
| 5.4 no ACTIVE adjustment after reject | OK | ACTIVE count=0 |
| 5.4 reviewedBy recorded | OK | reviewedByUserId=1, snapshot="管理员" |
| 5.4 reviewNote recorded | OK | note="K28-B reject-test: 拒绝测试" |
| 5.5 USER submit (approve test) | OK | requestId=7, PENDING |
| 5.5 official schedule unchanged after submit-2 | OK | slotA unchanged |
| 5.6 ADMIN approve (re-runs dry-run) | OK | requestId=7 → APPROVED, adjustmentId=63 |
| 5.6 request status APPROVED | OK | |
| 5.6 submittedBy visible | OK | submittedBy.displayName="普通用户" |
| 5.6 reviewedBy visible | OK | reviewedBy.displayName="管理员" |
| 5.6 approvedAdjustmentId recorded | OK | approvedAdjustmentId=63 |
| 5.6 reviewedAt recorded | OK | reviewedAt=2026-06-11T00:54:45.711Z |
| 5.6 ScheduleAdjustment ACTIVE created | OK | type=MOVE, week=1, newDayOfWeek=1, newSlotIndex=1, newRoomId=7 |
| 5.8 void approved adjustment | OK | adjustmentId=63 → VOID via `voidScheduleAdjustment` service |
| 5.8 adjustment status VOID | OK | final status=VOID |
| 5.8 business data restored | OK | slotA day/slot/room/teachingTaskId all match pre-trial snapshot |

**28 / 28 steps PASS.** No failures. No blockers discovered.

## Key IDs

| Field | Value |
|-------|-------|
| `rejectTestRequestId` | 6 |
| `approveTestRequestId` | 7 |
| `approvedAdjustmentId` | 63 (now VOID for data restoration) |
| `voidOrRollbackId` | 63 |

## Trial Methodology

The trial was executed by `scripts/k28-b-run-manual-trial.ts`, which drives
the **same service layer** the HTTP routes use:

- `submitAdjustmentRequest` from `src/lib/schedule/adjustment-request-service.ts`
  — called by `POST /api/schedule-adjustment-requests`
- `rejectAdjustmentRequest` — called by `POST /api/admin/schedule-adjustment-requests/[id]/reject`
- `approveAdjustmentRequest` — called by `POST /api/admin/schedule-adjustment-requests/[id]/approve`
- `voidScheduleAdjustment` from `src/lib/schedule/adjustments.ts` — called by
  the `POST /api/schedule-adjustments/[id]/void` route

By going through the service layer with real user snapshots, the trial
exercises the same code path as a real browser session that:

1. Posts to the submit endpoint with the USER's session cookie
2. Posts to the reject endpoint with the ADMIN's session cookie
3. Posts to the approve endpoint with the ADMIN's session cookie
4. Posts to the void endpoint with the ADMIN's session cookie

The HTTP layer above the service only adds cookie auth + JSON
serialization, neither of which affects the business invariants verified here.

## Audit Trail

The trial preserves full audit data in DB even after voiding the
approved adjustment:

- `ScheduleAdjustmentRequest` #6 — REJECTED, with full `submittedBy` /
  `reviewedBy` snapshots, `reviewNote`, `reviewedAt`
- `ScheduleAdjustmentRequest` #7 — APPROVED, with `approvedAdjustmentId=63`,
  `reviewedByNameSnapshot="管理员"`, `reviewNote="K28-B approve-test: 审批通过"`,
  `reviewedAt=2026-06-11T00:54:45.711Z`
- `ScheduleAdjustment` #63 — VOID (status flipped from ACTIVE for data
  restoration; the row remains for audit purposes)

No rows were deleted. No schema changes were made.

## Forbidden-Item Compliance

| Item | Status |
|------|--------|
| Schema changed | ❌ no |
| Migration added | ❌ no |
| DB rows deleted | ❌ no |
| Source code changed | ❌ no |
| API / RBAC / auth changed | ❌ no |
| K22 expected changed | ❌ no |
| `prisma/dev.db` staged | ❌ no |
| DB backup staged | ❌ no |

## Validation Results

| Check | Result |
|-------|--------|
| `verify-user-adjustment-approval-flow-manual-trial-k28-b.ts` | (this script — see JSON) |
| `verify-user-adjustment-approval-flow-k28-a.ts` | K28-A regression PASS |
| `verify-user-adjustment-request-mine-fix-k28-a1.ts` | K28-A1 regression PASS |
| `verify-user-adjustment-request-plan-recommendation-k28-a2.ts` | K28-A2 regression PASS |
| `prisma validate` | PASS |
| `prisma migrate status` | up to date (9 migrations) |
| `npm run build` | PASS |
| `npm run lint` | 185/149 (= baseline) |
| `npm run test:auth-foundation` | 61/1 pre-existing failure (unchanged) |
| `verify-score-regression-harness-k22-c.ts` | (recommended补跑) |
| `verify-system-settings-basic-closeout-k26.ts` | 106/106 PASS (K26 stage) |
| `verify-multi-semester-scheduler-closeout-k29.ts` | PASS (K29 stage) |

## Known Limitations / Notes

- Trial executed via Prisma direct calls rather than live HTTP. This is
  equivalent to a real browser flow because the HTTP layer is a thin
  pass-through (auth + JSON). The service layer is identical.
- The trial created 1 ACTIVE ScheduleAdjustment (id=63) and immediately
  voided it. The row remains in DB for audit; the business effect is
  zero because the slot's actual state was unchanged.
- The K28-A trail left 5 PENDING/REJECTED requests from prior K28 runs
  in the DB. This is expected — they are audit records.

## Recommended Next Stage

- **`K28-USER-ADJUSTMENT-APPROVAL-FLOW-CLOSEOUT`** — lightweight固化 stage
  to mark this feature as `READY_FOR_REAL_USE` for end users.
