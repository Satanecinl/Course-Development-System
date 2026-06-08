import { create } from 'zustand'

const STORAGE_KEY = 'course-system.currentSemesterId'

export interface SemesterSummary {
  id: number
  name: string
  code: string
  academicYear: string | null
  term: string | null
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
}

interface SemesterState {
  semesters: SemesterSummary[]
  currentSemesterId: number | null
  currentSemesterName: string | null
  isActiveSemester: boolean
  loaded: boolean
  loading: boolean
  error: string | null
  fetchSemesters: () => Promise<void>
  setCurrentSemester: (id: number) => void
  getCurrentSemesterId: () => number | null
}

/**
 * Read persisted semesterId from localStorage.
 * Returns the integer id or null if not set / invalid.
 */
function readPersistedId(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null || raw === '') return null
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed <= 0) return null
    return parsed
  } catch {
    return null
  }
}

function persistId(id: number | null) {
  if (typeof window === 'undefined') return
  try {
    if (id == null) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, String(id))
    }
  } catch {
    // localStorage quota or privacy mode — silently ignore
  }
}

export const useSemesterStore = create<SemesterState>((set, get) => ({
  semesters: [],
  currentSemesterId: null,
  currentSemesterName: null,
  isActiveSemester: true,
  loaded: false,
  loading: false,
  error: null,

  fetchSemesters: async () => {
    if (get().loading) return
    set({ loading: true, error: null })
    try {
      const res = await fetch('/api/semesters')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to load semesters')

      const semesters: SemesterSummary[] = data.semesters ?? []
      const activeSemesterId: number | null = data.activeSemesterId ?? null

      // Determine current semester:
      // 1. Persisted id if still in the list
      // 2. Otherwise active semester
      // 3. Otherwise first in list
      const persisted = readPersistedId()
      const persistedStillExists = persisted != null && semesters.some((s) => s.id === persisted)

      const chosenId = persistedStillExists
        ? persisted
        : activeSemesterId ?? semesters[0]?.id ?? null

      const chosen = semesters.find((s) => s.id === chosenId)

      // Persist the resolved choice
      persistId(chosenId)

      set({
        semesters,
        currentSemesterId: chosenId,
        currentSemesterName: chosen?.name ?? null,
        isActiveSemester: chosenId === activeSemesterId,
        loaded: true,
        loading: false,
      })
    } catch (err) {
      set({ error: String(err), loading: false })
    }
  },

  setCurrentSemester: (id: number) => {
    const { semesters, currentSemesterId } = get()
    if (id === currentSemesterId) return
    const chosen = semesters.find((s) => s.id === id)
    if (!chosen) return
    const activeId = semesters.find((s) => s.isActive)?.id ?? null
    persistId(id)
    set({
      currentSemesterId: id,
      currentSemesterName: chosen.name,
      isActiveSemester: id === activeId,
    })
  },

  getCurrentSemesterId: () => get().currentSemesterId,
}))

/**
 * Helper: append `?semesterId=<id>` to a URL.
 * Returns the url unchanged if currentSemesterId is null.
 */
export function withSemesterQuery(url: string, semesterId: number | null): string {
  if (semesterId == null) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}semesterId=${semesterId}`
}
