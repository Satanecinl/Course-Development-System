# K36-B1A2 Scheduler Multi-room HC1 Fix

## Scope

This stage fixes only scheduler HC1 room-conflict semantics in full scoring,
delta scoring, placement compatibility, and hard-conflict participant
selection.

Adjustment dry-run, recommendations, campus room rules, WorkTime scoring,
schema, migrations, API routes, and frontend code are unchanged.

## Implementation

- Added a scheduler-local effective room set composed of the current primary
  room and the slot's secondary rooms.
- Null, zero, and duplicate room identifiers are excluded.
- Full HC1 detects primary-primary, primary-secondary, secondary-primary, and
  secondary-secondary intersections.
- Each overlapping slot pair receives one existing HC1 penalty even if multiple
  rooms overlap.
- Delta HC1 removes and adds penalties using the same effective room-set
  helper as full scoring.
- Solver placement rejects candidates when either the proposed primary or a
  retained secondary room overlaps an existing slot's room set.
- Hard-conflict participant selection uses the same room-set semantics.
- Cross-semester room reuse is ignored when both slots carry different
  semester identifiers.
- Legacy primary-only behavior and the existing `-1000` HC1 penalty are
  preserved.
- Teacher and class hard-conflict behavior is unchanged.

## Verification

The DB-free synthetic fixture verification covers:

1. full primary-primary
2. full primary-secondary
3. full secondary-primary
4. full secondary-secondary
5. duplicate primary/secondary identifiers
6. duplicate secondary identifiers
7. no-room slots
8. different times
9. cross-semester room reuse
10. delta primary-secondary
11. delta secondary-secondary
12. solver placement and participant detection
13. teacher/class hard conflicts
14. legacy primary-only behavior

Validation results:

- K36-B1A2 verification: 14 passed, 0 failed
- Docs PII scan: 0 blocking findings
- Prisma schema validation: passed
- Production build: passed
- Targeted ESLint: 0 errors; 2 pre-existing warnings in `solver.ts`

## Remaining Work

- Adjustment dry-run and room/plan recommendations remain primary-only.
- Campus room rule diagnostics remain primary-only.
- HC4, HC5, and HC6 delta multi-room consistency is outside this stage.
- WorkTime score contract B-03 is outside this stage.
- Git history is not sanitized by this change.
