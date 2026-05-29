import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'

// GET /api/data/teaching-tasks — list teaching tasks (read-only)
export async function GET(request: NextRequest) {
  const auth = await requirePermission('data:read', request)
  if ('error' in auth) return auth.error

  try {
    const tasks = await prisma.teachingTask.findMany({
      select: {
        id: true,
        weekType: true,
        startWeek: true,
        endWeek: true,
        remark: true,
        course: {
          select: {
            id: true,
            name: true,
          },
        },
        teacher: {
          select: {
            id: true,
            name: true,
          },
        },
        taskClasses: {
          select: {
            classGroup: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: 100,
    })

    const tasksWithDetails = tasks.map((t) => ({
      id: t.id,
      courseName: t.course.name,
      teacherName: t.teacher?.name ?? null,
      classNames: t.taskClasses.map((tc) => tc.classGroup.name),
      weekType: t.weekType,
      startWeek: t.startWeek,
      endWeek: t.endWeek,
      remark: t.remark,
    }))

    return NextResponse.json({ success: true, tasks: tasksWithDetails, total: tasks.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
