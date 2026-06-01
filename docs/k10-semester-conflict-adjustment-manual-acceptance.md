# K10-SEMESTER-CONFLICT-ADJUSTMENT-MANUAL-ACCEPTANCE 完成报告

## 1. 验收前状态

```
git status --short: (empty)
git log -1 --oneline: 1414766 docs(schedule): add conflict/adjustment scoping documentation
```

- 当前最新 commit：`1414766`
- 工作区：干净
- `prisma/dev.db`：未出现在 git status

## 2. 自动验证结果

| 脚本 | 结果 |
|---|---|
| test-semester-conflict-adjustment-scoping.ts | 42 passed, 0 failed |
| test-semester-scheduler-scoping-prep.ts | 75 passed, 0 failed |
| test-semester-backfill-default.ts | 29 passed, 0 failed |
| test-scheduler-final-safety-regression.ts | 54 passed, 0 failed |
| test-scheduler-seeded-prng.ts | 27 passed, 0 failed |
| npm.cmd run build | ✓ 通过 |

## 3. 数据库备份

- 备份路径：`prisma/dev.db.backup-before-conflict-adjustment-manual-acceptance-20260601101600`
- 备份成功
- 备份文件未被提交

## 4. active Semester 与调课样本

| 字段 | 值 |
|---|---|
| active semesterId | 1 |
| active semester code/name | LEGACY-DEFAULT / 既有数据默认学期 |
| source ScheduleSlot ID | 215 |
| 原 dayOfWeek | 7 (周日) |
| 原 slotIndex | 2 (3-4节) |
| 原 roomId | 10 (1-133) |
| teachingTaskId | 166 |
| 原 semesterId | 1 |
| course | 森林火灾扑救指挥 |
| teacher | 赵强 |
| classes | 2025级森林草原防火技术1班 |

## 5. 浏览器人工验收结果

| 验收项 | 结果 | 备注 |
|---|---|---|
| 管理员可访问调课入口 | 通过 | |
| 页面无 active Semester 错误 | 通过 | |
| dry-run / conflict check 正常 | 通过 | |
| 冲突提示正常 | 通过 | |
| 可执行受控调课 | 通过 | |
| ScheduleAdjustment.semesterId 正确 | 通过 | adj ID=53, semesterId=1 |
| ScheduleSlot.semesterId 未改变 | 通过 | slot 215 semesterId=1 |
| 调课历史按 active Semester 展示 | 通过 | |
| 可执行撤销调课 | 通过 | |
| 撤销后 ScheduleSlot 恢复原状态 | 通过 | dayOfWeek=7, slotIndex=2, roomId=10 |
| 撤销只作用于同一 semester | 通过 | |
| 页面无 Re-run / `/api/scheduler/run` 入口 | 通过 | |
| 普通用户访问被拒绝 | 通过 | |
| 未登录访问进入 /login | 通过 | |

## 6. 调课与撤销样本结果

| 字段 | 值 |
|---|---|
| ScheduleAdjustment ID | 53 |
| adjustment.semesterId | 1 |
| 调课前 dayOfWeek / slotIndex / roomId | 7 / 2 / 10 |
| 调课后状态 | MOVE ACTIVE → 已调整 |
| 撤销后 dayOfWeek / slotIndex / roomId | 7 / 2 / 10 |
| 是否恢复原状态 | 是 |
| 是否仍属于同一 semester | 是 |

## 7. 修复

本阶段未修改代码。

**非阻塞遗留问题**：调课按钮只在选择具体周次时显示，"全部"视图下不显示。这是原有 UI 设计行为（调课需要指定目标周次），非 semester scoping 引入的回归。记录为后续可优化项。

## 8. 安全边界确认

| 检查项 | 结果 |
|---|---|
| 是否修改 Prisma schema | 否 |
| 是否运行 db push/migrate/reset | 否 |
| 是否写业务数据 | 是（受控调课+撤销，已恢复） |
| 是否写真实 ScheduleSlot | 是（已恢复原状） |
| 是否写 ScheduleAdjustment | 是（semesterId=1，status=VOID） |
| 是否写入范围仅限既有调课和撤销语义 | 是 |
| 是否最终恢复测试调课 | 是 |
| 是否做 import scoping | 否 |
| 是否做 ordinary schedule scoping | 否 |
| 是否做 admin data pages scoping | 否 |
| 是否做 UI selector | 否 |
| 是否修改 solver | 否 |
| 是否修改 parser/importer/seed | 否 |
| 是否修改 score/hard constraints | 否 |
| 是否新增 `/api/scheduler/run` | 否 |
| 是否新增 Re-run | 否 |
| 是否提交 prisma/dev.db | 否 |
| 是否提交数据库备份文件 | 否 |

## 9. Git 状态

```
git diff --stat: (empty)
git status --short: (empty)
git ls-files prisma/dev.db: (empty)
git ls-files "prisma/dev.db.backup-before-conflict-adjustment-manual-acceptance-*": (empty)
git log -1 --oneline: 1414766 docs(schedule): add conflict/adjustment scoping documentation
```

- 工作区：干净
- prisma/dev.db：未被跟踪
- 数据库备份文件：未被跟踪
- 最新 commit：`1414766`

## 10. 风险与遗留问题

| 项目 | 状态 |
|---|---|
| import 尚未 scoping | 是 |
| ordinary schedule view 尚未 scoping | 是 |
| admin data pages 尚未 scoping | 是 |
| regular Excel export 尚未 scoping | 是 |
| 尚未 UI selector | 是 |
| 尚未 required constraint | 是 |
| 调课按钮在"全部"视图下不显示 | 是（原有设计，非回归） |
| 是否存在跨学期查询遗留风险 | 是（import / ordinary schedule / admin pages） |
| 是否阻塞关闭 | 否 |

## 11. 推荐下一阶段

**K10-SEMESTER-EXPORT-SCOPING-AUDIT**

目标：审计 regular Excel export / conflict report / schedule export 是否仍存在跨学期混读。不扩大到 import / ordinary schedule / admin data pages，先只读审计。

## 12. 阶段关闭建议

- K10-SEMESTER-CONFLICT-ADJUSTMENT-MANUAL-ACCEPTANCE 是否建议关闭：**是**
- 是否可以进入下一阶段：**是**
- 推荐下一阶段：**K10-SEMESTER-EXPORT-SCOPING-AUDIT**
- 是否存在阻塞项：**否**
