// src/lib/auth/permissions.ts
// Permission check helpers

import type { AuthUser, PermissionKey } from './types'

// ─── Permission Checks ──────────────────────────────────────────

export function hasPermission(
  user: AuthUser | null,
  permission: PermissionKey
): boolean {
  if (!user) return false
  return user.permissions.has(permission)
}

export function hasAnyPermission(
  user: AuthUser | null,
  permissions: PermissionKey[]
): boolean {
  if (!user) return false
  return permissions.some((p) => user.permissions.has(p))
}

export function hasAllPermissions(
  user: AuthUser | null,
  permissions: PermissionKey[]
): boolean {
  if (!user) return false
  return permissions.every((p) => user.permissions.has(p))
}

export function hasRole(
  user: AuthUser | null,
  roleName: string
): boolean {
  if (!user) return false
  return user.roles.includes(roleName)
}
