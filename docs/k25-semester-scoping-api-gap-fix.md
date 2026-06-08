# K25-D Semester Scoping API Gap Fix

**Stage**: `K25-D-SEMESTER-SCOPING-API-GAP-FIX`
**Date**: 2026-06-07
**K25-C1 baseline commit**: `a0ecd7b`
**Type**: API hardening (no schema/DB/UI changes)

---

## 1. Executive Summary

K25-D 修复 K25-A 审计标记的 API 学期隔离 HIGH risks:

- `data/teaching-tasks GET list` 已有 `semesterId` filter (K25-A audit 后)
- `schedule GET list` 已有 `semesterId` filter (K25-A audit 后)

本阶段将各 route 的**零散 semester 解析**统一到新的 `resolveRequestSemester` helper,
并增加:

- query / header / body 三种显式 semesterId 解析
- 统一错误码 (INVALID_SEMESTER_ID / SEMESTER_NOT_FOUND / NO_ACTIVE_SEMESTER / MULTIPLE_ACTIVE_SEMESTERS)
- mutation classGroup same-semester guard
- mutation body.semesterId mismatch 早期 400 错误
- response 中暴露 `semesterSource`, 为 K25-E UI selector 留好字段

**不做**:
- ❌ UI selector (K25-E 范围)
- ❌ RBAC semester scope (deferred)
- ❌ Schema / migration / DB 改动

---

## 2. Source Findings

K25-A 审计标记 2 HIGH risks:

| # | Finding | Actual Route | K25-A risk | Remediation |
|---|---------|--------------|-----------|-------------|
| 1 | `data/teaching-tasks GET list` 无 semester filter | `src/app/api/data/teaching-tasks/route.ts` | (changed to INFO after K25-A already added filter) | K25-D: 升级为 `resolveRequestSemester` + defense-in-depth classGroup same-semester filter |
| 2 | `schedule GET list` 无 semester filter | `src/app/api/schedule/route.ts` + `src/app/api/data/schedule-slots/route.ts` | (already INFO) | K25-D: 升级为 `resolveRequestSemester` + defense-in-depth teachingTask same-semester filter |
| 3 | `teaching-task POST` 缺 semester 注入 | `src/app/api/teaching-task/route.ts` | (K25-C 已修) | K25-D: 升级为 `resolveRequestSemester` + classGroup same-semester guard |
| 4 | `teaching-task [id] PUT` 无 semester consistency | `src/app/api/teaching-task/[id]/route.ts` | HIGH (K25-A) | K25-D: 增加 classGroup same-semester guard |
| 5 | `schedule-slot [id] PUT` 无 semesterId reference | `src/app/api/schedule-slot/[id]/route.ts` | HIGH (K25-A) | K25-D: 增加 body.semesterId mismatch 400 guard |

---

## 3. Request Semester Resolution

新 helper: `src/lib/schedule/semester-scope.ts`

### 来源优先级

1. `?semesterId=` query
2. `X-Semester-Id` header
3. `body.semesterId`
4. **Transitional fallback**: 唯一 active semester

### Fallback 策略

- `allowActiveFallback` 默认 `true` (transitional)
- fallback 时 `response.semesterSource === "activeFallback"`, 方便 K25-E UI selector 检测并提示用户
- 不存在 active semester → `NO_ACTIVE_SEMESTER` 400
- 多个 active semester → `MULTIPLE_ACTIVE_SEMESTERS` 400
- semesterId 不存在 → `SEMESTER_NOT_FOUND` 400
- 非法 semesterId 格式 → `INVALID_SEMESTER_ID` 400

### 不变量

- 所有调用 `resolveRequestSemester` 的 route 必须用 `toSemesterErrorResponse(error)` 统一错误响应
- `resolveSchedulerSemester` (旧 API) 仍可继续使用, 但 K25-D 新增的 route 推荐使用 `resolveRequestSemester`

---

## 4. TeachingTask API Fix

### `GET /api/data/teaching-tasks`

- 使用 `resolveRequestSemester`
- `where: { semesterId: semester.id }`
- defense-in-depth: 过滤 `classGroup.semesterId !== semester.id` 的关联
- response 包含 `semesterId` 和 `semesterSource`

### `POST /api/teaching-task`

- 使用 `resolveRequestSemester` (从 query/header/body 解析)
- 若 body 提供 classGroupIds, 全部必须属于 `semester.id`, 否则 400 `CLASS_GROUP_SEMESTER_MISMATCH`
- response 包含 `semesterId` 和 `semesterSource`

### `PUT /api/teaching-task/[id]`

- 已有 `guardTeachingTaskUpdateSemantics` 包含 same-semester guard (K16-FIX-A)
- K25-D 新增: classGroupIds same-semester guard (400 `CLASS_GROUP_SEMESTER_MISMATCH`)

---

## 5. Schedule API Fix

