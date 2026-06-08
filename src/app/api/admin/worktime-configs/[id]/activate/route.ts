/**
 * src/app/api/admin/worktime-configs/[id]/activate/route.ts
 *
 * K26-G: WorkTime config activate/set-default API.
 *
 * POST - Set a config as default (activate)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { activateWorkTimeConfig } from '@/lib/worktime/worktime-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  try {
    const { id: idStr } = await params
    const id = Number(idStr)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json(
        { success: false, error: 'INVALID_REQUEST', message: 'Invalid id' },
        { status: 400 },
      )
    }

    const result = await activateWorkTimeConfig(id)
    if (!result.ok) {
      const status = result.error === 'WORKTIME_CONFIG_NOT_FOUND' ? 404 : 400
      return NextResponse.json(
        { success: false, error: result.error, message: result.message },
        { status },
      )
    }

    return NextResponse.json({ success: true, item: result.data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: 'INVALID_REQUEST', message },
      { status: 500 },
    )
  }
}
