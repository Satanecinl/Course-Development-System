import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { voidScheduleAdjustment } from '@/lib/schedule/adjustments'

interface RouteContext {
  params: Promise<{ id: string }>
}

// PATCH /api/schedule-adjustments/[id]/void
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const { id: idStr } = await context.params
    const id = parseInt(idStr, 10)

    if (Number.isNaN(id)) {
      return NextResponse.json({ success: false, error: 'Invalid adjustment ID' }, { status: 400 })
    }

    const body = await request.json()

    if (body.confirmText !== 'VOID_ADJUSTMENT') {
      return NextResponse.json(
        { success: false, error: 'Void requires confirmText = "VOID_ADJUSTMENT"' },
        { status: 400 }
      )
    }

    const result = await voidScheduleAdjustment(id)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
