# L8-C0 ClassGroup Global Master Data Semantic Reconciliation

## Stage

`L8-C0-CLASSGROUP-GLOBAL-MASTER-DATA-SEMANTIC-RECONCILIATION`

## Status

AUDIT_COMPLETE — read-only audit, no DB writes

## Branch / HEAD

- Branch: `master`
- HEAD before: `b9563658ea8750965b67a3129361a6615d3b0df3`
- HEAD after: (to be filled after commit)
- ahead/behind: 0/0
- worktree: clean

## ClassGroup Semantic Decision

**GLOBAL_MASTER_DATA**

Teacher, ClassGroup, and Room are all global master data entities. They should NOT be scoped to a semester. ClassGroup currently has `semesterId NOT NULL` and `@@unique([semesterId, name])`, which forces per-semester duplication and prevents global uniqueness enforcement.

## Reference Data Summary

Source: `学院专业数据库.xlsx`

| Metric | Value |
|--------|-------|
| Reference major count (sheet 1) | 34 |
| Reference unique majors (class sheet) | 35 |
| Reference class count | **227** |
| Reference unique canonical keys | 209 |
| Reference duplicate canonical keys (school-length variants) | 18 |
| Reference total students | 6,736 |
| Reference colleges | 6 |
| Reference grades | 2021级(1), 2022级(6), 2023级(46), 2024级(76), 2025级(98) |
| Reference education levels | 高职(206), 中高职(21) |
| Reference school lengths | 三年制(189), 二年制(17), 五年制(21) |

**Note**: The task expected 38 reference majors. Actual count from the Excel file is 34 (major sheet) / 35 (class sheet). The discrepancy may reflect a version difference in the source file.

## DB ClassGroup Summary

| Metric | Value |
|--------|-------|
| DB ClassGroup total | 442 |
| ClassGroup semesterId=1 (sem1) | 36 |
| ClassGroup semesterId=4 (target) | **406** |
| ClassGroup semesterId=null | 0 |
| sem1→sem4 name overlap (semester copy) | 36/36 (100%) |

### sem1→sem4 Copy Confirmation

All 36 sem1 ClassGroup names exist identically in sem4. This confirms that ClassGroup was historically created as a per-semester copy. The sem4 406 includes these 36 copies plus 370 additional entries.

## Match Results: Reference 227 vs DB 406

| Category | Count | Description |
|----------|-------|-------------|
| REFERENCE_MATCH_EXACT | **182** | DB CG canonical key matches reference exactly |
| REFERENCE_MATCH_ALIAS | **4** | DB CG matches reference via grade+major+classNum (direction/school-length variant) |
| REFERENCE_MATCH_AMBIGUOUS | **3** | DB CG has multiple possible reference matches |
| REFERENCE_ONLY_MISSING_IN_DB | **26** | Reference class has no matching DB ClassGroup |
| DB_ONLY_EXTRA | **209** | DB ClassGroup has no matching reference class |
| DB_DUPLICATE | 0 | No duplicate DB ClassGroups within sem4 |
| SUSPICIOUS_NAME | **1** | Malformed name (missing 级 suffix) |
| SEMESTER_COPY | **5** | sem1 copy that didn't match elsewhere |
| IMPORT_ARTIFACT | 0 | No obvious import artifacts |
| COMPOSITE_OR_TEMP_GROUP | **2** | Composite class names (joined with +/、) |

### DB ClassGroup Coverage of Reference

- Matched reference keys: 186 (182 exact + 4 alias)
- Reference-only missing keys: 26 unique canonical keys
- Coverage: 186/212 = **87.7%**

### Reference-Only Missing Classes (26)

Categorized by reason:

| Category | Count | Description |
|----------|-------|-------------|
| 对口 variant | 8 | Reference has "护理\|对口"; DB has "护理对口" as separate major token |
| 现场工程师 | 5 | Reference has direction=现场工程师; DB has composite or no match |
| 森林和草原资源保护 name variant | 4 | Reference uses "森林和草原资源保护"; DB uses "森林草原资源保护" |
| 现代家政管理 | 3 | No DB equivalent at all |
| 五年制 variant | 2 | 2022级 机电/计算机 五年制; DB has different naming |
| 计算机应用技术 classNum | 2 | Reference has 2023级 2班/3班; DB may have different numbering |
| 智慧健康养老与管理 | 1 | No DB equivalent |
| 口腔修复工艺 五年制 | 1 | No DB equivalent |

### DB-Only Extra Classes (209)

Categorized by pattern:

| Category | Count | Description |
|----------|-------|-------------|
| High class number (>10) | **174** | Class numbers 11-47; likely from Word schedule import (separate numbering per schedule) |
| 五年制 prefix in major | **18** | e.g. "2022五年制机电一体化技术" — grade embedded in major name |
| 护理对口 as separate major | **8** | DB has "护理对口" major token; reference treats as "护理" + direction=对口 |
| No close reference match | **7** | Includes 音乐教育, specific 口腔医学技术 classNums, etc. |
| Composite/suspicious | **3** | Composite groups + 1 malformed name |
| Note: sum includes overlaps in categorization | | |

## Reference Usage Audit

| Metric | Value |
|--------|-------|
| Total target-semester ClassGroups | 406 |
| Referenced by TeachingTaskClass | **0** |
| Unreferenced extras | **217** |
| Delete-safe candidates | **406** |
| Merge-required candidates | **0** |
| Migration-required candidates | **0** |
| Risk distribution | LOW(404), MEDIUM(2) |

**Critical finding**: All 406 sem4 ClassGroups are delete-safe because:
- sem4 TeachingTask = 0 (no teaching tasks in target semester)
- TeachingTaskClass (446) references sem1 ClassGroups, not sem4
- Therefore sem4 ClassGroups have zero downstream references

