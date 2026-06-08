# K26-D Codex Slot Verify and DB Snapshot

Task: `K26-D-B-CODEX-SLOT-VERIFY-AND-DB-SNAPSHOT`

Baseline:

- Branch created for this audit: `k26-d-codex-slot-verify-and-db-snapshot`
- Baseline HEAD: `0e8c94a`
- Scope: read-only DB snapshot, static verification design, scheduler/score impact notes
- No business source, Prisma schema, migration, solver, score, or database changes

## DB read-only snapshot

The snapshot was collected with:

```text
sqlite3 "file:prisma/dev.db?mode=ro" ...
```

The database file size and `LastWriteTimeUtc` were unchanged before and after
the read-only queries:

```text
Length: 3735552
LastWriteTimeUtc: 2026-06-08 07:53:30Z
```

### Counts

| Metric | Result |
| --- | ---: |
| Total `ScheduleSlot` count | 440 |
| `slotIndex > 5` | 2 |
| `slotIndex = 6` | 2 |
| `slotIndex = 7` | 0 |
| Weekend `dayOfWeek IN (6,7)` | 21 |

### slotIndex distribution

| slotIndex | Count |
| ---: | ---: |
| 1 | 111 |
| 2 | 119 |
| 3 | 88 |
| 4 | 96 |
| 5 | 24 |
| 6 | 2 |

### dayOfWeek distribution

| dayOfWeek | Count |
| ---: | ---: |
| 1 | 95 |
| 2 | 70 |
| 3 | 82 |
| 4 | 94 |
| 5 | 78 |
| 6 | 11 |
| 7 | 10 |

### semester distribution

| semesterId | Name | Code | Academic year | Term | Active | Count |
| ---: | --- | --- | --- | --- | ---: | ---: |
| 1 | 2025-2026 spring semester | `LEGACY-DEFAULT` | 2025-2026 | 2 | 1 | 440 |

The database value for the semester name is `2025-2026春季学期`.

### Legacy slot samples

At most 10 records were requested. Both matching records are shown.

| id | teachingTaskId | roomId | dayOfWeek | slotIndex | semesterId | createdAt | updatedAt |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 265 | 200 | 30 | 2 | 6 | 1 | 1780035124397 | 1780273265733 |
| 271 | 200 | 30 | 1 | 6 | 1 | 1780035124399 | 1780273265733 |

There are currently no `slotIndex=7` rows. Verification must nevertheless
retain deterministic display coverage for `7 = 中午`; absence in the current
DB is not permission to remove compatibility.

### Weekend samples

| id | teachingTaskId | roomId | dayOfWeek | slotIndex | semesterId |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 215 | 166 | 10 | 7 | 2 | 1 |
| 216 | 167 | null | 6 | 1 | 1 |
| 217 | 167 | null | 6 | 2 | 1 |
| 218 | 168 | null | 6 | 2 | 1 |
| 219 | 169 | null | 6 | 3 | 1 |
| 220 | 169 | null | 6 | 4 | 1 |
| 221 | 170 | null | 7 | 1 | 1 |
| 222 | 171 | null | 7 | 2 | 1 |
| 223 | 172 | null | 7 | 3 | 1 |
| 224 | 173 | null | 6 | 1 | 1 |

## Current static baseline

The final K26-D verifier should distinguish current behavior from the desired
post-extraction state.

| Area | Current baseline at `0e8c94a` | K26-D expectation |
| --- | --- | --- |
| Active slots | `VALID_TEACHING_SLOT_INDEXES = [1,2,3,4,5]` exists | Preserve and expose through the unified helper |
| Legacy labels | `types/schedule.ts` owns 6/7 labels | Unified helper owns display labels for 6 and 7 |
| Active formatter | `formatTeachingSlotLabel` formats 1-5 only | Unified formatter handles active, legacy, and unknown |
| Recommendation slots | Plan helper calls `getValidTeachingSlotIndexes()` | Preserve |
| Preferred days | Local `[1,2,3,4,5]` constant | Use unified day helper |
| Weekend days | Local `[6,7]` constant | Use unified day helper |
| Grid display | `TIME_SLOTS` plus `getSlotLabelByIndex` | Use unified label helper |
| Dashboard display | `TIME_SLOTS.find(...)` | Use unified label helper |
| Room recommendation API | Rejects `targetSlotIndex > 5` | Derive validation from active-slot helper |

## Final verify script design

Recommended final filename:

```text
scripts/verify-static-time-slot-extraction-k26-d.ts
```

The script should be read-only and split into four independent groups:

1. Runtime helper assertions by importing pure helper exports.
2. Source wiring assertions using file reads and narrow structural patterns.
3. SQLite DB assertions through a connection opened with `mode=ro`.
4. Git diff guardrails relative to the agreed K26-D base commit.

Avoid broad assertions such as "the repository contains no `[1,2,3,4,5,6]`".
The solver intentionally retains a fixed 1..6 candidate domain in this phase.
Checks must be scoped to recommendation and selectable-new-target paths.

### Helper checks

| # | Assertion |
| ---: | --- |
| 1 | Unified helper module exists and exports slot/day constants and formatters |
| 2 | Active teaching slots deep-equal `[1,2,3,4,5]` |
| 3 | Legacy display slots include `6` and `7` |
| 4 | Recommendation-safe slots exclude `6` and `7` |
| 5 | Preferred day values deep-equal `[1,2,3,4,5]` |
| 6 | Weekend day values deep-equal `[6,7]` |
| 7 | Formatter returns the expected labels for every slot 1-5 |
| 8 | Formatter returns `11-12节` for slot 6 |
| 9 | Formatter returns `中午` for slot 7 |
| 10 | Unknown values such as `0`, `8`, and `999` return a non-empty safe fallback and do not throw |

