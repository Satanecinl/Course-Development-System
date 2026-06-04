# K20-FIX-B-SOURCE-EVIDENCE-SCHEMA-PLAN

| Field | Value |
|---|---|
| Phase | K20-FIX-B-SOURCE-EVIDENCE-SCHEMA-PLAN |
| Type | Schema change + migration + importer write + verification (low-risk minimal implementation) |
| Predecessor | K20-FIX-A (commit `db2fd5a`) — HIGH=0 / MEDIUM=1 / LOW=1 / INFO=4 / BLOCKING=NO / recommended Option A |
| Generated | 2026-06-04 |
| Schema migration | `prisma/migrations/20260604154300_add_teaching_task_class_source_evidence/migration.sql` |
| Applied via | `npx prisma db push` (project uses db push workflow; see §4) |
| DB backup | `prisma/dev.db.backup-before-k20-source-evidence-schema-20260604154215` |
| JSON report | `docs/k20-source-evidence-schema-plan-fix-b.json` |

---

## 1. Background

K20-FIX-A (`db2fd5a docs(import): audit source evidence traceability`) identified
the largest remaining traceability gap: **TeachingTaskClass links carry no
per-link source evidence**. Each link is identified only by `(teachingTaskId,
classGroupId)`, with no pointer back to the parsed JSON row, the remark
keyword that produced the match, or the docx artifact.

Concretely:

- TeachingTask.importBatchId and TeachingTask.remark are task-level, not
  link-level. A task with 3 links (e.g. task 37 / CG3 + CG17 + CG35) cannot
  distinguish which link came from which source row.
- ImportBatch.warningsJson is a batch-level JSON blob; it cannot pinpoint a
  specific link.
- K18-B (4 cross-cohort tasks: 168 / 174 / 176 / 181) and K18-E3 (task 37)
  repairs required manual cross-reference of 17 source JSON files to confirm
  the wrong cohort links. If per-link source evidence had existed, the
  diagnosis time would have shrunk from ~1 day / ~6 hours to ~30 / ~10
  minutes.

K20-FIX-A's recommendation: **Option A — minimal nullable source evidence
fields on TeachingTaskClass**, forward-fill only (no historical backfill).
This stage implements that recommendation.

---

## 2. Goal

1. Add 8 nullable source-evidence columns to `TeachingTaskClass`.
2. Create a non-destructive migration (only ADD COLUMN, no DROP / RENAME).
3. Create a DB backup before applying the schema change.
4. Update the import pipeline so future `TeachingTaskClass` rows are written
   with source evidence.
5. Keep historical rows untouched (all 8 fields = null).
6. Provide 4 verification scripts (schema, importer write, query pattern,
   backfill gap audit) that all pass.
7. Do not modify frontend, solver, RBAC, API routes, warningsJson, the
   cross-cohort approval gate, or K18/K19 historical data.

---

## 3. Schema Change

Added 8 nullable columns to `model TeachingTaskClass` in
`prisma/schema.prisma`:

```prisma
model TeachingTaskClass {
  id                    Int          @id @default(autoincrement())
  teachingTaskId        Int
  teachingTask          TeachingTask @relation(fields: [teachingTaskId], references: [id])
  classGroupId          Int
  classGroup            ClassGroup   @relation(fields: [classGroupId], references: [id])
  // ── K20-FIX-B: per-link source evidence (forward-fill only, no historical backfill) ──
  importBatchId         Int?
  sourceRowIndex        Int?
  sourceKeyword         String?
  sourceClassName       String?
  sourceRemark          String?
  sourceArtifactFilename String?
  matchStrategy         String?
  matchConfidence       String?

  @@unique([teachingTaskId, classGroupId])
}
```

Notes:

- All 8 fields are nullable with no default → existing rows remain valid
  with all 8 fields = null.
- The existing `@@unique([teachingTaskId, classGroupId])` constraint is
  preserved.
- `importBatchId` is a scalar `Int?` (not a Prisma `relation`) — see §4 for
  the rationale.
- No new index added in this stage; query performance for 446 → several
  thousand rows is acceptable with full table scan; an index on
  `importBatchId` and/or `(sourceArtifactFilename, sourceRowIndex)` can be
  added later when row count grows or a frequent lookup pattern is observed.

