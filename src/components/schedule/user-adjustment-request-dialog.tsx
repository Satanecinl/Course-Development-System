'use client'

// src/components/schedule/user-adjustment-request-dialog.tsx
// K28-A: USER-side "申请调课" dialog.
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
import { DAYS } from '@/types/schedule'
import { getTeachingSlotLabelOptions, formatTeachingSlotLabel } from '@/lib/schedule/time-slots'
import type { ScheduleViewData } from '@/types/schedule'
import type { EntityOption } from '@/components/combobox'
import {
  dryRunAdjustmentRequest,
  submitAdjustmentRequest,
  getAdjustmentRequestErrorMessage,
  type AdjustmentRequestDryRunResult,
} from '@/lib/schedule/adjustment-request-client'

interface UserAdjustmentRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  week: number
  item: ScheduleViewData | null
  roomOptions: EntityOption[]
  onSubmitted: () => void
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

  useEffect(() => {
    if (open && item) {
      setTargetWeek(week)
      setNewDayOfWeek(item.dayOfWeek)
      setNewSlotIndex(item.slotIndex)
      setNewRoomId(item.roomId ?? null)
      setReason('')
      setDryRunResult(null)
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

  const handleDryRun = async () => {
    setDryRunLoading(true)
    setDryRunResult(null)
    try {
      const { dryRun } = await dryRunAdjustmentRequest({
        sourceScheduleSlotId: slotId,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
