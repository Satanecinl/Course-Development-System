// scripts/test-h3c-password-reset.ts
// H3-C test: Password reset API

import { PrismaClient } from '@prisma/client'
import {
  fetchJsonAsAdmin,
  fetchJsonAsUser,
  fetchJson,
  cleanup,
} from './test-auth-helper'
import { verifyPassword } from '../src/lib/auth/crypto'
import { createSession } from '../src/lib/auth/session'

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

const TEST_USERNAME = 'test_h3c_user_' + Date.now()
const TEST_PASSWORD = 'test123456'
const NEW_PASSWORD = 'newpassword123'
let testUserId: number | null = null
let testSessionToken: string | null = null

async function main() {
  console.log('🧪 H3-C Password Reset Tests\n')

  // Create test user first
  const createRes = await fetchJsonAsAdmin('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
      displayName: '测试用户H3C',
    }),
  })
  assert(createRes.status === 200, '创建测试用户')

  const createdUser = (createRes.data as any).user
  testUserId = createdUser?.id ?? null
  assert(testUserId != null, '获取测试用户 ID')

  // Create a session for the test user (to test session revocation)
  if (testUserId) {
    const { sessionToken } = await createSession(testUserId)
    testSessionToken = sessionToken
    assert(testSessionToken != null, '创建测试用户 session')
  }

  // ─── 1. Permission Tests ─────────────────────────────────────
  console.log('\n1️⃣  权限测试')

  if (testUserId) {
    const noAuth = await fetchJson(`/api/admin/users/${testUserId}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: NEW_PASSWORD }),
    })
    assert(noAuth.status === 401, `未登录 → 401 (实际: ${noAuth.status})`)

    const userAccess = await fetchJsonAsUser(`/api/admin/users/${testUserId}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: NEW_PASSWORD }),
    })
    assert(userAccess.status === 403, `User → 403 (实际: ${userAccess.status})`)
  }

  // ─── 2. Validation Tests ─────────────────────────────────────
  console.log('\n2️⃣  验证测试')

  if (testUserId) {
    // No password
    const noPwRes = await fetchJsonAsAdmin(`/api/admin/users/${testUserId}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert(noPwRes.status === 400, `无密码 → 400 (实际: ${noPwRes.status})`)

    // Short password
    const shortPwRes = await fetchJsonAsAdmin(`/api/admin/users/${testUserId}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '123' }),
    })
    assert(shortPwRes.status === 400, `密码过短 → 400 (实际: ${shortPwRes.status})`)

    // Non-existent user
    const noUserRes = await fetchJsonAsAdmin('/api/admin/users/99999/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: NEW_PASSWORD }),
    })
    assert(noUserRes.status === 404, `不存在用户 → 404 (实际: ${noUserRes.status})`)
  }

  // ─── 3. Successful Reset ─────────────────────────────────────
  console.log('\n3️⃣  密码重置成功测试')

  if (testUserId) {
    // Get password hash before reset
    const beforeHash = await prisma.user.findUnique({
      where: { id: testUserId },
      select: { passwordHash: true },
    })

    const resetRes = await fetchJsonAsAdmin(`/api/admin/users/${testUserId}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: NEW_PASSWORD }),
    })
    assert(resetRes.status === 200, `重置密码 → 200 (实际: ${resetRes.status})`)

    // Verify password hash changed
    const afterHash = await prisma.user.findUnique({
      where: { id: testUserId },
      select: { passwordHash: true },
    })
    assert(
      beforeHash?.passwordHash !== afterHash?.passwordHash,
      'passwordHash 已变化',
    )

    // Verify new hash is not plaintext
    assert(
      afterHash?.passwordHash !== NEW_PASSWORD,
      '新 passwordHash 不是明文',
    )

    // Verify new password works
    const newPwValid = await verifyPassword(NEW_PASSWORD, afterHash!.passwordHash)
    assert(newPwValid, '新密码可通过验证')

    // Verify old password doesn't work
    const oldPwValid = await verifyPassword(TEST_PASSWORD, afterHash!.passwordHash)
    assert(!oldPwValid, '旧密码不能通过验证')

    // Verify response doesn't contain passwordHash
    const resData = resetRes.data as any
    assert(!('passwordHash' in resData), '响应不包含 passwordHash')
  }

  // ─── 4. Session Revocation ───────────────────────────────────
  console.log('\n4️⃣  Session 撤销测试')

  if (testUserId && testSessionToken) {
    // Check if the old session was revoked
    const oldSession = await prisma.session.findFirst({
      where: {
        userId: testUserId,
        revokedAt: { not: null },
      },
      orderBy: { id: 'desc' },
    })
    assert(oldSession != null, '旧 session 已被 revoke')

    // Try to use the old session token
    const oldSessionRes = await fetchJson('/api/schedule', {
      cookie: `session_token=${testSessionToken}`,
    })
    assert(oldSessionRes.status === 401, '旧 session 调用 API → 401')
  }

  // ─── 5. Other Users Unaffected ───────────────────────────────
  console.log('\n5️⃣  不影响其他用户测试')

  // Admin session should still work
  const adminRes = await fetchJsonAsAdmin('/api/admin/users')
  assert(adminRes.status === 200, 'Admin session 仍有效')

  // ─── 6. Data Safety ──────────────────────────────────────────
  console.log('\n6️⃣  主数据安全检查')

  const scheduleSlotCount = await prisma.scheduleSlot.count()
  assert(scheduleSlotCount === 440, `ScheduleSlot = 440 (实际: ${scheduleSlotCount})`)

  const teachingTaskCount = await prisma.teachingTask.count()
  assert(teachingTaskCount === 308, `TeachingTask = 308 (实际: ${teachingTaskCount})`)

  const importBatch1 = await prisma.importBatch.findUnique({ where: { id: 1 } })
  assert(importBatch1?.status === 'confirmed', 'ImportBatch #1 still confirmed')

  // ─── Summary ─────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50))
  console.log(`📊 结果: ${passed} passed, ${failed} failed`)

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
  .finally(async () => {
    // Cleanup: deactivate test user
    if (testUserId) {
      await prisma.session.deleteMany({ where: { userId: testUserId } })
      await prisma.userRole.deleteMany({ where: { userId: testUserId } })
      await prisma.user.updateMany({
        where: { id: testUserId },
        data: { isActive: false },
      })
      console.log(`\n(Cleanup: test user #${testUserId} sessions/roles removed and deactivated)`)
    }
    await cleanup()
  })
