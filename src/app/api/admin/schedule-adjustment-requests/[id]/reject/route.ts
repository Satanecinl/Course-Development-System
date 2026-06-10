// src/app/api/admin/schedule-adjustment-requests/[id]/reject/route.ts
// K28-A: ADMIN rejects a PENDING request. Requires a reviewNote.

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { rejectAdjustmentRequest } from '@/lib/schedule/adjustment-request-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('adjustment-request:review', request)
  if ('error' in auth) return auth.error
  const user = auth.user

  try {
    const { id } = await params
    const requestId = Number(id)
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT' },
        { status: 400 },
      )
    }
    const body = await request.json()
    const reviewNote: string = body?.reviewNote
    if (typeof reviewNote !== 'string' || reviewNote.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'REVIEW_NOTE_REQUIRED', message: 'reviewNote is required' },
        { status: 400 },
      )
    }
    const result = await rejectAdjustmentRequest({
      requestId,
      reviewer: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        roles: user.roles,
      },
      reviewNote,
    })
    if (!result.success) {
      const status = result.error === 'REQUEST_NOT_FOUND' ? 404 : 400
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
