// src/lib/schedule/adjustment-request-client.ts
// K28-A: Client-side fetch wrappers for the USER adjustment request and
// ADMIN approval APIs.

export type AdjustmentRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export interface AdjustmentRequestListItem {
  id: number
  status: AdjustmentRequestStatus
  semesterId: number
  semesterName?: string
  semesterCode?: string
  sourceScheduleSlotId: number
  sourceDayOfWeek: number | null
  sourceSlotIndex: number | null
  sourceRoomId: number | null
  sourceRoomName?: string | null
  sourceCourseName: string
  sourceTeacherName: string | null
  targetWeek: number
  targetDayOfWeek: number
  targetSlotIndex: number
  targetRoomId: number | null
  reason: string | null
  submittedByUserId: number
  submittedByDisplayName: string
  submittedByRoleSnapshot: string | null
  submittedAt: string
  reviewedByUserId: number | null
  reviewedByDisplayName: string | null
  reviewedAt: string | null
  reviewNote: string | null
  approvedAdjustmentId: number | null
}

export interface AdjustmentRequestDryRunResult {
  canSubmit: boolean
  conflicts: Array<{ type: string; message: string; severity: string }>
  warnings: Array<{ type: string; message: string; severity: string }>
  canApply?: boolean
}

export interface AdjustmentRequestSubmitResult {
  requestId: number
  status: AdjustmentRequestStatus
  submittedBy: { id: number; displayName: string }
}

export interface AdjustmentRequestListResponse {
  success: true
  total: number
  items: AdjustmentRequestListItem[]
}

export interface SubmitPayload {
  sourceScheduleSlotId: number
  /**
   * K32-A2: 当前 dashboard 查看周次（即"原位置"周次）。
   * 提交时写入 ScheduleAdjustmentRequest.sourceWeek，让导出能输出具体日期。
   * 历史数据（K32-A2 之前）无此字段，导出 fallback "第?周 星期X"。
   */
  sourceWeek?: number | null
  targetWeek: number
  targetDayOfWeek: number
  targetSlotIndex: number
  targetRoomId?: number | null
  reason?: string | null
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const code = (data as { error?: string }).error ?? `HTTP ${res.status}`
    throw new AdjustmentRequestError(code, (data as { message?: string }).message)
  }
  return data as T
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const code = (data as { error?: string }).error ?? `HTTP ${res.status}`
    throw new AdjustmentRequestError(code, (data as { message?: string }).message)
  }
  return data as T
}

export class AdjustmentRequestError extends Error {
  code: string
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'AdjustmentRequestError'
  }
}

// USER endpoints

export function dryRunAdjustmentRequest(payload: SubmitPayload) {
  return postJson<{ success: true; dryRun: AdjustmentRequestDryRunResult }>(
    '/api/schedule-adjustment-requests/dry-run',
    payload,
  )
}

export function submitAdjustmentRequest(payload: SubmitPayload) {
  return postJson<{ success: true; request: AdjustmentRequestSubmitResult }>(
    '/api/schedule-adjustment-requests',
    payload,
  )
}

export function listMyAdjustmentRequests() {
  return getJson<AdjustmentRequestListResponse>('/api/schedule-adjustment-requests/mine')
}

export function cancelMyAdjustmentRequest(requestId: number) {
  return postJson<{ success: true; requestId: number; status: AdjustmentRequestStatus }>(
    `/api/schedule-adjustment-requests/${requestId}/cancel`,
    {},
  )
}

// ADMIN endpoints

export function listAdminAdjustmentRequests(filter: {
  status?: AdjustmentRequestStatus | 'ALL'
  semesterId?: number
  submittedByUserId?: number
}) {
  const qs = new URLSearchParams()
  if (filter.status) qs.set('status', filter.status)
  if (filter.semesterId != null) qs.set('semesterId', String(filter.semesterId))
  if (filter.submittedByUserId != null)
    qs.set('submittedByUserId', String(filter.submittedByUserId))
  const url = `/api/admin/schedule-adjustment-requests?${qs.toString()}`
  return getJson<AdjustmentRequestListResponse>(url)
}

export function approveAdjustmentRequest(requestId: number, reviewNote?: string) {
  return postJson<{ success: true; adjustmentId: number; requestId: number }>(
    `/api/admin/schedule-adjustment-requests/${requestId}/approve`,
    { reviewNote: reviewNote ?? null },
  )
}

