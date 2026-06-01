import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'
import { resolveSchedulerSemester } from '@/lib/semester'

export async function GET(request: NextRequest) {
  const auth = await requirePermission('import:manage', request)
  if ('error' in auth) return auth.error

  try {
    const semester = await resolveSchedulerSemester()

    const batches = await prisma.importBatch.findMany({
      where: {
        OR: [
          { semesterId: semester.id },
          { semesterId: null },
        ],
      },
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
        semesterId: true,
      },
    })

    return NextResponse.json({ success: true, batches, semesterId: semester.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
