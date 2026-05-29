import type { ScheduleViewData } from '@/types/schedule'

export type WeekFilter = 'ALL' | number

export function isScheduleItemActiveInWeek(
  item: ScheduleViewData,
  selectedWeek: WeekFilter,
): boolean {
  if (selectedWeek === 'ALL') return true

  const week = selectedWeek

  // Check week range
  if (item.startWeek != null && item.endWeek != null) {
    if (week < item.startWeek || week > item.endWeek) return false
  }

  // Check weekType
  const wt = (item.weekType ?? 'ALL').toUpperCase()

  switch (wt) {
    case 'ALL':
    case '全周':
      return true
    case 'ODD':
    case '单周':
      return week % 2 === 1
    case 'EVEN':
    case '双周':
      return week % 2 === 0
    case 'FIRST_HALF':
    case '前八周':
      return week <= 8
    case 'SECOND_HALF':
    case '后八周':
      return week >= 9
    case 'CUSTOM':
      // Already checked by startWeek/endWeek range above
      return true
    default:
      // Unknown weekType, default to visible
      return true
  }
}
