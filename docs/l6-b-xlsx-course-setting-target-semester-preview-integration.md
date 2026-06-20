# L6-B-XLSX-COURSE-SETTING-TARGET-SEMESTER-PREVIEW-INTEGRATION

## 1. 阶段名称

**L6-B-XLSX-COURSE-SETTING-TARGET-SEMESTER-PREVIEW-INTEGRATION**

Excel 课程设置 preview 流程接入目标学期选择。

## 2. 本阶段目标

1. `/admin/import` Excel preview 区展示已有学期选择器
2. Excel preview API 接收 `targetSemesterId` 并校验
3. preview API 加载目标学期的 existingData
4. L4 dry-run mapper 使用目标学期上下文
5. response 明确 target semester summary + dry-run summary
6. UI 显示"不会切换系统当前学期"
7. 保留 preview-only guard：不能 confirm/apply/write DB

## 3. L6-A 设计落实点

| L6-A 设计 | L6-B 实现 |
|---|---|
| 接受已有学期 mode: "existing" | ✅ preview API 接受 `targetSemesterId` |
| `setAsActive: false` 默认 | ✅ UI 与 API 都强制 false |
| 与全局 active semester 解耦 | ✅ UI 显示"不会切换系统当前学期"提示 |
| 新建学期推迟到 L6-C | ✅ 本阶段不实现 |
| ImportRuleConfig 接入 | ✅ 通过 `getRequireExplicitSemesterForImport` 强制要求 |

## 4. Target Semester Selection API Contract

### Request

```
POST /api/admin/import/course-setting-xlsx/preview
Content-Type: multipart/form-data
Body: file=<.xlsx>, targetSemesterId=<number>
```

### Validation

| 错误 | HTTP | 触发 |
|---|---|---|
| MISSING_TARGET_SEMESTER | 400 | 缺少 `targetSemesterId` |
| INVALID_TARGET_SEMESTER | 400 | 非数字 / ≤0 |
| TARGET_SEMESTER_NOT_FOUND | 400 | ID 不存在 |
| INVALID_FILE_TYPE | 400 | 非 .xlsx |
| FILE_TOO_LARGE | 400 | >20MB |

### Response (success)

```ts
{
  success: true,
  parserType: 'courseSettingXlsx',
  previewOnly: true,
  canConfirm: false,
  canApply: false,
  // L6-B 新增
  targetSemester: {
    id, nameHash, code, isActive, isActiveSemester,
    setAsActive: false,
    classGroupCount, teachingTaskCount, teachingTaskClassCount,
    courseCount, teacherCount,
  },
  dryRunSummary: {
    dryRunOnly: true, dbWritten: false, existingDataScopedBySemester: true,
    courseCandidates, teacherCandidates, classGroupCandidates,
    teachingTaskCandidates, teachingTaskClassCandidates,
    rowsNeedingManualReview, rowsSkipped,
  },
  matchSummary: { course, teacher, classGroup, teachingTask, teachingTaskClass },
  requireExplicitSemesterForImport: boolean,
  targetSemesterRequired: true,
  // L3 原字段保留
  workbookSummary, fieldSummary, sourceEvidenceSummary,
  diagnosticsSummary, previewRows, manualReviewSummary,
}
```

## 5. Explicit Semester Requirement

L6-B 强制要求 targetSemesterId（不依赖 ImportRuleConfig）。如果缺失，返回 `MISSING_TARGET_SEMESTER`。

`ImportRuleConfig.requireExplicitSemesterForImport` 的当前值会在 error response 中返回，便于前端提示用户该规则已启用。

## 6. Target-semester Scoped existingData Loading

| Entity | Loading 策略 |
|---|---|
| Course | Global（全部加载） |
| Teacher | Global（全部加载） |
| ClassGroup | `where: { semesterId: targetSemesterId }` |
| TeachingTask | `where: { semesterId: targetSemesterId }` |
| TeachingTaskClass | `where: { teachingTaskId: { in: taskIds } }` |
| Semester | `findUnique by id` + `findFirst where isActive` |

**禁止**：任何 Prisma write method（`create`/`update`/`upsert`/`delete`/`$executeRaw`）。

## 7. UI Selector 行为

- 页面加载时自动 GET `/api/semesters` 获取学期列表
- 下拉框显示每个学期的 `name`，active 学期标记"(当前学期)"
- 默认无选中（**不**自动选 active semester）
- 解耦提示：`该选择只决定本次 Excel 课程设置导入的目标学期，不会自动切换系统当前学期。`
- 未选学期时，"解析预览"按钮 disabled
- 选择后显示 target semester info + dry-run summary + match summary
- 不显示"新建学期"表单（L6-C 实现）
- 不显示"确认导入"/"应用"/"写入 DB"按钮

## 8. No Active Semester Switch Proof

- API 永不调用 `POST /api/semesters/[id]/activate`
- API 永不修改 `Semester.isActive`
- API 永不调用 `updateSemester` / `createSemester` / `deleteSemester`
- response 中 `setAsActive: false` literal
- UI 明确显示"不会自动切换系统当前学期"

