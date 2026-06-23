# L8-B1 All-Staff Teacher Controlled Sync Apply

> Stage: **L8-B1-ALL-STAFF-TEACHER-CONTROLLED-SYNC-APPLY**
> Status: **CLOSED**
> Date: 2026-06-23
> Branch: `master`
> HEAD: `8ae20d33f85422afcd8c019c14d21485c735b616`
> DB writes: **191 Teacher creates**
> Apply executed: **yes** (single transaction)
> Backup created: **yes**

## 1. Purpose

Execute the L8-B0 sync plan under the `ALL_STAFF_PERSON_TABLE` semantic
decision: create 191 Teacher rows for safeCreateTeacherCandidates in a
single Prisma transaction. No updates, no deletes, no ClassGroup/
TeachingTask/ScheduleSlot/ImportBatch writes.

## 2. Teacher semantic decision

`Teacher = 全体教职工人员表` (all-staff person table, not teaching-only).

## 3. B0 plan counts (confirmed before apply)

| Bucket | Planned | Actual |
|---|---|---|
| safe create Teacher | 191 | 191 |
| needs manual review | 0 | 0 |
| duplicate source person (skipped) | 2 | 2 |
| invalid person record | 0 | 0 |
| ambiguous existing Teacher match | 0 | 0 |

## 4. Backup

| Item | Value |
|---|---|
| basename | `dev.db.backup-before-l8-b1-all-staff-teacher-sync-20260623-120236` |
| size | 60 MB |
| sha256 | `958925d7cba1528508874bf2111b9d92ca1a8366f3501d4a45d9c8a955a7e256` |
| git tracked | NO |
| created before apply | YES |

## 5. Dry-run result

| Metric | Value |
|---|---|
| plannedCreates | 191 |
| plannedUpdates | 0 |
| plannedDeletes | 0 |
| plannedSkippedDuplicateSourcePeople | 2 |
| expectedTeacherBefore | 236 |
| expectedTeacherAfter | 427 |
| dbWritten | false |

**Dry-run: PASS**

## 6. Invalid token test

| Metric | Value |
|---|---|
| token used | `INVALID_TOKEN` |
| dbWritten | false |
| Teacher count before | 236 |
| Teacher count after | 236 |
| exit code | 0 (expected failure detected) |

**Invalid token test: PASS**

## 7. Valid token apply result

| Metric | Value |
|---|---|
| confirm token | `WRITE_L8_B1_ALL_STAFF_TEACHERS` |
| dbWritten | true |
| transactionCommitted | true |
| transactionRolledBack | false |
| plannedCreates | 191 |
| actualCreates | 191 |
| plannedUpdates | 0 |
| actualUpdates | 0 |
| plannedDeletes | 0 |
| actualDeletes | 0 |
| uniqueNameConflict | false |
| failureReason | null |

**Valid token apply: PASS**

### Transaction semantics

All 191 Teacher creates executed inside a single `prisma.$transaction`
with `timeout=60s, maxWait=10s`. A pre-flight check verified that no
existing Teacher row had the same name as any planned create target.
If a UNIQUE constraint conflict had been detected mid-transaction, the
entire transaction would have rolled back atomically (no partial commits).

## 8. Post-audit

| Metric | Expected | Actual | Status |
|---|---|---|---|
| Teacher after | 427 | 427 | PASS |
| Teacher delta | 191 | 191 | PASS |
| baseline unchanged except Teacher | YES | YES | PASS |
| duplicate normalizedName groups | 0 | 0 | PASS |
| invalid Teacher name count | 0 | 0 | PASS |
| all planned names created | YES | YES | PASS |
| missing planned names | 0 | 0 | PASS |
| db-only Teacher retained | 5 | 5 | PASS |
| duplicate source person skipped | 2 | 2 | PASS |

**Post-audit: PASS**

## 9. DB baseline (before vs after)

| Table / scope | Before | After | Δ |
|---|---|---|---|
| Course | 104 | 104 | 0 |
| Teacher | 236 | **427** | **+191** |
| ClassGroup sem1 | 36 | 36 | 0 |
| ClassGroup sem4 | 406 | 406 | 0 |
| TeachingTask sem4 | 0 | 0 | 0 |
| TeachingTaskClass | 446 | 446 | 0 |
| ScheduleSlot sem4 | 0 | 0 | 0 |
| ScheduleAdjustment sem4 | 0 | 0 | 0 |
| ImportBatch total | 39 | 39 | 0 |
| ImportBatch #39 status | APPLIED | APPLIED | unchanged |
| ImportBatch #40 present | no | no | unchanged |

Only Teacher changed (+191). All other tables unchanged.

## 10. DB-PG contamination check

| Protected path | Diff against `origin/master` | Diff against `HEAD~5..HEAD` |
|---|---|---|
| `prisma/schema.prisma` | clean | clean |
| `prisma/migrations/**` | clean | clean |
| `.env` | clean | clean |
| `package.json` | clean | clean |
| `package-lock.json` | clean | clean |

**Contamination check: PASS.**

## 11. Privacy / committed artifact rules

| Rule | Status |
|---|---|
| No raw teacher name in committed | PASS |
| No raw staff/person name in committed | PASS |
| No phone / email / 工号 / 身份证号 in committed | PASS |
| No 通讯录原文 / 部门原文 / 职务原文 in committed | PASS |
| Private local artifacts contain raw for human review (gitignored) | PASS |
| Backup not committed | PASS |

## 12. Risks and findings

1. **INFO — 191 Teacher rows created.** Teacher table grew from 236 to
   427. All new rows have unique names (0 duplicate groups post-apply).
2. **INFO — 2 DUPLICATE_SOURCE_PERSON skipped.** These were in B0 plan
   as intra-source duplicates (same normalizedName, multiple source rows
   with conflicting department/title). They remain NOT in Teacher and
   require manual review in a future stage.
3. **INFO — 5 db-only Teacher retained.** Not modified, not deleted.
4. **LOW — Backup exists.** Restorable via standard SQLite copy if
   rollback is needed.

## 13. Next stage

Recommended next stage:

> **L8-C0-CLASSGROUP-GLOBAL-MASTER-DATA-SEMANTIC-RECONCILIATION**

This stage will reconcile the ClassGroup table (406 rows in sem4)
against the 学院专业数据库 reference (227 active classes) and design
the global master data approach (ClassGroup should not be copied per-semester).

**TeachingTask import remains BLOCKED.**

## 14. Closure checklist

| Criterion | Status |
|---|---|
| backup created | PASS |
| dry-run PASS | PASS |
| invalid token test PASS | PASS |
| valid token apply PASS | PASS |
| transaction committed exactly 191 creates | PASS |
| Teacher 236 → 427 | PASS |
| no Teacher duplicate normalizedName | PASS |
| no invalid Teacher name | PASS |
| duplicate source person 2 not created | PASS |
| db-only Teacher 5 retained | PASS |
| Course/ClassGroup/TeachingTask/TeachingTaskClass/ScheduleSlot/ScheduleAdjustment/ImportBatch unchanged | PASS |
| protected paths clean | PASS |
| all verification PASS | PASS |
| worktree clean | (pending commit) |
| ahead/behind 0/0 | (pending push) |

**L8-B1 status: CLOSED.** TeachingTask import remains blocked.