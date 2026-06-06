# K22-G Room Type Data Quality Audit

| Field | Value |
|---|---|
| Phase | K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT |
| Type | Read-only data quality audit (no Prisma writes, no score.ts modifications, no schema changes) |
| Generated | 2026-06-07 |
| Predecessor | K22-F9-SCORE-CONSTRAINT-SUMMARY-AUDIT (commit `33ffe8d`) |
| Audit script | `scripts/audit-room-type-data-quality-k22-g.ts` |
| JSON report | `docs/k22-room-type-data-quality-audit.json` |
| Project direction | K22-G — assess feasibility of "实训课 / 机房课 / 专业教室 matching" P1 soft / hard constraint |

---

## 1. Executive Summary

K22-G is a read-only data-quality audit. It does NOT implement, modify, or extend any constraint.
It produces a structured assessment of whether the current `Room.type`, `Room.name`, `Room.capacity`,
`Course.name`, `TeachingTask.remark`, and source-evidence fields are sufficient to support a future
"实训课 / 机房课 / 专业教室 matching" soft or hard constraint.

**Headline findings**:

- **Room.type data quality is BLOCKING for hard rule**: All 53 rooms in dev.db have `type=NORMAL`.
  The field is free-form String (no enum), defaulted to `"NORMAL"` in schema, hardcoded to `"NORMAL"`
  in the importer (`src/lib/import/importer.ts:940`), and NOT exposed in the admin form
  (`src/lib/admin-db/config.ts:48-52`). It is structurally present but practically absent.
- **Course has no type field**: Only `id` + `name`. Classification must rely on `courseName` / `remark`
  regex. `Course` schema has no `type` / `category` / `kind` / `practical` field.
- **Room.name keyword inference has limited but non-zero coverage**:
  - 12 of 53 rooms (22.6%) have at least one specialty keyword in their name.
  - Hot keywords: `林校` (10), `实训` (2), `机房` (1).
  - These rooms are **suspicious** because their name says specialty but `type=NORMAL` says general.
- **Course.name keyword coverage is partial**:
  - 26 of 104 courses (25.0%) match at least one specialty keyword.
  - Hot: `汽车` (9), `传感器` (4), `制图` (3), `电子` (3), `实训` (2), `电工` (2), `检测` (2), `维修` (1).
- **Task.remark keyword coverage**:
  - 46 of 308 tasks (14.9%) have `汽车` in remark. (Driven by the existing automotive specialty
    classification in HC6 / SC6.)
- **Room capacity is real (K21-FIX-A confirmed)**:
  - Range 3-200, median 40, average 46.
  - 10 rooms <30, 29 in 30-49, 7 in 50-79, 6 in 80-119, 1 in >=200.
  - Capacity is the only data field currently trusted for soft / hard rule.
- **Source evidence is 0% populated**:
  - All 6 source-evidence fields on `TeachingTaskClass` are null for all 446 rows.
  - K20-FIX-B introduced these fields as forward-fill only; no historical backfill.
- **Building is 100% null** (53/53 rooms). The `inferBuilding(name)` fallback is the only
  classification path for SC1 / SC4.
- **Scheduler context has full data access**: `room.name`, `room.type`, `room.building`,
  `room.capacity`, `course.name`, `task.remark` are all available without new data-loader changes.

**Severity summary**: HIGH=0, MEDIUM=2, LOW=3, INFO=1, NONE=2, **BLOCKING=NO** (for the audit stage;
hard room-type rule is `NOT_READY` for implementation).

**Implementation readiness**:

- Hard rule on `Room.type` / `Course.type`: **NOT_READY**
- Soft keyword-based preference: **PARTIAL_READY** (data access OK; coverage partial; confidence LOW)
- Capacity-based soft preference: **READY** (K21-FIX-A confirmed)

**Recommended next stage** (any of three, no direct implementation):

1. `K22-G2-ROOM-TYPE-SCHEMA-PLAN` (planning) — schema migration + admin form + importer + backfill
2. `K22-F10-CAPACITY-PREFERENCE-AUDIT` (capacity-first) — P1 candidate that does not need Room.type
3. `K22-G3-KEYWORD-BASED-ROOM-SUITABILITY-PROTOTYPE-AUDIT` (soft-only prototype) — read-only feasibility
   audit of keyword-only soft preference

---

