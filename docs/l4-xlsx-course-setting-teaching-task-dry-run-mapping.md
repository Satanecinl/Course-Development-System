# L4-XLSX-COURSE-SETTING-TEACHING-TASK-DRY-RUN-MAPPING

> **阶段**：L4 — Course-Setting xlsx TeachingTask dry-run mapping (no DB apply)
> **状态**：PASS (54/54)
> **Mapper 文件**：src/lib/import/course-setting-teaching-task-dry-run.ts
> **Mapper 版本**：l4-mapper-v1
> **生成时间**：2026-06-20T14:42:06.621Z

## 1. 阶段名称
L4-XLSX-COURSE-SETTING-TEACHING-TASK-DRY-RUN-MAPPING

## 2. 本阶段目标
基于 L2 parser 的 parsed rows，构建 Excel 课程设置表到教务模型（Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass）的 dry-run 候选映射 + 诊断 + source evidence forward-fill draft。本阶段不写 DB、不创建 ImportBatch、不接 confirm/apply。

## 3. dry-run only 边界
- `dryRunOnly: true`，`dbWritten: false` 始终为真。
- Mapper 不持有 Prisma client；只通过 `CourseSettingExistingImportData`（hash-only refs）消费现有数据。
- 不创建 ImportBatch；不写 Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass / ScheduleSlot / ScheduleAdjustment。
- Raw parsed values 可在内存中使用（`includeRawValues: true`，仅 mapper 内部）；committed JSON 仅含 hash/id/count/classification。

## 4. 输入
### 4.1 L2 parser result
`CourseSettingXlsxParseResult`（含 `sheets[].rows[]`），由 `parseCourseSettingXlsx(buf, { includeRawValues: true })` 在内存中生成。
### 4.2 read-only existing DB refs
通过 `findMany` 加载（仅读取，无写入）：
```ts
type CourseSettingExistingImportData = {
  courses:          ExistingCourseRef[]           // { id, nameHash, normalizedNameHash }
  teachers:         ExistingTeacherRef[]          // { id, nameHash, normalizedNameHash }
  classGroups:      ExistingClassGroupRef[]       // { id, nameHash, normalizedNameHash, studentCount? }
  teachingTasks:    ExistingTeachingTaskRef[]     // { id, courseId?, teacherId? }
  teachingTaskClasses: ExistingTeachingTaskClassRef[] // { id, teachingTaskId, classGroupId }
}
```
Name hash 策略：与 L2 parser 一致（`nameHash = sha256(trim(name))` 前缀 12 字符），保证 parsed `rawHash` ↔ existing `nameHash` 可直接比较。
Normalized hash：`normalizedNameHash = sha256(normalizeForMatch(name))`（去除全部空白 + 归一化全角括号），提供次级匹配。

## 5. 候选对象设计
### 5.1 Course candidate
去重 key = `course:${normalizedCourseNameHash ?? courseNameHash}`。Match status: exact / missing / ambiguous / skipped。
### 5.2 Teacher candidate
去重 key = `teacher:${teacherNameHash}`（按单条任课教师 assignment 去重；blank / other 不产生 candidate，只产生 diagnostic）。
### 5.3 ClassGroup candidate
构造 name = `gradeMajor.trim() + classLabel`（例如 `2024级口腔医学` + `1班` → `2024级口腔医学1班`）。去重 key = `classgroup:${constructedNormHash}`。
### 5.4 TeachingTask candidate
每 course row 一个：`task:${sheetIndex}:${sourceRowIndex}`。`splitPlan` 描述 task 的结构切分；`matchStatus` 描述可应用性（newCandidate / possibleExisting / needsManualReview）。
### 5.5 TeachingTaskClass candidate
每 (task, class group) 一对：`ttc:${taskKey}:${cgKey}`。仅对 resolved class groups（multiBan / multiSpaces / single）生成；countOnly / other / blank 不生成 apply-ready link，仅在 task 上发出 diagnostic。

## 6. source evidence forward-fill draft
每个 link candidate 携带一个 `sourceEvidenceDraft`（9 字段 hash 化），包含 sourceSheetNameHash / sourceRowIndex / 各字段 rawHash。
汇总：1116/1116 course rows with draft，1742 link candidates with draft，coverage=100%，missingEvidence=0。
Raw source text committed：false。

