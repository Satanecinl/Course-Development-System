import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { buildRollbackPlan, rollbackImportBatch } from '@/lib/import/rollback'

interface RollbackRequestBody {
  batchId?: number
  dryRun?: boolean
  confirmText?: string
}

export async function POST(request: Request) {
  const auth = await requirePermission('import:manage', request)
  if ('error' in auth) return auth.error

  try {
    const body: RollbackRequestBody = await request.json()

    if (!body.batchId || typeof body.batchId !== 'number') {
      return NextResponse.json(
        { success: false, error: 'batchId is required and must be a number' },
        { status: 400 }
      )
    }

    // dryRun mode
    if (body.dryRun === true) {
      const plan = await buildRollbackPlan(body.batchId)
      return NextResponse.json({ success: true, dryRun: true, plan })
    }

    // Real rollback mode
    if (body.confirmText !== 'ROLLBACK_IMPORT') {
      return NextResponse.json(
        { success: false, error: 'Real rollback requires confirmText = "ROLLBACK_IMPORT"' },
        { status: 400 }
      )
    }

    const result = await rollbackImportBatch(body.batchId)
    return NextResponse.json({ success: true, dryRun: false, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
