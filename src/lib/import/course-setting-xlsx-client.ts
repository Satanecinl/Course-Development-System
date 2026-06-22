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
  /** L7-A: template version detected for this row. */
  templateVersion?: 'legacy' | 'new-course-setting-a-m-v2'
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

// ── L6-D2 Approval Review UI types ─────────────────────────────────────────

export type CourseSettingApprovalReviewUiRowSource = {
  sheetIndex: number
  sheetName: string | null // runtime only
  sheetNameHash: string
  sourceRowIndex: number
}

export type CourseSettingApprovalReviewUiRowRaw = {
  courseName: string | null
  teacherText: string | null
  classText: string | null
  remark: string | null
  mergeRemark: string | null
  weeklyHoursText?: string | null
  examTypeText?: string | null
}

export type CourseSettingApprovalReviewUiRowParsed = {
  courseNameHash?: string
  teacherRawHash?: string
  classCountRawHash?: string
  remarkHash?: string
  mergeRemarkHash?: string
  weeklyHours?: number | null
  examType?: string | null
}

export type CourseSettingApprovalReviewUiRowDecision = {
  value: 'pending'
  source: 'systemDefaultPending'
  reasonCode: 'INITIAL_PENDING'
}

export type CourseSettingApprovalReviewUiRowMatch = {
  suggestedAction: string
  blockingReasons: string[]
  diagnosticCodes: string[]
  confidence: number
  courseMatchStatus?: string
  teacherMatchStatusSummary?: Record<string, number>
  classGroupMatchStatusSummary?: Record<string, number>
  taskMatchStatus?: string
}

export type CourseSettingApprovalReviewUiRowFlags = {
  blocked: boolean
  autoSafeCandidate: boolean
  needsHumanReview: boolean
  /** L7-A3: row is a new course candidate (Excel has a course name, DB
   *  has no match). NOT a blocker. */
  newCourseCandidate: boolean
}

export type CourseSettingApprovalReviewUiRow = {
  approvalItemId: string
  source: CourseSettingApprovalReviewUiRowSource
  raw: CourseSettingApprovalReviewUiRowRaw
  parsed: CourseSettingApprovalReviewUiRowParsed
  decision: CourseSettingApprovalReviewUiRowDecision
  match: CourseSettingApprovalReviewUiRowMatch
  flags: CourseSettingApprovalReviewUiRowFlags
}

export type CourseSettingApprovalReviewUiTargetSemester = {
  id: number
  name: string
  code?: string | null
  isActive: boolean
  setAsActive: false
}

export type CourseSettingApprovalReviewUiSourceArtifact = {
  filename: string
  sha256: string
  sizeBytes: number
}

export type CourseSettingApprovalReviewUiPackageRef = {
  targetSemesterId: number
  dryRunFingerprintHash: string
  itemCount: number
}

export type CourseSettingApprovalReviewUiSummary = {
  totalItems: number
  pendingItems: number
  approvedItems: 0
  rejectedItems: 0
  needsReviewItems: 0
  blockedItems: number
  autoSafeCandidates: number
  /** L7-A3: rows where Excel has a course name but DB has no match.
   *  These are NOT counted in `blockedItems`. */
  newCourseCandidateItems: number
  /** L7-A3: rows where Excel course name is empty / unparsable. These
   *  ARE hard blockers — counted separately from
   *  `newCourseCandidateItems`. */
  courseNameMissingItems: number
  /** L7-A3: rows where the only blocker is teacher / class / task split
   *  (i.e. could be importable if the user resolves them). */
  importableAfterTeacherOrClassResolutionItems: number
  applyReady: false
}

/**
 * L7-A2A: Full-dataset scope descriptor returned by the approval-review API.
 * Confirms that the server returned the COMPLETE review dataset (not a
 * truncated slice) so the client can paginate client-side over the actual
 * total. `approvalItemsReturned` must equal `totalReviewItems` in the
 * standard main path. `paginationMode === 'client-side'` and
 * `dataScope === 'fullDataset'` are required invariants.
 */
export type CourseSettingApprovalReviewUiDatasetSummary = {
  templateVersion: 'legacy' | 'new-course-setting-a-m-v2' | string
  totalRows: number
  totalCourseRows: number
  skippedSubtotalRows: number
  totalReviewItems: number
  approvalItemsReturned: number
  paginationMode: 'client-side'
  pageSize: number
  dataScope: 'fullDataset'
  maxRowsSafetyCap: number
  rowsSafetyTruncated: number
}

