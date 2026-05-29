# 权限开发规范与审计流程

## 1. 权限系统总览

### 关键原则

**Middleware 不是最终安全边界。** API / Server Action 使用数据库 Session 做最终授权。

```
请求 → Middleware (路由保护) → API Route (requirePermission) → 业务逻辑
         ↓                          ↓
    auth_claims cookie          数据库 Session
    (快速路由跳转)              (最终授权)
```

### 各层职责

| 层 | 职责 | 授权依据 |
|----|------|----------|
| Middleware | 页面路由保护、重定向 | auth_claims cookie (HMAC 签名) |
| Sidebar / Navigation | UI 菜单展示控制 | permissions Set |
| API Route | 业务授权 | 数据库 Session (requirePermission) |
| Server Action | 业务授权 | 数据库 Session (requirePermission) |

## 2. 权限模型

### 数据库表

- **User** — username, displayName, passwordHash, isActive
- **Role** — name (ADMIN / USER)
- **Permission** — key (schedule:view, data:read, etc.)
- **UserRole** — userId ↔ roleId
- **RolePermission** — roleId ↔ permissionId
- **Session** — userId, tokenHash, expiresAt, revokedAt

### 当前权限基线

| 角色 | 权限 |
|------|------|
| ADMIN | 全部 10 个权限 |
| USER | data:read |

### 新增角色步骤

1. 在 Role 表新增角色记录
2. 在 RolePermission 表关联所需 Permission
3. 在 UserRole 表分配用户
4. 更新 `src/lib/auth/route-permissions.ts`（如需新路由规则）
5. 更新 `src/lib/auth/navigation.ts`（如需菜单）
6. 运行 `npm run test:h2e-api-permissions` 验证

### 权限 Code 命名规范

```
<模块>:<操作>
```

示例:
- `schedule:view` — 查看排课
- `schedule:adjust` — 调课操作
- `data:read` — 读取数据
- `data:write` — 写入数据
- `data:delete` — 删除数据
- `data:export` — 导出数据
- `import:manage` — 导入管理
- `settings:manage` — 系统设置
- `users:manage` — 用户管理
- `diagnostics:view` — 诊断查看

## 3. 新增页面路由时必须做什么

### 检查清单

- [ ] 更新 `src/lib/auth/route-permissions.ts` 添加路由规则
- [ ] 更新 `src/lib/auth/navigation.ts` 添加菜单项（如需）
- [ ] 页面不要写死 `role === 'ADMIN'`
- [ ] 普通用户越权应返回 `/403`
- [ ] 运行 `npm run test:h2c-middleware` 验证
- [ ] 运行 `npm run test:h2d-layout-sidebar` 验证

### 示例

```typescript
// src/lib/auth/route-permissions.ts
const ROUTE_RULES: RouteRule[] = [
  // ... 现有规则
  { pattern: /^\/admin\/new-page/, permissions: ['some:permission'] },
]
```

```typescript
// src/lib/auth/navigation.ts
export const NAV_ITEMS: NavItem[] = [
  // ... 现有项
  {
    label: '新页面',
    href: '/admin/new-page',
    icon: SomeIcon,
    permissions: ['some:permission'],
  },
]
```

## 4. 新增 API Route 时必须做什么

### 检查清单

- [ ] 必须调用 `requirePermission` / `requireAuth`
- [ ] 401 返回 `{ error: 'UNAUTHENTICATED', message: '请先登录' }`
- [ ] 403 返回 `{ error: 'FORBIDDEN', message: '当前账号没有权限执行该操作' }`
- [ ] 不允许裸 API（无权限检查）
- [ ] 不允许只靠前端隐藏按钮
- [ ] 运行 `npm run test:h2e-api-permissions` 验证
- [ ] 运行 `npm run audit:api-permissions` 验证

### 示例

```typescript
import { requirePermission } from '@/lib/auth/require-permission'

export async function GET(request: NextRequest) {
  const auth = await requirePermission('data:read', request)
  if ('error' in auth) return auth.error

  // 业务逻辑...
  return NextResponse.json({ success: true, data })
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission('data:write', request)
  if ('error' in auth) return auth.error

  // 业务逻辑...
  return NextResponse.json({ success: true })
}
```

### 权限建议

| HTTP 方法 | 建议权限 |
|-----------|----------|
| GET | data:read 或对应模块 view 权限 |
| POST | data:write 或对应模块 write 权限 |
| PUT | data:write 或对应模块 write 权限 |
| PATCH | data:write 或对应模块 adjust 权限 |
| DELETE | data:delete 或对应模块 delete 权限 |

## 5. 新增 Server Action 时必须做什么

### 检查清单

- [ ] 敏感 Server Action 必须调用 `requirePermission`
- [ ] 认证本身 `loginAction` 是例外（不需要 requirePermission）
- [ ] 新增后运行 Server Action 扫描
- [ ] 不允许在 action 内写死 `role === 'ADMIN'`

### Server Action 扫描命令

