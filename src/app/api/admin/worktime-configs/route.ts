/**
 * src/app/api/admin/worktime-configs/route.ts
 *
 * K26-G: WorkTime config list/create API.
 *
 * GET  - List worktime configs (with optional filters)
 * POST - Create a new worktime config
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { listWorkTimeConfigs, createWorkTimeConfig } from '@/lib/worktime/worktime-service'
import { validateCreateWorkTimeConfig } from '@/lib/worktime/worktime-validation'

export async function GET(request: NextRequest) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const semesterId = searchParams.get('semesterId')
    const includeSlots = searchParams.get('includeSlots') === 'true'
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const result = await listWorkTimeConfigs({
      semesterId: semesterId ? Number(semesterId) : undefined,
      includeSlots,
      includeInactive,
    })

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error, message: result.message },
        { status: 400 },
      )
    }

    return NextResponse.json({
      success: true,
      items: result.data.items,
      semesterId: result.data.semesterId,
      count: result.data.count,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: 'INVALID_REQUEST', message },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()

    // Validate input
    const validation = validateCreateWorkTimeConfig(body)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error, message: validation.message },
        { status: 400 },
      )
    }

    const result = await createWorkTimeConfig(body)

    if (!result.ok) {
      const status =
        result.error === 'SEMESTER_NOT_FOUND' ? 404 :
        result.error === 'WORKTIME_CONFIG_NAME_EXISTS' ? 409 :
        400
      return NextResponse.json(
        { success: false, error: result.error, message: result.message },
        { status },
      )
    }

    return NextResponse.json({ success: true, item: result.data }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: 'INVALID_REQUEST', message },
      { status: 500 },
    )
  }
}
