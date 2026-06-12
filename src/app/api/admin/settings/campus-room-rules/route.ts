/**
 * K26-L1: Campus room rules — read-only API.
 *
 * GET /api/admin/settings/campus-room-rules
 *
 * Returns room summary, HC rules status, room list, and current violations.
 * Read-only: no POST/PUT/DELETE.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'
import { classifySpecialty } from '@/lib/scheduler/score'
import type { TaskWithRelations } from '@/lib/scheduler/types'

function isLinxiao(name: string, building: string | null): boolean {
  return name.includes('林校') || (building?.includes('林校') ?? false)
}

export async function GET(_request: NextRequest) {
  const auth = await requirePermission('settings:manage', _request)
  if ('error' in auth) return auth.error

  try {
    // ── Rooms ──
    const rooms = await prisma.room.findMany({
      include: { availabilities: true },
      orderBy: { id: 'asc' },
    })

    const roomList = rooms.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      type: r.type,
      building: r.building,
      isLinxiao: isLinxiao(r.name, r.building),
    }))

    const linxiaoRooms = roomList.filter((r) => r.isLinxiao)
    const missingCapacity = roomList.filter((r) => r.capacity == null || r.capacity === 0)
    const missingType = roomList.filter((r) => !r.type || r.type === '')

    // ── Violations ──
    const linxiaoIds = linxiaoRooms.map((r) => r.id)
    const violations: Array<{
      type: 'HC5_ROOM_UNAVAILABLE' | 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO'
      slotId: number
      courseName: string
      roomName: string | null
      reason: string
    }> = []

    // HC5: room unavailability — include secondary rooms (K36-B1A5)
    const unavailRecords = await prisma.roomAvailability.findMany({
      where: { available: false },
      include: { room: true },
    })
    const seenHc5Slots = new Set<number>()
    for (const ua of unavailRecords) {
      const slotsAtPos = await prisma.scheduleSlot.findMany({
        where: {
          semesterId: 1,
          dayOfWeek: ua.dayOfWeek,
          slotIndex: ua.slotIndex,
          OR: [
            { roomId: ua.roomId },
            { additionalRooms: { some: { roomId: ua.roomId } } },
          ],
        },
        include: {
          teachingTask: { include: { course: true } },
          additionalRooms: { select: { roomId: true } },
        },
      })
      for (const slot of slotsAtPos) {
        // Deduplicate: a slot's primary and secondary rooms may both be
        // unavailable for the same time position.
        if (seenHc5Slots.has(slot.id)) continue
        seenHc5Slots.add(slot.id)
        violations.push({
          type: 'HC5_ROOM_UNAVAILABLE',
          slotId: slot.id,
          courseName: slot.teachingTask.course?.name ?? '?',
          roomName: ua.room?.name ?? null,
          reason: `${ua.room?.name ?? '?'} 在周${ua.dayOfWeek}第${ua.slotIndex}节不可用${ua.reason ? `（${ua.reason}）` : ''}`,
        })
      }
    }

    // HC6: non-automotive in Linxiao — include secondary rooms (K36-B1A5)
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
          room: true,
          additionalRooms: { include: { room: true } },
          teachingTask: {
            include: {
              course: true,
              taskClasses: { include: { classGroup: true } },
            },
          },
        },
      })
      // Deduplicate by slot id: a slot may match through both primary
      // and secondary rooms, or through multiple secondary rooms.
      const seenHc6Slots = new Set<number>()
      for (const slot of slotsInLinxiao) {
        if (seenHc6Slots.has(slot.id)) continue
        seenHc6Slots.add(slot.id)
        const task = slot.teachingTask as unknown as TaskWithRelations
        const cls = classifySpecialty(task)
        if (cls === 'AUTOMOTIVE_ONLY') continue
        // Determine which linxiao room(s) this slot uses (primary or secondary)
        const effectiveLinxiaoRoomNames: string[] = []
        if (slot.roomId != null && linxiaoIds.includes(slot.roomId)) {
          effectiveLinxiaoRoomNames.push(slot.room?.name ?? String(slot.roomId))
        }
        for (const ar of slot.additionalRooms) {
          if (linxiaoIds.includes(ar.roomId)) {
            effectiveLinxiaoRoomNames.push(ar.room?.name ?? String(ar.roomId))
          }
        }
        violations.push({
          type: 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO',
          slotId: slot.id,
          courseName: task.course?.name ?? '?',
          roomName: effectiveLinxiaoRoomNames[0] ?? slot.room?.name ?? null,
          reason: `${task.course?.name ?? '?'} (分类: ${cls}) 不可在林校教室 ${effectiveLinxiaoRoomNames.join('、') || slot.room?.name || '?'}`,
        })
      }
    }

    const hc5Count = violations.filter((v) => v.type === 'HC5_ROOM_UNAVAILABLE').length
    const hc6Count = violations.filter((v) => v.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO').length

    return NextResponse.json({
      success: true,
      summary: {
        totalRooms: roomList.length,
        linxiaoRooms: linxiaoRooms.length,
        nonLinxiaoRooms: roomList.length - linxiaoRooms.length,
        missingCapacityRooms: missingCapacity.length,
        missingTypeRooms: missingType.length,
        hc5ViolationCount: hc5Count,
        hc6ViolationCount: hc6Count,
      },
      rules: {
        nonAutomotiveForbidLinxiao: {
          enabled: true,
          severity: 'hard' as const,
          editable: false,
          description: '非汽车专业课程不得安排在林校教室',
        },
        automotivePreferLinxiao: {
          enabled: true,
          severity: 'soft' as const,
          editable: false,
          description: '汽车专业课程优先安排在林校教室（SC6 软约束）',
        },
      },
      rooms: roomList,
      violations,
    })
  } catch (error) {
    console.error('Campus room rules API error:', error)
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: '获取校区教室规则失败' },
      { status: 500 },
    )
  }
}

export async function POST() {
  return NextResponse.json(
    { success: false, error: 'METHOD_NOT_ALLOWED', message: '校区教室规则设置为只读，不支持 POST' },
    { status: 405 },
  )
}
