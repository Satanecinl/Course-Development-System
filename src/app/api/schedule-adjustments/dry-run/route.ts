import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { dryRunScheduleAdjustment } from '@/lib/schedule/adjustments'
import type { ScheduleAdjustmentInput } from '@/types/schedule-adjustment'

// POST /api/schedule-adjustments/dry-run
export async function POST(request: Request) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()

    const input: ScheduleAdjustmentInput = {
      type: body.type,
      week: body.week,
      targetWeek: body.targetWeek ?? null,
      originalSlotId: body.originalSlotId,
      newDayOfWeek: body.newDayOfWeek ?? null,
      newSlotIndex: body.newSlotIndex ?? null,
      newRoomId: body.newRoomId ?? null,
      reason: body.reason ?? null,
      semesterId: body.semesterId ?? null,
    }

    const dryRun = await dryRunScheduleAdjustment(input)

    return NextResponse.json({ success: true, dryRun })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[schedule-adjustments/dry-run] error:', message)

    const knownErrors: Record<string, { code: string; status: number }> = {
      SEMESTER_NOT_FOUND: { code: 'SEMESTER_NOT_FOUND', status: 400 },
      NO_ACTIVE_SEMESTER: { code: 'NO_ACTIVE_SEMESTER', status: 400 },
      MULTIPLE_ACTIVE_SEMESTERS: { code: 'MULTIPLE_ACTIVE_SEMESTERS', status: 400 },
    }

    for (const [prefix, resp] of Object.entries(knownErrors)) {
      if (message.startsWith(prefix)) {
        return NextResponse.json(
          { success: false, error: resp.code, message },
          { status: resp.status },
        )
      }
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
