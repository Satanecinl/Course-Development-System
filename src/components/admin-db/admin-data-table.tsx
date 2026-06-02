'use client'

import { Pencil, Trash2 } from 'lucide-react'
import type { DbRecord } from '@/lib/admin-db/types'
import { fieldToChinese, formatValue } from '@/lib/admin-db/utils'

interface AdminDataTableProps {
  records: DbRecord[]
  loading: boolean
  columns: string[]
  activeTable: string
  getCellValue: (record: DbRecord, col: string, table: string) => unknown
  onEdit: (record: DbRecord) => void
  onDelete: (id: number) => void
  canEdit?: boolean
  canDelete?: boolean
}

export function AdminDataTable({ records, loading, columns, activeTable, getCellValue, onEdit, onDelete, canEdit = true, canDelete = true }: AdminDataTableProps) {
  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>
  }

  if (records.length === 0) {
    return <div className="flex items-center justify-center h-64 text-gray-400">暂无数据</div>
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap"
                >
                  {fieldToChinese(col)}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.map((record, idx) => (
              <tr key={record.id ?? idx} className="hover:bg-gray-50 transition-colors">
                {columns.map((col) => (
                  <td
                    key={col}
                    className="px-4 py-3 text-gray-700 whitespace-nowrap max-w-[200px] truncate"
                    title={String(getCellValue(record, col, activeTable) ?? '')}
                  >
                    {formatValue(getCellValue(record, col, activeTable))}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-2">
                    {canEdit && (
                      <button
                        onClick={() => onEdit(record)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors text-xs"
                        title="编辑"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        编辑
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => onDelete(record.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-red-600 hover:bg-red-50 rounded transition-colors text-xs"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        删除
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
