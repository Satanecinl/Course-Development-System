# K15-FIX-D-ADMIN-GENERIC-PERMISSION-MATRIX-AUDIT

## Stage Name

K15-FIX-D-ADMIN-GENERIC-PERMISSION-MATRIX-AUDIT

## Date

2026-06-02

## Background

K15-FIX-C-FRONTEND-GATING-MIGRATION (commit `a71a160`) migrated the schedule-grid frontend gating from `data:write` to `schedule:write`. The K15 audit confirmed Phase A/B/C done, with Phase D (admin generic permission matrix) pending.

This stage performs a read-only audit of the `/api/admin/[model]` generic route to determine whether and how to migrate it from uniform `data:write` to model-specific permissions.

## Audit Scope

1. Admin generic route (`src/app/api/admin/[model]/route.ts`) — model map, permissions, guards
2. Frontend admin data page (`src/app/admin/db/`, `src/components/admin-db/`) — client-side gating
3. Dedicated routes vs generic route parity
4. Permission taxonomy assessment
5. Fix-D option design

## Admin Route Matrix

| Model | GET | POST | PUT | DELETE | Special Guard | Risk | Suggested Permission |
|---|---|---|---|---|---|---|---|
| classgroup | `data:read` | `data:write` | `data:write` | `data:delete` | semester scoping | LOW | `data:write` (keep) |
| teacher | `data:read` | `data:write` | `data:write` | `data:delete` | referential integrity | LOW | `data:write` (keep) |
| course | `data:read` | `data:write` | `data:write` | `data:delete` | referential integrity | LOW | `data:write` (keep) |
| room | `data:read` | `data:write` | `data:write` | `data:delete` | referential integrity | LOW | `data:write` (keep) |
| scheduleslot | `data:read` | `data:write` | `data:write` | `data:delete` | mutation guard, semester guard, conflict check, conflictDetails | **MEDIUM** | `schedule:write` |
| teachingtask | `data:read` | `data:write` | `data:write` | `data:delete` | teacher conflict guard, semester guard, conflictDetails | **MEDIUM** | `teaching-task:write` |

## Model Classification

| Model | Category | Current Permission | Schedule Impact | Auth/Security Impact | Suggested Future Permission |
|---|---|---|---|---|---|
| scheduleslot | schedule-sensitive | `data:write` | Direct — creates/edits schedule slots | None | `schedule:write` |
| teachingtask | schedule-sensitive | `data:write` | Direct — creates/edits teaching tasks that own schedule slots | None | `teaching-task:write` |
| classgroup | ordinary + indirect | `data:write` | Indirect — class group membership affects scheduling | None | `data:write` (keep) |
| teacher | ordinary + indirect | `data:write` | Indirect — teacher assignment affects scheduling | None | `data:write` (keep) |
| course | ordinary | `data:write` | None — course is a label | None | `data:write` (keep) |
| room | ordinary + indirect | `data:write` | Indirect — room capacity affects scheduling | None | `data:write` (keep) |

Note: teacher, classgroup, and room have indirect schedule impact through their relationships with teaching tasks and schedule slots. However, changing a teacher's name or a room's capacity does not directly move schedule slots. The indirect impact is handled by the conflict check engine, not by permission granularity.

## Frontend Admin Matrix

| Frontend Area | File | Current Permission | Models Covered | Suggested Permission Strategy | UX Risk |
|---|---|---|---|---|---|
| Page access | `route-permissions.ts` | `data:write` | All models | Keep `data:write` (page-level gate) | None |
| Navigation | `navigation.ts` | `data:write` | All models | Keep `data:write` | None |
| Toolbar (Add/Edit/Delete) | `admin-toolbar.tsx` | None (always visible) | All models | Add model-specific checks after server migration | Medium — 403 on click if permission missing |
| Generic dialog | `admin-db-content.tsx` | None | classgroup, teacher, course, room | Keep `data:write` (server-side) | None |
| TeachingTask dialog | `teaching-task-dialog.tsx` | None | teachingtask | Add `teaching-task:write` check for edit | Low — server enforces |
| ScheduleSlot dialog | `schedule-slot-dialog.tsx` | None | scheduleslot | Add `schedule:write` check for edit | Low — server enforces |

