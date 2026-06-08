/**
 * K25-D: Unified request-level semester resolution helper.
 *
 * Wraps `resolveSchedulerSemester` with three extra capabilities:
 *   1. Reads from `?semesterId=` query, `X-Semester-Id` header, or body `semesterId`
 *      (in that priority order).
 *   2. Returns a structured `SemesterSource` discriminator for callers that want to
 *      surface "transitional fallback" in their response (so the frontend K25-E
 *      selector can show "auto-detected" vs "explicit user choice").
 *   3. Provides a `KNOWN_SEMESTER_ERRORS` map and `toSemesterErrorResponse` helper
 *      so all routes produce the same error envelope (was previously copy-pasted
 *      per route in K24-A5 era).
 *
 * Behavior is intentionally **backwards-compatible** with `resolveSchedulerSemester`:
 *   - Existing call sites keep working — they only see `id / code / name`.
 *   - New K25-D call sites get the additional `source` field for transitional UI.
 *
 * Fallback policy: when no explicit semesterId is present, the helper falls back to
 * the unique active semester. This is documented as **transitional** — the K25-E
 * frontend selector will start sending `?semesterId=` explicitly, at which point
 * the fallback path should eventually be removed (or downgraded to a warning).
 */
import { prisma } from '@/lib/prisma'

export interface ResolvedSemester {
  id: number
  code: string
  name: string
}

export type SemesterSource = 'query' | 'header' | 'body' | 'activeFallback'

export interface ResolvedSemesterWithSource extends ResolvedSemester {
  /** How this semester was resolved. `activeFallback` is transitional (K25-E). */
  source: SemesterSource
}

/**
 * Parse a `semesterId` value (string from query/header, or unknown body field)
 * into a positive integer or null. Throws `INVALID_SEMESTER_ID` for malformed
 * input so the route can return 400.
 */
export function parseSemesterIdParam(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw <= 0) {
      throw new SemesterError('INVALID_SEMESTER_ID', `semesterId must be a positive integer, got ${raw}`)
    }
    return raw
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new SemesterError('INVALID_SEMESTER_ID', `semesterId must be a positive integer, got "${raw}"`)
    }
    return parsed
  }
  throw new SemesterError('INVALID_SEMESTER_ID', `semesterId must be a number or string, got ${typeof raw}`)
}

/**
 * Custom error type that lets routes discriminate known error codes from
 * generic 500s.
 */
export class SemesterError extends Error {
  public readonly code: 'INVALID_SEMESTER_ID' | 'SEMESTER_NOT_FOUND' | 'NO_ACTIVE_SEMESTER' | 'MULTIPLE_ACTIVE_SEMESTERS'
  public readonly status: number

  constructor(
    code: 'INVALID_SEMESTER_ID' | 'SEMESTER_NOT_FOUND' | 'NO_ACTIVE_SEMESTER' | 'MULTIPLE_ACTIVE_SEMESTERS',
    message: string,
    status: number = 400,
  ) {
    super(message)
    this.name = 'SemesterError'
    this.code = code
    this.status = status
  }
}

export interface ResolveRequestSemesterOptions {
  /** Query string (URLSearchParams) — checked first. */
  searchParams?: URLSearchParams | null
  /** Request headers (for X-Semester-Id). */
  headers?: Headers | null
  /** Request body (parsed JSON or form data) — checked last among explicit sources. */
  body?: Record<string, unknown> | null
  /**
   * If false, require an explicit semesterId. Falls back to NO_ACTIVE_SEMESTER
   * when none can be resolved. Default true (transitional fallback).
   */
  allowActiveFallback?: boolean
}

/**
 * Resolve the semester for an incoming request. Checks, in order:
 *   1. `?semesterId=` query
 *   2. `X-Semester-Id` header
 *   3. `body.semesterId`
 *   4. (transitional) Unique active semester, if `allowActiveFallback` is true.
 *
 * Throws `SemesterError` for invalid input or resolution failures.
 */
