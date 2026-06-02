import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { checkScheduleConflicts } from '@/lib/schedule/conflict-check'
import type { ScheduleConflictDetail } from '@/lib/schedule/conflict-rules'

// Type augmentation for K13-FIX-D: thread typed conflict details through
// the existing Error.conflicts pattern without changing the public route
// shape. Routes still return `{ error, conflicts }`; they additionally
// surface `conflictDetails` in 409 responses.
type ConflictError = Error & {
  conflicts?: string[]
  conflictDetails?: ScheduleConflictDetail[]
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission('teaching-task:write', request)
    if ('error' in auth) return auth.error

    const { id } = await params
    const taskId = parseInt(id, 10)
    if (isNaN(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 })
    }

    const body = await request.json()
    const {
      courseName,
      teacherId,
      roomId,
      weekType,
      startWeek,
      endWeek,
      remark,
      classGroupIds,
    } = body as {
      courseName?: string
      teacherId?: number | null
      roomId?: number | null
      weekType?: string
      startWeek?: number
      endWeek?: number
      remark?: string | null
      classGroupIds?: number[]
    }

    if (!courseName || typeof courseName !== 'string' || courseName.trim().length === 0) {
      return NextResponse.json({ error: 'Course name is required' }, { status: 400 })
    }
    if (!weekType || typeof weekType !== 'string') {
      return NextResponse.json({ error: 'Week type is required' }, { status: 400 })
    }
    if (typeof startWeek !== 'number' || typeof endWeek !== 'number') {
      return NextResponse.json({ error: 'Start week and end week are required' }, { status: 400 })
    }
    if (startWeek < 1 || startWeek > 16 || endWeek < 1 || endWeek > 16 || startWeek > endWeek) {
      return NextResponse.json({ error: 'Invalid week range (1-16)' }, { status: 400 })
    }

    const trimmedCourseName = courseName.trim()
    const validClassGroupIds = Array.isArray(classGroupIds)
      ? classGroupIds.filter((id): id is number => typeof id === 'number')
      : []

    const result = await prisma.$transaction(async (tx) => {
      // 1. Find or create Course
      const course = await tx.course.upsert({
        where: { name: trimmedCourseName },
        update: {},
        create: { name: trimmedCourseName },
        select: { id: true },
      })

      // 2. Update TeachingTask
      await tx.teachingTask.update({
        where: { id: taskId },
        data: {
          courseId: course.id,
          teacherId: teacherId ?? null,
          weekType,
          startWeek,
          endWeek,
          remark: remark ?? null,
        },
      })

      // 3. Pre-update conflict check: verify new roomId doesn't create conflicts
      //    for any slot that will be updated. Uses shared checkScheduleConflicts
      //    (same engine as /api/conflict-check and slot-mutation-guard).
      if (roomId != null) {
        const existingSlots = await tx.scheduleSlot.findMany({
          where: { teachingTaskId: taskId },
          select: { id: true, dayOfWeek: true, slotIndex: true, semesterId: true },
        })

        const taskSemester = await tx.teachingTask.findUnique({
          where: { id: taskId },
          select: { semesterId: true },
        })

        const conflicts: string[] = []
        const conflictDetails: ScheduleConflictDetail[] = []
        for (const slot of existingSlots) {
          const result = await checkScheduleConflicts({
            scheduleSlotId: slot.id,
            teachingTaskId: taskId,
            targetDayOfWeek: slot.dayOfWeek,
            targetSlotIndex: slot.slotIndex,
            targetRoomId: roomId,
            semesterId: slot.semesterId ?? taskSemester?.semesterId ?? undefined,
          })
          if (result.hasConflict) {
            conflicts.push(...result.conflicts)
            if (result.conflictDetails) conflictDetails.push(...result.conflictDetails)
          }
        }

        if (conflicts.length > 0) {
          const err = new Error('教室冲突') as ConflictError
          err.conflicts = conflicts
          err.conflictDetails = conflictDetails
          throw err
        }

        await tx.scheduleSlot.updateMany({
          where: { teachingTaskId: taskId },
          data: { roomId: roomId ?? null },
        })
      } else {
        await tx.scheduleSlot.updateMany({
          where: { teachingTaskId: taskId },
          data: { roomId: null },
        })
      }

      // 4. Sync TeachingTaskClass
      await tx.teachingTaskClass.deleteMany({
        where: { teachingTaskId: taskId },
      })

      if (validClassGroupIds.length > 0) {
        await tx.teachingTaskClass.createMany({
          data: validClassGroupIds.map((classGroupId) => ({
            teachingTaskId: taskId,
            classGroupId,
          })),
        })
      }

      // 5. Fetch updated slots with nested data for response
      const updatedSlots = await tx.scheduleSlot.findMany({
        where: { teachingTaskId: taskId },
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

      return updatedSlots
    })

    const viewData = result.map((slot) => ({
      slotId: slot.id,
      taskId: slot.teachingTaskId,
      roomId: slot.roomId,
      courseName: slot.teachingTask.course.name,
      teacherName: slot.teachingTask.teacher?.name ?? null,
      roomName: slot.room?.name ?? null,
      roomBuilding: slot.room?.building ?? null,
      classNames: slot.teachingTask.taskClasses.map((tc) => tc.classGroup.name),
      dayOfWeek: slot.dayOfWeek,
      slotIndex: slot.slotIndex,
      weekType: slot.teachingTask.weekType,
      startWeek: slot.teachingTask.startWeek,
      endWeek: slot.teachingTask.endWeek,
      remark: slot.teachingTask.remark,
    }))

    return NextResponse.json(viewData)
  } catch (error) {
    const err = error as ConflictError
    if (err.conflicts) {
      return NextResponse.json(
        { error: err.message, conflicts: err.conflicts, conflictDetails: err.conflictDetails },
        { status: 409 },
      )
    }
    console.error('Teaching task update error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
