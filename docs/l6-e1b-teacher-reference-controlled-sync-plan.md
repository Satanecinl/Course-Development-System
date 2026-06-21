# L6-E1B Teacher Reference Controlled Sync Plan

> Stage: **L6-E1B-TEACHER-REFERENCE-CONTROLLED-SYNC-PLAN**
> Status: **PASS** (dry-run plan)

## 1. Background
L6-E1A audit found Teacher table has 84 records but Excel references 357 unique teachers and staff DB has 424. 559 raw occurrences match staff but not teacher table. This plan generates controlled sync candidates.

## 2. Data Source Summary
| source | records | unique normalized |
|---|---|---|
| Staff DB | 436 | 424 |
| Teacher table | 84 | 84 |
| Excel teachers | 1160 | 357 |

## 3. Sync Plan Summary
| category | count |
|---|---|
| uniqueSyncCandidates | 357 |
| safeCreateCandidate | 103 |
| needsManualReview | 35 |
| skipCandidate | 147 |
| alreadyExists | 71 |
| duplicateStaffNameGroups | 10 |
| invalidTokens | 1 |

## 4. Proposed Write Fields
Teacher schema supports: `id` (auto), `name` (required).
Proposed: `name`.
Unsupported Staff fields (saved locally only): `employeeNo, department, position, rank, phone, officePhone`.
Schema change required: NO.

## 5. Local Raw Artifact
- Generated: YES
- Path: `temp/local-artifacts/l6-e1b/teacher-reference-controlled-sync-plan.raw.local.json`
- sha256: `eff6f6913ec00cef3c72b43d4ae62710bb67810136158e12ff3ace0b4e14beac`
- Contains raw personal data: YES (local only)
- Git tracked: NO (under gitignored temp/)


## 6. DB No-Write Proof
| table | before | after | unchanged |
|---|---|---|---|
| Teacher | 84 | 84 | YES |
| Course | 104 | 104 | YES |
| ImportBatch | 38 | 38 | YES |
| activeSemesterId | 1 | 1 | YES |

## 7. Next Stage
User must review local raw artifact, approve candidates, then enter L6-E1C (controlled sync apply with DB backup).
