# L8-C1 ClassGroup Globalization Design

## Stage

`L8-C1-CLASSGROUP-GLOBALIZATION-DESIGN`

## Status

DESIGN_COMPLETE — no DB writes, no schema changes

## Branch / HEAD

- Branch: `master`
- HEAD before: `1da151f53756bf2eb707f652f09288c5060ff945`
- HEAD after: (to be filled after commit)

## Semantic Decisions

| Entity | Decision | Status |
|--------|----------|--------|
| Teacher | ALL_STAFF_PERSON_TABLE (global) | DONE (L8-B1) |
| ClassGroup | GLOBAL_MASTER_DATA | DESIGNED (L8-C1) |
| Room | GLOBAL_MASTER_DATA | NOTED — deferred to later stage |

---

## 1. Current Schema Summary

```prisma
model ClassGroup {
  id           Int                 @id @default(autoincrement())
  name         String
  studentCount Int?
  advisorName  String?
  advisorPhone String?
  semesterId   Int                 // NOT NULL (K25-C)
  semester     Semester            @relation(...)
  taskClasses  TeachingTaskClass[]
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  @@unique([semesterId, name])     // per-semester uniqueness
  @@index([semesterId])
}
```

Key facts:
- `semesterId` is REQUIRED (NOT NULL)
- `@@unique([semesterId, name])` — same name allowed across different semesters
- 442 total ClassGroups: sem1=36 (referenced by 446 TTC), sem4=406 (unreferenced)
- All 36 sem1 names also exist in sem4 (confirmed semester copy)

---

## 2. Target Schema Design

### Recommended: Global ClassGroup

```prisma
model ClassGroup {
  id             Int                 @id @default(autoincrement())
  name           String              @unique           // global uniqueness
  canonicalKey   String              @unique           // normalized match key
  grade          String?                                 // "2024级"
  majorName      String?                                 // "护理"
  classNumber    String?                                 // "1"
  studentCount   Int?
  advisorName    String?
  advisorPhone   String?
  isActive       Boolean             @default(true)    // soft deactivation
  sourceType     String?                                 // "reference_xlsx" | "import"
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  taskClasses    TeachingTaskClass[]
  semesters      Semester[]           @relation("SemesterClassGroups")  // M:N via join table

  @@index([isActive])
  @@index([canonicalKey])
}
```

### Semester relationship: Many-to-Many via join table

```prisma
model SemesterClassGroup {
  id           Int       @id @default(autoincrement())
  semesterId   Int
  classGroupId Int
  isDefault    Boolean   @default(false)
  createdAt    DateTime  @default(now())

  semester   Semester   @relation(fields: [semesterId], references: [id])
  classGroup ClassGroup @relation(fields: [classGroupId], references: [id])

  @@unique([semesterId, classGroupId])
  @@index([semesterId])
  @@index([classGroupId])
}
```

### Why Many-to-Many

The same ClassGroup (e.g., "2024级护理1班") may need to be associated with multiple semesters for historical traceability. However, the ClassGroup itself is NOT created per-semester. The join table `SemesterClassGroup` records which semesters have used which ClassGroups, enabling historical queries without duplication.

### Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| semesterId on ClassGroup | **REMOVED** | ClassGroup is global. Semester association moves to `SemesterClassGroup` join table |
| `name UNIQUE` | **YES** (global) | Prevents duplicate class names across the system |
| `canonicalKey UNIQUE` | **YES** | Normalized key for matching (grade\|major\|classNumber\|direction) |
| `isActive` | **YES** | Soft deactivation instead of hard delete; preserves referential integrity |
| `sourceType` | **YES** (nullable) | Traceable origin: `reference_xlsx` for canonical 227, `import` for others |
| `grade/majorName/classNumber` | **YES** (nullable) | Structured fields enable programmatic matching without name parsing |
| `SemesterClassGroup` join table | **YES** | Many-to-many for historical semester association |
| `TeachingTaskClass.classGroupId` | **unchanged** | FK still works — ClassGroup.id is still the PK |

---

## 3. Data Migration Strategy

### Phase 1: Create canonical 227 ClassGroups (L8-C3)

For each of the 227 reference classes:

1. Parse canonicalKey: `{grade}|{major}|{classNumber}|{direction}|{schoolLength}`
2. Create ClassGroup with:
   - `name`: human-readable (e.g., "2024级护理1班")
   - `canonicalKey`: normalized key
   - `grade`: "2024级"
   - `majorName`: "护理"
   - `classNumber`: "1"
   - `isActive`: true
   - `sourceType`: "reference_xlsx"
   - `studentCount`: from reference data
