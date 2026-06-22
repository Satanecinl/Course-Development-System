# L7-F-XLSX-COURSE-SETTING-NEW-TEMPLATE-PARTIAL-IMPORT-EXECUTION

> Stage: `L7-F-XLSX-COURSE-SETTING-NEW-TEMPLATE-PARTIAL-IMPORT-EXECUTION`
> Date: 2026-06-22
> Status: **CLOSED** (after browser validation)

## 一、Overview

L7-F implements the **controlled write stage** of the new Excel course-setting
template (`templateVersion = new-course-setting-a-m-v2`) import flow. It
consumes the L6-E2 partial import plan (already generated client-side and
server-side) and materialises it to the database under a Prisma transaction
with a DB backup, confirm-token gate, server-side plan hash guard, and
post-apply audit.

**Prior stages** (L7-A / L7-A2 / L7-A2A / L7-A3 / L6-E2 / L6-E1) prepared
the plan in memory. L7-F is the first stage that **writes**.

## 二、Write-stage scope

### Allowed creates
- `Course` — only for `coursePlan.mode = 'createCourse'` AND the candidate
  is `autoAllowedNewCourse` or `confirmedNewCourseCandidate`.
- `ImportBatch` — exactly one per apply (status `APPLIED`,
  `strategy = 'XLSX_COURSE_SETTING_NEW_TEMPLATE'`).
- `TeachingTask` — one per importable row; created with `semesterId =
  targetSemesterId`, `weekType = 'ALL'`, `startWeek = 1`, `endWeek = 16`.
- `TeachingTaskClass` — one per (TeachingTask, ClassGroup) pair; classGroup
  must already exist in the target semester (no auto-create).

### Forbidden creates
- `Teacher` — never created; rows with missing teachers stay in
  `unresolvedRows` and are not applied.
- `ClassGroup` — never created; rows with missing class groups stay in
  `unresolvedRows`.
- `ScheduleSlot` — never created; L7-F is the task-creation stage, not
  the slot-creation stage.
- `ScheduleAdjustment` — never created; L7-F has no UI for moves.
- `Semester` — read-only; only `targetSemesterId` is consulted.

### targetSemesterId
Required. Must match the `targetSemesterId` used in the L6-E2 plan.
Server validates the semester exists and is not active-modified by the
apply flow.

## 三、Confirm token rule

Confirm token format:
```
APPLY_XLSX_COURSE_SETTING_<targetSemesterId>
```

Example: `APPLY_XLSX_COURSE_SETTING_4`

- Required for real apply (`--apply` or no `dryRunOnly=true`).
- Mismatch → `400 INVALID_CONFIRM_TOKEN`.
- Dry-run mode does not require the token.

## 四、Server-side recompute

The apply endpoint never trusts the client's plan. It always:

1. Re-reads the uploaded `.xlsx` file.
2. Re-runs the L4 semester-scoped dry-run.
3. Re-builds the L6-D approval package.
4. Re-builds the L6-D2 review UI rows.
5. Re-builds the L6-E2 partial import plan.
6. Computes `serverPlanHash = SHA-256(stableStringify(plan))`.
7. Compares with `expectedPlanHash` from the request.
8. Mismatch → `409 PLAN_HASH_MISMATCH` with both hashes in the response.

## 五、Transaction

All DB writes execute inside a single `prisma.$transaction` callback. Any
failure rolls back the entire apply. The transaction:

1. Creates new `Course` records (idempotent on `Course.name`).
2. Creates the `ImportBatch` record.
3. Creates one `TeachingTask` per importable row.
4. Creates one `TeachingTaskClass` per (TeachingTask, ClassGroup) pair.
5. Updates `ImportBatch.createdTaskCount`.

The transaction is **closed** before the post-apply audit runs, so the
audit operates on the final committed state.

## 六、DB backup

Before any write, the service calls `createL7FDatabaseBackup()`:

- Source: `prisma/dev.db`
- Destination: `prisma/dev.db.backup-before-l7-f-xlsx-course-setting-import-YYYYMMDD-HHmmss`
- Method: `fs.copyFileSync` (sync write of the entire DB)
- Verification: `statSync(backupPath).size > 0`

If the backup fails, the apply throws and the request returns `500`.

The backup file is in the `prisma/` directory and is excluded by the
existing `prisma/dev.db.backup-*` gitignore pattern. The backup path is
returned in the response and recorded in the `docs/l7-f-*.json` aggregate.

