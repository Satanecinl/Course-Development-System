# L1-XLSX-COURSE-SETTING-IMPORT-AUDIT-AND-PARSER-PLAN

> **L1 stage: read-only audit + parser plan for the new Excel 课程设置 (course-setting) import path.**
> 状态：审计完成，**未写 DB，未实现 parser，未改 Word import，未改 schema**。
> 关联：用户希望逐步放弃旧的 Word 课表识别方案，转向 Excel 课程设置识别导入。
> 本阶段仅生成审计脚本、结构化报告、未来 L2/L3/L4/L5 草案。
> 命名规则：本阶段所有 commit、脚本、文档、报告使用 `L1`，后续阶段使用 `L2/L3/...`，**不使用 K40**。

---

## 1. 修改前状态（Pre-Stage State）

- HEAD：`e9e1d364382565355ad5dd800b517ecf48fc8926`
- branch：`master`
- ahead/behind：`0 / 0`
- `git status --short`：空（clean working tree）
- `npx prisma validate`：schema 有效
- `npx prisma migrate status`：13 migrations, database schema up to date
- K22-C baseline：`73 / 0 / 0 / 0 / 0`
- K39-B1 / B1A / C / C1 / C2 / C3 / C4 / C5：全部 CLOSED
- K39-C5：blocked-by-missing-human-approval（192/192 records 仍 pending）

---

## 2. 样本 Excel 结构

样本文件路径（**未提交**，未 git track）：

```
D:\Desktop\Course Development System\2025年秋季学期课程设置(总）.xlsx
```

文件大小 131200 bytes，ExcelJS 加载成功。

| Sheet 名            | 行数 | 列数 | merged cells | 期望列数 detected |
|---------------------|-----:|-----:|-------------:|------------------:|
| 2024级三年制        |  522 |   15 |         1065 |                 8 |
| 2021级五年制        |   74 |   12 |          124 |                 8 |
| 2022级五年制和中职  |   66 |    8 |          132 |                 8 |
| 2023级五年制和中专  |   70 |   11 |          140 |                 8 |
| 2023级三年制        |  282 |    9 |          477 |                 8 |
| 2024级五年制        |   97 |    9 |          167 |                 8 |
| 2025级三年制        |  610 |    9 |          768 |                 8 |
| 2025级五年制、中专  |   61 |    9 |          100 |                 8 |
| 2025级二年制        |   72 |    9 |          107 |                 8 |
| **合计**            | **1854** |   — |   **3080** | — |

**9 个 sheet**，每个 sheet 对应一个年级组（21-25 级，三年/五年/中专职）。第 1 行：标题（merged）。第 2 行：表头。第 3 行起：数据行。A 列和 B 列均存在跨多行 merge，需向下填充。

每个 sheet 的 A/B 列 merge span 范围（min/max/total/count）：

| Sheet | A 列 gradeMajor span | B 列 classCount span |
|-------|----------------------|----------------------|
| 2024级三年制 | min=10 max=24 total=484 count=34 | min=10 max=24 total=485 count=34 |
| 2021级五年制 | min=9  max=25 total=58  count=4  | min=9  max=25 total=58  count=4  |
| 2022级五年制和中职 | min=7  max=17 total=59 count=5 | min=7 max=17 total=59 count=5 |
| 2023级五年制和中专 | min=7  max=17 total=63 count=6 | min=7 max=17 total=63 count=6 |
| 2023级三年制 | min=10 max=22 total=257 count=20 | min=10 max=22 total=257 count=20 |
| 2024级五年制 | min=9 max=23 total=85 count=8 | min=9 max=23 total=85 count=8 |
| 2025级三年制 | min=10 max=24 total=569 count=36 | min=10 max=24 total=569 count=36 |
| 2025级五年制、中专 | min=7 max=18 total=55 count=6 | min=7 max=18 total=55 count=6 |
| 2025级二年制 | min=9 max=24 total=65 count=6 | min=9 max=24 total=65 count=6 |

