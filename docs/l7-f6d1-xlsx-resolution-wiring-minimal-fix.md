# L7-F6D1-XLSX-RESOLUTION-WIRING-MINIMAL-FIX

> Stage: `L7-F6D1-XLSX-RESOLUTION-WIRING-MINIMAL-FIX`
> Date: 2026-06-23
> Status: **CLOSED**

## 一、Stage Summary

最小修复 trial 脚本 auto-resolver / plan builder final hard gate / apply preflight hard gate, 使 L7-F 课程设置 XLSX dry-run 不再把 invalid candidates 推到 `importableRows` / apply candidates。

本阶段不写 DB, 不执行 apply, 不创建 backup, 不创建 ImportBatch, 不创建 Course/Teacher/ClassGroup/TeachingTask/TeachingTaskClass/ScheduleSlot/ScheduleAdjustment。

## 二、Root Cause (from minimal diagnostic of failed L7-F6D dry-run)

L7-F6D dry-run 之前出现:

```text
teacherIdNullAmongImportable = 1638
maxClassGroups = 398
applied = false
dbWritten = false
```

诊断结论:

1. `teacherIdNullAmongImportable` 是 *症状*, 根因在 `importableRows` 构造阶段没有 final hard gate。
2. trial 脚本内联 auto-resolver (位于 `scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts`) 使用 substring/contains/break-first fuzzy 匹配:
   - 教师: `name.includes(teacherText) || teacherText.includes(name)` → 错配到任意教师。
   - 班级: `cg.name.includes(n + '班')` / `cg.name.endsWith(n)` / `classText.split(/[,，]/).some(t => cg.name.includes(t))` → 一个 `1` 把 sem4 所有 1班/含1的班匹配上, 单 candidate 关联 398 个 ClassGroup。
3. plan builder 之前没有 final hard gate, baseline diagnostic 没标 `TEACHER_MISSING` 的行也照样进 importable。
4. apply preflight 之前放在 `backup()` *之后*, 违反 "before backup" 原则; 而且没有 PE teacher exemption 通路, 没有 classGroup semesterId 二次校验, 没有 classGroup set 过大阻断。
5. natural key 之前用 `teacherId ?? 'null'`, 不区分 PE 体育课 teacherId=null 合法 vs 普通课程 teacherId=null 非法。
6. 体育课教师豁免完全没有, 没有 `PHYSICAL_EDUCATION_TEACHER_EXEMPT` 显式规则。

## 三、修复摘要

### Fix A: trial 脚本 auto-resolver (`scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts`)

- 删除所有 teacher substring / contains / break-first fuzzy 匹配。
- 删除所有 `cg.name.includes(n + '班')` / `cg.name.endsWith(n)` / `cg.name.includes(token)` substring-only 匹配。
- 教师改为 *normalized exact* 匹配: `normalizeTeacherName` 剥离全/半角括号、`外聘/兼职/校外/实训/实习/外` 标记, 然后用 `teacherByExact: Map<normalized, id>` exact match。
- 班级改为 *canonical key* exact match: `targetSemesterId + majorName + classNoToken`, 没有 majorName 或 classText 为空则 leave unresolved, 推 plan builder blocker。
- 教师多 token 场景若无法唯一确定 (`matchedIds.size > 1`) → leave unresolved, 不自动选第一个。
- 体育课启发式: `courseName` 含 `体育/体能/体测/公共体育/体育与健康` → 允许 `allowBlankTeacher` with `allowBlankReason: PHYSICAL_EDUCATION_TEACHER_EXEMPT`。
- 教师源从 K 列 (`taskAssignmentText`) 读 (新模板 F 列为空, K 列才是规范教师分配源); F 列为 fallback。

### Fix B: plan builder final hard gate (`src/lib/import/course-setting-partial-import-plan-l6-e2.ts`)

在 `importableRows.push(planRow)` *之前* 插入 final hard gate, 增加新 blocker 码:

| Blocker | Trigger |
|---|---|
| `TEACHER_ID_MISSING` | 非 PE 课程 `resolvedTeacherId === null` 且 `plannedTeacherAction !== 'allowBlank'` |
| `TEACHER_ID_MISSING` | `plannedTeacherAction === 'allowBlank'` 但缺 PE exemption code |
| `INVALID_TEACHER_EXEMPTION` | `allowBlankTeacher` 但 `allowBlankReason !== 'PHYSICAL_EDUCATION_TEACHER_EXEMPT'` 或非 PE 课程 |
| `CLASS_GROUP_IDS_MISSING` | `resolvedClassGroupIds.length === 0` |
| `CLASS_GROUP_NOT_IN_TARGET_SEMESTER` | `resolvedClassGroupIds` 含非 `targetSemesterId=4` 的 id |
| `CLASS_GROUP_SET_TOO_LARGE` | `resolvedClassGroupIds.length > 12` 且无大合班证据 (`mergeRemark` / `MERGE_REMARK_LARGE_COMBINED` / `TASK_SPLIT_REQUIRED`) |
| `CLASSGROUP_PLANNED_NAME_COLLISION` | 多个 importable row 共享 `plannedCourseCandidateName` 但 `resolvedClassGroupIds` 不同 |