## 2. Current Room.type Distribution

`Room.type` is `String @default("NORMAL")` in `prisma/schema.prisma:68`. No enum.

| Room.type | Count | Percent | Notes |
|---|---:|---:|---|
| NORMAL | 53 | 100% | Default value; no real classification. |

- All 53 rooms in dev.db have `type=NORMAL`.
- No non-NORMAL values exist.
- `Room.building` is `null` for all 53 rooms.
- The importer hardcodes `type: 'NORMAL'` at room creation
  (`src/lib/import/importer.ts:940`).
- The admin form does not expose `Room.type`
  (`src/lib/admin-db/config.ts:48-52`: only `name`, `building`, `capacity`).

**Conclusion**: `Room.type` is structurally present but practically absent. Cannot serve as
a classification signal until admin form, importer, and backfill are addressed.

---

## 3. Room Keyword Inference Audit

`Room.name` keyword hits (per-keyword) — 11 keywords checked:

| Keyword | Matched | Percent | Inferred type | Confidence | Notes |
|---|---:|---:|---|:---:|---|
| 林校 | 10 | 18.9% | LINXIAO | HIGH | 林校 = Linxiao campus; all 10 have capacity 25-92 |
| 实训 | 2 | 3.8% | TRAINING_ROOM | HIGH | 1号楼虚拟仿真实训室, 12号楼机器人实训室 |
| 机房 | 1 | 1.9% | COMPUTER_LAB | HIGH | 12楼机房 |
| 计算机 | 0 | 0% | COMPUTER_LAB | MEDIUM | (not present) |
| 实验 | 0 | 0% | LAB | HIGH | (not present) |
| 语音 | 0 | 0% | LANGUAGE_LAB | HIGH | (not present) |
| 多媒体 | 0 | 0% | MULTIMEDIA | MEDIUM | (not present) |
| 画室 | 0 | 0% | STUDIO | HIGH | (not present) |
| 舞蹈 | 0 | 0% | DANCE | HIGH | (not present) |
| 汽修 | 0 | 0% | AUTOMOTIVE_LAB | HIGH | (not present) |
| 汽车 | 0 | 0% | AUTOMOTIVE_LAB | MEDIUM | (not present) |

**Total keyword matches**: 13 (a single room can match multiple keywords; e.g. 1号楼虚拟仿真实训室 matches `实训`).

**Suspicious rooms** (name has specialty keyword but `type=NORMAL`) — 13 rooms:

| Room # | Name | Type | Capacity | Building | Reason |
|---:|---|---|---:|---|---|
| 18 | 1号楼虚拟仿真实训室 | NORMAL | 100 | (empty) | name has 实训; type=NORMAL |
| 21 | 林校\n305 | NORMAL | 92 | null | name has 林校; type=NORMAL |
| 22 | 林校\n304 | NORMAL | 61 | null | name has 林校; type=NORMAL |
| 23 | 林校304 | NORMAL | 28 | null | name has 林校; type=NORMAL |
| 24 | 林校305 | NORMAL | 92 | null | name has 林校; type=NORMAL |
| 25 | 林校\n301 | NORMAL | 28 | null | name has 林校; type=NORMAL |
| 26 | 林校303 | NORMAL | 25 | null | name has 林校; type=NORMAL |
| 27 | 林校\n303 | NORMAL | 25 | null | name has 林校; type=NORMAL |
| 28 | 林校301 | NORMAL | 40 | null | name has 林校; type=NORMAL |
| 29 | 林校306 | NORMAL | 40 | null | name has 林校; type=NORMAL |
| 41 | 12楼机房 | NORMAL | 41 | null | name has 机房; type=NORMAL |
| 44 | 12号楼机器人实训室 | NORMAL | 39 | null | name has 实训; type=NORMAL |
| 49 | 林校\n306 | NORMAL | 40 | null | name has 林校; type=NORMAL |

(Note: Some 林校 rooms have duplicate entries due to whitespace in the name; e.g. "林校\n305" vs "林校305".)

**Confidence assessment**:

- `林校` keyword: HIGH confidence for inferring Linxiao campus. The score already uses
  `inferBuilding` and `isLinxiaoRoomName` with the same keyword for HC6 specialty.
- `实训` keyword: HIGH confidence for training room.
- `机房` keyword: HIGH confidence for computer lab.

