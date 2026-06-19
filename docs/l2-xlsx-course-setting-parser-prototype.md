# L2-XLSX-COURSE-SETTING-PARSER-PROTOTYPE

> **阶段**：L2 — Course-Setting xlsx parser prototype (no DB, no API, no UI)
> **状态**：PASS (30/30)
> **生成时间**：2026-06-19T15:02:57.303Z
> **Parser 文件**：src/lib/import/course-setting-xlsx-parser.ts
> **Parser 版本**：l2-parser-v1

## 1. 阶段名称
L2-XLSX-COURSE-SETTING-PARSER-PROTOTYPE

## 2. 输入样本路径
D:/Desktop/Course Development System/2025年秋季学期课程设置(总）.xlsx (NOT in git, size 131200 bytes, name-hash d5c590e19e3f, path-hash 34ae69f10ac7)

## 3. Parser 文件
src/lib/import/course-setting-xlsx-parser.ts

## 4. Parser contract
- exports: parseCourseSettingXlsx, parseCourseSettingXlsxFile
- input: `Buffer | Uint8Array` (file wrapper is `parseCourseSettingXlsxFile`)
- output: `CourseSettingXlsxParseResult` (sheets, rows, diagnostics, source evidence)
- bufferInputSupported: true
- deterministic: true (same Buffer → identical JSON.stringify result)
- includeRawValuesDefault: false (sensitive strings only emitted when caller opts in)
- no Prisma / no DB writes / no API / no UI / no schema changes

## 5. Merged cell 处理策略
- `getMergedCellCount(ws)`: count all merged cells per sheet (returned in `sheet.mergedCellCount`).
- `findMasterValue(ws, cell)`: resolve a merged cell to its master value via `cell.master`.
- `masterSpansMultipleRows(ws, cell)`: detect A/B column merges that span > 1 row (triggers INHERITED_GRADE_MAJOR / INHERITED_CLASS_COUNT diagnostics).
- Every read of A/B/C/D/E/F/G/H uses `findMasterValue` or `readCellTextAt` (which delegates to `findMasterValue` for merged cells).
- MERGED_CELL_EXPANDED diagnostic emitted once per sheet when `mergedCellCount > 0`.

## 6. Header detection 策略
- `detectHeaderRow(sheet)`: scan first 5 rows; on each row, count how many of the 8 keywords are present (`年级专业`, `班级人数`, `人才培养方案课程名称` or `课程名称`, `考试考查`, `周学时`, `任课教师`, `备注`, `合班说明`).
- First row with `countHeaderKeywords(values) >= 6` becomes `headerRowIndex`.
- For each cell in the header row, build a `columnMap` (8 keys).
- If no row matches, emits `SHEET_HEADER_MISSING` (severity=error) diagnostic.

## 7. Row classification 策略
6 mutually exclusive `rowKind` values:
- `title`: rows 1..(headerRowIndex-1) when header is detected, else rows 1..5
- `header`: the row that matches the header keyword scan
- `blank`: all 8 mapped columns empty
- `subtotal`: courseName (C) is blank but A or B has content (subtotal/小计/合计 rows)
- `malformed`: courseName (C) is blank AND both A and B are blank (structural anomaly)
- `course`: courseName (C) is present

## 8. Class count parsing 策略
Patterns: multiBan, multiSpaces, single, countOnly, blank, other.
Aggregate counts: {"multiBan":127,"multiSpaces":453,"single":277,"other":134,"countOnly":124,"blank":1}.
- `multiBan`: contains `\n` + 班 marker (e.g. "1班47\n2班37")
- `multiSpaces`: 4+ spaces + 班 marker (e.g. "1班31人      2班27人")
- `single`: contains 班 marker only (e.g. "1班6人")
- `countOnly`: pure digits/CN-num/punct (e.g. "22人")
- `blank`: empty
- `other`: anything else (downgraded to `confidence: 0.3` + warning)

## 9. Teacher assignment parsing 策略
Patterns: single, numbered, bankSplit, blank, other.
Aggregate counts: {"blank":86,"numbered":71,"other":62,"single":876,"bankSplit":21}.
- `single`: 2-4 Chinese characters only (e.g. "王卫东")
- `numbered`: digit pattern with section indices (e.g. "1.2杨秀芳，3.4王芳")
- `bankSplit`: contains delimiter + 班 marker (e.g. "1、2班牛生光；3、4班王彩凤")
- `blank`: empty
- `other`: anything else

## 10. Exam type / Weekly hours 策略
Exam type aggregate: {"expected":945,"blank":29,"other":142}
- '试' / '查' → classification=expected, confidence=1.0; other → classification=other, confidence=0.3 (with EXAM_TYPE_OTHER warning).
Weekly hours aggregate: {"numeric":1057,"halfStep":34,"blank":6,"nonNumeric":19}
- numeric: `^\d+$` → value=parseInt, classification=numeric
- halfStep: `^\d+\.5$` → value=parseFloat, classification=halfStep
- blank: empty → classification=blank
- nonNumeric: anything else → classification=nonNumeric, with WEEKLY_HOURS_NON_NUMERIC warning

## 11. Source Evidence Draft
Each course row carries a `sourceEvidence` object with up to 9 fields (all hash-prefixed except `sourceArtifactFilename` which is the basename and `sourceRowIndex` which is the 1-based xlsx row):
- `sourceArtifactFilename` (basename; undefined if not provided in options)
- `sourceSheetNameHash` (sha256 prefix 12 of worksheet name)
- `sourceRowIndex` (1-based xlsx row number)
- `sourceMajorNameHash` (sha256 prefix 12 of A column text)
- `sourceClassCountRawHash` (sha256 prefix 12 of B column text)
- `sourceCourseNameHash` (sha256 prefix 12 of C column text)
- `sourceTeacherRawHash` (sha256 prefix 12 of F column text)
- `sourceRemarkHash` (sha256 prefix 12 of G column text)
- `sourceMergeRemarkHash` (sha256 prefix 12 of H column text)
Source evidence is NOT written to DB by this stage. L3 / L4 will decide how to forward-fill.

## 12. 脱敏 aggregate parse 结果
```json
{
  "stage": "L2-XLSX-COURSE-SETTING-PARSER-PROTOTYPE",
  "status": "PASS",
  "workbookSummary": {
    "sheetCount": 9,
    "parsedSheetCount": 9,
    "totalRows": 1854,
    "totalCourseRows": 1116,
    "totalWarnings": 142
  },
  "rowClassification": {
    "title": 9,
    "header": 9,
    "course": 1116,
    "subtotal": 695,
    "blank": 25,
    "malformed": 0
  },
  "fieldCoverage": {
    "gradeMajor": 1116,
    "classCount": 1116,
    "courseName": 1116,
    "examType": 1116,
    "weeklyHours": 1116,
    "teacherAssignment": 1116,
    "remark": 1116,
    "mergeRemark": 1116
  },
  "classCountParsing": {
    "multiBan": 127,
    "multiSpaces": 453,
    "single": 277,
    "other": 134,
    "countOnly": 124,
    "blank": 1
  },
  "teacherAssignmentParsing": {
    "blank": 86,
    "numbered": 71,
    "other": 62,
    "single": 876,
    "bankSplit": 21
  },
  "examTypeParsing": {
    "expected": 945,
    "blank": 29,
    "other": 142
  },
  "weeklyHoursParsing": {
    "numeric": 1057,
    "halfStep": 34,
    "blank": 6,
    "nonNumeric": 19
  },
  "remarkParsing": {
    "blank": 980,
    "other": 130,
    "classSpecific": 6
  },
  "mergeRemarkParsing": {
    "blank": 1011,
    "classSpecific": 13,
    "ambiguous": 62,
    "合班授课": 30
  },
  "sourceEvidenceCoverage": {
    "courseRowsWithDraft": 1116,
    "fieldCounts": {
      "sourceSheetNameHash": 1116,
      "sourceRowIndex": 1116,
      "sourceMajorNameHash": 1116,
      "sourceClassCountRawHash": 1116,
      "sourceCourseNameHash": 1116,
      "sourceTeacherRawHash": 1116,
      "sourceRemarkHash": 1116,
      "sourceMergeRemarkHash": 1116
    }
  },
  "confidence": {
    "avgCourseRow": 0.953,
    "minCourseRow": 0.65,
    "maxCourseRow": 1
  }
}
```

## 13. Diagnostics summary
```json
{
  "byCode": {
    "MERGED_CELL_EXPANDED": 9,
    "INHERITED_GRADE_MAJOR": 127,
    "INHERITED_CLASS_COUNT": 127
  }
}
```
Per-sheet MERGED_CELL_EXPANDED distribution: [1/1/1/1/1/1/1/1/1]

## 14. 与旧 Word parser 的隔离确认
- old Word parser not modified: parse_schedule.py mtime=1781229170344 < parser mtime=1781881337341
- parse_schedule.py HEAD: 17366e214e25 (unchanged)
- import API not changed: git status src/app/api/ clean
- confirm/rollback not changed: included in API check
- UI not changed: git status src/components/ clean
- schema/migration not changed: git status prisma/ clean
- scheduler/score not changed: not touched by this stage
- K22 expected not changed: not touched by this stage

## 15. 不写 DB / 不接 UI / 不改 confirm 的确认
- parser is pure function: Buffer → result
- no Prisma client import (regex scan of parser source: 0 matches)
- no filesystem writes from the parser
- no API route touched (git status src/app/api/ clean)
- no UI component touched (git status src/components/ clean)
- no ImportBatch / TeachingTask / TeachingTaskClass / ClassGroup / Teacher / Course / ScheduleSlot writes

## 16. 验证结果
- N1 ✅ sample file exists — size=131200
- N2 ✅ sample file not git-tracked — name-hash d5c590e19e3f
- N3 ✅ parser file exists — D:\Desktop\Course Development System\my-app\src\lib\import\course-setting-xlsx-parser.ts
- N4 ✅ parser exports parseCourseSettingXlsx — export found
- N5 ✅ workbook readable (parser ran) — parserVersion=l2-parser-v1
- N6 ✅ sheet count = 9 — actual=9
- N7 ✅ parsed sheets > 0 — parsedSheetCount=9
- N8 ✅ total course rows > 1000 — totalCourseRows=1116
- N9 ✅ expected column detection coverage = 8 per parsed sheet — all sheets have all 8 keys
- N10 ✅ merged cell expansion executed — min merged cells per sheet=122
- N11 ✅ gradeMajor inheritance detected — INHERITED_GRADE_MAJOR diagnostic present
- N12 ✅ classCount inheritance detected — INHERITED_CLASS_COUNT diagnostic present
- N13 ✅ row classification is mutually exclusive — all rowKind values in enum
- N14 ✅ class count parser returns primaryClassification + warnings — all course rows have valid primaryClassification + warnings[]
- N15 ✅ teacher parser returns primaryClassification + warnings — all course rows have valid primaryClassification + warnings[]
- N16 ✅ exam type parser handles expected/blank/other — expected=945 blank=29 other=142
- N17 ✅ weekly hours parser handles numeric/halfStep/blank/nonNumeric — numeric=1057 halfStep=34 blank=6 nonNumeric=19
- N18 ✅ sourceEvidence draft generated for course rows — all 1116 course rows have sourceSheetNameHash+sourceRowIndex
- N19 ✅ committed JSON contains no raw teacher names — only public enum values (试/查) appear in normalized fields
- N20 ✅ committed JSON contains no raw class names — no "X班Y" patterns
- N21 ✅ committed JSON contains no raw course names — no raw course names (only 试/查 allowed)
- N22 ✅ committed JSON contains no raw remarks — all valueShape values are abstract signatures
- N23 ✅ old Word parser untouched — parse_schedule.py mtime=1781229170344, parser mtime=1781881337341, head=17366e214e25
- N24 ✅ no schema/migration changes — prisma/ clean
- N25 ✅ no API/POST/PATCH changes — src/app/api/ clean
- N26 ✅ no UI changes — src/components/ clean
- N27 ✅ parser contains no DB writes (no prisma / db-module import) — clean
- N28 ✅ parser output can be produced from Buffer input — same workbook shape: sheetCount=9 totalCourseRows=1116
- N29 ✅ parser output is deterministic on same input — JSON.stringify(r1) === JSON.stringify(r2)
- N30 ✅ recommendation is L3 preview-only, not DB apply — will be embedded in MD: "Recommended next stage: L3 preview-only API/UI integration"

## 17. 下一阶段建议
Recommended next stage: L3 preview-only API/UI integration
- parser-type-aware preview route
- preview-only, no DB apply
- keep old Word parser legacy
- do not replace existing import API
