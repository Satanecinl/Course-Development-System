/**
 * K19-FIX-B2: Frontend cross-cohort approval UI helpers.
 *
 * Pure functions — no DB access, no side effects.
 * Parses warning strings from dry-run / parse results and produces
 * structured suspicious-task lists, validation state, and API payloads.
 *
 * Compatible with B1 backend:
 *  - warning prefix: LIKELY_ERROR_CROSS_COHORT / LEGAL_PUBLIC_CROSS_COHORT / ...
 *  - taskKey embedded in warning: (taskKey=course|teacher|weekType|start|end)
 *  - buildApprovalTaskKey format: courseName|teacherName|weekType|startWeek|endWeek
 */

// ── Types ──

export type CrossCohortWarningKind =
  | 'LIKELY_ERROR_CROSS_COHORT'
  | 'LEGAL_PUBLIC_CROSS_COHORT'
  | 'AMBIGUOUS_CLASSGROUP_MATCH'
  | 'COHORT_WEAK_MATCH_KEPT'

export interface ParsedCrossCohortWarning {
  kind: CrossCohortWarningKind
  warningText: string
  taskKey: string | null
  courseName: string | null
}

export interface SuspiciousTask {
  taskKey: string
  title: string
  warningText: string
  courseName: string | null
}

export interface ApprovalState {
  checked: boolean
  reason: string
}

export interface CrossCohortApprovalPayload {
  taskKey: string
  approved: true
  reason: string
}

export interface CrossCohortWarningSummary {
  likelyErrors: ParsedCrossCohortWarning[]
  legalPublics: ParsedCrossCohortWarning[]
  ambiguous: ParsedCrossCohortWarning[]
  weakMatches: ParsedCrossCohortWarning[]
  suspiciousTasks: SuspiciousTask[]
}

// ── Parsing ──

const WARNING_KINDS: CrossCohortWarningKind[] = [
  'LIKELY_ERROR_CROSS_COHORT',
  'LEGAL_PUBLIC_CROSS_COHORT',
  'AMBIGUOUS_CLASSGROUP_MATCH',
  'COHORT_WEAK_MATCH_KEPT',
]

function classifyWarning(text: string): CrossCohortWarningKind | null {
  for (const kind of WARNING_KINDS) {
    if (text.includes(kind)) return kind
  }
  return null
}

function extractTaskKey(text: string): string | null {
  const m = text.match(/taskKey=([^)]+)\)/)
  return m ? m[1] : null
}

function extractCourseName(text: string): string | null {
  const m = text.match(/course="([^"]+)"/)
  return m ? m[1] : null
}

/**
 * Parse a list of warning strings (legacy string[] or versioned .warnings)
 * into structured cross-cohort categories.
 */
export function parseCrossCohortWarnings(warnings: readonly string[]): CrossCohortWarningSummary {
  const likelyErrors: ParsedCrossCohortWarning[] = []
  const legalPublics: ParsedCrossCohortWarning[] = []
  const ambiguous: ParsedCrossCohortWarning[] = []
  const weakMatches: ParsedCrossCohortWarning[] = []

  for (const w of warnings) {
    const kind = classifyWarning(w)
    if (!kind) continue

    const parsed: ParsedCrossCohortWarning = {
      kind,
      warningText: w,
      taskKey: extractTaskKey(w),
      courseName: extractCourseName(w),
    }

    switch (kind) {
      case 'LIKELY_ERROR_CROSS_COHORT':
        likelyErrors.push(parsed)
        break
      case 'LEGAL_PUBLIC_CROSS_COHORT':
        legalPublics.push(parsed)
        break
      case 'AMBIGUOUS_CLASSGROUP_MATCH':
        ambiguous.push(parsed)
        break
      case 'COHORT_WEAK_MATCH_KEPT':
        weakMatches.push(parsed)
        break
    }
  }

  // Build suspicious task list from LIKELY_ERROR (deduplicate by taskKey)
  const seen = new Set<string>()
  const suspiciousTasks: SuspiciousTask[] = []
  for (const p of likelyErrors) {
    const key = p.taskKey ?? p.warningText
    if (seen.has(key)) continue
    seen.add(key)
    suspiciousTasks.push({
      taskKey: p.taskKey ?? '',
      title: p.courseName ?? '未知课程',
      warningText: p.warningText,
      courseName: p.courseName,
    })
  }

  return { likelyErrors, legalPublics, ambiguous, weakMatches, suspiciousTasks }
}

/**
 * Normalize warnings from either legacy string[] or versioned { warnings: string[] } shape.
 */
export function normalizeWarnings(warnings: unknown): string[] {
  if (Array.isArray(warnings)) return warnings as string[]
  if (warnings && typeof warnings === 'object' && 'warnings' in (warnings as Record<string, unknown>)) {
    const inner = (warnings as Record<string, unknown>).warnings
    if (Array.isArray(inner)) return inner as string[]
  }
  return []
}

// ── Validation ──

/**
 * Check if all required approvals are satisfied.
 * Returns { ready, reasons } where reasons lists why not ready.
 */
export function validateApprovalState(
  suspiciousTasks: SuspiciousTask[],
  approvals: Record<string, ApprovalState>,
): { ready: boolean; reasons: string[] } {
  if (suspiciousTasks.length === 0) return { ready: true, reasons: [] }

  const reasons: string[] = []
  for (const task of suspiciousTasks) {
    const state = approvals[task.taskKey]
    if (!state || !state.checked) {
      reasons.push(`"${task.title}" 需要勾选确认`)
    } else if (!state.reason || state.reason.trim().length < 5) {
      reasons.push(`"${task.title}" 需要填写审批原因（≥ 5 字符）`)
    }
  }
  return { ready: reasons.length === 0, reasons }
}

// ── Payload ──

/**
 * Build the crossCohortApprovals payload for the confirm API.
 * Only includes approved LIKELY_ERROR tasks.
 */
export function buildCrossCohortApprovalPayload(
  suspiciousTasks: SuspiciousTask[],
  approvals: Record<string, ApprovalState>,
): CrossCohortApprovalPayload[] {
  const payload: CrossCohortApprovalPayload[] = []
  for (const task of suspiciousTasks) {
    const state = approvals[task.taskKey]
    if (state?.checked && state.reason.trim().length >= 5) {
      payload.push({
        taskKey: task.taskKey,
        approved: true,
        reason: state.reason.trim(),
      })
    }
  }
  return payload
}

// ── Error mapping ──

/**
 * Map backend 409 error messages to user-readable Chinese text.
 * Returns null if not an approval-related error.
 */
export function mapApprovalError(error: string, details?: string): string | null {
  const combined = `${error} ${details ?? ''}`
  if (combined.includes('CROSS_COHORT_APPROVAL_REQUIRED') || combined.includes('Missing crossCohortApproval')) {
    return '存在未确认的跨年级合班，请在上方勾选确认并填写原因后重新导入。'
  }
  if (combined.includes('reason required') || combined.includes('REASON_REQUIRED')) {
    return '跨年级合班审批原因不完整，请确保每个确认项的原因不少于 5 个字符。'
  }
  if (combined.includes('CROSS_COHORT_APPROVAL')) {
    return '跨年级合班审批校验失败，请检查确认项后重试。'
  }
  return null
}
