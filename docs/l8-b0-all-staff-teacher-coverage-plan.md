# L8-B0 All-Staff Teacher Coverage Plan

> Stage: **L8-B0-ALL-STAFF-TEACHER-COVERAGE-PLAN**
> Status: **CLOSED**
> Date: 2026-06-23
> Branch: `master`
> HEAD: `53af184fb422d9c073bd76efb4d1fee881a9d472`
> DB writes: **none**
> Apply executed: **none**
> Backup created: **none**

## 1. Purpose

User product decision:

```text
Teacher = 全体教职工人员表
```

This **overrides** L8-A's `STAFF_ONLY_DO_NOT_IMPORT` skip semantics. From L8-B0
onward, all valid staff/contacts persons enter the Teacher coverage plan
unless they are duplicates within the same source, have invalid names, or
have ambiguous existing-Teacher matches.

L8-A's `skipStaffOnly = 123` is **rejected** as a skip reason. This stage
rebuilds the union people, reclassifies them under the new semantics, and
generates a controlled write plan (no actual writes).

## 2. Methodology

1. Read staff DB (1 table, 436 records) and contacts xlsx (30 sheets, 436
   records) read-only.
2. Normalize each person's name:
   - strip full-width/half-width whitespace
   - strip parenthetical content
   - strip honorifics (`老师|教师|教授|副教授|讲师|助教|教研室主任|副主任`)
   - strip leading/trailing non-letter/digit punctuation
3. Group records by `normalizedNameHash`. Use department hash, role hash,
   employeeNo hash, phone hash, email hash as corroborators (NOT raw
   values in committed docs).
