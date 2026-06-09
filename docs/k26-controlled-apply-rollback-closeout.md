# K26-K Closeout: Controlled Apply/Rollback Acceptance

## 1. Executive Summary

K26-K **controlled apply/rollback trial** is formally **CLOSED**.

All HC6 violations that blocked the trial have been resolved through a chain of K26-K sub-stages:

| Stage | Fix | Commit |
|-------|-----|--------|
| K26-K2 | Root cause diagnosis: `APPLY_VALIDATION_CONTEXT_BUG` | `f659caa` |
| K26-K3 | Extended `countConflictsByType` to include HC5/HC6 | `e0fbab0` |
| K26-K4 | Fixed preview scoring: uses re-scored `bestDetails` | `0b6c10f` |
| K26-K4C | Solver HC6-aware: `isPlacementHardCompatible` rejects Linxiao | `720893a` |
| K26-K4A | Data repair: slot383 roomId 23→31 (林校304→10-124) | `4934c10` |

**Final controlled trial**: PASS — `hardScore=0`, `HC6=0`, `businessDataRestored=true`.

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` |
| Tracking | `origin/master` |
| Local HEAD before | `4934c10` (K26-K4A) |
| Local HEAD after | `<K26-K closeout commit>` |
| Fetch | yes |
| Pull/rebase | no |
| Push | yes |
| Force push | **no** |

## 3. Blocker History

### K26-K2: Root Cause Found
- `countConflictsByType` only counted HC1-HC4, masking HC5/HC6
- Post-apply error showed `HC1=0 HC2=0 HC3=0 HC4=0` but hardScore=-2000

### K26-K3: Visibility Fix
- Extended breakdown to HC1-HC6
- Added `extractTopHardConflict` helper with slot/room/course detail

### K26-K4: Preview Scoring Fix
- `preview.ts` used solver's accumulated `bestScore` (could drift from true score)
- Now uses `bestDetails` from `calculateScoreWithDetails(ctx, bestState)`
- Preview now correctly reports `hardScore=-2000` instead of incorrect `0`

### K26-K4C: Solver HC6-Aware Fix
- `isPlacementHardCompatible` added HC6 check
- All solver candidate paths (exhaustive + random) now reject non-automotive/mixed tasks from Linxiao rooms
- Reuses `score.ts` helpers for classifier consistency

### K26-K4A: Data Repair
- slot383 (林业法规与执法实务) moved from room 23 (林校304) to room 31 (10-124)
- 27 students, NORMAL room, non-Linxiao, no HC1-HC5 conflicts introduced

## 4. Final Controlled Trial Result

| Field | Value |
|-------|-------|
| Status | **PASS** |
| previewRunId | 151 |
| previewHardScoreAfter | **0** |
| previewBlocked | false |
| applyRunId | 152 |
| postApplyHardScore | **0** |
| HC1-HC6 | all 0 |
| solverIntroducedHC6 | **0** |
| existingDbHC6 | **0** |
| rollbackRunId | 153 |
| rollbackHardScoreAfter | **0** |
| businessDataRestored | **true** |
| acceptableAuditDrift | true (runs +3, changes +768) |

## 5. Cross-Environment Data Repair Note

`K26-K4A` slot383 repair is a **local dev.db change** — it is NOT distributed via Git.

For other environments:

```bash
# 1. Dry-run to verify violation exists
npx tsx scripts/repair-hc6-existing-slot383-k26-k4a.ts --dry-run

# 2. Apply (creates backup, modifies DB)
npx tsx scripts/repair-hc6-existing-slot383-k26-k4a.ts --apply

# 3. Verify
npx tsx scripts/verify-hc6-data-repair-k26-k4a.ts
npx tsx scripts/trial-worktime-controlled-apply-rollback-k26-k.ts --controlled --create-new-preview
```

**Production caution**:
- Do NOT commit `prisma/dev.db` or DB backups
- Production must have backup before repair
- If slot ID / room ID differs from dev.db, use dry-run candidate analysis
- Do NOT blindly use `roomId=31` — always run dry-run first

## 6. Verification Results

| Command | Result |
|---------|--------|
| K26-K closeout verify | **33/33 PASS** |
| K26-K4A verify | **PASS** |
| K26-K4C verify | **PASS** |
| K26-K4 verify | **PASS** |
| K26-K3 verify | **PASS** |
| K26-K2 debug | **PASS** |
| Controlled trial | **PASS** (run 151→152→153) |
| K26-J closeout | **52/52 PASS** |
| J3 candidate | **53/53 PASS** |
| J2 snapshot | **52/52 PASS** |
| K22-C | **73/0/0/0** |
| Prisma validate | **PASS** |
| migrate status | **up to date** |
| build | **PASS** |
| lint | **184/146** (baseline) |
| auth foundation | **53/1** (pre-existing) |

## 7. dev.db / backup Status

- `prisma/dev.db`: NOT tracked by git, modified locally by K26-K4A data repair
- DB backups: NOT committed
- Git working tree: clean (only source code changes, no DB artifacts)

## 8. Final Decision

```
k26KStatus=CLOSED
featureStatus=READY_FOR_REAL_USE
technicalReadiness=PASS
controlledApplyRollbackTrial=PASSED
canEnterK27=false
recommendedNextStage=K26-L-CAMPUS-ROOM-RULE-SETTINGS-READMODEL-AND-ROADMAP
```

K26-K **formally closed**. The controlled apply/rollback pipeline is verified end-to-end: preview correctly scores, solver avoids HC6, apply succeeds with hardScore=0, rollback restores all business data. Next steps should go through K26-L (campus/room rule readmodel) before K27 system-wide trial.
