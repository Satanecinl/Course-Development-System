'use client'

import { Database, BookOpen, Users, Building, GraduationCap, Calendar, Clock, Download } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

interface Summary {
  courses: number
  teachers: number
  rooms: number
  classGroups: number
  teachingTasks: number
  scheduleSlots: number
}

interface TeachingTask {
  id: number
  courseName: string
  teacherName: string | null
  classNames: string[]
  weekType: string
  startWeek: number
  endWeek: number
  remark: string | null
}

interface ScheduleSlot {
  id: number
  dayOfWeek: number
  slotIndex: number
  roomName: string | null
  roomBuilding: string | null
  courseName: string
  teacherName: string | null
}

const DAY_NAMES: Record<number, string> = {
  1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日',
}

const SLOT_NAMES: Record<number, string> = {
  1: '1-2节', 2: '3-4节', 3: '5-6节', 4: '7-8节', 5: '9-10节', 6: '11-12节',
}

export function DataContent() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [tasks, setTasks] = useState<TeachingTask[]>([])
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'summary' | 'tasks' | 'slots'>('summary')
  const [error, setError] = useState<string | null>(null)
  const [canExport, setCanExport] = useState(false)
  const [exporting, setExporting] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, tasksRes, slotsRes, exportCheckRes] = await Promise.all([
        fetch('/api/data/summary'),
        fetch('/api/data/teaching-tasks'),
        fetch('/api/data/schedule-slots'),
        fetch('/api/export/excel', { method: 'HEAD' }),
      ])

      const summaryData = await summaryRes.json()
      const tasksData = await tasksRes.json()
      const slotsData = await slotsRes.json()

      if (summaryData.success) setSummary(summaryData.summary)
      if (tasksData.success) setTasks(tasksData.tasks)
      if (slotsData.success) setSlots(slotsData.slots)

      // Check if user has export permission (200 or 405 means allowed, 403 means forbidden)
      setCanExport(exportCheckRes.status !== 403 && exportCheckRes.status !== 401)

      if (!summaryData.success) setError(summaryData.error || '获取数据失败')
    } catch {
      setError('获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/export/excel')
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `schedule-export-${new Date().toISOString().slice(0, 10)}.xlsx`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        a.remove()
      } else {
        setError('导出失败')
      }
    } catch {
      setError('导出失败')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-6 h-6 text-gray-400" />
          <h2 className="text-xl font-bold text-gray-900">数据管理</h2>
        </div>
        <div className="text-center text-gray-500 py-12">加载中...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Database className="w-6 h-6 text-gray-400" />
          <h2 className="text-xl font-bold text-gray-900">数据管理</h2>
        </div>
        {canExport && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? '导出中...' : '导出 Excel'}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('summary')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeTab === 'summary'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          统计概览
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeTab === 'tasks'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          教学任务
        </button>
        <button
          onClick={() => setActiveTab('slots')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeTab === 'slots'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          课表安排
        </button>
      </div>

      {/* Summary tab */}
      {activeTab === 'summary' && summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard icon={<BookOpen className="w-5 h-5" />} label="课程" value={summary.courses} color="blue" />
          <StatCard icon={<Users className="w-5 h-5" />} label="教师" value={summary.teachers} color="green" />
          <StatCard icon={<Building className="w-5 h-5" />} label="教室" value={summary.rooms} color="purple" />
          <StatCard icon={<GraduationCap className="w-5 h-5" />} label="班级" value={summary.classGroups} color="orange" />
          <StatCard icon={<Calendar className="w-5 h-5" />} label="教学任务" value={summary.teachingTasks} color="teal" />
          <StatCard icon={<Clock className="w-5 h-5" />} label="课表安排" value={summary.scheduleSlots} color="pink" />
        </div>
      )}

      {/* Tasks tab */}
      {activeTab === 'tasks' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">ID</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">课程</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">教师</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">班级</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">周次</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{task.id}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{task.courseName}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{task.teacherName || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{task.classNames.join(', ')}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {task.weekType === 'ALL' ? '全周' : task.weekType} {task.startWeek}-{task.endWeek}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{task.remark || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length >= 100 && (
            <div className="px-4 py-2 text-sm text-gray-500 bg-gray-50">
              显示前 100 条记录
            </div>
          )}
        </div>
      )}

      {/* Slots tab */}
      {activeTab === 'slots' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">ID</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">星期</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">节次</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">课程</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">教师</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">教室</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {slots.map((slot) => (
                <tr key={slot.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{slot.id}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{DAY_NAMES[slot.dayOfWeek] || slot.dayOfWeek}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{SLOT_NAMES[slot.slotIndex] || slot.slotIndex}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{slot.courseName}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{slot.teacherName || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{slot.roomName || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {slots.length >= 100 && (
            <div className="px-4 py-2 text-sm text-gray-500 bg-gray-50">
              显示前 100 条记录
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    teal: 'bg-teal-50 text-teal-600',
    pink: 'bg-pink-50 text-pink-600',
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorClasses[color] || 'bg-gray-50 text-gray-600'}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  )
}
