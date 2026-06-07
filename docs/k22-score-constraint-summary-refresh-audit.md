# K22-F12 Score Constraint Summary Audit Refresh

| Field | Value |
|---|---|
| Phase | K22-F12-SCORE-CONSTRAINT-SUMMARY-AUDIT-REFRESH |
| Type | Read-only summary refresh (no Prisma writes, no score.ts modifications, no schema changes) |
| Generated | 2026-06-07 |
| Predecessor | K22-F11-CAPACITY-PREFERENCE-IMPL + K22-F11A-CAPACITY-PREFERENCE-DOC-AND-HARNESS-ALIGNMENT (commit `5e82388`) |
| Audit script | `scripts/audit-score-constraint-summary-refresh-k22-f12.ts` |
| JSON report | `docs/k22-score-constraint-summary-refresh-audit.json` |
| Project direction | K22-F12 — refresh of K22-F9 summary audit to confirm post-F11 + post-F11A state of the score system |

---

## 1. Executive Summary

K22-F12 is a read-only summary refresh. It does NOT implement any new constraint, does NOT
modify `score.ts`, does NOT change the schema, and does NOT add any new data path. It produces
a structured audit of the post-F11 + post-F11A state of the score system.

**Headline findings**:

- **6 hard constraints (HC1-HC5 fully counted + HC6 specialty)** — all have full + delta coverage.
- **10 soft constraints (SC1-SC10)** — all have full + delta coverage. SC1 was missing delta coverage
  pre-K22-D; that HIGH risk is RESOLVED.
- **1 perturbation (MIN_PERT)** — full + delta coverage. Isolated in F4/F6/F8/F11 harness via
  3rd-position `originalAssignments`.
- **K22-C Harness A-J**: 73 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO (canonical baseline confirmed).
  - Harness J (SC10, 13 cases) added in K22-F11 commit `3dd6945`.
  - F11A commit `5e82388` documented cross-harness fixture isolation policy.
- **Default snapshot**: `hardScore=0, softScore=-11, SC2_SAME_DAY=1, SC3_EXTREME_TIME_SLOT=1` — **STABLE**.
- **Penalty scale**: 11 hardcoded constants. SC6 (-20) is the largest soft penalty; intentionally
  dominates when SC6 + SC10 both fire.
- **Cross-harness fixture isolation policy** (F11A): documented in 4 places, in effect.

**Severity summary**: HIGH=0, MEDIUM=0, LOW=2, INFO=2, NONE=1, **BLOCKING=NO**.

**Recommended next stage** (any of three, no direct implementation):

1. `K22-I-SCORE-WEIGHTS-AUDIT` (preferred — addresses F12-D-1 LOW on hardcoded penalty constants)
2. `K22-G2-ROOM-TYPE-SCHEMA-PLAN` (preferred if specialty classroom is the goal)
3. `K22-ROADMAP-CLOSEOUT-AUDIT` (if K22 main goal is sufficient; closeout and move to other main lines)

---

## 2. Current Constraint Inventory (HC1-HC6 / SC1-SC10 / MIN_PERT)

### 2.1 Hard Constraints

| ID | Name | Code name | Penalty | Full | Delta | Shared helper | Stage | Risk |
|---|---|---|---:|:---:|:---:|---|---|---|
| **HC1** | 教室冲突 | `HC1_ROOM_CONFLICT` | -1000 | ✅ | ✅ | `hasWeekOverlap` | PRE | NONE |
| **HC2** | 教师冲突 | `HC2_TEACHER_CONFLICT` | -1000 | ✅ | ✅ | `hasWeekOverlap` | PRE | NONE |
| **HC3** | 班级冲突 | `HC3_CLASS_CONFLICT` | -1000 | ✅ | ✅ | `hasWeekOverlap` | PRE | NONE |
| **HC4** | 容量超限 | `HC4_CAPACITY` | -1000 | ✅ | ✅ | `getTaskStudentCount` | PRE | NONE |
| **HC5** | 教室不可用 | `HC5_ROOM_UNAVAILABLE` | -1000 | ✅ | ✅ | `isRoomAvailable` | PRE | NONE |
| **HC6** | 林校教室限制 | `HC6_NON_AUTOMOTIVE_FORBID_LINXIAO` | -1000 | ✅ | ✅ | `classifySpecialty + isLinxiaoRoomName + computeHC6Penalty` | K22-F3 | LOW |
| (skeleton) | 锁定课程被移动 | n/a | n/a | ❌ skeleton | ❌ skeleton | n/a | PRE (intentional) | INFO |

