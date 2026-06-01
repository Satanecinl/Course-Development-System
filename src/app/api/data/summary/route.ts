import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { resolveSchedulerSemester } from '@/lib/semester'

// GET /api/data/summary — get data summary statistics
export async function GET(request: NextRequest) {
  const auth = await requirePermission('data:read', request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const semesterIdParam = searchParams.get('semesterId')
    const semester = await resolveSchedulerSemester({
      semesterId: semesterIdParam ? parseInt(semesterIdParam, 10) : undefined,
    })

    const [
      courseCount,
      teacherCount,
      roomCount,
      classGroupCount,
      teachingTaskCount,
      scheduleSlotCount,
    ] = await Promise.all([
      // Global models — unscoped
      prisma.course.count(),
      prisma.teacher.count(),
      prisma.room.count(),
      // Semester-bound models — scoped
      prisma.classGroup.count({ where: { semesterId: semester.id } }),
      prisma.teachingTask.count({ where: { semesterId: semester.id } }),
      prisma.scheduleSlot.count({ where: { semesterId: semester.id } }),
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
      semester: {
        id: semester.id,
        code: semester.code,
        name: semester.name,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
