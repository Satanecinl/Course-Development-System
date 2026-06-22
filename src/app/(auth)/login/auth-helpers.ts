// src/app/(auth)/login/auth-helpers.ts
// Pure helper functions (no 'use server' — not server actions)

import type { PermissionKey } from '@/lib/auth/types'

/**
 * Determine default redirect path for an authenticated user.
 */
export function getDefaultRedirectForAuthUser(
  permissions: Set<string>
): string {
  if (permissions.has('schedule:view' as PermissionKey)) return '/dashboard'
  return '/login?error=no-permission'
}