### 2.2 Soft Constraints

| ID | Name | Code name | Penalty | Full | Delta | Shared helper | Stage | Risk |
|---|---|---|---:|:---:|:---:|---|---|---|
| **SC1** | 跨楼栋连续课 | `SC1_CROSS_BUILDING_BACK_TO_BACK` | -5 | ✅ | ✅ | `getBuilding + inferBuilding` | PRE (full); K22-D (delta fix) | NONE |
| **SC2** | 同天多节 | `SC2_SAME_DAY` | -10 | ✅ | ✅ | inline | PRE | NONE |
| **SC3** | 极端时间 | `SC3_EXTREME_TIME_SLOT` | -1 | ✅ | ✅ | direct check | PRE | NONE |
| **SC4** | 跨校区通勤 | `SC4_CROSS_CAMPUS` | -5 | ✅ | ✅ | inline | PRE | LOW |
| **SC5** | 教师每日课时负载均衡 | `SC5_TEACHER_DAY_BALANCE` | -3 | ✅ | ✅ | `buildTeacherDailyCounts + computeTeacherDayBalancePenalty` | K22-F4 | NONE |
| **SC6** | 汽车专业优先林校 | `SC6_AUTOMOTIVE_PREFERS_LINXIAO` | -20 | ✅ | ✅ | `classifySpecialty + isLinxiaoRoomName + computeSC6Penalty` | K22-F3 | NONE |
| **SC7** | 周末一般不排课 | `SC7_WEEKEND_AVOIDANCE` | -15 | ✅ | ✅ | direct check | K22-F3 | NONE |
| **SC8** | 班级空洞减少 | `SC8_CLASS_GAP` | -2 | ✅ | ✅ | `buildClassDayPeriods + computeClassGapPenalty` | K22-F6 (K22-F6A isolation) | NONE |
| **SC9** | 教室稳定性 | `SC9_TEACHING_TASK_ROOM_STABILITY` | -2 | ✅ | ✅ | `buildTaskRoomSet + computeTaskRoomStabilityPenalty` | K22-F8 (K22-F8A isolation) | NONE |
| **SC10** | 教室容量利用率 | `SC10_ROOM_CAPACITY_UTILIZATION` | -2 (tight) / -1 (waste) | ✅ | ✅ | `computeSC10CapacityUtilizationPenalty` | K22-F11 (K22-F11A isolation) | NONE |

### 2.3 Perturbation

| ID | Name | Code name | Penalty | Full | Delta | Stage | Risk |
|---|---|---|---:|:---:|:---:|---|---|
| **MIN_PERT** | 最小扰动 | `MINIMUM_PERTURBATION` | -2 | ✅ | ✅ | PRE | NONE |

**Total**: 17 named constraints (6 hard + 10 soft + 1 perturbation-skipped locked-slot skeleton) + 1 perturbation.

---

## 3. Full / Delta Consistency

