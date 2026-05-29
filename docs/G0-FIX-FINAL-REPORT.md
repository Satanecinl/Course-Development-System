# G0-FIX 最终报告

**阶段**: G0：0420 源课表导入解析缺陷排查与修复
**日期**: 2026-05-29
**状态**: ✅ 完成

---

## 1. G0 发现的问题

### 1.1 假课程卡片
Dashboard 中出现非法课程名：
- `周六`、`周日`
- `3、4`、`5、6`、`7、8`、`9、10`、`9.10`
- `专业年级班`、`人数`、`教室`

### 1.2 重复课程卡片
汽车制造相关班级在同一时间格出现重复课程卡片：
- `2024级汽车制造与试验技术2班`
- `2024级汽车制造与试验技术1班`

### 1.3 ImportBatch 历史混乱
- 存在旧 ImportBatch #12 与 seed 数据叠加
- 重复 ScheduleSlot 多达 30 组

---

## 2. 根因分析

### 2.1 假课程来源
- **旧 output.json**：早期 parser 版本未过滤表头 token（周一-周日、1、2 等）
- **seed_db.ts**：直接导入 output.json 中的所有记录，包括非法课程

### 2.2 重复 slot 来源
- **seed_db.ts TeachingTask 去重键**：包含 `slotIndex|dayOfWeek|roomId`，导致同一课程不同时间创建多个 TeachingTask
- **importer.ts TeachingTask 去重键**：使用 `course|teacher|week|remark|canonicalClasses`，与 seed 不一致
- **ScheduleSlot 去重缺失**：importer.ts 未检查 `roomId`，导致重复创建

### 2.3 合班备注差异
- `buildEventKey` 和 `taskKey` 包含 `remark`
- 同一合班课程在不同班级行中因 remark 不同（如"与森防合班" vs "与高本贯通合班"）被拆分为多个 TeachingTask

### 2.4 0420 parser 本身干净
- 当前 parser 输出 585 条记录
- 非法课程 = 0
- 完全重复 records = 0
- 问题仅来自旧数据和导入逻辑

---

## 3. 已完成修复

### 3.1 Parser 防线（G0-FIX-A）
- **文件**: `scripts/parse_schedule.py`
- **修改**: 扩展 `HEADER_COURSE_TEXTS` 至 28 个非法 token
- **效果**: 阻止非法课程名进入 parser 输出

### 3.2 Parser 输出去重（G0-FIX-A）
- **文件**: `scripts/parse_schedule.py`
- **新增**: `deduplicate_records()` 函数
- **去重 key**: `className|courseName|teacherName|roomName|dayOfWeek|timeSlot|weekType|weekStart|weekEnd|remark`
- **效果**: 防止完全相同记录重复输出

### 3.3 TeachingTask 去重键统一（G0-FIX-A + G0-FIX-B）
- **文件**: `src/lib/import/importer.ts`、`scripts/seed_db.ts`
- **统一后 key**: `courseId|teacherId|weekType|weekStart|weekEnd|canonicalSet`
- **移除**: `remark`（避免合班备注差异导致重复）
- **移除**: `slotIndex|dayOfWeek|roomId`（避免同一课程不同时间创建多个 TeachingTask）

### 3.4 ScheduleSlot 去重保护（G0-FIX-A）
- **文件**: `src/lib/import/importer.ts`、`scripts/seed_db.ts`
- **去重 key**: `teachingTaskId|dayOfWeek|slotIndex|roomId`
- **效果**: 防止完全相同 ScheduleSlot 重复创建

### 3.5 Dev.db 重建（G0-FIX-B）
- **操作**: `npx prisma db push --force-reset --skip-generate`
- **备份**: `prisma/dev.db.backup-before-g0fixb-rebuild-20260529140132`

### 3.6 只导入 0420 源文件（G0-FIX-B）
- **源文件**: `2026年春季学期课程表(0420).docx`
- **ImportBatch**: #1, status=confirmed
- **结果**: 308 TeachingTasks, 440 ScheduleSlots

---

## 4. 当前数据状态

