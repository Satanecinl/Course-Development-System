/**
 * Shared schedule conflict check engine.
 *
 * Used by:
 * - /api/conflict-check (read-only preflight)
 * - src/lib/schedule/slot-mutation-guard.ts (server-side mutation guard)
 *
 * This is the single source of truth for teacher / classGroup / room / week / semester
 * conflict detection. Other call sites MUST go through this helper to avoid rule drift.
 *
 * Does NOT depend on NextRequest / NextResponse.
 * Does NOT write to the database (read-only).
 */

import { prisma } from '@/lib/prisma'
import { checkWeekOverlap, WeekConstraint } from '@/lib/conflict'

export interface ScheduleConflictCheckInput {
  /** Source slot ID (used to exclude self from the conflict scan). */
  scheduleSlotId?: number | null
  /** Source teaching task ID (used to derive movingWeek + teacherId + classGroupIds when not pre-resolved). */
  teachingTaskId?: number | null
  /** When teachingTaskId is not provided, caller must pre-resolve these. */
  teacherId?: number | null
  classGroupIds?: number[]
  movingWeek?: WeekConstraint
  targetDayOfWeek: number
  targetSlotIndex: number
  targetRoomId: number
  /** Scope the conflict scan to this semester. */
  semesterId?: number | null
}

export interface ScheduleConflictCheckResult {
  hasConflict: boolean
  conflicts: string[]
}

function dayOfWeekToChinese(day: number): string {
  const map: Record<number, string> = {
    1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日',
  }
  return map[day] || `周${day}`
}

function getSlotLabel(slotIndex: number): string {
  const labels = ['', '1-2节', '3-4节', '5-6节', '7-8节', '9-10节', '11-12节', '中午']
  return labels[slotIndex] || `${slotIndex * 2 - 1}-${slotIndex * 2}节`
}

/**
 * Resolve teaching task info from input or look it up.
 * Returns null if neither input nor lookup can resolve the data.
 */
async function resolveTaskContext(
  input: ScheduleConflictCheckInput,
): Promise<{
  teacherId: number | null
  classGroupIds: number[]
  movingWeek: WeekConstraint
  movingClassNames: string[]
  movingTeacherName: string | null
} | null> {
  let teacherId: number | null | undefined
  let classGroupIds: number[] | undefined
  let movingWeek: WeekConstraint | undefined
  let movingClassNames: string[] | undefined
  let movingTeacherName: string | null | undefined

  if (input.teachingTaskId != null) {
    const task = await prisma.teachingTask.findUnique({
      where: { id: input.teachingTaskId },
      include: {
        teacher: true,
        taskClasses: { include: { classGroup: true } },
      },
    })
    if (!task) return null
    teacherId = task.teacherId
    classGroupIds = task.taskClasses.map((tc) => tc.classGroupId)
    movingWeek = {
      start: task.startWeek,
      end: task.endWeek,
      type: task.weekType as WeekConstraint['type'],
    }
    movingClassNames = task.taskClasses.map((tc) => tc.classGroup.name)
    movingTeacherName = task.teacher?.name ?? null
  } else if (input.scheduleSlotId != null) {
    const slot = await prisma.scheduleSlot.findUnique({
      where: { id: input.scheduleSlotId },
      include: {
        teachingTask: {
          include: {
            teacher: true,
            taskClasses: { include: { classGroup: true } },
          },
        },
      },
    })
    if (!slot) return null
    teacherId = slot.teachingTask.teacherId
    classGroupIds = slot.teachingTask.taskClasses.map((tc) => tc.classGroupId)
    movingWeek = {
      start: slot.teachingTask.startWeek,
      end: slot.teachingTask.endWeek,
      type: slot.teachingTask.weekType as WeekConstraint['type'],
    }
    movingClassNames = slot.teachingTask.taskClasses.map((tc) => tc.classGroup.name)
    movingTeacherName = slot.teachingTask.teacher?.name ?? null
  } else {
    if (input.teacherId === undefined || input.classGroupIds === undefined || !input.movingWeek) {
      return null
    }
    teacherId = input.teacherId
    classGroupIds = input.classGroupIds
    movingWeek = input.movingWeek
    movingClassNames = []
    movingTeacherName = null
  }

  return { teacherId: teacherId ?? null, classGroupIds, movingWeek, movingClassNames, movingTeacherName }
}

/**
 * Core schedule conflict check.
 *
 * Checks: room / teacher / classGroup with week overlap, scoped to a semester,
 * excluding the source slot (if provided).
 *
 * This function is the SINGLE source of truth for the conflict check rules used by
 * both /api/conflict-check and slot-mutation-guard.
 */
