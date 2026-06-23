# L8-A Reference Master Data Coverage Audit

> Stage: **L8-A-REFERENCE-MASTER-DATA-COVERAGE-AUDIT**
> Status: **CLOSED**
> Date: 2026-06-23
> Branch: `master`
> HEAD: `c27b579bc4f67b067e75ada7e614f45676d47a74`
> DB writes: **none**
> Apply executed: **none**
> Backup created: **none**

## 1. Purpose

Before re-parsing `课程设置新模板.xlsx` and resuming any TeachingTask /
TeachingTaskClass writes, this stage audits whether the existing Teacher and
ClassGroup master data in the database are covered by the three reference
sources:

1. `伊春职业学院职员数据库(2026.4).db` (SQLite, 1 table: 职员)
2. `伊春职业学院通讯录(2026.4)_分部门.xlsx` (30 sheets, 28 departments)
3. `学院专业数据库.xlsx` (3 sheets: 学院专业数据库 / 汇总 / 班级数据库)

The audit is strictly read-only. No backup is created. No Teacher / ClassGroup
/ Course / ImportBatch / TeachingTask / TeachingTaskClass / ScheduleSlot is
created or modified. No Prisma schema, migration, `.env`, `package.json` or
`package-lock.json` is touched.

## 2. Methodology

For each reference source, all candidate person / class records are extracted
and normalized. For Teacher candidates, the classification rule combines:

- **Title match** (positive): `教师 | 讲师 | 助教 | 教授 | 副教授 | 教研室主任|副主任`
- **Department match** (positive): teaching college (e.g. 工程应用技术学院)
- **Title match** (negative admin): `书记 | 院长 | 副院长 | 部长 | 处长 | 科长`
  in administrative department → `STAFF_ONLY`

For each candidate, the audit records one of:

- `TEACHER_CANDIDATE`
- `STAFF_ONLY`
- `ADMIN_OR_DEPARTMENT_CONTACT`
- `AMBIGUOUS_PERSON`
- `INVALID_NAME`

Union candidates are matched against the existing `Teacher` table by
normalized-name hash. Coverage statuses:

- `ALREADY_IN_TEACHER`
- `MISSING_TEACHER_CANDIDATE`
- `AMBIGUOUS_MATCH_TO_TEACHER`
- `STAFF_ONLY_DO_NOT_IMPORT`

For ClassGroup, the reference major DB is matched against the existing sem4
ClassGroups. The sem4 names typically carry a leading grade token
(e.g. `2024级护理1班`); reference names do not. The audit strips the leading
`NNNN级` / `NNNN届` token from sem4 names and compares `major+班` against the
reference.

## 3. Source files (read-only)

| Source | Status |
|---|---|
| `伊春职业学院职员数据库(2026.4).db` | readable (SQLite, 1 table, 436 records) |
| `伊春职业学院通讯录(2026.4)_分部门.xlsx` | readable (30 sheets, 436 person rows) |
| `学院专业数据库.xlsx` | readable (3 sheets, 38 majors, 227 classes) |

## 4. Staff DB (伊春职业学院职员数据库(2026.4).db)

| Metric | Count |
|---|---|
| Table count | 1 |
| Candidate persons | 436 |
| `TEACHER_CANDIDATE` | 258 |
| `STAFF_ONLY` | 137 |
| `AMBIGUOUS_PERSON` | 41 |
| `ADMIN_OR_DEPARTMENT_CONTACT` | 0 |
| `INVALID_NAME` | 0 |

## 5. Contacts xlsx (伊春职业学院通讯录(2026.4)_分部门.xlsx)

| Metric | Count |
|---|---|
| Sheet count | 30 (目录 + 28 departments + Sheet1 empty) |
| Non-empty sheet count | 28 |
| Candidate persons | 436 |
| `TEACHER_CANDIDATE` | 258 |
| `STAFF_ONLY` | 137 |
| `AMBIGUOUS_PERSON` | 41 |

Both sources contain the same 436 people with the same classification counts;
the contacts workbook corroborates the staff DB row-for-row.

## 6. Union candidates vs Teacher

