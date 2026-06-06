# K22 Soft Constraints Roadmap Audit

| Field | Value |
|---|---|
| Phase | K22-E-SOFT-CONSTRAINTS-ROADMAP-AUDIT |
| Type | Read-only audit (no Prisma writes, no score.ts modifications, no schema changes) |
| Generated | 2026-06-06 |
| Predecessor | K22-D-SCORE-DELTA-SC1-FIX (commit `30c92e4 fix(scheduler): add SC1 delta score`) |
| Audit script | `scripts/audit-soft-constraints-roadmap-k22-e.ts` |
| JSON report | `docs/k22-soft-constraints-roadmap-audit.json` |
| Project direction | K22-SOFT-CONSTRAINTS-ROADMAP — 梳理后续 soft constraints 实施路线 |

---

## 1. Background

K22-A (commit `9885f1f`) 识别了 7 项未覆盖的常见高校软约束（finding K22-A-E-4, INFO）：

- 教师均衡
- 班级空洞减少
- 教室稳定
- 实训匹配
- 大班优先
- 同班连续课少切换
- 教师连续课少切换

K22-D (commit `30c92e4`) 修复了 SC1 delta missing HIGH 风险。
本阶段 K22-E 梳理 10 项 soft constraints（含 K22-A 提到的 7 项 + 3 项相关扩展），评估每项的数据准备、schema 依赖、实现复杂度和优先级，给出分阶段实施路线。

---

## 2. Goal

1. 盘点当前已实现 soft constraints（SC1-SC4 + MIN_PERT）
2. 梳理至少 10 项 soft constraint（覆盖 7 项 K22-A 缺失 + 3 项相关扩展）
3. 判断每项的数据是否已有、是否需要 schema 扩展
4. 评估实现复杂度和回归风险
5. 给出 P0 / P1 / P2 优先级
6. 给出至少 3 个后续阶段路线
7. 不实现新 soft constraints
8. 不修改 score.ts / schema / DB / solver / API / frontend

---

## 3. Scope

### In scope（只读审计）

- `src/lib/scheduler/score.ts` (read-only)
- `src/lib/scheduler/**` (read-only)
- `src/lib/solver/**` (read-only)
- `prisma/schema.prisma` (read-only)
- `docs/k22-score-constraint-inventory-audit.md` (read-only)
- `docs/k22-score-regression-harness-implementation.md` (read-only)
- `docs/k22-score-delta-sc1-fix.md` (read-only)
- `scripts/**` (read-only)
- `docs/**` (read-only)
- `package.json` (read-only)
- Prisma read query for DB summary (read-only)

### Out of scope（严禁处理）

- 任何 Prisma 写操作
- 任何 score.ts / solver / scheduler / API / frontend / importer / parser / RBAC 修改
- 任何 schema / migration 修改
- 任何业务数据修改
- 任何新 soft constraints 实施（K22-F+ 范围）
- 任何 hardWeights / softWeights 字段（K22-weights-roadmap 范围）
- 任何 UI weight editor

---

## 4. Current Soft Constraints

| Constraint | Meaning | Penalty | Status | Notes |
|---|---|---:|---|---|
| **SC1** | 跨楼栋连续课 | -5 | ✅ Covered (full + delta) | K22-D 修复 delta。Regression guard A.2 |
| **SC2** | 同天多节 | -10 | ✅ Covered (full + delta) | -10 per extra slot on same day |
| **SC3** | 极端时间 | -1 | ✅ Covered (full + delta) | slotIndex >= 5 |
| **SC4** | 跨校区通勤 | -5 | ✅ Covered (full + delta) | same task consecutive, cross building |
| **MIN_PERT** | 最小扰动 | -2 | ✅ Covered (full + delta) | slot moved from original position |

全部 5 个已实现的 soft constraints 都有 full + delta 一致覆盖（K22-D 之后）。

---

## 5. Missing Soft Constraints Matrix

| ID | Constraint | Data Available | Schema Needed | Complexity | Priority |
|---|---|---|---|---|---|
| NEW-SC-01 | 教师工作日均衡 | ✅ Yes | ✅ No | LOW | **P0** |
| NEW-SC-02 | 班级空洞减少 | ✅ Yes | ✅ No | LOW | **P0** |
| NEW-SC-03 | 教室稳定性 | ✅ Yes | ✅ No | LOW | **P0** |
| NEW-SC-04 | 实训课 / 机房课匹配 room type | ❌ No | ⚠️ Yes | HIGH | P1 |
| NEW-SC-05 | 大班优先大教室 | ✅ Yes | ✅ No | MEDIUM | P1 |
| NEW-SC-06 | 同班连续课少切换 | ✅ Yes | ✅ No | MEDIUM | P1 |
| NEW-SC-07 | 教师半天集中 | ✅ Yes | ✅ No | LOW | P1 |
| NEW-SC-08 | 教师午休 / 晚课偏好 | ❌ No (NOT MODELED) | ⚠️ Yes | HIGH | P2 |
| NEW-SC-09 | 周一早课 / 周五晚课偏好 | ❌ No (NOT MODELED) | ⚠️ Yes | MEDIUM | P2 |
| NEW-SC-10 | 行政班固定教室偏好 | ❌ No (NOT MODELED) | ⚠️ Yes | MEDIUM | P2 |