| Constraint | Shared helper | Aggregate vs per-slot | Affected keys per move | Drift risk | Notes |
|---|---|---|---|---|---|
| HC1, HC2, HC3 | `hasWeekOverlap` (uses `weekSetCache`) | per-pair | All other slots (O(n)) | NONE | Week-overlap logic shared. |
| HC4 | `getTaskStudentCount` (capacity.ts) | per-slot | 1 (moved slot) | NONE | Defensive `roomById.get` skip. |
| HC5 | `isRoomAvailable` | per-slot | 1 (moved slot) | NONE | F8 wrapper pre-populates room 0. |
| HC6 (specialty) | `classifySpecialty + isLinxiaoRoomName + computeHC6Penalty` | per-slot | 1 (moved slot) | NONE | `classifySpecialty` depends only on task. |
| SC1 | `getBuilding + inferBuilding` | per-pair | All other slots | NONE | K22-D added mirror logic. |
| SC2 | inline | per-task | ≤ slotsByTask.size | NONE | Symmetric in both paths. |
| SC3 | direct check | per-slot | 1 | NONE | Trivial. |
| SC4 | inline | per-task | ≤ slotsByTask.size | LOW (carried-over) | Asymmetric with SC1 (no inferBuilding fallback). |
| SC5 | `buildTeacherDailyCounts + computeTeacherDayBalancePenalty` | **aggregate per teacher** | 1 (teacher of moved slot) | NONE | Shared helper, F4 pattern. |
| SC6 | `classifySpecialty + computeSC6Penalty` | per-slot | 1 | NONE | Companion to HC6. |
| SC7 | direct check | per-slot | 1 | NONE | Trivial. |
| SC8 | `buildClassDayPeriods + computeClassGapPenalty` | **aggregate per (classGroup, day)** | ≤ 2 × classGroups.length | NONE | F6A shared helper. |
| SC9 | `buildTaskRoomSet + computeTaskRoomStabilityPenalty` | **aggregate per teachingTask** | 1 | NONE | F8A shared helper. |
| SC10 | `computeSC10CapacityUtilizationPenalty` | **per-slot (NOT aggregate)** | 1 (moved slot) | NONE | F11A O(1) per delta. |
| MIN_PERT | direct comparison | per-slot | 1 | NONE | Both paths compare vs `originalAssignments`. |

**Observations**:

- All 3 aggregate constraints (SC5, SC8, SC9) and 1 per-slot constraint (SC10) use **shared helpers**
  between full and delta. This eliminates drift risk by construction.
- All 3 aggregate constraints and SC10 use the **exclude-and-override** pattern.
- Per-slot constraints (HC1-HC6, SC1-SC4, SC6, SC7, MIN_PERT) are either per-pair or per-slot with
  O(1) or O(n) per-delta complexity.
- No early-SC1-delta-missing-style regression risk. SC1 is covered by A.2 regression guard.
- **10 of 10 soft constraints** and **6 of 6 hard constraints** are covered by K22-C regression
  harness (one or more sections).

---

## 4. K22-C Harness A-J Coverage Summary

| Harness | Scope | Cases | Component-assert | MIN_PERT iso | Origin |
|---|---|---:|:---:|:---:|---|
| **A** | Full / Delta consistency (SC1/SC2/SC3/SC4/MIN_PERT) | 5 | ❌ | ❌ | K22-C (A.2 updated K22-D) |
| **B** | HC1-HC5 hard invariant + separation | 6 | ❌ | ❌ | K22-C |
| **C** | Default score snapshot regression | 2 | ❌ | ❌ | K22-C |
| **D** | Fixed-seed solver smoke (LAHC end-to-end) | 2 | ❌ | ❌ | K22-C |
| **E** | K21 Config Regression (static delegation) | 2 | ❌ | ❌ | K22-C |
| **F** | Specialty campus weekend (HC6 / SC6 / SC7) | 11 | ✅ | ✅ | K22-F3 |
| **G** | SC5 teacher day balance | 9 | ❌ | ✅ | K22-F4 |
| **H** | SC8 class gap reduction (F6A isolated) | 12 | ✅ | ✅ | K22-F6 / K22-F6A (H8 surgical fixture update at F11A) |
| **I** | SC9 classroom stability (F8A isolated) | 11 | ✅ | ✅ | K22-F8 / K22-F8A |
| **J** | SC10 room capacity utilization (F11A isolated) | 13 | ✅ | ✅ | K22-F11 / K22-F11A |
| **TOTAL** | | **73** | 4 / 9 | 5 / 9 | |

**Component-level assertion** is used in 4 of 9 sections (F, H, I, J).

**MIN_PERT isolation via 3rd-position originalAssignments** is used in 5 of 9 sections (F, G, H, I, J).

**F11A fixture isolation**:

- **K22-C Harness H8** (SC8 multi-classGroup): `classGroupStudentCounts: [20, 20]` for merged task A, `[40]` for B, `[40]` for C. Keeps SC8 detection (gaps in (1,3) and (1,5)) while keeping utilization in 0.30-0.90 band (no SC10 fire).
- **F3 MIXED cases** (specialty campus weekend): `classGroupStudentCounts: [40, 40]` for `MIXED-LINXIAO`, `MIXED-NON_LINXIAO`, `DELTA-MIXED-NON_LINXIAO-TO-LINXIAO`. Keeps MIXED semantics while avoiding SC10 fire.

