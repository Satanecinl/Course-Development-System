# K22-F2 Specialty Campus Weekend Constraint Audit

| Field | Value |
|---|---|
| Phase | K22-F2-SPECIALTY-CAMPUS-WEEKEND-CONSTRAINT-AUDIT |
| Type | Read-only design audit (no Prisma writes, no score.ts modifications, no schema changes) |
| Generated | 2026-06-06 |
| Predecessor | K22-F1A-TEACHER-DAY-BALANCE-DEFINITION-CORRECTION (commit `9a15cce docs(scheduler): clarify teacher day balance definition`) |
| Audit script | `scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts` |
| JSON report | `docs/k22-specialty-campus-weekend-constraints-audit.json` |
| Project direction | K22-F2 business-constraint audit — 汽车专业 / 林校教室 / 周末 |

---

## 1. Background

K22-F1A (commit `9a15cce`) 完成了 SC5 教师工作日均衡的修正定义。
原计划下一阶段是 K22-F2-SOFT-CONSTRAINT-TEACHER-DAY-BALANCE-IMPL（实施 SC5）。

但本阶段插入了 3 个**业务硬约束**：

1. **汽车专业学生优先全放在林校的教室**（业务偏好）
2. **其他专业学生不得放到林校的教室**（业务硬禁止）
3. **周末一般不排课**（业务偏好）

这些业务约束比 SC5 更影响排课正确性，因此本阶段**先做只读审计**（K22-F2），不直接实施 SC5。

---

## 2. Goal

1. 审计当前数据中如何识别"汽车专业"
2. 审计当前数据中如何识别"林校教室"
3. 审计当前数据中如何识别周末
4. 判断 3 类约束的 hard / soft 边界
5. 设计 full score / delta score 方案
6. 设计 regression harness 方案
7. 输出推荐实施阶段顺序
8. 不实现新约束，不修改 DB / schema / score.ts

---

## 3. Scope

### In scope（只读设计）

- `prisma/schema.prisma` (read-only)
- `prisma/dev.db` (read query only, no writes)
- `src/lib/scheduler/score.ts` (read-only)
- `src/lib/scheduler/**` (read-only)
- `src/lib/solver/**` (read-only)
- `docs/k22-*.md` (read-only)
- `scripts/**` (read-only)
- `package.json` (read-only)

### Out of scope（严禁处理）

- 任何 Prisma 写操作
- 任何 score.ts / solver / scheduler / API / frontend / importer / parser / RBAC 修改
- 任何 schema / migration 修改
- 任何业务数据修改
- 任何新约束实施（K22-F3 范围）
- 任何 UI / admin form 扩展

---

## 4. Data Readiness

### 4.1 DB read-only summary (2026-06-06)

| Table | Count |
|---|---:|
| ClassGroup | 36 |
| Course | 104 |
| Room | 53 |
| ScheduleSlot | 440 |
| TeachingTask | 308 |

### 4.2 Specialty (汽车专业) detection

- **Method**: regex-based on `ClassGroup.name`, `Course.name`, `TeachingTask.remark`
- **Keywords**: `["汽车", "车辆", "新能源", "智能网联", "汽修"]`
- **Detected**: **6 automotive class groups** (e.g., `2024级汽车制造与试验技术1班`, `2025级智能网联汽车技术`)
- **Default rule**: any single automotive signal (classGroup, courseName, remark) triggers automotive classification
- **Schema status**: NO Department / major / specialty field. Department model was dropped from initial migration.

### 4.3 Linxiao (林校) room detection

- **Method**: regex-based on `Room.name` and `Room.building`
- **Keywords**: `["林校"]` (strict, no single-character "林" to avoid false matches)
- **Detected**: **10 Linxiao rooms** (e.g., `林校305`, `林校304`)
- **Python parser**: existing regex `r'林校\s*\d+'` (scripts/parse_cell.py:9) — same pattern, can be reused
- **Schema status**: Room.building is nullable, no Room.campus field

