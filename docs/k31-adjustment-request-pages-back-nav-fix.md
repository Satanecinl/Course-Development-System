# K31-B 调课审批/我的调课申请页面返回导航修复

## 1. Bug / UX 现象

`/admin/adjustment-requests` 和 `/my-adjustment-requests` 页面均位于路由顶层，**没有包在 `ProtectedShell` 内**，因此：

```text
没有应用侧边栏
没有应用顶部导航
没有返回 /dashboard 的入口
```

用户进入审批/申请页面后只能通过浏览器后退键回到 `/dashboard`，UX 不佳。

## 2. 根因

K28-A 引入这两个页面时，文件直接是 `'use client'` 顶层组件，没有 `page.tsx` → `ProtectedShell` 包裹。其它 admin 页面（`/admin/db`、`/admin/import`、`/admin/scheduler`、`/admin/settings` 等）都有 `ProtectedShell` 包裹，因此它们继承了侧边栏。

## 3. 修复内容（最小修复）

按任务说明"本阶段优先做最小修复：加返回按钮"，本阶段**不**重构 layout 包裹结构（避免触碰权限/中间件），只在两个页面**标题行右侧**增加显式返回按钮。

### 3.1 复用项目内已有模式

参考 `/admin/rooms/capacity` 已有的返回按钮样式：

```tsx
<Link href="/admin/scheduler">
  <Button variant="outline" size="sm">
    <ArrowLeft className="w-4 h-4 mr-1.5" />
    返回排课控制台
  </Button>
</Link>
```

### 3.2 USER 页面 `src/app/my-adjustment-requests/page.tsx`

- 新增 `import Link from 'next/link'`
- 新增 `ArrowLeft` 图标
- 标题行右侧增加：
  ```tsx
  <Link href="/dashboard">
    <Button variant="outline" size="sm" aria-label="返回排课展示">
      <ArrowLeft className="w-4 h-4 mr-1.5" />
      返回排课展示
    </Button>
  </Link>
  ```
- 原"刷新"按钮位置不变，继续可用

### 3.3 ADMIN 页面 `src/app/admin/adjustment-requests/page.tsx`

- 同样新增 `import Link from 'next/link'`
- 同样新增 `ArrowLeft` 图标
- 标题行右侧增加同样的 `返回排课展示` 按钮，放在状态筛选 `<select>` 之前
- 原状态筛选 + "刷新"按钮位置不变，继续可用

## 4. 权限 / 路由不变

- USER 仍可访问 `/my-adjustment-requests`（无变化）
- ADMIN 仍可访问 `/admin/adjustment-requests`（无变化）
- 返回按钮**统一**指向 `/dashboard`
- 未新增任何权限 key
- 未修改 RBAC 矩阵
- 未在 USER 页面增加 admin-only 链接
- 未在 ADMIN 页面暴露给非管理员

## 5. 验证

### 5.1 自动验证

```bash
npx tsx scripts/verify-adjustment-request-pages-back-nav-k31-b.ts
# 17 PASS / 0 FAIL
```

覆盖：

1. 两个页面文件存在
2. 两个页面有 `<Link href="/dashboard">`
3. 两个页面返回按钮文案含"返回"
4. USER 页面保留 refresh 按钮
5. USER 页面无 admin-only 链接
6. ADMIN 页面保留状态筛选 + refresh
7. schema/migration/RBAC/K22/dev.db/backup 均未变

### 5.2 必跑回归

```bash
npx prisma validate           # PASS
npx prisma migrate status     # up to date
npm run build                 # PASS
npm run lint                  # baseline 188/154
npm run test:auth-foundation  # 61/1 pre-existing
npx tsx scripts/verify-user-adjustment-approval-flow-closeout-k28.ts
npx tsx scripts/verify-schedule-export-current-filter-k31-a.ts
```

## 6. 修改文件

| 文件 | 类型 | 备注 |
|------|------|------|
| `src/app/my-adjustment-requests/page.tsx` | fix | 增加 Link + Button 返回按钮 |
| `src/app/admin/adjustment-requests/page.tsx` | fix | 增加 Link + Button 返回按钮 |
| `scripts/verify-adjustment-request-pages-back-nav-k31-b.ts` | add | K31-B 验证脚本（17 checks） |
| `docs/k31-adjustment-request-pages-back-nav-fix.md` | add | 本文档 |
| `docs/k31-adjustment-request-pages-back-nav-fix.json` | add | 状态记录 |

## 7. 未变更

- prisma schema / migrations / dev.db
- K22 expected fixture
- RBAC / 权限矩阵
- 调课申请 / 审批 / dry-run / recommendation 业务逻辑
- ScheduleAdjustmentRequest / ScheduleAdjustment 模型
- API 路由
- ProtectedShell 包裹结构

## 8. 已知限制

- 两个页面**仍然在 ProtectedShell 之外**，全局侧边栏仍不可见。本阶段按用户要求"最小修复"未触碰 layout。
- 如果未来希望两个页面也显示完整侧边栏，应在 `page.tsx` 中用 `ProtectedShell` 包裹客户端组件（参考 `/admin/db/page.tsx` 的结构）。该改动属于 layout 重构，建议作为独立阶段（如 K31-C）。

## 9. 浏览器人工验证

```text
1. ADMIN 登录
2. 打开 /admin/adjustment-requests
3. 页面顶部右侧能看到 "返回排课展示" 按钮
4. 点击后回到 /dashboard
5. 再次进入 /admin/adjustment-requests，刷新/筛选仍正常

6. USER 登录
7. 打开 /my-adjustment-requests
8. 页面顶部右侧能看到 "返回排课展示" 按钮
9. 点击后回到 /dashboard
10. USER 页面没有出现 /admin/* 链接
```

## 10. 推荐下一阶段

K31-C（可选）：将 `/admin/adjustment-requests/page.tsx` 和 `/my-adjustment-requests/page.tsx` 拆为 `server page.tsx` + `client content.tsx`，让 server page 用 `<ProtectedShell>` 包裹，**复用全局侧边栏**。这是纯 layout 重构，不影响业务逻辑/API/RBAC。
