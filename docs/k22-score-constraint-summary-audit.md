# K22-F9 Score Constraint Summary Audit

| Field | Value |
|---|---|
| Phase | K22-F9-SCORE-CONSTRAINT-SUMMARY-AUDIT |
| Type | Read-only summary / roadmap / data-quality audit (no Prisma writes, no score.ts modifications, no schema changes) |
| Generated | 2026-06-07 |
| Predecessor | K22-F8-CLASSROOM-STABILITY-IMPL (commit `ceb9bc7`) |
| Audit script | `scripts/audit-score-constraint-summary-k22-f9.ts` |
| JSON report | `docs/k22-score-constraint-summary-audit.json` |
| Project direction | K22-SCORE-CONSTRAINT-SUMMARY — 汇总 HC1-HC6 / SC1-SC9 / MIN_PERT 的最终状态、harness 覆盖、剩余 roadmap、风险边界 |

---

## 1. Executive Summary

K22-F9 is a read-only summary stage. It does not implement, modify, or extend any constraint. It
produces a structured inventory of the current scoring system in `src/lib/scheduler/score.ts` after
K22-F8, verifies full / delta coverage per constraint, summarizes K22-C regression harness sections
A-I, confirms the default snapshot is stable, and outlines the remaining roadmap (P1, P2 / schema-
dependent) and data-quality dependencies.

**Key findings**:

- **6 hard constraints (HC1-HC5 fully counted + HC6 specialty)** — all have full + delta coverage.
  A separate "HC6 locked-slot" skeleton exists in the full-score loop but is intentionally not
  counted (lock enforcement is via solver movability / `lockedSlotIds`).
- **9 soft constraints (SC1-SC9)** — all have full + delta coverage. SC1 was missing delta coverage
  in the past and was fixed in K22-D.
- **1 perturbation (MIN_PERT)** — full + delta coverage. Isolated in F4/F6/F8 harness via
  3rd-position `originalAssignments`.
- **K22-C Harness A-I**: 60 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO (per F8 commit `ceb9bc7`).
- **Default snapshot**: `hardScore=0, softScore=-11, breakdown {SC2=1, SC3=1}` — **STABLE** after F8.
- **Severity summary**: HIGH=0, MEDIUM=1, LOW=2, INFO=6, NONE=1, **BLOCKING=NO**.
- **Penalty scale**: 11 hardcoded constants. -1000 for hard, -1 to -20 for soft, -2 for MIN_PERT.
  All hardcoded (MEDIUM finding carried over from K22-A-C-1 / K22-E-F-1).
- **P0 / new-business constraints are complete** (SC5, SC8, SC9, HC6, SC6, SC7).
  4 P1 candidates and 3 P2 candidates remain. All require read-only pre-work before implementation.

**Recommended next stage**: any of:
1. `K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT` (read-only, addresses P1 lab matching feasibility)
2. `K22-I-SCORE-WEIGHTS-AUDIT` (read-only, addresses MEDIUM hardcoded penalty constants)
3. `K22-F10-P1-AUDIT` (read-only, evaluates the 4 P1 candidates for overlap and priority)

---

## 2. Current Constraint Inventory

`src/lib/scheduler/score.ts` implements the following scoring segments (after K22-F8):

```
calculateScoreWithDetails (line 304-643):
  - HC1/HC2/HC3: pairwise O(n^2) check (room / teacher / class conflict)
  - HC4: capacity overflow
  - HC5: room unavailability
  - HC6: locked-slot skeleton (intentionally not counted)
  - SC1: cross-building back-to-back
  - SC2: same-day multi-session
  - SC3: extreme time slot
  - SC4: cross-campus commute
  - MIN_PERT: minimum perturbation
  - HC6 (specialty): non-automotive forbid Linxiao
  - SC6: automotive prefers Linxiao
  - SC7: weekend avoidance
  - SC5: teacher day balance
  - SC8: class gap reduction
  - SC9: teaching task room stability

calculateDeltaScore (line 656-927):
  - HC1/HC2/HC3: O(n) per-other iteration with old/new conflict deltas
  - HC4: old/new room capacity check
  - HC5: old/new room availability check
  - HC6 (specialty): old/new Linxiao check
  - SC1: mirror full-score detection with pair (newPenalty - oldPenalty)
  - SC2: per-sibling count delta
  - SC3: old/new slotIndex >= 5 check
  - SC4: per-sibling cross-campus delta
  - MIN_PERT: wasMoved / nowMoved flip
  - SC6: old/new Linxiao soft check
  - SC7: old/new weekend check
  - SC5: affected teacher aggregate penalty
  - SC8: affected (classGroup, day) aggregate penalty
  - SC9: affected teachingTask aggregate penalty
```

