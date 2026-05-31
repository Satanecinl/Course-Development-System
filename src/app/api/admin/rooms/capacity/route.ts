import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { getRoomCapacityRows } from '@/lib/rooms/capacity'

// ── GET /api/admin/rooms/capacity ──

export async function GET(request: NextRequest) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') ?? undefined
    const onlyRisk = searchParams.get('onlyRisk') === 'true'

    const items = await getRoomCapacityRows({ q, onlyRisk })

    return NextResponse.json({ success: true, data: { items } })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { success: false, error: 'FETCH_FAILED', message },
      { status: 500 },
    )
  }
}
