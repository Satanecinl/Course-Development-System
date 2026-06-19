# K39-C3: Conditional Source Evidence Manual Review Plan

> Stage: K39-C3 | Status: PLAN_COMPLETE | Date: 2026-06-19

## Current Coverage After K39-C2

| Field | Coverage | Status |
|---|---|---|
| importBatchId | 446/446 (100%) | ✅ Backfilled |
| sourceArtifactFilename | 446/446 (100%) | ✅ Backfilled |
| sourceRowIndex | 0/446 (0%) | Conditional — pending review |
| sourceKeyword | 0/446 (0%) | Conditional — pending review |
| sourceClassName | 0/446 (0%) | Conditional — pending review |
| sourceRemark | 0/446 (0%) | Conditional — pending review |
| matchStrategy | 0/446 (0%) | Blocked — do not backfill |
| matchConfidence | 0/446 (0%) | Blocked — do not backfill |

## Candidate Distribution

- **192/446 (43%)**: UNIQUE match — single source record found in artifact
- **254/446 (57%)**: MULTIPLE_CANDIDATES — 合班 merge creates ambiguity

## Why Not Auto-Apply 192 Unique

1. Even "unique" matches may be false-unique due to 合班 merge order
2. Source record matching relies on course|teacher|className key, which may not be deterministic
3. No existing validation infrastructure for conditional fields
4. K20-FIX-B annotation: "forward-fill only" was intentional

## matchStrategy/matchConfidence: Continue Blocked

- Requires re-running importer matching logic (findMergedClassNames)
- Non-deterministic due to merge order
- May differ from original import-time behavior
- Should only be computed during fresh import

## Recommended Strategy

**B. Generate sensitive manual review package for 192 unique only**

- K39-C4: dry-run manual review package generator
- Output: gitignored `temp/local-artifacts/k39-c4/`
- Committed docs: aggregate only
- No DB writes, no UI, no API

## K39-C5 Apply Prerequisites

1. DB backup
2. Reviewed approval file (from K39-C4)
3. Apply allowlist (approved IDs only)
4. Transaction
5. Final counts
6. Rollback strategy
7. No matchStrategy/matchConfidence writes
