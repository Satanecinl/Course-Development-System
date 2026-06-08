import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { parseSemesterId, validateSemesterUpdate, parseDateOrNull } from '@/lib/semesters/semester-validation'
import { updateSemester, getSemesterDeleteStatus } from '@/lib/semesters/semester-service'

// PUT /api/semesters/[id] — edit a semester (K25-H)
//
// Requires settings:manage permission.
export async function PUT(
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

    const body = await request.json()

    // Validate with existing dates
    const errors = validateSemesterUpdate(body, { startsAt: semester.startsAt, endsAt: semester.endsAt })
    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors[0].code, message: errors[0].message },
        { status: 400 },
      )
    }

    // Code uniqueness if changing
    if (body.code !== undefined) {
      const code = String(body.code).trim()
      const existing = await prisma.semester.findFirst({ where: { code, NOT: { id: idResult } } })
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'SEMESTER_CODE_EXISTS', message: `学期代码 "${code}" 已存在` },
          { status: 409 },
        )
      }
    }

    // Guard: cannot directly deactivate the active semester
    if (body.isActive === false && semester.isActive) {
      return NextResponse.json(
        { success: false, error: 'CANNOT_DEACTIVATE_ACTIVE_SEMESTER_DIRECTLY', message: '不能直接取消当前激活学期，请先激活其他学期' },
        { status: 400 },
      )
    }

    // Parse dates if provided
    let startsAt: Date | null | undefined = undefined
    let endsAt: Date | null | undefined = undefined
    if (body.startsAt !== undefined) {
      const parsed = parseDateOrNull(body.startsAt)
      if (parsed && typeof parsed === 'object' && 'code' in parsed) {
        return NextResponse.json({ success: false, error: parsed.code, message: parsed.message }, { status: 400 })
      }
      startsAt = parsed as Date | null
    }
    if (body.endsAt !== undefined) {
      const parsed = parseDateOrNull(body.endsAt)
      if (parsed && typeof parsed === 'object' && 'code' in parsed) {
        return NextResponse.json({ success: false, error: parsed.code, message: parsed.message }, { status: 400 })
      }
      endsAt = parsed as Date | null
    }

    const updated = await updateSemester(idResult, {
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      code: body.code !== undefined ? String(body.code).trim() : undefined,
      academicYear: body.academicYear,
      term: body.term,
      startsAt,
      endsAt,
      isActive: body.isActive,
    })

    return NextResponse.json({ success: true, semester: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message }, { status: 500 })
  }
}

// DELETE /api/semesters/[id] — delete an empty semester (K25-H)
//
// Requires settings:manage permission.
// Blocked if: active, last, or has dependencies.
export async function DELETE(
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

    const deleteStatus = await getSemesterDeleteStatus(idResult)

    if (!deleteStatus.canDelete) {
      const primaryBlocker = deleteStatus.blockers[0] || '无法删除'
      let errorCode = 'SEMESTER_DELETE_FORBIDDEN'
      if (deleteStatus.blockers.some(b => b.includes('激活学期'))) errorCode = 'SEMESTER_ACTIVE_DELETE_FORBIDDEN'
      else if (deleteStatus.blockers.some(b => b.includes('最后一个'))) errorCode = 'SEMESTER_LAST_DELETE_FORBIDDEN'
      else if (deleteStatus.dependencies.total > 0) errorCode = 'SEMESTER_HAS_DEPENDENCIES'

      return NextResponse.json(
        {
          success: false,
          error: errorCode,
          message: primaryBlocker,
          dependencies: deleteStatus.dependencies,
          blockers: deleteStatus.blockers,
        },
        { status: 409 },
      )
    }

    await prisma.semester.delete({ where: { id: idResult } })

    return NextResponse.json({ success: true, deletedSemesterId: idResult })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message }, { status: 500 })
  }
}
