import { prisma } from '@/lib/prisma'
import { checkScheduleConflicts } from '@/lib/schedule/conflict-check'
import { expandWeeks, type WeekConstraint } from '@/lib/conflict'
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

/**
 * Comprehensive semantic guard for TeachingTask updates.
 *
 * Covers all four guard types required by K16-FIX-A:
 *   1. teacherId change — re-checks all existing ScheduleSlots for teacher conflicts
 *   2. same-semester guard — prevents cross-semester edits
 *   3. week constraint guard — verifies existing slots are compatible with new week range
 *   4. classGroupIds guard — re-checks all existing ScheduleSlots for class group conflicts
 *   5. roomId guard — re-checks all existing ScheduleSlots for room conflicts
 *
 * Used by dedicated PUT /api/teaching-task/[id] route.
 */
export async function guardTeachingTaskUpdateSemantics(
  taskId: number,
  proposed: {
    teacherId?: number | null
    roomId?: number | null
    weekType?: string
    startWeek?: number
    endWeek?: number
    classGroupIds?: number[]
    semesterId?: number | null
  },
  options?: {
    /** If set, skip the same-semester guard (e.g. when caller already resolved semester). */
    skipSemesterGuard?: boolean
  },
): Promise<TaskMutationGuardResult> {
  const existing = await prisma.teachingTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      teacherId: true,
      courseId: true,
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

  const existingClassGroupIds = existing.taskClasses.map((tc) => tc.classGroupId)

  // ── 1. Same-semester guard ──
  if (!options?.skipSemesterGuard && proposed.semesterId !== undefined) {
    if (existing.semesterId != null && proposed.semesterId !== existing.semesterId) {
      return {
        ok: false,
        error: '不允许将教学任务移到其他学期',
        status: 403,
      }
    }
  }

  // ── 2. Week constraint guard ──
  const newWeekType = proposed.weekType ?? existing.weekType ?? 'ALL'
  const newStartWeek = proposed.startWeek ?? existing.startWeek ?? 1
  const newEndWeek = proposed.endWeek ?? existing.endWeek ?? 16

  if (newStartWeek > newEndWeek) {
    return {
      ok: false,
      error: '起始周不能大于结束周',
      status: 400,
    }
  }

  const hasWeekChange =
    (proposed.weekType !== undefined && proposed.weekType !== existing.weekType) ||
    (proposed.startWeek !== undefined && proposed.startWeek !== existing.startWeek) ||
    (proposed.endWeek !== undefined && proposed.endWeek !== existing.endWeek)

  if (hasWeekChange && existing.scheduleSlots.length > 0) {
    const newWeekConstraint: WeekConstraint = {
      start: newStartWeek,
      end: newEndWeek,
      type: newWeekType as WeekConstraint['type'],
    }
    const newWeekSet = expandWeeks(newWeekConstraint)

    for (const slot of existing.scheduleSlots) {
      // Each slot is active in the task's week range. If the new week range
      // has zero overlap with the old week range, the slot's effective weeks
      // become empty — which is semantically invalid.
      const oldWeekConstraint: WeekConstraint = {
        start: existing.startWeek ?? 1,
        end: existing.endWeek ?? 16,
        type: (existing.weekType ?? 'ALL') as WeekConstraint['type'],
      }
      const oldWeekSet = expandWeeks(oldWeekConstraint)

      let hasOverlap = false
      for (const w of oldWeekSet) {
        if (newWeekSet.has(w)) {
          hasOverlap = true
          break
        }
      }

      if (!hasOverlap) {
        return {
          ok: false,
          error: '教学任务周次变更会使既有排课不在有效周次范围内',
          status: 409,
          conflicts: [`既有排课（周${slot.dayOfWeek === 1 ? '一' : slot.dayOfWeek === 2 ? '二' : slot.dayOfWeek === 3 ? '三' : slot.dayOfWeek === 4 ? '四' : slot.dayOfWeek === 5 ? '五' : slot.dayOfWeek === 6 ? '六' : '日'}第${slot.slotIndex}节）的周次范围与新周次范围无交集`],
        }
      }
    }
  }

  // ── 3. teacherId guard ──
  const teacherChanged = proposed.teacherId !== undefined && proposed.teacherId !== existing.teacherId
  const classGroupChanged = proposed.classGroupIds !== undefined &&
    !arraysEqual(proposed.classGroupIds, existingClassGroupIds)
  const roomChanged = proposed.roomId !== undefined && proposed.roomId !== (existing.scheduleSlots[0]?.roomId ?? null)

  // Build the effective task state for conflict checks
  const effectiveTeacherId = teacherChanged ? (proposed.teacherId as number | null) : existing.teacherId
  const effectiveClassGroupIds = classGroupChanged ? (proposed.classGroupIds as number[]) : existingClassGroupIds
  const effectiveWeek: WeekConstraint = {
    start: newStartWeek,
    end: newEndWeek,
    type: newWeekType as WeekConstraint['type'],
  }

  // Only run conflict checks if something that affects conflict semantics changed
  const needsConflictCheck = teacherChanged || classGroupChanged || roomChanged

  if (needsConflictCheck && existing.scheduleSlots.length > 0) {
    const conflicts: string[] = []
    const conflictDetails: ScheduleConflictDetail[] = []

    for (const slot of existing.scheduleSlots) {
      // For roomId: use proposed roomId if changed, otherwise keep existing slot roomId
      const targetRoomId = roomChanged
        ? ((proposed.roomId as number | null) ?? 0)
        : (slot.roomId ?? 0)

      const result = await checkScheduleConflicts({
        scheduleSlotId: slot.id,
        teacherId: effectiveTeacherId,
        classGroupIds: effectiveClassGroupIds,
        movingWeek: effectiveWeek,
        targetDayOfWeek: slot.dayOfWeek,
        targetSlotIndex: slot.slotIndex,
        targetRoomId,
        semesterId: slot.semesterId ?? existing.semesterId ?? undefined,
      })
      if (result.hasConflict) {
        conflicts.push(...result.conflicts)
        if (result.conflictDetails) conflictDetails.push(...result.conflictDetails)
      }
    }

    if (conflicts.length > 0) {
      return { ok: false, error: '排课冲突', status: 409, conflicts, conflictDetails }
    }
  }

  return { ok: true, semesterId: existing.semesterId ?? undefined }
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i] !== sortedB[i]) return false
  }
  return true
}
