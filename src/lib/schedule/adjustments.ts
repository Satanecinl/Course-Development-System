import { prisma } from '@/lib/prisma'
import { resolveSchedulerSemester } from '@/lib/semester'
import type { ScheduleViewData } from '@/types/schedule'
import type {
  ScheduleAdjustmentInput,
  ScheduleAdjustmentConflict,
  ScheduleAdjustmentDryRunResult,
} from '@/types/schedule-adjustment'
import { isScheduleItemActiveInWeek } from './week-filter'

// ── Validation ──

export function validateScheduleAdjustmentInput(
  input: ScheduleAdjustmentInput,
): ScheduleAdjustmentConflict[] {
  const errors: ScheduleAdjustmentConflict[] = []

  if (input.type !== 'MOVE' && input.type !== 'CANCEL') {
    errors.push({ type: 'INVALID_SLOT', message: `Invalid type: ${input.type}`, severity: 'error' })
  }

  if (input.week < 1 || input.week > 20) {
    errors.push({ type: 'INVALID_WEEK', message: `Week must be 1-20, got ${input.week}`, severity: 'error' })
  }

  const targetWeek = input.targetWeek ?? input.week
  if (targetWeek < 1 || targetWeek > 20) {
    errors.push({ type: 'INVALID_WEEK', message: `targetWeek must be 1-20, got ${targetWeek}`, severity: 'error' })
  }

  if (input.type === 'MOVE') {
    if (input.newDayOfWeek == null || input.newSlotIndex == null) {
      errors.push({ type: 'INVALID_SLOT', message: 'MOVE requires newDayOfWeek and newSlotIndex', severity: 'error' })
    } else {
      if (input.newDayOfWeek < 1 || input.newDayOfWeek > 7) {
        errors.push({ type: 'INVALID_SLOT', message: `newDayOfWeek must be 1-7, got ${input.newDayOfWeek}`, severity: 'error' })
      }
      if (input.newSlotIndex < 1 || input.newSlotIndex > 6) {
        errors.push({ type: 'INVALID_SLOT', message: `newSlotIndex must be 1-6, got ${input.newSlotIndex}`, severity: 'error' })
      }
    }
  }

  return errors
}

// ── Get effective schedule for a week ──

export interface EffectiveScheduleItem extends ScheduleViewData {
  adjustmentId?: number
  isAdjusted: boolean
  originalSlotId?: number
  sourceWeek?: number
  targetWeek?: number
}