**Key finding:** The admin data page frontend has **zero** `useHasPermission` calls. All write buttons render unconditionally. If a user has `data:write` (enough to load the page) but lacks `schedule:write` or `teaching-task:write`, they will see buttons but get a 403 error when clicking them. This is a UX issue, not a security issue — the server-side enforcement is correct.

## Dedicated vs Generic Route Parity

| Capability | Dedicated Route Permission | Admin Generic Permission | Guard Parity | Suggested Alignment |
|---|---|---|---|---|
| ScheduleSlot create | `schedule:write` | `data:write` | Dedicated: guardSlotCreate. Generic: guardAdminSlotCreate. Both have conflict check + semester. | Align generic to `schedule:write` |
| ScheduleSlot update | `schedule:write` | `data:write` | Dedicated: guardSlotUpdate. Generic: guardAdminSlotUpdate. Both have conflict check. | Align generic to `schedule:write` |
| ScheduleSlot delete | N/A (no dedicated) | `data:delete` | Generic only. Has referential integrity check. | Keep `data:delete` |
| TeachingTask create | `data:write` (not migrated) | `data:write` | Dedicated: no guard. Generic: no guard. | Both use `data:write` — consider `teaching-task:write` |
| TeachingTask update | `teaching-task:write` | `data:write` | Dedicated: checkScheduleConflicts. Generic: guardAdminTaskUpdate. Both have conflict check. | Align generic to `teaching-task:write` |
| TeachingTask delete | N/A (no dedicated) | `data:delete` | Generic only. Has referential integrity check. | Keep `data:delete` |

## Permission Taxonomy Assessment

| Candidate Permission | Need Now? | Reason | Risk If Not Added | Recommendation |
|---|---|---|---|---|
| `schedule:write` | Already exists | Used by dedicated routes | N/A | Apply to generic route |
| `teaching-task:write` | Already exists | Used by dedicated route | N/A | Apply to generic route |
| `room:write` | No | Room CRUD is ordinary data management | None | Don't add |
| `course:write` | No | Course CRUD is ordinary data management | None | Don't add |
| `teacher:write` | No | Teacher CRUD is ordinary data management | None | Don't add |
| `class-group:write` | No | Class group CRUD is ordinary data management | None | Don't add |
| `semester:manage` | No | Semester management is admin-only | None | Don't add now |
| `auth:manage` | No | Auth management covered by `users:manage` | None | Don't add |
| `schedule:delete` | No | DELETE has referential integrity checks | Low | Don't add now |

## Fix-D Option Comparison

| Option | Scope | Pros | Cons | Risk | Recommended? |
|---|---|---|---|---|---|
| **A: Minimal server-only matrix** | Migrate generic route scheduleslot→`schedule:write`, teachingtask→`teaching-task:write`. Keep frontend unchanged. | Low scope, addresses core inconsistency, no frontend refactoring | Users with `data:write` but not `schedule:write` see buttons but get 403 | Low | **YES** |
| B: Server + frontend model-specific matrix | Migrate generic route + add `useHasPermission` checks per model in admin data page | Best UX — buttons hidden when user lacks permission | Higher scope, frontend refactoring, more permission checks to maintain | Medium | Not now |
| C: Block generic route for schedule-sensitive models | Remove scheduleslot/teachingtask from generic route, force dedicated-only | Cleanest separation | Breaks admin data page for these models, requires frontend refactor | High | No |

## Recommended Fix-D Boundary (Option A)

| Fix-D Item | Decision | Reason |
|---|---|---|
| scheduleslot POST (generic) | **Migrate** to `schedule:write` | Align with dedicated route |
| scheduleslot PUT (generic) | **Migrate** to `schedule:write` | Align with dedicated route |
| scheduleslot DELETE (generic) | **Keep** `data:delete` | No dedicated delete route, has referential integrity |
| teachingtask POST (generic) | **Migrate** to `teaching-task:write` | Align with dedicated route create |
| teachingtask PUT (generic) | **Migrate** to `teaching-task:write` | Align with dedicated route |
| teachingtask DELETE (generic) | **Keep** `data:delete` | No dedicated delete route, has referential integrity |
| classgroup/teacher/course/room | **Keep** `data:write` | Ordinary data management |
| Frontend admin data page | **Keep** `data:write` for page access | Phase E (future) for frontend model-specific gating |
| Route matrix helper | **Add** `getModelWritePermission(model)` function | Clean per-model permission resolution |