## 七、Duplicate guard

Two layers:

1. **In-memory dedupe**: `taskNaturalKeysSeen` set keyed by
   `(semesterId, courseId, teacherId, weeklyHours, sorted classGroupIds)`.
2. **DB-level dedupe**: `teachingTask.findFirst({ where: { semesterId,
   courseId, teacherId } })` — if an existing task matches, skip.

Duplicate counts are reported in `summary.duplicateTeachingTasksSkipped`.

## 八、Applied rows

Each `importableRows` entry creates:

- 0..1 new `Course` (only if `coursePlan.mode = 'createCourse'`).
- 1 `TeachingTask` (unless duplicate).
- N `TeachingTaskClass` records (N = number of resolved class groups).

## 九、Post-apply audit

After the transaction commits, the service reads the final counts and
verifies:

| Check | Condition |
|---|---|
| `course_delta_equals_createdCourses` | `Course` count delta == `createdCourses` |
| `teaching_task_delta_equals_createdTeachingTasks` | `TeachingTask` count delta == `createdTeachingTasks` |
| `teaching_task_class_delta_equals_createdTeachingTaskClasses` | `TeachingTaskClass` count delta == `createdTeachingTaskClasses` |
| `import_batch_delta_equals_1` | `ImportBatch` count delta == 1 |
| `teacher_unchanged` | `Teacher` count delta == 0 |
| `classgroup_unchanged` | `ClassGroup` count delta == 0 |
| `schedule_slot_unchanged` | `ScheduleSlot` count delta == 0 |
| `schedule_adjustment_unchanged` | `ScheduleAdjustment` count delta == 0 |
| `no_teacher_create_candidates_in_plan` | plan.teachers == [] |
| `no_classgroup_create_candidates_in_plan` | plan.classGroups == [] |
| `all_created_teaching_tasks_target_semester` | enforced by `where: { semesterId }` |
| `all_created_teaching_task_classes_target_classgroup_semester` | classGroupIds originated from semester-scoped dry-run |

If **any** check fails, `applied: false` is returned and the rollback note
instructs the operator to restore the backup.

## 十、Rollback note

Every apply response includes a `rollbackNote` (multi-line string):

```
L7-F rollback note:
  - DB backup: <abs path>
  - ImportBatch ID: <id>
  - Apply status: PASSED | NEEDS REVIEW
  - To rollback, restore the backup file above (cp <backup> prisma/dev.db)
  - L7-F does NOT auto-rollback; restore must be performed manually.
  - Restricted: no ScheduleSlot / ScheduleAdjustment / Teacher / ClassGroup
    rows were created; rollback only touches the four allowed tables.
```

## 十一、Privacy boundary

- All exports have `rawIncluded: false`.
- `rawDisplayPolicy.exportedPlanRawIncluded === false`.
- No raw teacher / class / course / remark text is logged, persisted, or
  returned.
- The `docs/l7-f-*.json` aggregate only contains counts, names, hashes, and
  redacted plan metadata.
- Local raw artifacts are written to `temp/local-artifacts/l7-f/` (gitignored).

## 十二、API design

### `POST /api/admin/import/course-setting-xlsx/partial-import-apply`

Permission: `import:manage`.

Request (multipart/form-data):
```
file:                .xlsx (required, ≤ 20MB)
targetSemesterId:    number (required, must exist)
manualResolutions:   JSON string (required, L6-E1 array)
confirmToken:        string (required unless dryRunOnly)
expectedPlanHash:    SHA-256 (required)
dryRunOnly:          'true' | 'false' (default false)
```

Response (success):
```json
{
  "success": true,
  "stage": "L7-F-XLSX-COURSE-SETTING-NEW-TEMPLATE-PARTIAL-IMPORT-EXECUTION",
  "planVersion": "l7-f-partial-import-execution-v1",
  "templateVersion": "new-course-setting-a-m-v2",
  "dryRunOnly": false,
  "dbWritten": true,
  "applied": true,
  "importBatchId": 42,
  "backupPath": "prisma/dev.db.backup-before-l7-f-xlsx-course-setting-import-...",
  "targetSemester": { "id": 4, "name": "...", "code": "...", "isActive": true },
  "sourceArtifact": { "filename": "...", "sha256": "...", "sizeBytes": 12345 },
  "serverPlanHash": "abc123...",
  "summary": { "importableRows": 5, "createdCourses": 1, ... },
  "counts": { "courseBefore": 100, "courseAfter": 101, ... },
  "postApplyAudit": { "passed": true, "checks": [...] },
  "rollbackNote": "L7-F rollback note: ...",
  "rawIncluded": false,
  "warnings": []
}
```

