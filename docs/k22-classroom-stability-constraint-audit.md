# K22-F7 Classroom Stability Constraint Audit

| Field | Value |
|---|---|
| Phase | K22-F7-CLASSROOM-STABILITY-AUDIT |
| Type | Read-only design audit (no Prisma writes, no score.ts modifications, no schema changes) |
| Generated | 2026-06-06 |
| Predecessor | K22-F6 / K22-F6A (commit `a545293`) |
| Audit script | `scripts/audit-classroom-stability-constraint-k22-f7.ts` |
| JSON report | `docs/k22-classroom-stability-constraint-audit.json` |
| Project direction | K22-F-SOFT-CONSTRAINTS-IMPLEMENTATION-1 — 第三个 P0 soft constraint (NEW-SC-03 教室稳定性) 的设计审计 |

---

## 1. Background

K22-E (commit `a743bcc`) 识别了 3 个 P0 soft constraints (NEW-SC-01/02/03) 数据已就绪、不需要 schema、LOW 复杂度。
K22-F1 → F4 实施了第一个 (NEW-SC-01 → SC5_TEACHER_DAY_BALANCE), 13/13 PASS.
K22-F5 → F6 实施了第二个 (NEW-SC-02 → SC8_CLASS_GAP_REDUCTION), 12/12 PASS.
本阶段 K22-F7 审计**第三个** P0 (NEW-SC-03 教室稳定性), 不实现。

K22-F7 目标是为 `SC9_TEACHING_TASK_ROOM_STABILITY` 设计清晰、可实现、可验证的 scoring 方案, 让 K22-F8 实施阶段可以严格按设计执行。

---

## 2. Goal

1. 审计当前 `score.ts` 中与 room / task 相关的逻辑（HC1, HC4, SC1, SC4, SC5, SC6, SC7, SC8）
2. 确认 TeachingTask + room + day 信息在 score context 中可访问
3. 比较 4 种业务定义（Candidate A / B / C / D）
4. 推荐一种初版定义
5. 设计 full score 计算方式
6. 设计 delta score 计算方式
7. 设计 penalty 常量和命名
8. 设计 K22-C regression harness 扩展方案（11 cases）
9. 判断与 SC1 / SC2 / SC3 / SC5 / SC7 / SC8 / MIN_PERT / HC1 / HC4 / HC6 的重叠风险
10. 输出 K22-F8 最小实现方案
11. 不实现新 SC 逻辑
12. 不修改 score.ts / schema / DB / solver / API / frontend

---

## 3. Scope

### In scope（只读审计 + 设计）

- `src/lib/scheduler/score.ts` (read-only)
- `src/lib/scheduler/types.ts` (read-only)
- `src/lib/scheduler/data-loader.ts` (read-only)
- `prisma/schema.prisma` (read-only)
- `docs/k22-soft-constraints-roadmap-audit.md` (read-only)
- `docs/k22-class-gap-reduction-constraint-impl.md` (read-only)
- `docs/k22-teacher-day-balance-constraint-impl.md` (read-only)
- `docs/k22-specialty-campus-weekend-constraints-impl.md` (read-only)
- `docs/k22-score-constraint-inventory-audit.md` (read-only)
- `scripts/verify-score-regression-harness-k22-c.ts` (read-only)
- `scripts/verify-class-gap-reduction-constraint-k22-f6.ts` (read-only)
- `scripts/verify-teacher-day-balance-constraint-k22-f4.ts` (read-only)
- `scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` (read-only)
- `scripts/audit-soft-constraints-roadmap-k22-e.ts` (read-only)
- `scripts/audit-class-gap-reduction-constraint-k22-f5.ts` (read-only)
- Prisma read query for DB summary (read-only)

### Out of scope（严禁处理）

- 任何 Prisma 写操作
- 任何 score.ts / solver / scheduler / API / frontend / importer / parser / RBAC 修改
- 任何 schema / migration 修改
- 任何业务数据修改
- 任何新 soft constraint 实施（K22-F8 范围）
- 任何 hardWeights / softWeights 字段
- 任何 UI weight editor
- Specialty classroom matching (K22-G 范围)
- Preferred room / home room schema (Candidate D)

---

## 4. Problem Statement

