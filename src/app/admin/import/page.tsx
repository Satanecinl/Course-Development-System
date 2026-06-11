// src/app/admin/import/page.tsx
// K34-A: Import management page. Replaces the previous "feature under
// construction" placeholder with a functional list/detail/upload UI.

import { ProtectedShell } from '@/components/layout/protected-shell'
import ImportManagementContent from './import-management-content'

export const dynamic = 'force-dynamic'

export default function AdminImportPage() {
  return (
    <ProtectedShell>
      <ImportManagementContent />
    </ProtectedShell>
  )
}
