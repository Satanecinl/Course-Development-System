# K26-P1: Data Maintenance & Backup Settings — Basic Implementation

## 1. Executive Summary

K26-P1 implements a **read-only** data maintenance & backup settings panel
as the eighth ready module of the system settings center. This module is
unique in that it intentionally exposes **zero write capability** — all
destructive operations (backup, restore, cleanup, fix, migrate reset) are
forbidden in the UI/API and described only as safety-rule guidance.

- `GET /api/admin/settings/data-maintenance` — returns summary, sections,
  safeguards, knownChecks, safetyRules. **Read-only, no writes.**
- `DataMaintenanceSettingsPanel` — UI panel with summary cards, six
  maintenance sections (DB status / backup & restore / data export /
  cleanup capability / anomaly checks / migration status), safeguards,
  known checks catalogue, and explicit safety rules.
- Module status: `roadmap` → `ready`
- Permission: `settings:manage` (reused from existing system settings APIs)
- No schema/migration changes. No DB writes. No destructive API.
- `destructiveActionsEnabled: false` is **hardcoded** as a module-level
  invariant.

## 2. What is displayed

| Section | Source of truth |
|---------|-----------------|
| Summary cards | Filesystem + constants (database type, migration count, known-check count, destructive-actions flag) |
| Database status | `prisma/schema.prisma` (provider), `.gitignore` (dev.db / backup patterns) |
| Backup & restore | README/CLAUDE.md guidance + filesystem hints |
| Data export | Existing `/api/export/excel`, `/api/data/summary`, `export:data-template` script (requires external `DATA_EXPORT_DIR`) |
| Cleanup capability | Existing `audit-cleanup-candidates.ts` / `cleanup-teaching-task-class-pollution.ts` / `audit-data-quality-classgroup-matching-k17-fix-a.ts` |
| Anomaly data checks | K21 / K17-K19 / K20 / K22-C / auth-foundation |
| Migration status | `prisma/migrations/` directory listing (count only, no execution) |
| Safeguards | Hardcoded safety rules + .gitignore detection |
| Known checks | Hardcoded list of last-known-status of existing audit/verify scripts |
| Safety rules | Hardcoded list of forbidden operations |

## 3. Sections (read model)

| Key | Label | Status | Risk |
|-----|-------|--------|------|
| `database-status` | 数据库状态 | available (SQLite) | low |
| `backup-and-restore` | 备份与恢复 | manual | high |
| `data-export` | 数据导出 | available | low |
| `cleanup-capability` | 清理能力 | manual | high |
| `anomaly-data-checks` | 异常数据检查 | available | low |
| `migration-status` | Migration 状态 | available | medium |

## 4. Sensitive field protection

This module does not return database content. It only reads:
- `prisma/schema.prisma` (provider text only)
- `prisma/migrations/` (directory listing, count)
- `.gitignore` (text grep for dev.db / backup patterns)
- `package.json` (script names, not values)
- `scripts/` directory (filenames starting with cleanup/audit/fix)

No user data, no business records, no credentials, no SQL data is read.

## 5. Destructive action controls

The module has multiple layers of protection against accidental destruction:

1. **API layer**: route exports only `GET`. No `PUT`/`POST`/`DELETE`/`PATCH`.
2. **API response**: `destructiveActionsEnabled: false` is hardcoded and
   surfaced as a safeguard.
3. **Permission**: reuses `settings:manage`. Does **not** add `data:write`.
4. **UI layer**: only `onClick={reload}` buttons allowed (verified by check).
5. **Safety rules block**: explicit `safetyRules` array in API + UI.
6. **No scripts for backup/restore/cleanup/fix execution** are added to
   `package.json`.

## 6. Read-only limitations

- No save button
- No one-click backup button
- No one-click restore button
- No one-click cleanup button
- No one-click fix button
- No `migrate reset` button
- No `db push --force-reset` button
- No PUT / POST / DELETE / PATCH handlers in the API route

## 7. Files added / modified

```
A src/app/api/admin/settings/data-maintenance/route.ts
A src/lib/settings/data-maintenance-client.ts
A src/components/settings/data-maintenance-settings-panel.tsx
A scripts/verify-data-maintenance-settings-basic-k26-p1.ts
A docs/k26-data-maintenance-settings-basic.md
A docs/k26-data-maintenance-settings-basic.json
M src/lib/settings/settings-modules.ts        # data-maintenance status: roadmap → ready
M src/components/settings/settings-center.tsx # import + route to DataMaintenanceSettingsPanel
```

No schema/migration/DB changes. No RBAC semantic changes. No solver/score/
importer/parser changes. No new `package.json` scripts.

## 8. Verification Results

| Command | Result |
|---------|--------|
| K26-P1 verify (self-checks) | _pending_ |
| K26-O1 verify | _pending_ (35/36 or 36/36 expected) |
| K26-N1 verify | _pending_ (36/38 with documented 600s harness timeout) |
| `npx prisma validate` | _pending_ |
| `npx prisma migrate status` | _pending_ |
| `npm run build` | _pending_ |
| `npm run lint` | _pending_ (baseline 184/146 = 330 problems) |
| `npm run test:auth-foundation` | _pending_ (baseline 53 passed / 1 pre-existing failed) |

## 9. Next Stage

`K26-P2-DATA-MAINTENANCE-SETTINGS-MANUAL-TRIAL`
