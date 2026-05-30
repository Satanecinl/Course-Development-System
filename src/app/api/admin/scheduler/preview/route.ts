import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSchedulerPreview } from '@/lib/scheduler/preview'

interface PreviewRequest {
  maxIterations?: number
  lahcWindowSize?: number
  randomSeed?: number
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

    const result = await createSchedulerPreview({
      maxIterations,
      lahcWindowSize,
      randomSeed,
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
