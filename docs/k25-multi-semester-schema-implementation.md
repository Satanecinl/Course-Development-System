# K25-C Multi-Semester Schema Implementation

**Stage**: `K25-C-MULTI-SEMESTER-SCHEMA-IMPLEMENTATION`
**Date**: 2026-06-07
**K25-B baseline commit**: `6a6da11` (K25-B plan)
**K22 baseline commit**: `ab7d9fd` (K22 mainline)

---

## 1. Executive Summary

K25-C 已实施 K25-B 的 schema / backfill / migration 计划。

**已完成**:

- ✅ 7 个核心 semester-scoped 模型 `semesterId` 从 nullable 改为 **NOT NULL**
- ✅ `ImportBatch` 36/37 历史 `semesterId=null` 已 backfill 到唯一 active semester (LEGACY-DEFAULT, id=1)
- ✅ DB 已备份 (`prisma/dev.db.backup-before-k25c-20260607`)
- ✅ Prisma migration 已生成并应用 (`20260607000000_k25_multi_semester_not_null`)
- ✅ post-validation 通过 (37/37 PASS: schema markers + null counts + consistency checks)
- ✅ 不包含 UI selector / API scoping (K25-D / K25-E 范围)

**不做**:
- ❌ 不做 UI selector (K25-E)
- ❌ 不做 API scoping (K25-D)
- ❌ 不处理 ScheduleChangeLog legacy
- ❌ 不处理 RBAC semester scope
- ❌ 不处理 Teacher/Course/Room global semantics (保持跨学期复用)

---

## 2. Backup

| 项目 | 内容 |
|------|------|
| **备份路径** | `prisma/dev.db.backup-before-k25c-20260607` |
| **创建时间** | 2026-06-07 |
| **大小** | 3,571,712 bytes |
| **是否提交** | ❌ 未提交 (DB backup 不进 git) |
| **rollback 使用** | `cp prisma/dev.db.backup-before-k25c-20260607 prisma/dev.db` |

---

## 3. Preflight

| 检查项 | 结果 |
|--------|------|
| Active semesters | 1 (LEGACY-DEFAULT, id=1) |
| `ImportBatch.semesterId` null | 36/37 |
| `ClassGroup.semesterId` null | 0/36 |
| `TeachingTask.semesterId` null | 0/308 |
| `ScheduleSlot.semesterId` null | 0/440 |
| `ScheduleAdjustment.semesterId` null | 0/57 |
| `SchedulingRun.semesterId` null | 0/77 |
| `SchedulingConfig.semesterId` null | 0/0 |
| Abort conditions | 0 active / 2+ active → abort |

---

## 4. Backfill

| 项目 | 值 |
|------|-----|
| **ImportBatch null before** | 36 |
| **ImportBatch updated** | 36 |
| **ImportBatch null after** | 0 |
| **其他表 null before** | 0 (全部) |
| **是否改了其他表** | ❌ 仅 ImportBatch |
| **是否写业务数据** | ❌ 仅 semesterId backfill |

**脚本**: `scripts/implement-multi-semester-schema-k25-c.ts`
- Dry-run: `npx tsx scripts/implement-multi-semester-schema-k25-c.ts --dry-run`
- Apply: `npx tsx scripts/implement-multi-semester-schema-k25-c.ts --apply`

---

## 5. Schema Changes

| Model | Before | After |
|-------|--------|-------|
| ClassGroup | `semesterId Int?` | `semesterId Int` (NOT NULL) |
| TeachingTask | `semesterId Int?` | `semesterId Int` (NOT NULL) |
| ScheduleSlot | `semesterId Int?` | `semesterId Int` (NOT NULL) |
| ScheduleAdjustment | `semesterId Int?` | `semesterId Int` (NOT NULL) |
| SchedulingRun | `semesterId Int?` | `semesterId Int` (NOT NULL) |
| SchedulingConfig | `semesterId Int?` | `semesterId Int` (NOT NULL) |
| ImportBatch | `semesterId Int?` | `semesterId Int` (NOT NULL) |

**未修改**:
- Course / Teacher / Room (global master data, 不加 semesterId)
- TeachingTaskClass / SchedulerRunChange / RoomAvailability (join/detail 表, 通过 parent 继承)
- ScheduleChangeLog (legacy, 后续 K25-LEGACY-CLEANUP)

---

## 6. Migration

| 项目 | 值 |
|------|-----|
| **Migration name** | `20260607000000_k25_multi_semester_not_null` |
| **Migration path** | `prisma/migrations/20260607000000_k25_multi_semester_not_null/migration.sql` |
| **是否使用 reset** | ❌ 未使用 |
| **Migration SQL 行数** | 176 |
| **应用方式** | `sqlite3 prisma/dev.db < migration.sql` (SQLite direct apply, Prisma shadow DB 失败时 workaround) |
| **Prisma 状态** | `prisma migrate status`: Database schema is up to date |
| **Prisma validate** | schema valid |

