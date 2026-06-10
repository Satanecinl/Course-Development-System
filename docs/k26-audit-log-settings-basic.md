# K26-Q1: Audit Log Settings — Basic Implementation

## 1. Executive Summary

K26-Q1 implements a **read-only** audit log settings panel as the ninth
ready module of the system settings center. The module does **not** add a
unified `AuditLog` table. It only aggregates the existing local audit /
change log sources already present in the system and surfaces their
coverage status.

- `GET /api/admin/settings/audit-logs` — returns summary, sources,
  operationCoverage, recentActivity, limitations, readOnly=true.
  **Read-only, no writes.**
- `AuditLogsSettingsPanel` — UI panel with summary cards, audit source
  catalogue, operation coverage table, recent activity table, unified
  audit limitations, and explicit safety rules.
- Module status: `roadmap` → `ready`
- Permission: `settings:manage` (reused from existing system settings APIs)
- No schema/migration changes. No DB writes. No destructive API.
- `readOnly: true` and `unifiedAuditLogSchemaExists: false` are
  **hardcoded** in the API response.

## 2. What is displayed

| Section | Source of truth |
|---------|-----------------|
| Summary cards | `prisma.*.count()` for each source + filesystem scan of `scripts/audit-*.ts` and `docs/k26-*.md` |
| Audit sources | Hardcoded list of 11 sources with `prisma.*.count()` where applicable |
| Operation coverage | Hardcoded list of 15 operations with status (covered / partial / planned / not-covered) |
| Recent activity | Last 5 rows from `SchedulingRun / SchedulerRunChange / ScheduleAdjustment / ImportBatch / Semester`, sorted by `createdAt` desc, trimmed to 15 |
| Limitations | Hardcoded list of 6 unified-audit limitations (unified table / actor / diff / export / cleanup / realtime) |
| Safety rules | Hardcoded list of 7 read-only invariants |

## 3. Audit sources surfaced (read model)

| Key | Status | Real source |
|-----|--------|-------------|
| `scheduling-run` | available | `prisma.schedulingRun` |
| `scheduler-run-change` | available | `prisma.schedulerRunChange` |
| `schedule-adjustment` | available | `prisma.scheduleAdjustment` |
| `import-batch` | available | `prisma.importBatch` |
| `schedule-change-log` | partial | `prisma.scheduleChangeLog` (auto-written only on direct slot writes) |
| `semester-timestamps` | partial | `Semester.createdAt / updatedAt` (no operator) |
| `user-role-timestamps` | partial | `UserRole / RolePermission.createdAt` (no updatedAt / operator) |
| `worktime-config-timestamps` | partial | `WorkTimeConfig.version / updatedAt` (no operator) |
| `audit-scripts` | available | `scripts/audit-*.ts` (manual execution) |
| `k26-docs` | available | `docs/k26-*.md` (project wiki style) |
| `unified-audit-log` | **planned** | (not implemented) |

## 4. Read-only limitations (UI/API)

- No save button
- No delete button
- No cleanup button
- No export button
- No create unified AuditLog button
- No PUT / POST / DELETE / PATCH handlers in the API route
- Only `onClick={reload}` buttons allowed (verified by check)
- `readOnly: true` and `unifiedAuditLogSchemaExists: false` hardcoded

## 5. Files added / modified

```
A src/app/api/admin/settings/audit-logs/route.ts
A src/lib/settings/audit-logs-client.ts
A src/components/settings/audit-logs-settings-panel.tsx
A scripts/verify-audit-log-settings-basic-k26-q1.ts
A docs/k26-audit-log-settings-basic.md
A docs/k26-audit-log-settings-basic.json
M src/lib/settings/settings-modules.ts        # audit-log status: roadmap → ready
M src/components/settings/settings-center.tsx # import + route to AuditLogsSettingsPanel
```

No schema/migration/DB changes. No RBAC semantic changes. No solver/score/
importer/parser changes. No new `package.json` scripts. No new audit
write logic. No destructive API endpoints.

## 6. Verification Results

| Command | Result |
|---------|--------|
| K26-Q1 verify (self-checks) | _pending_ |
| K26-P1 verify | _pending_ (with documented 600s harness timeout fallback) |
| K26-O1 verify | _pending_ (with documented 600s harness timeout fallback) |
| `npx prisma validate` | _pending_ |
| `npx prisma migrate status` | _pending_ |
| `npm run build` | _pending_ |
| `npm run lint` | _pending_ (baseline 184/146 = 330 problems) |
| `npm run test:auth-foundation` | _pending_ (baseline 53 passed / 1 pre-existing failed) |

## 7. Next Stage

`K26-Q2-AUDIT-LOG-SETTINGS-MANUAL-TRIAL`
