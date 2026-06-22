// src/lib/auth/navigation.ts
// Navigation config — permission-first with small role-based visibility rules.

import type { PermissionKey } from './types'

export interface NavItem {
  label: string
  href: string
  permission: PermissionKey
  icon?: string
  hidden?: boolean
  hiddenForRoles?: string[]
}

/**
 * Main navigation items.
 * Each item requires a specific permission to be visible.
 * Some user-only/read-only legacy entries are hidden from admin navigation.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: '排课展示',
    href: '/dashboard',
    permission: 'schedule:view',
    icon: 'layout-dashboard',
  },
  {
    label: '我的调课申请',
    href: '/my-adjustment-requests',
    permission: 'adjustment-request:read',
    icon: 'scroll-text',
    hiddenForRoles: ['ADMIN'],
  },
  {
    label: '数据管理',
    href: '/data',
    permission: 'data:read',
    icon: 'database',
    hidden: true,
  },
  {
    label: '调课审批',
    href: '/admin/adjustment-requests',
    permission: 'adjustment-request:review',
    icon: 'check-circle',
  },
  {
    label: '自动排课',
    href: '/admin/scheduler',
    permission: 'schedule:adjust',
    icon: 'sparkles',
  },
  {
    label: '教室容量',
    href: '/admin/rooms/capacity',
    permission: 'schedule:adjust',
    icon: 'door-open',
  },
  {
    label: '导入管理',
    href: '/admin/import',
    permission: 'import:manage',
    icon: 'upload',
  },
  {
    label: '数据库管理',
    href: '/admin/db',
    permission: 'data:write',
    icon: 'table',
  },
  {
    label: '用户管理',
    href: '/admin/users',
    permission: 'users:manage',
    icon: 'users',
  },
  {
    label: '系统设置',
    href: '/admin/settings',
    permission: 'settings:manage',
    icon: 'settings',
  },
  {
    label: '诊断工具',
    href: '/admin/diagnostics',
    permission: 'diagnostics:view',
    icon: 'activity',
  },
]

/**
 * Filter nav items by user permissions.
 * Returns only items where the user has the required permission.
 */
export function filterNavItems(
  userPermissions: Set<string> | string[],
  userRoles: string[] = [],
): NavItem[] {
  const perms =
    userPermissions instanceof Set
      ? userPermissions
      : new Set(userPermissions)
  const roles = new Set(userRoles.map((role) => role.toUpperCase()))
  return NAV_ITEMS.filter((item) => {
    if (item.hidden) return false
    if (item.hiddenForRoles?.some((role) => roles.has(role.toUpperCase()))) {
      return false
    }
    return perms.has(item.permission)
  })
}