---

## 4. Migration / Backup

### Project migration workflow

The project uses `npx prisma db push` as its primary schema sync tool
(see existing migrations `20260525085556_init`,
`20260525092227_add_course_remark`, `20260525093723_add_capacity_fields`,
`20260603000000_add_cross_cohort_approval` — the latter created via
`db push` based on the absence of an applied migration in
`_prisma_migrations`). For consistency, this stage also used `db push`:

```bash
npx prisma db push
# → "Your database is now in sync with your Prisma schema. Done in 105ms"
```

The migration SQL file at
`prisma/migrations/20260604154300_add_teaching_task_class_source_evidence/migration.sql`
is **a reference / human-readable artifact** documenting the schema change
in source control. It is not consumed by `db push`.

### Backup

A backup was created before applying the schema change:

```
prisma/dev.db.backup-before-k20-source-evidence-schema-20260604154215
```

### Restore instruction

```bash
# To restore from backup (if needed):
cp prisma/dev.db.backup-before-k20-source-evidence-schema-20260604154215 prisma/dev.db
# Then re-generate Prisma client (the regenerated @prisma/client already
# knows the new fields, so no schema sync is needed):
npx prisma generate
```

### Migration safety checklist

| Item | Result |
|---|---|
| ADD COLUMN only (no DROP / RENAME) | ✅ |
| All columns nullable | ✅ |
| No default values (no rewrites) | ✅ |
| Existing `@@unique` constraint preserved | ✅ |
| Historical row count preserved (446) | ✅ |
| Historical source-evidence fields all null | ✅ |

---

## 5. Importer Write Strategy

The importer now populates all 8 fields when it creates a new
`TeachingTaskClass` link. The implementation is split into:

1. **New pure helpers** exported from `src/lib/import/importer.ts`:
   - `MatchKind` type: `'BASE' | 'EXACT' | 'WEAK' | 'SUBSEQ'`
   - `ClassNameEvidence` interface: `{ name, keyword, matchKind }`
   - `SourceEvidenceFields` interface: the 8 fields written to TTC
   - `extractBasename(p)`: strip directory from a path
   - `deriveMatchAttributes(matchKind, crossCohortApproved)`: maps to
     `{ matchStrategy, matchConfidence }`
   - `buildTeachingTaskClassEvidence(...)`: assembles the 8 fields
2. **`findMergedClassNamesWithEvidence`**: a parallel variant of the
   existing `findMergedClassNames` that also returns the keyword + match
   kind for each merged class. The original function is kept intact for
   backward compatibility with K19 tests.
3. **New maps in `prepareRecords`**: `eventKeyToClassNameEvidence` and
   `taskKeyToClassNameEvidence`. These are populated alongside the existing
   `eventKeyToClassNames` / `taskKeyToClassNames` maps. The `batch.filename`
   is now also surfaced as `prepared.batchFilename`.
4. **Updated `executeImportInTransaction`**: when creating each
   `TeachingTaskClass` row, it calls `buildTeachingTaskClassEvidence` and
   includes all 8 fields in the `data` payload. The record index is
   computed via `records.indexOf(baseRecord)` (0-based).

### Field source mapping

| Field | Source |
|---|---|
| `importBatchId` | `batchId` (function parameter) |
| `sourceRowIndex` | `records.indexOf(baseRecord)` (0-based) |
| `sourceKeyword` | `findMergedClassNamesWithEvidence` returned keyword, or null for BASE |
| `sourceClassName` | The class name as it appeared in the source row |
| `sourceRemark` | `baseRecord.remark` (may be null) |
| `sourceArtifactFilename` | `extractBasename(prepared.batchFilename)` |
| `matchStrategy` | Derived from `MatchKind` + cross-cohort approval (see §7) |
| `matchConfidence` | Derived from `MatchKind` + cross-cohort approval (see §7) |

### Create semantics

The existing `executeImportInTransaction` used `tx.teachingTaskClass.create`
one row at a time (no `createMany`). This stage keeps the same
single-row-per-call pattern but adds the 8 new fields to each call.
Transaction semantics are unchanged.

### Unknown / fallback semantics

