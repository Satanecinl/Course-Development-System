# K17 Cross-Cohort Review Decision

## 1. Background

K17-FIX-A 已确认 K9-DQ-1 是真实数据问题：目标班级 `2024级钢铁智能冶金技术1班（高本贯通）`（ClassGroup id=22, cohortYear=2024）与 2025 cohort 在多个 TeachingTask 中被错误合并。

该问题源于 import 阶段 parser 的合班模糊匹配逻辑：当 remark 字段包含 `2024级钢铁智能冶金技术1班（高本贯通）` 时，parser 通过字符子序列匹配将 2024 级班级与 2025 级班级合并到同一个 TeachingTask 中，产生了跨年级合班。

本阶段 K17-FIX-B 只做 review decision，产出决策文档和修复候选方案，**不修改任何数据**。

## 2. Goal

- 对 task 168 / 174 / 176 / 181 / 37 做逐项复核
- 产出 decision（决策分类）和 repair plan candidates（修复候选方案）
- 不执行任何修复操作
- 为 K18 数据修复阶段提供决策依据

## 3. Scope

本次 review 覆盖以下数据实体：

| Entity | Scope |
|--------|-------|
| TeachingTask | task 168, 174, 176, 181, 37 |
| TeachingTaskClass | 上述 5 个 task 关联的所有 class group link |
| ClassGroup | 2024级钢铁智能冶金技术1班（高本贯通）及关联的 2025 级班级 |
| ScheduleSlot | 上述 5 个 task 的所有已排课 slot |
| ImportBatch | #1（confirmed，`2026年春季学期课程表(0420).docx`） |
| K17-FIX-A JSON | `docs/k17-data-quality-classgroup-matching-audit.json` |
| Source artifact | 原始 .docx + parsed JSON（`uploads/imports/`） |

## 4. Source Evidence

### 4.1 K17-FIX-A JSON

- 已读取：`docs/k17-data-quality-classgroup-matching-audit.json`
- 包含 16 条 finding（HIGH 1 / MEDIUM 9 / LOW 4 / INFO 2）
- 确认 4 个专业课 task 存在跨年级合班问题
- 确认 task 37 为公共/思政课跨年级合班（需人工确认）

### 4.2 Database

- 已通过 Prisma Client 直接读取 `prisma/dev.db`
- 确认 5 个 task 均存在
- 确认 class group link 结构与 K17-FIX-A JSON 一致

### 4.3 ImportBatch #1

- status: `confirmed`
- filename: `2026年春季学期课程表(0420).docx`
- createdTaskCount: 308
- createdSlotCount: 440
- 关联 parsed JSON: `uploads/imports/` 目录下存在多个 .json 和 .docx 文件

### 4.4 Source Artifact Availability

| Artifact | Status | Path |
|----------|--------|------|
| Original .docx | Available | `uploads/imports/` (17 个 .docx 文件) |
| Parsed JSON | Available | `uploads/imports/` (17 个 .json 文件) |
| Pre-import backup | Available | `prisma/dev.db.backup-before-import-20260527204043` |
| K17-FIX-A audit JSON | Available | `docs/k17-data-quality-classgroup-matching-audit.json` |

Source artifact 完整，可用于人工对照原始排课表。

## 5. Review Method

### 5.1 Decision Rules

| Decision | Definition |
|----------|-----------|
| CONFIRMED_ERROR | 有充分证据证明是数据错误，无需人工确认 |
| LIKELY_ERROR | 高度疑似数据错误，证据充分但建议人工快速确认 |
| POSSIBLY_LEGITIMATE | 可能是合理业务安排，需进一步分析 |
| NEEDS_SOURCE_REVIEW | 必须对照原始排课表才能判断 |
| ACCEPTED_CROSS_COHORT | 经确认为合理跨年级合班 |

### 5.2 Confidence Rules

| Confidence | Definition |
|------------|-----------|
| HIGH | 证据链完整，decision 可直接作为修复依据 |
| MEDIUM | 证据基本充分，但建议人工确认后执行修复 |
| LOW | 证据不足，必须人工复核 |

### 5.3 Classification Logic

- 专业课（机械制图、电子技术、传感器与检测技术）+ remark 含 2024 级班级名 → LIKELY_ERROR / HIGH
- 公共/思政课（习近平新时代中国特色社会主义思想概论）+ 跨年级 → NEEDS_SOURCE_REVIEW / MEDIUM
- 无跨年级合班 → ACCEPTED_CROSS_COHORT / HIGH

