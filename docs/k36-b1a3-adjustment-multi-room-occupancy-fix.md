# K36-B1A3 Adjustment Multi-room Occupancy Fix

## Scope

This stage fixes multi-room occupancy checks in adjustment dry-run, direct
adjustment creation, adjustment request submit/approval, room recommendation,
and plan recommendation.

Scheduler score/solver, campus room rules, WorkTime scoring, schema,
migrations, API permissions, and frontend code are unchanged.

## Adjustment Room Semantics

- An adjustment may replace only the primary room.
- Secondary rooms remain attached to the source `ScheduleSlot`.
- The target occupancy is the set of the effective target primary room plus
  all retained secondary rooms.
- `newRoomId = null` retains the source primary room. It does not remove the
  room assignment.
- A true no-room target exists only when the source has neither a primary nor
  secondary room; room conflicts are then skipped while teacher and class
  conflicts remain active.
- Duplicate primary/secondary identifiers are deduplicated.

## Implementation

- Dry-run now loads source `additionalRooms`.
- Effective target schedule occupancies carry `additionalRoomIds`.
- Dry-run checks room-set intersection for target primary and retained
  secondary rooms.
- Same-week moves exclude the source occurrence; cross-week moves keep the
  recurring source occurrence visible.
- Direct adjustment creation continues to run dry-run before creating an
  active adjustment.
- Adjustment request submit and approval both run the same dry-run service.
- Room recommendation explicitly passes retained secondary room IDs to
  `checkScheduleConflicts`.
- Plan recommendation loads and propagates the same retained secondary room
  IDs to every room recommendation candidate.
- Ranking and recommendation weights are unchanged.

## Verification

The DB-free verification covers:

1. target primary vs existing primary
2. target primary vs existing secondary
3. retained secondary vs existing primary
4. retained secondary vs existing secondary
5. same-week exclude-self
6. cross-week source recurrence
7. cross-semester isolation
8. no-room teacher/class behavior
9. duplicate room identifiers
10. legacy primary-only behavior
11. direct create guard reuse
12. request submit and approval guard reuse
13. room recommendation propagation
14. plan recommendation propagation

Validation results:

- K36-B1A3 verification: 15 passed, 0 failed
- Docs PII scan: 0 blocking findings
- Prisma schema validation: passed
- Production build: passed
- Targeted ESLint: 0 errors; 7 pre-existing warnings

## Remaining Work

- Campus room rule diagnostics remain primary-only.
- HC4, HC5, and HC6 delta multi-room consistency remains outside this stage.
- WorkTime score contract B-03 remains outside this stage.
- Git history is not sanitized by this change.
