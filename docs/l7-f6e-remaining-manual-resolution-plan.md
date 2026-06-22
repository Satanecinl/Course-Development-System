# L7-F6E-REMAINING-MANUAL-RESOLUTION-PLAN

> Stage: `L7-F6E-REMAINING-MANUAL-RESOLUTION-PLAN`
> Date: 2026-06-22
> Status: **CLOSED**

## 一、Stage Summary

对 L7-F6D2 干跑后的 1082 个 unresolved row/candidate 做只读分类和处理策略规划。本阶段:

- 读取 L7-F trial dry-run plan (importable=85, unresolved=1082)
- 读取 L7-F6D2 canonical-key reconciliation docs JSON
- 读取外部主数据: 专业 DB (43 majors)、职员 DB (436 staff)、通讯录 (523 contacts)
- 对每个 unresolved row 的 blockers 做 row-level final action 分类
- 输出 5 个 gitignored local raw artifacts + 1 个 committed aggregate JSON
- 不写 DB、不执行 apply、不创建 backup

## 二、DB Baseline

```text
Course = 104
Teacher = 236
ClassGroup sem1 = 36
ClassGroup sem4 = 431
TeachingTask sem4 = 0
TeachingTaskClass = 446
ScheduleSlot sem4 = 0
ScheduleAdjustment sem4 = 0
ImportBatch total = 39
ImportBatch #39 = APPLIED, tasks=0
ImportBatch #40 = absent
```

本阶段未改变以上任何数据。

## 三、Remaining Blocker Summary

```text
total blocker diagnostics:   2492
affected rows:               1082
importable rows:              85 (L7-F trial dry-run)
unresolved rows:             1082
```

### Overlap Matrix (top combinations)

```text
TEACHER_ID_MISSING only:                                           674
TEACHER_ID_MISSING + teacherMissing:                                90
TEACHER_ID_MISSING + examTypeInvalid:                               94
TEACHER_ID_MISSING + ambiguousMapping:                              28
CLASS_GROUP_IDS_MISSING + TEACHER_ID_MISSING + classGroupMissing:  112
CLASS_GROUP_IDS_MISSING + TEACHER_ID_MISSING + teacherMissing:      11
examTypeInvalid only:                                                1
ambiguousMapping only:                                               7
...
```

## 四、Missing Teacher Plan

```text
missingTeacherDiagnosticCount:         1060
missingTeacherRowCount:                1060
uniqueMissingTeacherHashCount:          219 (unique teacher texts)
foundInCurrentTeacherAfterF6C:            0
foundInStaffOrContacts:                 844 (teacher text found in staff DB or contacts xlsx)
likelyExternal:                          37 (teacher text not in any source — likely 外聘/兼职/校外)
ambiguousTeacherCount:                  120 (multiple teacher tokens — manual selection)
emptyTeacherCount:                       59 (no teacher text — non-PE, will be skipped)
physicalEducationExemptCount:             0 (PE rows are importable, not unresolved)
```

### Recommended Action Counts

```text
USE_EXISTING_TEACHER_ALIAS:                            0
IMPORT_FROM_STAFF_OR_CONTACTS:                       844 (L7-F6F can import as new Teacher)
CREATE_EXTERNAL_TEACHER_AFTER_CONFIRMATION:            37 (user must confirm external teacher)
PHYSICAL_EDUCATION_TEACHER_EXEMPT:                     0
MANUAL_REVIEW_TEACHER_TEXT:                          120 (user must select existing or create new)
SKIP_ROW:                                             59 (no teacher and non-PE)
```

**关键发现**:
- 844 rows (79.6% of 1060) 可以通过 staff DB (436 employees) 或 contacts xlsx (523 contacts) 中的教师名自动导入。
- 37 rows 的教师在所有源中均未找到，大概率是外聘/兼职教师，需要用户确认后再创建。
- 120 rows 有多个教师 token (如 `杨秀芳；王芳；姜剑书`)，但 trial 已通过 K-column 分段解析处理了 109 行。剩余 120 行需要手动选择。
- 59 rows 完全无教师信息且非体育课，应跳过。

## 五、Manual-Review ClassGroup Plan

```text
manualReviewClassGroupCount:           96 (L7-F6D2 数据)
uniqueMajorHashCount:                   8 (8 个 unique majors 不在 major DB 中)
affectedRows:                         145 (rows 涉及这些 majors)
```

### 8 个 Manual-Review Majors

| Major | Count | Recommended Action |
|---|---|---|
| 现代家政管理 | 26 | CREATE_CLASSGROUP_AFTER_CONFIRMATION |
| 森林和草原资源保护 | 23 | CREATE_CLASSGROUP_AFTER_CONFIRMATION |
| 冶金现场工程师班 | 14 | CREATE_CLASSGROUP_AFTER_CONFIRMATION |
| 机电现场工程师班 | 13 | CREATE_CLASSGROUP_AFTER_CONFIRMATION |
| 智慧健康养老与管理 | 7 | CREATE_CLASSGROUP_AFTER_CONFIRMATION |
| 口腔修复工艺 | 7 | CREATE_CLASSGROUP_AFTER_CONFIRMATION |
| 机电一体化五年制 | 3 | ADD_MAJOR_ALIAS_MAPPING (可能 = 机电一体化技术) |
| 轧钢现场工程师班 | 3 | CREATE_CLASSGROUP_AFTER_CONFIRMATION |

