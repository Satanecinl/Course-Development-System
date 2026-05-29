import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { createScheduleAdjustment } from '@/lib/schedule/adjustments'
import type { ScheduleAdjustmentInput } from '@/types/schedule-adjustment'

// GET /api/schedule-adjustments?week=6
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('schedule:view', request)
    if ('error' in auth) return auth.error
    const { searchParams } = new URL(request.url)
    const weekParam = searchParams.get('week')
    const week = weekParam ? parseInt(weekParam, 10) : null

    const where: Record<string, unknown> = { status: 'ACTIVE' }
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

    return NextResponse.json({ success: true, adjustments })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
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
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
