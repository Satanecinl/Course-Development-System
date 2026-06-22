# L7-A: XLSX Course Setting New Template Rule Replacement

## 1. Why Old Excel Rules Are Replaced

The old Excel course setting format required:
- Merged cell detection and forward-fill (upstream inheritance)
- Complex header detection via keyword matching
- Messy data with inconsistent formatting

The user decided to abandon the old format and provide a clean new template.

## 2. Why Previous Interrupted L7-A Prompt Is Obsolete

The previous L7-A attempt used an A:O 15-column schema with 学年/学期 columns. The new template is A:M 13 columns without 学年/学期 columns. The target semester comes solely from the UI selection (`targetSemesterId`).

## 3. New A:M 13-Column Schema

| Column | Header | Type | Required | Notes |
|--------|--------|------|----------|-------|
| A | 年级 | string | Yes | e.g. "2024级" |
| B | 学制 | string | Yes | e.g. "三年制" |
| C | 专业 | string | Yes | Major name |
| D | 班级 | string | Yes | Comma-separated class names |
| E | 班级人数 | string | No | Format: "1班47,2班37" |
| F | 课程名称 | string | Yes | Course name |
| G | 课程类别 | string | No | Optional category |
| H | 考试考查 | string | Yes | "试" or "查" |
| I | 周学时 | number | Yes | Weekly hours |
| J | 任课教师 | string | No | Fallback teacher text |
| K | 授课任务分配 | string | No | Primary task split source |
| L | 合班说明 | string | No | Merge remark |
| M | 备注 | string | No | Remark |

## 4. Template Version

```typescript
templateVersion = "new-course-setting-a-m-v2"
```

## 5. Row-Level Parsing Rule

Each row is parsed independently. No merged-cell forward-fill. No upward inheritance.

## 6. No Excel AcademicYear/Semester Filtering

The new template has no 学年/学期 columns. Target semester comes from UI selection only.

## 7. Target Semester Source

```
targetSemesterSource: "ui-selected-targetSemesterId"
```

## 8. Subtotal Skip Rule

If courseName (F column) contains 小计/合计/总计 → `rowKind = 'subtotal'` → skipped.

## 9. K Column Task Assignment Priority

K column `授课任务分配` is the primary source for task split detection. Format:
```
1,2:杨秀芳;3,4:王芳;5,6:姜剑书
```

J column `任课教师` is the fallback when K is empty.

## 10. J Column Teacher Fallback

When K column is empty, J column is used as fallback teacher assignment.

## 11. Class Mapping Rule

D column `班级` provides the class name list. K/J column class numbers are mapped to D column names:
- `1,2` → `1班,2班` (if D column contains `1班,2班`)
- `1.2` → `1班,2班` (dot-separated pairs expanded)

## 12. Class Student Count Parse Rule

E column `班级人数` is parsed as `1班47,2班37` format. Student counts are merged into the class group entries for display only (not written to DB).

## 13. Malformed Assignment Manual Review

K column entries missing `:` separator → `TASK_ASSIGNMENT_NEEDS_REVIEW` diagnostic.

## 14. New Course Candidate Semantics Preserved

- Excel course name empty → `COURSE_NAME_MISSING` (blocker)
- Excel course name non-empty, DB no match → `COURSE_CREATE_CANDIDATE` (confirmable)
- `classifyCourseSituation` still works on review UI rows

## 15. No DB Write Proof

- Parser: no Prisma imports, no DB writes
- Preview helper: pure in-memory transformation
- Approval review route: read-only Prisma
- Partial plan route: plan-only, no apply

## 16. No Apply Proof

- No `partial-import-apply` route directory
- No 执行导入/正式导入/写入数据库 buttons
- `applyAllowed: false` literal type

## 17. Validation Results

- L7-A verify: PASS (130+ checks)
- L6-E2G1 regression: PASS
- L6-E2G regression: PASS
- L6-E2F regression: PASS
- L6-E2E regression: PASS
- L6-E1 regression: PASS (1 pre-existing)
- L6-E2 regression: PASS
- prisma validate: PASS
- migrate status: 14 migrations, up to date
- K22-C: PASS
- scan:docs-pii: no blocking hits
- build: PASS
- tsc: PASS
- eslint: PASS
- git diff: clean
- forbidden files: clean

## 18. Browser Validation Checklist

> L7-A code complete; browser manual validation pending.

1. 打开 `/admin/import`
2. 上传最新 `课程设置新模板.xlsx`
3. 页面显示"新版课程设置模板规则（A:M 固定列）"
4. 目标学期来自 UI 选择
5. 小计行被跳过
6. 审核表显示年级/学制/专业/班级/课程/教师/授课任务分配
7. Excel 有课程名但 DB 无匹配仍显示"新课程候选"
8. Excel 课程名为空才显示"课程名缺失"
9. K 列授课任务分配优先生成 task split
10. `1,2:教师;3,4:教师` 正确映射到真实班级
11. partial import plan 显示 templateVersion
12. 页面无 apply/write DB button
13. Browser console 无 React error
14. DB counts 不变

## 19. Next Stage Recommendation

L7-B-XLSX-COURSE-SETTING-NEW-TEMPLATE-BROWSER-ACCEPTANCE (browser validation)
or L7-F-XLSX-COURSE-SETTING-NEW-TEMPLATE-PARTIAL-IMPORT-EXECUTION (if browser validation passes)