export async function checkScheduleConflicts(
  input: ScheduleConflictCheckInput,
): Promise<ScheduleConflictCheckResult> {
  const result: ScheduleConflictCheckResult = {
    hasConflict: false,
    conflicts: [],
  }

  const ctx = await resolveTaskContext(input)
  if (!ctx) {
    return result
  }

  const { teacherId, classGroupIds, movingWeek, movingClassNames, movingTeacherName } = ctx

  const timeWhere: Record<string, unknown> = {
    dayOfWeek: input.targetDayOfWeek,
    slotIndex: input.targetSlotIndex,
  }
  if (input.scheduleSlotId != null) {
    timeWhere.id = { not: input.scheduleSlotId }
  }
  if (input.semesterId != null) {
    timeWhere.semesterId = input.semesterId
  }

  const dayLabel = dayOfWeekToChinese(input.targetDayOfWeek)
  const slotLabel = getSlotLabel(input.targetSlotIndex)

  const targetRoomRecord = await prisma.room.findUnique({
    where: { id: input.targetRoomId },
    select: { name: true },
  })
  const targetRoomLabel = targetRoomRecord?.name || String(input.targetRoomId)

  // ── Room conflict ──
  const roomOccupiedSlots = await prisma.scheduleSlot.findMany({
    where: { ...timeWhere, roomId: input.targetRoomId },
    include: {
      teachingTask: {
        include: {
          course: true,
          teacher: true,
          taskClasses: { include: { classGroup: true } },
        },
      },
    },
  })

  for (const slot of roomOccupiedSlots) {
    const occTask = slot.teachingTask
    const occWeek: WeekConstraint = {
      start: occTask.startWeek,
      end: occTask.endWeek,
      type: occTask.weekType as WeekConstraint['type'],
    }
    if (checkWeekOverlap(movingWeek, occWeek)) {
      const occupiedClassNames = occTask.taskClasses.map((tc) => tc.classGroup.name).join('、')
      result.hasConflict = true
      result.conflicts.push(
        `教室${targetRoomLabel}在${dayLabel}${slotLabel}已被${occupiedClassNames}的《${occTask.course?.name || '未知课程'}》占用（教师：${occTask.teacher?.name || '未知'}）`
      )
    }
  }

  // ── Teacher conflict ──
  if (teacherId != null) {
    const teacherBusySlots = await prisma.scheduleSlot.findMany({
      where: { ...timeWhere, teachingTask: { teacherId } },
      include: {
        room: true,
        teachingTask: {
          include: {
            course: true,
            taskClasses: { include: { classGroup: true } },
          },
        },
      },
    })

    for (const slot of teacherBusySlots) {
      const occTask = slot.teachingTask
      const occWeek: WeekConstraint = {
        start: occTask.startWeek,
        end: occTask.endWeek,
        type: occTask.weekType as WeekConstraint['type'],
      }
      if (checkWeekOverlap(movingWeek, occWeek)) {
        const occupiedClassNames = occTask.taskClasses.map((tc) => tc.classGroup.name).join('、')
        result.hasConflict = true
        result.conflicts.push(
          `教师${movingTeacherName || ''}在${dayLabel}${slotLabel}已有《${occTask.course?.name || '未知课程'}》（${occupiedClassNames}，教室：${slot.room?.name || '未知'}）`
        )
      }
    }
  }

  // ── Class conflict ──
  if (classGroupIds.length > 0) {
    const classBusySlots = await prisma.scheduleSlot.findMany({
      where: {
        ...timeWhere,
        teachingTask: { taskClasses: { some: { classGroupId: { in: classGroupIds } } } },
      },
      include: {
        room: true,
        teachingTask: {
          include: {
            course: true,
            teacher: true,
            taskClasses: { include: { classGroup: true } },
          },
        },
      },
    })

    for (const slot of classBusySlots) {
      const occTask = slot.teachingTask
      const occWeek: WeekConstraint = {
        start: occTask.startWeek,
        end: occTask.endWeek,
        type: occTask.weekType as WeekConstraint['type'],
      }
      if (checkWeekOverlap(movingWeek, occWeek)) {
        const occupiedClassNames = occTask.taskClasses.map((tc) => tc.classGroup.name).join('、')
        result.hasConflict = true
        result.conflicts.push(
          `班级${movingClassNames.join('、') || '未知'}在${dayLabel}${slotLabel}已有《${occTask.course?.name || '未知课程'}》（教师：${occTask.teacher?.name || '未知'}，教室：${slot.room?.name || '未知'}）`
        )
      }
    }
  }

  return result
}
