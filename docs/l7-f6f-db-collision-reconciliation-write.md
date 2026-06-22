# L7-F6F-CONTROLLED-DB-COLLISION-RECONCILIATION-WRITE

> Stage: `L7-F6F-CONTROLLED-DB-COLLISION-RECONCILIATION-WRITE`
> Date: 2026-06-22
> Status: **CLOSED**

## 一、Stage Summary

受控修复 L7-F6C 创建的 391 个 sem4 ClassGroup 中 double-级 命名问题（如 `2024级级口腔医学1班` → `2024级口腔医学1班`）。修复分两类：
- **366 行**：规范化 `级级 → 级`，规范化后不与任何已有 ClassGroup 名称冲突（纯更新）。
- **25 行**：规范化后与 legacy sem4 原有 ClassGroup 名称完全相同，且无 TeachingTaskClass 引用（安全删除）。

修复后 double-级 数量从 391 降到 0，canonical key collision 从 25 降到 0。

## 二、DB Baseline (before)

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
ImportBatch #39 = APPLIED
ImportBatch #40 = absent
```

## 三、Collision Analysis

```text
double-级 ClassGroups (L7-F6C):   391
  to normalize (no conflict):     366
  to delete (conflict):            25
  TTC refs to delete rows:          0
collisionKeys before:              25
unsafe before:                     25
blocking before:                   25
```

25 个冲突行的模式：legacy sem4 已有 `2024级智能轧钢技术1班`，L7-F6C 又创建了 `2024级级智能轧钢技术1班`。规范化后两者同名，违反 ClassGroup.name 唯一约束。由于 L7-F6C 行无 TeachingTaskClass 引用，可安全删除。

## 四、Repair Execution

```text
mode:               apply
confirm token:      REPAIR_L7_F6F_DB_COLLISIONS
backup:             prisma/dev.db.backup-before-l7-f6f-db-collision-repair-20260622175109
transaction:        yes (prisma.$transaction)
updated rows:       366 (normalize 级级 → 级)
deleted rows:        25 (duplicate of legacy)
created rows:         0
total changed:      391
touched entity:     ClassGroup only
```

## 五、Invalid Token Test

```text
command:        --apply --confirm-token WRONG_TOKEN
rejected:       yes (exit non-zero)
backup created: no
DB write:        no
DB unchanged:    confirmed
```

## 六、Post-audit

```text
double-级 after:       0
collisionKeys after:   0
unsafe after:          0
blocking after:        0
eligibleRepairCount:   0 (nothing left to repair)

Course:              104 (unchanged)
Teacher:             236 (unchanged)
ClassGroup sem1:      36 (unchanged)
ClassGroup sem4:     406 (was 431, minus 25 deleted)
TeachingTask sem4:     0 (unchanged)
TeachingTaskClass:   446 (unchanged)
ScheduleSlot sem4:     0 (unchanged)
ScheduleAdj sem4:      0 (unchanged)
ImportBatch total:    39 (unchanged)
ImportBatch #39:      APPLIED (unchanged)
ImportBatch #40:      absent (unchanged)
```

## 七、Regression Results

| Script | Result |
|---|---|
| L7-F6F verify | 37/37 PASS |
| L7-F6E1 regression | 30/30 PASS |
| L7-F6E regression | 153/155 PASS (2 expected: C103 allowed-file-list) |
| L7-F6D2 regression | 131/131 PASS |
| L7-F6D1 regression | 130/130 PASS |
| L7-F6C regression | 142/142 PASS |
| L7-F6B regression | 110/110 PASS |
| L7-F6A regression | 110/110 PASS |
| L7-F5D regression | 101/101 PASS |

Note: L7-F6E/L7-F6D2/L7-F6D1/L7-F6C/L7-F6B/L7-F6A/L7-F5D verify scripts were updated to accept ClassGroup sem4 = 406 (stage-aware, L7-F6F: 431 - 25 deleted duplicates).

## 八、Validation

```text
prisma validate:  PASS
migrate status:   up to date
scan:docs-pii:    PASS (no blocking hits)
build:            PASS
tsc:              PASS
eslint:           0 errors, 6 warnings (unused vars in repair script)
K22-C:            PASS
git diff:         clean (CRLF warnings only)
forbidden files:  clean
```

## 九、Rollback Note

如果修复有误，可从备份恢复：

```bash
cp "prisma/dev.db.backup-before-l7-f6f-db-collision-repair-20260622175109" prisma/dev.db
```

然后重新运行 post-audit 确认 counts 恢复。

## 十、Commit / Push

- commit: `chore(import): repair xlsx classgroup collisions`
- push: pending
- final HEAD: pending

## 十一、Conclusion

- L7-F6F can close: YES
- blockingCollisionCountAfter: 0 ✓
- unsafeCollisionCountAfter: 0 ✓
- double-级 after: 0 ✓
- ClassGroup sem4: 406 (was 431, 25 duplicates removed)
- can enter L7-F6G: YES (L7-F6E remaining action: 844 teachers + 14 ClassGroups need user decision)
- can enter L7-F7: NO (still 1082 unresolved rows from L7-F6E; 85 importable but canApply may need more importable rows)
- can enter L7-G: NO
- next stage: L7-F6G-CONTROLLED-MASTER-DATA-WRITE-PLAN-OR-APPLY
