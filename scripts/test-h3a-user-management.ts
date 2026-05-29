// scripts/test-h3a-user-management.ts
// H3-A test: User management API and page

import { PrismaClient } from '@prisma/client'
import {
  fetchJsonAsAdmin,
  fetchJsonAsUser,
  fetchJson,
  cleanup,
} from './test-auth-helper'
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

function fileContains(relPath: string, search: string): boolean {
  try {
    const content = readFileSync(join(process.cwd(), relPath), 'utf-8')
    return content.includes(search)
  } catch {
    return false
  }
}

const TEST_USERNAME = 'test_h3a_user_' + Date.now()
const TEST_PASSWORD = 'test123456'
let testUserId: number | null = null

async function main() {
  console.log('🧪 H3-A User Management Tests\n')

  // ─── 1. API Permission Tests ─────────────────────────────────
  console.log('1️⃣  API 权限测试')

  // 401: No cookie
  const noAuth = await fetchJson('/api/admin/users')
  assert(noAuth.status === 401, `未登录 GET /api/admin/users → 401 (实际: ${noAuth.status})`)

  // 403: Normal user
  const userAccess = await fetchJsonAsUser('/api/admin/users')
  assert(userAccess.status === 403, `User GET /api/admin/users → 403 (实际: ${userAccess.status})`)

  // 200: Admin
  const adminAccess = await fetchJsonAsAdmin('/api/admin/users')
  assert(adminAccess.status === 200, `Admin GET /api/admin/users → 200 (实际: ${adminAccess.status})`)
  assert(
    Array.isArray((adminAccess.data as any).users),
    '返回 users 数组',
  )

  // ─── 2. Create User ──────────────────────────────────────────
  console.log('\n2️⃣  创建用户测试')

  const createRes = await fetchJsonAsAdmin('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
      displayName: '测试用户H3A',
    }),
  })
  assert(createRes.status === 200, `创建用户 → 200 (实际: ${createRes.status})`)

  const createdUser = (createRes.data as any).user
  assert(createdUser != null, '返回 user 对象')
  assert(createdUser.username === TEST_USERNAME, 'username 正确')
  assert(createdUser.displayName === '测试用户H3A', 'displayName 正确')
  assert(createdUser.isActive === true, '默认启用')

  if (createdUser) {
    testUserId = createdUser.id
  }

  // Verify password is hashed (not plaintext)
  const dbUser = await prisma.user.findUnique({
    where: { username: TEST_USERNAME },
    select: { passwordHash: true },
  })
  assert(dbUser != null, '用户已写入数据库')
  assert(dbUser?.passwordHash !== TEST_PASSWORD, 'passwordHash 不是明文')
  assert(
    dbUser?.passwordHash?.startsWith('$') || dbUser?.passwordHash?.length !== TEST_PASSWORD.length,
    'passwordHash 使用 hash 格式',
  )

  // ─── 3. Duplicate Username ───────────────────────────────────
  console.log('\n3️⃣  重复用户名测试')

  const dupRes = await fetchJsonAsAdmin('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: TEST_USERNAME,
      password: 'anotherpassword123',
    }),
  })
  assert(dupRes.status === 409, `重复用户名 → 409 (实际: ${dupRes.status})`)

  // ─── 4. List Users ───────────────────────────────────────────
  console.log('\n4️⃣  用户列表测试')

  const listRes = await fetchJsonAsAdmin('/api/admin/users')
  assert(listRes.status === 200, '获取用户列表 → 200')

  const users = (listRes.data as any).users as any[]
  const testUserInList = users.find((u) => u.username === TEST_USERNAME)
  assert(testUserInList != null, '测试用户在列表中')
  assert(testUserInList?.roles?.includes('USER'), '测试用户有 USER 角色')
  assert(!testUserInList?.roles?.includes('ADMIN'), '测试用户没有 ADMIN 角色')

  // Verify passwordHash not returned
  assert(
    !users.some((u) => 'passwordHash' in u),
    '列表不包含 passwordHash',
  )

  // ─── 5. Disable User ────────────────────────────────────────
  console.log('\n5️⃣  停用用户测试')

  if (testUserId) {
    const disableRes = await fetchJsonAsAdmin(`/api/admin/users/${testUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    assert(disableRes.status === 200, `停用用户 → 200 (实际: ${disableRes.status})`)

    const disabledUser = (disableRes.data as any).user
    assert(disabledUser.isActive === false, '用户已停用')

    // Verify in database
    const dbDisabled = await prisma.user.findUnique({
      where: { id: testUserId },
      select: { isActive: true },
    })
    assert(dbDisabled?.isActive === false, '数据库确认停用')
  }

  // ─── 6. Enable User ─────────────────────────────────────────
  console.log('\n6️⃣  启用用户测试')

  if (testUserId) {
    const enableRes = await fetchJsonAsAdmin(`/api/admin/users/${testUserId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    })
    assert(enableRes.status === 200, `启用用户 → 200 (实际: ${enableRes.status})`)

    const enabledUser = (enableRes.data as any).user
    assert(enabledUser.isActive === true, '用户已启用')
  }

  // ─── 7. Prevent Disable Last Admin ──────────────────────────
  console.log('\n7️⃣  保护最后管理员测试')

  const adminUser = await prisma.user.findFirst({
    where: {
      isActive: true,
      userRoles: { some: { role: { name: 'ADMIN' } } },
    },
    select: { id: true },
  })

  if (adminUser) {
    const disableAdminRes = await fetchJsonAsAdmin(`/api/admin/users/${adminUser.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    assert(
      disableAdminRes.status === 400,
      `停用最后管理员 → 400 (实际: ${disableAdminRes.status})`,
    )
  }

  // ─── 8. File Structure Check ────────────────────────────────
  console.log('\n8️⃣  文件结构检查')

  assert(
    fileContains('src/app/api/admin/users/route.ts', 'requirePermission'),
    'API 使用 requirePermission',
  )
  assert(
    fileContains('src/app/api/admin/users/route.ts', 'users:manage'),
    'API 使用 users:manage 权限',
  )
  assert(
    fileContains('src/app/api/admin/users/[id]/status/route.ts', 'requirePermission'),
    'Status API 使用 requirePermission',
  )
  assert(
    fileContains('src/app/admin/users/page.tsx', 'ProtectedShell'),
    '页面使用 ProtectedShell',
  )

  // ─── 9. Data Safety ─────────────────────────────────────────
  console.log('\n9️⃣  主数据安全检查')

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
    // Cleanup: deactivate test user (keep for audit, don't delete)
    if (testUserId) {
      await prisma.user.updateMany({
        where: { id: testUserId },
        data: { isActive: false },
      })
      console.log(`\n(Cleanup: test user #${testUserId} deactivated)`)
    }
    await cleanup()
  })
