/**
 * K26-P1: Data Maintenance & Backup settings UI client helper.
 *
 * Typed fetch wrapper for `GET /api/admin/settings/data-maintenance`.
 */

export interface DataMaintenanceSummary {
  databaseType: string
  databaseFile: string
  migrationFileCount: number
  knownBackupFilesCount: number
  knownDataCheckCount: number
  destructiveActionsEnabled: false
  dbTrackedByGit: boolean | null
  backupTrackedByGit: boolean | null
  permission: string
  readOnly: true
}

export type SectionStatus = 'available' | 'manual' | 'planned' | 'disabled' | 'unknown'
export type SectionRisk = 'low' | 'medium' | 'high'
export type SafeguardSeverity = 'hard' | 'warning' | 'info'

export interface DataMaintenanceSection {
  key: string
  label: string
  status: SectionStatus
  risk: SectionRisk
  editable: false
  description: string
  facts: string[]
  commands: string[]
}

export interface DataMaintenanceSafeguard {
  key: string
  label: string
  enabled: boolean
  severity: SafeguardSeverity
  description: string
}

export interface DataMaintenanceKnownCheck {
  key: string
  label: string
  command: string
  lastKnownStatus: string
  description: string
}

export interface DataMaintenanceData {
  success: true
  source: string
  summary: DataMaintenanceSummary
  sections: DataMaintenanceSection[]
  safeguards: DataMaintenanceSafeguard[]
  knownChecks: DataMaintenanceKnownCheck[]
  safetyRules: string[]
  destructiveActionsEnabled: false
}

export async function fetchDataMaintenance(): Promise<DataMaintenanceData> {
  const res = await fetch('/api/admin/settings/data-maintenance')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || data.error || '请求失败')
  return data as DataMaintenanceData
}

export function getDataMaintenanceErrorMessage(code: string): string {
  switch (code) {
    case 'UNAUTHENTICATED':
      return '请先登录后再访问数据维护与备份设置'
    case 'FORBIDDEN':
      return '当前账号没有权限查看数据维护与备份设置 (需要 settings:manage)'
    default:
      return `加载失败: ${code}`
  }
}
