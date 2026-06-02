# K15-RBAC-PERMISSION-GRANULARITY-MIGRATION-AUDIT

## Audit Date

2026-06-02

## Stage Name

K15-RBAC-PERMISSION-GRANULARITY-MIGRATION-AUDIT

## Background

K14-RBAC-SCHEDULE-WRITE-HARDENING-FIX-B (commit `8b7fe08`) completed admin teaching-task update conflict guards. K14 audit identified two remaining MEDIUM findings:

- `K14-RBAC-MEDIUM-1`: `data:write` covers both ordinary data CRUD and schedule-sensitive operations.
- `K14-RBAC-MEDIUM-6`: `data:write` permission granularity is too broad.

These are permission model design issues requiring a migration strategy, not a small fix. K15 performs a read-only audit of the full permission landscape and designs a migration plan.

## Audit Scope

- Permission string definitions
- Role-to-permission mapping
- `data:write` use site classification
- Schedule-sensitive capabilities
- Admin generic route model permissions
- Frontend gating migration impact
- Import permission analysis
- Schedule adjustment permission analysis
- Conflict-check / preflight read permission analysis
- Permission taxonomy design
- Migration strategy design

## Audit Method

1. Static source code scanning of `src/` and `scripts/` directories.
2. Read-only grep for permission strings across all `.ts` and `.tsx` files.
3. Manual review of admin generic route model map, field whitelist, and permission checks.
4. Manual review of frontend `useHasPermission` usage.
5. No database connection required. No files modified.

## Permission Definition Location

**File:** `src/lib/auth/types.ts`, lines 26–37

```typescript
export const ALL_PERMISSIONS = [
  'schedule:view',
  'schedule:adjust',
  'data:read',
  'data:write',
  'data:delete',
  'data:export',
  'import:manage',
  'settings:manage',
  'users:manage',
  'diagnostics:view',
] as const
```

## Role Mapping Location

**Seed file:** `scripts/seed-auth.ts`, lines 67–123

**Database tables:** `Role`, `Permission`, `RolePermission` (join)

## Current Permission List

| # | Permission | Description |
|---|---|---|
| 1 | `schedule:view` | View schedule dashboard and conflict data |
| 2 | `schedule:adjust` | Auto-scheduler, adjustments, room capacity management |
| 3 | `data:read` | Read entity data (classgroup, teacher, course, room, etc.) |
| 4 | `data:write` | Create/update entity data AND schedule slots/teaching tasks |
| 5 | `data:delete` | Delete entity data via admin generic route |
| 6 | `data:export` | Export data to Excel |
| 7 | `import:manage` | Parse, confirm, rollback, abandon import batches |
| 8 | `settings:manage` | System settings |
| 9 | `users:manage` | User and role management |
| 10 | `diagnostics:view` | Diagnostic tools |

## Current Role List

| Role | Permissions | Description |
|---|---|---|
| ADMIN | All 10 | Full system access |
| USER | `data:read` | Read-only data viewing |
| DATA_EXPORTER | `data:read`, `data:export` | Read + export |

## data:write Effective Capabilities

`data:write` currently grants:

1. **Admin data page access** (`/admin/db` route and navigation)
2. **Entity CRUD** via admin generic route: classgroup, teacher, course, room, scheduleslot, teachingtask (POST + PUT)
3. **Dedicated entity creation**: `POST /api/courses`, `POST /api/teachers`
4. **Schedule slot CRUD**: `POST /api/schedule-slot`, `PUT /api/schedule-slot/[id]`
5. **Teaching task CRUD**: `POST /api/teaching-task`, `PUT /api/teaching-task/[id]`
6. **Schedule grid drag-to-edit** (frontend UX guard)

**Risk:** `data:write` is the sole write permission for all data mutations, including schedule-sensitive operations.

## Role Matrix

| Role | Current Permissions | Effective Capabilities | Risk | Suggested Future Permissions |
|---|---|---|---|---|
| ADMIN | All 10 | Full CRUD, scheduling, import, settings, users, diagnostics | None (admin should have everything) | All current + `schedule:write` + `teaching-task:write` |
| USER | `data:read` | Read-only entity data viewing | None | No change |
| DATA_EXPORTER | `data:read`, `data:export` | Read + Excel export | None | No change |
| (Future: SCHEDULE_EDITOR) | — | — | — | `schedule:view`, `schedule:adjust`, `schedule:write`, `data:read` |
| (Future: DATA_EDITOR) | — | — | — | `data:read`, `data:write`, `data:delete` |

