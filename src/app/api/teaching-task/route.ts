import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { resolveRequestSemester, toSemesterErrorResponse } from '@/lib/schedule/semester-scope'

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('data:write', request)
    if ('error' in auth) return auth.error
    const body = await request.json()
    const {
      courseId,
      teacherId,
      weekType,
      startWeek,
      endWeek,
      remark,
      classGroupIds,
    } = body as {
      courseId?: number
      teacherId?: number | null
      weekType?: string
      startWeek?: number
      endWeek?: number
      remark?: string | null
      classGroupIds?: number[]
    }

    if (!courseId || typeof courseId !== 'number') {
      return NextResponse.json({ error: '课程ID必填' }, { status: 400 })
    }
    if (!weekType || typeof weekType !== 'string') {
      return NextResponse.json({ error: '周次类型必填' }, { status: 400 })
    }
    if (typeof startWeek !== 'number' || typeof endWeek !== 'number') {
      return NextResponse.json({ error: '开始周和结束周必填' }, { status: 400 })
    }
    if (startWeek < 1 || startWeek > 16 || endWeek < 1 || endWeek > 16 || startWeek > endWeek) {
      return NextResponse.json({ error: '周次范围无效 (1-16)' }, { status: 400 })
    }

    const validClassGroupIds = Array.isArray(classGroupIds)
      ? classGroupIds.filter((id): id is number => typeof id === 'number')
      : []

    // K25-D: resolve semester from request (query / header / body / active fallback)
    // Body may also include semesterId — that takes precedence over query/header.
    const semester = await resolveRequestSemester({
      searchParams: request.nextUrl.searchParams,
      headers: request.headers,
      body: body as Record<string, unknown>,
    })

    // K25-D: defense-in-depth — if any classGroups were provided, verify they
    // belong to the same semester. (K25-C made ClassGroup.semesterId NOT NULL
    // and validate script already verifies 0 mismatches, but checking here
    // prevents cross-semester leakage at write time.)
    if (validClassGroupIds.length > 0) {
      const classGroups = await prisma.classGroup.findMany({
        where: { id: { in: validClassGroupIds } },
        select: { id: true, semesterId: true },
      })
      const mismatched = classGroups.filter((cg) => cg.semesterId !== semester.id)
      if (mismatched.length > 0) {
        return NextResponse.json(
          {
            error: 'CLASS_GROUP_SEMESTER_MISMATCH',
            message: `${mismatched.length} classGroup(s) belong to a different semester than ${semester.id}`,
            mismatchedIds: mismatched.map((m) => m.id),
            semesterId: semester.id,
          },
          { status: 400 },
        )
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create TeachingTask
      const task = await tx.teachingTask.create({
        data: {
          courseId,
          teacherId: teacherId ?? null,
          weekType,
          startWeek,
          endWeek,
          remark: remark ?? null,
          semesterId: semester.id,
        },
      })

      // 2. Sync TeachingTaskClass
      if (validClassGroupIds.length > 0) {
        await tx.teachingTaskClass.createMany({
          data: validClassGroupIds.map((classGroupId) => ({
            teachingTaskId: task.id,
            classGroupId,
          })),
        })
      }

      return task
    })

    return NextResponse.json({
      success: true,
      record: result,
      semesterId: semester.id,
      semesterSource: semester.source,
    })
  } catch (error) {
    const errResponse = toSemesterErrorResponse(error)
    if (errResponse) {
      return NextResponse.json(errResponse.response, { status: errResponse.status })
    }
    console.error('Teaching task create error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
