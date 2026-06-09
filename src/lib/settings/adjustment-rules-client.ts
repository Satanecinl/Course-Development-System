/**
 * K26-M1: Adjustment rules settings UI client helper.
 * Read-only fetch wrapper.
 */

export interface AdjustmentRulesData {
  summary: {
    crossWeekAdjustmentSupported: boolean
    weekendAdjustmentControlledByWorkTime: boolean
    workTimeIntegrated: boolean
    recommendationIntegrated: boolean
    dryRunGuardIntegrated: boolean
    applyGuardIntegrated: boolean
    roomRecommendationIntegrated: boolean
    totalAdjustments: number
    activeAdjustments: number
    workTimeSource: string
    allowWeekend: boolean
    activeSlotIndexes: number[]
    legacySlotIndexes: number[]
  }
  rules: Array<{
    key: string
    label: string
    value: string | boolean | number | null
    status: 'active' | 'fixed' | 'planned' | 'unknown'
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
}

export async function fetchAdjustmentRules(): Promise<AdjustmentRulesData> {
  const res = await fetch('/api/admin/settings/adjustment-rules')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || data.error || '请求失败')
  return data as AdjustmentRulesData
}
