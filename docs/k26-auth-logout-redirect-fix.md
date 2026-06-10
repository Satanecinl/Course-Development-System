# K26-Q2A: Auth Logout Redirect Fix

## 1. Bug

User clicked the "退出" (Logout) link in the top-right corner while on
`http://localhost:3000/dashboard`. The browser was redirected to
`http://localhost/login` (port 80) and showed `ERR_CONNECTION_REFUSED`,
because nothing was listening on port 80.

Expected behavior: redirect to `http://localhost:3000/login` (preserve
the current origin and port) or simply `/login` (relative URL, browser
keeps origin/port automatically).

## 2. Root Cause

`src/app/(auth)/logout/route.ts` constructed the redirect URL with a
hardcoded base:

```ts
// BEFORE
return NextResponse.redirect(new URL('/login', 'http://localhost'))
```

`new URL('/login', 'http://localhost')` produces the absolute URL
`http://localhost/login` — no port, defaults to 80. The dev server is
on port 3000, so the browser's GET to port 80 fails with
`ERR_CONNECTION_REFUSED`.

The handler signature was also `export async function GET()` with no
`request` parameter, so even if a developer wanted to use the request
origin, the data wasn't available.

## 3. Fix

```ts
// AFTER
export async function GET(request: NextRequest) {
  // ...
  const response = NextResponse.redirect(new URL('/login', request.url))
  // ...
}
```

`request.url` is the full URL of the incoming GET, e.g.
`http://localhost:3000/logout`. `new URL('/login', request.url)`
resolves the path against that base, producing
`http://localhost:3000/login`. The browser is sent back to `/login` on
the same origin and port.

## 4. Files Changed

```
M  src/app/(auth)/logout/route.ts   # import NextRequest; accept request; use request.url
A  scripts/verify-auth-logout-redirect-k26-q2a.ts
A  docs/k26-auth-logout-redirect-fix.md
A  docs/k26-auth-logout-redirect-fix.json
```

## 5. What Was NOT Touched

- `prisma/schema.prisma` — unchanged
- `prisma/migrations/` — unchanged
- DB — no writes
- RBAC / permission matrix — unchanged
- `src/lib/auth/session.ts` (revokeSessionByToken) — unchanged
- Cookie names / `SESSION_COOKIE_NAME` / `AUTH_CLAIMS_COOKIE_NAME` — unchanged
- Cookie deletion options (httpOnly, sameSite, secure, path, maxAge) — unchanged
- `src/components/layout/app-header.tsx` logout `<a href="/logout">` — unchanged
- K22 expected — unchanged
- No new `package.json` scripts

## 6. Verification

### Static (script)

```
$ npx tsx scripts/verify-auth-logout-redirect-k26-q2a.ts
... 17/17 PASS
K26-Q2A AUTH LOGOUT REDIRECT VERIFY PASS
```

Checks:
- No hardcoded `http://localhost/login` anywhere in `src/`
- No hardcoded `localhost/login` (string literal) in `src/`
- Logout route uses `new URL('/login', request.url)`
- Logout route does NOT use `new URL('/login', 'http://localhost')`
- Logout route does NOT use bare `http://localhost`
- Logout route imports `NextRequest`
- Logout route handler signature accepts `request: NextRequest`
- App-header logout link points to `/logout`

### Browser manual test (required)

1. Start dev server: `npm run dev`
2. Open `http://localhost:3000/login`
3. Log in as an admin user
4. Land on `/dashboard`
5. Click top-right "退出"
6. Browser should redirect to `http://localhost:3000/login` (NOT
   `http://localhost/login`)
7. No `ERR_CONNECTION_REFUSED`
8. After logout, accessing `/dashboard` should be intercepted by the
   auth middleware and bounce back to `/login`

### Pipeline

- `npx prisma validate` — PASS
- `npx prisma migrate status` — up to date
- `npm run build` — PASS
- `npm run lint` — 184/146 baseline
- `npm run test:auth-foundation` — 53/1 pre-existing

## 7. RBAC / Auth Impact

- RBAC: unchanged
- Auth flow: unchanged (same cookie names, same session-revoke call)
- `requirePermission` / `requireAnyPermission` / `requireAllPermissions`: unchanged
- Permission matrix: unchanged

The only change is the destination URL of the redirect, which is a
purely cosmetic / connectivity fix.

## 8. Recommended Next Stage

`K27-SYSTEM-WIDE-REAL-USAGE-TRIAL` — proceed with end-to-end
real-flow trial as planned in the K26 system-settings closeout.
