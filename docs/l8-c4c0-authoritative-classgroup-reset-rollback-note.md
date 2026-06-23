# L8-C4C0 — Rollback Note

**Stage**: L8-C4C0-CLASSGROUP-AUTHORITATIVE-RESET-FROM-REFERENCE

## Backup

- basename: `prisma/dev.db.backup-before-l8-c4c0-authoritative-classgroup-reset-20260623155916`
- backup NOT committed (excluded by `.gitignore`)

## How to Restore

```bash
cp prisma/dev.db.backup-before-l8-c4c0-authoritative-classgroup-reset-20260623155916 prisma/dev.db
```

Then restart the dev server (`npm run dev`).

## What L8-C4C0 Changed

- **ClassGroup**: 45 rows created, 182 rows updated, 260 rows deactivated (isActive=false), 0 hard deleted
- All 227 canonical reference_xlsx ClassGroups are now active in semester 4
- Legacy non-canonical ClassGroups (260 rows) are deactivated (not deleted)

## What L8-C4C0 Did NOT Change

- **TeachingTaskClass**: untouched (446 rows, hash unchanged)
- **TeachingTask**: untouched
- **Course**: untouched (104 rows)
- **Teacher**: untouched (427 rows)
- **ScheduleSlot**: untouched
- **ScheduleAdjustment**: untouched
- **ImportBatch**: untouched (39 rows, ImportBatch #39 remains APPLIED)
- **schema.prisma**: untouched
- **migrations**: untouched

## Note on TeachingTaskClass

Old TeachingTaskClass rows (446) may still reference deactivated legacy ClassGroups. This is expected and does not indicate data corruption. A separate historical data-fix stage can address TTC cleanup if needed.
