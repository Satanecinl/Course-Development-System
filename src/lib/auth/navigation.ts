// src/lib/auth/navigation.ts
// Navigation config — permission-based, not role-based

import type { PermissionKey } from './types'

export interface NavItem {
  label: string
  href: string
  permission: PermissionKey
  icon?: string
}

/**
 * Main navigation items.
 * Each item requires a specific permission to be visible.
 * Admin (all permissions) sees everything; USER (data:read only) sees only "数据管理".
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: '排课展示',
    href: '/dashboard',
    permission: 'schedule:view',
    icon: 'layout-dashboard',
  },
  {
    label: '数据管理',
    href: '/data',
    permission: 'data:read',
    icon: 'database',
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
  userPermissions: Set<string> | string[]
): NavItem[] {
  const perms =
    userPermissions instanceof Set
      ? userPermissions
      : new Set(userPermissions)
  return NAV_ITEMS.filter((item) => perms.has(item.permission))
}