**Total**: 3 P0 + 4 P1 + 3 P2 = 10 missing soft constraints.

---

## 6. Data Readiness

### 6.1 DB 现状（read-only snapshot at 2026-06-06）

| Table | Count |
|---|---:|
| ClassGroup | 36 |
| Teacher | 84 |
| Course | 104 |
| Room | 53 |
| ScheduleSlot | 440 |
| TeachingTask | 308 |

**Room.type 分布**: `{"NORMAL": 53}` — 所有 53 个 Room 都是 NORMAL，未分类。

### 6.2 可用字段（已存在 schema）

- `Teacher`: `id`, `name`
- `ClassGroup`: `id`, `name`, `studentCount`, `advisorName`, `advisorPhone`
- `Course`: `id`, `name` (only free-text, no `type` field)
- `Room`: `id`, `name`, `building`, `capacity`, `type` (default "NORMAL", unused)
- `TeachingTask`: `courseId`, `teacherId`, `weekType`, `startWeek`, `endWeek`, `remark` (free-text)
- `ScheduleSlot`: `teachingTaskId`, `roomId`, `dayOfWeek`, `slotIndex`
- `RoomAvailability`: `roomId`, `dayOfWeek`, `slotIndex`, `available`, `reason`

### 6.3 缺失字段（需要 schema 扩展）

- `Course.type` (Theory / Practice / Lab) — 实施 NEW-SC-04 需要
- `Teacher.maxDailyLoad` — 实施 NEW-SC-01/07 可选优化
- `Teacher.preference` 表（teacherId, dayOfWeek, slotIndex, weight）— 实施 NEW-SC-08 需要
- `SchedulingConfig.preferences` JSON — 实施 NEW-SC-09 需要
- `ClassGroup.homeRoomId` Int? — 实施 NEW-SC-10 需要

---

## 7. Schema Dependencies

| ID | Required Schema Change | Migration Cost | Severity |
|---|---|---|---|
| NEW-SC-04 | Add `Course.type` enum (Theory/Practice/Lab) OR populate `Room.type`; backfill from `Course.name` regex; update admin form | MEDIUM | MEDIUM |
| NEW-SC-08 | Add `TeacherPreference` model (teacherId, dayOfWeek, slotIndex, weight); admin UI; import flow | HIGH | MEDIUM |
| NEW-SC-09 | Add `SchedulingConfig.preferences` JSON column (Monday morning, Friday evening, etc.) | LOW | MEDIUM |
| NEW-SC-10 | Add `ClassGroup.homeRoomId Int?` (FK to Room); update admin form | LOW | MEDIUM |

---

## 8. Priority Ranking

### 8.1 P0（推荐下一阶段实施）

| ID | Constraint | Reason for P0 |
|---|---|---|
| NEW-SC-01 | 教师工作日均衡 | 数据已有；LOW 复杂度；LOW 风险；直接改善教师体验 |
| NEW-SC-02 | 班级空洞减少 | 数据已有；LOW 复杂度；LOW 风险；直接改善学生上课节奏 |
| NEW-SC-03 | 教室稳定性 | 数据已有；LOW 复杂度；LOW 风险；减少师生找教室成本 |

**3 个 P0 都不需要 schema 变更，可立即在 score.ts 中实现，复用 K22-C regression harness 验证。**

### 8.2 P1

| ID | Constraint | Reason for P1 |
|---|---|---|
| NEW-SC-04 | 实训课 / 机房课匹配 | Course.type / Room.type 数据未结构化，admin UI 不暴露 Room.type。实施前需先做数据质量审计（K22-G 阶段） |
| NEW-SC-05 | 大班优先大教室 | 数据已有，但阈值定义需要调优，MEDIUM 复杂度 |
| NEW-SC-06 | 同班连续课少切换 | 数据已有，但与 SC1/SC4 概念有重叠，需要小心避免双重计算 |
| NEW-SC-07 | 教师半天集中 | 数据已有，LOW 复杂度，与 NEW-SC-01 互补 |

