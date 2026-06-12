# K36-B1 Import Rollback Adjustment Guard

## Scope

This stage fixes only the import rollback data-loss risk identified as B-01.
No Prisma schema, migration, scheduler, WorkTime, multi-room, RBAC, or frontend
logic is changed.

## Guarded references

- `ScheduleAdjustment.originalSlotId`
- `ScheduleAdjustmentRequest.sourceScheduleSlotId`
- `SchedulerRunChange.scheduleSlotId`

`ScheduleSlotAdditionalRoom` is not a blocking reference because it is an
owned association of the slot and is expected to be removed with that slot.

## Behavior

- The rollback plan collects the imported slot IDs and reports reference
  counts without exposing teacher, class, course, room, or reason text.
- Dry-run returns `canRollback: false` and the code
  `ROLLBACK_BLOCKED_BY_ADJUSTMENT_REFERENCES` when references exist.
- Real rollback performs the same check again inside the delete transaction.
- Adjustment, approval, and scheduler audit records are never deleted or
  detached automatically.
- At most 20 affected numeric slot IDs are returned for diagnosis.

## Known limits

This current-HEAD fix does not clean Git history and does not address the other
K36-B findings.

## Validation

- Source-only guard verification: 12/12 passed.
- Docs PII scan: 148/148 JSON files parsed, 0 blocking, 2 existing warnings.
- Prisma schema validation: passed.
- Targeted ESLint: passed.
- Production build: passed with pre-existing middleware and NFT tracing warnings.
