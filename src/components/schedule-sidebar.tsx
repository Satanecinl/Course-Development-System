'use client'

import { useEffect } from 'react'
import { RefreshCw, BarChart3 } from 'lucide-react'
import { useScheduleStore } from '@/store/scheduleStore'

export function ScheduleSidebar() {
  const {
    scheduleItems,
    isLoading,
    fetchSchedule,
    classOptions,
    teacherOptions,
    roomOptions,
  } = useScheduleStore()

  useEffect(() => {
    fetchSchedule()
  }, [fetchSchedule])

  // 统计
  const classCount = classOptions.length
  const teacherCount = teacherOptions.length
  const roomCount = roomOptions.length

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* 标题 */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-900">教务看板</h2>
        <p className="text-sm text-gray-500 mt-1">拖拽课程调整排课</p>
      </div>

      {/* 刷新按钮 */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={() => fetchSchedule()}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? '加载中...' : '刷新数据'}
        </button>
      </div>

      {/* 统计信息 */}
      <div className="p-4 flex-1 overflow-auto">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
          <BarChart3 className="w-3.5 h-3.5" />
          统计
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>当前课程数</span>
            <span className="font-medium">{scheduleItems.length}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>班级数</span>
            <span className="font-medium">{classCount}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>教师数</span>
            <span className="font-medium">{teacherCount}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>教室数</span>
            <span className="font-medium">{roomCount}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
