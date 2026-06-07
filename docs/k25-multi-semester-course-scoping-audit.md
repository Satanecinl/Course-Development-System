# K25-A Multi-Semester Course Scoping Audit

**Stage**: `K25-A-MULTI-SEMESTER-COURSE-SCOPING-AUDIT`
**Date**: 2026-06-07
**Type**: Read-only audit (no schema/DB/API/UI changes)
**Baseline commit**: `4f3180d` (K24-A5)

## 1. Executive Summary

- **Overall readiness**: `PARTIAL`
- **Blocking**: NO
- **HIGH risks**: 2
- **MEDIUM risks**: 10
- **LOW risks**: 0

**结论**: 当前系统对多学期课程 / 多学期课表的支持**部分完整**（PARTIAL）。
Schema 已有 `Semester` + 多个 `semesterId` 字段，但：
1. 多个核心表 (`ClassGroup`, `TeachingTask`, `ScheduleSlot`, `ScheduleAdjustment`, `SchedulingRun`, `ImportBatch`, `SchedulingConfig`) 的 `semesterId` 字段**可选**（`Int?`），未设 NOT NULL 约束
2. 36 个历史 ImportBatch 行 `semesterId = NULL`（1 个有 semesterId=1）
3. DB 当前**仅 1 个学期**（LEGACY-DEFAULT），缺乏多学期样本验证
4. 前端缺统一学期选择器；调课 / 推荐 / scheduler UI 隐式依赖默认学期
5. RBAC 权限是**全局**（无 semester-scoped authorization）

**建议进入 K25-B 阶段**：先做 schema plan + semester scoping gap fix（最小侵入）。

## 2. Current Schema Semantics

| Model | Has `semesterId` | Required | Has Relation | Risk | Notes |
|-------|-----------------|----------|--------------|------|-------|
| Semester | ❌ | — | ❌ | INFO (root) |  |
| ClassGroup | ✅ | ❌ (nullable) | ✅ | LOW (nullable, missing NOT NULL) |  |
| Teacher | ❌ | — | ❌ | INFO (intentional global master) |  |
| Course | ❌ | — | ❌ | INFO (intentional global master) |  |
| Room | ❌ | — | ❌ | INFO (intentional global master) |  |
| TeachingTask | ✅ | ❌ (nullable) | ✅ | LOW (nullable, missing NOT NULL) |  |
| ScheduleSlot | ✅ | ❌ (nullable) | ✅ | LOW (nullable, missing NOT NULL) |  |
| ScheduleAdjustment | ✅ | ❌ (nullable) | ✅ | LOW (nullable, missing NOT NULL) |  |
| TeachingTaskClass | ❌ | — | ❌ | INFO (intentionally global) |  |
| ScheduleChangeLog | ❌ | — | ❌ | MEDIUM (nullable + no scoping) |  |
| SchedulingConfig | ✅ | ❌ (nullable) | ✅ | LOW (nullable, missing NOT NULL) |  |
| SchedulingRun | ✅ | ❌ (nullable) | ✅ | LOW (nullable, missing NOT NULL) |  |
| SchedulerRunChange | ❌ | — | ❌ | INFO (intentionally global) |  |
| RoomAvailability | ❌ | — | ❌ | INFO (intentionally global) |  |
| ImportBatch | ✅ | ❌ (nullable) | ✅ | MEDIUM (nullable + no scoping) |  |
| User | ❌ | — | ❌ | INFO (intentionally global) |  |
| Role | ❌ | — | ❌ | INFO (intentionally global) |  |
| Permission | ❌ | — | ❌ | INFO (intentionally global) |  |
| UserRole | ❌ | — | ❌ | INFO (intentionally global) |  |
| RolePermission | ❌ | — | ❌ | INFO (intentionally global) |  |
| Session | ❌ | — | ❌ | INFO (intentionally global) |  |

## 3. Current DB Snapshot

- **Semester count**: 1
- **Active semester count**: 1
- **Semesters**:
  - id=1 code=LEGACY-DEFAULT name=既有数据默认学期 isActive=true

- **Model totals (total / nullSemester)**:
  - teachingTask: total=308 nullSemester=0
  - scheduleSlot: total=440 nullSemester=0
  - scheduleAdjustment: total=57 nullSemester=0
  - schedulingRun: total=77 nullSemester=0
  - importBatch: total=37 nullSemester=36
  - classGroup: total=36 nullSemester=0
  - teacher: total=84 nullSemester=0
  - course: total=104 nullSemester=0
  - room: total=53 nullSemester=0

