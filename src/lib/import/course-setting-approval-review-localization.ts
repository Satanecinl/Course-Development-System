/**
 * L6-D2A - Course Setting Approval Review UI Localization
 *
 * Pure, I/O-free localization helper for the L6-D2 approval review UI.
 * Maps English machine fields (decision values, diagnostic codes,
 * suggestedAction codes, match status values, decision sources) to
 * Chinese display labels. Machine values stay unchanged in:
 *   - the API response shape
 *   - the exported decision JSON (`buildCourseSettingDecisionFile`)
 *   - any code that uses the machine value (state, filter values,
 *     dropdown option values)
 *
 * Only the **display label** changes. This module is a pure function
 * library: no DB, no fs, no React, no API/UI imports.
 */

// Stage constant
export const L6_D2A_STAGE =
  'L6-D2A-XLSX-COURSE-SETTING-APPROVAL-REVIEW-UI-LOCALIZATION' as const

// ---------------------------------------------------------------------------
// Table column headers
// ---------------------------------------------------------------------------

export type ApprovalReviewTableHeaderKey =
  | 'approvalItemId'
  | 'source'
  | 'courseName'
  | 'teacherText'
  | 'classText'
  | 'weeklyHours'
  | 'examType'
  | 'remark'
  | 'mergeRemark'
  | 'diagnostics'
  | 'suggestedAction'
  | 'match'
  | 'confidence'
  | 'decision'

export const APPROVAL_REVIEW_TABLE_HEADERS: ReadonlyArray<{
  key: ApprovalReviewTableHeaderKey
  label: string
}> = [
  { key: 'approvalItemId', label: '审核项ID' },
  { key: 'source', label: '工作表 / 行号' },
  { key: 'courseName', label: '课程名' },
  { key: 'teacherText', label: '教师' },
  { key: 'classText', label: '班级' },
  { key: 'weeklyHours', label: '周课时' },
  { key: 'examType', label: '考试类型' },
  { key: 'remark', label: '备注' },
  { key: 'mergeRemark', label: '合班备注' },
  { key: 'diagnostics', label: '诊断' },
  { key: 'suggestedAction', label: '建议处理' },
  { key: 'match', label: '匹配状态' },
  { key: 'confidence', label: '置信度' },
  { key: 'decision', label: '审核决定' },
]

// ---------------------------------------------------------------------------
// Filter labels
// ---------------------------------------------------------------------------

export const APPROVAL_REVIEW_FILTER_LABELS = {
  decision: '审核决定',
  blocked: '是否阻塞',
  suggestedAction: '建议处理',
  diagnostic: '诊断类型',
  searchPlaceholder: '搜索 课程名 / 教师 / 班级 / 备注 / 合班备注',
  all: '全部',
} as const

// ---------------------------------------------------------------------------
// Decision dropdown options
// ---------------------------------------------------------------------------

export type ApprovalReviewDecisionValue =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needsReview'

export const APPROVAL_REVIEW_DECISION_OPTIONS: ReadonlyArray<{
  value: ApprovalReviewDecisionValue
  label: string
}> = [
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '通过' },
  { value: 'rejected', label: '拒绝' },
  { value: 'needsReview', label: '需复核' },
]

// ---------------------------------------------------------------------------
// Blocked filter options
// ---------------------------------------------------------------------------

export type ApprovalReviewBlockedValue = 'all' | 'blocked' | 'notBlocked'

export const APPROVAL_REVIEW_BLOCKED_OPTIONS: ReadonlyArray<{
  value: ApprovalReviewBlockedValue
  label: string
}> = [
  { value: 'all', label: '全部' },
  { value: 'blocked', label: '阻塞' },
  { value: 'notBlocked', label: '不阻塞' },
]

// ---------------------------------------------------------------------------
// Decision source labels
// ---------------------------------------------------------------------------

export const APPROVAL_REVIEW_DECISION_SOURCE_LABELS: Readonly<Record<string, string>> = {
  systemDefaultPending: '系统默认待审核',
  manual: '人工',
  ruleAssisted: '规则辅助',
  importedDecisionFile: '导入决策文件',
}

// ---------------------------------------------------------------------------
// Diagnostic code labels (L4 / L6-D / L6-E2G codes)
// ---------------------------------------------------------------------------

export const APPROVAL_REVIEW_DIAGNOSTIC_LABELS: Readonly<Record<string, string>> = {
  COURSE_MISSING: '课程缺失（已弃用，参见 COURSE_NAME_MISSING / COURSE_CREATE_CANDIDATE）',
  COURSE_NAME_MISSING: '课程名缺失',
  COURSE_CREATE_CANDIDATE: '新课程候选',
  COURSE_AMBIGUOUS: '课程匹配歧义',
  TEACHER_MISSING: '教师缺失',
  TEACHER_AMBIGUOUS: '教师匹配歧义',
  TEACHER_BLANK: '教师为空',
  TEACHER_ASSIGNMENT_OTHER_REQUIRES_REVIEW: '教师分配需复核',
  TEACHER_BANK_SPLIT_REQUIRES_REVIEW: '教师银行式拆分需复核',
  CLASS_GROUP_MISSING: '班级缺失',
  CLASS_GROUP_AMBIGUOUS: '班级匹配歧义',
  CLASS_COUNT_ONLY_REQUIRES_REVIEW: '仅有班级数量，需复核',
  CLASS_COUNT_OTHER_REQUIRES_REVIEW: '班级数量格式异常，需复核',
  WEEKLY_HOURS_NON_NUMERIC: '周课时不是数字',
  EXAM_TYPE_OTHER: '考试类型异常',
  MERGE_REMARK_AMBIGUOUS: '合班备注存在歧义',
  LOW_CONFIDENCE_ROW: '低置信度行',
  TASK_SPLIT_REQUIRED: '需拆分教学任务',
  TASK_CANDIDATE_SKIPPED: '教学任务候选已跳过',
  SOURCE_EVIDENCE_INCOMPLETE: '来源证据不完整',
}

