import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'

// GET /api/data/schedule-slots — list schedule slots (read-only)
export async function GET(request: NextRequest) {
  const auth = await requirePermission('data:read', request)
  if ('error' in auth) return auth.error

  try {
    const slots = await prisma.scheduleSlot.findMany({
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

    const slotsWithDetails = slots.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      slotIndex: s.slotIndex,
      roomName: s.room?.name ?? null,
      roomBuilding: s.room?.building ?? null,
      courseName: s.teachingTask.course.name,
      teacherName: s.teachingTask.teacher?.name ?? null,
    }))

    return NextResponse.json({ success: true, slots: slotsWithDetails, total: slots.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
