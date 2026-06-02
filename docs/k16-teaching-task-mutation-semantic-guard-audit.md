# K16-TEACHING-TASK-MUTATION-SEMANTIC-GUARD-AUDIT

## Stage Name

K16-TEACHING-TASK-MUTATION-SEMANTIC-GUARD-AUDIT

## Date

2026-06-02

## Background

K11/K13/K14 已为 ScheduleSlot mutation、conflict check、response shape、RBAC 边界做过多轮修复。K14-FIX-B 曾新增 admin generic teachingtask PUT 的 teacherId 变更 guard。但 dedicated `PUT /api/teaching-task/[id]` 目前主要已知覆盖 room conflict check。尚未系统确认 dedicated route 与 admin generic route 在 TeachingTask 语义变更上是否一致，尚未系统确认 teacherId / classGroup / course / weeks / studentCount / roomId 等字段变更是否会破坏既有关联 ScheduleSlot 的排课一致性。

本阶段只做审计，不做业务修复。

## Audit Goal

只读审计 TeachingTask mutation 的语义一致性与 guard 覆盖情况。

重点回答：

1. dedicated teaching-task PUT 修改 TeachingTask 时，哪些字段会影响既有关联 ScheduleSlot？
2. dedicated route 是否覆盖这些影响？
3. admin generic teachingtask POST/PUT 是否覆盖这些影响？
4. dedicated route 与 admin generic route 是否存在语义不一致？
5. teacherId 变更是否会导致既有 ScheduleSlot 出现教师冲突？
6. roomId 变更是否会导致既有 ScheduleSlot 出现教室冲突？
7. classGroupIds 变更是否会导致班级冲突或班级归属错误？
8. courseId 变更是否会影响 schedule display、冲突语义、导出或调课语义？
9. weekType / startWeek / endWeek 变更是否会影响已排课 slot 的合法性？
10. 是否存在绕过 server-side conflict check 的 TeachingTask mutation 路径？

## Audit Scope

### 已覆盖文件

- **Dedicated teaching-task routes：**
  - `src/app/api/teaching-task/[id]/route.ts`（6810 bytes）
  - `src/app/api/teaching-task/route.ts`（2353 bytes，POST create）
- **Admin generic route：**
  - `src/app/api/admin/[model]/route.ts`（13418 bytes，teachingtask POST/PUT/DELETE 分支）
- **TeachingTask mutation guard：**
  - `src/lib/schedule/teaching-task-mutation-guard.ts`（2824 bytes，guardAdminTaskUpdate）
- **Conflict check engine：**
  - `src/lib/schedule/conflict-check.ts`（10390 bytes，checkScheduleConflicts）
  - `src/lib/schedule/conflict-rules.ts`（12990 bytes，pure rules kernel）
  - `src/lib/schedule/slot-mutation-guard.ts`（5382 bytes，guardAdminSlotCreate/Update）
- **ScheduleSlot relation：**
  - `prisma/schema.prisma`（10663 bytes，TeachingTask + ScheduleSlot + TeachingTaskClass + ScheduleAdjustment）
- **Frontend callers：**
  - `src/app/admin/db/admin-db-content.tsx`（19108 bytes，handleTaskSave）
  - `src/components/admin-db/teaching-task-dialog.tsx`（5296 bytes，专用编辑弹窗）

### 已搜索模式

- `teachingTask.update` / `teachingTask.updateMany` / `teachingTask.delete` — 找到 2 处（dedicated route + import rollback）
- `scheduleSlot.updateMany` — 找到 1 处（dedicated route 用於 roomId propagation）
- `requirePermission` 调用 — 已确认所有 teaching-task 路径的权限
- `guardAdminTaskUpdate` — admin generic route 已调用，dedicated route 未调用
- `checkScheduleConflicts` — dedicated route 调用（roomId），admin generic route 经 guardAdminTaskUpdate 调用（teacherId）