Both updates documented in code comments, impl doc, impl JSON, and harness JSON.

---

## 5. Default Snapshot Status

`docs/k22-score-default-snapshot.json` (re-verified at F12):

```json
{
  "hardScore": 0,
  "softScore": -11,
  "detailsCount": 2,
  "constraintBreakdown": { "SC2_SAME_DAY": 1, "SC3_EXTREME_TIME_SLOT": 1 }
}
```

**Status**: **STABLE**. Matches expected values.

### Why SC5 / SC6 / SC7 / SC8 / SC9 / SC10 do NOT fire on default fixture

| Constraint | Skip reason on default fixture |
|---|---|
| SC5 | Requires `teacherId != null` AND `total >= 3 weekday lessons`. Default fixture has 3 tasks with no teacher / single lessons, so teacher total < 3 (skip). |
| SC6 / HC6 | Requires Linxiao keyword in `room.name` / `room.building`. Default fixture rooms A/B/C have no Linxiao keyword (skip). |
| SC7 | Requires `dayOfWeek >= 6`. Default fixture is weekday-only (skip). |
| SC8 | Requires classGroup with 2+ periods on same day AND a gap. Default fixture has no such pattern (skip). |
| SC9 | Requires teachingTask with 2+ distinct rooms in `[1..5]`. Default fixture has each task in only 1 room (skip). |
| SC10 | Requires `studentCount > 0` AND `capacity > 0` AND `utilization <= 1.0`. Default snapshot harness uses `classGroupStudentCounts: [30]` (not FALLBACK), so studentCount=30, util=30/50=0.60 (in band, no fire). |

---

## 6. Penalty Scale Refresh

| Constant | Value | File:line |
|---|---:|---|
| `HARD_PENALTY` | -1000 | score.ts:16 |
| `HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY` | -1000 | score.ts:22 |
| `SOFT_SC1_CROSS_BUILDING` | -5 | score.ts:17 |
| `SOFT_SC2_SAME_DAY` | -10 | score.ts:18 |
| `SOFT_SC3_EXTREME_TIME` | -1 | score.ts:19 |
| `SOFT_SC4_CROSS_CAMPUS` | -5 | score.ts:20 |
| `SC5_PENALTY_PER_EXCESS` (in-body) | -3 | score.ts:159 |
| `SC6_AUTOMOTIVE_NON_LINXIAO_PENALTY` | -20 | score.ts:23 |
| `SC7_WEEKEND_PENALTY` | -15 | score.ts:24 |
| `SC8_CLASS_GAP_PENALTY_PER_EMPTY_PERIOD` | -2 | score.ts:25 |
| `SC9_TEACHING_TASK_ROOM_STABILITY_PENALTY_PER_EXTRA_ROOM` | -2 | score.ts:26 |
| `SC10_CAPACITY_TIGHT_FIT_PENALTY` | -2 | score.ts:29 |
| `SC10_CAPACITY_WASTE_PENALTY` | -1 | score.ts:30 |
| `SOFT_MINIMUM_PERTURBATION` | -2 | score.ts:21 |

**Observations**:

- **Hard penalties** are uniform at -1000.
- **Soft penalties range from -1 (SC3) to -20 (SC6)**. 20x ratio.
- **SC6 (-20) is the largest soft penalty** and dominates when both SC6 and SC10 fire. This is
  intentional: SC6 enforces campus-wide specialty preference; SC10 is a per-slot tiebreaker.
- **All constants are hardcoded**. `SchedulingConfig` has no `hardWeights` / `softWeights`
  field. No `score preset` system.
- **Carried-over MEDIUM** (F12-D-1 LOW after F12 re-classification): the K22-A-C-1 / K22-E-F-1
  "penalty hardcoded" finding is re-affirmed. This is a productization concern, not a correctness
  bug. K22-I-SCORE-WEIGHTS-AUDIT is the recommended next step (read-only, no implementation).

**Penalty scale balance assessment**: Acceptable. SC6 / SC7 / SC2 / SC5 / SC8 / SC9 / SC10 have
intentional relative relationships. The penalty scale is not "obviously broken" — it is
productization-limited, not correctness-limited.