## 6. Decision Summary

```
CONFIRMED_ERROR:       0
LIKELY_ERROR:          4
POSSIBLY_LEGITIMATE:   0
NEEDS_SOURCE_REVIEW:   1
ACCEPTED_CROSS_COHORT: 0
BLOCKING:              4
Recommended next stage: K18 数据修复
```

4 个 LIKELY_ERROR / HIGH confidence task 构成 BLOCKING，必须在 K18 阶段执行数据修复。1 个 NEEDS_SOURCE_REVIEW task 需人工对照原始 .docx 后再决定。

## 7. Per-Task Review

| Task ID | Course | Teacher | ClassGroups | Slot Count | Source Evidence | Decision | Confidence | Recommended Repair Plan |
|--------:|--------|---------|-------------|----------:|----------------|----------|------------|------------------------|
| 168 | 机械制图 | 赵春超 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通） | 1 | Available | LIKELY_ERROR | HIGH | Remove classgroup link to 2024级钢铁智能冶金技术1班（高本贯通）; if 2024级 genuinely shares this course, create separate TeachingTask |
| 174 | 机械制图 | 张红梅 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通） | 1 | Available | LIKELY_ERROR | HIGH | Remove classgroup link to 2024级钢铁智能冶金技术1班（高本贯通）; if 2024级 genuinely shares this course, create separate TeachingTask |
| 176 | 电子技术 | 许进 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通） | 1 | Available | LIKELY_ERROR | HIGH | Remove classgroup link to 2024级钢铁智能冶金技术1班（高本贯通）; if 2024级 genuinely shares this course, create separate TeachingTask |
| 181 | 传感器与检测技术 | 张旭 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级钢铁智能冶金技术（现场工程师）, 2025级智能轧钢技术（现场工程师）+2025级机电一体化技术（现场工程师）, 2024级钢铁智能冶金技术1班（高本贯通） | 1 | Available | LIKELY_ERROR | HIGH | Remove classgroup link to 2024级钢铁智能冶金技术1班（高本贯通）; if 2024级 genuinely shares this course, create separate TeachingTask |
| 37 | 习近平新时代中国特色社会主义思想概论 | 房忠敏 | 2025级钢铁智能冶金技术1班（高本贯通）, 2025级森林草原防火技术1班, 2024级森林草原防火技术1班 | 1 | Available | NEEDS_SOURCE_REVIEW | MEDIUM | Verify original .docx to confirm whether this public course intentionally merges 2024 and 2025 cohorts |

## 8. Repair Plan Candidates

### 8.1 Task 168 — 机械制图（赵春超）

- **Action**: Remove incorrect TeachingTaskClass link
- **removeClassGroupIds**: [22]（2024级钢铁智能冶金技术1班（高本贯通））
- **keepClassGroupIds**: [3, 18, 19]（2025 级三个班级）
- **affectedScheduleSlotIds**: 待查（1 个 slot）
- **split required**: No — 2025 级班级保留原 task
- **slot 归属**: 当前 slot 保留给 2025 级 task
- **人工确认**: 需确认 2024 级是否应有独立的机械制图任务

### 8.2 Task 174 — 机械制图（张红梅）

- **Action**: Remove incorrect TeachingTaskClass link
- **removeClassGroupIds**: [22]
- **keepClassGroupIds**: [3, 18, 19]
- **affectedScheduleSlotIds**: 待查（1 个 slot）
- **split required**: No
- **slot 归属**: 当前 slot 保留给 2025 级 task
- **人工确认**: 需确认 2024 级是否应有独立的机械制图任务

### 8.3 Task 176 — 电子技术（许进）

- **Action**: Remove incorrect TeachingTaskClass link
- **removeClassGroupIds**: [22]
- **keepClassGroupIds**: [3, 18, 19]
- **affectedScheduleSlotIds**: 待查（1 个 slot）
- **split required**: No
- **slot 归属**: 当前 slot 保留给 2025 级 task
- **人工确认**: 需确认 2024 级是否应有独立的电子技术任务

### 8.4 Task 181 — 传感器与检测技术（张旭）

