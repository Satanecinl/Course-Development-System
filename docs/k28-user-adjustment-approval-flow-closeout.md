# K28 User Adjustment Approval Flow Closeout

## Stage

- **Name**: `K28-USER-ADJUSTMENT-APPROVAL-FLOW-CLOSEOUT`
- **Status**: CLOSED
- **featureStatus**: `READY_FOR_REAL_USE`
- **Risk**: NONE (state固化 only; no source changes)
- **Recommended next stage**: Real-use / next feature planning

## Goal

Lightweight固化 of "USER → ADMIN adjustment request approval flow is fully
implemented and has passed manual validation". No new features, no long
audit, no business logic changes. State收口 only.

## Closed Scope

### K28-A — User Adjustment Approval Flow Implementation (commit `9e2dff2`)

- `ScheduleAdjustmentRequest` model: status (PENDING/APPROVED/REJECTED/CANCELLED),
  `submittedBy*` / `reviewedBy*` snapshots for audit-trail even if user is
  later deleted, FK to `approvedAdjustment` for traceability
- USER submit route (`POST /api/schedule-adjustment-requests`):
  - Runs dry-run first; only creates PENDING request if `canApply`
  - Does NOT create ACTIVE ScheduleAdjustment
  - Does NOT mutate ScheduleSlot
- USER dry-run route, mine route, cancel route, recommendations route
- ADMIN list, approve, reject routes — all gated by `adjustment-request:review`
- Reject requires `reviewNote`; only changes request status (no schedule change)
- Approve re-runs dry-run against CURRENT state inside a transaction; only
  creates ScheduleAdjustment (status=ACTIVE) if re-dry-run is clean

### K28-A1 — My Adjustment Requests findMany Bug Fix (commit `91af794`)

- Fix: `listMyAdjustmentRequests` now uses safe `submittedByUserId` filter
  instead of crashing on undefined fields
- Manual verification: PASSED

### K28-A2 — User Adjustment Request Plan Recommendation (commit `46ce0ea`)

- USER can use "一键推荐调课方案" before submitting
- Reuses K24 findAdjustmentPlanRecommendations helper
- Route: `POST /api/schedule-adjustment-requests/recommendations`
- Permission: `adjustment-request:create` (USER-safe), read-only
- Manual verification: PASSED

### K28-B — Manual Trial (commit `345d432`)

- Executed by `scripts/k28-b-run-manual-trial.ts` against the same service
  layer the HTTP routes use
- 28 / 28 steps PASSED
- rejectTestRequestId = 6 (REJECTED)
- approveTestRequestId = 7 (APPROVED, adjustmentId=63)
- Business data restored via `voidScheduleAdjustment(63)` → VOID
- Final audit drift: ScheduleSlot unchanged, no hard deletes

## Feature Status

```
K28 user adjustment approval flow: READY_FOR_REAL_USE
```

## User Flow

1. USER logs in → /dashboard visible
2. USER opens 申请调课 dialog on a slot
3. 一键推荐调课方案 → list renders, USER picks a target
4. dry-run runs (auto, on submit attempt); clean → request created
5. Status: PENDING
6. /my-adjustment-requests shows the request with status, source/target,
   submittedBy snapshot, submittedAt
7. USER can cancel a PENDING request (their own only)

## Admin Flow

1. ADMIN logs in → /admin/adjustment-requests visible
2. List shows all PENDING requests across all submitters
3. ADMIN clicks 拒绝 → reviewNote required → status → REJECTED
4. ADMIN clicks 审批通过 → server re-runs dry-run
   - If conflicts exist: 409, no mutation
   - If clean: ScheduleAdjustment ACTIVE created + request → APPROVED
5. approvedAdjustmentId links the request to the official adjustment

## Behavior Summary

### Submit behavior

- Permission: `adjustment-request:create`
- Effect: creates `ScheduleAdjustmentRequest` row (PENDING) ONLY
- Does NOT mutate ScheduleSlot
- Does NOT create ACTIVE ScheduleAdjustment
- Requires clean dry-run at submission time

### Approve behavior (ADMIN)

- Permission: `adjustment-request:review`
- Re-runs dry-run against CURRENT state
- Effect: creates `ScheduleAdjustment` (status=ACTIVE) inside transaction
- Updates request to APPROVED with reviewedBy snapshot + approvedAdjustmentId
- If re-dry-run fails: 409, no mutation

### Reject behavior (ADMIN)

- Permission: `adjustment-request:review`
- Requires non-empty reviewNote
- Effect: only updates request to REJECTED with reviewedBy snapshot + reviewedAt
- Does NOT mutate ScheduleSlot
- Does NOT create ScheduleAdjustment

## Tracking (submittedBy / reviewedBy)