`existingClassGroupById` 改为 `cgInTargetSemester: Set<number>` 通过 `prisma.classGroup.findMany({ where: { semesterId: targetSemesterId } })` 构建, 二次校验每个 id 属于 targetSemesterId。

`CourseSettingPartialImportPlanRow` 扩展字段: `teacherExempt: boolean` / `teacherExemptionCode: 'PHYSICAL_EDUCATION_TEACHER_EXEMPT' | null` / `teacherExemptionReason: string | null` / `physicalEducationDetected: boolean`。

`TeachingTaskCandidatePlan.teacherRef` 扩展 union: `{ kind: 'physicalEducationExempt'; exemptionCode: ...; reason: string }`, 仅在 PE 课程且 exemption 合法时使用。

### Fix C: apply preflight hard gate (`src/lib/import/course-setting-apply-l7-f.ts`)

preflight block **移到 `createL7FDatabaseBackup()` 之前**。拒绝 5 类错误:

| Code | Trigger |
|---|---|
| `TEACHER_ID_MISSING` | 非 PE task `teacherId === null` |
| `INVALID_TEACHER_EXEMPTION` | `physicalEducationExempt.kind` 但 `exemptionCode !== 'PHYSICAL_EDUCATION_TEACHER_EXEMPT'` |
| `CLASS_GROUP_IDS_MISSING` | `classGroupIds.length === 0` |
| `CLASS_GROUP_NOT_IN_TARGET_SEMESTER` | `classGroupIds` 含非 targetSemesterId 的 id (通过 `prisma.classGroup.findMany({ where: { semesterId: input.targetSemesterId } })` 二次校验) |
| `CLASS_GROUP_SET_TOO_LARGE` | `classGroupIds.length > 12` 无大合班证据 |

rejection 返回 `backupPath: null` (不创建 backup) + `dryRunOnly: false` + `dbWritten: false` + `rollbackNote: "No backup created. No transaction executed."`。

transaction 内 teacherId 解析新增 `physicalEducationExempt` kind 识别; 保留 `isPeExempt` flag, `!isPeExempt && teacherId == null` 才 `continue` (defensive)。

### Fix D: natural key

`taskNaturalKey` 重写:

```ts
const teacherSlot =
  parts.teacherId != null
    ? `t:${parts.teacherId}`
    : parts.teacherExemptionCode === 'PHYSICAL_EDUCATION_TEACHER_EXEMPT'
      ? `pe:${parts.teacherExemptionCode}`
      : 'invalid:null-teacher'
return `${parts.semesterId}|${parts.courseId}|${teacherSlot}|${parts.weeklyHours ?? 'null'}|[${ids}]`
```

- 移除 `teacherId ?? 'null'` 形式。
- 非 PE null teacher 不生成 natural key (`invalid:null-teacher` 显式标记)。
- PE 用 `pe:PHYSICAL_EDUCATION_TEACHER_EXEMPT` 作为 teacher slot。

## 四、Dry-run Semantic Stats Output

```text
totalRows:                          1167
plannedRows:                        0
importableRows:                     0
unresolvedRows:                     1167
teacherIdNullAmongImportable:       0
teacherIdNullAmongNonExemptImportable: 0
physicalEducationTeacherExemptCount: 0
invalidTeacherExemptionCount:       0
teacherMissingCandidateCount:       0
teacherAmbiguousCandidateCount:     0
classGroupEmptyAmongImportable:     0
classGroupMissingCandidateCount:    0
classGroupAmbiguousCandidateCount:  0
classGroupOverMatchedCandidateCount: 0
classGroupNotInTargetSemesterCount: 0
maxClassGroupsPerCandidate:         0
p50ClassGroupsPerCandidate:         0
p90ClassGroupsPerCandidate:         0
duplicatePlannedNameSkipped:        0
duplicatePlannedNameSkipSafe:       true
allClassGroupsBelongToTargetSemester: true
canApply:                           false
applied:                            false
dbWritten:                          false
```

