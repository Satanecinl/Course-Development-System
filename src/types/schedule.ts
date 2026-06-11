export interface ScheduleViewData {
  slotId: number
  taskId: number
  roomId: number | null
  courseName: string
  teacherName: string | null
  roomName: string | null
  roomBuilding: string | null
  // K34-A3B: secondary room IDs for room filter
  additionalRoomIds?: number[]
  classNames: string[]
  dayOfWeek: number
  slotIndex: number
  weekType: string
  startWeek: number
  endWeek: number
  remark: string | null
  isAdjusted?: boolean
  adjustmentId?: number | null
  originalSlotId?: number | null
  sourceWeek?: number
  targetWeek?: number
  // 稳定字段读取辅助（兼容前端筛选）
  teacherId?: number | null
  classGroupIds?: number[]
}

export type ViewType = 'class' | 'teacher' | 'room'

// K26-D: SLOT_INDEX_MAP / TIME_SLOTS / DAYS below remain the display-only
// source for grid rendering, dashboard, conflict messages, and Excel
// export. They include legacy entries (6 = 11-12节, 7 = 中午) for
// historical ScheduleSlot row compatibility.
//
// For new operations (recommendation, selectable slot, preferred day,
// room validation), use the K26-D unified helper at
// '@/lib/schedule/time-slots' which exposes:
//   - ACTIVE / LEGACY / DISPLAY slot constants
//   - VALID_PREFERRED_DAY_VALUES / WEEKEND_DAY_VALUES
//   - formatTeachingSlotLabel(slot) for safe display labels
//   - getTeachingSlotOptions() for new-target dropdowns (active only)
//   - getRecommendationSlotIndexes() for search spaces (active only)
//
// See docs/k26-static-time-slot-extraction.md for the full contract.
export const SLOT_INDEX_MAP: Record<number, { label: string; start: number; end: number }> = {
  1: { label: '1-2节', start: 1, end: 2 },
  2: { label: '3-4节', start: 3, end: 4 },
  3: { label: '5-6节', start: 5, end: 6 },
  4: { label: '7-8节', start: 7, end: 8 },
  5: { label: '9-10节', start: 9, end: 10 },
  6: { label: '11-12节', start: 11, end: 12 },
  7: { label: '中午', start: 12, end: 13 },
}

export function getSlotLabelByIndex(slotIndex: number): string {
  return SLOT_INDEX_MAP[slotIndex]?.label ?? `${slotIndex * 2 - 1}-${slotIndex * 2}节`
}

export function parseSlotLabel(label: string): number {
  const entry = Object.entries(SLOT_INDEX_MAP).find(([, v]) => v.label === label)
  return entry ? parseInt(entry[0], 10) : 1
}

export const DAYS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
]

export const DAY_NAME_MAP: Record<number, string> = DAYS.reduce(
  (acc, d) => {
    acc[d.value] = d.label
    return acc
  },
  {} as Record<number, string>
)

// 供 grid 渲染使用的 TIME_SLOTS 数组（保持与旧代码兼容的字段结构）
export const TIME_SLOTS = Object.entries(SLOT_INDEX_MAP).map(([index, info]) => ({
  label: info.label,
  start: info.start,
  end: info.end,
  index: parseInt(index, 10),
}))
