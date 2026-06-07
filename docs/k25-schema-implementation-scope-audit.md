# K25-C1 Scope and Command Audit

**Stage**: `K25-C1-SCHEMA-IMPLEMENTATION-SCOPE-AND-COMMAND-AUDIT`
**Date**: 2026-06-07
**K25-C commit**: `669ae4f`

---

## 1. Executive Summary

K25-C 主体已完成 (commit `669ae4f`)。K25-C1 补齐两个验收缺口：

1. **API route change classification** — K25-C 修改了 4 个 API route，需确认均为 NOT NULL compatibility
2. **Command-chain evidence** — dry-run / apply / migrate status 的逐项记录

**结论**: 4 个 API route 修改全部为 `NOT_NULL_COMPATIBILITY`，不涉及 K25-D API scoping。
Command-chain evidence 已补齐。**blocking = false**。

---

## 2. K25-C Scope Exception Review

K25-C 修改了 4 个 API route，超出原本 "不要改 API business logic" 的描述。

### Classification Table

| # | Route | Change Type | Required for NOT NULL | User-visible | Keep |
|---|-------|------------|----------------------|-------------|------|
| 1 | admin/import/batches | NOT_NULL_COMPATIBILITY | ✅ | low | ✅ |
| 2 | admin/scheduler/configs | NOT_NULL_COMPATIBILITY | ✅ | none | ✅ |
| 3 | schedule-slot | NOT_NULL_COMPATIBILITY | ✅ | none | ✅ |
| 4 | teaching-task | NOT_NULL_COMPATIBILITY | ✅ | none | ✅ |

### Route Details

#### 1. admin/import/batches

- **修改**: 移除 `OR: [{semesterId: null}]` 过滤
- **分类**: NOT_NULL_COMPATIBILITY
- **Required for NOT NULL**: ✅ — ImportBatch.semesterId 已 NOT NULL，null 已 backfill
- **K25-D scoping**: ❌ — 没有新增跨学期 filter
- **User-visible behavior**: low — 历史 null batch 不再作为兼容 fallback (已 backfill)
- **Keep**: ✅
- **验证**: `semesterId: semester.id` filter, `resolveSchedulerSemester()`

#### 2. admin/scheduler/configs

- **修改**: 创建 config 时使用 `resolveSchedulerSemester()` 兜底
- **分类**: NOT_NULL_COMPATIBILITY
- **Required for NOT NULL**: ✅ — SchedulingConfig.semesterId 已 NOT NULL
- **K25-D scoping**: ❌ — 路由已 resolve semester
- **User-visible behavior**: none
- **Keep**: ✅
- **验证**: `resolveSchedulerSemester` present, `semesterId` in create data

#### 3. schedule-slot

- **修改**: `guardResult.semesterId!` non-null assertion
- **分类**: NOT_NULL_COMPATIBILITY
- **Required for NOT NULL**: ✅ — TypeScript 类型兼容
- **K25-D scoping**: ❌ — 纯类型兼容
- **User-visible behavior**: none — guard 保证 `ok=true` 时 semesterId 存在
- **Keep**: ✅
- **验证**: `guardResult.semesterId!` assertion, K25-C comment

#### 4. teaching-task

- **修改**: 创建 task 时注入 `semesterId: semester.id`
- **分类**: NOT_NULL_COMPATIBILITY
- **Required for NOT NULL**: ✅ — TeachingTask.semesterId 已 NOT NULL
- **K25-D scoping**: ❌ — 不是 list scoping
- **User-visible behavior**: none
- **Keep**: ✅
- **验证**: `resolveSchedulerSemester` present, `semesterId: semester.id` in create

---

## 3. Command Chain Evidence

| Command | Exit | Key Output |
|---------|------|------------|
| `implement --dry-run` | 0 | ImportBatch null=0, willUpdate=0, blocking=false |
| `implement --apply` | 0 | ImportBatch updated=0, null=0 (idempotent) |
| `prisma migrate status` | 0 | "Database schema is up to date" |
| `validate script` | 0 | 37/37 PASS |
| `prisma validate` | 0 | schema valid |
| `build` | 0 | 31/31 routes compiled |
| `lint` | 0 | 181 errors / 136 warnings (0 new) |
| `test:auth-foundation` | 1 | 53/1 (pre-existing) |
| K22-C | 0 | 73/0/0/0 |

### migrate dev 说明

`prisma migrate dev --name k25-multi-semester-not-null` **未重新运行**。

原因: K25-C 已生成并应用 migration `20260607000000_k25_multi_semester_not_null`。
Prisma 检测到 schema 与 DB 一致，不会生成新 migration。
替代验证: `prisma migrate status` 显示 "Database schema is up to date"。

---

## 4. K23/K24 Old-Stage Verify Interpretation

| Verify | Result | Expected Failures | Reason |
|--------|--------|-------------------|--------|
| K23-A verify | 65/66 | 1 | Schema no-diff check (K25-C changed 7 models) |
| K24-A verify | 178/179 | 1 | Same — schema modified since K24-CLOSEOUT |

**为什么不阻塞 K25-C**:
- K23-A/K24-A verify 是旧阶段 schema no-diff 检查
- K25-C 修改了 schema (Int? → Int)
- K25-C 有自己的验证: `validate-multi-semester-schema-k25-c.ts` (37/37 PASS)
- K22-C 73/0/0/0 保持

---

## 5. Unmodified Scope

- ✅ Schema — 未继续修改 (K25-C 已完成)
- ✅ Migrations — 未新增
- ✅ DB — 未写业务数据
- ✅ 4 个 API routes — 未再修改
- ✅ K25-D API scoping — 未做
- ✅ K25-E UI selector — 未做
- ✅ Frontend — 未改
- ✅ Scheduler / score / solver — 未改
- ✅ Importer / parser — 未改
- ✅ RBAC — 未改
- ✅ Reset / force-reset / seed — 未运行

---

## 6. Recommendation

- ✅ **K25-C1 建议关闭** — scope audit 19/19 PASS, command evidence complete
- ✅ **K25-C 正式关闭** — 主体完成 + C1 补证完成
- ✅ **建议进入 K25-D-SEMESTER-SCOPING-API-GAP-FIX**
  - K25-D 范围: API scoping HIGH findings only (list endpoints require `?semesterId=`)
  - 不做 UI selector (K25-E)

---

**审计结束。K25-C1 关闭，K25-C 正式关闭。建议进入 K25-D。**
