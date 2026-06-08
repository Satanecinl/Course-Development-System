/**
 * src/lib/settings/worktime-settings-client.ts
 *
 * K26-H: WorkTime settings UI client helper.
 * Wraps K26-G WorkTime API endpoints for frontend consumption.
 */

import type {
  WorkTimeConfigDTO,
  CreateWorkTimeConfigInput,
  UpdateWorkTimeConfigInput,
  ResolvedWorkTimeConfig,
} from '@/types/worktime'

interface ApiResponse<T> {
  success: boolean
  data?: T
  item?: T
  items?: T[]
  error?: string
  message?: string
  count?: number
  semesterId?: number
  source?: string
  config?: WorkTimeConfigDTO
  id?: number
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data: ApiResponse<T> = await res.json()
  if (!res.ok || !data.success) {
    const error = new Error(data.message || data.error || '请求失败') as Error & { code?: string }
    error.code = data.error
    throw error
  }
  return data as unknown as T
}

// ── List ──

export async function listWorkTimeConfigs(params: {
  semesterId?: number
  includeSlots?: boolean
  includeInactive?: boolean
} = {}): Promise<{ items: WorkTimeConfigDTO[]; count: number }> {
  const searchParams = new URLSearchParams()
  if (params.semesterId != null) searchParams.set('semesterId', String(params.semesterId))
  if (params.includeSlots) searchParams.set('includeSlots', 'true')
  if (params.includeInactive) searchParams.set('includeInactive', 'true')

  const res = await fetch(`/api/admin/worktime-configs?${searchParams}`)
  const data = await handleResponse<{ items: WorkTimeConfigDTO[]; count: number }>(res)
  return { items: data.items ?? [], count: data.count ?? 0 }
}

// ── Get ──

export async function getWorkTimeConfig(id: number): Promise<WorkTimeConfigDTO> {
  const res = await fetch(`/api/admin/worktime-configs/${id}`)
  const data = await handleResponse<{ item: WorkTimeConfigDTO }>(res)
  return data.item
}

// ── Create ──

export async function createWorkTimeConfig(
  input: CreateWorkTimeConfigInput,
): Promise<WorkTimeConfigDTO> {
  const res = await fetch('/api/admin/worktime-configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await handleResponse<{ item: WorkTimeConfigDTO }>(res)
  return data.item
}

// ── Update ──

export async function updateWorkTimeConfig(
  id: number,
  input: UpdateWorkTimeConfigInput,
): Promise<WorkTimeConfigDTO> {
  const res = await fetch(`/api/admin/worktime-configs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await handleResponse<{ item: WorkTimeConfigDTO }>(res)
  return data.item
}

// ── Delete ──

export async function deleteWorkTimeConfig(id: number): Promise<{ id: number }> {
  const res = await fetch(`/api/admin/worktime-configs/${id}`, {
    method: 'DELETE',
  })
  const data = await handleResponse<{ id: number }>(res)
  return { id: data.id ?? id }
}

// ── Activate ──

export async function activateWorkTimeConfig(id: number): Promise<WorkTimeConfigDTO> {
  const res = await fetch(`/api/admin/worktime-configs/${id}/activate`, {
    method: 'POST',
  })
  const data = await handleResponse<{ item: WorkTimeConfigDTO }>(res)
  return data.item
}

// ── Resolved ──

export async function resolveWorkTimeConfig(
  semesterId?: number,
): Promise<ResolvedWorkTimeConfig> {
  const searchParams = new URLSearchParams()
  if (semesterId != null) searchParams.set('semesterId', String(semesterId))

  const res = await fetch(`/api/admin/worktime-configs/resolved?${searchParams}`)
  const data = await handleResponse<ResolvedWorkTimeConfig>(res)
  return {
    semesterId: data.semesterId,
    source: data.source as 'database' | 'staticFallback',
    config: data.config,
  }
}

// ── Error code to Chinese message ──

export function getWorkTimeErrorMessage(error: Error & { code?: string }): string {
  const code = error.code
  switch (code) {
    case 'SEMESTER_NOT_FOUND':
      return '学期不存在'
    case 'WORKTIME_CONFIG_NOT_FOUND':
      return '作息配置不存在'
    case 'WORKTIME_CONFIG_NAME_EXISTS':
      return '同名配置已存在，请使用其他名称'
    case 'WORKTIME_CONFIG_DEFAULT_IN_USE':
      return '默认配置不能删除'
    case 'WORKTIME_CONFIG_LAST_ACTIVE':
      return '该学期最后一个活跃配置不能删除'
    case 'WORKTIME_CONFIG_USED_BY_RUN':
      return '该配置已被排课任务引用，不能删除'
    case 'INVALID_SLOT_DEFINITION':
      return '节次定义无效'
    case 'INVALID_TIME_FORMAT':
      return '时间格式无效，请使用 HH:mm 格式'
    case 'INVALID_REQUEST':
      return '请求参数无效'
    default:
      return error.message || '操作失败，请重试'
  }
}