## TeachingTask Field Impact Matrix

基于 Prisma schema (`prisma/schema.prisma` TeachingTask model) 和实际代码路径分析。

| Field / Relation | Affects Existing ScheduleSlot? | Current Guard | Risk | Recommendation |
|---|---:|---|---|---|
| `id` | NO (immutable key) | N/A | NONE | N/A |
| `courseId` | YES (display, conflict message, export) | NONE — dedicated route 用 `courseName` upsert 改 courseId；admin generic route whitelist 含 courseId 直接改 | MEDIUM | 添加 guard 或文档说明 courseId 变更对导出/调课语义的影响 |
| `teacherId` | YES (teacher conflict semantics) | Partial — dedicated route 无 guard；admin generic route 经 guardAdminTaskUpdate 调用 checkScheduleConflicts | HIGH | dedicated route 必须添加 teacherId 变更的 conflict guard |
| `weekType` | YES (week overlap semantics) | NONE — dedicated route 直接更新；admin generic route whitelist 含 weekType | MEDIUM | 添加 guard 或文档说明 week 约束变更对 slot 合法性的影响 |
| `startWeek` | YES (week overlap semantics) | NONE — 同上 | MEDIUM | 同上 |
| `endWeek` | YES (week overlap semantics) | NONE — 同上 | MEDIUM | 同上 |
| `remark` | NO (display only) | N/A — dedicated route 和 admin generic route 都接受 | NONE | N/A |
| `importBatchId` | NO (audit trail) | N/A | NONE | N/A |
| `semesterId` | YES (semester scoping, semester guard) | Partial — dedicated route 无 guard；admin generic route 有 same-semester guard | MEDIUM | dedicated route 必须添加 same-semester guard |
| `taskClasses` (via TeachingTaskClass) | YES (classGroupIds 冲突语义 + class 归属) | NONE — dedicated route 直接 deleteMany+createMany；admin generic route 不改 classGroupIds | MEDIUM | 添加 classGroupIds 变更的 conflict guard |
| `scheduleSlots` (via teachingTaskId) | N/A (relation, not field) | N/A | NONE | N/A |

## Mutation Path Inventory

| Path | Method | Permission | Guard | Covered Fields | Gaps |
|---|---|---|---|---|---|
| `PUT /api/teaching-task/[id]` | PUT | `teaching-task:write` | Room conflict check (lines ~94-127) | roomId | teacherId, weekType/startWeek/endWeek, classGroupIds, semesterId, courseId |
| `POST /api/teaching-task` | POST | `data:write` | None (no existing slots at create) | (all create fields) | permission is `data:write` not `teaching-task:write`; no semester guard |
| `PUT /api/admin/[model]` (teachingtask) | PUT | `teaching-task:write` (via getAdminWritePermission) | guardAdminTaskUpdate → checkScheduleConflicts | teacherId | roomId (whitelist excludes it), weekType/startWeek/endWeek, classGroupIds, semesterId (but has same-semester guard) |
| `POST /api/admin/[model]` (teachingtask) | POST | `teaching-task:write` | None (no existing slots at create) | (whitelist fields) | roomId (whitelist excludes it) |
| `DELETE /api/admin/[model]` (teachingtask) | DELETE | `data:delete` | countReferences (checks if any ScheduleSlot references this task) | (all) | counts slot references only; doesn't cascade-delete slots |
| `DELETE /api/admin/[model]` (scheduleslot) | DELETE | `data:delete` | countReferences | N/A | unrelated |
| `src/lib/import/importer.ts` | (create only) | N/A (own transaction) | own validation | N/A | (read-only audit, not a fix path) |
| `src/lib/import/rollback.ts` | (delete only) | N/A (own transaction) | own validation | N/A | (rollback path) |
| `src/lib/scheduler/apply.ts` | (slot only) | N/A (own transaction) | N/A | N/A | (updates ScheduleSlot, not TeachingTask) |
| `src/lib/scheduler/rollback.ts` | (slot only) | N/A (own transaction) | N/A | N/A | (updates ScheduleSlot, not TeachingTask) |

