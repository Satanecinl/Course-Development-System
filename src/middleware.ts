// src/middleware.ts
// Route protection middleware — reads signed auth claims cookie (no Prisma)

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyAuthClaims } from '@/lib/auth/claims-edge'
import { AUTH_CLAIMS_COOKIE_NAME } from '@/lib/auth/constants'
import {
  isPublicPath,
  isStaticOrInternal,
  hasRequiredRoutePermission,
  getRedirectForUnauthenticated,
  getRedirectForForbidden,
} from '@/lib/auth/route-permissions'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static assets and internal routes
  if (isStaticOrInternal(pathname)) {
    return NextResponse.next()
  }

  // Skip public routes
  if (isPublicPath(pathname)) {
    // Special case: logged-in user visiting /login → redirect to default page
    if (pathname === '/login') {
      const claimsCookie = request.cookies.get(AUTH_CLAIMS_COOKIE_NAME)?.value
      if (claimsCookie) {
        const claims = await verifyAuthClaims(claimsCookie)
        if (claims) {
          return NextResponse.redirect(new URL(claims.defaultRedirect, request.url))
        }
      }
    }
    return NextResponse.next()
  }

  // Protected route — check auth claims
  const claimsCookie = request.cookies.get(AUTH_CLAIMS_COOKIE_NAME)?.value

  if (!claimsCookie) {
    return NextResponse.redirect(
      new URL(getRedirectForUnauthenticated(pathname), request.url)
    )
  }

  const claims = await verifyAuthClaims(claimsCookie)
  if (!claims) {
    // Invalid or expired claims — clear cookie and redirect to login
    const response = NextResponse.redirect(
      new URL(getRedirectForUnauthenticated(pathname), request.url)
    )
    response.cookies.set(AUTH_CLAIMS_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })
    return response
  }

  // Check route permissions
  if (!hasRequiredRoutePermission(claims.permissions, pathname)) {
    return NextResponse.redirect(
      new URL(getRedirectForForbidden(), request.url)
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api/* (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
