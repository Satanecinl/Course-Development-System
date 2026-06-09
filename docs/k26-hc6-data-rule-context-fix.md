# K26-K4: HC6 Data/Rule Context Fix

## 1. Executive Summary

K26-K4 diagnosed and fixed the root cause of the K26-K controlled trial BLOCKED status.

**Root Cause Found**: `PREVIEW_SCORING_ACCUMULATED_DELTA_MISMATCH`

* The solver accumulates `bestScore` from `calculateDeltaScore` calls during iteration.
* The accumulated `bestScore` can drift from the true `calculateScoreWithDetails(ctx, bestState)` of the solver's best state.
* The preview was using the accumulated `bestScore` (which reported `hardScore=0`) instead of re-scoring `bestState` (which actually has `hardScore=-2000`).

**Fix**: `preview.ts` now uses `bestDetails.hardScore` and `bestDetails.softScore` (from `calculateScoreWithDetails`) for `scoreAfter`, and uses `scoreAfter.hardScore !== 0` for the `blocked` check.

**Controlled trial result**: `BLOCKED_WITH_EXPLICIT_HC6` (preview now correctly blocked at the preview stage).

**K26-K status**: Still BLOCKED — the HC6 violations are real business rule violations:
* slot244: 职业素养 (NON_AUTOMOTIVE_ONLY) in 林校305
* slot383: 林业法规与执法实务 (NON_AUTOMOTIVE_ONLY) in 林校304 (pre-existing)

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` |
| Local HEAD before | `bb3b1b2` (K26-K3A) |
| Local HEAD after | `<K26-K4 commit>` |
| Push | yes |
| Force push | **no** |

## 3. Input Evidence

| Item | Value |
|------|-------|
| K26-K3A status | CLOSED (lint baseline confirmed 184/146) |
| previewRunId before fix | 99 (hardScore=0, blocking=false — INCORRECT) |
| previewRunId after fix | 100 (hardScore=-2000, blocking=true — CORRECT) |
| slot244 | 职业素养, NON_AUTOMOTIVE_ONLY, room=21 (林校305) — solver-introduced |
| slot383 | 林业法规与执法实务, NON_AUTOMOTIVE_ONLY, room=23 (林校304) — pre-existing |
| K26-K3 visibility fix | COMPLETED |

## 4. HC6 Rule / Classifier Analysis

| Component | File | Current Rule | Risk |
|-----------|------|--------------|------|
| Linxiao room | `score.ts:isLinxiaoRoomName` | `room.name.includes('林校')` OR `room.building.includes('林校')` | LOW — clear keyword match |
| Automotive classGroup | `score.ts:classifySpecialty` | classGroup name contains 汽车/车辆/新能源/智能网联/汽修 | LOW — explicit keyword list |
| Non-automotive | same | classGroup name doesn't contain any automotive keyword | LOW — complement of automotive |
| Mixed | same | Some classGroups automotive, some not | MEDIUM — mixed task also triggers HC6 if assigned to Linxiao |
| courseName/remark | same | ONLY used when classGroup is empty | LOW — hard rule is classGroup-based |
| Exception policy | N/A | No exception mechanism exists | HIGH — no way to whitelist specific courses |

## 5. Slot Context Audit

### slot244

| Field | Value |
|-------|-------|
| teachingTaskId | 189 |
| courseName | 职业素养 |
| teacher | 孙文哲 |
| current roomId | null |
| proposed roomId | 21 (林校305) |
| classGroups | 2024级智能轧钢技术1班, 2024级智能轧钢技术2班, 2024级机电一体化技术1班 |
| specialtyClassification | NON_AUTOMOTIVE_ONLY |
| isLinxiaoRoom | true (after proposed change) |
| HC6 expected | YES (after proposed change) |
| source | PREVIEW_RESULT (solver-introduced) |

### slot383

| Field | Value |
|-------|-------|
| teachingTaskId | 276 |
| courseName | 林业法规与执法实务 |
| teacher | 徐厚朴 |
| current roomId | 23 (林校304) |
| proposed roomId | unchanged (solver kept original) |
| classGroups | 2024级林业技术1班 |
| specialtyClassification | NON_AUTOMOTIVE_ONLY |
| isLinxiaoRoom | true (already in Linxiao) |
| HC6 expected | YES (pre-existing violation) |
| source | EXISTING_DB (pre-existing) |

## 6. Preview vs Post-Apply Context Comparison

| Dimension | Preview scoring | Post-apply validation | Difference | Root cause implication |
|-----------|-----------------|----------------------|------------|------------------------|
| hardScore source | `solveResult.bestScore.hardScore` (accumulated deltas) | `calculateInitialScore(ctx, state)` | **YES** — accumulated vs fresh | **Root cause** |
| hardScore value (before fix) | 0 | -2000 | -2000 | Mismatch |
| hardScore value (after fix) | -2000 | N/A (apply not attempted) | N/A | Correctly reported |
| HC6 evaluation | Same `calculateScoreWithDetails` | Same | Same | Correct |
| `ctx` (semester scope) | All semester 1 tasks/slots | All semester 1 tasks/slots | Same | OK |
| `state` | Solver's bestState | Post-apply slot positions | Different assignments | OK |

## 7. Root Cause Classification

| Item | Value |
|------|-------|
| rootCauseType | `PREVIEW_SCORING_ACCUMULATED_DELTA_MISMATCH` |
| confidence | HIGH |
| evidence | Applying proposed changes gives hardScore=-2000 but preview reports 0 |
| minimal fix | `scoreAfter` and `blocked` in `preview.ts` now use `bestDetails` (re-scored) instead of `solveResult.bestScore` (accumulated) |
| DB data repair needed | No (for the scoring fix) |
| Code fix needed | Yes (preview.ts only) |
| Rule exception needed | Possibly (for forestry course in 林校 room) — see Known Boundaries |

## 8. Fix / Decision

### Code fix applied

`src/lib/scheduler/preview.ts`:

* `scoreAfter` now uses `bestDetails.hardScore` and `bestDetails.softScore` (from `calculateScoreWithDetails(ctx, solveResult.bestState)`)
* `blocked` check now uses `scoreAfter.hardScore !== 0` instead of `solveResult.bestScore.hardScore !== 0`

### No data repair

* slot244 (职业素养) and slot383 (林业法规与执法实务) are genuine HC6 violations
* No data repair was performed in this stage
* K26-K4 fix is **code-only** (preview scoring accuracy)

## 9. Controlled Trial After K26-K4

| Field | Value |
|-------|-------|
| Status | **BLOCKED_WITH_EXPLICIT_HC6** |
| previewRunId | 100 |
| previewHardScoreAfter | -2000 |
| previewSoftScoreAfter | -1431 |
| applyRunId | N/A (apply not attempted — preview correctly blocked) |
| rollbackRunId | N/A |
| preview blocked reason | HC6 violations (2) in solver's best state |
| businessDataRestored | N/A (no changes made) |
| acceptableAuditDrift | N/A |
| backup path | `dev.db.backup-before-k26-k-controlled-apply-rollback-2026-06-09T06-57-44-824Z` |

## 10. Verification Results

| Command | Result |
|---------|--------|
| K26-K4 verify script | **PASS** |
| K26-K4 audit script | **PASS** (diagnostic) |
| K26-K3 verify | **36/36 PASS** |
| K26-K2 debug | **13/13 PASS** |
| K26-J closeout | **52/52 PASS** |
| J3 candidate | **53/53 PASS** |
| J2 snapshot | **52/52 PASS** |
| K22-C score harness | **PASS** (73/0/0/0) |
| Prisma validate | **PASS** |
| migrate status | **up to date** |
| build | **PASS** |
| lint | **184/146** (baseline) |
| auth foundation | **53/1** (pre-existing) |

## 11. Known Boundaries

1. **HC6 violations are real** — K26-K remains BLOCKED. The preview scoring fix makes the system ACCURATELY report violations, but the violations themselves need resolution.
2. **K22 expected not updated** — no score semantics changed. The fix is in score reporting, not scoring logic.
3. **Score weights not adjusted** — HC6 penalty remains -1000.
4. **HC6 not downgraded** — still a hard constraint.
5. **No exception mechanism** — slot383 (林业法规 in 林校304) is a legitimate business case but there's no way to whitelist it.
6. **Recommended next stage**:
   * **Option A**: `K26-K4A-HC6-DATA-REPAIR` — manually fix slot383 and slot244 positions in DB
   * **Option B**: `K26-K4B-HC6-EXCEPTION-MECHANISM` — design a course/room exception policy
   * **Option C**: `K26-K4C-SOLVER-HC6-AWARE` — add HC5/HC6 to `isPlacementHardCompatible` so the solver avoids creating violations
7. **K27 not eligible** — controlled trial must pass first.

## 12. Final Decision

```
k26K4Status=PASSED
k26KControlledTrialStatus=BLOCKED_WITH_EXPLICIT_HC6
rootCauseType=PREVIEW_SCORING_ACCUMULATED_DELTA_MISMATCH
recommendedNextStage=K26-K4A-HC6-DATA-REPAIR or K26-K4C-SOLVER-HC6-AWARE
```

K26-K4 **passes**: the root cause of the K26-K BLOCKED status is identified and the preview scoring is fixed. The controlled trial now correctly reports the HC6 violations. The remaining task is to resolve the HC6 violations themselves (which is out of scope for this stage).