If a class name has no evidence entry (defensive — should not happen given
prepareRecords invariants), the evidence is constructed with:

- `sourceKeyword: null`
- `matchStrategy: 'UNKNOWN'`
- `matchConfidence: 'UNKNOWN'`
- `sourceClassName: cgName` (still recorded)
- `sourceRemark: baseRecord?.remark ?? null`
- `sourceArtifactFilename: extractBasename(prepared.batchFilename)`

If the parser has no row index for a record (defensive), `sourceRowIndex`
is `null` (not `-1`) so the column never stores a fake index.

---

## 6. Field Semantics

| Field | Type | Nullable | Source | Notes |
|---|---|:---:|---|---|
| `importBatchId` | `Int?` | ✅ | ImportBatch row id that created this link | Scalar (no FK constraint) to avoid migration complexity. Forward-fill only. |
| `sourceRowIndex` | `Int?` | ✅ | 0-based index in parsed JSON | Negative / unknown → null. |
| `sourceKeyword` | `String?` | ✅ | The remark keyword that produced this match | null for BASE. |
| `sourceClassName` | `String?` | ✅ | The class name as it appeared in the source row | Always recorded (defensive default = cgName). |
| `sourceRemark` | `String?` | ✅ | The source record's `remark` field | May be null if the source record had no remark. |
| `sourceArtifactFilename` | `String?` | ✅ | `extractBasename(ImportBatch.filename)` | null if filename is null. |
| `matchStrategy` | `String?` | ✅ | Enum-like string from §7 | null only for historical rows. |
| `matchConfidence` | `String?` | ✅ | Enum-like string from §7 | null only for historical rows. |

---

## 7. Match Strategy / Confidence Rules

The `matchStrategy` and `matchConfidence` are derived from
`deriveMatchAttributes(MatchKind, crossCohortApproved)`:

| MatchKind | crossCohortApproved | matchStrategy | matchConfidence |
|---|:---:|---|---|
| `BASE` | (any) | `EXACT_CLASS_NAME` | `HIGH` |
| `EXACT` | (any) | `EXACT_CLASS_NAME` | `HIGH` |
| `WEAK` | false | `SAME_COHORT_WEAK_MATCH` | `LOW` |
| `WEAK` | true | `MANUAL_CROSS_COHORT_APPROVAL` | `MEDIUM` |
| `SUBSEQ` | false | `SAME_COHORT_WEAK_MATCH` | `LOW` |
| `SUBSEQ` | true | `MANUAL_CROSS_COHORT_APPROVAL` | `MEDIUM` |
| unknown / missing evidence | (any) | `UNKNOWN` | `UNKNOWN` |

Semantics:

- **BASE** = the record's own `class_info.class_name` (no remark-keyword
  matching needed). HIGH confidence because the name is taken verbatim.
- **EXACT** = the remark keyword matched an existing class name exactly
  (passes K19 cohort guard).
- **WEAK** = the remark keyword matched a class name via `String.includes`
  with the keyword as a substring (passes K19 cohort guard, kept because
  only 1 hit). LOWER confidence than EXACT.
- **SUBSEQ** = the remark keyword matched a class name via character
  subsequence (e.g. `森` → `森林草原防火技术1班`). LOWER confidence than
  WEAK.
- For weak / subseq matches on cross-cohort tasks that the operator
  approved via the K19 cross-cohort approval gate, the strategy is
  upgraded to `MANUAL_CROSS_COHORT_APPROVAL` and confidence to `MEDIUM`.

No database enum is used. All values are plain strings. This keeps the
schema migration trivially non-destructive and lets future values be added
without a schema change.

---

## 8. No Backfill Policy

- Historical `TeachingTaskClass` rows (446 total) keep all 8 new fields
  as `null`.
- The K20-FIX-A audit (`scripts/audit-source-evidence-traceability-k20-fix-a.ts`)
  re-run after the schema change shows `RuleA: NONE` — the gap is now
  closed structurally.
- The K20-FIX-B backfill gap audit
  (`scripts/audit-source-evidence-backfill-gap-k20-fix-b.ts`) confirms
  `allNull=446, anyNonNull=0` — no historical row was modified.
