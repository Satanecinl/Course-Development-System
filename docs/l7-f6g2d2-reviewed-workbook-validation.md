# L7-F6G2D2-REVIEWED-WORKBOOK-VALIDATION-AND-REMAINING-DECISION-EXPANSION

> Stage: `L7-F6G2D2-REVIEWED-WORKBOOK-VALIDATION-AND-REMAINING-DECISION-EXPANSION`
> Date: 2026-06-23
> Status: **PARTIAL_REMAINING_NEEDS_REVIEW**

## 一、Stage Summary

验证用户人工审核后的 `user-decision-workbook.suggested.xlsx`，325 个 pending composite decisions 中 319 个已填入有效 action 并写入 formal decision file（从 33 扩展到 352），6 个 remaining needsReview items 待后续处理。

## 二、DB Baseline (before and after)

```text
Course = 104, Teacher = 236, ClassGroup sem1 = 36, ClassGroup sem4 = 406
TeachingTask sem4 = 0, TeachingTaskClass = 446, ScheduleSlot sem4 = 0
ImportBatch total = 39, ImportBatch #39 = APPLIED, ImportBatch #40 = absent
```

**No changes.**

## 三、Workbook Import Results

```text
rowsWithAction:                325
acceptedNewDecisions:          319
needsReviewItems:              6 (5 ambiguousTeacher + 1 ambiguousMapping)
invalidRows:                   0
invalidActions:                0
rowsMissingSelectedExistingId:  0
rowsMissingEditedValue:         0
highRiskApproveMissingNote:     0
duplicateCompositeDecisionKeys: 0
```

## 四、Decision File Status

```text
formalDecisionCountBefore:  33
formalDecisionCountAfter:   352
totalDecisionItems:         358
decidedItems:               352
pendingItems:               6
readyForControlledWrite:    false
```

### Accepted 319 breakdown by action

```text
manualSelect:   207 (mostly DuplicateRisk_204 rows)
manualEdit:      98 (mostly Ambiguous_98 rows with editedValue)
approve:         11 (External_21 + DuplicateRisk approved)
skip:             3 (External_21 skipped)
```

## 五、Remaining 6 needsReview Items

### 5 ambiguousTeacher

| decisionId | reason |
|---|---|
| `85af8665960c794e` | Two teachers but source has no task assignment — cannot auto-split |
| `dcab9c9111a2116d` | `1,2:teacherA;3,4:teacherB` pattern — needs row-level expansion or user selection |
| `6a9018730359997a` | `1,2:teacherA;3,4:teacherB` pattern — needs row-level expansion or user selection |
| `5f4ee2d0cdd7cd1d` | Messy source text — needs manual interpretation |
| `7081a99ebaea8ae6` | `1:|2班李源` — 1班 teacher missing, cannot auto-assign |

### 1 ambiguousMapping aggregate

| decisionId | reason |
|---|---|
| `ambiguousMapping-aggregate` | Aggregate of 63 merge-remark rows. Cannot assign a single ClassGroupId. Must expand to row-level decisions. |

**ambiguousMappingAggregateStatus: NOT_EXPANDED_TO_ROW_LEVEL**

## 六、No-Write Proof

```text
DB write: NONE
backup: NONE
apply: NONE
ImportBatch/Course/Teacher/ClassGroup/TeachingTask/TTC/ScheduleSlot: 0 created
```

## 七、Validation Results

```text
prisma validate: PASS
migrate status: up to date
build: PASS
tsc: PASS
scan:docs-pii: PASS
```

## 八、G2 Intake Verification

```text
decidedItems:     352 (composite)
pendingItems:     59 (= 6 needsReview + 53 row-level expansion per G2C0 reconciliation)
invalidItems:     0
readyForControlledWrite: false
```

## 九、Blocking Reasons

1. 5 ambiguousTeacher items still needReview (see §五)
2. 1 ambiguousMapping-aggregate needs row-level expansion (63 rows → 63 individual decisions)
3. `readyForControlledWrite = false`

## 十、DB Baseline After

```text
Course = 104, Teacher = 236, ClassGroup sem4 = 406
No changes.
```

## 十一、Conclusion

- L7-F6G2D2 can close: YES (as partial progress)
- readyForControlledWrite: false
- can enter L7-F6H: **NO** (6 pending items)
- can enter L7-F7: NO
- can enter L7-G: NO
- next stage: resolve remaining 5 ambiguousTeacher needsReview + expand ambiguousMapping aggregate to row-level
