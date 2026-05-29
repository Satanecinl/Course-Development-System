// scripts/test-h2d-layout-sidebar.ts
// H2-D test: nav config, protected shell, page existence, data safety

import { PrismaClient } from '@prisma/client'
import { NAV_ITEMS, filterNavItems } from '../src/lib/auth/navigation'
import { ALL_PERMISSIONS } from '../src/lib/auth/types'
import { hasRequiredRoutePermission } from '../src/lib/auth/route-permissions'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${message}`)
  } else {
    failed++
    console.error(`  ❌ ${message}`)
  }
}

function fileExists(relPath: string): boolean {
  try {
    readFileSync(join(process.cwd(), relPath), 'utf-8')
    return true
  } catch {
    return false
  }
}

function fileContains(relPath: string, search: string): boolean {
  try {
    const content = readFileSync(join(process.cwd(), relPath), 'utf-8')
    return content.includes(search)
  } catch {
    return false
  }
}

async function main() {
  console.log('🧪 H2-D Layout & Sidebar Tests\n')

  // ─── 1. Nav Config ─────────────────────────────────────────────
  console.log('1️⃣  Nav 配置测试')

  assert(NAV_ITEMS.length === 7, `NAV_ITEMS 包含 7 个条目 (实际: ${NAV_ITEMS.length})`)

  // Every NAV_ITEM has a valid permission
  for (const item of NAV_ITEMS) {
    assert(
      (ALL_PERMISSIONS as readonly string[]).includes(item.permission),
      `  "${item.label}" 权限 "${item.permission}" 在 ALL_PERMISSIONS 中`,
    )
  }

  // ─── 2. Permission-based Filtering ─────────────────────────────
  console.log('\n2️⃣  权限过滤测试')

  // ADMIN sees all
  const adminPerms = new Set<string>([...ALL_PERMISSIONS])
  const adminItems = filterNavItems(adminPerms)
  assert(adminItems.length === 7, `Admin 可见 7 个菜单 (实际: ${adminItems.length})`)

  // USER sees only data:read
  const userPerms = new Set<string>(['data:read'])
  const userItems = filterNavItems(userPerms)
  assert(userItems.length === 1, `User 可见 1 个菜单 (实际: ${userItems.length})`)
  assert(userItems[0]?.href === '/data', `User 菜单为 /data`)
  assert(userItems[0]?.label === '数据管理', `User 菜单标签为 "数据管理"`)

  // Custom role: schedule:view + data:read
  const customPerms = new Set<string>(['schedule:view', 'data:read'])
  const customItems = filterNavItems(customPerms)
  assert(customItems.length === 2, `自定义角色可见 2 个菜单 (实际: ${customItems.length})`)

  // No permissions → no items
  const noPerms = new Set<string>()
  const noItems = filterNavItems(noPerms)
  assert(noItems.length === 0, `无权限用户不可见任何菜单 (实际: ${noItems.length})`)

  // ─── 3. Route Consistency ───────────────────────────────────────
  console.log('\n3️⃣  路由一致性测试')

  for (const item of NAV_ITEMS) {
    const hasRule = hasRequiredRoutePermission([item.permission], item.href)
    assert(hasRule, `"${item.label}" (${item.href}) 权限 "${item.permission}" 与 route rule 一致`)
  }

  // ─── 4. Page File Existence ────────────────────────────────────
  console.log('\n4️⃣  页面文件存在性测试')

  assert(fileExists('src/app/dashboard/page.tsx'), '/dashboard 页面存在')
  assert(fileExists('src/app/dashboard/dashboard-content.tsx'), '/dashboard 内容组件存在')
  assert(fileExists('src/app/data/page.tsx'), '/data 页面存在')
  assert(fileExists('src/app/admin/db/page.tsx'), '/admin/db 页面存在')
  assert(fileExists('src/app/admin/db/admin-db-content.tsx'), '/admin/db 内容组件存在')
  assert(fileExists('src/app/admin/import/page.tsx'), '/admin/import 页面存在')
  assert(fileExists('src/app/admin/users/page.tsx'), '/admin/users 页面存在')
  assert(fileExists('src/app/admin/settings/page.tsx'), '/admin/settings 页面存在')
  assert(fileExists('src/app/admin/diagnostics/page.tsx'), '/admin/diagnostics 页面存在')
  assert(fileExists('src/app/403/page.tsx'), '/403 页面存在')
  assert(fileExists('src/app/(auth)/login/page.tsx'), '/login 页面存在')
  assert(fileExists('src/app/(auth)/logout/route.ts'), '/logout route 存在')

  // ─── 5. Layout Component Files ─────────────────────────────────
  console.log('\n5️⃣  布局组件文件测试')

  assert(fileExists('src/lib/auth/navigation.ts'), 'navigation.ts 存在')
  assert(fileExists('src/components/layout/protected-shell.tsx'), 'protected-shell.tsx 存在')
  assert(fileExists('src/components/layout/app-sidebar.tsx'), 'app-sidebar.tsx 存在')
  assert(fileExists('src/components/layout/app-header.tsx'), 'app-header.tsx 存在')

  // ─── 6. Protected Shell Content Checks ─────────────────────────
  console.log('\n6️⃣  Protected Shell 内容检查')

  assert(
    fileContains('src/components/layout/protected-shell.tsx', 'getCurrentUser'),
    'ProtectedShell 读取真实 session (getCurrentUser)',
  )
  assert(
    fileContains('src/components/layout/protected-shell.tsx', 'SESSION_COOKIE_NAME'),
    'ProtectedShell 读取 session cookie',
  )
  assert(
    fileContains('src/components/layout/protected-shell.tsx', "redirect('/login')"),
    'ProtectedShell 未登录时 redirect /login',
  )
  assert(
    fileContains('src/components/layout/protected-shell.tsx', 'filterNavItems'),
    'ProtectedShell 使用 filterNavItems 过滤菜单',
  )
  assert(
    !fileContains('src/components/layout/protected-shell.tsx', 'role ==='),
    'ProtectedShell 未写死 role === "ADMIN"',
  )
  assert(
    !fileContains('src/components/layout/protected-shell.tsx', 'roles ==='),
    'ProtectedShell 未写死 roles ===',
  )

  // ─── 7. Sidebar Content Checks ─────────────────────────────────
  console.log('\n7️⃣  Sidebar 内容检查')

  assert(
    fileContains('src/components/layout/app-sidebar.tsx', "'use client'"),
    'AppSidebar 是 client component',
  )
  assert(
    fileContains('src/components/layout/app-sidebar.tsx', 'usePathname'),
    'AppSidebar 使用 usePathname 高亮当前路由',
  )
  assert(
    fileContains('src/components/layout/app-sidebar.tsx', 'navItems'),
    'AppSidebar 接收 navItems prop',
  )

  // ─── 8. Header Content Checks ──────────────────────────────────
  console.log('\n8️⃣  Header 内容检查')

  assert(
    fileContains('src/components/layout/app-header.tsx', 'displayName'),
    'AppHeader 显示用户 displayName',
  )
  assert(
    fileContains('src/components/layout/app-header.tsx', '/logout'),
    'AppHeader 提供退出登录链接',
  )
  assert(
    fileContains('src/components/layout/app-header.tsx', '排课管理系统'),
    'AppHeader 显示系统名称',
  )

  // ─── 9. Dashboard Wrapper ──────────────────────────────────────
  console.log('\n9️⃣  Dashboard 包装检查')

  assert(
    fileContains('src/app/dashboard/page.tsx', 'ProtectedShell'),
    '/dashboard page 使用 ProtectedShell',
  )
  assert(
    fileContains('src/app/dashboard/page.tsx', 'DashboardContent'),
    '/dashboard page 导入 DashboardContent',
  )
  assert(
    !fileContains('src/app/dashboard/page.tsx', "'use client'"),
    '/dashboard page 是 server component',
  )

  // ─── 10. Admin DB Wrapper ──────────────────────────────────────
  console.log('\n🔟  Admin DB 包装检查')

  assert(
    fileContains('src/app/admin/db/page.tsx', 'ProtectedShell'),
    '/admin/db page 使用 ProtectedShell',
  )
  assert(
    fileContains('src/app/admin/db/page.tsx', 'AdminDbContent'),
    '/admin/db page 导入 AdminDbContent',
  )
  assert(
    !fileContains('src/app/admin/db/page.tsx', "'use client'"),
    '/admin/db page 是 server component',
  )

  // ─── 11. Placeholder Pages ─────────────────────────────────────
  console.log('\n1️⃣1️⃣  占位页面检查')

  assert(
    fileContains('src/app/admin/import/page.tsx', 'ProtectedShell'),
    '/admin/import 使用 ProtectedShell',
  )
  assert(
    fileContains('src/app/admin/users/page.tsx', 'ProtectedShell'),
    '/admin/users 使用 ProtectedShell',
  )
  assert(
    fileContains('src/app/admin/settings/page.tsx', 'ProtectedShell'),
    '/admin/settings 使用 ProtectedShell',
  )
  assert(
    fileContains('src/app/admin/diagnostics/page.tsx', 'ProtectedShell'),
    '/admin/diagnostics 使用 ProtectedShell',
  )

  // ─── 12. No Role Hardcoding ────────────────────────────────────
  console.log('\n1️⃣2️⃣  角色硬编码检查')

  const layoutFiles = [
    'src/components/layout/protected-shell.tsx',
    'src/components/layout/app-sidebar.tsx',
    'src/components/layout/app-header.tsx',
    'src/lib/auth/navigation.ts',
  ]

  for (const f of layoutFiles) {
    assert(
      !fileContains(f, 'role === "ADMIN"'),
      `${f} 未硬编码 role === "ADMIN"`,
    )
    assert(
      !fileContains(f, "roles === 'ADMIN'"),
      `${f} 未硬编码 roles === 'ADMIN'`,
    )
  }

  // ─── 13. Data Safety ───────────────────────────────────────────
  console.log('\n1️⃣3️⃣  主数据安全测试')

  const importBatch = await prisma.importBatch.findUnique({ where: { id: 1 } })
  assert(importBatch?.status === 'confirmed', `ImportBatch #1 status = confirmed (实际: ${importBatch?.status})`)

  const slotCount = await prisma.scheduleSlot.count()
  assert(slotCount === 440, `ScheduleSlot 总数 = 440 (实际: ${slotCount})`)

  const activeAdj = await prisma.scheduleAdjustment.count({
    where: { status: 'ACTIVE' },
  })
  assert(activeAdj === 0, `ScheduleAdjustment ACTIVE = 0 (实际: ${activeAdj})`)

  // ─── Summary ───────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`📊 结果: ${passed} passed, ${failed} failed`)
  console.log(`${'═'.repeat(50)}`)

  await prisma.$disconnect()

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('Test error:', e)
  prisma.$disconnect().finally(() => process.exit(1))
})
