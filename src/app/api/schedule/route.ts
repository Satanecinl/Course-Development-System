import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveSchedulerSemester } from '@/lib/semester'
import { getEffectiveScheduleForWeek } from '@/lib/schedule/adjustments'
import { requirePermission } from '@/lib/auth/require-permission'

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('schedule:view', request)
    if ('error' in auth) return auth.error
    const { searchParams } = new URL(request.url)
    const viewType = searchParams.get('viewType') as 'class' | 'teacher' | 'room' | null
    const targetIdParam = searchParams.get('targetId')
    const targetId = targetIdParam ? parseInt(targetIdParam, 10) : null
    const weekParam = searchParams.get('week')
    const applyAdjustments = searchParams.get('applyAdjustments') === 'true'
    const week = weekParam ? parseInt(weekParam, 10) : null
    const semesterIdParam = searchParams.get('semesterId')

    // Resolve semester (explicit or active)
    const semester = await resolveSchedulerSemester({
      semesterId: semesterIdParam ? parseInt(semesterIdParam, 10) : undefined,
    })

    // If week + applyAdjustments, use effective schedule
    if (week != null && applyAdjustments) {
      const effectiveItems = await getEffectiveScheduleForWeek(week, semester.id)
      return NextResponse.json(effectiveItems)
    }

    const where: Record<string, unknown> = { semesterId: semester.id }

    if (viewType && targetId && !isNaN(targetId)) {
      if (viewType === 'class') {
        const taskClasses = await prisma.teachingTaskClass.findMany({
          where: { classGroupId: targetId },
          select: { teachingTaskId: true },
        })
        const taskIds = taskClasses.map((tc) => tc.teachingTaskId)
        if (taskIds.length === 0) {
          return NextResponse.json([])
        }
        where.teachingTaskId = { in: taskIds }
      } else if (viewType === 'teacher') {
        where.teachingTask = { teacherId: targetId }
      } else if (viewType === 'room') {
        where.roomId = targetId
      }
    }

    const slots = await prisma.scheduleSlot.findMany({
      where,
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
      orderBy: [
        { dayOfWeek: 'asc' },
        { slotIndex: 'asc' },
      ],
    })

    const viewData = slots.map((slot) => ({
      slotId: slot.id,
      taskId: slot.teachingTaskId,
      roomId: slot.roomId,
      courseName: slot.teachingTask.course.name,
      teacherName: slot.teachingTask.teacher?.name ?? null,
      teacherId: slot.teachingTask.teacherId ?? null,
      roomName: slot.room?.name ?? null,
      roomBuilding: slot.room?.building ?? null,
      classNames: slot.teachingTask.taskClasses.map((tc) => tc.classGroup.name),
      classGroupIds: slot.teachingTask.taskClasses.map((tc) => tc.classGroup.id),
      dayOfWeek: slot.dayOfWeek,
      slotIndex: slot.slotIndex,
      weekType: slot.teachingTask.weekType,
      startWeek: slot.teachingTask.startWeek,
      endWeek: slot.teachingTask.endWeek,
      remark: slot.teachingTask.remark,
    }))

    return NextResponse.json(viewData)
  } catch (error) {
    console.error('Schedule fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