## Permission Use Site Matrix

| Permission | Use Sites (src) | Use Sites (scripts) | Grants Schedule-Sensitive Write? | Too Broad? | Suggested Replacement |
|---|---|---|---|---|---|
| `schedule:view` | 3 (route-permissions, navigation, conflict-check API, schedule GET API) | ~8 | No | No | Keep as-is |
| `schedule:adjust` | 14 (10 API routes, 2 frontend, 2 nav/route-perm) | ~27 | Yes (adjustments, scheduler, room capacity) | No (well-scoped) | Keep as-is |
| `data:read` | 3 (route-permissions, navigation, admin generic GET) | ~5 | No | No | Keep as-is |
| `data:write` | 12 (8 API routes, 1 frontend, 1 nav, 1 route-perm, 1 comment) | ~8 | **YES** (scheduleslot, teachingtask) | **YES** | Split: `data:write` (ordinary) + `schedule:write` (scheduleslot) + `teaching-task:write` (teachingtask) |
| `data:delete` | 2 (definition, admin generic DELETE) | ~9 | Yes (can delete scheduleslot, teachingtask) | Moderate | Keep for now; consider per-model split later |
| `data:export` | 2 (definition, seed) | ~3 | No | No | Keep as-is |
| `import:manage` | 9 (6 API routes, 1 nav, 1 route-perm, 1 definition) | ~15 | Indirect (confirm writes schedule data) | Slight (covers read + write) | Keep; split to `import:read` only if non-admin import viewing needed |
| `settings:manage` | 2 (nav, route-perm) | ~2 | No | No | Keep as-is |
| `users:manage` | 2 (nav, route-perm) | ~2 | No | No | Keep as-is |
| `diagnostics:view` | 2 (nav, route-perm) | ~2 | No | No | Keep as-is |

## Route Migration Matrix

| Route / Model | Current Permission | Schedule-Sensitive? | Suggested Permission | Breaking Risk | Migration Priority |
|---|---|---|---|---|---|
| `admin/[model] GET` | `data:read` | No | `data:read` | None | No change |
| `admin/[model] POST` (classgroup) | `data:write` | No | `data:write` | None | No change |
| `admin/[model] POST` (teacher) | `data:write` | No | `data:write` | None | No change |
| `admin/[model] POST` (course) | `data:write` | No | `data:write` | None | No change |
| `admin/[model] POST` (room) | `data:write` | Indirect (capacity) | `data:write` | None | No change |
| `admin/[model] POST` (scheduleslot) | `data:write` | **YES** | `schedule:write` | Medium | HIGH |
| `admin/[model] POST` (teachingtask) | `data:write` | **YES** | `teaching-task:write` | Medium | HIGH |
| `admin/[model] PUT` (classgroup) | `data:write` | No | `data:write` | None | No change |
| `admin/[model] PUT` (teacher) | `data:write` | No | `data:write` | None | No change |
| `admin/[model] PUT` (course) | `data:write` | No | `data:write` | None | No change |
| `admin/[model] PUT` (room) | `data:write` | Indirect (capacity) | `data:write` | None | No change |
| `admin/[model] PUT` (scheduleslot) | `data:write` | **YES** | `schedule:write` | Medium | HIGH |
| `admin/[model] PUT` (teachingtask) | `data:write` | **YES** | `teaching-task:write` | Medium | HIGH |
| `admin/[model] DELETE` | `data:delete` | Yes (can delete schedule data) | `data:delete` (keep for now) | Low | LOW |
| `/api/schedule-slot POST` | `data:write` | **YES** | `schedule:write` | Medium | HIGH |
| `/api/schedule-slot/[id] PUT` | `data:write` | **YES** | `schedule:write` | Medium | HIGH |
| `/api/teaching-task POST` | `data:write` | **YES** | `teaching-task:write` | Medium | HIGH |
| `/api/teaching-task/[id] PUT` | `data:write` | **YES** | `teaching-task:write` | Medium | HIGH |
| `/api/courses POST` | `data:write` | No | `data:write` | None | No change |
| `/api/teachers POST` | `data:write` | No | `data:write` | None | No change |
| `/api/schedule-adjustments POST` | `schedule:adjust` | Yes | `schedule:adjust` | None | No change |
| `/api/schedule-adjustments/dry-run POST` | `schedule:adjust` | Yes | `schedule:adjust` | None | No change |
| `/api/schedule-adjustments/[id]/void PATCH` | `schedule:adjust` | Yes | `schedule:adjust` | None | No change |
| `/api/admin/scheduler/*` (6 routes) | `schedule:adjust` | Yes | `schedule:adjust` | None | No change |
| `/api/admin/rooms/capacity/*` (2 routes) | `schedule:adjust` | Yes | `schedule:adjust` | None | No change |
| `/api/conflict-check POST` | `schedule:view` | Read-only | `schedule:view` | None | No change |
| `/api/schedule GET` | `schedule:view` | Read-only | `schedule:view` | None | No change |
| `/api/admin/import/*` (6 routes) | `import:manage` | Indirect | `import:manage` | None | No change |