> 同一课程、同一班级或同一教学任务在多次上课时, 是否应尽量使用相同或较少数量的教室, 从而减少学生和教师频繁换教室, 提高课表稳定性.

K22-F7 评估该约束的可建模性, 并产出最小实现设计.

---

## 5. Data Structure Audit

### 5.1 DB read-only summary (2026-06-06)

| Table | Count |
|---|---:|
| TeachingTask | 308 |
| Tasks with >1 ScheduleSlot | 126 (40.9%) |
| Course | 104 |
| ClassGroup | 36 |
| Room | 53 |
| Room.type distribution | `{"NORMAL": 53}` (100% NORMAL) |
| Room.building distribution | `{"(null)": 53}` (no building data) |

**Observations**:
- 40.9% of teaching tasks have multiple slots → SC9 (per-task room stability) is a meaningful signal.
- All rooms are NORMAL → no specialty classroom matching data → K22-G roadmap concern, not F7.
- All rooms have `building = null` → SC1 / SC4 cross-building penalties are driven by `inferBuilding(room.name)` fallback (per K22-F1 audit).

### 5.2 Per-field audit

| Audit Aspect | Field / Path | Reliable | Notes |
|---|---|:---:|---|
| **Room 识别** | `Room (id, name, building, capacity, type)` | ✅ Yes | score context already loads Room via `SchedulingContext.rooms`; `roomById` Map populated |
| **TeachingTask 识别** | `TeachingTask.id` via `slot.teachingTaskId` | ✅ Yes | 1 task = 1 course/teacher/combination over weekly slots; `slotsByTask` Map already populated |
| **Course 识别** | `TeachingTask.courseId` | ✅ Yes | `slot.teachingTask.course.id` accessible; risk: course split into multiple tasks |
| **ClassGroup 识别** | `TeachingTask.taskClasses[].classGroupId` | ✅ Yes | many-to-many; same pattern as SC8 |
| **room=0 / unscheduled** | `pos.room === 0` | ✅ Yes | skip (same as SC5 / SC6 / SC8) |
| **weekend** | `dayOfWeek in [6, 7]` | ✅ Yes | skip (SC7 owns); does not double-count with SC7 |
| **合班任务** | `task.taskClasses[]` | ✅ Yes | No expansion at task level (per-task key, not per-classGroup key) |
| **Specialty room** | `Room.type` | ❌ N/A | All NORMAL; specialty matching is K22-G roadmap concern |
| **score context 完整性** | `SchedulingContext` | ✅ Yes | `slots`, `slotsByTask`, `assignments`, `originalAssignments` all available; no new index needed |

**结论**: ✅ **所有数据已就绪, 0 schema 变更需求 (for TeachingTask-level stability).**

---

## 6. Definition Candidates

### Candidate A: TeachingTask room stability ★ RECOMMENDED

- **Goal**: 同一 TeachingTask 的多个 slot 尽量使用同一教室.
- **Formula**:
  ```ts
  for each teachingTask:
    rooms = distinct non-zero roomIds of task's slots where day in [1..5]
    if rooms.size <= 1: continue
    penalty = -2 * (rooms.size - 1)
  ```
