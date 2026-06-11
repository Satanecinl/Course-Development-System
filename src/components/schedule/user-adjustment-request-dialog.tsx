'use client'

// src/components/schedule/user-adjustment-request-dialog.tsx
// K28-A: USER-side "申请调课" dialog.
// K28-A2: Added "一键推荐调课方案" (plan recommendation) feature.
// Submits a PENDING ScheduleAdjustmentRequest. Does NOT mutate the
// official ScheduleSlot, and does NOT create an ACTIVE ScheduleAdjustment.

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
import { Badge } from '@/components/ui/badge'
import { DAYS } from '@/types/schedule'
import { getTeachingSlotLabelOptions, formatTeachingSlotLabel, VALID_PREFERRED_DAY_VALUES } from '@/lib/schedule/time-slots'
import type { ScheduleViewData } from '@/types/schedule'
import type { EntityOption } from '@/components/combobox'
import {
  dryRunAdjustmentRequest,
  submitAdjustmentRequest,
  getAdjustmentRequestErrorMessage,
  type AdjustmentRequestDryRunResult,
  fetchUserPlanRecommendations,
  type PlanRecommendationPlan,
  type PlanRecommendationResult,
} from '@/lib/schedule/adjustment-request-client'

interface UserAdjustmentRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  week: number
  item: ScheduleViewData | null
  roomOptions: EntityOption[]
  onSubmitted: () => void
}

function planKey(p: PlanRecommendationPlan) {
  return `${p.targetWeek}|${p.targetDayOfWeek}|${p.targetSlotIndex}|${p.roomId}`
}

