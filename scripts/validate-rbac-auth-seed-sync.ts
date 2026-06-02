// scripts/validate-rbac-auth-seed-sync.ts
// K15 Fix-A Auth Seed Sync Validation
// Read-only DB checks: verifies that schedule:write and teaching-task:write
// exist in the Permission table, are granted to ADMIN, and not to USER/DATA_EXPORTER.

import { PrismaClient } from '@prisma/client'
import { ALL_PERMISSIONS } from '../src/lib/auth/types'

const prisma = new PrismaClient()

let passed = 0
let failed = 0

function check(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  PASS  ${message}`)
  } else {
    failed++
    console.error(`  FAIL  ${message}`)
  }
}

async function main() {
  console.log('K15 RBAC Auth Seed Sync Validation\n')

  // ─── 1. Code permission list ────────────────────────────────────
  console.log('1. Code Permission List')

  check(ALL_PERMISSIONS.length === 12, `Code ALL_PERMISSIONS has 12 entries (actual ${ALL_PERMISSIONS.length})`)
  check(ALL_PERMISSIONS.includes('schedule:write'), 'Code contains schedule:write')
  check(ALL_PERMISSIONS.includes('teaching-task:write'), 'Code contains teaching-task:write')
  check(ALL_PERMISSIONS.includes('data:write'), 'Code still contains data:write')
  check(ALL_PERMISSIONS.includes('schedule:adjust'), 'Code still contains schedule:adjust')
  check(ALL_PERMISSIONS.includes('import:manage'), 'Code still contains import:manage')

  // ─── 2. DB Permission table ─────────────────────────────────────
  console.log('\n2. DB Permission Table')

  const dbPermissions = await prisma.permission.findMany()
  const dbPermKeys = new Set(dbPermissions.map((p) => p.key))

  check(dbPermissions.length === 12, `DB Permission count = 12 (actual ${dbPermissions.length})`)
  check(dbPermKeys.has('schedule:write'), 'DB contains schedule:write')
  check(dbPermKeys.has('teaching-task:write'), 'DB contains teaching-task:write')
  check(dbPermKeys.has('data:write'), 'DB still contains data:write')
  check(dbPermKeys.has('schedule:adjust'), 'DB still contains schedule:adjust')
  check(dbPermKeys.has('import:manage'), 'DB still contains import:manage')

  // ─── 3. ADMIN role ──────────────────────────────────────────────
  console.log('\n3. ADMIN Role')

  const adminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
    include: {
      rolePermissions: {
        include: { permission: true },
      },
    },
  })

  check(adminRole !== null, 'ADMIN role exists')

  if (adminRole) {
    const adminPermKeys = new Set(adminRole.rolePermissions.map((rp) => rp.permission.key))

    check(adminPermKeys.size === 12, `ADMIN has 12 permissions (actual ${adminPermKeys.size})`)
    check(adminPermKeys.has('schedule:write'), 'ADMIN has schedule:write')
    check(adminPermKeys.has('teaching-task:write'), 'ADMIN has teaching-task:write')
    check(adminPermKeys.has('data:write'), 'ADMIN still has data:write')
    check(adminPermKeys.has('schedule:adjust'), 'ADMIN still has schedule:adjust')
    check(adminPermKeys.has('import:manage'), 'ADMIN still has import:manage')

    // Verify all ALL_PERMISSIONS are present
    for (const perm of ALL_PERMISSIONS) {
      check(adminPermKeys.has(perm), `  ADMIN has ${perm}`)
    }
  }

  // ─── 4. USER role ───────────────────────────────────────────────
  console.log('\n4. USER Role')

  const userRole = await prisma.role.findUnique({
    where: { name: 'USER' },
    include: {
      rolePermissions: {
        include: { permission: true },
      },
    },
  })

  check(userRole !== null, 'USER role exists')

  if (userRole) {
    const userPermKeys = new Set(userRole.rolePermissions.map((rp) => rp.permission.key))

    check(userPermKeys.size === 1, `USER has 1 permission (actual ${userPermKeys.size})`)
    check(userPermKeys.has('data:read'), 'USER has data:read')
    check(!userPermKeys.has('schedule:write'), 'USER does NOT have schedule:write')
    check(!userPermKeys.has('teaching-task:write'), 'USER does NOT have teaching-task:write')
    check(!userPermKeys.has('data:write'), 'USER does NOT have data:write')
  }

  // ─── 5. DATA_EXPORTER role ──────────────────────────────────────
  console.log('\n5. DATA_EXPORTER Role')

  const exporterRole = await prisma.role.findUnique({
    where: { name: 'DATA_EXPORTER' },
    include: {
      rolePermissions: {
        include: { permission: true },
      },
    },
  })

  check(exporterRole !== null, 'DATA_EXPORTER role exists')

  if (exporterRole) {
    const exporterPermKeys = new Set(exporterRole.rolePermissions.map((rp) => rp.permission.key))

    check(exporterPermKeys.size === 2, `DATA_EXPORTER has 2 permissions (actual ${exporterPermKeys.size})`)
    check(exporterPermKeys.has('data:read'), 'DATA_EXPORTER has data:read')
    check(exporterPermKeys.has('data:export'), 'DATA_EXPORTER has data:export')
    check(!exporterPermKeys.has('schedule:write'), 'DATA_EXPORTER does NOT have schedule:write')
    check(!exporterPermKeys.has('teaching-task:write'), 'DATA_EXPORTER does NOT have teaching-task:write')
    check(!exporterPermKeys.has('data:write'), 'DATA_EXPORTER does NOT have data:write')
  }

  // ─── Summary ────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60))
  console.log(`Summary:`)
  console.log(`  passed: ${passed}`)
  console.log(`  failed: ${failed}`)

  await prisma.$disconnect()

  if (failed > 0) {
    console.error('\n❌ Some checks failed')
    process.exit(1)
  } else {
    console.log('\n✅ All checks passed — auth seed sync verified')
    process.exit(0)
  }
}

main().catch((e) => {
  console.error('❌ Validation error:', e)
  process.exit(1)
})
