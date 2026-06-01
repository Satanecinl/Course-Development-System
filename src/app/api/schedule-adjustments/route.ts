import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { resolveSchedulerSemester } from '@/lib/semester'
import { createScheduleAdjustment } from '@/lib/schedule/adjustments'
import type { ScheduleAdjustmentInput } from '@/types/schedule-adjustment'

// GET /api/schedule-adjustments?week=6&semesterId=1
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('schedule:view', request)
    if ('error' in auth) return auth.error
    const { searchParams } = new URL(request.url)
    const weekParam = searchParams.get('week')
    const week = weekParam ? parseInt(weekParam, 10) : null
    const semesterIdParam = searchParams.get('semesterId')

    // Resolve semester
    const semester = await resolveSchedulerSemester({
      semesterId: semesterIdParam ? parseInt(semesterIdParam, 10) : undefined,
    })

    const where: Record<string, unknown> = {
      status: 'ACTIVE',
      semesterId: semester.id,
    }
    if (week != null) {
      if (week < 1 || week > 20) {
        return NextResponse.json({ success: false, error: 'Week must be 1-20' }, { status: 400 })
      }
      where.OR = [{ week }, { targetWeek: week }]
    }

    const adjustments = await prisma.scheduleAdjustment.findMany({
      where,
      include: {
        originalSlot: {
          include: {
            teachingTask: { include: { course: true, teacher: true } },
          },
        },
        newRoom: true,
      },
      orderBy: [{ week: 'asc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({
      success: true,
      adjustments,
      semester: {
        id: semester.id,
        code: semester.code,
        name: semester.name,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[schedule-adjustments] GET error:', message)

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

// POST /api/schedule-adjustments
export async function POST(request: Request) {
  try {
    const auth = await requirePermission('schedule:adjust', request)
    if ('error' in auth) return auth.error
    const body = await request.json()

    if (body.confirmText !== 'CONFIRM_ADJUSTMENT') {
      return NextResponse.json(
        { success: false, error: 'Create requires confirmText = "CONFIRM_ADJUSTMENT"' },
        { status: 400 }
      )
    }

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

    const result = await createScheduleAdjustment(input)

    if (!result.success) {
      return NextResponse.json(
        { success: false, dryRun: result.dryRun },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      adjustment: result.adjustment,
      dryRun: result.dryRun,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[schedule-adjustments] POST error:', message)

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
