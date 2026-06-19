/**
 * L3 Client Helper — Course Setting XLSX Preview
 *
 * Thin fetch wrapper for the course-setting-xlsx preview API.
 * No server-side imports (prisma, fs, path). Pure client code.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type CourseSettingXlsxPreviewRow = {
  sheetIndex: number
  sheetNameHash: string
  sourceRowIndex: number
  rowKind: string
  displayIndex: number
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
  weeklyHoursValue?: number
  confidence: number
  warningCodes: string[]
  needsManualReview: boolean
  manualReviewReasons: string[]
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
}

export type CourseSettingXlsxPreviewErrorResponse = {
  success: false
  error: string
  message: string
  previewOnly: true
}

// ── API Helper ─────────────────────────────────────────────────────────────

/**
 * Upload a .xlsx file and get a preview-only parse result.
 * No DB writes, no ImportBatch creation, no teaching task generation.
 */
export async function previewCourseSettingXlsx(
  file: File,
): Promise<CourseSettingXlsxPreviewResponse> {
  const formData = new FormData()
  formData.append('file', file)

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
