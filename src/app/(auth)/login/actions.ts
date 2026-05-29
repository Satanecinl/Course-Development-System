'use server'

// src/app/(auth)/login/actions.ts
// Login server action + testable helpers

import { prisma } from '@/lib/prisma'
import { verifyPassword } from '@/lib/auth/crypto'
import { createSession } from '@/lib/auth/session'
import { SESSION_COOKIE_NAME, AUTH_CLAIMS_COOKIE_NAME, SESSION_DURATION_HOURS } from '@/lib/auth/constants'
import { signAuthClaims, buildAuthClaims } from '@/lib/auth/claims'
import { cookies } from 'next/headers'
import { getDefaultRedirectForAuthUser } from './auth-helpers'

// ─── Types ──────────────────────────────────────────────────────

export interface AuthUserWithRoles {
  id: number
  username: string
  displayName: string
  isActive: boolean
  roles: string[]
  permissions: Set<string>
}

export interface LoginResult {
  success: boolean
  error?: string
  redirect?: string
}

// ─── Testable Helpers ───────────────────────────────────────────

/**
 * Authenticate user by username and password.
 * Returns user with permissions on success, or error message on failure.
 */
export async function authenticateUser(
  username: string,
  password: string
): Promise<{ user: AuthUserWithRoles } | { error: string }> {
  const trimmed = username.trim()

  if (!trimmed || !password) {
    return { error: '用户名和密码不能为空' }
  }

  const user = await prisma.user.findUnique({
    where: { username: trimmed },
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

  if (!user) {
    return { error: '用户名或密码错误' }
  }

  if (!user.isActive) {
    return { error: '账号已停用' }
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    return { error: '用户名或密码错误' }
  }

  // Extract permissions and roles
  const permissions = new Set<string>()
  const roles: string[] = []
  for (const ur of user.userRoles) {
    roles.push(ur.role.name)
    for (const rp of ur.role.rolePermissions) {
      permissions.add(rp.permission.key)
    }
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isActive: user.isActive,
      roles,
      permissions,
    },
  }
}

/**
 * Create a login session and return the raw token.
 */
export async function createLoginSession(
  userId: number
): Promise<{ sessionToken: string }> {
  const { sessionToken } = await createSession(userId)
  return { sessionToken }
}

// ─── Server Action ──────────────────────────────────────────────

export async function loginAction(
  _prevState: LoginResult | null,
  formData: FormData
): Promise<LoginResult> {
  const username = (formData.get('username') as string) ?? ''
  const password = (formData.get('password') as string) ?? ''

  const result = await authenticateUser(username, password)

  if ('error' in result) {
    return { success: false, error: result.error }
  }

  const { user } = result

  // Create session
  const { sessionToken } = await createLoginSession(user.id)

  // Determine redirect
  const redirectPath = getDefaultRedirectForAuthUser(user.permissions)

  // Build auth claims for middleware
  const claims = buildAuthClaims({
    id: user.id,
    username: user.username,
    roles: user.roles,
    permissions: user.permissions,
    defaultRedirect: redirectPath,
  })
  const claimsValue = signAuthClaims(claims)

  // Set cookies
  const cookieStore = await cookies()
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DURATION_HOURS * 60 * 60,
  }

  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, cookieOptions)
  cookieStore.set(AUTH_CLAIMS_COOKIE_NAME, claimsValue, cookieOptions)

  return { success: true, redirect: redirectPath }
}