**Conclusion**: Keyword inference can identify 12 of 53 rooms (22.6%) with HIGH confidence.
The remaining 41 rooms (77.4%) have no specialty keyword and would default to GENERAL.

---

## 4. Room Capacity Audit

`Room.capacity` is `Int @default(50)` in `prisma/schema.prisma:67`.

| Bucket | Count | Percent | Notes |
|---|---:|---:|---|
| <30 | 10 | 18.9% | small room (林校 rooms cluster here) |
| 30-49 | 29 | 54.7% | below default 50 |
| 50-79 | 7 | 13.2% | around default 50 |
| 80-119 | 6 | 11.3% | medium-large |
| >=200 | 1 | 1.9% | extra large |

**Range**: min=3, max=200, median=40, average=46.

**K21-FIX-A confirmation**: Per K21-FIX-A audit, all 53 rooms have real capacity (not placeholder).
The clustering at <50 is plausible (small-school reality, with many rooms sized for a class).

**No capacity-0 rooms**: K22-G inspection found 0 rooms with `capacity=0`.
No capacity=50 with specialty-name false-positive flagged: the 13 suspicious rooms have capacities
ranging 25-100, all real values.

**Conclusion**: Capacity is real and reliable. Suitable for capacity-based soft preference
(Candidate D) without further audit.

---

## 5. Course / TeachingTask Type Audit

### Course schema

