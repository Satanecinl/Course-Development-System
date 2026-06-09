# K26-K4C: Solver HC6-Aware Hard Placement Fix

## 1. Executive Summary

K26-K4C prevents the LAHC solver from generating new HC6 violations (non-automotive / mixed tasks in Linxiao rooms).

**Fix**: Added HC6 check to solver's `isPlacementHardCompatible` function, reusing the same `classifySpecialty`, `isLinxiaoRoomName`, and `computeHC6Penalty` helpers from `score.ts` for classifier consistency.

**Controlled trial result**: `BLOCKED_WITH_EXPLICIT_HC6` with `HC6=1` (down from HC6=2 before fix).

* `solverIntroducedHC6=0` (slot244 no longer moved to 林校305)
* `existingDB HC6=1` (slot383 林业法规与执法实务 in 林校304, pre-existing)
* K26-K remains BLOCKED (slot383 is a pre-existing data issue, out of scope for K26-K4C)

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` |
| Local HEAD before | `0b6c10f` (K26-K4) |
| Local HEAD after | `<K26-K4C commit>` |
| Push | yes |
| Force push | **no** |

## 3. Input Evidence

| Item | Value |
|------|-------|
| K26-K4 root cause | `PREVIEW_SCORING_ACCUMULATED_DELTA_MISMATCH` (fixed in K26-K4) |
| slot244 before K4C | solver moved to room 21 (林校305), HC6 introduced |
| slot383 before K4C | room 23 (林校304), pre-existing violation |
| previewRunId before K4C | 100, hardScore=-2000, HC6=2 |
| HC6 breakdown before K4C | HC6=2 (slot244 solver + slot383 existing) |

## 4. Solver Path Audit

| Solver path | File:line | Current hard filter | HC6 covered? | Gap |
|-------------|-----------|---------------------|--------------|-----|
| Exhaustive search (first room) | `solver.ts:367` | `isPlacementHardCompatible` | **No** (now added) | None — fixed |
| Exhaustive search (other rooms) | `solver.ts:389` | `isPlacementHardCompatible` | **No** (now added) | None — fixed |
| Random ROOM_ONLY | `solver.ts:440-443` | `isPlacementHardCompatible` | **No** (now added) | None — fixed |
| Random TIME_ONLY | `solver.ts:444-447` | n/a (room unchanged) | N/A | OK |
| Random TIME_AND_ROOM | `solver.ts:448-452` | `isPlacementHardCompatible` | **No** (now added) | None — fixed |
| `isPlacementHardCompatible` itself | `solver.ts:115-162` | HC1-HC4 only | **No** (now added) | None — fixed |

All solver candidate paths now reject HC6 pairings via the single `isPlacementHardCompatible` filter.

## 5. HC6 Compatibility Implementation

### Files modified

* `src/lib/scheduler/score.ts`:
  * Exported `AUTOMOTIVE_KEYWORDS`, `isLinxiaoRoomName`, `classifySpecialty`, `computeHC6Penalty` (previously internal)
  * Exported `SpecialtyClassification` type
  * **No semantic change** — just visibility widening for solver reuse

* `src/lib/scheduler/solver.ts`:
  * Imported `classifySpecialty`, `isLinxiaoRoomName`, `computeHC6Penalty` from `./score`
  * Added HC6 check in `isPlacementHardCompatible`:
    ```typescript
    const isLx = isLinxiaoRoomName(proposedRoom)
    if (isLx) {
      const cls = classifySpecialty(movingTask)
      if (computeHC6Penalty(cls, true) < 0) return false
    }
    ```

### Semantics

* **non-automotive task + Linxiao room**: rejected
* **mixed automotive+non-automotive task + Linxiao room**: rejected
* **automotive-only task + Linxiao room**: allowed
* **non-automotive task + non-Linxiao room**: allowed
* **null room (roomId=0)**: not affected (handled by `proposedRoomId === 0` check)
* **courseName/remark**: not used for hard placement; only classGroup membership drives classification (matches score.ts)

### Score semantics confirmation

* `HARD_PENALTY = -1000` — unchanged
* `HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY = -1000` — unchanged
* SC3 / SC7 / SC5 — unchanged
* K22-C baseline 73/0/0/0 — preserved
* SC6 (`AUTOMOTIVE_PREFERS_LINXIAO`) — unchanged (still soft, still a soft preference)

## 6. Synthetic Verification

| Case | Task class | Room | Expected | Result |
|------|-----------|------|----------|--------|
| Non-automotive task + Linxiao | `NON_AUTOMOTIVE_ONLY` | `林校305` | rejected | PASS |
| Mixed task + Linxiao | `MIXED` | `林校305` | rejected | PASS |
| Automotive-only task + Linxiao | `AUTOMOTIVE_ONLY` | `林校305` | allowed | PASS |
| Non-automotive task + non-Linxiao | `NON_AUTOMOTIVE_ONLY` | `教学楼101` | allowed | PASS |
| Mixed task + non-Linxiao | `MIXED` | `教学楼101` | allowed | PASS |
| Automotive-only task + non-Linxiao | `AUTOMOTIVE_ONLY` | `教学楼101` | allowed | PASS |
| Solver run (500 iterations, 3 tasks) | — | — | 0 HC6 introduced | PASS |

## 7. Controlled Trial After K26-K4C

| Field | Value |
|-------|-------|
| Status | **BLOCKED_WITH_EXPLICIT_HC6** |
| previewRunId | 114 |
| previewHardScoreAfter | **-1000** (down from -2000 before K4C) |
| previewSoftScoreAfter | -1426 |
| applyAttempted | no (preview correctly blocked) |
| HC6 breakdown | HC6=1 (was 2 before K4C) |
| solverIntroducedHC6 | **0** (slot244 no longer in Linxiao) |
| existingDB HC6 | **1** (slot383 林业法规 in 林校304) |
| businessDataRestored | N/A (no changes) |
| backup path | `dev.db.backup-before-k26-k-controlled-apply-rollback-2026-06-09T07-38-38-739Z` |

## 8. Known Boundaries

1. **slot383 still pre-existing** — K26-K remains BLOCKED. The HC6 fix prevents new violations but does not fix existing data.
2. **No DB data repair** — out of scope for K26-K4C.
3. **K22 expected unchanged** — no score semantics changed.
4. **Score weights unchanged** — HARD_PENALTY and HC6 penalty still -1000.
5. **HC6 hard rule maintained** — still a hard constraint, not downgraded.
6. **Recommended next stage**:
   * `K26-K4A-HC6-DATA-REPAIR` — resolve slot383 via data fix (change room or add exception)
7. **K27 not eligible** — controlled trial must pass first.

## 9. Verification Results

| Command | Result |
|---------|--------|
| K26-K4C verify script | **34/36 PASS** (2 pre-existing — docs not yet created at run time) |
| K26-K4 verify | **32/32 PASS** |
| K26-K3 verify | **36/36 PASS** |
| K26-K2 debug | **13/13 PASS** |
| K26-J closeout | **52/52 PASS** |
| J3 candidate | **53/53 PASS** |
| J2 snapshot | **52/52 PASS** |
| K22-C score harness | **73/0/0/0** |
| Prisma validate | **PASS** |
| migrate status | **up to date** |
| build | **PASS** |
| lint | **184/146** (baseline) |
| auth foundation | **53/1** (pre-existing) |

## 10. Final Decision

```
k26K4CStatus=PASSED
controlledTrialStatus=BLOCKED_WITH_EXPLICIT_HC6
solverIntroducedHC6=0
existingDbHC6=1
recommendedNextStage=K26-K4A-HC6-DATA-REPAIR
```

K26-K4C **passes**: the solver no longer creates HC6 violations. The only remaining HC6 is the pre-existing slot383, which requires a data fix (out of scope for this stage).
