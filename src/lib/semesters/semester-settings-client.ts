/**
 * K25-I: Semester settings client helpers.
 *
 * Typed wrappers around the K25-H semester API for the settings UI.
 * All functions throw on non-success responses with the server error message.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SemesterWithCounts {
  id: number
  name: string
  code: string
  academicYear: string | null
  term: string | null
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  counts?: {
    classGroups: number
    teachingTasks: number
    scheduleSlots: number
    scheduleAdjustments: number
    schedulingRuns: number
    schedulingConfigs: number
    importBatches: number
    total: number
  }
  canDelete?: boolean
  deleteBlockers?: string[]
}

export interface SemesterCreateInput {
  name: string
  code: string
  academicYear?: string
  term?: string
  startsAt?: string
  endsAt?: string
  isActive?: boolean
}

export interface SemesterUpdateInput {
  name?: string
  code?: string
  academicYear?: string | null
  term?: string | null
  startsAt?: string | null
  endsAt?: string | null
  isActive?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json()
  if (!res.ok || data.success === false) {
    const err = new Error(data.message || data.error || `HTTP ${res.status}`)
    ;(err as Error & { code?: string; status?: number }).code = data.error
    ;(err as Error & { code?: string; status?: number }).status = res.status
    throw err
  }
  return data as T
}

// ─── API calls ───────────────────────────────────────────────────────────────

export async function fetchSemestersWithCounts(): Promise<{
  semesters: SemesterWithCounts[]
  activeSemesterId: number | null
}> {
  const res = await fetch('/api/semesters?includeCounts=true')
  return handleResponse(res)
}

export async function createSemester(input: SemesterCreateInput): Promise<{ semester: SemesterWithCounts }> {
  const res = await fetch('/api/semesters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handleResponse(res)
}

export async function updateSemester(id: number, input: SemesterUpdateInput): Promise<{ semester: SemesterWithCounts }> {
  const res = await fetch(`/api/semesters/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handleResponse(res)
}

export async function deleteSemester(id: number): Promise<{ deletedSemesterId: number }> {
  const res = await fetch(`/api/semesters/${id}`, {
    method: 'DELETE',
  })
  return handleResponse(res)
}

export async function activateSemester(id: number): Promise<{ semester: SemesterWithCounts; activeSemesterId: number }> {
  const res = await fetch(`/api/semesters/${id}/activate`, {
    method: 'POST',
  })
  return handleResponse(res)
}