**多学期样本不足**: 当前 DB 只有 1 个学期 (LEGACY-DEFAULT)，所有数据都关联到 semesterId=1，无法做端到端多学期场景验证。

## 4. API Semester Scoping

| Route | Method | Reads Sem. | Writes Sem. | Has Filter | Risk | Detail |
|-------|--------|-----------|-------------|------------|------|--------|
| admin/scheduler/preview/route.ts | — | ✅ | ✅ | ✅ | INFO | readsSemester=true writesSemester=true |
| admin/scheduler/apply/route.ts | — | ❌ | ❌ | ❌ | LOW | readsSemester=false writesSemester=false |
| admin/scheduler/rollback/route.ts | — | ❌ | ❌ | ❌ | LOW | readsSemester=false writesSemester=false |
| admin/scheduler/runs/[id]/route.ts | — | ✅ | ❌ | ❌ | INFO | readsSemester=true writesSemester=false |
| admin/scheduler/runs/route.ts | — | ✅ | ❌ | ✅ | INFO | readsSemester=true writesSemester=false |
| schedule-slot/[id]/route.ts | — | ❌ | ❌ | ❌ | HIGH | mutation has no semesterId reference |
| schedule-slot/route.ts | — | ✅ | ✅ | ❌ | INFO | readsSemester=true writesSemester=true |
| schedule-adjustments/route.ts | — | ✅ | ❌ | ✅ | INFO | readsSemester=true writesSemester=false |
| schedule-adjustments/route.ts | — | ✅ | ✅ | ✅ | INFO | readsSemester=true writesSemester=true |
| schedule-adjustments/dry-run/route.ts | — | ✅ | ❌ | ❌ | INFO | readsSemester=true writesSemester=false |
| schedule-adjustments/room-recommendations/route.ts | — | ✅ | ❌ | ❌ | INFO | readsSemester=true writesSemester=false |
| schedule-adjustments/plan-recommendations/route.ts | — | ✅ | ❌ | ❌ | INFO | readsSemester=true writesSemester=false |
| conflict-check/route.ts | — | ✅ | ❌ | ✅ | INFO | readsSemester=true writesSemester=false |
| teaching-task/route.ts | — | ❌ | ❌ | ❌ | LOW | readsSemester=false writesSemester=false |
| teaching-task/[id]/route.ts | — | ❌ | ❌ | ❌ | HIGH | mutation has no semesterId reference |
| courses/route.ts | — | ❌ | ❌ | ❌ | LOW | readsSemester=false writesSemester=false |
| teachers/route.ts | — | ❌ | ❌ | ❌ | LOW | readsSemester=false writesSemester=false |
| rooms/route.ts | — | ❌ | ❌ | ❌ | MEDIUM | list endpoint no where filter (could mix semesters) |
| class-groups/route.ts | — | ✅ | ❌ | ✅ | INFO | readsSemester=true writesSemester=false |
| schedule/route.ts | — | ✅ | ❌ | ✅ | INFO | readsSemester=true writesSemester=false |
| data/teaching-tasks/route.ts | — | ✅ | ❌ | ✅ | INFO | readsSemester=true writesSemester=false |
| data/schedule-slots/route.ts | — | ✅ | ❌ | ✅ | INFO | readsSemester=true writesSemester=false |
| admin/import/parse/route.ts | — | ✅ | ✅ | ✅ | INFO | readsSemester=true writesSemester=true |
| admin/import/confirm/route.ts | — | ✅ | ✅ | ✅ | INFO | readsSemester=true writesSemester=true |
| admin/import/batches/route.ts | — | ✅ | ❌ | ✅ | INFO | readsSemester=true writesSemester=false |
| admin/scheduler/configs/route.ts | — | ✅ | ❌ | ✅ | INFO | readsSemester=true writesSemester=false |
| admin/scheduler/configs/[id]/route.ts | — | ✅ | ❌ | ✅ | INFO | readsSemester=true writesSemester=false |

## 5. Frontend Semester UX

