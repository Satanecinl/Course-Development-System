import type {
  ImportBatchListResponse,
  ImportBatchDetailResponse,
  ImportRollbackDryRunResponse,
  ImportRollbackRealResponse,
  ImportAbandonSuccessResponse,
} from '@/types/import'

export async function fetchImportBatches(): Promise<ImportBatchListResponse> {
  const res = await fetch('/api/admin/import/batches')
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export async function fetchImportBatchDetail(batchId: number): Promise<ImportBatchDetailResponse> {
  const res = await fetch(`/api/admin/import/batches/${batchId}`)
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export async function rollbackImportBatchDryRun(batchId: number): Promise<ImportRollbackDryRunResponse> {
  const res = await fetch('/api/admin/import/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, dryRun: true }),
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export async function rollbackImportBatch(batchId: number): Promise<ImportRollbackRealResponse> {
  const res = await fetch('/api/admin/import/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, dryRun: false, confirmText: 'ROLLBACK_IMPORT' }),
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export async function abandonImportBatch(batchId: number): Promise<ImportAbandonSuccessResponse> {
  const res = await fetch(`/api/admin/import/batches/${batchId}/abandon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmText: 'ABANDON_IMPORT' }),
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export async function parseImportFile(file: File): Promise<{ success: true; batchId: number; semesterId: number; [key: string]: unknown }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/admin/import/parse', {
    method: 'POST',
    body: formData,
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export async function confirmImportDryRun(batchId: number, strategy = 'UPSERT_BY_NATURAL_KEY'): Promise<{ success: true; dryRun: true; plan: unknown }> {
  const res = await fetch('/api/admin/import/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, strategy, dryRun: true }),
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export async function confirmImportReal(batchId: number, strategy = 'UPSERT_BY_NATURAL_KEY'): Promise<{ success: true; dryRun: false; result: unknown }> {
  const res = await fetch('/api/admin/import/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, strategy, dryRun: false, confirmText: 'CONFIRM_IMPORT' }),
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}