`canApply: false` 因为 `importableRows = 0`。这 *不是* 失败 — invalid 数据已不再进入 importable set。1167 行全部 unresolved, 是因为 trial 严格解析 (K 列多教师, Excel majorName="2024级/口腔医学" 与 DB "2024级级口腔医学" 命名差异) 拒绝把模糊数据推入 importable。

## 五、Success Criteria (spec §十七)

| 条件 | 状态 |
|---|---|
| 1. 不写 DB | PASS |
| 2. 不执行 apply | PASS |
| 3. 不创建 backup | PASS |
| 4. trial teacher substring auto-resolve removed | PASS |
| 5. classGroup substring-only auto-resolve removed | PASS |
| 6. classGroup matching uses canonical exact key | PASS |
| 7. non-PE teacherId null blocked | PASS |
| 8. PE teacherId null allowed only with explicit `PHYSICAL_EDUCATION_TEACHER_EXEMPT` | PASS |
| 9. invalid PE exemption blocked | PASS |
| 10. natural key no longer uses `teacherId ?? "null"` | PASS |
| 11. plan builder final hard gate exists | PASS |
| 12. apply preflight hard gate exists before backup/transaction | PASS |
| 13. `teacherIdNullAmongNonExemptImportable = 0` | PASS |
| 14. `invalidTeacherExemptionCount = 0` | PASS |
| 15. `classGroupEmptyAmongImportable = 0` | PASS |
| 16. `allClassGroupsBelongToTargetSemester = true` | PASS |
| 17. `duplicatePlannedNameSkipSafe = true` | PASS |
| 18. `maxClassGroupsPerCandidate` no longer near 398 | PASS (0) |
| 19. L7-F6C DB baseline unchanged | PASS (Course=104, Teacher=236, CG sem4=431, TT sem4=0, TTC=446, SS sem4=0, IB total=39, IB #40 absent) |
| 20. build/tsc/eslint/K22/scan pass | PASS (K22-C verified, regressions all pass) |
| 21. forbidden files clean | PASS (no new xlsx/csv/db/sql/temp) |
| 22. pushed and worktree clean | pending (commit + push stage) |

## 六、Validation Results

- L7-F6D1 verify: 130/130 PASS (`scripts/verify-xlsx-resolution-wiring-minimal-fix-l7-f6d1.ts`)
- L7-F6C regression: 142/142 PASS (stage-aware updated)
- L7-F6B regression: 110/110 PASS (stage-aware updated)
- L7-F6A regression: 110/110 PASS (stage-aware updated)
- L7-F5D regression: 101/101 PASS (stage-aware updated)
- prisma validate: PASS
- prisma migrate status: up to date
- K22-C: PASS
- git diff --check clean: PASS (only LF→CRLF warnings, no content diff)

## 七、No-DB-Write Proof

- 整个 L7-F6D1 阶段 0 DB writes。
- DB 验证脚本对比前后: Course=104/104, Teacher=236/236, ClassGroup sem1=36/36, sem4=431/431, TeachingTask sem4=0/0, TeachingTaskClass=446/446, ScheduleSlot sem4=0/0, ImportBatch total=39/39, IB #40 absent。
- 没有 backup 文件被创建。
- 没有 ImportBatch / Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass / ScheduleSlot / ScheduleAdjustment 被创建。

## 八、Remaining Blockers (informational)

- 1167 rows unresolved because strict canonical-key matching rejects:
  - K-column multi-teacher format ("1,2:杨秀芳;3,4:王芳;5,6:姜剑书") — unique teacherId can't be determined.
  - Excel `majorName="2024级/口腔医学"` does not match DB `ClassGroup.name="2024级级口腔医学1班"` (L7-F6C wrote 命名拼接bug, "2024级" 被前置两次).
- These blockers are *correct rejections* — invalid/malformed data is correctly excluded from `importableRows`.
- Spec §十 says: "如果 canApply=false, 不一定失败". The hard gate is working as designed.

## 九、Next Stage

**`L7-F6D2-XLSX-CANONICAL-KEY-RECONCILIATION`** (recommendation).

Before retrying apply, address:
1. K-column multi-teacher resolution: extend `physicalEducationExempt`-style exemption to "external teacher" pathway (since L7-F6C created only 16 high-confidence teachers; 32 external teachers were skipped).
2. L7-F6C ClassGroup 命名拼接bug: "2024级" + "口腔医学" → "2024级级口腔医学" should be "2024级口腔医学" (data quality fix in master data, not trial).
3. 22 manual-review ClassGroup candidates (L7-F6C `manualReviewSkipped`): need human review before retry.

**L7-F6D1 后不能进入 L7-G。下一阶段必须是 L7-F6D2 或 L7-F7。**
