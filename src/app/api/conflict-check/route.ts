import { NextRequest, NextResponse } from 'next/server'
import { checkScheduleConflict } from '@/lib/conflict-check'
import { requirePermission } from '@/lib/auth/require-permission'
import { resolveSchedulerSemester } from '@/lib/semester'

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
      semesterId: requestSemesterId,
    } = body as {
      scheduleSlotId: number
      targetDayOfWeek: number
      targetSlotIndex: number
      targetRoomId: number
      semesterId?: number
    }

    if (!scheduleSlotId || !targetDayOfWeek || !targetSlotIndex || !targetRoomId) {
      return NextResponse.json(
        { error: 'Missing required fields: scheduleSlotId, targetDayOfWeek, targetSlotIndex, targetRoomId' },
        { status: 400 }
      )
    }

    // Resolve semester (explicit or active)
    const semester = await resolveSchedulerSemester({
      semesterId: typeof requestSemesterId === 'number' ? requestSemesterId : undefined,
    })

    const result = await checkScheduleConflict({
      scheduleSlotId,
      targetDayOfWeek,
      targetSlotIndex,
      targetRoomId,
      semesterId: semester.id,
    })

    return NextResponse.json(result)

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Conflict check error:', message)

    const knownErrors: Record<string, { code: string; status: number }> = {
      SEMESTER_NOT_FOUND: { code: 'SEMESTER_NOT_FOUND', status: 400 },
      NO_ACTIVE_SEMESTER: { code: 'NO_ACTIVE_SEMESTER', status: 400 },
      MULTIPLE_ACTIVE_SEMESTERS: { code: 'MULTIPLE_ACTIVE_SEMESTERS', status: 400 },
    }

    for (const [prefix, resp] of Object.entries(knownErrors)) {
      if (message.startsWith(prefix)) {
        return NextResponse.json(
          { error: resp.code, message },
          { status: resp.status },
        )
      }
    }

    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    )
  }
}
