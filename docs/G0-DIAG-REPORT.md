# G0-DIAG 诊断报告：0420 源课表导入解析缺陷排查

> 诊断日期：2026-05-29
> 原诊断工具已在 K36-A5D2A 从当前 HEAD 移除；本文件仅保留历史结论。
> 状态：**诊断完成，待修复方案确认**

---

## 1. 当前数据库是否存在非法课程

### 结论：存在，来自旧数据 output.json

| 非法 Course 名 | CourseId | TeachingTask 数 | ScheduleSlot 数 | ClassGroup |
|---------------|----------|----------------|----------------|------------|
| `周六` | 110 | 3 | 3 | 专业年级班 |
| `周日` | 111 | 3 | 3 | 专业年级班 |
| `3、4` | 112 | 2 | 2 | 专业年级班 |
| `5、6` | 113 | 2 | 2 | 专业年级班 |
| `7、8` | 114 | 2 | 2 | 专业年级班 |

- 所有非法课程均关联到 `classGroupId=37 "专业年级班"`
- 所有非法记录的 `importBatchId` 为 **NULL**（来自 seed_db.ts 导入）
- `output.json`（seed_db.ts 的数据源）有 **595 条记录**，包含这些非法数据
- **0420 parser 当前版本已不产生非法课程**（dry-run 验证通过，过滤了 12 条伪记录）

### 根因

早期 parser 版本没有正确识别并过滤 Word 表格中的表头行，导致：
- 第一行星期（一/二/三/四/五/六/日）被当作课程名
- 第二行节次（1、2 / 3、4 / 5、6 / 7、8 / 9、10）被当作课程名
- "专业年级班" 被当作班级名

---

## 2. 当前数据库是否存在重复 ScheduleSlot

### 结论：存在，根因是 seed_db.ts 与 importer.ts 的去重逻辑不一致

#### 重复分布

- **30 组** 按 `course+class+teacher+room+day+slot+week` 维度完全重复的 ScheduleSlot
- **30 个** TeachingTask 关联了 **2-4 个** ScheduleSlot（正常应为 1 个）
- **2024级汽车制造与试验技术2班** 有 **8 个** 同一时间格重复课程
- **2024级汽车制造与试验技术1班** 有 **8 个** 同一时间格重复课程

#### 典型重复案例

```
day=5, slot=2, 班级=2024级汽车制造与试验技术2班:
  taskId=340 (seed) + slotId=1539 (ImportBatch#12) → 企业学徒实训（学徒制）赵俣绗
  taskId=342 (seed) + slotId=342 (seed)            → 企业学徒实训（学徒制）赵俣绗
```

同一班级同一时间格出现 **2 张相同的课程卡片**。

### 根因分析

#### seed_db.ts 的 TeachingTask 去重键
```
taskKey = courseId|teacherId|weekType|weekStart|weekEnd|slotIndex|dayOfWeek|roomId
```
- **包含 dayOfWeek 和 slotIndex**
- 同一 course+teacher+week 在不同 day/slot → **创建多个 TeachingTask**

#### importer.ts 的 TeachingTask 去重键
```
taskKey = courseName|teacherStr|weekType|startWeek|endWeek|remark|canonicalClassGroupSet
```
- **不包含 dayOfWeek 和 slotIndex**
- 同一 course+teacher+week+classes+remark → **重用同一个 TeachingTask**

#### 冲突过程

1. seed_db.ts 为 `企业学徒实训（学徒制）+赵俣绗+ALL` 在 day=5,slot=1 创建了 **taskId=340**
2. seed_db.ts 为同一组合在 day=5,slot=2 创建了 **taskId=342**
3. ImportBatch #12 导入 0420 数据时，对于 day=5,slot=2 的 record：
   - importer 查找 course+teacher+week+classes 匹配的 TeachingTask
   - 匹配到 **taskId=340**（第一个匹配的）
   - 检查 taskId=340 是否已有 day=5,slot=2 的 ScheduleSlot → **没有**
   - 为 taskId=340 创建新的 ScheduleSlot（day=5,slot=2）→ **slotId=1539**
4. 结果：day=5,slot=2 同时有：
   - taskId=340 + slotId=1539（ImportBatch 创建）
   - taskId=342 + slotId=342（seed 创建）

两者 course/teacher/room/day/slot/classes 完全相同，只是 TeachingTask ID 不同。

---

## 3. 重点检查用户截图相关班级

### 2024级汽车制造与试验技术2班

- 共关联 **19 个 TeachingTask**
- **8 个** 同一时间格重复课程
- 涉及课程：企业学徒实训、底盘电控、新能源汽车、汽车保险、智能网联、汽车机械基础、汽车营销

### 2024级汽车制造与试验技术1班

- 共关联 **19 个 TeachingTask**
- **8 个** 同一时间格重复课程

### 2025级两年制汽车制造与试验技术

- **不存在于当前数据库**

---

## 4. ImportBatch 状态

| Batch | 状态 | Tasks | Slots | 说明 |
|-------|------|-------|-------|------|
| #1-#11 | rolled_back/pending/abandoned | 0 | 0 | 已回滚或未确认 |
| **#12** | **confirmed** | **56** | **189** | **当前生效批次（0420 数据）** |

