# L6-E2G — XLSX Course Setting New Course Candidate Semantics Fix

> Stage: **L6-E2G-XLSX-COURSE-SETTING-NEW-COURSE-CANDIDATE-SEMANTICS-FIX**
> Status: **CODE COMPLETE — browser manual validation pending**
> Previous stage: L6-E2F (CLOSED, commit `53cfe8a`)
> Next stage: L6-F (RESUMES only after L6-E2G browser validation passes)

## 1. User Requirement / Blocker

用户在准备进入 L6-F（Excel 课程设置部分导入执行）前发现页面 `/admin/import`
中大量行被标记为“课程缺失”。实际检查 Excel 样本后发现：

- 这些行在 Excel 中**有明确课程名**；
- 但当前 DB `Course` 表中**没有这门课程**；
- 系统把这种情况统一标为 `COURSE_MISSING`（课程缺失）—— 这是语义错误。

正确的语义应是：

- Excel 有课程名但 DB 无匹配 → **新课程候选 / 待创建课程**（不是错误，是待确认）；
- Excel 课程名为空或无法解析 → **真正的课程名缺失**（blocker）。

因此 L6-F 暂缓，先在 L6-E2G 修复语义、诊断、UI 文案、plan 类型。本阶段
**不写 DB**、**不 apply**、**不创建任何实体**。

## 2. Semantic Distinction

| 情况 | Excel 课程名 | DB Course 匹配 | 旧诊断 | 新诊断（L6-E2G） | 是否 blocker |
|---|---|---|---|---|---|
| A. 真正课程名缺失 | 空 / 无法解析 | — | `COURSE_MISSING` | `COURSE_NAME_MISSING` | 是 |
| B. 新课程候选 | 非空 | 无匹配 | `COURSE_MISSING` | `COURSE_CREATE_CANDIDATE` | 否（可确认） |
| C. 课程匹配歧义 | 非空 | 多匹配 | `COURSE_AMBIGUOUS` | `COURSE_AMBIGUOUS`（不变） | 是（需消歧） |

## 3. True Course Name Missing Definition

仅当 Excel 行没有可识别的课程名时（`raw.courseName` 为空或 trim 后为空字符串），
才使用 `COURSE_NAME_MISSING`。UI 显示：

```
课程名缺失
Excel 行中没有可识别的课程名，必须人工处理。
```

用户必须：选择已有课程，或输入新课程名称。否则行保持 `needsResolution` 状态，
不进入可导入 plan。

## 4. New Course Candidate Definition

当 Excel 行有明确课程名，但 DB `Course` 表无匹配时，使用
`COURSE_CREATE_CANDIDATE`。UI 显示：

```
新课程候选
系统未找到已有课程，将作为新课程创建。
```

用户可选：

1. **确认创建新课程**（默认使用 Excel 课程名作为候选名）；
2. **选择已有课程替代**；
3. **修改候选名称后确认创建**；
4. **忽略本行**；
5. **标记暂不处理**。

未确认的新课程候选保持 `needsResolution`，并在 plan summary 中明确列为
`courseCreateCandidates` + `rowsUsingNewCourseCandidate`；不归入
`courseNameMissingRows`。

## 5. UI Changes

### Manual Resolution Row (`course-setting-manual-resolution-row.tsx`)

- 旧的“课程缺失”单一区块拆分为三个子区块，按 `baseCourseSituation` 渲染：
  - `courseNameMissing` → 红色标题“课程名缺失” + select 已有课程 + 输入新候选名称
  - `newCourseCandidate` → 蓝色标题“新课程候选” + 显示 Excel 课程名 + select
    已有课程替代 + 重命名输入 + **“确认创建新课程”按钮**
  - `courseAmbiguous` → 消歧区块
- 诊断 Badge 列表过滤掉 legacy `COURSE_MISSING`（避免重复显示）
- 新增 `data-l6e2g-course-controls="new-candidate"` / `data-l6e2g-course-action`
  属性，便于 verify 与浏览器测试定位

### Manual Resolution Section (`course-setting-manual-resolution-section.tsx`)

- 新增 L6-E2G 课程专用 summary 卡片：
  - 课程名缺失（danger）
  - 新课程候选（warn）
  - 课程匹配歧义（warn）
  - 新课程候选（已确认）（success）

