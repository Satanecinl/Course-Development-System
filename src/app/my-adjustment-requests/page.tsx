// src/app/my-adjustment-requests/page.tsx
// K31-C: server page wraps client content with ProtectedShell so the
// global sidebar/header is rendered. Auth/permission filtering happens
// in the shell (middleware is first-layer; the shell does the second
// session-based check). All business logic + interactivity lives in the
// client content component.

import { ProtectedShell } from '@/components/layout/protected-shell'
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants'
import { getCurrentUser } from '@/lib/auth/current-user'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import MyAdjustmentRequestsContent from './my-adjustment-requests-content'

export default async function MyAdjustmentRequestsPage() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const user = sessionToken ? await getCurrentUser(sessionToken) : null

  if (user?.roles.some((role) => role.toUpperCase() === 'ADMIN')) {
    redirect('/admin/adjustment-requests')
  }

  return (
    <ProtectedShell>
      <MyAdjustmentRequestsContent />
    </ProtectedShell>
  )
}