### 4.4 Weekend (周末) distribution

- **Convention**: `dayOfWeek 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun`
- **Weekend slots (dayOfWeek 6/7)**: 21 (4.8% of total)
- **Weekday slots (dayOfWeek 1-5)**: 419
- **Day distribution**: `{1: 95, 2: 70, 3: 82, 4: 94, 5: 78, 6: 11, 7: 10}`
- **Implication for SC7**: 21 existing weekend slots will all be penalized after SC7 impl. Solver may need to move them but is constrained by HC1-HC5.

---

## 5. Constraint A: Automotive Prefers Linxiao (汽车专业优先林校)

| Field | Value |
|---|---|
| **Business description** | 汽车专业学生优先全放在林校的教室。 |
| **Type** | **SOFT** (preference, not absolute) |
| **Constraint code** | `SC6_AUTOMOTIVE_PREFERS_LINXIAO` |
| **Penalty** | `-20` per slot (high; higher than SC1-SC4) |
| **Skip rules** | Task not automotive; room not Linxiao; Linxiao room unavailable; task without classGroup |
| **Data ready** | ✅ Yes (6 automotive class groups identified) |
| **Schema needed** | ❌ No (regex-based detection) |

**Rationale**: "优先" 是 soft 偏好，不是绝对 hard。如果林校教室容量不足，solver 仍应能生成可行课表。Penalty 应较高 (-20) 以超过 SC1-SC4 任何一个。

---

## 6. Constraint B: Non-Automotive Forbidden in Linxiao (非汽车专业不得进林校)

| Field | Value |
|---|---|
| **Business description** | 其他专业学生不得放到林校的教室。 |
| **Type** | **HARD** (absolute prohibition) |
| **Constraint code** | `HC6_NON_AUTOMOTIVE_FORBID_LINXIAO` |
| **Penalty** | `-1000` (standard HARD_PENALTY, same as HC1-HC5) |
| **Skip rules** | Task classified as automotive; mixed automotive+non-auto task (treat as automotive); room not Linxiao |
| **Data ready** | ✅ Yes (6 automotive class groups + 10 Linxiao rooms) |
| **Schema needed** | ❌ No (regex-based detection) |

**Rationale**: "不得" 是 hard 绝对禁止。Solver 必须保证可行性 — 如果林校教室不足以容纳所有非汽车任务，应 fail 早返回而不是生成违反排课。

**Naming note**: 原 HC6_LOCKED_SLOT_MOVED 在 score.ts 中是 skeleton（K22-A-E-2 提到该 skeleton 故意不计分）。本约束命名 `HC6_NON_AUTOMOTIVE_FORBID_LINXIAO` 与原 HC6 是不同 id，不冲突。

---

## 7. Constraint C: Weekend Avoidance (周末一般不排课)

| Field | Value |
|---|---|
| **Business description** | 周末一般不排课。 |
| **Type** | **SOFT** (preference, "一般" implies not absolute) |
| **Constraint code** | `SC7_WEEKEND_AVOIDANCE` |
| **Penalty** | `-15` per slot |
| **Skip rules** | dayOfWeek in [1-5] (Mon-Fri); task with manual weekend exception (future schema) |
| **Data ready** | ✅ Yes (dayOfWeek field always available) |
| **Schema needed** | ❌ No (dayOfWeek-based) |

**Rationale**: "一般" 是 soft 偏好。dayOfWeek 6/7 表示周六/周日。Solver 应尽量避免周末排课，但允许 manual override。K22-F2 不修改 RoomAvailability / candidate slots 层。

---

## 8. Mixed / Ambiguous Cases

