// scripts/test-scheduler-rbac-negative-e2e.ts
// RBAC negative E2E for scheduler APIs and pages
// Verifies: unauthenticated blocked, normal user blocked, admin allowed
// No dev server required — uses static code analysis + direct function calls

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  getRequiredPermissionsForPath,
  hasRequiredRoutePermission,
} from '../src/lib/auth/route-permissions'

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

function fileContains(relPath: string, search: string): boolean {
  try {
    const content = readFileSync(join(process.cwd(), relPath), 'utf-8')
    return content.includes(search)
  } catch {
    return false
  }
}

function fileExists(relPath: string): boolean {
  return existsSync(join(process.cwd(), relPath))
}

// ─── 1. Scheduler API Permission Static Check ────────────────────

console.log('🧪 K10 Scheduler RBAC Negative E2E\n')
console.log('1️⃣  Scheduler API 权限静态检查')

const schedulerApis = [
  { file: 'src/app/api/admin/scheduler/preview/route.ts', method: 'POST', perm: "'schedule:adjust'" },
  { file: 'src/app/api/admin/scheduler/apply/route.ts', method: 'POST', perm: "'schedule:adjust'" },
  { file: 'src/app/api/admin/scheduler/rollback/route.ts', method: 'POST', perm: "'schedule:adjust'" },
  { file: 'src/app/api/admin/scheduler/runs/route.ts', method: 'GET', perm: "'schedule:adjust'" },
  { file: 'src/app/api/admin/scheduler/runs/[id]/route.ts', method: 'GET', perm: "'schedule:adjust'" },
]

for (const api of schedulerApis) {
  assert(
    fileContains(api.file, 'requirePermission'),
    `${api.file} 包含 requirePermission`,
  )
  assert(
    fileContains(api.file, api.perm),
    `${api.file} 使用权限 ${api.perm}`,
  )
}

// ─── 2. Page Protection Check ────────────────────────────────────

console.log('\n2️⃣  页面保护静态检查')

const schedulerPages = [
  'src/app/admin/scheduler/page.tsx',
  'src/app/admin/scheduler/history/page.tsx',
]

for (const page of schedulerPages) {
  assert(
    fileContains(page, 'ProtectedShell'),
    `${page} 被 ProtectedShell 包裹`,
  )
}

// ─── 3. Middleware Route Rule Check ──────────────────────────────

console.log('\n3️⃣  Middleware 路由规则检查')

const permsForScheduler = getRequiredPermissionsForPath('/admin/scheduler')
assert(
  permsForScheduler !== null,
  '/admin/scheduler 在 middleware 中有路由规则',
)
assert(
  permsForScheduler != null && permsForScheduler.includes('schedule:adjust'),
  '/admin/scheduler 要求 schedule:adjust 权限',
)

const permsForHistory = getRequiredPermissionsForPath('/admin/scheduler/history')
assert(
  permsForHistory !== null,
  '/admin/scheduler/history 在 middleware 中有路由规则',
)
assert(
  permsForHistory != null && permsForHistory.includes('schedule:adjust'),
  '/admin/scheduler/history 要求 schedule:adjust 权限',
)

// ─── 4. Permission Simulation ────────────────────────────────────

console.log('\n4️⃣  权限模拟测试')

// Admin has schedule:adjust
const adminPerms = ['schedule:view', 'schedule:adjust', 'data:read', 'data:write']
assert(
  hasRequiredRoutePermission(adminPerms, '/admin/scheduler'),
  'Admin 可访问 /admin/scheduler',
)
assert(
  hasRequiredRoutePermission(adminPerms, '/admin/scheduler/history'),
  'Admin 可访问 /admin/scheduler/history',
)

// Normal user lacks schedule:adjust
const userPerms = ['schedule:view', 'data:read']
assert(
  !hasRequiredRoutePermission(userPerms, '/admin/scheduler'),
  '普通用户不可访问 /admin/scheduler',
)
assert(
  !hasRequiredRoutePermission(userPerms, '/admin/scheduler/history'),
  '普通用户不可访问 /admin/scheduler/history',
)

// Unauthenticated (empty permissions)
assert(
  !hasRequiredRoutePermission([], '/admin/scheduler'),
  '未登录用户不可访问 /admin/scheduler',
)
assert(
  !hasRequiredRoutePermission([], '/admin/scheduler/history'),
  '未登录用户不可访问 /admin/scheduler/history',
)

// ─── 5. Uncontrolled Endpoint Check ──────────────────────────────

console.log('\n5️⃣  不受控接口检查')

assert(
  !fileExists('src/app/api/scheduler/run/route.ts'),
  '/api/scheduler/run 不存在',
)
assert(
  !fileExists('src/app/api/scheduler/route.ts'),
  '/api/scheduler 不存在',
)
assert(
  !fileExists('src/app/api/scheduler'),
  'src/app/api/scheduler 目录不存在',
)

// ─── 6. History Page Does Not Call Write APIs ────────────────────

console.log('\n6️⃣  历史页写接口检查')

const historyContent = readFileSync(
  join(process.cwd(), 'src/app/admin/scheduler/history/history-content.tsx'),
  'utf-8',
)

assert(
  !historyContent.includes('/api/admin/scheduler/apply'),
  'history-content.tsx 不调用 apply API',
)
assert(
  !historyContent.includes('/api/admin/scheduler/rollback'),
  'history-content.tsx 不调用 rollback API',
)
assert(
  !historyContent.includes('/api/admin/scheduler/preview'),
  'history-content.tsx 不调用 preview API',
)
assert(
  !historyContent.includes('/api/scheduler/run'),
  'history-content.tsx 不调用 /api/scheduler/run',
)

// ─── 7. No Apply/Rollback/Re-run Buttons in History Page ─────────

console.log('\n7️⃣  历史页按钮检查')

assert(
  !historyContent.includes('handleApply'),
  'history-content.tsx 不包含 Apply 操作处理函数',
)
assert(
  !historyContent.includes('handleRollback'),
  'history-content.tsx 不包含 Rollback 操作处理函数',
)
assert(
  !historyContent.toLowerCase().includes('re-run'),
  'history-content.tsx 不包含 Re-run 按钮',
)

// ─── Summary ─────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`)
console.log(`📊 结果: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(50)}`)

if (failed > 0) {
  process.exit(1)
}
