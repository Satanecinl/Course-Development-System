// scripts/seed-auth.ts
// Seed auth roles, permissions, and initial accounts

import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/crypto'
import { ALL_PERMISSIONS, ROLES } from '../src/lib/auth/types'
import {
  DEV_DEFAULT_ADMIN_PASSWORD,
  DEV_DEFAULT_USER_PASSWORD,
} from '../src/lib/auth/constants'

const prisma = new PrismaClient()

async function main() {
  console.log('🔐 Seeding auth system...')

  // ─── 1. Create Permissions ────────────────────────────────────
  console.log(`\n📋 Creating ${ALL_PERMISSIONS.length} permissions...`)
  const permissionRecords = new Map<string, { id: number }>()

  for (const key of ALL_PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: {
        key,
        description: getPermissionDescription(key),
      },
    })
    permissionRecords.set(key, perm)
    console.log(`   ✅ ${key}`)
  }

  // ─── 2. Create Roles ─────────────────────────────────────────
  console.log('\n👥 Creating roles...')

  const adminRole = await prisma.role.upsert({
    where: { name: ROLES.ADMIN },
    update: {},
    create: {
      name: ROLES.ADMIN,
      description: '系统管理员，拥有全部权限',
    },
  })
  console.log(`   ✅ ${ROLES.ADMIN}`)

  const userRole = await prisma.role.upsert({
    where: { name: ROLES.USER },
    update: {},
    create: {
      name: ROLES.USER,
      description: '普通用户，仅查看数据',
    },
  })
  console.log(`   ✅ ${ROLES.USER}`)

  const dataExporterRole = await prisma.role.upsert({
    where: { name: 'DATA_EXPORTER' },
    update: {},
    create: {
      name: 'DATA_EXPORTER',
      description: '数据导出员，可查看和导出数据',
    },
  })
  console.log('   ✅ DATA_EXPORTER')

  // ─── 3. Bind Permissions to Roles ────────────────────────────
  console.log('\n🔗 Binding permissions to roles...')

  // ADMIN gets all permissions
  for (const key of ALL_PERMISSIONS) {
    const perm = permissionRecords.get(key)!
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: perm.id,
      },
    })
  }
  console.log(`   ✅ ADMIN → all ${ALL_PERMISSIONS.length} permissions`)

  // USER gets only data:read
  const dataReadPerm = permissionRecords.get('data:read')!
  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: userRole.id,
        permissionId: dataReadPerm.id,
      },
    },
    update: {},
    create: {
      roleId: userRole.id,
      permissionId: dataReadPerm.id,
    },
  })
  console.log('   ✅ USER → data:read')

  // DATA_EXPORTER gets data:read + data:export
  const dataExportPerm = permissionRecords.get('data:export')!
  for (const perm of [dataReadPerm, dataExportPerm]) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: dataExporterRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: dataExporterRole.id,
        permissionId: perm.id,
      },
    })
  }
  console.log('   ✅ DATA_EXPORTER → data:read, data:export')

  // ─── 4. Create Initial Accounts ──────────────────────────────
  console.log('\n👤 Creating initial accounts...')

  // Determine passwords
  const isProd = process.env.NODE_ENV === 'production'

  const adminPassword =
    process.env.INITIAL_ADMIN_PASSWORD ||
    (isProd
      ? (() => {
          throw new Error(
            'INITIAL_ADMIN_PASSWORD must be set in production'
          )
        })()
      : DEV_DEFAULT_ADMIN_PASSWORD)

  const userPassword =
    process.env.INITIAL_USER_PASSWORD ||
    (isProd
      ? (() => {
          throw new Error(
            'INITIAL_USER_PASSWORD must be set in production'
          )
        })()
      : DEV_DEFAULT_USER_PASSWORD)

  if (!isProd) {
    console.log(
      '   ⚠️  Using development default passwords (set INITIAL_ADMIN_PASSWORD / INITIAL_USER_PASSWORD in .env for production)'
    )
  }

  // Create admin account
  const adminHash = await hashPassword(adminPassword)
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      displayName: '管理员',
      passwordHash: adminHash,
    },
  })
  console.log('   ✅ admin (密码已 hash，不存明文)')

  // Bind admin to ADMIN role
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  })
  console.log('   ✅ admin → ADMIN role')

  // Create user account
  const userHash = await hashPassword(userPassword)
  const normalUser = await prisma.user.upsert({
    where: { username: 'user' },
    update: {},
    create: {
      username: 'user',
      displayName: '普通用户',
      passwordHash: userHash,
    },
  })
  console.log('   ✅ user (密码已 hash，不存明文)')

  // Bind user to USER role
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: normalUser.id,
        roleId: userRole.id,
      },
    },
    update: {},
    create: {
      userId: normalUser.id,
      roleId: userRole.id,
    },
  })
  console.log('   ✅ user → USER role')

  // ─── Summary ─────────────────────────────────────────────────
  console.log('\n✨ Auth seed complete!')
  console.log('   Permissions: ' + ALL_PERMISSIONS.length)
  console.log('   Roles: 3 (ADMIN, USER, DATA_EXPORTER)')
  console.log('   Accounts: admin, user')

  if (!isProd) {
    console.log('\n📋 开发环境默认密码:')
    console.log(`   admin: ${DEV_DEFAULT_ADMIN_PASSWORD}`)
    console.log(`   user:  ${DEV_DEFAULT_USER_PASSWORD}`)
  }
}

function getPermissionDescription(key: string): string {
  const descriptions: Record<string, string> = {
    'schedule:view': '查看课表',
    'schedule:adjust': '调课',
    'schedule:write': '写入课表时段',
    'data:read': '读取数据',
    'data:write': '写入数据',
    'data:delete': '删除数据',
    'data:export': '导出数据',
    'import:manage': '管理导入',
    'settings:manage': '管理系统设置',
    'users:manage': '管理用户',
    'diagnostics:view': '查看诊断',
    'teaching-task:write': '写入教学任务',
  }
  return descriptions[key] ?? key
}

main()
  .catch((e) => {
    console.error('❌ Auth seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