**Total**:
- 5 fully counted hard constraints (HC1-HC5)
- 1 hard constraint with skeleton-not-counted branch (HC6 specialty)
- 1 hard constraint skeleton for "locked slot" (intentional, not counted)
- 9 soft constraints (SC1-SC9)
- 1 perturbation (MIN_PERT)
- 1 `expandWeeks`-based week-overlap helper (`hasWeekOverlap`) shared by HC1/HC2/HC3
- 1 building-inference helper (`getBuilding` + `inferBuilding`) used by SC1
- 3 aggregate-constraint helpers (`buildTeacherDailyCounts` + `computeTeacherDayBalancePenalty`,
  `buildClassDayPeriods` + `computeClassGapPenalty`, `buildTaskRoomSet` +
  `computeTaskRoomStabilityPenalty`) shared by full + delta

---

## 3. Hard Constraints Table

| ID | Name | Code name | Penalty | Full | Delta | Helper / shared | Stage | Risk | Notes |
|---|---|---|---:|:---:|:---:|---|---|---|---|
| **HC1** | 教室冲突 | `HC1_ROOM_CONFLICT` | -1000 | ✅ | ✅ | `hasWeekOverlap` (uses `weekSetCache`) | PRE | NONE | Pairwise O(n^2) full; O(n) per-other delta. |
| **HC2** | 教师冲突 | `HC2_TEACHER_CONFLICT` | -1000 | ✅ | ✅ | `hasWeekOverlap` | PRE | NONE | `teacherId == null` skips. |
| **HC3** | 班级冲突 | `HC3_CLASS_CONFLICT` | -1000 | ✅ | ✅ | `hasWeekOverlap` | PRE | NONE | Nested loop over `taskClasses` (handles merged-class). |
| **HC4** | 容量超限 | `HC4_CAPACITY` | -1000 | ✅ | ✅ | `getTaskStudentCount` (capacity.ts) | PRE | NONE | Defensive `roomById.get` check. |
| **HC5** | 教室不可用 | `HC5_ROOM_UNAVAILABLE` | -1000 | ✅ | ✅ | `isRoomAvailable` | PRE | NONE | Returns `false` when room not in `roomById`. F8 pre-populates room 0 as UNSCHEDULED in tests. |
| **HC6** | 林校教室限制 | `HC6_NON_AUTOMOTIVE_FORBID_LINXIAO` | -1000 | ✅ | ✅ | `classifySpecialty` + `isLinxiaoRoomName` + `computeHC6Penalty` | K22-F3 | LOW | 5-class specialty classification. classGroup membership is primary; courseName/remark auxiliary. |
| (skeleton) | 锁定课程被移动 | n/a | n/a | ❌ skeleton | ❌ skeleton | n/a | PRE | INFO | Code skeleton exists in full-score loop but does not score. Lock enforced via solver movability / `lockedSlotIds`. Intentional. |

