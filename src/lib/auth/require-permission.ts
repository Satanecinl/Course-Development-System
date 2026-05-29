// src/lib/auth/require-permission.ts
// Server-side auth + permission enforcement for API routes
// Reads session cookie from request headers → queries DB → checks permissions
// Does NOT use auth_claims cookie as authorization source

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { SESSION_COOKIE_NAME } from './constants'
import { hashSessionToken } from './crypto'
import type { AuthUser, PermissionKey } from './types'

// ─── Error Responses ─────────────────────────────────────────────

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: 'UNAUTHENTICATED', message: '请先登录' },
    { status: 401 },
  )
}

export function forbiddenResponse(): NextResponse {
  return NextResponse.json(
    { error: 'FORBIDDEN', message: '当前账号没有权限执行该操作' },
    { status: 403 },
  )
}

// ─── Cookie Parsing ──────────────────────────────────────────────

function parseCookieFromHeader(cookieHeader: string, name: string): string | undefined {
  const pairs = cookieHeader.split(';')
  for (const pair of pairs) {
    const [key, ...rest] = pair.split('=')
    if (key?.trim() === name) {
      return rest.join('=').trim()
    }
  }
  return undefined
}

// ─── Core Auth Resolution ────────────────────────────────────────

/**
 * Get current authenticated user from request cookie header.
 * Returns null if no valid session or user is inactive.
 * Uses DB session lookup, NOT claims cookie.
 */
export async function getCurrentAuthUser(request?: Request): Promise<AuthUser | null> {
  try {
    // Read cookie from request headers (works in API routes)
    const cookieHeader = request?.headers.get('cookie') ?? ''
    const sessionToken = parseCookieFromHeader(cookieHeader, SESSION_COOKIE_NAME)
    if (!sessionToken) return null

    // Inline session lookup to avoid module resolution issues
    const tokenHash = hashSessionToken(sessionToken)
    const session = await prisma.session.findUnique({
      where: { tokenHash },
    })

    if (!session) return null
    if (session.revokedAt) return null
    if (session.expiresAt < new Date()) return null

    // Get user with roles and permissions
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    })

    if (!user) return null
    if (!user.isActive) return null

    // Extract roles and permissions
    const roles: string[] = []
    const permissions = new Set<string>()
    for (const ur of user.userRoles) {
      roles.push(ur.role.name)
      for (const rp of ur.role.rolePermissions) {
        permissions.add(rp.permission.key)
      }
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isActive: user.isActive,
      roles,
      permissions,
    }
  } catch (e) {
    console.error('[require-permission] getCurrentAuthUser error:', e)
    // Return null to trigger 401, but log the error
    return null
  }
}

/**
 * Require authenticated user. Returns user or 401 response.
 */
export async function requireAuth(
  request?: Request,
): Promise<
  { user: AuthUser; error?: never } | { user?: never; error: NextResponse }
> {
  const user = await getCurrentAuthUser(request)
  if (!user) {
    return { error: unauthorizedResponse() }
  }
  return { user }
}

/**
 * Require a specific permission. Returns user or 403 response.
 * Also enforces authentication (401 if not logged in).
 */
export async function requirePermission(
  permission: PermissionKey,
  request?: Request,
): Promise<
  { user: AuthUser; error?: never } | { user?: never; error: NextResponse }
> {
  const result = await requireAuth(request)
  if ('error' in result) return result

  if (!result.user.permissions.has(permission)) {
    return { error: forbiddenResponse() }
  }
  return { user: result.user }
}

/**
 * Require any of the listed permissions. Returns user or 403 response.
 * Also enforces authentication (401 if not logged in).
 */
export async function requireAnyPermission(
  permissions: PermissionKey[],
  request?: Request,
): Promise<
  { user: AuthUser; error?: never } | { user?: never; error: NextResponse }
> {
  const result = await requireAuth(request)
  if ('error' in result) return result

  const hasAny = permissions.some((p) => result.user.permissions.has(p))
  if (!hasAny) {
    return { error: forbiddenResponse() }
  }
  return { user: result.user }
}

/**
 * Require all listed permissions. Returns user or 403 response.
 * Also enforces authentication (401 if not logged in).
 */
export async function requireAllPermissions(
  permissions: PermissionKey[],
  request?: Request,
): Promise<
  { user: AuthUser; error?: never } | { user?: never; error: NextResponse }
> {
  const result = await requireAuth(request)
  if ('error' in result) return result

  const hasAll = permissions.every((p) => result.user.permissions.has(p))
  if (!hasAll) {
    return { error: forbiddenResponse() }
  }
  return { user: result.user }
}
