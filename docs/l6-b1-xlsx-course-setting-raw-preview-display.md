# L6-B1-XLSX-COURSE-SETTING-RAW-PREVIEW-DISPLAY

## 1. 阶段名称

**L6-B1-XLSX-COURSE-SETTING-RAW-PREVIEW-DISPLAY**

授权管理员 Excel preview raw 字段展示。

## 2. 用户需求变更

L6-B 阶段，preview 表格采用全脱敏口径（仅显示 hash）。用户最新反馈：

> Excel 课程设置导入预览页面需要显示真实教师、班级、课程、备注原文，便于人工核对。

因此本阶段调整口径：

- ✅ **管理端浏览器 UI** + **授权 API response**：可以返回 raw preview fields（restricted by `import:manage` permission）
- ❌ **committed docs/json、verify output、git、日志、local artifacts**：仍禁止 raw 原文

## 3. 为什么 UI/API runtime 需要 raw preview

- **人工核对**：管理员需要看到原始课程名、教师名、班级名，才能判断 import 是否正确
- **预览定位**：仅 `import:manage` 权限管理员可见，浏览器 UI 是受控环境
- **不持久化**：raw 字段仅在 API response 中存在，不写入 DB、不写入日志、不写入 committed artifacts

## 4. Raw Display Scope

### 允许（runtime authorized）

```ts id="l6b1-raw-allowed"
- API response raw preview fields: allowed (authenticated ADMIN)
- Browser UI raw preview display: allowed
- In-memory raw text processing: allowed (used to populate response)
- maxPreviewRows ≤ 200 (cap)
```

### 禁止（committed / static）

```text id="l6b1-raw-forbidden"
- committed docs/*.md: raw 文本禁止
- committed docs/*.json: raw 文本禁止
- verify stdout/stderr aggregate: raw 文本禁止
- temp/local-artifacts: raw 文本禁止
- source code hardcoded sample text: 禁止
- git tracked files: raw 文本禁止
- PII scan outputs: raw 文本禁止
- console.log of raw rows: 禁止
- server logs of raw rows: 禁止
```

## 5. API Response Contract (L6-B1)

### Request

```
POST /api/admin/import/course-setting-xlsx/preview
Content-Type: multipart/form-data
Body: file=<.xlsx>, targetSemesterId=<number>, maxPreviewRows?<number>
```

### Response (success)

```ts
{
  success: true,
  parserType: 'courseSettingXlsx',
  previewOnly: true,
  canConfirm: false,
  canApply: false,
  setAsActive: false,
  targetSemesterRequired: true,
  // L6-B1 raw preview metadata
  rawPreview: {
    enabled: true,
    scope: 'authorized-admin-preview-only',
    returnedRows: number,
    maxPreviewRows: number,
    committedArtifactsContainRaw: false,
  },
  artifact, parser, workbookSummary,
  fieldSummary, sourceEvidenceSummary, diagnosticsSummary,
  // L6-B1: previewRows now include raw + parsed + match
  previewRows: Array<{
    sheetIndex, sheetName?, sheetNameHash, sourceRowIndex, rowKind, displayIndex,
    raw: {
      courseName: string | null,
      teacherText: string | null,
      classText: string | null,
      remark: string | null,
      mergeRemark: string | null,
      majorName: string | null,
      weeklyHoursText: string | null,
      examTypeText: string | null,
    },
    parsed: {
      courseNameHash?, teacherRawHash?, classCountRawHash?,
      remarkHash?, mergeRemarkHash?, weeklyHours?, examType?,
      diagnostics: string[],
      classifications: Record<string, string|number|boolean|null>,
    },
    match?: {...},
    // legacy fields retained
    courseNameHash?, gradeMajorHash?, classCountRawHash?, teacherRawHash?,
    remarkHash?, mergeRemarkHash?,
    classCountClassification?, teacherAssignmentClassification?,
    examTypeClassification?, weeklyHoursClassification?,
    weeklyHoursValue?, confidence, warningCodes,
    needsManualReview, manualReviewReasons,
  }>,
  manualReviewSummary,
  targetSemester, dryRunSummary, matchSummary,
  requireExplicitSemesterForImport, targetSemesterRequired: true,
}
```

### Error Response (preserved)

所有 error response 仍包含 `previewOnly=true`, `canConfirm=false`, `canApply=false`。

## 6. UI Table Columns

L6-B1 表格列：

