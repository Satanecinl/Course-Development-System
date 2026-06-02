import { prisma } from '@/lib/prisma'
import { resolveSchedulerSemester } from '@/lib/semester'
import { checkScheduleConflicts } from '@/lib/schedule/conflict-check'

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
 *
 * Conflict check rules are shared with /api/conflict-check via
 * @/lib/schedule/conflict-check.checkScheduleConflicts. This function
 * ONLY owns the mutation-specific guard (slot/task existence, same-semester
 * boundary, response envelope) — it does NOT re-implement conflict rules.
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

  const { conflicts } = await checkScheduleConflicts({
    scheduleSlotId: slotId,
    targetDayOfWeek,
    targetSlotIndex,
    targetRoomId,
    semesterId,
  })

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
    select: { id: true, semesterId: true },
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

  const { conflicts } = await checkScheduleConflicts({
    teachingTaskId,
    targetDayOfWeek,
    targetSlotIndex,
    targetRoomId,
    semesterId,
  })

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

  const { conflicts } = await checkScheduleConflicts({
    scheduleSlotId: slotId,
    targetDayOfWeek: targetDay,
    targetSlotIndex: targetSlot,
    targetRoomId: targetRoom,
    semesterId,
  })

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
