// scripts/test-h2b-login.ts
// H2-B test: login page, server action helpers, logout, data safety

import { PrismaClient } from '@prisma/client'
import { verifyPassword } from '../src/lib/auth/crypto'
import {
  authenticateUser,
  createLoginSession,
} from '../src/app/(auth)/login/actions'
import { getDefaultRedirectForAuthUser } from '../src/app/(auth)/login/auth-helpers'
import {
  createSession,
  getSessionByToken,
  revokeSession,
} from '../src/lib/auth/session'
import { hashPassword } from '../src/lib/auth/crypto'
import { ROLES, ALL_PERMISSIONS } from '../src/lib/auth/types'
import { SESSION_COOKIE_NAME, AUTH_CLAIMS_COOKIE_NAME } from '../src/lib/auth/constants'
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
  console.log('🧪 H2-B Login Tests\n')

  // ─── 1. Homepage Redirect Check ───────────────────────────────
  console.log('1️⃣  首页重定向检查')

  const pagePath = join(process.cwd(), 'src/app/page.tsx')
  const pageContent = readFileSync(pagePath, 'utf-8')
  assert(pageContent.includes("redirect('/login')"), '/ page redirects to /login')
  assert(!pageContent.includes('FeatureCard'), '旧首页展示内容已移除')
  assert(!pageContent.includes('项目结构'), '旧项目结构展示已移除')
  assert(!pageContent.includes('数据流程'), '旧数据流程展示已移除')

  // ─── 2. authenticateUser Tests ────────────────────────────────
  console.log('\n2️⃣  authenticateUser 测试')

  // Admin login success
  const adminResult = await authenticateUser('admin', 'admin123456')
  assert('user' in adminResult, 'admin 正确密码登录成功')
  if ('user' in adminResult) {
    assert(adminResult.user.username === 'admin', 'admin 用户名正确')
    assert(adminResult.user.permissions.has('schedule:view'), 'admin 拥有 schedule:view')
    assert(adminResult.user.permissions.has('users:manage'), 'admin 拥有 users:manage')
  }

  // User login success
  const userResult = await authenticateUser('user', 'user123456')
  assert('user' in userResult, 'user 正确密码登录成功')
  if ('user' in userResult) {
    assert(userResult.user.username === 'user', 'user 用户名正确')
    assert(userResult.user.permissions.has('data:read'), 'user 拥有 data:read')
    assert(!userResult.user.permissions.has('schedule:view'), 'user 不拥有 schedule:view')
  }

  // Wrong password
  const wrongPw = await authenticateUser('admin', 'wrong-password')
  assert('error' in wrongPw, '错误密码登录失败')
  assert(
    'error' in wrongPw && wrongPw.error === '用户名或密码错误',
    '错误密码返回统一错误信息'
  )

  // Non-existent user
  const noUser = await authenticateUser('nonexistent', 'password123')
  assert('error' in noUser, '不存在用户登录失败')
  assert(
    'error' in noUser && noUser.error === '用户名或密码错误',
    '不存在用户返回统一错误信息（不暴露用户不存在）'
  )

  // Empty username
  const emptyUser = await authenticateUser('', 'password123')
  assert('error' in emptyUser, '空用户名登录失败')

  // Empty password
  const emptyPw = await authenticateUser('admin', '')
  assert('error' in emptyPw, '空密码登录失败')

  // ─── 3. Inactive User Test ────────────────────────────────────
  console.log('\n3️⃣  停用用户测试')

  // Create inactive user temporarily
  const inactiveHash = await hashPassword('inactive123')
  const inactiveUser = await prisma.user.create({
    data: {
      username: 'test_inactive_h2b',
      displayName: '停用测试用户',
      passwordHash: inactiveHash,
      isActive: false,
    },
  })

  const inactiveResult = await authenticateUser('test_inactive_h2b', 'inactive123')
  assert('error' in inactiveResult, '停用用户登录失败')
  assert(
    'error' in inactiveResult && inactiveResult.error === '账号已停用',
    '停用用户返回正确错误信息'
  )

  // Cleanup
  await prisma.user.delete({ where: { id: inactiveUser.id } })
  console.log('  (停用测试用户已清理)')

  // ─── 4. getDefaultRedirectForAuthUser Tests ───────────────────
  console.log('\n4️⃣  getDefaultRedirectForAuthUser 测试')

  const adminPerms = new Set(ALL_PERMISSIONS)
  assert(
    getDefaultRedirectForAuthUser(adminPerms) === '/dashboard',
    'admin 默认跳转 /dashboard'
  )

  const userPerms = new Set(['data:read'])
  assert(
    getDefaultRedirectForAuthUser(userPerms) === '/data',
    'user 默认跳转 /data'
  )

  const noPerms = new Set<string>()
  assert(
    getDefaultRedirectForAuthUser(noPerms) === '/login?error=no-permission',
    '无权限跳转 /login?error=no-permission'
  )

  // ─── 5. Session Create / Cookie Config Tests ──────────────────
  console.log('\n5️⃣  Session / Cookie 配置测试')

  if ('user' in adminResult) {
    const { sessionToken } = await createLoginSession(adminResult.user.id)
    assert(sessionToken.length === 64, 'session token 为 64 位 hex')

    const session = await getSessionByToken(sessionToken)
    assert(session !== null, 'session 可通过 token 获取')
    assert(session?.userId === adminResult.user.id, 'session 关联正确用户')

    // Verify raw token not stored
    const dbSession = await prisma.session.findUnique({
      where: { id: session!.id },
    })
    assert(dbSession?.tokenHash !== sessionToken, '数据库不存 raw token（存 hash）')

    // Cleanup
    await revokeSession(session!.id)
    const revoked = await getSessionByToken(sessionToken)
    assert(revoked === null, 'revoked session 不可访问')
  }

  // ─── 6. Cookie Name Constant ──────────────────────────────────
  console.log('\n6️⃣  Cookie 配置检查')

  assert(SESSION_COOKIE_NAME === 'session_token', `session cookie 名称为 session_token (实际: ${SESSION_COOKIE_NAME})`)
  assert(AUTH_CLAIMS_COOKIE_NAME === 'auth_claims', `claims cookie 名称为 auth_claims (实际: ${AUTH_CLAIMS_COOKIE_NAME})`)

  // ─── 7. Login Page Files Check ────────────────────────────────
  console.log('\n7️⃣  登录页文件检查')

  const loginPagePath = join(process.cwd(), 'src/app/(auth)/login/page.tsx')
  const loginPage = readFileSync(loginPagePath, 'utf-8')
  assert(loginPage.includes('排课管理系统'), '登录页包含标题')
  assert(loginPage.includes('请使用分配的账号登录'), '登录页包含副标题')
  assert(loginPage.includes('LoginForm'), '登录页使用 LoginForm 组件')

  const loginFormPath = join(process.cwd(), 'src/app/(auth)/login/login-form.tsx')
  const loginForm = readFileSync(loginFormPath, 'utf-8')
  assert(loginForm.includes('name="username"'), '表单包含用户名输入框')
  assert(loginForm.includes('name="password"'), '表单包含密码输入框')
  assert(loginForm.includes('type="password"'), '密码输入框类型为 password')
  assert(loginForm.includes('登录'), '表单包含登录按钮')
  assert(!loginForm.includes('项目结构'), '登录页不展示项目结构')
  assert(!loginForm.includes('数据流程'), '登录页不展示数据流程')
  assert(!loginForm.includes('parser'), '登录页不展示 parser 介绍')

  // ─── 8. Logout Route Check ────────────────────────────────────
  console.log('\n8️⃣  Logout 路由检查')

  const logoutPath = join(process.cwd(), 'src/app/(auth)/logout/route.ts')
  const logoutContent = readFileSync(logoutPath, 'utf-8')
  assert(logoutContent.includes('revokeSessionByToken'), 'logout 调用 revokeSessionByToken')
  assert(logoutContent.includes('SESSION_COOKIE_NAME'), 'logout 使用 SESSION_COOKIE_NAME')
  assert(logoutContent.includes('AUTH_CLAIMS_COOKIE_NAME'), 'logout 删除 auth claims cookie')
  assert(logoutContent.includes('/login'), 'logout 跳转 /login')

  // ─── 9. /data Page Check ──────────────────────────────────────
  console.log('\n9️⃣  /data 页面检查')

  const dataPath = join(process.cwd(), 'src/app/data/page.tsx')
  const dataContent = readFileSync(dataPath, 'utf-8')
  assert(dataContent.includes('ProtectedShell'), '/data 页面使用 ProtectedShell')
  assert(dataContent.includes('DataContent'), '/data 页面使用 DataContent 组件')

  // ─── 10. Main Data Safety ─────────────────────────────────────
  console.log('\n🔟  主数据安全检查')

  const scheduleSlotCount = await prisma.scheduleSlot.count()
  assert(scheduleSlotCount === 440, `ScheduleSlot 数量 = 440 (实际 ${scheduleSlotCount})`)

  const teachingTaskCount = await prisma.teachingTask.count()
  assert(teachingTaskCount === 308, `TeachingTask 数量 = 308 (实际 ${teachingTaskCount})`)

  const importBatch1 = await prisma.importBatch.findUnique({
    where: { id: 1 },
  })
  assert(importBatch1?.status === 'confirmed', 'ImportBatch #1 仍为 confirmed')

  const activeAdjustments = await prisma.scheduleAdjustment.count({
    where: { status: 'ACTIVE' },
  })
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
