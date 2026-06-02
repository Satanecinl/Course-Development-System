import { prisma } from '@/lib/prisma'
import { checkScheduleConflicts } from '@/lib/schedule/conflict-check'
import type { ScheduleConflictDetail } from '@/lib/schedule/conflict-rules'

export interface TaskMutationGuardResult {
  ok: boolean
  error?: string
  status?: number
  conflicts?: string[]
  conflictDetails?: ScheduleConflictDetail[]
  semesterId?: number
}

/**
 * Guard for admin [model] teachingtask PUT.
 *
 * When teacherId changes on a TeachingTask that has associated ScheduleSlots,
 * checks each slot for teacher conflicts with the new teacher. Uses the same
 * checkScheduleConflicts engine as /api/conflict-check and slot-mutation-guard.
 *
 * Does NOT guard roomId changes (admin generic route FIELD_WHITELIST does not
 * include roomId for teachingtask). RoomId changes go through the dedicated
 * /api/teaching-task/[id] route.
 */
export async function guardAdminTaskUpdate(
  taskId: number,
  data: Record<string, unknown>,
): Promise<TaskMutationGuardResult> {
  if (data.teacherId === undefined) {
    return { ok: true }
  }

  const existing = await prisma.teachingTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      teacherId: true,
      semesterId: true,
      startWeek: true,
      endWeek: true,
      weekType: true,
      taskClasses: { select: { classGroupId: true } },
      scheduleSlots: {
        select: { id: true, dayOfWeek: true, slotIndex: true, roomId: true, semesterId: true },
      },
    },
  })

  if (!existing) {
    return { ok: true }
  }

  const newTeacherId = data.teacherId as number | null
  if (newTeacherId === existing.teacherId) {
    return { ok: true }
  }

  if (existing.scheduleSlots.length === 0) {
    return { ok: true }
  }

  const classGroupIds = existing.taskClasses.map((tc) => tc.classGroupId)
  const movingWeek = {
    start: existing.startWeek ?? 1,
    end: existing.endWeek ?? 16,
    type: (existing.weekType ?? 'ALL') as 'ALL' | 'ODD' | 'EVEN',
  }

  const conflicts: string[] = []
  const conflictDetails: ScheduleConflictDetail[] = []

  for (const slot of existing.scheduleSlots) {
    const result = await checkScheduleConflicts({
      scheduleSlotId: slot.id,
      teacherId: newTeacherId,
      classGroupIds,
      movingWeek,
      targetDayOfWeek: slot.dayOfWeek,
      targetSlotIndex: slot.slotIndex,
      targetRoomId: slot.roomId ?? 0,
      semesterId: slot.semesterId ?? existing.semesterId ?? undefined,
    })
    if (result.hasConflict) {
      conflicts.push(...result.conflicts)
      if (result.conflictDetails) conflictDetails.push(...result.conflictDetails)
    }
  }

  if (conflicts.length > 0) {
    return { ok: false, error: 'Schedule conflict detected', status: 409, conflicts, conflictDetails }
  }

  return { ok: true, semesterId: existing.semesterId ?? undefined }
}
