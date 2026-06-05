// src/types/scheduling-config.ts
// K21-FIX-G-SOLVER-CONFIG-UI
//
// Frontend type definitions for SchedulingConfig CRUD + resultSnapshot.config
// Matches the wire format produced by:
//   - GET /api/admin/scheduler/configs
//   - POST /api/admin/scheduler/configs
//   - GET /api/admin/scheduler/configs/[id]
//   - PUT /api/admin/scheduler/configs/[id]
//   - DELETE /api/admin/scheduler/configs/[id]
//
// Companion to src/lib/scheduler/config.ts (server-side).

export type SolverConfigSource = 'CONFIG' | 'INLINE' | 'DEFAULT' | 'MIXED'

/** Wire format for a SchedulingConfig row. */
export interface SchedulingConfig {
  id: number
  name: string
  semesterId: number | null
  maxIterations: number
  lahcWindowSize: number
  randomSeed: number | null
  solverVersion: string | null
  lockedSlotIds: number[]
  lockedTaskIds: string // JSON string array, @deprecated
  createdAt: string // ISO
  updatedAt: string // ISO
}

/** Resolved config embedded inside SchedulingRun.resultSnapshot.config. */
export interface ResolvedConfigSnapshot {
  configId: number | null
  name: string | null
  maxIterations: number
  lahcWindowSize: number
  randomSeed: number | null
  lockedSlotIds: number[]
  solverVersion: string
  source: SolverConfigSource
  snapshotTakenAt: string // ISO
}

/** Payload for POST /api/admin/scheduler/configs */
export interface CreateSchedulingConfigInput {
  name: string
  semesterId?: number | null
  maxIterations?: number
  lahcWindowSize?: number
  randomSeed?: number | null
  solverVersion?: string | null
  lockedSlotIds?: number[]
}

/** Payload for PUT /api/admin/scheduler/configs/[id] (all fields optional) */
export interface UpdateSchedulingConfigInput {
  name?: string
  semesterId?: number | null
  maxIterations?: number
  lahcWindowSize?: number
  randomSeed?: number | null
  solverVersion?: string | null
  lockedSlotIds?: number[]
}

/** Overrides field on a preview request. */
export interface PreviewOverrides {
  maxIterations?: number
  lahcWindowSize?: number
  randomSeed?: number | null
  lockedSlotIds?: number[]
}

/** Standard API error envelope. */
export interface SchedulingConfigError {
  success: false
  error:
    | 'INVALID_NAME'
    | 'INVALID_SEMESTER_ID'
    | 'INVALID_MAX_ITERATIONS'
    | 'INVALID_LAHC_WINDOW_SIZE'
    | 'INVALID_RANDOM_SEED'
    | 'INVALID_SOLVER_VERSION'
    | 'INVALID_LOCKED_SLOT_IDS'
    | 'INVALID_CONFIG_ID'
    | 'INVALID_OVERRIDE'
    | 'INVALID_SLOT_IDS'
    | 'LOCKED_SLOT_SEMESTER_MISMATCH'
    | 'TOO_MANY_LOCKED_SLOTS'
    | 'SEMESTER_NOT_FOUND'
    | 'SEMESTER_MISMATCH'
    | 'SCHEDULING_CONFIG_NOT_FOUND'
    | 'CONFIG_IN_USE'
    | 'PREVIEW_FAILED'
    | 'APPLY_FAILED'
    | 'ROLLBACK_FAILED'
    | 'FETCH_FAILED'
    | 'CREATE_FAILED'
    | 'UPDATE_FAILED'
    | 'DELETE_FAILED'
    | 'FORBIDDEN'
    | 'UNAUTHENTICATED'
  message: string
  runIds?: number[]
  invalidIds?: number[]
  mismatchedIds?: number[]
}

/** List endpoint response. */
export interface SchedulingConfigListResponse {
  success: true
  configs: SchedulingConfig[]
  total: number
}

/** Single endpoint response. */
export interface SchedulingConfigSingleResponse {
  success: true
  config: SchedulingConfig
}

/** Delete success response. */
export interface SchedulingConfigDeleteResponse {
  success: true
  deleted: true
  id: number
}

/** Frontend-friendly translation of a SchedulingConfigError. */
export interface FriendlyError {
  code: string
  userMessage: string
  /** Optional structured details from the API. */
  details?: {
    runIds?: number[]
    invalidIds?: number[]
    mismatchedIds?: number[]
  }
}