| Case | Classification | Recommendation | Reason |
|---|---|---|---|
| TeachingTask 同时关联汽车 + 非汽车班 (合班) | MIXED | Treat as automotive (any classGroup automotive → task automotive) | 合班是高校常见; 简单"automotive only"会让合班任务无法进林校. 保守地 treat as automotive 让 solver 倾向把合班放林校 |
| 课程名含"汽车"但班级不是汽车专业 | AMBIGUOUS_COURSE | Any single signal (courseName OR classGroup) triggers automotive | 有些课程是"汽车概论"公共课，但非汽车班学生选修. 包含课程名 keyword 仍 treat as automotive 更安全 |
| 班级名含"汽车"但课程是公共课 (e.g. 高等数学) | AMBIGUOUS_CLASS | ClassGroup signal: if classGroup automotive, treat as automotive | 汽车班学生选公共课在林校教室仍然合理. SC6 preference 不在意课程内容, 只在意学生是谁 |
| 林校 room 识别不明确 (name 中含"林"但不是"林校") | AMBIGUOUS_ROOM | Strict keyword "林校" only. Single-character "林" too risky | 保守策略: 只匹配"林校" (multi-char). Single "林" 风险高 |
| 任务无 classGroup | UNKNOWN | Skip automotive rules. Treat as non-automotive for HC6 (conservative) | 无 classGroup signal, 无法判断 specialty. K22-F2 假设保守地 treat as non-automotive |
| TeachingTask 含 remark "汽车专业" 但 classGroup 不是汽车 | AMBIGUOUS_REMARK | Use remark signal: if remark contains automotive keyword, treat as automotive | Remark 是教务 manual 输入, 通常准确. Trust remark as authoritative |
| 公共课 task 关联 multiple classGroups (其中一个是汽车) | MIXED | Same as case 1: any automotive classGroup → automotive | 合班统一规则 |

---

## 9. Full Score Design

### 9.1 Algorithm

```ts
const AUTOMOTIVE_KEYWORDS = ['汽车', '车辆', '新能源', '智能网联', '汽修']

const isAutomotive = (task) => {
  const allClassNames = task.taskClasses.map(tc => tc.classGroup.name).join(',')
  if (AUTOMOTIVE_KEYWORDS.some(kw => allClassNames.includes(kw))) return true
  if (AUTOMOTIVE_KEYWORDS.some(kw => task.course?.name?.includes(kw) ?? false)) return true
  if (task.remark && AUTOMOTIVE_KEYWORDS.some(kw => task.remark.includes(kw))) return true
  return false
}

const isLinxiaoRoom = (room) =>
  room.name.includes('林校') || (room.building && room.building.includes('林校'))

for (const p of positions) {
  if (p.room === 0) continue
  const task = p.slot.teachingTask
  const room = ctx.roomById.get(p.room)
  if (!room) continue
  const auto = isAutomotive(task)
  const lx = isLinxiaoRoom(room)

  // SC6: automotive prefers Linxiao
  if (auto && !lx) {
    softScore += -20
    details.push({ type: 'SC6_AUTOMOTIVE_PREFERS_LINXIAO', level: 'SOFT', penalty: -20, ... })
  }

  // HC6: non-automotive forbidden in Linxiao
  if (!auto && lx) {
    hardScore += -1000
    details.push({ type: 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO', level: 'HARD', penalty: -1000, ... })
  }

  // SC7: weekend avoidance
  if (p.day === 6 || p.day === 7) {
    softScore += -15
    details.push({ type: 'SC7_WEEKEND_AVOIDANCE', level: 'SOFT', penalty: -15, ... })
  }
}
```

### 9.2 Properties

- **Complexity**: O(n) where n = number of slots
- **Details emitted**: per-slot detail for each violation
- **Iteration**: single pass through positions

---

## 10. Delta Score Design

### 10.1 Algorithm

