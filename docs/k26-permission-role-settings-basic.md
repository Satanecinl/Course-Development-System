# K26-O1: Permission & Role Settings — Basic Implementation

## 1. Executive Summary

K26-O1 implements a **read-only** permission & role settings panel as the
seventh ready module of the system settings center.

- `GET /api/admin/settings/permission-roles` — returns summary, roles,
  permissions, role-permission matrix, user-role overview, and key permission
  status. Read-only.
- `PermissionRolesSettingsPanel` — UI panel with summary cards, role list,
  permission list grouped by category, role-permission matrix, user-role
  binding overview, and key permission status.
- Module status: `roadmap` → `ready`
- Permission: `settings:manage` (reused from existing system settings APIs)
- No schema/migration changes. No RBAC semantic changes. No new write paths.

## 2. What is displayed

| Section | Source of truth |
|---------|-----------------|
| Summary cards | `prisma.role` / `prisma.permission` / `prisma.userRole` counts |
| Role list | `prisma.role` + code-constant metadata (`seed-auth.ts`) |
| Permission list | `ALL_PERMISSIONS` (code) cross-referenced with `prisma.permission` |
| Role-permission matrix | `prisma.rolePermission` joined to `prisma.permission` |
| User-role overview | `prisma.user` + `prisma.userRole` (no sensitive fields) |
| Key permission status | `rolePermissionMatrix` filtered by key permission keys |

## 3. Roles (read model)

| Key | Description | Source |
|-----|-------------|--------|
| `ADMIN` | 系统管理员，拥有全部权限 | `seed-auth.ts` — 绑定全部 12 个权限 |
| `USER` | 普通用户，仅查看数据 | `seed-auth.ts` — 绑定 `data:read` |
| `DATA_EXPORTER` | 数据导出员，可查看和导出数据 | `seed-auth.ts` — 绑定 `data:read` + `data:export` |

All roles are flagged as `builtIn: true`.

## 4. Permissions (read model)

12 permission keys come from `src/lib/auth/types.ts` `ALL_PERMISSIONS`.
Each is classified into a category (`课表` / `调课` / `数据` / `导入` /
`系统设置` / `用户` / `诊断` / `教学任务`) and tagged `critical: true` for
keys that gate high-impact actions.

Critical permission keys:

- `schedule:adjust`, `schedule:write`, `import:manage`, `settings:manage`,
  `users:manage`, `data:write`, `data:delete`, `teaching-task:write`

## 5. Sensitive field protection

The API explicitly excludes these fields from the response:

- `passwordHash` (User.passwordHash)
- `tokenHash` (Session.tokenHash)
- `sessionToken` (transient session creation value)
- `email`, `phone` (not on User model; explicitly `null` for type safety)
- `expiresAt`, `revokedAt` (Session internal fields)

The API does not `select` `passwordHash` or `tokenHash` from Prisma. The UI
panel does not render these names either.

## 6. Read-only limitations

- No save button
- No edit role button
- No edit permission button
- No edit user-role binding button
- No `PUT` / `POST` / `DELETE` handlers in the API route
- Module is marked `builtIn` for all roles and `只读` badges in the UI

## 7. Files added / modified

```
A src/app/api/admin/settings/permission-roles/route.ts
A src/lib/settings/permission-roles-client.ts
A src/components/settings/permission-roles-settings-panel.tsx
A scripts/verify-permission-role-settings-basic-k26-o1.ts
A docs/k26-permission-role-settings-basic.md
A docs/k26-permission-role-settings-basic.json
M src/lib/settings/settings-modules.ts        # rbac-settings status: roadmap → ready
M src/components/settings/settings-center.tsx # import + route to PermissionRolesSettingsPanel
```

No schema/migration/DB changes. No RBAC semantic changes. No `seed-auth.ts`
modification. No solver/score/importer/parser changes.

## 8. Verification Results

| Command | Result |
|---------|--------|
| K26-O1 verify | _pending_ |
| K26-N1 verify | _pending_ |
| K26-M1 verify | _pending_ (35/36 expected — deep chain 600s harness timeout on L1 subrun, documented in K26-N1A) |
| K26-L1 verify | _pending_ |
| K26-K closeout | _pending_ |
| K22-C | _pending_ |
| `npx prisma validate` | _pending_ |
| `npx prisma migrate status` | _pending_ |
| `npm run build` | _pending_ |
| `npm run lint` | _pending_ (baseline 184/146 = 330 problems) |
| `npm run test:auth-foundation` | _pending_ (baseline 53 passed / 1 pre-existing failed) |

## 9. Next Stage

`K26-O2-PERMISSION-ROLE-SETTINGS-MANUAL-TRIAL`
