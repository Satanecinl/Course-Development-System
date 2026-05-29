import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const auth = await requirePermission('import:manage', request)
  if ('error' in auth) return auth.error

  try {
    const batches = await prisma.importBatch.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        status: true,
        strategy: true,
        recordCount: true,
        createdTaskCount: true,
        createdSlotCount: true,
        createdAt: true,
        confirmedAt: true,
        rolledBackAt: true,
        errorMessage: true,
      },
    })

    return NextResponse.json({ success: true, batches })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