export type CourseSettingApprovalReviewUiRawDisplayPolicy = {
  runtimeUiRawAllowed: true
  exportedDecisionFileRawIncluded: false
  committedDocsRawAllowed: false
  scope: 'authorized-admin-review-only'
}

export type CourseSettingApprovalReviewUiResponse = {
  success: true
  stage: 'L6-D2-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI' | 'L7-A2A-XLSX-COURSE-SETTING-APPROVAL-REVIEW-FULL-DATASET-WIRING-FIX'
  reviewOnly: true
  dryRunOnly: true
  dbWritten: false
  applyAllowed: false
  applyListGenerated: false
  targetSemester: CourseSettingApprovalReviewUiTargetSemester
  sourceArtifact: CourseSettingApprovalReviewUiSourceArtifact
  packageRef: CourseSettingApprovalReviewUiPackageRef
  summary: CourseSettingApprovalReviewUiSummary
  /** L7-A2A: full-dataset scope descriptor. */
  reviewDatasetSummary?: CourseSettingApprovalReviewUiDatasetSummary
  rawDisplayPolicy: CourseSettingApprovalReviewUiRawDisplayPolicy
  rows: CourseSettingApprovalReviewUiRow[]
  truncatedRows: number
}

export type CourseSettingApprovalReviewUiErrorResponse = {
  success: false
  error: string
  message: string
  reviewOnly: true
  applyAllowed: false
}

// ── L6-D2 Decision File types ──────────────────────────────────────────────

export type CourseSettingApprovalReviewUiDecisionValue =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needsReview'

export type CourseSettingApprovalDecisionFileDecision = {
  approvalItemId: string
  decision: CourseSettingApprovalReviewUiDecisionValue
  reason?: string
}

export type CourseSettingDecisionFile = {
  stage: 'L6-D2-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI'
  fileType: 'course-setting-decision-file'
  version: 'l6-d2-decision-file-v1'
  exportedAt: string
  targetSemesterId: number
  packageRef: {
    dryRunFingerprintHash: string
    itemCount: number
  }
  decisions: CourseSettingApprovalDecisionFileDecision[]
  rawIncluded: false
}

// ── L6-D2 Approval Review API Helper ───────────────────────────────────────

/**
 * L6-D2: Post a .xlsx file to the approval-review endpoint and receive a
 * review-only, dry-run response. No DB writes, no apply list.
 *
 * On non-OK or `success === false`, throws an Error with the server's
 * `message` (falling back to `error` or HTTP status) — same convention as
 * `previewCourseSettingXlsx`.
 */
export async function reviewCourseSettingApproval(
  file: File,
  targetSemesterId: number,
  maxRows?: number,
): Promise<CourseSettingApprovalReviewUiResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('targetSemesterId', String(targetSemesterId))
  if (maxRows != null) {
    formData.append('maxRows', String(maxRows))
  }

  const res = await fetch(
    '/api/admin/import/course-setting-xlsx/approval-review',
    {
      method: 'POST',
      body: formData,
    },
  )

  const data = await res.json()

  if (!res.ok || !data.success) {
    const message =
      (data as CourseSettingApprovalReviewUiErrorResponse).message ||
      (data as CourseSettingApprovalReviewUiErrorResponse).error ||
      `Approval review failed (HTTP ${res.status})`
    throw new Error(message)
  }

  return data as CourseSettingApprovalReviewUiResponse
}

// ── L6-D2 Decision File builders ───────────────────────────────────────────

/**
 * Build a redacted decision-file object. Pure mapper — never includes raw
 * teacher/class/course/remark fields. If `exportedAt` is omitted, the
 * current ISO timestamp is used.
 */
export function buildCourseSettingDecisionFile(input: {
  targetSemesterId: number
  dryRunFingerprintHash: string
  itemCount: number
  decisions: CourseSettingApprovalDecisionFileDecision[]
  exportedAt?: string
}): CourseSettingDecisionFile {
  return {
    stage: 'L6-D2-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI',
    fileType: 'course-setting-decision-file',
    version: 'l6-d2-decision-file-v1',
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    targetSemesterId: input.targetSemesterId,
    packageRef: {
      dryRunFingerprintHash: input.dryRunFingerprintHash,
      itemCount: input.itemCount,
    },
    decisions: input.decisions,
    rawIncluded: false,
  }
}

