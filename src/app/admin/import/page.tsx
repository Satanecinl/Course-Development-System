// src/app/admin/import/page.tsx
// Import management placeholder

import { ProtectedShell } from '@/components/layout/protected-shell'
import { Upload } from 'lucide-react'

export default function AdminImportPage() {
  return (
    <ProtectedShell>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Upload className="w-6 h-6 text-gray-400" />
          <h2 className="text-xl font-bold text-gray-900">导入管理</h2>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">课程表导入管理模块</p>
          <p className="mt-2 text-sm text-gray-400">
            功能建设中，后续版本将提供完整的导入历史查看与管理能力。
          </p>
        </div>
      </div>
    </ProtectedShell>
  )
}
