// src/app/admin/scheduler/page.tsx
// Admin scheduler run gatekeeper page

import { ProtectedShell } from '@/components/layout/protected-shell'
import SchedulerContent from './scheduler-content'

export default function AdminSchedulerPage() {
  return (
    <ProtectedShell>
      <SchedulerContent />
    </ProtectedShell>
  )
}
