'use client'

import { useState, useCallback } from 'react'
import {
  Sparkles,
  Play,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  Clock,
  Hash,
  Loader2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Calendar,
  User,
  BookOpen,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

// ── Types ──

interface ProposedChange {
  scheduleSlotId: number
  teachingTaskId: number
  courseName: string
  teacherName: string
  classGroups: string
  oldDayOfWeek: number
  oldSlotIndex: number
  oldRoomId: number | null
  oldRoomName: string
  newDayOfWeek: number
  newSlotIndex: number
  newRoomId: number | null
  newRoomName: string
}

interface PreviewResponse {
  success: boolean
  runId: number
  mode: 'PREVIEW'
  status: 'COMPLETED' | 'BLOCKED' | 'FAILED'
  blocked: boolean
  blockReasons: string[]
  scoreBefore: { hardScore: number; softScore: number }
  scoreAfter: { hardScore: number; softScore: number }
  hcBefore: { hc1: number; hc2: number; hc3: number; hc4: number }
  hcAfter: { hc1: number; hc2: number; hc3: number; hc4: number }
  changedSlotCount: number
  proposedChanges: ProposedChange[]
  previewExpiresAt: string | null
  databaseFingerprint: string
  iterations: number
  durationMs: number
  error?: string
}

interface ApplyResponse {
  success: boolean
  applyRunId: number
  previewRunId: number
  status: string
  appliedSlotCount: number
  hardScoreAfter: number
  softScoreAfter: number
  hc1After: number
  hc2After: number
  hc3After: number
  hc4After: number
  databaseFingerprintBefore: string
  databaseFingerprintAfter: string
  changeCount: number
  durationMs: number
  error?: string
}

interface RollbackResponse {
  success: boolean
  rollbackRunId: number
  applyRunId: number
  status: string
  rolledBackSlotCount: number
  hardScoreAfter: number
  softScoreAfter: number
  hc1After: number
  hc2After: number
  hc3After: number
  hc4After: number
  databaseFingerprintBefore: string
  databaseFingerprintAfter: string
  changeCount: number
  durationMs: number
  error?: string
}

type PageState =
  | 'idle'
  | 'previewLoading'
  | 'previewReady'
  | 'previewBlocked'
  | 'applyConfirming'
  | 'applyLoading'
  | 'applyDone'
  | 'rollbackConfirming'
  | 'rollbackLoading'
  | 'rollbackDone'
  | 'error'

const DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

// ── Component ──

export default function SchedulerContent() {
  const [state, setState] = useState<PageState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Preview data
  const [previewRunId, setPreviewRunId] = useState<number | null>(null)
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null)

  // Apply data
  const [applyRunId, setApplyRunId] = useState<number | null>(null)
  const [applyData, setApplyData] = useState<ApplyResponse | null>(null)

  // Rollback data
  const [rollbackRunId, setRollbackRunId] = useState<number | null>(null)
  const [rollbackData, setRollbackData] = useState<RollbackResponse | null>(null)

  // UI
  const [showChanges, setShowChanges] = useState(false)
  const [applyDialogOpen, setApplyDialogOpen] = useState(false)
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false)

  // ── Helpers ──

  const isPreviewExpired = useCallback((data: PreviewResponse | null): boolean => {
    if (!data?.previewExpiresAt) return true
    return new Date(data.previewExpiresAt) < new Date()
  }, [])

  const canApply = useCallback((): boolean => {
    if (!previewData || previewRunId == null) return false
    if (previewData.status !== 'COMPLETED') return false
    if (previewData.blocked) return false
    if (previewData.scoreAfter.hardScore !== 0) return false
    if (previewData.hcAfter.hc1 !== 0 || previewData.hcAfter.hc2 !== 0 ||
        previewData.hcAfter.hc3 !== 0 || previewData.hcAfter.hc4 !== 0) return false
    if (isPreviewExpired(previewData)) return false
    if (previewData.changedSlotCount <= 0) return false
    if (applyRunId != null) return false
    return true
  }, [previewData, previewRunId, applyRunId, isPreviewExpired])

  const canRollback = useCallback((): boolean => {
    if (applyRunId == null) return false
    if (rollbackRunId != null) return false
    return true
  }, [applyRunId, rollbackRunId])

  // ── Actions ──

  const handlePreview = async () => {
    setState('previewLoading')
    setErrorMsg(null)
    setPreviewData(null)
    setPreviewRunId(null)
    setApplyRunId(null)
    setApplyData(null)
    setRollbackRunId(null)
    setRollbackData(null)

    try {
      const res = await fetch('/api/admin/scheduler/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const data: PreviewResponse = await res.json()

      if (!data.success) {
        setState('error')
        setErrorMsg(data.error || 'Preview failed')
        toast.error(`Preview failed: ${data.error || 'Unknown error'}`)
        return
      }

      setPreviewRunId(data.runId)
      setPreviewData(data)

      if (data.blocked || data.status === 'BLOCKED') {
        setState('previewBlocked')
        toast.warning(`Preview blocked: ${data.blockReasons.join(', ')}`)
      } else {
        setState('previewReady')
        toast.success(`Preview completed: ${data.changedSlotCount} changes proposed`)
      }
    } catch (e) {
      setState('error')
      const msg = e instanceof Error ? e.message : String(e)
      setErrorMsg(msg)
      toast.error(`Preview error: ${msg}`)
    }
  }

  const handleApplyConfirm = () => {
    if (!canApply()) {
      toast.error('Apply conditions not met')
      return
    }
    setApplyDialogOpen(true)
    setState('applyConfirming')
  }

  const handleApply = async () => {
    setApplyDialogOpen(false)
    setState('applyLoading')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/admin/scheduler/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previewRunId,
          confirmApply: true,
        }),
      })

      const data: ApplyResponse = await res.json()

      if (!data.success) {
        setState('error')
        setErrorMsg(data.error || 'Apply failed')
        toast.error(`Apply failed: ${data.error || 'Unknown error'}`)
        return
      }

      setApplyRunId(data.applyRunId)
      setApplyData(data)
      setState('applyDone')
      toast.success(`Apply completed: ${data.appliedSlotCount} slots updated`)
    } catch (e) {
      setState('error')
      const msg = e instanceof Error ? e.message : String(e)
      setErrorMsg(msg)
      toast.error(`Apply error: ${msg}`)
    }
  }

  const handleRollbackConfirm = () => {
    if (!canRollback()) {
      toast.error('Rollback conditions not met')
      return
    }
    setRollbackDialogOpen(true)
    setState('rollbackConfirming')
  }

  const handleRollback = async () => {
    setRollbackDialogOpen(false)
    setState('rollbackLoading')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/admin/scheduler/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applyRunId,
          confirmRollback: true,
        }),
      })

      const data: RollbackResponse = await res.json()

      if (!data.success) {
        setState('error')
        setErrorMsg(data.error || 'Rollback failed')
        toast.error(`Rollback failed: ${data.error || 'Unknown error'}`)
        return
      }

      setRollbackRunId(data.rollbackRunId)
      setRollbackData(data)
      setState('rollbackDone')
      toast.success(`Rollback completed: ${data.rolledBackSlotCount} slots restored`)
    } catch (e) {
      setState('error')
      const msg = e instanceof Error ? e.message : String(e)
      setErrorMsg(msg)
      toast.error(`Rollback error: ${msg}`)
    }
  }

  const resetAll = () => {
    setState('idle')
    setErrorMsg(null)
    setPreviewRunId(null)
    setPreviewData(null)
    setApplyRunId(null)
    setApplyData(null)
    setRollbackRunId(null)
    setRollbackData(null)
    setShowChanges(false)
  }

  // ── Render ──

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-6 h-6 text-amber-500" />
        <h2 className="text-xl font-bold text-gray-900">自动排课</h2>
        <Badge variant="secondary">管理员</Badge>
      </div>

      {/* Description */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">安全说明</p>
            <ul className="mt-1 space-y-0.5 list-disc list-inside">
              <li>Preview 仅生成排课优化建议，不修改真实课表</li>
              <li>Apply 会将 Preview 结果写入真实课表，操作前请确认</li>
              <li>Rollback 可撤销 Apply，但只能撤销未被手动修改的 Apply</li>
              <li>只有 hardScore=0 且 HC1-HC4 全为 0 的 Preview 才能 Apply</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Button
          onClick={handlePreview}
          disabled={state === 'previewLoading' || state === 'applyLoading' || state === 'rollbackLoading'}
          size="lg"
        >
          {state === 'previewLoading' ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          运行 Preview
        </Button>

        <Button
          onClick={handleApplyConfirm}
          disabled={!canApply() || state === 'applyLoading'}
          variant="default"
          size="lg"
          className={canApply() ? 'bg-green-600 hover:bg-green-700' : ''}
        >
          {state === 'applyLoading' ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mr-2" />
          )}
          应用排课
        </Button>

        <Button
          onClick={handleRollbackConfirm}
          disabled={!canRollback() || state === 'rollbackLoading'}
          variant="destructive"
          size="lg"
        >
          {state === 'rollbackLoading' ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RotateCcw className="w-4 h-4 mr-2" />
          )}
          撤销应用
        </Button>

        {(state !== 'idle' && state !== 'previewLoading') && (
          <Button onClick={resetAll} variant="ghost" size="lg">
            重置
          </Button>
        )}
      </div>

      {/* Error Display */}
      {state === 'error' && errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">操作失败</p>
              <p className="text-sm text-red-700 mt-1">{errorMsg}</p>
            </div>
          </div>
        </div>
      )}

      {/* Preview Results */}
      {previewData && (
        <div className="bg-white rounded-lg shadow border border-gray-200 mb-6">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Preview 结果</h3>
              <div className="flex items-center gap-2">
                {previewData.status === 'COMPLETED' && !previewData.blocked ? (
                  <Badge variant="default" className="bg-green-100 text-green-700 border-green-200">COMPLETED</Badge>
                ) : (
                  <Badge variant="destructive">BLOCKED</Badge>
                )}
                {isPreviewExpired(previewData) && (
                  <Badge variant="destructive">已过期</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Run ID */}
            <div className="flex items-center gap-2 text-sm">
              <Hash className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500">Preview Run ID:</span>
              <span className="font-mono font-medium">{previewData.runId}</span>
            </div>

            {/* Duration */}
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500">耗时:</span>
              <span>{(previewData.durationMs / 1000).toFixed(2)}s</span>
            </div>

            {/* Iterations */}
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500">迭代次数:</span>
              <span>{previewData.iterations.toLocaleString()}</span>
            </div>

            {/* Changed slots */}
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500">变更数量:</span>
              <span className={`font-medium ${previewData.changedSlotCount > 0 ? 'text-amber-600' : 'text-gray-700'}`}>
                {previewData.changedSlotCount}
              </span>
            </div>

            {/* Expires at */}
            {previewData.previewExpiresAt && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">有效期至:</span>
                <span className={isPreviewExpired(previewData) ? 'text-red-600' : 'text-green-600'}>
                  {new Date(previewData.previewExpiresAt).toLocaleString('zh-CN')}
                </span>
              </div>
            )}

            {/* Fingerprint */}
            <div className="flex items-center gap-2 text-sm">
              <Hash className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500">Fingerprint:</span>
              <span className="font-mono text-xs">{previewData.databaseFingerprint}</span>
            </div>
          </div>

          {/* Score Cards */}
          <div className="px-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Before Score */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 mb-2">优化前</p>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-gray-400">Hard Score</p>
                    <p className="text-lg font-bold text-red-600">{previewData.scoreBefore.hardScore}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Soft Score</p>
                    <p className="text-lg font-bold text-gray-700">{previewData.scoreBefore.softScore}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge variant={previewData.hcBefore.hc1 > 0 ? 'destructive' : 'secondary'} >
                    HC1: {previewData.hcBefore.hc1}
                  </Badge>
                  <Badge variant={previewData.hcBefore.hc2 > 0 ? 'destructive' : 'secondary'} >
                    HC2: {previewData.hcBefore.hc2}
                  </Badge>
                  <Badge variant={previewData.hcBefore.hc3 > 0 ? 'destructive' : 'secondary'} >
                    HC3: {previewData.hcBefore.hc3}
                  </Badge>
                  <Badge variant={previewData.hcBefore.hc4 > 0 ? 'destructive' : 'secondary'} >
                    HC4: {previewData.hcBefore.hc4}
                  </Badge>
                </div>
              </div>

              {/* After Score */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-500 mb-2">优化后</p>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-gray-400">Hard Score</p>
                    <p className={`text-lg font-bold ${previewData.scoreAfter.hardScore === 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {previewData.scoreAfter.hardScore}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Soft Score</p>
                    <p className="text-lg font-bold text-gray-700">{previewData.scoreAfter.softScore}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge variant={previewData.hcAfter.hc1 > 0 ? 'destructive' : 'default'} >
                    HC1: {previewData.hcAfter.hc1}
                  </Badge>
                  <Badge variant={previewData.hcAfter.hc2 > 0 ? 'destructive' : 'default'} >
                    HC2: {previewData.hcAfter.hc2}
                  </Badge>
                  <Badge variant={previewData.hcAfter.hc3 > 0 ? 'destructive' : 'default'} >
                    HC3: {previewData.hcAfter.hc3}
                  </Badge>
                  <Badge variant={previewData.hcAfter.hc4 > 0 ? 'destructive' : 'default'} >
                    HC4: {previewData.hcAfter.hc4}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Block Reasons */}
          {previewData.blockReasons.length > 0 && (
            <div className="px-4 pb-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-medium text-red-800">阻断原因</p>
                <ul className="mt-1 space-y-0.5">
                  {previewData.blockReasons.map((reason, i) => (
                    <li key={i} className="text-sm text-red-700">• {reason}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Proposed Changes Toggle */}
          {previewData.proposedChanges.length > 0 && (
            <div className="px-4 pb-4">
              <button
                onClick={() => setShowChanges(!showChanges)}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
              >
                {showChanges ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showChanges ? '收起变更详情' : `查看变更详情 (${previewData.proposedChanges.length} 条)`}
              </button>

              {showChanges && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs">
                        <th className="text-left p-2 font-medium">课程</th>
                        <th className="text-left p-2 font-medium">教师</th>
                        <th className="text-left p-2 font-medium">班级</th>
                        <th className="text-center p-2 font-medium">原时间</th>
                        <th className="text-center p-2 font-medium">原教室</th>
                        <th className="text-center p-2 font-medium">新时间</th>
                        <th className="text-center p-2 font-medium">新教室</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.proposedChanges.map((change, idx) => (
                        <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                              <span className="truncate max-w-[120px]" title={change.courseName}>
                                {change.courseName}
                              </span>
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-gray-400" />
                              <span>{change.teacherName || '-'}</span>
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-gray-400" />
                              <span className="truncate max-w-[150px]" title={change.classGroups}>
                                {change.classGroups}
                              </span>
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            <span className="text-red-600">
                              {DAY_NAMES[change.oldDayOfWeek]} 第{change.oldSlotIndex}节
                            </span>
                          </td>
                          <td className="p-2 text-center text-red-600">
                            {change.oldRoomName || '-'}
                          </td>
                          <td className="p-2 text-center">
                            <span className="text-green-600">
                              {DAY_NAMES[change.newDayOfWeek]} 第{change.newSlotIndex}节
                            </span>
                          </td>
                          <td className="p-2 text-center text-green-600">
                            {change.newRoomName || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Apply Result */}
      {applyData && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-green-900">Apply 成功</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-green-700">Apply Run ID: </span>
              <span className="font-mono font-medium">{applyData.applyRunId}</span>
            </div>
            <div>
              <span className="text-green-700">更新数量: </span>
              <span className="font-medium">{applyData.appliedSlotCount}</span>
            </div>
            <div>
              <span className="text-green-700">Hard Score: </span>
              <span className="font-medium">{applyData.hardScoreAfter}</span>
            </div>
            <div>
              <span className="text-green-700">耗时: </span>
              <span className="font-medium">{(applyData.durationMs / 1000).toFixed(2)}s</span>
            </div>
          </div>
        </div>
      )}

      {/* Rollback Result */}
      {rollbackData && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <RotateCcw className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-blue-900">Rollback 成功</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-blue-700">Rollback Run ID: </span>
              <span className="font-mono font-medium">{rollbackData.rollbackRunId}</span>
            </div>
            <div>
              <span className="text-blue-700">恢复数量: </span>
              <span className="font-medium">{rollbackData.rolledBackSlotCount}</span>
            </div>
            <div>
              <span className="text-blue-700">Hard Score: </span>
              <span className="font-medium">{rollbackData.hardScoreAfter}</span>
            </div>
            <div>
              <span className="text-blue-700">耗时: </span>
              <span className="font-medium">{(rollbackData.durationMs / 1000).toFixed(2)}s</span>
            </div>
          </div>
        </div>
      )}

      {/* Apply Confirm Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              确认应用排课变更
            </DialogTitle>
            <DialogDescription>
              此操作将把预览中的排课变更写入真实课表，会修改 ScheduleSlot 数据。
              <br /><br />
              {previewData && (
                <>
                  <strong>Preview Run ID:</strong> {previewData.runId}<br />
                  <strong>变更数量:</strong> {previewData.changedSlotCount}<br />
                  <strong>Hard Score:</strong> {previewData.scoreAfter.hardScore}<br />
                  <strong>Soft Score:</strong> {previewData.scoreAfter.softScore}
                </>
              )}
              <br /><br />
              请确认要继续吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setApplyDialogOpen(false); setState('previewReady'); }}>
              取消
            </Button>
            <Button onClick={handleApply} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              确认应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback Confirm Dialog */}
      <Dialog open={rollbackDialogOpen} onOpenChange={setRollbackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              确认撤销排课应用
            </DialogTitle>
            <DialogDescription>
              此操作将撤销本次自动排课应用，恢复到 apply 前的课表位置。
              <br /><br />
              {applyData && (
                <>
                  <strong>Apply Run ID:</strong> {applyData.applyRunId}<br />
                  <strong>恢复数量:</strong> {applyData.appliedSlotCount}
                </>
              )}
              <br /><br />
              如果课表在 apply 后被手动修改过，rollback 可能失败。
              <br /><br />
              请确认要继续吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRollbackDialogOpen(false); setState('applyDone'); }}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleRollback}>
              <RotateCcw className="w-4 h-4 mr-2" />
              确认撤销
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
