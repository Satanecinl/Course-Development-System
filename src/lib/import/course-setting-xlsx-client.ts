/**
 * L3/L6-B Client Helper — Course Setting XLSX Preview
 *
 * Thin fetch wrapper for the course-setting-xlsx preview API.
 * No server-side imports (prisma, fs, path). Pure client code.
 *
 * L6-B: previewCourseSettingXlsx accepts targetSemesterId.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type CourseSettingXlsxPreviewRowRaw = {
  courseName: string | null
  teacherText: string | null
  classText: string | null
  remark: string | null
  mergeRemark: string | null
  majorName: string | null
  weeklyHoursText: string | null
  examTypeText: string | null
}

export type CourseSettingXlsxPreviewRowParsed = {
  courseNameHash?: string
  teacherRawHash?: string
  classCountRawHash?: string
  remarkHash?: string
  mergeRemarkHash?: string
  weeklyHours?: number | null
  weeklyHoursClassification?: string | null
  examType?: string | null
  examTypeClassification?: string | null
  diagnostics: string[]
  classifications: Record<string, string | number | boolean | null>
}

export type CourseSettingXlsxPreviewRow = {
  sheetIndex: number
  sheetName?: string
  sheetNameHash: string
  sourceRowIndex: number
  rowKind: string
  displayIndex: number
  raw?: CourseSettingXlsxPreviewRowRaw
  parsed: CourseSettingXlsxPreviewRowParsed
  match?: {
    courseMatchStatus?: string
    teacherMatchStatusSummary?: Record<string, number>
    classGroupMatchStatusSummary?: Record<string, number>
    taskMatchStatus?: string
  }
  courseNameHash?: string
  gradeMajorHash?: string
  classCountRawHash?: string
  teacherRawHash?: string
  remarkHash?: string
  mergeRemarkHash?: string
  classCountClassification?: string
  classGroupCandidateCount?: number
  teacherAssignmentClassification?: string
  teacherAssignmentCandidateCount?: number
  examTypeClassification?: string
  weeklyHoursClassification?: string
  weeklyHoursValue?: number | null
  confidence: number
  warningCodes: string[]
  needsManualReview: boolean
  manualReviewReasons: string[]
}

export type CourseSettingXlsxSemesterSummary = {
  id: number
  nameHash: string
  code: string | null
  isActive: boolean
  isActiveSemester: boolean
  setAsActive: false
  classGroupCount: number
  teachingTaskCount: number
  teachingTaskClassCount: number
  courseCount: number
  teacherCount: number
}

export type CourseSettingXlsxDryRunSummary = {
  dryRunOnly: true
  dbWritten: false
  existingDataScopedBySemester: true
  courseCandidates: number
  teacherCandidates: number
  classGroupCandidates: number
  teachingTaskCandidates: number
  teachingTaskClassCandidates: number
  rowsNeedingManualReview: number
  rowsSkipped: number
}

export type CourseSettingXlsxPreviewResponse = {
  success: true
  parserType: 'courseSettingXlsx'
  previewOnly: true
  canConfirm: false
  canApply: false
  artifact: { filename: string; sha256: string; sizeBytes: number }
  parser: { parserVersion: string; durationMs: number }
  workbookSummary: {
    sheetCount: number
    parsedSheetCount: number
    totalRows: number
    totalCourseRows: number
    totalWarnings: number
  }
  fieldSummary: {
    classCount: Record<string, number>
    teacherAssignment: Record<string, number>
    examType: Record<string, number>
    weeklyHours: Record<string, number>
    remark: Record<string, number>
    mergeRemark: Record<string, number>
  }
  sourceEvidenceSummary: {
    draftRows: number
    coveragePercent: number
    hashStrategy: 'sha256-prefix-12'
  }
  diagnosticsSummary: {
    total: number
    bySeverity: Record<string, number>
    byCode: Record<string, number>
  }
  previewRows: CourseSettingXlsxPreviewRow[]
  manualReviewSummary: {
    totalRowsNeedingReview: number
    reasons: Record<string, number>
  }
  // L6-B1: raw preview metadata
  rawPreview?: {
    enabled: true
    scope: 'authorized-admin-preview-only'
    returnedRows: number
    maxPreviewRows: number
    committedArtifactsContainRaw: false
  }
  // L6-B: semester-scoped extensions
  targetSemester?: CourseSettingXlsxSemesterSummary
  dryRunSummary?: CourseSettingXlsxDryRunSummary
  matchSummary?: Record<string, Record<string, number>>
  requireExplicitSemesterForImport?: boolean
  targetSemesterRequired?: true
}

export type CourseSettingXlsxPreviewErrorResponse = {
  success: false
  error: string
  message: string
  previewOnly: true
  canConfirm?: boolean
  canApply?: boolean
  requireExplicitSemesterForImport?: boolean
  targetSemesterRequired?: boolean
}

// ── API Helper ─────────────────────────────────────────────────────────────

/**
 * Upload a .xlsx file and get a preview-only parse result.
 * L6-B: requires targetSemesterId for semester-scoped dry-run.
 * No DB writes, no ImportBatch creation, no teaching task generation.
 */