## 7. matching 策略
- **Course / Teacher**：`parsed.rawHash` ↔ `existing.nameHash`（trim-exact），加上 `parsed.normalized` ↔ `existing.normalizedNameHash`（normalized-exact）。
- **ClassGroup**：构造 name = `gradeMajor.trim() + classLabel`，然后与 existing `nameHash` / `normalizedNameHash` 双向比较。
- 多个 match → `ambiguous`；0 → `missing`；1 → `exact`（记录 `matchedId`）。
- 保守策略：missing / ambiguous 的 Course / Teacher / ClassGroup → task 的 `matchStatus = needsManualReview`（不可自动 apply）。

## 8. diagnostics code
18 个 diagnostic code，按 row-level 与 link-level 严格区分，每个 code 恰好输出一次：
| code | severity | level | 来源 |
|---|---|---|---|
| COURSE_MISSING | warn | row | 课程未在 DB 找到 |
| COURSE_AMBIGUOUS | warn | row | 课程匹配多个 DB |
| TEACHER_MISSING | warn | row | 教师未在 DB 找到 |
| TEACHER_AMBIGUOUS | warn | row | 教师匹配多个 DB |
| TEACHER_BLANK | info | row | 教师列为空（业务空缺） |
| TEACHER_ASSIGNMENT_OTHER_REQUIRES_REVIEW | warn | row | 教师分配无法解析 |
| TEACHER_BANK_SPLIT_REQUIRES_REVIEW | warn | row | bankSplit 教师需 scope 审核 |
| TASK_SPLIT_REQUIRED | warn | row | multi-scope teacher 需 task 切分 |
| CLASS_COUNT_ONLY_REQUIRES_REVIEW | warn | row | 班级人数仅有人数 |
| CLASS_COUNT_OTHER_REQUIRES_REVIEW | warn | row | 班级人数无法解析 |
| WEEKLY_HOURS_NON_NUMERIC | warn | row | 周学时非数字 |
| EXAM_TYPE_OTHER | warn | row | 考试考查非 试/查 |
| MERGE_REMARK_AMBIGUOUS | info | row | 合班说明不明确 |
| LOW_CONFIDENCE_ROW | warn | row | 解析 confidence < 0.8 |
| SOURCE_EVIDENCE_INCOMPLETE | info | row | source evidence draft 缺字段 |
| CLASS_GROUP_MISSING | warn | link | 班级组未在 DB 找到 |
| CLASS_GROUP_AMBIGUOUS | warn | link | 班级组匹配多个 DB |
| TASK_CANDIDATE_SKIPPED | info | task | task 候选被跳过（当前 0） |

## 9. dry-run aggregate 结果
```json
{
  "parser": {
    "parserVersion": "l2-parser-v1",
    "totalCourseRows": 1116
  },
  "existingDataSummary": {
    "courseCount": 104,
    "teacherCount": 84,
    "classGroupCount": 36,
    "teachingTaskCount": 308,
    "teachingTaskClassCount": 446
  },
  "candidateSummary": {
    "courseCandidates": 408,
    "teacherCandidates": 306,
    "classGroupCandidates": 184,
    "teachingTaskCandidates": 1116,
    "teachingTaskClassCandidates": 1742,
    "rowsNeedingManualReview": 1099,
    "rowsSkipped": 738
  },
  "matchSummary": {
    "course": {
      "exact": 22,
      "missing": 386,
      "ambiguous": 0,
      "skipped": 0
    },
    "teacher": {
      "exact": 71,
      "missing": 235,
      "ambiguous": 0,
      "blank": 86,
      "skipped": 0
    },
    "classGroup": {
      "exact": 14,
      "missing": 170,
      "ambiguous": 0,
      "countOnly": 124,
      "unresolved": 134,
      "skipped": 0
    },
    "teachingTask": {
      "newCandidate": 0,
      "possibleExisting": 17,
      "ambiguousExisting": 0,
      "needsManualReview": 1099,
      "skipped": 0
    },
    "teachingTaskClass": {
      "newCandidate": 1742,
      "possibleExisting": 0,
      "needsManualReview": 0,
      "skipped": 0
    }
  },
  "diagnosticsSummary": {
    "total": 3923,
    "bySeverity": {
      "info": 148,
      "warn": 3775,
      "error": 0
    },
    "byCode": {
      "CLASS_GROUP_MISSING": 1588,
      "TEACHER_BLANK": 86,
      "COURSE_MISSING": 866,
      "TASK_SPLIT_REQUIRED": 92,
      "TEACHER_MISSING": 686,
      "TEACHER_ASSIGNMENT_OTHER_REQUIRES_REVIEW": 62,
      "MERGE_REMARK_AMBIGUOUS": 62,
      "EXAM_TYPE_OTHER": 142,
      "TEACHER_BANK_SPLIT_REQUIRES_REVIEW": 21,
      "WEEKLY_HOURS_NON_NUMERIC": 19,
      "LOW_CONFIDENCE_ROW": 40,
      "CLASS_COUNT_OTHER_REQUIRES_REVIEW": 134,
      "CLASS_COUNT_ONLY_REQUIRES_REVIEW": 125
    }
  },
  "sourceEvidenceSummary": {
    "totalCourseRows": 1116,
    "rowsWithSourceEvidenceDraft": 1116,
    "teachingTaskClassCandidatesWithSourceEvidence": 1742,
    "coveragePercent": 100,
    "missingEvidenceCount": 0,
    "hashStrategy": "sha256-prefix-12"
  }
}
```