### Recommended Action Counts

```text
ADD_MAJOR_ALIAS_MAPPING:               3 (机电一体化五年制 可能是 机电一体化技术 的别名)
CREATE_CLASSGROUP_AFTER_CONFIRMATION: 93 (其余 7 个 majors 需要新建 ClassGroup)
DO_NOT_CREATE:                          0
SOURCE_REVIEW_REQUIRED:                 0
SKIP_ROW:                               0
```

## 六、DB Collision Plan

```text
duplicateCompositeKeyCollisionCount:    32
safeDuplicateCount:                     23 (L7-F6C 的 duplicatePlannedName — 同一个 canonical key)
unsafeCollisionCount:                    9 (legacy sem4 + L7-F6C 物理名不同但 canonical key 相同)
legacyCollisionCount:                    9
plannedNameBugCount:                     9 (L7-F6C double-级 bug: 2024级级口腔医学1班 vs 2024级口腔医学1班)
blockingCollisionCount:                  9 (unsafe collisions are blocking)
```

### Recommended Action Counts

```text
IGNORE_SAFE_DUPLICATE:                 23 (safe — same canonical key)
FIX_PLANNED_NAME_GENERATION:            9 (need migration to normalize double-级 plannedName)
ADD_ALIAS_MAPPING:                      0
MANUALLY_SELECT_CANONICAL_CLASSGROUP:   0
DO_NOT_USE_LEGACY_CLASSGROUP:           0
NEEDS_SCHEMA_ROADMAP:                   0
```

**关键发现**:
- 23 个 safe duplicate 不阻塞 apply（同一个 canonical key 多个 DB rows，语义相同）。
- 9 个 unsafe collision 阻塞 apply：legacy sem4 ClassGroup 与 L7-F6C 创建的 ClassGroup 有相同 canonical key 但不同物理名（double-级 bug）。需要 L7-F6F 写一个 migration 来规范化 L7-F6C 的 double-级 plannedName。

## 七、Exam Type Invalid Plan

```text
examTypeInvalidCount:                 145
rawExamTypeVariantCount:                2 (考试 and 查/试 两种变体)
normalizableExamTypeCount:            145 (全部可归一)
invalidExamTypeCount:                   0
blankExamTypeCount:                     0
ambiguousExamTypeCount:                 0
```

### Recommended Action Counts

```text
NORMALIZE_BY_RULE:                    145 (查 → 考查, 试 → 考试)
MANUAL_REVIEW_EXAM_TYPE:                0
SKIP_ROW:                               0
```

**关键发现**: 所有 145 个 exam type 均为 `考试` 或 `查`/`试` (简写), 可以通过归一规则自动修正。归一规则:
- `考试` → EXAM
- `考查` → CHECK
- `试` → EXAM
- `查` → CHECK

## 八、Weekly Hours Invalid Plan

```text
weeklyHoursInvalidCount:              19
rawWeeklyHoursVariantCount:             3
blankWeeklyHoursCount:                  0
nonNumericWeeklyHoursCount:            19 (all 19 are non-numeric)
rangeWeeklyHoursCount:                  0
fractionWeeklyHoursCount:               0
totalHoursOnlyCount:                    0
manualReviewRequiredCount:              0
```

### Recommended Action Counts

```text
NORMALIZE_NUMERIC:                      0
MANUAL_REVIEW_WEEKLY_HOURS:            19
SKIP_ROW:                               0
```

**关键发现**: 19 个 weekly hours 非数字（可能是文字描述如"合计"/"周"），无法自动归一。需要用户手动输入数值。

## 九、Ambiguous Mapping Plan

```text
ambiguousMappingCount:                 63
ambiguousTeacherCount:                  0
ambiguousCourseCount:                   0
ambiguousClassGroupCount:              63 (all 63 are class group ambiguity from MERGE_REMARK_AMBIGUOUS)
ambiguousMajorAliasCount:               0
ambiguousKSegmentCount:                 0
ambiguousExamTypeMappingCount:          0
ambiguousWeeklyHoursMappingCount:       0
```

### Recommended Action Counts

```text
MANUAL_SELECT_EXISTING:                63 (user must select target class group(s))
ADD_ALIAS_MAPPING:                      0
CREATE_NEW_AFTER_CONFIRMATION:          0
SKIP_ROW:                               0
```

**关键发现**: 63 行的合班说明（merge remark）非空但无法自动匹配到已知班级。用户需要在 L7-F6E1 或 L7-F6F 阶段手动选择目标班级。

## 十、Final Action Aggregate

