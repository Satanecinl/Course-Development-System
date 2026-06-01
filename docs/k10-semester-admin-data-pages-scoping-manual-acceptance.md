# K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-MANUAL-ACCEPTANCE

## 概述

管理员数据页和 `/api/data/*`、`/api/admin/[model]` semester scoping 人工/API 验收通过。

## 验收前状态

- 最新 commit：`8c6d20b feat(data): scope admin data pages by semester`
- 工作区干净 ✅
- prisma/dev.db 未跟踪 ✅

## 自动验证结果

| 命令 | 结果 |
|---|---|
| test-semester-admin-data-pages-scoping-fix.ts | 67/67 ✅ |
| audit-semester-admin-data-pages-scoping.ts | 0 RISKS, 6 scoped ✅ |
| test-semester-export-scoping-fix.ts | 35/35 ✅ |
| audit-semester-export-scoping.ts | 全部 scoped ✅ |
| test-semester-conflict-adjustment-scoping.ts | 42/42 ✅ |
| test-semester-scheduler-scoping-prep.ts | 75/75 ✅ |
| test-semester-backfill-default.ts | 29/29 ✅ |
| test-scheduler-final-safety-regression.ts | 54/54 ✅ |
| test-scheduler-seeded-prng.ts | 27/27 ✅ |
| npm run build | ✅ |

## active Semester 与数据状态

| 字段 | 值 |
|---|---|
| active semesterId | 1 |
| active semester code/name | LEGACY-DEFAULT / 既有数据默认学期 |
| ClassGroup null semesterId | 0 |
| TeachingTask null semesterId | 0 |
| ScheduleSlot null semesterId | 0 |
| ScheduleAdjustment null semesterId | 0 |
| SchedulingRun null semesterId | 0 |

## `/api/data/*` 验收结果

| 验收项 | 结果 |
|---|---|
| `/api/data/summary` 返回 200 | ✅ 通过 |
| `/api/data/summary?semesterId=1` 返回 200 | ✅ 通过 |
| `/api/data/teaching-tasks` 返回 200 | ✅ 通过 |
| `/api/data/teaching-tasks?semesterId=1` 返回 200 | ✅ 通过 |
| `/api/data/schedule-slots` 返回 200 | ✅ 通过 |
| `/api/data/schedule-slots?semesterId=1` 返回 200 | ✅ 通过 |
| 默认与显式 semesterId 核心数量一致 | ✅ 通过 |

## `/api/admin/[model]` 验收结果

| model | 默认请求 | semesterId=1 | 分页/搜索 | 详情/编辑 | 备注 |
|---|---|---|---|---|---|
| classgroup | ✅ | ✅ | ✅ | 不适用 | scoped |
| teachingtask | ✅ | ✅ | ✅ | 不适用 | scoped |
| scheduleslot | ✅ | ✅ | ✅ | 不适用 | scoped |
| room | ✅ | 不适用 | ✅ | 不适用 | 全局 |
| teacher | ✅ | 不适用 | ✅ | 不适用 | 全局 |
| course | ✅ | 不适用 | ✅ | 不适用 | 全局 |

## 页面验收结果

| 页面 | 结果 |
|---|---|
| `/admin/db` 正常加载 | ✅ 通过 |
| `/data` 正常加载 | ✅ 通过 |
| 无 active Semester 错误 | ✅ 通过 |
| 前端未传 semesterId 后端默认 active 正常 | ✅ 通过 |
| 无 Re-run / /api/scheduler/run | ✅ 通过 |

## 权限验收结果

| 验收项 | 结果 |
|---|---|
| 管理员可访问管理员数据页 | ✅ 通过 |
| 普通用户访问被拒绝 | ✅ 通过 |
| 未登录访问进入 login 或被拒绝 | ✅ 通过 |
| 权限未放宽 | ✅ 通过 |

## 修复记录

本阶段未修改代码。

## 安全边界确认

- 是否修改 Prisma schema：否
- 是否运行 db push/migrate/reset：否
- 是否写业务数据：否
- 是否做 import scoping：否
- 是否做 ordinary schedule scoping：否
- 是否做 UI selector：否
- 是否修改 scheduler/export/conflict 逻辑：否
- 是否修改 solver：否
- 是否修改 parser/importer/seed：否
- 是否新增 /api/scheduler/run：否
- 是否新增 Re-run：否
- 是否提交 prisma/dev.db：否
- 是否提交数据库备份文件：否

## 遗留风险

| 遗留项 | 状态 | 说明 |
|---|---|---|
| Import scoping | 未实现 | 需后续阶段 |
| Ordinary schedule view scoping | 未实现 | 需后续阶段 |
| UI semester selector | 未实现 | 当前后端默认 active Semester |
| Required constraint | 未实现 | 需后续阶段 |

所有遗留属于后续阶段，不阻塞本阶段关闭。

## 推荐下一阶段

K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-AUDIT

目标：审计普通课表查看页面和普通用户路径是否仍存在跨学期读取。先只读审计，不立即修复。

## 阶段关闭建议

- K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-MANUAL-ACCEPTANCE **建议关闭**：✅
- 可以进入下一阶段：✅
- 推荐下一阶段：K10-SEMESTER-ORDINARY-SCHEDULE-SCOPING-AUDIT
- 阻塞项：无
