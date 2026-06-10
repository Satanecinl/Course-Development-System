// src/app/api/schedule-adjustment-requests/dry-run/route.ts
// K28-A: USER dry-run a proposed adjustment BEFORE submitting.
// Does NOT mutate any DB row. Just runs the existing dry-run.

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { resolveSchedulerSemester } from '@/lib/semester'
import { dryRunScheduleAdjustment } from '@/lib/schedule/adjustments'
import type { ScheduleAdjustmentInput } from '@/types/schedule-adjustment'

export async function POST(request: NextRequest) {
  const auth = await requirePermission('adjustment-request:create', request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const { sourceScheduleSlotId, targetWeek, targetDayOfWeek, targetSlotIndex, targetRoomId, reason } = body ?? {}

    if (
      typeof sourceScheduleSlotId !== 'number' ||
      typeof targetWeek !== 'number' ||
      typeof targetDayOfWeek !== 'number' ||
      typeof targetSlotIndex !== 'number'
    ) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT', message: 'sourceScheduleSlotId / targetWeek / targetDayOfWeek / targetSlotIndex are required' },
        { status: 400 },
      )
    }

    const semester = await resolveSchedulerSemester({})
    const dryRunInput: ScheduleAdjustmentInput = {
      type: 'MOVE',
      week: targetWeek,
      originalSlotId: sourceScheduleSlotId,
      newDayOfWeek: targetDayOfWeek,
      newSlotIndex: targetSlotIndex,
      newRoomId: targetRoomId ?? null,
      reason: reason ?? null,
      semesterId: semester.id,
    }
    const dryRun = await dryRunScheduleAdjustment(dryRunInput)

    return NextResponse.json({
      success: true,
      dryRun: {
        canSubmit: dryRun.canApply,
        conflicts: dryRun.conflicts,
        warnings: dryRun.warnings,
        canApply: dryRun.canApply,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: 'INTERNAL', message },
      { status: 500 },
    )
  }
}