**Key observations**:
- HC1-HC5 and HC6 specialty all have full + delta coverage.
- The locked-slot skeleton is **intentional non-scoring**, documented inline in the delta path
  ("HC6 is intentionally not counted in delta scoring because full scoring
  (calculateScoreWithDetails) currently does not count HC6").
- HC1/HC2/HC3 use the same `hasWeekOverlap` helper, so drift risk is eliminated.

---

## 4. Soft Constraints Table

| ID | Name | Code name | Penalty | Full | Delta | Helper / shared | Stage | Risk | Notes |
|---|---|---|---:|:---:|:---:|---|---|---|---|
| **SC1** | 跨楼栋连续课 | `SC1_CROSS_BUILDING_BACK_TO_BACK` | -5 | ✅ | ✅ (K22-D) | `getBuilding` + `inferBuilding` | PRE (full), K22-D (delta) | NONE | K22-D added SC1 delta logic; A.2 serves as regression guard. |
| **SC2** | 同天多节 | `SC2_SAME_DAY` | -10 | ✅ | ✅ | inline (full uses `taskDayCount` map; delta iterates `slotsByTask` siblings) | PRE | NONE | A.1 verifies full = delta. |
| **SC3** | 极端时间 | `SC3_EXTREME_TIME_SLOT` | -1 | ✅ | ✅ | direct check (`slotIndex >= 5`) | PRE | NONE | Lightest soft penalty. Default snapshot includes 1 SC3. |
| **SC4** | 跨校区通勤 | `SC4_CROSS_CAMPUS` | -5 | ✅ | ✅ | inline (full and delta symmetric) | PRE | LOW | Uses `Room.building` only (no `inferBuilding` fallback). Semantic difference from SC1. |
| **SC5** | 教师每日课时负载均衡 | `SC5_TEACHER_DAY_BALANCE` | -3 | ✅ | ✅ | `buildTeacherDailyCounts` + `computeTeacherDayBalancePenalty` | K22-F4 | NONE | Aggregate per teacher. Delta uses excludeSlotId + overrideDay. Harness G uses 3rd-position originalAssignments. |
| **SC6** | 汽车专业优先林校 | `SC6_AUTOMOTIVE_PREFERS_LINXIAO` | -20 | ✅ | ✅ | `classifySpecialty` + `isLinxiaoRoomName` + `computeSC6Penalty` | K22-F3 | NONE | Companion to HC6. Largest soft penalty. |
| **SC7** | 周末一般不排课 | `SC7_WEEKEND_AVOIDANCE` | -15 | ✅ | ✅ | direct check (`day >= 6`) | K22-F3 | NONE | Heavy penalty. Default snapshot does not trigger. |
| **SC8** | 班级空洞减少 | `SC8_CLASS_GAP` | -2 | ✅ | ✅ | `buildClassDayPeriods` + `computeClassGapPenalty` | K22-F6 (F6A isolation) | NONE | Aggregate per (classGroup, day). Merged-class tasks count once per classGroup. Harness H uses 3rd-position originalAssignments + component-level assertion. |
| **SC9** | 教室稳定性 | `SC9_TEACHING_TASK_ROOM_STABILITY` | -2 | ✅ | ✅ | `buildTaskRoomSet` + `computeTaskRoomStabilityPenalty` | K22-F8 (F8A isolation) | NONE | Aggregate per teachingTask. Task-level (not expanded to classGroup). Harness I uses 3rd-position originalAssignments + component-level assertion. |

---

## 5. MIN_PERT Summary

| ID | Name | Code name | Penalty | Full | Delta | Helper | Stage | Risk | Notes |
|---|---|---|---:|:---:|:---:|---|---|---|---|
| **MIN_PERT** | 最小扰动 | `MINIMUM_PERTURBATION` | -2 | ✅ | ✅ | direct comparison (`assignment` vs `originalAssignments`) | PRE | NONE | Both paths compare against `originalAssignments`. The 3rd-position `originalAssignments` trick in F4/F6/F8 harness isolates SC5/SC8/SC9 contribution by making MIN_PERT net 0. |

---

## 6. Full / Delta Consistency Audit

| Constraint | Shared helper | Aggregate? | Affected keys per move | Drift risk | Notes |
|---|---|---|---:|---|---|
| HC1 / HC2 / HC3 | `hasWeekOverlap` | No (per-pair) | All other slots (O(n)) | NONE | Same `hasWeekOverlap` in both paths. |
| HC4 | `getTaskStudentCount` | No (per-slot) | 1 (moved slot) | NONE | Reads old and new room from `roomById`. |
| HC5 | `isRoomAvailable` | No (per-slot) | 1 (moved slot) | NONE | Returns `false` when room not in `roomById`. F8 wrapper pre-populates room 0. |
| HC6 (specialty) | `classifySpecialty` + `computeHC6Penalty` | No (per-slot) | 1 (moved slot) | NONE | `classifySpecialty` depends only on task, stable. |
| SC1 | `getBuilding` + `inferBuilding` | No (per-pair) | All other slots | NONE (post K22-D) | K22-D added mirror logic. |
| SC2 | inline | No (per-task) | `≤ slotsByTask.size` | NONE | Iterates siblings in both paths. |
| SC3 | direct check | No (per-slot) | 1 (moved slot) | NONE | Trivial. |
| SC4 | inline | No (per-task) | `≤ slotsByTask.size` | NONE | Symmetric in both paths. |
| SC5 | `buildTeacherDailyCounts` + `computeTeacherDayBalancePenalty` | Yes (per-teacher) | 1 (teacher of moved slot) | NONE | F4 shared helper. |
| SC6 | `classifySpecialty` + `computeSC6Penalty` | No (per-slot) | 1 (moved slot) | NONE | Companion to HC6. |
| SC7 | direct check | No (per-slot) | 1 (moved slot) | NONE | Trivial. |
| SC8 | `buildClassDayPeriods` + `computeClassGapPenalty` | Yes (per (cg, day)) | `≤ 2 * taskClasses.length` | NONE | F6A shared helper. |
| SC9 | `buildTaskRoomSet` + `computeTaskRoomStabilityPenalty` | Yes (per teachingTask) | 1 | NONE | F8 shared helper. |
| MIN_PERT | direct comparison | No (per-slot) | 1 (moved slot) | NONE | Both paths compare against `originalAssignments`. |

**Observations**:

- All 3 aggregate constraints (SC5, SC8, SC9) use **shared helpers** between full and delta.
  This eliminates drift risk: any change to aggregation logic automatically applies to both paths.
- All 3 aggregate constraints use the **exclude-and-override** pattern (the F3/F4/F6/F8 standard):
  `excludeSlotId` to skip the moved slot in the base scan, then `overrideDay` / `overrideRoomId`
  to inject the moved slot at its old or new position.
- No `expandWeeks`-related drift detected. `weekSetCache` is shared by full and delta.
- No early-SC1-delta-missing-style regression risk: A.2 case in Harness A guards SC1 delta.
- The locked-slot skeleton (intentionally not scored) is consistent between full and delta (both
  do not score it).

---

## 7. K22-C Harness A-I Coverage Summary

| Harness | Scope | Cases (approx / canonical) | Component-level assertion | MIN_PERT isolated | Origin | Notes |
|---|---|---:|:---:|:---:|---|---|
| **A** | Full / Delta consistency (SC1, SC2, SC3, SC4, MIN_PERT) | ~6 | ❌ | ❌ | K22-C (A.2 updated K22-D) | A.1 (SC2), A.2 (SC1 regression guard), etc. A.2 deliberately tests SC1 + MIN_PERT joint effect. |
| **B** | HC1-HC5 hard invariant | ~6 | ❌ | ❌ | K22-C | Each hard constraint verified against baseline with no soft noise. |
| **C** | Default score snapshot regression | 2 | ❌ | ❌ | K22-C | Asserts `hardScore=0, softScore=-11, SC2=1, SC3=1`. Also writes `docs/k22-score-default-snapshot.json`. |
| **D** | Fixed-seed solver smoke (LAHC end-to-end) | ~4 | ❌ | ❌ | K22-C | Runs `solve()` with a fixed seed. |
| **E** | K21 Config Regression (static delegation) | ~3 | ❌ | ❌ | K22-C | Smoke-checks SchedulingConfig flow (K21-FIX-F/G). |
| **F** | Specialty campus weekend (HC6 / SC6 / SC7) | 11 | ✅ | ✅ | K22-F3 | Isolated fixtures (Linxiao keyword, automotive keyword, weekend day). 3rd-position originalAssignments. |
| **G** | SC5 teacher day balance | 9 (6 full + 3 delta) | ❌ | ✅ | K22-F4 | Distributions: 1,1,1,1 / 1,1,1,2 / 1,1,2,2 / 1,2 / 1,2,3 / 1,1,2. |
| **H** | SC8 class gap reduction (F6A isolated) | 12 (8 full + 4 delta) | ✅ | ✅ | K22-F6 / F6A | teacherId=null (SC5 skip), 1 slot per task (SC2 skip), periods < 5 except H4/H6/H8 (SC3 expected). Component-level assertion: total soft + SC8 details count + sum. |
| **I** | SC9 classroom stability (F8A isolated) | 11 (7 full + 4 delta) | ✅ | ✅ | K22-F8 | teacherId=null, single task with multiple slots, weekday-only for delta, 3rd-position originalAssignments, room 0 pre-populated as UNSCHEDULED. Component-level assertion: total soft + SC9 details count + sum. |

**Canonical total** (per F8 commit `ceb9bc7`):

```
PASS:       60
KNOWN_FAIL: 0
FAIL:       0
INFO:       0
BLOCKING:   NO
```

**Component-level assertion** is used in 3 of 9 sections: F (HC6/SC6/SC7), H (SC8), I (SC9).

**MIN_PERT isolation via 3rd-position originalAssignments** is used in 4 of 9 sections: F, G, H, I.
This is the standard F3/F4/F6/F8 isolation pattern.

**Per-section note**: Sum of per-section approximations (~64) may exceed the canonical 60
because some A/B inner cases are conditional branches that may not fire in every run. The
canonical 60 is the trusted anchor; F9 does not re-run K22-C.

---

## 8. Default Snapshot Status

`docs/k22-score-default-snapshot.json` (read by F9 script):

```json
{
  "generatedAt": "2026-06-06T06:51:11.620Z",
  "phase": "K22-C-SCORE-REGRESSION-HARNESS-IMPLEMENTATION",
  "fixture": {
    "description": "deterministic synthetic fixture: 3 rooms (A/B/C), 3 tasks, 4 slots; perturbed state for MIN_PERT",
    "rooms": 3, "tasks": 3, "slots": 4,
    "buildings": ["A", "B", "C"]
  },
  "snapshot": {
    "hardScore": 0,
    "softScore": -11,
    "detailsCount": 2,
    "constraintBreakdown": { "SC2_SAME_DAY": 1, "SC3_EXTREME_TIME_SLOT": 1 }
  },
  "stability": "Stable if score.ts penalties unchanged. K22-D dynamic weights would change this; regenerate with test config."
}
```

**Status**: **STABLE**.

| Metric | Expected | Actual | Match |
|---|---:|---:|:---:|
| `hardScore` | 0 | 0 | ✅ |
| `softScore` | -11 | -11 | ✅ |
| `SC2_SAME_DAY` | 1 | 1 | ✅ |
| `SC3_EXTREME_TIME_SLOT` | 1 | 1 | ✅ |

**Why SC5 / SC6 / SC7 / SC8 / SC9 do not fire** on the default fixture (3 rooms, 3 tasks, 4 slots):

- **SC5**: requires `teacherId != null` and `total >= 3` lessons. Default fixture has tasks with
  teacherId but only 4 slots total spread across 3 tasks, so the affected teacher has at most 1-2
  lessons; SC5_MIN_TOTAL (3) is not met.
- **SC6 / HC6 (specialty)**: requires Linxiao keyword in room.name / room.building. Default
  fixture has buildings A/B/C with no Linxiao room.
- **SC7**: requires `dayOfWeek >= 6`. Default fixture is weekday-only.
- **SC8**: requires a classGroup with 2+ periods on the same day AND a gap. Default fixture
  has no such pattern.
- **SC9**: requires a teachingTask with 2+ distinct rooms in [1..5]. Default fixture has each
  task in only 1 room.

**Conclusion**: Default snapshot remains the canonical regression anchor in K22-C Harness C.
Any future change to score.ts that alters `hardScore`, `softScore`, or breakdown is **HIGH /
BLOCKING** until explained.

---

## 9. Penalty / Weight Scale Audit

All 11 penalty constants are hardcoded in `src/lib/scheduler/score.ts:16-26`:

| Constant | Value | File:line | Configurable? |
|---|---:|---|:---:|
| `HARD_PENALTY` | -1000 | score.ts:16 | ❌ |
| `SOFT_SC1_CROSS_BUILDING` | -5 | score.ts:17 | ❌ |
| `SOFT_SC2_SAME_DAY` | -10 | score.ts:18 | ❌ |
| `SOFT_SC3_EXTREME_TIME` | -1 | score.ts:19 | ❌ |
| `SOFT_SC4_CROSS_CAMPUS` | -5 | score.ts:20 | ❌ |
| `SOFT_MINIMUM_PERTURBATION` | -2 | score.ts:21 | ❌ |
| `HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY` | -1000 | score.ts:22 | ❌ |
| `SC6_AUTOMOTIVE_NON_LINXIAO_PENALTY` | -20 | score.ts:23 | ❌ |
| `SC7_WEEKEND_PENALTY` | -15 | score.ts:24 | ❌ |
| `SC8_CLASS_GAP_PENALTY_PER_EMPTY_PERIOD` | -2 | score.ts:25 | ❌ |
| `SC9_TEACHING_TASK_ROOM_STABILITY_PENALTY_PER_EXTRA_ROOM` | -2 | score.ts:26 | ❌ |

**Observations**:

- **Hard penalties are uniform at -1000** (HC, HC6 specialty). This is conventional and works
  with LAHC's hard-first rejection.
- **Soft penalties range from -1 (SC3) to -20 (SC6)**: 20x ratio. SC6 dominates the soft score
  when active.
- **SC8 and SC9 are both at -2 per unit** (per gap / per extra room). This matches the
  recommendation in K22-F5 / K22-F7 audits (low per-unit penalty, scale up by count).
- **MIN_PERT is at -2 per moved slot**, the same unit as SC8 / SC9 base.
- **No weighted aggregation**: all penalties are fixed scalars; the only "aggregation" is
  per-key summation (SC5 per teacher, SC8 per (cg, day), SC9 per task).
- **No configurable weights**: `SchedulingConfig` has no `hardWeights` / `softWeights` field.
  All weights are baked into score.ts at compile time.

**Recommendation**: Before adding any more soft constraints, consider whether a weights
audit is needed. SC6 (-20) is much larger than typical soft constraints (-2 to -15). If a
future constraint is added at, say, -10, the relative balance will shift.

**Suggestion**: Open stage `K22-I-SCORE-WEIGHTS-AUDIT` (read-only) to evaluate how weights
could be exposed via `SchedulingConfig` without yet implementing schema changes. This is
**MEDIUM** priority (carried over from K22-A-C-1 / K22-E-F-1).

---

## 10. Remaining Roadmap

| ID | Name | Data ready | Schema | Complexity | Priority | Recommended stage | Notes |
|---|---|:---:|:---:|---|---|---|---|
| NEW-SC-04 | 实训课 / 机房课匹配 | ❌ | ⚠️ | HIGH | P1 | K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT (read-only pre-work) | Room.type is NORMAL for all 53 rooms; Course has no type field. Audit needed. |
| NEW-SC-05 | 大班优先大教室 | ✅ | ✅ | MEDIUM | P1 | K22-F10 audit | Data ready; competition with HC4 needs careful design. |
| NEW-SC-06 | 同班连续课少切换 | ✅ | ✅ | MEDIUM | P1 | K22-F10 audit | Likely already partially covered by SC8 + SC4. |
| NEW-SC-07 | 教师半天集中 | ✅ | ✅ | LOW | P1 | K22-F10 audit | Related to SC5. Audit before implementation. |
| NEW-SC-08 | 教师午休 / 晚课偏好 | ❌ | ⚠️ | HIGH | P2 | K22-H-SCHEMA-PLAN (planning only) | Requires TeacherPreference model. |
| NEW-SC-09 | 周一早课 / 周五晚课偏好 | ❌ | ⚠️ | MEDIUM | P2 | K22-H-SCHEMA-PLAN | Requires `SchedulingConfig.preferences` JSON. |
| NEW-SC-10 | 行政班固定教室 | ❌ | ⚠️ | MEDIUM | P2 | K22-H-SCHEMA-PLAN | Requires `ClassGroup.homeRoomId` FK. |

**P0 (DONE)**: SC5 (K22-F4), SC8 (K22-F6/F6A), SC9 (K22-F8), HC6 specialty, SC6, SC7 (K22-F3).
K22-F series soft-constraint work is complete.

**P1 candidates (4)**: All require a feasibility / overlap audit before any implementation.
NEW-SC-04 has data-quality blockers; the other 3 have data but need to confirm no overlap
with existing constraints.

**P2 / schema-dependent (3)**: All require schema work. K22-H-SCHEMA-PLAN should be opened
as a planning-only stage before any migration.

**Priority recommendation**:

1. **If data quality is the bottleneck**: open `K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT` first.
2. **If solver tuning is the bottleneck**: open `K22-I-SCORE-WEIGHTS-AUDIT` to evaluate
   `hardWeights` / `softWeights` introduction.
3. **If more P1 constraints are desired**: open `K22-F10-P1-AUDIT` to evaluate the 4
   P1 candidates.

Do **NOT** directly implement any P1 or P2 constraint without prior read-only audit.

---

## 11. Data Quality Dependencies

| ID | Topic | Current state | Downstream blocker | Severity | Recommended stage |
|---|---|---|---|---|---|
| DQ-01 | Room.type underutilized | All 53 rooms have `type=NORMAL`. Room.type is in schema but admin form does not expose it. | NEW-SC-04 (lab matching) cannot determine specialty vs NORMAL rooms. | MEDIUM | K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT |
| DQ-02 | Room.building null for most rooms | 50 of 53 rooms have `building=null`. `inferBuilding(name)` provides fallback for SC1 only; SC4 does not use fallback. | SC4 trigger rate is artificially low. Cross-campus detection only fires when building is explicitly set. | LOW | K22-dataquality-building-audit (not yet scheduled) |
| DQ-03 | Course.type not modeled | Course model has no structured type field. Python parser has 实训/实验/机房/上机 regex but result is not persisted. | NEW-SC-04 cannot distinguish theory vs practice vs lab courses at score time. | MEDIUM | K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT |
| DQ-04 | automotive / Linxiao keyword dependency | Detection is purely by name/building keyword. classGroup.name contains 汽车/车辆/新能源/智能网联/汽修; room.name contains 林校. | If 教务处 renames a classGroup or moves a room, classification silently breaks. | INFO | Future: add structured fields (ClassGroup.specialty enum, Room.campus enum) when schema migration happens. |
| DQ-05 | Teacher preference not modeled | Teacher has only name/phone/email. No time-slot preference field. | NEW-SC-08 (teacher preference) cannot be implemented without schema work. | INFO | K22-H-SCHEMA-PLAN |
| DQ-06 | ClassGroup.homeRoomId not modeled | ClassGroup has no homeRoomId field. | NEW-SC-10 (home room preference) cannot be implemented without schema work. | INFO | K22-H-SCHEMA-PLAN |

**F9 read-only DB inspection** (current dev.db):

```
ClassGroup:   36
Teacher:      84
Course:       104
Room:         53
ScheduleSlot: 440
TeachingTask: 308
Room.type distribution: {"NORMAL": 53}
Room.building null: 50 / 53
```

Note: CLAUDE.md reports 37 ClassGroups / 123 Courses, but the current dev.db read shows 36 / 104.
This may be due to a partial reset / partial seeding state. F9 does not modify DB.

---

## 12. Findings Summary

| ID | Severity | Category | Title |
|---|:---:|---|---|
| F9-A-1 | INFO | A. K22-C summary status | K22-C Harness A-I is at 60 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO (per F8 commit) |
| F9-B-1 | INFO | B. Default snapshot stability | Default snapshot is stable: hardScore=0 / softScore=-11 / SC2=1 / SC3=1 |
| F9-C-1 | INFO | C. New-constraint harness coverage | All 6 new constraints (SC5, SC6, SC7, SC8, SC9, HC6) are covered by K22-C Harness A-I |
| F9-D-1 | INFO | D. Aggregate constraint delta consistency | SC5 / SC8 / SC9 use affected-key local computation in delta path |
| F9-E-1 | LOW | E. Building inference inconsistency (carried over) | SC1 uses getBuilding() fallback, SC4 only uses Room.building — LOW remains |
| F9-F-1 | MEDIUM | F. Penalty constants hardcoded (carried over) | Penalty constants are still hardcoded — not yet on K22-WEIGHTS-ROADMAP |
| F9-G-1 | NONE | G. P0 / new-business constraints complete | P0 (SC5/SC8/SC9) + new business (HC6/SC6/SC7) all complete and stable |
| F9-H-1 | INFO | H. P1 candidates need audit before implementation | 4 P1 soft constraints remain — none should be implemented without prior audit |
| F9-I-1 | INFO | I. P2 candidates require schema work | 3 P2 soft constraints need schema planning before implementation |
| F9-J-1 | LOW | J. Data quality for K22-G | Room.type / Course.type data quality blocks K22-G (lab matching) |

**Severity summary**: HIGH=0, MEDIUM=1, LOW=2, INFO=6, NONE=1, **BLOCKING=NO**.

The single MEDIUM (F9-F-1) is the carried-over "penalty constants hardcoded" finding. It is a
productization concern, not a correctness bug. K22-A-C-1 (first flagged it) and K22-E-F-1
(re-confirmed it) are both resolved by opening a `K22-I-SCORE-WEIGHTS-AUDIT` stage.

The two LOW findings (F9-E-1, F9-J-1) are non-blocking and well-documented.

---

## 13. Recommended Next Stage

F9 offers three read-only next stages (per spec). F9 does **NOT** recommend direct implementation
of any P1 or P2 constraint.

### Option A: `K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT` (preferred)

- **Scope**: Read-only audit of `Room.type` / `Course.type` / 实训课 / 机房课 matching feasibility.
  - Survey regex accuracy for 实训/实验/机房/上机 across all 104+ courses.
  - Sample misclassified courses.
  - Propose admin form extension to expose `Room.type`.
  - Propose `Course.type` field design (enum vs string).
  - Output: data backfill strategy, accuracy stats, schema migration plan (no migration yet).
- **Rationale**: K22-G (lab matching) is the main P1 candidate. It has data-quality blockers
  that must be addressed first. A read-only audit establishes the baseline.
- **Estimated effort**: LOW (audit only).

### Option B: `K22-I-SCORE-WEIGHTS-AUDIT`

- **Scope**: Read-only audit of how `hardWeights` / `softWeights` could enter
  `SchedulingConfig` without yet implementing schema changes.
  - Survey current 11 penalty constants and their relative magnitudes.
  - Identify which weights should be configurable per school / per semester.
  - Propose `SchedulingConfig` schema extension (no migration yet).
  - Propose `score.ts` refactor strategy (caller / cache / eval order).
  - Output: design doc, regression-anchor changes needed.
- **Rationale**: F9-F-1 (MEDIUM) is unaddressed. Weights audit is a separate refactor track
  from soft-constraint additions.
- **Estimated effort**: LOW (audit only).

### Option C: `K22-F10-P1-AUDIT`

- **Scope**: Read-only feasibility / overlap audit of 4 P1 candidates (NEW-SC-04, 05, 06, 07).
  - For each: data readiness, complexity, expected penalty scale, overlap with existing
    constraints.
  - For NEW-SC-04: also check whether K22-G data-quality audit has been completed.
  - For NEW-SC-06: confirm whether SC8 + SC4 already cover the signal.
  - For NEW-SC-07: confirm whether SC5 already covers the signal.
  - Output: ranked implementation order (if any), with regression anchor design.
- **Rationale**: Per F9-H-1, no P1 constraint should be implemented without prior audit. This
  audit is the prerequisite to any F10+ implementation stage.
- **Estimated effort**: LOW (audit only).

### Final recommendation

Open **Option A** (`K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT`) first, since it unblocks the highest-value
P1 (lab matching). Then run **Option C** (`K22-F10-P1-AUDIT`) to evaluate the other 3 P1
candidates. **Option B** (`K22-I-SCORE-WEIGHTS-AUDIT`) can be opened in parallel as a separate
refactor track; it does not block soft-constraint additions.

F9 is a read-only summary; it does **NOT** prescribe direct implementation. The
recommendation is a planning step.

---

## 14. Verification Results

| Command | Result | Notes |
|---|---|---|
| `npx tsx scripts/audit-score-constraint-summary-k22-f9.ts` | **PASS** — HIGH=0 / MEDIUM=1 / LOW=2 / INFO=6 / NONE=1 / BLOCKING=NO | Default snapshot stable. |
| `npx tsx scripts/verify-classroom-stability-constraint-k22-f8.ts` | (per F8) 12/12 PASS | (verified before F9) |
| `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | (per F8 commit `ceb9bc7`) 60 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO | Canonical K22-C baseline. F9 does not re-run. |
| `npx tsx scripts/audit-classroom-stability-constraint-k22-f7.ts` | (per F7) HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO | F9-D-1 confirms SC9 helper patterns. |
| `npx tsx scripts/verify-class-gap-reduction-constraint-k22-f6.ts` | (per F6A) 12/12 PASS | (verified before F9) |
| `npx tsx scripts/audit-class-gap-reduction-constraint-k22-f5.ts` | (per F5) HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO | Roadmap P0 reference. |
| `npx tsx scripts/verify-teacher-day-balance-constraint-k22-f4.ts` | (per F4) 13/13 PASS | (verified before F9) |
| `npx tsx scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` | (per F3) 16/16 PASS | (verified before F9) |
| `npx tsx scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts` | (per F2) HIGH=0, BLOCKING=NO | (verified before F9) |
| `npx tsx scripts/audit-soft-constraints-roadmap-k22-e.ts` | (per K22-E) HIGH=0/MEDIUM=3/LOW=1/INFO=2/NONE=0, BLOCKING=NO | P0/P1/P2 baseline. |
| `npx tsx scripts/verify-score-delta-sc1-fix-k22-d.ts` | (per K22-D) 6/6 PASS | (verified before F9) |
| `npx tsx scripts/audit-score-constraint-inventory-k22-a.ts` | (per K22-A) HIGH=0/MEDIUM=1/LOW=1/INFO=3/NONE=3, BLOCKING=NO | Initial inventory baseline. |
| `npx tsx scripts/plan-score-regression-harness-k22-b.ts` | (per K22-B) PASS | (verified before F9) |
| `npx tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | (per K21-FIX-G) 22/0 PASS | (verified before F9) |
| `npx tsx scripts/verify-solver-config-api-k21-fix-f.ts` | (per K21-FIX-F) 27/0 PASS | (verified before F9) |
| `npx tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | (per K21-FIX-F) 16/0 PASS | (verified before F9) |
| `npx tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | (per K21-FIX-F) 19/0 PASS | (verified before F9) |
| `npx tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH=0 / MEDIUM=0 | (verified before F9) |
| `npx tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | BLOCKING=NO | (verified before F9) |
| `npx tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23/0 PASS | (verified before F9) |
| `npx prisma validate` | valid | (verified before F9) |
| `npm run build` | PASS | (verified before F9) |
| `npm run lint` | 314 problems (180 errors + 134 warnings), 0 new | (verified before F9) |
| `npm run test:auth-foundation` | 53 passed / 1 failed (pre-existing) | Pre-existing `ScheduleAdjustment ACTIVE count mismatch`. |

F9 itself re-ran only the F9 audit script + read-only DB inspection. Other commands are
re-stated for the report (F9 does not modify their results).

---

## 15. Unmodified Scope Confirmation

K22-F9-SCORE-CONSTRAINT-SUMMARY-AUDIT is a read-only summary. It **did not modify** any of:

- `src/lib/scheduler/score.ts`
- `src/lib/scheduler/solver.ts`
- `src/lib/scheduler/types.ts`
- `scripts/verify-score-regression-harness-k22-c.ts`
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `prisma/dev.db`
- `src/lib/scheduler/capacity.ts`
- Scheduler config API / UI
- Frontend (any)
- API routes (any)
- Importer / parser
- RBAC / permissions
- Seed scripts
- Business data (read-only DB inspection only)
- hardWeights / softWeights (not introduced)
- Any soft constraint (SC1-SC9) implementation
- Any hard constraint (HC1-HC6) implementation
- Any harness logic (K22-C is read-only)

K22-F9 only **added** three files:

- `scripts/audit-score-constraint-summary-k22-f9.ts` (new)
- `docs/k22-score-constraint-summary-audit.md` (this file)
- `docs/k22-score-constraint-summary-audit.json` (new)

---

## 16. Closing Note

K22-F9-SCORE-CONSTRAINT-SUMMARY-AUDIT 按 spec 完整执行：

- ✅ 新增只读 audit 脚本 (`scripts/audit-score-constraint-summary-k22-f9.ts`)
- ✅ 新增 Markdown 审计文档 (本文件)
- ✅ 新增 JSON 报告 (`docs/k22-score-constraint-summary-audit.json`)
- ✅ 明确 hard constraints: HC1-HC5 (full+delta 一致), HC6 specialty (full+delta 一致), HC6 locked-slot skeleton (intentionally not scored)
- ✅ 明确 soft constraints: SC1-SC9 全部 full+delta 一致 (SC1 在 K22-D 修复)
- ✅ 明确 MIN_PERT (full+delta 一致; F4/F6/F8 harness 用 3rd-position originalAssignments 隔离)
- ✅ 明确 penalty constants: 全部硬编码 (carried-over MEDIUM F9-F-1)
- ✅ 明确 full/delta 覆盖: 一致 (3 aggregate constraints SC5/SC8/SC9 都用 shared helper + exclude-and-override)
- ✅ 明确 hardScore/softScore 分离: 清晰, 无混用
- ✅ 明确 K22-C Harness A-I: 9 sections, canonical 60/0/0/0
- ✅ 明确 default snapshot: 稳定 (hardScore=0, softScore=-11, SC2=1, SC3=1)
- ✅ 明确 remaining roadmap: P0 完成, 4 P1 candidates, 3 P2 candidates
- ✅ 明确 data quality dependencies: 6 items, 2 MEDIUM (Room.type / Course.type), 1 LOW (Room.building), 3 INFO
- ✅ 立即风险: HIGH=0; 1 MEDIUM (penalty hardcoded); 2 LOW (building inference, data quality)
- ✅ K22-F9 BLOCKING=NO
- ✅ 不修改任何业务代码 / 不写数据库 / 不改 score.ts / 不改 harness

**本阶段 (K22-F9) 可关闭. 推荐进入 K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT (preferred) 或 K22-I-SCORE-WEIGHTS-AUDIT 或 K22-F10-P1-AUDIT (均为只读审计, 不直接实现新约束).**
