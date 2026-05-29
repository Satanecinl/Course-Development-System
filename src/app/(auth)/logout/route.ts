// src/app/(auth)/logout/route.ts
// Logout route — revokes session, deletes cookies, redirects to /login

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, AUTH_CLAIMS_COOKIE_NAME } from '@/lib/auth/constants'
import { revokeSessionByToken } from '@/lib/auth/session'

export async function GET() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

  // Revoke session if token exists (safe if already revoked)
  if (sessionToken) {
    try {
      await revokeSessionByToken(sessionToken)
    } catch {
      // Ignore errors — session may already be revoked or deleted
    }
  }

  // Delete cookies and redirect
  const response = NextResponse.redirect(new URL('/login', 'http://localhost'))

  const expiredCookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  }

  response.cookies.set(SESSION_COOKIE_NAME, '', expiredCookieOptions)
  response.cookies.set(AUTH_CLAIMS_COOKIE_NAME, '', expiredCookieOptions)

  return response
}