export function rejectAdjustmentRequest(requestId: number, reviewNote: string) {
  return postJson<{ success: true; requestId: number; status: AdjustmentRequestStatus }>(
    `/api/admin/schedule-adjustment-requests/${requestId}/reject`,
    { reviewNote },
  )
}

// K28-A2: Plan recommendations for USER request flow

export interface PlanRecommendationRequest {
  scheduleSlotId: number
  preferredWeek?: number
  preferredDayOfWeek?: number | null
  limit?: number
}

export interface PlanRecommendationPlan {
  targetWeek: number
  targetDayOfWeek: number
  targetSlotIndex: number
  roomId: number
  roomName: string
  building: string | null
  capacity: number
  score: number
  reasons: string[]
  warnings: string[]
  isPreferredWeek: boolean
  isPreferredDay: boolean
}

export interface PlanRecommendationResult {
  ok: boolean
  minimumSatisfied: boolean
  plans: PlanRecommendationPlan[]
  preferredWeekAvailable: boolean
  preferredDayAvailable: boolean
  searched?: {
    preferredWeek: number
    preferredWeekPlanCount: number
    fallbackPlanCount: number
    preferredDayOfWeek: number | null
    preferredDayPlanCount: number
    sameWeekOtherDayPlanCount: number
  }
  message?: string
  workTimeSource?: string
  allowWeekend?: boolean
}

export function fetchUserPlanRecommendations(payload: PlanRecommendationRequest) {
  return postJson<PlanRecommendationResult>(
    '/api/schedule-adjustment-requests/recommendations',
    payload,
  )
}

// K32-A: Export adjustment application form (Excel)
//
// Hits USER or ADMIN export route. Returns a Blob so the caller can trigger
// a browser download. We use fetch + blob() (not a direct <a href>) so the
// session cookie is included in the request and the server-side 401/403
// response can be surfaced as a typed error.

export interface ExportFormOptions {
  /** true → use the ADMIN route (no ownership check). false → USER route. */
  isAdmin?: boolean
}

export async function exportAdjustmentRequestForm(
  requestId: number,
  options: ExportFormOptions = {},
): Promise<Blob> {
  const isAdmin = options.isAdmin === true
  const base = isAdmin
    ? '/api/admin/schedule-adjustment-requests'
    : '/api/schedule-adjustment-requests'
  const url = `${base}/${requestId}/export-form`
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) {
    let code = `HTTP ${res.status}`
    let message: string | undefined
    try {
      const data = (await res.json()) as { error?: string; message?: string }
      code = data.error ?? code
      message = data.message
    } catch {
      // non-json body
    }
    throw new AdjustmentRequestError(code, message)
  }
  return res.blob()
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function getAdjustmentRequestErrorMessage(code: string): string {
  switch (code) {
    case 'UNAUTHENTICATED':
      return '请先登录后再访问调课申请'
    case 'FORBIDDEN':
      return '当前账号没有权限访问调课申请 (需要 adjustment-request:* 权限)'
    case 'SOURCE_SLOT_NOT_FOUND':
      return '原课表条目不存在或已被删除'
    case 'SOURCE_SLOT_SEMESTER_MISMATCH':
      return '原课表条目不属于当前学期'
    case 'DRY_RUN_FAILED':
      return '干跑检测到冲突，请调整目标位置或解决冲突'
    case 'DRY_RUN_FAILED_AT_APPROVAL':
      return '审批时重新干跑发现冲突，请先与用户沟通'
    case 'NOT_OWNER':
      return '只能取消自己提交的申请'
    case 'NOT_PENDING':
      return '该申请已不在待审批状态，无法操作'
    case 'REVIEW_NOTE_REQUIRED':
      return '拒绝时必须填写审批备注'
    case 'REQUEST_NOT_FOUND':
      return '未找到该申请'
    case 'INVALID_INPUT':
      return '提交参数不合法'
    case 'TEMPLATE_NOT_FOUND':
      return '导出模板缺失，请联系管理员'
    case 'EXPORT_FAILED':
      return '导出失败，请稍后重试'
    default:
      return `请求失败: ${code}`
  }
}