## Dedicated Route Audit Result

### 覆盖情况

- ✅ **roomId 变更** — `checkScheduleConflicts` for each existing slot with `targetRoomId`
- ✅ **roomId → ScheduleSlot propagation** — `scheduleSlot.updateMany({ where: { teachingTaskId }, data: { roomId } })`
- ❌ **teacherId 变更** — 无 guard，直接 `tx.teachingTask.update({ data: { teacherId } })`
- ❌ **weekType/startWeek/endWeek 变更** — 无 guard，直接更新
- ❌ **classGroupIds 变更** — `TeachingTaskClass.deleteMany + createMany` 无 guard
- ❌ **semesterId 变更** — 无 same-semester check
- ❌ **courseId/courseName 变更** — upsert course then update courseId（display 变化）
- ✅ **remark 变更** — 无需 guard
- ✅ **教学任务创建 (`POST`)** — 用 `data:write`，无 conflict surface

### 主要差距

- **HIGH**: teacherId 变更会导致既有关联 ScheduleSlot 出现教师冲突，dedicated route 无任何 guard
- **MEDIUM**: 缺少 semester guard（admin generic route 有，dedicated route 没有）
- **MEDIUM**: 缺少 week constraint 变更 guard
- **MEDIUM**: 缺少 classGroupIds 变更 guard

## Admin Generic Route Audit Result

### 覆盖情况

- ✅ **teacherId 变更** — `guardAdminTaskUpdate` → `checkScheduleConflicts` (since K14-FIX-B)
- ✅ **same-semester guard** — `resolveSemesterIfNeeded` + `existing.semesterId !== semester.id` check
- ❌ **roomId 变更** — `teachingtask` FIELD_WHITELIST 不含 `roomId`（by design, roomId 走 dedicated route）
- ❌ **weekType/startWeek/endWeek 变更** — whitelist 含这些字段但 `guardAdminTaskUpdate` 只查 teacherId
- ❌ **classGroupIds 变更** — whitelist 不含（by design, 走 dedicated route）
- ❌ **courseId 变更** — whitelist 含，无 guard

### 主要差距

- week 约束/classGroupIds 变更在 admin generic route 也不被 guard（但 admin generic route 实际上不更新这些字段 — whitelist 已排除）
- roomId 不在 whitelist，由 dedicated route 接管

## Guard / Conflict Check Reuse

| Caller | Engine | Reuse? |
|---|---|---|
| `/api/conflict-check` | `checkScheduleConflicts` | N/A (read-only) |
| `/api/schedule-slot` POST | `checkScheduleConflicts` via `guardSlotCreate` | YES |
| `/api/schedule-slot/[id]` PUT | `checkScheduleConflicts` via `guardSlotUpdate` | YES |
| `/api/teaching-task/[id]` PUT | `checkScheduleConflicts` (inline for roomId) | YES (inline, not via guard module) |
| `/api/admin/[model]` (scheduleslot) | `checkScheduleConflicts` via `guardAdminSlotCreate/Update` | YES |
| `/api/admin/[model]` (teachingtask) | `checkScheduleConflicts` via `guardAdminTaskUpdate` | YES (teacherId only) |
| `/api/schedule-adjustments/dry-run` | `findRuleMatches` (direct, K13-FIX-C) | YES (direct) |

**结论:** Conflict check engine (`checkScheduleConflicts`) 已是 single source of truth。K13-FIX-C 抽出的 pure rule kernel (`findRuleMatches`, `toConflictDetails`) 也被多个 caller 复用。Dedicated teaching-task route 在 roomId 分支内联调用了 `checkScheduleConflicts`，未走 `guardAdminTaskUpdate`（因为它只查 teacherId）。这是合理的代码复用，但 future Fix-A 应考虑抽取 shared guard。

