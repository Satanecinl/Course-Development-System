export interface ImportClassInfo {
  class_name: string
  advisor_name: string | null
  advisor_phone: string | null
  student_count: number | null
  student_count_raw: string | null
}

export interface ImportScheduleRecord {
  class_info: ImportClassInfo
  teacher: string | null
  course: string | null
  room: string | null
  day_of_week: number
  time_slot: string
  period_start: number
  period_end: number
  week_constraints: string | null
  week_start: number
  week_end: number
  week_type: string
  remark: string | null
  student_count: number | null
  student_count_raw: string | null
}

export interface ImportParseStats {
  class_count: number
  total_records: number
  teacher_count: number
  room_count: number
  total_nonempty_cells?: number
  multi_split_cells?: number
}

export interface ImportParseWarning {
  type: string
  message: string
  recordIndex?: number
  className?: string
  courseName?: string
  teacher?: string
  room?: string
  rawText?: string
}

export interface ImportParseQuality {
  totalRecords: number
  recordsWithStudentCount: number
  recordsMissingStudentCount: number
  recordsMissingTeacher: number
  recordsMissingRoom: number
  recordsMissingCourse: number
  recordsWithWeekConstraints: number
  recordsWithOddEvenWeek: number
  recordsWithHalfSemester: number
  recordsWithMergedClassRemark: number
  duplicateCandidateCount: number
  warnings: ImportParseWarning[]
}

export interface ImportParseResult {
  success: true
  batchId?: number
  semesterId?: number
  filename?: string
  teacherWhitelistApplied: boolean
  stats: ImportParseStats
  quality: ImportParseQuality
  records: ImportScheduleRecord[]
}

export interface ImportParseError {
  success: false
  error: string
  details?: string
}

export type ImportParseResponse = ImportParseResult | ImportParseError

// ── Confirm types ──

export interface ImportConfirmDryRunPlan {
  batchId: number
  canImport: boolean
  blockingReasons: string[]
  warnings: string[]
  recordCount: number
  eventGroupCount: number
  teachingTaskGroupCount: number
  scheduleSlotGroupCount: number
  plannedClassGroups: { createCount: number; updateStudentCountCount: number }
  plannedTeachers: { createCount: number; missingCount: number }
  plannedCourses: { createCount: number }
  plannedRooms: { createCount: number; missingCount: number }
  plannedTeachingTasks: { createCount: number }
  plannedScheduleSlots: { createCount: number }
}

export interface ImportConfirmSuccessResult {
  classGroups: { created: number; updatedStudentCount: number; conflictCount: number }
  teachers: { created: number; missing: number }
  courses: { created: number }
  rooms: { created: number; missing: number }
  teachingTasks: { created: number; reused: number }
  teachingTaskClasses: { created: number }
  scheduleSlots: { created: number; reused: number; missingRoom: number }
}

export interface ImportConfirmDryRunResponse {
  success: true
  dryRun: true
  plan: ImportConfirmDryRunPlan
}

export interface ImportConfirmRealResponse {
  success: true
  dryRun: false
  result: ImportConfirmSuccessResult
}

export interface ImportConfirmErrorResponse {
  success: false
  error: string
  details?: string
}

export type ImportConfirmResponse = ImportConfirmDryRunResponse | ImportConfirmRealResponse | ImportConfirmErrorResponse

// ── Import Batch List / Detail types ──

export interface ImportBatchListItem {
  id: number
  filename: string
  status: string
  recordCount: number
  createdTaskCount: number | null
  createdSlotCount: number | null
  createdAt: string
  confirmedAt: string | null
  rolledBackAt: string | null
  semesterId: number | null
}

export interface ImportBatchDetail extends ImportBatchListItem {
  strategy: string | null
  errorMessage: string | null
  stats: ImportParseStats | null
  quality: ImportParseQuality | null
  warnings: string[]
  actualCreatedTaskCount: number
  actualCreatedSlotCount: number
  actualTeachingTaskClassCount: number
  nullTeacherTaskCount: number
  nullRoomSlotCount: number
  hasPlaceholderTeachers: boolean
  hasPlaceholderRooms: boolean
  hasOrphanSlots: boolean
  metadataMatch: boolean
  rollbackComplete: boolean
}

export interface ImportBatchListResponse {
  success: true
  batches: ImportBatchListItem[]
  semesterId?: number
}

export interface ImportBatchDetailResponse {
  success: true
  batch: ImportBatchDetail
}

// ── Rollback types ──

export interface ImportRollbackPlan {
  batchId: number
  batchStatus: string
  canRollback: boolean
  blockingReasons: string[]
  warnings: string[]
  scheduleSlotsToDelete: number
  teachingTaskClassesToDelete: number
  teachingTasksToDelete: number
  retainedClassGroups: number
  retainedTeachers: number
  retainedCourses: number
  retainedRooms: number
  importedTaskCount: number
  importedSlotCount: number
  externalSlotsForImportedTasks: number
  hasPlaceholderTeachers: boolean
  hasPlaceholderRooms: boolean
  hasOrphanSlots: boolean
}

export interface ImportRollbackDryRunResponse {
  success: true
  dryRun: true
  plan: ImportRollbackPlan
}

export interface ImportRollbackResult {
  batchId: number
  rolledBack: boolean
  deletedScheduleSlots: number
  deletedTeachingTaskClasses: number
  deletedTeachingTasks: number
  retainedClassGroups: number
  retainedTeachers: number
  retainedCourses: number
  retainedRooms: number
  warnings: string[]
}

export interface ImportRollbackRealResponse {
  success: true
  dryRun: false
  result: ImportRollbackResult
}

export interface ImportRollbackErrorResponse {
  success: false
  error: string
  details?: string
}

export type ImportRollbackResponse = ImportRollbackDryRunResponse | ImportRollbackRealResponse | ImportRollbackErrorResponse

// ── Abandon types ──

export interface ImportAbandonSuccessResponse {
  success: true
  batchId: number
  status: 'abandoned'
}

export interface ImportAbandonErrorResponse {
  success: false
  error: string
}

export type ImportAbandonResponse = ImportAbandonSuccessResponse | ImportAbandonErrorResponse
