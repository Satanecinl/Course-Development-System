/**
 * K26-L1 / K37-A / K37-B / K37-C: Campus room rules settings UI client helper.
 * K37-B: Added PATCH support for updating Room.isLinxiao.
 * K37-C: Added semesterId query param to GET.
 */

export interface CampusRoomRulesSummary {
  totalRooms: number
  linxiaoRooms: number
  nonLinxiaoRooms: number
  missingCapacityRooms: number
  missingTypeRooms: number
  hc5ViolationCount: number
  hc6ViolationCount: number
  linxiaoMismatchCount?: number
}

export interface ResolvedSemester {
  id: number
  code: string
  name: string
  isActive?: boolean
}

export interface CampusRoomRulesEditability {
  linxiaoEditable: boolean
  detectionMethod: string
  legacyDetection?: string
  scope?: string
}

export interface AutomotiveClassificationEntry {
  key: string
  label: string
  hc6Exempt: boolean
}

export interface CampusRoomRulesData {
  success: boolean
  semesterScoped?: boolean
  diagnosticsScope?: 'selected-semester' | 'active-semester'
  resolvedSemester?: ResolvedSemester
  semesterWarning?: string | null
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
    nameSuggestsLinxiao?: boolean
    linxiaoMismatch?: boolean
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

export interface PatchRoomResult {
  success: boolean
  room: { id: number; name: string; isLinxiao: boolean }
  summary: { totalRooms: number; linxiaoRooms: number; hc6ViolationCount: number }
  warnings: string[]
}

/**
 * Fetch campus room rules. K37-C: optionally pass semesterId to scope
 * HC5/HC6 diagnostics. If omitted, server falls back to active semester.
 */
export async function fetchCampusRoomRules(options?: { semesterId?: number | null }): Promise<CampusRoomRulesData> {
  const params = new URLSearchParams()
  if (options?.semesterId != null) {
    params.set('semesterId', String(options.semesterId))
  }
  const url = `/api/admin/settings/campus-room-rules${params.toString() ? `?${params.toString()}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || data.error || '请求失败')
  return data as CampusRoomRulesData
}

export async function patchRoomLinxiao(roomId: number, isLinxiao: boolean): Promise<PatchRoomResult> {
  const res = await fetch(`/api/admin/settings/campus-room-rules/rooms/${roomId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isLinxiao }),
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`)
  }
  return data as PatchRoomResult
}
