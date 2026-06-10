// src/app/api/admin/schedule-adjustment-requests/[id]/approve/route.ts
// K28-A: ADMIN approves a PENDING request. Re-runs dry-run, then creates
// the ACTIVE ScheduleAdjustment inside a transaction. The official schedule
// is only mutated AFTER dry-run passes at approval time.

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { approveAdjustmentRequest } from '@/lib/schedule/adjustment-request-service'

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
    let body: { reviewNote?: string } = {}
    try {
      body = await request.json()
    } catch {
      // empty body is fine
    }
    const result = await approveAdjustmentRequest({
      requestId,
      reviewer: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        roles: user.roles,
      },
      reviewNote: body.reviewNote ?? null,
    })
    if (!result.success) {
      if (result.error === 'DRY_RUN_FAILED_AT_APPROVAL') {
        return NextResponse.json(
          { success: false, error: 'DRY_RUN_FAILED_AT_APPROVAL', dryRun: result.dryRun, message: 'dry-run failed at approval time' },
          { status: 409 },
        )
      }
      const status = result.error === 'REQUEST_NOT_FOUND' ? 404 : 400
      return NextResponse.json(
        { success: false, error: result.error, currentStatus: 'currentStatus' in result ? result.currentStatus : undefined },
        { status },
      )
    }
    // After !result.success guard, result.success is true (TypeScript narrowing
    // does not infer literal boolean from the union, so cast explicitly)
    const okResult = result as { success: true; adjustment: { id: number }; request: { id: number } }
    return NextResponse.json({
      success: true,
      requestId: okResult.request.id,
      adjustmentId: okResult.adjustment.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: 'INTERNAL', message },
      { status: 500 },
    )
  }
}
