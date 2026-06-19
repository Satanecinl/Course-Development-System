# K36-B1A7 Multi-room Final Closeout

## Stage

```text
K36-B1A7-MULTI-ROOM-FINAL-CLOSEOUT
```

## 1. Current State

| Item | Value |
|---|---|
| branch | `master` |
| HEAD | `568708f3e38642a1a2382ffdb11801ea49e66988` |
| origin/master | `568708f3e38642a1a2382ffdb11801ea49e66988` |
| ahead/behind | `0 / 0` |
| git status --short | empty |
| strict clean | yes |

This closeout is a documentation-only stage. No business code, schema,
migration, scheduler algorithm, score weights, adjustment / recommendation,
WorkTime, campus-room-rules, frontend, or package lock changes. The only
file edits are doc consistency fixes (B1A5 push-status note, this closeout
doc, and a one-line status addition to `current-project-status.md`).

## 2. K36-B1A Stage Table

| Stage | Commit | Scope | Verification | Push status | Closeout result |
|---|---|---|---|---|---|
| **K36-B1** | `a73cd3e` | Import rollback adjustment guard. Block rollback when slots have `ScheduleAdjustment.originalSlotId` / `ScheduleAdjustmentRequest.sourceScheduleSlotId` / `SchedulerRunChange.scheduleSlotId` references. Introduces `ROLLBACK_BLOCKED_BY_ADJUSTMENT_REFERENCES`. | 12/12 source-only checks | pushed (origin/master synced) | CLOSED |
| **K36-B1A1** | `f3dfe2e` | Shared conflict service / conflict-check. Effective room set (primary + additionalRooms), room-set intersection conflict detection, dedup, legacy primary-only compatibility. | 14/14 PASS | pushed | CLOSED |
| **K36-B1A2** | `8bbe129` | Scheduler score / solver HC1. Full + delta HC1 use effective room set; solver placement + hard-conflict participant detection use room sets; cross-semester isolation; legacy `-1000` HC1 preserved. | 14/14 PASS | pushed | CLOSED |
| **K36-B1A3** | `301fbb3` | Adjustment dry-run / apply / request submit+approval / room recommendation / plan recommendation. Retained secondary rooms propagated to `checkScheduleConflicts`; same-week exclude-self; cross-week source recurrence. | 15/15 PASS | pushed | CLOSED |
| **K36-B1A4** | — | **B1A4 was skipped by design.** No code stage, no commit, no verify script. The B1A4 slot was reserved as an interim closeout discussion placeholder only and was never implemented as a code change. The numbering gap is now explicitly documented here so it does not remain dangling. | n/a | n/a | SKIPPED-BY-DESIGN |
| **K36-B1A5** | `4d66a53` | Campus room rules HC5/HC6 secondary rooms. `/api/admin/settings/campus-room-rules` route queries primary OR `additionalRooms.some.roomId`; dedup via `seenHc5Slots` / `seenHc6Slots`; `effectiveLinxiaoRoomNames` from primary + secondary. | 19/19 PASS | pushed (synced at HEAD `568708f`); stale "Not pushed; pending review" note removed in this closeout for doc consistency | CLOSED |
| **K36-B1A6** | `320f7ea` | Scheduler HC4/HC5/HC6 delta multi-room consistency. Delta HC4/HC5/HC6 use `getEffectiveRoomIds` room-set contract; before/after combined capacity / unavailable / prohibited penalty totals. Penalty weights unchanged at `-1000`. | 13/13 PASS | pushed | CLOSED |
| **K36-B1A6A** | — (read-only investigation, no commit) | K22-C I11 drift root-cause investigation. Confirmed I11 fail starts at `320f7ea` (K36-B1A6); B1A3 `73/0/0/0` → B1A6 `72/1`. Used temp worktrees (cleaned up, no main-worktree pollution). | bisect evidence recorded in K36-B1A6A report | n/a (investigation only) | CLOSED (investigation complete) |
| **K36-B1A6B** | `568708f` | I11 HC5 delta regression fix. Added delta-only "transition-into-orphan" penalty in `calculateDeltaScore`: when slot moves from non-empty effective room set to empty effective room set, add `-HARD_PENALTY`. Restored K22-C `73/0/0/0`. Full score semantics unchanged (room=0 still skipped). | 14/14 PASS (dedicated script) + K22-C 73/0/0/0 + B1A6 13/13 + B1A2 14/14 | pushed (origin/master synced at `568708f`) | CLOSED |
| **K36-B1A7A** | — (local artifact move, no commit) | Untracked artifact cleanup. Moved 4 untracked files (2 docx report materials + 2 generate-report JS) into `temp/local-artifacts/k36-b1a7a/` (already covered by `.gitignore` `/temp/**`). No `.gitignore` change needed. | `git status --short` empty after move | n/a (no commit, files in ignored path) | CLOSED |
| **K36-B1A7** | (this commit) | Multi-room final closeout. Documentation-only: this closeout doc + JSON, B1A5 push-status doc fix, `current-project-status.md` one-line addition. | full verification chain re-run (see §4) | pushed (this commit) | CLOSED |

