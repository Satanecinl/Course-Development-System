# L7-F2-PLAN-APPLY-FULL-DATASET-WIRING-AND-SEMESTER4-CLASSGROUP-GATE

> Stage: `L7-F2-PLAN-APPLY-FULL-DATASET-WIRING-AND-SEMESTER4-CLASSGROUP-GATE`
> Date: 2026-06-22
> Status: **CLOSED**

## 一、Background

L7-F1 identified three root causes why the L7-F apply trial produced an
empty ImportBatch #39:

1. `maxPreviewRows` defaults to 50 in the L4 mapper; plan/apply routes
   and CLI trial did not override it
2. L7-A3's "importableItems=903" is a status metric, not the same as
   L6-E2's plan "importableRows"
3. targetSemesterId=4 has 0 ClassGroups, so no TeachingTaskClass links
   can be created

L7-F2 fixes root causes #1 and #3, and adds hard gates to prevent
regression.

## 二、Root Cause #1 Fix — maxPreviewRows

Added `maxPreviewRows: 100000` to the L4 mapper call in:

| Route / Script | Before | After |
|---|---|---|
| `partial-import-plan/route.ts` | default 50 | 100000 |
| `partial-import-apply/route.ts` | default 50 | 100000 |
| CLI trial script | default 50 | 100000 |

Result: the L6-E2 plan now processes **1167 rows** (was 50).
- `importableRows`: 175 (was 4)
- `unresolvedRows`: 992 (was 46)
- `blockingRows`: 1337 (was 69)

The approval-review route was already at 100000 (from L7-A2A).

## 三、Root Cause #3 Fix — ClassGroup Hard Gate

### Apply route (`partial-import-apply/route.ts`)

Added a ClassGroup count check **before** backup and transaction:

```ts
if (!dryRunOnly) {
  const classGroupCount = await prisma.classGroup.count({
    where: { semesterId: targetSemesterId },
  })
  if (classGroupCount === 0) {
    return errorResponse(
      'TARGET_SEMESTER_HAS_NO_CLASS_GROUPS',
      '目标学期没有班级数据，不能执行课程设置导入...',
      400,
    )
  }
}
```

Execution order after fix:
1. auth / permission
2. parse request
3. validate confirm token
4. server-side recompute (full dataset)
5. plan hash guard
6. **ClassGroup count gate** ← NEW
7. backup creation
8. transaction

When ClassGroup=0:
- No backup created
- No ImportBatch created
- No DB write
- Error `TARGET_SEMESTER_HAS_NO_CLASS_GROUPS` returned

### CLI trial script

Added `--expect-classgroup-gate` flag and ClassGroup check:

```bash
npx tsx scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts \
  --xlsx "<path>" --target-semester-id 4 --apply \
  --confirm-token APPLY_XLSX_COURSE_SETTING_4 --expect-classgroup-gate
```

Exit code 0 when gate triggered as expected.

### Partial plan response

Added `targetSemesterReadiness` field:

```json
{
  "targetSemesterReadiness": {
    "targetSemesterId": 4,
    "classGroupCount": 0,
    "canApply": false,
    "blockingReason": "TARGET_SEMESTER_HAS_NO_CLASS_GROUPS"
  }
}
```

### UI

Apply button disabled when `canApply=false`. Red warning banner:

> 目标学期没有班级数据，不能执行课程设置导入。请先创建/导入目标学期班级，或选择已有班级数据的目标学期。

## 四、ImportBatch #39

**Untouched**. Status: APPLIED. No rollback, no modification.

## 五、DB counts

| Table | Count | Change |
|---|---|---|
| Course | 104 | unchanged |
| Teacher | 220 | unchanged |
| ClassGroup (sem4) | 0 | unchanged |
| TeachingTask (sem4) | 0 | unchanged |
| TeachingTaskClass | 446 | unchanged |
| ImportBatch | 39 | unchanged |
| ScheduleSlot (sem4) | 0 | unchanged |

**No DB writes during L7-F2.**

## 六、Next Stage

L7-F2 closes. L7-F still cannot close — a valid non-empty apply trial
requires a target semester with ClassGroups.

Next stage: `L7-F3` — import ClassGroups into targetSemesterId=4 (or
select a different semester) and re-run a valid apply trial.
