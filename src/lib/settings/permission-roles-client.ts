/**
 * K26-O1: Permission & Role settings UI client helper.
 *
 * Typed fetch wrapper for `GET /api/admin/settings/permission-roles`.
 */

export interface PermissionRolesSummary {
  roleCount: number
  permissionCount: number
  permissionKeyCount: number
  userCount: number
  userRoleBindingCount: number
  activeUserCount: number
  systemSettingManagers: number
  scheduleManagers: number
  importManagers: number
  adjustmentManagers: number
  userManagers: number
}

export interface PermissionRoleRow {
  key: string
  name: string
  description: string
  builtIn: boolean
  source: string
  permissionCount: number
  userCount: number
}

export interface PermissionRow {
  key: string
  name: string
  description: string
  category: string
  critical: boolean
  inDatabase: boolean
}

export interface RolePermissionMatrixRow {
  roleKey: string
  permissions: string[]
}

export interface UserRoleOverviewRow {
  id: number
  name: string | null
  username: string
  email: string | null
  isActive: boolean
  roles: string[]
}

export interface KeyPermissionStatusRow {
  key: string
  label: string
  description: string
  roles: string[]
}

export interface PermissionRolesData {
  success: true
  source: string
  summary: PermissionRolesSummary
  roles: PermissionRoleRow[]
  permissions: PermissionRow[]
  rolePermissionMatrix: RolePermissionMatrixRow[]
  userRoleOverview: UserRoleOverviewRow[]
  keyPermissionStatus: KeyPermissionStatusRow[]
  readOnly: true
  sensitiveFieldsExcluded: string[]
}

export async function fetchPermissionRoles(): Promise<PermissionRolesData> {
  const res = await fetch('/api/admin/settings/permission-roles')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || data.error || '请求失败')
  return data as PermissionRolesData
}

export function getPermissionRoleErrorMessage(code: string): string {
  switch (code) {
    case 'UNAUTHENTICATED':
      return '请先登录后再访问权限与角色设置'
    case 'FORBIDDEN':
      return '当前账号没有权限查看权限与角色设置 (需要 settings:manage)'
    default:
      return `加载失败: ${code}`
  }
}