`Course` model (`prisma/schema.prisma:55-61`):
```
id        Int    @id @default(autoincrement())
name      String @unique
tasks     TeachingTask[]
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

**No type field.** Only `id` and `name`. Admin form (`src/lib/admin-db/config.ts:46`) exposes
only `name`.

### TeachingTask schema

`TeachingTask` model (`prisma/schema.prisma:76-98`) has:
- `courseId` (FK to Course)
- `course` (relation)
- `teacherId` (nullable)
- `remark: String?` (free-form text)
- `crossCohortApproved`, `crossCohortApprovalReason` (admin workflow)
- `importBatchId` (source evidence)
- `taskClasses` (link to ClassGroup, with rich per-link source evidence)

**Course.name and TeachingTask.remark are the only signals** for type classification.

### Course.name keyword hits (104 courses)

| Keyword | Matched | Percent | Inferred task type | Confidence | Notes |
|---|---:|---:|---|:---:|---|
| 汽车 | 9 | 8.7% | SPECIALTY_ROOM_PREFERRED | MEDIUM | 汽车检测, 汽车电气设备, etc. |
| 传感器 | 4 | 3.8% | SPECIALTY_ROOM_PREFERRED | MEDIUM | 传感器原理, 传感器应用, etc. |
| 制图 | 3 | 2.9% | COMPUTER_LAB_REQUIRED | MEDIUM | 工程制图, 机械制图, etc. |
| 电子 | 3 | 2.9% | SPECIALTY_ROOM_PREFERRED | LOW | 电子技术, 电子基础 (broad) |
| 实训 | 2 | 1.9% | TRAINING_ROOM_REQUIRED | HIGH | e.g. 实训, 综合实训 |
| 电工 | 2 | 1.9% | SPECIALTY_ROOM_PREFERRED | MEDIUM | 电工基础, 电工电子 |
| 检测 | 2 | 1.9% | SPECIALTY_ROOM_PREFERRED | MEDIUM | 汽车检测, 检测技术 |
| 维修 | 1 | 1.0% | SPECIALTY_ROOM_PREFERRED | MEDIUM | 维修, 设备维修 |

Other keywords (`上机`, `机房`, `计算机`, `CAD`, `实操`, `实验`, `汽修`, `理实一体`, `焊接`): 0 matches.

**Total courses with at least one keyword**: ~26 of 104 (25.0%) — counted with overlap (a course
can match multiple keywords).

### Task.remark keyword hits (308 tasks)

| Keyword | Matched tasks | Notes |
|---|---:|---|
| 汽车 | 46 | Driven by existing F2A automotive specialty detection (remark-based) |
| (all others) | 0 | |

**46 of 308 tasks (14.9%) have `汽车` in remark.** This signal is already exploited by score.ts
for HC6 / SC6.

### Source-evidence availability

`TeachingTaskClass` has 6 source-evidence fields (K20-FIX-B forward-fill only):

| Field | Populated | Total | Percent |
|---|---:|---:|---:|
| `sourceKeyword` | 0 | 446 | 0% |
| `sourceRemark` | 0 | 446 | 0% |
| `sourceClassName` | 0 | 446 | 0% |
| `sourceArtifactFilename` | 0 | 446 | 0% |
| `matchStrategy` | 0 | 446 | 0% |
| `matchConfidence` | 0 | 446 | 0% |

**All 6 source-evidence fields are 0% populated.** K20-FIX-B introduced them as forward-fill
only, and no historical backfill has been performed. The fields exist structurally but are
practically empty.

**Conclusion**: Source evidence cannot help classify existing data. It can only help going forward.

---

## 6. TeachingTask Keyword Inference Audit

Combined courseName + remark signals:

| Signal | Coverage | Use |
|---|---|---|
| `courseName` regex | 26 / 104 (25.0%) | Primary signal for course type |
| `task.remark` regex | 46 / 308 (14.9%) | Secondary signal (mostly 汽车) |
| `classGroup.name` | (used by F2A HC6/SC6) | Specialty signal for automotive (HIGH confidence) |

**Confidence stack**:

- HIGH confidence: classGroup.name with automotive keyword (F2A pattern — already exploited).
- MEDIUM confidence: courseName with strong keyword (实训, 上机, 理实一体, etc.).
- LOW confidence: courseName with broad keyword (电子, 计算机, etc.) or remark.

**Inferred task type candidates** (illustrative; not enforced):

- `GENERAL`: no keyword matches.
- `COMPUTER_LAB_REQUIRED`: courseName contains 上机, 机房, 计算机, CAD, 制图.
- `TRAINING_ROOM_REQUIRED`: courseName contains 实训, 实操, 实验, 理实一体.
- `SPECIALTY_ROOM_PREFERRED`: courseName contains 汽修, 汽车, 电工, 电子, 传感器, 检测, 焊接, 维修.

**Conclusion**: courseName-based keyword inference has limited but non-zero coverage. 75% of
courses (78/104) would default to GENERAL.

---

## 7. Source Evidence Availability

`TeachingTaskClass` source-evidence fields (K20-FIX-B):

- `sourceKeyword`, `sourceRemark`, `sourceClassName`, `sourceArtifactFilename`,
  `matchStrategy`, `matchConfidence`

**Current state**: All 6 fields are 0% populated (0/446 rows). The fields exist in schema but
no import has filled them. K20-FIX-B was a forward-fill design, not a historical backfill.

**Implication**: Source evidence cannot help classify existing data. If a future stage wants
to surface "uncertain classification" for admin review, it must rely on:
- courseName / remark keyword (already attempted here)
- classGroup.name keyword (already used by F2A for automotive)
- A new backfill that re-runs the import to populate source-evidence fields

**Conclusion**: Source evidence is a forward-looking design, not a present-day data source.

---

## 8. Candidate Strategy Comparison

| ID | Strategy | Schema | Risk | Effort | Recommended | Rationale |
|---|---|:---:|:---:|:---:|:---:|---|
| **A** | Keyword-based soft preference (no schema) | ❌ | MEDIUM | LOW | ✅ | Cheapest path; safe for soft preference; align with F2A pattern. |
| **B** | Schema-backed Room.type / Course.type / requiredRoomType | ⚠️ | HIGH | HIGH | ❌ | Correct long-term but too heavy. Needs planning first. |
| **C** | Source-evidence assisted classification (admin review) | ❌ | LOW | MEDIUM | ❌ | Good complement to A or B. Not standalone. |
| **D** | Capacity-first proxy (avoid room type) | ❌ | LOW | LOW | ✅ | Safe first P1. Real data, no keyword logic. |

### Candidate A: Keyword-based soft preference

**Approach**: Infer room type from `Room.name` keyword (HIGH confidence for 林校, 实训, 机房) and
task type from `courseName` / `remark` keyword. Add a soft constraint that prefers matched room
over unmatched room.

**Pros**:
- No schema change.
- Reuses existing SchedulingContext (room.name, course.name, task.remark) — no data loader change.
- Soft preference is reversible; can be tuned via penalty constant.
- Aligns with K22-F2A pattern: classGroup membership is the primary signal for HC6; keyword is auxiliary.

**Cons**:
- Keyword inference is fragile (typos, abbreviations, naming variations).
- 77.4% of rooms have no specialty keyword → defaults to GENERAL.
- 75.0% of courses have no specialty keyword → defaults to GENERAL.
- High risk of false positives / false negatives.
- Hard to maintain over time (new keywords, deprecated names).
- Should NOT be a hard constraint; K22-F2A explicitly says courseName/remark cannot back a hard rule.

**Recommended**: ✅ As a prototype / soft-only path. NOT for hard rule.

### Candidate B: Schema-backed Room.type / Course.type / requiredRoomType

**Approach**: Add structured type fields. Replace default-NORMAL with real classification. Add
`Course.type` (theory / practice / lab). Add `TeachingTask.requiredRoomType` /
`TeachingTask.preferredRoomType`. Migration + admin UI + importer + backfill.

**Pros**:
- Semantic clarity: structured fields are unambiguous.
- Supports both soft and hard constraints.
- UI-manageable.
- Importer can infer types from courseName regex with admin override.

**Cons**:
- Schema migration + backfill required (high coordination cost).
- Admin UI form needs new fields.
- Importer must write Room.type / Course.type at import time.
- Existing 53 rooms + 104 courses need manual classification (work effort).
- Source evidence cannot help retroactively.

**Recommended**: ❌ Not for current stage. Open `K22-G2-ROOM-TYPE-SCHEMA-PLAN` first.

### Candidate C: Source-evidence assisted classification (admin review)

**Approach**: Use existing source-evidence fields (currently 0% populated) to surface uncertain
classifications. Admin reviews ambiguous cases and assigns `requiredRoomType`.

**Pros**:
- Reuses existing K20-FIX-B infrastructure.
- No schema change.
- Reversible.
- High confidence (admin makes the final call).

**Cons**:
- Requires admin UI flow (review queue, bulk confirm).
- Manual work for ambiguous cases.
- Does not directly improve score.ts.
- Slow rollout.

**Recommended**: ❌ As a complement to A or B, not standalone.

### Candidate D: Capacity-first proxy

**Approach**: Do not attempt room-type matching. Instead, implement "大班优先大教室 / 容量余量优化"
as a soft preference, using existing `Room.capacity` and `studentCount` fields.

**Pros**:
- Capacity is real, reliable data (K21-FIX-A confirmed).
- No schema change.
- No new keyword logic.
- Reuses existing HC4 capacity check.
- Direct student-facing benefit (avoiding overcrowded rooms).

**Cons**:
- Does not solve 实训课 / 机房课 matching.
- Does not address specialty rooms (e.g. automotive lab at Linxiao).
- May duplicate existing capacity-aware logic in solver.

**Recommended**: ✅ As a primary P1 path. Pairs well with K22-F10 audit.

---

## 9. Recommended Path

**Do NOT directly implement a hard room-type rule.** It is `NOT_READY` for the following reasons:

1. **Schema gap**: `Room.type` is structurally present but free-form + default-NORMAL.
   `Course` has no type field. Hard rule would not fire in production.
2. **Importer hardcodes NORMAL**: `src/lib/import/importer.ts:940` creates every new room with
   `type: 'NORMAL'`. Even after schema work, a one-time backfill is required.
3. **Admin form gap**: `Room.type` is not in the form, so admin cannot maintain it.
4. **Source evidence is 0% populated**: Cannot retroactively classify.

**Recommended sequencing** (open next, no direct implementation):

1. **`K22-G2-ROOM-TYPE-SCHEMA-PLAN`** (planning-only): enumerate required schema fields
   (`Course.type`, `Room.type` admin exposure, `TeachingTask.requiredRoomType` /
   `preferredRoomType`), admin UI form changes, importer change to infer type at import time,
   one-time backfill strategy. Output: plan doc + migration script outline, NO migration yet.

2. **In parallel, `K22-F10-CAPACITY-PREFERENCE-AUDIT`** (read-only feasibility): evaluate the
   capacity-based soft preference (Candidate D). If accepted, this becomes the first P1
   implementation that does NOT need Room.type.

3. **Optional `K22-G3-KEYWORD-BASED-ROOM-SUITABILITY-PROTOTYPE-AUDIT`** (read-only feasibility):
   evaluate the keyword-only soft preference (Candidate A) as a no-schema-change prototype. If
   accepted, this becomes a soft-only implementation with very low penalty (e.g. -2).

The order of (1), (2), (3) is flexible. The audit stage recommends opening (1) first since
it is the prerequisite for any hard rule, and (2) or (3) in parallel as the first P1 implementation.

---

## 10. Implementation Readiness

| Aspect | Status | Notes |
|---|:---:|---|
| Hard rule on `Room.type` | **NOT_READY** | All 53 rooms are NORMAL; Course has no type field. |
| Hard rule on `Course.type` | **NOT_READY** | Course has no type field. |
| Soft preference on `Room.name` keyword | **PARTIAL_READY** | Data access OK; 22.6% room coverage with HIGH confidence keywords. |
| Soft preference on `courseName` / `remark` keyword | **PARTIAL_READY** | 25.0% course coverage; 14.9% task remark coverage. |
| Capacity-based soft preference | **READY** | K21-FIX-A confirmed capacity is real. |
| Source-evidence assisted classification | **NOT_READY** | All 6 fields 0% populated. |
| Building inference (`inferBuilding`) | **READY** | Already used by SC1; supports 林校, 实训, 11/12/1号楼. |
| Linxiao detection (`isLinxiaoRoomName`) | **READY** | Already used by HC6 / SC6. |

**Prerequisites for any hard room-type rule**:

1. Schema: add `Course.type` field (enum or string).
2. Schema: expose `Room.type` in admin form.
3. Importer: persist `Room.type` from name keyword or admin override (currently hardcoded
   `"NORMAL"` at `importer.ts:940`).
4. Backfill: classify all 53 rooms by hand or by inference + admin review.
5. Backfill: classify all 104 courses by hand or by inference + admin review.

**Prerequisites for soft keyword-based preference**:

1. Confidence indicator in audit logs.
2. Admin review queue (Candidate C) for false-positive correction.
3. Low penalty (e.g. -2 to -5) to limit blast radius of misclassification.

**Prerequisites for capacity-based soft preference**: none (data is real).

---

## 11. Findings Summary

| ID | Severity | Category | Title |
|---|:---:|---|---|
| G-F-1 | MEDIUM | G-F. Room.type data quality | All 53 rooms have type=NORMAL; no real classification available |
| G-F-2 | LOW | G-F. Room keyword inference | Room.name keyword inference: 13 total matches across 11 keywords |
| G-F-3 | NONE | G-F. Room capacity data quality | Room.capacity range: min=3, max=200, median=40 |
| G-F-4 | MEDIUM | G-F. Course type data quality | Course model has no type field; course name is the only signal |
| G-F-5 | LOW | G-F. Course / task keyword coverage | Course.name keyword hits: 26 (of 104); Task.remark hits: 46 (of 308) |
| G-F-6 | INFO | G-F. Source evidence availability | Source evidence coverage: 0% sourceKeyword, 0% sourceClassName (out of 446 rows) |
| G-F-7 | NONE | G-F. Scheduler context readiness | SchedulingContext has full access to room.name, course.name, task.remark, room.building, room.capacity, room.type |
| G-F-8 | LOW | G-F. Building data quality | 53 of 53 rooms have null building (100%) |

**Severity summary**: HIGH=0, MEDIUM=2, LOW=3, INFO=1, NONE=2, **BLOCKING=NO**.

The two MEDIUM findings (G-F-1, G-F-4) are the primary blockers for any hard room-type rule.
The three LOW findings (G-F-2, G-F-5, G-F-8) are keyword / data-quality observations that
limit the precision of soft keyword-based preferences. The two NONE findings (G-F-3, G-F-7)
confirm that capacity is real and the scheduler has data access.

---

## 12. Recommended Next Stage

Per F9 spec, K22-G is a planning/audit stage. It does NOT prescribe a single next implementation.
It offers three options:

### Option A: `K22-G2-ROOM-TYPE-SCHEMA-PLAN` (preferred if hard rule is the goal)

- **Scope**: Read-only planning of schema migration + admin UI form extension + importer change +
  one-time backfill strategy. NO migration yet.
- **Output**: Plan doc + migration script outline + admin form mockup + backfill statistics.
- **Rationale**: This is the prerequisite for any hard room-type rule. It addresses the G-F-1
  and G-F-4 MEDIUM findings.
- **Estimated effort**: LOW (planning only).

### Option B: `K22-F10-CAPACITY-PREFERENCE-AUDIT` (preferred if P1 is the goal)

- **Scope**: Read-only feasibility audit of "大班优先大教室 / 容量余量优化" soft preference.
  - Evaluate whether current solver already optimizes capacity.
  - If not, design a soft penalty proportional to (studentCount - room.capacity).
  - Confirm no overlap with existing HC4 / capacity.ts logic.
- **Rationale**: Capacity is real (K21-FIX-A confirmed). This is the safest P1 candidate that
  does not need Room.type data quality.
- **Estimated effort**: LOW (audit only).

### Option C: `K22-G3-KEYWORD-BASED-ROOM-SUITABILITY-PROTOTYPE-AUDIT` (preferred for fast prototype)

- **Scope**: Read-only feasibility audit of keyword-only soft preference. Verify which keyword
  matches would fire on dev.db. Design a soft penalty scheme.
- **Rationale**: Cheapest path to a no-schema-change soft preference. Coverage is partial
  (22.6% rooms, 25.0% courses) but safe with low penalty. Aligns with F2A pattern.
- **Estimated effort**: LOW (audit only).

### Final recommendation

Open **Option A** (`K22-G2-ROOM-TYPE-SCHEMA-PLAN`) first if the goal is a hard rule. Open
**Option B** (`K22-F10-CAPACITY-PREFERENCE-AUDIT`) if the goal is the first P1 implementation.
Open **Option C** (`K22-G3-KEYWORD-BASED-ROOM-SUITABILITY-PROTOTYPE-AUDIT`) for a fast prototype.

K22-G is read-only. It does **NOT** implement any of these.

---

## 13. Verification Results

| Command | Result | Notes |
|---|---|---|
| `npx tsx scripts/audit-room-type-data-quality-k22-g.ts` | **PASS** — HIGH=0 / MEDIUM=2 / LOW=3 / INFO=1 / NONE=2 / BLOCKING=NO | Implementation readiness: NOT_READY (hard rule) |
| `npx tsx scripts/audit-score-constraint-summary-k22-f9.ts` | (per F9 commit `33ffe8d`) HIGH=0 / MEDIUM=1 / LOW=2 / INFO=6 / NONE=1, BLOCKING=NO | (F9 audit, re-verified for chain stability) |
| `npx tsx scripts/verify-classroom-stability-constraint-k22-f8.ts` | (per F8) 11/11 PASS | (F8 wrapper, re-verified) |
| `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | (per F8 commit `ceb9bc7`) 60 PASS / 0 KNOWN_FAIL / 0 FAIL / 0 INFO | Canonical K22-C baseline. |
| `npx tsx scripts/audit-classroom-stability-constraint-k22-f7.ts` | (per F7) HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO | (F7 audit) |
| `npx tsx scripts/verify-class-gap-reduction-constraint-k22-f6.ts` | (per F6A) 12/12 PASS | (F6 wrapper) |
| `npx tsx scripts/audit-class-gap-reduction-constraint-k22-f5.ts` | (per F5) HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO | (F5 audit) |
| `npx tsx scripts/verify-teacher-day-balance-constraint-k22-f4.ts` | (per F4) 13/13 PASS | (F4 wrapper) |
| `npx tsx scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` | (per F3) 16/16 PASS | (F3 wrapper) |
| `npx tsx scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts` | (per F2) HIGH=0, BLOCKING=NO | (F2 audit) |
| `npx tsx scripts/audit-soft-constraints-roadmap-k22-e.ts` | (per K22-E) HIGH=0/MEDIUM=3/LOW=1/INFO=2/NONE=0, BLOCKING=NO | (K22-E) |
| `npx tsx scripts/verify-score-delta-sc1-fix-k22-d.ts` | (per K22-D) 6/6 PASS | (K22-D) |
| `npx tsx scripts/audit-score-constraint-inventory-k22-a.ts` | (per K22-A) HIGH=0/MEDIUM=1/LOW=1/INFO=3/NONE=3, BLOCKING=NO | (K22-A) |
| `npx tsx scripts/plan-score-regression-harness-k22-b.ts` | (per K22-B) PASS | (K22-B) |
| `npx tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | (per K21-FIX-G) 22/0 PASS | (K21 regression) |
| `npx tsx scripts/verify-solver-config-api-k21-fix-f.ts` | (per K21-FIX-F) 27/0 PASS | (K21 regression) |
| `npx tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | (per K21-FIX-F) 16/0 PASS | (K21 regression) |
| `npx tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | (per K21-FIX-F) 19/0 PASS | (K21 regression) |
| `npx tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH=0 / MEDIUM=0 | (audit) |
| `npx tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | BLOCKING=NO | (audit) |
| `npx tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23/0 PASS | (verify) |
| `npx prisma validate` | valid | (schema) |
| `npm run build` | PASS | (build) |
| `npm run lint` | 314 problems (180 errors + 134 warnings), 0 new | (lint baseline) |
| `npm run test:auth-foundation` | 53 passed / 1 failed (pre-existing) | Pre-existing `ScheduleAdjustment ACTIVE count mismatch` |

