'use client'

import { useState, useCallback, useEffect } from 'react'
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
  History,
  Copy,
  Check,
  Lock,
  Search,
  X,
} from 'lucide-react'
import Link from 'next/link'
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
import { SolverConfigPanel } from '@/components/scheduler-config-panel'
import { ResolvedConfigDisplay } from '@/components/resolved-config-display'
import { toFriendlyError } from '@/lib/scheduler-config-errors'
import type { ResolvedConfigSnapshot } from '@/types/scheduling-config'

// ── Types ──

interface LockableSlot {
  id: number
  dayOfWeek: number
  slotIndex: number
  roomId: number | null
  roomName: string
  roomCapacity: number | null
  teachingTaskId: number
  courseName: string | null
  teacherName: string | null
  classGroupNames: string[]
  studentCount: number
  displayName: string
}

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
  randomSeed: number | null
  lockedSlotIds: number[]
  lockedSlotCount: number
  semesterId?: number
  semesterCode?: string
  semesterName?: string
  // K21-FIX-F: resolved config sub-object written into resultSnapshot.config
  config?: ResolvedConfigSnapshot
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

  // Seed input
  const [randomSeedInput, setRandomSeedInput] = useState('')
  const [seedCopied, setSeedCopied] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)

  // K21-FIX-G: config selection (K21-FIX-F backend configId + overrides)
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null)
  const [resolvedConfigForOverride, setResolvedConfigForOverride] = useState<{
    configId: number | null
    maxIterations: number
    lahcWindowSize: number
    randomSeed: number | null
    lockedSlotIds: number[]
    solverVersion: string | null
  } | null>(null)
  // User-edited fields that should be sent as overrides
  const [maxIterationsInput, setMaxIterationsInput] = useState('')
  const [lahcWindowSizeInput, setLahcWindowSizeInput] = useState('')

  // Lockable slots
  const [lockableSlots, setLockableSlots] = useState<LockableSlot[]>([])
  const [lockableSlotsLoading, setLockableSlotsLoading] = useState(false)
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<number>>(new Set())
  const [lockSearchQuery, setLockSearchQuery] = useState('')
  const [showLockSection, setShowLockSection] = useState(true)

  // Load lockable slots on mount
  useEffect(() => {
    loadLockableSlots()
  }, [])

  const loadLockableSlots = async () => {
    setLockableSlotsLoading(true)
    try {
      const res = await fetch('/api/admin/scheduler/lockable-slots')
      const data = await res.json()
      if (data.success) {
        setLockableSlots(data.data.items)
      } else {
        console.error('Failed to load lockable slots:', data.error)
      }
    } catch (e) {
      console.error('Failed to load lockable slots:', e)
    } finally {
      setLockableSlotsLoading(false)
    }
  }

  const filteredLockableSlots = lockableSlots.filter(slot => {
    if (!lockSearchQuery) return true
    const query = lockSearchQuery.toLowerCase()
    return (
      slot.displayName.toLowerCase().includes(query) ||
      slot.courseName?.toLowerCase().includes(query) ||
      slot.teacherName?.toLowerCase().includes(query) ||
      slot.classGroupNames.some(name => name.toLowerCase().includes(query)) ||
      slot.roomName.toLowerCase().includes(query)
    )
  })

  const toggleSlotSelection = (slotId: number) => {
    setSelectedSlotIds(prev => {
      const next = new Set(prev)
      if (next.has(slotId)) {
        next.delete(slotId)
      } else {
        next.add(slotId)
      }
      return next
    })
  }

  const clearSlotSelection = () => {
    setSelectedSlotIds(new Set())
  }

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

  // ── Seed validation ──

  function validateSeed(input: string): { valid: boolean; seed: number | null; error: string | null } {
    const trimmed = input.trim()
    if (trimmed === '') return { valid: true, seed: null, error: null }
    const parsed = Number(trimmed)
    if (!Number.isInteger(parsed) || Number.isNaN(parsed)) {
      return { valid: false, seed: null, error: '种子必须是整数' }
    }
    if (parsed < 0 || parsed > 2147483647) {
      return { valid: false, seed: null, error: '种子必须在 0 ~ 2147483647 之间' }
    }
    return { valid: true, seed: parsed, error: null }
  }

  // ── Actions ──

  const handlePreview = async () => {
    const seedValidation = validateSeed(randomSeedInput)
    if (!seedValidation.valid) {
      setSeedError(seedValidation.error)
      toast.error(`随机种子错误: ${seedValidation.error}`)
      return
    }
    setSeedError(null)

    setState('previewLoading')
    setErrorMsg(null)
    setPreviewData(null)
    setPreviewRunId(null)
    setApplyRunId(null)
    setApplyData(null)
    setRollbackRunId(null)
    setRollbackData(null)
    setSeedCopied(false)

    try {
      // K21-FIX-G: build payload using the new shape (configId + overrides).
      // Legacy top-level params (maxIterations/lahcWindowSize/randomSeed/lockedSlotIds)
      // are intentionally no longer sent — they are derived from the selected
      // config or from overrides. This eliminates the override-vs-legacy ambiguity
      // flagged in K21-FIX-D.
      const overrides: Record<string, unknown> = {}
      const maxIterInput = maxIterationsInput.trim()
      if (maxIterInput !== '') {
        const mi = Number(maxIterInput)
        if (!Number.isInteger(mi) || mi < 100 || mi > 15000) {
          setState('error')
          const msg = '最大迭代次数必须是 100-15000 之间的整数'
          setErrorMsg(msg)
          toast.error(`覆写参数错误: ${msg}`)
          return
        }
        overrides.maxIterations = mi
      }
      const lahcInput = lahcWindowSizeInput.trim()
      if (lahcInput !== '') {
        const lw = Number(lahcInput)
        if (!Number.isInteger(lw) || lw < 50 || lw > 2000) {
          setState('error')
          const msg = 'LAHC 窗口大小必须是 50-2000 之间的整数'
          setErrorMsg(msg)
          toast.error(`覆写参数错误: ${msg}`)
          return
        }
        overrides.lahcWindowSize = lw
      }
      if (seedValidation.seed != null) {
        overrides.randomSeed = seedValidation.seed
      }
      if (selectedSlotIds.size > 0) {
        overrides.lockedSlotIds = Array.from(selectedSlotIds)
      }

      const body: Record<string, unknown> = {}
      if (selectedConfigId != null) {
        body.configId = selectedConfigId
      }
      if (Object.keys(overrides).length > 0) {
        body.overrides = overrides
      }

      const res = await fetch('/api/admin/scheduler/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data: PreviewResponse = await res.json()

      if (!data.success) {
        setState('error')
        setErrorMsg(data.error || 'Preview failed')
        // K21-FIX-G: surface specific known errors as friendly toasts.
        const fe = toFriendlyError({ success: false, error: data.error, message: data.error })
        if (fe.code === 'SCHEDULING_CONFIG_NOT_FOUND' || fe.code === 'SEMESTER_MISMATCH') {
          toast.error(fe.userMessage)
        } else {
          toast.error(`Preview failed: ${data.error || 'Unknown error'}`)
        }
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
    setRandomSeedInput('')
    setSeedError(null)
    setSeedCopied(false)
    setSelectedSlotIds(new Set())
    setLockSearchQuery('')
    // K21-FIX-G: keep config selection; do not clear override inputs — they are
    // user-chosen starting points for the next preview.
  }

  const copySeed = (seed: number) => {
    navigator.clipboard.writeText(String(seed)).then(() => {
      setSeedCopied(true)
      toast.success('已复制随机种子')
      setTimeout(() => setSeedCopied(false), 2000)
    })
  }

  // ── Render ──

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-amber-500" />
          <h2 className="text-xl font-bold text-gray-900">自动排课</h2>
          <Badge variant="secondary">管理员</Badge>
        </div>
        <Link href="/admin/scheduler/history">
          <Button variant="outline" size="sm">
            <History className="w-4 h-4 mr-1.5" />
            运行历史
          </Button>
        </Link>
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

      {/* Random Seed Input */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              随机种子 <span className="text-gray-400 font-normal">（可选）</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={randomSeedInput}
              onChange={(e) => {
                setRandomSeedInput(e.target.value)
                setSeedError(null)
              }}
              placeholder="留空则自动生成（例如：12345）"
              className={`w-full sm:w-72 text-sm border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                seedError ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
              }`}
            />
            {seedError ? (
              <p className="text-xs text-red-600 mt-1">{seedError}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                填写相同 seed 可复现相同输入下的 Preview 结果。留空时后端会自动生成 seed。
              </p>
            )}
          </div>
        </div>
      </div>

      {/* K21-FIX-G: Solver Config Panel (configId + overrides) */}
      <SolverConfigPanel
        semesterId={null}
        selectedConfigId={selectedConfigId}
        onSelectedConfigChange={setSelectedConfigId}
        onResolvedConfigChange={setResolvedConfigForOverride}
      />

      {/* K21-FIX-G: Solver iteration params (overrides.maxIterations / overrides.lahcWindowSize) */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              最大迭代次数 <span className="text-gray-400 font-normal">(overrides.maxIterations, 100-15000)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={maxIterationsInput}
              onChange={(e) => setMaxIterationsInput(e.target.value)}
              placeholder={
                resolvedConfigForOverride
                  ? `使用已选配置: ${resolvedConfigForOverride.maxIterations}`
                  : '留空则使用默认 10000'
              }
              className="w-full sm:w-72 text-sm border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              LAHC 窗口大小 <span className="text-gray-400 font-normal">(overrides.lahcWindowSize, 50-2000)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={lahcWindowSizeInput}
              onChange={(e) => setLahcWindowSizeInput(e.target.value)}
              placeholder={
                resolvedConfigForOverride
                  ? `使用已选配置: ${resolvedConfigForOverride.lahcWindowSize}`
                  : '留空则使用默认 500'
              }
              className="w-full sm:w-72 text-sm border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          这些值仅作为本次覆写 (overrides) 发送给后端 — 不会修改任何已保存的配置。
        </p>
      </div>

      {/* Locked Slots Section */}
      <div className="bg-white rounded-lg border border-gray-200 mb-4">
        <button
          onClick={() => setShowLockSection(!showLockSection)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-amber-500" />
            <div className="text-left">
              <h3 className="font-medium text-gray-900">锁定课表槽位</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                被锁定的槽位不会在本次 Preview 中被 solver 移动。锁定仅对本次 Preview 生效，不会持久化写入数据库。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedSlotIds.size > 0 && (
              <Badge variant="default" className="bg-amber-100 text-amber-700 border-amber-200">
                已选 {selectedSlotIds.size} 个
              </Badge>
            )}
            {showLockSection ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </button>

        {showLockSection && (
          <div className="px-4 pb-4">
            {/* Search and Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={lockSearchQuery}
                  onChange={(e) => setLockSearchQuery(e.target.value)}
                  placeholder="搜索课程、教师、班级、教室..."
                  className="w-full pl-10 pr-10 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {lockSearchQuery && (
                  <button
                    onClick={() => setLockSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearSlotSelection}
                  disabled={selectedSlotIds.size === 0}
                >
                  清空选择
                </Button>
                <span className="text-sm text-gray-500">
                  共 {filteredLockableSlots.length} 个槽位
                </span>
              </div>
            </div>

            {/* Slots List */}
            {lockableSlotsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">加载中...</span>
              </div>
            ) : filteredLockableSlots.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">
                {lockSearchQuery ? '没有匹配的课表槽位' : '暂无课表槽位'}
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="w-10 p-2">
                        <span className="sr-only">选择</span>
                      </th>
                      <th className="text-left p-2 font-medium text-gray-600">时间</th>
                      <th className="text-left p-2 font-medium text-gray-600">课程</th>
                      <th className="text-left p-2 font-medium text-gray-600">教师</th>
                      <th className="text-left p-2 font-medium text-gray-600">班级</th>
                      <th className="text-left p-2 font-medium text-gray-600">教室</th>
                      <th className="text-right p-2 font-medium text-gray-600">人数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLockableSlots.map((slot) => {
                      const isSelected = selectedSlotIds.has(slot.id)
                      return (
                        <tr
                          key={slot.id}
                          onClick={() => toggleSlotSelection(slot.id)}
                          className={`border-t border-gray-100 cursor-pointer transition-colors ${
                            isSelected ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSlotSelection(slot.id)}
                              className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                            />
                          </td>
                          <td className="p-2">
                            <span className="font-medium">
                              {DAY_NAMES[slot.dayOfWeek]} 第{slot.slotIndex}节
                            </span>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                              <span className="truncate max-w-[120px]" title={slot.courseName ?? undefined}>
                                {slot.courseName ?? '-'}
                              </span>
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-gray-400" />
                              <span>{slot.teacherName ?? '-'}</span>
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-gray-400" />
                              <span className="truncate max-w-[150px]" title={slot.classGroupNames.join(', ')}>
                                {slot.classGroupNames.join(', ') || '-'}
                              </span>
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-gray-400" />
                              <span>{slot.roomName}</span>
                            </div>
                          </td>
                          <td className="p-2 text-right">
                            <span className="text-gray-600">{slot.studentCount}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Selected Summary */}
            {selectedSlotIds.size > 0 && (
              <div className="mt-3 flex items-center gap-2 text-sm text-amber-700">
                <Lock className="w-4 h-4" />
                <span>
                  已选择 <strong>{selectedSlotIds.size}</strong> 个槽位锁定，这些槽位在 Preview 中不会被移动。
                </span>
              </div>
            )}
          </div>
        )}
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

            {/* Semester */}
            {previewData.semesterCode && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">学期:</span>
                <span className="font-medium text-blue-600">
                  {previewData.semesterCode}{previewData.semesterName ? ` (${previewData.semesterName})` : ''}
                </span>
              </div>
            )}

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

            {/* Locked Slots */}
            {previewData.lockedSlotCount > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <Lock className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">锁定槽位:</span>
                <span className="font-medium text-amber-600">
                  {previewData.lockedSlotCount} 个
                </span>
              </div>
            )}

            {/* Random Seed */}
            {previewData.randomSeed != null && (
              <div className="flex items-center gap-2 text-sm">
                <Hash className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">随机种子:</span>
                <span className="font-mono font-medium text-blue-600">{previewData.randomSeed}</span>
                <button
                  onClick={() => copySeed(previewData.randomSeed!)}
                  className="ml-1 p-1 rounded hover:bg-gray-100 transition-colors"
                  title="复制种子"
                >
                  {seedCopied ? (
                    <Check className="w-3.5 h-3.5 text-green-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </button>
              </div>
            )}

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

          {/* K21-FIX-G: Resolved Config Snapshot */}
          <div className="px-4 pb-4">
            <ResolvedConfigDisplay config={previewData.config ?? null} />
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
