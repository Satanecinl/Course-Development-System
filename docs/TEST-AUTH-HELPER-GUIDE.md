# 测试 Auth Helper 使用指南

## 1. 为什么测试需要 auth helper

H2 权限系统为所有 API 路由添加了认证保护。测试脚本需要：
- 创建 admin/user session
- 在 API 请求中携带 session cookie
- 测试 401（未认证）和 403（无权限）场景

## 2. 测试账号

| 账号 | 角色 | 权限 | 用途 |
|------|------|------|------|
| admin | ADMIN | 全部 10 个权限 | 测试管理员操作 |
| user | USER | data:read | 测试普通用户和越权场景 |

## 3. Helper 函数

### 创建 Session Cookie

```typescript
import { createAdminCookie, createUserCookie } from './test-auth-helper'

// 创建 admin session cookie
const adminCookie = await createAdminCookie()

// 创建 user session cookie
const userCookie = await createUserCookie()
```

### 便捷 Fetch 函数

```typescript
import { fetchJsonAsAdmin, fetchJsonAsUser, fetchJson } from './test-auth-helper'

// 以 admin 身份请求（每次调用创建新 session）
const result = await fetchJsonAsAdmin('/api/schedule')

// 以 user 身份请求
const result = await fetchJsonAsUser('/api/schedule')

// 不带 cookie 请求（用于测试 401）
const result = await fetchJson('/api/schedule')

// 带自定义选项
const result = await fetchJsonAsAdmin('/api/teachers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '新教师' }),
})
```

### 非 JSON 响应（如 Excel 导出）

```typescript
import { fetchAsAdmin } from './test-auth-helper'

// 返回原始 Response 对象
const response = await fetchAsAdmin('/api/export/excel')
const buffer = await response.arrayBuffer()
```

### 断言辅助函数

```typescript
import { expectUnauthorized, expectForbidden } from './test-auth-helper'

const result = await fetchJson('/api/schedule')
expectUnauthorized(result.status, '无 cookie 访问')

const result2 = await fetchJsonAsUser('/api/schedule')
expectForbidden(result2.status, 'User 访问排课')
```

## 4. 测试 401 / 403 的推荐写法

```typescript
// 测试 401：不带 cookie
const noAuth = await fetchJson('/api/schedule')
assert(noAuth.status === 401, '未登录 → 401')

// 测试 403：以 user 身份访问需要 admin 权限的接口
const userAccess = await fetchJsonAsUser('/api/schedule')
assert(userAccess.status === 403, 'User 无 schedule:view → 403')
```

## 5. Session 清理

当前 helper 创建的 session 不会自动清理。如需清理：

```typescript
import { cleanup } from './test-auth-helper'

// 测试结束时断开 Prisma 连接
await cleanup()
```

测试创建的 session 会在数据库中残留，但不影响功能（过期后自动失效）。

## 6. 新增 API 测试的推荐模式

```typescript
import { PrismaClient } from '@prisma/client'
import { fetchJsonAsAdmin, fetchJsonAsUser, fetchJson, cleanup } from './test-auth-helper'

const prisma = new PrismaClient()

async function main() {
  console.log('=== My Test ===\n')

  // 1. 测试 401
  const noAuth = await fetchJson('/api/my-endpoint')
  assert(noAuth.status === 401, '未登录 → 401')

  // 2. 测试 admin 访问
  const adminRes = await fetchJsonAsAdmin('/api/my-endpoint')
  assert(adminRes.status === 200, 'Admin → 200')

  // 3. 测试 user 越权
  const userRes = await fetchJsonAsUser('/api/my-endpoint')
  assert(userRes.status === 403, 'User → 403')

  // 4. 测试业务逻辑（以 admin 身份）
  const createRes = await fetchJsonAsAdmin('/api/my-endpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ /* data */ }),
  })
  assert(createRes.status === 200, '创建成功')

  await cleanup()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
```

## 7. 禁止事项

- **不绕过权限**：测试必须携带有效 session cookie
- **不移除 requirePermission**：业务 API 必须保持权限检查
- **不硬编码 raw session token**：使用 helper 创建 session
- **不依赖浏览器 cookie**：测试通过 header 传递 cookie
- **不打印 raw token**：避免日志泄露
