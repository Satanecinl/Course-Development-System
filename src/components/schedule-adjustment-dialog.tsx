'use client'

import { useState, useEffect } from 'react'
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
import type { ScheduleViewData } from '@/types/schedule'
import type { EntityOption } from '@/components/combobox'
import type { ScheduleAdjustmentDryRunResult } from '@/types/schedule-adjustment'
import { dryRunScheduleAdjustment, createScheduleAdjustment, fetchRoomRecommendations, fetchPlanRecommendations, type RoomRecommendationResult, type AdjustmentPlanRecommendationResult } from '@/lib/schedule/adjustment-client'
import { useHasPermission } from '@/components/layout/current-user-context'

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
  // Display-side minimum (must match the helper's MIN_CANDIDATES = 2).
  // We don't import the helper constant to keep the bundle split clean.
  const MIN_RECOMMEND_DISPLAY = 2
  // K14-FIX-A: schedule:adjust gates the real "create adjustment" submit
  // and the void submit (in dashboard-content). Server-side
  // requirePermission('schedule:adjust') on /api/schedule-adjustments and
  // /api/schedule-adjustments/[id]/void remains the final security boundary.
  const canAdjust = useHasPermission('schedule:adjust')

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
    }
  }, [item, week])

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
    try {
      const data = await fetchPlanRecommendations({
        scheduleSlotId: item.slotId,
        // Use current targetWeek as the search center so the user
        // can narrow the window by selecting a week first.
        preferredWeek: targetWeek,
        weekWindow: 1,
        includeWeekend: false,
        limit: 5,
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
                  {DAYS.map((d) => (
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
                  {TIME_SLOTS.map((t) => (
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

            {/* 操作按钮 */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDryRun}
                disabled={!canAdjust || dryRunLoading || confirmLoading || isSamePosition}
                title={canAdjust ? undefined : '当前账号没有调课权限'}
              >
                {dryRunLoading ? '检查中...' : '检查冲突'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRecommendRooms}
                disabled={!canAdjust || recommendLoading || confirmLoading}
                title={canAdjust ? undefined : '当前账号没有调课权限'}
              >
                {recommendLoading ? '推荐中...' : '推荐教室'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRecommendPlans}
                disabled={!canAdjust || planLoading || confirmLoading}
                title={canAdjust ? undefined : '当前账号没有调课权限'}
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

            {/* K24-A: joint time + room plan recommendation results */}
            {(planResult || planError) && (
              <div className="rounded-lg p-3 space-y-2 bg-purple-50 border border-purple-200">
                <p className="text-sm font-medium text-purple-800">
                  一键推荐调课方案
                  {planResult
                    ? planResult.minimumSatisfied
                      ? `（${planResult.plans.length} 个方案，已满足至少 ${MIN_RECOMMEND_DISPLAY} 个）`
                      : `（仅 ${planResult.plans.length} 个方案，少于 ${MIN_RECOMMEND_DISPLAY} 个）`
                    : '（请求失败）'}
                </p>
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
                  </p>
                )}
                {planResult && !planResult.minimumSatisfied && planResult.plans.length > 0 && (
                  <p className="text-sm text-amber-800">
                    {planResult.message ?? `可推荐方案少于 ${MIN_RECOMMEND_DISPLAY} 个，请检查拒绝原因或继续手动选择。`}
                  </p>
                )}
                {planResult && planResult.plans.length > 0 && (
                  <ul className="space-y-1.5">
                    {planResult.plans.map((p, i) => {
                      const isPicked =
                        newRoomId === p.roomId &&
                        newDayOfWeek === p.targetDayOfWeek &&
                        newSlotIndex === p.targetSlotIndex &&
                        targetWeek === p.targetWeek
                      return (
                        <li
                          key={`${p.targetWeek}-${p.targetDayOfWeek}-${p.targetSlotIndex}-${p.roomId}-${i}`}
                          className={`text-sm rounded-md border px-2 py-1.5 cursor-pointer hover:bg-purple-100 ${
                            isPicked ? 'border-purple-500 bg-purple-100' : 'border-purple-200 bg-white'
                          }`}
                          onClick={() => pickPlan(p)}
                          title="点击填入周次 / 星期 / 节次 / 教室"
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
                    })}
                  </ul>
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
