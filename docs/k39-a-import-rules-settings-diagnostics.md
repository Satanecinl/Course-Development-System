# K39-A: Import Rules Settings Diagnostics Enhancement

> Stage: K39-A | Status: CLOSED | Date: 2026-06-19

## Overview

K39-A upgrades the "导入规则设置" (Import Rules Settings) panel from a read-only basic version ("只读基础版") to a diagnostic enhanced version ("诊断增强版"). The API response is enriched with source evidence coverage metrics, cross-cohort guard details, import lifecycle rules, duplicate import policy, editability boundaries, and grouped rules — all backward-compatible with existing consumers.

## Current State (Before K39-A)

- Badge: 只读基础版
- 4 summary cards (total/confirmed/failed/rolled back)
- Flat source evidence count (5 fields)
- Flat rule list (8 items)
- 5 safeguards
- 5 recent batches
- Read-only notice at bottom

## Changes

### API Enhancement

`GET /api/admin/settings/import-rules` now returns **8 new top-level keys** while preserving all existing fields:

| Key | Type | Description |
|---|---|---|
| `moduleVersion` | `"K39-A"` | Stage identifier |
| `enhancedSummary` | object | Batch totals (incl. pending/abandoned), latest batch, active semester |
| `sourceEvidence` | object | 10 field counts, coverage %, forward-only flag, explanation |
| `crossCohortGuard` | object | detection/approval/hardLocked, warning/error codes |
| `importLifecycleRules` | array | 6 lifecycle phases with writesDb/permission/safetyGuard |
| `duplicateImportPolicy` | object | Repeated import behavior, conflict handling, artifact handling |
| `editability` | object | 5 editable flags (all false), nextConfigStage |
| `ruleGroups` | array | 6 groups × 14 rules with id/title/status/severity/locked/source/description/impact/editable/nextStage |

**Backward compatibility**: `summary`, `rules`, `safeguards`, `recentBatches` remain unchanged in structure and semantics.

### UI Enhancement

| Section | Before | After |
|---|---|---|
| Header badge | 只读基础版 | 诊断增强版 |
| Summary cards | 4 cards | 8 cards (added pending, abandoned, evidence %, default semester) |
| Source evidence | 5 counts | Progress bar + 8 field counts + forward-fill explanation |
| Cross-cohort guard | Not shown | Dedicated card: detection/approval/hardLocked + codes |
| Lifecycle rules | Not shown | 6 phases with writesDb badge + permission + safety guard |
| Rule list | Flat 8 items | 6 groups × 14 rules with icons, lock, nextStage |
| Editability notice | "只读基础版，不提供编辑" | Detailed next steps (K39-B/C/D) |

### Settings Modules Registry

Updated `import-rules` entry:
- `recommendedStage`: `K26-N1-BASIC` → `K39-A-DIAGNOSTIC`
- `description`: Updated to reflect diagnostic enhancement
- `notes`: Updated to document K39-A status and K39-B plan

## Source Evidence Coverage

- **Coverage source**: `TeachingTaskClass.importBatchId` presence
- **Forward-only**: K20-FIX-B annotation — only newly imported links get evidence
- **Historical backfill**: Not available (`historicalBackfillAvailable: false`)
- **Explanation**: Historical links (pre-K20 imports) lack evidence. New imports fully populate all 7 source evidence fields.

## Cross-cohort Guard

| Property | Value |
|---|---|
| Detection enabled | `true` (hard-locked) |
| Approval required | `true` (hard-locked) |
| Dry-run warning code | `CROSS_COHORT_SUSPECTED` |
| Confirm error code | `CROSS_COHORT_APPROVAL_REQUIRED` |
| Approval field | `crossCohortApprovals` |
| Hard locked | `true` |

**Cannot be disabled.** No UI button to disable. No PATCH API to toggle.

## Import Lifecycle Rules

