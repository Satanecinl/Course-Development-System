# K25-B Multi-Semester Schema Plan

**Stage**: `K25-B-MULTI-SEMESTER-SCHEMA-PLAN`
**Date**: 2026-06-07
**Type**: Read-only plan (no schema/DB changes)
**Source audit**: `K25-A-MULTI-SEMESTER-COURSE-SCOPING-AUDIT` (`60db8e2`)

## 1. Executive Summary

- **K25-A 状态**: PARTIAL (HIGH=2 MEDIUM=10 LOW=0)
- **K25-B 状态**: 计划完成, 推荐进入 K25-C 实施阶段
- **当前多学期能力为何不能直接实现 UI**:
  - 7 个核心表 `semesterId` 字段 nullable，schema 约束不能阻止新数据省略
  - 36/37 ImportBatch 历史 `semesterId` 缺失 (只有 1 个学期可用作 backfill 源)
  - API list endpoints (`data/teaching-tasks`, `schedule`) 无学期 filter
  - 前端缺全局学期选择器
  - 没有 schema NOT NULL 兜底，UI 选择器/API filter 只能"隐藏"问题不能"解决"问题
- **schema / backfill 为什么优先**: 数据完整性必须在 UI/API 之前修复
- **是否建议进入 K25-C 实施阶段**: ✅ **是** (7 个模型建议 NOT NULL, 1 个需要 backfill)

## 2. Source Audit Inputs

- **K25-A JSON**: `docs/k25-multi-semester-course-scoping-audit.json`
  - overallReadiness: `PARTIAL`
  - HIGH/MEDIUM/LOW/INFO: 2/10/0/1
  - blocking: false
- **K25-A MD**: `docs/k25-multi-semester-course-scoping-audit.md`
- **Prisma schema**: `prisma/schema.prisma`
- **Current DB snapshot** (read-only query, K25-B plan script):
  - teachingTask: total=308 nullSemester=0
  - scheduleSlot: total=440 nullSemester=0
  - scheduleAdjustment: total=57 nullSemester=0
  - schedulingRun: total=77 nullSemester=0
  - importBatch: total=37 nullSemester=36
  - classGroup: total=36 nullSemester=0
  - Active semesters: 1 (LEGACY-DEFAULT/id=1)
  - All semesters: 1

## 3. Model Classification