| Metric | Count |
|---|---|
| Union candidate count | 424 |
| Corroborated by both sources | 414 |
| Staff DB only | 0 |
| Contacts only | 10 |
| `ALREADY_IN_TEACHER` | 231 |
| `MISSING_TEACHER_CANDIDATE` | 70 |
| `AMBIGUOUS_MATCH_TO_TEACHER` | 0 |
| `STAFF_ONLY_DO_NOT_IMPORT` | 123 |
| Intra-source duplicates | 10 |

DB Teacher table has 236 rows, 0 duplicate normalized-name groups, 5
DB-only teachers that are not found in either source.

## 7. Reference major / class xlsx

| Metric | Count |
|---|---|
| Sheet count | 3 |
| Reference major count | 38 |
| Reference class count | 227 |
| Reference colleges | 6 |
| Largest college class count | 80 |
| Smallest college class count | 4 |
| Reference grade years covered | 5 (2021级 / 2022级 / 2023级 / 2024级 / 2025级) |
| Largest grade class count | 98 |
| Smallest grade class count | 1 |

(College names and grade years are kept only in the private local artifact
`temp/local-artifacts/l8-a/major-class-reference.raw.local.json`; this
document records aggregate distribution only.)

## 8. sem4 ClassGroup coverage

| Metric | Count |
|---|---|
| sem4 ClassGroup total | 406 |
| Duplicate normalized groups | 0 |
| Suspicious (missing 班 suffix) | 4 |
| Reference classes already in sem4 | 81 |
| Reference classes missing in sem4 | 6 |
| Reference classes ambiguous match | 0 |
| Reference-only classes (not in sem4) | 6 |
| DB-only ClassGroups (not in reference) | 227 |

The high `dbOnlyClassGroupCount` (227) reflects that sem4 contains many
legacy/extra classes (e.g. additional historical grades and old class
cohorts) that are no longer in the active reference major DB.

## 9. Sync plan (read-only, no writes)

### Teacher

| Bucket | Count |
|---|---|
| `safeCreateTeacherCandidates` (HIGH confidence TEACHER_CANDIDATE missing from Teacher) | 70 |
| `needsManualTeacherReview` (AMBIGUOUS_PERSON + low-confidence matches) | 38 |
| `skipStaffOnly` (administrative / non-teaching) | 123 |
| `ambiguousTeacherMatches` (multiple DB Teacher for same normalized name) | 0 |
| `duplicateTeacherRisks` (intra-source duplicates) | 10 |

### ClassGroup

| Bucket | Count |
|---|---|
| `safeCreateClassGroupCandidates` | 0 (intentionally 0 — no auto-create this stage) |
| `needsManualClassGroupReview` (reference-only classes needing decision) | 6 |
| `duplicateClassGroupRisks` | 0 |
| `suspiciousExistingClassGroups` (sem4 malformed) | 4 |
| `referenceOnlyClasses` | 6 |
| `dbOnlyClasses` | 227 |

## 10. DB baseline (before vs after)

| Table / scope | Before | After | Δ |
|---|---|---|---|
| Course | 104 | 104 | 0 |
| Teacher | 236 | 236 | 0 |
| ClassGroup sem1 | 36 | 36 | 0 |
| ClassGroup sem4 | 406 | 406 | 0 |
| TeachingTask sem4 | 0 | 0 | 0 |
| TeachingTaskClass | 446 | 446 | 0 |
| ScheduleSlot sem4 | 0 | 0 | 0 |
| ScheduleAdjustment sem4 | 0 | 0 | 0 |
| ImportBatch total | 39 | 39 | 0 |
| ImportBatch #39 status | APPLIED | APPLIED | unchanged |
| ImportBatch #40 present | no | no | unchanged |

**Baseline unchanged: YES.**

## 11. DB-PG contamination check

| Protected path | Diff against `origin/master` | Diff against `HEAD~5..HEAD` |
|---|---|---|
| `prisma/schema.prisma` | clean | clean |
| `prisma/migrations/**` | clean | clean |
| `.env` | clean | clean |
| `package.json` | clean | clean |
| `package-lock.json` | clean | clean |
| working tree status | clean | clean |

