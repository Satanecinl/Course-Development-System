import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveRequestSemester, toSemesterErrorResponse } from '@/lib/schedule/semester-scope'
import { getEffectiveScheduleForWeek } from '@/lib/schedule/adjustments'
import { requirePermission } from '@/lib/auth/require-permission'

// GET /api/schedule — main schedule grid (read-only)
//
// K25-D: Semester-scoped list. Accepts semesterId from query / X-Semester-Id header /
// body, with transitional active-semester fallback. This is the route used by
// the dashboard's schedule grid.
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

    // K25-D: unified resolver — query / header / body / active fallback
    const semester = await resolveRequestSemester({
      searchParams: request.nextUrl.searchParams,
      headers: request.headers,
    })

    // If week + applyAdjustments, use effective schedule
    if (week != null && applyAdjustments) {
      const effectiveItems = await getEffectiveScheduleForWeek(week, semester.id)
      return NextResponse.json({
        items: effectiveItems,
        semesterId: semester.id,
        semesterSource: semester.source,
      })
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
          return NextResponse.json({
            items: [],
            semesterId: semester.id,
            semesterSource: semester.source,
          })
        }
        where.teachingTaskId = { in: taskIds }
      } else if (viewType === 'teacher') {
        where.teachingTask = { teacherId: targetId }
      } else if (viewType === 'room') {
        // K34-A3E: match on primary OR secondary (additionalRooms) room.
        // Prisma where.roomId is exact-match primary-only; union with
        // additionalRooms.some({ roomId: targetId }) so secondary-room
        // courses (e.g. 10-104, 11-105) appear in the dashboard filter.
        where.OR = [
          { roomId: targetId },
          { additionalRooms: { some: { roomId: targetId } } },
        ]
      }
    }

    const slots = await prisma.scheduleSlot.findMany({
      where,
      include: {
        room: true,
        // K34-A3: include additional rooms for composite expressions.
        additionalRooms: {
          include: { room: true },
          orderBy: { id: 'asc' },
        },
        teachingTask: {
          select: {
            semesterId: true,
            course: true,
            teacher: true,
            weekType: true,
            startWeek: true,
            endWeek: true,
            remark: true,
            teacherId: true,
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

    // K25-D: defense-in-depth — drop any rows where the joined teachingTask is
    // not in the resolved semester. (K25-C NOT NULL + validate script already
    // guarantees 0 mismatches at rest, but this filter catches any drift.)
    const sameSemesterSlots = slots.filter(
      (slot) => slot.teachingTask.semesterId === semester.id,
    )

    const viewData = sameSemesterSlots.map((slot) => ({
      slotId: slot.id,
      taskId: slot.teachingTaskId,
      roomId: slot.roomId,
      courseName: slot.teachingTask.course.name,
      teacherName: slot.teachingTask.teacher?.name ?? null,
      teacherId: slot.teachingTask.teacherId ?? null,
      roomName: slot.room?.name
        ? slot.additionalRooms.length > 0
          ? slot.room.name + ' 或 ' + slot.additionalRooms.map((ar) => ar.room.name).join(' 或 ')
          : slot.room.name
        : null,
      roomBuilding: slot.room?.building ?? null,
      // K34-A3B: expose secondary room IDs so the dashboard room filter
      // can match on both primary and secondary rooms.
      additionalRoomIds: slot.additionalRooms.map((ar) => ar.roomId),
      classNames: slot.teachingTask.taskClasses.map((tc) => tc.classGroup.name),
      classGroupIds: slot.teachingTask.taskClasses.map((tc) => tc.classGroup.id),
      dayOfWeek: slot.dayOfWeek,
      slotIndex: slot.slotIndex,
      weekType: slot.teachingTask.weekType,
      startWeek: slot.teachingTask.startWeek,
      endWeek: slot.teachingTask.endWeek,
      remark: slot.teachingTask.remark,
    }))

    return NextResponse.json({
      items: viewData,
      semesterId: semester.id,
      semesterSource: semester.source,
    })
  } catch (error) {
    console.error('Schedule fetch error:', error)
    const errResponse = toSemesterErrorResponse(error)
    if (errResponse) {
      return NextResponse.json(errResponse.response, { status: errResponse.status })
    }
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 },
    )
  }
}
