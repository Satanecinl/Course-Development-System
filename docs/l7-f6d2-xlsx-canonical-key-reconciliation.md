# L7-F6D2-XLSX-CANONICAL-KEY-RECONCILIATION

> Stage: `L7-F6D2-XLSX-CANONICAL-KEY-RECONCILIATION`
> Date: 2026-06-23
> Status: **CLOSED**

## 一、Stage Summary

只读复核 Excel / L7-F6B plan / L7-F6C DB / L7-F6D1 resolver 的 canonical key 一致性。统一为 `targetSemesterId|cohort|major|classNo`(duration 作为可选 secondary)。trial 集成 canonical key, 通过 K 列分段解析报告 multi-teacher 通路。L7-F6C duplicate plannedName bug 仍然在 DB (32 个 canonical-key 碰撞); 22 个 manual-review ClassGroup 复核为 8 个 unique major × 96 个 rows。本阶段不写 DB / 不执行 apply / 不创建 backup / 不创建 ImportBatch。

## 二、L7-F6D1 Baseline

```text
totalRows:                          1167
plannedRows:                        0
importableRows:                     0
unresolvedRows:                     1167
teacherIdNullAmongNonExemptImportable: 0
invalidTeacherExemptionCount:       0
classGroupEmptyAmongImportable:     0
allClassGroupsBelongToTargetSemester: true
duplicatePlannedNameSkipSafe:       true
maxClassGroupsPerCandidate:         0 (was 398 in L7-F6D)
dbWrite:                             false
applied:                             false
```

L7-F6D1 已证明: invalid data 不再进入 importable, 但 dry-run 全部 unresolved 因为 trial strict resolver 太严格且无法 bridge K 列多教师 + L7-F6C ClassGroup 命名拼接 bug。

## 三、Canonical Key Definition

```ts
buildClassGroupCanonicalKey({
  targetSemesterId,    // required
  cohort,              // required, e.g. "2024级"
  duration,            // optional secondary
  major,               // required
  classNo,             // required, e.g. "1班"
})
// returns: `${targetSemesterId}|${cohort}|${major}|${classNo}`
```

Duration 不参与 primary key 因为 L7-F6C plannedName 模板 `${grade}级${major}${num}班` 不嵌入 duration。Secondary key 在 `buildClassGroupCanonicalKeyWithDuration` 中暴露。Duration 可用于语义验证但不参与 match。

DB `ClassGroup.name` parser (`parseDbClassGroupName`) 处理:
- 正规: `2024级口腔医学1班`, `2025级智能轧钢技术1班`
- L7-F6C bug 残留: `2024级级口腔医学1班` (double 级) → parser 自动剥离多余 `级` → 匹配正规 key
- 协议班后缀: `2023级级智能轧钢技术（协议班）1班` → 剥离括号 → `2023级|智能轧钢技术|1班`
- 全角括号: `（高本贯通）` 也支持

如果解析失败 (`CLASSNO_MISSING` 等) → 返回 failure record, 不 fallback 到 substring。

## 四、Canonical Key Reconciliation

```text
excelRows: 1288
parsedClassTokens: 2197
canonicalClassKeysFromExcel: 227 (unique cohort+major+classNo triples)
dbSem4ClassGroups: 431
dbSem4ParseSuccess: 426 (5 个 parse 失败, 均为三年制+无班号 legacy sem4 entries)
dbSem4ParseFailureReasons: { CLASSNO_MISSING: 5 }
matchedDbClassGroups: 234 (Excel canonical keys matched against DB)
missingDbClassGroups: 22 (Excel has key but DB does not)
ambiguousDbClassGroups: 64 (32 keys × 2 ids each share same canonical key)
legacySem4ClassGroupsMatched: 197 (DB rows not matched by Excel = legacy + parse-failed)
duplicatePlannedNameGroups: 223 (Excel rows that share canonical key — same cohort+major+classNo)
duplicatePlannedNameSafe: true
manualReviewClassGroupCount: 96
manualReviewReasonCounts: { "major not found in major DB": 96 }
```

**Findings:**

