export type ScheduleAdjustmentType = 'MOVE' | 'CANCEL'
export type ScheduleAdjustmentStatus = 'ACTIVE' | 'VOID'

export interface ScheduleAdjustmentInput {
  type: ScheduleAdjustmentType
  week: number
  targetWeek?: number | null
  originalSlotId: number
  newDayOfWeek?: number | null
  newSlotIndex?: number | null
  newRoomId?: number | null
  reason?: string | null
}

export interface ScheduleAdjustmentInfo {
  id: number
  type: ScheduleAdjustmentType
  sourceWeek: number
  targetWeek: number
  originalSlotId: number
  newDayOfWeek?: number | null
  newSlotIndex?: number | null
  newRoomId?: number | null
  newRoomName?: string | null
  reason?: string | null
  status: ScheduleAdjustmentStatus
  createdAt: string
}

export interface ScheduleAdjustmentConflict {
  type: 'TEACHER_CONFLICT' | 'CLASS_CONFLICT' | 'ROOM_CONFLICT' | 'CAPACITY_CONFLICT' | 'INVALID_WEEK' | 'INVALID_SLOT' | 'INVALID_ROOM'
  message: string
  severity: 'error' | 'warning'
  relatedSlotIds?: number[]
}

export interface ScheduleAdjustmentDryRunResult {
  canApply: boolean
  conflicts: ScheduleAdjustmentConflict[]
  warnings: ScheduleAdjustmentConflict[]
}
