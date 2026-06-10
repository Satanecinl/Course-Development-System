# K29-A: Multi-Semester Scheduler Implementation

## 1. Summary

Added semester switching to the auto-scheduling page (`/admin/scheduler`).
The scheduler UI now includes a `SemesterSelector` that lets the admin
choose which semester to work with. Preview requests include the selected
`semesterId`, and lockable slots / configs are scoped by semester.

**The backend was already fully semester-aware** — the gap was entirely
in the frontend, which hardcoded `semesterId=null` and never sent it to
the API.

## 2. Changes

### UI (`scheduler-content.tsx`)

- Import `SemesterSelector` + `useSemesterStore` + `withSemesterQuery`
- Added readiness state (canPreview, blockers, warnings, counts)
- Preview POST body now includes `semesterId: currentSemesterId`
- `SolverConfigPanel` receives `semesterId={currentSemesterId}` (was `null`)
- Lockable slots fetched with `withSemesterQuery(url, currentSemesterId)`
- Both lockable slots and readiness re-load on semester change
- Page state resets on semester change
- Readiness display shows: data counts, blockers, warnings, canPreview

### API (`/api/admin/scheduler/readiness`)

- New read-only GET endpoint
- Accepts `?semesterId=` query param
- Returns: `canPreview`, `blockers`, `warnings`, `counts`, `latestImportBatch`, `latestSchedulingRun`
- Permission: `schedule:apply` (same as other scheduler APIs)
- No DB writes

### Backend (no changes)

All backend APIs were already semester-aware:
- **Preview**: accepts `semesterId` in body, falls back to active
- **Apply**: derives `semesterId` from `previewRun.semesterId` (safe)
- **Rollback**: derives `semesterId` from `applyRun.semesterId` (safe)
- **Run list**: accepts `?semesterId=` query param
- **Lockable slots**: accepts `?semesterId=` query param
- **Config panel**: accepts `semesterId` prop (was already there)

## 3. Cross-Semester Safety

| Operation | Semester Source | Safety |
|-----------|----------------|--------|
| Preview | `body.semesterId` (UI sends selected semester) | Low — semester validated by `resolveSchedulerSemester` |
| Apply | `previewRun.semesterId` (from DB record) | Safe — not from UI or active |
| Rollback | `applyRun.semesterId` (from DB record) | Safe — not from UI or active |
| Lockable slots | `?semesterId=` (UI sends selected semester) | Read-only |
| Configs | `semesterId` prop (UI sends selected semester) | Read-only |

## 4. Verification

- K29-A verify: **23/23 PASS**
- K28-A verify: **67/67 PASS**
- K28-A2 verify: **26/26 PASS**
- K28-A1 verify: **17/17 PASS**
- K28-C verify: **PASS** (updated to accept SemesterSelector on scheduler)
- K26 closeout: **106/106 PASS**
- prisma validate: PASS
- migrate: 9 migrations, up to date
- build: PASS
- lint: 334 (185/149) — error count same as K28-A baseline, +3 warnings
- auth foundation: 61/1 pre-existing

## 5. Known Limitations

- The run history page (`/admin/scheduler/history`) does not have a
  semester selector — it shows all semesters' runs. This can be added
  in a follow-up if needed.
- The current DB has only one active semester with TeachingTask data.
  Multi-semester preview/apply needs at least 2 semesters with data
  to fully exercise the cross-semester safety.

## 6. Recommended Next Stage

`K29-B-MULTI-SEMESTER-SCHEDULER-MANUAL-TRIAL`