export function UserAdjustmentRequestDialog({
  open,
  onOpenChange,
  week,
  item,
  roomOptions,
  onSubmitted,
}: UserAdjustmentRequestDialogProps) {
  const [targetWeek, setTargetWeek] = useState(week)
  const [newDayOfWeek, setNewDayOfWeek] = useState(1)
  const [newSlotIndex, setNewSlotIndex] = useState(1)
  const [newRoomId, setNewRoomId] = useState<number | null>(null)
  const [reason, setReason] = useState('')

  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<AdjustmentRequestDryRunResult | null>(null)
  const [submitLoading, setSubmitLoading] = useState(false)

  // K28-A2: plan recommendation state
  const [planLoading, setPlanLoading] = useState(false)
  const [planResult, setPlanResult] = useState<PlanRecommendationResult | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [preferredPlanWeek, setPreferredPlanWeek] = useState(week)
  const [preferredPlanDay, setPreferredPlanDay] = useState<number | null>(null)
  const [selectedPlanKey, setSelectedPlanKey] = useState<string | null>(null)
  const [planListOpen, setPlanListOpen] = useState(false)

  useEffect(() => {
    if (open && item) {
      setTargetWeek(week)
      setNewDayOfWeek(item.dayOfWeek)
      setNewSlotIndex(item.slotIndex)
      setNewRoomId(item.roomId ?? null)
      setReason('')
      setDryRunResult(null)
      // K28-A2: reset plan state
      setPlanResult(null)
      setPlanError(null)
      setPreferredPlanWeek(week)
      setPreferredPlanDay(null)
      setSelectedPlanKey(null)
      setPlanListOpen(false)
    }
  }, [open, week, item])

  if (!item) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>申请调课</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">请先选择一门课程。</p>
        </DialogContent>
      </Dialog>
    )
  }

  const slotId = (item as { slotId?: number }).slotId
  if (!slotId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>申请调课</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-red-500">该课程缺少源课表 ID，无法提交调课申请。</p>
        </DialogContent>
      </Dialog>
    )
  }

  // K28-A2: plan recommendation handler
  const handleRecommendPlans = async () => {
    setPlanLoading(true)
    setPlanResult(null)
    setPlanError(null)
    setSelectedPlanKey(null)
    try {
      const result = await fetchUserPlanRecommendations({
        scheduleSlotId: slotId,
        preferredWeek: preferredPlanWeek,
        preferredDayOfWeek: preferredPlanDay,
        limit: 5,
      })
      setPlanResult(result)
      if (!result.ok) {
        setPlanError(result.message ?? '推荐方案获取失败')
      } else if (result.plans.length === 0) {
        toast.info('暂无可用推荐方案，请手动选择目标时间/教室')
      } else {
        toast.success(`找到 ${result.plans.length} 个推荐方案`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'UNKNOWN'
      setPlanError(getAdjustmentRequestErrorMessage(msg))
    } finally {
      setPlanLoading(false)
    }
  }

  // K28-A2: apply a selected plan — fill target fields only, do NOT submit
  const handlePickPlan = (plan: PlanRecommendationPlan) => {
    setTargetWeek(plan.targetWeek)
    setNewDayOfWeek(plan.targetDayOfWeek)
    setNewSlotIndex(plan.targetSlotIndex)
    setNewRoomId(plan.roomId)
    setSelectedPlanKey(planKey(plan))
    setDryRunResult(null) // clear stale dry-run
    toast.info('已填入推荐目标，请执行冲突检查后提交')
  }

  const handleDryRun = async () => {
    setDryRunLoading(true)
    setDryRunResult(null)
    try {
      const { dryRun } = await dryRunAdjustmentRequest({
        sourceScheduleSlotId: slotId,
        // K32-A2: 把当前 dashboard 查看周次作为 sourceWeek 写入。
        // 用于导出"原位置"显示具体日期 / 第X周。
        sourceWeek: week,
        targetWeek,
        targetDayOfWeek: newDayOfWeek,
        targetSlotIndex: newSlotIndex,
        targetRoomId: newRoomId,
        reason: reason || null,
      })
      setDryRunResult(dryRun)
      if (dryRun.canSubmit) {
        toast.success('干跑检查通过，可以提交申请')
      } else {
        toast.error('干跑检测到冲突，请调整目标位置')
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : 'UNKNOWN'
      toast.error(getAdjustmentRequestErrorMessage(code))
    } finally {
      setDryRunLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!dryRunResult || !dryRunResult.canSubmit) {
      toast.error('请先通过干跑检查再提交')
      return
    }
    setSubmitLoading(true)
    try {
      await submitAdjustmentRequest({
        sourceScheduleSlotId: slotId,
        // K32-A2: 把当前 dashboard 查看周次作为 sourceWeek 写入。
        sourceWeek: week,
        targetWeek,
        targetDayOfWeek: newDayOfWeek,
        targetSlotIndex: newSlotIndex,
        targetRoomId: newRoomId,
        reason: reason || null,
      })
      toast.success('申请已提交，等待管理员审批')
      onSubmitted()
      onOpenChange(false)
    } catch (e) {
      const code = e instanceof Error ? e.message : 'UNKNOWN'
      toast.error(getAdjustmentRequestErrorMessage(code))
    } finally {
      setSubmitLoading(false)
    }
  }

  const slotLabelOptions = getTeachingSlotLabelOptions()
  const teacherName = (item as { teacherName?: string | null }).teacherName ?? null
  const classNames = (item as { classNames?: string[] }).classNames ?? []
  const roomName = (item as { roomName?: string | null }).roomName ?? null
  const courseName = (item as { courseName?: string }).courseName ?? ''

  // Group plans into buckets
  const preferredDayPlans = planResult?.plans.filter((p) => p.isPreferredDay) ?? []
  const sameWeekOtherDayPlans = planResult?.plans.filter((p) => !p.isPreferredDay && p.isPreferredWeek) ?? []
  const fallbackPlans = planResult?.plans.filter((p) => !p.isPreferredDay && !p.isPreferredWeek) ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>申请调课</DialogTitle>
        </DialogHeader>

        {/* Source course info */}
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-0.5">
          <p><span className="text-gray-500">课程：</span>{courseName}</p>
          <p><span className="text-gray-500">教师：</span>{teacherName ?? '（未指定）'}</p>
          <p><span className="text-gray-500">班级：</span>{classNames.join(', ') || '（未指定）'}</p>
          <p><span className="text-gray-500">原位置：</span>
            第 {week} 周 · 星期 {DAYS.find((d) => d.value === item.dayOfWeek)?.label ?? item.dayOfWeek} ·
            {formatTeachingSlotLabel(item.slotIndex)} ·
            教室 {roomName ?? '（未指定）'}
          </p>
        </div>

        {/* K28-A2: Plan recommendation entry */}
        <div className="rounded border border-purple-200 bg-purple-50 p-3 space-y-2">
          <p className="text-xs font-medium text-purple-800">一键推荐调课方案</p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="req-plan-week" className="text-xs">首选周</Label>
              <Input
                id="req-plan-week"
                type="number"
                min={1}
                max={20}
                className="h-8 w-20 text-xs"
                value={preferredPlanWeek}
                onChange={(e) => setPreferredPlanWeek(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="req-plan-day" className="text-xs">首选星期</Label>
              <select
                id="req-plan-day"
                className="flex h-8 rounded-md border border-gray-200 bg-white px-2 text-xs"
                value={preferredPlanDay ?? ''}
                onChange={(e) => setPreferredPlanDay(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">自动匹配</option>
                {VALID_PREFERRED_DAY_VALUES.map((dayVal) => {
                  const dayInfo = DAYS.find((d) => d.value === dayVal)
                  return <option key={dayVal} value={dayVal}>{dayInfo?.label ?? `星期${dayVal}`}</option>
                })}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs border-purple-300 text-purple-700 hover:bg-purple-100"
              onClick={handleRecommendPlans}
              disabled={planLoading}
            >
              {planLoading ? '搜索方案中...' : '一键推荐调课方案'}
            </Button>
          </div>

          {/* Plan error */}
          {planError && (
            <p className="text-xs text-red-600">{planError}</p>
          )}

          {/* Plan results */}
          {planResult && planResult.ok && (
            <div className="space-y-2">
              {planResult.plans.length === 0 ? (
                <p className="text-xs text-gray-500">暂无可用推荐方案，请手动选择目标时间/教室</p>
              ) : (
                <>
                  <button
                    type="button"
                    className="text-xs text-purple-700 hover:underline"
                    onClick={() => setPlanListOpen(!planListOpen)}
                  >
                    {planListOpen ? '收起' : `展开 ${planResult.plans.length} 个方案`}
                    {planResult.searched && (
                      <span className="text-purple-500 ml-1">
                        （首选周 {planResult.searched.preferredWeekPlanCount} / 备选周 {planResult.searched.fallbackPlanCount}）
                      </span>
                    )}
                  </button>

                  {planListOpen && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {/* Preferred day plans */}
                      {preferredDayPlans.length > 0 && (
                        <PlanBucket label="首选日期方案" plans={preferredDayPlans} selectedKey={selectedPlanKey} onPick={handlePickPlan} />
                      )}
                      {/* Same-week other-day plans */}
                      {sameWeekOtherDayPlans.length > 0 && (
                        <PlanBucket label="同周其他日期方案" plans={sameWeekOtherDayPlans} selectedKey={selectedPlanKey} onPick={handlePickPlan} />
                      )}
                      {/* Fallback plans */}
                      {fallbackPlans.length > 0 && (
                        <PlanBucket label="备选周方案" plans={fallbackPlans} selectedKey={selectedPlanKey} onPick={handlePickPlan} />
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Target position */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <Label htmlFor="req-target-week">目标周次</Label>
            <Input
              id="req-target-week"
              type="number"
              min={1}
              max={20}
              value={targetWeek}
              onChange={(e) => setTargetWeek(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="req-target-day">目标星期</Label>
            <select
              id="req-target-day"
              className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
              value={newDayOfWeek}
              onChange={(e) => setNewDayOfWeek(Number(e.target.value))}
            >
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="req-target-slot">目标节次</Label>
            <select
              id="req-target-slot"
              className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
              value={newSlotIndex}
              onChange={(e) => setNewSlotIndex(Number(e.target.value))}
            >
              {slotLabelOptions.map((o) => (
                <option key={o.index} value={o.index}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="req-target-room">目标教室</Label>
            <select
              id="req-target-room"
              className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
              value={newRoomId ?? ''}
              onChange={(e) => setNewRoomId(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">（不指定）</option>
              {roomOptions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-2">
          <Label htmlFor="req-reason">申请理由</Label>
          <Input
            id="req-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="（可选）说明调课原因"
          />
        </div>

        {/* Dry-run result */}
        {dryRunResult && (
          <div className="mt-2 rounded border p-2 text-xs">
            {dryRunResult.canSubmit ? (
              <p className="text-green-700">✅ 干跑检查通过，无冲突。可以提交申请。</p>
            ) : (
              <div>
                <p className="text-red-600">❌ 干跑发现冲突 ({dryRunResult.conflicts.length})，不能提交：</p>
                <ul className="mt-1 list-disc pl-5 text-red-600 space-y-0.5">
                  {dryRunResult.conflicts.slice(0, 8).map((c, i) => (
                    <li key={i}>{c.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {dryRunResult.warnings.length > 0 && (
              <p className="mt-1 text-amber-600">⚠️ 警告 {dryRunResult.warnings.length} 条</p>
            )}
          </div>
        )}

        <DialogFooter className="mt-3 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDryRun}
            disabled={dryRunLoading || submitLoading}
          >
            {dryRunLoading ? '干跑中...' : '干跑检查'}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitLoading ||
              !dryRunResult ||
              !dryRunResult.canSubmit
            }
          >
            {submitLoading ? '提交中...' : '提交申请'}
          </Button>
        </DialogFooter>

        <p className="mt-2 text-[11px] text-gray-500">
          提交后管理员会进行审批。仅当审批通过后，课表才会真正变更。
        </p>
      </DialogContent>
    </Dialog>
  )
}

// ── Plan bucket sub-component ──

function PlanBucket({
  label,
  plans,
  selectedKey,
  onPick,
}: {
  label: string
  plans: PlanRecommendationPlan[]
  selectedKey: string | null
  onPick: (plan: PlanRecommendationPlan) => void
}) {
  return (
    <div>
      <p className="text-[10px] font-medium text-purple-600 mb-0.5">{label} ({plans.length})</p>
      {plans.map((p) => {
        const key = planKey(p)
        const isSelected = key === selectedKey
        return (
          <div
            key={key}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] border ${
              isSelected
                ? 'border-purple-400 bg-purple-100'
                : 'border-gray-200 bg-white hover:bg-purple-50'
            }`}
          >
            <span className="flex-1 text-gray-700">
              第 {p.targetWeek} 周 · {DAYS.find((d) => d.value === p.targetDayOfWeek)?.label ?? `星期${p.targetDayOfWeek}`} ·
              {formatTeachingSlotLabel(p.targetSlotIndex)} · {p.roomName}
              {p.isPreferredWeek && <Badge className="ml-1 text-[9px] bg-purple-100 text-purple-700 border-purple-200">首选周</Badge>}
              {p.isPreferredDay && <Badge className="ml-1 text-[9px] bg-blue-100 text-blue-700 border-blue-200">首选日</Badge>}
            </span>
            <Button
              type="button"
              variant={isSelected ? 'default' : 'outline'}
              size="sm"
              className="h-5 text-[10px] px-1.5"
              onClick={() => onPick(p)}
            >
              使用该方案
            </Button>
          </div>
        )
      })}
    </div>
  )
}