/**
 * Serialize a decision file to a JSON string. Always appends a trailing
 * newline so the artifact is line-oriented.
 */
export function serializeCourseSettingDecisionFile(
  file: CourseSettingDecisionFile,
): string {
  return JSON.stringify(file, null, 2) + '\n'
}

/**
 * Browser-side helper: trigger a download of the decision file as JSON.
 * Uses a hidden `<a download>` element and a temporary object URL. The URL
 * is revoked after 100ms. This never writes to disk server-side.
 */
export function downloadCourseSettingDecisionFile(
  file: CourseSettingDecisionFile,
): void {
  const json = serializeCourseSettingDecisionFile(file)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `course-setting-decision.target-${file.targetSemesterId}.redacted.json`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 100)
}

// ── L6-E1 Resolution Options types ─────────────────────────────────────────

export type CourseSettingResolutionOptionCourse = {
  id: number
  name: string
}

export type CourseSettingResolutionOptionTeacher = {
  id: number
  name: string
}

export type CourseSettingResolutionOptionClassGroup = {
  id: number
  name: string
  studentCount: number | null
}

export type CourseSettingResolutionOptionsResponse = {
  success: true
  readOnly: true
  dbWritten: false
  targetSemesterId: number
  courses: CourseSettingResolutionOptionCourse[]
  teachers: CourseSettingResolutionOptionTeacher[]
  classGroups: CourseSettingResolutionOptionClassGroup[]
}

export type CourseSettingResolutionOptionsErrorResponse = {
  success: false
  error: string
  message: string
  readOnly: true
}

/**
 * L6-E1: Fetch resolution options (courses, teachers, classGroups) for the
 * given target semester. The API is read-only — no DB writes.
 *
 * On non-OK or `success === false`, throws an Error.
 */
export async function fetchResolutionOptions(
  targetSemesterId: number,
): Promise<CourseSettingResolutionOptionsResponse> {
  const res = await fetch(
    `/api/admin/import/course-setting-xlsx/resolution-options?targetSemesterId=${encodeURIComponent(String(targetSemesterId))}`,
  )
  const data = await res.json()

  if (!res.ok || !data.success) {
    const message =
      (data as CourseSettingResolutionOptionsErrorResponse).message ||
      (data as CourseSettingResolutionOptionsErrorResponse).error ||
      `Resolution options fetch failed (HTTP ${res.status})`
    throw new Error(message)
  }

  return data as CourseSettingResolutionOptionsResponse
}

// ── L6-E1 Resolution Draft Export types ─────────────────────────────────────

export type CourseSettingResolutionDraftItemInput = {
  approvalItemId: string
  resolutionStatus: string
  resolution: Record<string, unknown>
  validation: { importable: boolean; blockers: string[]; warnings: string[] }
}

export type CourseSettingResolutionDraftExport = {
  stage: string
  fileType: 'course-setting-resolution-draft'
  version: string
  exportedAt: string
  targetSemesterId: number
  packageRef: { dryRunFingerprintHash: string; itemCount: number }
  summary: {
    totalItems: number
    importableItems: number
    needsResolutionItems: number
    ignoredItems: number
    pendingItems: number
    manuallyResolvedItems: number
    unresolvedBlockers: Record<string, number>
  }
  items: Array<{
    approvalItemId: string
    resolutionStatus: string
    resolution: Record<string, unknown>
    validation: { importable: boolean; blockers: string[]; warnings: string[] }
    rawIncluded: false
  }>
  rawIncluded: false
}

/**
 * L6-E1: Pure mapper — build a resolution draft export object.
 * `exportedAt` defaults to the current ISO timestamp when omitted.
 */
export function buildResolutionDraftExport(input: {
  targetSemesterId: number
  dryRunFingerprintHash: string
  itemCount: number
  summary: CourseSettingResolutionDraftExport['summary']
  items: CourseSettingResolutionDraftItemInput[]
  exportedAt?: string
}): CourseSettingResolutionDraftExport {
  return {
    stage: 'L6-E1-XLSX-COURSE-SETTING-RESOLUTION-DRAFT',
    fileType: 'course-setting-resolution-draft',
    version: 'l6-e1-resolution-draft-v1',
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    targetSemesterId: input.targetSemesterId,
    packageRef: {
      dryRunFingerprintHash: input.dryRunFingerprintHash,
      itemCount: input.itemCount,
    },
    summary: input.summary,
    items: input.items.map((item) => ({
      ...item,
      rawIncluded: false as const,
    })),
    rawIncluded: false,
  }
}