每个 sheet 中 A 与 B 的合并 span 数量一致（说明年级专业和班级人数成对出现）。

---

## 3. 列 schema 与 merged cell 分析

**期望列**（在第 2 行 header 中关键词扫描识别）：

1. `年级专业`（A 列，merged）
2. `班级人数`（B 列，merged）
3. `人才培养方案课程名称`（C 列）
4. `考试考查`（D 列；取值：试 / 查 / blank）
5. `周学时`（E 列；numeric，含 0.5）
6. `任课教师`（F 列；复杂模式）
7. `备注`（G 列；常 blank，偶有 "合班授课"）
8. `合班说明`（H 列；常 blank，偶有 class-specific merge）

每个 sheet 的实际列数 8-15 不等（多余列可能是额外统计或备注字段）；header detection 使用 keyword scan 而非 positional index，因此列数差异不影响解析。

**Merged cell 总数**：3080（A+B 列合并主导，其它列少量合并）

**行分类**（aggregate-only，不输出 raw 内容）：

| 行类型 | 数量 |
|--------|-----:|
| title row | 9 |
| header row | 9 |
| course row | 1116 |
| subtotal row | 695 |
| blank row | 25 |
| malformed row | 0 |

---

## 4. 行分类与数据质量

### 4.1 ClassGroup 解析可行性

| 模式 | 数量 |
|------|-----:|
| `multiNewline`（"1班47\n2班37"） | 178 |
| `multiSpace`（"1班31人      2班27人"） | 681 |
| `single`（"1班6人"） | 445 |
| `countOnly`（"22人" 或 bare number） | 228 |
| `blank` | 114 |
| `other` | 165 |

**结论**：
- 178 + 681 = 859 条多班级行（77% of non-blank rows）需支持 newline 或 wide-space split
- 228 条 only-count 行需降级为 `countOnly` 并 attach 到第一个 classGroup
- 165 条 `other`（含 6 行需要 manual review）需记录 `rowWarnings`

### 4.2 Teacher Assignment 解析可行性

| 模式 | 数量 |
|------|-----:|
| `single`（"王卫东"） | 876 |
| `numbered`（"1.2杨秀芳，3.4王芳"） | 12 |
| `bankSplit`（"1、2班牛生光；3、4班王彩凤"） | 80 |
| `blank`（体育等） | 781 |
| `other`（complex text） | 62 |
| unique teacher name hashes（distinct count） | 359 |

**结论**：
- 876 (78%) 是简单单教师
- 92 (8%) 是 multi-scope（节次 / 班级 / 班次）
- 781 (70%) 是 blank（其中体育类最多）
- 62 (5.5%) 是复杂文本，需要 manual review 或 L2 增强 parser

### 4.3 Merge Remark 解析可行性

| 模式 | 数量 |
|------|-----:|
| `blank` | 1705 |
| `合班授课` | 30 |
| `classSpecific`（含班号） | 13 |
| `ambiguous`（无明确 class marker） | 63 |

**结论**：合班说明总体稀疏，绝大多数行依赖 `任课教师` 字段中的 bank-split 模式推断合班。

### 4.4 Weekly Hours Quality

| 模式 | 数量 |
|------|-----:|
| numeric | 1074 |
| half-step (含 0.5) | 43 |
| blank | 675 |
| non-numeric | 19 |

**结论**：675 行周学时为空（可能是节次化课程不需要"周学时"字段）。19 行 non-numeric 需 L2 parser 标记 `rowWarnings`。

### 4.5 Exam Type Values

| 取值 | 数量 |
|------|-----:|
| `试` | 394 |
| `查` | 551 |
| `blank` | 724 |
| `other` | 142 |
| unique-other-hashes | 2 |

**结论**：试/查 合计 945 行（46%）。`other` 142 行只有 2 个 unique hash（可能是 "考试"、"考查" 全角 / 半角变体，或 "考查课"）。

