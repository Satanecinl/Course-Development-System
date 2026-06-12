# K36-B1A1 Multi-room Conflict Service Fix

## Scope

This stage fixes only the shared schedule conflict kernel and its read-only
Prisma adapter. Scheduler score/solver, adjustment dry-run, recommendation,
campus room rules, schema, migrations, and UI are unchanged.

## Implementation

- Added a normalized effective room set made from the primary `roomId` and
  optional `additionalRoomIds`.
- Null, undefined, and non-positive room identifiers are excluded.
- Duplicate primary/secondary and repeated secondary identifiers are deduped.
- Room conflicts are detected by room-set intersection.
- The matched room identifier is carried into the additive typed conflict
  detail.
- Existing slots load `additionalRooms` in `checkScheduleConflicts`.
- Existing-slot checks retain their current secondary rooms unless the caller
  explicitly supplies `targetAdditionalRoomIds`.
- Semester scoping, exclude-self, week overlap, teacher conflict, class
  conflict, and the existing response envelope are preserved.
- Legacy callers that provide only `roomId` continue to use primary-only
  semantics.

## Verification

The pure in-memory verification covers:

1. primary-primary conflict
2. primary-secondary conflict
3. secondary-primary conflict
4. secondary-secondary conflict
5. duplicate primary/secondary identifiers
6. duplicate secondary identifiers
7. cross-semester isolation
8. no-room behavior
9. unchanged teacher/class conflict behavior
10. legacy primary-only calls
11. exclude-self behavior
12. static read-only and query-scope checks

Validation results:

- K36-B1A1 verification: 14 passed, 0 failed
- Docs PII scan: 0 blocking findings
- Prisma schema validation: passed
- Production build: passed
- Targeted ESLint: passed

## Remaining Work

- Scheduler full score HC1 and delta scoring still require multi-room support.
- Solver placement and hard-conflict participant detection remain primary-only.
- Adjustment dry-run and room/plan recommendations remain primary-only.
- Campus room rule diagnostics remain primary-only.
- This change does not clean Git history and does not make the repository safe
  for publication or external source delivery.