export async function getEffectiveScheduleForWeek(
  week: number,
  semesterId?: number,
): Promise<EffectiveScheduleItem[]> {
  // 1. Load base schedule slots (scoped by semester if provided)
  const slotWhere = semesterId != null ? { semesterId } : {}
  const slots = await prisma.scheduleSlot.findMany({
    where: slotWhere,
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

  // 2. Filter to slots active in this week
  const baseItems = new Map<number, EffectiveScheduleItem>()
  for (const slot of slots) {
    const task = slot.teachingTask
    const weekType = task.weekType ?? 'ALL'
    const startWeek = task.startWeek ?? 1
    const endWeek = task.endWeek ?? 16

    if (!isScheduleItemActiveInWeek(
      { weekType, startWeek, endWeek } as ScheduleViewData,
      week,
    )) continue

    baseItems.set(slot.id, {
      slotId: slot.id,
      taskId: task.id,
      roomId: slot.roomId,
      courseName: task.course.name,
      teacherName: task.teacher?.name ?? null,
      teacherId: task.teacherId ?? null,
      roomName: slot.room?.name ?? null,
      roomBuilding: slot.room?.building ?? null,
      classNames: task.taskClasses.map((tc) => tc.classGroup.name),
      classGroupIds: task.taskClasses.map((tc) => tc.classGroup.id),
      dayOfWeek: slot.dayOfWeek,
      slotIndex: slot.slotIndex,
      weekType: task.weekType ?? 'ALL',
      startWeek: task.startWeek ?? 1,
      endWeek: task.endWeek ?? 16,
      remark: task.remark,
      isAdjusted: false,
    })
  }

  // 3. Load active adjustments that affect this week (scoped by semester)
  const adjustmentWhere: Record<string, unknown> = {
    status: 'ACTIVE',
    OR: [
      { week },
      { targetWeek: week },
    ],
  }
  if (semesterId != null) {
    adjustmentWhere.semesterId = semesterId
  }

  const adjustments = await prisma.scheduleAdjustment.findMany({
    where: adjustmentWhere,
    include: { newRoom: true },
  })

  // 4. Apply adjustments
  const cancelledSlotIds = new Set<number>()
  const movedOutSlotIds = new Set<number>()
  const addedItems: EffectiveScheduleItem[] = []

  for (const adj of adjustments) {
    const sourceWeek = adj.week
    const targetWeek = adj.targetWeek ?? adj.week

    if (adj.type === 'CANCEL') {
      if (sourceWeek === week) {
        cancelledSlotIds.add(adj.originalSlotId)
      }
      continue
    }

    if (adj.type === 'MOVE') {
      if (sourceWeek === week) {
        movedOutSlotIds.add(adj.originalSlotId)
      }

      if (targetWeek === week) {
        const originalItem = baseItems.get(adj.originalSlotId)
        if (originalItem) {
          addedItems.push({
            ...originalItem,
            dayOfWeek: adj.newDayOfWeek ?? originalItem.dayOfWeek,
            slotIndex: adj.newSlotIndex ?? originalItem.slotIndex,
            roomId: adj.newRoomId ?? originalItem.roomId,
            roomName: adj.newRoom ? adj.newRoom.name : originalItem.roomName,
            adjustmentId: adj.id,
            isAdjusted: true,
            originalSlotId: adj.originalSlotId,
            sourceWeek,
            targetWeek,
          })
        }
      }
    }
  }

  // 5. Build final result
  const result: EffectiveScheduleItem[] = []
  for (const item of baseItems.values()) {
    if (cancelledSlotIds.has(item.slotId)) continue
    if (movedOutSlotIds.has(item.slotId)) continue
    result.push(item)
  }
  for (const item of addedItems) {
    result.push(item)
  }

  return result
}

// ── Dry-run adjustment ──

export async function dryRunScheduleAdjustment(
  input: ScheduleAdjustmentInput,
): Promise<ScheduleAdjustmentDryRunResult> {
  const conflicts: ScheduleAdjustmentConflict[] = []
  const warnings: ScheduleAdjustmentConflict[] = []

  const sourceWeek = input.week
  const targetWeek = input.targetWeek ?? input.week

  // Validate input
  const validationErrors = validateScheduleAdjustmentInput(input)
  if (validationErrors.length > 0) {
    return { canApply: false, conflicts: validationErrors, warnings }
  }

  // Resolve semester
  const semester = await resolveSchedulerSemester({ semesterId: input.semesterId })
  const semesterId = semester.id

  // Check originalSlot exists
  const originalSlot = await prisma.scheduleSlot.findUnique({
    where: { id: input.originalSlotId },
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

  if (!originalSlot) {
    conflicts.push({ type: 'INVALID_SLOT', message: `ScheduleSlot #${input.originalSlotId} not found`, severity: 'error' })
    return { canApply: false, conflicts, warnings }
  }

  // Check originalSlot belongs to the same semester
  if (originalSlot.semesterId !== semesterId) {
    conflicts.push({
      type: 'INVALID_SLOT',
      message: `ScheduleSlot #${input.originalSlotId} belongs to semester ${originalSlot.semesterId}, not ${semesterId}`,
      severity: 'error',
    })
    return { canApply: false, conflicts, warnings }
  }

  // Check originalSlot is active in source week
  const task = originalSlot.teachingTask
  const weekType = task.weekType ?? 'ALL'
  const startWeek = task.startWeek ?? 1
  const endWeek = task.endWeek ?? 16

  if (!isScheduleItemActiveInWeek({ weekType, startWeek, endWeek } as ScheduleViewData, sourceWeek)) {
    conflicts.push({ type: 'INVALID_WEEK', message: `Slot #${input.originalSlotId} is not active in source week ${sourceWeek}`, severity: 'error' })
    return { canApply: false, conflicts, warnings }
  }

  // Reject duplicate ACTIVE adjustment for same sourceWeek + originalSlotId within same semester
  const existingActive = await prisma.scheduleAdjustment.findFirst({
    where: {
      week: sourceWeek,
      originalSlotId: input.originalSlotId,
      status: 'ACTIVE',
      semesterId,
    },
  })
  if (existingActive) {
    conflicts.push({
      type: 'INVALID_SLOT',
      message: `Slot #${input.originalSlotId} already has an active adjustment in week ${sourceWeek}`,
      severity: 'error',
    })
    return { canApply: false, conflicts, warnings }
  }

  // For CANCEL, no further conflict checks needed
  if (input.type === 'CANCEL') {
    return { canApply: true, conflicts, warnings }
  }

  // For MOVE, check conflicts against target week's effective schedule (same semester)
  const effectiveItems = await getEffectiveScheduleForWeek(targetWeek, semesterId)
  const newDay = input.newDayOfWeek!
  const newSlot = input.newSlotIndex!
  const newRoomId = input.newRoomId ?? null

  const itemsAtTarget = effectiveItems.filter(
    (item) => {
      if (item.dayOfWeek !== newDay || item.slotIndex !== newSlot) return false
      if (targetWeek === sourceWeek && item.slotId === input.originalSlotId) return false
      return true
    },
  )

  // Teacher conflict
  const teacherId = task.teacherId
  if (teacherId) {
    const teacherConflict = itemsAtTarget.find((item) => item.teacherId === teacherId)
    if (teacherConflict) {
      conflicts.push({
        type: 'TEACHER_CONFLICT',
        message: `Teacher ${task.teacher?.name} already has a class at this time in week ${targetWeek}`,
        severity: 'error',
        relatedSlotIds: [teacherConflict.slotId],
      })
    }
  }

  // Class conflict
  const originalClassGroupIds = task.taskClasses.map((tc) => tc.classGroupId)
  for (const item of itemsAtTarget) {
    if (!item.classGroupIds) continue
    const overlap = item.classGroupIds.filter((id) => originalClassGroupIds.includes(id))
    if (overlap.length > 0) {
      const overlapClass = task.taskClasses.find((tc) => tc.classGroupId === overlap[0])?.classGroup.name ?? 'Unknown'
      conflicts.push({
        type: 'CLASS_CONFLICT',
        message: `Class ${overlapClass} already has a class at this time in week ${targetWeek}`,
        severity: 'error',
        relatedSlotIds: [item.slotId],
      })
    }
  }

  // Room conflict
  if (newRoomId) {
    const roomConflict = itemsAtTarget.find((item) => item.roomId === newRoomId)
    if (roomConflict) {
      conflicts.push({
        type: 'ROOM_CONFLICT',
        message: `Room is already occupied at this time in week ${targetWeek}`,
        severity: 'error',
        relatedSlotIds: [roomConflict.slotId],
      })
    }
  }

  // Capacity conflict
  if (newRoomId) {
    const room = await prisma.room.findUnique({ where: { id: newRoomId } })
    if (room) {
      const studentCount = task.taskClasses.reduce((sum, tc) => sum + (tc.classGroup.studentCount ?? 50), 0)
      if (studentCount > room.capacity) {
        warnings.push({
          type: 'CAPACITY_CONFLICT',
          message: `Student count (${studentCount}) exceeds room capacity (${room.capacity})`,
          severity: 'warning',
        })
      }
    }
  }

  return { canApply: conflicts.length === 0, conflicts, warnings }
}

// ── Create adjustment ──

export async function createScheduleAdjustment(input: ScheduleAdjustmentInput) {
  const dryRun = await dryRunScheduleAdjustment(input)
  if (!dryRun.canApply) {
    return { success: false, dryRun }
  }

  // semesterId is resolved inside dryRun; resolve again for the create
  const semester = await resolveSchedulerSemester({ semesterId: input.semesterId })
  const semesterId = semester.id

  const adjustment = await prisma.scheduleAdjustment.create({
    data: {
      type: input.type,
      week: input.week,
      targetWeek: input.targetWeek ?? null,
      originalSlotId: input.originalSlotId,
      newDayOfWeek: input.newDayOfWeek ?? null,
      newSlotIndex: input.newSlotIndex ?? null,
      newRoomId: input.newRoomId ?? null,
      reason: input.reason ?? null,
      semesterId: semesterId,
    },
  })

  return { success: true, adjustment, dryRun }
}

// ── Void adjustment ──

export async function voidScheduleAdjustment(id: number, semesterId?: number | null) {
  const adjustment = await prisma.scheduleAdjustment.findUnique({ where: { id } })
  if (!adjustment) {
    return { success: false, error: `Adjustment #${id} not found` }
  }
  if (adjustment.status !== 'ACTIVE') {
    return { success: false, error: `Adjustment status is "${adjustment.status}", only ACTIVE can be voided` }
  }

  // Resolve semester and validate adjustment belongs to it
  const semester = await resolveSchedulerSemester({ semesterId })
  if (adjustment.semesterId !== semester.id) {
    return {
      success: false,
      error: `Adjustment #${id} belongs to semester ${adjustment.semesterId}, not ${semester.id}`,
    }
  }

  // Validate the original slot belongs to the same semester
  const originalSlot = await prisma.scheduleSlot.findUnique({
    where: { id: adjustment.originalSlotId },
    select: { id: true, semesterId: true },
  })
  if (!originalSlot) {
    return { success: false, error: `Original ScheduleSlot #${adjustment.originalSlotId} not found` }
  }
  if (originalSlot.semesterId !== adjustment.semesterId) {
    return {
      success: false,
      error: `ScheduleSlot #${adjustment.originalSlotId} semester (${originalSlot.semesterId}) does not match adjustment semester (${adjustment.semesterId})`,
    }
  }

  await prisma.scheduleAdjustment.update({
    where: { id },
    data: { status: 'VOID' },
  })

  return { success: true, id, status: 'VOID' }
}