---

## 5. 与现有 import 架构关系

### 5.1 Import API Surface

- `POST /api/admin/import/parse` (src/app/api/admin/import/parse/route.ts) — **当前硬编码 .docx 扩展名校验**（line 47-51），仅接受 Word 文件
- `POST /api/admin/import/confirm` — dryRun + real confirm with `CONFIRM_IMPORT` 文本
- `POST /api/admin/import/rollback` — dryRun + real rollback with `ROLLBACK_IMPORT`
- `POST /api/admin/import/batches/[id]/abandon` — abandon with `ABANDON_IMPORT`
- `GET /api/admin/import/batches` + `/batches/[id]` — list + detail

### 5.2 ImportBatch 模型（prisma/schema.prisma:385-411）

- **已有字段**：`filename / originalFilePath / parsedJsonPath / statsJson / qualityJson / warningsJson / status / strategy / recordCount / createdTaskCount / createdSlotCount / errorMessage / confirmedAt / rolledBackAt / semesterId`
- **没有 `sourceType` 字段**——目前隐式 Word-only
- **状态字符串**：`pending | confirming | confirmed | failed | rolled_back | abandoned`
- 索引：`@@index([semesterId])`

### 5.3 TeachingTask / TeachingTaskClass / ClassGroup / Teacher / Course 关系

| 模型 | 自然键 | semesterId | 备注 |
|------|--------|-----------|------|
| `Course` | `name @unique` (global) | N/A | 不分学期 |
| `Teacher` | `name @unique` (global) | N/A | 不分学期 |
| `ClassGroup` | `@@unique([semesterId, name])` | NOT NULL | K25-C 后 per-semester |
| `TeachingTask` | 复合键（semesterId + courseId + teacherId + weekType + startWeek + endWeek + remark + classGroupIds） | NOT NULL | K25-C |
| `TeachingTaskClass` | `@@unique([teachingTaskId, classGroupId])` | N/A | K20-FIX-B 8 个 source-evidence 字段 nullable |

### 5.4 Source Evidence 字段（K20-FIX-B → K39-C2）

`TeachingTaskClass` 已有 source evidence 字段：

```prisma
importBatchId         Int?
sourceRowIndex        Int?     // 0-based parsed record index
sourceKeyword         String?
sourceClassName       String?
sourceRemark          String?
sourceArtifactFilename String?  // basename only
matchStrategy         String?
matchConfidence       String?
```

**K39-C2 已完成**：446/446 行回填 `importBatchId` + `sourceArtifactFilename`（safe fields）。
**K39-C5 BLOCKED**：192 条件字段记录待人工 approve（目前 0/192 approved）。

### 5.5 新 Excel parser 与现有 import 的关系

| 问题 | 答案 |
|------|------|
| 新 parser 作为新 type 还是替代旧 parser？ | **新 parser type**（`courseSettingXlsx`），保留旧 Word parser legacy |
| `ImportBatch` 是否需要 `sourceType` 字段？ | **L2 决定**；L1 阶段不需要；可临时用 `filename` 扩展名 / `originalFilePath` 后缀识别 |
| 能否不改 schema 区分 Excel/Word？ | **可以**：用 `ImportBatch.filename` 扩展名 + `originalFilePath` 路径后缀；L2 阶段如确需 `sourceType` 才考虑 migration |
| 是否需要 schema migration？ | **L1 不需要**；L2 评估 |
| 是否支持 preview-only parsed result？ | **是**：L3 引入 parser-type-aware preview route，confirm 暂 disabled |
| 是否复用 K39 source evidence？ | **是**：复用 8 个字段语义，对 Excel 而言 `sourceRowIndex` 是 xlsx 1-based 行号 |
| 是否保持旧 Word parser legacy？ | **是**：L1-L5 不删 Word parser；L5 后才标记 legacy/deprecated |

---

## 6. 路线对比

