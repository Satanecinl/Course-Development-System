'use client'

import { Database, RefreshCw, ChevronRight } from 'lucide-react'
import type { TableConfig } from '@/lib/admin-db/config'

interface AdminSidebarProps {
  tables: TableConfig[]
  activeTable: string
  counts: Record<string, number>
  onTableChange: (key: string) => void
  onRefresh: () => void
}

export function AdminSidebar({ tables, activeTable, counts, onTableChange, onRefresh }: AdminSidebarProps) {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2 text-gray-900">
          <Database className="w-5 h-5" />
          <h2 className="text-lg font-bold">数据库管理</h2>
        </div>
        <p className="text-xs text-gray-500 mt-1">可视化浏览与编辑数据</p>
      </div>

      <div className="p-3 border-b border-gray-200">
        <button
          onClick={onRefresh}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          刷新数据
        </button>
      </div>

      <nav className="flex-1 overflow-auto p-3 space-y-1">
        {tables.map((t) => (
          <button
            key={t.key}
            onClick={() => onTableChange(t.key)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
              activeTable === t.key
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                activeTable === t.key ? 'bg-white/20 text-white' : t.color
              }`}
            >
              {counts[t.key] ?? 0}
            </span>
            <span className="font-medium">{t.label}</span>
            {activeTable === t.key && <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>
        ))}
      </nav>
    </aside>
  )
}