**Important caveat**: The 36 sem1 ClassGroups ARE referenced by the 446 TTC records and their associated ScheduleSlots. Deleting sem1 ClassGroups would break those references. Only sem4 ClassGroups are safe to clean.

## Schema Semantic Audit

### ClassGroup Model Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | Int | YES | @id @default(autoincrement()) |
| name | String | YES | |
| studentCount | Int? | NO | |
| advisorName | String? | NO | |
| advisorPhone | String? | NO | |
| semesterId | Int | **YES** | NOT NULL since K25-C |
| semester | Semester | YES | @relation |
| taskClasses | TeachingTaskClass[] | — | Relation |
| createdAt | DateTime | YES | |
| updatedAt | DateTime | YES | |

### Constraints

- `@@unique([semesterId, name])` — prevents same name within a semester, but allows same name across semesters (enables copy)
- `@@index([semesterId])`

### Relations

- ClassGroup → Semester (many-to-one, required)
- ClassGroup → TeachingTaskClass (one-to-many)

### Globalization Feasibility

Making ClassGroup global requires:
1. Make `semesterId` nullable (or remove entirely)
2. Change unique constraint from `[semesterId, name]` to `[name]`
3. Remove semester-scoped queries in import/API/UI
4. Migrate existing data (deduplicate across semesters)

**Cannot be done additively** — the `@@unique([semesterId, name])` constraint actively prevents global uniqueness. Schema migration is required.

## Code Usage Audit

| Area | Affected | Summary |
|------|----------|---------|
| IMPORT | YES | `importer.ts` upserts ClassGroup with `semesterId`. Global ClassGroup requires removing semesterId from upsert conditions |
| COURSE_SETTING | YES | If course setting queries ClassGroup by targetSemesterId, needs update |
| SCHEDULE_DISPLAY | YES | Indirect via TeachingTaskClass → TeachingTask.semesterId |
| SCHEDULER_SOLVER | NO | Solver loads via TeachingTaskClass, no direct ClassGroup semesterId filter |
| ADJUSTMENT | NO | References ClassGroup indirectly via TeachingTaskClass |
| ADMIN_DB_PAGE | YES | Admin DB page queries ClassGroup by active semester. Global query needed |
| SETTINGS | NO | Settings center does not manage ClassGroup directly |
| SEMESTER_SCOPING | YES | ClassGroup.semesterId is core of semester scoping for class data |
| API_VALIDATION | YES | Import confirm API validates ClassGroup within semester scope |

### Key Code Path: Import Pipeline

`src/lib/import/importer.ts` → `executeImportInTransaction()`:
- Upserts ClassGroup with `{ where: { semesterId_name: { semesterId, name } } }`
- Creates TeachingTaskClass linking TeachingTask ↔ ClassGroup
- Making ClassGroup global: change upsert to `{ where: { name } }` (no semesterId)

### Key Code Path: Admin DB Page

`src/lib/admin-db/config.ts` → ClassGroup table config:
- Filters by active semester
- Making ClassGroup global: remove semester filter, show all

## Recommended Options

### Option A: Short-term Data Cleanup (No Schema Change)

- Keep `semesterId` field
- Clean sem4 ClassGroups to match reference 227
- Remove extras (174 high-number, 18 五年制 prefix, 8 护理对口, etc.)
- Risk: Still not global model; next semester will create copies again

### Option B: ClassGroup Globalization Schema Migration

- Remove or make `semesterId` nullable
- Change unique constraint to `[name]`
- Add `canonicalKey`, `externalSourceKey`, `isActive` fields
- Update all import/scheduler/UI/API queries
- Risk: Requires migration of TeachingTaskClass, UI, import, schedule pages

### Recommended: Hybrid

1. **L8-C1**: Design globalization schema and migration plan
2. **L8-C2**: Plan reference-based cleanup (apply to sem4)
3. **L8-C3**: Execute controlled cleanup (with backup + confirm tokens)
4. **L8-C4**: Execute schema migration to make ClassGroup global

## Recommended Next Stage

`L8-C1-CLASSGROUP-GLOBALIZATION-DESIGN`

## DB Baseline

### Before

| Metric | Value |
|--------|-------|
| Course | 104 |
| Teacher | 427 |
| ClassGroup sem1 | 36 |
| ClassGroup sem4 | 406 |
| TeachingTask sem4 | 0 |
| TeachingTaskClass | 446 |
| ScheduleSlot sem4 | 0 |
| ScheduleAdjustment sem4 | 0 |
| ImportBatch total | 39 |
| ImportBatch #39 | APPLIED, tasks=0 |
| ImportBatch #40 | absent |

### After

**IDENTICAL** — no DB writes performed.

## Verification Results

| Check | Status |
|-------|--------|
| prisma validate | (to be run) |
| migrate status | (to be run) |
| build | (to be run) |
| typecheck | (to be run) |
| lint | (to be run) |
| K22-C | (to be run) |
| scan:docs-pii | (to be run) |

## Committed Files

- `scripts/audit-classgroup-global-master-data-l8-c0.ts`
- `docs/l8-c0-classgroup-global-master-data-reconciliation.md`
- `docs/l8-c0-classgroup-global-master-data-reconciliation.json`

## Forbidden Files Check

No `.xlsx`, `.csv`, `.db`, `backup*`, `temp/**`, or PII-containing files committed.

## Safety Confirmations

- DB written: **NO**
- Apply executed: **NO**
- Backup created: **NO**
- Force push: **NO**
- TeachingTask import remains blocked: **YES**
