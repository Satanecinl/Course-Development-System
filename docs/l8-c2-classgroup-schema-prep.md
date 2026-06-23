# L8-C2 ClassGroup Schema Prep

## Stage

`L8-C2-CLASSGROUP-SCHEMA-PREP`

## Status

CLOSED — additive schema migration applied, data preserved

## Branch / HEAD

- Branch: `master`
- HEAD before: `5840c6246f8c1ded463d65aa896fffbc33e55ccb`
- HEAD after: (to be filled after commit)

## Schema Modification

### Added Fields

| Field | Type | Nullable | Default | Constraint |
|-------|------|----------|---------|------------|
| canonicalKey | TEXT | YES | null | @unique |
| grade | TEXT | YES | null | — |
| majorName | TEXT | YES | null | — |
| classNumber | TEXT | YES | null | — |
| educationLevel | TEXT | YES | null | — |
| schoolLength | TEXT | YES | null | — |
| sourceType | TEXT | YES | null | — |
| isActive | BOOLEAN | NO | true | — |

### Added Indexes

| Index | Column | Type |
|-------|--------|------|
| ClassGroup_canonicalKey_key | canonicalKey | UNIQUE INDEX |
| ClassGroup_isActive_idx | isActive | INDEX |

### Migration

- Name: `20260623000000_add_classgroup_global_fields_l8_c2`
- Method: manual SQL (shadow DB incompatible with legacy migration)
- Applied via: `prisma migrate deploy`
- 15 migrations total, all up to date

### Backup

- `prisma/dev.db.backup-before-l8-c2-classgroup-schema-prep-20260623132208`

## Intentionally NOT Changed

- `semesterId` still REQUIRED (NOT NULL)
- `@@unique([semesterId, name])` retained
- `name` NOT global unique (semester duplicates exist)
- No `SemesterClassGroup` join table
- No ClassGroup data cleanup
- No TeachingTaskClass migration
- No API/UI query migration
- No import/course-setting logic change

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

### After

**IDENTICAL** — only schema columns added, no data modified.

| Metric | Value | Changed |
|--------|-------|---------|
| Course | 104 | NO |
| Teacher | 427 | NO |
| ClassGroup sem1 | 36 | NO |
| ClassGroup sem4 | 406 | NO |
| ClassGroup total | 442 | NO |
| TeachingTask sem4 | 0 | NO |
| TeachingTaskClass | 446 | NO |
| ScheduleSlot sem4 | 0 | NO |
| ScheduleAdjustment sem4 | 0 | NO |
| ImportBatch total | 39 | NO |

### New Field Behavior on Existing Rows

| Field | Existing rows value |
|-------|-------------------|
| canonicalKey | null (all 442 rows) |
| grade | null |
| majorName | null |
| classNumber | null |
| educationLevel | null |
| schoolLength | null |
| sourceType | null |
| isActive | true (all 442 rows, via DEFAULT) |

## Verification Results

| Check | Status |
|-------|--------|
| prisma validate | PASS |
| migrate status | PASS (15 migrations, up to date) |
| build | PASS |
| typecheck | PASS |
| lint | PASS (no new warnings from C2) |
| K22-C | PASS (73/73, 0 FAIL) |
| scan:docs-pii | PASS (0 blocking) |

## Committed Files

- `prisma/schema.prisma`
- `prisma/migrations/20260623000000_add_classgroup_global_fields_l8_c2/migration.sql`
- `docs/l8-c2-classgroup-schema-prep.md`
- `docs/l8-c2-classgroup-schema-prep.json`
- `docs/l8-c1-classgroup-globalization-design.md` (Teacher status corrected: L8-B1)
- `docs/l8-c1-classgroup-globalization-design.json` (Teacher status corrected: L8-B1)

## Recommended Next Stage

`L8-C3-CLASSGROUP-CANONICAL-REFERENCE-PLAN`

TeachingTask import remains **BLOCKED**.
