'use client'

import { Fragment, useState } from 'react'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { toast } from 'sonner'
import { ScheduleCard } from './schedule-card'
import {
  useScheduleStore,
  DAYS,
  TIME_SLOTS,
  getSlotLabelByIndex,
} from '@/store/scheduleStore'
import { ScheduleViewData } from '@/types/schedule'
import type { WeekFilter } from '@/lib/schedule/week-filter'
import { useHasPermission } from '@/components/layout/current-user-context'

interface GridCellProps {
  day: number
  slotIndex: number
  slotLabel: string
  children?: React.ReactNode
}

function GridCell({ day, slotIndex, slotLabel, children }: GridCellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `cell-${day}-${slotIndex}`,
    data: { day, slotIndex, slotLabel },
  })

  return (
    <div
      ref={setNodeRef}
      className={`
        relative min-h-[100px] p-1.5 border border-gray-100
        transition-colors
        ${isOver ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200' : 'bg-gray-50/50'}
      `}
    >
      {children}
    </div>
  )
}

interface ScheduleGridProps {
  items?: ScheduleViewData[]
  selectedWeek?: WeekFilter
  onAdjust?: (item: ScheduleViewData) => void
  onVoidAdjustment?: (item: ScheduleViewData) => void
}

export function ScheduleGrid({ items, selectedWeek, onAdjust, onVoidAdjustment }: ScheduleGridProps) {
  const { scheduleItems, moveSlot } = useScheduleStore()
  const [activeItem, setActiveItem] = useState<ScheduleViewData | null>(null)
  // K14-FIX-A: data:write gates drag-to-edit. Permission resolved from
  // CurrentUserContext (server-resolved in ProtectedShell). If the user lacks
  // data:write, the drag handlers are no-ops and we toast. Server-side
  // requirePermission('data:write') on /api/schedule-slot/[id] PUT is the
  // final security boundary — this is a UX / 防止误操作加固.
  const canWriteSchedule = useHasPermission('data:write')

  const displayItems = items ?? scheduleItems

  // 按 (day, slotIndex) 分组
  const itemsByCell = new Map<string, ScheduleViewData[]>()
  for (const item of displayItems) {
    const key = `${item.dayOfWeek}-${item.slotIndex}`
    if (!itemsByCell.has(key)) itemsByCell.set(key, [])
    itemsByCell.get(key)!.push(item)
  }

  function handleDragStart(event: DragStartEvent) {
    if (!canWriteSchedule) {
      setActiveItem(null)
      toast.error('没有写权限', { description: '当前账号没有排课写入权限，无法拖拽修改课表' })
      return
    }
    const { active } = event
    const data = active.data.current
    if (data?.type === 'schedule-item') {
      setActiveItem(data.item as ScheduleViewData)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveItem(null)

    if (!canWriteSchedule) {
      toast.error('没有写权限', { description: '当前账号没有排课写入权限，无法修改课表' })
      return
    }

    if (!over) return

    const sourceData = active.data.current
    if (sourceData?.type !== 'schedule-item') return

    const targetData = over.data.current
    if (!targetData) return

    const item = sourceData.item as ScheduleViewData
    const newDay = targetData.day as number
    const newSlot = targetData.slotLabel as string
    const targetSlotIndex = targetData.slotIndex as number

    // 如果没变化，不处理
    if (item.dayOfWeek === newDay && getSlotLabelByIndex(item.slotIndex) === newSlot) {
      return
    }

    const newRoomId = item.roomId ?? 0

    // 步骤 1：冲突检测
    try {
      const res = await fetch('/api/conflict-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleSlotId: item.slotId,
          targetDayOfWeek: newDay,
          targetSlotIndex: targetSlotIndex,
          targetRoomId: newRoomId,
        }),
      })

      if (!res.ok) throw new Error('Conflict check failed')
      const result = await res.json()

      if (result.hasConflict && result.conflicts?.length > 0) {
        for (const conflict of result.conflicts) {
          toast.error('调课冲突', { description: conflict })
        }
        return
      }
    } catch {
      toast.error('冲突检测失败', { description: '网络请求失败' })
      return
    }

    // 步骤 2：无冲突，执行乐观更新 + API 调用
    try {
      await moveSlot(item.slotId, newDay, newSlot, newRoomId)

      toast.success('调课成功', {
        description: `${item.courseName} → ${DAYS.find((d) => d.value === newDay)?.label} ${newSlot}`,
      })

      // 步骤 3：跨校区通勤警告
      const prevSlotIndex = targetSlotIndex - 1
      if (prevSlotIndex >= 1 && item.roomName) {
        const prevItems = scheduleItems.filter(
          (i) =>
            i.classNames.some((cn) => item.classNames.includes(cn)) &&
            i.dayOfWeek === newDay &&
            i.slotIndex === prevSlotIndex
        )
        for (const prev of prevItems) {
          if (prev.roomName && prev.roomName !== item.roomName) {
            const prevPrefix = prev.roomName.match(/^[一-龥]+/)
            const currPrefix = item.roomName.match(/^[一-龥]+/)
            if (prevPrefix !== currPrefix) {
              toast.warning('跨校区通勤提醒', {
                description: `上一节课在 ${prev.roomName}，本节课在 ${item.roomName}，请留意通勤时间。`,
              })
              break
            }
          }
        }
      }
    } catch (moveErr) {
      const msg = moveErr instanceof Error ? moveErr.message : '服务器更新失败，已自动回滚'
      toast.error('调课失败', { description: msg })
    }
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="overflow-auto">
        {/* 表头：星期 */}
        <div
          className="grid border border-gray-200 rounded-t-lg overflow-hidden"
          style={{ gridTemplateColumns: `80px repeat(${DAYS.length}, minmax(140px, 1fr))` }}
        >
          {/* 左上角空白 */}
          <div className="bg-gray-100 border-r border-b border-gray-200 p-2 text-xs font-medium text-gray-500 flex items-center justify-center">
            节次 / 星期
          </div>
          {DAYS.map((day) => (
            <div
              key={day.value}
              className="bg-gray-100 border-r border-b border-gray-200 p-2 text-sm font-semibold text-center text-gray-700"
            >
              {day.label}
            </div>
          ))}
        </div>

        {/* 网格主体 */}
        <div
          className="grid border-x border-b border-gray-200 rounded-b-lg overflow-hidden"
          style={{ gridTemplateColumns: `80px repeat(${DAYS.length}, minmax(140px, 1fr))` }}
        >
          {TIME_SLOTS.map((slot) => (
            <Fragment key={`slot-row-${slot.index}`}>
              {/* 左侧节次标签 */}
              <div
                className="bg-gray-50 border-r border-b border-gray-200 p-2 text-xs font-medium text-gray-500 flex items-center justify-center"
              >
                {slot.label}
              </div>

              {/* 每天的单元格 */}
              {DAYS.map((day) => {
                const cellKey = `${day.value}-${slot.index}`
                const cellItems = itemsByCell.get(cellKey) || []

                return (
                  <GridCell
                    key={cellKey}
                    day={day.value}
                    slotIndex={slot.index}
                    slotLabel={slot.label}
                  >
                    {cellItems.map((item) => (
                      <div key={item.slotId} className="mb-1 last:mb-0">
                        <ScheduleCard
                          item={item}
                          selectedWeek={selectedWeek}
                          onAdjust={onAdjust}
                          onVoidAdjustment={onVoidAdjustment}
                        />
                      </div>
                    ))}
                  </GridCell>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* 拖拽时的浮动预览 */}
      <DragOverlay>
        {activeItem ? (
          <div className="opacity-90 scale-105">
            <ScheduleCard item={activeItem} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