```ts
const task = slot.teachingTask
const auto = isAutomotive(task)  // static, doesn't change with move

// BEFORE
let beforeHard = 0, beforeSoft = 0
if (old.roomId !== 0) {
  const oldRoom = ctx.roomById.get(old.roomId)
  if (oldRoom) {
    const lx = isLinxiaoRoom(oldRoom)
    if (!auto && lx) beforeHard += -1000  // HC6
    if (auto && !lx) beforeSoft += -20     // SC6
  }
}
if (old.dayOfWeek === 6 || old.dayOfWeek === 7) beforeSoft += -15  // SC7

// AFTER
let afterHard = 0, afterSoft = 0
if (move.newRoomId !== 0) {
  const newRoom = ctx.roomById.get(move.newRoomId)
  if (newRoom) {
    const lx = isLinxiaoRoom(newRoom)
    if (!auto && lx) afterHard += -1000
    if (auto && !lx) afterSoft += -20
  }
}
if (move.newDay === 6 || move.newDay === 7) afterSoft += -15

deltaHard += afterHard - beforeHard
deltaSoft += afterSoft - beforeSoft
```

### 10.2 Properties

- **Complexity**: O(1) per move (single slot)
- **Affected slot**: only the moved slot
- **Hard impact**: only HC6 (non-automotive → Linxiao) changes deltaHard
- **Soft impact**: SC6 (automotive → non-Linxiao) + SC7 (weekday → weekend) change deltaSoft

---

## 11. Regression Harness Plan

| Case | Purpose | Expected |
|---|---|---|
| SC6-HAPPY | Automotive task in Linxiao → no penalty | hard=0, soft=0 |
| SC6-VIOLATION | Automotive task in non-Linxiao → soft penalty | hard=0, soft=-20 |
| HC6-VIOLATION | Non-automotive in Linxiao → hard penalty | hard=-1000, soft=0 |
| HC6-HAPPY | Non-automotive in non-Linxiao → no penalty | hard=0, soft=0 |
| MIXED-AMBIGUOUS | Mixed automotive+non-auto in Linxiao → exempt (automotive) | hard=0, soft=0 |
| SC7-WEEKEND | Weekend slot → soft penalty | hard=0, soft=-15 |
| SC7-WEEKDAY | Weekday slot → no penalty | hard=0, soft=0 |
| DELTA-RESOLVE-AUTOMOTIVE | Move automotive from non-Linxiao to Linxiao | deltaSoft=+20 |
| DELTA-INTRODUCE-NON-AUTOMOTIVE | Move non-automotive to Linxiao | deltaHard=-1000 |
| DELTA-MIXED-NON_LINXIAO-TO-LINXIAO (K22-F2A) | Move MIXED to Linxiao | deltaHard=-1000 |
| DELTA-WEEKDAY-TO-WEEKEND | Move from weekday to weekend | deltaSoft=-15 |

---

## 11A. K22-F2A Classification Correction

> **Stage**: K22-F2A-SPECIALTY-CAMPUS-CLASSIFICATION-CORRECTION
> **Status**: K22-F2 had a classification contradiction that violated the "非汽车专业不得放到林校" hard rule. K22-F2A unifies the classification.

### 11A.1 Original problem

K22-F2's mixed case decision table said:

> "Use 'any automotive classGroup triggers automotive classification' rule. Task automotive if any classGroup is automotive."

Combined with `K22-F2 original: any single signal triggers automotive`, this caused:

- **Mixed 合班 in Linxiao → expected hard=0** (K22-F2 MIXED-AMBIGUOUS case). This means a teaching task with one automotive class and one non-automotive class could go to Linxiao, **putting non-automotive students in Linxiao**.
- **courseName 含 "汽车" 但 classGroup 全是非汽车 → expected automotive**. A non-automotive class taking a "汽车概论" public elective could go to Linxiao.
- **remark 含 "汽车专业" 但 classGroup 全是非汽车 → expected automotive**. A remark typo / stale text would let a non-automotive task sneak into Linxiao.

All three contradict the business hard rule "其他专业学生不得放到林校".

### 11A.2 Corrected 5-class classification

K22-F2A unified the specialty classification into 5 classes, with `classGroup membership` as the primary hard-rule signal and `courseName` / `remark` as auxiliary flags only:

