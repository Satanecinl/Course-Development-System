# L8-C4 Rollback Note

## Backup

- File: `prisma/dev.db.backup-before-l8-c4-classgroup-canonical-sync-20260623141644`
- Created: 2026-06-23 14:16:44

## How to Restore

```bash
cp prisma/dev.db.backup-before-l8-c4-classgroup-canonical-sync-20260623141644 prisma/dev.db
```

## Tables Modified

| Table | Changes |
|-------|---------|
| ClassGroup | 16 new rows created, 227 rows updated (canonicalKey/fields/sourceType/isActive), 260 rows deactivated |
| TeachingTaskClass | 588 classGroupId updates (migrations), 96 duplicate rows deleted |

## Tables NOT Modified

| Table | Reason |
|-------|--------|
| Course | Not in scope |
| Teacher | Not in scope |
| TeachingTask | Not in scope |
| ScheduleSlot | Not in scope |
| ScheduleAdjustment | Not in scope |
| ImportBatch | Not in scope |
| Semester | Not in scope |