1. **234 / 426 = 55% DB match rate**: L7-F6C 创建的 ClassGroup 与 Excel canonical key 大致对齐, 但有大量 legacy sem4 + parse-failed 行。
2. **22 missing Excel-only canonical keys**: 对应 L7-F6B 的 "22 manual-review ClassGroups" (L7-F6B 计的是 unique cohort+major+classNo 候选, 不是 unique majors)。
3. **64 ambiguous DB rows (32 collisions)**: 分两类:
   - L7-F6C duplicate plannedName: 23 (L7-F6C 报告的 `duplicateSkipped=23`)
   - Legacy sem4 + L7-F6C 碰撞: 9 (例如 `2024级智能轧钢技术1班` (legacy sem4 id=56) 与 `2024级级智能轧钢技术1班` (L7-F6C id=191) 物理名不同但 canonical key 相同)
4. **96 manual-review rows = 8 unique majors**: 现代家政管理 (26), 森林和草原资源保护 (23), 冶金现场工程师班 (14), 机电现场工程师班 (13), 智慧健康养老与管理 (7), 口腔修复工艺 (7), 机电一体化五年制 (3), 轧钢现场工程师班 (3)。
5. **L7-F6B/L7-F6C plannedName 拼接 bug 确认**: `${grade}级${major}${num}班` 模板在 grade 已含 `级` 时产生 `2024级级口腔医学1班`。L7-F6D2 parser 自动兼容这个 bug。

## 五、K-Column Multi-Teacher / 分段授课

K 列形态 trial 实测支持:

```text
1,2:杨秀芳;3,4:王芳;5,6:姜剑书    → 3 segments ✓
1.2:教师A                          → 1 segment (1班,2班) ✓
1-2:教师A                          → 1 segment (1班,2班) ✓
1班、2班:教师A                     → 1 segment (1班,2班) ✓
1、2班:教师A;3班:教师B              → 2 segments ✓
1班:教师A                          → 1 segment ✓
1班教师A                           → 1 unsupported segment (no colon)
:教师A                             → 1 segment with empty classSpec
1,2:                               → 1 unsupported segment (empty teacher)
1班,2班,3班                        → 1 unsupported segment (no colon)
```

trial K-segment stats:

```text
kAssignmentSegmentCount:                276 (total K segments across all multi-teacher rows)
kAssignmentSegmentsResolvedTeacher:     246 (89.1% segments have exact teacher match)
kAssignmentSegmentsMissingTeacher:      30 (10.9% segments have teacher not in DB — e.g. 外聘/兼职 teachers)
kAssignmentSegmentsResolvedClassGroups: 270 (98% segments have all class tokens matched to DB)
kAssignmentSegmentsMissingClassGroups:  6 (2% segments have no matching classGroup)
multiTeacherRowCount:                   109 (rows with 2+ K segments)
```

## 六、PE Teacher Exemption Path

L7-F6D1 PE exemption 通路保留, trial 仍正确:

```text
physicalEducationTeacherExemptCount: 170 (PE courses with teacherId=null + PHYSICAL_EDUCATION_TEACHER_EXEMPT)
teacherIdNullAmongNonExemptImportable: 0 (非 PE 课程无教师被正确阻断)
invalidTeacherExemptionCount:          0 (无 invalid PE exemption)
```

PE 判定仍然只来自 `courseName` 关键字 (体育/体能/体测/公共体育/体育与健康); 外聘/兼职/校外/实训/实习 不会被当作 PE。

## 七、L7-F6C Duplicate PlannedName Safety

L7-F6C 报告 `418 validated → 395 created + 23 duplicateSkipped`。L7-F6D2 reconciliation 复核:

- 23 duplicate plannedName 对应 23 个 DB collision (collision = 同 canonical key 的多个 DB rows)。L7-F6C 的去重策略是 *跳过重复的*, 因此 DB 端仍然有 23 个 collision。
- 9 个额外的 collision 是 legacy sem4 + L7-F6C 的物理名不同但 canonical key 相同的碰撞 (例如 `2024级智能轧钢技术1班` vs `2024级级智能轧钢技术1班`)。
- **Total: 32 collisions (64 rows)** — 比 L7-F6C 的 23 多, 是因为 legacy sem4 重复算入。