// ---------------------------------------------------------------------------
// Course situation labels (L6-E2G) — long-form descriptions for the UI.
// These are SEPARATE from the diagnostic-code label map: the long-form
// descriptions are used by the Manual Resolution section to explain
// "what does this state mean" to the human reviewer.
// ---------------------------------------------------------------------------

export const COURSE_SITUATION_LABELS = {
  courseNameMissing: {
    short: '课程名缺失',
    long: '课程名缺失 — Excel 行中没有可识别的课程名，必须人工处理。',
  },
  newCourseCandidate: {
    short: '新课程候选',
    long: '新课程候选 — 系统未找到已有课程，将作为新课程创建。',
  },
  courseAmbiguous: {
    short: '课程匹配歧义',
    long: '课程匹配歧义 — 请选择已有课程，或确认作为新课程创建。',
  },
  courseResolved: {
    short: '课程已解析',
    long: '课程已解析 — 当前行已确定使用某个课程，无需处理。',
  },
} as const

// ---------------------------------------------------------------------------
// Suggested action labels (L6-E2G — new course candidate variant)
// ---------------------------------------------------------------------------

export const APPROVAL_REVIEW_SUGGESTED_ACTION_LABELS: Readonly<Record<string, string>> = {
  approveCandidate: '建议通过',
  needsHumanReview: '需人工复核',
  blockedByMissingCourse: '因课程名缺失阻塞',
  blockedByNewCourseCandidate: '新课程候选（需确认）',
  blockedByMissingTeacher: '因教师缺失阻塞',
  blockedByMissingClassGroup: '因班级缺失阻塞',
  blockedByAmbiguousMapping: '因匹配歧义阻塞',
  blockedByInvalidHours: '因周课时异常阻塞',
  blockedByInvalidExamType: '因考试类型异常阻塞',
  blockedByLowConfidence: '因低置信度阻塞',
  blockedByTargetSemesterMismatch: '因目标学期不匹配阻塞',
}

// ---------------------------------------------------------------------------
// Match status labels (L4 / L6-D)
// ---------------------------------------------------------------------------

export const APPROVAL_REVIEW_MATCH_STATUS_LABELS: Readonly<Record<string, string>> = {
  exact: '精确匹配',
  missing: '未匹配',
  ambiguous: '匹配歧义',
  needsManualReview: '需人工复核',
  possibleExisting: '可能已存在',
  newCandidate: '新候选',
  ambiguousExisting: '已有记录歧义',
  skipped: '已跳过',
  blank: '空值',
  countOnly: '仅数量',
  unresolved: '未解析',
}

// ---------------------------------------------------------------------------
// Informational banner
// ---------------------------------------------------------------------------

export const AUTO_SAFE_CANDIDATES_NOTE =
  '自动安全候选：${n}（仅供参考，不会自动通过）'

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Format an approval decision machine value to a Chinese display label.
 * Unknown values pass through unchanged.
 */
export function formatApprovalDecisionLabel(value: string): string {
  for (const opt of APPROVAL_REVIEW_DECISION_OPTIONS) {
    if (opt.value === value) return opt.label
  }
  return value
}

/**
 * Format a decision source machine value to a Chinese display label.
 * Unknown values pass through unchanged.
 */
export function formatDecisionSourceLabel(value: string): string {
  const label = APPROVAL_REVIEW_DECISION_SOURCE_LABELS[value]
  return label !== undefined ? label : value
}

/**
 * Format a suggestedAction machine value to a Chinese display label.
 * Unknown values get an "未知建议：" prefix.
 */
export function formatSuggestedActionLabel(value: string): string {
  const label = APPROVAL_REVIEW_SUGGESTED_ACTION_LABELS[value]
  return label !== undefined ? label : `未知建议：${value}`
}

/**
 * Format a diagnostic code to a Chinese display label.
 * Unknown codes get an "未知诊断：" prefix.
 */
export function formatDiagnosticCodeLabel(code: string): string {
  const label = APPROVAL_REVIEW_DIAGNOSTIC_LABELS[code]
  return label !== undefined ? label : `未知诊断：${code}`
}

/**
 * Format a match status value to a Chinese display label.
 * Supports composite values like "a / b" by translating each part and
 * rejoining with " / ". Empty string passes through empty.
 * Unknown single values pass through unchanged.
 */
export function formatMatchStatusLabel(value: string): string {
  if (value === '') return ''
  if (value.includes(' / ')) {
    const parts = value.split(' / ')
    const translated = parts.map((p) => {
      const label = APPROVAL_REVIEW_MATCH_STATUS_LABELS[p]
      return label !== undefined ? label : p
    })
    return translated.join(' / ')
  }
  const label = APPROVAL_REVIEW_MATCH_STATUS_LABELS[value]
  return label !== undefined ? label : value
}

/**
 * Format a blocked indicator to a Chinese display label.
 * Accepts boolean (true/false) or string ('blocked'/'notBlocked').
 * Other values pass through unchanged as a string.
 */
export function formatBlockedLabel(value: boolean | string): string {
  if (value === true) return '是'
  if (value === false) return '否'
  if (value === 'blocked') return '阻塞'
  if (value === 'notBlocked') return '不阻塞'
  return String(value)
}

/**
 * Format a confidence value (0..1) to a fixed 2-decimal string.
 * Returns '-' for null/undefined/NaN/Infinity.
 */
export function formatConfidence(value: number | null | undefined): string {
  if (value == null) return '-'
  if (!Number.isFinite(value)) return '-'
  return value.toFixed(2)
}