3. Create `SemesterClassGroup` entry linking to target semester (sem4)

### Phase 2: Map existing sem4 406 → canonical 227 (L8-C3)

For each of the 406 sem4 ClassGroups:

| Category (from L8-C0) | Count | Action |
|------------------------|-------|--------|
| REFERENCE_MATCH_EXACT (182) | 182 | Map to canonical ClassGroup via canonicalKey |
| REFERENCE_MATCH_ALIAS (4) | 4 | Map to canonical ClassGroup via alias key |
| REFERENCE_MATCH_AMBIGUOUS (3) | 3 | Manual review → map to best candidate |
| DB_ONLY_EXTRA (209) | 209 | Deactivate (isActive=false) or delete if no refs |
| SUSPICIOUS_NAME (1) | 1 | Review → deactivate or map |
| SEMESTER_COPY (5) | 5 | Already mapped to canonical via sem1 overlap |
| COMPOSITE_OR_TEMP_GROUP (2) | 2 | Deactivate or split into canonical entries |

### Phase 3: Migrate sem1 36 ClassGroups (L8-C3)

The 36 sem1 ClassGroups are referenced by 446 TTC records. Migration:

1. For each sem1 ClassGroup, find matching canonical ClassGroup by name or canonicalKey
2. If canonical exists: update `TeachingTaskClass.classGroupId` → canonical ClassGroup.id
3. If no canonical match: keep sem1 ClassGroup as-is with `sourceType: "legacy_sem1"`, create `SemesterClassGroup` link
4. After all TTC references migrated: deactivate or delete original sem1 ClassGroup

### Phase 4: TeachingTaskClass reference migration (L8-C3)

```
For each TeachingTaskClass (446 total):
  1. currentClassGroupId = ttc.classGroupId
  2. currentClassGroup = ClassGroup.find(currentClassGroupId)
  3. canonicalClassGroup = findCanonicalByCanonicalKey(currentClassGroup.canonicalKey)
  4. if (canonicalClassGroup && canonicalClassGroup.id !== currentClassGroupId):
       ttc.classGroupId = canonicalClassGroup.id
  5. idempotent: skip if already pointing to canonical
```

Post-migration invariant: `count(ClassGroup WHERE isActive=true AND sourceType='reference_xlsx') = 227`

---

## 4. API / UI / Import Impact Matrix

### Entities that remain semester-scoped

| Entity | Reason |
|--------|--------|
| TeachingTask | Each task belongs to a specific semester |
| ScheduleSlot | Each slot belongs to a specific semester |
| ScheduleAdjustment | Each adjustment belongs to a specific semester |
| ImportBatch | Each import is for a specific semester |
| SchedulingRun | Each solver run is for a specific semester |
| SchedulingConfig | Each config is per-semester |

### Code changes required

#### A. Admin CRUD route (`src/app/api/admin/[model]/route.ts`)

**Before**: ClassGroup in `SEMESTER_SCOPED_MODELS` set → GET/POST/PUT scoped by semesterId

**After**: Remove ClassGroup from `SEMESTER_SCOPED_MODELS`. Add to new `GLOBAL_MASTER_MODELS` set. GET returns all `isActive` ClassGroups. POST does not inject semesterId. PUT does not enforce same-semester guard.

Files: `src/app/api/admin/[model]/route.ts`

#### B. Entity list API (`src/app/api/entity-list/route.ts`)

**Before**: `prisma.classGroup.findMany({ where: { semesterId: semester.id } })`

**After**: `prisma.classGroup.findMany({ where: { isActive: true } })`

Files: `src/app/api/entity-list/route.ts`

#### C. Class groups API (`src/app/api/class-groups/route.ts`)

**Before**: `prisma.classGroup.findMany({ where: { semesterId: semester.id } })`

**After**: `prisma.classGroup.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })`

Files: `src/app/api/class-groups/route.ts`

#### D. Teaching task API routes (`src/app/api/teaching-task/route.ts`, `[id]/route.ts`)

**Before**: Validates ClassGroup.semesterId matches task semesterId

**After**: Remove semester mismatch check on ClassGroup. ClassGroup is global; any active ClassGroup can be linked to any TeachingTask.