### Partial Import Plan Section (`course-setting-partial-import-plan-section.tsx`)

- 新增 summary 卡片：课程候选 / 新课程候选（已确认） / 课程名缺失行 /
  课程匹配歧义行 / 新课程候选引用行 / 重复风险
- Importable 表的课程列区分 `新候选（已确认）` vs `新候选（未确认）`
- Candidate 视图新增“已确认行数”列

## 6. Manual Resolution Changes

`CourseSettingManualResolutionItem` 新增两个字段：

```ts
baseRawCourseName: string | null    // 运行时 raw，不持久化
baseCourseSituation: CourseSituation // 'courseNameMissing' | 'newCourseCandidate' | 'courseAmbiguous' | 'courseResolved'
```

`evaluateManualResolutionItem` 按 situation 分支：

- `courseNameMissing` 未解析 → blocker `courseNameMissing`
- `newCourseCandidate` 未解析 → blocker `newCourseCandidate`（注意：与
  `courseMissing` 不同，UI 文案与 plan 行为都不同）
- `courseAmbiguous` 未解析 → blocker `courseAmbiguous`
- `courseResolved` → 无 course blocker

`summarizeManualResolutionState` 新增四个计数器：

```ts
courseNameMissingItems: number
newCourseCandidateItems: number
courseAmbiguousItems: number
confirmedNewCourseCandidateItems: number
```

## 7. Partial Import Plan Changes

`CourseSettingPartialImportPlanSummary` 新增四个计数器：

```ts
courseCreateCandidates: number          // 去重后的新课程候选数
rowsUsingNewCourseCandidate: number     // 引用新课程候选的行数
confirmedNewCourseCandidates: number    // 已确认的新课程候选行数
courseNameMissingRows: number           // 真正课程名缺失行数
courseAmbiguousRows: number             // 课程匹配歧义行数
```

每个 importable row 新增 `coursePlan` 字段，供未来 L6-F apply 阶段读取：

```ts
coursePlan: {
  mode: 'useExistingCourse' | 'createCourse' | 'unresolved'
  courseId?: number
  courseNameHash?: string
  createCourseCandidate?: {
    nameHash: string
    source: 'excelCourseName' | 'manualOverride'
    confirmed: boolean
  }
}
```

`CourseCreateCandidatePlan` 新增 `confirmedCount` 字段。

Plan 逻辑要点：

- Excel 课程名非空 + `COURSE_MISSING` + 无 resolution → 自动派生候选
  （`source: 'excelCourseName'`, `confirmed: false`），不视为 blocker
- Excel 课程名非空 + `COURSE_MISSING` + `createCourseCandidate` resolution
  with 非空候选名 → 候选 `confirmed: true`
- Excel 课程名空 + `COURSE_MISSING` → blocker `courseNameMissing`
- `COURSE_AMBIGUOUS` 未消歧 → blocker `courseAmbiguous`

`validatePartialImportPlan` 新增一致性校验：

- `confirmedNewCourseCandidates <= rowsUsingNewCourseCandidate`
- importable row 的 `coursePlan.mode` 必须与 `plannedCourseAction` 一致
- `coursePlan.mode === 'createCourse'` 必须有 `createCourseCandidate`

## 8. L6-F Implication

Docs 和 plan 明确：未来 L6-F 允许创建：

- **Course** —— 但仅限 `confirmed/importable courseCreateCandidates`

未来 L6-F 仍禁止：

- 自动创建 **Teacher**（仍由 L6-E1C 拥有 Teacher 基础同步）
- 自动创建 **ClassGroup**（本阶段不放开；如需创建，必须后续单独 gate）

`coursePlan` 字段就是为 L6-F apply 阶段准备的：apply 时读取 `mode`，对
`createCourse` 模式按 `createCourseCandidate.nameHash` 解析出真实候选名
（通过 resolution state 回查），创建 Course 后再用新 courseId 创建
TeachingTask。

## 9. No DB Write Proof

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

L6-E2G 新增的 `course-setting-new-course-candidate-l6-e2g.ts` 是纯函数模块，
无 Prisma / fs / React / API 依赖。所有现有的 `dbWritten: false` /
`applyAllowed: false` 字面量类型保持不变。

## 10. No Apply Proof

