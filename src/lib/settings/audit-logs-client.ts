/**
 * K26-Q1: Audit Log settings UI client helper.
 *
 * Typed fetch wrapper for `GET /api/admin/settings/audit-logs`.
 */

export interface AuditLogSummary {
  unifiedAuditLogSchemaExists: boolean
  auditSourcesCount: number
  coveredOperationCount: number
  plannedOperationCount: number
  partialOperationCount: number
  notCoveredOperationCount: number
  recentActivityCount: number
  readOnly: true
}

export type AuditSourceStatus = 'available' | 'partial' | 'planned' | 'none'

export interface AuditLogSource {
  key: string
  label: string
  status: AuditSourceStatus
  modelOrTable?: string
  recordCount?: number
  description: string
}

export type OperationCoverageStatus = 'covered' | 'partial' | 'planned' | 'not-covered'

export interface OperationCoverage {
  key: string
  label: string
  status: OperationCoverageStatus
  source: string
  description: string
}

export interface RecentActivityItem {
  id: string | number
  type: string
  label: string
  createdAt?: string | null
  actor?: string | null
  source: string
  detail: string
}

export interface AuditLogLimitation {
  key: string
  label: string
  description: string
}

export interface AuditLogData {
  success: true
  summary: AuditLogSummary
  sources: AuditLogSource[]
  operationCoverage: OperationCoverage[]
  recentActivity: RecentActivityItem[]
  limitations: AuditLogLimitation[]
  safetyRules: string[]
  readOnly: true
}

export async function fetchAuditLogs(): Promise<AuditLogData> {
  const res = await fetch('/api/admin/settings/audit-logs')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || data.error || '请求失败')
  return data as AuditLogData
}

export function getAuditLogErrorMessage(code: string): string {
  switch (code) {
    case 'UNAUTHENTICATED':
      return '请先登录后再访问审计日志设置'
    case 'FORBIDDEN':
      return '当前账号没有权限查看审计日志设置 (需要 settings:manage)'
    default:
      return `加载失败: ${code}`
  }
}
