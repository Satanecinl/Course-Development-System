# K39-C1: Source Evidence Backfill Dry-Run Candidates

> Stage: K39-C1 | Status: CLOSED | Date: 2026-06-19

## Overview

K39-C1 generates a dry-run candidate report for historical source evidence backfill. **No DB writes, no apply, no UI buttons.** Output is an anonymized JSON report for manual review.

## Results Summary

| Metric | Value |
|---|---|
| TeachingTaskClass links | 446 |
| Safe importBatchId candidates | 446/446 (100%) |
| Safe artifactFilename candidates | 446/446 (100%) |
| Conditional record candidates | 192/446 (43%) |
| Blocked candidates | 254/446 (57%) |
| Unsafe matchStrategy | 446/446 (100%) |

## Field-Level Recommendations

| Field | Recommendation | Confidence |
|---|---|---|
| importBatchId | SAFE_HIGH_CONFIDENCE | HIGH — via TeachingTask.join |
| sourceArtifactFilename | SAFE_HIGH_CONFIDENCE | HIGH — from batch filename |
| sourceRowIndex | CONDITIONAL_REQUIRES_REVIEW | HIGH if unique match |
| sourceKeyword | CONDITIONAL_REQUIRES_REVIEW | HIGH if unique match |
| sourceClassName | CONDITIONAL_REQUIRES_REVIEW | HIGH if unique match |
| sourceRemark | CONDITIONAL_REQUIRES_REVIEW | HIGH if unique match |
| matchStrategy | DO_NOT_BACKFILL_AUTOMATICALLY | BLOCKED — requires importer replay |
| matchConfidence | DO_NOT_BACKFILL_AUTOMATICALLY | BLOCKED — same as matchStrategy |

## Blockers

- **MULTIPLE_CANDIDATES**: 254 links have multiple source records matching (合班 merge ambiguity)
- **NO_SOURCE_RECORD**: 0 links have no matching source record

## Why matchStrategy/matchConfidence Are Blocked

- Requires re-running importer matching logic (findMergedClassNames, deriveMatchAttributes)
- May produce different results from original import-time behavior
- Non-deterministic due to 合班 merge order
- Should only be computed during fresh import, not retroactively

## Output

- `docs/k39-c1-source-evidence-backfill-candidates.json` — anonymized candidate report
- dryRunOnly: true, writesDb: false

## Future Options (K39-C2+)

1. **Conservative**: Apply only importBatchId + sourceArtifactFilename (safe fields)
2. **Moderate**: Also apply conditional fields for unique-match candidates (192 links)
3. **Full**: Replay matching logic for all 446 links (requires careful design)
