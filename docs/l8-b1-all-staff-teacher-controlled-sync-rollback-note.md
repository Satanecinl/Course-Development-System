# L8-B1 All-Staff Teacher Controlled Sync — Rollback Note

> Stage: **L8-B1-ALL-STAFF-TEACHER-CONTROLLED-SYNC-APPLY**
> Date: 2026-06-23
> Branch: `master`

## 1. What was done

A single Prisma transaction created 191 Teacher rows (all-staff person
coverage, `ALL_STAFF_PERSON_TABLE` semantics).

No ClassGroup, TeachingTask, TeachingTaskClass, ScheduleSlot,
ScheduleAdjustment, ImportBatch, Course, or Room rows were created,
modified, or deleted.

No existing Teacher rows were modified. No Teacher rows were deleted.

## 2. Backup

| Item | Value |
|---|---|
| basename | `dev.db.backup-before-l8-b1-all-staff-teacher-sync-20260623-120236` |
| size | 60 MB |
| sha256 | `958925d7cba1528508874bf2111b9d92ca1a8366f3501d4a45d9c8a955a7e256` |
| location | `prisma/dev.db.backup-before-l8-b1-all-staff-teacher-sync-20260623-120236` |

## 3. Restore command outline

```bash
# 1. Stop the Next.js dev server
# 2. Copy backup over current database:
cp prisma/dev.db.backup-before-l8-b1-all-staff-teacher-sync-20260623-120236 prisma/dev.db
# 3. Verify Teacher count = 236 (pre-apply state)
npx tsx -e "const p = new (require('@prisma/client').PrismaClient)(); p.teacher.count().then(c => { console.log('Teacher:', c); p.\$disconnect() })"
# 4. Restart dev server
```

## 4. Created Teacher count

191 rows created. All have unique names (0 duplicate groups). All use
the field allowlist: `name`, `employeeNo`, `department`, `position`,
`rank`, `phone`, `officePhone` (all fields except `name` are nullable).

## 5. Rollback strategy

**Option A (preferred):** Restore `dev.db` from backup as shown above.
All 191 created Teacher rows are removed; the 5 db-only Teachers and
the 2 DUPLICATE_SOURCE_PERSON entries are unchanged from pre-apply state.

**Option B (SQL-level):** Delete all Teacher rows with IDs above the
pre-apply max (if known). However, this is less reliable than Option A
because it requires knowing the exact ID range and cannot undo autoincrement.

## 6. Tables NOT touched by this apply

- ClassGroup (all semesters)
- Course
- TeachingTask (all semesters)
- TeachingTaskClass
- ScheduleSlot (all semesters)
- ScheduleAdjustment (all semesters)
- ImportBatch
- Room
- Semester
- WorkTimeConfig / TimeSlotDefinition
- SchedulingConfig / SchedulingRun
