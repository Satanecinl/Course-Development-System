// scripts/test-h2e-api-permissions.ts
// H2-E test: API permission enforcement, auth helpers, user isolation

import { PrismaClient } from '@prisma/client'
import { fetchJson, fetchJsonAsAdmin, fetchJsonAsUser, cleanup } from './test-auth-helper'
import {
  getCurrentAuthUser,
  requireAuth,
  requirePermission,
  requireAnyPermission,
} from '../src/lib/auth/require-permission'
import { SESSION_COOKIE_NAME } from '../src/lib/auth/constants'
import { createSession } from '../src/lib/auth/session'
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

async function main() {
  console.log('🧪 H2-E API Permissions Tests\n')

  // ─── 1. Auth Helper Tests ──────────────────────────────────────
  console.log('1️⃣  Auth Helper 函数测试')

  // No cookie → getCurrentAuthUser returns null
  const noAuthRes = await fetchJson('/api/schedule')
  assert(noAuthRes.status === 401, `无 cookie 访问 /api/schedule → 401 (实际: ${noAuthRes.status})`)
  assert(
    (noAuthRes.data as { error?: string }).error === 'UNAUTHENTICATED',
    `401 返回 UNAUTHENTICATED 错误码`,
  )

  // ─── 2. Admin Access ───────────────────────────────────────────
  console.log('\n2️⃣  Admin 权限测试')

  const adminSchedule = await fetchJsonAsAdmin('/api/schedule')
  assert(adminSchedule.status === 200, `Admin 访问 /api/schedule → 200 (实际: ${adminSchedule.status})`)

  const adminRooms = await fetchJsonAsAdmin('/api/rooms')
  assert(adminRooms.status === 200, `Admin 访问 /api/rooms → 200 (实际: ${adminRooms.status})`)

  const adminTeachers = await fetchJsonAsAdmin('/api/teachers')
  assert(adminTeachers.status === 200, `Admin 访问 /api/teachers → 200 (实际: ${adminTeachers.status})`)

  const adminClassGroups = await fetchJsonAsAdmin('/api/class-groups')
  assert(adminClassGroups.status === 200, `Admin 访问 /api/class-groups → 200 (实际: ${adminClassGroups.status})`)

  const adminEntityList = await fetchJsonAsAdmin('/api/entity-list?type=course')
  assert(adminEntityList.status === 200, `Admin 访问 /api/entity-list → 200 (实际: ${adminEntityList.status})`)

  const adminDb = await fetchJsonAsAdmin('/api/admin/teacher')
  assert(adminDb.status === 200, `Admin 访问 /api/admin/teacher GET → 200 (实际: ${adminDb.status})`)

  const adminBatches = await fetchJsonAsAdmin('/api/admin/import/batches')
  assert(adminBatches.status === 200, `Admin 访问 /api/admin/import/batches → 200 (实际: ${adminBatches.status})`)

  const adminAdj = await fetchJsonAsAdmin('/api/schedule-adjustments')
  assert(adminAdj.status === 200, `Admin 访问 /api/schedule-adjustments GET → 200 (实际: ${adminAdj.status})`)

  // ─── 3. User Access (data:read only) ───────────────────────────
  console.log('\n3️⃣  User 权限测试 (data:read only)')

  const userSchedule = await fetchJsonAsUser('/api/schedule')
  assert(userSchedule.status === 403, `User 访问 /api/schedule → 403 (实际: ${userSchedule.status})`)

  const userRooms = await fetchJsonAsUser('/api/rooms')
  assert(userRooms.status === 200, `User 访问 /api/rooms → 200 (实际: ${userRooms.status})`)

  const userTeachers = await fetchJsonAsUser('/api/teachers')
  assert(userTeachers.status === 200, `User 访问 /api/teachers → 200 (实际: ${userTeachers.status})`)

  const userClassGroups = await fetchJsonAsUser('/api/class-groups')
  assert(userClassGroups.status === 200, `User 访问 /api/class-groups → 200 (实际: ${userClassGroups.status})`)

  const userEntityList = await fetchJsonAsUser('/api/entity-list?type=room')
  assert(userEntityList.status === 200, `User 访问 /api/entity-list → 200 (实际: ${userEntityList.status})`)

  const userDb = await fetchJsonAsUser('/api/admin/teacher')
  assert(userDb.status === 200, `User 访问 /api/admin/teacher GET → 200 (实际: ${userDb.status})`)

  // ─── 4. User Cannot Write ──────────────────────────────────────
  console.log('\n4️⃣  User 越权测试')

  const userCreateTeacher = await fetchJsonAsUser('/api/teachers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '测试教师_越权' }),
  })
  assert(userCreateTeacher.status === 403, `User POST /api/teachers → 403 (实际: ${userCreateTeacher.status})`)

  const userCreateCourse = await fetchJsonAsUser('/api/courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '测试课程_越权' }),
  })
  assert(userCreateCourse.status === 403, `User POST /api/courses → 403 (实际: ${userCreateCourse.status})`)

  const userBatches = await fetchJsonAsUser('/api/admin/import/batches')
  assert(userBatches.status === 403, `User 访问 /api/admin/import/batches → 403 (实际: ${userBatches.status})`)

  const userAdj = await fetchJsonAsUser('/api/schedule-adjustments')
  assert(userAdj.status === 403, `User 访问 /api/schedule-adjustments → 403 (实际: ${userAdj.status})`)

  const userCreateAdj = await fetchJsonAsUser('/api/schedule-adjustments/dry-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'MOVE', week: 1, originalSlotId: 1, newDayOfWeek: 1, newSlotIndex: 1 }),
  })
  assert(userCreateAdj.status === 403, `User POST /api/schedule-adjustments/dry-run → 403 (实际: ${userCreateAdj.status})`)

  const userDelete = await fetchJsonAsUser('/api/admin/teacher', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 99999 }),
  })
  assert(userDelete.status === 403, `User DELETE /api/admin/teacher → 403 (实际: ${userDelete.status})`)

  const userExport = await fetchJsonAsUser('/api/export/excel')
  assert(userExport.status === 403, `User 访问 /api/export/excel → 403 (实际: ${userExport.status})`)

  // ─── 5. Revoked / Expired Session ──────────────────────────────
  console.log('\n5️⃣  Revoked / Expired Session 测试')

  // Create a session then revoke it
  const adminUser = await prisma.user.findUnique({ where: { username: 'admin' } })
  if (adminUser) {
    const { sessionToken } = await createSession(adminUser.id)
    const revokedCookie = `${SESSION_COOKIE_NAME}=${sessionToken}`

    // Revoke the session
    await prisma.session.updateMany({
      where: { tokenHash: require('../src/lib/auth/crypto').hashSessionToken(sessionToken) },
      data: { revokedAt: new Date() },
    })

    const revokedRes = await fetchJson('/api/schedule', { cookie: revokedCookie })
    assert(revokedRes.status === 401, `Revoked session → 401 (实际: ${revokedRes.status})`)
  }

  // ─── 6. Auth Route Protection in Code ──────────────────────────
  console.log('\n6️⃣  API 路由 auth 代码检查')

  const apiRoutes = [
    { file: 'src/app/api/schedule/route.ts', method: 'GET', perm: 'schedule:view' },
    { file: 'src/app/api/schedule-slot/route.ts', method: 'POST', perm: 'data:write' },
    { file: 'src/app/api/teachers/route.ts', method: 'GET', perm: 'data:read' },
    { file: 'src/app/api/rooms/route.ts', method: 'GET', perm: 'data:read' },
    { file: 'src/app/api/class-groups/route.ts', method: 'GET', perm: 'data:read' },
    { file: 'src/app/api/entity-list/route.ts', method: 'GET', perm: 'data:read' },
    { file: 'src/app/api/conflict-check/route.ts', method: 'POST', perm: 'schedule:view' },
    { file: 'src/app/api/courses/route.ts', method: 'POST', perm: 'data:write' },
    { file: 'src/app/api/teaching-task/route.ts', method: 'POST', perm: 'data:write' },
    { file: 'src/app/api/admin/[model]/route.ts', method: 'GET', perm: 'data:read' },
    { file: 'src/app/api/admin/[model]/route.ts', method: 'DELETE', perm: 'data:delete' },
    { file: 'src/app/api/admin/import/parse/route.ts', method: 'POST', perm: 'import:manage' },
    { file: 'src/app/api/admin/import/confirm/route.ts', method: 'POST', perm: 'import:manage' },
    { file: 'src/app/api/admin/import/rollback/route.ts', method: 'POST', perm: 'import:manage' },
    { file: 'src/app/api/admin/import/batches/route.ts', method: 'GET', perm: 'import:manage' },
    { file: 'src/app/api/admin/import/batches/[id]/route.ts', method: 'GET', perm: 'import:manage' },
    { file: 'src/app/api/admin/import/batches/[id]/abandon/route.ts', method: 'POST', perm: 'import:manage' },
    { file: 'src/app/api/schedule-adjustments/route.ts', method: 'GET', perm: 'schedule:view' },
    { file: 'src/app/api/schedule-adjustments/route.ts', method: 'POST', perm: 'schedule:adjust' },
    { file: 'src/app/api/schedule-adjustments/dry-run/route.ts', method: 'POST', perm: 'schedule:adjust' },
    { file: 'src/app/api/schedule-adjustments/[id]/void/route.ts', method: 'PATCH', perm: 'schedule:adjust' },
    { file: 'src/app/api/export/excel/route.ts', method: 'GET', perm: 'data:export' },
  ]

  for (const route of apiRoutes) {
    assert(
      fileContains(route.file, 'requirePermission'),
      `${route.file} (${route.method}) 包含 requirePermission`,
    )
    assert(
      fileContains(route.file, `'${route.perm}'`),
      `${route.file} (${route.method}) 使用权限 "${route.perm}"`,
    )
  }

  // ─── 7. require-permission.ts Structure ────────────────────────
  console.log('\n7️⃣  require-permission.ts 结构检查')

  assert(
    fileContains('src/lib/auth/require-permission.ts', 'getCurrentAuthUser'),
    'require-permission.ts 导出 getCurrentAuthUser',
  )
  assert(
    fileContains('src/lib/auth/require-permission.ts', 'requireAuth'),
    'require-permission.ts 导出 requireAuth',
  )
  assert(
    fileContains('src/lib/auth/require-permission.ts', 'requirePermission'),
    'require-permission.ts 导出 requirePermission',
  )
  assert(
    fileContains('src/lib/auth/require-permission.ts', 'requireAnyPermission'),
    'require-permission.ts 导出 requireAnyPermission',
  )
  assert(
    fileContains('src/lib/auth/require-permission.ts', 'SESSION_COOKIE_NAME'),
    'require-permission.ts 使用 SESSION_COOKIE_NAME',
  )
  assert(
    fileContains('src/lib/auth/require-permission.ts', 'getCurrentAuthUser'),
    'require-permission.ts 使用 getCurrentAuthUser (DB session)',
  )
  assert(
    !fileContains('src/lib/auth/require-permission.ts', 'AUTH_CLAIMS_COOKIE_NAME'),
    'require-permission.ts 不引用 AUTH_CLAIMS_COOKIE_NAME',
  )
  assert(
    !fileContains('src/lib/auth/require-permission.ts', "from './claims"),
    'require-permission.ts 不 import claims 模块',
  )

  // ─── 8. Error Response Format ──────────────────────────────────
  console.log('\n8️⃣  错误响应格式检查')

  assert(
    fileContains('src/lib/auth/require-permission.ts', 'UNAUTHENTICATED'),
    '401 响应包含 UNAUTHENTICATED 错误码',
  )
  assert(
    fileContains('src/lib/auth/require-permission.ts', 'FORBIDDEN'),
    '403 响应包含 FORBIDDEN 错误码',
  )
  assert(
    fileContains('src/lib/auth/require-permission.ts', '请先登录'),
    '401 响应包含中文提示',
  )
  assert(
    fileContains('src/lib/auth/require-permission.ts', '没有权限'),
    '403 响应包含中文提示',
  )

  // ─── 9. Data Safety ────────────────────────────────────────────
  console.log('\n9️⃣  主数据安全测试')

  const importBatch = await prisma.importBatch.findUnique({ where: { id: 1 } })
  assert(importBatch?.status === 'confirmed', `ImportBatch #1 status = confirmed (实际: ${importBatch?.status})`)

  const slotCount = await prisma.scheduleSlot.count()
  assert(slotCount === 440, `ScheduleSlot 总数 = 440 (实际: ${slotCount})`)

  const taskCount = await prisma.teachingTask.count()
  assert(taskCount === 308, `TeachingTask 总数 = 308 (实际: ${taskCount})`)

  const activeAdj = await prisma.scheduleAdjustment.count({
    where: { status: 'ACTIVE' },
  })
  assert(activeAdj === 0, `ScheduleAdjustment ACTIVE = 0 (实际: ${activeAdj})`)

  // ─── Summary ───────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`📊 结果: ${passed} passed, ${failed} failed`)
  console.log(`${'═'.repeat(50)}`)

  await cleanup()
  await prisma.$disconnect()

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('Test error:', e)
  prisma.$disconnect().finally(() => process.exit(1))
})
