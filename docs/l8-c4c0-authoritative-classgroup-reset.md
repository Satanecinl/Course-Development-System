# L8-C4C0 — Authoritative ClassGroup Reset from Reference

**Stage**: L8-C4C0-CLASSGROUP-AUTHORITATIVE-RESET-FROM-REFERENCE
**Branch**: master
**HEAD before**: `642ac1825f4243bafdc7f622c668a55b0dceaba4`
**HEAD after**: (post-commit)
**Force push**: NO

## Status

**CLOSED** — professional ClassGroup master data imported.

- DB written: **YES** (single-transaction apply)
- apply executed: **YES** (valid token)
- backup created: **YES**

## Backup

- basename: `prisma/dev.db.backup-before-l8-c4c0-authoritative-classgroup-reset-20260623155916`
- 如何 restore: `cp prisma/dev.db.backup-before-l8-c4c0-authoritative-classgroup-reset-20260623155916 prisma/dev.db`

## Source

- file: `D:/Desktop/Course Development System/学院专业数据库.xlsx` (sheet index 2, 班级数据库)
- reference canonical class count: **227**

## Apply Results

| Metric | Value |
|---|---|
| referenceCanonicalClassCount | 227 |
| canonicalKeyDuplicateCount | 0 |
| plannedNameDuplicateCount | 0 |
| created ClassGroups | 45 |
| updated ClassGroups | 182 |
| deactivated legacy ClassGroups | 260 |
| hard deleted ClassGroups | 0 |
| TTC migrated | 0 |
| TTC deleted | 0 |
| TTC created | 0 |

## Post-Apply Invariants

| Invariant | Value |
|---|---|
| active reference_xlsx ClassGroups | **227** |
| sem4 active reference_xlsx ClassGroups | **227** |
| canonicalKey non-null count | **227** |
| canonicalKey duplicate count | **0** |
| plannedName duplicate count | **0** |
| ClassGroup hard deleted | **0** |
| TeachingTaskClass total (before) | 446 |
| TeachingTaskClass total (after) | **446** |
| TeachingTaskClass hash unchanged | **true** (`6dad6130069c0235`) |
| Course count | 104 (unchanged) |
| Teacher count | 427 (unchanged) |
| TeachingTask sem4 | 0 (unchanged) |
| ScheduleSlot sem4 | 0 (unchanged) |
| ScheduleAdjustment sem4 | 0 (unchanged) |
| ImportBatch total | 39 (unchanged) |

## Protected Table Hash Verification

| Table | Hash Before | Hash After | Match |
|---|---|---|---|
| TeachingTaskClass | `6dad6130069c0235` | `6dad6130069c0235` | ✅ |
| TeachingTask | `ba4477909515c091` | `ba4477909515c091` | ✅ |
| Course | `ead1faa4b20f302b` | `ead1faa4b20f302b` | ✅ |
| Teacher | `fe02a103fdd6dede` | `fe02a103fdd6dede` | ✅ |
| ScheduleSlot | `e9c2662471e8f708` | `e9c2662471e8f708` | ✅ |
| ScheduleAdjustment | `457af8f1c0194833` | `457af8f1c0194833` | ✅ |
| ImportBatch | `faa9f706c2f4c70c` | `faa9f706c2f4c70c` | ✅ |

## What Changed

- 45 new ClassGroups created (canonical reference classes with no existing DB match)
- 182 existing ClassGroups updated with canonicalKey, grade, majorName, classNumber, educationLevel, schoolLength, sourceType=reference_xlsx, isActive=true
- 260 non-canonical legacy ClassGroups deactivated (sourceType = legacy_extra/semester_copy/composite/old_error)
- 0 ClassGroups hard deleted
- 0 TeachingTaskClass rows touched

## What Did NOT Change

- TeachingTaskClass (446 rows, untouched)
- TeachingTask
- Course
- Teacher
- ScheduleSlot
- ScheduleAdjustment
- ImportBatch
- schema / migrations

## Rolling Back

If needed, restore from backup:
```bash
cp prisma/dev.db.backup-before-l8-c4c0-authoritative-classgroup-reset-20260623155916 prisma/dev.db
```
Then restart the dev server (`npm run dev`).

## Stage Decision

- professional ClassGroup master data imported: **YES** (227 canonical ClassGroups active in sem4)
- TeachingTask import remains **blocked** (requires L8-C5: active canonical query migration)
- recommended next stage: `L8-C5-CLASSGROUP-ACTIVE-CANONICAL-QUERY-MIGRATION`