- 无 `partial-import-apply` route 目录
- 无 `执行导入` / `正式导入` / `写入数据库` / `创建教学任务` 按钮
- Manual Resolution Section 仅有 `生成部分导入计划` 按钮（plan-only）
- Partial Plan Section 仅有 `导出部分导入计划 JSON` 按钮

## 11. Privacy Boundary

- **Runtime admin UI** 可显示 raw 课程名（authorized-admin-only）
- **Exported JSON** 永远 `rawIncluded: false`；课程候选导出为
  `candidateNameHash`（SHA256 prefix），不含 raw 课程名
- **Committed docs/json** 仅含 aggregate / hash / count，不含 raw 课程名 /
  教师名 / 班级名 / 专业名 / 备注

## 12. Validation Results

- L6-E2G verify: **PASS**（110+ checks）
- L6-E2F regression: **PASS**（45 checks）
- L6-E2E regression: **PASS**（82 checks）
- L6-E2D regression: **PASS**（90 checks）
- L6-E2C regression: **PASS**（86 checks）
- L6-E2B regression: **PASS**（85 checks）
- L6-E2A regression: **PASS**（85 checks）
- L6-E1 regression: **PASS**（87 checks）
- L6-E2 regression: **PASS**（144 checks）
- prisma validate: **PASS**
- migrate status: **14 migrations, up to date**
- K22-C: **PASS**
- scan:docs-pii: **no blocking hits**
- build: **PASS**
- tsc: **PASS**
- targeted eslint: **PASS**
- git diff --check: **clean**
- forbidden files: **clean**

## 13. Browser Validation Checklist

> L6-E2G code complete; browser manual validation pending.

1. 打开 `/admin/import`，选择目标学期（ID 3 = 2026秋），上传
   `2025年秋季学期课程设置(总）.xlsx`
2. 点击 `生成审核视图`
3. 滚动到 `手动处理` 区，查看 summary 卡片：
   - `课程名缺失` 计数（应为少量或 0）
   - `新课程候选` 计数（应为较多 —— 这是修复前被误标为“课程缺失”的行）
4. 展开一个 Excel 有课程名但 DB 无匹配的行，应看到：
   - 蓝色标题“新课程候选”
   - Excel 课程名 Badge
   - “选择已有课程（替代）”下拉
   - “新课程候选名称”输入框（默认填入 Excel 课程名）
   - “确认创建新课程”按钮
5. 展开一个 Excel 课程名为空的行，应看到：
   - 红色标题“课程名缺失”
   - 仅 select + 输入（无“确认创建”按钮）
6. 点击“确认创建新课程”后：
   - 状态 Badge 更新
   - `新课程候选（已确认）` summary 计数 +1
7. 选择“已有课程替代”仍可用，且状态更新为 importable
8. 点击 `生成部分导入计划`：
   - summary 卡片出现 `课程候选` / `新课程候选（已确认）` /
     `课程名缺失行` / `课程匹配歧义行`
   - 可导入表对 `createCourse` 行显示 `新候选（已确认）` 或 `新候选（未确认）`
   - 候选视图有“已确认行数”列
9. 切到“仍需处理”视图，未确认的新课程候选仍在其中（未被错误归入阻塞）
10. 切到“阻塞项”视图，仅 `courseNameMissing` / `courseAmbiguous` 等真 blocker
11. task split 功能不回退（展开 TASK_SPLIT_REQUIRED 行仍显示拆分候选面板）
12. 页面无 `执行导入` / `写入数据库` / `创建教学任务` 按钮
13. Browser console 无 React error / warning
14. DB counts 不变（Course / Teacher / ClassGroup / TeachingTask /
    ImportBatch 数量前后一致）

## 14. Next Stage Recommendation

L6-F（`L6-F-XLSX-COURSE-SETTING-PARTIAL-IMPORT-EXECUTION`）可在 L6-E2G 浏览器
验证通过后恢复。L6-F 需要：

- DB backup（`prisma/dev.db.backup-before-l6-f-<timestamp>`）
- Explicit confirm（`CONFIRM_PARTIAL_IMPORT=1`）
- Transaction + rollback on failure
- 仅创建 `confirmed/importable courseCreateCandidates` 对应的 Course
- 仍不自动创建 Teacher（L6-E1C owns Teacher sync）
- 仍不自动创建 ClassGroup（除非单独 gate）
- 读取 L6-E2G 产出的 `coursePlan` 字段决定每行的 course 处理方式
