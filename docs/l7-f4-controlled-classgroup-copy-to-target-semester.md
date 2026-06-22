# L7-F4-CONTROLLED-CLASSGROUP-COPY-TO-TARGET-SEMESTER

> Stage: `L7-F4-CONTROLLED-CLASSGROUP-COPY-TO-TARGET-SEMESTER`
> Date: 2026-06-22
> Status: **CLOSED**

## 一、Write-stage scope

**Allowed writes**: ClassGroup only
**Forbidden writes**: Course, Teacher, TeachingTask, TeachingTaskClass, ImportBatch, ScheduleSlot, ScheduleAdjustment

## 二、Copy parameters

| Field | Value |
|---|---|
| sourceSemesterId | 1 (2025-2026春季, LEGACY-DEFAULT, active) |
| targetSemesterId | 4 (2025-2026秋季, 2025-2) |
| sourceClassGroupCount | 36 |
| targetClassGroupCount before | 0 |
| copiedCount | **36** |
| confirm token | `COPY_CLASSGROUPS_1_TO_4` |

## 三、Field mapping

| Field | Action |
|---|---|
| name | preserved |
| studentCount | preserved |
| advisorName | preserved |
| advisorPhone | preserved |
| semesterId | **4** (replaced) |
| id | auto-generated |
| createdAt/updatedAt | auto-generated |

## 四、Backup

Path: `prisma/dev.db.backup-before-l7-f4-classgroup-copy-20260622-191036`

Backup created before transaction. Verified not tracked by git.

## 五、Post-copy audit

| Check | Before | After |
|---|---|---|
| sem1 ClassGroup | 36 | **36** (unchanged) |
| sem4 ClassGroup | 0 | **36** (copied) |
| sem4 TeachingTask | 0 | 0 (unchanged) |
| sem4 ScheduleSlot | 0 | 0 (unchanged) |
| Course | 104 | 104 (unchanged) |
| Teacher | 220 | 220 (unchanged) |
| TeachingTaskClass | 446 | 446 (unchanged) |
| ImportBatch | 39 | 39 (unchanged) |
| ImportBatch #39 | APPLIED | APPLIED (untouched) |

## 六、Rollback note

```
L7-F4 rollback note:
  - Backup path: prisma/dev.db.backup-before-l7-f4-classgroup-copy-20260622-191036
  - Source semester: 1
  - Target semester: 4
  - Copied ClassGroup count: 36
  - To rollback, restore backup to prisma/dev.db
  - No Course/Teacher/TeachingTask/TeachingTaskClass/ImportBatch/ScheduleSlot rows were created by L7-F4
```

## 七、Next stage

`L7-F5-VALID-XLSX-COURSE-SETTING-APPLY-TRIAL-AFTER-CLASSGROUP-COPY`

With sem4 now having 36 ClassGroups, the L7-F apply gate no longer blocks.
L7-F5 can re-run the valid apply trial.
