import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { guardTeachingTaskUpdateSemantics } from '@/lib/schedule/teaching-task-mutation-guard'
import { toSemesterErrorResponse } from '@/lib/schedule/semester-scope'

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
      : undefined

    // K16-FIX-A: Comprehensive semantic guard before any writes.
    // Covers teacherId, roomId, classGroupIds, week constraints, and semester.
    const guardResult = await guardTeachingTaskUpdateSemantics(taskId, {
      teacherId,
      roomId,
      weekType,
      startWeek,
      endWeek,
      classGroupIds: validClassGroupIds,
    })

    if (!guardResult.ok) {
      return NextResponse.json(
        {
          error: guardResult.error,
          conflicts: guardResult.conflicts ?? [],
          conflictDetails: guardResult.conflictDetails ?? [],
        },
        { status: guardResult.status ?? 409 },
      )
    }

    // K25-D: defense-in-depth — verify any provided classGroupIds belong to
    // the same semester as the existing task. The semantic guard already
    // covers semester mismatch on the task itself, but cross-semester
    // classGroup leakage is a separate risk that this check closes.
    if (validClassGroupIds && validClassGroupIds.length > 0) {
      const task = await prisma.teachingTask.findUnique({
        where: { id: taskId },
        select: { semesterId: true },
      })
      if (task) {
        const classGroups = await prisma.classGroup.findMany({
          where: { id: { in: validClassGroupIds } },
          select: { id: true, semesterId: true },
        })
        const mismatched = classGroups.filter((cg) => cg.semesterId !== task.semesterId)
        if (mismatched.length > 0) {
          return NextResponse.json(
            {
              error: 'CLASS_GROUP_SEMESTER_MISMATCH',
              message: `${mismatched.length} classGroup(s) belong to a different semester than the task's semester ${task.semesterId}`,
              mismatchedIds: mismatched.map((m) => m.id),
              taskSemesterId: task.semesterId,
            },
            { status: 400 },
          )
        }
      }
    }

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

      // 3. Propagate roomId to all associated ScheduleSlots.
      //    Conflict check was already done by the guard above.
      if (roomId != null) {
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

      if (validClassGroupIds && validClassGroupIds.length > 0) {
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
    const errResponse = toSemesterErrorResponse(error)
    if (errResponse) {
      return NextResponse.json(errResponse.response, { status: errResponse.status })
    }
    const err = error as { conflicts?: string[]; conflictDetails?: unknown[]; message?: string }
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
