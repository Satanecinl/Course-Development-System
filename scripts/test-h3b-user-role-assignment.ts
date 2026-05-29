// scripts/test-h3b-user-role-assignment.ts
// H3-B test: User role assignment API

import { PrismaClient } from '@prisma/client'
import {
  fetchJsonAsAdmin,
  fetchJsonAsUser,
  fetchJson,
  cleanup,
} from './test-auth-helper'

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

const TEST_USERNAME = 'test_h3b_user_' + Date.now()
const TEST_PASSWORD = 'test123456'
let testUserId: number | null = null

async function main() {
  console.log('🧪 H3-B User Role Assignment Tests\n')

  // Create test user first
  const createRes = await fetchJsonAsAdmin('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
      displayName: '测试用户H3B',
    }),
  })
  assert(createRes.status === 200, '创建测试用户')

  const createdUser = (createRes.data as any).user
  testUserId = createdUser?.id ?? null
  assert(testUserId != null, '获取测试用户 ID')

  // ─── 1. Roles API Permission Tests ───────────────────────────
  console.log('\n1️⃣  角色 API 权限测试')

  const noAuth = await fetchJson('/api/admin/roles')
  assert(noAuth.status === 401, `未登录 GET /api/admin/roles → 401 (实际: ${noAuth.status})`)

  const userAccess = await fetchJsonAsUser('/api/admin/roles')
  assert(userAccess.status === 403, `User GET /api/admin/roles → 403 (实际: ${userAccess.status})`)

  const adminAccess = await fetchJsonAsAdmin('/api/admin/roles')
  assert(adminAccess.status === 200, `Admin GET /api/admin/roles → 200 (实际: ${adminAccess.status})`)

  const roles = (adminAccess.data as any).roles
  assert(Array.isArray(roles), '返回 roles 数组')
  assert(roles.length > 0, '系统有角色数据')

  const adminRole = roles.find((r: any) => r.name === 'ADMIN')
  const userRole = roles.find((r: any) => r.name === 'USER')
  assert(adminRole != null, '包含 ADMIN 角色')
  assert(userRole != null, '包含 USER 角色')

  // ─── 2. Add Role to User ─────────────────────────────────────
  console.log('\n2️⃣  添加角色测试')

  if (testUserId && userRole) {
    // Add USER role (should already have it from creation)
    const addRoleRes = await fetchJsonAsAdmin(`/api/admin/users/${testUserId}/roles`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleIds: [userRole.id] }),
    })
    assert(addRoleRes.status === 200, `添加 USER 角色 → 200 (实际: ${addRoleRes.status})`)

    const updatedUser = (addRoleRes.data as any).user
    assert(updatedUser.roles.some((r: any) => r.name === 'USER'), '用户有 USER 角色')
  }

  // ─── 3. Add ADMIN Role ───────────────────────────────────────
  console.log('\n3️⃣  添加 ADMIN 角色测试')

  if (testUserId && adminRole && userRole) {
    const addAdminRes = await fetchJsonAsAdmin(`/api/admin/users/${testUserId}/roles`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleIds: [userRole.id, adminRole.id] }),
    })
    assert(addAdminRes.status === 200, `添加 ADMIN 角色 → 200 (实际: ${addAdminRes.status})`)

    const updatedUser = (addAdminRes.data as any).user
    assert(updatedUser.roles.some((r: any) => r.name === 'ADMIN'), '用户有 ADMIN 角色')
    assert(updatedUser.roles.some((r: any) => r.name === 'USER'), '用户有 USER 角色')
  }

  // ─── 4. Remove ADMIN Role ────────────────────────────────────
  console.log('\n4️⃣  移除 ADMIN 角色测试')

  if (testUserId && userRole) {
    const removeAdminRes = await fetchJsonAsAdmin(`/api/admin/users/${testUserId}/roles`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleIds: [userRole.id] }),
    })
    assert(removeAdminRes.status === 200, `移除 ADMIN 角色 → 200 (实际: ${removeAdminRes.status})`)

    const updatedUser = (removeAdminRes.data as any).user
    assert(!updatedUser.roles.some((r: any) => r.name === 'ADMIN'), '用户没有 ADMIN 角色')
    assert(updatedUser.roles.some((r: any) => r.name === 'USER'), '用户仍有 USER 角色')
  }

  // ─── 5. Duplicate Role Prevention ────────────────────────────
  console.log('\n5️⃣  重复角色防护测试')

  if (testUserId && userRole) {
    // Try to add same role twice — API should reject duplicate role IDs
    const dupRes = await fetchJsonAsAdmin(`/api/admin/users/${testUserId}/roles`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleIds: [userRole.id, userRole.id] }),
    })
    // API returns 400 for duplicate role IDs (valid security check)
    assert(dupRes.status === 400, `重复角色 ID → 400 (实际: ${dupRes.status})`)

    // Verify no duplicate bindings
    const dbRoles = await prisma.userRole.findMany({
      where: { userId: testUserId },
    })
    const roleIds = dbRoles.map((ur) => ur.roleId)
    const uniqueRoleIds = new Set(roleIds)
    assert(roleIds.length === uniqueRoleIds.size, '数据库中无重复角色绑定')
  }

  // ─── 6. Invalid Role ID ──────────────────────────────────────
  console.log('\n6️⃣  无效角色 ID 测试')

  if (testUserId) {
    const invalidRes = await fetchJsonAsAdmin(`/api/admin/users/${testUserId}/roles`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleIds: [99999] }),
    })
    assert(invalidRes.status === 400, `不存在角色 ID → 400 (实际: ${invalidRes.status})`)
  }

  // ─── 7. Protect Last Admin ───────────────────────────────────
  console.log('\n7️⃣  保护最后管理员测试')

  // Find the real admin user
  const realAdmin = await prisma.user.findFirst({
    where: {
      isActive: true,
      userRoles: { some: { role: { name: 'ADMIN' } } },
    },
    select: { id: true },
  })

  if (realAdmin && userRole) {
    // Try to remove ADMIN role from real admin
    const removeLastAdminRes = await fetchJsonAsAdmin(`/api/admin/users/${realAdmin.id}/roles`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleIds: [userRole.id] }),
    })
    assert(
      removeLastAdminRes.status === 400,
      `移除最后管理员 ADMIN → 400 (实际: ${removeLastAdminRes.status})`,
    )
  }

  // ─── 8. PasswordHash Not Returned ────────────────────────────
  console.log('\n8️⃣  安全检查')

  const listRes = await fetchJsonAsAdmin('/api/admin/users')
  const users = (listRes.data as any).users as any[]
  assert(
    !users.some((u: any) => 'passwordHash' in u),
    '用户列表不包含 passwordHash',
  )

  // ─── 9. Data Safety ──────────────────────────────────────────
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
    // Cleanup: deactivate test user
    if (testUserId) {
      await prisma.userRole.deleteMany({ where: { userId: testUserId } })
      await prisma.user.updateMany({
        where: { id: testUserId },
        data: { isActive: false },
      })
      console.log(`\n(Cleanup: test user #${testUserId} roles removed and deactivated)`)
    }
    await cleanup()
  })