## Frontend Migration Matrix

| Frontend Area | Current Permission | Suggested Permission | UX Risk | Migration Priority |
|---|---|---|---|---|
| Schedule grid drag-to-edit | `data:write` | `schedule:write` | Medium — existing users with `data:write` but not `schedule:write` would lose drag access | HIGH |
| Schedule adjustment dialog | `schedule:adjust` | `schedule:adjust` | None | No change |
| Dashboard void adjustment | `schedule:adjust` | `schedule:adjust` | None | No change |
| Admin DB page navigation | `data:write` | `data:write` (or `data:write OR schedule:write`) | Low — users need `data:write` for entity CRUD anyway | LOW |
| Import page navigation | `import:manage` | `import:manage` | None | No change |
| Scheduler page navigation | `schedule:adjust` | `schedule:adjust` | None | No change |
| Room capacity page navigation | `schedule:adjust` | `schedule:adjust` | None | No change |
| Data page navigation | `data:read` | `data:read` | None | No change |
| Users page navigation | `users:manage` | `users:manage` | None | No change |
| Settings page navigation | `settings:manage` | `settings:manage` | None | No change |
| Diagnostics page navigation | `diagnostics:view` | `diagnostics:view` | None | No change |

## Import Permission Analysis

`import:manage` covers all import operations:

| Operation | Route | Permission | Writes Data? | Risk |
|---|---|---|---|---|
| Parse | `POST /api/admin/import/parse` | `import:manage` | Yes (creates ImportBatch) | Low — creates pending batch only |
| Confirm dry-run | `POST /api/admin/import/confirm` (dryRun=true) | `import:manage` | No (returns plan) | None |
| Confirm real | `POST /api/admin/import/confirm` (dryRun=false) | `import:manage` | Yes (TeachingTask, ScheduleSlot, TeachingTaskClass) | Low — requires confirmText |
| Rollback dry-run | `POST /api/admin/import/rollback` (dryRun=true) | `import:manage` | No (returns plan) | None |
| Rollback real | `POST /api/admin/import/rollback` (dryRun=false) | `import:manage` | Yes (deletes imported data) | Low — requires confirmText |
| Abandon | `POST /api/admin/import/batches/[id]/abandon` | `import:manage` | Yes (status change) | Low — requires confirmText |
| List batches | `GET /api/admin/import/batches` | `import:manage` | No | None |
| Batch detail | `GET /api/admin/import/batches/[id]` | `import:manage` | No | None |

**Assessment:** Current `import:manage` scope is acceptable. All write operations require explicit `confirmText`. Read operations are admin-only. No split recommended unless non-admin import viewing is needed.

## Schedule Adjustment Permission Analysis

`schedule:adjust` covers all scheduling operations:

| Operation | Route | Permission | Risk |
|---|---|---|---|
| Create adjustment | `POST /api/schedule-adjustments` | `schedule:adjust` | Low — requires CONFIRM_ADJUSTMENT |
| Dry-run | `POST /api/schedule-adjustments/dry-run` | `schedule:adjust` | None — read-only |
| Void adjustment | `PATCH /api/schedule-adjustments/[id]/void` | `schedule:adjust` | Low — status change only |
| Scheduler preview | `POST /api/admin/scheduler/preview` | `schedule:adjust` | None — read-only |
| Scheduler apply | `POST /api/admin/scheduler/apply` | `schedule:adjust` | Low — locked slot system protects |
| Scheduler rollback | `POST /api/admin/scheduler/rollback` | `schedule:adjust` | Low — reverts to pre-solve state |
| Scheduler runs list | `GET /api/admin/scheduler/runs` | `schedule:adjust` | None — read-only |
| Scheduler run detail | `GET /api/admin/scheduler/runs/[id]` | `schedule:adjust` | None — read-only |
| Lockable slots | `GET /api/admin/scheduler/lockable-slots` | `schedule:adjust` | None — read-only |
| Room capacity GET | `GET /api/admin/rooms/capacity` | `schedule:adjust` | None — read-only |
| Room capacity PATCH | `PATCH /api/admin/rooms/capacity/[id]` | `schedule:adjust` | Low — capacity update only |

