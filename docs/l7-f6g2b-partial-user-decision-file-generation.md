# L7-F6G2B-PARTIAL-USER-DECISION-FILE-GENERATION

> Stage: `L7-F6G2B-PARTIAL-USER-DECISION-FILE-GENERATION`
> Date: 2026-06-22
> Status: **CLOSED (PARTIAL_DECISIONS_PENDING)**

## 一、Stage Summary

只读从 L7-F6G2A draft 生成 33 项 partial formal decisions，保留其余 325 项为 pending。同时发现 G2 intake 必须升级为 composite key `(category, decisionId)`，因为 22 个 decisionId 跨 category 重复但 composite key 仍唯一。

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

## 三、Composite Key Integrity

```text
duplicateDecisionIdAcrossCategories:  22  (same hash, different category)
duplicateDecisionCompositeKey:        0  (composite key is unique)
g2IntakeUsesCompositeKey:            true
g2IntakeModified:                    true
```

## 四、Partial Decision Generation

```text
sourceDraftFound:                true (358 decisions)
sourcePackageHash:              (preserved)
totalDraftDecisionItems:        358

lowRiskStaffContactsApproved:   22 (BULK_APPROVAL_LOW_RISK)
examTypeApproved:                1 (AUTO_NORMALIZE_EXAM_TYPE)
newMajorClassGroupApproved:      7 (CREATE_CLASSGROUP_AFTER_CONFIRMATION)
majorAliasApproved:              1 (ADD_MAJOR_ALIAS_MAPPING)
genericExternalTeacherSkipped:   1 (EXTERNAL_GENERIC_REJECT)
skipRowApproved:                 1 (SKIP_ROW_LOW_RISK)
totalFormalDecisionsWritten:    33
pendingItemsExpectedAfterPartial: 325
```

## 五、G2 Intake Rerun

```text
userDecisionFileFound:    true
decidedItems:            33
pendingItems:            378
invalidDecisionItems:    0
readyForControlledWrite: false
stageStatus:             PARTIAL_OR_BLOCKED
writePlanHash:           (null, because not ready)
```

注：G2 intake 的 `totalDecisionItems=411` 与 G2A draft 的 `totalDecisionItems=358` 不同 — G2 用的是 G1 package 原始计数 (411 = 346 teacher + 8 CG + 59 skip + 19 weeklyHours + 其他分类)。

## 六、No-Write Proof

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

## 七、Local Artifacts

```text
temp/local-artifacts/l7-f6g2/user-decisions.intake.local.json      (33 partial decisions)
temp/local-artifacts/l7-f6g2b/partial-decision-generation.aggregate.json
temp/local-artifacts/l7-f6g2/g2-intake-validation.local.json      (new, not overwriting decisions)
```

## 八、Validation Results

- L7-F6G2B verify: 58/58 PASS
- L7-F6G2: 55/55 PASS
- L7-F6G2A: 56/56 PASS
- L7-F6G1: 77/77 PASS
- L7-F6F1: 61/61 PASS
- L7-F6F: 37/37 PASS
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

## 九、Next Stage

L7-F6G2B 后仍不能进入 L7-F6H（pending > 0）。

剩余 325 项 pending 决策：
- 204 duplicateRisk teachers
- 21 non-generic external teachers
- 98 ambiguous teachers
- 1 weeklyHours
- 1 ambiguousMapping

下一阶段应处理其中一类：
- **L7-F6G2C-EXTERNAL-TEACHER-DECISION-BATCH** (21 non-generic)
- **L7-F6G2C-DUPLICATE-RISK-TEACHER-MANUAL-SELECTION** (204)
- 或 L7-F6G2C-AMBIGUOUS-TEACHER-DECISION-BATCH (98)

仍不能进入 L7-F7 或 L7-G。
