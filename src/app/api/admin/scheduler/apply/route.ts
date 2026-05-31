import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { applySchedulerPreview } from '@/lib/scheduler/apply'

interface ApplyRequest {
  previewRunId: number
  confirmApply?: boolean
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const body: ApplyRequest = await request.json().catch(() => ({ previewRunId: NaN }))

    const previewRunId = typeof body.previewRunId === 'number' ? body.previewRunId : NaN
    if (Number.isNaN(previewRunId) || previewRunId <= 0) {
      return NextResponse.json(
        { success: false, error: 'INVALID_PREVIEW_RUN_ID', message: 'previewRunId must be a positive integer' },
        { status: 400 },
      )
    }

    const result = await applySchedulerPreview({
      previewRunId,
      confirmApply: body.confirmApply === true,
      operatorId: auth.user.id,
      operatorName: auth.user.displayName,
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[scheduler/apply] error:', message)

    // Map known errors to structured responses
    const knownErrors: Record<string, { code: string; status: number }> = {
      CONFIRM_APPLY_REQUIRED: { code: 'CONFIRM_APPLY_REQUIRED', status: 400 },
      PREVIEW_RUN_NOT_FOUND: { code: 'PREVIEW_RUN_NOT_FOUND', status: 404 },
      INVALID_PREVIEW_MODE: { code: 'INVALID_PREVIEW_MODE', status: 400 },
      PREVIEW_NOT_COMPLETED: { code: 'PREVIEW_NOT_COMPLETED', status: 400 },
      PREVIEW_HAS_HARD_CONFLICTS: { code: 'PREVIEW_HAS_HARD_CONFLICTS', status: 400 },
      PREVIEW_HAS_REMAINING_CONFLICTS: { code: 'PREVIEW_HAS_REMAINING_CONFLICTS', status: 400 },
      PREVIEW_EXPIRED: { code: 'PREVIEW_EXPIRED', status: 400 },
      PREVIEW_RESULT_SNAPSHOT_MISSING: { code: 'PREVIEW_RESULT_SNAPSHOT_MISSING', status: 400 },
      PREVIEW_FINGERPRINT_MISSING: { code: 'PREVIEW_FINGERPRINT_MISSING', status: 400 },
      PREVIEW_RESULT_SNAPSHOT_INVALID_JSON: { code: 'PREVIEW_RESULT_SNAPSHOT_INVALID_JSON', status: 400 },
      PREVIEW_NO_PROPOSED_CHANGES: { code: 'PREVIEW_NO_PROPOSED_CHANGES', status: 400 },
      PREVIEW_CHANGED_SLOT_COUNT_MISMATCH: { code: 'PREVIEW_CHANGED_SLOT_COUNT_MISMATCH', status: 400 },
      DATABASE_FINGERPRINT_MISMATCH: { code: 'DATABASE_FINGERPRINT_MISMATCH', status: 409 },
      SLOT_NOT_FOUND: { code: 'SLOT_NOT_FOUND', status: 409 },
      TX_SLOT_NOT_FOUND: { code: 'TX_SLOT_NOT_FOUND', status: 409 },
      SLOT_VALUE_MISMATCH: { code: 'SLOT_VALUE_MISMATCH', status: 409 },
      APPLY_POST_HARD_SCORE_NON_ZERO: { code: 'APPLY_POST_HARD_SCORE_NON_ZERO', status: 500 },
      APPLY_POST_HC_NON_ZERO: { code: 'APPLY_POST_HC_NON_ZERO', status: 500 },
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
      { success: false, error: 'APPLY_FAILED', message },
      { status: 500 },
    )
  }
}
