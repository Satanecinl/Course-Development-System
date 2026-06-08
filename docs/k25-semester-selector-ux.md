# K25-E: Semester Selector UX

## 1. Executive Summary

K25-E implements the frontend semester selector UX for the multi-semester management system. This stage:

- Provides a visible "current semester" display in the dashboard and admin pages
- Lets users switch semesters via a dropdown selector
- Persists the selected semester in `localStorage`
- Makes API requests explicitly carry `?semesterId=<id>` rather than relying on server-side active-semester fallback
- Surfaces `semesterSource: 'activeFallback'` as a lightweight UI hint

**Scope boundaries**: No schema changes, no new migrations, no DB writes, no API scoping expansion, no RBAC changes, no solver/score modifications.

## 2. GitHub Sync Status

| Field | Value |
|---|---|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Tracking | `origin/master` |
| Local HEAD | (to be filled after commit) |
| Remote HEAD | `053c550` (K25-D2 lint baseline) |
| Start status | clean (ahead 1 — K25-D2 commit not yet pushed) |
| Pushed | (to be filled after push) |

## 3. Semester List Source

**Endpoint**: `GET /api/semesters` (new, read-only)

**Response shape**:
```json
{
  "success": true,
  "semesters": [
    {
      "id": 1,
      "name": "2026年春季学期",
      "code": "2026SPRING",
      "academicYear": "2025-2026",
      "term": "2",
      "startsAt": "...",
      "endsAt": "...",
      "isActive": true
    }
  ],
  "activeSemesterId": 1
}
```

- Ordered by `id DESC` (most recent first)
- No auth gate — the semester list is non-sensitive
- `activeSemesterId` is the unique active semester, or `null` if none

## 4. Semester Store / Client

**File**: `src/store/semesterStore.ts`

**State**:
- `semesters: SemesterSummary[]` — full list from `/api/semesters`
- `currentSemesterId: number | null` — the user's selected semester
- `currentSemesterName: string | null` — display name
- `isActiveSemester: boolean` — whether current selection matches the DB active semester
- `loaded / loading / error` — fetch lifecycle

**Initialization logic**:
1. Load semester list from `/api/semesters`
2. Check `localStorage` for persisted `course-system.currentSemesterId`
3. If persisted id still exists in the list → use it
4. Otherwise → use `activeSemesterId` from API response
5. Otherwise → use first semester in list
6. Persist the resolved choice

**localStorage key**: `course-system.currentSemesterId`

**Helpers**:
- `withSemesterQuery(url, semesterId)` — appends `?semesterId=<id>` to a URL
- `getCurrentSemesterId()` — reads current value from store

## 5. UI Placement

| Page | Component | Notes |
|---|---|---|
| `/dashboard` | `SemesterSelector` in header | Inline next to title, with fallback warning |
| `/admin/db` | Via `useSemesterStore` | Admin API calls pass semesterId |

The selector is a `<select>` dropdown with:
- Current semester name + "(当前)" suffix on the active entry
- "非激活学期" amber label when viewing a non-active semester
- "当前使用默认激活学期" hint when using active fallback

## 6. API Request Wiring

| Consumer | API | Semester method |
|---|---|---|
| `scheduleStore.fetchSchedule` | `/api/schedule` | `withSemesterQuery` auto-resolves from semesterStore |
| `dashboard-content` effective schedule | `/api/schedule?week=N&applyAdjustments=true` | `withSemesterQuery` with `currentSemesterId` |
| `dashboard-content` export | `/api/export/excel` | `params.set('semesterId', ...)` |
| `admin-db/api.ts` fetchAdminTableRecords | `/api/admin/{model}` | `withSemesterQuery` |
| `admin-db/api.ts` fetchAdminTableCounts | `/api/admin/{model}` | `withSemesterQuery` (loop) |
| `admin-db/api.ts` fetchEntityOptions | `/api/entity-list?type=classgroup` | `withSemesterQuery` |
| `admin-db/api.ts` fetchTaskOptions | `/api/admin/teachingtask` | `withSemesterQuery` |

All read/list requests now explicitly carry `?semesterId=<id>`.

## 7. Fallback Warning

When the API response contains `semesterSource: 'activeFallback'`:
- `scheduleStore.semesterSource` is set to `'activeFallback'`
- Dashboard shows: `(使用默认激活学期)` in amber text next to the week indicator
- The `SemesterSelector` component always shows `当前使用默认激活学期` when `isActiveSemester` is true

When the user has explicitly selected a semester and the request carries `?semesterId=`, the server returns `semesterSource: 'query'` — no fallback warning is shown.

## 8. Non-Goals

- ❌ No `prisma/schema.prisma` changes
- ❌ No new migrations
- ❌ No DB writes
- ❌ No API scoping expansion (K25-D resolver unchanged)
- ❌ No RBAC changes
- ❌ No solver/score changes
- ❌ No importer/parser changes
- ❌ No K22/K23/K24 verify expected changes

## 9. Verification Results

```
(TO BE FILLED after running: npx tsx scripts/verify-semester-selector-ux-k25-e.ts)
```

## 10. Recommended Next Stage

`K25-F-MULTI-SEMESTER-E2E-MANUAL-TRIAL`

Reasons:
- K25-E provides the selector UX; actual multi-semester data entry and E2E testing requires a trial run
- If any frontend issues are found during manual trial, `K25-E1-SEMESTER-SELECTOR-UX-FIX` should be opened first