| Phase | Writes DB | Permission | Safety Guard |
|---|---|---|---|
| parse | No | import:manage | No DB writes; creates pending ImportBatch |
| dry-run | No | import:manage | No DB writes; generates ImportPlan + warnings |
| confirm | Yes | import:manage | confirmText required; crossCohortApprovals; one confirmed per semester |
| rollback | Yes | import:manage | Only confirmed batches; confirmText required; adjustment/audit check |
| abandon | Yes | import:manage | Only pending batches; confirmText required |
| semester-scoping | No | import:manage | All batches bound to semesterId; active semester resolution |

## Editability Boundaries

| Setting | Editable | Next Stage |
|---|---|---|
| All rules | `false` | — |
| Default semester | `false` | K39-B |
| Cross-cohort approval | `false` | — |
| Source evidence backfill | `false` | K39-C |
| Duplicate import policy | `false` | K39-D |

## Why No PATCH/Schema in K39-A

1. **Diagnostic focus**: K39-A is about visibility, not behavior change
2. **All rules hard-locked**: No rule currently needs runtime configuration
3. **No schema needed**: ImportBatch/TeachingTaskClass models are adequate
4. **Risk reduction**: Adding PATCH without need creates attack surface
5. **K39-B** is the natural stage for first editable config (default semester)

## Permissions

- GET `/api/admin/settings/import-rules` requires `settings:manage`
- No new PATCH/POST endpoints added
- No permission boundary changes
- USER role cannot access import rules settings
- Import operations (parse/confirm/rollback/abandon) remain under `import:manage`

## Rule Groups

6 groups with 14 total rules:

| Group | Label | Rules |
|---|---|---|
| `semester` | 学期作用域 | default-semester |
| `cross-cohort` | 跨年级合班 | cross-cohort-detection, cross-cohort-approval |
| `source-evidence` | Source Evidence | source-evidence-fields, source-evidence-forward-fill |
| `lifecycle` | 批次生命周期 | batch-state-machine, confirm-text-guard, single-confirmed-per-semester |
| `rollback` | 回滚与废弃 | rollback-only-confirmed, abandon-only-pending, rollback-adjustment-guard |
| `data-safety` | 数据安全 | semester-scoping, permission-separation, duplicate-import-policy |

## Verification

### Automated

Script: `scripts/verify-import-rules-settings-diagnostics-k39-a.ts`

26 checks covering:
- API route existence and permission
- moduleVersion = K39-A
- Response structure (summary, sourceEvidence, crossCohortGuard, importLifecycleRules, ruleGroups, editability)
- Cross-cohort guard values (detection, approval, hardLocked)
- No PATCH/POST routes
- UI badge update
- UI sections (source evidence, cross-cohort, lifecycle)
- No disable/backfill buttons
- No schema/migration changes
- No importer semantic changes
- K22-C 73/0/0/0 preservation

### Manual Browser Validation

Navigate to `/admin/settings` → 导入规则设置:

1. Badge shows "诊断增强版"
2. 8 summary cards render correctly
3. Source Evidence coverage progress bar and field counts visible
4. Cross-cohort guard card shows detection/approval/hardLocked
5. Lifecycle rules show 6 phases
6. Grouped rules show 6 groups
7. Editability notice shows K39-B/C/D next steps
8. No disable/guard/backfill buttons present

## Regression Results

| Check | Result |
|---|---|
| K22-C | 73/0/0/0 preserved |
| K38 adjustment rules verify | PASS |
| K37 campus rules verify | PASS |
| Build | PASS |
| Prisma schema | Unchanged |
| Importer semantics | Unchanged |

## Future Stages

- **K39-B**: Default import behavior configuration (default semester editable via PATCH)
- **K39-C**: Source evidence backfill plan (historical data evidence recovery strategy)
- **K39-D**: Duplicate import policy config (repeated import behavior configuration)

## Remaining Risks

1. Historical TeachingTaskClass links lack source evidence (not backfilled)
2. settings:manage cannot execute actual import operations (by design)
3. Batch state machine is code-controlled, no external config
4. K22-C 73/0/0/0 baseline unaffected