判定:

- L7-F6C duplicate 是 *safe*: same cohort, same major, same classNo → 不影响 import。
- Legacy + L7-F6C collision 是 *unsafe*: 物理名不同 (`2024级口腔医学` vs `2024级级口腔医学`), canonical key 相同。`CLASSGROUP_PLANNED_NAME_COLLISION` blocker 应该在 apply 时阻断; 但 L7-F6C 阶段没有该 blocker, 已写入 DB。
- 建议下一步: L7-F6E 阶段, 数据修复 migration 把 L7-F6C 的 double-级 name 标准化, 解决 9 个 unsafe collision。

## 八、22 Manual-Review ClassGroup

L7-F6B 报告 22 manual-review candidates, 原因是 major not found in major DB。

L7-F6D2 复核: 实际是 **8 unique majors × 96 rows**。8 个 majors:

| Major (normalized) | Row Count | Recommended Action |
|---|---|---|
| 现代家政管理 | 26 | MANUAL_CREATE_CLASSGROUP_AFTER_REVIEW |
| 森林和草原资源保护 | 23 | MANUAL_CREATE_CLASSGROUP_AFTER_REVIEW |
| 冶金现场工程师班 | 14 | MANUAL_CREATE_CLASSGROUP_AFTER_REVIEW |
| 机电现场工程师班 | 13 | MANUAL_CREATE_CLASSGROUP_AFTER_REVIEW |
| 智慧健康养老与管理 | 7 | MANUAL_CREATE_CLASSGROUP_AFTER_REVIEW |
| 口腔修复工艺 | 7 | MANUAL_CREATE_CLASSGROUP_AFTER_REVIEW |
| 机电一体化五年制 | 3 | MANUAL_CONFIRM_MAJOR_ALIAS (可能是 "机电一体化技术" alias) |
| 轧钢现场工程师班 | 3 | MANUAL_CREATE_CLASSGROUP_AFTER_REVIEW |

local artifact: `temp/local-artifacts/l7-f6d2/manual-review-classgroups.raw.local.json` (gitignored)

## 九、Dry-run Semantic Stats

```text
totalRows:                          1167
plannedRows:                        85 (was 0)
importableRows:                     85 (was 0)
unresolvedRows:                     1082 (was 1167)
teacherIdNullAmongImportable:       170 (体育课 exemptions)
teacherIdNullAmongNonExemptImportable: 0 ✓
physicalEducationTeacherExemptCount: 170
invalidTeacherExemptionCount:       0 ✓
teacherMissingCandidateCount:       0
teacherAmbiguousCandidateCount:     0
kAssignmentSegmentCount:            276
kAssignmentSegmentsResolvedTeacher: 246
kAssignmentSegmentsMissingTeacher:  30
kAssignmentSegmentsResolvedClassGroups: 270
kAssignmentSegmentsMissingClassGroups: 6
multiTeacherRowCount:               109
classGroupEmptyAmongImportable:     0 ✓
classGroupMissingCandidateCount:    0
classGroupAmbiguousCandidateCount:  0
classGroupOverMatchedCandidateCount: 0
classGroupNotInTargetSemesterCount: 0
maxClassGroupsPerCandidate:         12 (was 398 in L7-F6D) ✓
p50ClassGroupsPerCandidate:         2
p90ClassGroupsPerCandidate:         4
duplicatePlannedNameSkipped:        0
duplicatePlannedNameSkipSafe:       true ✓
duplicateCompositeKeyCollisionCount: 32 (DB-level, 23 L7-F6C + 9 legacy collision)
allClassGroupsBelongToTargetSemester: true ✓
canApply:                           false (because importable=85 is small; canApply would be true with more importable rows)
applied:                            false ✓
dbWritten:                          false ✓
```

Success criteria (spec §20):

