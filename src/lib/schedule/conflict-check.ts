/**
 * Shared schedule conflict check engine.
 *
 * Used by:
 * - /api/conflict-check (read-only preflight)
 * - src/lib/schedule/slot-mutation-guard.ts (server-side mutation guard)
 * - src/app/api/teaching-task/[id]/route.ts (pre-update room change guard)
 *
 * Pure rule kernel (teacher / classGroup / room / week overlap) is delegated
 * to src/lib/schedule/conflict-rules. This file owns:
 *  - Prisma reads (ScheduleSlot + TeachingTask + Room lookups)
 *  - exclude-self via scheduleSlotId
 *  - semester scoping on the slot query
 *  - response envelope { hasConflict, conflicts: string[] }
 *
 * Does NOT depend on NextRequest / NextResponse.
 * Does NOT write to the database (read-only).
 */

import { prisma } from '@/lib/prisma'
import { expandWeeks, type WeekConstraint } from '@/lib/conflict'
import {
  findRuleMatches,
  type ScheduleConflictCandidate,
  type ScheduleConflictOccupancy,
} from '@/lib/schedule/conflict-rules'

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
    classGroupIds = task.taskClasses.map((tc) => tc.classGroup.id)
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
    classGroupIds = slot.teachingTask.taskClasses.map((tc) => tc.classGroup.id)
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
 * Convert a Prisma ScheduleSlot row (with its includes) into a pure
 * ScheduleConflictOccupancy for the rule kernel.
 */
function toOccupancy(slot: {
  id: number
  dayOfWeek: number
  slotIndex: number
  roomId: number | null
  room: { name: string } | null
  teachingTask: {
    teacherId: number | null
    weekType: string | null
    startWeek: number | null
    endWeek: number | null
    course: { name: string } | null
    teacher: { name: string } | null
    taskClasses: { classGroup: { id: number; name: string } }[]
  }
}): ScheduleConflictOccupancy {
  return {
    id: slot.id,
    teacherId: slot.teachingTask.teacherId,
    classGroupIds: slot.teachingTask.taskClasses.map((tc) => tc.classGroup.id),
    roomId: slot.roomId,
    dayOfWeek: slot.dayOfWeek,
    slotIndex: slot.slotIndex,
    weekConstraint: {
      start: slot.teachingTask.startWeek ?? 1,
      end: slot.teachingTask.endWeek ?? 16,
      type: (slot.teachingTask.weekType ?? 'ALL') as WeekConstraint['type'],
    },
    teacherName: slot.teachingTask.teacher?.name ?? null,
    classNames: slot.teachingTask.taskClasses.map((tc) => tc.classGroup.name),
    courseName: slot.teachingTask.course?.name ?? null,
    roomName: slot.room?.name ?? null,
  }
}

/**
 * Core schedule conflict check.
 *
 * Checks: room / teacher / classGroup with week overlap, scoped to a semester,
 * excluding the source slot (if provided).
 *
 * This function is the SINGLE source of truth for the conflict check rules
 * used by /api/conflict-check, slot-mutation-guard, and teaching-task room
 * update. Rule logic is delegated to src/lib/schedule/conflict-rules.
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

  const targetRoomRecord = await prisma.room.findUnique({
    where: { id: input.targetRoomId },
    select: { name: true },
  })
  const targetRoomLabel = targetRoomRecord?.name || String(input.targetRoomId)

  // Build the candidate (the move being validated). Weeks are the explicit
  // set of weeks the moving task is active in.
  const candidate: ScheduleConflictCandidate = {
    teacherId,
    classGroupIds,
    roomId: input.targetRoomId,
    dayOfWeek: input.targetDayOfWeek,
    slotIndex: input.targetSlotIndex,
    weeks: Array.from(expandWeeks(movingWeek)).sort((a, b) => a - b),
    excludeOccupancyId: input.scheduleSlotId ?? null,
    teacherName: movingTeacherName,
    classNames: movingClassNames,
  }

  // Load all base ScheduleSlot rows for this day/slot window, scoped by
  // semester and excluding self. The pure rules kernel handles the per-rule
  // (room / teacher / classGroup) filtering.
  const baseSlots = await prisma.scheduleSlot.findMany({
    where: timeWhere,
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
  const occupancies: ScheduleConflictOccupancy[] = baseSlots.map(toOccupancy)

  const ruleMatches = findRuleMatches(candidate, occupancies)
  if (ruleMatches.length === 0) {
    return result
  }

  // Format each rule match as a Chinese string. The original
  // checkScheduleConflicts produced one message per (occupancy, rule-type)
  // pair; we preserve that by iterating the matches and rebuilding each
  // message from the candidate + occupancy context.
  const messages: string[] = []
  for (const match of ruleMatches) {
    const occ = occupancies.find((o) => o.id === match.occupancyId)
    if (!occ) continue
    messages.push(formatMatchMessage(match.type, candidate, occ, targetRoomLabel))
  }

  result.hasConflict = true
  result.conflicts = messages
  return result
}

function formatMatchMessage(
  type: 'teacher' | 'classGroup' | 'room',
  candidate: ScheduleConflictCandidate,
  occ: ScheduleConflictOccupancy,
  targetRoomLabel: string,
): string {
  const dayLabel = dayOfWeekToChinese(occ.dayOfWeek)
  const slotLabel = getSlotLabel(occ.slotIndex)
  const classNames = occ.classNames?.join('、') ?? ''
  const courseName = occ.courseName || '未知课程'
  const teacherName = occ.teacherName || '未知'
  const roomName = occ.roomName || '未知'
  const candidateTeacher = candidate.teacherName || ''
  const candidateClassNames = candidate.classNames?.join('、') || '未知'

  switch (type) {
    case 'room':
      return `教室${targetRoomLabel}在${dayLabel}${slotLabel}已被${classNames}的《${courseName}》占用（教师：${teacherName}）`
    case 'teacher':
      return `教师${candidateTeacher || teacherName}在${dayLabel}${slotLabel}已有《${courseName}》（${classNames}，教室：${roomName}）`
    case 'classGroup':
      return `班级${candidateClassNames}在${dayLabel}${slotLabel}已有《${courseName}》（教师：${teacherName}，教室：${roomName}）`
  }
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
