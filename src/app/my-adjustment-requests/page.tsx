// src/app/my-adjustment-requests/page.tsx
// K31-C: server page wraps client content with ProtectedShell so the
// global sidebar/header is rendered. Auth/permission filtering happens
// in the shell (middleware is first-layer; the shell does the second
// session-based check). All business logic + interactivity lives in the
// client content component.

import { ProtectedShell } from '@/components/layout/protected-shell'
import MyAdjustmentRequestsContent from './my-adjustment-requests-content'

export default function MyAdjustmentRequestsPage() {
  return (
    <ProtectedShell>
      <MyAdjustmentRequestsContent />
    </ProtectedShell>
  )
}
