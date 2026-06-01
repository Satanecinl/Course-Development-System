# K10-SEMESTER-CONFLICT-ADJUSTMENT-SCOPING

## 概述

让冲突检查、手动调课、撤销调课、调课历史和相关导出链路具备 semester 边界。

## 修改文件清单

| 文件 | 状态 | 用途 |
|---|---|---|
| `src/lib/conflict-check.ts` | 修改 | ConflictCheckInput 增加 semesterId，所有 ScheduleSlot 查询按 semester 过滤 |
| `src/lib/schedule/adjustments.ts` | 修改 | getEffectiveScheduleForWeek/dryRun/create/void 全部支持 semesterId |
| `src/types/schedule-adjustment.ts` | 修改 | ScheduleAdjustmentInput 增加 semesterId 字段 |
| `src/app/api/conflict-check/route.ts` | 修改 | 使用 resolveSchedulerSemester，传递 semesterId |
| `src/app/api/schedule-adjustments/route.ts` | 修改 | GET/POST 支持 semesterId，默认 active semester |
| `src/app/api/schedule-adjustments/dry-run/route.ts` | 修改 | 传递 semesterId |
| `src/app/api/schedule-adjustments/[id]/void/route.ts` | 修改 | 使用 resolveSchedulerSemester，校验 adjustment 属于同一 semester |
| `src/app/api/export/excel/route.ts` | 修改 | adjustment-aware 路径传递 semesterId |
| `scripts/test-semester-conflict-adjustment-scoping.ts` | 新增 | 42 项验证测试 |

## Conflict Check Scoping

| 入口 | 是否按 semester scoped | 说明 |
|---|---|---|
| room-time conflict | **是** | `timeOverlapWhere.semesterId` |
| teacher-time conflict | **是** | `timeOverlapWhere.semesterId` |
| class-time conflict | **是** | `timeOverlapWhere.semesterId` |
| adjustment target conflict | **是** | 通过 `getEffectiveScheduleForWeek(week, semesterId)` |
| cross-week conflict | **是** | adjustments 查询按 semesterId 过滤 |

## Manual Adjustment Scoping

- 是否支持 semesterId：**是**（ScheduleAdjustmentInput.semesterId）
- 未传是否使用 active Semester：**是**（通过 resolveSchedulerSemester）
- 是否校验 source ScheduleSlot semesterId：**是**
- 是否只检查同 semester 冲突：**是**
- 是否创建 ScheduleAdjustment.semesterId：**是**
- 是否禁止跨 semester 调课：**是**

## Undo Adjustment Scoping

- 是否支持 semesterId/default active：**是**
- 是否校验 adjustment.semesterId：**是**
- 是否校验 ScheduleSlot.semesterId：**是**
- 是否只撤销同 semester adjustment：**是**
- 防重复撤销是否保持：**是**

## 后续阶段处理

- Excel regular export path（非 adjustment-aware）未按 semester scoped → 属于 ordinary schedule view scoping
- `/api/schedule` 未按 semester scoped → 属于 ordinary schedule view scoping
- Dashboard UI 未传递 semesterId → 属于 UI selector 阶段