- **Action**: Remove incorrect TeachingTaskClass link
- **removeClassGroupIds**: [22]
- **keepClassGroupIds**: [3, 18, 19]
- **affectedScheduleSlotIds**: 待查（1 个 slot）
- **split required**: No
- **slot 归属**: 当前 slot 保留给 2025 级 task
- **人工确认**: 需确认 2024 级是否应有独立的传感器与检测技术任务

### 8.5 Task 37 — 习近平新时代中国特色社会主义思想概论（房忠敏）

- **Action**: Manual source review required
- **标记**: 不直接修复，先人工对照原始 .docx
- **判断标准**: 原始排课表中 2024 级森林草原防火技术1班 是否应与 2025 级共同上此课程
- **如果合法**: 标记为 ACCEPTED_CROSS_COHORT
- **如果不合法**: split 为独立 task

## 9. Manual Review Questions

1. 原始排课表中 2024 级高本贯通是否应与 2025 级高本贯通共同上机械制图 / 电子技术 / 传感器与检测技术？
2. 高本贯通与现场工程师是否应合班？（当前 4 个 task 均包含高本贯通 + 现场工程师班级）
3. 机械制图 / 电子技术 / 传感器与检测技术是否为专业课？是否允许跨年级合班？
4. 思政课 task 37 是否为合法公共课跨年级合班？（2024 级森林草原防火技术1班 与 2025 级森林草原防火技术1班）
5. 当前 ScheduleSlot 应归属哪个 cohort？（修复后 2024 级是否需要独立 slot？）
6. 修复前是否应冻结相关 drag/drop / solver / export 操作？

## 10. Risk Assessment

### 10.1 Confirmed Errors

- 4 个专业课 task（168, 174, 176, 181）确认存在跨年级合班错误
- 错误源于 import parser 的合班模糊匹配逻辑
- 2024 级班级（id=22）被错误关联到 2025 级 TeachingTask

### 10.2 Manual Review Required

- task 37（思政课）需人工对照原始 .docx 确认是否为合法跨年级合班
- 4 个专业课 task 的 2024 级班级是否需要独立 TeachingTask 需人工确认

### 10.3 Freeze Recommendation

- **建议冻结**：4 个 LIKELY_ERROR task 的 drag/drop 操作
- **建议冻结**：solver 对这 4 个 task 的重新排课
- **建议冻结**：涉及这 4 个 task 的课表导出

### 10.4 Data Repair Recommendation

- 建议进入 K18 数据修复阶段
- 修复对象：4 个 LIKELY_ERROR task 的 TeachingTaskClass link
- 修复方式：移除错误的 classgroup link，保留 2025 级班级
- 2024 级班级是否需要独立 task 需人工确认

### 10.5 Import Logic Fix Recommendation

- 建议修改 import matching logic，增加跨年级合班检测
- 考虑新增 `crossCohortApproved` 标记字段

### 10.6 New Field Recommendation

- 考虑在 TeachingTask 或 TeachingTaskClass 上新增 `crossCohortApproved: Boolean` 字段
- 用于标记经人工确认的合法跨年级合班

## 11. Recommended Next Stage

**K18-CROSS-COHORT-DATA-REPAIR-PLAN**

理由：
- Source artifact 完整（原始 .docx + parsed JSON + pre-import backup 均可用）
- 4 个专业课 task 的证据链完整，decision 为 LIKELY_ERROR / HIGH confidence
- 不需要额外的 source artifact review 阶段
- 可直接进入数据修复计划阶段

但 task 37 仍需人工确认，建议在 K18 修复计划中将 task 37 标记为 `pending manual review`。

## 12. Unmodified Scope

本次 review 未修改以下内容：

- Prisma schema
- `prisma/dev.db`
- db push / migrate / reset / seed
- API route
- Import logic
- Class group matching logic
- TeachingTask / ClassGroup / TeachingTaskClass 数据
- ScheduleSlot 数据
- Frontend
- Solver / Parser
- 权限 key
- 业务数据

## 13. Verification Results

| Check | Result |
|-------|--------|
| review-cross-cohort-classgroup-decisions-k17-fix-b.ts | 已运行成功 |
| JSON report (`docs/k17-cross-cohort-review-decision.json`) | 已生成 |
| Source artifact availability | 已确认（.docx + .json + backup 均存在） |
| 完整验证 | 将在下一小步执行 |

## 14. Closing Note

本文档是 **decision review**，不是修复记录。修复必须另开阶段（K18）执行。本阶段不直接写数据库，不修改任何业务代码。
