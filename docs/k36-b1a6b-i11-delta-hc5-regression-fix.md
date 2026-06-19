# K36-B1A6B I11 Delta HC5 Regression Fix

## Stage

```text
K36-B1A6B-FIX-I11-DELTA-HC5-REGRESSION
```

## Scope

This stage fixes the K22-C harness regression introduced by K36-B1A6
(`fix(scheduler): align multi-room hard-constraint deltas`, commit
`320f7ea`). K22-C case `I11-DELTA-REAL-TO-ROOM_ZERO` had been passing at
`73/0/0/0` on `301fbb3` (B1A3) but began failing at `72/1` starting
from `320f7ea` (B1A6) and remained failing at HEAD `4d66a53`.

No Prisma schema / migration, no WorkTime score contract, no
adjustment / recommendation / campus-room-rules / frontend / package
lock changes.

## Problem

K22-C `I11` expects `deltaHard = -1000` for a move that takes a slot
from a real room (`roomId=200`) to `roomId=0` (no-room / UNSCHEDULED).
At B1A3 the actual `deltaHard` was `-1000` because the legacy code
called `isRoomAvailable(ctx, 0, 1, 2)` which returned `false` (room 0
was absent from `roomById` in I11's fixture), so `if (!newAvail)
deltaHard += HARD_PENALTY` fired.

K36-B1A6 refactored the HC4/HC5/HC6 delta paths to use helper
functions (`computeHC4CapacityPenalty`, `computeHC5AvailabilityPenalty`,
`computeHC6EffectiveRoomPenalty`). The new `computeHC5AvailabilityPenalty`
short-circuits on `currentRoomId <= 0` with `return 0`, which
**silenced the I11 delta penalty** that the legacy code had produced
through the room-not-in-roomById sentinel.

## Investigation (K36-B1A6A)

- `git-bisect` style worktree bisect confirmed:
  - `301fbb3` (B1A3) → K22-C = 73/0/0/0, I11 PASS, actual deltaHard=-1000
  - `320f7ea` (B1A6) → K22-C = 72/1, I11 FAIL, actual deltaHard=0
  - `4d66a53` (HEAD) → K22-C = 72/1, I11 FAIL, actual deltaHard=0
- Only commit between passing and failing: `320f7ea` (K36-B1A6).
- B1A6's own 13/13 multi-room delta verify continued to pass because
  B1A6's fixtures all use rooms that are explicitly in `roomById`.

## Fix

Add a delta-only "transition-into-orphan" penalty in
`calculateDeltaScore` (`src/lib/scheduler/score.ts`). When a slot
moves from a position with a non-empty effective room set to a position
with an empty effective room set, add `-HARD_PENALTY` to `deltaHard`.

The fix is a **delta-only signal**: full score still treats room=0
slots as no-room (skipped in HC4 / HC5 / HC6 loops, unchanged). This
preserves:

- Full score semantics: room=0 → no penalty
- Multi-room effective room set semantics: secondary rooms retained
  when primary becomes 0
- Duplicate room dedup: `getEffectiveRoomIds` is a `Set`
- HC4 / HC5 / HC6 penalty weights: unchanged (-1000)
- HC1: unchanged
- WorkTime SC3 / SC7: unchanged

The transition penalty is **directional**: only transition INTO orphan
fires; transition OUT of orphan and same-state moves do not. This
matches the K22 expected semantics (I11 real→0 fires -1000; I10 0→real
fires 0; Case 9 10+secondary→0 does not fire the orphan penalty because
secondary [20] is retained at the new position).

## Implementation

```ts
// K36-B1A6B: HC5 transition-into-orphan penalty (delta-only signal).
// When a slot moves from a position with an effective room set to a position
// with an empty effective room set, the slot becomes "orphaned" (no room to
// hold the lesson). Full score treats room=0 slots as "no-room" (skipped in
// HC4/HC5/HC6), but the delta needs to surface the transition as a hard
// penalty so LAHC solver can see the score worsen.
// - Transition INTO orphan: penalty (slot was valid, now orphaned)
// - Transition OUT of orphan: no penalty (slot was orphan, now valid)
// - Both states same: no penalty
// This reproduces K22-C I11-DELTA-REAL-TO-ROOM_ZERO expected deltaHard=-1000.
{
  const oldEffective = getEffectiveRoomIds(slot, old.roomId)
  const newEffective = getEffectiveRoomIds(slot, move.newRoomId)
  if (oldEffective.size > 0 && newEffective.size === 0) {
    deltaHard += HARD_PENALTY
  }
}
```

Inserted in `calculateDeltaScore` after the existing `computeHC5AvailabilityPenalty`
delta computation (around line 940). No other functions were modified.

## Verification

### Dedicated script

`scripts/verify-i11-delta-hc5-regression-k36-b1a6b.ts` — 14/14 PASS.
Covers I11 / I10 fixtures, room=0 full score, HC5 unavailable primary /
secondary, duplicate dedup, orphan transition (in / out / both / real),
`getEffectiveRoomIds` edge cases.

### Existing scripts

| Command | Result |
|---|---|
| `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | **73 / 0 / 0 / 0 PASS** (was 72 / 1) |
| `npx tsx scripts/verify-scheduler-multi-room-delta-hc4-hc5-hc6-k36-b1a6.ts` | **13 / 13 PASS** (no regression) |
| `npx tsx scripts/verify-scheduler-multi-room-hc1-k36-b1a2.ts` | **14 / 14 PASS** (no regression) |
| `npx prisma validate` | PASS |
| `npm run build` | PASS (1 pre-existing Turbopack NFT warning, unchanged) |
| `npm run scan:docs-pii` | 0 blocking, 2 existing warnings (unchanged) |
| `npx eslint src/lib/scheduler/score.ts scripts/verify-i11-delta-hc5-regression-k36-b1a6b.ts` | (to be run) |

### K22 generatedAt drift

K22-C harness writes `docs/k22-score-default-snapshot.json` and
`docs/k22-score-regression-harness-implementation.json` on every run. After
the fix restored K22-C to 73/0/0/0, the harness write produced
generatedAt-only changes. Those changes are restored via `git restore`
before the commit; the commit does not include any K22 expected
file modifications.

## Semantic Decision

The K22-C `I11` expected `deltaHard = -1000` is **inconsistent with
full score semantics** (full score treats room=0 as no-room and skips
HC5, so its full score delta for HC5 is 0). This expected value was
locked based on the B1A3 behavior where `isRoomAvailable(ctx, 0, ...)`
returned `false` due to room 0 not being in `roomById` for I11's
fixture.

The K36-B1A6B fix preserves the K22 expected value by adding a
delta-only transition-into-orphan penalty. This is a **delta-only
signal** that does not change full score semantics. The full score and
delta may diverge for this specific transition case, but the LAHC
solver benefits from seeing the score worsen when a slot transitions
into no-room state.

## Residual Risks

- WorkTime B-03 标签仍待 explicit close
- K22 score harness alignment now restored; future score.ts refactors must
  re-verify K22-C 73/0/0/0 invariant
- Git history sensitive data 未清理
- release packaging guard 未完成
- 公开仓库 / 外部源码交付仍 No-Go
- K36-B1A7 final closeout 仍未执行
- The full-vs-delta divergence on the I11 case is intentional and
  documented above. If a future stage decides to change this, it must
  either update the K22 expected (which requires user approval) or
  find a different way to surface the orphan transition.

## Commit

Message: `fix(scheduler): restore I11 HC5 delta regression`

Files (expected):
- `src/lib/scheduler/score.ts` (modified)
- `scripts/verify-i11-delta-hc5-regression-k36-b1a6b.ts` (new)
- `docs/k36-b1a6b-i11-delta-hc5-regression-fix.md` (new)
- `docs/k36-b1a6b-i11-delta-hc5-regression-fix.json` (new)

Not included:
- K22 expected files (docs/k22-score-*.json)
- Prisma / migrations
- package lock
- temp / docx / generate-report scripts
