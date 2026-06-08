import { NextRequest, NextResponse } from 'next/server'
import { checkScheduleConflicts } from '@/lib/schedule/conflict-check'
import { requirePermission } from '@/lib/auth/require-permission'
import { resolveRequestSemester, toSemesterErrorResponse } from '@/lib/schedule/semester-scope'

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

    // Resolve semester (explicit query / header / body, or active fallback)
    const semester = await resolveRequestSemester({
      searchParams: request.nextUrl.searchParams,
      headers: request.headers,
      body: body as Record<string, unknown>,
    })

    const result = await checkScheduleConflicts({
      scheduleSlotId,
      targetDayOfWeek,
      targetSlotIndex,
      targetRoomId,
      semesterId: semester.id,
    })

    return NextResponse.json(result)

  } catch (error) {
    const errResponse = toSemesterErrorResponse(error)
    if (errResponse) {
      return NextResponse.json(errResponse.response, { status: errResponse.status })
    }
    const message = error instanceof Error ? error.message : String(error)
    console.error('Conflict check error:', message)

    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    )
  }
}
