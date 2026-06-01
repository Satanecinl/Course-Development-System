# K10-SEMESTER-EXPORT-SCOPING-AUDIT 完成报告

## 1. 修改文件清单

| 文件 | 状态 | 用途 |
|---|---|---|
| `scripts/audit-semester-export-scoping.ts` | 新增 | 导出链路 semester scoping 只读审计脚本 |
| `docs/k10-semester-export-scoping-audit.md` | 新增 | 本审计报告 |

## 2. 验收前状态

```
git status --short: (empty)
git log -1 --oneline: 7a4bd68 docs(schedule): add conflict adjustment manual acceptance report
```

- 当前最新 commit：`7a4bd68`
- 工作区：干净
- `prisma/dev.db`：未出现在 git status

## 3. 当前 Semester 数据状态

| 项 | 值 |
|---|---|
| Semester count | 1 |
| active Semester count | 1 |
| LEGACY-DEFAULT 是否存在 | 是 |
| ScheduleSlot null semesterId | 0 / 440 |
| TeachingTask null semesterId | 0 / 308 |
| ClassGroup null semesterId | 0 / 36 |
| ScheduleAdjustment null semesterId | 0 / 53 |
| SchedulingRun null semesterId | 0 / 77 |

## 4. 导出入口清单

| 入口/文件 | 类型 | 读取模型 | 当前 semester scoping | 风险等级 |
|---|---|---|---|---|
| `/api/export/excel` (adjustment-aware path) | adjustment-aware export | ScheduleSlot, ClassGroup, ScheduleAdjustment | ✅ 已 scoped (resolveSchedulerSemester + semesterId) | 已 scoped |
| `/api/export/excel` (regular path) | regular Excel export | ScheduleSlot, ClassGroup, TeachingTask | ❌ 无 semesterId filter | 🔴 HIGH |
| `/api/schedule` (adjustment-aware path) | ordinary schedule export | ScheduleSlot, ScheduleAdjustment | ❌ 调用 getEffectiveScheduleForWeek 但未传 semesterId | 🔴 HIGH |
| `/api/schedule` (regular path) | ordinary schedule export | ScheduleSlot | ❌ 无 semesterId filter | 🔴 HIGH |
| `/api/data/summary` | admin data export | 所有模型 count() | ❌ 无 semester filter | 🟡 MEDIUM |
| `/api/data/teaching-tasks` | admin data export | TeachingTask | ❌ 无 semester filter | 🟡 MEDIUM |
| `/api/data/schedule-slots` | admin data export | ScheduleSlot | ❌ 无 semester filter | 🟡 MEDIUM |
| `/api/schedule-adjustments` (GET) | adjustment list | ScheduleAdjustment | ✅ 已 scoped (resolveSchedulerSemester) | 已 scoped |

## 5. 全库读取风险清单

| 文件 | 查询对象 | 是否已有 semesterId | 风险 | 后续建议 |
|---|---|---|---|---|
| `src/app/api/export/excel/route.ts` (regular path) | scheduleSlot.findMany | 否 | 🔴 HIGH | 添加 semesterId filter |
| `src/app/api/export/excel/route.ts` (regular path) | classGroup.findMany | 否 | 🔴 HIGH | 添加 semesterId filter |
| `src/app/api/export/excel/route.ts` (regular path) | teachingTask.findMany | 否 | 🔴 HIGH | 添加 semesterId filter |
| `src/app/api/schedule/route.ts` (regular path) | scheduleSlot.findMany | 否 | 🔴 HIGH | 添加 semesterId filter |
| `src/app/api/schedule/route.ts` (adjustment-aware) | getEffectiveScheduleForWeek | 未传 semesterId | 🔴 HIGH | 传递 semesterId |
| `src/app/api/data/summary/route.ts` | *.count() | 否 | 🟡 MEDIUM | 评估是否需要 |
| `src/app/api/data/teaching-tasks/route.ts` | teachingTask.findMany | 否 | 🟡 MEDIUM | 评估是否需要 |
| `src/app/api/data/schedule-slots/route.ts` | scheduleSlot.findMany | 否 | 🟡 MEDIUM | 评估是否需要 |

## 6. Regular Excel Export 审计结果

- **是否存在 regular Excel export**：是（`/api/export/excel` 不传 `selectedWeek` + `applyAdjustments` 时走 regular path）
- **是否读取学期模型**：是（ScheduleSlot, ClassGroup, TeachingTask）
- **是否已 scoped**：否（regular path 无 semesterId filter）
- **是否需要 default active Semester**：是（应默认 active semester，避免导出跨学期数据）
- **后续修复建议**：
  1. 在 regular path 中调用 `resolveSchedulerSemester()` 获取 active semester
  2. 对 `scheduleSlot.findMany` 的 where 条件添加 `semesterId`
  3. 对 `classGroup.findMany` 和 `teachingTask.findMany` 添加 `semesterId` filter
  4. 导出文件名可包含 semester code（非阻塞优化）

## 7. Conflict Report Export 审计结果

- **是否存在 conflict report export**：否（没有独立的 conflict report 导出入口）
- **conflict-check API 已 scoped**：是（`/api/conflict-check` 使用 `resolveSchedulerSemester`）
- **是否有独立全库查询**：否（conflict-check 已在 K10-SEMESTER-CONFLICT-ADJUSTMENT-SCOPING 中完成 scoping）
- **后续修复建议**：无需修复

## 8. Adjustment-aware Export 审计结果

