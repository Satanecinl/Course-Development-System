// src/app/(auth)/logout/route.ts
// Logout route — revokes session, deletes cookies, redirects to /login
//
// K26-Q2A fix: build the redirect URL from the incoming request URL
// (using `new URL('/login', request.url)`) so the browser is sent back to
// `/login` on the SAME origin + port. The previous implementation
// hardcoded the redirect base URL to a localhost origin (no port), which
// produced a /login URL on port 80 and caused ERR_CONNECTION_REFUSED
// when the dev server was on a different port (e.g. 3000).

import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, AUTH_CLAIMS_COOKIE_NAME } from '@/lib/auth/constants'
import { revokeSessionByToken } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
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

  // Delete cookies and redirect — preserve current origin and port
  // by deriving the target URL from the incoming request URL.
  const response = NextResponse.redirect(new URL('/login', request.url))

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
