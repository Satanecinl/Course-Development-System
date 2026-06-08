import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { parseSemesterId } from '@/lib/semesters/semester-validation'
import { activateSemester, formatSemesterSummary } from '@/lib/semesters/semester-service'

// POST /api/semesters/[id]/activate — set a semester as the active semester (K25-H)
//
// Requires settings:manage permission.
// Uses transaction: deactivate all, then activate target.
// Idempotent: if already active, returns success without error.
export async function POST(
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

    // Idempotent: already active
    if (semester.isActive) {
      return NextResponse.json({
        success: true,
        semester: formatSemesterSummary(semester),
        activeSemesterId: semester.id,
      })
    }

    const activated = await activateSemester(idResult)

    return NextResponse.json({
      success: true,
      semester: activated,
      activeSemesterId: activated.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message }, { status: 500 })
  }
}