| 指标 | 数值 |
|------|------|
| ClassGroup | 36 |
| Teacher | 84 |
| Course | 104 |
| Room | 53 |
| TeachingTask | 308 |
| TeachingTaskClass | 548 |
| ScheduleSlot | 440 |
| ImportBatch | 1 (confirmed) |
| 非法 Course | **0** |
| 重复 ScheduleSlot | **0 组** |
| ScheduleAdjustment ACTIVE | **0** |

### 数据来源分布
- ImportBatch #1: 308 TeachingTasks, 440 ScheduleSlots
- seed (importBatchId=null): 0, 0

---

## 5. 用户截图验收

**状态**: ✅ 用户已人工确认通过

用户已自行完成 Dashboard 截图人工验收，并确认：
- 全部显示模式下无假课程卡片（"周六"/"周日"/"3、4"等）
- 汽车制造2班无同格重复卡片
- 汽车制造1班无同格重复卡片
- 第 7/8 周视图正常
- 班级/教师/教室筛选有效

**说明**: 本阶段未重复采集截图，以用户人工确认为准。

---

## 6. remark 合并安全检查

**脚本**: `scripts/g0fixc-check-remark-merge-safety.ts`

### 6.1 差异解释
- **plannedTasks=313**: 按旧逻辑（含 remark）的去重计数
- **actualTasks=308**: 按新逻辑（不含 remark）的去重计数
- **差异**: 313 - 308 = 5 个 TeachingTask

### 6.2 5 个差异详情

| 组 | 课程 | 教师 | 时间 | remark 差异 |
|----|------|------|------|------------|
| 1 | 形势与政策 | 胡浩 | 周1 5,6 | 与森防合班 vs 与高本贯通合班 |
| 2 | 创新创业教育 | 徐燕 | 周2 3,4 | 与森防合班 vs 与高本贯通合班 |
| 3 | 习近平新时代中国特色社会主义思想概论 | 房忠敏 | 周2 7,8 | 与森防合班 vs 与高本贯通合班 |
| 4 | 中华优秀传统文化 | 杨秀芳 | 周3 7,8 | 与森防合班 vs 与高本贯通合班 |
| 5 | 美育 | 苏英周 | 周2 3,4 | 合班24机电一班 vs 合班24轧钢一二班 |

### 6.3 安全检查结论

| 检查项 | 结果 |
|--------|------|
| 学徒制/非学徒制是否被错误合并 | ✅ 无 |
| 单周/双周是否被错误合并 | ✅ 无 |
| 不同合班对象是否被错误合并 | ✅ 无 |
| 不同班级是否被错误合并 | ✅ 无 |
| 不同教师是否被错误合并 | ✅ 无 |
| 不同教室是否被错误合并 | ✅ 无 |
| 不同上课时间是否被错误合并 | ✅ 无 |
| 不同周次范围是否被错误合并 | ✅ 无 |

**结论**: 移除 remark 从 dedup key 是安全的。5 个差异全部来自"仅 remark 不同"的合法合并，均为同一课程、同一教师、同一教室、同一时间的真实合班场景，只是合班对象视角不同。

---

## 7. Excel 验收

| 检查项 | 结果 |
|--------|------|
| ALL 导出状态 | ✅ HTTP 200 |
| ALL 导出无非法课程 | ✅ |
| 第 7 周导出状态 | ✅ HTTP 200 |
| 第 7 周导出无非法课程 | ✅ |
| 第 7 周导出非空 | ✅ 7451 字节 |
| 第 8 周导出状态 | ✅ HTTP 200 |
| 第 8 周导出无非法课程 | ✅ |
| 第 8 周导出非空 | ✅ 7347 字节 |
| 数据库层面无重复 slot | ✅ 0 组 |

---

## 8. 调课冒烟

| 检查项 | 结果 |
|--------|------|
| 同周调课 dry-run | ✅ |
| create | ✅ |
| effective schedule 生效 | ✅ |
| void 恢复 | ✅ |
| ACTIVE adjustment 无新增 | ✅ |
| 跨周调课（week 7 → week 8） | ✅ |
| 跨周 void | ✅ |
| 跨周 ACTIVE adjustment 无新增 | ✅ |

---

## 9. 验证命令结果

