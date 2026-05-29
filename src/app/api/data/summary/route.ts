import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'

// GET /api/data/summary — get data summary statistics
export async function GET(request: NextRequest) {
  const auth = await requirePermission('data:read', request)
  if ('error' in auth) return auth.error

  try {
    const [
      courseCount,
      teacherCount,
      roomCount,
      classGroupCount,
      teachingTaskCount,
      scheduleSlotCount,
    ] = await Promise.all([
      prisma.course.count(),
      prisma.teacher.count(),
      prisma.room.count(),
      prisma.classGroup.count(),
      prisma.teachingTask.count(),
      prisma.scheduleSlot.count(),
    ])

    return NextResponse.json({
      success: true,
      summary: {
        courses: courseCount,
        teachers: teacherCount,
        rooms: roomCount,
        classGroups: classGroupCount,
        teachingTasks: teachingTaskCount,
        scheduleSlots: scheduleSlotCount,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
