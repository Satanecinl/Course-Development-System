# K29-MULTI-SEMESTER-SCHEDULER-CLOSEOUT

## 1. Stage

`K29-MULTI-SEMESTER-SCHEDULER-CLOSEOUT`

## 2. Closed Scope

Lightweight closeout of the K29 multi-semester auto-scheduling feature.
No new functionality, no long audit, no business-logic changes. Only
status consolidation, required verification, and document archival.

## 3. K29-A Implementation Summary

`feat(scheduler): support semester switching (K29-A)` — commit `098ad77`

**UI changes**:
- Added `SemesterSelector` + `useSemesterStore` to `/admin/scheduler` page
- Preview POST body now includes `semesterId: currentSemesterId`
- `SolverConfigPanel` receives `semesterId={currentSemesterId}` (was `null`)
- Lockable slots fetched with `withSemesterQuery(url, currentSemesterId)`
- New readiness display: data counts, blockers, warnings, canPreview flag
- Page state resets on semester change

**API changes**:
- New `GET /api/admin/scheduler/readiness?semesterId=N` — read-only,
  returns `canPreview`, `blockers`, `warnings`, `counts`, latest
  import batch, latest scheduling run

**Backend**: no changes (already semester-aware)

## 4. K29-B Manual Trial Status

**PASSED** by manual browser validation.

Evidence:
- `/admin/scheduler` can switch semesters
- Readiness display updates when semester changes
- Preview uses selected semesterId
- `SchedulingRun.semesterId` is correctly persisted
- No-data semester blocks preview with clear "请先到导入或教学任务管理中添加" message
- Apply / rollback still derive from `run.semesterId` (not from UI)
- Cross-semester risk is controlled (no cross-semester writes possible)

## 5. Feature Status

**`READY_FOR_REAL_USE`**

## 6. Semester Behavior Summary

| Operation | Semester Source |
|-----------|-----------------|
| Preview | UI selected semesterId (validated by `resolveSchedulerSemester`) |
| Apply | `previewRun.semesterId` from DB record |
| Rollback | `applyRun.semesterId` from DB record |
| Lockable slots | `?semesterId=` (UI) |
| Configs | `semesterId` prop (UI) |
| Readiness | `?semesterId=` (UI) |
| Run list | `?semesterId=` (already supported by runs API) |

## 7. Cross-Semester Safety

- `preview`: semester from UI (selectedSemesterId), validated by `resolveSchedulerSemester`
- `apply`: semester from `previewRun.semesterId` (DB record, safe)
- `rollback`: semester from `applyRun.semesterId` (DB record, safe)
- ScheduleSlot writes are scoped by `run.semesterId` via `data-loader.ts` filter
- No cross-semester writes possible via the public API

## 8. Validation Results

- **K29 closeout verify**: 20/20 PASS
- **K29-A verify**: 23/23 PASS
- **K22-C score regression**: 73/0/0/0 PASS
- **K26 closeout**: 106/106 PASS
- **K28-C verify**: PASS (updated for K29-A)
- **prisma validate**: PASS
- **migrate status**: 9 migrations, up to date
- **build**: PASS
- **lint**: 334 (185 errors / 149 warnings) — same as K29-A baseline
- **auth foundation**: 61 passed / 1 pre-existing failed

## 9. Lint Baseline

- Current baseline: 185 errors / 149 warnings (K29-A introduced +3
  warnings, all in new code; error count unchanged)
- No source changes in this closeout
- Future K29-LINT-CLEANUP can address the +3 warnings if desired

## 10. Known Follow-Ups

- `/admin/scheduler/history` page does not yet have a semester
  selector. This is a UI-only follow-up; the runs API already
  supports `?semesterId=`.
- The current DB has only one active semester with TeachingTask
  data. Full multi-semester safety is verified at the code level
  but a DB-level multi-semester trial needs a second semester with
  teaching plan data.
- Lint baseline 185/149 (3 new warnings from K29-A, all informational).

## 11. Recommended Next Stage

`K28-B-USER-ADJUSTMENT-APPROVAL-FLOW-MANUAL-TRIAL` — full browser
validation of the USER → ADMIN adjustment request approval flow.