### 8.3 P2

| ID | Constraint | Reason for P2 |
|---|---|---|
| NEW-SC-08 | 教师午休 / 晚课偏好 | 需要新表 + admin UI + import flow，HIGH 复杂度，HIGH 风险 |
| NEW-SC-09 | 周一早课 / 周五晚课偏好 | 需要 SchedulingConfig.preferences JSON；与 weights roadmap 强耦合 |
| NEW-SC-10 | 行政班固定教室偏好 | 需要 ClassGroup.homeRoomId schema + admin UI |

**P2 都需要 schema 扩展。K22-H 先做 schema planning，K22-I+ 再实施。**

---

## 9. Recommended Roadmap

### 阶段 1: K22-F-SOFT-CONSTRAINT-IMPLEMENTATION-1

- **原因**: 3 个 P0 soft constraints 数据已就绪、LOW 复杂度、LOW 风险，可立即实施
- **范围**:
  1. 在 `score.ts` 中实现 NEW-SC-01 (教师工作日均衡)
  2. 在 `score.ts` 中实现 NEW-SC-02 (班级空洞减少)
  3. 在 `score.ts` 中实现 NEW-SC-03 (教室稳定性)
  4. 在 K22-C verify 脚本中新增 3 个 regression cases
  5. 更新 K22-A audit + K22-C implementation 文档
- **不包含**:
  - P1 / P2 constraints
  - Schema 扩展
  - Solver algorithm 变更
  - UI weight editor

### 阶段 2: K22-G-SOFT-CONSTRAINT-IMPLEMENTATION-2

- **原因**: 4 个 P1 soft constraints 中 3 个有数据可立即实施（NEW-SC-05/06/07），1 个（NEW-SC-04）需要先做数据审计
- **范围**:
  1. **Pre-step (audit)**: K22-G-SOFT-CONSTRAINT-LAB-MATCHING-AUDIT — 用 Python 正则对 104 个 Course.name 做 (theory/practice/lab) 分类，统计分布和样本，由 教务处 确认准确率
  2. 实现 NEW-SC-05 (大班优先大教室)
  3. 实现 NEW-SC-06 (同班连续课少切换)
  4. 实现 NEW-SC-07 (教师半天集中)
  5. (可选) 实现 NEW-SC-04 (实训课匹配) — 仅在 audit 通过后
  6. 扩展 admin form 暴露 Room.type 字段
- **不包含**:
  - P2 constraints
  - 复杂 schema 扩展
  - UI weight editor

### 阶段 3: K22-H-SOFT-CONSTRAINT-SCHEMA-PLAN

- **原因**: 3 个 P2 constraints 都需要 schema + admin UI + 数据 backfill 策略，必须先 plan 再实施
- **范围**:
  1. 规划 NEW-SC-08 的 TeacherPreference 表 (teacherId, dayOfWeek, slotIndex, weight)
  2. 规划 NEW-SC-09 的 SchedulingConfig.preferences JSON
  3. 规划 NEW-SC-10 的 ClassGroup.homeRoomId Int? (FK to Room)
  4. 输出 migration plan, data backfill strategy, admin UI 改动
  5. **不实施**，只 planning
- **不包含**:
  - Schema migration 实施（K22-I+ 实施）
  - 新 soft constraints 实施

### 阶段 4: K22-I-SOFT-WEIGHTS-PRESETS-ROADMAP

- **原因**: 一旦 8+ soft constraints (5 existing + 3 P0) 实施，weights 配置成为自然下一步
- **范围**:
  1. 设计 dynamic hardWeights / softWeights per SchedulingConfig
  2. 设计 presets（默认排课偏好 / 工科偏好 / 文科偏好 / 临考期偏好）
  3. 与 K22-SCORE-WEIGHTS-ROADMAP 协调（不在 K22-E 范围）
- **不包含**:
  - UI weight editor
  - Soft constraints 实施

### 为什么推荐 K22-F 作为下一阶段

1. 3 个 P0 soft constraints 数据已就绪，**不需要 schema 变更**
2. **LOW** 实现复杂度和 **LOW** 回归风险
3. 可直接复用 K22-C regression harness (Harness A pattern) 做回归
4. 不影响 hardScore，不影响 solver feasibility
5. 直接改善三类用户（教师、学生、教室管理员）体验
6. 三个独立可测试，可分阶段合并

### 为什么 K22-F 不包含 NEW-SC-04

- Course.type / Room.type 数据未结构化（所有 53 个 Room 都是 NORMAL）
- Python parser 内部有 实训/实验/机房 正则检测但未持久化到 Course.type
- 实施前需先做数据质量审计（K22-G pre-step）
- 否则基于不准确的分类会让 solver 错误地把 普通课 推到 实训室 或把 实训课 推到 普通教室

