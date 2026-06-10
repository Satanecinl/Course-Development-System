// src/app/api/schedule-adjustment-requests/[id]/cancel/route.ts
// K28-A: USER cancels their own PENDING adjustment request.

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { cancelAdjustmentRequest } from '@/lib/schedule/adjustment-request-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('adjustment-request:create', request)
  if ('error' in auth) return auth.error
  const user = auth.user

  try {
    const { id } = await params
    const requestId = Number(id)
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT', message: 'invalid request id' },
        { status: 400 },
      )
    }
    const result = await cancelAdjustmentRequest({
      requestId,
      submitter: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        roles: user.roles,
      },
    })
    if (!result.success) {
      const status = result.error === 'REQUEST_NOT_FOUND' ? 404
        : result.error === 'NOT_OWNER' ? 403
        : 400
      return NextResponse.json(
        { success: false, error: result.error, currentStatus: 'currentStatus' in result ? result.currentStatus : undefined },
        { status },
      )
    }
    return NextResponse.json({
      success: true,
      requestId: result.request!.id,
      status: result.request!.status,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: 'INTERNAL', message },
      { status: 500 },
    )
  }
}
