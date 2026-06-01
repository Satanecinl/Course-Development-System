import { prisma } from '@/lib/prisma'
import { checkWeekOverlap, WeekConstraint } from '@/lib/conflict'
import { resolveSchedulerSemester } from '@/lib/semester'

export interface SlotMutationGuardResult {
  ok: boolean
  error?: string
  status?: number
  conflicts?: string[]
  semesterId?: number
}

/**
 * Guard for PUT /api/schedule-slot/[id].
 * Validates same-semester + conflict check before update.
 */
export async function guardSlotUpdate(
  slotId: number,
  targetDayOfWeek: number,
  targetSlotIndex: number,
  targetRoomId: number,
): Promise<SlotMutationGuardResult> {
  const slot = await prisma.scheduleSlot.findUnique({
    where: { id: slotId },
    select: {
      id: true,
      semesterId: true,
      teachingTaskId: true,
      teachingTask: {
        select: {
          semesterId: true,
          teacherId: true,
          startWeek: true,
          endWeek: true,
          weekType: true,
          taskClasses: { select: { classGroupId: true } },
        },
      },
    },
  })

  if (!slot) {
    return { ok: false, error: 'Slot not found', status: 404 }
  }

  const semesterId = slot.semesterId ?? slot.teachingTask.semesterId
  if (semesterId == null) {
    return { ok: false, error: 'Slot has no semester assignment', status: 400 }
  }

  const semester = await resolveSchedulerSemester({ semesterId })
  if (semester.id !== semesterId) {
    return { ok: false, error: 'Slot does not belong to the active semester', status: 403 }
  }

  const conflicts = await checkConflictsAtTarget(
    slotId,
    slot.teachingTask.teacherId,
    slot.teachingTask.taskClasses.map(tc => tc.classGroupId),
    { start: slot.teachingTask.startWeek, end: slot.teachingTask.endWeek, type: slot.teachingTask.weekType as WeekConstraint['type'] },
    targetDayOfWeek,
    targetSlotIndex,
    targetRoomId,
    semesterId,
  )

  if (conflicts.length > 0) {
    return { ok: false, error: 'Schedule conflict detected', status: 409, conflicts }
  }

  return { ok: true, semesterId }
}

/**
 * Guard for POST /api/schedule-slot (create).
 * Validates conflict check before creating a new slot.
 */
export async function guardSlotCreate(
  teachingTaskId: number,
  targetDayOfWeek: number,
  targetSlotIndex: number,
  targetRoomId: number | null,
): Promise<SlotMutationGuardResult> {
  const task = await prisma.teachingTask.findUnique({
    where: { id: teachingTaskId },
    select: {
      id: true,
      semesterId: true,
      teacherId: true,
      startWeek: true,
      endWeek: true,
      weekType: true,
      taskClasses: { select: { classGroupId: true } },
    },
  })

  if (!task) {
    return { ok: false, error: 'Teaching task not found', status: 404 }
  }

  const semesterId = task.semesterId
  if (semesterId == null) {
    return { ok: false, error: 'Teaching task has no semester assignment', status: 400 }
  }

  if (targetRoomId == null) {
    return { ok: true, semesterId }
  }

  const conflicts = await checkConflictsAtTarget(
    0,
    task.teacherId,
    task.taskClasses.map(tc => tc.classGroupId),
    { start: task.startWeek, end: task.endWeek, type: task.weekType as WeekConstraint['type'] },
    targetDayOfWeek,
    targetSlotIndex,
    targetRoomId,
    semesterId,
  )

  if (conflicts.length > 0) {
    return { ok: false, error: 'Schedule conflict detected', status: 409, conflicts }
  }

  return { ok: true, semesterId }
}

/**
 * Conflict check for admin [model] scheduleslot PUT.
 * Similar to guardSlotUpdate but works with admin's existing data.
 */
export async function guardAdminSlotUpdate(
  slotId: number,
  data: Record<string, unknown>,
): Promise<SlotMutationGuardResult> {
  const slot = await prisma.scheduleSlot.findUnique({
    where: { id: slotId },
    select: {
      id: true,
      semesterId: true,
      dayOfWeek: true,
      slotIndex: true,
      roomId: true,
      teachingTask: {
        select: {
          semesterId: true,
          teacherId: true,
          startWeek: true,
          endWeek: true,
          weekType: true,
          taskClasses: { select: { classGroupId: true } },
        },
      },
    },
  })

  if (!slot) {
    return { ok: false, error: 'Slot not found', status: 404 }
  }

  const targetDay = (data.dayOfWeek as number) ?? slot.dayOfWeek
  const targetSlot = (data.slotIndex as number) ?? slot.slotIndex
  const targetRoom = (data.roomId as number) ?? slot.roomId

  if (targetRoom == null) {
    return { ok: true, semesterId: slot.semesterId ?? undefined }
  }

  const semesterId = slot.semesterId ?? slot.teachingTask.semesterId
  if (semesterId == null) {
    return { ok: true }
  }

  const conflicts = await checkConflictsAtTarget(
    slotId,
    slot.teachingTask.teacherId,
    slot.teachingTask.taskClasses.map(tc => tc.classGroupId),
    { start: slot.teachingTask.startWeek, end: slot.teachingTask.endWeek, type: slot.teachingTask.weekType as WeekConstraint['type'] },
    targetDay,
    targetSlot,
    targetRoom,
    semesterId,
  )

  if (conflicts.length > 0) {
    return { ok: false, error: 'Schedule conflict detected', status: 409, conflicts }
  }

  return { ok: true, semesterId }
}

