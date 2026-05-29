'use client'

import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Pencil, ArrowRightLeft, Undo2 } from 'lucide-react'
import { ScheduleViewData } from '@/types/schedule'
import type { WeekFilter } from '@/lib/schedule/week-filter'
import { EditTaskDialog } from './edit-task-dialog'

interface ScheduleCardProps {
  item: ScheduleViewData
  selectedWeek?: WeekFilter
  onAdjust?: (item: ScheduleViewData) => void
  onVoidAdjustment?: (item: ScheduleViewData) => void
}

const WEEK_TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ALL: { bg: 'bg-blue-100', text: 'text-blue-700', label: '全周' },
  ODD: { bg: 'bg-orange-100', text: 'text-orange-700', label: '单周' },
  EVEN: { bg: 'bg-purple-100', text: 'text-purple-700', label: '双周' },
  FIRST_HALF: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '前八周' },
  SECOND_HALF: { bg: 'bg-green-100', text: 'text-green-700', label: '后八周' },
  CUSTOM: { bg: 'bg-pink-100', text: 'text-pink-700', label: '自定义' },
}

/** 从班级全称提取合班简称，如 ["机电技术应用1班","机电技术应用2班"] → "合班: 机电1/2班" */
function formatClassNamesShort(classNames: string[]): string {
  if (classNames.length <= 1) return ''

  const getCommonPrefix = (strs: string[]): string => {
    if (strs.length === 0) return ''
    let prefix = strs[0]
    for (let i = 1; i < strs.length; i++) {
      while (strs[i].indexOf(prefix) !== 0) {
        prefix = prefix.slice(0, -1)
        if (prefix === '') break
      }
    }
    return prefix
  }

  const prefix = getCommonPrefix(classNames)
  const shortNames = classNames.map((name) =>
    name.slice(prefix.length).replace(/班$/, '')
  )

  return `合班: ${prefix}${shortNames.join('/')}`
}

export function ScheduleCard({ item, selectedWeek, onAdjust, onVoidAdjustment }: ScheduleCardProps) {
  const [editOpen, setEditOpen] = useState(false)
  const [editKey, setEditKey] = useState(0)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `schedule-item-${item.slotId}`,
    data: {
      type: 'schedule-item',
      item,
    },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 50 : 1,
  }

  const weekStyle = WEEK_TYPE_COLORS[item.weekType] || WEEK_TYPE_COLORS.ALL
  const isCoClass = item.classNames.length > 1
  const isOffCampus = item.roomBuilding === '林校'
  const showAdjustUI = selectedWeek && selectedWeek !== 'ALL'

  return (
    <>
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        style={style}
        className={`
          group relative rounded-lg border p-2 text-xs cursor-grab
          transition-shadow select-none
          ${isDragging
            ? 'opacity-80 shadow-xl scale-105 ring-2 ring-blue-400 bg-white'
            : 'bg-white shadow-sm hover:shadow-md border-gray-200'
          }
          ${isOffCampus ? 'border-l-4 border-l-amber-500' : ''}
          ${item.isAdjusted ? 'ring-1 ring-blue-300 bg-blue-50/30' : ''}
        `}
      >
        {/* 编辑按钮 - hover 时显示 */}
        <button
          type="button"
          onClick={() => { setEditKey(k => k + 1); setEditOpen(true) }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-1 right-1 z-10 rounded p-0.5 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
          aria-label="编辑课程"
          title="编辑课程"
        >
          <Pencil className="size-3" />
        </button>

        {/* 已调课标记 */}
        {item.isAdjusted && (
          <span className="absolute top-1 left-1 inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-blue-100 text-blue-700">
            {item.sourceWeek != null && item.targetWeek != null && item.sourceWeek !== item.targetWeek
              ? `第 ${item.sourceWeek} 周 → 第 ${item.targetWeek} 周`
              : '已调课'}
          </span>
        )}

        {/* 课程名 */}
        <p className="font-semibold text-gray-900 truncate leading-tight pr-5" title={item.courseName || '未知课程'}>
          {item.courseName || '未知课程'}
        </p>

        {/* 教师 + 教室 */}
        <div className="mt-1 flex items-center justify-between text-gray-500">
          <span className="truncate">{item.teacherName || '待定'}</span>
          <span className="shrink-0 ml-1">{item.roomName || ''}</span>
        </div>

        {/* 合班简称 */}
        {isCoClass && (
          <p className="mt-0.5 text-[10px] text-amber-600 truncate" title={item.classNames.join('、')}>
            {formatClassNamesShort(item.classNames)}
          </p>
        )}

        {/* 周次标签 */}
        <div className="mt-1.5 flex items-center gap-1">
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${weekStyle.bg} ${weekStyle.text}`}>
            {weekStyle.label}
          </span>
          {item.weekType === 'CUSTOM' && (
            <span className="text-[10px] text-gray-400">
              {item.startWeek}-{item.endWeek}周
            </span>
          )}
        </div>

        {/* 备注 */}
        {item.remark && (
          <p className="mt-1 text-[10px] text-gray-400 truncate" title={item.remark}>
            {item.remark}
          </p>
        )}

        {/* 调课/撤销按钮 */}
        {showAdjustUI && (
          <div className="mt-1.5 flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            {item.isAdjusted ? (
              <button
                type="button"
                onClick={() => onVoidAdjustment?.(item)}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <Undo2 className="size-2.5" />
                撤销
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onAdjust?.(item)}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded border border-gray-200 text-gray-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-colors"
              >
                <ArrowRightLeft className="size-2.5" />
                调课
              </button>
            )}
          </div>
        )}
      </div>

      <EditTaskDialog key={editKey} item={item} open={editOpen} onOpenChange={setEditOpen} />
    </>
  )
}