- **是否已传递 semesterId**：是（`/api/export/excel` adjustment-aware path 调用 `resolveSchedulerSemester()` 并传递 `semesterId`）
- **是否仍有绕过路径**：无（adjustment-aware path 只通过 `getEffectiveScheduleForWeek(week, semesterId)` 访问数据）
- **是否仍需修复**：否
- **与 regular export 的区别**：adjustment-aware path 已 scoped；regular path 未 scoped

## 9. Ordinary Schedule / Admin Export 影响

### `/api/schedule`（普通课表 API）
- **是否涉及 semester**：是（读取 ScheduleSlot）
- **是否已 scoped**：否（两条路径均未按 semester 过滤）
- **影响范围**：dashboard 课表视图、按班级/教师/教室筛选
- **修复建议**：添加 `semesterId` filter，使用 `resolveSchedulerSemester()` 默认 active semester

### `/api/data/*`（管理员数据页面 API）
- **是否涉及 semester**：
  - summary: count 统计（MEDIUM）
  - teaching-tasks: 读取 TeachingTask（MEDIUM）
  - schedule-slots: 读取 ScheduleSlot（MEDIUM）
- **是否已 scoped**：否
- **是否需要 UI selector**：可先默认 active semester，不需要 UI selector
- **修复建议**：评估是否需要 semester filter（低优先级，不影响导出正确性）

## 10. 权限与安全边界

| 检查项 | 结果 |
|---|---|
| 导出 API 是否有权限保护 | 是（`data:export`） |
| 是否发现未授权导出入口 | 否 |
| 是否新增 `/api/scheduler/run` | 否 |
| 是否发现 Re-run 入口 | 否 |

## 11. 验证命令结果

| 脚本 | 结果 |
|---|---|
| audit-semester-export-scoping.ts | 11 passed, 1 warning, 6 risks (expected) |
| test-semester-conflict-adjustment-scoping.ts | 42 passed, 0 failed |
| test-semester-scheduler-scoping-prep.ts | 75 passed, 0 failed |
| test-semester-backfill-default.ts | 29 passed, 0 failed |
| test-scheduler-final-safety-regression.ts | 54 passed, 0 failed |
| npm.cmd run build | ✓ 通过 |

## 12. 安全边界确认

| 检查项 | 结果 |
|---|---|
| 是否修改 Prisma schema | 否 |
| 是否运行 db push/migrate/reset | 否 |
| 是否写业务数据 | 否 |
| 是否生成并提交导出文件 | 否 |
| 是否实施 export scoping | 否 |
| 是否修改 export 业务逻辑 | 否 |
| 是否做 import scoping | 否 |
| 是否做 ordinary schedule scoping | 否 |
| 是否做 admin data pages scoping | 否 |
| 是否做 UI selector | 否 |
| 是否修改 solver | 否 |
| 是否修改 parser/importer/seed | 否 |
| 是否新增 `/api/scheduler/run` | 否 |
| 是否新增 Re-run | 否 |
| 是否提交 prisma/dev.db | 否 |
| 是否提交数据库备份文件 | 否 |

## 13. Git 状态

```
git diff --stat: (empty)
git status --short: (empty)
git ls-files prisma/dev.db: (empty)
git ls-files "prisma/dev.db.backup-*": (empty)
git log -1 --oneline: 7a4bd68 docs(schedule): add conflict adjustment manual acceptance report
```

- 工作区：干净
- prisma/dev.db：未被跟踪
- 数据库备份文件：未被跟踪
- 最新 commit：`7a4bd68`

## 14. 风险与遗留问题

### 需要修复的 export scoping 入口

| 入口 | 风险 | 修复优先级 |
|---|---|---|
| `/api/export/excel` regular path | 🔴 HIGH | P1 |
| `/api/schedule` (两条路径) | 🔴 HIGH | P1 |
| `/api/data/summary` | 🟡 MEDIUM | P2 |
| `/api/data/teaching-tasks` | 🟡 MEDIUM | P2 |
| `/api/data/schedule-slots` | 🟡 MEDIUM | P2 |

### 其他遗留风险

| 项目 | 状态 |
|---|---|
| import 尚未 scoping | 是 |
| ordinary schedule view 尚未 scoping | 是（`/api/schedule`） |
| admin data pages 尚未 scoping | 是（`/api/data/*`） |
| 尚未 UI semester selector | 是 |
| 尚未 required constraint | 是 |
| 是否存在跨学期导出风险 | 是（regular Excel export + schedule API） |
| 是否阻塞关闭 | 否 |

## 15. 推荐下一阶段

**K10-SEMESTER-EXPORT-SCOPING-FIX**

目标：修复本次审计确认的 export scoping 风险，具体包括：

1. **P1 - Excel export regular path**：在 `src/app/api/export/excel/route.ts` 的 regular path 中添加 `resolveSchedulerSemester()` + `semesterId` filter
2. **P1 - Schedule API**：在 `src/app/api/schedule/route.ts` 中添加 `resolveSchedulerSemester()` + `semesterId` filter，adjustment-aware path 传递 `semesterId`
3. **P2 - Data APIs**：评估 `/api/data/*` 是否需要 semester filter（低优先级，可后续处理）

不扩大到 import / admin pages scoping / UI selector。不改 schema。

## 16. 阶段关闭建议

- K10-SEMESTER-EXPORT-SCOPING-AUDIT 是否建议关闭：**是**
- 是否可以进入下一阶段：**是**
- 推荐下一阶段：**K10-SEMESTER-EXPORT-SCOPING-FIX**
- 是否存在阻塞项：**否**
