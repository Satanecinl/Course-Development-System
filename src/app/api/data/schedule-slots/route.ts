import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { resolveRequestSemester, toSemesterErrorResponse } from '@/lib/schedule/semester-scope'

// GET /api/data/schedule-slots — list schedule slots (read-only)
//
// K25-D: Semester-scoped list. Accepts semesterId from query / X-Semester-Id header /
// body, with transitional active-semester fallback.
export async function GET(request: NextRequest) {
  const auth = await requirePermission('data:read', request)
  if ('error' in auth) return auth.error

  try {
    const semester = await resolveRequestSemester({
      searchParams: request.nextUrl.searchParams,
      headers: request.headers,
    })

    const slots = await prisma.scheduleSlot.findMany({
      where: { semesterId: semester.id },
      select: {
        id: true,
        dayOfWeek: true,
        slotIndex: true,
        room: {
          select: {
            id: true,
            name: true,
            building: true,
          },
        },
        teachingTask: {
          select: {
            id: true,
            semesterId: true,
            course: {
              select: { name: true },
            },
            teacher: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { slotIndex: 'asc' }],
      take: 100,
    })

    // K25-D: defense-in-depth — verify the joined teachingTask also belongs to
    // the same semester. (K25-C made TeachingTask.semesterId NOT NULL and the
    // validate script already verifies 0 mismatches, but this filter catches
    // any drift in case of direct SQL or future schema changes.)
    const sameSemesterSlots = slots.filter(
      (s) => s.teachingTask.semesterId === semester.id,
    )

    const slotsWithDetails = sameSemesterSlots.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      slotIndex: s.slotIndex,
      roomName: s.room?.name ?? null,
      roomBuilding: s.room?.building ?? null,
      courseName: s.teachingTask.course.name,
      teacherName: s.teachingTask.teacher?.name ?? null,
    }))

    return NextResponse.json({
      success: true,
      slots: slotsWithDetails,
      total: slotsWithDetails.length,
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