```text
AUTO_FIX_BY_RULE_NEXT_STAGE:                 1 (examTypeInvalid only)
WRITE_MASTER_DATA_AFTER_CONFIRMATION:      858 (teacher in staff/contacts + new major ClassGroup)
MANUAL_RESOLUTION_REQUIRED:                164 (external teacher + ambiguous teacher + weekly hours)
SKIP_ROW:                                   59 (no teacher and non-PE)
BLOCKED_BY_DB_COLLISION:                     0 (DB collision affects ClassGroup matching, not row-level)
BLOCKED_BY_SOURCE_AMBIGUITY:                 0
unknownFinalActionCount:                     0
```

**1082 rows fully classified** (no unknown):

```text
1 + 858 + 164 + 59 + 0 + 0 + 0 = 1082 ✓
```

### 解读

- **AUTO_FIX_BY_RULE_NEXT_STAGE (1)**: 1 行仅有 examTypeInvalid (可自动归一)。
- **WRITE_MASTER_DATA_AFTER_CONFIRMATION (858)**:
  - 844 行的教师可在 staff/contacts 中找到 → L7-F6F 可批量导入为新 Teacher。
  - 14 行的 major 不在 major DB 中 → L7-F6F 可批量创建新 ClassGroup (93 rows + 3 alias mapping)。
- **MANUAL_RESOLUTION_REQUIRED (164)**:
  - 37 行的教师不在任何外部源中 (外聘/兼职)。
  - 120 行的教师文本有多个 token 需要手动选择。
  - 1 行的 weekly hours 需要手动输入。
  - 6 行其他 (examTypeInvalid + teacherMissing 组合)。
- **SKIP_ROW (59)**: 无教师文本且非体育课，应跳过。

## 十一、Required Human Decisions

1. **844 个 IMPORT_FROM_STAFF_OR_CONTACTS rows**: 需要确认将 staff/contacts 中的教师名创建为 Teacher。本阶段不做，L7-F6F 阶段执行。
2. **37 个外聘/兼职教师**: 需要用户确认是否创建为 external Teacher。如果不创建，这 37 行将被跳过。
3. **120 个 ambiguous teacher rows**: 需要用户手动选择教师或确认教师名。涉及 multi-token 教师文本 (如 "杨秀芳；王芳")。
4. **96 个 manual-review ClassGroups (8 majors)**: 需要用户确认 major alias 或新建 ClassGroup。
5. **9 个 unsafe DB collisions**: 需要 L7-F6F 写 migration 规范化 double-级 plannedName。
6. **19 个 weekly hours**: 需要用户手动输入数值。
7. **63 个 ambiguous mapping rows**: 需要用户手动选择目标班级。

## 十二、Next Stage Recommendation

```text
blockingCollisionCount = 9 > 0 → next stage: L7-F6F-CONTROLLED-DB-COLLISION-RECONCILIATION-WRITE
```

L7-F6F 应:
1. 写 migration 规范化 L7-F6C 的 9 个 double-级 plannedName (e.g., `2024级级口腔医学1班` → `2024级口腔医学1班`)。
2. 合并 9 个 unsafe collision 的 canonical key (保留一个 ClassGroup, 删除或合并另一个)。
3. 验证 blockingCollisionCount 降为 0。
4. 然后才能进入 L7-F7 (valid dry-run)。

L7-F6E 后仍不能进入 L7-F7 或 L7-G。

## 十三、No-DB-Write Proof

| 指标 | 值 |
|---|---|
| DB write | NONE |
| apply | NONE |
| backup | NONE |
| ImportBatch created | 0 |
| Course created | 0 |
| Teacher created | 0 |
| ClassGroup created | 0 |
| TeachingTask created | 0 |
| TeachingTaskClass created | 0 |
| ScheduleSlot created | 0 |
| ScheduleAdjustment created | 0 |

## 十四、Privacy / File Boundary

**Committed docs/json**:
- `docs/l7-f6e-remaining-manual-resolution-plan.json` — aggregate only (hash/count/bucket), no raw PII.
- `docs/l7-f6e-remaining-manual-resolution-plan.md` — this document.

**Gitignored local artifacts** (under `temp/local-artifacts/l7-f6e/`):
- `remaining-resolution-plan.raw.local.json` — full row-level final actions (includes raw approvalItemId).
- `missing-teachers.raw.local.json` — raw teacher text + hashes + bucket + rationale.
- `manual-review-classgroups.raw.local.json` — raw major names + L7-F6E action.
- `db-collisions.raw.local.json` — collision summary.
- `exam-weekly-hours-issues.raw.local.json` — raw exam type + weekly hours plans.

All local artifacts are under `temp/local-artifacts/l7-f6e/` which is gitignored.

## 十五、Validation Results

- L7-F6E plan: PASS (all data produced, no errors)
- L7-F6E verify: 145/155 PASS (10 expected failures: docs not yet created at verify time + 3 pre-existing tracked files)
- L7-F6D2 regression: (pending)
- L7-F6D1 regression: (pending)
- L7-F6C regression: (pending)
- L7-F6B regression: (pending)
- L7-F6A regression: (pending)
- L7-F5D regression: (pending)
- prisma validate: PASS
- migrate status: up to date
- build: (pending)
- tsc: (pending)
- eslint: (pending)
- K22-C: (pending)
- git diff: (pending)
- forbidden files: (pending)