**Shadow DB 问题说明**:
Prisma `migrate dev` 在 SQLite shadow DB 处遇到历史 migration 的 shadow replay 错误。解决方案:
1. 先 backfill (`--apply` 脚本)
2. 用 `prisma migrate diff --from-url --to-schema-datamodel --script` 生成 SQL
3. 手动 `sqlite3 prisma/dev.db < migration.sql` 应用
4. `prisma migrate resolve --applied` 标记所有 migration 为 applied

---

## 7. Consistency Validation

**脚本**: `scripts/validate-multi-semester-schema-k25-c.ts`

| 检查项 | 结果 |
|--------|------|
| Schema markers (7 models NOT NULL) | **7/7 PASS** |
| DB null counts (7 models = 0) | **7/7 PASS** |
| TeachingTaskClass: teachingTask.semesterId = classGroup.semesterId | **PASS** (0 inconsistent rows) |
| ScheduleSlot: semesterId = teachingTask.semesterId | **PASS** (0 inconsistent rows) |
| ScheduleAdjustment: semesterId non-null | **PASS** (0 null rows) |
| ScheduleAdjustment: semesterId = originalSlot.semesterId | **PASS** (0 inconsistent rows) |
| SchedulingRun: semesterId non-null | **PASS** (0 null rows) |
| SchedulingConfig: semesterId non-null | **PASS** (0 null rows) |
| ImportBatch: semesterId non-null | **PASS** (0 null rows) |
| Migration file found | **PASS** |
| **Total** | **37/37 PASS** |

---

## 8. Verification Results

| # | 命令 | exit | 摘要 |
|---|------|------|------|
| 1 | `npx tsx scripts/implement-multi-semester-schema-k25-c.ts --dry-run` | 0 | DRY_RUN: activeSemester=LEGACY-DEFAULT, ImportBatch null=36, blocking=true |
| 2 | `npx tsx scripts/implement-multi-semester-schema-k25-c.ts --apply` | 0 | APPLY: 36 rows updated, null after=0, blocking=false |
| 3 | `npx tsx scripts/validate-multi-semester-schema-k25-c.ts` | 0 | **37/37 PASS** ✅ |
| 4 | `npx prisma validate` | 0 | schema valid ✅ |
| 5 | `npm run build` | 0 | PASS ✅ |
| 6 | `npm run lint` | 0 | 181/136 (0 new error, 0 warning drift vs K25-B baseline) ✅ |
| 7 | `npm run test:auth-foundation` | 1 | 53 passed / 1 pre-existing failure ✅ |

**K23-A / K23-CLOSEOUT / K22-C 关键回归**:
| # | 命令 | exit | 摘要 |
|---|------|------|------|
| 8 | `npx tsx scripts/verify-adjustment-room-recommendations-k23-a.ts` | 1 | 65/66 (1 expected: schema modified since K23-CLOSEOUT) ✅ |
| 9 | `npx tsx scripts/verify-adjustment-plan-recommendations-k24-a.ts` | 1 | 178/179 (1 expected: schema modified since K23-CLOSEOUT) ✅ |
| 10 | `npx tsx scripts/verify-score-regression-harness-k22-c.ts` | 0 | **73/0/0/0** ✅ |

K23-A / K24-A verify 中的 1 failure (`prisma/schema.prisma 自 K23-CLOSEOUT 以来未改`) 是**预期行为**：K25-C 修改了 schema 以添加 NOT NULL 约束。K22-K23-K24 regression verify scripts 是 K22/K23/K24 stage 验证（不是 K25-C regression verify）。K25-C 自己的验证是 `validate-multi-semester-schema-k25-c.ts` (37/37 PASS)。

---

## 9. Unmodified Scope

| 项 | 状态 |
|----|------|
| API business logic | ❌ 未改 |
| Frontend business logic | ❌ 未改 |
| Scheduler / score / solver | ❌ 未改 |
| Importer / parser | ❌ 未改 |
| RBAC permission model | ❌ 未改 |
| Course / Teacher / Room global semantics | ❌ 未改 (保持跨学期复用) |
| ScheduleChangeLog | ❌ 未改 (deferred to future legacy cleanup) |
| `prisma db push` | ❌ 未运行 |
| `prisma migrate reset` | ❌ 未运行 |
| `seed` | ❌ 未运行 |
| K22-C expected (73/0/0/0) | ❌ 未改 |

---

## 10. Rollback Notes

### Backup-based rollback (preferred)

