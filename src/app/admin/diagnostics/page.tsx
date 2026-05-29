// src/app/admin/diagnostics/page.tsx
// Diagnostics tool placeholder

import { ProtectedShell } from '@/components/layout/protected-shell'
import { Activity } from 'lucide-react'

export default function AdminDiagnosticsPage() {
  return (
    <ProtectedShell>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Activity className="w-6 h-6 text-gray-400" />
          <h2 className="text-xl font-bold text-gray-900">诊断工具</h2>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">排课冲突诊断与系统健康检查</p>
          <p className="mt-2 text-sm text-gray-400">
            功能建设中，后续版本将提供容量冲突检测、排课质量分析等诊断能力。
          </p>
        </div>
      </div>
    </ProtectedShell>
  )
}
