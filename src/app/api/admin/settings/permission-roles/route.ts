/**
 * K26-O1: Permission & Role settings — read-only API.
 *
 * GET /api/admin/settings/permission-roles
 *
 * Returns a read-only snapshot of the current RBAC configuration:
 *   - summary            (counts and key role bindings)
 *   - roles              (DB roles with permission + user counts)
 *   - permissions        (all known permissions, with category and critical flag)
 *   - rolePermissionMatrix (effective role → permission list, derived from DB)
 *   - userRoleOverview   (active users, their roles, no sensitive fields)
 *   - keyPermissionStatus (which roles currently hold each key permission)
 *
 * Read-only. No writes to the database. No schema/seed changes.
 * Permission: `settings:manage` (reused from existing system settings APIs).
 *
 * Source-of-truth notes:
 *   - Role / Permission / UserRole / RolePermission rows come from Prisma DB.
 *   - ALL_PERMISSIONS, ROLES, descriptions come from src/lib/auth (code constants).
 *   - Role → permission matrix in the seed is documented; the API merges
 *     code-constant role definitions with DB counts so the read model always
 *     reflects the live DB (counts) plus the canonical role key/name set.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'
import { ALL_PERMISSIONS, ROLES } from '@/lib/auth/types'

// ─── Permission metadata (sourced from seed-auth.ts descriptions) ──────

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
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

const PERMISSION_CATEGORIES: Record<string, string> = {
  'schedule:view': '课表',
  'schedule:adjust': '调课',
  'schedule:write': '课表',
  'data:read': '数据',
  'data:write': '数据',
  'data:delete': '数据',
  'data:export': '数据',
  'import:manage': '导入',
  'settings:manage': '系统设置',
  'users:manage': '用户',
  'diagnostics:view': '诊断',
  'teaching-task:write': '教学任务',
}

const CRITICAL_PERMISSION_KEYS = new Set<string>([
  'schedule:adjust',
  'schedule:write',
  'import:manage',
  'settings:manage',
  'users:manage',
  'data:write',
  'data:delete',
  'teaching-task:write',
])

// ─── Role metadata (sourced from seed-auth.ts descriptions) ────────────

const ROLE_METADATA: Record<
  string,
  { description: string; builtIn: boolean; source: string }
> = {
  [ROLES.ADMIN]: {
    description: '系统管理员，拥有全部权限',
    builtIn: true,
    source: 'seed-auth.ts — 绑定全部 12 个权限',
  },
  [ROLES.USER]: {
    description: '普通用户，仅查看数据',
    builtIn: true,
    source: 'seed-auth.ts — 绑定 data:read',
  },
  [ROLES.DATA_EXPORTER]: {
    description: '数据导出员，可查看和导出数据',
    builtIn: true,
    source: 'seed-auth.ts — 绑定 data:read + data:export',
  },
}

// ─── Key permission status definitions ─────────────────────────────────

const KEY_PERMISSIONS: Array<{ key: string; label: string; description: string }> = [
  { key: 'schedule:adjust', label: '调课', description: '允许执行课表调整 (含 dry-run / apply / plan / room rec)' },
  { key: 'import:manage', label: '导入管理', description: '允许执行 .docx 解析、import batch 创建与确认' },
  { key: 'schedule:write', label: '课表写入', description: '允许直接写入 ScheduleSlot 记录 (经 admin/db 路径)' },
  { key: 'settings:manage', label: '系统设置', description: '允许访问 /admin/settings 与所有 settings-only API' },
  { key: 'users:manage', label: '用户管理', description: '允许访问 /admin/users 与用户/角色 CRUD' },
]

// ─── Handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  try {
    // ── 1. Roles from DB ──
    const dbRoles = await prisma.role.findMany({
      include: {
        _count: { select: { userRoles: true, rolePermissions: true } },
      },
      orderBy: { id: 'asc' },
    })

    // ── 2. Permissions from DB (full join) ──
    const dbPermissions = await prisma.permission.findMany({
      orderBy: { id: 'asc' },
    })

    // Build permission-id → key map (DB-side) and key → id (DB-side)
    const dbPermissionById = new Map<number, string>()
    for (const p of dbPermissions) dbPermissionById.set(p.id, p.key)
    const dbPermissionIdByKey = new Map<string, number>()
    for (const p of dbPermissions) dbPermissionIdByKey.set(p.key, p.id)

    // ── 3. Role → permission matrix from DB ──
    const rolePermissionRows = await prisma.rolePermission.findMany({
      select: { roleId: true, permissionId: true },
    })
    const matrixByRoleId = new Map<number, string[]>()
    for (const row of rolePermissionRows) {
      const key = dbPermissionById.get(row.permissionId)
      if (!key) continue
      const list = matrixByRoleId.get(row.roleId) ?? []
      list.push(key)
      matrixByRoleId.set(row.roleId, list)
    }

    // ── 4. User → role binding overview ──
    const userRoleRows = await prisma.userRole.findMany({
      include: {
        user: { select: { id: true, username: true, displayName: true, isActive: true } },
        role: { select: { name: true } },
      },
    })

    // Group bindings by user
    const userMap = new Map<
      number,
      { id: number; username: string; displayName: string; isActive: boolean; roles: string[] }
    >()
    for (const ur of userRoleRows) {
      const existing = userMap.get(ur.user.id)
      if (existing) {
        existing.roles.push(ur.role.name)
      } else {
        userMap.set(ur.user.id, {
          id: ur.user.id,
          username: ur.user.username,
          displayName: ur.user.displayName,
          isActive: ur.user.isActive,
          roles: [ur.role.name],
        })
      }
    }

    // Also pull any users that have NO role bindings (so the overview is complete)
    const allUsers = await prisma.user.findMany({
      select: { id: true, username: true, displayName: true, isActive: true },
    })
    for (const u of allUsers) {
      if (!userMap.has(u.id)) {
        userMap.set(u.id, {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          isActive: u.isActive,
          roles: [],
        })
      }
    }

    const userRoleOverview = Array.from(userMap.values())
      .map((u) => ({
        id: u.id,
        name: u.displayName,
        username: u.username,
        email: null, // No email field on User model — explicit null for type safety
        isActive: u.isActive,
        roles: u.roles,
      }))
      .sort((a, b) => a.id - b.id)

    // ── 5. Compose roles list (DB-backed, with code-constant metadata) ──
    const roles = dbRoles.map((r) => {
      const meta = ROLE_METADATA[r.name] ?? {
        description: r.description ?? '',
        builtIn: true,
        source: '数据库 Role 表 (无代码常量描述)',
      }
      return {
        key: r.name,
        name: r.name,
        description: r.description ?? meta.description,
        builtIn: meta.builtIn,
        source: meta.source,
        permissionCount: r._count.rolePermissions,
        userCount: r._count.userRoles,
      }
    })

    // ── 6. Compose permissions list (ALL_PERMISSIONS as the canonical set,
    //       cross-referenced with DB rows for the description/id). ──
    const permissions = ALL_PERMISSIONS.map((key) => {
      const dbPerm = dbPermissions.find((p) => p.key === key)
      return {
        key,
        name: key,
        description:
          dbPerm?.description ?? PERMISSION_DESCRIPTIONS[key] ?? key,
        category: PERMISSION_CATEGORIES[key] ?? '其他',
        critical: CRITICAL_PERMISSION_KEYS.has(key),
        inDatabase: !!dbPerm,
      }
    })

    // ── 7. Role → permission matrix (one entry per role) ──
    const rolePermissionMatrix = dbRoles.map((r) => ({
      roleKey: r.name,
      permissions: (matrixByRoleId.get(r.id) ?? []).slice().sort(),
    }))

    // ── 8. Key permission status (which roles currently hold each key perm) ──
    const keyPermissionStatus = KEY_PERMISSIONS.map((kp) => {
      const holdingRoles = rolePermissionMatrix
        .filter((m) => m.permissions.includes(kp.key))
        .map((m) => m.roleKey)
      return {
        key: kp.key,
        label: kp.label,
        description: kp.description,
        roles: holdingRoles,
      }
    })

    // ── 9. Summary ──
    const userCount = userRoleOverview.length
    const userRoleBindingCount = userRoleRows.length
    const summary = {
      roleCount: dbRoles.length,
      permissionCount: dbPermissions.length,
      permissionKeyCount: ALL_PERMISSIONS.length,
      userCount,
      userRoleBindingCount,
      activeUserCount: userRoleOverview.filter((u) => u.isActive).length,
      systemSettingManagers: rolePermissionMatrix
        .filter((m) => m.permissions.includes('settings:manage'))
        .reduce((acc, m) => {
          const role = dbRoles.find((r) => r.name === m.roleKey)
          return acc + (role ? role._count.userRoles : 0)
        }, 0),
      scheduleManagers: rolePermissionMatrix
        .filter((m) => m.permissions.includes('schedule:adjust'))
        .reduce((acc, m) => {
          const role = dbRoles.find((r) => r.name === m.roleKey)
          return acc + (role ? role._count.userRoles : 0)
        }, 0),
      importManagers: rolePermissionMatrix
        .filter((m) => m.permissions.includes('import:manage'))
        .reduce((acc, m) => {
          const role = dbRoles.find((r) => r.name === m.roleKey)
          return acc + (role ? role._count.userRoles : 0)
        }, 0),
      adjustmentManagers: rolePermissionMatrix
        .filter((m) => m.permissions.includes('schedule:adjust'))
        .reduce((acc, m) => {
          const role = dbRoles.find((r) => r.name === m.roleKey)
          return acc + (role ? role._count.userRoles : 0)
        }, 0),
      userManagers: rolePermissionMatrix
        .filter((m) => m.permissions.includes('users:manage'))
        .reduce((acc, m) => {
          const role = dbRoles.find((r) => r.name === m.roleKey)
          return acc + (role ? role._count.userRoles : 0)
        }, 0),
    }

    return NextResponse.json({
      success: true,
      source: 'database + code-constant metadata',
      summary,
      roles,
      permissions,
      rolePermissionMatrix,
      userRoleOverview,
      keyPermissionStatus,
      readOnly: true,
      // Explicit marker: this endpoint never returns sensitive auth fields
      sensitiveFieldsExcluded: [
        'passwordHash',
        'tokenHash',
        'sessionToken',
        'expiresAt',
        'revokedAt',
        'email',
        'phone',
      ],
    })
  } catch (e) {
    console.error('[permission-roles] failed:', e)
    return NextResponse.json(
      { success: false, error: 'INTERNAL', message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    )
  }
}
