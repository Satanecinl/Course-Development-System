'use client'

import { Table, Plus, History } from 'lucide-react'

interface AdminToolbarProps {
  tableName: string
  recordCount: number
  onAddClick: () => void
  onHistoryClick?: () => void
  canCreate?: boolean
  /** L8-C5A: optional badge text, e.g. "全局主数据" */
  badge?: string
}

export function AdminToolbar({ tableName, recordCount, onAddClick, onHistoryClick, canCreate = true, badge }: AdminToolbarProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Table className="w-5 h-5 text-gray-500" />
        <h1 className="text-xl font-bold text-gray-900">{tableName}</h1>
        {badge && (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
            {badge}
          </span>
        )}
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
          onClick={onAddClick}
          disabled={!canCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          新增
        </button>
      </div>
    </div>
  )
}
