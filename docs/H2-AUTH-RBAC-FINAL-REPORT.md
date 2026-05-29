# H2 认证与权限控制系统 — 最终报告

## 1. H2 目标

- 首页从展示页改造为登录入口
- 系统升级为带登录验证的多角色管理系统
- API 路由全部受保护
- 基于角色的访问控制（RBAC）

## 2. 已完成阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| H2-A | User / Role / Permission / UserRole / RolePermission / Session 模型 + auth/RBAC 工具 | ✅ 完成 |
| H2-B | 登录页 / session cookie / logout / /data 占位页 | ✅ 完成 |
| H2-C | auth_claims cookie / middleware 路由保护 / /403 / route permission rules / Edge Runtime crypto 修复 | ✅ 完成 |
| H2-D | ProtectedShell / Sidebar / Header / 基于 permissions 渲染 | ✅ 完成 |
| H2-E | requirePermission / requireAuth / API 权限保护 / Server Action 扫描 | ✅ 完成 |
| H2-F | 全量回归与交付验收 | ✅ 完成 |

## 3. 数据库设计

### 核心表

- **User** — username, displayName, passwordHash, isActive
- **Role** — name (ADMIN / USER)
- **Permission** — key (schedule:view, data:read, etc.)
- **UserRole** — userId ↔ roleId
- **RolePermission** — roleId ↔ permissionId
- **Session** — userId, tokenHash, expiresAt, revokedAt

### 权限基线

| 角色 | 权限 |
|------|------|
| ADMIN | 全部 10 个权限 |
| USER | data:read |

### 扩展新角色

1. 在 Role 表新增角色
2. 在 RolePermission 表关联所需 Permission
3. 在 UserRole 表分配用户
4. 更新 route-permissions.ts（如需新路由规则）

## 4. 路由保护设计

### 重定向

- `/` → `/login`（已登录用户根据权限跳转 /dashboard 或 /data）
- 未认证访问保护页面 → `/login?next=...`
- 无权限访问 → `/403`

### Middleware

- 读取 `auth_claims` cookie（HMAC 签名）
- 使用 `claims-edge.ts`（Web Crypto API，Edge Runtime 安全）
- 不使用 Prisma
- 过期或无效 claims → 清除 cookie + 重定向 /login

### Route Permission Rules

集中配置在 `src/lib/auth/route-permissions.ts`：

| 路径 | 权限 |
|------|------|
| /dashboard | schedule:view |
| /admin/schedule | schedule:view |
| /admin/import | import:manage |
| /admin/db | data:write |
| /admin/settings | settings:manage |
| /admin/users | users:manage |
| /admin/diagnostics | diagnostics:view |
| /data | data:read |

## 5. 最终授权设计

### 关键原则

**Middleware 不是最终安全边界。** API / Server Action 使用数据库 Session 做最终授权。

### 授权链路

```
Request Cookie → SESSION_COOKIE_NAME → hashSessionToken
→ prisma.session.findUnique (校验 revokedAt, expiresAt)
→ prisma.user.findUnique (with roles/permissions)
→ 无 session → 401 UNAUTHENTICATED
→ 无权限 → 403 FORBIDDEN
```

### 工具函数

- `requireAuth(request)` — 返回 user 或 401
- `requirePermission(permission, request)` — 返回 user 或 403
- `requireAnyPermission(permissions[], request)` — 返回 user 或 403

### 响应格式

- 401: `{ error: "UNAUTHENTICATED", message: "请先登录" }`
- 403: `{ error: "FORBIDDEN", message: "当前账号没有权限执行该操作" }`

## 6. UI 改造

### 登录页

- `/login` — LoginForm 组件
- 用户名 + 密码表单
- 错误提示
- 登录成功跳转默认页

### ProtectedShell

- 包裹所有受保护页面
- Sidebar + Header 布局

### Sidebar

- Admin: 完整菜单（排课管理、数据管理、系统管理全部子项）
- User: 只显示数据管理

## 7. API 权限覆盖

- audit-api-permissions: **22/22 routes protected**
- test:h2e-api-permissions: **84/84 passed**
- Server Action 扫描: **无敏感未保护入口**
- requirePermission 基于数据库 Session，不依赖 auth_claims cookie

## 8. 回归结果

| 测试 | 结果 |
|------|------|
| npm run build | ✅ 通过 |
| npm run test:auth-foundation | ✅ 52/52 |
| npm run test:h2b-login | ✅ 50/50 |
| npm run test:h2c-middleware | ✅ 69/69 |
| npm run test:h2d-layout-sidebar | ✅ 70/70 |
| npm run test:h2e-api-permissions | ✅ 84/84 |
| audit-api-permissions | ✅ 22/22 |
| g0fixb-verify-database | ✅ 通过 |
| test:diagnostics | ✅ 通过（94 容量冲突为源数据既有问题） |
| test:schedule-adjustment | ✅ PASS |
| test:schedule-adjustment-api-e2e | ✅ PASS |
| test:schedule-adjustment-cross-week | ✅ PASS |
| test:capacity | ✅ 通过（容量冲突为源数据既有问题） |
| test:solver | ✅ 通过（硬约束为源数据既有问题） |
| test:schedule-adjustment-final-acceptance | ✅ PASS |
| test:import-workflow | ✅ PASS |

### 原有功能回退检查

- F2 解析功能：未改动，无回退
- G0 数据验收：通过
- G1 调课功能：全部通过

## 9. 数据安全

| 项目 | 基线 | 当前 | 状态 |
|------|------|------|------|
| ImportBatch #1 | confirmed | confirmed | ✅ |
| TeachingTask | 308 | 308 | ✅ |
| ScheduleSlot | 440 | 440 | ✅ |
| ScheduleAdjustment ACTIVE | 0 | 0 | ✅ |
| 非法 Course | 0 | 0 | ✅ |
| 重复 ScheduleSlot | 0 | 0 | ✅ |

## 10. 已知非阻塞项

| 项目 | 说明 |
|------|------|
| Next.js workspace root warning | 多个 package-lock.json 导致，不影响功能 |
| middleware convention deprecated | Next.js 16 建议迁移到 proxy convention，后续处理 |
| 容量冲突 (94) | 源课表既有问题，非 H2 引入 |

## 11. 是否可以关闭 H2

**可以关闭 H2。**

所有核心目标已完成：
- ✅ 登录认证系统
- ✅ RBAC 权限控制
- ✅ Middleware 路由保护
- ✅ API 路由权限保护 (22/22)
- ✅ UI 改造（登录页、ProtectedShell、Sidebar）
- ✅ 数据安全无回退
- ✅ 业务功能无回退