---

## 7. Cross-Harness Fixture Isolation Policy

**Documented in F11A**, **in effect**, **working as designed**.

### 7.1 Documented locations

1. `docs/k22-capacity-preference-constraint-impl.md` Section 9.5 "F11A Cross-Harness Fixture Isolation"
2. `docs/k22-capacity-preference-constraint-impl.json` `f11ACrossHarnessFixtureIsolation` field
3. `scripts/verify-score-regression-harness-k22-c.ts`: H8-MULTI-CLASSGROUP-MERGED comment block
4. `scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts`: 3 MIXED fixture comment blocks

### 7.2 Rules (5)

1. **Component-level assertion preferred** (F6A / F8A / F11A pattern).
2. **Surgical fixture update on synthetic params like studentCount** is acceptable.
3. **Surgical updates MUST be documented in** (a) code comment, (b) impl doc, (c) impl JSON.
4. **Surgical updates MUST NOT change**: classGroup membership, room, day/period, expected
   constraint contribution.
5. **Forbidden**: changing test `expected*` value to absorb new constraint contribution.

### 7.3 Applied in F11

- **K22-C Harness H8** (SC8 multi-classGroup): surgical `classGroupStudentCounts: [20, 20]`
  for merged task A, `[40]` for B, `[40]` for C. Keeps SC8 detection while avoiding SC10 fire.
- **F3 MIXED cases** (specialty campus weekend): surgical `classGroupStudentCounts: [40, 40]`
  for `MIXED-LINXIAO`, `MIXED-NON_LINXIAO`, `DELTA-MIXED-NON_LINXIAO-TO-LINXIAO`. Keeps MIXED
  semantics while avoiding SC10 fire.

### 7.4 Other pre-F11 wrappers — re-checked at F12

| Wrapper | Pass count | Affected by F11? | Notes |
|---|---:|:---:|---|
| F3 specialty campus weekend | 16/16 | YES (H8-style surgical update on MIXED) | Documented |
| F4 teacher day balance | 13/13 | NO | Single-class task fixtures, no SC10 fire |
| F6 class gap reduction | 12/12 | NO | Single-class task fixtures, no SC10 fire |
| F8 classroom stability | 11/11 | NO | Single-task with multiple slots in cap=100; util ~0.50-1.0; some SC10 may fire but doesn't pollute (component assertion) |
| F11 capacity preference | 13/13 | N/A (this is the new constraint) | All isolated |

No new pollution risk found.

---

## 8. Remaining Roadmap Refresh

### 8.1 Done (post-F11)

- **P0 soft constraints**: SC5 (F4), SC8 (F6), SC9 (F8), SC10 (F11)
- **New business constraints**: HC6 / SC6 / SC7 (F3)
- **All K22-C harnesses**: A through J (10 sections, 73 cases)

### 8.2 Blocked (require schema / data quality work)

- **SC4 specialty classroom matching**: blocked by Room.type = NORMAL for all 53 rooms. K22-G audit
  (commit `64b5cff`) confirms. K22-G2-ROOM-TYPE-SCHEMA-PLAN is the prerequisite planning stage.
- **NEW-SC-08 (Teacher preference)**: requires `TeacherPreference` model.
- **NEW-SC-09 (Campus-wide time-slot preference)**: requires `SchedulingConfig.preferences` JSON column.
- **NEW-SC-10 (Class home room)**: requires `ClassGroup.homeRoomId` FK.
- All 3 P2 schema candidates require K22-H-SCHEMA-PLAN (planning-only stage).

### 8.3 Partial overlap with existing constraints

- **NEW-SC-07 (teacher half-day)**: may overlap SC5 (teacher day balance). SC5 already
  addresses per-day load balance; half-day concentration is a different concern. Audit before
  implementation.
- **NEW-SC-06 (same-class consecutive switch)**: may overlap SC8 (class gap). SC8 already
  penalizes gaps in same-day classGroup periods; consecutive switch is a different concern.
  Audit before implementation.
- **NEW-SC-05 (large class priority)**: is effectively **subsumed** by SC10's tight branch
  (utilization > 0.90 → -2). No new constraint needed.

### 8.4 Weight / productization

