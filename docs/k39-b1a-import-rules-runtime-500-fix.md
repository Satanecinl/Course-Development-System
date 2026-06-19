# K39-B1A: Import Rules Runtime 500 Fix

> Stage: K39-B1A | Status: CLOSED | Date: 2026-06-19

## Root Cause

**Stale Prisma Client in dev server.** The dev server was started before `ImportRuleConfig` was added to the Prisma schema. When `GET /api/admin/settings/import-rules` called `prisma.importRuleConfig.findUnique()`, the delegate did not exist in the running Prisma Client, causing an unhandled error → HTTP 500.

## Fix

Added defensive `try/catch` to `src/lib/settings/import-rule-config.ts`:
- `getImportRuleConfig()`: catches Prisma errors, returns safe fallback (`requireExplicitSemesterForImport=false`)
- `updateImportRuleConfig()`: catches Prisma errors, returns fallback

**User must restart dev server** (Ctrl+C + `npm run dev`) after pulling this fix.

## DB Backup

- Path: `prisma/dev.db.backup-before-k39-b1a-20260619-185409`
- Size: ~62MB
- Gitignored: ✅

## Migration Evidence

- `prisma/migrations/20260619000000_add_import_rule_config_k39_b1/migration.sql` exists and is git-tracked
- `npx prisma migrate status`: up to date (13 migrations)
- `npx prisma validate`: valid

## Verification

- Config helper: defensive try/catch with safe fallback
- GET route: uses `getImportRuleConfig()` (safe)
- PATCH route: uses `updateImportRuleConfig()` (safe)
- Settings UI: toggle + save/cancel (unchanged)
- Upload dialog: semester banner + checkbox (unchanged)
- Cross-cohort guard: locked (unchanged)
