import { SLOT_INDEX_MAP, DAYS } from '@/types/schedule'
import type { DbRecord } from './types'

export function getColumns(activeTable: string, records: DbRecord[]): string[] {
  if (records.length === 0) return []
  if (activeTable === 'teachingtask') {
    return ['id', 'courseName', 'teacherName', 'weekType', 'startWeek', 'endWeek', 'remark', 'classNames']
  }
  if (activeTable === 'scheduleslot') {
    return ['id', 'courseName', 'teacherName', 'dayOfWeek', 'slotIndex', 'roomName']
  }
  return Object.keys(records[0]).filter((k) => k !== 'createdAt' && k !== 'updatedAt')
}

export function getCellValue(record: DbRecord, col: string, activeTable: string): unknown {
  if (activeTable === 'teachingtask') {
    const r = record as Record<string, unknown>
    const course = r.course as { name?: string } | undefined
    const teacher = r.teacher as { name?: string } | undefined
    switch (col) {
      case 'courseName': return course?.name ?? r.courseId ?? '-'
      case 'teacherName': return teacher?.name ?? r.teacherId ?? '-'
      case 'classNames': {
        const ttc = r.taskClasses as { classGroup: { name: string } }[] | undefined
        return ttc?.map((tc) => tc.classGroup.name).join(', ') || '-'
      }
      default: return r[col]
    }
  }
  if (activeTable === 'scheduleslot') {
    const r = record as Record<string, unknown>
    const teachingTask = r.teachingTask as { course?: { name?: string }; teacher?: { name?: string } } | undefined
    const room = r.room as { name?: string } | undefined
    switch (col) {
      case 'courseName': return teachingTask?.course?.name ?? '-'
      case 'teacherName': return teachingTask?.teacher?.name ?? '-'
      case 'roomName': return room?.name ?? '-'
      case 'dayOfWeek': return DAYS[(r.dayOfWeek as number) - 1]?.label ?? r.dayOfWeek
      case 'slotIndex': return SLOT_INDEX_MAP[r.slotIndex as keyof typeof SLOT_INDEX_MAP]?.label ?? `第${r.slotIndex}节`
      default: return r[col]
    }
  }
  return record[col]
}
