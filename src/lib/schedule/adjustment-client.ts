import type { ScheduleAdjustmentInput, ScheduleAdjustmentDryRunResult } from '@/types/schedule-adjustment'

export async function dryRunScheduleAdjustment(
  input: ScheduleAdjustmentInput,
): Promise<{ success: true; dryRun: ScheduleAdjustmentDryRunResult }> {
  const res = await fetch('/api/schedule-adjustments/dry-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export async function createScheduleAdjustment(
  input: ScheduleAdjustmentInput,
): Promise<{ success: true; adjustment: { id: number; status: string }; dryRun: ScheduleAdjustmentDryRunResult }> {
  const res = await fetch('/api/schedule-adjustments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, confirmText: 'CONFIRM_ADJUSTMENT' }),
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export async function voidScheduleAdjustment(
  id: number,
): Promise<{ success: true; id: number; status: string }> {
  const res = await fetch(`/api/schedule-adjustments/${id}/void`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmText: 'VOID_ADJUSTMENT' }),
  })
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}
