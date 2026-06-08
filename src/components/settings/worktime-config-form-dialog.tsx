'use client'

/**
 * WorkTimeConfigFormDialog
 *
 * K26-H: Create / edit WorkTimeConfig with slot editor.
 */

import { useState } from 'react'
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
import { Loader2 } from 'lucide-react'
import type { WorkTimeConfigDTO, TimeSlotDefinitionDTO } from '@/types/worktime'

interface SlotRow {
  slotIndex: number
  label: string
  startsAt: string
  endsAt: string
  isActive: boolean
  isTeachingSlot: boolean
  isLegacyDisplay: boolean
  sortOrder: number
}

const DEFAULT_SLOTS: SlotRow[] = [
  { slotIndex: 1, label: '1-2节', startsAt: '', endsAt: '', isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 1 },
  { slotIndex: 2, label: '3-4节', startsAt: '', endsAt: '', isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 2 },
  { slotIndex: 3, label: '5-6节', startsAt: '', endsAt: '', isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 3 },
  { slotIndex: 4, label: '7-8节', startsAt: '', endsAt: '', isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 4 },
  { slotIndex: 5, label: '9-10节', startsAt: '', endsAt: '', isActive: true, isTeachingSlot: true, isLegacyDisplay: false, sortOrder: 5 },
  { slotIndex: 6, label: '11-12节', startsAt: '', endsAt: '', isActive: false, isTeachingSlot: false, isLegacyDisplay: true, sortOrder: 6 },
  { slotIndex: 7, label: '中午', startsAt: '', endsAt: '', isActive: false, isTeachingSlot: false, isLegacyDisplay: true, sortOrder: 7 },
]

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

function slotsToRows(slots?: TimeSlotDefinitionDTO[]): SlotRow[] {
  if (!slots || slots.length === 0) return DEFAULT_SLOTS
  return slots.map((s) => ({
    slotIndex: s.slotIndex,
    label: s.label,
    startsAt: s.startsAt ?? '',
    endsAt: s.endsAt ?? '',
    isActive: s.isActive,
    isTeachingSlot: s.isTeachingSlot,
    isLegacyDisplay: s.isLegacyDisplay,
    sortOrder: s.sortOrder,
  }))
}

function getInitialSlots(config?: WorkTimeConfigDTO): SlotRow[] {
  return slotsToRows(config?.slots)
}

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  config?: WorkTimeConfigDTO
  semesterId: number
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: Record<string, unknown>) => void
}