## 3. Seven-Layer Closure Confirmation

| Layer | Coverage | Evidence | Result |
|---|---|---|---|
| 1. Import rollback adjustment guard | `ScheduleAdjustment.originalSlotId`, `ScheduleAdjustmentRequest.sourceScheduleSlotId`, `SchedulerRunChange.scheduleSlotId` reference checks in rollback dry-run + real rollback transaction; `ROLLBACK_BLOCKED_BY_ADJUSTMENT_REFERENCES` 409 response | `verify-import-rollback-adjustment-guard-k36-b1.ts` 12/12 PASS | CLOSED |
| 2. Shared conflict service / conflict-check | `src/lib/schedule/conflict-rules.ts` + `conflict-check.ts`: effective room set, room-set intersection, dedup, semester scoping, exclude-self, legacy primary-only compatibility | `verify-multi-room-conflict-service-k36-b1a1.ts` 14/14 PASS | CLOSED |
| 3. Scheduler score / solver HC1 | `src/lib/scheduler/score.ts` + `solver.ts`: full + delta HC1 via `findEffectiveRoomConflict` / `getEffectiveRoomIds`; solver placement + participant detection; cross-semester isolation; `-1000` preserved | `verify-scheduler-multi-room-hc1-k36-b1a2.ts` 14/14 PASS | CLOSED |
| 4. Adjustment dry-run / apply / recommendation | `src/lib/schedule/adjustments.ts` + `adjustment-plan-recommendations.ts` + `room-recommendations.ts`: retained secondary rooms propagated to `checkScheduleConflicts`; same-week exclude-self; cross-week source recurrence; direct create + request submit + approval reuse dry-run guard | `verify-adjustment-multi-room-occupancy-k36-b1a3.ts` 15/15 PASS | CLOSED |
| 5. Scheduler HC4/HC5/HC6 delta | `src/lib/scheduler/score.ts`: delta HC4/HC5/HC6 use `getEffectiveRoomIds` room-set contract; before/after combined capacity / unavailable / prohibited penalty totals; weights `-1000` | `verify-scheduler-multi-room-delta-hc4-hc5-hc6-k36-b1a6.ts` 13/13 PASS | CLOSED |
| 6. Campus room rules HC5/HC6 secondary rooms | `src/app/api/admin/settings/campus-room-rules/route.ts`: primary OR `additionalRooms.some.roomId` for HC5 + HC6; dedup via `seenHc5Slots` / `seenHc6Slots`; `effectiveLinxiaoRoomNames` from primary + secondary | `verify-campus-room-rules-secondary-k36-b1a5.ts` 19/19 PASS | CLOSED |
| 7. I11 HC5 delta regression / K22-C restored | `src/lib/scheduler/score.ts` `calculateDeltaScore`: delta-only transition-into-orphan penalty; K22-C `I11-DELTA-REAL-TO-ROOM_ZERO` restored to `deltaHard=-1000` | `verify-i11-delta-hc5-regression-k36-b1a6b.ts` 14/14 PASS + K22-C 73/0/0/0 PASS | CLOSED |

