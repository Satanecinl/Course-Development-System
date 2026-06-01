# K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-AUDIT 完成报告

## 1. 修改文件清单

| 文件 | 状态 | 用途 |
|---|---|---|
| `scripts/audit-semester-admin-data-pages-scoping.ts` | 新增 | 管理员数据页 semester scoping 只读审计脚本 |
| `docs/k10-semester-admin-data-pages-scoping-audit.md` | 新增 | 本审计报告 |

## 2. 验收前状态

```
git status --short: (empty)
git log -1 --oneline: 674e7bc docs(schedule): add export scoping manual acceptance report
```

- 当前最新 commit：`674e7bc`
- 工作区：干净
- `prisma/dev.db`：未出现在 git status

## 3. 当前 Semester 数据状态

| 项 | 值 |
|---|---|
| Semester count | 1 |
| active Semester | id=1, LEGACY-DEFAULT, 既有数据默认学期 |
| ClassGroup null semesterId | 0 / 36 |
| TeachingTask null semesterId | 0 / 308 |
| ScheduleSlot null semesterId | 0 / 440 |
| ScheduleAdjustment null semesterId | 0 / 53 |
| SchedulingRun null semesterId | 0 / 77 |

## 4. `/api/data/*` 审计结果

| API | 读取模型 | 是否 scoped | 权限保护 | 风险等级 | 后续建议 |
|---|---|---|---|---|---|
| `/api/data/summary` | ClassGroup(count), TeachingTask(count), ScheduleSlot(count) | 否 | 是 (`data:read`) | 🟡 MEDIUM | 添加 semesterId filter |
| `/api/data/teaching-tasks` | TeachingTask (前100条) | 否 | 是 (`data:read`) | 🟡 MEDIUM | 添加 semesterId filter |
| `/api/data/schedule-slots` | ScheduleSlot (前100条) | 否 | 是 (`data:read`) | 🟡 MEDIUM | 添加 semesterId filter |

## 5. 管理员数据页审计结果

| 页面/文件 | 调用 API | 是否涉及学期模型 | 是否 scoped | 风险等级 | 后续建议 |
|---|---|---|---|---|---|
| `/admin/db` (admin-db-content.tsx) | `/api/admin/[model]` | 是 (scheduleslot, teachingtask, classgroup) | 否 | 🔴 HIGH | API 层添加 semesterId |
| `/data` (data-content.tsx) | `/api/data/*` | 是 (summary, teaching-tasks, schedule-slots) | 否 | 🟡 MEDIUM | API 层添加 semesterId |
| `/admin/diagnostics` | 无数据访问 | 否 | N/A | 低 | 无需修改 |
| `/admin/settings` | 无数据访问 | 否 | N/A | 低 | 无需修改 |
| `/admin/users` | `/api/admin/users` | 否 (User 全局) | N/A | 低 | 无需修改 |
| `/admin/import` | `/api/admin/import/*` | 否 (ImportBatch) | N/A | 低 | 无需修改 |
| `/admin/scheduler` | `/api/admin/scheduler/*` | 已 scoped | 是 | ✅ 已 scoped | 无需修改 |
| `/admin/rooms/capacity` | `/api/admin/rooms/capacity` | 否 (Room 全局) | N/A | 低 | 无需修改 |

## 6. 全库读取风险清单

| 文件 | 查询对象 | 是否已有 semesterId | 风险 | 后续建议 |
|---|---|---|---|---|
| `src/app/api/admin/[model]/route.ts` | scheduleSlot.findMany (take: 500) | 否 | 🔴 HIGH | 添加 semesterId filter |
| `src/app/api/admin/[model]/route.ts` | teachingTask.findMany (take: 500) | 否 | 🔴 HIGH | 添加 semesterId filter |
| `src/app/api/admin/[model]/route.ts` | classGroup.findMany (take: 500) | 否 | 🔴 HIGH | 添加 semesterId filter |
| `src/app/api/data/summary/route.ts` | *.count() | 否 | 🟡 MEDIUM | 添加 semesterId filter |
| `src/app/api/data/teaching-tasks/route.ts` | teachingTask.findMany | 否 | 🟡 MEDIUM | 添加 semesterId filter |
| `src/app/api/data/schedule-slots/route.ts` | scheduleSlot.findMany | 否 | 🟡 MEDIUM | 添加 semesterId filter |
| `src/app/api/entity-list/route.ts` | classGroup.findMany | 否 | 🟡 MEDIUM | 添加 semesterId filter |

## 7. 全局模型确认

以下模型应保持全局，不加 semester filter：

- **Room** — 教室跨学期共享
- **Teacher** — 教师跨学期存在
- **Course** — 课程跨学期存在
- **User** — 用户跨学期存在
- **Role** — 角色跨学期存在
- **Permission** — 权限跨学期存在

## 8. 权限边界审计

