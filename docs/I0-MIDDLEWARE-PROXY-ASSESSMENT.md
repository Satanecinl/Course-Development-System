# I0-B Next.js Middleware / Proxy 风险评估

## 1. Next.js 版本

| 项目 | 值 |
|------|-----|
| package.json | `"next": "16.2.6"` |
| 版本系列 | Next.js 16 |
| middleware deprecated warning | ✅ 存在 |

Build 输出:
```
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
```

## 2. 当前 Middleware 状态

### 文件路径

- `src/middleware.ts` — 主入口
- `src/lib/auth/claims-edge.ts` — Edge-safe claims 签名/验证
- `src/lib/auth/route-permissions.ts` — 路由权限规则

### 当前职责

1. **静态资源跳过** — `/_next`, `/favicon`, 含 `.` 的路径
2. **公共路由放行** — `/login`, `/logout`, `/403`
3. **登录页重定向** — 已登录用户访问 `/login` → 跳转 defaultRedirect
4. **未认证重定向** — 保护路由无有效 claims → `/login?next=...`
5. **无效 claims 清理** — 过期/篡改 claims → 清除 cookie + 重定向
6. **权限检查** — 无权限 → `/403`

### 安全状态

| 检查项 | 状态 |
|--------|------|
| import Prisma | ❌ 不导入 |
| import Node crypto / Buffer | ❌ 不导入 |
| 使用 Edge-safe claims | ✅ claims-edge.ts (Web Crypto API) |
| 最终授权依赖 | auth_claims cookie (HMAC 签名) |

### Matcher 配置

```ts
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
```

- 排除 API routes（API 最终授权在 requirePermission）
- 排除静态资源
- 匹配所有页面路由

## 3. Proxy 迁移影响评估

### 迁移内容

根据 Next.js 16 proxy convention，需要:

1. **文件重命名**: `src/middleware.ts` → `src/proxy.ts`
2. **导出函数**: `export function middleware()` → `export function proxy()`
3. **config.matcher**: 保持不变
4. **内部逻辑**: 基本不变

### 可复用组件

| 组件 | 可复用 | 说明 |
|------|--------|------|
| claims-edge.ts | ✅ | Web Crypto API，Edge-safe |
| route-permissions.ts | ✅ | 纯函数，无 runtime 依赖 |
| constants.ts | ✅ | cookie 名称等常量 |

### 可能影响的测试

| 测试 | 需要修改 | 说明 |
|------|----------|------|
| test:h2c-middleware | ⚠️ 可能 | 文件检查 `readFileSync('src/middleware.ts')` |
| test:h2d-layout-sidebar | ❌ 否 | 不检查 middleware 文件 |
| test:h2e-api-permissions | ❌ 否 | 调用 API，不关心 middleware 文件名 |
| test:h2b-login | ❌ 否 | 不检查 middleware 文件 |
| test:auth-foundation | ❌ 否 | 数据库检查 |

### 对 API 最终授权的影响

**无影响。** API 最终授权在 `requirePermission` 中，基于数据库 Session，不依赖 middleware。

迁移 proxy 后:
- API 401/403 仍由 `requirePermission` 返回
- middleware/proxy 只处理页面路由
- API routes 在 matcher 中已排除

## 4. 风险判断

### 不迁移风险

| 风险 | 级别 | 说明 |
|------|------|------|
| Next.js 后续版本移除 middleware 支持 | 低 | Next.js 16 仍支持，只是 deprecated |
| Build warning 持续存在 | 低 | 不影响功能，只影响开发体验 |
| 团队困惑 | 低 | 文档已记录 |

### 迁移风险

| 风险 | 级别 | 说明 |
|------|------|------|
| 文件重命名引入 bug | 中 | 需要更新测试中的文件路径检查 |
| Turbopack HMR 问题 | 中 | 之前遇到过 Turbopack 编译问题 |
| 回归测试不完整 | 低 | 需要重新运行完整回归 |

### 建议

**延后迁移，等 Next.js 版本升级时统一处理。**

理由:
1. 当前 middleware 功能正常，16 项回归全部通过
2. Next.js 16 仍完整支持 middleware，只是 deprecated
3. 迁移收益小（消除 warning），风险中等（可能引入 Turbopack 问题）
4. 等 Next.js 17 或团队需要时再迁移更合适

## 5. 迁移前置条件

如果决定迁移，需要:

1. 备份当前 middleware.ts
2. 重命名为 proxy.ts，函数名改为 proxy
3. 更新 test:h2c-middleware 中的文件路径检查
4. 运行完整回归测试
5. 确认 Turbopack HMR 正常

## 6. 迁移后必须运行的测试清单

```bash
npm run build
npm run test:auth-foundation
npm run test:h2b-login
npm run test:h2c-middleware          # 需要适配文件路径
npm run test:h2d-layout-sidebar
npm run test:h2e-api-permissions
npx tsx scripts/audit-api-permissions.ts
npx tsx scripts/g0fixb-verify-database.ts
npm run test:import-workflow
npm run test:schedule-adjustment-final-acceptance
```

## 7. 结论

**当前不建议立即迁移。**

- middleware deprecated warning 为非阻塞项
- 当前系统稳定，16 项回归全部通过
- 建议等 Next.js 版本升级或团队有明确需求时再迁移
- 迁移时只需重命名文件 + 更新测试文件路径检查