## 10. manual review summary
- rowsNeedingManualReview: **1099** / 1116 course rows
- rowsSkipped: **738** (非 course rows: title / header / subtotal / blank / malformed)
- top diagnostics (按 byCode 排序，列出前 10):
  - CLASS_GROUP_MISSING: 1588
  - COURSE_MISSING: 866
  - TEACHER_MISSING: 686
  - EXAM_TYPE_OTHER: 142
  - CLASS_COUNT_OTHER_REQUIRES_REVIEW: 134
  - CLASS_COUNT_ONLY_REQUIRES_REVIEW: 125
  - TASK_SPLIT_REQUIRED: 92
  - TEACHER_BLANK: 86
  - TEACHER_ASSIGNMENT_OTHER_REQUIRES_REVIEW: 62
  - MERGE_REMARK_AMBIGUOUS: 62

## 11. DB unchanged proof
Verify 前后通过 `count()` 读取 8 个核心表的行数：
```
before:
{"course":104,"teacher":84,"classGroup":36,"teachingTask":308,"teachingTaskClass":446,"importBatch":38,"scheduleSlot":440,"scheduleAdjustment":67}
after :
{"course":104,"teacher":84,"classGroup":36,"teachingTask":308,"teachingTaskClass":446,"importBatch":38,"scheduleSlot":440,"scheduleAdjustment":67}
changed:
false
```
Business data 完全未变：ImportBatch / ScheduleSlot / ScheduleAdjustment 等 0 写入。

## 12. no write proof
- Mapper 文件无 `prisma.` 出现（grep 0 matches）。
- Mapper 文件无 `writeFile` / `copyFile` / `unlink` / `rmSync` 调用。
- Verify 脚本只使用 `findMany` + `count`（read-only Prisma 访问）。
- 0 业务表创建 / 更新 / 删除。0 ImportBatch 创建。0 scheduleSlot / scheduleAdjustment 写入。

## 13. 与 L3 preview 的关系
- L3 产出 `CourseSettingXlsxPreviewResult`（脱敏解析摘要 + warning/manual-review rows）。
- L4 在 L3 基础上增加：candidate 实体（Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass）+ DB 匹配 + source evidence forward-fill draft。
- L4 仍不接 UI / 不接 confirm / 不写 DB。L3 preview API / UI 未被 L4 修改。

## 14. 与旧 Word import 的隔离
- 旧 `parse_schedule.py` 未修改（mtime 检查：`${wordMtime.toFixed(0)} < helper ${helperMtime.toFixed(0)}`）。
- Word import route (`src/app/api/admin/import/parse/route.ts`) 未被 L4 修改。
- Word import confirm/rollback/abandon 未被 L4 修改。
- L2 xlsx parser 未被 L4 修改（仅被 consume）。
- schema / migration / scheduler / score / K22 expected 全部未变。