---

## 10. Findings Summary

| ID | Severity | Title |
|---|---|---|
| K22-E-A-1 | MEDIUM | 3 P0 soft constraints (NEW-SC-01/02/03) have data and are LOW complexity |
| K22-E-B-1 | MEDIUM | NEW-SC-04 实训课匹配需要先做数据质量审计 |
| K22-E-C-1 | INFO | 3 P2 soft constraints (NEW-SC-08/09/10) require schema migration |
| K22-E-D-1 | LOW | SC1 vs SC4 building inference inconsistency (carried over) |
| K22-E-E-1 | INFO | Room.type 字段在 schema 但 admin UI 不暴露 |
| K22-E-F-1 | MEDIUM | Penalty constants 仍硬编码 (carried over, K22-weights-roadmap) |

**Summary: HIGH=0 / MEDIUM=3 / LOW=1 / INFO=2 / NONE=0 / BLOCKING=NO**

**BLOCKING=NO**: 没有 HIGH finding。最重要的 P0 constraints 数据已就绪。

---

## 11. Suggested Next Stage

**阶段名**: **K22-F-SOFT-CONSTRAINT-IMPLEMENTATION-1**

**范围**:
1. 在 `score.ts` 中实现 NEW-SC-01 (教师工作日均衡)
2. 在 `score.ts` 中实现 NEW-SC-02 (班级空洞减少)
3. 在 `score.ts` 中实现 NEW-SC-03 (教室稳定性)
4. 在 K22-C verify 脚本中新增 3 个 regression cases
5. 更新 K22-A audit + K22-C implementation 文档
6. 不修改 schema / DB / solver algorithm / API / frontend / importer / parser / RBAC

**不包含**:
- ❌ P1 / P2 constraints
- ❌ Schema 扩展
- ❌ Solver algorithm 变更
- ❌ UI weight editor
- ❌ HardWeights / softWeights 字段（K22-weights-roadmap 范围）

---

## 12. Unmodified Scope (K22-E)

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
- ✅ 未实施新 soft constraints
- ✅ 未做 score.ts refactor
- ✅ 未引入 hardWeights / softWeights 字段
- ✅ 未引入 UI weight editor

---

## 13. Verification Results

| Script / Command | Result |
|---|---|
| `npx.cmd tsx scripts/audit-soft-constraints-roadmap-k22-e.ts` | **PASS** — HIGH=0 / MEDIUM=3 / LOW=1 / INFO=2 / NONE=0 / BLOCKING=NO, P0=3, P1=4, P2=3 |
| `npx.cmd tsx scripts/verify-score-delta-sc1-fix-k22-d.ts` | (per K22-D) PASS — 6/6 checks |
| `npx.cmd tsx scripts/verify-score-regression-harness-k22-c.ts` | (per K22-C) PASS — 17/0/0/0, BLOCKING=NO |
| `npx.cmd tsx scripts/audit-score-constraint-inventory-k22-a.ts` | (per K22-D) PASS — HIGH=0, BLOCKING=NO |
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

## 14. Closing Note

K22-E-SOFT-CONSTRAINTS-ROADMAP-AUDIT 按 spec 完整执行：

- ✅ 新增只读 audit 脚本 (`scripts/audit-soft-constraints-roadmap-k22-e.ts`)
- ✅ 新增 Markdown audit 文档 (本文件)
- ✅ 新增 JSON audit 报告 (`docs/k22-soft-constraints-roadmap-audit.json`)
- ✅ 评估 10 项 soft constraints（5 已有 + 10 缺失 = 15 项，至少 10 项 missing 满足 spec 要求）
- ✅ 明确数据是否已有（DB read-only summary 确认 36/84/104/53/440/308）
- ✅ 明确 schema 是否需要（4 个 P1/P2 需要 schema）
- ✅ 明确复杂度和优先级（3 P0 + 4 P1 + 3 P2）
- ✅ 给出推荐实施顺序（K22-F → K22-G → K22-H → K22-I）
- ✅ 推荐下一阶段：**K22-F-SOFT-CONSTRAINT-IMPLEMENTATION-1**（3 个 P0 constraints）
- ✅ 不修改 DB / schema / score.ts / solver / API / frontend / importer / parser / RBAC
- ✅ 工作区状态：仅新增 3 个 K22-E 文件

**本阶段可关闭, 推荐进入 K22-F-SOFT-CONSTRAINT-IMPLEMENTATION-1 (实施 3 个 P0 soft constraints, 不需要 schema 变更)。**
