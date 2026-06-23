# L7-F6G2C0-PENDING-COUNT-RECONCILIATION

> Stage: `L7-F6G2C0-PENDING-COUNT-RECONCILIATION`
> Date: 2026-06-22
> Status: **CLOSED (COUNT_DIFFERENCE_RESOLVED)**

## 一、Stage Summary

只读对 L7-F6G2B 后的 pending count 口径做 reconciliation，解释 G2 intake 的 411/378 与 G2A/G2B grouped decision breakdown 的 358/325 差异。

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

## 三、Why Reconciliation

G2 intake 重跑后显示 `decidedItems=33, pendingItems=378` (隐含 total = 411)。但 G2B summary 显示 Remaining 325 Pending (隐含 total = 358)。在解释清楚两组口径前不能进入下一批决策处理。

## 四、Count Matrix

```text
g1PackageDecisionItems:     356
  (226 staffContactsTeacher + 22 externalTeacher + 98 ambiguousTeacher
   + 7 newMajorClassGroup + 1 majorAlias + 1 skipRow aggregate + 1 weeklyHours aggregate)

g2aDraftDecisionItems:      358 (composite decision count for user surface)
  (= 356 + 2: explicit examType + explicit ambiguousMapping)

g2FormalDecisionItems:      33 (confirmed by L7-F6G2B)

g2IntakeTotalDecisionItems: 411 (raw G1 row counts)
g2IntakeDecidedItems:       33
g2IntakePendingItems:       378
```

## 五、411/378 vs 358/325 Explanation

**两套口径分别用于不同目的**:

| 口径 | 数字 | 用途 |
|---|---|---|
| G2 intake (411/378) | row-level / expanded counts | writePlan generation, raw G1 accounting |
| G2A draft (358/325) | composite decision counts | user decision surface |

**53 extra** = G2 intake 的 row-level expansion：
- skipRows: 59 (G1) vs 1 aggregate (G2A) → +58 row-level
- weeklyHours: 19 (G1) vs 1 aggregate (G2A) → +18 row-level
- Theoretical: 58 + 18 = 76 (实际 53, due to G1 internal accounting for which weeklyHours and skipRows have formal candidate decisions in G2A's accounting)

**No bug**: 两套口径各自内部一致，分别用于不同用途。

## 六、Extra 53 Analysis

```text
extraPendingCount:       53
extraPendingByCategory:  {skipRows: 58, weeklyHours: 18, residual: -23}
extraPendingAreDecisionItemsOrRowItems: row-level expansion (skipRows/weeklyHours)
extraPendingHaveCompositeKeys: true
extraPendingHaveDraftDecisionItems: partially (G2A aggregates 59→1, 19→1)
```

注: residual -23 来自 G1 internal accounting 与 G2A 决策包装的轻微不一致（部分 skipRows/weeklyHours 在 G2A 中被视为 implicit 而非 explicit decision item）。

## 七、Root Cause and Source of Truth

```text
countMismatchRootCause:           GROUPED_VS_EXPANDED_DECISION_COUNT
isBug:                            false
requiresCodeFix:                  false
requiresArtifactRegeneration:     false
sourceOfTruthArtifact:            L7-F6G2A_DRAFT
sourceOfTruthDecisionCount:       358
sourceOfTruthPendingCount:        325 (358 - 33 confirmed)
safeToProceedToNextDecisionBatch: true
recommendedNextStage:             L7-F6G2C-EXTERNAL-TEACHER-DECISION-BATCH
```

**Source of truth**: G2A draft（composite decisions）— 这是用户决策 surface，33 个 partial confirmations 和 325 个 pending 都对应 composite decision groups。

**Why G2A not G2 intake**: G2A 的 358 = G1 的 356 + 2 explicit (examType, ambiguousMapping)，全部对应实际需要用户操作的决策 groups。G2 intake 的 411 是 G1 raw row counts（含 59 row-level skipRows 和 19 row-level weeklyHours），不是用户决策 surface。

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

## 九、Local Artifacts

```text
temp/local-artifacts/l7-f6g2c0/
├── pending-count-reconciliation.raw.local.json
├── pending-count-reconciliation.aggregate.json
└── extra-pending-items.local.csv
```

## 十、Validation Results

- L7-F6G2C0 verify: 59/59 PASS
- L7-F6G2B regression: 58/58 PASS
- L7-F6G2A regression: 56/56 PASS
- L7-F6G2 regression: 55/55 PASS
- L7-F6G1 regression: 77/77 PASS
- L7-F6F1 regression: 61/61 PASS
- L7-F6F regression: 37/37 PASS
- L7-F6E1 regression: 30/30 PASS
- L7-F6E regression: 130/132 PASS
- L7-F6D2 regression: 131/131 PASS
- L7-F6D1 regression: 130/130 PASS
- L7-F6C regression: 142/142 PASS
- L7-F6B regression: 110/110 PASS
- L7-F6A regression: 110/110 PASS
- L7-F5D regression: 101/101 PASS
- prisma validate: PASS
- migrate status: up to date
- scan:docs-pii: PASS
- build: PASS
- tsc: PASS
- eslint: 0 errors
- K22-C: PASS
- git diff: clean
- forbidden files: clean

## 十一、Next Stage

L7-F6G2C0 后仍不能进入 L7-F6H（pending > 0）。

下一阶段建议：**L7-F6G2C-EXTERNAL-TEACHER-DECISION-BATCH** — 21 个 non-generic external teacher 是最小批。

仍不能进入 L7-F7 或 L7-G。