| Class | Trigger | HC6 in Linxiao | SC6 out of Linxiao |
|---|---|---|---|
| `AUTOMOTIVE_ONLY` | all classGroups are automotive | no penalty | -20 (soft preference) |
| `NON_AUTOMOTIVE_ONLY` | all classGroups are non-automotive | -1000 (hard) | no penalty |
| `MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE` | at least one classGroup is automotive AND at least one is non-automotive | **-1000 (hard)** | no penalty |
| `NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL` | no classGroup, but courseName/remark contains automotive keyword | manual review / conservative HC6 | manual review |
| `UNKNOWN_NO_SIGNAL` | no classGroup, no automotive signal | conservative HC6 or manual review | no penalty |

### 11A.3 Signal priority

1. **Primary hard-rule signal**: `TeachingTaskClass` / `ClassGroup` membership. Determines if a task is AUTOMOTIVE_ONLY / NON_AUTOMOTIVE_ONLY / MIXED.
2. **Auxiliary soft signals**: `Course.name` and `TeachingTask.remark`. Recorded in detail messages for human review. **CANNOT override HC6 hard rule**.
3. **Manual exception**: Future K22-H schema extension can add explicit override field for specific 合班 exemptions approved by 教务处.

### 11A.4 Corrected harness expectations (K22-F2A)

| Case | Old Expected (K22-F2) | New Expected (K22-F2A) |
|---|---|---|
| MIXED-LINXIAO (was MIXED-AMBIGUOUS) | hard=0, soft=0 | **hard=-1000, soft=0** |
| COURSE_NAME_AUTO-BUT-NON_AUTO_CLASS-LINXIAO | (not in plan) | hard=-1000 |
| REMARK_AUTO-BUT-NON_AUTO_CLASS-LINXIAO | (not in plan) | hard=-1000 |
| DELTA-MIXED-NON_LINXIAO-TO-LINXIAO | (not in plan) | deltaHard=-1000 |

The old `MIXED-AMBIGUOUS in Linxiao → hard=0, soft=0` case was **removed** (it would have allowed non-automotive students into Linxiao via mixed 合班, violating the business hard rule).

### 11A.5 JSON field updates

The audit JSON now includes a top-level `classificationPolicy` block:

```json
{
  "classificationPolicy": {
    "primaryHardSignal": "classGroupMembership",
    "auxiliarySignals": ["courseName", "remark"],
    "mixedAutomotiveAndNonAutomotive": "HC6_HARD_VIOLATION_IN_LINXIAO",
    "anySingleSignalTriggersAutomotive": false,
    "courseNameCannotOverrideClassGroup": true,
    "remarkCannotOverrideClassGroup": true
  }
}
```

A new finding `K22-F2A-CLASSIFICATION-1` (MEDIUM severity) documents the correction and recommends K22-F3 follow the corrected scheme.

### 11A.6 Next stage implementation guidance

`K22-F3-SPECIALTY-CAMPUS-WEEKEND-CONSTRAINT-IMPL` must use the K22-F2A 5-class classification. Any future specialty modifications must preserve:
- (a) classGroup membership dominates as the hard-rule signal
- (b) MIXED in Linxiao triggers HC6 (not exempt)
- (c) courseName / remark are auxiliary only — record in detail messages for human review, do not change HC6 verdict

---

## 12. Findings Summary

| ID | Severity | Title |
|---|---|---|
| K22-F2-A-1 | LOW | 汽车专业识别 — regex-based on ClassGroup.name / Course.name / TeachingTask.remark |
| K22-F2-B-1 | NONE | 林校教室识别 — regex-based on Room.name / Room.building (10 rooms identified) |
| K22-F2-C-1 | INFO | 周末排课当前分布 — 21 weekend slots (4.8% of total) |
| K22-F2-D-1 | LOW | Mixed/ambiguous case decision table — 7 cases covered (K22-F2A corrected) |
| K22-F2-E-1 | LOW | 3 constraints overall data readiness: READY |
| K22-F2A-CLASSIFICATION-1 | MEDIUM | K22-F2A 修正 specialty 分类策略 — classGroup membership 是 hard rule 主信号，courseName / remark 不能覆盖 |

