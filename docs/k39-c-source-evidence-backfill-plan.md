# K39-C: Source Evidence Backfill Plan

> Stage: K39-C | Status: PLAN_COMPLETE | Date: 2026-06-19

## Overview

K39-C is a read-only audit assessing whether historical TeachingTaskClass source evidence can be safely backfilled. **No DB writes, no schema changes, no importer modifications in this stage.**

## Current Source Evidence Coverage

| Field | Coverage | Status |
|---|---|---|
| importBatchId | 0/446 (0%) | ALL missing |
| sourceRowIndex | 0/446 (0%) | ALL missing |
| sourceKeyword | 0/446 (0%) | ALL missing |
| sourceClassName | 0/446 (0%) | ALL missing |
| sourceRemark | 0/446 (0%) | ALL missing |
| sourceArtifactFilename | 0/446 (0%) | ALL missing |
| matchStrategy | 0/446 (0%) | ALL missing |
| matchConfidence | 0/446 (0%) | ALL missing |

**Root cause**: All 446 TeachingTaskClass links were created before K20-FIX-B added source evidence fields.

## ImportBatch Traceability

- 38 total batches: 1 confirmed, 2 pending, 35 abandoned
- Confirmed batch #1: `2026年春季学期课程表(0420).docx`, semesterId=1
- **TeachingTask.importBatchId = 1 for ALL 308 TeachingTasks** (100%)
- Propagation path: `TeachingTaskClass → TeachingTask → ImportBatch` via `teachingTaskId`
- **importBatchId CAN be deterministically backfilled** via TeachingTask join (no artifact needed)

## Artifact Availability

- Confirmed batch JSON artifact exists on disk: `uploads/imports/1780035124021-sejcg9dy.json`
- 585 parsed records with class_info, teacher, course, room, week data
- Artifact contains sensitive data (teacher names, class names) — do NOT output to docs

## Field-Level Backfill Feasibility

| Field | Safe? | Method | Risk |
|---|---|---|---|
| importBatchId | ✅ Safe | TeachingTask.join — deterministic | None |
| sourceArtifactFilename | ✅ Safe | Static value from batch filename | None |
| sourceRowIndex | ⚠️ Conditional | Re-match parsed records to TeachingTaskClass | Requires artifact + matching logic |
| sourceKeyword | ⚠️ Conditional | Re-run class name keyword extraction | May differ from original |
| sourceClassName | ⚠️ Conditional | Re-run class name matching | May differ from original |
| sourceRemark | ⚠️ Conditional | Re-extract from parsed records | Requires artifact |
| matchStrategy | ❌ Unsafe | Requires re-running importer matching | Non-deterministic, may differ |
| matchConfidence | ❌ Unsafe | Same as matchStrategy | Non-deterministic |

## Candidate Strategies

| Strategy | Safety | Value | Complexity |
|---|---|---|---|
| A. No Backfill | Highest | Low (gap persists) | None |
| B. importBatchId-only | High | Low | Low |
| C. Artifact-based | Medium | High | High |
| D. Manual reviewed | High | High | Medium |
| E. Prohibit | Highest | None | None |

## Recommendation

**K39-C1: Dry-run candidate generator** (no DB writes)

- Read confirmed batch JSON artifact
- Join TeachingTaskClass → TeachingTask to get importBatchId
- For each link, attempt to match back to source record in JSON
- Generate candidate JSON with confidence scores
- Output: `docs/k39-c1-source-evidence-backfill-candidates.json`
- **No auto-apply** — requires manual review before any DB write

## Why No DB Writes in This Stage

1. **0% coverage** — all 446 links need evidence, high blast radius
2. **合班 merge** — TeachingTaskClass is many-to-many, matching is non-trivial
3. **matchStrategy uncertainty** — re-running matching may produce different results
4. **No existing backfill infrastructure** — need candidate generator first
5. **K20-FIX-B annotation** — "forward-fill only" was an intentional design decision
