# L7-F6C-CONTROLLED-MASTER-DATA-WRITE-TEACHER-AND-CLASSGROUP

> Stage: `L7-F6C-CONTROLLED-MASTER-DATA-WRITE-TEACHER-AND-CLASSGROUP`
> Date: 2026-06-22
> Status: **CLOSED**

## 一、Stage Summary

Controlled write of 16 high-confidence Teachers and 418 validated ClassGroups based on the L7-F6B plan. All writes inside a transaction with explicit confirm token and DB backup.

## 二、DB Baseline (pre-write)

| Table | Value |
|---|---|
| Course | 104 |
| Teacher | 220 |
| ClassGroup sem1 | 36 |
| ClassGroup sem4 | 36 |
| TeachingTask sem4 | 0 |
| TeachingTaskClass | 446 |
| ImportBatch total | 39 |
| ImportBatch #39 | APPLIED, tasks=0 |
| ImportBatch #40 | absent |

## 三、ClassGroup Expansion Validation

- 440 total candidates from Excel
- 418 validated by 学院专业数据库
- 22 manual-review (not written)
- 395 unique plannedName → 395 created (23 duplicate names skipped)
- Duplicate names caused by same major+classNo across different cohort/duration combos

## 四、Teacher Write

| Metric | Value |
|---|---|
| High-confidence candidates | 16 |
| Created | **16** |
| Duplicate skipped | 0 |
| External/unknown not created | 32 |

## 五、ClassGroup Write

| Metric | Value |
|---|---|
| Validated candidates | 418 |
| Unique plannedName | 395 |
| Duplicate names skipped | 23 |
| **Created** | **395** |
| Manual-review not created | 22 |
| Legacy sem4 preserved | 36 |

## 六、Post-write DB Verification

| Table | Pre | Post | Change |
|---|---|---|---|
| Course | 104 | **104** | 0 |
| Teacher | 220 | **236** | +16 |
| ClassGroup sem1 | 36 | **36** | 0 |
| ClassGroup sem4 | 36 | **431** | +395 |
| TeachingTask sem4 | 0 | **0** | 0 |
| TeachingTaskClass | 446 | **446** | 0 |
| ScheduleSlot sem4 | 0 | **0** | 0 |
| ImportBatch total | 39 | **39** | 0 |
| ImportBatch #39 | APPLIED, tasks=0 | **APPLIED, tasks=0** | preserved |
| ImportBatch #40 | absent | **absent** | 0 |

## 七、Rollback Note

```
L7-F6C rollback note:
  - Backup: prisma/dev.db.backup-before-l7-f6c-master-data-write-20260622-225133
  - To rollback: cp <backup> prisma/dev.db
  - Created Teachers: 16
  - Created ClassGroups: 395 (23 duplicate names skipped)
  - 36 legacy sem4 ClassGroups preserved
  - No ImportBatch / Course / TeachingTask / ScheduleSlot created
```

## 八、Next Stage

**`L7-F6D-XLSX-TEACHER-CLASSGROUP-RESOLUTION-HARD-GATE-FIX`**

With master data now in place:
- 236 Teachers (was 220 + 16 new)
- 431 sem4 ClassGroups (was 36 + 395 new)

Next stage must:
1. Fix the Excel teacher text → Teacher ID resolution to use exact matching
2. Fix the class text → ClassGroup ID resolution to use major+classNo matching
3. Add hard gates: teacherId=null → reject; empty classGroupRefs → reject
4. Add dry-run proof: teacherId null count = 0, bounded classGroup sets
5. Only then retry L7-F apply

rawIncluded: false