## 9. No DB Write Proof

`loadCourseSettingExistingDataForSemester` 与 `loadSemesterSummary` 仅使用：
- `prisma.course.findMany`
- `prisma.teacher.findMany`
- `prisma.classGroup.findMany` (scoped)
- `prisma.teachingTask.findMany` (scoped)
- `prisma.teachingTaskClass.findMany` (scoped)
- `prisma.semester.findUnique`
- `prisma.semester.findFirst`
- `prisma.X.count`

无 `create` / `update` / `upsert` / `delete` / `createMany` / `updateMany` / `deleteMany` / `$executeRaw` / `$transaction`。

## 10. Privacy / Redaction

- committed JSON 中 semester name 已 hash（`sha256 prefix-12`）
- 无 raw 教师/班级/课程/备注原文
- 无手机号
- 无 sheet 原文

API response 可在浏览器显示：
- semester id / code / isActive / counts
- hash-based identifiers
- diagnostic codes
- classification buckets
- confidence scores

## 11. 与 L3 Preview 的关系

L6-B 是 L3 的扩展（不是替换）：
- L3 纯结构化解析（无学期上下文）
- L6-B 加入 `targetSemesterId` + 学期-scoped dry-run
- 保留 L3 全部原字段（workbook/field/sourceEvidence/diagnostics/previewRows/manualReview）

## 12. 与 L4 Dry-run Mapper 的关系

- L4 mapper 纯函数不感知 semester（by design，未修改）
- L6-B 在 caller（preview helper）中：
  1. 用 `loadCourseSettingExistingDataForSemester` 加载按 semesterId 过滤的 existingData
  2. 传给 `buildCourseSettingTeachingTaskDryRun`
  3. 提取 candidateSummary + matchSummary
- L4 mapper 文件未修改（mtime + 导出未变）

## 13. 与 L6-C Create New Semester 的边界

L6-B 只支持 **选择已有学期**。L6-C 将支持：
- 在导入 UI 中新增"新建学期"表单
- 调用现有 `POST /api/semesters` 创建（默认 isActive=false）
- 创建后自动选中为新学期的 targetSemesterId

L6-C 仍**禁止**：
- 写 TeachingTask / ImportBatch
- 切换 active semester

## 14. 与旧 Word Import 的隔离

- 旧 Word import route `src/app/api/admin/import/parse` 未修改
- 旧 Word import UI（`openUploadDialog`，`executeUpload`）未修改
- Excel preview 在 `/admin/import` 页面独立区块，与 Word import 流程完全分离
- Excel preview 不复用旧 Word import 的任何按钮

## 15. 验证结果

- ✅ L6-B verify: 69/69 PASS
- ✅ L6-A audit: PASS
- ✅ L3 verify: PASS
- ✅ L2 parser verify: PASS
- ✅ L1 audit: PASS
- ✅ K39-B1/B1A/C2/C4: PASS
- ✅ K22-C: 73/0/0/0 PASS
- ✅ scan:docs-pii: 0 blocking
- ✅ build: PASS
- ✅ tsc: PASS
- ✅ targeted eslint: 0 errors, 0 warnings
- ✅ git diff --check: clean

## 16. 浏览器人工验收 Checklist

L6-B 涉及 UI，必须浏览器人工验收后才能正式关闭：

1. 启动 dev server
2. ADMIN 登录
3. 进入 `/admin/import`
4. Excel preview 区出现"导入目标学期"选择器
5. 不选择学期时不能解析
6. 选择已有学期，例如 `2025-2026秋季学期`
7. 页面显示"该选择只决定本次导入目标学期，不会切换系统当前学期"
8. 上传 `.xlsx` 样本
9. 点击解析预览
10. loading 正常
11. 成功显示 target semester summary
12. 成功显示 workbook summary
13. 成功显示 dry-run summary / match summary
14. 成功显示 manual review summary
15. 预览表格仍不显示 raw 教师/班级/课程/备注原文
16. 页面没有 Excel 确认导入 / 应用 / 写入 DB / 切换当前学期按钮
17. 上传 `.docx` 仍被拒绝
18. 旧 Word import 区域不受影响
19. Browser console 无 React error
20. Network response 不包含 raw Excel 原文
21. 验证期间 DB counts 不变

**当前状态**：`code complete; browser manual validation pending; not READY_FOR_REAL_USE yet.`

## 17. 下一阶段建议

- **L6-C**：Create New Semester From Import Flow
  - 在导入 UI 增加"新建学期"表单
  - 复用现有 `POST /api/semesters`
  - 仍不切换 active semester
  - 仍不导入 TeachingTask

- **L6-D**：Approval Package With Target Semester
  - review package 输出包含 targetSemesterId
  - 所有 decisions pending
  - 不 apply

- **L6-E/F**：Controlled Apply Plan + Execution
  - backup / approval / transaction / rollback
  - 仅在用户明确批准后写 DB

---

*Stage: L6-B | Version: 1.0.0 | Generated: 2026-06-20*