| Model | Category | Current `semesterId` | Proposed Action | Reason |
|-------|----------|---------------------|-----------------|-------|
| Course | A. global master | none | 保持不加 semesterId (跨学期主数据) | 课程主数据, 跨学期复用. 当前 @unique name 已足够. |
| Teacher | A. global master | none | 保持不加 semesterId | 教师主数据, 跨学期复用. |
| Room | A. global master | none | 保持不加 semesterId | 教室主数据, 跨学期复用. |
| User | A. global master | none | 保持不加 semesterId (RBAC 全局) | 用户/认证是全局. RBAC 学期化属于 K25-C+ 后续. |
| Role | A. global master | none | 保持不加 semesterId | RBAC 全局. |
| Permission | A. global master | none | 保持不加 semesterId | 权限主数据, 静态字符串. |
| Session | A. global master | none | 保持不加 semesterId | 会话全局. |
| Semester | A. global master | none | 保持为顶层 master (root) | Semester 自身是根表, 不需要自身 semesterId. |
| ClassGroup | B. semester-scoped (NOT NULL) | nullable | semesterId Int (NOT NULL) + relation required | 当前 36 行 null=0. 行政班是某学期的, 应强制绑定. @@unique([semesterId, name]) 已存在, 改 NOT NULL 是 schema 一致性. |
| TeachingTask | B. semester-scoped (NOT NULL) | nullable | semesterId Int (NOT NULL) + relation required | 当前 308 行 null=0. 开课任务是某学期的, 应强制绑定. ScheduleSlot 关联 TeachingTask, 两者 semesterId 必须一致. |
| ScheduleSlot | B. semester-scoped (NOT NULL) | nullable | semesterId Int (NOT NULL) + relation required | 当前 440 行 null=0. 排课结果是某学期的, 应强制绑定. Consistency check: slot.semesterId === slot.teachingTask.semesterId. |
| ScheduleAdjustment | B. semester-scoped (NOT NULL) | nullable | semesterId Int (NOT NULL) + relation required | 当前 57 行 null=0. 调课是某学期的, 应强制绑定. 不允许跨学期调课. |
| SchedulingRun | B. semester-scoped (NOT NULL) | nullable | semesterId Int (NOT NULL) + relation required | 当前 77 行 null=0. 调度运行是某学期的, 应强制绑定. resultSnapshot 应包含 semesterId. |
| SchedulingConfig | B. semester-scoped (NOT NULL) | nullable | semesterId Int (NOT NULL) + relation required | 调度配置是某学期的, 每学期可有不同 LAHC 参数. 需配 SchedulingConfig.semesterId required. |
| ImportBatch | B. semester-scoped (NOT NULL) | nullable | semesterId Int (NOT NULL) + relation required | 当前 37 行 null=36. **36/37 历史 null 必须 backfill**. 导入批次是某学期的. |
| TeachingTaskClass | C. join/detail (inherit) | none | 不加 semesterId; 通过 parent (teachingTask / classGroup) 继承 | join 表, 学期信息冗余; 加 NOT NULL 需 consistency check (teachingTask.semesterId === classGroup.semesterId). |
| SchedulerRunChange | C. join/detail (inherit) | none | 不加 semesterId; 通过 run.semesterId 继承 | join 表, run.semesterId 已 required. consistency check: SchedulerRunChange.run.semesterId. |
| RoomAvailability | C. join/detail (inherit) | none | 不加 semesterId; 通过 room 继承 (跨学期共享) | 教室可用性表; 当前 Room 是 global master. 未来如需学期化再迁移. |
| ScheduleChangeLog | D. legacy/risk | none | 暂不加 semesterId, 标记为 legacy | legacy log 表, 实际不被使用. 本轮不直接处理. 后续 K25-LEGACY-CLEANUP 阶段统一处理. |

## 4. Proposed NOT NULL Changes

| Model | Current | Proposed | Backfill Required | Risk |
|-------|---------|----------|-------------------|------|
| ClassGroup | `semesterId Int? (nullable)` | `semesterId Int (NOT NULL) + relation required` | false (0/36) | LOW (0 null, schema-only) |
| TeachingTask | `semesterId Int? (nullable)` | `semesterId Int (NOT NULL) + relation required` | false (0/308) | LOW (0 null, schema-only) |
| ScheduleSlot | `semesterId Int? (nullable)` | `semesterId Int (NOT NULL) + relation required` | false (0/440) | LOW (0 null, schema-only) |
| ScheduleAdjustment | `semesterId Int? (nullable)` | `semesterId Int (NOT NULL) + relation required` | false (0/57) | LOW (0 null, schema-only) |
| SchedulingRun | `semesterId Int? (nullable)` | `semesterId Int (NOT NULL) + relation required` | false (0/77) | LOW (0 null, schema-only) |
| SchedulingConfig | `semesterId Int? (nullable)` | `semesterId Int (NOT NULL) + relation required` | false (0/0) | LOW (0 null, schema-only) |
| ImportBatch | `semesterId Int? (nullable)` | `semesterId Int (NOT NULL) + relation required` | true (36/37) | HIGH (36/37 null) |

**总结**: 7 个核心模型 (B 类) 全部建议 semesterId NOT NULL。当前 dev.db 中仅 ImportBatch 有 36 个 null 需要 backfill；其他 6 个 dev.db 中 0 null (历史 init 已注入 LEGACY-DEFAULT)，schema 改为 NOT NULL 安全。生产环境必须先做 null count 检查再决定 backfill target。

## 5. Backfill Plan

### 5.1 Active Semester Detection

- **Strategy**: `findMany where isActive=true`, expect **exactly 1**
- **Found in current DB**: 1
- **Semesters**: LEGACY-DEFAULT/id=1
- **abortIfNotExactlyOne**: true

