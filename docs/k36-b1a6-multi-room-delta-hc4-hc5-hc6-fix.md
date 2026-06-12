# K36-B1A6 Multi-room Delta HC4/HC5/HC6 Fix

## Scope

This stage fixes only scheduler delta-score consistency for multi-room HC4
capacity, HC5 room availability, and HC6 specialty room restrictions.

Campus room rule diagnostics, adjustment and recommendation flows, WorkTime
scoring, schema, migrations, APIs, frontend code, K22 expected outputs, and Git
history are unchanged.

## Finding

Full scoring already evaluated the deduplicated effective room set composed of
the current primary room and retained secondary rooms:

- HC4 used combined room capacity.
- HC5 applied one hard penalty per unavailable effective room.
- HC6 applied one hard penalty per prohibited effective room.

Delta scoring evaluated only the old and new primary rooms. This allowed the
delta result used by the solver to disagree with the full hard-score change
when retained secondary rooms affected capacity, availability, or specialty
rules.

## Implementation

- Added scheduler-local HC4, HC5, and HC6 delta helpers based on the existing
  `getEffectiveRoomIds` room-set contract.
- Delta HC4 compares the before and after combined capacity penalties.
- Delta HC5 compares the before and after unavailable-room penalty totals.
- Delta HC6 compares the before and after prohibited-room penalty totals.
- Null, zero, and duplicate room identifiers retain the existing semantics.
- A no-primary-room assignment continues to skip HC4, HC5, and HC6.
- HC4, HC5, and HC6 penalty weights remain unchanged at `-1000`.
- Full-score behavior, HC1, SC6, WorkTime scoring, solver algorithms, and
  adjustment behavior are unchanged.

## Verification

The DB-free synthetic fixture verification covers:

1. HC4 full combined capacity
2. HC4 delta introducing a retained-secondary capacity violation
3. HC4 delta resolving a retained-secondary capacity violation
4. HC5 full secondary-room availability
5. HC5 delta introducing a retained-secondary availability violation
6. HC5 delta resolving a retained-secondary availability violation
7. HC6 full secondary specialty-room restriction
8. HC6 delta introducing a secondary restriction when leaving no-room state
9. HC6 delta resolving a secondary restriction when entering no-room state
10. duplicate primary and secondary room identifiers
11. no-room behavior
12. legacy primary-only HC4/HC5/HC6 behavior
13. HC1 effective-room helper regression

Validation results:

- K36-B1A6 verification: 13 passed, 0 failed
- K36-B1A2 HC1 verification: 14 passed, 0 failed
- Docs PII scan: 0 blocking findings
- Prisma schema validation: passed
- Production build: passed
- Targeted ESLint: passed with 0 errors and 0 warnings

## Remaining Work

- Campus room rule diagnostics still require secondary-room support.
- WorkTime score contract B-03 remains outside this stage.
- K22 score harness alignment may require a separate review; expected outputs
  were not updated here.
- Git history remains unsanitized, so the repository must remain private and
  must not be delivered externally as a source package.
