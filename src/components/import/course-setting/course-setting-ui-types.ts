/**
 * L6-E2F — Shared UI Types for Course-Setting Components
 *
 * Stage: L6-E2F-XLSX-COURSE-SETTING-PREVIEW-COMPONENT-DECOMPOSITION
 *
 * Pure type definitions shared by extracted subcomponents. No runtime logic.
 * Keeps the parent as the single source of truth for state.
 */

import type { CourseSettingManualResolutionItem } from '@/lib/import/course-setting-manual-resolution-l6-e1'

export type ReviewRawContext = {
  courseName: string | null
  teacherText: string | null
  classText: string | null
  remark: string | null
  mergeRemark: string | null
  weeklyHoursText: string | null
  examTypeText: string | null
  majorName: string | null
  sheetIndex: number
  sheetName: string | null
  sourceRowIndex: number
  suggestedAction: string
  diagnosticCodes: string[]
  confidence: number
}

export type ReviewRawMap = Map<string, ReviewRawContext | null>

export type SplitCandidateAssignment = {
  assignmentId: string
  teacherRaw: string
  teacherNameHash: string
  teacherId: number | null
  teacherMatchStatus: string
  classRaw: string
  classNameHashes: string[]
  classGroupIds: number[]
  classMatchStatus: string
  warningCodes: string[]
}

export type SplitCandidate = {
  candidateId: string
  kind: string
  confidence: number
  requiresManualConfirmation: boolean
  meta: {
    weeklyHours: number | null
    weeklyHoursText: string | null
    examType: string | null
    examTypeText: string | null
  }
  assignments: SplitCandidateAssignment[]
  warningCodes: string[]
}

export type SplitCandidatesById = Map<string, SplitCandidate[]>

export type TargetSemesterMode = 'existing' | 'createNew'

export type CreateSemesterFormState = {
  name: string
  code: string
  academicYear: string
  term: string
  startsAt: string
  endsAt: string
}

export type PlanTableFilter =
  | 'importable'
  | 'skipped'
  | 'unresolved'
  | 'candidates'
  | 'duplicates'
  | 'blockers'

export type ResolutionFilterValue = 'all' | 'importable' | 'needsResolution' | 'ignored' | 'pending'

// Re-export for convenience
export type { CourseSettingManualResolutionItem }