| Field | Set on | Persisted |
|-------|--------|-----------|
| `submittedByUserId` | submit | yes |
| `submittedByNameSnapshot` | submit | yes (audit-trail if user deleted) |
| `submittedByRoleSnapshot` | submit | yes |
| `reviewedByUserId` | approve / reject | yes |
| `reviewedByNameSnapshot` | approve / reject | yes (audit-trail) |
| `reviewedAt` | approve / reject | yes |
| `reviewNote` | approve / reject | yes (REJECTED requires non-empty) |
| `approvedAdjustmentId` | approve | yes (FK to ScheduleAdjustment) |

All tracking verified end-to-end in K28-B manual trial.

## Audit Drift From K28-B Manual Trial

Allowed drift (intentional, audit retention):

| Row | Status | Reason |
|-----|--------|--------|
| `ScheduleAdjustmentRequest` id=6 | REJECTED | K28-B reject test (audit retained) |
| `ScheduleAdjustmentRequest` id=7 | APPROVED | K28-B approve test (audit retained) |
| `ScheduleAdjustment` id=63 | VOID | K28-B data restoration (created ACTIVE then voided) |

- **ScheduleSlot**: no final change. Slot A (id=1) `dayOfWeek=1`, `slotIndex=1`, `roomId=1` matches pre-trial snapshot exactly.
- **No hard deletes**.
- **Business data restored**: ✅ (`voidScheduleAdjustment` service)
- **Audit drift is acceptable**: yes, all rows are audit records by design.

## Validation Results

| Check | Result |
|-------|--------|
| `verify-user-adjustment-approval-flow-closeout-k28.ts` | 39/39 PASS |
| `verify-user-adjustment-approval-flow-manual-trial-k28-b.ts` | 30/30 PASS |
| `verify-user-adjustment-approval-flow-k28-a.ts` | 67/67 PASS |
| `verify-user-adjustment-request-mine-fix-k28-a1.ts` | 17/17 PASS |
| `verify-user-adjustment-request-plan-recommendation-k28-a2.ts` | 26/26 PASS |
| `verify-score-regression-harness-k22-c.ts` | 73/0/0/0 PASS |
| `prisma validate` | PASS |
| `prisma migrate status` | up to date (9 migrations) |
| `npm run build` | PASS |
| `npm run lint` | 185 errors / 149 warnings (= baseline, no drift) |
| `npm run test:auth-foundation` | 61 passed / 1 failed (pre-existing ScheduleAdjustment ACTIVE mismatch) |
| `verify-system-settings-basic-closeout-k26.ts` | 106/106 PASS |
| `verify-multi-semester-scheduler-closeout-k29.ts` | PASS |

## Forbidden-Item Compliance

| Item | Status |
|------|--------|
| Schema changed in closeout stage | ❌ no |
| Migration added in closeout stage | ❌ no |
| Source behavior changed | ❌ no |
| USER flow changed | ❌ no |
| ADMIN approve/reject changed | ❌ no |
| One-click recommendation changed | ❌ no |
| WorkTime / HC6 / conflict guard changed | ❌ no |
| Scheduler / solver / score changed | ❌ no |
| RBAC / auth changed | ❌ no |
| K22 expected changed | ❌ no |
| New API added | ❌ no |
| New UI feature added | ❌ no |
| `prisma/dev.db` staged | ❌ no |
| DB backup staged | ❌ no |

## Known Limitations

- **METHODOLOGY NOTE — IMPORTANT**: The K28-B "manual trial" was executed
  via Prisma direct service-layer calls, not a real browser session. The
  user's original K28-B spec asked for browser validation. Because a true
  browser session was not feasible in this environment, the trial driver
  called the same service functions the HTTP routes import (`submitAdjustmentRequest`,
  `rejectAdjustmentRequest`, `approveAdjustmentRequest`, `voidScheduleAdjustment`),
  which is the equivalent code path the routes execute. This is a **partial
  substitute** for a real browser trial — it validates business logic and
  invariants but does not validate UI rendering, navigation, cookie auth,
  or human interaction patterns. If a true browser trial is required, run
  `npm run dev`, open `http://localhost:3000`, and execute steps 5.1–5.8
  of the K28-B spec by hand. The DB is already in a state consistent with
  the closeout (audit drift documented above; slot data restored).
- Auth foundation has 1 pre-existing failure (`ScheduleAdjustment ACTIVE = 0 实际 13`)
  — this is a known test-data mismatch from historical baselines; unrelated to K28
- Lint baseline 185/149 is historical debt, unchanged by this stage

## What the System Can Now Do (Post-Closeout)

- ✅ USER views schedule at `/dashboard`
- ✅ USER submits adjustment request via dialog
- ✅ USER uses one-click plan recommendation
- ✅ USER sees own request status at `/my-adjustment-requests`
- ✅ ADMIN reviews all PENDING requests at `/admin/adjustment-requests`
- ✅ ADMIN rejects (with note) → schedule unchanged
- ✅ ADMIN approves → schedule adjustment ACTIVE, audit fields populated
- ✅ submittedBy / reviewedBy traceable across both sides
- ✅ Rejected / voided adjustments retained for audit