/**
 * K26-M1 / K38-A: Adjustment rules settings UI client helper.
 * K38-A: Added groups, editability, workTimeContext, defaultRecommendationLimit.
 * Read-only — no PATCH in this stage.
 */

export interface AdjustmentRule {
  key: string
  group: string
  label: string
  value: string | boolean | number | null
  status: 'active' | 'fixed' | 'planned' | 'unknown'
  editable: boolean
  source: string
  description: string
}

export interface AdjustmentRulesData {
  moduleVersion?: string
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
    workTimeConfigName?: string | null
    allowWeekend: boolean
    activeSlotIndexes: number[]
    legacySlotIndexes: number[]
    activeSlotCount?: number
  }
  workTimeContext?: {
    source: string
    configName: string | null
    allowWeekend: boolean
    activeSlotIndexes: number[]
    legacySlotIndexes: number[]
    weekendBehavior: string
  }
  groups?: Record<string, { label: string; description: string }>
  rules: Record<string, AdjustmentRule[]> | Array<AdjustmentRule>
  safeguards: Array<{
    key: string
    label: string
    enabled: boolean
    severity: 'hard' | 'warning' | 'info'
    description: string
  }>
  editability?: {
    allRulesEditable: boolean
    defaultRecommendationLimitEditable: boolean
    allowWeekendEditableInThisPage: boolean
    dryRunGuardClosable: boolean
    applyGuardClosable: boolean
    note: string
  }
  defaultRecommendationLimit?: {
    current: number
    min: number
    max: number
    editable: boolean
    source: string
    note: string
  }
}

export async function fetchAdjustmentRules(): Promise<AdjustmentRulesData> {
  const res = await fetch('/api/admin/settings/adjustment-rules')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || data.error || '请求失败')
  return data as AdjustmentRulesData
}