- A future `K20-FIX-C-SOURCE-EVIDENCE-BACKFILL-AUDIT` stage can choose to
  backfill from the 17 source JSON files in `uploads/imports/` if a
  business need arises. That stage will need to re-parse each JSON, run
  the same cohort-guard logic, and only update rows whose link is verified
  to match a JSON record (to avoid corrupting data from K18-B / K18-E3
  manual repairs that may not appear in any current JSON).

---

## 9. Query Patterns

Verified by `scripts/verify-source-evidence-query-k20-fix-b.ts`:

1. `prisma.teachingTaskClass.findFirst({ where: { sourceRowIndex: 0 } })` —
   direct lookup by source row.
2. `prisma.teachingTaskClass.findMany({ where: { importBatchId: 1 } })` —
   filter by batch.
3. `prisma.teachingTaskClass.findMany({ where: { sourceKeyword: { contains: '森防' } } })` —
   text search by remark keyword.
4. `prisma.teachingTaskClass.count({ where: { matchStrategy: 'EXACT_CLASS_NAME' } })` —
   group / filter by match strategy.
5. `prisma.teachingTaskClass.findMany({ orderBy: { sourceRowIndex: 'asc' } })` —
   replay insertion order.
6. `prisma.teachingTaskClass.groupBy({ by: ['matchStrategy'], _count: { _all: true } })` —
   aggregation.
7. Historical all-null rows do not break any of the above queries.
8. Combined query (e.g. `where: { importBatchId: 1, sourceRowIndex: 0 }`)
   works.

---

## 10. Verification Scripts

| Script | Purpose | Result |
|---|---|---|
| `scripts/verify-source-evidence-schema-k20-fix-b.ts` | schema.prisma + DB columns + non-destructive + null safety | **37 PASS / 0 FAIL** |
| `scripts/verify-source-evidence-importer-k20-fix-b.ts` | pure helper unit tests for buildTeachingTaskClassEvidence | **41 PASS / 0 FAIL** |
| `scripts/verify-source-evidence-query-k20-fix-b.ts` | end-to-end query pattern coverage | **16 PASS / 0 FAIL** |
| `scripts/audit-source-evidence-backfill-gap-k20-fix-b.ts` | no-backfill policy compliance | **2 PASS / 0 FAIL** |

---

## 11. Backward Compatibility

- All 8 new fields are nullable, so existing TypeScript code that reads
  `TeachingTaskClass` from Prisma continues to compile (it just sees
  `null`).
- The new pure helpers are additive exports; no existing export was
  removed or had its signature changed.
- `findMergedClassNames` is preserved unchanged for K19 tests. The new
  `findMergedClassNamesWithEvidence` is a parallel function.
- `PreparedData` gained two new keys (`eventKeyToClassNameEvidence` and
  `taskKeyToClassNameEvidence`) and one new field (`batchFilename`).
  `simulateConfirmImportBatch` and `confirmImportBatch` do not destructure
  those keys, so they remain unaffected.
- The `executeImportInTransaction` signature is unchanged; the 8 new
  fields are written inside the loop, not exposed to callers.

---

## 12. Unmodified Scope (this stage)

- ❌ Frontend (`src/components/**`, `src/app/**` client code, `src/store/**`)
- ❌ API routes (`src/app/api/**`)
- ❌ Solver (`src/lib/scheduler/**`)
- ❌ RBAC / permissions / `requirePermission` / `validateCrossCohortApprovals`
- ❌ ScheduleSlot data (no row touched)
- ❌ TeachingTask data (no row touched)
- ❌ ClassGroup data (no row touched)
- ❌ ImportBatch historical data (no row touched)
- ❌ TeachingTaskClass historical rows (446 rows kept all-null)
- ❌ warningsJson structure (still v2)
- ❌ cross-cohort approval gate logic
- ❌ K18 / K19 historical data repair scripts
- ❌ re-import of historical files

Only modified / new files:

