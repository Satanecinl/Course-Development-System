/**
 * src/app/api/schedule-adjustments/room-recommendations/route.ts
 *
 * K23-A: Adjustment-time automatic room recommendation API.
 *
 *   POST /api/schedule-adjustments/room-recommendations
 *
 * Request body:
 *   {
 *     scheduleSlotId: number          // required
 *     targetWeek: number              // required
 *     targetDayOfWeek: number         // 1-7, required
 *     targetSlotIndex: number         // 1-6, required
 *     limit?: number                  // default 5
 *     semesterId?: number             // optional override
 *   }
 *
 * Returns: RoomRecommendationResult (see room-recommendations.ts).
 *
 * Auth: requirePermission('schedule:adjust').
 * DB: read-only. No writes to ScheduleSlot, Room, TeachingTask,
 *     ScheduleAdjustment, etc.
 *
 * The dry-run / conflict-check rules are reused by the underlying
 * helper, so recommendations are guaranteed to be a subset of
 * "the room would also pass dryRunScheduleAdjustment".
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { findAdjustmentRoomRecommendations } from '@/lib/schedule/room-recommendations'

// POST /api/schedule-adjustments/room-recommendations
export async function POST(request: NextRequest) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()

    // Input validation (mirrors validateScheduleAdjustmentInput bounds)
    const scheduleSlotId = Number(body.scheduleSlotId)
    if (!Number.isFinite(scheduleSlotId) || scheduleSlotId <= 0) {
      return NextResponse.json(
        { success: false, error: 'scheduleSlotId 必须是正整数' },
        { status: 400 },
      )
    }

    const targetWeek = Number(body.targetWeek)
    if (!Number.isFinite(targetWeek) || targetWeek < 1 || targetWeek > 20) {
      return NextResponse.json(
        { success: false, error: 'targetWeek 必须在 1-20 之间' },
        { status: 400 },
      )
    }

    const targetDayOfWeek = Number(body.targetDayOfWeek)
    if (!Number.isFinite(targetDayOfWeek) || targetDayOfWeek < 1 || targetDayOfWeek > 7) {
      return NextResponse.json(
        { success: false, error: 'targetDayOfWeek 必须在 1-7 之间' },
        { status: 400 },
      )
    }

    const targetSlotIndex = Number(body.targetSlotIndex)
    if (!Number.isFinite(targetSlotIndex) || targetSlotIndex < 1 || targetSlotIndex > 6) {
      return NextResponse.json(
        { success: false, error: 'targetSlotIndex 必须在 1-6 之间' },
        { status: 400 },
      )
    }

    let limit: number | undefined
    if (body.limit != null) {
      const n = Number(body.limit)
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json(
          { success: false, error: 'limit 必须是正整数' },
          { status: 400 },
        )
      }
      // Hard cap to keep the response bounded.
      limit = Math.min(n, 20)
    }

    const semesterId = body.semesterId != null ? Number(body.semesterId) : null

    const result = await findAdjustmentRoomRecommendations({
      scheduleSlotId,
      targetWeek,
      targetDayOfWeek,
      targetSlotIndex,
      limit,
      semesterId,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[schedule-adjustments/room-recommendations] error:', message)

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
