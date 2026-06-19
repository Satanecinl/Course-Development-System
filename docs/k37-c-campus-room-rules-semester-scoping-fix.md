# K37-C Campus Room Rules Semester Scoping Fix

## Stage

```text
K37-C-CAMPUS-ROOM-RULES-SEMESTER-SCOPING-FIX
```

## 1. Purpose

Fix HC5/HC6 violations being hardcoded to `semesterId: 1` in the campus
room rules API. The system now supports multiple semesters; diagnostics
should follow the resolved (active or explicitly selected) semester.

## 2. Issue: Hardcoded `semesterId: 1`

| Location | Before | After |
|---|---|---|
| `campus-room-rules` route HC5 query | `semesterId: 1` | `semesterId` (resolved) |
| `campus-room-rules` route HC6 query | `semesterId: 1` | `semesterId` (resolved) |

## 3. Resolved Semester Strategy

| Source | Behavior |
|---|---|
| `?semesterId=<id>` query param | If present, validate existence, use it |
| No query param | Resolve active semester via `resolveSchedulerSemester()` |
| No active semester | Return `NO_ACTIVE_SEMESTER` (200 + empty data) |
| Invalid `semesterId` | Return `SEMESTER_NOT_FOUND` (400) |

The `resolveSchedulerSemester` helper (`src/lib/semester.ts`) handles the
priority order and throws specific errors we catch and translate.

## 4. API Changes

### `GET /api/admin/settings/campus-room-rules`

| Field | Type | Description |
|---|---|---|
| `semesterScoped` | `true` | Marker that scope is per-semester |
| `diagnosticsScope` | `'selected-semester'` \| `'active-semester'` | How semester was resolved |
| `resolvedSemester` | `{ id, code, name, isActive }` | The semester used for diagnostics |

### Behavior

- HC5/HC6 use **resolved** semesterId
- `totalRooms` / `linxiaoRooms` / `nonLinxiaoRooms` remain **global** (Room-level)
- `mismatch` remains **room-level** (Room attribute vs name inference)
- `Room.isLinxiao` editing unchanged (global, not semester-scoped)

## 5. UI Changes

### Semester Banner (new)

```jsx
<div className="bg-blue-50 ...">
  <GraduationCap />
  当前诊断学期：{resolvedSemester.name}（active）
  ({diagnosticsScope}-semester, id={resolvedSemester.id})
</div>
```

### Hooks

- Uses `useSemesterStore` to read `currentSemesterId` and `getCurrentSemesterId()`
- All `fetchCampusRoomRules` calls pass `{ semesterId }`
- Toggle PATCH re-fetches with the same semester
- Room.isLinxiao editing remains global

## 6. PATCH Behavior (unchanged)

- Only updates `Room.isLinxiao`
- No semesterId required
- Response is global; client re-fetches with the resolved semester

## 7. HC5/HC6 / Multi-room Coverage

| Feature | Status |
|---|---|
| HC5 room unavailability | ✅ primary + secondary, scoped to resolved semester |
| HC6 non-automotive in Linxiao | ✅ primary + secondary, scoped to resolved semester |
| Secondary room source | ✅ preserved (K36-B1A5) |
| HC6 hard rule | ✅ Not closable |
| Room.isLinxiao (K37-B) | ✅ Unchanged, still global |

## 8. Verification Results

| Item | Result |
|---|---|
| K37-C verify | ✅ 23/23 PASS |
| K37-B2 runtime fix | ✅ 17/17 PASS |
| K37-B verify | ✅ 25/25 PASS |
| K37-A verify | ✅ 25/25 PASS |
| K36-B1A5 verify | ✅ 19/19 PASS (updated for K37-C) |
| K22-C regression | ✅ 73/0/0/0 (restored) |
| PII scan | ✅ 0 BLOCKING |
| Prisma validate | ✅ valid |
| Prisma migrate status | ✅ up to date |
| Build | ✅ PASS |
| ESLint | ✅ 0 errors |

## 9. Data Baseline

| Item | Value |
|---|---|
| Room count | 42 |
| isLinxiao=true | 5 (林校301-306) |
| ScheduleSlot | 440 |
| TeachingTask | 308 |
| ScheduleAdjustment | 67 |
| Active semester | id=1, name="2025-2026春季学期" |

## 10. Risk

- No new RBAC key
- No new Prisma schema
- No scheduler/score change
- Backward compatible: `fetchCampusRoomRules()` (no arg) still works via active fallback
