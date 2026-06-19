/**
 * K37-B: PATCH /api/admin/settings/campus-room-rules/rooms/[roomId]
 *
 * Update a single room's linxiao campus status.
 * Only allows updating Room.isLinxiao (boolean).
 * Does NOT modify ScheduleSlot, TeachingTask, or ScheduleAdjustment.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'
import { classifySpecialty } from '@/lib/scheduler/score'
import type { TaskWithRelations } from '@/lib/scheduler/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  const { roomId: roomIdStr } = await params
  const roomId = parseInt(roomIdStr, 10)
  if (isNaN(roomId) || roomId <= 0) {
    return NextResponse.json(
      { success: false, error: 'INVALID_ROOM_ID', message: 'roomId 必须为正整数' },
      { status: 400 },
    )
  }

  let body: { isLinxiao?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'INVALID_JSON', message: '请求体必须为 JSON' },
      { status: 400 },
    )
  }

  if (typeof body.isLinxiao !== 'boolean') {
    return NextResponse.json(
      { success: false, error: 'INVALID_FIELD', message: 'isLinxiao 必须为 boolean' },
      { status: 400 },
    )
  }

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId } })
    if (!room) {
      return NextResponse.json(
        { success: false, error: 'ROOM_NOT_FOUND', message: `教室 ${roomId} 不存在` },
        { status: 404 },
      )
    }

    const updated = await prisma.room.update({
      where: { id: roomId },
      data: { isLinxiao: body.isLinxiao },
    })

    // Compute warnings: check if HC6 violations increased
    const linxiaoRooms = await prisma.room.findMany({ where: { isLinxiao: true } })
    const linxiaoIds = linxiaoRooms.map((r) => r.id)
    let hc6WarningCount = 0
    const warnings: string[] = []

    if (linxiaoIds.length > 0) {
      const slotsInLinxiao = await prisma.scheduleSlot.findMany({
        where: {
          semesterId: 1,
          OR: [
            { roomId: { in: linxiaoIds } },
            { additionalRooms: { some: { roomId: { in: linxiaoIds } } } },
          ],
        },
        include: {
          teachingTask: {
            include: { course: true, taskClasses: { include: { classGroup: true } } },
          },
        },
      })
      const seen = new Set<number>()
      for (const slot of slotsInLinxiao) {
        if (seen.has(slot.id)) continue
        seen.add(slot.id)
        const task = slot.teachingTask as unknown as TaskWithRelations
        const cls = classifySpecialty(task)
        if (cls !== 'AUTOMOTIVE_ONLY') {
          hc6WarningCount++
        }
      }
    }

    if (body.isLinxiao && hc6WarningCount > 0) {
      warnings.push(
        `标记为林校后，当前有 ${hc6WarningCount} 个非汽车专业课程在林校教室（HC6 违规）。建议检查课表。`,
      )
    }

    return NextResponse.json({
      success: true,
      room: {
        id: updated.id,
        name: updated.name,
        isLinxiao: updated.isLinxiao,
      },
      summary: {
        totalRooms: await prisma.room.count(),
        linxiaoRooms: linxiaoRooms.length,
        hc6ViolationCount: hc6WarningCount,
      },
      warnings,
    })
  } catch (error) {
    console.error('PATCH campus room rules error:', error)
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '更新教室林校状态失败' },
      { status: 500 },
    )
  }
}
