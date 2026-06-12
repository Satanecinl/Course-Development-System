import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import {
  buildRollbackPlan,
  rollbackImportBatch,
  RollbackBlockedBySlotReferencesError,
} from '@/lib/import/rollback'
import { resolveSchedulerSemester } from '@/lib/semester'
import { prisma } from '@/lib/prisma'

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

    // 解析目标 semester 并校验 batch semesterId
    const semester = await resolveSchedulerSemester()
    const batch = await prisma.importBatch.findUnique({
      where: { id: body.batchId },
      select: { id: true, semesterId: true, status: true },
    })

    if (!batch) {
      return NextResponse.json(
        { success: false, error: `Batch #${body.batchId} not found` },
        { status: 404 }
      )
    }

    if (batch.semesterId != null && batch.semesterId !== semester.id) {
      return NextResponse.json(
        { success: false, error: `Batch belongs to semester ${batch.semesterId}, not ${semester.id}` },
        { status: 409 }
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
    if (error instanceof RollbackBlockedBySlotReferencesError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          blockingSlotCount: error.summary.blockingSlotCount,
          blockingReferenceCount: error.summary.blockingReferenceCount,
          referenceTypes: error.summary.referenceTypes,
          affectedSlotIds: error.summary.affectedSlotIds,
        },
        { status: 409 }
      )
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
