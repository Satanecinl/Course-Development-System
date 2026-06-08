import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { resolveRequestSemester, toSemesterErrorResponse } from '@/lib/schedule/semester-scope'

// GET /api/data/teaching-tasks — list teaching tasks (read-only)
//
// K25-D: Semester-scoped list. Accepts semesterId from query / X-Semester-Id header /
// body, with transitional active-semester fallback. ClassGroup same-semester
// consistency is also verified (defense-in-depth even though K25-C made
// ClassGroup.semesterId NOT NULL and DB-level consistency is already enforced).
export async function GET(request: NextRequest) {
  const auth = await requirePermission('data:read', request)
  if ('error' in auth) return auth.error

  try {
    const semester = await resolveRequestSemester({
      searchParams: request.nextUrl.searchParams,
      headers: request.headers,
    })

    const tasks = await prisma.teachingTask.findMany({
      where: { semesterId: semester.id },
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
                semesterId: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: 100,
    })

    // K25-D: defense-in-depth — verify every classGroup is in the same semester.
    // Prisma will normally return them via the include, but we filter here
    // rather than dropping them at the DB layer because we want to surface
    // any consistency drift (e.g., a classGroup reassigned to a different
    // semester post-creation).
    const tasksWithDetails = tasks.map((t) => {
      const sameSemesterClasses = t.taskClasses.filter(
        (tc) => tc.classGroup.semesterId === semester.id,
      )
      return {
        id: t.id,
        courseName: t.course.name,
        teacherName: t.teacher?.name ?? null,
        classNames: sameSemesterClasses.map((tc) => tc.classGroup.name),
        weekType: t.weekType,
        startWeek: t.startWeek,
        endWeek: t.endWeek,
        remark: t.remark,
      }
    })

    return NextResponse.json({
      success: true,
      tasks: tasksWithDetails,
      total: tasksWithDetails.length,
      semesterId: semester.id,
      semesterSource: semester.source,
    })
  } catch (error) {
    const errResponse = toSemesterErrorResponse(error)
    if (errResponse) {
      return NextResponse.json(errResponse.response, { status: errResponse.status })
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
