'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * K14-FIX-A: client-side current-user context for frontend permission gating.
 *
 * The server-side `ProtectedShell` resolves the authenticated user (DB session,
 * roles, permissions) and exposes it via this context. Client components that
 * need to gate UI on `data:write` / `schedule:adjust` should use the
 * `useCurrentUser` hook below.
 *
 * Default permission resolution is "deny until proven" — components must check
 * `permissions.has(...)` against the loaded set, not against `undefined`.
 */

export interface CurrentUserSnapshot {
  id: number
  username: string
  displayName: string
  roles: string[]
  permissions: Set<string>
}

const CurrentUserContext = createContext<CurrentUserSnapshot | null>(null)

export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUserSnapshot
  children: ReactNode
}) {
  return (
    <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>
  )
}

export function useCurrentUser(): CurrentUserSnapshot | null {
  return useContext(CurrentUserContext)
}

export function useHasPermission(permission: string): boolean {
  const user = useContext(CurrentUserContext)
  if (!user) return false
  return user.permissions.has(permission)
}
