/**
 * src/types/worktime.ts
 *
 * K26-G: WorkTime API types and DTOs.
 */

// ── Input types ──

export interface TimeSlotDefinitionInput {
  slotIndex: number
  label: string
  startsAt?: string | null
  endsAt?: string | null
  isActive?: boolean
  isTeachingSlot?: boolean
  isLegacyDisplay?: boolean
  sortOrder?: number
}

export interface CreateWorkTimeConfigInput {
  semesterId: number
  name: string
  isDefault?: boolean
  allowWeekend?: boolean
  lunchStart?: string | null
  lunchEnd?: string | null
  isActive?: boolean
  effectiveFrom?: string | null
  notes?: string | null
  slots: TimeSlotDefinitionInput[]
}

export interface UpdateWorkTimeConfigInput {
  name?: string
  isDefault?: boolean
  allowWeekend?: boolean
  lunchStart?: string | null
  lunchEnd?: string | null
  isActive?: boolean
  effectiveFrom?: string | null
  notes?: string | null
  slots?: TimeSlotDefinitionInput[]
}

// ── DTO types ──

export interface TimeSlotDefinitionDTO {
  id: number
  slotIndex: number
  label: string
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  isTeachingSlot: boolean
  isLegacyDisplay: boolean
  sortOrder: number
}

export interface WorkTimeConfigDTO {
  id: number
  semesterId: number
  semesterName?: string
  name: string
  isDefault: boolean
  allowWeekend: boolean
  lunchStart: string | null
  lunchEnd: string | null
  isActive: boolean
  version: number
  effectiveFrom: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  slots?: TimeSlotDefinitionDTO[]
}

export interface ResolvedWorkTimeConfig {
  semesterId: number
  source: 'database' | 'staticFallback'
  config: WorkTimeConfigDTO
}

// ── Error codes ──

export type WorkTimeErrorCode =
  | 'INVALID_REQUEST'
  | 'SEMESTER_NOT_FOUND'
  | 'WORKTIME_CONFIG_NOT_FOUND'
  | 'WORKTIME_CONFIG_NAME_EXISTS'
  | 'WORKTIME_CONFIG_DEFAULT_IN_USE'
  | 'WORKTIME_CONFIG_LAST_ACTIVE'
  | 'WORKTIME_CONFIG_USED_BY_RUN'
  | 'INVALID_SLOT_DEFINITION'
  | 'INVALID_TIME_FORMAT'

export interface WorkTimeError {
  error: WorkTimeErrorCode
  message: string
  details?: unknown
}