/**
 * L6-E1: Serialize a resolution draft export to a pretty-printed JSON string
 * with a trailing newline (line-oriented artifact).
 */
export function serializeManualResolutionDraftExport(
  draft: CourseSettingResolutionDraftExport,
): string {
  return JSON.stringify(draft, null, 2) + '\n'
}

/**
 * L6-E1: Browser-side helper — trigger a download of the resolution draft
 * export as a JSON file. Uses a hidden `<a download>` element and a
 * temporary object URL, same pattern as `downloadCourseSettingDecisionFile`.
 */
export function downloadManualResolutionDraftExport(
  draft: CourseSettingResolutionDraftExport,
): void {
  const json = serializeManualResolutionDraftExport(draft)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `course-setting-resolution-draft.target-${draft.targetSemesterId}.json`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 100)
}

// ── L6-E2 Partial Import Plan types & fetchers ─────────────────────────────

import type {
  CourseSettingManualResolutionItem,
} from './course-setting-manual-resolution-l6-e1'

export type CourseSettingPartialImportDuplicateRiskKind =
  | 'possibleExisting'
  | 'ambiguousExisting'
  | 'exactExisting'
  | 'safeNew'
  | 'needsReview'

export type CourseSettingPartialImportPlanRow = {
  approvalItemId: string
  sheetIndex: number
  sourceRowIndex: number
  sourceEvidenceHash: string
  resolvedCourseId: number | null
  plannedCourseAction: 'useExisting' | 'createCandidate' | 'unresolved'
  plannedCourseCandidateName: string | null
  /** L6-E2G: explicit coursePlan mode + metadata for the future L6-F apply stage. */
  coursePlan: {
    mode: 'useExistingCourse' | 'createCourse' | 'unresolved'
    courseId?: number
    courseNameHash?: string
    createCourseCandidate?: {
      nameHash: string
      source: 'excelCourseName' | 'manualOverride'
      confirmed: boolean
    }
  }
  resolvedTeacherId: number | null
  plannedTeacherAction:
    | 'useExisting'
    | 'allowBlank'
    | 'unresolved'
    | 'unresolved_no_create_in_l6_e2'
  plannedTeacherCandidateName: string | null
  resolvedClassGroupIds: number[]
  plannedClassGroupAction: 'useExisting' | 'createCandidate' | 'unresolved'
  plannedClassGroupCandidateNames: string[]
  majorNameRaw: string | null
  majorNameHash: string | null
  weeklyHours: number | null
  examType: '考试' | '考查' | '' | null
  ambiguousMappingConfirmed: boolean
  duplicateRisk: CourseSettingPartialImportDuplicateRiskKind
  duplicateExistingTaskId: number | null
  blockerReasons: string[]
}

export type CourseSettingPartialImportSkippedRow = {
  approvalItemId: string
  sheetIndex: number
  sourceRowIndex: number
  skipReason: 'userIgnored' | 'rejected' | 'skipCandidate' | 'invalidOrPlaceholder'
  note?: string | null
}

export type CourseSettingPartialImportUnresolvedRow = {
  approvalItemId: string
  sheetIndex: number
  sourceRowIndex: number
  unresolvedReasons: string[]
}

