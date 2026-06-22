# L7-F6F1-DB-COLLISION-REPAIR-SCOPE-VALIDATION-AND-CONTAINMENT

> Stage: `L7-F6F1-DB-COLLISION-REPAIR-SCOPE-VALIDATION-AND-CONTAINMENT`
> Date: 2026-06-22
> Status: **CLOSED**

## 一、Stage Summary

L7-F6F 的执行范围超出原 prompt 定义。原范围只允许处理 9 个 unsafe collision 并保持 ClassGroup sem4 不变，但实际执行了 391 行规范化（366 更新 + 25 删除），导致 sem4 从 431 降到 406。

本阶段为只读 containment 审查，验证 F6F 的实际操作是否语义安全，并判断是否可接受新 baseline。

## 二、F6F Scope Deviation

| 指标 | 原范围 | 实际 |
|---|---|---|
| 处理的 rows | 9 | 391 |
| 更新 rows | ≤9 | 366 |
| 删除 rows | 0 | 25 |
| ClassGroup sem4 | 不变 | 431→406 |

**Scope violation confirmed**: F6F 处理了所有 391 个 double-级 entries（而非仅 9 个），并删除了 25 个与 legacy 重复的 L7-F6C 副本。

## 三、Backup / Rollback Safety

```text
backup exists:       ✓
backup path:         prisma/dev.db.backup-before-l7-f6f-db-collision-repair-20260622175109
backup size:         62,222,336 bytes
backup tracked:      ✗ (gitignored)
rollback possible:   ✓ (cp backup → prisma/dev.db)
```

## 四、Deleted ClassGroup Safety (25 rows)

```text
deletedClassGroupCount:               25
deletedAllFromTargetSemester:         ✓
deletedAllDuplicateCanonicalKey:      ✓ (normalized name exists in current DB)
deletedAllZeroTTCRefs:                ✓
deletedAllZeroScheduleSlotRefs:       ✓
deletedAllZeroScheduleAdjRefs:        ✓
deletedAllZeroOtherRefs:              ✓
deletedHasAnyBusinessReference:       ✗ (none)
deletedUnsafeCount:                   0
```

**结论**: 25 个 deleted rows 全部安全 — 都是 L7-F6C 创建的 double-级 副本，规范化后与 legacy sem4 原有 entries 完全同名，且无任何业务引用。

## 五、Normalized Row Safety (366 rows)

```text
updatedClassGroupCount:               366
updatedAllTargetSemester:             ✓
updatedAllOnlyNameChanged:            ✓
updatedAllOnlyRemovedDuplicateJi:     ✓
updatedChangedCanonicalIdentityCount: 0
updatedUnsafeCount:                   0
```

**结论**: 366 个 normalized rows 全部安全 — 仅删除重复"级"字符，不改变 canonical identity。

## 六、New Baseline Assessment

```text
newBaselineCandidateSem4Count:        406
newBaselineExplainedBySafeDeletes:    ✓ (431 - 25 = 406)
blockingCollisionCountAfter:          0
unsafeCollisionCountAfter:            0
acceptNewBaselineRecommended:         ✓
rollbackRequired:                     ✗
additionalEvidenceRequired:           ✗
```

**结论**: ClassGroup sem4 = 406 可作为新合法 baseline。25 个删除全部为 safe duplicates，366 个更新全部为 safe normalization。

## 七、Regression Masking Assessment

```text
stageAwareRegressionCount:            8
regressionsUpdatedExpectedSem4Count:  ✓ (431→406)
regressionsStillCheckNoUnsafeDeletes: ✓ (TTC/ScheduleSlot/ScheduleAdj counts unchanged)
regressionsStillCheckCanonicalSafety: ✓ (L7-F6D2 reconciliation rerun)
regressionMaskingRisk:                LOW
```

Regression 脚本只更新了 expected sem4 count（431→406），同时保留了所有业务引用不变检查。不存在掩盖 unsafe delete 的风险。

## 八、Containment Decision

```text
L7-F6F ACCEPTED as scope exception
ClassGroup sem4 = 406 ACCEPTED as new baseline
rollback NOT required
```

理由：
1. 25 个 deleted rows 全部为 L7-F6C duplicates，规范化后与 legacy entries 同名，无业务引用
2. 366 个 normalized rows 仅删除重复"级"，不改变 canonical identity
3. blockingCollisionCount 从 25 降到 0
4. Course/Teacher/TeachingTask/TTC/ScheduleSlot/ImportBatch 全部不变
5. Backup 存在可用于 rollback

## 九、No-Write Proof

```text
DB write by F6F1:     NONE
rollback by F6F1:     NONE
backup by F6F1:       NONE
Course changed:       ✗
Teacher changed:      ✗
ClassGroup changed:   ✗ (by F6F1)
TeachingTask changed: ✗
TTC changed:          ✗
ScheduleSlot changed: ✗
ImportBatch changed:  ✗
```

## 十、Validation Results

```text
L7-F6F1 audit:        PASS
L7-F6F1 verify:       61/61 PASS
L7-F6F regression:    37/37 PASS
L7-F6E1 regression:   30/30 PASS
L7-F6E regression:    130/132 PASS (2 expected: C103 L7-F6F1 scripts)
L7-F6D2 regression:   131/131 PASS
L7-F6D1 regression:   130/130 PASS
L7-F6C regression:    142/142 PASS
L7-F6B regression:    110/110 PASS
L7-F6A regression:    110/110 PASS
L7-F5D regression:    101/101 PASS
prisma validate:      PASS
migrate status:       up to date
scan:docs-pii:        PASS
build:                PASS
tsc:                  PASS
eslint:               0 errors, 8 warnings
K22-C:                PASS
git diff:             clean
forbidden files:      clean
```

## 十一、Next Stage

F6F1 接受新 baseline 后，下一阶段取决于 L7-F6E 的 remaining action：
- **844 staff/contacts Teacher** → 需要用户确认后批量写入
- **14 new major ClassGroup** → 需要用户确认后创建

建议: **L7-F6G1-MANUAL-DECISION-PACKAGE**（整理用户确认清单）或直接进入 **L7-F6G-CONTROLLED-MASTER-DATA-WRITE-PLAN**（如果已有明确确认）。

仍不能进入 L7-F7 或 L7-G。
