# L8-C5A — ClassGroup Global Active Query Immediate Fix

**Stage**: L8-C5A-CLASSGROUP-GLOBAL-ACTIVE-QUERY-IMMEDIATE-FIX
**Branch**: master
**HEAD before**: `9369d380aafd65bed1ca9735a78a3539560734c9`
**HEAD after**: (post-commit)
**Force push**: NO

## Status

**CLOSED** — ClassGroup is now globally queried as active canonical master data.

- DB written: **NO**
- Schema modified: **NO**
- Migration created: **NO**

## Problem

After L8-C4C0 imported 227 canonical ClassGroups into semester 4, the `/admin/db` page and API routes still filtered ClassGroup by the currently selected semester. This meant:
- Switching to semester 1 showed only 36 old ClassGroups
- Switching to a future semester showed 0 ClassGroups
- The 227 authoritative ClassGroups were only visible in semester 4

## Solution

Created a unified helper `activeCanonicalClassGroupWhere()` that returns the standard Prisma where clause `{ isActive: true, sourceType: 'reference_xlsx' }`. All ClassGroup list queries now use this filter instead of semester-scoped filtering.

## Files Changed

| File | Change |
|---|---|
| `src/lib/classgroup-global-query.ts` | **NEW** — unified `activeCanonicalClassGroupWhere()` helper |
| `src/app/api/admin/[model]/route.ts` | GET handler: classgroup uses global active canonical filter instead of `scopedWhere` |
| `src/app/api/entity-list/route.ts` | classgroup branch: uses `activeCanonicalClassGroupWhere()` instead of semester-scoped query |
| `src/app/api/class-groups/route.ts` | Uses `activeCanonicalClassGroupWhere()` instead of semester-scoped query |
| `src/lib/import/course-setting-resolution-options.ts` | ClassGroup query uses `activeCanonicalClassGroupWhere()` |
| `src/lib/admin-db/config.ts` | Added `GLOBAL_MASTER_TABLES` set for UI |
| `src/app/admin/db/admin-db-content.tsx` | Passes `badge="全局主数据"` to toolbar when active table is classgroup |
| `src/components/admin-db/admin-toolbar.tsx` | Accepts and renders optional `badge` prop |

## Behavior After Change

| Scenario | Before | After |
|---|---|---|
| `/admin/db` classgroup table, semester 1 | 36 rows | **227 rows** |
| `/admin/db` classgroup table, semester 4 | 406 rows | **227 rows** |
| `/admin/db` classgroup table, future semester | 0 rows | **227 rows** |
| Left sidebar classgroup count | varies by semester | **227 always** |
| ClassGroup dropdown in task dialog | varies by semester | **227 always** |
| Import resolution classgroup options | varies by semester | **227 always** |
| old_error / inactive / legacy visible | yes | **no (hidden by default)** |
| "全局主Data" badge | none | **shown in toolbar** |

## Remaining Semester-Scoped ClassGroup Queries

The following queries still filter by semesterId. These are intentional and correct for their use case:

| Query | File | Why still semester-scoped |
|---|---|---|
| TeachingTask create validation | `teaching-task/route.ts:59` | Defense-in-depth: validates CG belongs to the task's semester |
| TeachingTask update validation | `teaching-task/[id]/route.ts:92` | Defense-in-depth: validates CG belongs to the task's semester |
| Schedule import importer (findFirst/create) | `importer.ts:898,910` | Upsert-like: finds/creates CG within a semester context |
| Schedule import batch pre-check | `importer.ts:1304` | Batch pre-check: validates CGs exist in target semester |
| L7-F apply execution preflight | `course-setting-apply-l7-f.ts:514` | L7-F apply: validates CGs exist in target semester |
| L7-F rollback audit | `course-setting-apply-l7-f.ts:983` | L7-F rollback: counts CGs in semester for audit |
| L6-E2 partial import plan | `course-setting-partial-import-plan-l6-e2.ts:457` | L6-E2: task split detection uses semester-scoped CGs |
| Partial import plan gate | `partial-import-plan/route.ts:283` | Gate check: validates CG count in target semester |
| Partial import apply gate | `partial-import-apply/route.ts:304` | Gate check: validates CG count in target semester |
| Scheduler readiness | `scheduler/readiness/route.ts:25` | Readiness check: counts CGs in semester |
| Dashboard data summary | `data/summary/route.ts:31` | Summary: counts CGs in semester |
| Semester dependencies | `semester-service.ts:73` | Dependency check: counts CGs in semester |

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npx eslint` (changed files) | PASS (0 errors) |
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | PASS (15 migrations, up to date) |
| `npm run scan:docs-pii` | PASS (0 BLOCKING) |

## Next Stage

TeachingTask import remains **blocked**. Recommended next stage:

`L8-C5B-CLASSGROUP-SEMESTER-ID-GATE-HARDENING` — harden the remaining semester-scoped ClassGroup queries (the TeachingTask validation routes) to accept global canonical ClassGroups, so that teaching tasks can reference any canonical CG regardless of semester.