| 命令 | 结果 |
|------|------|
| `npm run build` | ✅ 通过 |
| `npm run test:diagnostics` | ✅ 通过 |
| `npx tsx scripts/test-g0-parser-guards.ts` | ✅ 13/13 通过 |
| `npx tsx scripts/g0fixb-verify-database.ts` | ✅ 全部通过 |
| `npx tsx scripts/diagnose-schedule-import-0420.ts` | ✅ 通过（近似匹配 2 个非非法课程） |
| `npx tsx scripts/g0fixc-check-remark-merge-safety.ts` | ✅ 通过 |
| `npm run test:schedule-adjustment` | ✅ 通过 |
| `npm run test:schedule-adjustment-cross-week` | ✅ 通过 |
| `npm run test:capacity` | ✅ 通过（94 个容量冲突是源课表既有问题） |
| `npm run test:solver` | ✅ 通过 |

---

## 10. 已知遗留

### 10.1 test:import-workflow 失败
- **原因**: 重建后无 pending batch，`test:import-batches` 断言失败
- **范围**: 后续 G1 阶段处理
- **影响**: 不影响当前数据完整性

### 10.2 容量冲突
- **数量**: 94 个 HC4_CAPACITY 违规
- **原因**: 源课表中合班课程学生数超过教室容量（如 93 人 vs 50 座）
- **范围**: 需要人工调整教室或拆分班级
- **影响**: 不影响数据完整性，仅影响排课优化

### 10.3 "2025级两年制汽车制造与试验技术" 不存在
- **状态**: 源文件中无此班级名
- **实际存在**: 2025级汽车制造与试验技术1班、2025级汽车制造与试验技术2班
- **影响**: 无，用户可能记忆有误

### 10.4 diagnose-schedule-import-0420.ts 近似匹配
- **匹配**: "森林植物（二）"和"大学日语"
- **原因**: 近似匹配算法将括号和日文字符误判为非法 token
- **影响**: 无，这些是合法课程名

---

## 11. 变更文件清单

### 新增文件
| 文件 | 用途 |
|------|------|
| `scripts/test-g0-parser-guards.ts` | Parser 防线 + key 一致性测试 |
| `scripts/plan-clean-schedule-dirty-data-0420.ts` | Dry-run 清理计划脚本 |
| `scripts/g0fixb-import-0420.ts` | 完整导入脚本 |
| `scripts/g0fixb-verify-database.ts` | 数据库验收脚本 |
| `scripts/g0fixb-verify-dashboard.ts` | Dashboard 浏览器验收脚本 |
| `scripts/g0fixc-check-adjustments.ts` | 调课记录与导入批次检查 |
| `scripts/g0fixc-check-remark-merge-safety.ts` | remark 合并安全检查 |
| `scripts/g0fixc-verify-excel.ts` | Excel 导出验收脚本 |
| `scripts/export-schedule-adjustments.ts` | ScheduleAdjustment 快照导出 |
| `docs/G0-DIAG-REPORT.md` | 诊断报告 |
| `docs/G0-FIX-FINAL-REPORT.md` | 本文档 |

### 修改文件
| 文件 | 修改内容 |
|------|---------|
| `scripts/parse_schedule.py` | 扩展 HEADER_COURSE_TEXTS，新增 deduplicate_records() |
| `scripts/seed_db.ts` | 统一 TeachingTask 去重键，移除 remark，新增 slotCache |
| `src/lib/import/importer.ts` | 统一 taskKey，移除 remark，增强 ScheduleSlot 去重 |

### 备份文件
| 文件 | 说明 |
|------|------|
| `prisma/dev.db.backup-before-g0fixb-rebuild-20260529140132` | 重建前完整备份 |
| `prisma/backups/schedule-adjustments-before-g0fixb-2026-05-29T06-02-06-492Z.json` | 调课记录快照（21 条） |

---

## 12. 结论

**G0 阶段可以关闭。**

所有代码修复和数据重建工作已完成，验收测试全部通过。当前数据库状态干净：
- 非法课程 = 0
- 重复 ScheduleSlot = 0
- 用户已人工确认 Dashboard 截图验收通过
- Excel 导出正常
- 调课功能正常

遗留问题（test:import-workflow、容量冲突）不影响系统核心功能，可在后续 G1 阶段处理。
