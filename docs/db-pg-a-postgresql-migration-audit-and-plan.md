# DB-PG-A PostgreSQL Migration Audit And Plan

Status: audit and planning only.

Branch: `db-pg-a-migration-plan`

## Scope

DB-PG-A documents the risks of moving the current SQLite-backed Prisma application to PostgreSQL. It does not perform a migration and does not prepare runtime cutover.

Allowed work in this phase:

- Read current Prisma schema, migration SQL, and SQLite-specific import assumptions.
- Add a standalone read-only audit script.
- Add Markdown and JSON planning artifacts.

Explicitly out of scope:

- Switching `prisma/schema.prisma` from SQLite to PostgreSQL.
- Generating or editing `prisma/migrations/**`.
- Editing `.env`, `package.json`, or `package-lock.json`.
- Writing to `prisma/dev.db` or deleting it.
- Editing L7 Excel import scripts or changing their backup/rollback path.
- Connecting this audit script to package scripts or default CI.

## Current Findings

1. Current Prisma datasource remains SQLite.
   - `prisma/schema.prisma` declares `provider = "sqlite"`.
   - `prisma/migrations/migration_lock.toml` is also SQLite-based.

2. Existing migration SQL is not PostgreSQL-ready.
   - Current migration files include SQLite-specific SQL such as `AUTOINCREMENT`, `PRAGMA`, `DATETIME`, SQLite table rebuilds, and `RENAME TO`.
   - These migrations must not be replayed directly against PostgreSQL.

3. L7 Excel import is still SQLite-file oriented.
   - Current L7 import and verification paths include assumptions around `prisma/dev.db`, `dev.db.backup-*`, `copyFileSync`, `node:sqlite`, and `prisma/migrations`.
   - This is compatible with the current SQLite mainline but blocks direct PostgreSQL cutover until the write path is closed, frozen, or redesigned.

4. The SQLite source database is planning evidence only.
   - The audit script opens `prisma/dev.db` read-only and reports table inventory and row counts when `node:sqlite` is available.
   - DB-PG-A must not use that inventory to mutate data.

## Migration Plan

Recommended later phases:

1. DB-PG-B: freeze or close the L7 Excel write path.
   - Decide whether L7 remains SQLite-only until all imports finish.
   - If L7 must work after PostgreSQL cutover, redesign backup and rollback away from file-copy semantics.

2. DB-PG-C: create a PostgreSQL schema baseline.
   - Do not replay SQLite migrations.
   - Generate a PostgreSQL-compatible baseline from the reviewed Prisma model after explicit approval.
   - Review type differences, defaults, enum mapping, indexes, uniqueness, and relation constraints.

3. DB-PG-D: data export and transform dry run.
   - Export SQLite data into deterministic intermediate artifacts.
   - Normalize timestamp, boolean, autoincrement, null, and relation behavior before import.
   - Run this against a disposable PostgreSQL database first.

4. DB-PG-E: application verification.
   - Verify scheduler, imports, auth/session, adjustment requests, admin DB browser, and export flows against PostgreSQL.
   - Include rollback criteria before production cutover.

5. DB-PG-F: production cutover.
   - Requires explicit approval, backup plan, downtime window or write freeze, and post-cutover verification.

## Risk Register

| Risk | Severity | DB-PG-A Position |
| --- | --- | --- |
| SQLite provider and migration lock | Blocking for direct migration | Leave unchanged |
| SQLite-specific migration SQL | Blocking for direct migration | Do not replay against PostgreSQL |
| L7 file-copy backup assumptions | Warning / migration blocker for write path | Leave L7 unaffected |
| SQLite `dev.db` source data | Planning-only evidence | Read-only inspection only |
| Package scripts / CI drift | Scope risk | Do not wire audit script into package scripts |

## Closeout Criteria

- Current branch is `db-pg-a-migration-plan`.
- Protected paths have empty diff:
  - `prisma/schema.prisma`
  - `prisma/migrations/**`
  - `.env`
  - `package.json`
  - `package-lock.json`
  - `prisma/dev.db`
  - L7 Excel import scripts
- Only the DB-PG-A docs and standalone audit script are staged and committed.
- Audit script non-zero exit is acceptable when it reports blocking PostgreSQL migration risks.

Expected audit blocking reason:

```text
current SQLite provider / SQLite migration SQL / L7 SQLite backup assumptions block direct PostgreSQL migration
```

## Conclusion

DB-PG-A is audit/plan only. No PostgreSQL migration is performed. The current L7 Excel import mainline remains SQLite-based and unaffected. Real PostgreSQL migration should start later as DB-PG-B or equivalent after the L7 write path is closed or explicitly frozen.