- ✏️ `prisma/schema.prisma` — 8 new fields
- ✏️ `prisma/migrations/20260604154300_add_teaching_task_class_source_evidence/migration.sql` — reference SQL
- ✏️ `src/lib/import/importer.ts` — pure helpers + evidence map + TTC write
- ➕ `scripts/verify-source-evidence-schema-k20-fix-b.ts`
- ➕ `scripts/verify-source-evidence-importer-k20-fix-b.ts`
- ➕ `scripts/verify-source-evidence-query-k20-fix-b.ts`
- ➕ `scripts/audit-source-evidence-backfill-gap-k20-fix-b.ts`
- ➕ `docs/k20-source-evidence-schema-plan-fix-b.md` (this file)
- ➕ `docs/k20-source-evidence-schema-plan-fix-b.json`

---

## 13. Verification Results

| Verification | Result |
|---|---|
| `verify-source-evidence-schema-k20-fix-b` | **37 PASS / 0 FAIL** |
| `verify-source-evidence-importer-k20-fix-b` | **41 PASS / 0 FAIL** |
| `verify-source-evidence-query-k20-fix-b` | **16 PASS / 0 FAIL** |
| `audit-source-evidence-backfill-gap-k20-fix-b` | **2 PASS / 0 FAIL** |
| `audit-source-evidence-traceability-k20-fix-a` | **RuleA: NONE** (was MEDIUM before) / HIGH=0 / BLOCKING=NO |
| `audit-remaining-risk-rebase-k20` | HIGH=0 / MEDIUM=2 / LOW=6 / ACCEPTED=1 / NONE=1 / BLOCKING=NO (unchanged) |
| `verify-import-approval-browser-e2e-k19-fix-c` | 10 PASS / 0 FAIL |
| `verify-import-cross-cohort-approval-ui-k19-fix-b2` | 16 PASS / 0 FAIL |
| `verify-import-cross-cohort-approval-k19-fix-b1` | 17 PASS / 0 FAIL |
| `verify-import-matching-cohort-guard-k19-fix-a` | 31 PASS / 0 FAIL |
| `audit-import-cross-cohort-persistent-flag-k19-fix-b` | HIGH=0 / MEDIUM=0 |
| `audit-import-matching-root-cause-k19` | HIGH=0 |
| `validate-task37-finalization-k18-e3` | 18 PASS / 0 FAIL |
| `audit-data-quality-classgroup-matching-k17-fix-a` | HIGH=0 |
| `audit-schedule-mutation-server-guards` | HIGH=0 / MEDIUM=0 |
| `audit-teaching-task-mutation-semantic-guards` | HIGH=0 / MEDIUM=0 |
| `verify-schedule-mutation-client-preflight-fix` | 23 PASS / 0 FAIL |
| `prisma validate` | valid |
| `npm run build` | PASS |
| `npm run lint` | 312 problems baseline (no new errors) |
| `npm run test:auth-foundation` | 53 passed / 1 failed (pre-existing ScheduleAdjustment ACTIVE mismatch) |

---

## 14. Remaining Risks

1. **Historical rows all null**: acceptable for this stage. K18-B 4 tasks
   and K18-E3 task 37 already have their wrong-cohort links deleted; the
   remaining 446 links are correct. A future K20-FIX-C stage may choose to
   backfill from the 17 source JSON files but only for confirmable matches.

2. **Source artifact immutable storage** (Rule D from K20-FIX-A, INFO):
   `ImportBatch.originalFilePath` / `parsedJsonPath` are still filesystem
   path strings. Path drift / cleanup risk persists. Mitigation
   recommended in a future `K20-FIX-D-SOURCE-ARTIFACT-IMMUTABLE-STORAGE`
   stage.

3. **Operator identity / timestamp** (Rule B from K20-FIX-A, LOW):
   `TeachingTask.approvedBy` / `approvedAt` still missing. The
   cross-cohort approval is currently anonymous; a future
   `K20-FIX-B-IMPORT-EVIDENCE-MODEL-DESIGN` stage can add this.

4. **Frontend source evidence display**: UI does not yet expose the new
   fields. The fields are written so that future audit dashboards can
   surface them via `TeachingTaskClass` joins. A future frontend stage can
   add a "per-link source" panel.

5. **Index performance**: no index on `importBatchId`, `sourceRowIndex`, or
   `(sourceArtifactFilename, sourceRowIndex)`. With 446 rows this is fine;
   monitor and add if row count grows or query patterns show up.

