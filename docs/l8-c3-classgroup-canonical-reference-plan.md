# L8-C3 ClassGroup Canonical Reference Plan

## Stage

`L8-C3-CLASSGROUP-CANONICAL-REFERENCE-PLAN`

## Status

PLAN_COMPLETE — no DB writes

## Branch / HEAD

- Branch: `master`
- HEAD before: `26c589e831e1fab6fb077f8f3738c0d92b5b8e6b`
- HEAD after: (to be filled after commit)

## Reference Canonical Classes

| Metric | Value |
|--------|-------|
| Reference canonical class count | **227** |
| canonicalKey unique | **227** (0 duplicates) |
| plannedName unique | 194 (33 duplicates: school-length variants share display name — expected) |
| canonicalKey format | `{grade}\|{major}\|{classNumber}\|{direction}\|{educationLevel}\|{schoolLength}` |

## DB ClassGroup Status

| Metric | Value |
|--------|-------|
| ClassGroup total | 442 |
| sem1 | 36 |
| sem4 | 406 |
| canonicalKey null | 442 (all) |
| isActive true | 442 (all) |

## Mapping Result

| Classification | Count | Description |
|----------------|-------|-------------|
| CANONICAL_REUSE_EXACT | **192** | DB name parses to exact canonical key match |
| CANONICAL_REUSE_ALIAS | 0 | — |
| CANONICAL_REUSE_NEEDS_REVIEW | **66** | School-length ambiguity or name variant |
| EXTRA_DEACTIVATE_CANDIDATE | **184** | No canonical match (high class numbers, composites, etc.) |
| EXTRA_DELETE_CANDIDATE | 0 | — |
| EXTRA_KEEP_INACTIVE | 0 | — |
| UNMATCHED_NEEDS_REVIEW | 0 | — |

### NEEDS_REVIEW Breakdown (66)

- School-length ambiguity (3 years vs 5 years for same grade+major+classNumber): ~20
- Name variant not in reference (森林草原资源保护 vs 森林和草原资源保护): 6
- 护理对口 naming mismatch: 8
- 五年制 prefix naming: ~12
- Other naming mismatches: ~20

## TeachingTaskClass Migration Plan

| Metric | Value |
|--------|-------|
| TTC total | **446** |
| Already on canonical row | 0 |
| Needs classGroupId migration | **357** |
| Unmatched needs manual review | **89** (8 CGs) |
| Would break if source deactivated | 89 |

### Unmatched TTC CGs (8 CGs, 89 TTCs)

| CG ID | TTC count | Issue |
|-------|-----------|-------|
| 15, 16 | 32 | 森林草原资源保护 name variant (not in reference) |
| 19 | 14 | Composite class name |
| 28 | 11 | School-length ambiguity (三年制 vs 五年制) |
| 30 | 10 | 五年制 variant no canonical match |
| 33, 34 | 18 | 森林草原资源保护 name variant |
| 36 | 4 | Composite class name |

## Controlled Apply Plan (C4)

| Operation | Count |
|-----------|-------|
| Create new canonical ClassGroups | **61** |
| Update existing canonical ClassGroups (add fields) | **166** |
| Deactivate extra ClassGroups | **250** |
| Hard delete ClassGroups | **0** |
| Migrate TeachingTaskClass refs | **357** |
| Manual review required | **89** |

### C4 Apply Safety Gates

C4 **cannot proceed** unless:

1. `manualReviewRequired = 0` (all 89 unmatched TTCs resolved)
2. `planned active canonical rows = 227`
3. `canonicalKey duplicate count = 0`
4. `TTC unmatched = 0`

C4 safety requirements:
- backup before
- dry-run verification
- invalid token test (`CONFIRM_CLASSGROUP_C4` fails without exact token)
- confirm token
- single transaction
- pre-count assertions (ClassGroup count, canonicalKey count, TTC count)
- post-audit (verify 227 active canonical, 0 unmatched TTCs)
- rollback note (restore from backup on failure)

## Recommended Next Stage

Since `manualReviewRequired = 89 > 0`:

```
L8-C3A-CLASSGROUP-CANONICAL-MANUAL-REVIEW
```

This stage will resolve the 89 unmatched TTCs by:
1. Mapping 森林草原资源保护 CGs → 森林和草原资源保护 canonical (name variant)
2. Picking school-length variant for ambiguous CG#28 (汽车制造与试验技术 1班)
3. Handling composite CGs (19, 36) and 五年制 variants (30)
4. After resolution: `readyForC4Apply = true`

## DB Baseline

| Metric | Value |
|--------|-------|
| Course | 104 |
| Teacher | 427 |
| ClassGroup total | 442 |
| TeachingTaskClass | 446 |
| canonicalKey null | 442 |
| isActive true | 442 |

**No DB writes performed. Baseline unchanged.**

## Verification Results

| Check | Status |
|-------|--------|
| prisma validate | PASS |
| migrate status | PASS |
| build | PASS |
| typecheck | PASS |
| lint | PASS |
| K22-C | PASS (73/73) |
| scan:docs-pii | PASS |

## Committed Files

- `scripts/plan-classgroup-canonical-reference-l8-c3.ts`
- `docs/l8-c3-classgroup-canonical-reference-plan.md`
- `docs/l8-c3-classgroup-canonical-reference-plan.json`

TeachingTask import remains **BLOCKED**.
