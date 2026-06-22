# L7-F5-VALID-XLSX-COURSE-SETTING-APPLY-TRIAL-AFTER-CLASSGROUP-COPY

> Stage: `L7-F5-VALID-XLSX-COURSE-SETTING-APPLY-TRIAL-AFTER-CLASSGROUP-COPY`
> Date: 2026-06-22
> Status: **CLOSED** (pending browser validation)

## 一、Target semester

- targetSemesterId: 4
- name: 2025-2026秋季学期 (2025-2)
- ClassGroup count: **36** (copied from sem1 in L7-F4)

## 二、Dry-run

- totalRows: 1167
- importableRows: 795
- unresolvedRows: 372
- createdCourses: 0 (dry-run)
- createdTeachingTasks: 0 (dry-run)
- canApply: true

## 三、Invalid token test

- Result: `confirm token mismatch` → exit 1
- Backup: NO
- DB write: NO

## 四、Apply result

- backup path: `prisma/dev.db.backup-before-l7-f-xlsx-course-setting-import-20260622-200103`
- transaction: COMMITTED
- ImportBatch ID: **40**
- createdCourses: **248**
- reusedCourses: 0
- createdTeachingTasks: **248**
- createdTeachingTaskClasses: **5398**
- duplicateSkipped: 372
- unresolvedSkipped: 372

## 五、Post-apply audit (PASSED)

| Check | Result |
|---|---|
| course_delta_equals_createdCourses | 104→352, expected 248 |
| teaching_task_delta_equals_createdTeachingTasks | 0→248, expected 248 |
| teaching_task_class_delta_equals_createdTeachingTaskClasses | 0→5398, expected 5398 |
| import_batch_delta_equals_1 | 39→40 |
| teacher_unchanged | 220→220 |
| classgroup_unchanged | 36→36 |
| schedule_slot_unchanged | 0→0 |
| schedule_adjustment_unchanged | 0→0 |

## 六、ImportBatch #39

**Untouched**. Status: APPLIED. createdTaskCount: 0.

## 七、Rollback note

```
L7-F5 rollback note:
  - Backup: prisma/dev.db.backup-before-l7-f-xlsx-course-setting-import-20260622-200103
  - ImportBatch ID: 40
  - Target semester: 4
  - Created Courses: 248
  - Created TeachingTasks: 248
  - Created TeachingTaskClasses: 5398
  - To rollback, restore backup to prisma/dev.db
  - No Teacher/ClassGroup/ScheduleSlot/ScheduleAdjustment rows were created by L7-F5
```

## 八、DB counts

| Table | Before | After |
|---|---|---|
| Course | 104 | **352** (+248) |
| Teacher | 220 | 220 (unchanged) |
| ClassGroup sem1 | 36 | 36 (unchanged) |
| ClassGroup sem4 | 36 | 36 (unchanged) |
| TeachingTask sem4 | 0 | **248** |
| TeachingTaskClass sem4 | 0 | **5398** |
| ImportBatch | 39 | **40** (+1) |
| ImportBatch #39 | APPLIED | APPLIED (untouched) |
| ImportBatch #40 | n/a | APPLIED, recordCount=795, createdTaskCount=248 |
| ScheduleSlot sem4 | 0 | 0 (unchanged) |
| ScheduleAdjustment sem4 | 0 | 0 (unchanged) |

## 九、Browser validation checklist

- [ ] Generate full review
- [ ] Generate partial plan
- [ ] Apply panel shows canApply true
- [ ] Invalid token rejected
- [ ] Valid token executes
- [ ] Shows ImportBatch ID #40
- [ ] Shows backup path
- [ ] Shows created counts
- [ ] Shows skipped count
- [ ] Post-apply audit passed
- [ ] DB counts match summary
- [ ] Teacher/ClassGroup/ScheduleSlot unchanged
- [ ] No console errors

## 十、Next stage

L7-F can close after browser validation passes.
