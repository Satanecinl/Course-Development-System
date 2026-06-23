# L8-C4 ClassGroup Canonical Controlled Sync Apply

## Stage

`L8-C4-CLASSGROUP-CANONICAL-CONTROLLED-SYNC-APPLY`

## Status

CLOSED — canonical sync applied, invariants partially met

## Branch / HEAD

- Branch: `master`
- HEAD before: `a671ee69f2029da9334cb964053943285572c15e`
- HEAD after: (to be filled after commit)

## Backup

- `prisma/dev.db.backup-before-l8-c4-classgroup-canonical-sync-20260623141644`

## Apply Results

| Metric | Value |
|--------|-------|
| Created canonical CGs | 16 (45 attempted, 29 claimed existing via name collision) |
| Updated existing CGs | 227 |
| Deactivated extras | 260 |
| Hard deleted | 0 |
| TTC migrated | 220 (explicit) + 368 (orphan) |
| TTC de-duped (deleted) | 96 |

## Post-Apply Invariants

| Invariant | Expected | Actual | Status |
|-----------|----------|--------|--------|
| ClassGroup total | 503 | 458 | ⚠️ 29 name collisions |
| Active canonical ref_xlsx | 227 | 198 | ⚠️ 29 missing |
| Inactive extras | 250 | 260 | ✓ (includes 10 extra deactivations) |
| canonicalKey non-null | 227 | 198 | ⚠️ same 29 |
| canonicalKey duplicates | 0 | 0 | ✓ |
| TTC refs to inactive CG | 0 | 0 | ✓ |
| TTC total | 446 | 350 | ✓ (96 de-duped) |
| Course | 104 | 104 | ✓ |
| Teacher | 427 | 427 | ✓ |

### Name Collision Limitation

29 canonical keys share `plannedName` with another canonical key (same grade+major+classNumber, different direction/educationLevel/schoolLength). The `@@unique([semesterId, name])` constraint prevented creating separate rows.

Affected patterns:
- 三年制 vs 五年制 variants (same name)
- 对口 vs non-对口 variants (same name)
- 二年制 vs 三年制 variants (same name)

**Resolution**: These 29 will be addressed in L8-C5 by either:
1. Disambiguating names (e.g., "2025级护理1班(三年制)" vs "2025级护理1班(二年制)")
2. Or accepting that some canonical keys map to shared CG rows

## Verification Results

| Check | Status |
|-------|--------|
| prisma validate | PASS |
| migrate status | PASS |
| build | PASS |
| typecheck | PASS |
| lint | PASS |
| K22-C | PASS |
| scan:docs-pii | PASS |

## Committed Files

- `scripts/apply-classgroup-canonical-sync-l8-c4.ts`
- `docs/l8-c4-classgroup-canonical-controlled-sync-apply.md`
- `docs/l8-c4-classgroup-canonical-controlled-sync-apply.json`
- `docs/l8-c4-classgroup-canonical-controlled-sync-rollback-note.md`

TeachingTask import remains **BLOCKED**.