Errors:
- `400 MISSING_FILE | INVALID_FILE_TYPE | FILE_TOO_LARGE | MISSING_TARGET_SEMESTER | INVALID_TARGET_SEMESTER | MISSING_MANUAL_RESOLUTIONS | INVALID_MANUAL_RESOLUTIONS | MISSING_CONFIRM_TOKEN | INVALID_CONFIRM_TOKEN | MISSING_PLAN_HASH | TARGET_SEMESTER_NOT_FOUND`
- `409 PLAN_HASH_MISMATCH`
- `500 PLAN_VALIDATION_FAILED | INTERNAL | BACKUP_FAILED`

## 十三、UI

`src/components/import/course-setting/course-setting-apply-execution-section.tsx`

- Renders after `PartialPlanSection`.
- Disabled until `partialPlan` exists, `selectedSemesterId` is set, and
  `summary.plannedImportRows > 0`.
- Has confirm token input with pattern validation
  `^APPLY_XLSX_COURSE_SETTING_\d+$`.
- Has apply button (red, "确认执行课程设置导入").
- Has dry-run button (outline, "仅试运行 (Dry-Run)").
- Shows risk warning text:
  > 这是写库操作，会创建课程、教学任务和教学任务-班级关联。不会创建教师。不会创建班级。不会创建课表。不会执行自动排课。执行前会创建数据库备份。
- After apply, shows summary cards, counts delta, post-apply audit, and
  rollback note.

## 十四、CLI trial script

`scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts`

Default: dry-run.

```
# Dry-run
npx tsx scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts \
  --xlsx "<xlsx path>" --target-semester-id 4 --dry-run

# Real apply
npx tsx scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts \
  --xlsx "<xlsx path>" --target-semester-id 4 --apply \
  --confirm-token APPLY_XLSX_COURSE_SETTING_4
```

Outputs:
- `temp/local-artifacts/l7-f/plan.target-<id>.<hash>.json`
- `temp/local-artifacts/l7-f/result.target-<id>.<mode>.<hash>.json`

These are gitignored.

## 十五、Verification script

`scripts/verify-xlsx-course-setting-partial-import-execution-l7-f.ts`

120+ checks across 14 categories:
1. Pre-flight (git, stage constants)
2. Apply route + permission
3. Confirm token + apply
4. Server-side recompute + plan hash
5. DB backup
6. Transaction wrapper
7. Only importable rows applied
8. Forbidden creates (Teacher / ClassGroup / ScheduleSlot)
9. Course create rules
10. Duplicate TeachingTask guard
11. Post-apply audit + rollback note
12. UI: apply panel + confirm token input
13. No forbidden changes (schema, migration, scheduler, score)
14. Git hygiene + forbidden files

## 十六、Browser validation checklist

1. `/admin/import` generates a full review.
2. Generates a partial import plan.
3. Apply panel displays the write-risk description.
4. Apply button is disabled until a confirm token is entered.
5. Invalid tokens are rejected.
6. Valid token executes.
7. Before execution, a backup creation message is shown.
8. After execution, the ImportBatch ID is displayed.
9. The created Course / TeachingTask / TeachingTaskClass counts are displayed.
10. Skipped / unresolved counts are displayed.
11. Post-apply audit passed.
12. Course / TeachingTask / TeachingTaskClass counts in the DB increase per
    the summary.
13. Teacher count is unchanged.
14. ClassGroup count is unchanged.
15. ScheduleSlot count is unchanged.
16. No console errors.

## 十七、Next-stage recommendation

After L7-F:

- **L7-G (post-apply schedule slot generation)** — would use the L7-F
  created `TeachingTask` records plus the L4 dry-run slot data to generate
  `ScheduleSlot` records. Out of scope for L7-F; blocked on slot-mapping
  policy (which days/slots/labs are eligible).
- **L7-H (rollback tooling)** — wraps the `rollbackNote` into a
  user-facing "Undo this apply" button on the import dashboard.
- **L7-I (multi-batch import)** — orchestrates several L7-F applies with
  per-batch rollback notes; allows incremental additions without full
  re-import.

L7-F officially **closes** after browser validation passes.

---

Generated by Claude Code. `L7-F` stage.