```bash
# 搜索所有 "use server" 文件
rg "'use server'" src/
rg '"use server"' src/

# 搜索表单 action 引用
rg "action=" src/app/ src/components/ --glob '*.tsx'
```

## 6. 权限矩阵

| 权限 | 用途 | 保护的模块/API |
|------|------|----------------|
| schedule:view | 查看排课 | /dashboard, /api/schedule, /api/schedule-adjustments GET |
| schedule:adjust | 调课操作 | /api/schedule-adjustments POST/PATCH, /api/schedule-adjustments/dry-run |
| data:read | 读取数据 | /data, /api/rooms, /api/teachers, /api/class-groups, /api/entity-list, /api/admin/[model] GET |
| data:write | 写入数据 | /admin/db, /api/teachers POST, /api/courses POST, /api/schedule-slot POST, /api/teaching-task POST |
| data:delete | 删除数据 | /api/admin/[model] DELETE |
| data:export | 导出数据 | /api/export/excel |
| import:manage | 导入管理 | /admin/import, /api/admin/import/* |
| settings:manage | 系统设置 | /admin/settings |
| users:manage | 用户管理 | /admin/users |
| diagnostics:view | 诊断查看 | /admin/diagnostics |

## 7. 测试规范

### 使用 test-auth-helper

```typescript
import {
  fetchJsonAsAdmin,
  fetchJsonAsUser,
  fetchJson,
  expectUnauthorized,
  expectForbidden,
} from './test-auth-helper'

// 测试 401（不带 cookie）
const noAuth = await fetchJson('/api/schedule')
expectUnauthorized(noAuth.status)

// 测试 admin 访问
const adminRes = await fetchJsonAsAdmin('/api/schedule')
assert(adminRes.status === 200)

// 测试 user 越权
const userRes = await fetchJsonAsUser('/api/schedule')
expectForbidden(userRes.status)

// 测试 user 有权访问
const userData = await fetchJsonAsUser('/api/rooms')
assert(userData.status === 200)
```

### POST 请求示例

```typescript
const result = await fetchJsonAsAdmin('/api/teachers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '新教师' }),
})
assert(result.status === 200)
```

### 禁止事项

- 不硬编码 raw session token
- 不依赖浏览器 cookie
- 测试创建临时数据必须清理

## 8. 审计流程

### API 权限审计

```bash
# 检查所有 API route 是否有 requirePermission
npm run audit:api-permissions
# 预期: 22/22 routes protected

# 运行权限测试
npm run test:h2e-api-permissions
# 预期: 84/84 passed
```

### Server Action 审计

```bash
# 搜索所有 "use server" 文件
rg "'use server'" src/
rg '"use server"' src/

# 检查是否有敏感未保护 action
# 认证本身 (loginAction) 不需要保护
# 其他敏感 action 必须有 requirePermission
```

### 完整回归

```bash
npm run build
npm run test:auth-foundation
npm run test:h2b-login
npm run test:h2c-middleware
npm run test:h2d-layout-sidebar
npm run test:h2e-api-permissions
npm run audit:api-permissions
npx tsx scripts/g0fixb-verify-database.ts
```

## 9. 新增功能 PR / 提交前检查清单

### API 相关

- [ ] 是否新增 API route
- [ ] 是否新增 Server Action
- [ ] 新增 API 是否调用 requirePermission
- [ ] 新增 Server Action 是否调用 requirePermission（敏感操作）

### 路由相关

- [ ] 是否新增页面路由
- [ ] 是否更新 route-permissions.ts
- [ ] 是否更新 navigation.ts

### 测试相关

- [ ] 是否新增或更新权限测试
- [ ] 是否运行 audit-api-permissions
- [ ] 是否运行 test:h2e-api-permissions
- [ ] 是否检查 401/403

### 数据相关

- [ ] ImportBatch #1 是否仍 confirmed
- [ ] TeachingTask 是否未变
- [ ] ScheduleSlot 是否未变
- [ ] ScheduleAdjustment ACTIVE 是否为 0

## 10. 禁止事项

| 禁止 | 原因 |
|------|------|
| `role === 'ADMIN'` 作为最终授权 | 应使用 permission，不是 role |
| 移除 requirePermission | 会破坏 API 权限保护 |
| 为了测试放宽权限 | 测试应使用 auth helper |
| middleware 查 Prisma | middleware 运行在 Edge Runtime |
| middleware import node:crypto / Buffer | Edge Runtime 不支持 |
| API 返回 HTML 401/403 | 应返回 JSON |
| 测试脚本使用裸 token | 应使用 test-auth-helper |

## 11. 当前已知非阻塞项

| 项目 | 说明 | 建议 |
|------|------|------|
| middleware deprecated | Next.js 16 建议迁移到 proxy | 延后迁移，等版本升级 |
| workspace root warning | 父目录存在误生成的 package files | 用户手动删除 |
| test session revoke | 测试 session 未自动清理 | 后续 Auth Hardening 处理 |
