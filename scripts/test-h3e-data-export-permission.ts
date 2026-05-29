// scripts/test-h3e-data-export-permission.ts
// H3-E test: Data export permission

import { PrismaClient } from '@prisma/client'
import {
  fetchJsonAsAdmin,
  fetchJsonAsUser,
  fetchJson,
  createSessionCookie,
  fetchAsAdmin,
  fetchWithCookie,
  cleanup,
} from './test-auth-helper'
import { hashPassword } from '../src/lib/auth/crypto'

const prisma = new PrismaClient()
const BASE_URL = 'http://localhost:3000'

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

const TEST_USERNAME = 'test_h3e_exporter_' + Date.now()
const TEST_PASSWORD = 'test123456'
let testUserId: number | null = null
let exporterCookie: string | null = null

async function main() {
  console.log('🧪 H3-E Data Export Permission Tests\n')

  // ─── 0. Setup: Create DATA_EXPORTER role and test user ───────
  console.log('0️⃣  准备测试环境')

  // Ensure DATA_EXPORTER role exists
  const exporterRole = await prisma.role.upsert({
    where: { name: 'DATA_EXPORTER' },
    update: {},
    create: {
      name: 'DATA_EXPORTER',
      description: '数据导出员',
    },
  })

  // Bind permissions
  const dataReadPerm = await prisma.permission.findUnique({ where: { key: 'data:read' } })
  const dataExportPerm = await prisma.permission.findUnique({ where: { key: 'data:export' } })

  if (dataReadPerm && dataExportPerm) {
    for (const perm of [dataReadPerm, dataExportPerm]) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: exporterRole.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: exporterRole.id,
          permissionId: perm.id,
        },
      })
    }
  }
  assert(true, 'DATA_EXPORTER 角色已创建并绑定 data:read + data:export')

  // Create test user
  const passwordHash = await hashPassword(TEST_PASSWORD)
  const testUser = await prisma.user.create({
    data: {
      username: TEST_USERNAME,
      displayName: '测试导出员',
      passwordHash,
      isActive: true,
    },
  })
  testUserId = testUser.id

  // Bind to DATA_EXPORTER role
  await prisma.userRole.create({
    data: {
      userId: testUserId,
      roleId: exporterRole.id,
    },
  })

  // Create session cookie
  exporterCookie = await createSessionCookie(TEST_USERNAME)
  assert(exporterCookie != null, '创建测试用户 session')
  console.log(`   测试用户: ${TEST_USERNAME} (ID: ${testUserId})`)

  // ─── 1. Export API Permission Tests ──────────────────────────
  console.log('\n1️⃣  导出 API 权限测试')

  const noAuthRes = await fetch(`${BASE_URL}/api/export/excel`)
  assert(noAuthRes.status === 401, `未登录 /api/export/excel → 401 (实际: ${noAuthRes.status})`)

  const userRes = await fetchJsonAsUser('/api/export/excel')
  assert(userRes.status === 403, `USER /api/export/excel → 403 (实际: ${userRes.status})`)

  const exporterRes = await fetchWithCookie('/api/export/excel', exporterCookie!)
  assert(exporterRes.status === 200, `DATA_EXPORTER /api/export/excel → 200 (实际: ${exporterRes.status})`)

  const adminRes = await fetchAsAdmin('/api/export/excel')
  assert(adminRes.status === 200, `ADMIN /api/export/excel → 200 (实际: ${adminRes.status})`)

  // ─── 2. Role Permission Verification ─────────────────────────
  console.log('\n2️⃣  角色权限验证')

  const exporterPerms = await prisma.rolePermission.findMany({
    where: { roleId: exporterRole.id },
    include: { permission: true },
  })
  const permKeys = exporterPerms.map((rp) => rp.permission.key)
  assert(permKeys.includes('data:read'), 'DATA_EXPORTER 拥有 data:read')
  assert(permKeys.includes('data:export'), 'DATA_EXPORTER 拥有 data:export')
  assert(!permKeys.includes('data:write'), 'DATA_EXPORTER 不拥有 data:write')
  assert(!permKeys.includes('schedule:adjust'), 'DATA_EXPORTER 不拥有 schedule:adjust')

  // Verify USER still only has data:read
  const userRole = await prisma.role.findUnique({ where: { name: 'USER' } })
  const userPerms = await prisma.rolePermission.findMany({
    where: { roleId: userRole!.id },
    include: { permission: true },
  })
  const userPermKeys = userPerms.map((rp) => rp.permission.key)
  assert(userPermKeys.includes('data:read'), 'USER 拥有 data:read')
  assert(!userPermKeys.includes('data:export'), 'USER 不拥有 data:export')

  // ─── 3. Data Read Still Works ────────────────────────────────
  console.log('\n3️⃣  数据读取权限验证')

  const exporterSummary = await fetchWithCookie('/api/data/summary', exporterCookie!)
  assert(exporterSummary.status === 200, `DATA_EXPORTER /api/data/summary → 200 (实际: ${exporterSummary.status})`)

  const userSummary = await fetchJsonAsUser('/api/data/summary')
  assert(userSummary.status === 200, `USER /api/data/summary → 200 (实际: ${userSummary.status})`)

  // ─── 4. Write Protection Still Works ─────────────────────────
  console.log('\n4️⃣  写权限防护验证')

  const exporterWrite = await fetchWithCookie('/api/teachers', exporterCookie!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '测试教师_越权' }),
  })
  assert(exporterWrite.status === 403, `DATA_EXPORTER POST /api/teachers → 403 (实际: ${exporterWrite.status})`)

  const exporterImport = await fetchWithCookie('/api/admin/import/batches', exporterCookie!)
  assert(exporterImport.status === 403, `DATA_EXPORTER /api/admin/import/batches → 403 (实际: ${exporterImport.status})`)

  // ─── 5. Data Safety ──────────────────────────────────────────
  console.log('\n5️⃣  主数据安全检查')

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
    // Cleanup: remove test user and role bindings
    if (testUserId) {
      await prisma.userRole.deleteMany({ where: { userId: testUserId } })
      await prisma.session.deleteMany({ where: { userId: testUserId } })
      await prisma.user.delete({ where: { id: testUserId } })
      console.log(`\n(Cleanup: test user #${testUserId} removed)`)
    }
    await cleanup()
  })
