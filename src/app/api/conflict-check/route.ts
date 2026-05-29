import { NextRequest, NextResponse } from 'next/server'
import { checkScheduleConflict } from '@/lib/conflict-check'
import { requirePermission } from '@/lib/auth/require-permission'

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('schedule:view', request)
    if ('error' in auth) return auth.error
    const body = await request.json()
    const {
      scheduleSlotId,
      targetDayOfWeek,
      targetSlotIndex,
      targetRoomId,
    } = body as {
      scheduleSlotId: number
      targetDayOfWeek: number
      targetSlotIndex: number
      targetRoomId: number
    }

    if (!scheduleSlotId || !targetDayOfWeek || !targetSlotIndex || !targetRoomId) {
      return NextResponse.json(
        { error: 'Missing required fields: scheduleSlotId, targetDayOfWeek, targetSlotIndex, targetRoomId' },
        { status: 400 }
      )
    }

    const result = await checkScheduleConflict({
      scheduleSlotId,
      targetDayOfWeek,
      targetSlotIndex,
      targetRoomId,
    })

    return NextResponse.json(result)

  } catch (error) {
    console.error('Conflict check error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