数据来源分布：
- seed (importBatchId=null): **441** TeachingTasks, **441** ScheduleSlots
- ImportBatch #12: **56** TeachingTasks, **189** ScheduleSlots
- 合计: 497 TeachingTasks, 630 ScheduleSlots

---

## 5. 0420 Parser Dry-Run

| 检查项 | 结果 |
|--------|------|
| 总 records | **585** |
| 非法课程 | **0**（已过滤 12 条伪记录） |
| class_name 为空 | **0** |
| 2024级汽车制造与试验技术2班 records | **19** |
| 完全重复 records | **0** |

### 0420 vs output.json 差异

| | 0420 | output.json (旧数据) |
|--|------|---------------------|
| 课程名示例 | `无机化学` | `无机化学丹婷婷`（teacher 粘连） |
| 课程名示例 | `液压与气压传动（）` | `液压与气压传动（单周上）` |
| 班级数 | 37 | - |
| 记录数 | 585 | 595 |

**结论：output.json 是早期 parser 版本生成的脏数据，0420 parser 当前版本已修复 teacher 粘连和表头过滤问题。**

---

## 6. 初步根因判断

### 问题1：非法课程

| 选项 | 判断 |
|------|------|
| A. Parser 表头识别问题 | ✅ **根因**。早期 parser 未过滤表头行，0420 当前版本已修复 |
| B. Parser 节次识别问题 | ✅ **相关**。节次（1、2/3、4 等）被当作 course |
| C. 合班推断问题 | ❌ 无关 |
| D. 旧数据重复导入未清理 | ✅ **结果**。output.json 是旧数据，seed_db.ts 导入后未清理 |
| E. 前端渲染重复 | ❌ 无关 |

### 问题2：重复 ScheduleSlot

| 选项 | 判断 |
|------|------|
| A. 源文件真实排了多次课 | ❌ 否。0420 数据中没有重复 records |
| B. Parser 重复解析 | ❌ 否。0420 parser 未产生重复 |
| C. 合班推断错误 | ❌ 无关 |
| D. 旧数据重复导入未清理 | ⚠️ **部分相关**。seed 数据与 ImportBatch 叠加是表面现象 |
| E. 前端渲染重复 | ❌ 否。数据库层面确实存在重复 slot |
| **F. seed_db.ts 与 importer.ts 去重逻辑不一致** | ✅ **根因** |

### 关键根因

1. **早期 parser 缺陷**：未过滤表头行 → output.json 包含非法课程
2. **去重逻辑不一致**：seed_db.ts 按 `course+teacher+week+slot+day+room` 去重，importer.ts 按 `course+teacher+week+remark+classes` 去重 → ImportBatch 为 seed 中的 TeachingTask 创建了额外 ScheduleSlot
3. **数据叠加**：seed (441 slots) + ImportBatch #12 (189 slots) = 630 slots，但其中约 **30 组** 是重复叠加

---

## 7. 建议修复方案

### 方案 A（推荐）：清理并重新导入

1. 备份 `prisma/dev.db`
2. Rollback ImportBatch #12（删除其 56 tasks + 189 slots + 关联 TeachingTaskClass）
3. 删除 seed 数据中的非法 Course/ClassGroup/TeachingTask/ScheduleSlot
4. 用 0420 parser 重新生成 `output.json`
5. 运行 `seed_db.ts` 重新导入

**优点**：彻底清理，数据一致
**缺点**：破坏性操作，需要用户明确批准

### 方案 B（最小修复）：统一去重逻辑 + 增量修复

1. **修改 `seed_db.ts`**：TeachingTask 去重键去掉 `slotIndex` 和 `dayOfWeek`，与 importer.ts 保持一致
2. **修改 `importer.ts`**：创建 ScheduleSlot 前，检查同一班级在同一 day/slot 是否已有相同 course+teacher 的 ScheduleSlot
3. **重新 seed**：清空数据库后用 0420 parser 输出重新导入

**优点**：修复根因，避免未来重复
**缺点**：仍需清理数据库

### 方案 C（前端兜底）：dashboard 渲染去重

1. 在 `applyViewFilter` 或 `ScheduleGrid` 中对同一 class + course + teacher + room + day + slot + week 的组合去重
2. 同时过滤 courseName 为非法 token 的记录

**优点**：不碰数据库，风险最低
**缺点**：只隐藏问题，数据层面仍脏，调课/导出等功能可能受影响

### 方案 D（parser 增强）：预防未来问题

1. 在 `parse_schedule.py` 的 `is_valid_schedule_record` 中增加更严格的非法 token 过滤
2. 在 parser 输出阶段增加保守去重（相同 key 只保留一条）
3. **此方案不影响当前数据库**

**优点**：防止未来导入产生脏数据
**缺点**：不修复已有问题

---

## 8. 下一步建议

1. **用户决策**：选择方案 A（清理重导）或方案 C+D（前端兜底 + parser 增强）
2. **如选方案 A**：先执行 `npx prisma db push --force-reset` 或 `cp dev.db dev.db.backup-g0`
3. **如选方案 C+D**：
   - 修改 `src/app/api/schedule/route.ts` 增加去重逻辑
   - 修改 `src/components/schedule-grid.tsx` 增加前端去重
   - 修改 `parse_schedule.py` 增加非法 token 过滤和输出去重

---

## 附录

原诊断和数据修复工具已从当前 HEAD 移除，避免继续暴露固定真实数据路径或被误执行。