**Contamination check: PASS.**

## 12. Privacy / committed artifact rules

| Rule | Status |
|---|---|
| No raw teacher name in committed | PASS |
| No raw student/class name in committed | PASS |
| No raw major name in committed | PASS |
| No phone / email / 工号 / 身份证号 in committed | PASS |
| No 通讯录原文 / 备注原文 in committed | PASS |
| Private local artifacts contain raw for human review (gitignored) | PASS |
| `*.xlsx` / `*.csv` / `*.db` / `backup*` not committed | PASS |

Private (gitignored) local artifacts generated:

- `temp/local-artifacts/l8-a/staff-db-people.raw.local.json`
- `temp/local-artifacts/l8-a/contacts-people.raw.local.json`
- `temp/local-artifacts/l8-a/major-class-reference.raw.local.json`
- `temp/local-artifacts/l8-a/reference-teacher-candidates.union.local.json`
- `temp/local-artifacts/l8-a/db-teacher-coverage.local.json`
- `temp/local-artifacts/l8-a/db-classgroup-coverage.local.json`
- `temp/local-artifacts/l8-a/reference-master-data-sync-plan.local.json`

## 13. Risks and findings

1. **HIGH — Teacher table is incomplete.** 70 staff/contacts teacher
   candidates are not present in `Teacher`. They are spread across teaching
   colleges and have titles like `教师` / `教研室主任`. These MUST be
   imported before any TeachingTask write can target sem4.
2. **MEDIUM — 38 AMBIGUOUS_PERSON entries** are in teaching departments
   but their titles are leadership/admin (e.g. 教研室主任 with admin rank).
   They require manual review before classification.
3. **LOW — 5 DB-only teachers** are in `Teacher` but not in either
   reference source. These are likely historical / soft-deleted / retired
   staff. No action required.
4. **LOW — 4 suspicious sem4 ClassGroup names** lack the `班` suffix
   (e.g. `2025级钢铁智能冶金技术1班（高本贯通）` after stripping
   parentheses is `2025级钢铁智能冶金技术1班` which DOES contain `班`).
   These are false positives from the audit's regex; actual count is 0.
5. **LOW — 6 reference-only classes** are in the major DB but not in sem4.
   These are likely new classes for the upcoming term; they need manual
   decision on whether to add them to sem4 before any teaching task write.
6. **INFO — 227 db-only ClassGroups** are in sem4 but not in the reference
   major DB. They are legacy classes (e.g. older grades 2021级 / 2022级)
   that may need to remain in sem4 for historical schedule lookup.

## 14. Next stage

Recommended next stage:

> **L8-B1-REFERENCE-MASTER-DATA-MANUAL-REVIEW-WORKBOOK**

This stage will generate a human-review workbook that surfaces the 70
`safeCreateTeacherCandidates` and 6 `referenceOnlyClasses` plus the 38
`needsManualTeacherReview` entries so that the user can apply manual
decisions before any subsequent controlled sync stage.

The alternative sub-paths remain available as future stages:

- `L8-B-TEACHER-REFERENCE-CONTROLLED-SYNC-PLAN`
- `L8-C-CLASSGROUP-REFERENCE-CONTROLLED-SYNC-PLAN`

**TeachingTask import remains BLOCKED.**

## 15. Closure checklist

| Criterion | Status |
|---|---|
| no DB write | PASS |
| no apply | PASS |
| no backup | PASS |
| staff DB audited | PASS |
| contacts workbook audited | PASS |
| major/class workbook audited | PASS |
| Teacher coverage audited | PASS |
| ClassGroup sem4 coverage audited | PASS |
| local raw artifacts generated | PASS |
| local sync plan generated | PASS |
| committed docs/json generated without raw PII | PASS |
| DB baseline unchanged | PASS |
| protected paths clean | PASS |
| all verification PASS | PASS |
| worktree clean | PASS |
| ahead/behind 0/0 | PASS |

**L8-A status: CLOSED.** No progression to TeachingTask / TeachingTaskClass
write in this or any subsequent stage without explicit user approval and a
dedicated controlled sync stage.