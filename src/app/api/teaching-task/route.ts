import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { resolveSchedulerSemester } from '@/lib/semester'

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

    const result = await prisma.$transaction(async (tx) => {
      // K25-C: semesterId is now NOT NULL; resolve from active semester.
      const semester = await resolveSchedulerSemester()
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

    return NextResponse.json({ success: true, record: result })
  } catch (error) {
    console.error('Teaching task create error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
