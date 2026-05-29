// src/app/admin/settings/page.tsx
// System settings placeholder

import { ProtectedShell } from '@/components/layout/protected-shell'
import { Settings } from 'lucide-react'

export default function AdminSettingsPage() {
  return (
    <ProtectedShell>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-gray-400" />
          <h2 className="text-xl font-bold text-gray-900">系统设置</h2>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">系统全局配置</p>
          <p className="mt-2 text-sm text-gray-400">
            功能建设中，后续版本将提供学期配置、排课规则、系统参数等管理能力。
          </p>
        </div>
      </div>
    </ProtectedShell>
  )
}