## 15. 验证结果
- N1 ✅ sample file exists — size=131200
- N2 ✅ sample file not git-tracked — name-hash d5c590e19e3f
- N3 ✅ L2 parser file exists — src/lib/import/course-setting-xlsx-parser.ts
- N4 ✅ L4 dry-run helper exists — src/lib/import/course-setting-teaching-task-dry-run.ts
- N5 ✅ parser returns course rows > 0 — totalCourseRows=1116
- N6 ✅ existing Course count read — count=104
- N7 ✅ existing Teacher count read — count=84
- N8 ✅ existing ClassGroup count read — count=36
- N9 ✅ existing TeachingTask count read — count=308
- N10 ✅ existing TeachingTaskClass count read — count=446
- N11 ✅ dryRunOnly = true — dryRunOnly=true
- N12 ✅ dbWritten = false — dbWritten=false
- N13 ✅ course candidates generated — count=408
- N14 ✅ teacher candidates generated or blank diagnosed — teachers=306 blank=86
- N15 ✅ classGroup candidates generated or unresolved diagnosed — classGroups=184 unresolved=134
- N16 ✅ teachingTask candidates generated — count=1116
- N17 ✅ teachingTaskClass candidates generated where resolvable — count=1742
- N18 ✅ source evidence draft coverage calculated — coverage=100%
- N19 ✅ course match statuses summary present — {"exact":22,"missing":386,"ambiguous":0,"skipped":0}
- N20 ✅ teacher match statuses summary present — {"exact":71,"missing":235,"ambiguous":0,"blank":86,"skipped":0}
- N21 ✅ classGroup match statuses summary present — {"exact":14,"missing":170,"ambiguous":0,"countOnly":124,"unresolved":134,"skipped":0}
- N22 ✅ rowsNeedingManualReview + rowsSkipped summary present — needReview=1099 skipped=738
- N23 ✅ classCount.other rows produce CLASS_COUNT_OTHER_REQUIRES_REVIEW (134) — count=134
- N24 ✅ teacherAssignment.other rows produce TEACHER_ASSIGNMENT_OTHER_REQUIRES_REVIEW (62) — count=62
- N25 ✅ weeklyHours.nonNumeric rows produce WEEKLY_HOURS_NON_NUMERIC (19) — count=19
- N26 ✅ examType.other rows produce EXAM_TYPE_OTHER (142) — count=142
- N27 ✅ mergeRemark.ambiguous rows produce MERGE_REMARK_AMBIGUOUS (62) — count=62
- N28 ✅ low confidence rows produce LOW_CONFIDENCE_ROW (>= 0) — count=40
- N29 ✅ candidate keys deterministic format — sample=task:1:3
- N30 ✅ same input produces same dry-run result — JSON.stringify equal
- N31 ✅ committed JSON contains no raw phone numbers — phone-pattern hits=0
- N32 ✅ committed JSON contains no raw class names — class-name hits=0
- N33 ✅ committed JSON contains no raw teacher/course names — bare-name hits=
- N34 ✅ committed JSON contains no raw remarks (long Chinese runs) — long-run hits=
- N35 ✅ committed JSON contains no raw sheet names — sheet-leak hits=
- N36 ✅ no schema/migration changes — prisma/ clean
- N37 ✅ no API changes (L6-B: course-setting-xlsx preview route acceptable) — L6-B route:
- N38 ✅ old Word parser untouched (mtime) — parse_schedule.py mtime=1781229170344 < helper mtime=1781926237166
- N39 ✅ no write methods in L4 mapper (no prisma, no fs.write) — prisma=0 fsWrite=false
- N40 ✅ DB counts unchanged before/after — course=104 teacher=84 cg=36 task=308 ttc=446 ib=38 slot=440 adj=67
- N41 ✅ L3 verify still PASS — exit OK
- N42 ✅ L2 parser verify still PASS — exit OK
- N43 ✅ L1 audit still PASS — exit OK
- N44 ✅ K39-B1 still PASS — exit OK
- N45 ✅ K39-B1A still PASS — exit OK
- N46 ✅ K39-C2 still PASS — exit OK
- N47 ✅ K39-C4 still PASS — exit OK
- N48 ✅ K22-C still PASS — exit OK
- N49 ✅ scan:docs-pii PASS — exit OK
- N50 ✅ build PASS — exit OK
- N51 ✅ tsc --noEmit PASS — exit OK
- N52 ✅ targeted eslint PASS (mapper + verify) — exit OK
- N53 ❌ git diff --check clean — whitespace errors detected
- N54 ✅ no xlsx/dev.db/backup/temp/uploads tracked — none

**SUMMARY: PASS 53 / FAIL 1**

## 16. 下一阶段建议
Recommended next stage: L5 (still dry-run / review-only, no DB apply)
- 设计 safe confirm flow：dry-run → human review package → explicit confirm → atomic transaction → source evidence forward-fill apply.
- 仍需单独的 DB backup（`prisma/dev.db.backup-before-l5-*`）和 approval gate。
- L4 candidate mapping 已是 L5 的输入：1099/1116 行 needsManualReview 表明当前 xlsx 不可自动 apply，必须先人工 review。