| 路线 | 推荐度 | 风险 | 可灰度 | 可回滚 | 备注 |
|------|--------|------|--------|--------|------|
| **A. 并行 Excel parser，Word legacy** | ✅ **推荐** | 低 | 是 | 是 | 最小侵入；可分阶段切换 |
| B. 立即替换 Word parser | ❌ | 高 | 否 | 难 | regression 高 |
| C. 通用 parser 抽象层 | 中长期 | 中 | 是 | 是 | L1 不做大重构 |
| D. 独立 admin-only Excel 页面 | 可选 | 中 | 是 | 是 | 增加 UI 范围；L2 不做 |
| E. Excel rows → 现有 parsed shape | ✅ **作为 L2 prototype** | 低 | 是 | 是 | 最小侵入；先做 prototype |

**L1 推荐路径：A + E**——并行 Excel parser，prototype 阶段把 Excel rows 转为 normalized parsed rows（不直接复用 Word parsed shape，因为 schema 不同），保留 Word legacy。

---

## 7. 推荐方案

1. **L2** 只做 parser prototype：新增 `src/lib/import/course-setting-xlsx-parser.ts`，导出 `parseCourseSettingXlsx(buffer)` 纯函数，**不写 DB、不接 UI、不替换 Word import**。
2. 输出归一化的 `ParsedCourseSettingRow[]`，包含 source evidence 字段（hash + sheet + rowIndex）。
3. 旧 Word parser 保持不动；旧的 `scripts/parse_schedule.py` 和 importer 不变。
4. **立刻不放弃 Word import**——保留 legacy 一段时间。
5. **不立刻接 UI**——L3 才接 preview，L4 才接 confirm。
6. **L1 不需要 schema migration**；L2 评估是否需要 `ImportBatch.sourceType` 字段。
7. **L1 不写 DB**，L2 仍不写 DB。
8. **L2 可能需要 source evidence schema 扩展**——若 Excel 行需要 `sourceMajorName` 等新字段，则评估是否新增到 `TeachingTaskClass` 或新建 per-batch evidence 表（先评估）。
9. **L2 prototype 后需要人工验收**：用样本 Excel 输出 fixture，人工审核 parsed row 准确率。

---

## 8. L2/L3/L4/L5 草案

### L2 — Parser Prototype（下一步）

- 新增 `src/lib/import/course-setting-xlsx-parser.ts`
- 支持 xlsx Buffer 输入
- 处理 A/B 列 merged cell inheritance
- 标准化 8 个 column → ParsedCourseSettingRow
- 输出 `parsedClassGroups[]` + `parsedTeacherAssignments[]` + `parsedMergeRemark`
- 不写 DB；不 confirm；不接 UI
- 新增 verify 脚本 `scripts/verify-course-setting-parser-l2.ts`
- 输出脱敏 fixture report

### L3 — UI Preview / Parser-Type Routing

- import parse API 增加 `parserType=courseSettingXlsx` 字段
- import UI 允许选择 / 自动识别 xlsx 文件
- 仅 preview，不 confirm
- 保留 Word parser 入口

### L4 — DB Apply

- 将 `ParsedCourseSettingRow` 映射到 TeachingTask / TeachingTaskClass / ClassGroup / Teacher / Course
- 严格 dry-run；通过后才 confirm
- 需要 DB backup（按既有规则 `dev.db.backup-before-l4-<timestamp>`）
- source evidence forward-fill：复用 K39-C2 safe fields backfill 模式

### L5 — Word Deprecation

- 标记旧 Word import 为 legacy / deprecated
- UI 提示推荐 Excel 课程设置导入
- 不删除 Word 代码，先隐藏入口或降低优先级
- 新增 verify-check `verify-word-parser-still-works-l5.ts` 确保 legacy 仍可运行

---

## 9. 验证结果

### 9.1 L1 audit script

```
npx tsx scripts/audit-xlsx-course-setting-import-l1.ts
→ PASS: 25/25
```

