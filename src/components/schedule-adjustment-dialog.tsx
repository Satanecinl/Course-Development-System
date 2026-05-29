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
import { dryRunScheduleAdjustment, createScheduleAdjustment } from '@/lib/schedule/adjustment-client'

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
    }
  }, [item, week])

  if (!item) return null

  const isCrossWeek = targetWeek !== week
  const isSamePosition = !isCrossWeek && newDayOfWeek === item.dayOfWeek && newSlotIndex === item.slotIndex && newRoomId === item.roomId

  async function handleDryRun() {
    if (!item) return
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

  async function handleConfirm() {
    if (!item) return
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
                  onChange={(e) => setNewDayOfWeek(parseInt(e.target.value, 10))}
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
                  onChange={(e) => setNewSlotIndex(parseInt(e.target.value, 10))}
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
                disabled={dryRunLoading || confirmLoading || isSamePosition}
              >
                {dryRunLoading ? '检查中...' : '检查冲突'}
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirmDialogOpen(true)}
                disabled={!dryRunResult?.canApply || confirmLoading || isSamePosition}
              >
                确认调课
              </Button>
            </div>

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
            <Button onClick={handleConfirm} disabled={confirmLoading}>
              {confirmLoading ? '保存中...' : '确认调课'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
