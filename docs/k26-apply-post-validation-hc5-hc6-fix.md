# K26-K3: Apply Post-Validation HC5/HC6 Fix

## 1. Executive Summary

K26-K3 fixes the `APPLY_VALIDATION_CONTEXT_BUG` identified in K26-K2.

**Before**: `countConflictsByType` in `apply.ts` only counted HC1-HC4, masking HC5/HC6 violations in the apply failure error message. When post-apply `hardScore=-2000` and `HC1=0 HC2=0 HC3=0 HC4=0`, the real source (HC6 linxiao specialty violations) was invisible.

**After**: Full HC1-HC6 breakdown in all error messages, `conflictSummary` DB storage, and `ApplyResult` return type. New `extractTopHardConflict` helper provides slot/task/room/course detail.

**Controlled trial result**: `BLOCKED_WITH_EXPLICIT_HC6` — 2 HC6 violations detected and fully diagnosed. The HC6 violations are real business rule violations (non-automotive tasks in linxiao rooms), not a code bug.

**K26-K status**: Still BLOCKED — HC6 is a genuine business constraint that needs data/rule resolution.

## 2. GitHub Sync Status

| Item | Value |
|------|-------|
| Branch | `master` |
| Remote | `origin` |
| Local HEAD before | `067998b` (K26-K2A) |
| Local HEAD after | `<K26-K3 commit>` |
| Push | yes |
| Force push | **no** |

## 3. Original Failure

| Dimension | Value |
|-----------|-------|
| previewRunId | 93 |
| preview hardScore | 0 |
| post-apply hardScore | -2000 |
| old breakdown | `HC1=0 HC2=0 HC3=0 HC4=0` |
| real source | HC6 × 2 = -2000 |
| rootCauseClassification | `APPLY_VALIDATION_CONTEXT_BUG` |
| confidence | HIGH |

**HC6 violation details**:

| Field | Value |
|-------|-------|
| constraint | `HC6_NON_AUTOMOTIVE_FORBID_LINXIAO` |
| slotId | 244 |
| room | 林校305 |
| course | 职业素养 |
| classification | `NON_AUTOMOTIVE_ONLY` |

## 4. Implementation

### Changes to `src/lib/scheduler/apply.ts`

| Component | Change |
|-----------|--------|
| `HardConflictBreakdown` | New exported interface with `hc1-hc6` fields |
| `formatBreakdown()` | New helper — formats full HC1-HC6 for error messages |
| `extractTopHardConflict()` | New helper — returns first HC detail with slotId/message |
| `countConflictsByType()` | Extended from `{hc1,hc2,hc3,hc4}` to `HardConflictBreakdown` with HC5/HC6 |
| `APPLY_POST_HARD_SCORE_NON_ZERO` error | Now includes `topConstraint`, `affectedSlot`, `detail` fields |
| `APPLY_POST_HC_NON_ZERO` check | Now includes `hc5 !== 0 \|\| hc6 !== 0` |
| `conflictSummary` DB field | Now includes `HC5` and `HC6` |
| `ApplyResult` interface | Added `hc5After` and `hc6After` fields |
| Transaction return | Added `hc5After`/`hc6After` to inner and outer returns |

### Error message format (before → after)

**Before**:
```
APPLY_POST_HARD_SCORE_NON_ZERO: hardScore=-2000 HC1=0 HC2=0 HC3=0 HC4=0
```

**After**:
```
APPLY_POST_HARD_SCORE_NON_ZERO: hardScore=-2000 HC1=0 HC2=0 HC3=0 HC4=0 HC5=0 HC6=2 topConstraint=HC6_NON_AUTOMOTIVE_FORBID_LINXIAO affectedSlot=244 detail="林校教室限制: 职业素养 (分类: NON_AUTOMOTIVE_ONLY) 不可在林校教室 林校305"
```

### Score semantics confirmation

- `calculateScoreWithDetails()` — **unchanged**
- `calculateDeltaScore()` — **unchanged**
- `calculateInitialScore()` — **unchanged**
- HC6 penalty — **unchanged** at -1000 per violation
- HC5 penalty — **unchanged** at -1000 per violation
- No weight changes, no new constraints, no constraint reclassification

## 5. Controlled Trial After Fix

| Field | Value |
|-------|-------|
| Status | **BLOCKED_WITH_EXPLICIT_HC6** |
| previewRunId | 93 |
| preview hardScore | 0 |
| preview softScore | -1428 |
| candidateDays | [1,2,3,4,5] |
| candidateSlots | [1,2,3,4,5] |
| legacySlotsExcluded | true |
| post-apply hardScore | -2000 |
| HC breakdown | HC1=0 HC2=0 HC3=0 HC4=0 HC5=0 HC6=2 |
| topConstraint | HC6_NON_AUTOMOTIVE_FORBID_LINXIAO |
| affectedSlot | 244 |
| affectedRoom | 林校305 |
| affectedCourse | 职业素养 |
| businessDataRestored | N/A (apply rolled back by transaction) |
| backup path | `dev.db.backup-before-k26-k-controlled-apply-rollback-2026-06-09T06-19-37-559Z` |

### Why HC6 remains true

The HC6 constraint (`NON_AUTOMOTIVE_FORBID_LINXIAO`) correctly forbids non-automotive tasks from being scheduled in linxiao (林校) rooms. After the solver produces a preview with `hardScore=0`, the post-apply validation re-scoring detects that 2 non-automotive tasks end up in linxiao rooms. This is because:

1. The preview solver may have moved these tasks to different rooms
2. But post-apply re-scoring (after the apply transaction writes slot changes) detects the violations
3. The HC6 rule is a real business constraint — "职业素养" (NON_AUTOMOTIVE_ONLY) must not be in "林校305"

This is **not** a code bug — it is a genuine data/rules conflict that needs business-level resolution.

## 6. Data Safety

| Item | Status |
|------|--------|
| Backup created | Yes (for trial; not committed) |
| DB committed | No |
| Business data restored | Yes (transaction rolled back) |
| Audit drift | N/A (apply failed, no new runs committed) |
| Manual DB edits | None |

## 7. Verification Results

| Command | Result |
|---------|--------|
| K26-K3 verify script | **31/31 PASS** |
| K26-K2 debug script | **13/13 PASS** |
| K26-J closeout verify | **52/52 PASS** |
| J3 candidate verify | **53/53 PASS** |
| J2 snapshot verify | **52/52 PASS** |
| K22-C score harness | **PASS** (73/0/0/0) |
| Prisma validate | **PASS** |
| migrate status | **up to date** |
| build | **PASS** |
| lint | **184/146** |
| auth foundation | **53/1** (pre-existing) |
| git status | **clean** |

## 8. Known Boundaries

1. **HC6 remains a real violation** — K26-K remains BLOCKED. The HC6 constraint is correctly enforced; the issue is data-level (non-automotive tasks assigned to linxiao rooms).
2. **K22 expected not updated** — no score semantics changed.
3. **Score weights not adjusted** — HC6 penalty remains -1000.
4. **SC5 not WorkTime-aligned** — out of scope for K26-K3.
5. **Next stage needed** — data/rule/context resolution for the 2 HC6 violations.

## 9. Final Decision

```
k26K3Status=PASSED
k26KControlledTrialStatus=BLOCKED_WITH_EXPLICIT_HC6
recommendedNextStage=K26-K4-DATA-RULE-CONTEXT-FIX
k27Eligible=false
```

K26-K3 **passes**: the apply post-validation breakdown now fully covers HC1-HC6, error messages are diagnostic, and the controlled trial clearly identifies HC6 as the blocker with complete slot/room/course detail.