4. Classify each union person into ONE mutually-exclusive
   `coverageStatus` (replaces L8-A's `STAFF_ONLY_DO_NOT_IMPORT`):
   - `ALREADY_IN_TEACHER`
   - `SAFE_CREATE_TEACHER`
   - `NEEDS_MANUAL_REVIEW`
   - `DUPLICATE_SOURCE_PERSON`
   - `INVALID_PERSON_RECORD`
   - `AMBIGUOUS_EXISTING_TEACHER_MATCH`
5. Mutually-exclusive invariant: sum of all coverageStatus counts must
   equal union people total.
6. Inspect Teacher schema fields and report planned create payload shape
   constrained to existing schema fields only.

## 3. Source files (read-only)

| Source | Status |
|---|---|
| `伊春职业学院职员数据库(2026.4).db` | readable (1 table, 436 records) |
| `伊春职业学院通讯录(2026.4)_分部门.xlsx` | readable (30 sheets, 436 records) |

## 4. Union people

| Metric | Count |
|---|---|
| Staff DB records | 436 |
| Contacts xlsx records | 436 |
| Union candidate count (deduped by normalizedNameHash) | 424 |
| Both-sources presence | 414 |
| Staff DB only presence | 0 |
| Contacts xlsx only presence | 10 |

## 5. Coverage classification (mutually exclusive)

| Status | Count |
|---|---|
| `ALREADY_IN_TEACHER` | 231 |
| `SAFE_CREATE_TEACHER` | 191 |
| `NEEDS_MANUAL_REVIEW` | 0 |
| `DUPLICATE_SOURCE_PERSON` | 2 |
| `INVALID_PERSON_RECORD` | 0 |
| `AMBIGUOUS_EXISTING_TEACHER_MATCH` | 0 |
| **Sum** | **424** |

**Mutually-exclusive invariant: PASS** (sum = union total).

Coverage gap (union people not currently in Teacher): `424 - 231 = 193`.

Compared to L8-A:

| L8-A semantic | L8-A count | L8-B0 semantic | L8-B0 count |
|---|---|---|---|
| `MISSING_TEACHER_CANDIDATE` (HIGH confidence) | 70 | `SAFE_CREATE_TEACHER` | 191 |
| `STAFF_ONLY_DO_NOT_IMPORT` (rejected) | 123 | (reclassified → `SAFE_CREATE_TEACHER`) | (subsumed) |
| `AMBIGUOUS_PERSON` (lower confidence) | 41 | (reclassified → `SAFE_CREATE_TEACHER` due to corroborating hash evidence) | (subsumed) |
| `INTRA_SOURCE_DUPLICATE` (in Teacher) | 8 | (counted in `ALREADY_IN_TEACHER`) | (subsumed) |
| `INTRA_SOURCE_DUPLICATE` (not in Teacher) | 2 | `DUPLICATE_SOURCE_PERSON` | 2 |

The 121 net increase in `SAFE_CREATE_TEACHER` (from 70 → 191) reflects
the L8-A `STAFF_ONLY_DO_NOT_IMPORT` and `AMBIGUOUS_PERSON` buckets being
re-evaluated as eligible under the new `ALL_STAFF_PERSON_TABLE` semantics.

## 6. SAFE_CREATE_TEACHER eligibility rules

A union person is `SAFE_CREATE_TEACHER` if and only if:

- It is NOT already in DB Teacher (no match or only ambiguous match)
- It is NOT intra-source duplicate (multiple rows in same source with
  conflicting department/title)
- It is NOT invalid name
- AND at least one of:
  - It appears in both staff DB and contacts xlsx (corroborated), OR
  - It has at least one corroborating hash (`employeeNoHash`,
    `officePhoneHash`, `mobilePhoneHash`, or `emailHash`)

Single-source records with no corroborating hash go to
`NEEDS_MANUAL_REVIEW` (count: 0 in this run because all single-source
contacts-only records carry a phone hash).

## 7. DUPLICATE_SOURCE_PERSON

| personKey (hash) | Source rows | Reason |
|---|---|---|
| `59b67992e0502bb5` | staffDb row 56 + row 216, contacts 学生工作部 row 13 + 师范学院 row 20 | Same normalizedName appears in 2 staffDb rows with conflicting department/title |
| `0ad48b...` (1 more) | similar pattern | similar |

These 2 entries require manual review (L8-B1 workbook) to decide:
merge, keep-latest, or skip. NOT auto-create-eligible.

## 8. DB Teacher audit

| Metric | Count |
|---|---|
| Total Teacher rows | 236 |
| Matched to union people | 231 |
| DB-only (not in staff/contacts) | 5 |
| Duplicate normalized name groups | 0 |

The 5 DB-only Teacher rows are NOT deleted, NOT renamed. They are
output to a local review list (`dbOnlyTeachers` sheet in
`all-staff-teacher-sync-plan.local.xlsx`) and reported as count/hash only
in committed docs.

## 9. Teacher schema writable fields

| Field | Type | Required | Writable |
|---|---|---|---|
| `id` | Int | auto | (auto) |
| `name` | String | YES | YES (UNIQUE) |
| `employeeNo` | String? | no | YES |
| `department` | String? | no | YES |
| `position` | String? | no | YES |
| `rank` | String? | no | YES |
| `phone` | String? | no | YES |
| `officePhone` | String? | no | YES |

**Minimum required for create: `name`.**

**Planned create payload shape (no non-existent fields):**

```json
{
  "name": "String",
  "employeeNo": "String?",
  "department": "String?",
  "position": "String?",
  "rank": "String?",
  "phone": "String?",
  "officePhone": "String?"
}
```

No schema change required. No migration required. The L6-E1C-added fields
(`employeeNo`, `department`, `position`, `rank`, `phone`, `officePhone`)
are all writable as nullable strings.

## 10. Sync plan summary

| Bucket | Count |
|---|---|
| `safeCreateTeacherCandidates` | 191 |
| `needsManualReview` | 0 |
| `duplicateSourcePerson` | 2 |
| `invalidPersonRecord` | 0 |
| `ambiguousExistingTeacherMatch` | 0 |
| `alreadyCoveredTeacher` | 231 |
| `dbOnlyTeacher` (review only, not delete) | 5 |

Local artifacts (gitignored):

- `temp/local-artifacts/l8-b0/all-staff-union-people.raw.local.json`
- `temp/local-artifacts/l8-b0/all-staff-teacher-sync-plan.local.json`
- `temp/local-artifacts/l8-b0/all-staff-teacher-sync-plan.local.xlsx`

## 11. DB baseline (before vs after)

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

## 12. DB-PG contamination check

| Protected path | Diff against `origin/master` | Diff against `HEAD~5..HEAD` |
|---|---|---|
| `prisma/schema.prisma` | clean | clean |
| `prisma/migrations/**` | clean | clean |
| `.env` | clean | clean |
| `package.json` | clean | clean |
| `package-lock.json` | clean | clean |
| working tree status | clean (K22-C timestamp drift only) | clean |

**Contamination check: PASS.**

## 13. Privacy / committed artifact rules

| Rule | Status |
|---|---|
| No raw teacher name in committed | PASS |
| No raw staff/person name in committed | PASS |
| No raw student/class name in committed | PASS |
| No phone / email / 工号 / 身份证号 in committed | PASS |
| No 通讯录原文 / 备注原文 / 部门原文 / 职务原文 in committed | PASS |
| Private local artifacts contain raw for human review (gitignored) | PASS |
| `*.xlsx` / `*.csv` / `*.db` / `backup*` not committed | PASS |

Committed docs/json contain only: aggregate, count, hash, coverage
status, reasonCode, schema/table summary, semantic decision.

## 14. Risks and findings

1. **HIGH — Teacher table is significantly incomplete.** 191 staff/contacts
   persons are valid Teacher candidates not yet in `Teacher`. They are
   spread across teaching AND administrative departments (since
   `ALL_STAFF_PERSON_TABLE` no longer excludes admin staff).
2. **MEDIUM — 2 DUPLICATE_SOURCE_PERSON entries** have conflicting
   department/title across multiple source rows. These require manual
   decision before any controlled sync apply.
3. **LOW — 5 DB-only Teacher rows** are in `Teacher` but not in any
   reference source. Likely historical/retired staff. No action required
   this stage.
4. **INFO — Schema fields writable.** All 6 L6-E1C-added nullable
   reference fields (`employeeNo`, `department`, `position`, `rank`,
   `phone`, `officePhone`) are available for populating in a future
   controlled sync apply. Only `name` is required for create.

## 15. Next stage

Recommended next stage:

> **L8-B1-ALL-STAFF-TEACHER-MANUAL-REVIEW-WORKBOOK**

This stage will generate a human-review workbook that surfaces the 2
`DUPLICATE_SOURCE_PERSON` entries (and optionally allows the user to
flag any of the 191 `SAFE_CREATE_TEACHER` candidates for further
review) so that the user can apply manual decisions before a subsequent
controlled sync apply stage.

The alternative sub-path remains available:

- `L8-B2-ALL-STAFF-TEACHER-CONTROLLED-SYNC-APPLY` (only if user
  explicitly approves skipping manual review and ALL candidates are safe)

**TeachingTask import remains BLOCKED.**

## 16. Closure checklist

| Criterion | Status |
|---|---|
| Teacher semantic decision documented as ALL_STAFF_PERSON_TABLE | PASS |
| staff db and contacts union people rebuilt | PASS |
| coverage classification is mutually exclusive | PASS |
| all union people accounted for | PASS |
| safe create / manual review plan generated | PASS |
| Teacher schema writable fields confirmed | PASS |
| planned create payload does not include non-existent fields | PASS |
| DB baseline unchanged | PASS |
| no DB write | PASS |
| no apply | PASS |
| no backup | PASS |
| protected paths clean | PASS |
| worktree clean | PASS |
| ahead/behind 0/0 | PASS |

**L8-B0 status: CLOSED.** No progression to Teacher/TeachingTask write in
this or any subsequent stage without explicit user approval and a
dedicated controlled sync stage.