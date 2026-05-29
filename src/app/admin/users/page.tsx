// src/app/admin/users/page.tsx
// User management page — server component wrapping client content with ProtectedShell

import { ProtectedShell } from '@/components/layout/protected-shell'
import { UsersContent } from './users-content'

export default function AdminUsersPage() {
  return (
    <ProtectedShell>
      <UsersContent />
    </ProtectedShell>
  )
}