### `GET /api/data/schedule-slots`

- 使用 `resolveRequestSemester`
- `where: { semesterId: semester.id }`
- defense-in-depth: 过滤 `teachingTask.semesterId !== semester.id` 的关联
- response 包含 `semesterId` 和 `semesterSource`

### `GET /api/schedule` (dashboard grid)

- 使用 `resolveRequestSemester`
- `where: { semesterId: semester.id }`
- viewType=class/teacher/room 仍按 K24 行为 (在同 semester 内过滤)
- response 包含 `semesterId` 和 `semesterSource`

### `POST /api/schedule-slot`

- K25-C: `guardResult.semesterId!` 从 task 反查 (K25-C 修改)
- K25-D: 不变, 已被 K25-C NOT NULL guard 覆盖

### `PUT /api/schedule-slot/[id]`

- 已有 `guardSlotUpdate` 包含 same-semester + conflict check (K16-FIX-A)
- K25-D 新增: 若 body.semesterId 显式提供且与 slot.semesterId 不一致, 立即 400 `SEMESTER_MISMATCH`
- defense-in-depth: 不依赖 guard 后置检查

---

## 6. Mutation Consistency Guards

| Route | 现有 Guard | K25-D 新增 |
|-------|-----------|-----------|
| `POST /api/teaching-task` | `resolveSchedulerSemester` (K25-C) | `resolveRequestSemester` + classGroup same-semester |
| `PUT /api/teaching-task/[id]` | `guardTeachingTaskUpdateSemantics` (K16) | classGroup same-semester guard |
| `POST /api/schedule-slot` | `guardSlotCreate` (K16) | 不变 (K25-C 已绑定) |
| `PUT /api/schedule-slot/[id]` | `guardSlotUpdate` (K16) | body.semesterId mismatch 400 guard |
| `POST /api/conflict-check` | 旧 `resolveSchedulerSemester` | `resolveRequestSemester` (query/header/body) |
| `GET/POST /api/schedule-adjustments` | `resolveSchedulerSemester` | 不变 (K25-A 已 INFO) |
| `dry-run / room-recommendations / plan-recommendations` | 从 originalSlot 反查 semester | 不变 (K25-A INFO, K24-A5 已加固) |
| `admin/scheduler/configs` | `resolveSchedulerSemester` (K25-C) | 不变 (K25-D 范围外) |
| `admin/scheduler/preview/apply/rollback` | preview `resolveSchedulerSemester` | 不变 (K25-A INFO) |

---

## 7. Non-Goals

- ❌ UI selector (K25-E 范围)
- ❌ RBAC semester scope
- ❌ Schema / migration / DB 改动
- ❌ Importer / parser 改动
- ❌ Scheduler / score / solver 改动
- ❌ K22 / K23 / K24 verify expected 改动

---

## 8. Verification Results

| # | 命令 | exit | 摘要 |
|---|------|------|------|
| 1 | `npx tsx scripts/verify-semester-scoping-api-k25-d.ts` | 0 | **54/54 PASS** ✅ |
| 2 | `npx tsx scripts/validate-multi-semester-schema-k25-c.ts` | 0 | **37/37 PASS** ✅ |
| 3 | `npx prisma validate` | 0 | schema valid ✅ |
| 4 | `npx prisma migrate status` | 0 | "Database schema is up to date" ✅ |
| 5 | `npm run build` | 0 | 31/31 routes compiled ✅ |
| 6 | `npm run lint` | 0 | 181/136 (0 new) ✅ |
| 7 | `npm run test:auth-foundation` | 1 | 53/1 (pre-existing) ✅ |

---

## 9. Unmodified Scope

- ❌ `prisma/schema.prisma` 未改
- ❌ `prisma/migrations/**` 未新增
- ❌ `prisma/dev.db` 未写
- ❌ Frontend UI selector 未做
- ❌ Scheduler / score / solver 未改
- ❌ Importer / parser 未改
- ❌ RBAC 未改
- ❌ K22 / K23 / K24 verify expected 未改
- ❌ `prisma migrate reset` / `db push --force-reset` 未运行
- ❌ `seed` 未运行

---

## 10. Recommended Next Stage

**K25-E-SEMESTER-SELECTOR-UX**

**范围**:
- 前端顶部 nav bar 学期下拉选择器
- API 请求自动带 `?semesterId=` 或 `X-Semester-Id` header
- 切换学期时刷新所有列表
- 不再改 schema / API scoping

**理由**:
- Schema NOT NULL 已完成 (K25-C)
- API scoping high-risk 已修复 (K25-D)
- 下一步可以做用户可见的学期选择器
- K25-E 可直接利用 `response.semesterSource` 字段显示 "transitional fallback" 提示

**报告结束。K25-D 关闭，HEAD = K25-D。建议进入 K25-E-SEMESTER-SELECTOR-UX。**
