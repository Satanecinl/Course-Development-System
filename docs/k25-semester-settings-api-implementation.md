# K25-H: Semester Settings API Implementation

## 1. Executive Summary

K25-H implements the semester settings management API. This includes:
- Enhanced `GET /api/semesters` with optional `?includeCounts=true` for dependency data
- `POST /api/semesters` for creating new semesters
- `PUT /api/semesters/[id]` for editing semesters
- `DELETE /api/semesters/[id]` for deleting empty semesters with dependency protection
- `POST /api/semesters/[id]/activate` for setting the active semester
- `GET /api/semesters/[id]/dependencies` for dependency count queries

All write operations require `settings:manage` permission. The basic `GET /api/semesters` remains public for K25-E SemesterSelector compatibility.

**No schema changes, no UI changes, no DB writes.**

## 2. GitHub Sync Status

| Field | Value |
|---|---|
| Branch | `master` |
| Remote | `origin` → `git@github.com:Satanecinl/Course-Development-System.git` |
| Tracking | `origin/master` |
| Local HEAD before | `f4976e7` |
| Remote HEAD before | `f4976e7` |
| ahead/behind | up to date |
| Fetch | ✅ executed |
| Push | (after commit) |
| Force push | ❌ never |

## 3. Implemented API

### GET /api/semesters (enhanced)

- Basic GET: public read, returns `semesters[]` + `activeSemesterId` (K25-E compatible)
- `?includeCounts=true`: requires `settings:manage`, adds `_count` and `canDelete` per semester

### POST /api/semesters

- Creates a new semester
- Validates: name required, code required + unique, date range
- If `isActive=true`: transaction deactivates all, then creates active
- Permission: `settings:manage`

### PUT /api/semesters/[id]

- Edits semester fields
- Validates: name/code non-empty if provided, code unique, date range
- Guards: cannot directly deactivate active semester (`CANNOT_DEACTIVATE_ACTIVE_SEMESTER_DIRECTLY`)
- If `isActive=true`: transaction for uniqueness
- Permission: `settings:manage`

### DELETE /api/semesters/[id]

- Deletes only empty, non-active, non-last semesters
- 7 dependency checks: ClassGroup, TeachingTask, ScheduleSlot, ScheduleAdjustment, SchedulingRun, SchedulingConfig, ImportBatch
- Returns 409 with dependency details if blocked
- Permission: `settings:manage`

### POST /api/semesters/[id]/activate

- Sets a semester as active
- Transaction: deactivate all → activate target
- Idempotent: already-active returns success
- Permission: `settings:manage`

### GET /api/semesters/[id]/dependencies

- Returns dependency counts and delete status
- Permission: `settings:manage`

## 4. Permission Model

| Endpoint | Permission | Notes |
|---|---|---|
| GET /api/semesters (basic) | none | Public for K25-E selector |
| GET /api/semesters?includeCounts=true | settings:manage | Admin-only dependency data |
| POST /api/semesters | settings:manage | Create |
| PUT /api/semesters/[id] | settings:manage | Edit |
| DELETE /api/semesters/[id] | settings:manage | Delete |
| POST /api/semesters/[id]/activate | settings:manage | Activate |
| GET /api/semesters/[id]/dependencies | settings:manage | Dependency query |

## 5. Validation Rules

- **name**: required, non-empty after trim
- **code**: required, non-empty after trim, unique (checked via `findFirst` for update)
- **date range**: `startsAt < endsAt` when both provided
- **invalid id**: returns 400 `INVALID_SEMESTER_ID`
- **not found**: returns 404 `SEMESTER_NOT_FOUND`
- **direct deactivation**: returns 400 `CANNOT_DEACTIVATE_ACTIVE_SEMESTER_DIRECTLY`

## 6. Delete Protection

| Blocker | Error Code | HTTP |
|---|---|---|
| Active semester | `SEMESTER_ACTIVE_DELETE_FORBIDDEN` | 409 |
| Last semester | `SEMESTER_LAST_DELETE_FORBIDDEN` | 409 |
| Has dependencies | `SEMESTER_HAS_DEPENDENCIES` | 409 |

7 dependency models checked. No cascade delete.

## 7. Active Semester Transaction

```ts
await prisma.$transaction(async (tx) => {
  await tx.semester.updateMany({ data: { isActive: false } })
  return tx.semester.update({ where: { id }, data: { isActive: true } })
})
```

Guarantees at most 1 active semester at any time.

## 8. Compatibility with K25-E

- `GET /api/semesters` basic response shape unchanged: `{ success, semesters[], activeSemesterId }`
- `formatSemesterSummary` ensures consistent field set
- `includeCounts` is additive — existing consumers unaffected
- No UI changes made

## 9. Verification Results

| Command | Result |
|---|---|
| `npx tsx scripts/verify-semester-settings-api-k25-h.ts` | ✅ PASS=71 FAIL=0 |
| `npx tsx scripts/audit-semester-settings-management-k25-g.ts` | ✅ PASS=58 FAIL=0 |
| `npx tsx scripts/verify-semester-selector-ux-k25-e.ts` | ✅ PASS=63 FAIL=0 |
| `npx tsx scripts/verify-semester-scoping-api-k25-d.ts` | ✅ PASS=54 FAIL=0 |
| `npx tsx scripts/validate-multi-semester-schema-k25-c.ts` | ✅ 37/37 PASS |
| `npx prisma validate` | ✅ valid |
| `npx prisma migrate status` | ✅ up to date |
| `npm run build` | ✅ compiled |
| `npm run lint` | ✅ 184 errors / 136 warnings |
| `npm run test:auth-foundation` | 53 passed / 1 failed |

## 10. Unmodified Scope

- ✅ Schema: not modified
- ✅ Migrations: not added
- ✅ DB: not written
- ✅ Frontend UI: not implemented
- ✅ Scheduler / score / solver: not modified
- ✅ Importer / parser: not modified
- ✅ RBAC permission model: not modified
- ✅ K22 / K23 / K24 expected: not modified

## 11. Recommended Next Stage

`K25-I-SEMESTER-SETTINGS-UI-IMPLEMENTATION`

K25-I should implement the system settings page UI for semester management, consuming the K25-H API. No further API or schema changes needed.
