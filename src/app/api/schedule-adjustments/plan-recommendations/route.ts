/**
 * src/app/api/schedule-adjustments/plan-recommendations/route.ts
 *
 * K24-A: Joint time + room recommendation API.
 *
 *   POST /api/schedule-adjustments/plan-recommendations
 *
 * Request body:
 *   {
 *     scheduleSlotId: number          // required
 *     preferredWeek?: number          // 1-20
 *     weekWindow?: number             // 0-4, default 1
 *     includeWeekend?: boolean        // default false
 *     limit?: number                  // 1-20, default 5
 *     semesterId?: number             // optional override
 *   }
 *
 * Returns: AdjustmentPlanRecommendationResult
 *   { minimumSatisfied, plans[], rejectedSummary, searched, message? }
 *
 * Auth: requirePermission('schedule:adjust').
 * DB: read-only.
 *
 * Backed by src/lib/schedule/adjustment-plan-recommendations.ts which
 * delegates the room layer to K23-A findAdjustmentRoomRecommendations.
 * K23-A and K22 invariants are preserved because we do not modify the
 * K23-A helper, the conflict kernel, score.ts, or the schema.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { findAdjustmentPlanRecommendations } from '@/lib/schedule/adjustment-plan-recommendations'
import {
  resolveWorkTimeConfigForSchedule,
  isWorkTimeDayAllowed as isWorkTimeDayAllowedHelper,
} from '@/lib/worktime/worktime-schedule-resolver'
import { resolveSchedulerSemester } from '@/lib/semester'

// POST /api/schedule-adjustments/plan-recommendations
export async function POST(request: NextRequest) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()

    // scheduleSlotId
    const scheduleSlotId = Number(body.scheduleSlotId)
    if (!Number.isFinite(scheduleSlotId) || scheduleSlotId <= 0) {
      return NextResponse.json(
        { ok: false, error: 'scheduleSlotId 必须是正整数' },
        { status: 400 },
      )
    }

    // preferredWeek (optional, default from slot)
    let preferredWeek: number | undefined
    if (body.preferredWeek != null) {
      const n = Number(body.preferredWeek)
      if (!Number.isFinite(n) || n < 1 || n > 20) {
        return NextResponse.json(
          { ok: false, error: 'preferredWeek 必须在 1-20 之间' },
          { status: 400 },
        )
      }
      preferredWeek = n
    }

    // weekWindow (optional, default 1, range 0-4)
    let weekWindow: number | undefined
    if (body.weekWindow != null) {
      const n = Number(body.weekWindow)
      if (!Number.isFinite(n) || n < 0 || n > 4) {
        return NextResponse.json(
          { ok: false, error: 'weekWindow 必须在 0-4 之间' },
          { status: 400 },
        )
      }
      weekWindow = n
    }

    // includeWeekend (optional, default false)
    const includeWeekend = body.includeWeekend === true

    // limit (optional, default 5, max 20)
    let limit: number | undefined
    if (body.limit != null) {
      const n = Number(body.limit)
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json(
          { ok: false, error: 'limit 必须是正整数' },
          { status: 400 },
        )
      }
      limit = Math.min(n, 20)
    }

    // K24-A5: preferredDayOfWeek (optional). null/undefined = auto.
    // K26-I1: Validate against resolved WorkTime allowed days.
    // Default WorkTime has allowWeekend=false → preferredDayOfWeek must be 1-5.
    // When allowWeekend=true, 6/7 are also accepted.
    const semesterId = body.semesterId != null ? Number(body.semesterId) : null
    let preferredDayOfWeek: number | null | undefined
    if (body.preferredDayOfWeek == null) {
      preferredDayOfWeek = null
    } else {
      const n = Number(body.preferredDayOfWeek)
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return NextResponse.json(
          {
            ok: false,
            error: 'preferredDayOfWeek 必须是 null 或正整数',
          },
          { status: 400 },
        )
      }
      // Resolve WorkTime to validate preferred day.
      const resolvedSemesterForDay = await resolveSchedulerSemester({ semesterId: semesterId ?? undefined })
      const workTimeForDay = await resolveWorkTimeConfigForSchedule(resolvedSemesterForDay.id)
      const isWorkTimeDayAllowed = n >= 1 && n <= 7 && isWorkTimeDayAllowedHelper(workTimeForDay, n)
      if (!isWorkTimeDayAllowed) {
        return NextResponse.json(
          {
            ok: false,
            error: workTimeForDay.allowWeekend ? 'preferredDayOfWeek 必须是 1-7 之间的整数' : 'WORKTIME_WEEKEND_DISABLED',
            message: workTimeForDay.allowWeekend
              ? `preferredDayOfWeek 必须是 1-7 之间的整数，当前值: ${n}`
              : `当前作息配置不允许推荐到周末，preferredDayOfWeek=${n}`,
            details: {
              dayOfWeek: n,
              allowWeekend: workTimeForDay.allowWeekend,
            },
          },
          { status: 400 },
        )
      }
      preferredDayOfWeek = n
    }

    const result = await findAdjustmentPlanRecommendations({
      scheduleSlotId,
      preferredWeek,
      weekWindow,
      includeWeekend,
      limit,
      semesterId,
      preferredDayOfWeek,
    })

    // K26-I1: additive WorkTime metadata for the response.
    // Resolve the actual semesterId used by the helper (may have been auto-resolved).
    const resolvedSemester = await resolveSchedulerSemester({ semesterId: semesterId ?? undefined })
    const workTime = await resolveWorkTimeConfigForSchedule(resolvedSemester.id)

    return NextResponse.json({
      ok: true,
      ...result,
      workTimeSource: workTime.source,
      allowWeekend: workTime.allowWeekend,
      allowedSlotIndexes: workTime.activeTeachingSlotIndexes,
      excludedLegacySlotIndexes: workTime.legacyDisplaySlotIndexes,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[schedule-adjustments/plan-recommendations] error:', message)

    const knownErrors: Record<string, { code: string; status: number }> = {
      SEMESTER_NOT_FOUND: { code: 'SEMESTER_NOT_FOUND', status: 400 },
      NO_ACTIVE_SEMESTER: { code: 'NO_ACTIVE_SEMESTER', status: 400 },
      MULTIPLE_ACTIVE_SEMESTERS: { code: 'MULTIPLE_ACTIVE_SEMESTERS', status: 400 },
    }

    for (const [prefix, resp] of Object.entries(knownErrors)) {
      if (message.startsWith(prefix)) {
        return NextResponse.json(
          { ok: false, error: resp.code, message },
          { status: resp.status },
        )
      }
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
