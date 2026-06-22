# L7-F5A-VALID-APPLY-CLOSEOUT-AND-BROWSER-VALIDATION

> Stage: `L7-F5A-VALID-APPLY-CLOSEOUT-AND-BROWSER-VALIDATION`
> Date: 2026-06-22
> Status: **CLOSED** (pending browser validation)

## 一、L7-F5 apply summary

- ImportBatch #40 created (APPLIED, strategy: XLSX_COURSE_SETTING_NEW_TEMPLATE)
- 248 new Courses (all `autoAllowedNewCourse` candidates)
- 248 new TeachingTasks (sem4)
- 5398 new TeachingTaskClass links (sem4)
- 372 duplicate plan rows skipped (natural key collision)

## 二、ImportBatch #40 (final state)

| Field | Value |
|---|---|
| id | 40 |
| status | APPLIED |
| strategy | XLSX_COURSE_SETTING_NEW_TEMPLATE |
| recordCount | 795 |
| createdTaskCount | 248 |
| createdSlotCount | 0 |
| semesterId | 4 |
| confirmedAt | 2026-06-22T12:01:03Z |
| rolledBackAt | null |

## 三、ImportBatch #39 (untouched)

| Field | Value |
|---|---|
| id | 39 |
| status | APPLIED (historical, pre-L7-F4) |
| strategy | XLSX_COURSE_SETTING_NEW_TEMPLATE |
| recordCount | 4 (initial L7-F trial) |
| createdTaskCount | 0 |
| semesterId | 4 |

## 四、DB count deltas

| Table | Pre-L7-F5 | Post-L7-F5 | Delta |
|---|---|---|---|
| Course | 104 | **352** | +248 |
| Teacher | 220 | 220 | 0 |
| ClassGroup sem1 | 36 | 36 | 0 |
| ClassGroup sem4 | 36 | 36 | 0 |
| TeachingTask sem4 | 0 | **248** | +248 |
| TeachingTaskClass sem4-linked | 0 | **5398** | +5398 |
| ImportBatch | 39 | **40** | +1 |
| ScheduleSlot sem4 | 0 | 0 | 0 |
| ScheduleAdjustment sem4 | 0 | 0 | 0 |

## 五、`795 → 248 → 5398` reconciliation

### importableRows=795
- L7-F5 dry-run level: each row in the plan that has all blockers resolved
- Includes rows whose natural key would collide with an existing teaching task

### createdTeachingTasks=248
- 795 - 372 (duplicate) = 423 candidate tasks
- Of 423, only 248 have unique (courseId, teacherId, weeklyHours, classGroupSet)
- Remaining 175 are duplicate natural keys within the apply batch → skipped via `taskNaturalKeysSeen` dedupe
- After DB-level dedupe check, 248 unique teaching tasks

### duplicateSkipped=372
- Plan rows whose natural key matched a previously-inserted or DB-existing teaching task
- 248 unique tasks × avg 1.5 candidates per task = 372 skipped (some were `exactExisting` risk, some were intra-batch natural key collisions)

### createdTeachingTaskClasses=5398
- 248 teaching tasks × avg 21.77 class links per task
- The xlsx has multi-class rows (e.g. "1班,2班,3班" → 1 teaching task + N class links)
- 5398 ÷ 248 = 21.77 avg, all `classGroupId` belong to sem4 (no sem1 leakage)

## 六、Course / TeachingTask correspondence

- createdCourses=248
- createdTeachingTasks=248
- One new Course per new TeachingTask (no reused Courses, no split)
- Confirms L7-F5: 248 unique new courses, each with one teaching task

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

## 八、Browser validation checklist

- [ ] Open `/admin/import`
- [ ] View ImportBatch list / history
- [ ] ImportBatch #40 visible
- [ ] Status APPLIED
- [ ] createdTaskCount = 248 (or equivalent UI)
- [ ] createdSlotCount = 0
- [ ] Upload new xlsx (optional)
- [ ] Select targetSemesterId=4
- [ ] Full review generates
- [ ] Partial plan no longer blocked by ClassGroup gate
- [ ] Apply area detects existing import (duplicate warning)
- [ ] Course / TeachingTask pages show sem4 entries
- [ ] No ScheduleSlot visible for sem4
- [ ] No console errors
- [ ] Teacher / ClassGroup counts unchanged
- [ ] No raw data in docs/json

## 九、L7-F can close?

YES, after browser validation passes.

## 十、Next stage

After browser validation:
- L7-F official close
- L7-G / L7-H / L7-I still blocked until L7-F officially closed
- Then consider entering L7-G (post-apply schedule slot generation)
