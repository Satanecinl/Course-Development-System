# K10-SEMESTER-EXPORT-SCOPING-FIX 完成报告

## 1. 修改文件清单

| 文件 | 状态 | 用途 |
|---|---|---|
| `src/app/api/export/excel/route.ts` | 修改 | Excel regular path 添加 semester scoping |
| `src/app/api/schedule/route.ts` | 修改 | Schedule API 添加 semester scoping |
| `scripts/audit-semester-export-scoping.ts` | 修改 | 更新审计脚本，标记 P1 为已修复 |
| `scripts/test-semester-export-scoping-fix.ts` | 新增 | 35 项验证测试 |
| `docs/k10-semester-export-scoping-fix.md` | 新增 | 本文档 |

## 2. 验收前状态

```
git status --short: (empty)
git log -1 --oneline: 6a3f3c5 docs(schedule): audit semester export scoping
```

- 当前最新 commit：`6a3f3c5`
- 工作区：干净
- `prisma/dev.db`：未出现在 git status

## 3. `/api/export/excel` scoping 实现

- **是否支持 semesterId**：是（query param `?semesterId=1`）
- **未传时是否使用 active Semester**：是（通过 `resolveSchedulerSemester()`）
- **ScheduleSlot 是否按 semester filtered**：是（`where: { semesterId: semester.id }`）
- **TeachingTask 是否按 semester filtered**：是（通过 ScheduleSlot relation include 自动 scoped）
- **ClassGroup 是否按 semester filtered**：是（通过 ScheduleSlot → TeachingTask → TaskClasses relation）
- **ScheduleAdjustment 是否按 semester filtered**：是（adjustment-aware path 通过 `getEffectiveScheduleForWeek(week, semesterId)`）
- **Room / Teacher / Course 是否保持全局**：是
- **adjustment-aware path 是否传递 semesterId**：是（已有实现，未修改）
- **是否修改导出文件格式**：是（sheet title 包含 semester name，如"既有数据默认学期 课程表"）

## 4. `/api/schedule` scoping 实现

- **是否支持 semesterId**：是（query param `?semesterId=1`）
- **未传时是否使用 active Semester**：是（通过 `resolveSchedulerSemester()`）
- **regular path 是否按 semester filtered**：是（`where: { semesterId: semester.id }`）
- **adjustment-aware path 是否向 getEffectiveScheduleForWeek 传入 semesterId**：是（`getEffectiveScheduleForWeek(week, semester.id)`）
- **响应是否包含 semester metadata**：否（response shape 未改变，避免破坏前端兼容）
- **是否改变原有核心 response shape**：否

## 5. `/api/data/*` 遗留说明

- `/api/data/summary` 是否仍未 scoping：**是**
- `/api/data/teaching-tasks` 是否仍未 scoping：**是**
- `/api/data/schedule-slots` 是否仍未 scoping：**是**
- 是否明确留到 K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING：**是**
- 是否阻塞本阶段关闭：**否**

## 6. 验证命令结果

| 脚本 | 结果 |
|---|---|
| test-semester-export-scoping-fix.ts | 35 passed, 0 failed |
| audit-semester-export-scoping.ts | 14 passed, 0 warnings, 3 risks (MEDIUM, Data APIs) |
| test-semester-conflict-adjustment-scoping.ts | 42 passed, 0 failed |
| test-semester-scheduler-scoping-prep.ts | 75 passed, 0 failed |
| test-semester-backfill-default.ts | 29 passed, 0 failed |
| test-scheduler-final-safety-regression.ts | 54 passed, 0 failed |
| test-scheduler-seeded-prng.ts | 27 passed, 0 failed |
| npm.cmd run build | ✓ 通过 |

## 7. 安全边界确认

| 检查项 | 结果 |
|---|---|
| 是否修改 Prisma schema | 否 |
| 是否运行 db push/migrate/reset | 否 |
| 是否写业务数据 | 否 |
| 是否生成并提交导出文件 | 否 |
| 是否实施 export scoping | 是 |
| 是否修改 export 业务逻辑 | 是（添加 semester filter） |
| 是否做 import scoping | 否 |
| 是否做 admin data pages scoping | 否 |
| 是否做 UI selector | 否 |
| 是否修改 solver | 否 |
| 是否修改 parser/importer/seed | 否 |
| 是否新增 `/api/scheduler/run` | 否 |
| 是否新增 Re-run | 否 |
| 是否提交 prisma/dev.db | 否 |
| 是否提交数据库备份文件 | 否 |

## 8. Git 状态

```
git diff --stat: (empty)
git status --short: (empty)
git ls-files prisma/dev.db: (empty)
git ls-files "prisma/dev.db.backup-*": (empty)
git log -1 --oneline: 98a6cd4 feat(schedule): scope schedule exports by semester
```

- 工作区：干净
- prisma/dev.db：未被跟踪
- 数据库备份文件：未被跟踪
- 最新 commit：`98a6cd4`

## 9. 风险与遗留问题

| 项目 | 状态 |
|---|---|
| `/api/data/*` 尚未 scoping | 是（MEDIUM，留到 admin data pages scoping） |
| import 尚未 scoping | 是 |
| admin data pages 尚未 scoping | 是 |
| 尚未 UI semester selector | 是 |
| 尚未 required constraint | 是 |
| 是否仍存在跨学期导出风险 | 否（P1 已修复，P2 为 Data APIs 展示层） |
| 是否阻塞关闭 | 否 |

## 10. 推荐下一阶段

**K10-SEMESTER-EXPORT-SCOPING-MANUAL-ACCEPTANCE**

目标：浏览器或 API 人工验收 Excel export 与 `/api/schedule` 在 active Semester 下正常。不做新功能，不改 schema。

## 11. 阶段关闭建议

- K10-SEMESTER-EXPORT-SCOPING-FIX 是否建议关闭：**是**
- 是否可以进入下一阶段：**是**
- 推荐下一阶段：**K10-SEMESTER-EXPORT-SCOPING-MANUAL-ACCEPTANCE**
- 是否存在阻塞项：**否**
