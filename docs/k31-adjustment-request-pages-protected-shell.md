# K31-C 调课审批/我的调课申请页面 ProtectedShell 集成

## 1. 目标

将以下两个独立页面接入全局 `ProtectedShell` / 全局侧边栏布局：

```text
/my-adjustment-requests
/admin/adjustment-requests
```

让两个页面与 `/dashboard`、系统设置、自动排课等页面保持一致的主界面导航体验。

## 2. 根因（前置阶段遗留）

K28-A 引入这两个页面时，文件直接是 `'use client'` 顶层组件，没有用 server `page.tsx` + `ProtectedShell` 包裹：

```text
K31-B 阶段：补了"返回排课展示"按钮，但页面仍在 ProtectedShell 之外
K31-C 阶段：把页面接入 ProtectedShell，让全局侧边栏/顶部导航也出现在这两个路由
```

## 3. 实现策略

按照项目已有的 server / client 拆分模式（参考 `/admin/db/page.tsx` + `/admin/db/admin-db-content.tsx`）：

```text
src/app/my-adjustment-requests/page.tsx
  ↓ server component, 使用 ProtectedShell
src/app/my-adjustment-requests/my-adjustment-requests-content.tsx
  ↓ 'use client', 原页面交互逻辑全部移到这里

src/app/admin/adjustment-requests/page.tsx
  ↓ server component, 使用 ProtectedShell
src/app/admin/adjustment-requests/admin-adjustment-requests-content.tsx
  ↓ 'use client', 原页面交互逻辑全部移到这里
```

### 3.1 为什么必须拆分

`ProtectedShell` 是 **server component**：

```ts
// src/components/layout/protected-shell.tsx
export async function ProtectedShell({ children }: ProtectedShellProps) {
  const cookieStore = await cookies()      // server-only
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!sessionToken) redirect('/login')    // server-only
  const user = await getCurrentUser(sessionToken)  // DB read, server-only
  // ...
}
```

它读取 session cookie、调 `getCurrentUser`（数据库读）、按权限过滤 nav items。`'use client'` 页面无法使用这些 server-only 能力。

### 3.2 server page 模板

```tsx
// src/app/my-adjustment-requests/page.tsx
import { ProtectedShell } from '@/components/layout/protected-shell'
import MyAdjustmentRequestsContent from './my-adjustment-requests-content'

export default function MyAdjustmentRequestsPage() {
  return (
    <ProtectedShell>
      <MyAdjustmentRequestsContent />
    </ProtectedShell>
  )
}
```

```tsx
// src/app/admin/adjustment-requests/page.tsx
import { ProtectedShell } from '@/components/layout/protected-shell'
import AdminAdjustmentRequestsContent from './admin-adjustment-requests-content'

export default function AdminAdjustmentRequestsPage() {
  return (
    <ProtectedShell>
      <AdminAdjustmentRequestsContent />
    </ProtectedShell>
  )
}
```

### 3.3 client content 保留了 K31-B 的"返回排课展示"按钮

按 K31-C 阶段说明"建议保留 K31-B 的'返回排课展示'按钮，作为页面内快捷入口"。

```text
USER 页面:   [← 返回排课展示]  我的调课申请  [USER]      ……      [↻ 刷新]
ADMIN 页面:  [← 返回排课展示]  调课审批      [ADMIN]    ……    [待审批 ▾] [↻ 刷新]
```

按钮仍在标题栏**左侧**，与全局侧边栏并存，UX 上互不冲突：
- 侧边栏 → 任何时候都能切到 "排课展示"
- 页面内按钮 → 内容区内的快捷返回

## 4. 侧边栏高亮 / 权限过滤

`src/lib/auth/navigation.ts` 已经在 K28 阶段就加入了这两条 NAV_ITEMS：

```ts
{
  label: '我的调课申请',
  href: '/my-adjustment-requests',
  permission: 'adjustment-request:read',
  icon: 'scroll-text',
},
{
  label: '调课审批',
  href: '/admin/adjustment-requests',
  permission: 'adjustment-request:review',
  icon: 'check-circle',
},
```

K31-C 不修改 navigation.ts。`ProtectedShell` 内的 `filterNavItems(user.permissions)` 会按用户权限自动过滤：

| 角色 | 能看到 |
|------|-------|
| USER (有 `adjustment-request:read`) | 我的调课申请 |
| ADMIN (有 `adjustment-request:review`) | 调课审批 |

USER 看不到 `调课审批`；ADMIN 看到 `调课审批`。高亮由 `AppSidebar` 内部按当前路径匹配 `href` 实现。

## 5. 业务功能保留

- USER：`listMyAdjustmentRequests`、`cancelMyAdjustmentRequest`、列表渲染、确认取消弹窗、PENDING 取消按钮
- ADMIN：`listAdminAdjustmentRequests`、状态筛选（5 选项）、`approveAdjustmentRequest`、`rejectAdjustmentRequest`、approve/reject 弹窗、refresh 按钮