- **Penalty hardcoded** (carried-over MEDIUM F12-D-1 LOW): all 11 constants are baked into
  score.ts. K22-I-SCORE-WEIGHTS-AUDIT is the recommended next step (read-only).

### 8.5 Recommended priority

| Priority | Stage | Rationale |
|---|---|---|
| 1 | `K22-I-SCORE-WEIGHTS-AUDIT` | Addresses F12-D-1 LOW. Read-only. Opens path to configurable weights. |
| 2 | `K22-G2-ROOM-TYPE-SCHEMA-PLAN` | Unblocks specialty classroom matching (SC4). Planning-only. |
| 3 | `K22-ROADMAP-CLOSEOUT-AUDIT` | If K22 main goal is sufficient; closeout and move to other main lines. |
| 4 | `K22-F13-TEACHER-HALF-DAY-CONCENTRATION-AUDIT` | If still want to continue P1; read-only feasibility only. |
| 5 | NEW-SC-06 / NEW-SC-07 audits | Pending overlap analysis with SC8 / SC5. |

---

## 9. Data Quality / Schema Dependencies

| ID | Topic | Current state | Downstream blocker | Severity | Recommended stage |
|---|---|---|---|:---:|---|
| DQ-01 | Room.type underutilized | All 53 rooms have `type=NORMAL` | Specialty classroom matching (SC4) | MEDIUM | K22-G2-ROOM-TYPE-SCHEMA-PLAN |
| DQ-02 | Room.building null for most rooms | 50 / 53 rooms have `building=null` | SC4 cross-campus detection rate is low | LOW | K22-dataquality-building-audit (not yet scheduled) |
| DQ-03 | Course.type not modeled | Course has no `type` field | SC4 theory vs practice vs lab | MEDIUM | K22-G2-ROOM-TYPE-SCHEMA-PLAN |
| DQ-04 | Source evidence 0% populated | All 6 source-evidence fields null on all 446 rows | Forward-fill only; no retroactive benefit | INFO | K22-H-SCHEMA-PLAN (if needed for new data) |
| DQ-05 | Task student count quality | 308/308 (100%) tasks have `REAL_STUDENT_COUNT` | Excellent; no quality concern | NONE | — |

---

## 10. Findings Summary

| ID | Severity | Category | Title |
|---|:---:|---|---|
| F12-A-1 | INFO | A. K22-C summary status | K22-C Harness A-J is at 73 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO |
| F12-B-1 | INFO | B. Default snapshot stability | Default snapshot is stable: hardScore=0 / softScore=-11 / SC2=1 / SC3=1 |
| F12-C-1 | NONE | C. Cross-harness fixture isolation | F11A cross-harness fixture isolation policy is documented and in effect |
| F12-D-1 | LOW | D. Penalty scale | 11 hardcoded constants; SC6 (-20) dominates; productization-limited, not correctness-limited |
| F12-E-1 | LOW | E. Remaining roadmap | P0 / new-business / SC10 all complete. P2 blocked on schema. P1 may overlap with existing. |

**Severity summary**: HIGH=0, MEDIUM=0, LOW=2, INFO=2, NONE=1, **BLOCKING=NO**.

**Implementation readiness**:
- K22-C 73/0/0/0 stable
- Default snapshot stable
- F11A cross-harness isolation policy in effect
- Score system is auditable and complete

---

## 11. Recommended Next Stage

Per F12 spec, K22-F12 is a planning/audit stage. It does NOT prescribe a single next implementation.
It offers three options:

### Option A: `K22-I-SCORE-WEIGHTS-AUDIT` (preferred)

- **Scope**: Read-only audit of how `hardWeights` / `softWeights` could enter `SchedulingConfig`
  without implementing schema changes.
  - Survey current 11 penalty constants and their relative magnitudes.
  - Identify which weights should be configurable per school / per semester.
  - Propose `SchedulingConfig` schema extension (no migration yet).
  - Propose `score.ts` refactor strategy.
- **Rationale**: F12-D-1 LOW finding. Penalty scale is productization-limited.
- **Estimated effort**: LOW (audit only).

### Option B: `K22-G2-ROOM-TYPE-SCHEMA-PLAN`