**Summary: HIGH=0 / MEDIUM=1 / LOW=3 / INFO=1 / NONE=1 / BLOCKING=NO**

The single MEDIUM finding is the K22-F2A correction itself — it documents that K22-F2's original classification had a contradiction that would have allowed non-automotive students into Linxiao. The correction is now in place; K22-F3 must follow it. BLOCKING=NO.

---

## 13. Suggested Next Stage

**阶段名**: **K22-F2A-DATA-READINESS-CONFIRMATION** (small pre-step, optional but recommended)

- **范围**: Confirm with 教务处 that 6 detected automotive class groups are complete and correct. Verify 10 Linxiao rooms (manual review if needed).
- **不包含**: No code changes. No DB writes.

**Then**: **K22-F3-SPECIALTY-CAMPUS-WEEKEND-CONSTRAINT-IMPL**

- **范围**:
  1. Implement `SC6_AUTOMOTIVE_PREFERS_LINXIAO` in `calculateScoreWithDetails` + `calculateDeltaScore`
  2. Implement `HC6_NON_AUTOMOTIVE_FORBID_LINXIAO` in `calculateScoreWithDetails` + `calculateDeltaScore`
  3. Implement `SC7_WEEKEND_AVOIDANCE` in `calculateScoreWithDetails` + `calculateDeltaScore`
  4. Extend K22-C regression harness with 10 new cases
  5. Update K22-A audit + K22-F1A docs
- **不包含**:
  - ❌ No schema migration (regex-based detection only)
  - ❌ No Department model re-introduction
  - ❌ No Room.campus field
  - ❌ No UI changes
  - ❌ No admin form changes
  - ❌ No hardWeights/softWeights (K22-weights-roadmap 范围)
  - ❌ No SC5 (teacher day balance) — 留 K22-F4+

---

## 14. Unmodified Scope (K22-F2)

- ✅ 未修改 Prisma schema
- ✅ 未修改 `prisma/migrations/**`
- ✅ 未修改 `prisma/dev.db`（仅 read query for summary）
- ✅ 未运行 `db push` / `migrate` / `reset` / `seed`
- ✅ 未修改 score.ts
- ✅ 未修改 solver algorithm
- ✅ 未修改 scheduler implementation
- ✅ 未修改 API route
- ✅ 未修改 frontend
- ✅ 未修改 importer / parser
- ✅ 未修改 RBAC / permissions
- ✅ 未修改业务数据
- ✅ 未提交 DB backup
- ✅ 未实施新约束
- ✅ 未引入 hardWeights / softWeights
- ✅ 未引入 UI / admin form 扩展

---

## 15. Verification Results

