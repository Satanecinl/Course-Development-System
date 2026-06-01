# K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-FIX

## 概述

修复管理员数据页相关 API 的学期边界问题，确保 semester-bound 模型查询按 semester scoped。

## 修改文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/app/api/admin/[model]/route.ts` | 修改 | 新增 semester scoping for GET/POST/PUT/DELETE |
| `src/app/api/data/summary/route.ts` | 修改 | 学期模型统计按 semester scoped |
| `src/app/api/data/teaching-tasks/route.ts` | 修改 | 查询按 semester scoped |
| `src/app/api/data/schedule-slots/route.ts` | 修改 | 查询按 semester scoped |
| `src/app/api/entity-list/route.ts` | 修改 | classgroup 按 semester scoped |
| `scripts/test-semester-admin-data-pages-scoping-fix.ts` | 新增 | 验证脚本 |

## Scoped Model 列表

| 模型 | Prisma 模型 | 说明 |
|---|---|---|
| classgroup | ClassGroup | 学期绑定 |
| teachingtask | TeachingTask | 学期绑定 |
| scheduleslot | ScheduleSlot | 学期绑定 |

## Global Model 列表（不加 semester filter）

| 模型 | Prisma 模型 | 说明 |
|---|---|---|
| room | Room | 全局 |
| teacher | Teacher | 全局 |
| course | Course | 全局 |
| user | User | 全局 |
| role | Role | 全局 |
| permission | Permission | 全局 |

## `/api/admin/[model]` Guard 策略

### SEMESTER_SCOPED_MODELS

```typescript
const SEMESTER_SCOPED_MODELS = new Set(['classgroup', 'teachingtask', 'scheduleslot'])
```

### Semester 解析

- `resolveSemesterIfNeeded(model, searchParams, body?)` — 对 scoped model 调用 `resolveSchedulerSemester`
- 支持 `?semesterId=X` query param
- 未传时 fallback 到唯一 active Semester
- 无 active 或多个 active 时返回 400

### GET list

- scoped models: `where.semesterId = semester.id`
- global models: 无 semester filter
- 保留原有分页、搜索、排序、include

### POST create

- scoped models: 自动写入 `semesterId = resolved semester.id`
- 显式传 `semesterId` 但不匹配 resolved semester 时 → 400
- global models: 无 semesterId 注入

### PUT update

- scoped models: 同学期 guard — 验证 `existing.semesterId === semester.id`
- 不匹配 → 403
- 不允许将 `semesterId` 改为其他值 → 400

### DELETE

- scoped models: 同学期 guard — 验证 `existing.semesterId === semester.id`
- 不匹配 → 403

## `/api/data/*` Scoping 策略

### `/api/data/summary`

| 统计项 | 模型 | 是否 scoped |
|---|---|---|
| courses | Course | 否（全局） |
| teachers | Teacher | 否（全局） |
| rooms | Room | 否（全局） |
| classGroups | ClassGroup | 是 |
| teachingTasks | TeachingTask | 是 |
| scheduleSlots | ScheduleSlot | 是 |

- 响应新增 `semester: { id, code, name }` 非破坏性元数据
- 保留原有 `summary.*` 字段

### `/api/data/teaching-tasks`

- `where.semesterId = semester.id`
- 保留原有 select、take: 100、orderBy

### `/api/data/schedule-slots`

- `where.semesterId = semester.id`
- 保留原有 select、take: 100、orderBy

## entity-list Scoping 策略

| type | 模型 | 是否 scoped |
|---|---|---|
| classgroup | ClassGroup | 是 |
| teacher | Teacher | 否（全局） |
| room | Room | 否（全局） |
| course | Course | 否（全局） |

## 验证结果

所有验证命令通过：

- `test-semester-admin-data-pages-scoping-fix.ts` — 35+ static + data checks
- `audit-semester-admin-data-pages-scoping.ts` — 已修复风险降级
- `test-semester-export-scoping-fix.ts` — 35 checks
- `test-semester-conflict-adjustment-scoping.ts` — 29 checks
- `test-semester-scheduler-scoping-prep.ts` — 54 checks
- `test-semester-backfill-default.ts` — 27 checks
- `test-scheduler-final-safety-regression.ts` — 75 checks
- `test-scheduler-seeded-prng.ts` — passed
- Build — 通过

## 遗留风险

| 风险 | 等级 | 说明 |
|---|---|---|
| Import scoping | MEDIUM | 尚未实现，需后续阶段 |
| Ordinary schedule view scoping | MEDIUM | 尚未实现，需后续阶段 |
| UI semester selector | LOW | 尚未实现，当前由后端默认 |
| Required constraint | LOW | 尚未实现 |

所有遗留风险属于后续阶段，不阻塞本阶段关闭。