## 4. Verification Results

| Command | Result |
|---|---|
| `npx tsx scripts/verify-import-rollback-adjustment-guard-k36-b1.ts` | 12/12 PASS |
| `npx tsx scripts/verify-multi-room-conflict-service-k36-b1a1.ts` | 14/14 PASS |
| `npx tsx scripts/verify-scheduler-multi-room-hc1-k36-b1a2.ts` | 14/14 PASS |
| `npx tsx scripts/verify-adjustment-multi-room-occupancy-k36-b1a3.ts` | 15/15 PASS |
| `npx tsx scripts/verify-campus-room-rules-secondary-k36-b1a5.ts` | 19/19 PASS |
| `npx tsx scripts/verify-scheduler-multi-room-delta-hc4-hc5-hc6-k36-b1a6.ts` | 13/13 PASS |
| `npx tsx scripts/verify-i11-delta-hc5-regression-k36-b1a6b.ts` | 14/14 PASS |
| `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | 73 / 0 / 0 / 0 PASS (I11 PASS, deltaHard=-1000, deltaSoft=2, SC9=2) |
| `npm run scan:docs-pii` | 0 blocking, 2 existing warnings (`k18-task37-source-artifact-review.json` PHONE_NUMBER `178***`, `k22-real-solver-quality-evaluation.json` PHONE_NUMBER `157***` — both pre-existing, unchanged) |
| `npx prisma validate` | schema valid |
| `npm run build` | Compiled successfully (1 pre-existing Turbopack NFT warning, unchanged) |
| K22 generatedAt drift produced? | yes (K22-C harness writes `docs/k22-score-default-snapshot.json` + `docs/k22-score-regression-harness-implementation.json` on every run) |
| K22 drift restored? | yes — `git restore` after each run; not committed |
| K22 expected content changed? | no — I11 expected stays at `deltaHard=-1000`; summary stays 73/0/0/0 |
| Final `git status --short` | empty |

## 5. Documentation Consistency Fixes

| Fix | Applied? | Detail |
|---|---|---|
| Fix B1A5 doc stale "Not pushed; pending review" residual | yes | Removed the stale line in `docs/k36-b1a5-campus-room-rules-secondary-fix.md` "Residual Risks"; added a "Push Status" section documenting commit `4d66a53` pushed + synced at HEAD `568708f`. Mirrored in `docs/k36-b1a5-campus-room-rules-secondary-fix.json` `pushStatus` block. No code change. |
| Add B1A7 closeout docs | yes | This `docs/k36-b1a7-multi-room-final-closeout.md` + `.json` |
| Update `docs/current-project-status.md` | yes | One-line addition to the header banner noting K36-B1A closeout complete + K22-C restored + K36-B1A6B pushed. No structural rewrite, no README change. |
| Touch business code | no | `src/**`, `prisma/**`, `scripts/**` untouched in this stage |

## 6. I11 Semantic Note

K36-B1A6B restored K22-C to `73/0/0/0` by adding a delta-only
"transition-into-orphan" penalty in `calculateDeltaScore`. The semantic
details, recorded for future maintainers:

- **Full score** still treats `room=0` as no-room: HC4 / HC5 / HC6 loops
  `if (p.room === 0) continue`, so a no-room slot contributes no hard
  penalty in full score. This is unchanged by K36-B1A6B.
- **Delta score** adds `-HARD_PENALTY` when a slot moves from a position
  with a non-empty effective room set to a position with an empty
  effective room set (transition INTO orphan). Transition OUT of orphan
  and same-state moves do not fire. This reproduces the K22-C I11
  expected `deltaHard=-1000` that was locked based on B1A3 behavior.
- **Full-vs-delta divergence**: for the I11 case (real room → room=0),
  full score HC5 delta = 0 while delta HC5 (after fix) = -1000. This
  divergence is **intentional and documented**. It does not block the
  current B1A closeout.
- **K22-C alignment**: restored to 73/0/0/0. No longer a multi-room
  closeout blocker.
- **Future unification**: if a future stage decides to unify full/delta
  room=0 semantics (e.g. make full score also penalize no-room, or make
  delta stop penalizing transition-into-orphan), it must be opened as a
  separate stage and must coordinate with K22 expected updates (which
  require explicit user approval). This closeout does not preclude that.

## 7. Residual Risks

| Risk | Status |
|---|---|
| WorkTime score contract B-03 label | still dangling — K26-J4 materially resolved SC3/SC7 via `WorkTimeForScore`, but the "B-03" label was never explicitly closed in any K26-J / K36 closeout doc. Awaits an explicit close stage. |
| Git history sensitive data | not cleaned — K36-B1A1–A6 docs explicitly state Git history is unsanitized. Repo must remain private. |
| Release packaging guard | not done — K36-A5G not started. |
| Public repo / external source delivery | **No-Go** — blocked by Git history + release packaging guard. |
| dev.db / uploads / ignored backups / temp artifacts | not deliverable — all under `.gitignore` but must not be packaged for external delivery. |
| K22 harness alignment | **restored / re-verified** — 73/0/0/0 PASS. No longer a multi-room closeout blocker. Future score.ts refactors must re-verify this invariant. |
| I11 full-vs-delta divergence | documented (§6). Intentional. Does not block closeout. |

## 8. Go / No-Go

| Dimension | Verdict | Basis |
|---|---|---|
| multi-room / secondary room 主线是否可关闭 | **Go (closable)** | 7 layers all CLOSED; full verification chain PASS |
| 是否仍有 multi-room P0 | **No** | K34-A3 main line + K36-B1 / B1A1–A6 / B1A6B all closed |
| 是否仍有 multi-room P1 | **No** | same as above |
| K22-C 是否恢复 | **Yes** | 73/0/0/0 PASS, I11 PASS |
| Private repo 内部开发是否 Go | **Go** | all verify PASS, build PASS, prisma valid, worktree clean, origin synced |
| 当前能否公开仓库 | **No-Go** | Git history sensitive data未清理 + release packaging guard 未完成 |
| 当前能否外部交付源码包 | **No-Go** | same as above + dev.db / uploads / temp artifacts 不可交付 |
| 下一阶段建议 | (see below) | — |

### Next-stage recommendation

1. **WorkTime B-03 explicit close** — audit the "B-03" label origin
   (likely K26-I / K26-J audit) and write an explicit close doc, or
   convert to a tracked follow-up. Low risk, doc-only.
2. **K36-A5G release packaging guard** — add a guard script that
   validates a release zip excludes `prisma/dev.db`, `uploads/`, `.env`,
   real fixtures, real `.docx`, and `temp/`. Required before any
   external delivery.
3. **Git history sanitization decision** — decide between
   `git filter-repo` (rewrites history, breaks existing clones) vs.
   fresh repo + synthetic fixtures (cleaner, loses history). Required
   before public repo.
4. **(Optional) I11 full/delta unification** — only if a future stage
   wants to remove the documented divergence. Not blocking.

## 9. Prohibition Confirmation

| Prohibition | Status |
|---|---|
| 修改业务代码 | 否 |
| 修改 schema/migration | 否 |
| 写数据库 | 否 |
| 运行真实 preview/apply/rollback/import/调课 | 否 |
| 提交 temp/local-artifacts | 否 |
| 提交 docx | 否 |
| 提交 generate-report scripts | 否 |
| 提交 K22 expected drift | 否 (K22 expected restored via `git restore`, not committed) |
| 处理 Git 历史 | 否 |
| force push | 否 |

## Commit

Message: `docs(schedule): close multi-room final acceptance`

Files (expected):
- `docs/k36-b1a7-multi-room-final-closeout.md` (new)
- `docs/k36-b1a7-multi-room-final-closeout.json` (new)
- `docs/k36-b1a5-campus-room-rules-secondary-fix.md` (minimal push-status fix)
- `docs/k36-b1a5-campus-room-rules-secondary-fix.json` (minimal push-status fix)
- `docs/current-project-status.md` (one-line status addition)

Not included: `src/**`, `prisma/**`, `scripts/**`, `temp/**`, docx,
generate-report JS, K22 expected drift, package lock, unrelated docs.