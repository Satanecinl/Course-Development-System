// src/app/admin/db/page.tsx
// Admin DB page — server component wrapping client content with ProtectedShell

import { ProtectedShell } from '@/components/layout/protected-shell'
import AdminDbContent from './admin-db-content'

export default function AdminDbPage() {
  return (
    <ProtectedShell>
      <AdminDbContent />
    </ProtectedShell>
  )
}
