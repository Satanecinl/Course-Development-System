// src/lib/auth/route-permissions.ts
// Route permission rules — centralized, permission-based (not role-based)

import type { PermissionKey } from './types'

// ─── Route Rules ────────────────────────────────────────────────

interface RouteRule {
  pattern: RegExp
  permissions: PermissionKey[] // any of these = allowed
}

const ROUTE_RULES: RouteRule[] = [
  // Dashboard — schedule management
  { pattern: /^\/dashboard/, permissions: ['schedule:view'] },

  // Admin scheduler (auto-scheduling console + history)
  { pattern: /^\/admin\/scheduler/, permissions: ['schedule:adjust'] },

  // Admin import
  { pattern: /^\/admin\/import/, permissions: ['import:manage'] },

  // Admin DB — data write required for CRUD operations
  { pattern: /^\/admin\/db/, permissions: ['data:write'] },

  // Admin settings
  { pattern: /^\/admin\/settings/, permissions: ['settings:manage'] },

  // Admin users
  { pattern: /^\/admin\/users/, permissions: ['users:manage'] },

  // Admin diagnostics
  { pattern: /^\/admin\/diagnostics/, permissions: ['diagnostics:view'] },

  // Data page — normal user landing
  { pattern: /^\/data/, permissions: ['data:read'] },
]

// ─── Public Routes ──────────────────────────────────────────────

const PUBLIC_PATHS = [
  '/login',
  '/logout',
  '/403',
]

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Check if a path is public (no auth required).
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * Check if a path is a static asset / Next.js internal.
 */
export function isStaticOrInternal(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  )
}

/**
 * Get required permissions for a given pathname.
 * Returns null if no rule matches (unprotected by default).
 */
export function getRequiredPermissionsForPath(
  pathname: string
): PermissionKey[] | null {
  for (const rule of ROUTE_RULES) {
    if (rule.pattern.test(pathname)) {
      return rule.permissions
    }
  }
  return null
}

/**
 * Check if user permissions satisfy route requirements.
 * Returns true if no rule matches (unprotected) or user has any required permission.
 */
export function hasRequiredRoutePermission(
  userPermissions: string[],
  pathname: string
): boolean {
  const required = getRequiredPermissionsForPath(pathname)
  if (!required) return true // no rule = allowed
  return required.some((p) => userPermissions.includes(p))
}

/**
 * Get redirect URL for unauthenticated user.
 */
export function getRedirectForUnauthenticated(pathname: string): string {
  const next = encodeURIComponent(pathname)
  return `/login?next=${next}`
}

/**
 * Get redirect URL for forbidden access.
 */
export function getRedirectForForbidden(): string {
  return '/403'
}