所有逻辑**逐字**从原 `page.tsx` 复制到 `*-content.tsx`，未做任何业务改动。

## 6. 验证

### 6.1 K31-C 自动化

```bash
npx tsx scripts/verify-adjustment-request-pages-protected-shell-k31-c.ts
# 26 PASS / 0 FAIL
```

覆盖：

- `page.tsx` 为 server component 且使用 `<ProtectedShell>`
- `*-content.tsx` 为 client component（`'use client'` 指令）
- USER content 调用 `listMyAdjustmentRequests` + `cancelMyAdjustmentRequest`
- ADMIN content 调用 `listAdminAdjustmentRequests` + `approveAdjustmentRequest` + `rejectAdjustmentRequest`
- ADMIN content 保留状态筛选 + refresh
- 页面+content 整体无 admin-only 链接（USER 页面）
- navigation.ts 同时含 `我的调课申请` + `调课审批`
- K31-B `aria-label="返回排课展示"` 链接在 content 中保留
- schema/migration/RBAC/K22/dev.db/backup 均未变

### 6.2 K31-B 回归

```bash
npx tsx scripts/verify-adjustment-request-pages-back-nav-k31-b.ts
# PASS — 脚本已 stage-aware 读取 page.tsx 和 *-content.tsx
```

K31-B 脚本已更新，同时读取 `page.tsx` 和 `*-content.tsx`，无论项目处于 K31-B 内联布局还是 K31-C 拆分布局都能 PASS。

### 6.3 必跑回归

```bash
npx tsx scripts/verify-user-adjustment-approval-flow-closeout-k28.ts   # PASS
npx tsx scripts/verify-schedule-export-current-filter-k31-a.ts         # PASS
npx tsx scripts/verify-collapsible-sidebar-k30-a.ts                    # PASS
npx prisma validate                                                    # PASS
npx prisma migrate status                                              # up to date
npm run build                                                          # PASS
npm run lint                                                           # baseline 188/152
npm run test:auth-foundation                                           # 60/2 pre-existing
```

## 7. 修改文件

| 文件 | 类型 | 备注 |
|------|------|------|
| `src/app/my-adjustment-requests/page.tsx` | 重写为 server | 改用 `<ProtectedShell>` 包裹 |
| `src/app/my-adjustment-requests/my-adjustment-requests-content.tsx` | add | 客户端内容组件（保留原逻辑） |
| `src/app/admin/adjustment-requests/page.tsx` | 重写为 server | 改用 `<ProtectedShell>` 包裹 |
| `src/app/admin/adjustment-requests/admin-adjustment-requests-content.tsx` | add | 客户端内容组件（保留原逻辑） |
| `scripts/verify-adjustment-request-pages-back-nav-k31-b.ts` | update | stage-aware：同时读 page+content |
| `scripts/verify-adjustment-request-pages-protected-shell-k31-c.ts` | add | K31-C 验证脚本（26 checks） |
| `docs/k31-adjustment-request-pages-protected-shell.md` | add | 本文档 |
| `docs/k31-adjustment-request-pages-protected-shell.json` | add | 状态记录 |

## 8. 未变更

- prisma schema / migrations / dev.db
- K22 expected fixture
- RBAC / 权限矩阵 / 权限 key
- 调课申请 / 审批 / dry-run / recommendation 业务逻辑
- ScheduleAdjustmentRequest / ScheduleAdjustment 模型
- API 路由
- `src/lib/auth/navigation.ts`（已有 K28 阶段配置）
- ProtectedShell 组件本身

## 9. 浏览器人工验证

### 9.1 USER 页面

```text
1. USER 登录
2. 打开 /my-adjustment-requests
3. 页面显示全局侧边栏
4. 侧边栏中"我的调课申请"可见并高亮
5. USER 不显示 admin-only 菜单（数据管理可见；调课审批不可见）
6. 页面列表正常加载
7. 页面内"刷新"按钮正常
8. 页面内"返回排课展示"按钮正常
9. 侧边栏"排课展示"可点击回到 /dashboard
10. 侧边栏可收缩/展开
```

### 9.2 ADMIN 页面

```text
1. ADMIN 登录
2. 打开 /admin/adjustment-requests
3. 页面显示全局侧边栏
4. 侧边栏中"调课审批"可见并高亮
5. 状态筛选正常（5 选项）
6. 刷新按钮正常
7. approve / reject 弹窗正常
8. 页面内"返回排课展示"按钮正常
9. 侧边栏"排课展示"可点击回到 /dashboard
10. 侧边栏可收缩/展开
```

## 10. 推荐下一阶段

无紧急 follow-up。两个页面已与主系统布局一致。如未来要继续打磨：

- 可选：移除页面内"返回排课展示"按钮（侧边栏已覆盖），但 K31-C 阶段已明确"建议保留"，未移除。
- 可选：审计其它 K28 阶段引入的孤立页面（如果有）是否也需要 ProtectedShell 包裹。
