# L6-E2 Course-Setting XLSX Partial Import Plan (In-Page)

> Stage: **L6-E2-XLSX-COURSE-SETTING-PARTIAL-IMPORT-PLAN-IN-PAGE**
> Status: **PASS** (plan-only, dry-run)

## 1. User Requirement

在 `/admin/import` Excel 课程设置流程中，根据当前页面内的 manual resolution state，生成 **部分导入计划 dry-run**。

不导出 draft → 再导入 draft → 再验证；不在该阶段执行真正导入；不在该阶段写入 DB。

## 2. Relation to L6-E1 / L6-E1C

- **L6-E1** 提供 manual resolution state（ignore / 候选 / 覆盖），本阶段消费该 state。
- **L6-E1C** 完成 Teacher 基础同步（新增 6 个 Staff 字段：employeeNo / department / position / rank / phone / officePhone）。L6-E2 因此不再 plan Teacher create。
- **L6-E2** 是 **L6-F-XLSX-COURSE-SETTING-PARTIAL-IMPORT-EXECUTION** 的 dry-run 前置；本阶段产出 `importableRows` 作为 L6-F 的输入。

## 3. Plan API Contract

- 路由：`POST /api/admin/import/course-setting-xlsx/partial-import-plan`
- 权限：`import:manage`
- 入参：`multipart { file: .xlsx, targetSemesterId: number, manualResolutions: JSON }`
- 出参：完整 plan（summary + 6 个 row bucket + create candidates + duplicate risks + blockers）
- 关键不变式：`planOnly === true`, `dryRunOnly === true`, `dbWritten === false`, `applyAllowed === false`, `applyRouteExists === false`, `importBatchCreated === false`, `teachingTaskCreated === false`, `teacherCreateCandidates === 0`

## 4. Manual Resolution Input

后端重新解析 Excel 并重新加载 L4 existing data（target semester scope），然后用页面提交的 manualResolutions 重新评估每一行。后端 **不信任前端 importable 状态**，验证每一条 `existingCourseId` / `existingTeacherId` / `existingClassGroupIds` 是否真实存在。

## 5. Row Semantics

- **可导入**：所有 blocker 清零，Course / Teacher / ClassGroup 全部解析，duplicate risk 不阻塞。
- **跳过**：`resolution.ignored === true`（userIgnored）；或 `baseDecision === 'rejected'`。
- **仍需处理**：还有 blocker（缺 Course / Teacher / ClassGroup / 周课时 / 考试类型 / 歧义未确认）。

## 6. Create Candidate Semantics

- **Course create**：来自 manual resolution `createCourseCandidate`，按 normalized name 去重。
- **ClassGroup create**：来自 manual resolution `createClassGroupCandidate`，按 normalized name 去重。
- **Teacher create**：**0**。L6-E1C 拥有 Teacher 基础同步；本阶段不 plan Teacher create。

## 7. Duplicate Risk Semantics

- `possibleExisting`：同 courseId + 同 teacherId + 重叠 class group。
- `exactExisting`：完全相同 class group set → 计入 blocker。
- `ambiguousExisting`：同 courseId 但 teacher / class 不全匹配。
- `safeNew`：无冲突。
- `needsReview`：ambiguous mapping 未确认。

## 8. UI Workflow

- 页面按钮：**生成部分导入计划**（绿色高亮，无 "执行导入 / 写入数据库 / 创建教学任务 / 创建 ImportBatch" 按钮）。
- 警告文案：**当前仅生成导入计划，不会写入数据库，不会创建教学任务或导入批次。**
- 摘要卡片：计划导入 / 跳过 / 仍需处理 / 已忽略 / 阻塞项 / 课程候选 / 班级候选 / 教学任务候选 / 任务-班级关联 / 重复风险 / applyReadyForFutureStage。
- 表格：可导入行 / 跳过行 / 仍需处理 / 课程/班级候选 / 重复风险 / 阻塞项。
- 导出：**导出部分导入计划 JSON**（脱敏，`rawIncluded: false`，无原文）。

## 9. No-DB-Write Proof

| metric | value |
|---|---|
| planOnly | true |
| dryRunOnly | true |
| dbWritten | false |
| applyAllowed | false |
| applyRouteExists | false |
| importBatchCreated | false |
| teachingTaskCreated | false |
| teachingTaskClassCreated | false |
| courseCreated | false |
| classGroupCreated | false |
| teacherCreated | false |
| excelPartialImportApplied | false |
| teacherCreateCandidates | 0 |

## 10. Privacy / Logging

committed docs 仅含 aggregate，不含真实教师 / 班级 / 课程 / 备注 / 手机 / 工号。runtime UI 可在授权管理员范围显示原文，export JSON 永远 `rawIncluded: false`。route / helper 都不输出 raw row 日志。

## 11. Plan Result

counts 在 `docs/l6-e2-xlsx-course-setting-partial-import-plan-in-page.json` 中随每次 dry-run 变化；本 markdown 是结构化说明文档。

## 12. Cross-Stage Refs

- L6-D2 review package fingerprint：通过 plan API 返回。
- L6-D2 review rows：作为本阶段 helper 的输入。
- L6-E1 manual resolution items：作为本阶段 helper 的输入。
- L4 dry-run existing data：作为本阶段 helper 的输入（target semester scoped）。

## 13. Browser Validation Checklist

1. 打开 `/admin/import`，选择目标学期，上传 xlsx。
2. 生成审核视图，使用 manual resolution 处理至少 1 个缺课程、1 个缺教师、1 个缺班级、1 个忽略行。
3. 点击 **生成部分导入计划**。
4. 验证：摘要卡片出现、所有表格出现、Teacher create = 0、警告文案正确。
5. 点击 **导出部分导入计划 JSON**，确认 `rawIncluded: false` 且无原文。
6. 确认页面无 执行导入 / 写入数据库 / 创建教学任务 / 创建 ImportBatch 按钮。
7. 确认 DB counts 不变（prisma 不可观察到写入）。

## 14. Next Stage

**L6-F-XLSX-COURSE-SETTING-PARTIAL-IMPORT-EXECUTION**

要求：DB backup / explicit confirm / transaction / rollback note。

本阶段产出 `importableRows` 作为 L6-F 的输入（其它行不会进入 apply）。