| 检查项 | 结果 |
|---|---|
| `/api/data/*` 是否有权限保护 | 是 (`data:read`) |
| `/api/admin/[model]` 是否有权限保护 | 是 (`data:read` / `data:write` / `data:delete`) |
| 管理员数据页是否有权限保护 | 是 (`ProtectedShell`) |
| 是否发现未授权敏感数据入口 | 否 |
| 是否发现 `/api/scheduler/run` | 否 |
| 是否发现 Re-run 入口 | 否 |

## 9. 推荐 scoping 策略

### `/api/admin/[model]` (HIGH priority)

- 对 `scheduleslot`、`teachingtask`、`classgroup` 的 GET 请求添加 `semesterId` filter
- 支持 query param `?semesterId=1`
- 未传时默认 active Semester
- `teacher`、`course`、`room` 保持全局
- POST/PUT/DELETE 写操作暂不修改（写入时需业务逻辑决定 semesterId）

### `/api/data/*` (MEDIUM priority)

- `/api/data/summary`: 对 ClassGroup/TeachingTask/ScheduleSlot 的 count 添加 `semesterId` filter
- `/api/data/teaching-tasks`: 添加 `semesterId` filter
- `/api/data/schedule-slots`: 添加 `semesterId` filter
- 默认使用 active Semester，支持显式 `semesterId`

### `/api/entity-list` (MEDIUM priority)

- 对 `type=classgroup` 添加 `semesterId` filter
- `teacher`、`room`、`course` 保持全局

### 是否需要 UI selector

- **不需要**。可先默认 active Semester，与 scheduler/export 保持一致
- UI semester selector 是后续优化，不阻塞 scoping fix

## 10. 验证命令结果

| 脚本 | 结果 |
|---|---|
| audit-semester-admin-data-pages-scoping.ts | 7 passed, 9 warnings, 0 risks |
| test-semester-export-scoping-fix.ts | 35 passed, 0 failed |
| audit-semester-export-scoping.ts | 14 passed, 0 HIGH risk |
| test-semester-conflict-adjustment-scoping.ts | 42 passed, 0 failed |
| test-semester-scheduler-scoping-prep.ts | 75 passed, 0 failed |
| test-semester-backfill-default.ts | 29 passed, 0 failed |
| test-scheduler-final-safety-regression.ts | 54 passed, 0 failed |
| test-scheduler-seeded-prng.ts | 27 passed, 0 failed |
| npm.cmd run build | ✓ 通过 |

## 11. 安全边界确认

| 检查项 | 结果 |
|---|---|
| 是否修改 Prisma schema | 否 |
| 是否运行 db push/migrate/reset | 否 |
| 是否写业务数据 | 否 |
| 是否实施 admin data pages scoping | 否 |
| 是否修改 `/api/data/*` 业务逻辑 | 否 |
| 是否做 import scoping | 否 |
| 是否做 UI selector | 否 |
| 是否修改 scheduler/export/conflict 逻辑 | 否 |
| 是否修改 solver | 否 |
| 是否修改 parser/importer/seed | 否 |
| 是否新增 `/api/scheduler/run` | 否 |
| 是否新增 Re-run | 否 |
| 是否提交 prisma/dev.db | 否 |
| 是否提交数据库备份文件 | 否 |

## 12. Git 状态

```
git diff --stat: (empty)
git status --short: (empty)
git ls-files prisma/dev.db: (empty)
git ls-files "prisma/dev.db.backup-*": (empty)
git log -1 --oneline: 674e7bc docs(schedule): add export scoping manual acceptance report
```

- 工作区：干净
- prisma/dev.db：未被跟踪
- 数据库备份文件：未被跟踪
- 最新 commit：`674e7bc`

## 13. 风险与遗留问题

| 项目 | 状态 |
|---|---|
| `/api/admin/[model]` 尚未 scoping | 是（HIGH，scheduleslot/teachingtask/classgroup） |
| `/api/data/*` 尚未 scoping | 是（MEDIUM，summary/teaching-tasks/schedule-slots） |
| `/api/entity-list` classgroup 尚未 scoping | 是（MEDIUM） |
| import 尚未 scoping | 是 |
| UI selector 尚未实现 | 是 |
| required constraint 尚未实现 | 是 |
| 是否存在跨学期 admin data 查询风险 | 是 |
| 是否阻塞关闭 | 否 |

## 14. 推荐下一阶段

**K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-FIX**

目标：修复本次审计确认的 admin data API scoping 风险，具体包括：

1. **P1 - `/api/admin/[model]`**：对 scheduleslot/teachingtask/classgroup 的 GET 添加 semesterId filter
2. **P2 - `/api/data/*`**：对 summary/teaching-tasks/schedule-slots 添加 semesterId filter
3. **P2 - `/api/entity-list`**：对 classgroup 添加 semesterId filter

不扩大到 import / UI selector。不改 schema。

## 15. 阶段关闭建议

- K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-AUDIT 是否建议关闭：**是**
- 是否可以进入下一阶段：**是**
- 推荐下一阶段：**K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-FIX**
- 是否存在阻塞项：**否**
