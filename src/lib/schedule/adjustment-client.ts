import type { ScheduleAdjustmentInput, ScheduleAdjustmentDryRunResult } from '@/types/schedule-adjustment'

// ── K23-A: room recommendation client ──

export interface RoomRecommendationCandidate {
  roomId: number
  roomName: string
  building: string | null
  capacity: number
  type: string
  score: number
  reasons: string[]
  warnings: string[]
}

export interface RoomRecommendationRejectedSummary {
  conflict: number
  capacity: number
  linxiaoPolicy: number
  unavailable: number
  other: number
}

export interface RoomRecommendationResult {
  minimumSatisfied: boolean
  candidates: RoomRecommendationCandidate[]
  rejectedSummary: RoomRecommendationRejectedSummary
  message?: string
}

export interface RoomRecommendationRequest {
  scheduleSlotId: number
  targetWeek: number
  targetDayOfWeek: number
  targetSlotIndex: number
  limit?: number
  semesterId?: number | null
}

export async function fetchRoomRecommendations(
  input: RoomRecommendationRequest,
): Promise<RoomRecommendationResult> {
  const res = await fetch('/api/schedule-adjustments/room-recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  // Strip the wrapper; the helper returns the shape directly.
  return {
    minimumSatisfied: data.minimumSatisfied,
    candidates: data.candidates ?? [],
    rejectedSummary: data.rejectedSummary ?? {
      conflict: 0, capacity: 0, linxiaoPolicy: 0, unavailable: 0, other: 0,
    },
    message: data.message,
  }
}

// ── K24-A: joint time + room plan recommendation client ──

export interface AdjustmentPlanRecommendation {
  targetWeek: number
  targetDayOfWeek: number
  targetSlotIndex: number
  roomId: number
  roomName: string
  building: string | null
  capacity: number
  score: number
  reasons: string[]
  warnings: string[]
}

export interface AdjustmentPlanRejectedSummary {
  teacherConflict: number
  classGroupConflict: number
  roomConflict: number
  capacity: number
  linxiaoPolicy: number
  weekend: number
  unavailable: number
  other: number
}

export interface AdjustmentPlanSearched {
  weeks: number[]
  days: number[]
  slotIndexes: number[]
  timeCandidateCount: number
  roomCandidateCount: number
}

export interface AdjustmentPlanRecommendationResult {
  minimumSatisfied: boolean
  plans: AdjustmentPlanRecommendation[]
  rejectedSummary: AdjustmentPlanRejectedSummary
  searched: AdjustmentPlanSearched
  message?: string
}

export interface AdjustmentPlanRecommendationRequest {
  scheduleSlotId: number
  preferredWeek?: number
  weekWindow?: number
  includeWeekend?: boolean
  limit?: number
  semesterId?: number | null
}

export async function fetchPlanRecommendations(
  input: AdjustmentPlanRecommendationRequest,
): Promise<AdjustmentPlanRecommendationResult> {
  const res = await fetch('/api/schedule-adjustments/plan-recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json()
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return {
    minimumSatisfied: data.minimumSatisfied,
    plans: data.plans ?? [],
    rejectedSummary: data.rejectedSummary ?? {
      teacherConflict: 0, classGroupConflict: 0, roomConflict: 0,
      capacity: 0, linxiaoPolicy: 0, weekend: 0, unavailable: 0, other: 0,
    },
    searched: data.searched ?? {
      weeks: [], days: [], slotIndexes: [],
      timeCandidateCount: 0, roomCandidateCount: 0,
    },
    message: data.message,
  }
}

export async function dryRunScheduleAdjustment(
  input: ScheduleAdjustmentInput,
): Promise<{ success: true; dryRun: ScheduleAdjustmentDryRunResult }> {
  const res = await fetch('/api/schedule-adjustments/dry-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export async function createScheduleAdjustment(
  input: ScheduleAdjustmentInput,
): Promise<{ success: true; adjustment: { id: number; status: string }; dryRun: ScheduleAdjustmentDryRunResult }> {
  const res = await fetch('/api/schedule-adjustments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, confirmText: 'CONFIRM_ADJUSTMENT' }),
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export async function voidScheduleAdjustment(
  id: number,
): Promise<{ success: true; id: number; status: string }> {
  const res = await fetch(`/api/schedule-adjustments/${id}/void`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmText: 'VOID_ADJUSTMENT' }),
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}
