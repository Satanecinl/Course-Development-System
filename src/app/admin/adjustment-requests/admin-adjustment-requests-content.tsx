'use client'

// src/app/admin/adjustment-requests/admin-adjustment-requests-content.tsx
// K28-A: ADMIN "调课审批" page content (client). Lists all PENDING +
// historical requests and allows approve / reject with optional / required
// reviewNote. K31-C: moved out of page.tsx so the page can wrap this in
// <ProtectedShell>. All business logic + interactivity lives here.

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  History,
  Info,
  ThumbsUp,
  ThumbsDown,
  ArrowLeft,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  listAdminAdjustmentRequests,
  approveAdjustmentRequest,
  rejectAdjustmentRequest,
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

export default function AdminAdjustmentRequestsContent() {
  const [items, setItems] = useState<AdjustmentRequestListItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<AdjustmentRequestStatus | 'ALL'>('PENDING')

  const [approveOpen, setApproveOpen] = useState<AdjustmentRequestListItem | null>(null)
  const [rejectOpen, setRejectOpen] = useState<AdjustmentRequestListItem | null>(null)
  const [approveNote, setApproveNote] = useState('')
  const [rejectNote, setRejectNote] = useState('')
  const [acting, setActing] = useState(false)

  // Initial data load — inline fetch to avoid setState-in-effect lint rule
  useEffect(() => {
    let cancelled = false
    listAdminAdjustmentRequests({ status: statusFilter })
      .then((r) => { if (!cancelled) setItems(r.items) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [statusFilter])

  // Refresh handler for the refresh button
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    listAdminAdjustmentRequests({ status: statusFilter })
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [statusFilter])

  const handleApprove = async () => {
    if (!approveOpen) return
    setActing(true)
    try {
      await approveAdjustmentRequest(approveOpen.id, approveNote || undefined)
      toast.success('已通过审批')
      setApproveOpen(null)
      setApproveNote('')
      load()
    } catch (e) {
      const code = e instanceof Error ? e.message : 'UNKNOWN'
      toast.error(getAdjustmentRequestErrorMessage(code))
    } finally {
      setActing(false)
    }
  }

  const handleReject = async () => {
    if (!rejectOpen) return
    if (!rejectNote.trim()) {
      toast.error('拒绝时必须填写审批备注')
      return
    }
    setActing(true)
    try {
      await rejectAdjustmentRequest(rejectOpen.id, rejectNote.trim())
      toast.success('已拒绝申请')
      setRejectOpen(null)
      setRejectNote('')
      load()
    } catch (e) {
      const code = e instanceof Error ? e.message : 'UNKNOWN'
      toast.error(getAdjustmentRequestErrorMessage(code))
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* K31-B: in-page back-to-dashboard shortcut. The page is now inside
              ProtectedShell (K31-C) and the global sidebar already exposes
              排课展示; this button is kept as a quick in-content shortcut per
              the K31-C instructions. Placed on the LEFT side of the header. */}
          <Link href="/dashboard">
            <Button variant="outline" size="sm" aria-label="返回排课展示">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              返回排课展示
            </Button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900">调课审批</h1>
          <Badge className="text-xs bg-rose-100 text-rose-700 border-rose-200">ADMIN</Badge>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="flex h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AdjustmentRequestStatus | 'ALL')}
          >
            <option value="PENDING">待审批</option>
            <option value="APPROVED">已通过</option>
            <option value="REJECTED">已拒绝</option>
            <option value="CANCELLED">已取消</option>
            <option value="ALL">全部</option>
          </select>
          <button onClick={load} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <RefreshCw className="w-4 h-4" /> 刷新
          </button>
        </div>
      </div>

      <div className="bg-amber-50 rounded border border-amber-200 p-3 text-xs text-amber-700 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">审批前会重新干跑</p>
          <p className="mt-0.5">点击「通过」后会重新执行冲突 / WorkTime / HC6 检查。仅当通过后才创建正式调课记录。拒绝时必须填写备注。</p>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6 flex items-center gap-2 text-gray-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      ) : error ? (
        <div className="bg-white rounded-lg border border-red-200 p-6">
          <p className="text-sm text-red-500">{getAdjustmentRequestErrorMessage(error)}</p>
        </div>
      ) : items && items.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-500 text-center">
          暂无 {STATUS_MAP[statusFilter as AdjustmentRequestStatus]?.label ?? ''} 申请。
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 px-3 font-medium">申请号</th>
                <th className="py-2 px-3 font-medium">状态</th>
                <th className="py-2 px-3 font-medium">申请人</th>
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
                      <div className="text-sm font-medium text-gray-900">{r.submittedByDisplayName}</div>
                      <div className="text-xs text-gray-500">{r.submittedByRoleSnapshot ?? '—'}</div>
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
                    <td className="py-2 px-3 text-xs text-gray-600 max-w-[160px] truncate" title={r.reason ?? ''}>
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
                    <td className="py-2 px-3 text-xs text-gray-600 max-w-[160px] truncate" title={r.reviewNote ?? ''}>
                      {r.reviewNote ?? '—'}
                    </td>
                    <td className="py-2 px-3 text-xs font-mono">
                      {r.approvedAdjustmentId ? `#${r.approvedAdjustmentId}` : '—'}
                    </td>
                    <td className="py-2 px-3">
                      {r.status === 'PENDING' ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setApproveOpen(r)}
                            className="h-7 text-xs text-green-700 border-green-300"
                          >
                            <ThumbsUp className="w-3 h-3 mr-1" /> 通过
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRejectOpen(r)}
                            className="h-7 text-xs text-red-700 border-red-300"
                          >
                            <ThumbsDown className="w-3 h-3 mr-1" /> 拒绝
                          </Button>
                        </div>
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

      {/* Approve dialog */}
      <Dialog open={!!approveOpen} onOpenChange={(o) => !o && setApproveOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>审批通过</DialogTitle>
          </DialogHeader>
          {approveOpen && (
            <div className="space-y-2 text-sm">
              <p className="text-gray-600">将通过申请 #{approveOpen.id} ({approveOpen.sourceCourseName})。</p>
              <p className="text-xs text-amber-600">⚠️ 系统会重新干跑冲突检查；只有通过才会创建正式调课记录。</p>
              <div>
                <Label htmlFor="approve-note">审批备注（可选）</Label>
                <Input
                  id="approve-note"
                  value={approveNote}
                  onChange={(e) => setApproveNote(e.target.value)}
                  placeholder="（可选）"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApproveOpen(null)} disabled={acting}>
              取消
            </Button>
            <Button onClick={handleApprove} disabled={acting}>
              {acting ? '处理中...' : '确认通过'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectOpen} onOpenChange={(o) => !o && setRejectOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>拒绝申请</DialogTitle>
          </DialogHeader>
          {rejectOpen && (
            <div className="space-y-2 text-sm">
              <p className="text-gray-600">将拒绝申请 #{rejectOpen.id} ({rejectOpen.sourceCourseName})。</p>
              <div>
                <Label htmlFor="reject-note">拒绝原因（必填）</Label>
                <Input
                  id="reject-note"
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="请说明拒绝原因"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(null)} disabled={acting}>
              取消
            </Button>
            <Button onClick={handleReject} disabled={acting} variant="destructive">
              {acting ? '处理中...' : '确认拒绝'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