export async function previewCourseSettingXlsx(
  file: File,
  targetSemesterId?: number,
): Promise<CourseSettingXlsxPreviewResponse> {
  const formData = new FormData()
  formData.append('file', file)
  if (targetSemesterId != null) {
    formData.append('targetSemesterId', String(targetSemesterId))
  }

  const res = await fetch('/api/admin/import/course-setting-xlsx/preview', {
    method: 'POST',
    body: formData,
  })

  const data = await res.json()

  if (!res.ok || !data.success) {
    const message =
      (data as CourseSettingXlsxPreviewErrorResponse).message ||
      (data as CourseSettingXlsxPreviewErrorResponse).error ||
      `Preview failed (HTTP ${res.status})`
    throw new Error(message)
  }

  return data as CourseSettingXlsxPreviewResponse
}

/**
 * Fetch available semesters for the target semester selector.
 * Reuses existing GET /api/semesters.
 */
export type SemesterListItem = {
  id: number
  name: string
  code: string
  academicYear: string | null
  term: string | null
  isActive: boolean
}

export async function fetchSemestersForImport(): Promise<{
  semesters: SemesterListItem[]
  activeSemesterId: number | null
}> {
  const res = await fetch('/api/semesters')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Failed to load semesters')
  return {
    semesters: data.semesters ?? [],
    activeSemesterId: data.activeSemesterId ?? null,
  }
}

/**
 * L6-C: Create a new semester from the Excel import flow.
 *
 * The newly created semester is automatically eligible to be selected as
 * the Excel import targetSemesterId. It is NEVER auto-activated — the
 * active semester is decoupled from this flow.
 *
 * - Calls existing POST /api/semesters (requires `settings:manage`).
 * - Does NOT call activate endpoint.
 * - Does NOT pass `isActive: true`.
 * - Surfaces `SEMESTER_CODE_EXISTS` (409) and `VALIDATION_ERROR` (400)
 *   with helpful messages so the UI can recover.
 *
 * On 403: caller should prompt "无权限新建学期，请联系管理员或选择已有学期".
 */
export type CreateSemesterForImportInput = {
  name: string
  code: string
  academicYear?: string | null
  term?: string | null
  startsAt?: string | null
  endsAt?: string | null
}

export async function createSemesterForCourseSettingImport(
  input: CreateSemesterForImportInput,
): Promise<SemesterListItem> {
  const res = await fetch('/api/semesters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      code: input.code,
      academicYear: input.academicYear ?? null,
      term: input.term ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      // L6-C invariant: never auto-activate from import flow
      isActive: false,
    }),
  })
  const data = await res.json().catch(() => ({ success: false, error: 'PARSE_ERROR' }))
  if (!res.ok || data.success === false) {
    const message = (data?.message as string | undefined) || (data?.error as string | undefined) || `HTTP ${res.status}`
    const err = new Error(message) as Error & {
      code?: string
      status?: number
    }
    err.code = (data?.error as string | undefined) ?? `HTTP_${res.status}`
    err.status = res.status
    throw err
  }
  const s = data.semester as {
    id: number
    name: string
    code: string
    academicYear: string | null
    term: string | null
    isActive: boolean
  }
  return {
    id: s.id,
    name: s.name,
    code: s.code,
    academicYear: s.academicYear ?? null,
    term: s.term ?? null,
    isActive: !!s.isActive,
  }
}
