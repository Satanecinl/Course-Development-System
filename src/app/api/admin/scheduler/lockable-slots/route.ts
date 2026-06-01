import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'
import { resolveSchedulerSemester } from '@/lib/semester'

export async function GET(request: NextRequest) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const semesterIdParam = searchParams.get('semesterId')

    // Resolve semester
    const semester = await resolveSchedulerSemester({
      semesterId: semesterIdParam ? parseInt(semesterIdParam, 10) : undefined,
    })

    const slots = await prisma.scheduleSlot.findMany({
      where: { semesterId: semester.id },
      include: {
        room: {
          select: {
            name: true,
            capacity: true,
          },
        },
        teachingTask: {
          include: {
            course: {
              select: {
                name: true,
              },
            },
            teacher: {
              select: {
                name: true,
              },
            },
            taskClasses: {
              include: {
                classGroup: {
                  select: {
                    name: true,
                    studentCount: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { slotIndex: 'asc' },
      ],
    })

    const items = slots.map(slot => {
      const task = slot.teachingTask
      const courseName = task.course?.name ?? null
      const teacherName = task.teacher?.name ?? null
      const classGroupNames = task.taskClasses.map(tc => tc.classGroup.name)
      const studentCount = task.taskClasses.reduce(
        (sum, tc) => sum + (tc.classGroup.studentCount ?? 0),
        0,
      )

      const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
      const dayName = dayNames[slot.dayOfWeek] ?? `Day${slot.dayOfWeek}`
      const roomName = slot.room?.name ?? '-'
      const displayName = `${dayName} 第${slot.slotIndex}节 | ${courseName ?? '?'} | ${teacherName ?? '-'} | ${roomName}`

      return {
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        slotIndex: slot.slotIndex,
        roomId: slot.roomId,
        roomName,
        roomCapacity: slot.room?.capacity ?? null,
        teachingTaskId: slot.teachingTaskId,
        courseName,
        teacherName,
        classGroupNames,
        studentCount,
        displayName,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        items,
        total: items.length,
        semester: {
          id: semester.id,
          code: semester.code,
          name: semester.name,
        },
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[scheduler/lockable-slots] error:', message)

    const knownErrors: Record<string, { code: string; status: number }> = {
      SEMESTER_NOT_FOUND: { code: 'SEMESTER_NOT_FOUND', status: 400 },
      NO_ACTIVE_SEMESTER: { code: 'NO_ACTIVE_SEMESTER', status: 400 },
      MULTIPLE_ACTIVE_SEMESTERS: { code: 'MULTIPLE_ACTIVE_SEMESTERS', status: 400 },
    }

    for (const [prefix, resp] of Object.entries(knownErrors)) {
      if (message.startsWith(prefix)) {
        return NextResponse.json(
          { success: false, error: resp.code, message },
          { status: resp.status },
        )
      }
    }

    return NextResponse.json(
      { success: false, error: 'FETCH_FAILED', message },
      { status: 500 },
    )
  }
}
