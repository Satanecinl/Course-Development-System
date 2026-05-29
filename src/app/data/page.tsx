// src/app/data/page.tsx
// Data management page — read-only data view for all authenticated users

import { ProtectedShell } from '@/components/layout/protected-shell'
import { DataContent } from './data-content'

export default function DataPage() {
  return (
    <ProtectedShell>
      <DataContent />
    </ProtectedShell>
  )
}