### 5.2 ImportBatch Backfill

- **Rows to backfill**: 36 (of 37)
- **Target semester**: id=1
- **Strategy**: `UPDATE ImportBatch SET semesterId = <activeId> WHERE semesterId IS NULL`
- **Prerequisites**:
  - exactly one active semester
  - no in-flight parse/confirm
  - DB backup taken
- **dryRunRecommended**: true
- **abortIfMultipleActive**: true
- **abortIfNoActive**: true

### 5.3 Scoped Models Null Check (other 6 models)

| Model | Total | Null | Action |
|-------|-------|------|--------|
| teachingTask | 308 | 0 | OK: 0 null, safe to set NOT NULL |
| scheduleSlot | 440 | 0 | OK: 0 null, safe to set NOT NULL |
| scheduleAdjustment | 57 | 0 | OK: 0 null, safe to set NOT NULL |
| schedulingRun | 77 | 0 | OK: 0 null, safe to set NOT NULL |
| classGroup | 36 | 0 | OK: 0 null, safe to set NOT NULL |

**Abort conditions**:
- ❌ 0 active semesters → abort (需要人工指定 target)
- ❌ 2+ active semesters → abort (需要先确定 target)
- ❌ null count > 0 in production → abort (需要人工确认 backfill target)

## 6. Migration Plan

**原则**: 不使用 destructive reset. 按顺序执行，每步可独立 abort。

### Step 1: Preflight (可中止)

- DB backup: cp prisma/dev.db prisma/dev.db.backup-$(date +%Y%m%d%H%M%S)
- Verify exactly one active semester (resolveSchedulerSemester-style check)
- Count null semesterId per model
- Verify cross-semester consistency (no mixed records in current dev.db)

### Step 2: Backfill (ImportBatch) (可中止)

- UPDATE ImportBatch SET semesterId = <activeId> WHERE semesterId IS NULL
- Re-verify: SELECT COUNT(*) FROM ImportBatch WHERE semesterId IS NULL → expect 0
- No DELETE / destructive ops

### Step 3: Backfill (other scoped models) (可中止)

- For each scoped model with null > 0: same UPDATE as ImportBatch
- Abort if any null found in production (require human review)
- For dev.db, backfill to LEGACY-DEFAULT

### Step 4: Prisma schema change

- For each of 7 models: semesterId Int → semesterId Int (NOT NULL)
- Semester? relation → Semester relation (required)
- No destructive schema operation
- Run npx prisma migrate dev --name k25-b-multi-semester-not-null

### Step 5: Migration application

- Apply migration to dev.db (no reset)
- Prisma generate client

### Step 6: Post-migration validation

- npx prisma validate
- npm run build
- K25-A audit rerun (sanity check: 36/37 → 0/37 ImportBatch null)
- K24-A / K23-A / K22-C verify rerun (regression check)
- auth-foundation 53/1 pre-existing (no regression)


## 7. Consistency Validation Plan

K25-C 实施后必须验证以下一致性。

### teachingTask
- TeachingTask.semesterId NOT NULL
- TeachingTask.classGroup (via TeachingTaskClass) all in same semester

### scheduleSlot
- ScheduleSlot.semesterId NOT NULL
- ScheduleSlot.semesterId === ScheduleSlot.teachingTask.semesterId

### scheduleAdjustment
- ScheduleAdjustment.semesterId NOT NULL
- ScheduleAdjustment.originalSlot.semesterId === ScheduleAdjustment.semesterId
- ScheduleAdjustment.targetSemesterId === ScheduleAdjustment.semesterId (no cross-semester)

### schedulingRun
- SchedulingRun.semesterId NOT NULL
- SchedulingRun.config.semesterId === SchedulingRun.semesterId (optional, configs can be shared)
- SchedulerRunChange.run.semesterId consistent

### schedulingConfig
- SchedulingConfig.semesterId NOT NULL
- At least one config per active semester (recommend, not required)

### importBatch
- ImportBatch.semesterId NOT NULL
- ImportBatch.teachingTasks all have same semesterId as ImportBatch
- ImportBatch.scheduleSlots all have same semesterId as ImportBatch