详细 25 项检查见 `docs/l1-xlsx-course-setting-import-audit.json:checks`：

1. sample-file-exists ✅
2. sample-not-git-tracked ✅
3. workbook-readable ✅
4. sheet-count-9 ✅
5. sheet-names-detected ✅
6. expected-headers-detected ✅
7. merged-cells-detected ✅ (total = 3080)
8. grade-major-inheritance-needed ✅
9. class-count-inheritance-needed ✅
10. course-rows-count-positive ✅ (1116)
11. subtotal-blank-rows-aggregated ✅
12. class-count-patterns-aggregated ✅
13. teacher-patterns-aggregated ✅
14. merge-remark-patterns-aggregated ✅
15. weekly-hours-quality-aggregated ✅
16. exam-type-aggregated ✅
17. source-evidence-mapping-proposed ✅
18. word-parser-untouched ✅
19. no-prisma-import ✅
20. schema-unchanged ✅
21. no-api-changes ✅
22. recommendation-is-l2-parser-prototype ✅
23. k39-import-rules-still-pass ✅
24. k22-c-still-pass ✅
25. no-raw-sensitive-content ✅

### 9.2 K39 Source Evidence 兼容性

| Verify | Result |
|--------|--------|
| `npx tsx scripts/verify-source-evidence-safe-fields-backfill-k39-c2.ts` | **PASS** (30/30) |
| `npx tsx scripts/verify-source-evidence-manual-review-package-k39-c4.ts` | **PASS** (31/31) |
| `npx tsx scripts/verify-import-rules-explicit-semester-config-k39-b1.ts` | **PASS** (26/26) |
| `npx tsx scripts/verify-import-rules-runtime-500-fix-k39-b1a.ts` | **PASS** (24/24) |

### 9.3 K22-C Compatibility

```
npx tsx scripts/verify-score-regression-harness-k22-c.ts
→ 73 / 0 / 0 / 0 / 0  PASS
```

K22-C 已恢复 73/0/0/0/0 baseline；任何 `generatedAt` drift 已 restore。

### 9.4 PII / Sensitive Content

- `npm run scan:docs-pii`：PASS（committed JSON 仅含 sha256 前缀 + aggregate counts）
- committed JSON 脱敏自检：PASS（无 raw teacher name / class name / course name / phone / raw row content）

---

## 10. Source Evidence 字段映射设计（L2 草案）

每个 parsed row 对应 9 个 source evidence 字段（沿用 K20-FIX-B / K39-C2 命名规范）：

| 字段 | 类型 | 来源 | 备注 |
|------|------|------|------|
| `sourceArtifactFilename` | string | xlsx basename | sha256 prefix 12 chars |
| `sourceSheetName` | string | worksheet.name | 9 个 public labels |
| `sourceRowIndex` | integer | 1-based xlsx row | data row，不含 title |
| `sourceMajorName` | string | A column（inherited） | sha256 prefix |
| `sourceClassCountRaw` | string | B column（inherited） | sha256 prefix |
| `sourceCourseName` | string | C column | sha256 prefix |
| `sourceTeacherRaw` | string | F column | sha256 prefix |
| `sourceRemark` | string | G column | sha256 prefix |
| `sourceMergeRemark` | string | H column | sha256 prefix |

L2 在 `TeachingTaskClass` 上复用现有 8 个 source-evidence 字段（`importBatchId/sourceRowIndex/sourceKeyword/sourceClassName/sourceRemark/sourceArtifactFilename/matchStrategy/matchConfidence`）；`sourceMajorName/sourceClassCountRaw/sourceCourseName/sourceTeacherRaw/sourceMergeRemark` 暂存于 `ImportBatch.warningsJson` 或新增 batch-level metadata，L4 决定。

---

## 11. 为什么不直接替换 Word parser