- **Scope**: Read-only planning of `Room.type` / `Course.type` schema migration + admin UI
  + importer + backfill.
  - Survey regex accuracy for 实训/实验/机房/上机.
  - Sample misclassified courses.
  - Propose admin form change to expose `Room.type`.
  - Propose `Course.type` field design.
- **Rationale**: K22-G (commit `64b5cff`) confirmed Room.type = NORMAL for all 53 rooms.
  Specialty classroom matching (SC4) is blocked.
- **Estimated effort**: LOW (planning only).

### Option C: `K22-ROADMAP-CLOSEOUT-AUDIT`

- **Scope**: If K22 main goal is sufficient, do a final closeout summary and move to
  other main lines (e.g. import quality, RBAC, frontend, etc.).
- **Rationale**: All P0 / new-business / SC10 are complete. K22-C is stable at 73/0/0/0.
- **Estimated effort**: LOW (audit only).

### Final recommendation

Open **Option A** (`K22-I-SCORE-WEIGHTS-AUDIT`) first since it addresses the carried-over
MEDIUM / F12-D-1 LOW and is the most general-purpose next step. K22-F12 is read-only.
It does **NOT** implement any of these.

---

## 12. Verification Results

| Command | Result | Notes |
|---|---|---|
| `npx tsx scripts/audit-score-constraint-summary-refresh-k22-f12.ts` | **PASS** — HIGH=0/MEDIUM=0/LOW=2/INFO=2/NONE=1, BLOCKING=NO | This stage |
| `npx tsx scripts/verify-capacity-preference-constraint-k22-f11.ts` | (per F11A) 13/13 PASS | F11 wrapper |
| `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | (per F11A) 73 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO | K22-C baseline |
| `npx tsx scripts/audit-capacity-preference-constraint-k22-f10.ts` | (per F10) Implementation: READY | F10 audit |
| `npx tsx scripts/audit-score-constraint-summary-k22-f9.ts` | (per F9) HIGH=0/MEDIUM=1/LOW=2/INFO=6/NONE=1, BLOCKING=NO | F9 summary |
| `npx tsx scripts/audit-room-type-data-quality-k22-g.ts` | (per K22-G) HIGH=0/MEDIUM=2/LOW=3/INFO/1/NONE/2, BLOCKING=NO | K22-G data quality |
| `npx tsx scripts/verify-classroom-stability-constraint-k22-f8.ts` | (per F8) 11/11 PASS | F8 wrapper |
| `npx tsx scripts/verify-class-gap-reduction-constraint-k22-f6.ts` | (per F6A) 12/12 PASS | F6 wrapper |
| `npx tsx scripts/verify-teacher-day-balance-constraint-k22-f4.ts` | (per F4) 13/13 PASS | F4 wrapper |
| `npx tsx scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` | (per F3) 16/16 PASS | F3 wrapper (after F11A surgical update) |
| `npx tsx scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts` | (per F2) HIGH=0, BLOCKING=NO | F2 audit |
| `npx tsx scripts/audit-soft-constraints-roadmap-k22-e.ts` | (per K22-E) HIGH=0/MEDIUM=3/LOW=1/INFO/2/NONE/0, BLOCKING=NO | K22-E roadmap |
| `npx tsx scripts/verify-score-delta-sc1-fix-k22-d.ts` | (per K22-D) 6/6 PASS | K22-D SC1 fix |
| `npx tsx scripts/audit-score-constraint-inventory-k22-a.ts` | (per K22-A) HIGH=0/MEDIUM/1/LOW/1/INFO/3/NONE/3, BLOCKING=NO | K22-A inventory |
| `npx tsx scripts/plan-score-regression-harness-k22-b.ts` | (per K22-B) PASS | K22-B plan |
| `npx tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | (per K21-FIX-G) 22/0 PASS | K21 regression |
| `npx tsx scripts/verify-solver-config-api-k21-fix-f.ts` | (per K21-FIX-F) 27/0 PASS | K21 regression |
| `npx tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | (per K21-FIX-F) 16/0 PASS | K21 regression |
| `npx tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | (per K21-FIX-F) 19/0 PASS | K21 regression |
| `npx tsx scripts/audit-schedule-mutation-server-guards.ts` | (per prior) HIGH=0/MEDIUM/0 | audit |
| `npx tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | (per prior) BLOCKING=NO | audit |
| `npx tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | (per prior) 23/0 PASS | verify |
| `npx prisma validate` | valid | schema |
| `npm run build` | PASS | build |
| `npm run lint` | 314 problems (180 errors + 134 warnings), 0 new | lint baseline preserved |
| `npm run test:auth-foundation` | 53 passed / 1 failed (pre-existing) | pre-existing `ScheduleAdjustment ACTIVE count mismatch` |