export function WorkTimeConfigFormDialog({
  open,
  mode,
  config,
  semesterId,
  saving,
  onOpenChange,
  onSubmit,
}: Props) {
  const [name, setName] = useState(config?.name ?? '')
  const [allowWeekend, setAllowWeekend] = useState(config?.allowWeekend ?? false)
  const [lunchStart, setLunchStart] = useState(config?.lunchStart ?? '')
  const [lunchEnd, setLunchEnd] = useState(config?.lunchEnd ?? '')
  const [isActive, setIsActive] = useState(config?.isActive ?? true)
  const [isDefault, setIsDefault] = useState(config?.isDefault ?? false)
  const [notes, setNotes] = useState(config?.notes ?? '')
  const [slots, setSlots] = useState<SlotRow[]>(getInitialSlots(config))
  const [error, setError] = useState('')

  function updateSlot(index: number, field: keyof SlotRow, value: unknown) {
    setSlots((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  function validate(): string | null {
    if (!name.trim()) return '配置名称不能为空'
    if (name.trim().length > 100) return '配置名称不能超过100个字符'
    if (lunchStart && !HH_MM.test(lunchStart)) return '午餐开始时间格式无效，请使用 HH:mm'
    if (lunchEnd && !HH_MM.test(lunchEnd)) return '午餐结束时间格式无效，请使用 HH:mm'

    const indexes = new Set<number>()
    for (const s of slots) {
      if (!s.label.trim()) return `节次 ${s.slotIndex} 的名称不能为空`
      if (s.startsAt && !HH_MM.test(s.startsAt)) return `节次 ${s.slotIndex} 的开始时间格式无效`
      if (s.endsAt && !HH_MM.test(s.endsAt)) return `节次 ${s.slotIndex} 的结束时间格式无效`
      if (indexes.has(s.slotIndex)) return `节次索引 ${s.slotIndex} 重复`
      indexes.add(s.slotIndex)
      if ((s.slotIndex === 6 || s.slotIndex === 7) && s.isTeachingSlot) {
        return `节次 ${s.slotIndex} (${s.label}) 不能设为教学节次`
      }
      if (s.isLegacyDisplay && s.isTeachingSlot) {
        return `传统显示节次不能同时设为教学节次`
      }
    }
    const hasActiveTeaching = slots.some((s) => s.isActive && s.isTeachingSlot)
    if (!hasActiveTeaching) return '至少需要一个活跃的教学节次'
    return null
  }

  function handleSubmit() {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    onSubmit({
      semesterId,
      name: name.trim(),
      allowWeekend,
      lunchStart: lunchStart || null,
      lunchEnd: lunchEnd || null,
      isActive,
      isDefault,
      notes: notes || null,
      slots: slots.map((s) => ({
        slotIndex: s.slotIndex,
        label: s.label.trim(),
        startsAt: s.startsAt || null,
        endsAt: s.endsAt || null,
        isActive: s.isActive,
        isTeachingSlot: s.isTeachingSlot,
        isLegacyDisplay: s.isLegacyDisplay,
        sortOrder: s.sortOrder,
      })),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="k26h-worktime-form-dialog">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新建作息配置' : '编辑作息配置'}</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2" data-testid="k26h-form-error">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Config fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="wt-name">配置名称 *</Label>
              <Input id="wt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：2026秋作息" data-testid="k26h-form-name" />
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2" data-testid="k26h-form-is-default">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                <span className="text-sm">设为默认</span>
              </label>
              <label className="flex items-center gap-2" data-testid="k26h-form-is-active">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span className="text-sm">启用</span>
              </label>
              <label className="flex items-center gap-2" data-testid="k26h-form-allow-weekend">
                <input type="checkbox" checked={allowWeekend} onChange={(e) => setAllowWeekend(e.target.checked)} />
                <span className="text-sm">允许周末</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="wt-lunch-start">午餐开始时间</Label>
              <Input id="wt-lunch-start" value={lunchStart} onChange={(e) => setLunchStart(e.target.value)} placeholder="HH:mm" data-testid="k26h-form-lunch-start" />
            </div>
            <div>
              <Label htmlFor="wt-lunch-end">午餐结束时间</Label>
              <Input id="wt-lunch-end" value={lunchEnd} onChange={(e) => setLunchEnd(e.target.value)} placeholder="HH:mm" data-testid="k26h-form-lunch-end" />
            </div>
          </div>

          <div>
            <Label htmlFor="wt-notes">备注</Label>
            <Input id="wt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="可选备注" data-testid="k26h-form-notes" />
          </div>

          {/* Slots editor */}
          <div>
            <Label className="mb-2 block">节次定义</Label>
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3" data-testid="k26h-legacy-6-7-warning">
              ⚠️ 11-12节和中午当前为传统显示节次，不能设为教学节次。未来 K26-I/J 才会接入推荐和 solver。
            </div>
            <div className="border rounded-md overflow-hidden" data-testid="k26h-slot-table">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left">节次</th>
                    <th className="px-2 py-2 text-left">名称</th>
                    <th className="px-2 py-2 text-left">开始</th>
                    <th className="px-2 py-2 text-left">结束</th>
                    <th className="px-2 py-2 text-center">启用</th>
                    <th className="px-2 py-2 text-center">教学</th>
                    <th className="px-2 py-2 text-center">传统</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((s, i) => (
                    <tr key={s.slotIndex} className={`border-t ${s.isLegacyDisplay ? 'bg-amber-50' : ''}`}>
                      <td className="px-2 py-1">{s.slotIndex}</td>
                      <td className="px-2 py-1">
                        <Input
                          value={s.label}
                          onChange={(e) => updateSlot(i, 'label', e.target.value)}
                          className="h-7 text-xs"
                          data-testid={`k26h-slot-label-${s.slotIndex}`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          value={s.startsAt}
                          onChange={(e) => updateSlot(i, 'startsAt', e.target.value)}
                          placeholder="HH:mm"
                          className="h-7 text-xs w-20"
                          data-testid={`k26h-slot-startsAt-${s.slotIndex}`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          value={s.endsAt}
                          onChange={(e) => updateSlot(i, 'endsAt', e.target.value)}
                          placeholder="HH:mm"
                          className="h-7 text-xs w-20"
                          data-testid={`k26h-slot-endsAt-${s.slotIndex}`}
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={s.isActive}
                          onChange={(e) => updateSlot(i, 'isActive', e.target.checked)}
                          data-testid={`k26h-slot-isActive-${s.slotIndex}`}
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={s.isTeachingSlot}
                          onChange={(e) => updateSlot(i, 'isTeachingSlot', e.target.checked)}
                          disabled={s.slotIndex === 6 || s.slotIndex === 7}
                          data-testid={`k26h-slot-isTeaching-${s.slotIndex}`}
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={s.isLegacyDisplay}
                          onChange={(e) => updateSlot(i, 'isLegacyDisplay', e.target.checked)}
                          data-testid={`k26h-slot-isLegacy-${s.slotIndex}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={handleSubmit} disabled={saving} data-testid="k26h-form-submit">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            {mode === 'create' ? '创建' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
