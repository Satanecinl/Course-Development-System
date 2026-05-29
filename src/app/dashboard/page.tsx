// src/app/dashboard/page.tsx
// Dashboard page — server component wrapping client content with ProtectedShell

import { ProtectedShell } from '@/components/layout/protected-shell'
import DashboardContent from './dashboard-content'

export default function DashboardPage() {
  return (
    <ProtectedShell>
      <DashboardContent />
    </ProtectedShell>
  )
}
