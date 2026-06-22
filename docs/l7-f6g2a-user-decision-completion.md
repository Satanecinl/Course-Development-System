# L7-F6G2A-USER-DECISION-COMPLETION

> Stage: `L7-F6G2A-USER-DECISION-COMPLETION`
> Date: 2026-06-22
> Status: **CLOSED (DRAFT_REQUIRES_USER_CONFIRMATION)**

## 一、Stage Summary

只读生成 L7-F6G2 pending decisions 的 draft 包，将 358 个 pending items 分层为：
- 可批量确认（低风险）
- 必须人工选择（duplicate risk, ambiguous, external）
- 必须补值（weeklyHours, ambiguousMapping）
- 建议跳过（external generic, skip rows）

不写 DB，不把 recommendedAction 自动转成 approval。

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

## 三、Source Artifacts

```text
G1 package found:           true (346 teacher + 8 classGroup + 59 skip + 19 weeklyHours)
G2 write plan found:        true
formal user decision file:  false (no formal file)
source package hash:        d82eb34d5b6de4048deac0b8ab164f1f
```

## 四、Decision Completion Summary

```text
totalDecisionItems:                358
pendingItemsBefore:                358
draftDecisionItems:                358
formalDecisionItems:               0
bulkApprovalCandidates:            22 (low-risk)
autoRejectCandidates:              1 (external generic)
autoSkipCandidates:                1 (skip rows aggregate)
requiresExplicitUserConfirmation:  358
requiresManualSelection:           121
invalidExistingUserDecisions:      0
readyToReRunG2:                    false
readyForControlledWrite:           false
```

## 五、Generated Local Artifacts

```text
temp/local-artifacts/l7-f6g2a/
├── user-decisions.intake.local.draft.json    (editable draft)
├── user-decisions-review.md                  (user-facing Chinese guide)
├── bulk-approval-candidates.csv              (22 low-risk)
├── manual-selection-required.csv             (121 manual items)
├── external-teacher-review.csv               (22 external)
├── duplicate-risk-teacher-review.csv         (204 duplicate risk)
├── classgroup-review.csv                      (8 new major + 1 alias)
├── skip-row-confirmation.csv                 (1 skip aggregate)
└── completion.aggregate.json                 (committed-style aggregate)
```

## 六、User Next Steps

1. Open `temp/local-artifacts/l7-f6g2a/user-decisions.intake.local.draft.json`
2. For each decision item:
   - Low-risk bulk approval → change `currentStatus` to `approve`
   - Duplicate risk → `manualSelect` + fill `selectedExistingId`
   - External teacher generic → `skip`
   - External teacher non-generic → `approve` or `manualEdit` + `editedValue`
   - Ambiguous teacher → `manualSelect` + `selectedExistingId`
   - New major ClassGroup → `approve` or `reject`
   - WeeklyHours → `manualEdit` + `editedValue`
   - AmbiguousMapping → `manualSelect` + `selectedExistingId`
3. Save as `temp/local-artifacts/l7-f6g2/user-decisions.intake.local.json`
4. Re-run G2 intake: `npx tsx scripts/intake-user-decisions-and-plan-write-l7-f6g2.ts --target-semester-id 4`

Only when all pending items are processed, `readyForControlledWrite=true` and stage can proceed to L7-F6H.

## 七、No-Write Proof

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

## 八、Validation Results

- L7-F6G2A verify: 56/56 PASS
- L7-F6G2 regression: 55/55 PASS
- L7-F6G1 regression: 77/77 PASS
- L7-F6F1 regression: 61/61 PASS
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

## 九、Next Stage

L7-F6G2A cannot auto-approve. User must:
1. Edit `user-decisions.intake.local.draft.json`
2. Save as `temp/local-artifacts/l7-f6g2/user-decisions.intake.local.json`
3. Re-run `L7-F6G2-USER-DECISION-INTAKE-AND-WRITE-PLAN`

If ready → L7-F6H-CONTROLLED-MASTER-DATA-WRITE
If still pending → stay in L7-F6G2A

Still cannot enter L7-F7 or L7-G.