1. **回归风险高**：旧 Word parser 已通过 K22-C / K39-C2 等多项验证，是 verified stable artifact；替换需重跑所有 stage-aware verify。
2. **数据形态不同**：Excel 课程设置表是 "课程 → 教师 / 班级 / 备注" 二维表（course setting），Word 课表是 "班级 × 星期 × 节次 → 教师 / 教室" 周课表（weekly schedule）。两者产生的 `ScheduleSlot` 数量级不同（Excel 主要生成 `TeachingTask` 而非 `ScheduleSlot`）。
3. **来源标注差异**：Excel 数据更规整但缺少 dayOfWeek / slotIndex；Word 数据含完整周次但需要合并解析。
4. **可灰度需求**：业务希望逐步过渡，保留 Word parser 作为 fallback。

---

## 12. 为什么本阶段不写 DB

1. **阶段定位**：L1 是只读审计 + parser 方案设计，不是 import 实现。
2. **避免业务数据污染**：现有 confirmed batch（38 ImportBatch、308 TeachingTask、440 ScheduleSlot）已被 K39-C2 source-evidence backfill 修整过；新数据若不经严格 dry-run 验证，可能污染 evidence 关联。
3. **避免未审核的 schema 变更**：source evidence 字段语义尚未为 Excel 校准，盲目写入会污染 K39 audit chain。
4. **避免 force push / restore 复杂度**：L1 阶段无 schema migration 时最干净。

---

## 13. 剩余风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| L2 parser 对 165 条 `other` class count 行无法 100% 解析 | minor | L2 parser 输出 `rowWarnings`，L3 UI 高亮人工审核 |
| L2 parser 对 62 条 `other` teacher assignment 行无法 100% 解析 | minor | 同上 |
| 19 条 non-numeric 周学时行 | minor | L2 parser 标记 `rowWarnings`，不阻塞 parse |
| Excel 与 Word 数据不能直接共存同一 ImportBatch | medium | L3 / L4 设计 parser-type-aware confirm route |
| L4 写入 TeachingTask 后需重跑 K22-C 验证 | medium | L4 提交前强制跑 `verify-score-regression-harness-k22-c.ts` |
| `ImportBatch.sourceType` 字段若必须新增需 migration | medium | L2 评估；L1 暂不需要 |
| Excel 9 个 sheet 列数差异（8-15） | low | L2 parser 使用 keyword scan 而非 positional |
| Excel 行被 .xlsx 扩展名 filter 阻塞（旧 API 只接 .docx） | low | L3 修改 API 扩展名校验 |

---

## 14. 禁止事项确认

- [x] **未写 ImportBatch**
- [x] **未写 TeachingTask**
- [x] **未写 TeachingTaskClass**
- [x] **未写 Course**
- [x] **未写 Teacher**
- [x] **未写 ClassGroup**
- [x] **未写 ScheduleSlot**
- [x] **未写 ScheduleAdjustment**
- [x] **未运行真实 import confirm / rollback / abandon / seed**
- [x] **未新增 schema / migration**
- [x] **未新增 PATCH / POST route**
- [x] **未改旧 Word parser 语义**
- [x] **未删除旧 Word import**
- [x] **未替换现有 import API**
- [x] **未修改 scheduler / score**
- [x] **未修改 K22 expected**
- [x] **未提交 dev.db / backup / temp / uploads / docx / xlsx 原始样本**
- [x] **未 force push**
- [x] **committed docs/json 中未输出真实教师姓名、手机号、真实班级、真实课程明细、原始行内容**

---

## 15. 关联文件

- 审计脚本：`scripts/audit-xlsx-course-setting-import-l1.ts`
- 审计 JSON：`docs/l1-xlsx-course-setting-import-audit.json`（aggregate-only + sha256-prefix 脱敏）
- 本报告：`docs/l1-xlsx-course-setting-import-audit.md`

## 16. 下一步

按推荐路径推进 **L2-XLSX-COURSE-SETTING-PARSER-PROTOTYPE**（parser prototype only，无 DB 写入）。