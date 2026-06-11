'use client'

// src/app/my-adjustment-requests/page.tsx
// K28-A: USER's "我的调课申请" page. Lists all submitted requests
// (PENDING / APPROVED / REJECTED / CANCELLED) and allows PENDING cancel.

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, History, Info, X, ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  listMyAdjustmentRequests,
  cancelMyAdjustmentRequest,
  getAdjustmentRequestErrorMessage,
  type AdjustmentRequestListItem,
  type AdjustmentRequestStatus,
} from '@/lib/schedule/adjustment-request-client'

const STATUS_MAP: Record<AdjustmentRequestStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: '待审批', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <Info className="w-3 h-3" /> },
  APPROVED: { label: '已通过', color: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle2 className="w-3 h-3" /> },
  REJECTED: { label: '已拒绝', color: 'bg-red-100 text-red-700 border-red-200', icon: <XCircle className="w-3 h-3" /> },
  CANCELLED: { label: '已取消', color: 'bg-gray-100 text-gray-500 border-gray-200', icon: <History className="w-3 h-3" /> },
}

export default function MyAdjustmentRequestsPage() {
  const [items, setItems] = useState<AdjustmentRequestListItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initial data load — inline fetch to avoid setState-in-effect lint rule
  useEffect(() => {
    let cancelled = false
    listMyAdjustmentRequests()
      .then((r) => { if (!cancelled) setItems(r.items) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Refresh handler for the refresh button
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    listMyAdjustmentRequests()
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  const handleCancel = async (id: number) => {
    if (!confirm('确认取消此申请？此操作不可恢复。')) return
    try {
      await cancelMyAdjustmentRequest(id)
      toast.success('申请已取消')
      load()
    } catch (e) {
      const code = e instanceof Error ? e.message : 'UNKNOWN'
      toast.error(getAdjustmentRequestErrorMessage(code))
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6 flex items-center gap-2 text-gray-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg border border-red-200 p-6">
          <div className="flex items-center gap-2 text-red-600 mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">加载失败</span>
          </div>
          <p className="text-sm text-red-500">{getAdjustmentRequestErrorMessage(error)}</p>
          <button onClick={load} className="mt-2 text-sm text-blue-600 hover:underline">重试</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* K31-B: back-to-dashboard navigation. The page is a top-level route
              outside the ProtectedShell, so the sidebar is not present; this
              button is the only way back to the timetable view. Placed on the
              LEFT side of the header so it sits next to the H1. */}
          <Link href="/dashboard">
            <Button variant="outline" size="sm" aria-label="返回排课展示">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              返回排课展示
            </Button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900">我的调课申请</h1>
          <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">USER</Badge>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <RefreshCw className="w-4 h-4" /> 刷新
          </button>
        </div>
      </div>

      <div className="bg-blue-50 rounded border border-blue-200 p-3 text-xs text-blue-700 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">USER 调课申请流程</p>
          <p className="mt-0.5">您提交的调课申请会进入待审批状态，由管理员审批。仅当审批通过后课表才会真正变更。</p>
        </div>
      </div>

      {items && items.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-500 text-center">
          暂无调课申请。
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 px-3 font-medium">申请号</th>
                <th className="py-2 px-3 font-medium">状态</th>
                <th className="py-2 px-3 font-medium">课程</th>
                <th className="py-2 px-3 font-medium">原位置</th>
                <th className="py-2 px-3 font-medium">目标位置</th>
                <th className="py-2 px-3 font-medium">理由</th>
                <th className="py-2 px-3 font-medium">提交时间</th>
                <th className="py-2 px-3 font-medium">审批人</th>
                <th className="py-2 px-3 font-medium">审批时间</th>
                <th className="py-2 px-3 font-medium">审批备注</th>
                <th className="py-2 px-3 font-medium">正式调课</th>
                <th className="py-2 px-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items?.map((r) => {
                const sm = STATUS_MAP[r.status]
                return (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 font-mono text-xs">#{r.id}</td>
                    <td className="py-2 px-3">
                      <Badge className={`text-xs inline-flex items-center gap-1 ${sm.color}`}>
                        {sm.icon}
                        {sm.label}
                      </Badge>
                    </td>
                    <td className="py-2 px-3">
                      <div className="text-sm font-medium text-gray-900">{r.sourceCourseName}</div>
                      {r.sourceTeacherName && (
                        <div className="text-xs text-gray-500">{r.sourceTeacherName}</div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-700">
                      第 {r.sourceDayOfWeek ?? '?'} 天 ·
                      节次 {r.sourceSlotIndex ?? '?'} ·
                      {r.sourceRoomName ? ` ${r.sourceRoomName}` : ' 未指定教室'}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-700">
                      第 {r.targetWeek} 周 ·
                      星期 {r.targetDayOfWeek} ·
                      节次 {r.targetSlotIndex}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-600 max-w-[180px] truncate" title={r.reason ?? ''}>
                      {r.reason ?? '—'}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500 font-mono">
                      {new Date(r.submittedAt).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-700">
                      {r.reviewedByDisplayName ?? '—'}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500 font-mono">
                      {r.reviewedAt ? new Date(r.reviewedAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-600 max-w-[180px] truncate" title={r.reviewNote ?? ''}>
                      {r.reviewNote ?? '—'}
                    </td>
                    <td className="py-2 px-3 text-xs font-mono">
                      {r.approvedAdjustmentId ? `#${r.approvedAdjustmentId}` : '—'}
                    </td>
                    <td className="py-2 px-3">
                      {r.status === 'PENDING' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancel(r.id)}
                          className="h-7 text-xs"
                        >
                          <X className="w-3 h-3 mr-1" /> 取消
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
