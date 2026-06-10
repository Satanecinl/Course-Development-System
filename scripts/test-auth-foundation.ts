// scripts/test-auth-foundation.ts
// Auth foundation test: permissions, sessions, password verification

import { PrismaClient } from '@prisma/client'
import { hashPassword, verifyPassword } from '../src/lib/auth/crypto'
import {
  createSession,
  getSessionByToken,
  revokeSession,
} from '../src/lib/auth/session'
import { getCurrentUser } from '../src/lib/auth/current-user'
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} from '../src/lib/auth/permissions'
import { ROLES, ALL_PERMISSIONS } from '../src/lib/auth/types'

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
  console.log('🧪 Auth Foundation Tests\n')

  // ─── 1. Admin Permission Tests ────────────────────────────────
  console.log('1️⃣  Admin 权限测试')

  const adminUser = await prisma.user.findUnique({
    where: { username: 'admin' },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  })

  assert(adminUser !== null, 'admin 用户存在')
  assert(adminUser?.isActive === true, 'admin 用户处于激活状态')

  if (adminUser) {
    const adminRoles = adminUser.userRoles.map((ur) => ur.role.name)
    assert(adminRoles.includes(ROLES.ADMIN), 'admin 拥有 ADMIN 角色')

    const adminPermissions = new Set<string>()
    for (const ur of adminUser.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        adminPermissions.add(rp.permission.key)
      }
    }

    assert(
      adminPermissions.size === ALL_PERMISSIONS.length,
      `admin 拥有全部 ${ALL_PERMISSIONS.length} 个权限 (实际 ${adminPermissions.size})`
    )

    for (const perm of ALL_PERMISSIONS) {
      assert(adminPermissions.has(perm), `  admin 拥有 ${perm}`)
    }
  }

  // ─── 2. User Permission Tests ─────────────────────────────────
  console.log('\n2️⃣  User 权限测试')

  const normalUser = await prisma.user.findUnique({
    where: { username: 'user' },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  })

  assert(normalUser !== null, 'user 用户存在')
  assert(normalUser?.isActive === true, 'user 用户处于激活状态')

  if (normalUser) {
    const userRoles = normalUser.userRoles.map((ur) => ur.role.name)
    assert(userRoles.includes(ROLES.USER), 'user 拥有 USER 角色')

    const userPermissions = new Set<string>()
    for (const ur of normalUser.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        userPermissions.add(rp.permission.key)
      }
    }

    // K28-A: USER now has 4 permissions:
    // data:read + schedule:view + adjustment-request:create + adjustment-request:read
    assert(userPermissions.size === 4, 'user 拥有 4 个权限 (data:read, schedule:view, adjustment-request:create, adjustment-request:read)')
    assert(userPermissions.has('data:read'), 'user 拥有 data:read')
    assert(userPermissions.has('schedule:view'), 'user 拥有 schedule:view (K28-A)')
    assert(userPermissions.has('adjustment-request:create'), 'user 拥有 adjustment-request:create (K28-A)')
    assert(userPermissions.has('adjustment-request:read'), 'user 拥有 adjustment-request:read (K28-A)')
    assert(!userPermissions.has('data:write'), 'user 不拥有 data:write')
    assert(!userPermissions.has('users:manage'), 'user 不拥有 users:manage')
    assert(!userPermissions.has('schedule:adjust'), 'user 不拥有 schedule:adjust')
    assert(!userPermissions.has('adjustment-request:review'), 'user 不拥有 adjustment-request:review')
  }

  // ─── 3. Password Verification Tests ───────────────────────────
  console.log('\n3️⃣  密码验证测试')

  const testPassword = 'test-password-123'
  const testHash = await hashPassword(testPassword)

  assert(testHash !== testPassword, 'hash 不等于明文')
  assert(testHash.startsWith('$argon2'), 'hash 使用 argon2 格式')

  const verifyCorrect = await verifyPassword(testPassword, testHash)
  assert(verifyCorrect === true, '正确密码验证通过')

  const verifyWrong = await verifyPassword('wrong-password', testHash)
  assert(verifyWrong === false, '错误密码验证失败')

  // Verify stored admin password
  if (adminUser) {
    const adminLoginOk = await verifyPassword('admin123456', adminUser.passwordHash)
    assert(adminLoginOk === true, 'admin 默认密码验证通过')
  }

  // Verify stored user password
  if (normalUser) {
    const userLoginOk = await verifyPassword('user123456', normalUser.passwordHash)
    assert(userLoginOk === true, 'user 默认密码验证通过')
  }

  // ─── 4. Session Create / Revoke Tests ─────────────────────────
  console.log('\n4️⃣  Session 创建 / Revocation 测试')

  if (adminUser) {
    // Create session
    const { sessionToken, session } = await createSession(adminUser.id)
    assert(sessionToken.length === 64, 'session token 为 64 位 hex')
    assert(session.userId === adminUser.id, 'session 关联到正确用户')
    assert(session.revokedAt === null, '新 session 未 revoked')

    // Get session by token
    const foundSession = await getSessionByToken(sessionToken)
    assert(foundSession !== null, '通过 token 可获取 session')
    assert(foundSession?.id === session.id, '获取到正确 session')

    // Revoke session
    await revokeSession(session.id)

    // Try to get revoked session
    const revokedSession = await getSessionByToken(sessionToken)
    assert(revokedSession === null, 'revoked session 不可访问')

    // Verify DB state
    const dbSession = await prisma.session.findUnique({
      where: { id: session.id },
    })
    assert(dbSession?.revokedAt !== null, 'DB 中 session 已标记 revoked')
  }

  // ─── 5. getCurrentUser Tests ──────────────────────────────────
  console.log('\n5️⃣  getCurrentUser 测试')

  if (adminUser) {
    const { sessionToken } = await createSession(adminUser.id)

    const authUser = await getCurrentUser(sessionToken)
    assert(authUser !== null, 'getCurrentUser 返回用户')
    assert(authUser?.username === 'admin', '用户名正确')
    assert(authUser?.roles.includes('ADMIN') === true, '角色正确')
    assert(authUser?.permissions.has('data:read') === true, '权限正确')
    assert(authUser?.permissions.has('users:manage') === true, '权限正确')
  }

  // ─── 6. Permission Helper Tests ───────────────────────────────
  console.log('\n6️⃣  Permission Helper 测试')

  const fakeAdminUser = {
    id: 1,
    username: 'admin',
    displayName: 'Admin',
    isActive: true,
    roles: ['ADMIN'],
    permissions: new Set(ALL_PERMISSIONS),
  }

  const fakeNormalUser = {
    id: 2,
    username: 'user',
    displayName: 'User',
    isActive: true,
    roles: ['USER'],
    permissions: new Set(['data:read']),
  }

  assert(hasPermission(fakeAdminUser, 'data:read') === true, 'admin hasPermission(data:read)')
  assert(hasPermission(fakeAdminUser, 'users:manage') === true, 'admin hasPermission(users:manage)')
  assert(hasPermission(fakeNormalUser, 'data:read') === true, 'user hasPermission(data:read)')
  assert(hasPermission(fakeNormalUser, 'data:write') === false, 'user !hasPermission(data:write)')
  assert(hasPermission(null, 'data:read') === false, 'null user !hasPermission')

  assert(
    hasAnyPermission(fakeNormalUser, ['data:read', 'data:write']) === true,
    'user hasAnyPermission([data:read, data:write])'
  )
  assert(
    hasAnyPermission(fakeNormalUser, ['data:write', 'data:delete']) === false,
    'user !hasAnyPermission([data:write, data:delete])'
  )

  assert(
    hasAllPermissions(fakeAdminUser, ['data:read', 'data:write']) === true,
    'admin hasAllPermissions([data:read, data:write])'
  )
  assert(
    hasAllPermissions(fakeNormalUser, ['data:read', 'data:write']) === false,
    'user !hasAllPermissions([data:read, data:write])'
  )

  // ─── 7. Main Data Safety ─────────────────────────────────────
  console.log('\n7️⃣  主数据安全检查')

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