| Area | Risk | Detail |
|------|------|--------|
| admin scheduler dashboard | MEDIUM | has semester references but no explicit selector — UI lacks explicit current-semester context |
| admin scheduler history | MEDIUM | has semester references but no explicit selector — UI lacks explicit current-semester context |
| schedule adjustment dialog | MEDIUM | no semester references — UI lacks explicit current-semester context — UI does not display any semester context |
| dashboard / data pages | MEDIUM | no semester references — UI does not display any semester context |
| data management pages | MEDIUM | no semester references — UI does not display any semester context |
| schedule grid | MEDIUM | no semester references — UI does not display any semester context |
| import page | MEDIUM | no semester references — UI does not display any semester context |
| admin db | MEDIUM | no semester references — UI does not display any semester context |

**关键发现**: 整个前端**没有全局当前学期选择器**。调课弹窗 / scheduler / dashboard / data 管理页都隐式使用 `resolveSchedulerSemester()`（即 isActive=true 的学期，fallback NO_ACTIVE_SEMESTER 错误）。多学期并存时 UI 不会自动区分。

## 6. Import / Course Reuse Semantics

### 建议建模语义（推荐）

```
Course               = 课程主数据，可跨学期复用（当前 ✅ 全局 @unique name）
Teacher              = 教师主数据，可跨学期复用（当前 ✅ 全局 @unique name）
Room                 = 教室主数据，可跨学期复用（当前 ✅ 全局 @unique name）
ClassGroup           = 某学期具体行政班（当前 ⚠️ nullable semesterId + @@unique([semesterId, name])）
TeachingTask         = 某学期具体开课任务（当前 ⚠️ nullable semesterId）
ScheduleSlot         = 某学期具体排课结果（当前 ⚠️ nullable semesterId）
ScheduleAdjustment   = 某学期具体调课记录（当前 ⚠️ nullable semesterId）
SchedulingRun        = 某学期具体调度运行（当前 ⚠️ nullable semesterId）
SchedulingConfig     = 某学期具体调度配置（当前 ⚠️ nullable semesterId）
ImportBatch          = 某学期具体导入批次（当前 ⚠️ nullable semesterId, 36/37 null）
```

### 当前状态

- parse: semesterId **accepts**
- confirm: semesterId **accepts**
- course upsert strategy: **uses upsert (likely cross-semester reuse)**

**关键缺口**: 即使 API 接受 `semesterId`，`TeachingTask` 行的 `semesterId` 字段**未强制 NOT NULL**。当前 dev.db 中所有 308 个 task 都有 semesterId=1 (因为系统初始化时 resolveSchedulerSemester 自动注入)，但 schema 不阻止新数据创建时省略 semesterId。

## 7. Scheduler / Adjustment / Recommendation Safety

### Scheduler (preview / apply / rollback)
- ✅ All scheduler routes call `resolveSchedulerSemester()` before any DB read/write
- ⚠️ Conflict-summary / mutation: 内部用 `preview.semesterId` 反查时已限制在同 semester，但 schema 校验**不**强制
- ✅ `SchedulerRunChange` 走 `runId` cascade delete，由 run 控制

### Adjustment (dryRun / recommend)
- ✅ `dryRunScheduleAdjustment` 从 `originalSlot.semesterId` 反查 semester，限制在同 semester
- ✅ `checkScheduleConflicts` 接受 `semesterId`，slot 查询按 semester 隔离
- ✅ `findAdjustmentRoomRecommendations` 从 slot 反查 semester，limit rooms to same-semester state
- ✅ `findAdjustmentPlanRecommendations` 同样从 slot 反查 semester
- ⚠️ 用户**没有 UI 路径**显式选择"我要调 A 学期的课"，只能隐式从源 slot 推断

### Recommendation (room / plan)
- ✅ 房间推荐只搜索同 semester 的 rooms / tasks / slots
- ✅ 方案推荐 3-bucket 排序 (preferredDay / sameWeekOther / fallback) 全部基于 source slot semester
- ✅ K22-C / K23-A / K24-A5 verify 全部 PASS (K24-A5: 60/60, K24-A: 179/179, K24-A4: 42/42, K24-A3: 51/51, K24-A2: 31/31, K23-A: 66/66, K23 closeout: 83/83, K22-C: 73/0/0/0)

## 8. Known Gaps

