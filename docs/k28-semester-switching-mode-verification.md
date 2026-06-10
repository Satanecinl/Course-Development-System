# K28-C: Semester Switching Mode Verification

## 1. Questions Answered

### 1.1 Can `/admin/scheduler` (auto-scheduling) directly switch semesters?
**No.** The scheduler page has no `SemesterSelector`, no `useSemesterStore`,
and does not pass `semesterId` to the API. It uses the unique active
semester only. Mode: `A_ACTIVE_SEMESTER_ONLY`.

### 1.2 Can the adjustment (调课) page directly switch semesters?
**N/A — the admin adjustment dialog is in-place inside `/dashboard`**, not
a standalone page. The dashboard uses `SemesterSelector` (global) and
passes the selected semesterId to `/api/schedule` and the plan-rec
endpoint. So the **调课 source data is gated by the global selector**,
but the **调课 action target (ScheduleAdjustmentRequest.semesterId)** is
determined by the source slot, not the page.

### 1.3 Can the USER adjustment request page directly switch semesters?
**No.** Both `/my-adjustment-requests` and the USER adjustment dialog
have no `SemesterSelector`. The dialog accepts an optional `semesterId`
in the body (which falls back to active). The `mine` API returns all
semesters for the user (no filter). Mode: `E_CROSS_SEMESTER_RISK`
(USER listing) and `D_API_ONLY` (USER dialog submit/recommend).

### 1.4 Which semester does each flow actually use?
| Flow | Source |
|------|--------|
| `/admin/scheduler` | Unique active semester |
| Scheduler preview/apply/rollback | Active semester (or stored in `SchedulingRun` record) |
| `/dashboard` | Global `SemesterSelector` via `useSemesterStore` + `withSemesterQuery` |
| Adjustment dry-run/apply/void | `body.semesterId` or active; `originalSlot.semesterId` must match |
| Adjustment plan-rec | `body.semesterId` or active |
| USER submit request | `body.semesterId` or active; `sourceSlot.semesterId` must match |
| USER dry-run request | Active semester only (no body field) |
| USER recommendations | `body.semesterId` or active |
| USER mine listing | **None — returns ALL semesters for the user** |
| ADMIN list requests | Optional `?semesterId=` query; page never sets it → **returns ALL** |
| ADMIN approve request | **Stored `request.semesterId` from DB row** (correct) |
| ADMIN reject request | Status-only change |

### 1.5 If the user changes the global SemesterSelector, do these pages follow?
- **/dashboard**: ✅ Yes (uses `withSemesterQuery` on all calls)
- **/admin/scheduler**: ❌ No (does not read `useSemesterStore`)
- **/my-adjustment-requests**: ❌ No
- **/admin/adjustment-requests**: ❌ No
- **USER adjustment dialog (inside /dashboard)**: ⚠️ The dialog opens from
  a course card on the dashboard, so the source `slot` belongs to the
  currently-selected semester. But the dialog's submit/recommend API
  uses `body.semesterId` only if explicitly passed; otherwise it falls
  back to active. If active changes after the dialog opens, the target
  resolution is no longer aligned with the source slot. The `submit`/
  `approve` flow's `sourceSlot.semesterId === resolved.id` check
  prevents actual cross-semester writes — but the UX is still confusing.

### 1.6 Are there APIs that support `semesterId` but the UI doesn't expose?
- **Yes**:
  - `/api/schedule-adjustment-requests` (POST submit) accepts `semesterId`
  - `/api/schedule-adjustment-requests/recommendations` (POST) accepts `semesterId`
  - `/api/admin/schedule-adjustment-requests` (GET list) accepts `?semesterId=`
  - `/api/schedule-adjustments/plan-recommendations` (admin) accepts `semesterId`
  - All adjustment routes accept `semesterId`
  - All scheduler routes accept `semesterId` (or use active)

  None of the relevant pages (scheduler, my-requests, admin/requests,
  USER dialog) currently sends `semesterId` to these endpoints. The
  `adjustment-request-client.ts` type definitions include `semesterId`
  on submit payload, but the dialog never sets it.

### 1.7 Is there a cross-semester risk?
- **HIGH**: `/my-adjustment-requests` returns all semesters' requests
  for the user. No page-level filter. If the user has submitted
  requests in 2+ semesters, the list shows them all mixed together.
- **MEDIUM**: `/admin/adjustment-requests` returns all semesters when
  no `?semesterId=` filter is set. The page doesn't expose a selector.
- **LOW (prevented)**: USER submit and ADMIN approve both validate
  `sourceSlot.semesterId === resolved.id`. A direct cross-semester
  write is impossible via the public API.
- **LOW**: Scheduler uses the active semester. Apply/Rollback derive
  semester from the run record, not from any user input.

### 1.8 Does the next stage need to implement a page-level semester picker?
**Optional**, depending on UX requirements:

- If the requirement is "USER only sees their requests for the
  currently-active semester": add a semester selector to
  `/my-adjustment-requests` (or scope the API to active by default).
- If the requirement is "USER can browse requests across all
  semesters": add a semester selector and pass `?semesterId=` to
  `listMyAdjustmentRequests`.
- If the requirement is "ADMIN can scope the approval queue by
  semester": add a semester selector to `/admin/adjustment-requests`.

## 2. Mode Classification Summary

| Page / Flow | Mode |
|-------------|------|
| `/admin/scheduler` | A_ACTIVE_SEMESTER_ONLY |
| `/dashboard` | B_GLOBAL_SELECTOR |
| `/my-adjustment-requests` | E_CROSS_SEMESTER_RISK (no filter) |
| `/admin/adjustment-requests` | D_API_ONLY (filter exists but unused) |
| Scheduler preview/apply/rollback | A_ACTIVE_SEMESTER_ONLY |
| Adjustment dry-run/apply/void/plan-rec | D_API_ONLY (semesterId in body) |
| USER request dry-run/submit/recommend | D_API_ONLY |
| USER request mine | E_CROSS_SEMESTER_RISK |
| ADMIN request list | D_API_ONLY |
| ADMIN request approve | A_ACTIVE_SEMESTER_ONLY (from row) |

## 3. Verification Results

- K28-C verify: **33/33 PASS**
- K28-A verify: **67/67 PASS**
- K28-A2 verify: **26/26 PASS**
- prisma validate: PASS
- migrate: 9 migrations, up to date
- build: PASS
- lint: 331 (185/146) — same as K28-A baseline
- auth foundation: 61/1 pre-existing

## 4. Recommendations

If semester scoping is needed at the page level:

- Add a `SemesterSelector` to `/my-adjustment-requests` and pass the
  selected semester to the `mine` API (will require widening the
  `listMyAdjustmentRequests` service to accept an optional
  `semesterId` filter, and adding a corresponding query parameter to
  the route).
- Add a `SemesterSelector` to `/admin/adjustment-requests` and pass
  the selected semester as `?semesterId=` to the ADMIN list API
  (the API already supports it).
- Optionally: add a `SemesterSelector` to the USER adjustment
  dialog (or pre-fill the dialog with the dashboard's current
  semester automatically).

Otherwise, the current behavior is safe (no cross-semester write
is possible) and the next stage is K28-D (manual trial).