export type CourseSettingPartialImportSummary = {
  totalRows: number
  plannedImportRows: number
  skippedRows: number
  unresolvedRows: number
  ignoredRows: number
  duplicateRiskRows: number
  blockingRows: number
  courseCreateCandidates: number
  /** L6-E2G: rows that reference a new course candidate (Excel had a
   *  course name but DB had no match). */
  rowsUsingNewCourseCandidate: number
  /** L6-E2G: subset of `rowsUsingNewCourseCandidate` confirmed by the user. */
  confirmedNewCourseCandidates: number
  /** L6-E2G: rows with a true Excel course-name gap. */
  courseNameMissingRows: number
  /** L6-E2G: rows with multiple DB course matches. */
  courseAmbiguousRows: number
  /** L7-A3: rows where the only blocker is teacher missing. */
  teacherMissingRows: number
  /** L7-A3: rows where the only blocker is class group missing. */
  classGroupMissingRows: number
  /** L7-A3: rows where the only blocker is task split / assignment review. */
  taskAssignmentReviewRows: number
  /** L7-A3: importable rows that reference an existing course. */
  rowsUsingExistingCourse: number
  teacherCreateCandidates: 0
  classGroupCreateCandidates: number
  teachingTaskCandidates: number
  teachingTaskClassCandidates: number
  applyReadyForFutureStage: boolean
}

export type CourseSettingPartialImportPlanResponse = {
  success: true
  stage: 'L6-E2-XLSX-COURSE-SETTING-PARTIAL-IMPORT-PLAN-IN-PAGE'
  planVersion: string
  planOnly: true
  dryRunOnly: true
  dbWritten: false
  applyAllowed: false
  applyRouteExists: false
  importBatchCreated: false
  teachingTaskCreated: false
  teachingTaskClassCreated: false
  courseCreated: false
  classGroupCreated: false
  teacherCreated: false
  excelPartialImportApplied: false
  targetSemester: {
    id: number
    name: string
    code: string | null
    isActive: boolean
    setAsActive: false
  }
  targetSemesterReadiness?: {
    targetSemesterId: number
    classGroupCount: number
    canApply: boolean
    blockingReason?: string
  }
  sourceArtifact: { filename: string; sha256: string; sizeBytes: number }
  reviewPackageFingerprintHash: string
  reviewPackageDecisionAllPending: boolean
  summary: CourseSettingPartialImportSummary
  plan: {
    importableRows: CourseSettingPartialImportPlanRow[]
    skippedRows: CourseSettingPartialImportSkippedRow[]
    unresolvedRows: CourseSettingPartialImportUnresolvedRow[]
    createCandidates: {
      courses: Array<{
        candidateKey: string
        approvalItemIds: string[]
        candidateName: string
        confirmedCount: number
        confidence: number
        sourceEvidenceHashes: string[]
      }>
      classGroups: Array<{
        candidateKey: string
        approvalItemIds: string[]
        candidateName: string
        studentCount: number | null
        sourceEvidenceHashes: string[]
      }>
      teachers: []
    }
    teachingTasks: Array<{
      candidateKey: string
      approvalItemId: string
      courseRef: { kind: 'useExisting'; courseId: number } | { kind: 'createCandidate'; candidateKey: string }
      teacherRef:
        | { kind: 'useExisting'; teacherId: number | null }
        | { kind: 'noTeacher' }
      classGroupRefs: Array<
        { kind: 'useExisting'; classGroupId: number } | { kind: 'createCandidate'; candidateKey: string }
      >
      weeklyHours: number | null
      examType: '考试' | '考查' | '' | null
      duplicateRisk: CourseSettingPartialImportDuplicateRiskKind
      duplicateExistingTaskId: number | null
      blockerReasons: string[]
    }>
    teachingTaskClasses: Array<{
      candidateKey: string
      approvalItemId: string
      teachingTaskCandidateKey: string
      classGroupRef: { kind: 'useExisting'; classGroupId: number } | { kind: 'createCandidate'; candidateKey: string }
    }>
    duplicateRisks: Array<{
      approvalItemId: string
      sheetIndex: number
      sourceRowIndex: number
      kind: CourseSettingPartialImportDuplicateRiskKind
      existingTeachingTaskId: number | null
      reason: string
    }>
    blockers: Array<{
      approvalItemId: string
      sheetIndex: number
      sourceRowIndex: number
      reason: string
    }>
    taskSplitCandidates: Array<{
      approvalItemId: string
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
      assignments: Array<{
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
      }>
      confirmedByUser: boolean
    }>
  }
  rawDisplayPolicy: {
    runtimeUiRawAllowed: true
    exportedPlanRawIncluded: false
    committedDocsRawAllowed: false
    scope: 'authorized-admin-plan-only'
  }
  warnings: string[]
}

export type CourseSettingPartialImportPlanErrorResponse = {
  success: false
  error: string
  message: string
  stage: string
  planOnly: true
  dryRunOnly: true
  dbWritten: false
  applyAllowed: false
}

