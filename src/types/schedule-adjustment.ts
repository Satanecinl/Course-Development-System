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
  semesterId?: number | null
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

/** WorkTime error codes used in WORKTIME_TARGET_BLOCKED conflicts. */
export type WorkTimeTargetErrorCode =
  | 'WORKTIME_SLOT_DISABLED'
  | 'WORKTIME_SLOT_LEGACY_ONLY'
  | 'WORKTIME_WEEKEND_DISABLED'
  | 'WORKTIME_DAY_DISABLED'

export interface ScheduleAdjustmentConflict {
  type: 'TEACHER_CONFLICT' | 'CLASS_CONFLICT' | 'ROOM_CONFLICT' | 'CAPACITY_CONFLICT' | 'INVALID_WEEK' | 'INVALID_SLOT' | 'INVALID_ROOM' | 'WORKTIME_TARGET_BLOCKED'
  message: string
  severity: 'error' | 'warning'
  relatedSlotIds?: number[]
  /** K26-I2: WorkTime error code when type is WORKTIME_TARGET_BLOCKED. */
  workTimeErrorCode?: WorkTimeTargetErrorCode
  /** K26-I2: Additional details for WorkTime violations. */
  workTimeDetails?: Record<string, unknown>
}

export interface ScheduleAdjustmentDryRunResult {
  canApply: boolean
  conflicts: ScheduleAdjustmentConflict[]
  warnings: ScheduleAdjustmentConflict[]
}
