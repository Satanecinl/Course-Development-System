import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSchedulerPreview } from '@/lib/scheduler/preview'
import { prisma } from '@/lib/prisma'

interface PreviewRequest {
  maxIterations?: number
  lahcWindowSize?: number
  randomSeed?: number
  lockedSlotIds?: number[]
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const body: PreviewRequest = await request.json().catch(() => ({}))

    const maxIterations = typeof body.maxIterations === 'number'
      ? Math.min(Math.max(body.maxIterations, 100), 15000)
      : 10000

    const lahcWindowSize = typeof body.lahcWindowSize === 'number'
      ? Math.min(Math.max(body.lahcWindowSize, 50), 2000)
      : 500

    const randomSeed = typeof body.randomSeed === 'number' ? body.randomSeed : null

    // Validate lockedSlotIds
    let lockedSlotIds: number[] = []
    if (body.lockedSlotIds !== undefined) {
      if (!Array.isArray(body.lockedSlotIds)) {
        return NextResponse.json(
          { success: false, error: 'INVALID_LOCKED_SLOT_IDS', message: 'lockedSlotIds must be an array' },
          { status: 400 },
        )
      }

      // Validate each ID is a positive integer
      for (const id of body.lockedSlotIds) {
        if (!Number.isInteger(id) || id <= 0) {
          return NextResponse.json(
            { success: false, error: 'INVALID_LOCKED_SLOT_ID', message: `Invalid locked slot ID: ${id}` },
            { status: 400 },
          )
        }
      }

      // Deduplicate
      lockedSlotIds = [...new Set(body.lockedSlotIds)]

      // Check max limit
      if (lockedSlotIds.length > 1000) {
        return NextResponse.json(
          { success: false, error: 'TOO_MANY_LOCKED_SLOTS', message: 'Maximum 1000 locked slots allowed' },
          { status: 400 },
        )
      }

      // Verify all slot IDs exist in database
      if (lockedSlotIds.length > 0) {
        const existingSlots = await prisma.scheduleSlot.findMany({
          where: { id: { in: lockedSlotIds } },
          select: { id: true },
        })
        const existingIds = new Set(existingSlots.map(s => s.id))
        const invalidIds = lockedSlotIds.filter(id => !existingIds.has(id))

        if (invalidIds.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: 'INVALID_SLOT_IDS',
              message: `The following slot IDs do not exist: ${invalidIds.join(', ')}`,
              invalidIds,
            },
            { status: 400 },
          )
        }
      }
    }

    const result = await createSchedulerPreview({
      maxIterations,
      lahcWindowSize,
      randomSeed,
      lockedSlotIds,
      operatorId: auth.user.id,
      operatorName: auth.user.displayName,
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[scheduler/preview] error:', message)
    return NextResponse.json(
      { success: false, error: 'PREVIEW_FAILED', message },
      { status: 500 },
    )
  }
}
