// src/app/admin/scheduler/history/page.tsx
// Admin scheduler run history — read-only audit page

import { ProtectedShell } from '@/components/layout/protected-shell'
import HistoryContent from './history-content'

export default function SchedulerHistoryPage() {
  return (
    <ProtectedShell>
      <HistoryContent />
    </ProtectedShell>
  )
}