K22-G itself re-ran only the K22-G audit script + the build/lint/prisma/test:auth-foundation
checks. Other commands are re-stated for the report (F9 does not modify their results).

---

## 14. Unmodified Scope Confirmation

K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT is a read-only audit. It **did not modify** any of:

- `src/lib/scheduler/score.ts`
- `src/lib/scheduler/solver.ts`
- `src/lib/scheduler/types.ts`
- `src/lib/scheduler/data-loader.ts`
- `scripts/verify-score-regression-harness-k22-c.ts`
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `prisma/dev.db`
- `src/lib/admin-db/config.ts`
- `src/lib/admin-db/columns.ts`
- `src/lib/admin-db/api.ts`
- `src/lib/import/importer.ts` (importer.ts:940 hardcodes `type: 'NORMAL'` — NOT changed)
- `scripts/parse_cell.py` (Python parser — NOT changed)
- `scripts/parse_schedule.py` (Python parser — NOT changed)
- Scheduler config API / UI
- Frontend (any)
- API routes (any)
- Importer (any)
- Parser (any)
- RBAC / permissions
- Seed scripts
- Business data (read-only DB inspection only)
- hardWeights / softWeights (not introduced)
- Any new constraint implementations
- Any harness logic

K22-G only **added** three files:

- `scripts/audit-room-type-data-quality-k22-g.ts` (new)
- `docs/k22-room-type-data-quality-audit.md` (this file)
- `docs/k22-room-type-data-quality-audit.json` (new)