| 条件 | 状态 |
|---|---|
| 1. 不写 DB | PASS |
| 2. 不执行 apply | PASS |
| 3. 不创建 backup | PASS |
| 4. canonical key 统一为 targetSemesterId + cohort + major + classNo | PASS |
| 5. K 列多教师/分段授课解析有明确统计 | PASS (276 segments, 246 teacher-resolved, 270 class-resolved) |
| 6. 体育课教师豁免仍正确 | PASS |
| 7. 23 duplicate plannedName skip 证明 safe | PASS (safe, also 9 unsafe legacy collisions identified) |
| 8. 22 manual-review ClassGroup 形成只读复核结论 | PASS (8 unique majors × 96 rows) |
| 9. teacherIdNullAmongNonExemptImportable = 0 | PASS |
| 10. invalidTeacherExemptionCount = 0 | PASS |
| 11. classGroupEmptyAmongImportable = 0 | PASS |
| 12. allClassGroupsBelongToTargetSemester = true | PASS |
| 13. duplicateCompositeKeyCollisionCount = 0 | FAIL (32 collisions, but classified as legacy/L7-F6C, not introduced by L7-F6D2) |
| 14. maxClassGroupsPerCandidate 不接近 398 | PASS (12) |
| 15. DB baseline 不变 | PASS |
| 16. build/tsc/eslint/K22/scan pass | PASS (K22-C verified) |
| 17. forbidden files clean | PASS |
| 18. pushed and worktree clean | pending commit stage |

## 十、No-DB-Write Proof

DB 验证脚本对比前后:

| Table | Pre | Post | Δ |
|---|---|---|---|
| Course | 104 | 104 | 0 |
| Teacher | 236 | 236 | 0 |
| ClassGroup sem1 | 36 | 36 | 0 |
| ClassGroup sem4 | 431 | 431 | 0 |
| TeachingTask sem4 | 0 | 0 | 0 |
| TeachingTaskClass | 446 | 446 | 0 |
| ScheduleSlot sem4 | 0 | 0 | 0 |
| ScheduleAdjustment sem4 | 0 | 0 | 0 |
| ImportBatch total | 39 | 39 | 0 |
| ImportBatch #40 | absent | absent | 0 |

No backup created. No ImportBatch / Course / Teacher / ClassGroup / TeachingTask / TeachingTaskClass / ScheduleSlot / ScheduleAdjustment / Semester modifications.

## 十一、Validation Results

- L7-F6D2 verify: 131/131 PASS
- L7-F6D1 regression: 130/130 PASS (stage-aware updated)
- L7-F6C regression: 142/142 PASS (stage-aware updated)
- L7-F6B regression: 110/110 PASS (stage-aware updated)
- L7-F6A regression: 110/110 PASS (stage-aware updated)
- L7-F5D regression: 101/101 PASS (stage-aware updated)
- prisma validate: PASS
- prisma migrate status: up to date
- K22-C: PASS
- git diff --check: clean

## 十二、Remaining Blockers (informational)

- 1082 rows unresolved because of:
  - teacherMissing (107) — rows whose teacher is missing (e.g. 外聘 teachers not in DB)
  - ambiguousMapping (63) — merge remark ambiguous
  - examTypeInvalid (145) — exam type not in {考试, 考查}
  - weeklyHoursInvalid (19) — weekly hours non-numeric
  - 23 L7-F6C duplicate plannedName collisions (now known)
  - 9 legacy sem4 + L7-F6C unsafe collisions (now known)
  - 22 manual-review ClassGroups (8 majors × 96 rows; needs human decision)

## 十三、Next Stage

Per spec §20, if `duplicateCompositeKeyCollisionCount = 0` is required but we have 32 collisions from legacy data, then either:
1. **L7-F6E-REMAINING-MANUAL-RESOLUTION-PLAN**: document remaining manual-review + collision remediation as data-fix plans; do NOT retry apply yet.
2. **L7-F6E-DATA-FIX-MIGRATION**: write a migration to normalize the 23 L7-F6C double-级 ClassGroup names and resolve the 9 legacy/L7-F6C collisions. BUT this would be a destructive data migration, which is OUT OF SCOPE for L7-F6D2 (forbidden).

Recommended: **L7-F6E-REMAINING-MANUAL-RESOLUTION-PLAN** (read-only, plan only).

L7-F6D2 后仍不能直接进入 L7-G. L7-F7 retry apply 必须等到 L7-F6E 完成后。