// src/app/admin/settings/page.tsx
// System settings center — module navigation shell (K26-A)

import { ProtectedShell } from '@/components/layout/protected-shell'
import { Settings } from 'lucide-react'
import { SettingsCenter } from '@/components/settings/settings-center'

export default function AdminSettingsPage() {
  return (
    <ProtectedShell>
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-gray-400" />
            <h2 className="text-xl font-bold text-gray-900">系统设置</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            集中管理学期、排课参数、调课规则、导入规则和系统维护配置。
          </p>
        </div>

        <SettingsCenter />
      </div>
    </ProtectedShell>
  )
}
