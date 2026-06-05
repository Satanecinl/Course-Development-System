// src/lib/scheduler-config-client.ts
// K21-FIX-G-SOLVER-CONFIG-UI
//
// Browser-side fetch helpers for the SchedulingConfig CRUD API.
// Pure functions, no React state. Returns parsed JSON or throws.
//
// Companion to src/lib/scheduler/config.ts (server-side) and
// src/types/scheduling-config.ts (shared types).

import type {
  CreateSchedulingConfigInput,
  SchedulingConfig,
  UpdateSchedulingConfigInput,
} from '@/types/scheduling-config'

// ─── CRUD calls ───────────────────────────────────────────────────

export async function fetchSchedulingConfigs(
  semesterId?: number,
): Promise<SchedulingConfig[]> {
  const params = new URLSearchParams()
  if (semesterId != null) params.set('semesterId', String(semesterId))
  const url = `/api/admin/scheduler/configs${params.toString() ? `?${params.toString()}` : ''}`

  const res = await fetch(url, { method: 'GET' })
  const json = await res.json().catch(() => ({}))

  if (!res.ok || !json.success) {
    throw json as { success: false; error: string; message: string }
  }
  return json.configs as SchedulingConfig[]
}

export async function fetchSchedulingConfigById(id: number): Promise<SchedulingConfig> {
  const res = await fetch(`/api/admin/scheduler/configs/${id}`, { method: 'GET' })
  const json = await res.json().catch(() => ({}))

  if (!res.ok || !json.success) {
    throw json as { success: false; error: string; message: string }
  }
  return json.config as SchedulingConfig
}

export async function createSchedulingConfig(
  input: CreateSchedulingConfigInput,
): Promise<SchedulingConfig> {
  const res = await fetch('/api/admin/scheduler/configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = await res.json().catch(() => ({}))

  if (!res.ok || !json.success) {
    throw json as { success: false; error: string; message: string }
  }
  return json.config as SchedulingConfig
}

export async function updateSchedulingConfig(
  id: number,
  input: UpdateSchedulingConfigInput,
): Promise<SchedulingConfig> {
  const res = await fetch(`/api/admin/scheduler/configs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = await res.json().catch(() => ({}))

  if (!res.ok || !json.success) {
    throw json as { success: false; error: string; message: string }
  }
  return json.config as SchedulingConfig
}

export async function deleteSchedulingConfig(id: number): Promise<void> {
  const res = await fetch(`/api/admin/scheduler/configs/${id}`, { method: 'DELETE' })
  const json = await res.json().catch(() => ({}))

  if (!res.ok || !json.success) {
    throw json as { success: false; error: string; message: string; runIds?: number[] }
  }
}