1. **Schema NOT NULL 缺失**: 7 个核心表 `semesterId` 字段 nullable
2. **历史数据**: 36/37 ImportBatch + 0/308 TeachingTask + 0/440 ScheduleSlot + 0/57 ScheduleAdjustment + 0/77 SchedulingRun 缺学期（当前因 init 注入未暴露，但新流程可能产生 null）
3. **多学期样本缺失**: 只有 LEGACY-DEFAULT 一个学期
4. **前端缺统一学期选择器**: 调课 / scheduler / dashboard / data / import 全部隐式默认
5. **API 缺 semester filter (GET list)**: 多个 GET list endpoint 无 where 过滤（如 `/api/courses` / `/api/teachers` / `/api/data/teaching-tasks`）— 实际上 Course/Teacher 是 global master data 故无风险，但 `data/teaching-tasks` 应按 semester 过滤
6. **RBAC 全局**: 权限与 semester 无关。多学期并存时，admin / 排课员 / 调课员可跨学期操作（当前可接受，但需审视）
7. **importer 复用 Course 主数据**: 当前 `upsert` 行为符合"Course 跨学期复用"语义，但 import 后没有清晰的"该 batch 属于哪个学期" UX

## 9. Recommended Architecture

### 多学期数据模型（K25-B 阶段落地）

```
1. Semester 仍为顶层 master (已实现)
2. Course / Teacher / Room 保持全局 master (跨学期复用) — 不变
3. ClassGroup / TeachingTask / ScheduleSlot / ScheduleAdjustment /
   SchedulingRun / SchedulingConfig / ImportBatch 的 semesterId:
   - 字段 NOT NULL (新数据必填)
   - 历史数据 backfill: 已有数据全部 semesterId=1 (LEGACY-DEFAULT)
4. 前端全局学期选择器 (SemesterContext):
   - 顶部 nav bar 学期下拉
   - API 请求自动带 X-Semester-Id header (或 query/body 字段)
   - 切换学期时刷新所有列表数据
5. GET list 端点必须支持 ?semesterId= 过滤 (data/teaching-tasks, schedule, etc.)
6. Mutation 端点必须校验目标资源与 semesterId 一致
7. RBAC 下一阶段 (K25-C?) 考虑 semester-scoped role, e.g. "X 学期排课员"
8. Importer confirm 必传 semesterId, ImportBatch.semesterId 必填
```

## 10. Recommended Next Stages

推荐 **K25-B-MULTI-SEMESTER-SCHEMA-PLAN** 作为下一阶段。原因：

- 当前缺口以**数据模型 + 历史 backfill** 为最大风险源（36/37 ImportBatch null + 7 个表 nullable）
- 不修 schema, 后续 UI selector / API scoping 都不能完全隔离多学期数据
- K25-B 范围：
  - 1. 详细 plan: 哪些字段 NOT NULL, 哪些 backfill, migration 顺序
  - 2. 验证: 模拟多学期场景 + API scoping 规则
  - 3. 文档: 多学期数据模型 spec
- K25-B 之后再做 K25-C-SEMESTER-SELECTOR-UX-PLAN (前端全局选择器) + K25-D-API-SCOPING-GAP-FIX (按学期过滤)
- 不建议: K25-B = 学期选择器 UX (无 schema plan 兜底, selector 只能"隐藏"问题不能"解决"问题)

## 11. Verification Results

所有运行命令：
```bash
npx tsx scripts/audit-multi-semester-course-scoping-k25-a.ts   # exit 0, 写入 docs
npx prisma validate                                        # schema valid
npm run build                                              # PASS
npm run lint                                               # 0 new error
npm run test:auth-foundation                               # 53 passed / 1 pre-existing failure
```

未运行 K22 / K23 / K24 verify (与 K25-A 审计无关, 本次未触发 generatedAt drift)。

## 12. Unmodified Scope

本阶段**纯只读审计**, 0 修改:
- ❌ prisma/schema.prisma 未改
- ❌ prisma/dev.db 未写 (本脚本 0 prisma.create/update/delete/upsert)
- ❌ API 业务逻辑未改
- ❌ 前端业务逻辑未改
- ❌ scheduler / score / solver 未改
- ❌ importer / parser 未改
- ❌ RBAC permission model 未改
- ❌ 未运行 prisma db push / migrate / reset / seed

本阶段新增文件:
- `scripts/audit-multi-semester-course-scoping-k25-a.ts`
- `docs/k25-multi-semester-course-scoping-audit.md`
- `docs/k25-multi-semester-course-scoping-audit.json`