| # | Sheet | 行号 | 课程名 | 教师 | 班级 | 周课时 | 考试类型 | 备注 | 合班备注 | Conf | 审核 |
|---|---|---|---|---|---|---|---|---|---|---|---|

**L6-B1 提示**：

> 下方表格显示 Excel 原文，仅供有权限的管理员进行导入核对；这些内容不会写入审计文档或提交到代码仓库。

## 7. Target Semester Behavior Retained

- 学期选择器仍存在
- 未选择目标学期不能解析
- 解耦提示：`该选择只决定本次 Excel 课程设置导入的目标学期，不会自动切换系统当前学期`
- 新建学期：仍标记下一阶段 L6-C

## 8. Preview-Only Guard

- `previewOnly: true` (literal)
- `canConfirm: false` (literal)
- `canApply: false` (literal)
- `setAsActive: false` (literal)
- UI 无任何确认/应用/写入 DB / 创建教学任务 / 创建 ImportBatch / 切换当前学期按钮
- `.docx` 仍被拒绝

## 9. DB No-Write Proof

`loadCourseSettingExistingDataForSemester` 与 `loadSemesterSummary` 仅使用 read-only methods：

- `prisma.X.findMany` / `findUnique` / `findFirst` / `count`

无 `create` / `update` / `upsert` / `delete` / `$executeRaw` / `$transaction`。

## 10. No Active Semester Switch Proof

- API 永不调用 `POST /api/semesters/[id]/activate`
- response 中 `setAsActive: false` literal
- UI 明确"不会自动切换系统当前学期"

## 11. Privacy / Logging Proof

代码层面已避免：

```ts
// 禁止的日志形式（不应在源码中出现）：
console.log(rawRow)
console.error(rawValue)
console.log(parsedRows) // 不打印 raw rows
```

允许的日志形式（如需）：

```ts
console.log({ rowCount, hash, code }) // 只记 count/hash/code
```

## 12. Old Word Import Isolation

- 旧 Word import route (`/api/admin/import/parse`) 未修改
- 旧 Word import UI (`openUploadDialog`) 未修改
- Excel preview 在 `/admin/import` 独立区块

## 13. Stage-Aware Verify Changes

### Modified Files

| 文件 | 变更 |
|---|---|
| `scripts/verify-xlsx-course-setting-preview-l3.ts` | N20 现在接受 `includeRawValues=true` 用于 runtime preview（不再因 prisma import 失败） |
| `scripts/verify-xlsx-course-setting-target-semester-and-full-review-l6-0.ts` | N32 等仍检查 committed artifacts 不含 raw（保留） |

### No Blanket Pass

- 保留 committed docs/json no raw 检查
- 保留 no DB write 检查
- 保留 no schema/migration 检查
- 保留 no xlsx/dev.db/backup/temp/uploads tracked 检查
- 保留 old Word import isolation

## 14. 验证结果

- ✅ L6-B1 verify: 82/82 PASS
- ✅ L6-B verify: 69/69 PASS
- ✅ L6-A audit: PASS
- ✅ L6-0 verify: 76/76 PASS
- ✅ L5 verify: PASS
- ✅ L4 verify: PASS
- ✅ L3 verify: PASS
- ✅ L2 parser verify: PASS
- ✅ L1 audit: PASS
- ✅ K39-B1/B1A/C2/C4: PASS
- ✅ K22-C: 73/0/0/0 PASS
- ✅ scan:docs-pii: 0 blocking
- ✅ build: PASS
- ✅ tsc: PASS
- ✅ targeted eslint: 0 errors
- ✅ git diff --check: clean
- ✅ forbidden files check: clean

## 15. 浏览器人工验收 Checklist

L6-B1 涉及 UI，必须浏览器人工验收后才能正式关闭（27 项），详见 docs JSON 的 browserValidation.checklist。

**当前状态**：`code complete; browser manual validation pending; not READY_FOR_REAL_USE yet.`

## 16. 下一阶段建议

- **L6-C**：Create New Semester From Import Flow
  - 在导入 UI 增加"新建学期"表单
  - 复用现有 `POST /api/semesters`
  - 仍不切换 active semester
  - 仍不导入 TeachingTask

- **L6-D**：Approval Package With Target Semester
  - review package 输出包含 targetSemesterId
  - 所有 decisions pending
  - 不 apply

---

*Stage: L6-B1 | Version: 1.0.0 | Generated: 2026-06-20*