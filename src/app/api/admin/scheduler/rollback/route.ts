import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { rollbackSchedulerApply } from '@/lib/scheduler/rollback'

interface RollbackRequest {
  applyRunId: number
  confirmRollback?: boolean
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const body: RollbackRequest = await request.json().catch(() => ({ applyRunId: NaN }))

    const applyRunId = typeof body.applyRunId === 'number' ? body.applyRunId : NaN
    if (Number.isNaN(applyRunId) || applyRunId <= 0) {
      return NextResponse.json(
        { success: false, error: 'INVALID_APPLY_RUN_ID', message: 'applyRunId must be a positive integer' },
        { status: 400 },
      )
    }

    const result = await rollbackSchedulerApply({
      applyRunId,
      confirmRollback: body.confirmRollback === true,
      operatorId: auth.user.id,
      operatorName: auth.user.displayName,
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[scheduler/rollback] error:', message)

    // Map known errors to structured responses
    const knownErrors: Record<string, { code: string; status: number }> = {
      CONFIRM_ROLLBACK_REQUIRED: { code: 'CONFIRM_ROLLBACK_REQUIRED', status: 400 },
      APPLY_RUN_NOT_FOUND: { code: 'APPLY_RUN_NOT_FOUND', status: 404 },
      INVALID_APPLY_MODE: { code: 'INVALID_APPLY_MODE', status: 400 },
      APPLY_NOT_COMPLETED: { code: 'APPLY_NOT_COMPLETED', status: 400 },
      APPLY_RUN_ALREADY_ROLLED_BACK: { code: 'APPLY_RUN_ALREADY_ROLLED_BACK', status: 400 },
      ROLLBACK_ALREADY_EXISTS: { code: 'ROLLBACK_ALREADY_EXISTS', status: 409 },
      APPLY_CHANGES_EMPTY: { code: 'APPLY_CHANGES_EMPTY', status: 400 },
      APPLY_CHANGED_SLOT_COUNT_MISMATCH: { code: 'APPLY_CHANGED_SLOT_COUNT_MISMATCH', status: 400 },
      SLOT_NOT_FOUND: { code: 'SLOT_NOT_FOUND', status: 409 },
      SLOT_STATE_MISMATCH: { code: 'SLOT_STATE_MISMATCH', status: 409 },
      TX_SLOT_NOT_FOUND: { code: 'TX_SLOT_NOT_FOUND', status: 409 },
      TX_SLOT_STATE_MISMATCH: { code: 'TX_SLOT_STATE_MISMATCH', status: 409 },
    }

    for (const [prefix, resp] of Object.entries(knownErrors)) {
      if (message.startsWith(prefix)) {
        return NextResponse.json(
          { success: false, error: resp.code, message },
          { status: resp.status },
        )
      }
    }

    return NextResponse.json(
      { success: false, error: 'ROLLBACK_FAILED', message },
      { status: 500 },
    )
  }
}