| Script / Command | Result |
|---|---|
| `npx.cmd tsx scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts` | **PASS** — HIGH=0 / MEDIUM=0 / LOW=3 / INFO=1 / NONE=1 / BLOCKING=NO; 6 automotive classes, 10 Linxiao rooms, 21 weekend slots |
| `npx.cmd tsx scripts/audit-teacher-day-balance-soft-constraint-k22-f1.ts` | (per K22-F1A) PASS — HIGH=0/MEDIUM=1/LOW=2/INFO=1/BLOCKING=NO |
| `npx.cmd tsx scripts/audit-soft-constraints-roadmap-k22-e.ts` | (per K22-E) PASS |
| `npx.cmd tsx scripts/verify-score-delta-sc1-fix-k22-d.ts` | (per K22-D) PASS — 6/6 checks |
| `npx.cmd tsx scripts/verify-score-regression-harness-k22-c.ts` | (per K22-C) PASS — 17/0/0/0 |
| `npx.cmd tsx scripts/audit-score-constraint-inventory-k22-a.ts` | (per K22-D) PASS — HIGH=0/BLOCKING=NO |
| `npx.cmd tsx scripts/plan-score-regression-harness-k22-b.ts` | (per K22-B) PASS |
| `npx.cmd tsx scripts/verify-solver-config-ui-k21-fix-g.ts` | (per K21-FIX-G) 22/0 |
| `npx.cmd tsx scripts/verify-solver-config-api-k21-fix-f.ts` | (per K21-FIX-F) 27/0 |
| `npx.cmd tsx scripts/verify-solver-config-preview-k21-fix-f.ts` | (per K21-FIX-F) 16/0 |
| `npx.cmd tsx scripts/verify-solver-config-snapshot-k21-fix-f.ts` | (per K21-FIX-F) 19/0 |
| `npx.cmd tsx scripts/audit-solver-config-ui-k21-fix-d.ts` | (per K21-FIX-G-AUDIT) MEDIUM=1/LOW=2/NONE=4 |
| `npx.cmd tsx scripts/audit-room-capacity-and-solver-config-k21-fix-a.ts` | (per K21-FIX-A) HIGH=0 |
| `npx.cmd tsx scripts/audit-remaining-risk-rebase-k20.ts` | (per K20) HIGH=0 |
| `npx.cmd tsx scripts/verify-source-evidence-schema-k20-fix-b.ts` | 37/0 |
| `npx.cmd tsx scripts/verify-source-evidence-importer-k20-fix-b.ts` | 41/0 |
| `npx.cmd tsx scripts/verify-source-evidence-query-k20-fix-b.ts` | 16/0 |
| `npx.cmd tsx scripts/audit-source-evidence-backfill-gap-k20-fix-b.ts` | 2/0 |
| `npx.cmd tsx scripts/verify-import-approval-browser-e2e-k19-fix-c.ts` | 9/0/1 SKIP |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-ui-k19-fix-b2.ts` | 16/0 |
| `npx.cmd tsx scripts/verify-import-cross-cohort-approval-k19-fix-b1.ts` | 17/0 |
| `npx.cmd tsx scripts/verify-import-matching-cohort-guard-k19-fix-a.ts` | 31/0 |
| `npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts` | HIGH=0/MEDIUM=0 |
| `npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts` | BLOCKING=NO |
| `npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts` | 23/0 |
| `npx prisma validate` | valid |
| `npm.cmd run build` | PASS |
| `npm.cmd run lint` | 314 (180 errors + 134 warnings), 0 new |
| `npm.cmd run test:auth-foundation` | 53 passed / 1 failed (pre-existing) |

---

## 16. Closing Note

K22-F2-SPECIALTY-CAMPUS-WEEKEND-CONSTRAINT-AUDIT 按 spec 完整执行：

- ✅ 新增只读 audit 脚本 (`scripts/audit-specialty-campus-weekend-constraints-k22-f2.ts`)
- ✅ 新增 Markdown audit 文档 (本文件)
- ✅ 新增 JSON audit 报告 (`docs/k22-specialty-campus-weekend-constraints-audit.json`)
- ✅ DB read-only inspection: 36 ClassGroups / 53 Rooms / 440 ScheduleSlots / 6 automotive classes / 10 Linxiao rooms / 21 weekend slots
- ✅ 3 类约束的 hard/soft 边界明确：SC6 soft (-20), HC6 hard (-1000), SC7 soft (-15)
- ✅ 7 个 mixed/ambiguous cases decision table
- ✅ Full / delta score pseudocode 设计
- ✅ 10 个 harness cases (4 base + 1 mixed + 2 weekend + 3 delta)
- ✅ 不修改 DB / schema / score.ts / solver / API / frontend / importer / parser / RBAC
- ✅ 工作区状态：仅新增 3 个 K22-F2 文件

**本阶段可关闭, 推荐先做 K22-F2A 数据准备确认 (教务处 verify 6 automotive classes 和 10 Linxiao rooms), 然后进入 K22-F3-SPECIALTY-CAMPUS-WEEKEND-CONSTRAINT-IMPL。SC5 (教师工作日均衡) 留 K22-F4+ 实施。**
