// src/app/api/schedule-adjustment-requests/recommendations/route.ts
// K28-A2: USER-safe plan recommendation endpoint.
//
// POST /api/schedule-adjustment-requests/recommendations
//
// Reuses the existing K24 findAdjustmentPlanRecommendations helper
// without modification. This route only differs in:
//   - Permission: adjustment-request:create (USER, not schedule:adjust)
//   - No DB writes (read-only, same as the helper)
//   - Does NOT create ScheduleAdjustmentRequest (that's done by the submit endpoint)
//
// This endpoint is purely informational — it helps the USER pick a
// target position before they dry-run and submit a request.

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { findAdjustmentPlanRecommendations } from '@/lib/schedule/adjustment-plan-recommendations'
import {
  resolveWorkTimeConfigForSchedule,
  isWorkTimeDayAllowed as isWorkTimeDayAllowedHelper,
} from '@/lib/worktime/worktime-schedule-resolver'
import { resolveSchedulerSemester } from '@/lib/semester'

export async function POST(request: NextRequest) {
  const auth = await requirePermission('adjustment-request:create', request)
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

    // preferredDayOfWeek (optional)
    const semesterId = body.semesterId != null ? Number(body.semesterId) : null
    let preferredDayOfWeek: number | null | undefined
    if (body.preferredDayOfWeek == null) {
      preferredDayOfWeek = null
    } else {
      const n = Number(body.preferredDayOfWeek)
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return NextResponse.json(
          { ok: false, error: 'preferredDayOfWeek 必须是 null 或正整数' },
          { status: 400 },
        )
      }
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
            details: { dayOfWeek: n, allowWeekend: workTimeForDay.allowWeekend },
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

    // Append WorkTime metadata (same as admin route)
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
    console.error('[schedule-adjustment-requests/recommendations] error:', message)

    const knownErrors: Record<string, { code: string; status: number }> = {
      SEMESTER_NOT_FOUND: { code: 'SEMESTER_NOT_FOUND', status: 400 },
      NO_ACTIVE_SEMESTER: { code: 'NO_ACTIVE_SEMESTER', status: 400 },
      MULTIPLE_ACTIVE_SEMESTERS: { code: 'MULTIPLE_ACTIVE_SEMESTERS', status: 400 },
    }

    for (const [prefix, resp] of Object.entries(knownErrors)) {
      if (message.startsWith(prefix)) {
        return NextResponse.json({ ok: false, error: resp.code, message }, { status: resp.status })
      }
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
