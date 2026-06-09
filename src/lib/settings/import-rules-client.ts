/**
 * K26-N1: Import rules settings UI client helper.
 */

export interface ImportRulesData {
  summary: {
    importBatchCount: number
    confirmedImportCount: number
    failedImportCount: number
    rolledBackImportCount: number
    recentImportBatchCount: number
    teachingTaskClassWithEvidenceCount: number
    teachingTaskClassWithoutEvidenceCount: number
    tcsWithKeyword: number
    tcsWithClassName: number
    tcsWithStrategy: number
  }
  rules: Array<{
    key: string
    label: string
    value: string | boolean | number | null
    status: 'active' | 'fixed' | 'planned' | 'partial' | 'unknown'
    editable: boolean
    source: string
    description: string
  }>
  safeguards: Array<{
    key: string
    label: string
    enabled: boolean
    severity: 'hard' | 'warning' | 'info'
    description: string
  }>
  recentBatches: Array<{
    id: number
    filename: string | null
    status: string | null
    semesterId: number | null
    createdAt: string | null
    confirmedAt: string | null
    rolledBackAt: string | null
    recordCount: number | null
    createdTaskCount: number | null
    createdSlotCount: number | null
    errorMessage: string | null
    warningCount: number
  }>
}

export async function fetchImportRules(): Promise<ImportRulesData> {
  const res = await fetch('/api/admin/settings/import-rules')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || data.error || '请求失败')
  return data as ImportRulesData
}
