/**
 * L6-E1 API Route — Course Setting Resolution Options
 *
 * GET /api/admin/import/course-setting-xlsx/resolution-options?targetSemesterId=<id>
 *
 * Read-only endpoint. Loads existing Course / Teacher / ClassGroup
 * records as reference options for the L6-E1 manual resolution UI.
 * Users need these options to pick existing entities when resolving
 * missing courses, teachers, or class groups during xlsx import.
 *
 * Stage: L6-E1-XLSX-COURSE-SETTING-RESOLUTION-OPTIONS
 *
 * Permission: import:manage
 * Method: GET (read-only)
 * NO DB writes. NO filesystem writes. Only findUnique and findMany.
 *
 * Query params:
 *   - targetSemesterId: number (required, must be a positive integer,
 *     semester must exist). Used to scope ClassGroup results.
 *
 * Response:
 *   { success, readOnly, dbWritten, targetSemesterId, courses, teachers, classGroups }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { loadResolutionOptions } from '@/lib/import/course-setting-resolution-options'

const ERROR_MISSING_TARGET_SEMESTER = 'MISSING_TARGET_SEMESTER'
const ERROR_INVALID_TARGET_SEMESTER = 'INVALID_TARGET_SEMESTER'
const ERROR_TARGET_SEMESTER_NOT_FOUND = 'TARGET_SEMESTER_NOT_FOUND'

export async function GET(request: NextRequest) {
  const auth = await requirePermission('import:manage', request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = request.nextUrl
    const targetSemesterIdRaw = searchParams.get('targetSemesterId')

    if (targetSemesterIdRaw == null || targetSemesterIdRaw === '') {
      return NextResponse.json(
        {
          success: false,
          error: ERROR_MISSING_TARGET_SEMESTER,
          message: '请提供 targetSemesterId 参数',
          readOnly: true,
          dbWritten: false,
        },
        { status: 400 },
      )
    }

    const targetSemesterId = Number(targetSemesterIdRaw)
    if (!Number.isInteger(targetSemesterId) || targetSemesterId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: ERROR_INVALID_TARGET_SEMESTER,
          message: '目标学期 ID 无效',
          readOnly: true,
          dbWritten: false,
        },
        { status: 400 },
      )
    }

    // Validate target semester exists (read-only)
    const { prisma } = await import('@/lib/prisma')
    const semester = await prisma.semester.findUnique({
      where: { id: targetSemesterId },
      select: { id: true },
    })

    if (!semester) {
      return NextResponse.json(
        {
          success: false,
          error: ERROR_TARGET_SEMESTER_NOT_FOUND,
          message: '目标学期不存在',
          readOnly: true,
          dbWritten: false,
        },
        { status: 400 },
      )
    }

    // Load resolution options (read-only findMany queries)
    const options = await loadResolutionOptions(prisma, targetSemesterId)

    return NextResponse.json({
      success: true,
      readOnly: true,
      dbWritten: false,
      targetSemesterId,
      courses: options.courses,
      teachers: options.teachers,
      classGroups: options.classGroups,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const errorCode = message === 'TARGET_SEMESTER_NOT_FOUND'
      ? ERROR_TARGET_SEMESTER_NOT_FOUND
      : 'INTERNAL'
    return NextResponse.json(
      {
        success: false,
        error: errorCode,
        message,
        readOnly: true,
        dbWritten: false,
      },
      { status: errorCode === ERROR_TARGET_SEMESTER_NOT_FOUND ? 400 : 500 },
    )
  }
}
