# K34-A1: Import Detail Object Render Fix

## Stage Overview

**Stage**: K34-A1-IMPORT-DETAIL-OBJECT-RENDER-FIX
**Type**: Bug fix (frontend rendering safety)
**Severity**: Blocking — manual browser validation of K34-A failed
**Scope**: Replace direct object rendering in the import detail dialog with a defensive formatter helper

## Problem

After K34-A, the `/admin/import` page rendered the batch list and the
detail dialog opened, but clicking "详情" on a row crashed with a React
runtime error:

```
Runtime Error
Objects are not valid as a React child
found: object with keys {type, message, recordIndex, className, courseName, room}
```

The stack trace pointed to `src/app/admin/import/page.tsx` line 13
(`<ImportManagementContent />`), with the actual root cause in
`src/app/admin/import/import-management-content.tsx`.

## Root Cause

`ImportBatch.warningsJson` is stored in two different shapes by the
existing import pipeline:

1. **Pending batches** (after `POST /api/admin/import/parse`):
   ```js
   warningsJson = JSON.stringify(quality.warnings)
   // quality.warnings: ImportParseWarning[]
   //   => {type, message, recordIndex?, className?, courseName?, teacher?, room?, rawText?}
   ```
2. **Confirmed batches** (after `POST /api/admin/import/confirm`):
   ```js
   warningsJson = JSON.stringify({
     version: 2,
     generatedAt: '<iso>',
     warnings: result.warnings,            // string[]
     crossCohortApprovals: approvals ?? [],
   })
   ```

The detail route runs `safeJsonParse(batch.warningsJson, [])` and
returns whatever `JSON.parse` yields, so the client-side
`batch.warnings` field is either:
- `string[]` (confirmed batches)
- `ImportParseWarning[]` (pending batches)
- an object wrapper (also confirmed batches when the wrapper isn't unwrapped)

The K34-A detail body rendered warnings with `<span>{w}</span>` for each
element. When `w` was an `ImportParseWarning` object (pending batch),
React threw "Objects are not valid as a React child".

The K34-A `parseWarningsArray` helper tried to handle this, but it
returned an empty array for non-string non-array inputs and didn't
unwrapp the payload wrapper object, so for a confirmed batch it
silently produced no warnings at all (a separate, smaller bug).

## Solution

Introduce a small, focused helper module
`src/app/admin/import/import-display-utils.ts` with three pure functions:

- `formatImportDisplayValue(value: unknown): string` — coerce any value
  to a human-readable string. Never throws. Never returns an object.
  Object inputs prefer `message`; otherwise `JSON.stringify` with a
  fallback for circular refs.
- `formatImportWarning(warning: unknown): string` — render a single
  warning (string or object) as a multi-line string:
  ```
  [TYPE] 第 recordIndex 条：message
  班级：className
  课程：courseName
  教师：teacher
  教室：room
  ```
  Missing fields collapse to nothing (no `undefined` substrings).
- `normalizeImportWarnings(value: unknown): string[]` — handle every
  possible input shape (string[], object[], payload wrapper, JSON
  string, single object, null, undefined) and return a `string[]` of
  human-readable warnings.

Update the detail dialog to:
1. Use `normalizeImportWarnings(batch.warnings)` for the warnings list.
2. Use `formatImportWarning(w)` when rendering each list item, so the
   formatted multi-line text replaces the raw object.
3. Use `formatImportDisplayValue(...)` for defense-in-depth on
   `filename`, `strategy`, and `errorMessage` (which are typed as
   strings but should be resilient to schema drift).
4. Raw-JSON view now serializes the **original** `batch.warnings`
   payload (not the normalized array), preserving the ability to
   inspect the actual stored data.

## Files Changed

| File | Change |
|---|---|
| `src/app/admin/import/import-display-utils.ts` | **new** — three pure formatter functions |
| `src/app/admin/import/import-management-content.tsx` | imports + uses the helpers; removes the old `parseWarningsArray` |
| `scripts/verify-import-detail-object-render-k34-a1.ts` | **new** — 55 checks including in-process behavioral eval of every helper function |
| `scripts/verify-import-management-basic-k34-a.ts` | adds 12 K34-A1-related checks (file presence, helper exports, render-site uses, no raw `{w}` pattern); keeps all 50 original checks |
| `docs/k34-import-detail-object-render-fix.md` | **new** — this file |
| `docs/k34-import-detail-object-render-fix.json` | **new** — machine-readable summary |

## What Was NOT Changed

- `prisma/schema.prisma` — no schema change
- `prisma/migrations/**` — no migration
- `prisma/dev.db` — not touched
- `src/app/api/admin/import/**` — no API route changes
- `src/lib/import/{importer,parse-utils,quality-classifier}.ts` — no parser/importer changes
- `src/lib/auth/**` — no RBAC changes
- `src/lib/scheduler/**` — no solver / score / WorkTime changes
- K22 expected/snapshot files — only the pre-existing `generatedAt`
  timestamp drift from earlier stages

## Validation Results

```
K34-A1 verify:       55/55 passed
K34-A verify:        62/62 passed (was 50/50; +12 K34-A1 checks)
prisma validate:     PASS
migrate status:      up to date
build:               PASS
lint:                340/188/152 — same as K34-A baseline; 0 new from K34-A1 files
auth foundation:     60/62 — 2 pre-existing failures (USER permission count, ScheduleAdjustment ACTIVE)
```

## Behavioral Coverage

The verify script runs the new helpers in-process (via tsx) against
every plausible input shape:

- `formatImportWarning` covers: string, number, boolean, null,
  undefined, object with `type+message+recordIndex`, object with
  `type+message+className+courseName+room`, object missing
  `recordIndex`, object missing `type` and `message`, array of
  objects, nested object with deep `message`.
- `normalizeImportWarnings` covers: `string[]`, object[]
  (`ImportParseWarning` shape), payload wrapper object, JSON string
  of array, JSON string of wrapper, null, undefined, plain string,
  single-object wrapper, nested object with `warnings` array.

All cases return a valid `string[]` and never throw.

## Manual Browser Validation Required

**Yes** — K34-A1 cannot fully validate without a browser, because the
bug is a runtime React render error. The verify script confirms the
helper is correct and that the page no longer contains direct
`{w}`-style render calls, but a live browser check is still required
to confirm the fix in the real app.

Recommended manual steps:

1. `npm run dev`
2. ADMIN login
3. Open `/admin/import`
4. Click "详情" on row #38 (or any recent batch)
5. Click "详情" on row #37
6. Click "详情" on a 已废弃 batch (filter by 失败/废弃)
7. Detail dialog should:
   - Open without React runtime error
   - Show warnings list with safe-formatted text
   - Show quality warnings with safe-formatted text
   - Show flags (metadataMatch etc.)
   - Toggle 展开/收起 原始 JSON
8. List filter / 刷新 still work
9. Switch to USER account — confirm no admin access

## Closure Decision

**Can K34-A1 close**: YES (code-complete + verify + behavioral coverage)
**Can K34-A manual validation resume**: YES (after manual browser pass)
**Recommended next stage**: K34-A2 (optional) — fold cross-cohort
approval UI into the confirm flow; or K34-B (full management).

## Risk Assessment

Low. The fix:
- Touches only the import page (frontend).
- All API semantics are unchanged.
- The formatter is pure, side-effect free, and handles every input
  shape we know of.
- The detail dialog is structurally unchanged — only the rendering of
  warning values is wrapped in a formatter.
