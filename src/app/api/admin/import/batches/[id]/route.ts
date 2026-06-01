import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'
import { resolveSchedulerSemester } from '@/lib/semester'

function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, context: RouteContext) {
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

    const semester = await resolveSchedulerSemester()

    const batch = await prisma.importBatch.findUnique({
      where: { id },
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
        statsJson: true,
        qualityJson: true,
        warningsJson: true,
        semesterId: true,
      },
    })

    if (!batch) {
      return NextResponse.json(
        { success: false, error: 'Batch not found' },
        { status: 404 }
      )
    }

    if (batch.semesterId != null && batch.semesterId !== semester.id) {
      return NextResponse.json(
        { success: false, error: `Batch belongs to semester ${batch.semesterId}, not ${semester.id}` },
        { status: 409 }
      )
    }

    // Compute actual DB statistics
    const batchTaskIds = await prisma.teachingTask
      .findMany({ where: { importBatchId: id }, select: { id: true } })
      .then((tasks) => tasks.map((t) => t.id))

    const allTaskIds = await prisma.teachingTask
      .findMany({ select: { id: true } })
      .then((tasks) => tasks.map((t) => t.id))

    const [
      actualCreatedTaskCount,
      actualCreatedSlotCount,
      actualTeachingTaskClassCount,
      nullTeacherTaskCount,
      nullRoomSlotCount,
      placeholderTeacherCount,
      placeholderRoomCount,
      orphanSlotCount,
    ] = await Promise.all([
      prisma.teachingTask.count({ where: { importBatchId: id } }),
      prisma.scheduleSlot.count({ where: { importBatchId: id } }),
      prisma.teachingTaskClass.count({
        where: {
          teachingTask: { importBatchId: id },
        },
      }),
      prisma.teachingTask.count({
        where: { importBatchId: id, teacherId: null },
      }),
      prisma.scheduleSlot.count({
        where: { importBatchId: id, roomId: null },
      }),
      prisma.teacher.count({
        where: { name: { contains: '待定' } },
      }),
      prisma.room.count({
        where: { name: { contains: '待定' } },
      }),
      prisma.scheduleSlot.count({
        where: {
          importBatchId: id,
          teachingTaskId: { notIn: allTaskIds },
        },
      }),
    ])

    const hasPlaceholderTeachers = placeholderTeacherCount > 0
    const hasPlaceholderRooms = placeholderRoomCount > 0
    const hasOrphanSlots = orphanSlotCount > 0
    const metadataMatch =
      batch.createdTaskCount === actualCreatedTaskCount &&
      batch.createdSlotCount === actualCreatedSlotCount

    const rollbackComplete =
      batch.status === 'rolled_back' &&
      actualCreatedTaskCount === 0 &&
      actualCreatedSlotCount === 0 &&
      actualTeachingTaskClassCount === 0

    return NextResponse.json({
      success: true,
      batch: {
        id: batch.id,
        filename: batch.filename,
        status: batch.status,
        strategy: batch.strategy,
        recordCount: batch.recordCount,
        createdTaskCount: batch.createdTaskCount,
        createdSlotCount: batch.createdSlotCount,
        createdAt: batch.createdAt,
        confirmedAt: batch.confirmedAt,
        rolledBackAt: batch.rolledBackAt,
        errorMessage: batch.errorMessage,
        semesterId: batch.semesterId,

        stats: safeJsonParse(batch.statsJson, null),
        quality: safeJsonParse(batch.qualityJson, null),
        warnings: safeJsonParse(batch.warningsJson, []),

        actualCreatedTaskCount,
        actualCreatedSlotCount,
        actualTeachingTaskClassCount,
        nullTeacherTaskCount,
        nullRoomSlotCount,

        hasPlaceholderTeachers,
        hasPlaceholderRooms,
        hasOrphanSlots,
        metadataMatch,
        rollbackComplete,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