## Dedicated vs Generic Parity Conclusion

| Aspect | Dedicated PUT | Admin Generic PUT | Parity |
|---|---|---|---|
| Permission | `teaching-task:write` | `teaching-task:write` (via getAdminWritePermission) | ✅ Same |
| Field set | courseName, teacherId, roomId, weekType, startWeek, endWeek, remark, classGroupIds | courseId, teacherId, weekType, startWeek, endWeek, remark | ❌ Different (dedicated accepts roomId + classGroupIds; generic accepts courseId) |
| teacherId guard | NONE | guardAdminTaskUpdate → checkScheduleConflicts | ❌ Asymmetric (dedicated missing) |
| roomId guard | checkScheduleConflicts (inline) | N/A (whitelist excludes roomId) | N/A (different paths) |
| week constraint guard | NONE | NONE (guard only checks teacherId) | ❌ Both missing |
| classGroupIds guard | NONE | N/A (whitelist excludes) | N/A (different paths) |
| semester guard | NONE | resolveSemesterIfNeeded + same-semester check | ❌ Asymmetric (dedicated missing) |
| Conflict response shape | `{ error, conflicts, conflictDetails }` 409 | `{ error, conflicts, conflictDetails }` 409 | ✅ Same |
| Transaction | yes (lines ~69-172) | N/A (uses Prisma update directly) | N/A |

**结论:**

- **两者不完全一致** — dedicated route 接受 `roomId` 和 `classGroupIds`（generic 不接受），generic 有 same-semester guard（dedicated 没有），generic 有 teacherId guard（dedicated 没有）
- **是否会导致绕过**: YES — 攻击者/操作者可以用 dedicated route 修改 `teacherId` 而绕开 admin generic route 的 `guardAdminTaskUpdate`
- **是否建议 Fix-A**: YES — 需要统一 dedicated route 的 guard 覆盖

## Findings Table

| ID | Severity | Title | Area |
|---|---|---|---|
| K16-TT-MUTATION-HIGH-3 | HIGH | Dedicated route does not guard teacherId change | teacherId conflict |
| K16-TT-MUTATION-MEDIUM-2 | MEDIUM | Dedicated route has no semester guard | semester scoping |
| K16-TT-MUTATION-MEDIUM-3 | MEDIUM | Dedicated route does not guard week constraint change | week semantics |
| K16-TT-MUTATION-MEDIUM-4 | MEDIUM | Dedicated route does not guard classGroupIds change | classGroup conflict |
| K16-TT-MUTATION-LOW-1 | LOW | guardAdminTaskUpdate does not cover roomId (by design) | documentation |
| K16-TT-MUTATION-LOW-2 | LOW | POST /api/teaching-task uses data:write | permission |
| K16-TT-MUTATION-NONE-1 | NONE | Dedicated route uses teaching-task:write | permission |
| K16-TT-MUTATION-NONE-2 | NONE | Admin generic enforces model-specific permission | permission |
| K16-TT-MUTATION-NONE-3 | NONE | Dedicated route uses checkScheduleConflicts for roomId | conflict check |
| K16-TT-MUTATION-NONE-4 | NONE | Admin generic calls guardAdminTaskUpdate | guard wiring |
| K16-TT-MUTATION-NONE-5 | NONE | ScheduleSlot has teachingTaskId relation | schema |
| K16-TT-MUTATION-NONE-6 | NONE | guardAdminTaskUpdate reuses checkScheduleConflicts | guard wiring |
| K16-TT-MUTATION-NONE-7 | NONE | Conflict check reads teacherId/classGroupIds/week | conflict check |
| K16-TT-MUTATION-NONE-8 | NONE | No raw SQL in dedicated routes | safety |

## Risk Summary