**Assessment:** `schedule:adjust` is well-scoped. No split recommended. Covers auto-scheduling + manual adjustments + room capacity — all "scheduling operations."

## Conflict-Check / Preflight Read Permission Analysis

| Route | Permission | Risk |
|---|---|---|
| `POST /api/conflict-check` | `schedule:view` | None — read-only conflict analysis |
| `GET /api/schedule` | `schedule:view` | None — read-only schedule view |
| `GET /api/schedule-adjustments` | `schedule:view` | None — read-only adjustment list |

**Assessment:** All read endpoints correctly use `schedule:view`. Conflict-check returns room/teacher/class occupancy data but does not write. No split needed. If a `schedule:read` permission were introduced, it would need to cover all three routes plus dashboard access, which adds complexity without clear benefit.

## Recommended Permission Taxonomy

### Option A: Minimal Split (Recommended)

**New permissions:**
- `schedule:write` — Create/update/delete schedule slots
- `teaching-task:write` — Create/update/delete teaching tasks

**Keep unchanged:**
- All 10 existing permissions

**Total:** 12 permissions

**Rationale:** Addresses the core issue (data:write covering schedule-sensitive operations) with minimal migration cost. Backward compatible — existing role assignments continue to work during transition.

### Option B: Fine-Grained Split

**New permissions:**
- `schedule:write` — Schedule slot CRUD
- `teaching-task:write` — Teaching task CRUD
- `schedule:admin` — Admin-level schedule operations (scheduler, room capacity)
- `room:write` — Room CRUD
- `course:write` — Course CRUD
- `class-group:write` — Class group CRUD
- `teacher:write` — Teacher CRUD

**Replace:**
- Remove `data:write` (split into model-specific permissions)

**Total:** 16 permissions

**Rationale:** Maximum granularity. Each model has its own write permission. Higher migration cost, more role configuration, but enables fine-grained access control.

### Comparison

| Strategy | Description | Pros | Cons | Migration Risk | Recommendation |
|---|---|---|---|---|---|
| Option A (Minimal) | Add `schedule:write` + `teaching-task:write`, keep `data:write` for ordinary data | Low migration cost, backward compatible, addresses core issue | `data:write` still covers room/course/classgroup/teacher writes | Low | **Recommended** |
| Option B (Fine) | Replace `data:write` with model-specific permissions | Maximum granularity, future-proof | High migration cost, many new permissions, complex role config | High | Not recommended now |
| Status Quo | Keep `data:write` for everything | Zero migration cost | Schedule-sensitive operations share permission with ordinary data | Low (current risk is MEDIUM but not exploitable) | Viable if schedule-sensitive guards (K14) are maintained |

## Migration Phases

| Phase | Scope | Files Likely Affected | Risk | Rollback Strategy |
|---|---|---|---|---|
| Phase A | Add `schedule:write` + `teaching-task:write` to `ALL_PERMISSIONS`, seed to ADMIN role, update seed script | `src/lib/auth/types.ts`, `scripts/seed-auth.ts`, `scripts/test-auth-foundation.ts` | Low — no route changes | Remove new constants from types.ts, remove from seed |
| Phase B | Update frontend gating: schedule-grid uses `schedule:write` instead of `data:write` | `src/components/schedule-grid.tsx` | Low — UX-only change, server-side still uses `data:write` | Revert schedule-grid.tsx |
| Phase C | Migrate dedicated schedule-sensitive routes: `schedule-slot` and `teaching-task` routes use new permissions | `src/app/api/schedule-slot/route.ts`, `src/app/api/schedule-slot/[id]/route.ts`, `src/app/api/teaching-task/route.ts`, `src/app/api/teaching-task/[id]/route.ts` | Medium — breaking for users with `data:write` but not new permissions | Revert route permission checks; ADMIN role has all permissions so no admin impact |
| Phase D | Admin generic route: model-specific permission check for scheduleslot/teachingtask | `src/app/api/admin/[model]/route.ts` | Medium — requires permission matrix logic | Revert to uniform `data:write` |
| Phase E | Update verification scripts and tests | `scripts/verify-rbac-schedule-write-hardening-*.ts`, `scripts/test-h2e-api-permissions.ts`, `scripts/test-semester-admin-data-pages-scoping-fix.ts` | Low — test updates only | Revert test files |
| Phase F | Regression verification: all tests pass, build passes, manual browser verification | N/A | None | N/A |
| Phase G | Optional: remove `data:write` from schedule-sensitive routes if backward compat period expired | Same as Phase C/D | Medium | Re-add `data:write` |

