// src/app/api/schedule-adjustment-requests/route.ts
// K28-A: USER submits a PENDING adjustment request.
// Does NOT create an ACTIVE ScheduleAdjustment. Does NOT mutate ScheduleSlot.

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { submitAdjustmentRequest } from '@/lib/schedule/adjustment-request-service'

export async function POST(request: NextRequest) {
  const auth = await requirePermission('adjustment-request:create', request)
  if ('error' in auth) return auth.error
  const user = auth.user

  try {
    const body = await request.json()
    const { sourceScheduleSlotId, sourceWeek, targetWeek, targetDayOfWeek, targetSlotIndex, targetRoomId, reason, semesterId } = body ?? {}

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

    const result = await submitAdjustmentRequest({
      sourceScheduleSlotId,
      // K32-A2: 可选 sourceWeek（dashboard 当前查看周次）；缺失时 service 内部 fallback 到 null
      sourceWeek: typeof sourceWeek === 'number' ? sourceWeek : null,
      targetWeek,
      targetDayOfWeek,
      targetSlotIndex,
      targetRoomId: targetRoomId ?? null,
      reason: reason ?? null,
      semesterId: semesterId ?? null,
      submitter: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        roles: user.roles,
      },
    })

    if (!result.success) {
      if (result.error === 'DRY_RUN_FAILED') {
        return NextResponse.json(
          { success: false, error: 'DRY_RUN_FAILED', dryRun: result.dryRun, message: 'dry-run failed' },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { success: false, error: result.error, message: result.error },
        { status: result.error === 'SOURCE_SLOT_NOT_FOUND' ? 404 : 400 },
      )
    }

    return NextResponse.json(
      {
        success: true,
        request: {
          requestId: result.request!.id,
          status: result.request!.status,
          submittedBy: { id: user.id, displayName: user.displayName },
        },
      },
      { status: 201 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: 'INTERNAL', message },
      { status: 500 },
    )
  }
}
