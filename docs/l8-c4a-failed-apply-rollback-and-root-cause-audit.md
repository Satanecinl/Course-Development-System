# L8-C4A Failed Apply Rollback and Root Cause Audit

## Stage

`L8-C4A-FAILED-APPLY-ROLLBACK-AND-ROOT-CAUSE-AUDIT`

## Status

CLOSED — DB rolled back to pre-C4 baseline, root cause documented

## Backup Records

- Failed-state evidence: `prisma/dev.db.backup-failed-l8-c4-before-rollback-20260623144218`
- Pre-C4 (restore source): `prisma/dev.db.backup-before-l8-c4-classgroup-canonical-sync-20260623141644`

## Rollback Result

- Restored: YES
- Baseline restored: YES (CG=442, TTC=446, ckNull=442, activeTrue=442)

## L8-C4 Status

**FAILED_ROLLED_BACK**

L8-C5: **BLOCKED**

TeachingTask import: **BLOCKED**

## Root Cause Audit

### 1. plannedName Collision (29 canonical keys missing)

**Root cause**: The C4 script used `buildPlannedName(grade, major, classNumber)` which does NOT include `educationLevel`, `schoolLength`, or `direction`. Multiple canonical keys with the same `(grade, major, classNumber)` but different `educationLevel/schoolLength/direction` produced identical `plannedName` values.

Example collision:
- `2025级|医学检验技术|1||高职|二年制` → name "2025级医学检验技术1班"
- `2025级|医学检验技术|1||高职|三年制` → name "2025级医学检验技术1班" (SAME NAME)

When the C4 script attempted upsert with `where: { semesterId_name: { semesterId: 4, name } }`, only the first canonical key processed claimed the existing row (via update). Subsequent canonical keys with the same planned name could not create separate rows due to `@@unique([semesterId, name])`.

**C4 preflight failure**: The C4 dry-run did not abort on plannedName collision count > 0. It only reported "created=45, updated=182, deactivated=233" but did not assert "unique planned names for all canonical keys".

**C4B required safeguard**:
- Disambiguated display name format: `{grade}{major}{classNumber}班({educationLevel}|{schoolLength}|{direction})` when schoolLength/educationLevel differ
- OR: rename the `name` column to `displayName` and use a separate `uniqueKey` (combined from all fields)
- OR: pre-flight check that aborts when plannedName collision count > 0

### 2. TTC Deletion / De-dupe (96 deleted)

**Root cause**: The C4 script's TTC migration logic included a delete branch:

```js
if (existing) {
  await tx.teachingTaskClass.delete({ where: { id: d.ttcId } })
}
```

This was added to handle the unique constraint `@@unique([teachingTaskId, classGroupId])` — when a TTC already existed at the target, the source TTC was deleted as a "duplicate".

**Forbidden item violated**: Section 三 of L8-C4 task specified "不删除任何数据" (do not delete any data) and "不创建 TeachingTaskClass" (do not create TeachingTaskClass). However, the deletion of duplicate TTCs was NOT caught.

**C4 dry-run failure**: The dry-run reported `migrated=446` but did NOT flag that 96 of those migrations would result in deletes rather than moves. The dry-run invariant check did not assert "TTC total unchanged".

**C4B required safeguard**:
- PROHIBIT any `tx.teachingTaskClass.delete()` in the apply transaction
- If a `@@unique([teachingTaskId, classGroupId])` violation would occur, the transaction must abort
- Aborted apply must enter a separate manual audit stage for human resolution
- Pre-flight must assert "TTC total unchanged = 446"

### 3. Count Drift (planned vs actual)

**Root cause**: The C4 plan numbers (create=61, update=166, deactivate=250, migrate=357) came from the L8-C3 plan script's matching algorithm, which used a slightly different matching logic than the C4 apply script:

| Metric | C3 plan | C4 actual | Drift |
|--------|---------|-----------|-------|
| create | 61 | 16 | -45 |
| update | 166 | 227 | +61 |
| deactivate | 250 | 260 | +10 |
| migrate TTC | 357 | 588 | +231 |

**Root causes of drift**:
1. **Manual + composite decisions changed TTC migration count**: C3 plan migrated 357 via its own algorithm; C4 also added 89 from manual/composite decisions (71+18). Total TTC affected = 357+89 = 446, not 357.
2. **plan `toClassGroupId` was not preserved** in unified-ttc-decisions.local.json — required intermediate fix to regenerate the decisions file.
3. **Dry-run and apply used different matching logic**: Dry-run counted 209 matches, but the apply's upsert behavior changed which CGs became canonical rows (45 upserts vs 16 actual creates).
4. **Pre-flight invariants were not asserted before transaction**: The dry-run did not compare expected vs actual create/update/deactivate counts.

**C4B required safeguard**:
- Use immutable plan snapshot (saved as JSON before apply)
- Apply must use the same matching algorithm as the plan
- Pre-flight must assert: `apply.planned == plan.expected` for create/update/deactivate/migrate
- If drift > 0, abort with `COUNT_DRIFT_BLOCK`

## C4B Required Safeguards (Summary)

1. **plannedName collision**: Disambiguate names OR use uniqueKey OR abort on collision count > 0
2. **TTC deletion**: PROHIBIT any `delete()` in apply; if unique constraint would fail, abort
3. **Count drift**: Immutable plan snapshot + apply must match snapshot exactly
4. **Pre-flight assertions**: Before transaction, assert:
   - planned create == expected
   - planned update == expected
   - planned deactivate == expected
   - planned migrate == expected
   - plannedName collision count == 0
   - TTC total unchanged
5. **Aborts**: Any pre-flight failure must abort with specific reasonCode

## DB Baseline (Post-Rollback)

| Metric | Value |
|--------|-------|
| Course | 104 |
| Teacher | 427 |
| ClassGroup total | 442 |
| ClassGroup sem1 | 36 |
| ClassGroup sem4 | 406 |
| TeachingTask sem4 | 0 |
| TeachingTaskClass | 446 |
| ScheduleSlot sem4 | 0 |
| ScheduleAdjustment sem4 | 0 |
| ImportBatch total | 39 |
| canonicalKey null | 442 |
| isActive true | 442 |

**Restored to pre-C4 baseline ✓**

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

- `docs/l8-c4a-failed-apply-rollback-and-root-cause-audit.md`
- `docs/l8-c4a-failed-apply-rollback-and-root-cause-audit.json`
- `docs/l8-c4-classgroup-canonical-controlled-sync-apply.md` (status: FAILED_ROLLED_BACK)
- `docs/l8-c4-classgroup-canonical-controlled-sync-apply.json` (status: FAILED_ROLLED_BACK)

## Recommended Next Stage

`L8-C4B-CLASSGROUP-CANONICAL-SYNC-REDESIGN`

C4B must address all three root causes (plannedName collision, TTC deletion, count drift) with mandatory pre-flight assertions before any transaction.
