// src/app/admin/settings/page.tsx
// System settings — semester management (K25-I)

import { ProtectedShell } from '@/components/layout/protected-shell'
import { Settings } from 'lucide-react'
import { SemesterSettingsPanel } from '@/components/settings/semester-settings-panel'

export default function AdminSettingsPage() {
  return (
    <ProtectedShell>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-gray-400" />
          <h2 className="text-xl font-bold text-gray-900">系统设置</h2>
        </div>

        <SemesterSettingsPanel />
      </div>
    </ProtectedShell>
  )
}
