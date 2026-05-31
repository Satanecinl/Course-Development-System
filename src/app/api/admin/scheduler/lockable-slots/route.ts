import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const slots = await prisma.scheduleSlot.findMany({
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
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[scheduler/lockable-slots] error:', message)
    return NextResponse.json(
      { success: false, error: 'FETCH_FAILED', message },
      { status: 500 },
    )
  }
}
