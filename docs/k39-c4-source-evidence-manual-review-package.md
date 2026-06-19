# K39-C4: Source Evidence Manual Review Package

> Stage: K39-C4 | Status: CLOSED | Date: 2026-06-19

## Overview

K39-C4 generates a gitignored manual review package for 192 unique conditional source evidence candidates. **No DB writes, no apply, no UI.** The review package is used for manual confirmation before K39-C5 apply.

## Review Package

- **Path**: `temp/local-artifacts/k39-c4/source-evidence-manual-review-package.json`
- **Gitignored**: ✅
- **Records**: 192
- **SHA256**: `4b1c7a3c08f10ff668d6e01a2245d19cdb82e236a71895fca5733f833cdbf70e`
- **dryRunOnly**: true
- **writesDb**: false

## Why 192 Unique Only

- 192/446 candidates have a single unique source record match
- 254/446 have MULTIPLE_CANDIDATES (合班 merge ambiguity)
- Only unique candidates are safe for manual review

## Why Not matchStrategy/matchConfidence

- Requires re-running importer matching logic
- Non-deterministic
- May differ from original import-time behavior

## Manual Review Flow

1. Reviewer opens `temp/local-artifacts/k39-c4/source-evidence-manual-review-package.json`
2. For each record, change `review.decision` from `pending` to `approve`/`reject`/`needs-review`
3. Optionally add `review.reviewerNote`
4. Save the modified package
5. Run K39-C5 apply with approved IDs only

## K39-C5 Apply Prerequisites

1. Reviewer has edited decisions (approve/reject/needs-review)
2. DB backup exists
3. Apply reads only `decision=approve` records
4. Apply writes only: sourceRowIndex, sourceKeyword, sourceClassName, sourceRemark
5. Apply禁止写: matchStrategy, matchConfidence
6. Transaction + final counts + rollback strategy