## 8. Rollback Plan

**Strategy**: backup-based rollback (preferred) + reverse migration (fallback)

### Backup-based rollback
- cp prisma/dev.db.backup-<timestamp> prisma/dev.db
- Or: psql/copy db from backup

### Reverse migration
- npx prisma migrate dev --name k25-b-rollback-not-null-to-nullable
- UPDATE ImportBatch SET semesterId = NULL (only if absolutely needed)

### No-reset policy
- NEVER run prisma migrate reset
- NEVER run prisma db push --force-reset
- NEVER delete prisma/dev.db

### Restore order
- 1. Stop dev server
- 2. Restore DB from backup
- 3. If migration applied: reverse migration OR restore from pre-migration DB
- 4. Re-run K25-A audit to confirm status
- 5. Re-run K24-A / K23-A / K22-C regression

## 9. API / UI Follow-up Plan

K25-B 不实现 API/UI 改动。后续阶段:

### K25-C-MULTI-SEMESTER-SCHEMA-IMPLEMENTATION
- **Scope**: Execute K25-B plan (preflight, backfill, schema change, migration, post-validation); No UI / API changes
- **Rationale**: Cannot fully isolate multi-semester data without NOT NULL constraints.

### K25-D-SEMESTER-SCOPING-API-GAP-FIX
- **Scope**: data/teaching-tasks GET list: require ?semesterId=; schedule GET list: require ?semesterId=; Mutation endpoints: validate resource.semesterId consistency
- **Rationale**: K25-A flagged 2 HIGH API risks; K25-D addresses them after K25-C.

### K25-E-SEMESTER-SELECTOR-UX
- **Scope**: Global / admin-scoped semester selector; API requests carry X-Semester-Id or ?semesterId=; Page labels show current semester
- **Rationale**: Last step; UX without schema/plan is incomplete.


## 10. Risks and Non-Goals

### 本阶段 non-goals
- ❌ 不直接修改 prisma/schema.prisma
- ❌ 不直接修改 migrations
- ❌ 不写 DB (0 prisma.create/update/delete/upsert 调用)
- ❌ 不实现 API scoping (K25-D 范围)
- ❌ 不实现 UI semester selector (K25-E 范围)
- ❌ 不实现 RBAC semester scope (后续)

### Risks
- **生产环境风险**: 36/37 ImportBatch null 假设 LEGACY-DEFAULT active，但生产环境如有多个 active semester 需要人工指定 backfill target
- **Prisma migration 在 SQLite 上的限制**: SQLite 不支持所有 ALTER TABLE 操作；NOT NULL constraint 改动可能需要表重建 (Prisma 5+ 通常自动处理，但需验证)
- **历史数据假设**: 当前 dev.db init 注入 LEGACY-DEFAULT 是隐式约定；生产环境可能在 K25-B 之前已有多学期数据，需要先 audit

## 11. Verification Results

所有运行命令:
```bash
npx tsx scripts/plan-multi-semester-schema-k25-b.ts   # exit 0, 写入 docs
npx prisma validate                                  # schema valid
npm run build                                        # PASS
npm run lint                                         # 0 new error
npm run test:auth-foundation                         # 53 passed / 1 pre-existing failure
```

未运行 K25-A audit (避免无关 generatedAt drift)。

## 12. Unmodified Scope

本阶段 0 修改业务代码:
- ❌ prisma/schema.prisma (未改)
- ❌ prisma/migrations (未改)
- ❌ prisma/dev.db (未写)
- ❌ API business logic (未改)
- ❌ Frontend business logic (未改)
- ❌ scheduler / score / solver (未改)
- ❌ importer / parser (未改)
- ❌ RBAC permission model (未改)
- ❌ 未运行 prisma db push / migrate / reset / seed

本阶段新增文件:
- `scripts/plan-multi-semester-schema-k25-b.ts`
- `docs/k25-multi-semester-schema-plan.md`
- `docs/k25-multi-semester-schema-plan.json`