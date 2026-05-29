'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CreatableCombobox, type EntityOption } from '@/components/combobox'
import { SLOT_INDEX_MAP, DAYS } from '@/types/schedule'

export interface ScheduleSlotFormState {
  teachingTaskId: number | null
  roomId: number | null
  dayOfWeek: number
  slotIndex: number
}

interface ScheduleSlotDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  slotForm: ScheduleSlotFormState
  taskOptions: EntityOption[]
  roomOptions: (EntityOption & { building?: string | null })[]
  saving: boolean
  onOpenChange: (open: boolean) => void
  onFieldChange: <K extends keyof ScheduleSlotFormState>(field: K, value: ScheduleSlotFormState[K]) => void
  onSubmit: () => void
}

export function ScheduleSlotDialog({
  open,
  mode,
  slotForm,
  taskOptions,
  roomOptions,
  saving,
  onOpenChange,
  onFieldChange,
  onSubmit,
}: ScheduleSlotDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? '新增排课时段' : '编辑排课时段'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* 教学任务 */}
          <div className="grid gap-1.5">
            <Label>教学任务 <span className="text-red-500">*</span></Label>
            <Select
              value={slotForm.teachingTaskId ? String(slotForm.teachingTaskId) : ''}
              onValueChange={(v) => {
                if (v) onFieldChange('teachingTaskId', parseInt(v, 10))
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择教学任务" />
              </SelectTrigger>
              <SelectContent>
                {taskOptions.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 星期 */}
          <div className="grid gap-1.5">
            <Label>星期 <span className="text-red-500">*</span></Label>
            <Select
              value={String(slotForm.dayOfWeek)}
              onValueChange={(v) => {
                if (v) onFieldChange('dayOfWeek', parseInt(v, 10))
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((day, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 节次 */}
          <div className="grid gap-1.5">
            <Label>节次 <span className="text-red-500">*</span></Label>
            <Select
              value={String(slotForm.slotIndex)}
              onValueChange={(v) => {
                if (v) onFieldChange('slotIndex', parseInt(v, 10))
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SLOT_INDEX_MAP).map(([key, val]) => (
                  <SelectItem key={key} value={key}>
                    {val.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 教室 */}
          <div className="grid gap-1.5">
            <Label>教室</Label>
            <CreatableCombobox
              options={roomOptions}
              value={slotForm.roomId}
              onChange={(id) => onFieldChange('roomId', id)}
              onCreate={async () => undefined}
              placeholder="选择教室（可选）"
            />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