## Risk Table

| Risk ID | Severity | Area | Description | Evidence | Recommendation |
|---|---|---|---|---|---|
| K15-RBAC-MEDIUM-1 | MEDIUM | data:write scope | `data:write` covers both ordinary data CRUD and schedule-sensitive operations (scheduleslot, teachingtask) | Admin generic route POST/PUT lines 181/234; dedicated schedule-slot/teaching-task routes | Split into `data:write` + `schedule:write` + `teaching-task:write` (Option A) |
| K15-RBAC-MEDIUM-2 | MEDIUM | admin generic route | Uniform `data:write` for all models prevents per-model permission granularity | `src/app/api/admin/[model]/route.ts` MODEL_MAP has 6 models all using `data:write` | Phase D: model-specific permission matrix |
| K15-RBAC-MEDIUM-3 | MEDIUM | frontend gating mismatch | Schedule grid uses `data:write`, adjustment dialog uses `schedule:adjust` — different axes for overlapping operations | `schedule-grid.tsx:60` vs `schedule-adjustment-dialog.tsx:54` | After split, align schedule grid to `schedule:write` |
| K15-RBAC-MEDIUM-4 | MEDIUM | import:manage scope | `import:manage` covers both read (batch list/detail) and write (confirm/rollback/abandon) operations | 6 API routes all use `import:manage` | Acceptable for admin-only; split to `import:read` only if non-admin viewing needed |
| K15-RBAC-LOW-1 | LOW | permission naming | `data:write` name does not convey its schedule-sensitive scope | Frontend maps `data:write` to `canWriteSchedule` | If splitting, use `schedule:write` for clarity |
| K15-RBAC-LOW-2 | LOW | schedule:adjust scope | `schedule:adjust` covers auto-scheduler + adjustments + room capacity — broad but coherent | 10 API routes use `schedule:adjust` | Document as canonical scheduling permission; no split |
| K15-RBAC-LOW-3 | LOW | conflict-check permission | `conflict-check` uses `schedule:view` for POST endpoint (correct — read-only analysis) | `src/app/api/conflict-check/route.ts:8` | No change needed |
| K15-RBAC-LOW-4 | LOW | data:delete scope | `data:delete` only enforced on admin generic DELETE, no frontend gating | `src/app/api/admin/[model]/route.ts:317` | Keep; consider per-model split in Option B |
| K15-RBAC-NONE-1 | NONE | schedule:adjust integrity | `schedule:adjust` is consistently enforced across all schedule mutation routes | 10 API routes + 2 frontend components aligned | No change needed |
| K15-RBAC-NONE-2 | NONE | import:manage consistency | `import:manage` consistently enforced on all import routes | 6 API routes + navigation + route-permissions aligned | No change needed |

## Suggested First Phase (Fix-A)

**Scope:** Phase A only — add new permission constants and seed them.

**Files:**
- `src/lib/auth/types.ts` — add `schedule:write` and `teaching-task:write` to `ALL_PERMISSIONS`
- `scripts/seed-auth.ts` — seed new permissions, bind to ADMIN role
- `scripts/test-auth-foundation.ts` — update permission count assertions

**What Fix-A does NOT do:**
- No route permission changes
- No frontend gating changes
- No admin generic route changes
- No database schema changes

**Fix-A must avoid:**
- Breaking existing `data:write` checks (routes still use `data:write`)
- Modifying `requirePermission` logic
- Changing role assignments for USER or DATA_EXPORTER

## Not Recommended for Immediate Change

1. **Option B (fine-grained split)** — too many new permissions, high migration cost, not justified by current risk.
2. **Splitting `import:manage`** — no non-admin import viewing need exists.
3. **Splitting `schedule:adjust`** — well-scoped, no complaints.
4. **Splitting `data:delete`** — only one enforcement point, has referential integrity checks.
5. **Introducing `schedule:read`** — would require migrating dashboard, conflict-check, schedule GET, and adjustment list routes for no clear benefit.

## Next Stage Recommendation

- **Recommended:** K15-FIX-A (minimal permission split — Phase A only)
- **Scope:** Add `schedule:write` + `teaching-task:write` constants, seed to ADMIN role
- **Not recommended:** K15-FIX-B (route migration) until Phase A is validated
