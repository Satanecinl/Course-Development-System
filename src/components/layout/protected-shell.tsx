// src/components/layout/protected-shell.tsx
// Protected layout shell — server component
// Reads session cookie, gets current user, renders sidebar + header + children
// Middleware does first-layer route protection; this reads real session for layout rendering

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants'
import { getCurrentUser } from '@/lib/auth/current-user'
import { filterNavItems } from '@/lib/auth/navigation'
import { AppSidebar } from './app-sidebar'
import { AppHeader } from './app-header'

interface ProtectedShellProps {
  children: React.ReactNode
}

export async function ProtectedShell({ children }: ProtectedShellProps) {
  // Read session cookie
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!sessionToken) {
    redirect('/login')
  }

  // Get current user from DB (real session, not just claims)
  const user = await getCurrentUser(sessionToken)

  if (!user) {
    redirect('/login')
  }

  // Filter nav items by user permissions
  const navItems = filterNavItems(user.permissions)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <AppSidebar navItems={navItems} />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <AppHeader
          displayName={user.displayName || user.username}
          roles={user.roles}
        />

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