Files: `src/app/api/teaching-task/route.ts`, `src/app/api/teaching-task/[id]/route.ts`

#### E. Import pipeline

**Before**: `classGroupMap` built from semester-scoped ClassGroups. Course-setting queries `prisma.classGroup.findMany({ where: { semesterId } })`.

**After**: `classGroupMap` built from ALL active ClassGroups. Course-setting queries `prisma.classGroup.findMany({ where: { isActive: true } })`. Matching uses `canonicalKey` for robustness.

Files affected:
- `src/lib/import/importer.ts`
- `src/lib/import/course-setting-xlsx-preview.ts`
- `src/lib/import/course-setting-resolution-options.ts`
- `src/lib/import/course-setting-apply-l7-f.ts`

#### F. Data summary API (`src/app/api/data/summary/route.ts`)

**Before**: `prisma.classGroup.count({ where: { semesterId: semester.id } })`

**After**: `prisma.classGroup.count({ where: { isActive: true } })`

#### G. Scheduler readiness (`src/app/api/admin/scheduler/readiness/route.ts`)

**Before**: `prisma.classGroup.count({ where: { semesterId: semester.id } })`

**After**: `prisma.classGroup.count({ where: { isActive: true } })`

#### H. Admin DB page

**Before**: `useSemesterStore` drives ClassGroup queries via semesterId

**After**: Admin DB page shows all active ClassGroups (no semester filter). TeachingTask dialog fetches active ClassGroups globally.

Files:
- `src/app/admin/db/admin-db-content.tsx`
- `src/lib/admin-db/api.ts`

#### I. Schedule API (`src/app/api/schedule/route.ts`)

**Before**: Class filter queries `teachingTaskClass.findMany({ where: { classGroupId } })` — this is already correct (ClassGroup.id is the FK)

**After**: No change needed — schedule API already filters by semester via TeachingTask.semesterId, not ClassGroup.semesterId

#### J. Dashboard UI

**Before**: Indirectly scoped via semester-scoped APIs

**After**: No change — display comes from semester-scoped schedule API. ClassGroup lookup is via TeachingTaskClass relation.

#### K. Export API

**Before**: `prisma.classGroup.findUnique` for sheet title

**After**: No change — findUnique by id still works on global ClassGroup

### Summary of affected files

| Area | Files to modify | Complexity |
|------|----------------|------------|
| Admin CRUD | `src/app/api/admin/[model]/route.ts` | LOW |
| Entity list | `src/app/api/entity-list/route.ts` | LOW |
| Class groups API | `src/app/api/class-groups/route.ts` | LOW |
| Teaching task API | `src/app/api/teaching-task/route.ts`, `[id]/route.ts` | MEDIUM |
| Import pipeline | `importer.ts`, `xlsx-preview.ts`, `resolution-options.ts`, `course-setting-apply-l7-f.ts` | MEDIUM |
| Data summary | `src/app/api/data/summary/route.ts` | LOW |
| Scheduler readiness | `src/app/api/admin/scheduler/readiness/route.ts` | LOW |
| Admin DB UI | `admin-db-content.tsx`, `admin-db/api.ts` | LOW |
| **Total** | **~10 files** | **MEDIUM** |

### Files that do NOT need changes

| Area | Reason |
|------|--------|
| Scheduler (data-loader, score, solver, apply, rollback, capacity) | Uses ClassGroup via in-memory TeachingTaskClass relation, no direct DB query |
| Adjustment system | Uses ClassGroup via taskClasses include, no direct DB query |
| Conflict check/rules | Uses classGroupIds from task data, no direct DB query |
| Room recommendations | Derives from task.taskClasses |
| Dashboard display | Indirect via schedule API |
| Semester store | Not affected (still manages semester selection) |

---

## 5. Recommended Implementation Option

### Option C: Phased Globalization (RECOMMENDED)

| Phase | Stage | DB writes | Schema changes | Risk |
|-------|-------|-----------|---------------|------|
| C2 | Schema prep: add canonicalKey, isActive, grade, majorName, classNumber, sourceType | YES (migration) | YES | LOW — additive fields only |
| C3 | Canonical 227 create + sem4 cleanup + sem1 TTC migration | YES (transaction) | NO | MEDIUM — data rewrite |
| C4 | API/UI global query migration | NO | NO | MEDIUM — code change |
| C5 | semesterId removal + SemesterClassGroup join table | YES (migration) | YES | HIGH — final schema change |
| C6 | Acceptance closeout + TeachingTask import unblock | NO | NO | LOW |

