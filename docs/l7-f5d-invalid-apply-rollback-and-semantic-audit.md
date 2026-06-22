# L7-F5D-INVALID-APPLY-ROLLBACK-AND-SEMANTIC-AUDIT

> Stage: `L7-F5D-INVALID-APPLY-ROLLBACK-AND-SEMANTIC-AUDIT`
> Date: 2026-06-22
> Status: **CLOSED**

## 一、L7-F5 Invalid Diagnosis

L7-F5 was confirmed **FAILED** by user and diagnostic.

### CRITICAL 1: teacherId NULL

- ALL 248 TeachingTasks have `teacherId = NULL`
- null teacherId: 248/248
- valid teacherId: 0/248
- Cause: Excel K/J teacher text not matched to DB Teacher names; auto-resolve skipped

### CRITICAL 2: classGroup over-match

- 5398 TeachingTaskClass / 248 tasks = avg 21.77 per task
- p50 = 26, p90 = 26, max = 31
- Cause: classGroupRefs auto-resolve matched too broadly (classText empty or `cg.name.includes(n + '班')` over-matched across unrelated majors)

## 二、Evidence Preservation

- Invalid DB evidence backup: `prisma/dev.db.backup-invalid-l7-f5-before-rollback-20260622-214753`
- Created before restore, for future reference

## 三、Rollback Execution

- Confirm token: `ROLLBACK_L7_F5_INVALID_APPLY`
- Restore source: `prisma/dev.db.backup-before-l7-f-xlsx-course-setting-import-20260622-200103`
- Evidence backup created: ✓
- Restore executed: ✓
- Post-rollback verification: 12/12 checks passed

## 四、Post-rollback DB Counts

| Table | Count | Status |
|---|---|---|
| Course | 104 | ✓ restored (was 352) |
| Teacher | 220 | ✓ unchanged |
| ClassGroup sem1 | 36 | ✓ preserved |
| ClassGroup sem4 | 36 | ✓ preserved (from L7-F4) |
| TeachingTask sem4 | 0 | ✓ restored (was 248) |
| TeachingTaskClass | 446 | ✓ restored (was 5844) |
| ScheduleSlot sem4 | 0 | ✓ unchanged |
| ScheduleAdjustment sem4 | 0 | ✓ unchanged |
| ImportBatch #39 | APPLIED, tasks=0 | ✓ preserved |
| ImportBatch #40 | absent | ✓ removed |
| ImportBatch total | 39 | ✓ restored (was 40) |

## 五、Root Cause Summary

1. **teacherId resolution failed** — Excel teacher text didn't match any existing Teacher names in the DB
2. **classGroup resolution over-matched** — broad substring matching linked all 36 sem4 ClassGroups to every task
3. **apply service allowed invalid data through** — no hard gate on teacherId=null, no bounded classGroup validation

## 六、Next-Stage Hard Gates (L7-F6)

### Teacher hard gate

```
Every importable TeachingTask candidate must have valid teacherId.
teacherId null is a hard blocker — apply service must reject.
natural key must not use teacherId ?? 'null' to allow invalid task.
```

### ClassGroup hard gate

```
ClassGroup resolution must be exact and scoped.
No empty/null classText may resolve to all ClassGroups.
No broad cg.name.includes("1班") matching across unrelated majors.
Every candidate must have non-empty, bounded classGroupIds.
```

### Dry-run proof before next apply

```
teacherId null count = 0
classGroupSet distribution reasonable
max classGroups per task under expected threshold
no sem1 classGroup linked
all classGroupIds belong to sem4
```
