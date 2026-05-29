// scripts/test-auth-helper.ts
// Shared test helper for creating admin/user session cookies
// Used by E2E tests that call API routes via HTTP

import { PrismaClient } from '@prisma/client'
import { createSession } from '../src/lib/auth/session'
import { SESSION_COOKIE_NAME } from '../src/lib/auth/constants'

const prisma = new PrismaClient()

const BASE_URL = 'http://localhost:3000'

// ─── Session Cookie Creation ───────────────────────────────────

/**
 * Create a session cookie header value for the given username.
 * Returns 'session_token=<token>' for use in fetch headers.
 */
export async function createSessionCookie(username: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, isActive: true },
  })

  if (!user) {
    throw new Error(`User '${username}' not found. Run seed:auth first.`)
  }
  if (!user.isActive) {
    throw new Error(`User '${username}' is not active.`)
  }

  const { sessionToken } = await createSession(user.id)
  return `${SESSION_COOKIE_NAME}=${sessionToken}`
}

/**
 * Create an admin session cookie header value.
 */
export async function createAdminCookie(): Promise<string> {
  return createSessionCookie('admin')
}

/**
 * Create a normal user session cookie header value.
 */
export async function createUserCookie(): Promise<string> {
  return createSessionCookie('user')
}

// ─── JSON Response Parsing ─────────────────────────────────────

/**
 * Parse JSON response or print diagnostic info before throwing.
 */
async function parseJsonOrDiagnose(
  response: Response,
  context: { method: string; url: string },
): Promise<unknown> {
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()

  if (!contentType.includes('application/json')) {
    console.error('⚠️  Expected JSON but received non-JSON response')
    console.error({
      method: context.method,
      url: context.url,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      redirected: response.redirected,
      contentType,
      bodyPreview: text.slice(0, 500),
    })
    throw new Error(
      `Expected JSON but received non-JSON response (${response.status} ${response.statusText})`,
    )
  }

  try {
    return JSON.parse(text)
  } catch (error) {
    console.error('⚠️  JSON parse failed despite application/json content-type')
    console.error({
      method: context.method,
      url: context.url,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      redirected: response.redirected,
      contentType,
      bodyPreview: text.slice(0, 500),
    })
    throw error
  }
}

// ─── Core Fetch Helper ─────────────────────────────────────────

/**
 * Fetch JSON from the local dev server with optional auth cookie.
 */
export async function fetchJson(
  path: string,
  options?: RequestInit & { cookie?: string },
): Promise<{ status: number; data: unknown }> {
  const method = options?.method ?? 'GET'
  const url = `${BASE_URL}${path}`
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) ?? {}),
  }
  if (options?.cookie) {
    headers['Cookie'] = options.cookie
  }
  const res = await fetch(url, {
    ...options,
    headers,
  })
  const data = await parseJsonOrDiagnose(res, { method, url })
  return { status: res.status, data }
}

// ─── Convenience Fetch Functions ────────────────────────────────

/**
 * Fetch JSON as admin (creates fresh session cookie).
 */
export async function fetchJsonAsAdmin(
  path: string,
  options?: RequestInit,
): Promise<{ status: number; data: unknown }> {
  const cookie = await createAdminCookie()
  return fetchJson(path, { ...options, cookie })
}

/**
 * Fetch JSON as normal user (creates fresh session cookie).
 */
export async function fetchJsonAsUser(
  path: string,
  options?: RequestInit,
): Promise<{ status: number; data: unknown }> {
  const cookie = await createUserCookie()
  return fetchJson(path, { ...options, cookie })
}

/**
 * Fetch JSON with a pre-created cookie string.
 * Useful when the cookie is created once and reused across multiple calls.
 */
export async function fetchJsonWithCookie(
  path: string,
  cookie: string,
  options?: RequestInit,
): Promise<{ status: number; data: unknown }> {
  return fetchJson(path, { ...options, cookie })
}

// ─── Raw Fetch Helpers ─────────────────────────────────────────

/**
 * Raw fetch with admin cookie (for non-JSON responses like Excel export).
 */
export async function fetchAsAdmin(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const cookie = await createAdminCookie()
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) ?? {}),
    Cookie: cookie,
  }
  return fetch(`${BASE_URL}${path}`, { ...options, headers })
}

/**
 * Raw fetch with a pre-created cookie string.
 */
export async function fetchWithCookie(
  path: string,
  cookie: string,
  options?: RequestInit,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) ?? {}),
    Cookie: cookie,
  }
  return fetch(`${BASE_URL}${path}`, { ...options, headers })
}

// ─── Assertion Helpers ──────────────────────────────────────────

/**
 * Assert response is 401 Unauthorized.
 */
export function expectUnauthorized(
  status: number,
  context?: string,
): void {
  const msg = context ? `${context}: ` : ''
  if (status !== 401) {
    throw new Error(`${msg}Expected 401 but got ${status}`)
  }
}

/**
 * Assert response is 403 Forbidden.
 */
export function expectForbidden(
  status: number,
  context?: string,
): void {
  const msg = context ? `${context}: ` : ''
  if (status !== 403) {
    throw new Error(`${msg}Expected 403 but got ${status}`)
  }
}

// ─── Cleanup ───────────────────────────────────────────────────

/**
 * Cleanup: disconnect prisma client.
 */
export async function cleanup() {
  await prisma.$disconnect()
}