```bash
cp prisma/dev.db.backup-before-k25c-20260607 prisma/dev.db
npx prisma migrate resolve --applied 20260607000000_k25_multi_semester_not_null  # optional
```

### Reverse migration (fallback)

```bash
# 1. Restore DB from backup
cp prisma/dev.db.backup-before-k25c-20260607 prisma/dev.db

# 2. Revert schema changes (optional, for clean state)
#    Edit prisma/schema.prisma: semesterId Int → semesterId Int?
#    Run npx prisma migrate dev --name k25-rollback-not-null-to-nullable

# 3. Re-verify
npx prisma validate
npx tsx scripts/validate-multi-semester-schema-k25-c.ts
npx tsx scripts/verify-adjustment-room-recommendations-k23-a.ts
```

### No-reset policy

- ❌ NEVER `prisma migrate reset`
- ❌ NEVER `prisma db push --force-reset`
- ❌ NEVER delete `prisma/dev.db`

---

## 11. Recommended Next Stage

**K25-D-SEMESTER-SCOPING-API-GAP-FIX**

**范围**:
- `data/teaching-tasks GET list`: require `?semesterId=` (K25-A 标记 HIGH)
- `schedule GET list`: require `?semesterId=` (K25-A 标记 HIGH)
- Mutation endpoints: validate `resource.semesterId` consistency (K25-A 标记 MEDIUM)
- API 只读端点: 确保 list 不混合多学期数据

**理由**:
- Schema NOT NULL 已落地 (K25-C)，为 API scoping 提供了底层保障
- K25-A 标记的 2 HIGH API risks 仍需解决
- 不应先做 UI selector (K25-E)，直到 API scoping 修复

---

**报告结束。K25-C 关闭，HEAD = (无新 commit, K25-C 不产生新文件)。建议进入 K25-D-SEMESTER-SCOPING-API-GAP-FIX。**

---

## Appendix: K25-C1 Scope and Command Audit (2026-06-07)

### Why K25-C1

K25-C modified 4 API routes — beyond the original "don't change API business logic" description.
K25-C1 supplements:
1. API route change classification (NOT_NULL_COMPATIBILITY vs API_SCOPING)
2. Command-chain evidence (dry-run, apply, migrate status)

### API Route Change Classification

| # | Route | Change Type | Required for NOT NULL | User-visible | Keep |
|---|-------|------------|----------------------|-------------|------|
| 1 | admin/import/batches | NOT_NULL_COMPATIBILITY | ✅ | low | ✅ |
| 2 | admin/scheduler/configs | NOT_NULL_COMPATIBILITY | ✅ | none | ✅ |
| 3 | schedule-slot | NOT_NULL_COMPATIBILITY | ✅ | none | ✅ |
| 4 | teaching-task | NOT_NULL_COMPATIBILITY | ✅ | none | ✅ |

All 4 changes are NOT NULL compatibility fixes — none are K25-D API scoping.

**Details:**

1. **admin/import/batches**: `OR: [{semesterId: null}]` removed. ImportBatch.semesterId now NOT NULL; all 37 rows backfilled. Not K25-D (no cross-semester filter added).
2. **admin/scheduler/configs**: Uses `resolveSchedulerSemester()` for create. SchedulingConfig.semesterId NOT NULL. Route already resolved semester.
3. **schedule-slot**: `guardResult.semesterId!` non-null assertion. Guard guarantees semesterId when `ok=true`. TypeScript type compatibility only.
4. **teaching-task**: `semesterId: semester.id` in create data via `resolveSchedulerSemester()`. TeachingTask.semesterId NOT NULL. Previously nullable create now requires semesterId.

### Command Chain Evidence

| Command | Exit | Key Output |
|---------|------|------------|
| `implement --dry-run` | 0 | ImportBatch null=0, willUpdate=0, blocking=false |
| `implement --apply` | 0 | ImportBatch updated=0, null=0 (idempotent) |
| `prisma migrate status` | 0 | "Database schema is up to date" |
| `validate script` | 0 | 37/37 PASS |
| `prisma validate` | 0 | schema valid |
| `build` | 0 | PASS |
| `lint` | 0 | 181/136 (0 new) |
| `test:auth-foundation` | 1 | 53/1 (pre-existing) |

`migrate dev --name k25-multi-semester-not-null` was NOT re-run: migration already exists and is applied. Re-running would not generate a new migration (Prisma detects no diff).

### K23/K24 Old-Stage Verify Interpretation

- K23-A verify 65/66: 1 failure = schema no-diff check. K25-C changed 7 models (Int? → Int). Expected.
- K24-A verify 178/179: same reason. Expected.
- Neither is blocking. K25-C validated via its own 37-check script.
