// src/app/api/admin/scheduler/readiness/route.ts
// K29-A: Read-only scheduler readiness for a given semester.
// Returns data counts, canPreview flag, blockers, and warnings.
// No writes. Permission: schedule:adjust (admin scheduler).

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { resolveSchedulerSemester } from '@/lib/semester'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const semesterIdParam = searchParams.get('semesterId')
    const semester = await resolveSchedulerSemester({
      semesterId: semesterIdParam ? parseInt(semesterIdParam, 10) : undefined,
    })

    const [teachingTaskCount, scheduleSlotCount, classGroupCount, teacherCount, roomCount, importBatchCount, schedulingRunCount] = await Promise.all([
      prisma.teachingTask.count({ where: { semesterId: semester.id } }),
      prisma.scheduleSlot.count({ where: { semesterId: semester.id } }),
      prisma.classGroup.count({ where: { semesterId: semester.id } }),
      prisma.teacher.count(),
      prisma.room.count(),
      prisma.importBatch.count({ where: { semesterId: semester.id } }),
      prisma.schedulingRun.count({ where: { semesterId: semester.id } }),
    ])

    const [latestImportBatch, latestSchedulingRun] = await Promise.all([
      prisma.importBatch.findFirst({
        where: { semesterId: semester.id },
        orderBy: { id: 'desc' },
        select: { id: true, filename: true, status: true, recordCount: true, createdAt: true },
      }),
      prisma.schedulingRun.findFirst({
        where: { semesterId: semester.id },
        orderBy: { id: 'desc' },
        select: { id: true, mode: true, status: true, hardScoreAfter: true, softScoreAfter: true, startedAt: true, completedAt: true },
      }),
    ])

    const blockers: string[] = []
    const warnings: string[] = []

    if (teachingTaskCount === 0) blockers.push('本学期没有教学任务 (TeachingTask)，无法排课。请先到导入或教学任务管理中添加。')
    if (classGroupCount === 0) blockers.push('本学期没有班级 (ClassGroup)，无法排课。')
    if (roomCount === 0) blockers.push('系统中没有教室 (Room)，无法排课。')

    if (scheduleSlotCount === 0 && teachingTaskCount > 0) {
      warnings.push('本学期有教学任务但没有现有课表 (ScheduleSlot)，将从空课表开始排课。')
    }
    if (teacherCount === 0) {
      warnings.push('系统中没有教师 (Teacher)，排课结果将不考虑教师冲突。')
    }

    const canPreview = blockers.length === 0

    return NextResponse.json({
      success: true,
      semesterId: semester.id,
      semesterCode: semester.code,
      semesterName: semester.name,
      isActive: true, // resolved from DB
      counts: {
        teachingTasks: teachingTaskCount,
        scheduleSlots: scheduleSlotCount,
        classGroups: classGroupCount,
        teachers: teacherCount,
        rooms: roomCount,
        importBatches: importBatchCount,
        schedulingRuns: schedulingRunCount,
      },
      latestImportBatch,
      latestSchedulingRun,
      canPreview,
      blockers,
      warnings,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