6. **Parser source row index**: this stage does not modify the Python
   parser. The `sourceRowIndex` is derived in the importer from
   `records.indexOf(baseRecord)` — equivalent to the parser's own array
   index for the same `parsedJsonPath`. If the parser later writes a
   `sourceRowIndex` field per record, the importer can switch to reading
   that field directly. This is tracked for a future parser-side cleanup
   but does not block this stage.

---

## 15. Suggested Next Stage

**K20-FIX-C-SOURCE-EVIDENCE-BACKFILL-AUDIT** (optional, deferred)

Scope (when ready):

- Audit whether historical `TeachingTaskClass` rows can be reliably
  backfilled from the 17 source JSON files in `uploads/imports/`.
- Re-run the K20-FIX-A cohort-guard matching for each historical TTC link.
- Only update rows where the backfill produces a 1:1 match to an existing
  JSON record. Skip ambiguous / missing matches.
- This stage is explicitly out of scope for K20-FIX-B.

Alternative next stage (if a different priority emerges):

**K20-FIX-B-IMPORT-EVIDENCE-MODEL-DESIGN** — add `approvedBy` /
`approvedAt` to `TeachingTask` (Rule B of K20-FIX-A), so that cross-cohort
approvals carry operator identity and timestamp. This is the operator-side
counterpart to the per-link evidence added in this stage.

Both stages are independent. K20-FIX-B has no dependency on either.

---

## 16. Restore Instruction (DB rollback)

```bash
# 1. Stop the dev server if running
# 2. Replace the DB with the backup
cp prisma/dev.db.backup-before-k20-source-evidence-schema-20260604154215 prisma/dev.db
# 3. Regenerate the Prisma client (the .prisma/client cache is forward-only
#    and will reject queries for the new fields, but the old client is
#    identical to the pre-stage client because the 8 fields are nullable
#    and unused)
npx prisma generate
# 4. Optionally remove the migration SQL (cosmetic; db push already
#    applied)
rm -rf prisma/migrations/20260604154300_add_teaching_task_class_source_evidence
# 5. Restore the pre-stage importer (git checkout HEAD~ -- src/lib/import/importer.ts)
#    (or `git restore --source=HEAD~ src/lib/import/importer.ts` after the
#    committing step below; otherwise `git checkout db2fd5a -- src/lib/import/importer.ts`)
# 6. Remove the new verify scripts
rm scripts/verify-source-evidence-schema-k20-fix-b.ts \
   scripts/verify-source-evidence-importer-k20-fix-b.ts \
   scripts/verify-source-evidence-query-k20-fix-b.ts \
   scripts/audit-source-evidence-backfill-gap-k20-fix-b.ts
```

After restore, re-run `npx prisma validate` and `npm run build` to confirm
the codebase compiles against the pre-stage schema.

---

## 17. Closing Note

K20-FIX-B-SOURCE-EVIDENCE-SCHEMA-PLAN executed as specified:

- ✅ DB backup created
- ✅ 8 nullable source-evidence fields added to `TeachingTaskClass`
- ✅ Non-destructive migration (only ADD COLUMN, no DROP / RENAME)
- ✅ Importer updated to write all 8 fields for future links
- ✅ Historical rows (446) preserved with all 8 fields = null
- ✅ 4 verification scripts added: schema, importer write, query pattern,
  backfill gap audit — all pass
- ✅ K20-FIX-A RuleA finding downgraded from MEDIUM to NONE
- ✅ K19 chain + K18 task37 + K17 data-quality still pass
- ✅ `prisma validate` PASS, `npm run build` PASS
- ✅ `npm run lint` no new errors
- ✅ `npm run test:auth-foundation` no new failures (53 passed / 1 failed
  pre-existing ScheduleAdjustment ACTIVE mismatch)
- ✅ No frontend / API route / solver / RBAC modifications
- ✅ No re-import of historical files
- ✅ No prisma/dev.db or DB backup committed (both ignored by .gitignore)

**This stage can be closed. Recommended next stage:
K20-FIX-C-SOURCE-EVIDENCE-BACKFILL-AUDIT (optional, deferred) or
K20-FIX-B-IMPORT-EVIDENCE-MODEL-DESIGN (operator identity / timestamp).**
