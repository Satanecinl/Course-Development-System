# K39-B: Import Rules Default Semester Config Plan

> Stage: K39-B | Status: PLAN_COMPLETE | Date: 2026-06-19

## Overview

K39-B is a read-only audit and planning stage. It assesses whether "default import semester behavior" should become a persistent configuration, and outputs a safe implementation plan. **No schema changes, no behavior changes, no new APIs in this stage.**

## Current Default Import Semester Implementation

### Semester Resolution Chain

| Route | Semester Resolution | Accepts semesterId? |
|---|---|---|
| `POST /api/admin/import/parse` | `resolveSchedulerSemester()` | ❌ No — always active semester |
| `POST /api/admin/import/confirm` | `resolveSchedulerSemester({ semesterId })` | ✅ Yes — via `?semesterId=X` query param |
| `POST /api/admin/import/rollback` | `resolveSchedulerSemester()` | ❌ No — always active semester |
| `POST /api/admin/import/batches/[id]/abandon` | `resolveSchedulerSemester()` | ❌ No — always active semester |

### resolveSchedulerSemester Priority

1. Explicit `semesterId` → use it (must exist, else `SEMESTER_NOT_FOUND`)
2. Unique active semester → use it
3. Zero active → throw `NO_ACTIVE_SEMESTER`
4. Multiple active → throw `MULTIPLE_ACTIVE_SEMESTERS`

### Import Management UI

- **No semester selector** in upload dialog
- `parseImportFile(client.ts)` only sends the file — no semesterId parameter
- User has no visibility into which semester the import targets

## ImportBatch Semester Scoping

| Property | Value |
|---|---|
| `semesterId` | `NOT NULL` (K25-C migration) |
| Parse creates batch | ✅ With `semesterId: semester.id` |
| Confirm uses batch.semesterId | ✅ Validates match with target semester |
| Rollback checks semester | ✅ Batch must belong to active semester |
| Abandon checks semester | ✅ Batch must belong to active semester |
| Single confirmed per semester | ✅ `existingConfirmed` guard in `confirmImportBatch` |
| Legacy null fixup | ✅ `confirmImportBatch` binds null semesterId to target |

## Source Evidence / Cross-cohort Impact

- **Source Evidence**: `TeachingTaskClass.importBatchId` links to batch → semester traceable. Historical missing evidence does NOT affect config implementation.
- **Cross-cohort Guard**: Detection and approval are keyed by `taskKey` (course|teacher|weekType), NOT by semester. Changing semester config does NOT affect cross-cohort flow.

## Candidate Config Options

### A. defaultImportSemesterMode

| Value | Semantics | Safety |
|---|---|---|
| `activeSemesterOnly` | Current behavior | High |
| `selectedSemesterPreferred` | UI shows selected semester, backend resolves | Medium |
| `explicitDefaultSemester` | User sets a default semester in settings | Low |

**Assessment**: Complex UI changes needed. Risk of silent wrong-semester import. **Defer.**

### B. requireExplicitSemesterForImport ⭐ RECOMMENDED

| Value | Semantics | Safety |
|---|---|---|
| `false` | Current behavior (active semester fallback) | High |
| `true` | Upload UI must show target semester; user confirms before import | High |

**Assessment**: Simplest, safest first step. No behavior change when `false`. When `true`, adds explicit safety gate. **Recommended for K39-B1 implementation.**

### C. defaultDuplicateImportPolicy

**Defer** — separate concern from semester config. K39-D scope.

### D. sourceEvidenceBackfillPolicy

**Defer** — K39-C scope.

## Recommended Implementation: requireExplicitSemesterForImport

### Why This Config

1. **Zero-risk default**: `false` = current behavior, no migration of existing data
2. **Incremental safety**: When `true`, upload dialog shows target semester + requires user acknowledgment
3. **No backend logic change**: The config only gates UI behavior; semester resolution logic is unchanged
4. **Simple schema**: Single boolean field in new config table
5. **Clear rollback**: `DROP TABLE ImportRuleConfig` — config only, no data dependency

### Schema Draft (K39-B1)

```prisma
model ImportRuleConfig {
  id                              Int      @id @default(autoincrement())
  key                             String   @unique @default("default")
  requireExplicitSemesterForImport Boolean @default(false)
  createdAt                       DateTime @default(now())
  updatedAt                       DateTime @updatedAt
}
```

**Migration risk**: LOW — single new table, no existing data to migrate. SQLite `CREATE TABLE` is atomic.

### API Draft (K39-B1)

```
PATCH /api/admin/settings/import-rules
Permission: settings:manage
Body: { requireExplicitSemesterForImport: boolean }
Response: { success: true, config: { requireExplicitSemesterForImport: boolean } }
```

GET `/api/admin/settings/import-rules` already returns `editability` — add `config` field with current value.

### UI Draft (K39-B1)

1. **Settings panel**: New toggle row in import-rules-settings-panel.tsx
   - Label: "导入时必须明确选择学期"
   - Toggle: `requireExplicitSemesterForImport`
   - Save/Cancel with dirty tracking (same pattern as K38-B1 defaultRecommendationLimit)
   - Toast on save success/error

2. **Upload dialog**: When `requireExplicitSemesterForImport=true`:
   - Show blue banner: "当前目标学期: {activeSemester.name}"
   - Add "确认学期" checkbox before upload button
   - Upload button disabled until checkbox checked

### Default Value

`false` — preserves current behavior. Admin must explicitly enable.

### Backward Compatibility

- `false` = current behavior (active semester, no UI prompt)
- `true` = enhanced safety (UI shows semester, requires acknowledgment)
- No breaking changes to any existing API or UI flow

### Rollback Strategy

1. `DROP TABLE ImportRuleConfig` — removes config, reverts to hardcoded behavior
2. No data to preserve — config is purely behavioral
3. No dependent tables — clean removal

## Permissions

| Operation | Permission | Rationale |
|---|---|---|
| View import rules settings | `settings:manage` | Settings center access |
| Edit config (PATCH) | `settings:manage` | Config is settings domain |
| Execute import (parse/confirm/etc.) | `import:manage` | Import operations domain |

**No new RBAC keys needed.** The existing permission boundary is clean.

## Why This Stage Doesn't Change Business Behavior

1. K39-B is explicitly a plan stage — read-only audit only
2. No schema migration is created
3. No PATCH/POST endpoints are added
4. The importer code is untouched
5. The semester resolution logic is unchanged
6. The config value doesn't exist yet — hardcoded `false` equivalent

## Audit Script Results

`scripts/audit-import-rules-config-plan-k39-b.ts` — **17/17 PASS**

Covers: API GET-only, parse/confirm semester handling, ImportBatch.semesterId, semester helper, source evidence, cross-cohort flow, duplicate policy, permissions, config feasibility, blocking risks.

## Future Stages

- **K39-B1**: Implement `ImportRuleConfig` schema + PATCH API + UI toggle + upload dialog semester banner
- **K39-C**: Source evidence backfill plan (historical data evidence recovery)
- **K39-D**: Duplicate import policy config

## Remaining Risks

1. Users may not notice the semester banner when `requireExplicitSemesterForImport=false` (current behavior)
2. Multiple active semesters would throw an error — by design, but may surprise users
3. The config table is a singleton (`key="default"`) — no per-semester config in this design