## Risk Table

| Risk ID | Severity | Area | Description | Evidence | Recommendation |
|---|---|---|---|---|---|
| K15-ADMIN-MATRIX-MEDIUM-1 | MEDIUM | admin generic route | Uniform `data:write` for all 6 models — schedule-sensitive models share permission with ordinary data | route.ts:181 POST, route.ts:234 PUT | Migrate to model-specific in Fix-D |
| K15-ADMIN-MATRIX-MEDIUM-2 | MEDIUM | dedicated vs generic inconsistency | Dedicated routes use granular permissions but generic route uses `data:write` for same operations | schedule-slot: `schedule:write` vs `data:write`. teaching-task: `teaching-task:write` vs `data:write` | Align generic route |
| K15-ADMIN-MATRIX-MEDIUM-3 | MEDIUM | frontend no model-specific gating | Admin data page has zero client-side permission checks — buttons always visible | No `useHasPermission` in admin-db components | Add frontend checks in Phase E |
| K15-ADMIN-MATRIX-LOW-1 | LOW | teaching-task create | POST /api/teaching-task uses `data:write`, inconsistent with PUT using `teaching-task:write` | teaching-task/route.ts:7 | Migrate to `teaching-task:write` |
| K15-ADMIN-MATRIX-LOW-2 | LOW | DELETE permission | scheduleslot/teachingtask DELETE uses `data:delete` — may warrant stronger permission | route.ts:317 | Keep for now — has referential integrity |
| K15-ADMIN-MATRIX-NONE-1 | NONE | dedicated routes | Dedicated routes migrated to granular permissions (Fix-B) | schedule-slot POST/PUT: `schedule:write`, teaching-task PUT: `teaching-task:write` | No action |
| K15-ADMIN-MATRIX-NONE-2 | NONE | schedule-grid | Frontend schedule-grid migrated to `schedule:write` (Fix-C) | schedule-grid.tsx:60 | No action |
| K15-ADMIN-MATRIX-NONE-3 | NONE | server guards | Admin generic route has proper guards (mutation, teacher conflict, semester, referential integrity) | guardAdminSlotCreate, guardAdminSlotUpdate, guardAdminTaskUpdate, countReferences | No action |

## Not Recommended for Immediate Change

1. **Option B (server + frontend)** — too much frontend refactoring for current risk level
2. **Option C (block generic route)** — breaks admin data page, requires major refactor
3. **Model-specific permissions for ordinary models** — no benefit, adds complexity
4. **`schedule:delete`** — DELETE has referential integrity checks, low risk
5. **`semester:manage`** — no current need, admin-only access is sufficient

## Verification Commands and Results

```bash
# Admin generic permission matrix audit
npx.cmd tsx scripts/audit-rbac-admin-generic-permission-matrix.ts
# Result: ✅ 33 passed, 0 failed. HIGH 0 / MEDIUM 3 / LOW 2 / NONE 3

# K15 main audit
npx.cmd tsx scripts/audit-rbac-permission-granularity-migration.ts
# Result: Phase A/B/C DONE, Phase D PENDING. HIGH 0 / MEDIUM 4 / LOW 4 / NONE 5

# Fix-C/B/A verifications
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-c.ts
# Result: ✅ 23 PASS / 0 FAIL / 2 SKIP
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-b.ts
# Result: ✅ 29 PASS / 0 FAIL
npx.cmd tsx scripts/verify-rbac-permission-granularity-fix-a.ts
# Result: ✅ 29 PASS / 0 FAIL

# Auth seed sync
npx.cmd tsx scripts/validate-rbac-auth-seed-sync.ts
# Result: ✅ 44 PASS / 0 FAIL

# Build
npm.cmd run build
# Result: ✅ Compiled successfully

# Auth foundation test
npm.cmd run test:auth-foundation
# Result: 53 passed, 1 failed (pre-existing ScheduleAdjustment)
```

## Next Stage Recommendation

- **Recommended:** K15-FIX-D-ADMIN-GENERIC-PERMISSION-MATRIX (implementation)
- **Scope:** Option A — minimal server-only matrix
- **Not recommended:** Option B (frontend + server) until Phase E