/**
 * L6-E2: post the current page's manualResolutions + the xlsx + targetSemesterId
 * to the plan-only API. Backend re-parses the Excel, re-loads existing data,
 * and returns the dry-run plan (no DB writes).
 */
export async function planCourseSettingPartialImport(
  file: File,
  targetSemesterId: number,
  manualResolutions: CourseSettingManualResolutionItem[],
): Promise<CourseSettingPartialImportPlanResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('targetSemesterId', String(targetSemesterId))
  formData.append('manualResolutions', JSON.stringify(manualResolutions))

  const res = await fetch('/api/admin/import/course-setting-xlsx/partial-import-plan', {
    method: 'POST',
    body: formData,
  })

  const data = await res.json()
  if (!res.ok || !data.success) {
    const err = data as CourseSettingPartialImportPlanErrorResponse
    throw new Error(err.message ?? err.error ?? `Plan failed (HTTP ${res.status})`)
  }
  return data as CourseSettingPartialImportPlanResponse
}

/**
 * L6-E2: build a redacted JSON string of the plan for download. Excludes all
 * raw teacher / class / course / remark text per rawDisplayPolicy.
 */
export function buildCourseSettingPartialImportPlanExport(
  plan: CourseSettingPartialImportPlanResponse,
): string {
  const planHashSeed = JSON.stringify(plan.summary) + plan.targetSemester.id
  // Cheap deterministic hash for the export — never log or persist raw names.
  let h = 5381
  for (let i = 0; i < planHashSeed.length; i += 1) {
    h = ((h << 5) + h + planHashSeed.charCodeAt(i)) | 0
  }
  const planHash = (h >>> 0).toString(16).padStart(8, '0')
  const obj = {
    stage: plan.stage,
    fileType: 'course-setting-partial-import-plan',
    version: plan.planVersion,
    generatedAt: new Date().toISOString(),
    targetSemesterId: plan.targetSemester.id,
    sourceArtifact: {
      filename: plan.sourceArtifact.filename,
      sha256: plan.sourceArtifact.sha256,
      sizeBytes: plan.sourceArtifact.sizeBytes,
    },
    reviewPackageFingerprintHash: plan.reviewPackageFingerprintHash,
    summary: plan.summary,
    importableRowCount: plan.plan.importableRows.length,
    skippedRowCount: plan.plan.skippedRows.length,
    unresolvedRowCount: plan.plan.unresolvedRows.length,
    // L6-E2G: course-specific counts surfaced explicitly
    courseSummary: {
      courseCreateCandidates: plan.summary.courseCreateCandidates,
      rowsUsingNewCourseCandidate: plan.summary.rowsUsingNewCourseCandidate,
      confirmedNewCourseCandidates: plan.summary.confirmedNewCourseCandidates,
      courseNameMissingRows: plan.summary.courseNameMissingRows,
      courseAmbiguousRows: plan.summary.courseAmbiguousRows,
    },
    createCandidates: {
      courses: plan.plan.createCandidates.courses.map((c) => ({
        candidateKey: c.candidateKey,
        approvalItemCount: c.approvalItemIds.length,
        confirmedCount: c.confirmedCount,
      })),
      classGroups: plan.plan.createCandidates.classGroups.map((c) => ({
        candidateKey: c.candidateKey,
        approvalItemCount: c.approvalItemIds.length,
      })),
      teachers: [],
    },
    teachingTaskCount: plan.plan.teachingTasks.length,
    teachingTaskClassCount: plan.plan.teachingTaskClasses.length,
    duplicateRiskCount: plan.plan.duplicateRisks.length,
    blockerCount: plan.plan.blockers.length,
    rawIncluded: false,
    privacy: {
      rawTeacherNamesIncluded: false,
      rawClassNamesIncluded: false,
      rawCourseNamesIncluded: false,
      rawRemarksIncluded: false,
    },
    planHash,
  }
  return JSON.stringify(obj, null, 2) + '\n'
}