- **Pros**:
  - Simple, key-stable: `taskId` is the natural primary key from `SchedulingContext.slotsByTask`
  - Aligned with business intent: "同一门课多次上课尽量固定教室"
  - Delta-friendly: only 1 affected key (moved slot's teachingTaskId); O(task slots) per delta
  - No schema change required
  - No new index needed in SchedulingContext (`slotsByTask` already populated)
  - Room diversity is per-task, not per-classGroup: no merge expansion needed
  - Independent of SC1 / SC4 / SC8 keys: orthogonal
- **Cons**:
  - If same course is split into multiple TeachingTasks (e.g. theory + practice), per-task stability won't penalize cross-task room switches (this is intentional — theory and practice legitimately use different rooms)
  - Does not enforce "hard" room stability (still soft)
  - Task with only 1 slot → 0 penalty regardless of room
- **Verdict**: ✅ **RECOMMENDED**

### Candidate B: ClassGroup room stability

- **Goal**: 同一 classGroup 一周内或同一天内尽量使用较少教室.
- **Formula**:
  ```ts
  Option 1: per classGroup across all weekday slots
    rooms = distinct non-zero roomIds of classGroup's slots
    penalty = -X * max(0, rooms.size - allowedRoomCount)
  Option 2: per classGroup + day
    for (cg, day): rooms = distinct roomIds that day
    penalty = -X * max(0, rooms.size - 1)
  ```
- **Pros**:
  - Student experience: 同一班级少换教室
  - Same aggregation pattern as SC8 (classGroup + day)
- **Cons**:
  - ClassGroup attends many different courses; cross-course room diversity is weak signal
  - Per-day aggregation may unfairly penalize classGroups with 3+ courses in one day (each course has different room)
  - Over-penalization may force solver into infeasible scheduling
  - **Conflicts with SC8 dimension**: both key on classGroup, may double-penalize
  - Harder to justify semantically: classes in different subjects SHOULD be in different rooms
- **Verdict**: ❌ **REJECTED** — Cross-course room diversity is weak signal. SC8 already keys on classGroup+day; adding room diversity on same key risks double-counting.

### Candidate C: Course room stability

- **Goal**: 同一 Course 尽量使用同一教室.
- **Formula**:
  ```ts
  for each courseId:
    rooms = distinct non-zero roomIds of all slots where task.courseId === courseId
    if rooms.size <= 1: continue
    penalty = -X * (rooms.size - 1)
  ```
- **Pros**:
  - Cross-task aggregation: if same course is split into multiple TeachingTasks, all share one room
  - Aligns with "专业课程尽量固定教室" business intent
- **Cons**:
  - Course can be split into theory + practice + lab tasks with different room requirements (theory in classroom, practice in lab)
  - Different classGroups on same course may have different capacity needs
  - Cross-task room diversity is often LEGITIMATE
- **Verdict**: ❌ **REJECTED** — Cross-task room diversity is often legitimate. Specialty classroom matching (K22-G roadmap) is the better lever for course-room coupling.

### Candidate D: Preferred room / home room schema

- **Goal**: Add `Course.preferredRoomId`, `ClassGroup.homeRoomId`, `Teacher.preferredRoomIds`, `TeachingTask.preferredRoomId`. SC9 then penalizes slots that don't use the preferred room.
- **Pros**:
  - Business expression most explicit
  - Supports professional classrooms, class home rooms, teacher preferences
- **Cons**:
  - **CRITICAL: requires schema migration, admin UI, seed update, importer changes**
  - Data quality risk: preferredRoomId may be null for most records (no historical data)
  - Schema changes are OUT OF SCOPE for K22-F7 (read-only audit)
  - Better fit for K22-H / K23 roadmap
- **Verdict**: ❌ **REJECTED** — Schema change out of scope. Short-term stability must use existing data only.

### 6.5 推荐: Candidate A

`Candidate A` (TeachingTask-level) 在数据可用性、简单性、delta-friendliness、orthogonality 上一致最优.

---

## 7. Recommended Definition

| Field | Value |
|---|---|
| **Constraint ID** | `SC9_TEACHING_TASK_ROOM_STABILITY` |
| **Name** | 教室稳定性 (per TeachingTask) |
| **Primary key** | `TeachingTask.id` |
| **统计维度** | Per `teachingTaskId` |
| **Aggregation** | Set<roomId> from slots where `room != 0` and `dayOfWeek in [1..5]` |
| **Penalty** | `SOFT_SC9_TEACHING_TASK_ROOM_STABILITY = -2` per extra room |
| **Skip rules** | `room === 0`; `dayOfWeek in [6, 7]`; `distinctRooms.size <= 1`; task with 0 weekday slots |
| **合班处理** | No expansion (per-task key, not per-classGroup key) |

### 7.1 期望示例

| Slot rooms (per task) | distinctRooms | Penalty |
|---|---:|---:|
| {100, 100} | 1 | 0 |
| {100, 200} | 2 | -2 |
| {100, 200, 300} | 3 | -4 |
| {100, 100, 100, 200} | 2 | -2 |
| {100, 0, 0} (one room, two room=0) | 1 | 0 |
| {100, 200} (one day 1, one day 6) | 1 (only day 1 counted) | 0 |
| {100, 200} (both day 6) | 0 (all weekend) | 0 |
| 1 slot only | 1 | 0 |
| task with merged classGroups {1, 2}, 2 slots in rooms {100, 200} | 2 | -2 (no double count) |

### 7.2 Penalty scale 校准

| Constraint | Penalty | Unit |
|---|---:|---|
| SC1 (cross-building) | -5 | per pair |
| SC2 (same task same day) | -10 | per extra slot |
| SC3 (extreme time) | -1 | per slot |
| SC4 (cross-campus) | -5 | per pair |
| SC5 (teacher day balance) | -3 | per excess unit |
| SC6 (auto non-Linxiao) | -20 | per slot |
| SC7 (weekend) | -15 | per slot |
| **SC8 (class gap)** | **-2** | per empty period |
| **SC9 (classroom stability)** | **-2** | per extra room |

**理由**:
- SC9 -2 与 SC8 -2 同量级 (cross-task, cross-period 都是 soft preference)
- 不强于 SC1 -5 (跨楼栋) 或 SC2 -10 (同天多节)
- Linear 缩放: 2 rooms = -2, 3 rooms = -4, 4 rooms = -6
- K22-weights-roadmap 阶段可调

---

## 8. Full Score Design

### 8.1 Algorithm

聚合 per `TeachingTask` 的 `Set<roomId>` from slots where `room != 0` and `day in [1..5]`. 对每个 task with `size > 1`, 加 `-2 * (size - 1)` 到 softScore. Emit `SC9_TEACHING_TASK_ROOM_STABILITY` detail.

### 8.2 Pseudocode

```ts
// ── SC9: 教室稳定性 (K22-F8) ──
// Per teachingTask: collect distinct non-zero roomIds across weekday slots.
// Skip rules: room=0, weekend [6,7], distinctRooms.size <= 1.
const taskRooms = new Map<number, Set<number>>()
for (const slot of positions) {
  if (slot.room === 0) continue
  if (slot.day < 1 || slot.day > 5) continue
  const taskId = slot.teachingTaskId
  let set = taskRooms.get(taskId)
  if (!set) { set = new Set<number>(); taskRooms.set(taskId, set) }
  set.add(slot.room)
}
for (const [taskId, roomSet] of taskRooms) {
  if (roomSet.size <= 1) continue
  const penalty = SOFT_SC9_TEACHING_TASK_ROOM_STABILITY * (roomSet.size - 1)
  softScore += penalty
  details.push({
    type: 'SC9_TEACHING_TASK_ROOM_STABILITY', level: 'SOFT', penalty,
    message: `task ${taskId}: ${roomSet.size} distinct rooms, penalty ${penalty}`,
  })
}
```

### 8.3 Hard/Soft Separation

- SC9 only affects `softScore` / `deltaSoft`
- Never touches `hardScore` / `deltaHard`
- HC1-HC6, SC1-SC8, MIN_PERT unchanged

---

## 9. Delta Score Design

### 9.1 Affected keys

```
Single key: teachingTaskId of moved slot (always 1)
```

(比 SC8 的 `≤ 2 * classGroups.length keys` 更小)

### 9.2 Algorithm

1. 找 moved slot 的 `teachingTaskId`
2. 计算该 task move 前 distinctRooms penalty
3. 计算该 task move 后 distinctRooms penalty
4. `deltaSoft += afterPenalty - beforePenalty`

### 9.3 Helper

```ts
function buildTaskRoomSet(
  taskId: number,
  ctx: SchedulingContext,
  state: ScheduleState,
  excludeSlotId: number,
  overrideDay: number,
  overrideRoomId: number,
): Set<number> {
  const set = new Set<number>()
  for (const slot of ctx.slots) {
    if (slot.id === excludeSlotId) continue
    if (slot.teachingTaskId !== taskId) continue
    const pos = getPos(slot, state)
    if (pos.room === 0) continue
    if (pos.day < 1 || pos.day > 5) continue
    set.add(pos.room)
  }
  if (overrideDay >= 1 && overrideDay <= 5 && overrideRoomId !== 0) {
    set.add(overrideRoomId)
  }
  return set
}
```

### 9.4 Delta Calculation

```ts
// In calculateDeltaScore, after other SCs:
const taskId = slot.teachingTaskId
const beforeRoomSet = buildTaskRoomSet(taskId, ctx, state, slot.id, old.dayOfWeek, old.roomId)
const afterRoomSet = buildTaskRoomSet(taskId, ctx, state, slot.id, move.newDay, move.newRoomId)
const beforePenalty = computeTaskRoomStabilityPenalty(beforeRoomSet) // returns 0 if size <= 1, else -2 * (size-1)
const afterPenalty = computeTaskRoomStabilityPenalty(afterRoomSet)
deltaSoft += afterPenalty - beforePenalty
```

### 9.5 MIN_PERT isolation

F3 / F4 / F6 模式: set `originalAssignments` of moved slot to 3rd position `(dayOfWeek: 9, slotIndex: 1, roomId: 999)`. MIN_PERT fires at both old and new positions, net 0.

### 9.6 Local computation

O(`ctx.slots` per delta) with a smaller constant (1 task's slots only). For typical `ctx.slots ~ 600`, delta is O(600) with filter on `teachingTaskId === taskId` (usually 1-3 slots).

---

## 10. Constraint Interaction

| Constraint | Overlap with SC9 | Recommendation |
|---|---|---|
| **HC1** (room conflict) | Different key (room-day-slot pair); SC9 cannot introduce HC1 (solver can't pick taken room) | No change |
| **HC4** (capacity) | Different key (room capacity vs task); SC9 cannot introduce HC4 | No change |
| **HC6 / SC6** (Linxiao auto) | Different key (task.classification vs task room diversity) | No change |
| **SC1** (cross-building) | Different key (pair detection); SC9 may align with SC1 if same task in same building | No change |
| **SC4** (cross-campus) | Different key (pair detection); SC9 may align with SC4 | No change |
| **SC8** (class gap) | Different key (classGroup-day vs task); SC8 = time, SC9 = room; complementary | No change |
| **MIN_PERT** | Independent; isolated via 3rd-position originalAssignments | No change |

**No conflicts**. SC9 keys by `TeachingTask.id` — distinct from all existing keys.

---

## 11. K22-C Harness Plan (11 cases, F7 design)

If F7 is approved, F8 implementation will add Harness I with these cases. F7 design only.

| ID | Category | Title | Expected |
|---|---|---|---|
| SC9-TASK-ROOM-STABILITY-SAME-ROOM | full | 1 task, 2 slots in same room | soft=0 (distinct=1) |
| SC9-TASK-ROOM-STABILITY-TWO-ROOMS | full | 1 task, 2 slots in different rooms | soft=-2 (distinct=2) |
| SC9-TASK-ROOM-STABILITY-THREE-ROOMS | full | 1 task, 3 slots in 3 rooms | soft=-4 (distinct=3) |
| SC9-TASK-ROOM-STABILITY-SINGLE-SLOT | full | 1 task, 1 slot | soft=0 (no diversity) |
| SC9-TASK-ROOM-STABILITY-ROOM_ZERO-SKIP | edge | 1 task, 2 slots: 1 room 100 + 1 room 0 | soft=0 (room=0 skipped) |
| SC9-TASK-ROOM-STABILITY-WEEKEND-SKIP | edge | 1 task, 2 slots: 1 day 1 + 1 day 6 | soft=0 (weekend skipped) |
| SC9-TASK-ROOM-STABILITY-MULTI-CLASSGROUP | merged-class | 1 merged task (cg{1,2}), 2 slots in 2 rooms | soft=-2 (no double count) |
| SC9-DELTA-IMPROVE-TWO-ROOMS-TO-ONE | delta | 2 rooms → 1 room | deltaSoft=+2 |
| SC9-DELTA-WORSEN-ONE-ROOM-TO-TWO | delta | 1 room → 2 rooms | deltaSoft=-2 |
| SC9-DELTA-ROOM_ZERO-TO-REAL | delta | room=0 → real room | deltaSoft=-2 |
| SC9-DELTA-REAL-TO-ROOM_ZERO | delta | real room → room=0 | deltaSoft=+2 |

**Coverage**:
- ✅ same room (baseline)
- ✅ two rooms (small diversity)
- ✅ three rooms (large diversity)
- ✅ single slot (no diversity possible)
- ✅ room=0 skip
- ✅ weekend skip
- ✅ multi-classGroup (no double count at task level)
- ✅ delta improve (positive)
- ✅ delta worsen (negative)
- ✅ delta room=0 ↔ real (skip semantics in delta)

---

## 12. Findings Summary

| ID | Severity | Title |
|---|---|---|
| K22-F7-A-1 | INFO | TeachingTask + room + day 全部在 SchedulingContext 中可用 |
| K22-F7-B-1 | NONE | Candidate A (TeachingTask-level) 是推荐方案 |
| K22-F7-C-1 | MEDIUM | 推荐 -2 per extra room, 与 SC8 / SC5 同量级 |
| K22-F7-D-1 | LOW | room=0, weekend, task 1 slot, 0 weekday slots 全部应 skip |
| K22-F7-E-1 | LOW | SC9 与 HC1/HC4/HC6/SC1/SC4/SC8/MIN_PERT 全部独立 |
| K22-F7-F-1 | LOW | Delta 设计 = single-task before/after, 与 F4/F6 模式一致 |
| K22-F7-G-1 | INFO | Specialty classroom (K22-G) 和 preferred room (Candidate D) 不在 F7 范围 |
| K22-F7-H-1 | NONE | K22-F7 audit 满足 spec 范围, 不修改 score.ts / schema / DB |

**Summary: HIGH=0 / MEDIUM=1 / LOW=3 / INFO=2 / NONE=2 / BLOCKING=NO**

**BLOCKING=NO**: 0 个 HIGH finding. 1 个 MEDIUM finding (penalty scale 校准) 是设计期调参关注点, 不阻塞 F8 实施.

---

## 13. Suggested Next Stage

**阶段名**: **K22-F8-CLASSROOM-STABILITY-IMPL**

**范围**:
1. 在 `score.ts` 中实现 `SC9_TEACHING_TASK_ROOM_STABILITY`:
   - `const SOFT_SC9_TEACHING_TASK_ROOM_STABILITY = -2`
   - `function computeTaskRoomStabilityPenalty(rooms: Set<number>): number` (纯函数)
   - `function buildTaskRoomSet(taskId, ctx, state, excludeSlotId, overrideDay, overrideRoomId): Set<number>` (shared for full + delta)
   - `calculateScoreWithDetails` 中新增 SC9 段
   - `calculateDeltaScore` 中新增 SC9 delta 段 (single-task before/after)
2. 在 K22-C verify 脚本中新增 11 个 SC9 regression cases (Harness I)
3. 新增 `scripts/verify-classroom-stability-constraint-k22-f8.ts` (F8 wrapper, 预计 11-15 cases)
4. 更新 `docs/k22-score-default-snapshot.json` (default fixture 不触发 SC9 — 同一 task 在不同 slot 不会换 room in the synthetic 3-task fixture)
5. 更新 K22-A audit + K22-C implementation 文档

**不包含**:
- ❌ Specialty classroom matching (K22-G 范围)
- ❌ Preferred room / home room schema (Candidate D)
- ❌ 调整现有 SC1 / SC5 / SC8 penalty
- ❌ 实施 Course-level 或 ClassGroup-level stability (Candidate B / C)
- ❌ HardWeights / softWeights 字段
- ❌ 同时实施其他软约束

---

## 14. Unmodified Scope (K22-F7)

- ✅ Prisma schema: unchanged
- ✅ `prisma/migrations/**`: unchanged
- ✅ `prisma/dev.db`: read-only query (DB summary count + room type distribution)
- ✅ solver algorithm: unchanged
- ✅ scheduler config API/UI: unchanged
- ✅ frontend: unchanged
- ✅ API routes: unchanged
- ✅ importer/parser: unchanged
- ✅ RBAC: unchanged
- ✅ seed/业务数据: unchanged
- ✅ hardWeights/softWeights: not introduced
- ✅ K22-C harness implementation (A-H): not modified
- ✅ F6 wrapper / F5 audit script: not modified
- ✅ SC1 / SC2 / SC3 / SC5 / SC6 / SC7 / SC8 / MIN_PERT 现有逻辑: not modified
- ✅ Specialty classroom (K22-G): not implemented
- ✅ Preferred room schema (Candidate D): not implemented

---

## 15. Verification Results

| Command | Result |
|---|---|
| `npx tsx scripts/audit-classroom-stability-constraint-k22-f7.ts` | **PASS** — HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO, 11 harness cases planned |
| `npx tsx scripts/verify-class-gap-reduction-constraint-k22-f6.ts` | (per F6A) 12/12 PASS |
| `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | (per F6A) 49/0/0/0 PASS |
| `npx tsx scripts/audit-class-gap-reduction-constraint-k22-f5.ts` | (per F5) HIGH=0/MEDIUM=1/LOW=3/INFO=2/NONE=2, BLOCKING=NO |
| `npx tsx scripts/verify-teacher-day-balance-constraint-k22-f4.ts` | (per F4) 13/13 PASS |
| `npx tsx scripts/verify-specialty-campus-weekend-constraints-k22-f3.ts` | (per F3) 16/16 PASS |
| `npx tsx scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts` | (per F2) HIGH=0, BLOCKING=NO |
| `npx tsx scripts/audit-soft-constraints-roadmap-k22-e.ts` | (per K22-E) HIGH=0/MEDIUM=3/LOW=1/INFO=2/NONE=0, BLOCKING=NO |
| `npx tsx scripts/verify-score-delta-sc1-fix-k22-d.ts` | (per K22-D) PASS — 6/6 checks |
| `npx tsx scripts/audit-score-constraint-inventory-k22-a.ts` | (per K22-A) HIGH=0, BLOCKING=NO |
| `npx tsx scripts/plan-score-regression-harness-k22-b.ts` | (per K22-B) PASS |
| `npx tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | (per K21-FIX-G) 22/0 |
| `npx tsx scripts/verify-solver-config-api-k21-fix-f.ts` | (per K21-FIX-F) 27/0 |
| `npx tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | (per K21-FIX-F) 16/0 |
| `npx tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | (per K21-FIX-F) 19/0 |
| `npx tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH=0/MEDIUM=0 |
| `npx tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | BLOCKING=NO |
| `npx tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23/0 |
| `npx prisma validate` | valid |
| `npm run build` | PASS |
| `npm run lint` | 314 problems (180 errors + 134 warnings), 0 new |
| `npm run test:auth-foundation` | 53 passed / 1 failed (pre-existing) |

---

## 16. Closing Note

K22-F7-CLASSROOM-STABILITY-AUDIT 按 spec 完整执行：

- ✅ 新增只读 audit 脚本 (`scripts/audit-classroom-stability-constraint-k22-f7.ts`)
- ✅ 新增 Markdown audit 文档 (本文件)
- ✅ 新增 JSON audit 报告 (`docs/k22-classroom-stability-constraint-audit.json`)
- ✅ DB read-only summary: 308 TeachingTask, 126 with >1 slot (40.9%), 53 rooms (all NORMAL), 0 building data
- ✅ 审计 8 个数据维度 (Room, TeachingTask, Course, ClassGroup, room=0, weekend, merged-class, score context) 全部 reliable
- ✅ 比较 4 个候选定义 (A TeachingTask-level / B ClassGroup / C Course / D Schema extension)
- ✅ 推荐 Candidate A: TeachingTask-level, penalty = -2 per extra room
- ✅ 设计 full score 2-step 算法
- ✅ 设计 delta score 3-step 算法 (single-key, O(ctx.slots) per delta, 比 SC8 更简单)
- ✅ 分析 7 个约束交互 (HC1, HC4, HC6, SC1, SC4, SC8, MIN_PERT) — 0 conflict
- ✅ 设计 11 个 K22-C harness cases (7 full + 4 delta)
- ✅ 明确数据已就绪 (0 schema change 需求 for F8)
- ✅ 明确 K22-F8 实施范围 (只 SC9，不调整其他 SC，不引入 weights)
- ✅ Specialty classroom (K22-G) 和 preferred room schema 明确不在 F7 范围
- ✅ 不修改 DB / schema / score.ts / solver / API / frontend / importer / parser / RBAC
- ✅ 工作区状态：仅新增 3 个 K22-F7 文件

**本阶段可关闭, 推荐进入 K22-F8-CLASSROOM-STABILITY-IMPL (实施 SC9_TEACHING_TASK_ROOM_STABILITY full + delta in score.ts, 复用 K22-F4/F6 fixture builder pattern, 不同时实施其他软约束).**
