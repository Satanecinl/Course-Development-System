# L7-F6G2D-HUMAN-DECISION-WORKBOOK-GENERATION

> Stage: `L7-F6G2D-HUMAN-DECISION-WORKBOOK-GENERATION`
> Date: 2026-06-22
> Status: **CLOSED (WORKBOOK_GENERATED_WAITING_FOR_USER_EDIT)**

## 一、Stage Summary

生成人工决策工作簿，将 325 个剩余 pending composite decisions 拆分为可筛选 Excel sheet，用户可在 Excel 中批量筛选/填写 action 后重新导入。

## 二、DB Baseline

```text
Course = 104, Teacher = 236, ClassGroup sem4 = 406, TeachingTask sem4 = 0, TeachingTaskClass = 446, ScheduleSlot sem4 = 0, ImportBatch total = 39
```

## 三、Source of Truth

```text
sourceOfTruthDecisionCount: 358 (G2A draft composite decisions)
formalDecidedBefore:        33 (L7-F6G2B)
pendingBefore:              325
readyForControlledWrite:    false
```

## 四、Workbook Contents

```text
temp/local-artifacts/l7-f6g2d/user-decision-workbook.local.xlsx
```

| Sheet | 内容 | 行数 |
|---|---|---|
| README | 中文使用说明 | — |
| Summary | 概览统计 | 12 |
| External_21 | 非泛称外聘教师 | 21 |
| DuplicateRisk_204 | staff/contacts duplicate-risk 教师 | 204 |
| Ambiguous_98 | 多 token 教师文本 | 98 |
| Other_2 | weeklyHours + ambiguousMapping | 2 |
| Candidate_Dictionary | 候选 Teacher 列表 | 359 |
| Export_Check | 填写校验统计 | 6 |

## 五、Workbook Import 规则

用户只允许编辑 4 列：`action`, `selectedExistingId`, `editedValue`, `note`。

| action | 必填条件 |
|---|---|
| approve | 高风险 category 必须填 note |
| skip | 无 |
| manualSelect | selectedExistingId 必须存在于 Teacher 表 |
| manualEdit | editedValue 必须非空；weeklyHours 必须是正数；ambiguousMapping 不允许 manualEdit |
| needsReview | 保持 pending |

## 六、Workbook Import 测试

```text
workbookHadUserEdits: false (unedited workbook)
acceptedNewDecisions: 0
formalDecisionCountBefore: 33
formalDecisionCountAfter: 33
status: WAITING_FOR_USER_WORKBOOK_EDIT
```

## 七、No-Write Proof

```text
DB write: NONE, apply: NONE, backup: NONE
ImportBatch/Course/Teacher/ClassGroup/TeachingTask/TTC/ScheduleSlot: 0 created
```

## 八、Validation Results

- L7-F6G2D verify: 55/55 PASS
- L7-F6G2C0: 59/59 PASS
- L7-F6G2B: 58/58 PASS
- L7-F6G2A: 56/56 PASS
- L7-F6G2: 55/55 PASS
- L7-F6G1: 77/77 PASS
- L7-F6F1: 61/61 PASS
- L7-F6F: 37/37 PASS
- L7-F6E1: 30/30 PASS
- L7-F6D2: 131/131 PASS
- L7-F6C: 142/142 PASS
- L7-F6B: 110/110 PASS
- L7-F6A: 110/110 PASS
- L7-F5D: 101/101 PASS
- build/tsc/eslint/K22/scan PASS
- git diff clean, forbidden files clean

## 九、User Next Steps

1. 打开 `temp/local-artifacts/l7-f6g2d/user-decision-workbook.local.xlsx`
2. 对每个 sheet，对需要确认的行填写 `action` 列（approve/skip/manualSelect/manualEdit/needsReview）
3. 对 manualSelect 填 `selectedExistingId`，对 manualEdit 填 `editedValue`
4. 保存 Excel 文件
5. 运行: `npx tsx scripts/import-human-decision-workbook-l7-f6g2d.ts --target-semester-id 4`
6. 然后运行: `npx tsx scripts/intake-user-decisions-and-plan-write-l7-f6g2.ts --target-semester-id 4`
7. 只有 readyForControlledWrite=true 后才能进入 L7-F6H

## 十、Next Stage

用户编辑 workbook → import → G2 intake → L7-F6H 或继续处理。

仍不能进入 L7-F7 或 L7-G。