Prefer runtime equality checks over source regex for checks 2-10. Also verify
that returned arrays are copies or readonly values so callers cannot mutate
the shared source of truth.

### Source checks

| # | Assertion and recommended scope |
| ---: | --- |
| 11 | `src/lib/schedule/**`, adjustment APIs, and recommendation UI contain no newly introduced raw `[1,2,3,4,5,6]` candidate list |
| 12 | New-target dropdowns use recommendation-safe options and do not offer `11-12节` or `中午` |
| 13 | Display maps/helper tests still contain `11-12节` and `中午` |
| 14 | `adjustment-plan-recommendations.ts` derives candidate slots from the active helper |
| 15 | Preferred-day route and plan validation derive from the preferred-day helper |
| 16 | `schedule-grid.tsx` uses the unified label helper for rendering |
| 17 | `dashboard-content.tsx` uses the unified label helper for rendering |
| 18 | Room recommendation validation rejects 6/7 through the active helper, not a divergent upper bound |

For check 12, inspect the JSX expression used by the actual new-target
`Select`/`option` loop. Do not fail because legacy display components contain
the text `11-12节`.

For checks 16-17, require the helper import and a call at the rendering site.
Merely importing the helper is insufficient.

### DB checks

| # | Assertion |
| ---: | --- |
| 19 | Querying rows with `slotIndex IN (6,7)` succeeds; if rows exist, each can be passed to the formatter |
| 20 | Querying rows with `dayOfWeek IN (6,7)` succeeds and returns intact values |
| 21 | DB is opened read-only; file size and mtime are identical before/after; no Prisma mutation methods occur in the verifier |

DB checks must not assert that legacy/weekend counts are permanently equal to
the current `2` and `21`. Those are snapshot facts, not product invariants.
The stable invariant is readability and display compatibility.

### Non-goal guardrails

Compare the K26-D change range with its exact integration base, and fail if any
of these paths or behaviors changed:

| # | Guardrail |
| ---: | --- |
| 22 | No `prisma/schema.prisma` change |
| 23 | No `prisma/migrations/**` change |
| 24 | No `src/lib/scheduler/solver.ts` algorithm change |
| 25 | No `src/lib/scheduler/score.ts` change |
| 26 | No WorkTime UI/module added |
| 27 | No K22 expected score/harness change |

Also include `prisma/dev.db` in the forbidden changed-path list. Checks 24-25
should be exact path diff checks, not source-content heuristics.

## Solver and score static impact

| File | Assumption | Why K26-D should not change it | Future phase |
| --- | --- | --- | --- |
| `src/lib/scheduler/solver.ts` | Exhaustive conflict search enumerates `day=1..7`, `slot=1..6`; comment calls this 42 time slots | This is solver candidate generation and changing it alters optimization behavior and K22 expected outputs | Dedicated solver-domain/configuration phase |
| `src/lib/scheduler/score.ts` | SC3 applies when `slotIndex >= 5` in full and delta score | This is an established penalty semantic: slot 5 is already considered extreme; replacing it with "not active" or "legacy" changes scores | Score-policy phase with K22 snapshot update |
| `src/lib/scheduler/score.ts` | SC7 applies when `dayOfWeek >= 6` in full and delta score | Weekend penalty owns days 6/7 and must continue reading historical weekend rows | WorkTime/weekend policy phase |
| `src/lib/scheduler/score.ts` | `TEACHING_DAYS = [1,2,3,4,5]` drives SC5 and weekday-only SC8/SC9 logic | These arrays are scoring domains, not UI/recommendation constants; coupling them in K26-D risks semantic drift | Score helper extraction only with regression proof |
| `src/lib/scheduler/score.ts` | SC8/SC9 skip weekend positions | SC7 intentionally owns weekend scoring; changing this can double count penalties | Score-policy phase |
| `src/lib/scheduler/score-breakdown.ts` | SC3 and SC7 IDs/messages are stable reporting contracts | Static label extraction does not require changing score taxonomy | Score reporting phase |
| `scripts/verify-score-regression-harness-k22-c.ts` | SC3 fixtures expect slot 5 penalty; SC7 fixtures expect day 6 penalty | K22 expected results are explicit K26-D non-goals | Only update with an approved score behavior change |
| `scripts/audit-class-gap-reduction-constraint-k22-f5.ts` | Documents a historical 1..6 period domain and SC3 `>=5` interaction | It is audit evidence for existing score assumptions, not a recommendation UI source | Re-audit when solver/score domains change |

## Suggested integration checks for CC

1. Keep separate concepts in the helper: active/recommendation-safe slots,
   display-compatible slots, preferred weekdays, and weekend days.
2. Do not make `TIME_SLOTS` active-only. Existing rows at slot 6 and potential
   slot 7 values still need labels.
3. Route all display call sites through one formatter, while routing selectable
   new targets through active-only options.
4. Use an explicit unknown fallback such as `第${slotIndex}节`; never index an
   array without bounds checking.
5. Scope raw-range source checks to recommendation and UI entry points so the
   final verifier does not incorrectly reject the unchanged solver.
6. Run K24 range verification and K22 score regression after integration, but
   do not modify their expected values for K26-D.
7. Treat current DB counts as evidence only. The verifier should prove read
   compatibility, not freeze local data counts.

## Audit limitations

`git fetch --all --prune` was requested twice but did not execute because the
permission approval review timed out. The local branch and local baseline HEAD
were verified before audit work. The codegraph index request had the same
approval timeout, so source inspection used read-only repository searches.
