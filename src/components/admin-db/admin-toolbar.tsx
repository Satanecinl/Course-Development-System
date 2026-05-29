'use client'

import { Table, Upload, Plus, History } from 'lucide-react'

interface AdminToolbarProps {
  tableName: string
  recordCount: number
  onImportClick: () => void
  onAddClick: () => void
  onHistoryClick?: () => void
}

export function AdminToolbar({ tableName, recordCount, onImportClick, onAddClick, onHistoryClick }: AdminToolbarProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Table className="w-5 h-5 text-gray-500" />
        <h1 className="text-xl font-bold text-gray-900">{tableName}</h1>
        <span className="text-sm text-gray-500">共 {recordCount} 条记录</span>
      </div>

      <div className="flex items-center gap-2">
        {onHistoryClick && (
          <button
            onClick={onHistoryClick}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            <History className="w-4 h-4" />
            导入历史
          </button>
        )}
        <button
          onClick={onImportClick}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <Upload className="w-4 h-4" />
          导入课程表
        </button>
        <button
          onClick={onAddClick}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          新增
        </button>
      </div>
    </div>
  )
}
