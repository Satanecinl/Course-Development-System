import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { parseSemesterId } from '@/lib/semesters/semester-validation'
import { getSemesterDeleteStatus } from '@/lib/semesters/semester-service'

// GET /api/semesters/[id]/dependencies — dependency counts for a semester (K25-H)
//
// Requires settings:manage permission.
// Returns dependency counts and delete status for UI display.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requirePermission('settings:manage', request)
    if ('error' in auth) return auth.error

    const { id: idStr } = await params
    const idResult = parseSemesterId(idStr)
    if (typeof idResult !== 'number') {
      return NextResponse.json({ success: false, error: idResult.code, message: idResult.message }, { status: 400 })
    }

    const semester = await prisma.semester.findUnique({ where: { id: idResult } })
    if (!semester) {
      return NextResponse.json(
        { success: false, error: 'SEMESTER_NOT_FOUND', message: '学期不存在' },
        { status: 404 },
      )
    }

    const deleteStatus = await getSemesterDeleteStatus(idResult)

    return NextResponse.json({
      success: true,
      semesterId: idResult,
      dependencies: deleteStatus.dependencies,
      canDelete: deleteStatus.canDelete,
      deleteBlockers: deleteStatus.blockers,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message }, { status: 500 })
  }
}
