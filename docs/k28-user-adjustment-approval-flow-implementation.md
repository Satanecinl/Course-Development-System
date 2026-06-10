# K28-A: User Adjustment Approval Flow Implementation

## 1. Executive Summary

K28-A implements the full user adjustment request → admin approval
workflow. Normal USER role can now view the schedule, submit adjustment
requests (PENDING only), and view/cancel their own requests. ADMIN role
can review, approve (with re-dry-run), or reject requests.

- New model: `ScheduleAdjustmentRequest` (PENDING / APPROVED /
  REJECTED / CANCELLED)
- New permissions: `adjustment-request:create`,
  `adjustment-request:review`, `adjustment-request:read`
- USER gets `schedule:view` + `adjustment-request:create` +
  `adjustment-request:read` (previously only `data:read`)
- ADMIN gets all 15 permissions (including the 3 new ones)
- 7 new API routes (4 USER + 3 ADMIN)
- 1 new dialog component + 2 new pages

## 2. Schema Changes

New model `ScheduleAdjustmentRequest` added to `prisma/schema.prisma`:

- `semesterId`, `sourceScheduleSlotId`, `teachingTaskId` (FKs)
- Source snapshot: `sourceWeek`, `sourceDayOfWeek`, `sourceSlotIndex`,
  `sourceRoomId` (read-only audit trail)
- Target: `targetWeek`, `targetDayOfWeek`, `targetSlotIndex`,
  `targetRoomId`
- `status` (String: PENDING | APPROVED | REJECTED | CANCELLED —
  SQLite does not support native enums)
- Submitter: `submittedByUserId`, `submittedByNameSnapshot`,
  `submittedByRoleSnapshot`
- Reviewer: `reviewedByUserId`, `reviewedByNameSnapshot`,
  `reviewedAt`, `reviewNote`
- Linked adjustment: `approvedAdjustmentId` (unique FK to
  ScheduleAdjustment, set on APPROVED)
- `reason`, `createdAt`, `updatedAt`

## 3. Migration

```
prisma/migrations/20260610000000_add_schedule_adjustment_request/migration.sql
```

Creates `ScheduleAdjustmentRequest` table with foreign keys to
`Semester`, `ScheduleSlot`, `TeachingTask`, `User`, and
`ScheduleAdjustment`. Indexes on `semesterId`, `status`,
`submittedByUserId`, `reviewedByUserId`, `sourceScheduleSlotId`.

## 4. RBAC Changes

### New Permissions

| Permission | Description |
|------------|-------------|
| `adjustment-request:create` | Submit adjustment request |
| `adjustment-request:review` | Review / approve / reject requests |
| `adjustment-request:read` | View adjustment requests |

### Role Mapping

| Role | Pre-K28-A | Post-K28-A |
|------|-----------|------------|
| ADMIN | 12 permissions | 15 permissions (all) |
| USER | `data:read` | `data:read`, `schedule:view`, `adjustment-request:create`, `adjustment-request:read` |
| DATA_EXPORTER | `data:read`, `data:export` | unchanged |

### Navigation

- USER sees: 排课展示, 我的调课申请, 数据管理
- ADMIN sees: all existing + 调课审批 + 我的调课申请

## 5. New API Routes

### USER

| Route | Method | Permission |
|-------|--------|------------|
| `/api/schedule-adjustment-requests/dry-run` | POST | `adjustment-request:create` |
| `/api/schedule-adjustment-requests` | POST | `adjustment-request:create` |
| `/api/schedule-adjustment-requests/mine` | GET | `adjustment-request:read` |
| `/api/schedule-adjustment-requests/[id]/cancel` | POST | `adjustment-request:create` |

### ADMIN

| Route | Method | Permission |
|-------|--------|------------|
| `/api/admin/schedule-adjustment-requests` | GET | `adjustment-request:review` |
| `/api/admin/schedule-adjustment-requests/[id]/approve` | POST | `adjustment-request:review` |
| `/api/admin/schedule-adjustment-requests/[id]/reject` | POST | `adjustment-request:review` |

## 6. Business Rules Enforced

1. **Submit does not mutate ScheduleSlot** — verified by static
   inspection (no `prisma.scheduleSlot.update` in submit path)
2. **Submit does not create ACTIVE ScheduleAdjustment** — verified
   (no `prisma.scheduleAdjustment.create` in submit path)
3. **Approve re-runs dry-run** — `dryRunScheduleAdjustment()` is
   called at approval time with current state
4. **Reject does not create ScheduleAdjustment** — verified
5. **submittedBy is recorded** — FK + nameSnapshot + roleSnapshot
6. **reviewedBy is recorded** — FK + nameSnapshot + reviewedAt
7. **Cancel only works on own PENDING** — ownership + status check
8. **USER cannot bypass approval** — no `schedule:adjust` permission,
   submit path is isolated

## 7. Validation Results

- `npx tsx scripts/verify-user-adjustment-approval-flow-k28-a.ts` →
  **PASS (67/67)**
- `npx prisma validate` → PASS
- `npx prisma migrate status` → 9 migrations, up to date
- `npm run build` → PASS
- `npm run lint` → **331 problems (185 errors, 146 warnings)**.
  Delta of +1 from baseline (330 = 184/146): the new
  `react-hooks/set-state-in-effect` in `UserAdjustmentRequestDialog`
  matches the exact same pre-existing pattern in the existing
  `ScheduleAdjustmentDialog` (also counted as a lint error).
- `npm run test:auth-foundation` → **61 passed / 1 pre-existing failed**
  (ScheduleAdjustment ACTIVE=0). Updated test to expect 4 USER
  permissions (was 1).
- `npx tsx scripts/verify-system-settings-basic-closeout-k26.ts` →
  **106/106 PASS**

## 8. Known Limitations

- `ScheduleAdjustmentRequest.status` is a String (SQLite enum
  limitation); value set enforced in application layer
- The `sourceWeek` field in the request is not populated from the
  source slot's actual week constraint (could be added later)
- No real-time notification to ADMIN when a new request is submitted
- The USER request dialog does not include plan recommendations
  (K24-A4) yet — could be added in a follow-up

## 9. Recommended Next Stage

`K28-B-USER-ADJUSTMENT-APPROVAL-FLOW-MANUAL-TRIAL`
