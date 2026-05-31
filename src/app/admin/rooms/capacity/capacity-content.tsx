'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  DoorOpen,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Save,
  X,
  Pencil,
  ArrowLeft,
  Hash,
  Building,
  Users,
  Gauge,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

// ── Types ──

interface RoomCapacityItem {
  id: number
  name: string
  building: string | null
  type: string
  capacity: number
  maxAssignedStudentCount: number
  suggestedCapacity: number | null
  belowCurrentUsage: boolean
  belowSuggestedCapacity: boolean
  slotCount: number
}

interface ApiResponse {
  success: boolean
  data?: { items: RoomCapacityItem[] }
  error?: string
  message?: string
}

// ── Helpers ──

function statusLabel(item: RoomCapacityItem): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (item.belowCurrentUsage) {
    return { label: '风险', variant: 'destructive' }
  }
  if (item.belowSuggestedCapacity) {
    return { label: '低于建议', variant: 'outline' }
  }
  return { label: '正常', variant: 'default' }
}

function statusIcon(item: RoomCapacityItem) {
  if (item.belowCurrentUsage) {
    return <AlertTriangle className="w-4 h-4 text-red-500" />
  }
  if (item.belowSuggestedCapacity) {
    return <AlertCircle className="w-4 h-4 text-amber-500" />
  }
  return <CheckCircle2 className="w-4 h-4 text-green-500" />
}

// ── Component ──

export default function CapacityContent() {
  const [items, setItems] = useState<RoomCapacityItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [onlyRisk, setOnlyRisk] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)

  // ── Fetch ──

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (onlyRisk) params.set('onlyRisk', 'true')

      const res = await fetch(`/api/admin/rooms/capacity?${params.toString()}`)
      const json: ApiResponse = await res.json()

      if (!json.success) {
        throw new Error(json.message || json.error || '获取数据失败')
      }

      setItems(json.data?.items ?? [])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.error(`获取教室容量失败: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [q, onlyRisk])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Edit ──

  const startEdit = (item: RoomCapacityItem) => {
    setEditingId(item.id)
    setEditValue(String(item.capacity))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditValue('')
  }

  // ── Save ──

  const handleSave = async (item: RoomCapacityItem) => {
    const capacity = parseInt(editValue, 10)

    if (isNaN(capacity) || capacity < 1 || capacity > 10000) {
      toast.error('容量必须是 1~10000 的整数')
      return
    }

    setSavingId(item.id)

    try {
      const res = await fetch(`/api/admin/rooms/capacity/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capacity, confirm: true }),
      })
      const json = await res.json()

      if (!json.success) {
        throw new Error(json.message || json.error || '保存失败')
      }

      if (!json.data?.updated) {
        toast.info('容量未改变')
        setEditingId(null)
        return
      }

      toast.success(`已更新「${item.name}」容量为 ${json.data.newCapacity}`)
      if (json.data.warning) {
        toast.warning(json.data.warning)
      }

      setEditingId(null)
      fetchData()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`保存失败: ${msg}`)
    } finally {
      setSavingId(null)
    }
  }

  // ── Render ──

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <DoorOpen className="w-6 h-6 text-blue-500" />
          <h2 className="text-xl font-bold text-gray-900">教室容量管理</h2>
          <Badge variant="secondary">管理员</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/scheduler">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              返回排课控制台
            </Button>
          </Link>
        </div>
      </div>

      {/* Description */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">容量管理说明</p>
            <ul className="mt-1 space-y-0.5 list-disc list-inside">
              <li>容量值会作为后续自动排课和容量冲突检测（HC4）的固定运行参数</li>
              <li>系统不会在此页面自动重算全库容量</li>
              <li>建议容量 = ceil(当前已安排最大人数 × 1.10)</li>
              <li>容量低于当前已安排最大人数时，保存会被拒绝</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索教室名称或楼栋..."
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 w-64 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyRisk}
            onChange={(e) => setOnlyRisk(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          只看风险教室
        </label>
        <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
        <div className="text-sm text-gray-500 ml-auto">
          共 {items.length} 间教室
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">加载失败</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs border-b border-gray-200">
                <th className="text-left p-3 font-medium">ID</th>
                <th className="text-left p-3 font-medium">教室名称</th>
                <th className="text-left p-3 font-medium">楼栋</th>
                <th className="text-left p-3 font-medium">类型</th>
                <th className="text-center p-3 font-medium">当前容量</th>
                <th className="text-center p-3 font-medium">已安排最大人数</th>
                <th className="text-center p-3 font-medium">建议容量</th>
                <th className="text-center p-3 font-medium">状态</th>
                <th className="text-center p-3 font-medium">排课数</th>
                <th className="text-center p-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-400">
                    暂无数据
                  </td>
                </tr>
              )}
              {loading && items.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    加载中...
                  </td>
                </tr>
              )}
              {items.map((item) => {
                const status = statusLabel(item)
                const isEditing = editingId === item.id

                return (
                  <tr
                    key={item.id}
                    className={`border-t border-gray-100 transition-colors ${
                      item.belowCurrentUsage ? 'bg-red-50/50' : item.belowSuggestedCapacity ? 'bg-amber-50/30' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="p-3 font-mono text-xs text-gray-500">{item.id}</td>
                    <td className="p-3 font-medium text-gray-900">{item.name}</td>
                    <td className="p-3 text-gray-600">
                      <div className="flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-gray-400" />
                        {item.building || '-'}
                      </div>
                    </td>
                    <td className="p-3 text-gray-600">{item.type}</td>
                    <td className="p-3 text-center">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave(item)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          className="w-20 text-center text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                      ) : (
                        <span
                          className={`font-medium ${
                            item.belowCurrentUsage
                              ? 'text-red-600'
                              : item.belowSuggestedCapacity
                                ? 'text-amber-600'
                                : 'text-gray-700'
                          }`}
                        >
                          {item.capacity}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        <span className={item.capacity < item.maxAssignedStudentCount ? 'text-red-600 font-medium' : 'text-gray-600'}>
                          {item.maxAssignedStudentCount}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-center text-gray-600">
                      {item.suggestedCapacity ?? '-'}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {statusIcon(item)}
                        <Badge variant={status.variant} className="text-[10px]">
                          {status.label}
                        </Badge>
                      </div>
                    </td>
                    <td className="p-3 text-center text-gray-600">{item.slotCount}</td>
                    <td className="p-3 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSave(item)}
                            disabled={savingId === item.id}
                          >
                            {savingId === item.id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4 text-green-600" />
                            )}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={cancelEdit}>
                            <X className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => startEdit(item)}>
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
