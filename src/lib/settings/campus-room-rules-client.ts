/**
 * K26-L1 / K37-A: Campus room rules settings UI client helper.
 * Read-only fetch wrapper for campus-room-rules API.
 * K37-A: Added editability, automotive keywords, detection source fields.
 */

export interface CampusRoomRulesSummary {
  totalRooms: number
  linxiaoRooms: number
  nonLinxiaoRooms: number
  missingCapacityRooms: number
  missingTypeRooms: number
  hc5ViolationCount: number
  hc6ViolationCount: number
}

export interface CampusRoomRulesEditability {
  linxiaoEditable: boolean
  reason: string
  detectionMethod: string
  detectionFallback: string
}

export interface AutomotiveClassificationEntry {
  key: string
  label: string
  hc6Exempt: boolean
}

export interface CampusRoomRulesData {
  summary: CampusRoomRulesSummary
  rules: {
    nonAutomotiveForbidLinxiao: { enabled: boolean; severity: string; editable: boolean; description: string }
    automotivePreferLinxiao: { enabled: boolean; severity: string; editable: boolean; description: string }
  }
  editability: CampusRoomRulesEditability
  automotiveKeywords: string[]
  automotiveClassification: {
    primarySignal: string
    auxiliarySignal: string
    classifications: AutomotiveClassificationEntry[]
  }
  rooms: Array<{
    id: number
    name: string
    capacity: number | null
    type: string | null
    building: string | null
    isLinxiao: boolean
    linxiaoSource: string | null
  }>
  violations: Array<{
    type: 'HC5_ROOM_UNAVAILABLE' | 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO'
    slotId: number
    courseName: string
    roomName: string | null
    reason: string
    dayOfWeek?: number
    slotIndex?: number
    source?: string
  }>
}

export async function fetchCampusRoomRules(): Promise<CampusRoomRulesData> {
  const res = await fetch('/api/admin/settings/campus-room-rules')
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const data = await res.json()
  if (!data.success) {
    throw new Error(data.message || data.error || '请求失败')
  }
  return data as CampusRoomRulesData
}
