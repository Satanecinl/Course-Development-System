import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { guardSlotCreate } from '@/lib/schedule/slot-mutation-guard'

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('schedule:write', request)
    if ('error' in auth) return auth.error
    const body = await request.json()
    const { teachingTaskId, roomId, dayOfWeek, slotIndex } = body as {
      teachingTaskId?: number
      roomId?: number | null
      dayOfWeek?: number
      slotIndex?: number
    }

    if (!teachingTaskId || typeof teachingTaskId !== 'number') {
      return NextResponse.json({ error: '教学任务ID必填' }, { status: 400 })
    }
    if (typeof dayOfWeek !== 'number' || dayOfWeek < 1 || dayOfWeek > 7) {
      return NextResponse.json({ error: '星期无效 (1-7)' }, { status: 400 })
    }
    if (typeof slotIndex !== 'number' || slotIndex < 1 || slotIndex > 7) {
      return NextResponse.json({ error: '节次无效 (1-7)' }, { status: 400 })
    }

    // Server-side guard: conflict check + semesterId resolution
    const guardResult = await guardSlotCreate(
      teachingTaskId,
      dayOfWeek,
      slotIndex,
      roomId ?? null,
    )
    if (!guardResult.ok) {
      return NextResponse.json(
        { error: guardResult.error, conflicts: guardResult.conflicts, conflictDetails: guardResult.conflictDetails },
        { status: guardResult.status ?? 400 },
      )
    }

    const slot = await prisma.scheduleSlot.create({
      data: {
        teachingTaskId,
        roomId: roomId ?? null,
        dayOfWeek,
        slotIndex,
        // K25-C: semesterId is now NOT NULL; guardResult.semesterId
        // is always present when guardResult.ok is true.
        semesterId: guardResult.semesterId!,
      },
    })

    // Write change log
    await prisma.scheduleChangeLog.create({
      data: {
        taskId: teachingTaskId,
        oldDay: 0,
        oldSlotIndex: 0,
        oldRoomId: null,
        newDay: dayOfWeek,
        newSlotIndex: slotIndex,
        newRoomId: roomId ?? null,
        reason: 'Admin 新建排课',
      },
    })

    return NextResponse.json({ success: true, record: slot })
  } catch (error) {
    console.error('Schedule slot create error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
