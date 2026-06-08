'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DAYS, TIME_SLOTS } from '@/types/schedule'
import { getTeachingSlotLabelOptions, formatTeachingSlotLabel, VALID_TEACHING_SLOT_INDEXES } from '@/lib/schedule/time-slots'
import type { ScheduleViewData } from '@/types/schedule'
import type { EntityOption } from '@/components/combobox'
import type { ScheduleAdjustmentDryRunResult } from '@/types/schedule-adjustment'
import { dryRunScheduleAdjustment, createScheduleAdjustment, fetchRoomRecommendations, fetchPlanRecommendations, type RoomRecommendationResult, type AdjustmentPlanRecommendationResult } from '@/lib/schedule/adjustment-client'
import { useHasPermission } from '@/components/layout/current-user-context'
import { resolveWorkTimeConfig } from '@/lib/settings/worktime-settings-client'
import type { ResolvedWorkTimeConfig } from '@/types/worktime'

interface ScheduleAdjustmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  week: number
  item: ScheduleViewData | null
  roomOptions: EntityOption[]
  onSaved: () => void
}

export function ScheduleAdjustmentDialog({
  open,
  onOpenChange,
  week,
  item,
  roomOptions,
  onSaved,
}: ScheduleAdjustmentDialogProps) {
  const [targetWeek, setTargetWeek] = useState(week)
  const [newDayOfWeek, setNewDayOfWeek] = useState(1)
  const [newSlotIndex, setNewSlotIndex] = useState(1)
  const [newRoomId, setNewRoomId] = useState<number | null>(null)
  const [reason, setReason] = useState('')

  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<ScheduleAdjustmentDryRunResult | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  // K23-A: room recommendation state. Additive; manual selection is unchanged.
  const [recommendLoading, setRecommendLoading] = useState(false)
  const [recommendResult, setRecommendResult] = useState<RoomRecommendationResult | null>(null)
  const [recommendError, setRecommendError] = useState<string | null>(null)
  // K24-A: joint time + room plan recommendation state. Additive.
  const [planLoading, setPlanLoading] = useState(false)
  const [planResult, setPlanResult] = useState<AdjustmentPlanRecommendationResult | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  // K24-A1-UX: explicit preferred-week selector for one-click plan
  // recommendation. Defaults to current targetWeek (or item's week
  // when item first loads). Independent of the manual targetWeek so
  // the user can pick a different center for the search without
  // committing the form to that week.
  const [preferredPlanWeek, setPreferredPlanWeek] = useState(week)
  // K24-A5: explicit preferred day-of-week selector (null = auto,
  // 1..5 = Mon..Fri). Independent of the manual newDayOfWeek so
  // the user can pick a different search center without committing
  // the form to that day.
  const [preferredPlanDay, setPreferredPlanDay] = useState<number | null>(null)
  // K24-A1-UX: which plan the user has selected from the collapsed
  // list (used for highlighting + the explicit "使用该方案" button).
  const [selectedPlanKey, setSelectedPlanKey] = useState<string | null>(null)
  // K24-A1-UX: collapsed/expanded state for the plan list. Closed by
  // default so the dialog stays compact.
  const [planListOpen, setPlanListOpen] = useState(false)
  // K24-A1-UX: "show advanced tools" toggle. When false, the K23-A
  // 推荐教室 button and the 检查冲突 button are hidden. The
  // one-click plan flow remains the primary entry point.
  const [showAdvancedTools, setShowAdvancedTools] = useState(false)
  // Display-side minimum (must match the helper's MIN_CANDIDATES = 2).
  // We don't import the helper constant to keep the bundle split clean.
  const MIN_RECOMMEND_DISPLAY = 2
  // K14-FIX-A: schedule:adjust gates the real "create adjustment" submit
  // and the void submit (in dashboard-content). Server-side
  // requirePermission('schedule:adjust') on /api/schedule-adjustments and
  // /api/schedule-adjustments/[id]/void remains the final security boundary.
  const canAdjust = useHasPermission('schedule:adjust')

  // K26-I4A: WorkTime state with static safe fallback (never null).
  const [workTimeRaw, setWorkTimeRaw] = useState<ResolvedWorkTimeConfig | null>(null)
  const [workTimeLoadError, setWorkTimeLoadError] = useState<string | null>(null)

  // K26-I4A: Derived WorkTime with static safe fallback.
  // When API fails or returns null, fallback matches K26-D static helper exactly.
  const workTime = useMemo(() => {
    if (workTimeRaw) return workTimeRaw
    // Static safe fallback: slots 1-5 active teaching, slots 6/7 legacy, allowWeekend=false
    return {
      semesterId: 0,
      source: 'staticFallback' as const,
      config: {
        id: 0,
        semesterId: 0,
        name: '安全默认',
        isDefault: true,
        allowWeekend: false,
        lunchStart: '12:00',
        lunchEnd: '13:00',
        isActive: true,
        version: 1,
        effectiveFrom: null,
        notes: 'K26-I4A static safe fallback',
        createdAt: '',
        updatedAt: '',
        slots: VALID_TEACHING_SLOT_INDEXES.map((i) => ({
          id: i,
          workTimeConfigId: 0,
          slotIndex: i,
          label: formatTeachingSlotLabel(i),
          startsAt: null,
          endsAt: null,
          isActive: true,
          isTeachingSlot: true,
          isLegacyDisplay: false,
          sortOrder: i,
        })),
      },
    } as ResolvedWorkTimeConfig
  }, [workTimeRaw])

  // K26-I4A: Derived allowed day options (shared by target day + preferredDay)
  const allowedDayOptions = useMemo(() => {
    return DAYS.filter((d) => d.value <= 5 || workTime.config?.allowWeekend)
  }, [workTime.config?.allowWeekend])

  // K26-I4A: Derived slot options from WorkTime active teaching slots.
  // Not memoized — cheap computation on small array.
  const slotOptions = workTime.config?.slots
    ? workTime.config.slots
        .filter((s: { isActive: boolean; isTeachingSlot: boolean; isLegacyDisplay: boolean }) =>
          s.isActive && s.isTeachingSlot && !s.isLegacyDisplay)
        .sort((a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder)
        .map((s: { slotIndex: number; label: string }) => ({ index: s.slotIndex, label: s.label }))
    : getTeachingSlotLabelOptions()

  // Reset form when item changes
  useEffect(() => {
    if (item) {
      setTargetWeek(week)
      setNewDayOfWeek(item.dayOfWeek)
      setNewSlotIndex(item.slotIndex)
      setNewRoomId(item.roomId)
      setReason('')
      setDryRunResult(null)
      setConfirmError(null)
      setConfirmDialogOpen(false)
      // K23-A: clear recommendation state on item change
      setRecommendResult(null)
      setRecommendError(null)
      // K24-A: clear plan recommendation state on item change
      setPlanResult(null)
      setPlanError(null)
      setSelectedPlanKey(null)
      setPlanListOpen(false)
      // K24-A5: reset preferredPlanDay to automatic on item change.
      setPreferredPlanDay(null)
      // K24-A1-UX: align the explicit preferred-week selector with
      // the current source week.
      setPreferredPlanWeek(week)
    }
  }, [item, week])

  // K26-I4A: Load WorkTime config when dialog opens or item changes.
  // Falls back to K26-D static safe defaults on API failure (never null).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    resolveWorkTimeConfig(undefined)
      .then((resolved) => {
        if (!cancelled) {
          setWorkTimeRaw(resolved)
          setWorkTimeLoadError(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkTimeRaw(null)
          setWorkTimeLoadError('作息配置加载失败，已使用安全默认作息：工作日 1-5 节次。')
        }
      })
    return () => { cancelled = true }
  }, [open, item])

  if (!item) return null

  const isCrossWeek = targetWeek !== week
  const isSamePosition = !isCrossWeek && newDayOfWeek === item.dayOfWeek && newSlotIndex === item.slotIndex && newRoomId === item.roomId

  async function handleDryRun() {
    if (!item) return
    if (!canAdjust) {
      toast.error('没有调课权限', { description: '当前账号没有调课权限' })
      return
    }
    setDryRunLoading(true)
    setDryRunResult(null)
    setConfirmError(null)
    try {
      const data = await dryRunScheduleAdjustment({
        type: 'MOVE',
        week,
        targetWeek,
        originalSlotId: item.slotId,
        newDayOfWeek,
        newSlotIndex,
        newRoomId,
        reason: reason || null,
      })
      setDryRunResult(data.dryRun)
      if (!data.dryRun.canApply) {
        toast.warning('存在冲突', { description: '请调整目标位置后重新检查' })
      }
    } catch (e) {
      toast.error('检查失败', { description: String(e) })
    } finally {
      setDryRunLoading(false)
    }
  }

  // K23-A: room recommendation handler. Read-only call; results are
  // advisory and do not auto-submit the adjustment.
  async function handleRecommendRooms() {
    if (!item) return
    if (!canAdjust) {
      toast.error('没有调课权限', { description: '当前账号没有调课权限' })
      return
    }
    setRecommendLoading(true)
    setRecommendError(null)
    try {
      const data = await fetchRoomRecommendations({
        scheduleSlotId: item.slotId,
        targetWeek,
        targetDayOfWeek: newDayOfWeek,
        targetSlotIndex: newSlotIndex,
        limit: 5,
      })
      setRecommendResult(data)
      if (data.candidates.length === 0) {
        toast.warning('没有可用教室', {
          description: data.message ?? '请尝试其他时间段',
        })
      } else if (!data.minimumSatisfied) {
        toast.warning(`可用教室不足 ${MIN_RECOMMEND_DISPLAY} 个`, {
          description: data.message ?? '请检查拒绝原因后手动选择',
        })
      }
    } catch (e) {
      const msg = String(e)
      setRecommendError(msg)
      // API failure does NOT block manual adjustment.
      toast.error('推荐失败', { description: msg + '。请手动选择教室。' })
    } finally {
      setRecommendLoading(false)
    }
  }

  function pickCandidate(roomId: number) {
    setNewRoomId(roomId)
    // Re-running dry-run after a click is the user's decision; we just
    // fill the form. The existing 确认调课 button still gates submit.
  }

  // K24-A: plan recommendation handler. Read-only call; results are
  // advisory and do not auto-submit the adjustment.
  async function handleRecommendPlans() {
    if (!item) return
    if (!canAdjust) {
      toast.error('没有调课权限', { description: '当前账号没有调课权限' })
      return
    }
    setPlanLoading(true)
    setPlanError(null)
    setSelectedPlanKey(null)
    setPlanListOpen(true)
    try {
      const data = await fetchPlanRecommendations({
        scheduleSlotId: item.slotId,
        // K24-A1-UX: use the explicit preferred-week selector so the
        // user can pick a different search center without changing
        // the form's manual targetWeek.
        preferredWeek: preferredPlanWeek,
        weekWindow: 1,
        includeWeekend: false,
        limit: 5,
        // K24-A5: pass the explicit preferred-day selector (null
        // for automatic). Server-side defensive validation rejects
        // 6/7; we never send those.
        preferredDayOfWeek: preferredPlanDay,
      })
      setPlanResult(data)
      if (data.plans.length === 0) {
        toast.warning('没有可推荐方案', {
          description: data.message ?? '请尝试其他首选周次或扩大搜索范围',
        })
      } else if (!data.minimumSatisfied) {
        toast.warning(`可推荐方案不足 ${MIN_RECOMMEND_DISPLAY} 个`, {
          description: data.message ?? '请检查拒绝原因或继续手动选择',
        })
      }
    } catch (e) {
      const msg = String(e)
      setPlanError(msg)
      toast.error('推荐方案失败', { description: msg + '。请手动调课。' })
    } finally {
      setPlanLoading(false)
    }
  }

  // K24-A1-UX: stable key for a plan so React identity is consistent
  // even when the same plan is re-emitted by the backend.
  function planKey(p: {
    targetWeek: number
    targetDayOfWeek: number
    targetSlotIndex: number
    roomId: number
  }) {
    return `${p.targetWeek}|${p.targetDayOfWeek}|${p.targetSlotIndex}|${p.roomId}`
  }

  // K24-A1-UX: explicit "use this plan" action. Clicking a list item
  // only selects it; the user then confirms via this button or via
  // the existing 检查冲突 / 确认调课 flow.
  function applySelectedPlan() {
    if (!planResult || !selectedPlanKey) return
    const plan = planResult.plans.find(
      (p) =>
        planKey({
          targetWeek: p.targetWeek,
          targetDayOfWeek: p.targetDayOfWeek,
          targetSlotIndex: p.targetSlotIndex,
          roomId: p.roomId,
        }) === selectedPlanKey,
    )
    if (!plan) return
    pickPlan(plan)
  }

  function pickPlan(plan: {
    targetWeek: number
    targetDayOfWeek: number
    targetSlotIndex: number
    roomId: number
  }) {
    // Fill all four fields. The form is now in a state equivalent to
    // a fresh manual selection; user still gates dry-run / submit.
    setTargetWeek(plan.targetWeek)
    setNewDayOfWeek(plan.targetDayOfWeek)
    setNewSlotIndex(plan.targetSlotIndex)
    setNewRoomId(plan.roomId)
    setSelectedPlanKey(planKey(plan))
    // K23-A room recommendation results are no longer relevant once
    // the user picks a plan. Clearing avoids stale mismatched state.
    setRecommendResult(null)
    setDryRunResult(null)
  }

  async function handleConfirm() {
    if (!item) return
    if (!canAdjust) {
      toast.error('没有调课权限', { description: '当前账号没有调课权限' })
      setConfirmDialogOpen(false)
      return
    }
    setConfirmDialogOpen(false)
    setConfirmLoading(true)
    setConfirmError(null)
    try {
      await createScheduleAdjustment({
        type: 'MOVE',
        week,
        targetWeek,
        originalSlotId: item.slotId,
        newDayOfWeek,
        newSlotIndex,
        newRoomId,
        reason: reason || null,
      })
      const weekLabel = isCrossWeek ? `第 ${week} 周 → 第 ${targetWeek} 周` : `第 ${week} 周`
      toast.success('调课成功', {
        description: `${item.courseName} ${weekLabel} · ${DAYS.find((d) => d.value === newDayOfWeek)?.label} ${TIME_SLOTS.find((t) => t.index === newSlotIndex)?.label ?? newSlotIndex}`,
      })
      onSaved()
      onOpenChange(false)
    } catch (e) {
      const msg = String(e)
      setConfirmError(msg)
      toast.error('调课失败', { description: msg })
    } finally {
      setConfirmLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>调课 — {item.courseName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {/* 原课程信息 */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <p><span className="text-gray-500">教师：</span>{item.teacherName || '待定'}</p>
              <p><span className="text-gray-500">班级：</span>{item.classNames.join('、')}</p>
              <p>
                <span className="text-gray-500">原位置：</span>
                {DAYS.find((d) => d.value === item.dayOfWeek)?.label}{' '}
                {TIME_SLOTS.find((t) => t.index === item.slotIndex)?.label ?? `${item.slotIndex}`}
                {item.roomName ? ` · ${item.roomName}` : ''}
              </p>
            </div>

            {/* 周次选择 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>源周次</Label>
                <div className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-100 text-gray-600">
                  第 {week} 周
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>目标周次</Label>
                <select
                  value={targetWeek}
                  onChange={(e) => {
                    setTargetWeek(parseInt(e.target.value, 10))
                    setDryRunResult(null)
                    setRecommendResult(null)
                    setPlanResult(null)
                  }}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
                >
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((w) => (
                    <option key={w} value={w}>第 {w} 周</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 新位置表单 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>新星期</Label>
                <select
                  value={newDayOfWeek}
                  onChange={(e) => {
                    setNewDayOfWeek(parseInt(e.target.value, 10))
                    setRecommendResult(null)
                    setPlanResult(null)
                  }}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
                >
                  {/* K26-I4A: shared allowedDayOptions from WorkTime */}
                  {allowedDayOptions.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>新节次</Label>
                <select
                  value={newSlotIndex}
                  onChange={(e) => {
                    setNewSlotIndex(parseInt(e.target.value, 10))
                    setRecommendResult(null)
                    setPlanResult(null)
                  }}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
                >
                  {/* K26-I4A: slot options from WorkTime active teaching slots */}
                  {slotOptions.map((t) => (
                    <option key={t.index} value={t.index}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>新教室</Label>
                <select
                  value={newRoomId ?? ''}
                  onChange={(e) => setNewRoomId(e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
                >
                  <option value="">不变</option>
                  {roomOptions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>调课原因（可选）</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="如：教师出差、教室维修等"
              />
            </div>

            {/* K26-I4A: WorkTime metadata / info strip — always shown (has static safe fallback) */}
            <div className="rounded-lg p-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 space-y-0.5" data-testid="k26-i4-worktime-info">
              {workTimeLoadError && (
                <p className="text-amber-700 font-medium">{workTimeLoadError}</p>
              )}
              <p>
                作息配置：{workTime.source === 'database' ? '数据库' : '系统默认'}
                {workTime.config?.allowWeekend ? '（允许周末）' : '（仅工作日）'}
                ｜可选节次：{slotOptions.map((t) => t.label).join(' / ')}
              </p>
              <p className="text-gray-500">
                11-12节 / 中午仅用于历史显示，不可作为新调课目标。
                一键推荐 / 调课 / 推荐教室已接入作息配置；solver / score 尚未接入。
              </p>
            </div>

            {/* K24-A1-UX: 高级选项开关（默认隐藏 K23-A 推荐教室 + 检查冲突） */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAdvancedTools}
                  onChange={(e) => setShowAdvancedTools(e.target.checked)}
                  className="rounded border-gray-300"
                  data-testid="k24-advanced-toggle"
                />
                高级选项（显示手动检查 / 单时间推荐教室）
              </label>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-2">
              {showAdvancedTools && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDryRun}
                  disabled={!canAdjust || dryRunLoading || confirmLoading || isSamePosition}
                  title={canAdjust ? undefined : '当前账号没有调课权限'}
                >
                  {dryRunLoading ? '检查中...' : '检查冲突'}
                </Button>
              )}
              {showAdvancedTools && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRecommendRooms}
                  disabled={!canAdjust || recommendLoading || confirmLoading}
                  title={canAdjust ? undefined : '当前账号没有调课权限'}
                >
                  {recommendLoading ? '推荐中...' : '推荐教室'}
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={handleRecommendPlans}
                disabled={!canAdjust || planLoading || confirmLoading}
                title={canAdjust ? undefined : '当前账号没有调课权限'}
                data-testid="k24-plan-button"
              >
                {planLoading ? '搜索方案中...' : '一键推荐调课方案'}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!canAdjust) {
                    toast.error('没有调课权限', { description: '当前账号没有调课权限' })
                    return
                  }
                  setConfirmDialogOpen(true)
                }}
                disabled={!canAdjust || !dryRunResult?.canApply || confirmLoading || isSamePosition}
                title={canAdjust ? undefined : '当前账号没有调课权限'}
              >
                确认调课
              </Button>
            </div>

            {/* K24-A1-UX: 优先调课周次 + 一键推荐入口区。
                始终显示在主操作按钮之上方, 让用户先选定优先调课周次。 */}
            <div
              className="rounded-lg p-3 space-y-2 bg-purple-50 border border-purple-200"
              data-testid="k24-plan-entry"
            >
              <p className="text-sm font-medium text-purple-800">一键推荐调课方案</p>
              <p className="text-xs text-gray-600">
                系统会在该周 ±1 周内自动配对时间 + 教室（工作日优先）。点击方案可填入表单，仍需手动确认调课。
              </p>
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">优先调课至</Label>
                <select
                  value={preferredPlanWeek}
                  onChange={(e) => setPreferredPlanWeek(parseInt(e.target.value, 10))}
                  className="w-24 px-2 py-1 text-sm border border-gray-200 rounded-lg bg-white"
                  data-testid="k24-preferred-week"
                  aria-label="优先调课周次"
                >
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((w) => (
                    <option key={w} value={w}>第 {w} 周</option>
                  ))}
                </select>
                <span className="text-xs text-gray-500">（当前：第 {preferredPlanWeek} 周）</span>
              </div>
              {/* K24-A5 + K26-I4A: explicit preferred-day selector. null = automatic. */}
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">优先星期</Label>
                <select
                  value={preferredPlanDay == null ? '' : String(preferredPlanDay)}
                  onChange={(e) => {
                    const v = e.target.value
                    setPreferredPlanDay(v === '' ? null : parseInt(v, 10))
                  }}
                  className="w-28 px-2 py-1 text-sm border border-gray-200 rounded-lg bg-white"
                  data-testid="k24-preferred-day"
                  aria-label="优先调课星期"
                >
                  <option value="">自动匹配</option>
                  {/* K26-I4A: use same allowedDayOptions as target day */}
                  {allowedDayOptions.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-500">
                  {preferredPlanDay == null
                    ? '（不指定星期）'
                    : `（当前：${DAYS.find((d) => d.value === preferredPlanDay)?.label ?? ''}）`}
                </span>
              </div>
            </div>

            {/* K23-A: room recommendation results */}
            {(recommendResult || recommendError) && (
              <div className="rounded-lg p-3 space-y-2 bg-blue-50 border border-blue-200">
                <p className="text-sm font-medium text-blue-800">
                  推荐教室
                  {recommendResult
                    ? recommendResult.minimumSatisfied
                      ? `（${recommendResult.candidates.length} 个候选，已满足至少 ${MIN_RECOMMEND_DISPLAY} 个）`
                      : `（仅 ${recommendResult.candidates.length} 个候选，少于 ${MIN_RECOMMEND_DISPLAY} 个）`
                    : '（请求失败）'}
                </p>
                {recommendError && (
                  <p className="text-sm text-red-700">
                    推荐 API 调用失败：{recommendError}。可继续手动选择教室。
                  </p>
                )}
                {recommendResult && recommendResult.candidates.length === 0 && (
                  <p className="text-sm text-amber-800">
                    {recommendResult.message ?? '当前时间段没有可用教室，请尝试其他时段。'}
                  </p>
                )}
                {recommendResult && !recommendResult.minimumSatisfied && recommendResult.candidates.length > 0 && (
                  <p className="text-sm text-amber-800">
                    {recommendResult.message ?? `可用教室少于 ${MIN_RECOMMEND_DISPLAY} 个，请检查拒绝原因或继续手动选择。`}
                  </p>
                )}
                {recommendResult && recommendResult.candidates.length > 0 && (
                  <ul className="space-y-1.5">
                    {recommendResult.candidates.map((c) => (
                      <li
                        key={c.roomId}
                        className={`text-sm rounded-md border px-2 py-1.5 cursor-pointer hover:bg-blue-100 ${
                          newRoomId === c.roomId ? 'border-blue-500 bg-blue-100' : 'border-blue-200 bg-white'
                        }`}
                        onClick={() => pickCandidate(c.roomId)}
                        title="点击填入新教室"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {c.roomName}
                            {c.building ? `（${c.building}）` : ''}
                          </span>
                          <span className="text-xs text-gray-500">
                            容量 {c.capacity} · 评分 {c.score}
                          </span>
                        </div>
                        {c.reasons.length > 0 && (
                          <ul className="text-xs text-green-700 list-disc list-inside mt-0.5">
                            {c.reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        )}
                        {c.warnings.length > 0 && (
                          <ul className="text-xs text-amber-700 list-disc list-inside mt-0.5">
                            {c.warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {recommendResult && !recommendResult.minimumSatisfied && (
                  <div className="text-xs text-gray-600">
                    拒绝原因汇总：
                    {[
                      recommendResult.rejectedSummary.conflict > 0 && `冲突 ${recommendResult.rejectedSummary.conflict}`,
                      recommendResult.rejectedSummary.capacity > 0 && `容量 ${recommendResult.rejectedSummary.capacity}`,
                      recommendResult.rejectedSummary.linxiaoPolicy > 0 && `林校规则 ${recommendResult.rejectedSummary.linxiaoPolicy}`,
                      recommendResult.rejectedSummary.unavailable > 0 && `不可用 ${recommendResult.rejectedSummary.unavailable}`,
                      recommendResult.rejectedSummary.other > 0 && `其他 ${recommendResult.rejectedSummary.other}`,
                    ]
                      .filter(Boolean)
                      .join('、') || '无'}
                  </div>
                )}
              </div>
            )}

            {/* K24-A1-UX: joint time + room plan recommendation results.
                折叠式下拉: summary 行 + 展开按钮 + max-height 滚动列表 + 使用该方案. */}
            {(planResult || planError) && (
              <div
                className="rounded-lg p-3 space-y-2 bg-purple-50 border border-purple-200"
                data-testid="k24-plan-panel"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-purple-800">
                    一键推荐调课方案
                    {planResult
                      ? planResult.minimumSatisfied
                        ? `（已推荐 ${planResult.plans.length} 个方案，已满足至少 ${MIN_RECOMMEND_DISPLAY} 个）`
                        : `（仅 ${planResult.plans.length} 个方案，少于 ${MIN_RECOMMEND_DISPLAY} 个）`
                      : '（请求失败）'}
                  </p>
                  {planResult && planResult.plans.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPlanListOpen((v) => !v)}
                      className="text-xs text-purple-700 underline"
                      data-testid="k24-plan-toggle"
                    >
                      {planListOpen ? '收起' : '点击展开选择'}
                    </button>
                  )}
                </div>
                {planError && (
                  <p className="text-sm text-red-700">
                    推荐方案 API 调用失败：{planError}。可继续手动调课。
                  </p>
                )}
                {planResult && planResult.plans.length === 0 && (
                  <p className="text-sm text-amber-800">
                    {planResult.message ?? '当前没有可推荐方案，请尝试调整首选周次或扩大搜索范围。'}
                  </p>
                )}
                {planResult && planResult.searched && (
                  <p className="text-xs text-gray-600">
                    搜索范围：周次 [{planResult.searched.weeks.join(', ')}] · 星期 [{planResult.searched.days.join(', ')}] · 节次 [{planResult.searched.slotIndexes.join(', ')}]
                    （共枚举 {planResult.searched.timeCandidateCount} 个时间点，已用 {planResult.searched.roomCandidateCount} 间教室）
                    {planResult.searched.preferredDayOfWeek != null
                      ? ` · 首选日期 ${planResult.searched.preferredDayPlanCount} 个，同周其他 ${planResult.searched.sameWeekOtherDayPlanCount} 个，备选周 ${planResult.searched.fallbackPlanCount} 个`
                      : ` · 首选周 ${planResult.searched.preferredWeekPlanCount} 个，备选周 ${planResult.searched.fallbackPlanCount} 个`}
                  </p>
                )}
                {/* K24-A3 / K24-A5: preferredWeek / preferredDay unavailable message */}
                {planResult && !planResult.preferredWeekAvailable && planResult.plans.length > 0 && (
                  <p className="text-sm text-amber-800">
                    第 {planResult.preferredWeek} 周暂无可用方案，以下为邻近周备选方案
                  </p>
                )}
                {planResult && planResult.preferredWeekAvailable && planResult.preferredDayOfWeek != null && !planResult.preferredDayAvailable && planResult.plans.length > 0 && (
                  <p className="text-sm text-amber-800" data-testid="k24-preferred-day-unavailable">
                    第 {planResult.preferredWeek} 周{DAYS.find((d) => d.value === planResult.preferredDayOfWeek)?.label ?? ''}暂无可用方案，以下为同周其他日期 / 邻近周备选方案
                  </p>
                )}
                {planResult && !planResult.minimumSatisfied && planResult.plans.length > 0 && planResult.preferredWeekAvailable && (
                  <p className="text-sm text-amber-800">
                    {planResult.message ?? `可推荐方案少于 ${MIN_RECOMMEND_DISPLAY} 个，请检查拒绝原因或继续手动选择。`}
                  </p>
                )}

                {/* K24-A1-UX + K24-A3 + K24-A5: 可滚动 / 可展开下拉式列表，
                    分首选日期 / 同周其他 / 备选周 */}
                {planResult && planResult.plans.length > 0 && planListOpen && (
                  <div className="space-y-2">
                    <ul
                      className="space-y-1.5 max-h-64 overflow-y-auto pr-1"
                      data-testid="k24-plan-list"
                    >
                      {(() => {
                        // K24-A3 + K24-A5: three-bucket grouping.
                        // preferred plans are already at the front of
                        // planResult.plans (bucketed by the helper):
                        //   1. (preferredWeek, preferredDayOfWeek) — K24-A5
                        //   2. (preferredWeek, other days)
                        //   3. (fallbackWeek, *)
                        // In automatic mode (preferredDayOfWeek = null),
                        // bucket 1 is empty and buckets 2+3
                        // collapse to the K24-A3 two-bucket shape.
                        const preferredDayPlans = planResult.preferredDayOfWeek
                          ? planResult.plans.filter(
                              (p) =>
                                p.targetWeek === planResult.preferredWeek &&
                                p.targetDayOfWeek === planResult.preferredDayOfWeek,
                            )
                          : []
                        const sameWeekOtherDayPlans = planResult.plans.filter(
                          (p) =>
                            p.targetWeek === planResult.preferredWeek &&
                            (planResult.preferredDayOfWeek == null ||
                              p.targetDayOfWeek !== planResult.preferredDayOfWeek),
                        )
                        const fallbackPlans = planResult.plans.filter(
                          (p) => p.targetWeek !== planResult.preferredWeek,
                        )
                        const weekLabel = `第 ${planResult.preferredWeek} 周`
                        const dayLabel = planResult.preferredDayOfWeek
                          ? DAYS.find((d) => d.value === planResult.preferredDayOfWeek)?.label ?? ''
                          : ''

                        const renderItem = (p: typeof planResult.plans[number]) => {
                          const k = planKey(p)
                          const isSelected = selectedPlanKey === k
                          return (
                            <li
                              key={k}
                              className={`text-sm rounded-md border px-2 py-1.5 cursor-pointer hover:bg-purple-100 ${
                                isSelected ? 'border-purple-500 bg-purple-100' : 'border-purple-200 bg-white'
                              }`}
                              onClick={() => setSelectedPlanKey(k)}
                              title="点击选中此方案"
                              data-testid="k24-plan-item"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">
                                  第 {p.targetWeek} 周 · {DAYS.find((d) => d.value === p.targetDayOfWeek)?.label} · {TIME_SLOTS.find((t) => t.index === p.targetSlotIndex)?.label ?? `${p.targetSlotIndex}`} · {p.roomName}
                                  {p.building ? `（${p.building}）` : ''}
                                </span>
                                <span className="text-xs text-gray-500">
                                  容量 {p.capacity} · 评分 {p.score}
                                </span>
                              </div>
                              {p.reasons.length > 0 && (
                                <ul className="text-xs text-green-700 list-disc list-inside mt-0.5">
                                  {p.reasons.map((r, idx) => (
                                    <li key={idx}>{r}</li>
                                  ))}
                                </ul>
                              )}
                              {p.warnings.length > 0 && (
                                <ul className="text-xs text-amber-700 list-disc list-inside mt-0.5">
                                  {p.warnings.map((w, idx) => (
                                    <li key={idx}>{w}</li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          )
                        }

                        return (
                          <>
                            {preferredDayPlans.length > 0 && (
                              <li
                                className="text-xs font-medium text-purple-700 pt-1 pb-0.5 border-b border-purple-200"
                                data-testid="k24-plan-bucket-preferred-day"
                              >
                                首选日期方案（{weekLabel} {dayLabel}，{preferredDayPlans.length} 个）
                              </li>
                            )}
                            {preferredDayPlans.map(renderItem)}
                            {sameWeekOtherDayPlans.length > 0 && (
                              <li
                                className="text-xs font-medium text-purple-700 pt-2 pb-0.5 border-b border-purple-200"
                                data-testid="k24-plan-bucket-same-week-other"
                              >
                                {planResult.preferredDayOfWeek
                                  ? `同周其他日期方案（${sameWeekOtherDayPlans.length} 个）`
                                  : `首选周方案（${weekLabel}，${sameWeekOtherDayPlans.length} 个）`}
                              </li>
                            )}
                            {sameWeekOtherDayPlans.map(renderItem)}
                            {fallbackPlans.length > 0 && (
                              <li
                                className="text-xs font-medium text-gray-500 pt-2 pb-0.5 border-b border-gray-200"
                                data-testid="k24-plan-bucket-fallback"
                              >
                                备选周方案（{fallbackPlans.length} 个）
                              </li>
                            )}
                            {fallbackPlans.map(renderItem)}
                          </>
                        )
                      })()}
                    </ul>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={applySelectedPlan}
                        disabled={!selectedPlanKey}
                        data-testid="k24-plan-apply"
                      >
                        使用该方案
                      </Button>
                      <span className="text-xs text-gray-500">
                        {selectedPlanKey
                          ? '已选中方案，可点击"使用该方案"填入表单'
                          : '先点击列表中的方案以选中'}
                      </span>
                    </div>
                  </div>
                )}

                {planResult && !planResult.minimumSatisfied && (
                  <div className="text-xs text-gray-600">
                    拒绝原因汇总（已合并自时间层 + 教室层）：
                    {[
                      planResult.rejectedSummary.roomConflict > 0 && `房间冲突 ${planResult.rejectedSummary.roomConflict}`,
                      planResult.rejectedSummary.capacity > 0 && `容量 ${planResult.rejectedSummary.capacity}`,
                      planResult.rejectedSummary.linxiaoPolicy > 0 && `林校规则 ${planResult.rejectedSummary.linxiaoPolicy}`,
                      planResult.rejectedSummary.weekend > 0 && `周末 ${planResult.rejectedSummary.weekend}`,
                      planResult.rejectedSummary.unavailable > 0 && `不可用 ${planResult.rejectedSummary.unavailable}`,
                      planResult.rejectedSummary.teacherConflict > 0 && `教师冲突 ${planResult.rejectedSummary.teacherConflict}`,
                      planResult.rejectedSummary.classGroupConflict > 0 && `班级冲突 ${planResult.rejectedSummary.classGroupConflict}`,
                      planResult.rejectedSummary.other > 0 && `其他 ${planResult.rejectedSummary.other}`,
                    ]
                      .filter(Boolean)
                      .join('、') || '无'}
                  </div>
                )}
              </div>
            )}

            {/* Dry-run 结果 */}
            {dryRunResult && (
              <div className={`rounded-lg p-3 space-y-2 ${dryRunResult.canApply ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <p className={`text-sm font-medium ${dryRunResult.canApply ? 'text-green-800' : 'text-red-800'}`}>
                  {dryRunResult.canApply ? '可以调课' : '存在冲突'}
                </p>
                {dryRunResult.conflicts.length > 0 && (
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-0.5">
                    {dryRunResult.conflicts.map((c, i) => (
                      <li key={i}>{typeof c.message === 'string' ? c.message : JSON.stringify(c.message)}</li>
                    ))}
                  </ul>
                )}
                {dryRunResult.warnings.length > 0 && (
                  <ul className="list-disc list-inside text-sm text-amber-700 space-y-0.5">
                    {dryRunResult.warnings.map((w, i) => (
                      <li key={i}>{typeof w.message === 'string' ? w.message : JSON.stringify(w.message)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Confirm error */}
            {confirmError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-sm text-red-700">
                {confirmError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirmLoading}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 确认调课二次确认 */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认调课</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>将 <strong>{item.courseName}</strong> 从</p>
            <p className="text-gray-600">
              第 {week} 周 · {DAYS.find((d) => d.value === item.dayOfWeek)?.label} {TIME_SLOTS.find((t) => t.index === item.slotIndex)?.label}
              {item.roomName ? ` · ${item.roomName}` : ''}
            </p>
            <p>移动到</p>
            <p className="text-gray-600">
              第 {targetWeek} 周 · {DAYS.find((d) => d.value === newDayOfWeek)?.label} {TIME_SLOTS.find((t) => t.index === newSlotIndex)?.label}
              {newRoomId ? ` · ${roomOptions.find((r) => r.id === newRoomId)?.name ?? ''}` : ''}
            </p>
            <p className="text-xs text-gray-500">
              {isCrossWeek
                ? `跨周调课：第 ${week} 周课程调至第 ${targetWeek} 周，不修改原始课表。`
                : `仅影响第 ${week} 周，不修改原始课表。`}
            </p>
            {reason && <p className="text-xs text-gray-500">原因：{reason}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)} disabled={confirmLoading}>
              取消
            </Button>
            <Button onClick={handleConfirm} disabled={!canAdjust || confirmLoading} title={canAdjust ? undefined : '当前账号没有调课权限'}>
              {confirmLoading ? '保存中...' : '确认调课'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