export async function resolveRequestSemester(
  opts: ResolveRequestSemesterOptions = {},
): Promise<ResolvedSemesterWithSource> {
  const { searchParams, headers, body, allowActiveFallback = true } = opts

  // 1. Query
  if (searchParams) {
    const raw = searchParams.get('semesterId')
    if (raw != null && raw !== '') {
      const id = parseSemesterIdParam(raw)
      if (id != null) {
        const semester = await prisma.semester.findUnique({ where: { id } })
        if (!semester) {
          throw new SemesterError('SEMESTER_NOT_FOUND', `Semester ${id} not found`)
        }
        return { id: semester.id, code: semester.code, name: semester.name, source: 'query' }
      }
    }
  }

  // 2. Header
  if (headers) {
    const raw = headers.get('x-semester-id') ?? headers.get('X-Semester-Id')
    if (raw != null && raw !== '') {
      const id = parseSemesterIdParam(raw)
      if (id != null) {
        const semester = await prisma.semester.findUnique({ where: { id } })
        if (!semester) {
          throw new SemesterError('SEMESTER_NOT_FOUND', `Semester ${id} not found`)
        }
        return { id: semester.id, code: semester.code, name: semester.name, source: 'header' }
      }
    }
  }

  // 3. Body
  if (body && 'semesterId' in body) {
    const raw = body.semesterId
    if (raw != null) {
      const id = parseSemesterIdParam(raw)
      if (id != null) {
        const semester = await prisma.semester.findUnique({ where: { id } })
        if (!semester) {
          throw new SemesterError('SEMESTER_NOT_FOUND', `Semester ${id} not found`)
        }
        return { id: semester.id, code: semester.code, name: semester.name, source: 'body' }
      }
    }
  }

  // 4. Active fallback (transitional)
  if (!allowActiveFallback) {
    throw new SemesterError('NO_ACTIVE_SEMESTER', 'No explicit semesterId and active fallback is disabled')
  }

  const active = await prisma.semester.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  })

  if (active.length === 0) {
    throw new SemesterError(
      'NO_ACTIVE_SEMESTER',
      'No active semester found. Please set one active semester or pass semesterId explicitly.',
    )
  }

  if (active.length > 1) {
    throw new SemesterError(
      'MULTIPLE_ACTIVE_SEMESTERS',
      `Found ${active.length} active semesters. Please specify semesterId explicitly or keep only one active.`,
    )
  }

  const semester = active[0]
  return { id: semester.id, code: semester.code, name: semester.name, source: 'activeFallback' }
}

/**
 * K25-D: Convert a `SemesterError` (or any error whose message starts with a
 * known prefix) into a structured `NextResponse`. Returns null if the error
 * is not a known semester error.
 */
export interface SemesterErrorResponse {
  response: { error: string; message: string }
  status: number
}

export function toSemesterErrorResponse(error: unknown): SemesterErrorResponse | null {
  if (error instanceof SemesterError) {
    return {
      response: { error: error.code, message: error.message },
      status: error.status,
    }
  }

  if (error instanceof Error) {
    const message = error.message
    const knownPrefixes: Array<{
      prefix: string
      code: 'INVALID_SEMESTER_ID' | 'SEMESTER_NOT_FOUND' | 'NO_ACTIVE_SEMESTER' | 'MULTIPLE_ACTIVE_SEMESTERS'
      status: number
    }> = [
      { prefix: 'SEMESTER_NOT_FOUND', code: 'SEMESTER_NOT_FOUND', status: 400 },
      { prefix: 'NO_ACTIVE_SEMESTER', code: 'NO_ACTIVE_SEMESTER', status: 400 },
      { prefix: 'MULTIPLE_ACTIVE_SEMESTERS', code: 'MULTIPLE_ACTIVE_SEMESTERS', status: 400 },
    ]
    for (const { prefix, code, status } of knownPrefixes) {
      if (message.startsWith(prefix)) {
        return { response: { error: code, message }, status }
      }
    }
  }
  return null
}
