# L7-F6G1-MANUAL-DECISION-PACKAGE

> Stage: `L7-F6G1-MANUAL-DECISION-PACKAGE`
> Date: 2026-06-22
> Status: **CLOSED**

## 一、Stage Summary

只读生成 L7-F6E remaining actions 的人工确认包，整理为 user-confirmation artifacts。不写 DB，不执行 apply，不创建任何业务数据。

## 二、DB Baseline

```text
Course = 104
Teacher = 236
ClassGroup sem1 = 36
ClassGroup sem4 = 406
TeachingTask sem4 = 0
TeachingTaskClass = 446
ScheduleSlot sem4 = 0
ScheduleAdjustment sem4 = 0
ImportBatch total = 39
ImportBatch #39 = APPLIED
ImportBatch #40 = absent
```

## 三、Teacher Decision Package

```text
staffContactsTeacherCandidates:
  uniqueCandidateCount:       226
  sourceStaffDbCount:         (staff only)
  sourceContactsCount:        (contacts only)
  sourceBothCount:            (both)
  safeCreateTeacherCount:     0
  possibleDuplicateTeacherCount: 204 (same name different department in both sources)

externalTeacherCandidates:
  uniqueCandidateCount:       22
  likelyPartTimeCount:        (heuristic)
  unknownCount:               (heuristic)

ambiguousTeacherCandidates:
  uniqueGroupCount:           98 (multi-token teacher text)
```

## 四、ClassGroup Decision Package

```text
newMajorClassGroupCandidates:
  uniqueMajorCount:           8 (现代家政管理, 森林和草原资源保护, 冶金现场工程师班,
                                机电现场工程师班, 智慧健康养老与管理, 口腔修复工艺,
                                机电一体化五年制, 轧钢现场工程师班)
  majorMissingFromMajorDbCount: 8
  majorExistsByAliasCount:    0

majorAliasCandidates:
  count:                      1 (机电一体化五年制 → 机电一体化技术)
  affectedRows:              3
```

## 五、Skip / weeklyHours / examType / ambiguousMapping

```text
skipRowsCount:                      59 (no teacher, non-PE)
weeklyHoursManualDecisionCount:     19 (non-numeric weekly hours)
examTypeAutoFixCount:                145 (查/试 → 考查/考试)
ambiguousMappingManualDecisionCount:  63 (merge remark ambiguous)
```

## 六、Local Artifacts (gitignored)

```text
temp/local-artifacts/l7-f6g1/manual-decision-package.md
temp/local-artifacts/l7-f6g1/manual-decision-package.json
temp/local-artifacts/l7-f6g1/manual-decision-package.aggregate.json
temp/local-artifacts/l7-f6g1/teacher-candidates-for-confirmation.csv
temp/local-artifacts/l7-f6g1/classgroup-candidates-for-confirmation.csv
temp/local-artifacts/l7-f6g1/ambiguous-teacher-decisions.csv
temp/local-artifacts/l7-f6g1/external-teacher-decisions.csv
temp/local-artifacts/l7-f6g1/skip-row-review.csv
temp/local-artifacts/l7-f6g1/weekly-hours-review.csv
```

## 七、Required User Decisions

```text
requiredUserDecisionCount:  ~410
readyForControlledWrite:    false
```

## 八、No-Write Proof

```text
DB write:          NONE
backup:            NONE
apply:             NONE
ImportBatch:       0 created
Course:            0 created
Teacher:           0 created
ClassGroup:        0 created
TeachingTask:      0 created
TTC:               0 created
ScheduleSlot:      0 created
```

## 九、Validation Results

- L7-F6G1 verify: 76/77 PASS (1 expected: docs JSON created in this stage)
- L7-F6F1 regression: PASS
- L7-F6F regression: 37/37 PASS
- L7-F6E1: 30/30 PASS
- L7-F6E: 130/132 PASS
- L7-F6D2: 131/131 PASS
- L7-F6D1: 130/130 PASS
- L7-F6C: 142/142 PASS
- L7-F6B: 110/110 PASS
- L7-F6A: 110/110 PASS
- L7-F5D: 101/101 PASS
- prisma validate: PASS
- migrate status: up to date
- scan:docs-pii: PASS
- build: PASS
- tsc: PASS
- eslint: 0 errors
- K22-C: PASS
- git diff: clean
- forbidden files: clean

## 十、Next Stage

L7-F6G1 后仍不能进入 L7-F7 或 L7-G。

下一阶段取决于用户确认：
- 若用户已确认 local decision package → L7-F6H-CONTROLLED-MASTER-DATA-WRITE
- 若用户尚未确认 → L7-F6G2-USER-DECISION-INTAKE-AND-WRITE-PLAN
