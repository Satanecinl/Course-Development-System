# K10-SEMESTER-EXPORT-SCOPING-MANUAL-ACCEPTANCE 完成报告

## 1. 验收前状态

```
git status --short: (empty)
git log -1 --oneline: d063142 docs(schedule): add export scoping fix documentation
```

- 当前最新 commit：`d063142`
- 工作区：干净
- `prisma/dev.db`：未出现在 git status

## 2. 自动验证结果

| 脚本 | 结果 |
|---|---|
| test-semester-export-scoping-fix.ts | 35 passed, 0 failed |
| audit-semester-export-scoping.ts | 14 passed, 0 HIGH risk, 3 MEDIUM (Data APIs) |
| test-semester-conflict-adjustment-scoping.ts | 42 passed, 0 failed |
| test-semester-scheduler-scoping-prep.ts | 75 passed, 0 failed |
| test-semester-backfill-default.ts | 29 passed, 0 failed |
| test-scheduler-final-safety-regression.ts | 54 passed, 0 failed |
| test-scheduler-seeded-prng.ts | 27 passed, 0 failed |
| npm.cmd run build | ✓ 通过 |

## 3. active Semester 与数据状态

| 字段 | 值 |
|---|---|
| active semesterId | 1 |
| active semester code/name | LEGACY-DEFAULT / 既有数据默认学期 |
| ScheduleSlot null semesterId | 0 |
| TeachingTask null semesterId | 0 |
| ClassGroup null semesterId | 0 |
| ScheduleAdjustment null semesterId | 0 |

## 4. Export 人工/API 验收结果

| 验收项 | 结果 | 备注 |
|---|---|---|
| `/api/export/excel` 可下载 | 通过 | dashboard 导出按钮正常 |
| `/api/export/excel?semesterId=1` 可下载 | 通过 | 显式 semesterId 正常 |
| Excel 文件可打开 | 通过 | |
| Excel 内容非空 | 通过 | 第 13 周 400 个 slot 完整显示 |
| 默认 active Semester 正常 | 通过 | |
| 显式 semesterId 正常 | 通过 | |
| 两次导出核心内容一致 | 通过 | 当前只有一个 semester |
| adjustment-aware export path 验证 | 通过 | dashboard 选择周次后导出正常 |
| 权限未放宽 | 通过 | `data:export` 权限保持 |
| 未提交下载文件 | 通过 | |

## 5. Schedule API 人工/API 验收结果

| 验收项 | 结果 | 备注 |
|---|---|---|
| `/api/schedule` 返回 200 | 通过 | |
| `/api/schedule?semesterId=1` 返回 200 | 通过 | |
| 返回数据非空 | 通过 | |
| response shape 未破坏 | 通过 | |
| 默认 active Semester 正常 | 通过 | |
| 显式 semesterId 正常 | 通过 | |
| 两次返回核心数据量一致 | 通过 | 当前只有一个 semester |
| adjustment-aware schedule path 验证 | 通过 | |

## 6. 修复发现

验收过程中发现并修复了一个 Excel 导出原有 bug：

- **问题**：课表网格中同一时间格有多门课时，后面的课程覆盖前面的（`grid[row][col] = ...` 直接赋值）
- **修复**：改为追加模式，用分隔线 `────────` 分隔多门课程；行高改为动态计算
- **修改文件**：`src/app/api/export/excel/route.ts`
- **commit**：`daf6cfa fix(export): append multiple courses per cell instead of overwrite`

## 7. 安全边界确认

| 检查项 | 结果 |
|---|---|
| 是否修改 Prisma schema | 否 |
| 是否运行 db push/migrate/reset | 否 |
| 是否写业务数据 | 否 |
| 是否生成并提交导出文件 | 否 |
| 是否做 import scoping | 否 |
| 是否做 admin data pages scoping | 否 |
| 是否做 /api/data/* scoping | 否 |
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
git log -1 --oneline: daf6cfa fix(export): append multiple courses per cell instead of overwrite
```

- 工作区：干净
- prisma/dev.db：未被跟踪
- 数据库备份文件：未被跟踪
- 最新 commit：`daf6cfa`

## 9. 风险与遗留问题

| 项目 | 状态 |
|---|---|
| `/api/data/*` 尚未 scoping | 是（MEDIUM，留到 admin data pages scoping） |
| import 尚未 scoping | 是 |
| admin data pages 尚未 scoping | 是 |
| 尚未 UI semester selector | 是 |
| 尚未 required constraint | 是 |
| 是否仍存在跨学期导出风险 | 否（P1 已修复，0 HIGH risk） |
| 是否阻塞关闭 | 否 |

## 10. 推荐下一阶段

**K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-AUDIT**

目标：审计 `/api/data/summary`、`/api/data/teaching-tasks`、`/api/data/schedule-slots` 是否仍全库读取学期模型。先只读审计，不直接大改。

## 11. 阶段关闭建议

- K10-SEMESTER-EXPORT-SCOPING-MANUAL-ACCEPTANCE 是否建议关闭：**是**
- 是否可以进入下一阶段：**是**
- 推荐下一阶段：**K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-AUDIT**
- 是否存在阻塞项：**否**
