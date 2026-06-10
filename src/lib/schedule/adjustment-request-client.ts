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
    default:
      return `请求失败: ${code}`
  }
}