K22-F12 itself re-ran only the F12 audit + F11 wrapper + K22-C + F3 + base validations (lint,
build, test:auth-foundation, prisma). Other commands are re-stated for the report.

---

## 13. Unmodified Scope Confirmation

K22-F12-SCORE-CONSTRAINT-SUMMARY-AUDIT-REFRESH is a read-only summary. It **did not modify** any of:

- `src/lib/scheduler/score.ts`
- `src/lib/scheduler/solver.ts`
- `src/lib/scheduler/types.ts`
- `src/lib/scheduler/capacity.ts`
- `src/lib/scheduler/data-loader.ts`
- `scripts/verify-score-regression-harness-k22-c.ts`
- `scripts/verify-capacity-preference-constraint-k22-f11.ts`
- `scripts/verify-classroom-stability-constraint-k22-f8.ts`
- `scripts/verify-class-gap-reduction-constraint-k22-f6.ts`
- `scripts/verify-teacher-day-balance-constraint-k22-f4.ts`
- `scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts`
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `prisma/dev.db`
- Scheduler config API / UI
- Frontend
- API routes
- Importer / parser
- RBAC
- Seed
- Business data (read-only DB inspection only)
- hardWeights / softWeights
- Any new soft / hard constraint implementations
- Any harness logic
- F3 / F6 / F8 / F11 wrapper test logic

K22-F12 only **added** three files:

- `scripts/audit-score-constraint-summary-refresh-k22-f12.ts` (new)
- `docs/k22-score-constraint-summary-refresh-audit.md` (this file)
- `docs/k22-score-constraint-summary-refresh-audit.json` (new)

---

## 14. Closing Note

K22-F12-SCORE-CONSTRAINT-SUMMARY-AUDIT-REFRESH 按 spec 完整执行：

- ✅ 新增只读 audit 脚本 (`scripts/audit-score-constraint-summary-refresh-k22-f12.ts`)
- ✅ 新增 Markdown 审计文档 (本文件)
- ✅ 新增 JSON 报告 (`docs/k22-score-constraint-summary-refresh-audit.json`)
- ✅ 确认 HC1-HC6 + SC1-SC10 + MIN_PERT 全部 17+1 = 18 项约束都已纳入 harness
- ✅ 确认 full + delta 覆盖一致 (无 drift)
- ✅ 确认 K22-C Harness A-J 总数 73/0/0/0 (per F11A commit 5e82388, re-verified at F12)
- ✅ 确认 default snapshot 稳定 (hardScore=0, softScore=-11, SC2=1, SC3=1)
- ✅ 确认 F11A cross-harness fixture isolation policy 已文档化并在生效
- ✅ 评估 penalty scale (intentional, productization-limited)
- ✅ 评估 remaining roadmap (P0/new-business done; P1 partial overlap; P2 blocked on schema)
- ✅ 评估 data quality (5 items: 2 MEDIUM, 1 LOW, 1 INFO, 1 NONE)
- ✅ Findings: HIGH=0 / MEDIUM=0 / LOW=2 / INFO=2 / NONE=1 / BLOCKING=NO
- ✅ 不修改任何业务代码 / 不写数据库 / 不改 score.ts / 不改 harness / 不改 schema / 不改 importer
- ✅ 不实现任何新约束

**本阶段 (K22-F12) 可关闭. 推荐进入 K22-I-SCORE-WEIGHTS-AUDIT (preferred — 解决 F12-D-1 LOW) 或 K22-G2-ROOM-TYPE-SCHEMA-PLAN (preferred if specialty classroom is the goal) 或 K22-ROADMAP-CLOSEOUT-AUDIT (if K22 main goal is sufficient). 均为只读 / 规划 / 关闭阶段, 不直接实现新约束.**
