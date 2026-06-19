/**
 * K26-L1 / K37-A / K37-B / K37-C: Campus room rules — editable, semester-scoped API.
 *
 * GET  /api/admin/settings/campus-room-rules
 *      ?semesterId=<id>  (optional; falls back to active semester)
 *
 * PATCH /api/admin/settings/campus-room-rules/rooms/[roomId]
 *
 * K37-C: HC5/HC6 diagnostics now resolve the semester via
 * resolveSchedulerSemester (explicit > active > error). Room.isLinxiao and
 * room-level mismatch remain global (not semester-scoped).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'
import { classifySpecialty, AUTOMOTIVE_KEYWORDS } from '@/lib/scheduler/score'
import { resolveSchedulerSemester } from '@/lib/semester'
import type { TaskWithRelations } from '@/lib/scheduler/types'

/** Legacy name-based inference (advisory only — not source of truth) */
function nameSuggestsLinxiao(name: string, building: string | null): boolean {
  return name.includes('林校') || (building?.includes('林校') ?? false)
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  try {
    // ── Resolve semester (K37-C) ──
    const url = new URL(request.url)
    const semesterParam = url.searchParams.get('semesterId')
    const explicitSemesterId = semesterParam ? Number(semesterParam) : null

    let diagnosticsScope: 'selected-semester' | 'active-semester' = 'active-semester'
    let resolvedSemester: { id: number; code: string; name: string; isActive?: boolean }
    const semesterWarning: string | null = null

    try {
      const resolved = await resolveSchedulerSemester({
        semesterId: explicitSemesterId,
      })
      // Fetch isActive flag for response
      const semester = await prisma.semester.findUnique({ where: { id: resolved.id } })
      resolvedSemester = {
        id: resolved.id,
        code: resolved.code,
        name: resolved.name,
        isActive: semester?.isActive ?? false,
      }
      diagnosticsScope = explicitSemesterId ? 'selected-semester' : 'active-semester'
    } catch (semError) {
      // No active semester and no explicit — return a clean error so the UI can show it
      const message = (semError as Error)?.message ?? 'Unknown semester resolution error'
      if (message.includes('NO_ACTIVE_SEMESTER')) {
        return NextResponse.json(
          {
            success: false,
            error: 'NO_ACTIVE_SEMESTER',
            message: '系统中没有 active semester。请先在学期设置中激活一个学期。',
            summary: { totalRooms: 0, linxiaoRooms: 0, nonLinxiaoRooms: 0, missingCapacityRooms: 0, missingTypeRooms: 0, hc5ViolationCount: 0, hc6ViolationCount: 0, linxiaoMismatchCount: 0 },
            rooms: [],
            violations: [],
          },
          { status: 200 }, // Return 200 with empty data so UI can still render room table
        )
      }
      if (message.includes('SEMESTER_NOT_FOUND')) {
        return NextResponse.json(
          {
            success: false,
            error: 'SEMESTER_NOT_FOUND',
            message: `指定学期 ${explicitSemesterId} 不存在。`,
            summary: { totalRooms: 0, linxiaoRooms: 0, nonLinxiaoRooms: 0, missingCapacityRooms: 0, missingTypeRooms: 0, hc5ViolationCount: 0, hc6ViolationCount: 0, linxiaoMismatchCount: 0 },
            rooms: [],
            violations: [],
          },
          { status: 400 },
        )
      }
      throw semError
    }

    const semesterId = resolvedSemester.id

    // ── Rooms (global, not semester-scoped) ──
    const rooms = await prisma.room.findMany({
      select: {
        id: true,
        name: true,
        building: true,
        capacity: true,
        type: true,
        isLinxiao: true,
        createdAt: true,
        updatedAt: true,
        availabilities: true,
      },
      orderBy: { id: 'asc' },
    })

    const roomList = rooms.map((r) => {
      const nameSuggests = nameSuggestsLinxiao(r.name, r.building)
      const isLx = typeof r.isLinxiao === 'boolean' ? r.isLinxiao : nameSuggests
      return {
        id: r.id,
        name: r.name,
        capacity: r.capacity,
        type: r.type,
        building: r.building,
        isLinxiao: isLx,
        linxiaoSource: isLx ? (typeof r.isLinxiao === 'boolean' ? 'room.isLinxiao' : 'room.name (fallback)') : null,
        nameSuggestsLinxiao: nameSuggests,
        linxiaoMismatch: nameSuggests !== isLx,
      }
    })

    const linxiaoRooms = roomList.filter((r) => r.isLinxiao)
    const missingCapacity = roomList.filter((r) => r.capacity == null || r.capacity === 0)
    const missingType = roomList.filter((r) => !r.type || r.type === '')

    // ── Violations (semester-scoped) ──
    const linxiaoIds = linxiaoRooms.map((r) => r.id)
    const violations: Array<{
      type: 'HC5_ROOM_UNAVAILABLE' | 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO'
      slotId: number
      courseName: string
      roomName: string | null
      reason: string
      dayOfWeek?: number
      slotIndex?: number
      source?: string
    }> = []

    // HC5: room unavailability — include secondary rooms (K36-B1A5) — K37-C: scoped to semesterId
    const unavailRecords = await prisma.roomAvailability.findMany({
      where: { available: false },
      include: { room: true },
    })
    const seenHc5Slots = new Set<number>()
    for (const ua of unavailRecords) {
      const slotsAtPos = await prisma.scheduleSlot.findMany({
        where: {
          semesterId,
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
        if (seenHc5Slots.has(slot.id)) continue
        seenHc5Slots.add(slot.id)
        violations.push({
          type: 'HC5_ROOM_UNAVAILABLE',
          slotId: slot.id,
          courseName: slot.teachingTask.course?.name ?? '?',
          roomName: ua.room?.name ?? null,
          reason: `${ua.room?.name ?? '?'} 在周${ua.dayOfWeek}第${ua.slotIndex}节不可用${ua.reason ? `（${ua.reason}）` : ''}`,
          dayOfWeek: ua.dayOfWeek,
          slotIndex: ua.slotIndex,
          source: slot.roomId === ua.roomId ? 'primary' : 'secondary',
        })
      }
    }

    // HC6: non-automotive in Linxiao — include secondary rooms (K36-B1A5) — K37-C: scoped to semesterId
    if (linxiaoIds.length > 0) {
      const slotsInLinxiao = await prisma.scheduleSlot.findMany({
        where: {
          semesterId,
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
      const seenHc6Slots = new Set<number>()
      for (const slot of slotsInLinxiao) {
        if (seenHc6Slots.has(slot.id)) continue
        seenHc6Slots.add(slot.id)
        const task = slot.teachingTask as unknown as TaskWithRelations
        const cls = classifySpecialty(task)
        if (cls === 'AUTOMOTIVE_ONLY') continue
        const effectiveLinxiaoRoomNames: string[] = []
        let hc6Source = 'primary'
        if (slot.roomId != null && linxiaoIds.includes(slot.roomId)) {
          effectiveLinxiaoRoomNames.push(slot.room?.name ?? String(slot.roomId))
        }
        for (const ar of slot.additionalRooms) {
          if (linxiaoIds.includes(ar.roomId)) {
            effectiveLinxiaoRoomNames.push(ar.room?.name ?? String(ar.roomId))
            hc6Source = 'secondary'
          }
        }
        violations.push({
          type: 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO',
          slotId: slot.id,
          courseName: task.course?.name ?? '?',
          roomName: effectiveLinxiaoRoomNames[0] ?? slot.room?.name ?? null,
          reason: `${task.course?.name ?? '?'} (分类: ${cls}) 不可在林校教室 ${effectiveLinxiaoRoomNames.join('、') || slot.room?.name || '?'}`,
          dayOfWeek: slot.dayOfWeek,
          slotIndex: slot.slotIndex,
          source: hc6Source,
        })
      }
    }

    const hc5Count = violations.filter((v) => v.type === 'HC5_ROOM_UNAVAILABLE').length
    const hc6Count = violations.filter((v) => v.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO').length
    const mismatchCount = roomList.filter((r) => r.linxiaoMismatch).length

    return NextResponse.json({
      success: true,
      semesterScoped: true,
      diagnosticsScope,
      resolvedSemester,
      semesterWarning,
      summary: {
        totalRooms: roomList.length,
        linxiaoRooms: linxiaoRooms.length,
        nonLinxiaoRooms: roomList.length - linxiaoRooms.length,
        missingCapacityRooms: missingCapacity.length,
        missingTypeRooms: missingType.length,
        hc5ViolationCount: hc5Count,
        hc6ViolationCount: hc6Count,
        linxiaoMismatchCount: mismatchCount,
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
      editability: {
        linxiaoEditable: true,
        detectionMethod: 'room.isLinxiao (persistent DB field)',
        legacyDetection: 'room.name contains "林校"',
        scope: 'Room.isLinxiao is a global Room attribute (not semester-scoped)',
      },
      automotiveKeywords: AUTOMOTIVE_KEYWORDS,
      automotiveClassification: {
        primarySignal: 'classGroup name 包含汽车专业关键词',
        auxiliarySignal: 'courseName 或 remark 包含汽车专业关键词',
        classifications: [
          { key: 'AUTOMOTIVE_ONLY', label: '纯汽车专业', hc6Exempt: true },
          { key: 'NON_AUTOMOTIVE_ONLY', label: '纯非汽车专业', hc6Exempt: false },
          { key: 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE', label: '混合专业', hc6Exempt: false },
          { key: 'NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL', label: '无班级（辅助信号=汽车）', hc6Exempt: false },
          { key: 'UNKNOWN_NO_SIGNAL', label: '无信号', hc6Exempt: false },
        ],
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
    { success: false, error: 'METHOD_NOT_ALLOWED', message: '校区教室规则设置不支持 POST，请使用 PATCH 更新教室林校状态' },
    { status: 405 },
  )
}
