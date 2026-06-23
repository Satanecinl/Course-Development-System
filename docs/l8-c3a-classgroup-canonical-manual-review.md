# L8-C3A ClassGroup Canonical Manual Review

## Stage

`L8-C3A-CLASSGROUP-CANONICAL-MANUAL-REVIEW`

## Status

WAITING_FOR_USER_REVIEW — workbook generated, user must edit

## Branch / HEAD

- Branch: `master`
- HEAD before: `e3511be7ce02aaeacceb0c4af4e69459c63009cb`
- HEAD after: (to be filled after commit)

## L8-C3 Local Artifacts

Found: YES (4 files in `temp/local-artifacts/l8-c3/`)

## Manual Review Workbook

- Path: `temp/local-artifacts/l8-c3a/classgroup-canonical-manual-review.local.xlsx`
- Sheets: README, Summary, Unmatched_Source_ClassGroups_8, Affected_TTC_89, Canonical_Candidates_227, Export_Check

## Affected Data

| Metric | Value |
|--------|-------|
| Affected source ClassGroups | 8 |
| Affected TTCs | 89 |
| Canonical candidate count | 227 |

## Import/Validate Script

- Path: `scripts/import-classgroup-canonical-manual-review-l8-c3a.ts`
- Dry-run status: WAITING_FOR_USER_REVIEW
- Accepted decisions: 0 (workbook not yet edited)
- readyForC4Apply: false
- manualReviewRequired: 8

## User Action Required

1. Open `temp/local-artifacts/l8-c3a/classgroup-canonical-manual-review.local.xlsx`
2. Edit `Unmatched_Source_ClassGroups_8` sheet: fill `action` + `selectedCanonicalKey` for each of 8 rows
3. Save the xlsx
4. Run: `npx tsx scripts/import-classgroup-canonical-manual-review-l8-c3a.ts --target-semester-id 4 --dry-run`
5. Repeat until `readyForC4Apply = true`

## Verification Results

| Check | Status |
|-------|--------|
| Generator | PASS (8 CGs, 89 TTCs, 227 refs) |
| Importer dry-run | PASS (WAITING_FOR_USER_REVIEW) |
| prisma validate | PASS |
| migrate status | PASS |
| build | PASS |
| typecheck | PASS |
| lint | PASS |
| K22-C | PASS (73/73) |
| scan:docs-pii | PASS |

## Committed Files

- `scripts/generate-classgroup-canonical-manual-review-l8-c3a.ts`
- `scripts/import-classgroup-canonical-manual-review-l8-c3a.ts`
- `docs/l8-c3a-classgroup-canonical-manual-review.md`
- `docs/l8-c3a-classgroup-canonical-manual-review.json`

TeachingTask import remains **BLOCKED**.
