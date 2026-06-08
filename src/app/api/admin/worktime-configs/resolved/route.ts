/**
 * src/app/api/admin/worktime-configs/resolved/route.ts
 *
 * K26-G: WorkTime resolved config API.
 *
 * GET - Get resolved worktime config (with static fallback)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { resolveWorkTimeConfig } from '@/lib/worktime/worktime-service'

export async function GET(request: NextRequest) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const semesterId = searchParams.get('semesterId')

    const result = await resolveWorkTimeConfig(
      semesterId ? Number(semesterId) : undefined,
    )

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error, message: result.message },
        { status: 400 },
      )
    }

    return NextResponse.json({
      success: true,
      semesterId: result.data.semesterId,
      source: result.data.source,
      config: result.data.config,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: 'INVALID_REQUEST', message },
      { status: 500 },
    )
  }
}
