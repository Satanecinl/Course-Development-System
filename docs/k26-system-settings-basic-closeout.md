# K26-SYSTEM-SETTINGS-BASIC-CLOSEOUT

## 1. Stage

`K26-SYSTEM-SETTINGS-BASIC-CLOSEOUT`

## 2. Closed Scope

Lightweight closeout of the **system settings basic-version** as a whole.
This stage does NOT add new functionality, run long audit chains, or
modify business logic. It only:

- Records the closed state of all nine settings modules
- Adds a single static-only closeout verify script
- Archives the closeout document

## 3. Nine Module Status

All nine modules are `READY_FOR_REAL_USE`:

| # | Module | Key | Panel | API | Status |
|---|--------|-----|-------|-----|--------|
| 1 | 学期设置 | `semester-settings` | `SemesterSettingsPanel` | reuses `/api/semesters` | READY_FOR_REAL_USE |
| 2 | 排课参数设置 | `scheduler-config` | `SchedulerConfigSettingsPanel` | reuses `/api/admin/scheduler/...` | READY_FOR_REAL_USE |
| 3 | 节次与作息设置 | `time-slot-worktime` | `WorkTimeSettingsPanel` | reuses `/api/admin/worktime-configs/*` | READY_FOR_REAL_USE |
| 4 | 校区 / 教室规则设置 | `campus-room-rules` | `CampusRoomRulesSettingsPanel` | `GET /api/admin/settings/campus-room-rules` | READY_FOR_REAL_USE |
| 5 | 调课规则设置 | `adjustment-rules` | `AdjustmentRulesSettingsPanel` | `GET /api/admin/settings/adjustment-rules` | READY_FOR_REAL_USE |
| 6 | 导入规则设置 | `import-rules` | `ImportRulesSettingsPanel` | `GET /api/admin/settings/import-rules` | READY_FOR_REAL_USE |
| 7 | 权限与角色设置 | `rbac-settings` | `PermissionRolesSettingsPanel` | `GET /api/admin/settings/permission-roles` | READY_FOR_REAL_USE |
| 8 | 数据维护与备份 | `data-maintenance` | `DataMaintenanceSettingsPanel` | `GET /api/admin/settings/data-maintenance` | READY_FOR_REAL_USE |
| 9 | 审计日志 | `audit-log` | `AuditLogsSettingsPanel` | `GET /api/admin/settings/audit-logs` | READY_FOR_REAL_USE |

## 4. Manual Validation Status

- 模块 1–3 (semester / scheduler-config / worktime): closed in K25 / K26-B / K26-H respectively, with documented manual validation.
- 模块 4–5 (campus-room-rules / adjustment-rules): closed in K26-L1 / K26-M1 with manual acceptance verification (K26-L2 / K26-M2).
- 模块 6 (import-rules): closed in K26-N1 with manual cross-check.
- 模块 7 (permission-roles): closed in K26-O1 with manual RBAC validation.
- 模块 8 (data-maintenance): closed in K26-P1 with manual data-maintenance validation.
- 模块 9 (audit-logs): closed in K26-Q1 with manual audit-log review.

## 5. Technical Validation Status

- `npx tsx scripts/verify-system-settings-basic-closeout-k26.ts` → 106/106 PASS
- `npx prisma validate` → PASS
- `npx prisma migrate status` → up to date (8 migrations)
- `npm run build` → PASS (all 9 settings routes registered)
- `npm run lint` → 184/146 baseline (330 problems, no new lint debt)
- `npm run test:auth-foundation` → 53 passed / 1 pre-existing failed (ScheduleAdjustment ACTIVE=0)
- Optional: `npx tsx scripts/verify-audit-log-settings-basic-k26-q1.ts` and `npx tsx scripts/verify-data-maintenance-settings-basic-k26-p1.ts` may timeout on the 600s harness limit when running their upstream P1/O1 deep chain; this is documented harness limitation, not functional regression. Direct self-checks PASS.

## 6. Known Limitations (carried over from K26-L1..K26-Q1)

- **Module 4 (campus-room-rules)**: HC6 hard rule is not toggleable. Only basic read-only view.
- **Module 5 (adjustment-rules)**: does not yet consult WorkTime config in plan / room / dry-run (K26-I known gap, scheduled for K26-I1..I4).
- **Module 6 (import-rules)**: source evidence only forward-fills on new imports; historical data not backfilled (K20-FIX-B design).
- **Module 7 (permission-roles)**: UserRole / RolePermission have no `updatedAt` / operator. Only `createdAt`.
- **Module 8 (data-maintenance)**: no one-click backup / restore / cleanup / fix; destructive actions are disabled by design.
- **Module 9 (audit-logs)**: no unified `AuditLog` table; only local audit sources. `unifiedAuditLogSchemaExists: false` hardcoded.
- **Auth foundation**: ScheduleAdjustment ACTIVE = 0 (actual 10) pre-existing failure, not in this stage's scope.

## 7. Not Implemented Items

- Unified `AuditLog` schema / model
- Audit log export / cleanup / retention policy
- One-click backup / restore UI
- Migration reset / db push --force-reset UI
- HC6 toggle UI
- Historical source-evidence backfill
- UserRole / RolePermission operator tracking

## 8. K22 Expected Status

- `docs/k22-score-default-snapshot.json` — unchanged
- `docs/k22-score-regression-harness-implementation.json` — unchanged

## 9. DB / Schema Status

- `prisma/schema.prisma` — unchanged
- `prisma/migrations/` — unchanged (8 migrations, latest `20260608000000_add_worktime_config`)
- `prisma/dev.db` — NOT committed, no destructive write performed

## 10. Recommended Next Stage

`K27-SYSTEM-WIDE-REAL-USAGE-TRIAL` — exercise the closed basic system end-to-end
on real workflows:

```
学期设置 → 导入 → 调课 → 推荐 → 自动排课 preview → apply/rollback → 系统设置查看状态
```

## 11. Files added

```
A scripts/verify-system-settings-basic-closeout-k26.ts
A docs/k26-system-settings-basic-closeout.md
A docs/k26-system-settings-basic-closeout.json
```

No source / schema / migration / API / UI changes.