/**
 * Conflict check for admin [model] scheduleslot POST.
 */
export async function guardAdminSlotCreate(
  teachingTaskId: number,
  data: Record<string, unknown>,
): Promise<SlotMutationGuardResult> {
  const dayOfWeek = data.dayOfWeek as number
  const slotIndex = data.slotIndex as number
  const roomId = data.roomId as number | null

  if (!dayOfWeek || !slotIndex) {
    return { ok: true }
  }

  return guardSlotCreate(teachingTaskId, dayOfWeek, slotIndex, roomId)
}

// ── Internal conflict check logic ──

async function checkConflictsAtTarget(
  excludeSlotId: number,
  teacherId: number | null,
  classGroupIds: number[],
  movingWeek: WeekConstraint,
  targetDay: number,
  targetSlot: number,
  targetRoom: number,
  semesterId: number,
): Promise<string[]> {
  const conflicts: string[] = []

  const dayLabel = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'][targetDay] || `周${targetDay}`
  const slotLabel = ['', '1-2节', '3-4节', '5-6节', '7-8节', '9-10节', '11-12节', '中午'][targetSlot] || `${targetSlot * 2 - 1}-${targetSlot * 2}节`

  const timeWhere: Record<string, unknown> = {
    id: { not: excludeSlotId },
    dayOfWeek: targetDay,
    slotIndex: targetSlot,
    semesterId,
  }

  // Room conflict
  const roomSlots = await prisma.scheduleSlot.findMany({
    where: { ...timeWhere, roomId: targetRoom },
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

  const targetRoomRecord = await prisma.room.findUnique({ where: { id: targetRoom }, select: { name: true } })

  for (const s of roomSlots) {
    const occWeek: WeekConstraint = { start: s.teachingTask.startWeek, end: s.teachingTask.endWeek, type: s.teachingTask.weekType as WeekConstraint['type'] }
    if (checkWeekOverlap(movingWeek, occWeek)) {
      const classes = s.teachingTask.taskClasses.map(tc => tc.classGroup.name).join('、')
      conflicts.push(`教室${targetRoomRecord?.name || targetRoom}在${dayLabel}${slotLabel}已被${classes}的《${s.teachingTask.course?.name}》占用`)
    }
  }

  // Teacher conflict
  if (teacherId) {
    const teacherSlots = await prisma.scheduleSlot.findMany({
      where: { ...timeWhere, teachingTask: { teacherId } },
      include: {
        room: true,
        teachingTask: {
          include: { course: true, taskClasses: { include: { classGroup: true } } },
        },
      },
    })

    for (const s of teacherSlots) {
      const occWeek: WeekConstraint = { start: s.teachingTask.startWeek, end: s.teachingTask.endWeek, type: s.teachingTask.weekType as WeekConstraint['type'] }
      if (checkWeekOverlap(movingWeek, occWeek)) {
        const classes = s.teachingTask.taskClasses.map(tc => tc.classGroup.name).join('、')
        conflicts.push(`教师在${dayLabel}${slotLabel}已有《${s.teachingTask.course?.name}》（${classes}，教室：${s.room?.name || '未知'}）`)
      }
    }
  }

  // Class conflict
  if (classGroupIds.length > 0) {
    const classSlots = await prisma.scheduleSlot.findMany({
      where: {
        ...timeWhere,
        teachingTask: { taskClasses: { some: { classGroupId: { in: classGroupIds } } } },
      },
      include: {
        room: true,
        teachingTask: {
          include: { course: true, teacher: true, taskClasses: { include: { classGroup: true } } },
        },
      },
    })

    for (const s of classSlots) {
      const occWeek: WeekConstraint = { start: s.teachingTask.startWeek, end: s.teachingTask.endWeek, type: s.teachingTask.weekType as WeekConstraint['type'] }
      if (checkWeekOverlap(movingWeek, occWeek)) {
        const classes = s.teachingTask.taskClasses.map(tc => tc.classGroup.name).join('、')
        conflicts.push(`班级在${dayLabel}${slotLabel}已有《${s.teachingTask.course?.name}》（教师：${s.teachingTask.teacher?.name || '未知'}，教室：${s.room?.name || '未知'}）`)
      }
    }
  }

  return conflicts
}
