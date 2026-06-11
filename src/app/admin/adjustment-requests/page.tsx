// src/app/admin/adjustment-requests/page.tsx
// K31-C: server page wraps client content with ProtectedShell so the
// global sidebar/header is rendered. Auth/permission filtering happens
// in the shell. All business logic + interactivity lives in the client
// content component.

import { ProtectedShell } from '@/components/layout/protected-shell'
import AdminAdjustmentRequestsContent from './admin-adjustment-requests-content'

export default function AdminAdjustmentRequestsPage() {
  return (
    <ProtectedShell>
      <AdminAdjustmentRequestsContent />
    </ProtectedShell>
  )
}
