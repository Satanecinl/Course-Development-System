import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'

interface AbandonRequestBody {
  confirmText?: string
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requirePermission('import:manage', request)
  if ('error' in auth) return auth.error

  try {
    const { id: idStr } = await context.params
    const id = parseInt(idStr, 10)

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid batch ID' },
        { status: 400 }
      )
    }

    const body: AbandonRequestBody = await request.json()

    if (body.confirmText !== 'ABANDON_IMPORT') {
      return NextResponse.json(
        { success: false, error: 'Abandon requires confirmText = "ABANDON_IMPORT"' },
        { status: 400 }
      )
    }

    // Only pending batches can be abandoned
    const batch = await prisma.importBatch.findUnique({
      where: { id },
      select: { id: true, status: true },
    })

    if (!batch) {
      return NextResponse.json(
        { success: false, error: `Batch #${id} not found` },
        { status: 404 }
      )
    }

    if (batch.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Batch status is "${batch.status}", only "pending" batches can be abandoned` },
        { status: 400 }
      )
    }

    // Atomic pending → abandoned
    const updateResult = await prisma.importBatch.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'abandoned', errorMessage: 'Manually abandoned' },
    })

    if (updateResult.count !== 1) {
      return NextResponse.json(
        { success: false, error: 'Batch status changed concurrently, abandon aborted' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      batchId: id,
      status: 'abandoned',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
