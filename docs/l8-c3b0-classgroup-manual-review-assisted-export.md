# L8-C3B0 ClassGroup Manual Review Assisted Export

## Stage

`L8-C3B0-CLASSGROUP-MANUAL-REVIEW-ASSISTED-EXPORT`

## Status

COMPLETE — 8 CGs exported with candidates, awaiting user selection

## Local Export Files

- `temp/local-artifacts/l8-c3b0/classgroup-8-review-for-user.local.md`
- `temp/local-artifacts/l8-c3b0/classgroup-8-review-for-user.local.json`

## Summary

| Metric | Value |
|--------|-------|
| Affected source ClassGroups | 8 |
| Affected TTCs | 89 |
| Canonical candidate count | 227 |
| All 8 CGs have candidates | YES |

## User Action Required

请按以下格式回复 8 行选择：

```
1 = candidate 1
2 = candidate 1
3 = candidate 3
4 = candidate 1
5 = candidate 1
6 = candidate 1
7 = candidate 1
8 = candidate 1
```

选项：`candidate N` | `needsReview` | `manualEdit: <canonicalKey>`

## Verification Results

| Check | Status |
|-------|--------|
| Export script | PASS (8 CGs, all have candidates) |
| prisma validate | PASS |
| migrate status | PASS |
| scan:docs-pii | PASS |

## Committed Files

- `scripts/export-classgroup-manual-review-for-user-l8-c3b0.ts`
- `docs/l8-c3b0-classgroup-manual-review-assisted-export.md`
- `docs/l8-c3b0-classgroup-manual-review-assisted-export.json`

TeachingTask import remains **BLOCKED**.