export function downloadCourseSettingPartialImportPlanExport(
  plan: CourseSettingPartialImportPlanResponse,
): void {
  const json = buildCourseSettingPartialImportPlanExport(plan)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `course-setting-partial-import-plan.target-${plan.targetSemester.id}.redacted.json`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

// ── L7-F Partial Import Apply types + client helper ──────────────────────────

/** L7-F: Post-apply audit check result (one item). */
export type CourseSettingApplyAuditCheck = {
  name: string
  ok: boolean
  detail?: string
}

/** L7-F: Apply summary. */
export type CourseSettingApplySummary = {
  importableRows: number
  appliedRows: number
  skippedRows: number
  unresolvedRows: number
  blockingRows: number
  createdCourses: number
  reusedCourses: number
  createdTeachingTasks: number
  createdTeachingTaskClasses: number
  duplicateTeachingTasksSkipped: number
  rowsUsingNewCourseCandidate: number
  confirmedNewCourseCandidates: number
}

/** L7-F: Before/after counts. */
export type CourseSettingApplyCounts = {
  courseBefore: number
  courseAfter: number
  teachingTaskBefore: number
  teachingTaskAfter: number
  teachingTaskClassBefore: number
  teachingTaskClassAfter: number
  importBatchBefore: number
  importBatchAfter: number
  teacherBefore: number
  teacherAfter: number
  classGroupBefore: number
  classGroupAfter: number
  scheduleSlotBefore: number
  scheduleSlotAfter: number
  scheduleAdjustmentBefore: number
  scheduleAdjustmentAfter: number
}

/** L7-F: Full apply response. */
export type CourseSettingApplyResponse = {
  success: true
  stage: string
  planVersion: string
  templateVersion: string
  dryRunOnly: boolean
  dbWritten: boolean
  applied: boolean
  importBatchId: number | null
  backupPath: string | null
  targetSemester: {
    id: number
    name: string
    code: string | null
    isActive: boolean
  }
  sourceArtifact: { filename: string; sha256: string; sizeBytes: number }
  serverPlanHash: string
  summary: CourseSettingApplySummary
  counts: CourseSettingApplyCounts
  postApplyAudit: {
    passed: boolean
    checks: CourseSettingApplyAuditCheck[]
  }
  rollbackNote: string
  rawIncluded: false
  warnings: string[]
}

/** L7-F: Apply error response. */
export type CourseSettingApplyErrorResponse = {
  success: false
  error: string
  message: string
  stage: string
  dryRunOnly: boolean
  dbWritten: false
  rawIncluded: false
}

/** Compute the plan hash client-side (SHA-256 of the canonical plan JSON).
 *  Mirrors the server-side `computeL7FPlanHash`. */
export async function computePlanHashClient(
  planResponse: CourseSettingPartialImportPlanResponse,
): Promise<string> {
  // Stable stringify: sort object keys, no extra whitespace.
  const stableStringify = (v: unknown): string => {
    if (v == null || typeof v !== 'object') return JSON.stringify(v)
    if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
    const keys = Object.keys(v as Record<string, unknown>).sort()
    return `{${keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])).join(',')}}`
  }
  const canonical = stableStringify(planResponse)
  const buf = new TextEncoder().encode(canonical)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * L7-F: Apply the partial import plan to the database.
 *
 * POSTs the Excel file + targetSemesterId + manualResolutions (JSON) +
 * confirmToken + expectedPlanHash to the apply endpoint. Backend re-parses
 * the Excel, recomputes the plan, validates the hash, creates a DB backup,
 * and (on real mode) executes the plan inside a Prisma transaction.
 */
export async function applyCourseSettingPartialImport(
  file: File,
  targetSemesterId: number,
  manualResolutions: CourseSettingManualResolutionItem[],
  confirmToken: string,
  planHash: string,
  options?: { dryRunOnly?: boolean },
): Promise<CourseSettingApplyResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('targetSemesterId', String(targetSemesterId))
  formData.append('manualResolutions', JSON.stringify(manualResolutions))
  formData.append('confirmToken', confirmToken)
  formData.append('expectedPlanHash', planHash)
  if (options?.dryRunOnly) {
    formData.append('dryRunOnly', 'true')
  }

  const res = await fetch(
    '/api/admin/import/course-setting-xlsx/partial-import-apply',
    { method: 'POST', body: formData },
  )

  const data = await res.json()

  if (!res.ok || !data.success) {
    const err = data as CourseSettingApplyErrorResponse
    throw new Error(err.message ?? err.error ?? `Apply failed (HTTP ${res.status})`)
  }

  return data as CourseSettingApplyResponse
}
