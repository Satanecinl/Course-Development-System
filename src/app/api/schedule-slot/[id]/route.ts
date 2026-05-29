import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission('data:write', request)
    if ('error' in auth) return auth.error

    const { id } = await params
    const slotId = parseInt(id, 10)
    if (isNaN(slotId)) {
      return NextResponse.json({ error: 'Invalid slot ID' }, { status: 400 })
    }

    const body = await request.json()
    const { dayOfWeek, slotIndex, roomId } = body as {
      dayOfWeek?: number
      slotIndex?: number
      roomId?: number | null
    }

    const updateData: Record<string, unknown> = {}
    if (dayOfWeek !== undefined) updateData.dayOfWeek = dayOfWeek
    if (slotIndex !== undefined) updateData.slotIndex = slotIndex
    if (roomId !== undefined) updateData.roomId = roomId

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // 查询旧状态用于日志
    const oldSlot = await prisma.scheduleSlot.findUnique({
      where: { id: slotId },
      select: { teachingTaskId: true, dayOfWeek: true, slotIndex: true, roomId: true },
    })

    if (!oldSlot) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
    }

    // 更新 ScheduleSlot
    const updated = await prisma.scheduleSlot.update({
      where: { id: slotId },
      data: updateData,
      include: {
        room: true,
        teachingTask: {
          include: {
            course: true,
            teacher: true,
            taskClasses: { include: { classGroup: true } },
          },
        },
      },
    })

    // 创建变更日志
    await prisma.scheduleChangeLog.create({
      data: {
        taskId: oldSlot.teachingTaskId,
        oldDay: oldSlot.dayOfWeek,
        oldSlotIndex: oldSlot.slotIndex,
        oldRoomId: oldSlot.roomId,
        newDay: updated.dayOfWeek,
        newSlotIndex: updated.slotIndex,
        newRoomId: updated.roomId,
      },
    })

    const viewData = {
      slotId: updated.id,
      taskId: updated.teachingTaskId,
      roomId: updated.roomId,
      courseName: updated.teachingTask.course.name,
      teacherName: updated.teachingTask.teacher?.name ?? null,
      roomName: updated.room?.name ?? null,
      roomBuilding: updated.room?.building ?? null,
      classNames: updated.teachingTask.taskClasses.map((tc) => tc.classGroup.name),
      dayOfWeek: updated.dayOfWeek,
      slotIndex: updated.slotIndex,
      weekType: updated.teachingTask.weekType,
      startWeek: updated.teachingTask.startWeek,
      endWeek: updated.teachingTask.endWeek,
      remark: updated.teachingTask.remark,
    }

    return NextResponse.json(viewData)
  } catch (error) {
    console.error('Schedule slot update error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
