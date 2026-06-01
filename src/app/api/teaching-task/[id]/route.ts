import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { checkWeekOverlap, WeekConstraint } from '@/lib/conflict'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission('data:write', request)
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

      // 3. Update all ScheduleSlots for this task
      if (roomId != null) {
        await tx.scheduleSlot.updateMany({
          where: { teachingTaskId: taskId },
          data: { roomId: roomId ?? null },
        })

        // Post-update conflict check: verify new roomId doesn't create conflicts
        const updatedSlots = await tx.scheduleSlot.findMany({
          where: { teachingTaskId: taskId },
          select: { id: true, dayOfWeek: true, slotIndex: true, semesterId: true },
        })

        const movingWeek: WeekConstraint = {
          start: startWeek,
          end: endWeek,
          type: weekType as WeekConstraint['type'],
        }

        const conflicts: string[] = []
        const dayLabels = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
        const slotLabels = ['', '1-2节', '3-4节', '5-6节', '7-8节', '9-10节', '11-12节', '中午']

        for (const slot of updatedSlots) {
          const timeWhere: Record<string, unknown> = {
            id: { not: slot.id },
            dayOfWeek: slot.dayOfWeek,
            slotIndex: slot.slotIndex,
            roomId: roomId,
          }
          if (slot.semesterId != null) {
            timeWhere.semesterId = slot.semesterId
          }

          const roomOccupied = await tx.scheduleSlot.findMany({
            where: timeWhere,
            include: {
              teachingTask: {
                include: { course: true, taskClasses: { include: { classGroup: true } } },
              },
            },
          })

          for (const occ of roomOccupied) {
            const occWeek: WeekConstraint = {
              start: occ.teachingTask.startWeek,
              end: occ.teachingTask.endWeek,
              type: occ.teachingTask.weekType as WeekConstraint['type'],
            }
            if (checkWeekOverlap(movingWeek, occWeek)) {
              const classes = occ.teachingTask.taskClasses.map(tc => tc.classGroup.name).join('、')
              conflicts.push(
                `${dayLabels[slot.dayOfWeek]}${slotLabels[slot.slotIndex]}教室已被${classes}的《${occ.teachingTask.course?.name}》占用`,
              )
            }
          }
        }

        if (conflicts.length > 0) {
          const err = new Error('教室冲突') as Error & { conflicts: string[] }
          err.conflicts = conflicts
          throw err
        }
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
    const err = error as Error & { conflicts?: string[] }
    if (err.conflicts) {
      return NextResponse.json(
        { error: err.message, conflicts: err.conflicts },
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
