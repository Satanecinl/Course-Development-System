# K22-F3 Specialty Campus Weekend Constraints Implementation

| Field | Value |
|---|---|
| Phase | K22-F3-SPECIALTY-CAMPUS-WEEKEND-CONSTRAINT-IMPL |
| Type | Implementation (HC6, SC6, SC7 in score.ts + regression harness) |
| Generated | 2026-06-06 |
| Predecessor | K22-F2A (commit `794fdb9`) |
| Verify script | `scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` |
| Harness | `scripts/verify-score-regression-harness-k22-c.ts` (K22-C, unchanged) |
| K22-F2A audit | `scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts` (re-run after F3) |

---

## 1. Background

K22-F2A corrected the specialty classification strategy into a 5-class scheme with classGroup membership as the primary hard-rule signal. K22-F3 implements the 3 constraints (HC6, SC6, SC7) in `src/lib/scheduler/score.ts` with full + delta consistency.

---

## 2. Implementation

### 2.1 HC6_NON_AUTOMOTIVE_FORBID_LINXIAO

- **Type**: hard constraint
- **Penalty**: -1000 (same as HC1-HC5)
- **Constant**: `HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY = -1000`
- **Trigger**: slot in Linxiao room AND classification ≠ AUTOMOTIVE_ONLY
- **Classification logic**: `classifySpecialty(task)` — classGroup membership dominates; courseName/remark are auxiliary
- **Delta**: only moved slot affected. Before: if old room is Linxiao and classification ≠ AUTOMOTIVE_ONLY → delta -= -1000. After: if new room is Linxiao and classification ≠ AUTOMOTIVE_ONLY → delta += -1000.

### 2.2 SC6_AUTOMOTIVE_PREFERS_LINXIAO

- **Type**: soft constraint
- **Penalty**: -20
- **Constant**: `SC6_AUTOMOTIVE_NON_LINXIAO_PENALTY = -20`
- **Trigger**: classification = AUTOMOTIVE_ONLY AND room is NOT Linxiao
- **Delta**: same before/after pattern as HC6, but soft.

### 2.3 SC7_WEEKEND_AVOIDANCE

- **Type**: soft constraint
- **Penalty**: -15
- **Constant**: `SC7_WEEKEND_PENALTY = -15`
- **Trigger**: `dayOfWeek >= 6` (Saturday=6, Sunday=7)
- **Delta**: if old day >= 6 → delta -= -15. If new day >= 6 → delta += -15.

### 2.4 Full / delta consistency

- Shared helpers: `classifySpecialty(task)`, `isLinxiaoRoomName(room)`, `computeHC6Penalty(cls, isLx)`, `computeSC6Penalty(cls, isLx)`
- Full score: single pass through `positions`, applies HC6 + SC6 + SC7
- Delta score: classification computed once (task doesn't change during move), then before/after room/day comparison
- Hard/soft separation: HC6 only affects hardScore; SC6/SC7 only affect softScore

---

## 3. Harness Cases

| Case | Category | Expected |
|---|---|---|
| AUTO_ONLY-LINXIAO | SC6 | hard=0, soft=0 |
| AUTO_ONLY-NON_LINXIAO | SC6 | hard=0, soft=-20 |
| NON_AUTO-LINXIAO | HC6 | hard=-1000, soft=0 |
| NON_AUTO-NON_LINXIAO | HC6 | hard=0, soft=0 |
| MIXED-LINXIAO (K22-F2A) | HC6 | hard=-1000, soft=0 |
| MIXED-NON_LINXIAO | HC6 | hard=0, soft=0 |
| COURSE_NAME_AUTO-BUT-NON_AUTO_CLASS-LINXIAO (K22-F2A) | HC6 | hard=-1000, soft=0 |
| REMARK_AUTO-BUT-NON_AUTO_CLASS-LINXIAO (K22-F2A) | HC6 | hard=-1000, soft=0 |
| NO_CLASSGROUP_AUX_AUTO_SIGNAL-LINXIAO | HC6 | hard=-1000, soft=0 |
| UNKNOWN_NO_SIGNAL-LINXIAO | HC6 | hard=-1000, soft=0 |
| SC7-WEEKEND | SC7 | hard=0, soft=-15 |
| SC7-WEEKDAY | SC7 | hard=0, soft=0 |
| DELTA-AUTO-NON_LINXIAO-TO-LINXIAO | SC6 | deltaSoft=+18 (SC6 +20, MIN_PERT -2) |
| DELTA-NON_AUTO-NON_LINXIAO-TO-LINXIAO | HC6 | deltaHard=-1000, deltaSoft=-2 |
| DELTA-MIXED-NON_LINXIAO-TO-LINXIAO (K22-F2A) | HC6 | deltaHard=-1000, deltaSoft=-2 |
| DELTA-WEEKDAY-TO-WEEKEND | SC7 | deltaSoft=-17 (SC7 -15, MIN_PERT -2) |

Delta cases include MIN_PERT contribution (-2) because moving away from `originalAssignments` naturally introduces perturbation. This is consistent with K22-C A.2 case pattern.

---

## 4. Default Snapshot

The default snapshot (`docs/k22-score-default-snapshot.json`) is unchanged:
- hardScore=0, softScore=-11 (SC2=1, SC3=1)
- HC6=0 (no tasks in Linxiao rooms in default fixture)
- SC6=0 (no AUTOMOTIVE_ONLY tasks in non-Linxiao rooms)
- SC7=0 (all slots on day 1/2, not weekend)

The default fixture uses rooms with non-Linxiao names (e.g., 'A101') and no automotive keywords in classGroup names, so HC6/SC6/SC7 don't trigger. Snapshot remains stable.

---

## 5. Verification Results

| Command | Result |
|---|---|
| `npx.cmd tsx scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` | **PASS** — 16/16 PASS, exit=0 |
| `npx.cmd tsx scripts/verify-score-regression-harness-k22-c.ts` | **PASS** — 17/0/0/0 |
| `npx.cmd tsx scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts` | **PASS** — HIGH=0/MEDIUM=1/LOW=3/INFO=1/BLOCKING=NO |
| `npx.cmd tsx scripts/audit-soft-constraints-roadmap-k22-e.ts` | **PASS** |
| `npx.cmd tsx scripts/verify-score-delta-sc1-fix-k22-d.ts` | **PASS** — 6/6 |
| `npx.cmd tsx scripts/audit-score-constraint-inventory-k22-a.ts` | **PASS** — HIGH=0 |
| `npx.cmd tsx scripts/plan-score-regression-harness-k22-b.ts` | **PASS** |
| K21 config verifies | all PASS |
| mutation audit | HIGH=0/MEDIUM=0 |
| `prisma validate` | valid |
| `build` | PASS |
| `lint` | 314 (180 errors + 134 warnings), 0 new |
| `test:auth-foundation` | 53 passed / 1 failed (pre-existing) |

---

## 6. Unmodified Scope

- ✅ Prisma schema: unchanged
- ✅ migrations: unchanged
- ✅ prisma/dev.db: unchanged
- ✅ solver algorithm: unchanged
- ✅ scheduler config API/UI: unchanged
- ✅ frontend: unchanged
- ✅ API routes: unchanged
- ✅ importer/parser: unchanged
- ✅ RBAC: unchanged
- ✅ seed/业务数据: unchanged
- ✅ SC5 teacher day balance: not implemented (deferred to K22-F4)
- ✅ Department/Room.campus models: not introduced
- ✅ hardWeights/softWeights: not introduced