- **HIGH: 1** — teacherId 变更无 guard（dedicated route）
- **MEDIUM: 3** — semester guard 缺失、week constraint 无 guard、classGroupIds 无 guard
- **LOW: 2** — 文档/权限细节
- **NONE: 8** — 已确认覆盖

**BLOCKING: YES**（存在 HIGH）

## Recommendation: Proceed to Fix-A

建议进入下一阶段：

**K16-FIX-A-TEACHING-TASK-MUTATION-GUARD-PARITY**

### Fix-A 建议范围

1. **HIGH fix**: 在 dedicated `PUT /api/teaching-task/[id]` 中添加 teacherId 变更的 conflict guard
   - 复用 `guardAdminTaskUpdate` 或直接调用 `checkScheduleConflicts`
   - 当 teacherId 改变且存在关联 ScheduleSlot 时，对每个 slot 做 conflict check
2. **MEDIUM fix**: 在 dedicated route 中添加 same-semester guard
   - 复用 `resolveSemesterIfNeeded` 模式
   - 验证 task.semesterId === resolved semester.id
3. **MEDIUM fix**: 在 dedicated route 中添加 week constraint 变更的 conflict guard
   - 当 weekType/startWeek/endWeek 改变且存在关联 ScheduleSlot 时，重新做 conflict check
4. **MEDIUM fix**: 在 dedicated route 中添加 classGroupIds 变更的 conflict guard
   - 当 classGroupIds 改变时，用新的 classGroupIds 重新做 conflict check
5. **LOW fix**: 在 `guardAdminTaskUpdate` 中添加 roomId 显式 no-op 文档注释
6. **LOW fix**: 可选迁移 `POST /api/teaching-task` 到 `teaching-task:write`

### 不建议在本阶段做

- 修改 Prisma schema（约束已足够）
- 抽取 shared teaching-task mutation guard module（K13 已抽取 pure rule kernel，guard 抽取属于独立重构）
- 跨 route 合并（dedicated route 是 admin 专用，admin generic route 是通用，合并会扩大改动面）
- 修复 POST /api/teaching-task 的 `data:write` 权限（边界明确，不在 K16 范围）

## What This Audit Did NOT Do

- 未修改 Prisma schema
- 未修改 prisma/dev.db
- 未运行 db push / migrate / reset
- 未修改 seed-auth
- 未修改 role mapping
- 未修改 requirePermission
- 未修改 API route 业务逻辑
- 未修改 frontend 业务逻辑
- 未修改 conflict-check / guard / adjustment / import / solver / parser
- 未新增权限 key
- 未新增 /api/scheduler/run
- 未新增 Re-run 按钮
- 未新增 UI semester selector

## Verification Commands and Results

```bash
# K16 audit
npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts
# Result: HIGH 1 / MEDIUM 3 / LOW 2 / NONE 8 — BLOCKING: YES

# K15 main audit
npx.cmd tsx scripts/audit-rbac-permission-granularity-migration.ts
# Result: Phase A/B/C/D/E DONE

# K14 RBAC schedule write hardening
npx.cmd tsx scripts/audit-rbac-schedule-write-hardening.ts
# Result: HIGH 0 / MEDIUM 2 / LOW 2 / NONE 9

# K11 schedule mutation server guards
npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts
# Result: HIGH 0 / MEDIUM 0 / LOW 3 / NONE 8

# K13 conflict response shape
npx.cmd tsx scripts/verify-schedule-conflict-response-shape-fix-d.ts
# Result: 60 PASS / 0 FAIL

# K12 client preflight
npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts
# Result: 23 PASS / 0 FAIL

# Build
npm.cmd run build
# Result: Compiled successfully

# Lint
npm.cmd run lint
# Result: pre-existing scripts/ errors only (no new errors)

# Auth foundation test
npm.cmd run test:auth-foundation
# Result: 53 passed / 1 failed (pre-existing ScheduleAdjustment ACTIVE count mismatch)
```