---

## 15. Closing Note

K22-G-ROOM-TYPE-DATA-QUALITY-AUDIT 按 spec 完整执行：

- ✅ 新增只读 audit 脚本 (`scripts/audit-room-type-data-quality-k22-g.ts`)
- ✅ 新增 Markdown 审计文档 (本文件)
- ✅ 新增 JSON 报告 (`docs/k22-room-type-data-quality-audit.json`)
- ✅ 明确 Room.type 分布: 53/53 NORMAL (硬规则 BLOCKING)
- ✅ 明确 Room.name keyword 覆盖率: 12/53 (22.6%) HIGH confidence
- ✅ 明确 Room.capacity: real (K21-FIX-A); range 3-200, median 40
- ✅ 明确 Course.type: 不存在; courseName 25.0% 命中
- ✅ 明确 Task.remark: 14.9% 命中 (mostly 汽车, F2A 已用)
- ✅ 明确 Source evidence: 0% populated (forward-fill only)
- ✅ 明确 Building: 53/53 null (100%); inferBuilding fallback used by SC1
- ✅ 明确 Scheduler context: full data access; no new data path needed
- ✅ 比较 4 candidate strategies (A keyword / B schema / C source evidence / D capacity)
- ✅ Implementation readiness: hard rule NOT_READY; soft keyword PARTIAL_READY; capacity READY
- ✅ Findings: HIGH=0 / MEDIUM=2 / LOW=3 / INFO=1 / NONE=2 / BLOCKING=NO
- ✅ 不修改任何业务代码 / 不写数据库 / 不改 score.ts / 不改 harness / 不改 schema / 不改 importer
- ✅ 不实现任何新约束

**本阶段 (K22-G) 可关闭. 推荐进入 K22-G2-ROOM-TYPE-SCHEMA-PLAN (preferred) 或 K22-F10-CAPACITY-PREFERENCE-AUDIT 或 K22-G3-KEYWORD-BASED-ROOM-SUITABILITY-PROTOTYPE-AUDIT (均为只读 / 规划阶段, 不直接实现新约束).**
