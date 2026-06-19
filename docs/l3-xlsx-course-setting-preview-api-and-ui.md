# L3-XLSX-COURSE-SETTING-PREVIEW-API-AND-UI

> 阶段：L3
> 状态：PASS (code complete)
> 浏览器人工验收：PENDING

## 1. 阶段名称
L3-XLSX-COURSE-SETTING-PREVIEW-API-AND-UI

## 2. 本阶段目标
实现 Excel 课程设置导入的 preview-only 接入。管理员可上传 .xlsx 课程设置文件，查看脱敏解析摘要和手动审核标记，不写入数据库。

## 3. API route
POST /api/admin/import/course-setting-xlsx/preview
- 权限: import:manage
- Request: multipart/form-data, file: .xlsx
- Response: previewOnly: true, canConfirm: false, canApply: false
- DB writes: 无
- ImportBatch: 不创建

## 4. Request / response contract

### Request
```
POST /api/admin/import/course-setting-xlsx/preview
Content-Type: multipart/form-data
Authorization: Bearer <token>  (requires import:manage)

file: <.xlsx file, max 20MB>
```

### Success Response (200)
```json
{
  "success": true,
  "parserType": "courseSettingXlsx",
  "previewOnly": true,
  "canConfirm": false,
  "canApply": false,
  "artifact": { "filename": "...", "sha256": "...", "sizeBytes": 12345 },
  "parser": { "parserVersion": "l2-parser-v1", "durationMs": 1234 },
  "workbookSummary": { "sheetCount": 9, "parsedSheetCount": 9, "totalRows": 1854, "totalCourseRows": 1116, "totalWarnings": 0 },
  "fieldSummary": { "classCount": {...}, "teacherAssignment": {...}, ... },
  "sourceEvidenceSummary": { "draftRows": 1854, "coveragePercent": 100, "hashStrategy": "sha256-prefix-12" },
  "diagnosticsSummary": { "total": 0, "bySeverity": {...}, "byCode": {...} },
  "previewRows": [ { "sheetIndex": 1, "sheetNameHash": "...", "sourceRowIndex": 6, "rowKind": "course", ... } ],
  "manualReviewSummary": { "totalRowsNeedingReview": 215, "reasons": { "classCount.other": 134, ... } }
}
```

### Error Response (400/500)
```json
{ "success": false, "error": "...", "message": "...", "previewOnly": true }
```

## 5. Preview-only guard
- API 不写 DB (no prisma import, no prisma. calls)
- API 不创建 ImportBatch
- API 不写 TeachingTask/ClassGroup/Teacher/Course/ScheduleSlot
- UI 不显示 confirm/apply 按钮
- UI 明确显示 preview-only 警告 (Preview Only badge + amber warning banner)

## 6. UI 区块说明
- 位置: /admin/import 页面，batch list 之后
- 上传: 仅 .xlsx，不支持 .docx
- 解析: 调用 L2 parser，约 10-15 秒
- 展示: workbook summary cards + source evidence 覆盖率 + 手动审核摘要 + field summaries + preview rows table

## 7. Manual review 展示策略
- 高亮: classCount.other / teacherAssignment.other / weeklyHours.nonNumeric / examType.other / confidence < 0.8
- 展示: Badge (amber) / row background (amber-50/50) / expandable detail

## 8. Privacy/redaction 策略
- API response: 仅返回 hash / classification / counts
- 不返回: 真实教师名、班级名、课程名、备注原文
- UI 显示: hash + 分类 + warning codes

## 9. 与旧 Word import 的隔离关系
- 独立 route，不修改旧 parse route
- 独立 UI section，不修改旧 upload dialog
- 独立 client helper，不修改旧 client.ts

## 10. No DB write 证明
- 无 prisma import (route + helper)
- 无 importBatch.create
- 无 teachingTask.create
- 无 course.create / teacher.create / classGroup.create
- 无 scheduleSlot.create / scheduleAdjustment.create
- 无 fs.writeFile / fs.copyFile

## 11. 验证结果

✅ N1: Route file exists -- src/app/api/admin/import/course-setting-xlsx/preview/route.ts
✅ N2: Route exports POST handler
✅ N3: Route uses requirePermission(import:manage)
✅ N4: Route contains no prisma. write calls -- prisma. count: 0
✅ N5: Route does not create ImportBatch
✅ N6: Route does not write TeachingTask
✅ N7: Route does not write TeachingTaskClass
✅ N8: Route does not write Course
✅ N9: Route does not write Teacher
✅ N10: Route does not write ClassGroup
✅ N11: Route does not write ScheduleSlot
✅ N12: Route does not write ScheduleAdjustment
✅ N13: Route accepts .xlsx only
✅ N14: Route rejects .docx
✅ N15: Response includes previewOnly: true
✅ N16: Response includes canConfirm: false
✅ N17: Response includes canApply: false
✅ N18: Response includes parserType: 'courseSettingXlsx'
✅ N19: Helper file exists -- src/lib/import/course-setting-xlsx-preview.ts
✅ N20: Helper contains no prisma import -- prisma count: 0
✅ N21: Helper contains no fs.write calls
✅ N22: Helper calls parseCourseSettingXlsx
✅ N23: UI component exists -- src/components/import/course-setting-xlsx-preview.tsx
✅ N24: UI component is 'use client'
✅ N25: UI contains Excel 课程设置识别预览 text
✅ N26: UI contains preview-only warning
✅ N27: UI does not expose confirm/apply/write buttons -- confirm=false apply=false write=false
✅ N28: UI displays manual review summary
✅ N29: UI displays warning indicators
✅ N30: Client helper exists -- src/lib/import/course-setting-xlsx-client.ts
✅ N31: Client helper calls preview API
✅ N32: Old Word parser unchanged -- git status: clean
✅ N33: Existing Word import route unchanged -- git status: clean
✅ N34: No schema/migration changes -- git status: clean
✅ N36: No xlsx/dev.db/backup/temp/uploads tracked -- found: none (2 known pre-existing excluded)
✅ N37: L2 parser verify still PASS -- exit OK
✅ N38: L1 audit still PASS -- exit OK
✅ N39: K39 import rules still PASS -- exit OK
✅ N35: No K22 expected drift -- git status: clean
✅ N40: Build passes -- exit OK

**SUMMARY: PASS 40 / FAIL 0**

## 12. 剩余风险
- preview 仍不写 DB
- confirm/apply 未实现
- 134 classCount.other 仍需人工审核
- 62 teacherAssignment.other 仍需人工审核
- 19 weeklyHours.nonNumeric 仍需人工审核
- parse 性能约 14s
- source evidence 仍是 draft
- Word import 仍 legacy
- 浏览器人工验收 pending

## 13. 下一阶段建议
Recommended next stage: L4-XLSX-COURSE-SETTING-DB-APPLY
- 实现 dry-run + confirm flow
- 将 parsed rows 映射到 Course/Teacher/ClassGroup/TeachingTask/TeachingTaskClass
- 仍需 DB backup
- 仍需 source evidence forward-fill
