// scripts/test-h2c-middleware.ts
// H2-C test: claims signing, route permissions, middleware logic

import { PrismaClient } from '@prisma/client'
import {
  signAuthClaims,
  verifyAuthClaims,
  buildAuthClaims,
  type AuthClaims,
} from '../src/lib/auth/claims'
import {
  isPublicPath,
  isStaticOrInternal,
  getRequiredPermissionsForPath,
  hasRequiredRoutePermission,
  getRedirectForUnauthenticated,
  getRedirectForForbidden,
} from '../src/lib/auth/route-permissions'
import { ALL_PERMISSIONS, ROLES } from '../src/lib/auth/types'
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

async function main() {
  console.log('🧪 H2-C Middleware Tests\n')

  // ─── 1. Claims Signing / Verification ─────────────────────────
  console.log('1️⃣  Claims 签名 / 验证测试')

  const adminClaims: AuthClaims = {
    userId: 1,
    username: 'admin',
    roles: [ROLES.ADMIN],
    permissions: [...ALL_PERMISSIONS],
    defaultRedirect: '/dashboard',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  }

  const signed = signAuthClaims(adminClaims)
  assert(typeof signed === 'string', '签名结果为字符串')
  assert(signed.includes('.'), '签名格式为 payload.signature')
  assert(signed.split('.').length === 2, '签名包含两部分')

  const verified = verifyAuthClaims(signed)
  assert(verified !== null, '签名验证成功')
  assert(verified?.userId === 1, 'userId 正确')
  assert(verified?.username === 'admin', 'username 正确')
  assert(verified?.roles.includes(ROLES.ADMIN) === true, 'roles 正确')
  assert(verified?.permissions.length === ALL_PERMISSIONS.length, 'permissions 数量正确')
  assert(verified?.defaultRedirect === '/dashboard', 'defaultRedirect 正确')

  // ─── 2. Tampered Claims ───────────────────────────────────────
  console.log('\n2️⃣  篡改 Claims 测试')

  const parts = signed.split('.')
  const tamperedPayload = parts[0].slice(0, -5) + 'XXXXX'
  const tampered = `${tamperedPayload}.${parts[1]}`
  const tamperedResult = verifyAuthClaims(tampered)
  assert(tamperedResult === null, '篡改 payload 后验证失败')

  const tampered2 = `${parts[0]}.invalid_signature`
  const tamperedResult2 = verifyAuthClaims(tampered2)
  assert(tamperedResult2 === null, '篡改 signature 后验证失败')

  // ─── 3. Expired Claims ────────────────────────────────────────
  console.log('\n3️⃣  过期 Claims 测试')

  const expiredClaims: AuthClaims = {
    ...adminClaims,
    expiresAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
  }
  const expiredSigned = signAuthClaims(expiredClaims)
  const expiredResult = verifyAuthClaims(expiredSigned)
  assert(expiredResult === null, '过期 claims 验证失败')

  // ─── 4. Claims Content Safety ─────────────────────────────────
  console.log('\n4️⃣  Claims 内容安全测试')

  assert(!signed.includes('passwordHash'), 'claims 不包含 passwordHash')
  assert(!signed.includes('session_token'), 'claims 不包含 raw session token')

  // ─── 5. buildAuthClaims ───────────────────────────────────────
  console.log('\n5️⃣  buildAuthClaims 测试')

  const built = buildAuthClaims({
    id: 2,
    username: 'user',
    roles: [ROLES.USER],
    permissions: new Set(['data:read']),
    defaultRedirect: '/data',
  })
  assert(built.userId === 2, 'buildAuthClaims userId')
  assert(built.username === 'user', 'buildAuthClaims username')
  assert(built.roles.includes(ROLES.USER), 'buildAuthClaims roles')
  assert(built.permissions.includes('data:read'), 'buildAuthClaims permissions')
  assert(built.defaultRedirect === '/data', 'buildAuthClaims defaultRedirect')
  assert(built.expiresAt > Math.floor(Date.now() / 1000), 'buildAuthClaims expiresAt in future')

  // ─── 6. Route Permission Rules ────────────────────────────────
  console.log('\n6️⃣  Route Permission Rules 测试')

  // Public paths
  assert(isPublicPath('/login') === true, '/login is public')
  assert(isPublicPath('/logout') === true, '/logout is public')
  assert(isPublicPath('/403') === true, '/403 is public')
  assert(isPublicPath('/dashboard') === false, '/dashboard is not public')
  assert(isPublicPath('/data') === false, '/data is not public')

  // Static
  assert(isStaticOrInternal('/_next/static/chunk.js') === true, '_next/static is static')
  assert(isStaticOrInternal('/favicon.ico') === true, 'favicon is static')
  assert(isStaticOrInternal('/dashboard') === false, '/dashboard is not static')

  // Route permissions
  const dashboardPerms = getRequiredPermissionsForPath('/dashboard')
  assert(dashboardPerms !== null, '/dashboard has permission requirement')
  assert(dashboardPerms?.includes('schedule:view') === true, '/dashboard requires schedule:view')

  const dataPerms = getRequiredPermissionsForPath('/data')
  assert(dataPerms !== null, '/data has permission requirement')
  assert(dataPerms?.includes('data:read') === true, '/data requires data:read')

  const adminUsersPerms = getRequiredPermissionsForPath('/admin/users')
  assert(adminUsersPerms !== null, '/admin/users has permission requirement')
  assert(adminUsersPerms?.includes('users:manage') === true, '/admin/users requires users:manage')

  const adminSettingsPerms = getRequiredPermissionsForPath('/admin/settings')
  assert(adminSettingsPerms !== null, '/admin/settings has permission requirement')
  assert(adminSettingsPerms?.includes('settings:manage') === true, '/admin/settings requires settings:manage')

  const adminImportPerms = getRequiredPermissionsForPath('/admin/import')
  assert(adminImportPerms !== null, '/admin/import has permission requirement')
  assert(adminImportPerms?.includes('import:manage') === true, '/admin/import requires import:manage')

  const adminDiagPerms = getRequiredPermissionsForPath('/admin/diagnostics')
  assert(adminDiagPerms !== null, '/admin/diagnostics has permission requirement')
  assert(adminDiagPerms?.includes('diagnostics:view') === true, '/admin/diagnostics requires diagnostics:view')

  const unknownPerms = getRequiredPermissionsForPath('/some/unknown/path')
  assert(unknownPerms === null, 'unconfigured path has no requirement')

  // ─── 7. Admin Route Access ────────────────────────────────────
  console.log('\n7️⃣  Admin 路由权限测试')

  const adminPerms = [...ALL_PERMISSIONS]

  assert(hasRequiredRoutePermission(adminPerms, '/dashboard') === true, 'admin can access /dashboard')
  assert(hasRequiredRoutePermission(adminPerms, '/data') === true, 'admin can access /data')
  assert(hasRequiredRoutePermission(adminPerms, '/admin/users') === true, 'admin can access /admin/users')
  assert(hasRequiredRoutePermission(adminPerms, '/admin/settings') === true, 'admin can access /admin/settings')
  assert(hasRequiredRoutePermission(adminPerms, '/admin/import') === true, 'admin can access /admin/import')
  assert(hasRequiredRoutePermission(adminPerms, '/admin/diagnostics') === true, 'admin can access /admin/diagnostics')
  assert(hasRequiredRoutePermission(adminPerms, '/admin/db') === true, 'admin can access /admin/db')

  // ─── 8. User Route Access ─────────────────────────────────────
  console.log('\n8️⃣  User 路由权限测试')

  const userPerms = ['data:read']

  assert(hasRequiredRoutePermission(userPerms, '/data') === true, 'user can access /data')
  assert(hasRequiredRoutePermission(userPerms, '/dashboard') === false, 'user cannot access /dashboard')
  assert(hasRequiredRoutePermission(userPerms, '/admin/users') === false, 'user cannot access /admin/users')
  assert(hasRequiredRoutePermission(userPerms, '/admin/settings') === false, 'user cannot access /admin/settings')
  assert(hasRequiredRoutePermission(userPerms, '/admin/import') === false, 'user cannot access /admin/import')
  assert(hasRequiredRoutePermission(userPerms, '/admin/diagnostics') === false, 'user cannot access /admin/diagnostics')

  // ─── 9. Redirect Helpers ──────────────────────────────────────
  console.log('\n9️⃣  Redirect Helper 测试')

  assert(getRedirectForUnauthenticated('/dashboard') === '/login?next=%2Fdashboard', 'unauthenticated redirect includes next')
  assert(getRedirectForForbidden() === '/403', 'forbidden redirect is /403')

  // ─── 10. File Checks ─────────────────────────────────────────
  console.log('\n🔟  文件检查')

  const middlewarePath = join(process.cwd(), 'src/middleware.ts')
  const middlewareContent = readFileSync(middlewarePath, 'utf-8')
  assert(middlewareContent.includes('verifyAuthClaims'), 'middleware uses verifyAuthClaims')
  assert(middlewareContent.includes('AUTH_CLAIMS_COOKIE_NAME'), 'middleware reads auth claims cookie')
  assert(middlewareContent.includes('hasRequiredRoutePermission'), 'middleware checks route permissions')
  assert(!middlewareContent.includes('import.*prisma'), 'middleware does not import prisma')
  assert(!middlewareContent.includes("from '@/lib/prisma'"), 'middleware does not import prisma')
  assert(!middlewareContent.includes("role === 'ADMIN'"), 'middleware does not check role === ADMIN')
  assert(!middlewareContent.includes('role === "ADMIN"'), 'middleware does not check role === "ADMIN"')

  const forbiddenPath = join(process.cwd(), 'src/app/403/page.tsx')
  const forbiddenContent = readFileSync(forbiddenPath, 'utf-8')
  assert(forbiddenContent.includes('无权访问'), '/403 page has title')
  assert(forbiddenContent.includes('当前账号没有访问该页面的权限'), '/403 page has description')

  // ─── 11. Main Data Safety ─────────────────────────────────────
  console.log('\n1️⃣1️⃣  主数据安全检查')

  const scheduleSlotCount = await prisma.scheduleSlot.count()
  assert(scheduleSlotCount === 440, `ScheduleSlot = 440 (实际 ${scheduleSlotCount})`)

  const teachingTaskCount = await prisma.teachingTask.count()
  assert(teachingTaskCount === 308, `TeachingTask = 308 (实际 ${teachingTaskCount})`)

  const importBatch1 = await prisma.importBatch.findUnique({ where: { id: 1 } })
  assert(importBatch1?.status === 'confirmed', 'ImportBatch #1 still confirmed')

  const activeAdjustments = await prisma.scheduleAdjustment.count({ where: { status: 'ACTIVE' } })
  assert(activeAdjustments === 0, `ScheduleAdjustment ACTIVE = 0 (实际 ${activeAdjustments})`)

  // ─── Summary ─────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(40))
  console.log(`📊 Results: ${passed} passed, ${failed} failed`)

  if (failed > 0) {
    console.error('❌ Some tests failed')
    process.exit(1)
  } else {
    console.log('✅ All tests passed')
  }
}

main()
  .catch((e) => {
    console.error('❌ Test error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