### Why Option C over others

- **Option A (cleanup only, no schema change)**: Doesn't solve root cause. Next semester will create copies again.
- **Option B (direct migration)**: Too much risk in a single step. Schema + data + code all at once.
- **Option C (phased)**: Each phase is independently testable and rollbackable. Schema prep is additive (safe). Data cleanup is in a controlled transaction. Code changes can be verified with build/typecheck/lint. Final schema change happens last when everything is stable.

---

## 6. Rollback Strategy

| Phase | Rollback method |
|-------|----------------|
| C2 (schema prep) | Reverse migration: drop added columns. ClassGroup unchanged. |
| C3 (data cleanup) | `prisma dev.db.backup-before-l8-c3` → restore on failure. Transaction rollback on any error. |
| C4 (API/UI changes) | Git revert. No DB changes to undo. |
| C5 (semesterId removal) | Restore from backup. Re-add semesterId column. |
| C6 (closeout) | N/A — no writes |

Every data-writing phase requires:
1. `prisma dev.db.backup-before-l8-cX-{timestamp}`
2. Invalid token guard (`CONFIRM_CLASSGROUP_C{X}`)
3. Confirm token (`CONFIRM_CLASSGROUP_C{X}`)
4. Transaction boundary
5. Post-audit invariant check

---

## 7. Risk List

| Risk | Severity | Mitigation |
|------|----------|------------|
| TeachingTaskClass references break during migration | HIGH | Migrate TTC refs BEFORE deactivating old ClassGroups |
| Canonical 227 don't match all existing references | MEDIUM | Pre-migration audit: verify every referenced ClassGroup has a canonical match |
| Import pipeline fails with global ClassGroup | MEDIUM | Test import dry-run with global ClassGroups in C4 |
| Admin DB page shows wrong semester data | LOW | ClassGroup is global; semester context via TeachingTask |
| Duplicate canonicalKey creation | LOW | Unique constraint prevents silently |
| Schema migration breaks Prisma Client | LOW | `npx prisma generate` after each migration |

---

## 8. TeachingTask Import Block Condition

TeachingTask import (course setting xlsx import) remains **BLOCKED** until:

1. L8-C3 data cleanup is complete (227 canonical ClassGroups active)
2. L8-C4 API/UI migration is complete (global ClassGroup queries work)
3. Import pipeline dry-run test passes with global ClassGroups
4. Import pipeline real-import test passes with transaction rollback verification
5. L8-C6 acceptance closeout confirms all invariants

Estimated unblock point: **after L8-C6 CLOSED**

---

## 9. Room Globalization Note

Room is also confirmed as GLOBAL_MASTER_DATA. Current Room schema already has no `semesterId`. Room globalization is deferred — no action needed in L8-C1 through L8-C6. This will be addressed in a future L9 series stage.

---

## 10. Stage Breakdown

| Stage | Title | DB writes | Schema changes | Description |
|-------|-------|-----------|---------------|-------------|
| L8-C2 | SCHEMA-PREP | YES (migration) | YES | Add canonicalKey, isActive, grade, majorName, classNumber, sourceType to ClassGroup |
| L8-C3 | CANONICAL-CLEANUP-APPLY | YES (transaction) | NO | Create 227 canonical CGs, migrate sem1 TTC refs, deactivate extras |
| L8-C4 | API-UI-GLOBAL-QUERY | NO | NO | Update ~10 files to use global ClassGroup queries |
| L8-C5 | SEMESTERID-REMOVAL | YES (migration) | YES | Remove semesterId, add SemesterClassGroup join table |
| L8-C6 | ACCEPTANCE-CLOSEOUT | NO | NO | Final verification, TeachingTask import unblock |

---

## 11. DB Baseline

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

No DB writes performed. Baseline unchanged.

## 12. Verification Results

| Check | Status |
|-------|--------|
| prisma validate | PASS |
| migrate status | PASS (14 migrations, up to date) |
| build | PASS |
| typecheck | PASS |
| lint | PASS |
| K22-C | PASS (73/73) |
| scan:docs-pii | PASS (0 blocking) |

## 13. Committed Files

- `docs/l8-c1-classgroup-globalization-design.md`
- `docs/l8-c1-classgroup-globalization-design.json`
