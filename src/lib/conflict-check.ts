import { prisma } from './prisma'
import { checkWeekOverlap, WeekConstraint } from './conflict'

export interface ConflictCheckInput {
  scheduleSlotId: number
  targetDayOfWeek: number
  targetSlotIndex: number
  targetRoomId: number
  /** Filter conflict checks to this semester's slots only. */
  semesterId?: number | null
}

export interface ConflictCheckResult {
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
 * 核心冲突检测逻辑（基于新 Schema：ScheduleSlot + TeachingTask）
 *
 * When semesterId is provided, only checks conflicts within the same semester.
 */
export async function checkScheduleConflict(
  input: ConflictCheckInput
): Promise<ConflictCheckResult> {
  const { scheduleSlotId, targetDayOfWeek, targetSlotIndex, targetRoomId } = input

  const movingSlot = await prisma.scheduleSlot.findUnique({
    where: { id: scheduleSlotId },
    include: {
      room: true,
      teachingTask: {
        include: {
          course: true,
          teacher: true,
          taskClasses: {
            include: { classGroup: true },
          },
        },
      },
    },
  })

  if (!movingSlot) {
    throw new Error(`ScheduleSlot ${scheduleSlotId} not found`)
  }

  // Use the moving slot's semesterId if not explicitly provided
  const semesterId = input.semesterId ?? movingSlot.semesterId

  const movingTask = movingSlot.teachingTask
  const movingClassIds = movingTask.taskClasses.map((tc) => tc.classGroupId)
  const movingClassNames = movingTask.taskClasses.map((tc) => tc.classGroup.name)

  const movingWeek: WeekConstraint = {
    start: movingTask.startWeek,
    end: movingTask.endWeek,
    type: movingTask.weekType as WeekConstraint['type'],
  }

  const result: ConflictCheckResult = {
    hasConflict: false,
    conflicts: [],
  }

  const targetSlotLabel = getSlotLabel(targetSlotIndex)

  const timeOverlapWhere: Record<string, unknown> = {
    id: { not: scheduleSlotId },
    dayOfWeek: targetDayOfWeek,
    slotIndex: targetSlotIndex,
  }

  // Scope to same semester
  if (semesterId != null) {
    timeOverlapWhere.semesterId = semesterId
  }

  const targetRoom = await prisma.room.findUnique({ where: { id: targetRoomId } })

  // =====================================================================
  // a. 教室冲突
  // =====================================================================
  const roomOccupiedSlots = await prisma.scheduleSlot.findMany({
    where: { ...timeOverlapWhere, roomId: targetRoomId },
    include: {
      room: true,
      teachingTask: {
        include: {
          course: true,
          teacher: true,
          taskClasses: {
            include: { classGroup: true },
          },
        },
      },
    },
  })

  for (const slot of roomOccupiedSlots) {
    const occupiedTask = slot.teachingTask
    const occupiedWeek: WeekConstraint = {
      start: occupiedTask.startWeek,
      end: occupiedTask.endWeek,
      type: occupiedTask.weekType as WeekConstraint['type'],
    }
    if (checkWeekOverlap(movingWeek, occupiedWeek)) {
      const occupiedClassNames = occupiedTask.taskClasses
        .map((tc) => tc.classGroup.name)
        .join('、')
      result.hasConflict = true
      result.conflicts.push(
        `教室${targetRoom?.name || targetRoomId}在${dayOfWeekToChinese(targetDayOfWeek)}${targetSlotLabel}已被${occupiedClassNames}的《${occupiedTask.course?.name || '未知课程'}》占用（教师：${occupiedTask.teacher?.name || '未知'}）`
      )
    }
  }

  // =====================================================================
  // b. 教师冲突
  // =====================================================================
  if (movingTask.teacherId) {
    const teacherBusySlots = await prisma.scheduleSlot.findMany({
      where: {
        ...timeOverlapWhere,
        teachingTask: { teacherId: movingTask.teacherId },
      },
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
      const occupiedTask = slot.teachingTask
      const occupiedWeek: WeekConstraint = {
        start: occupiedTask.startWeek,
        end: occupiedTask.endWeek,
        type: occupiedTask.weekType as WeekConstraint['type'],
      }
      if (checkWeekOverlap(movingWeek, occupiedWeek)) {
        const occupiedClassNames = occupiedTask.taskClasses
          .map((tc) => tc.classGroup.name)
          .join('、')
        result.hasConflict = true
        result.conflicts.push(
          `教师${movingTask.teacher?.name || ''}在${dayOfWeekToChinese(targetDayOfWeek)}${targetSlotLabel}已有《${occupiedTask.course?.name || '未知课程'}》（${occupiedClassNames}，教室：${slot.room?.name || '未知'}）`
        )
      }
    }
  }

  // =====================================================================
  // c. 班级冲突（检查所有关联班级）
  // =====================================================================
  if (movingClassIds.length > 0) {
    const classBusySlots = await prisma.scheduleSlot.findMany({
      where: {
        ...timeOverlapWhere,
        teachingTask: {
          taskClasses: {
            some: {
              classGroupId: { in: movingClassIds },
            },
          },
        },
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
      const occupiedTask = slot.teachingTask
      const occupiedWeek: WeekConstraint = {
        start: occupiedTask.startWeek,
        end: occupiedTask.endWeek,
        type: occupiedTask.weekType as WeekConstraint['type'],
      }
      if (checkWeekOverlap(movingWeek, occupiedWeek)) {
        const occupiedClassNames = occupiedTask.taskClasses
          .map((tc) => tc.classGroup.name)
          .join('、')
        result.hasConflict = true
        result.conflicts.push(
          `班级${movingClassNames.join('、')}在${dayOfWeekToChinese(targetDayOfWeek)}${targetSlotLabel}已有《${occupiedTask.course?.name || '未知课程'}》（教师：${occupiedTask.teacher?.name || '未知'}，教室：${slot.room?.name || '未知'}）`
        )
      }
    }
  }

  return result
}
