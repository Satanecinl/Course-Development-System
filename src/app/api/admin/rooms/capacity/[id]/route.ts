import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { getRoomCapacityRow } from '@/lib/rooms/capacity'

// ── PATCH /api/admin/rooms/capacity/[id] ──

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const { id: idParam } = await params
    const roomId = parseInt(idParam, 10)

    if (isNaN(roomId) || roomId <= 0) {
      return NextResponse.json(
        { success: false, error: 'INVALID_ROOM_ID', message: 'roomId must be a positive integer' },
        { status: 400 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const { capacity, confirm } = body as { capacity?: number; confirm?: boolean }

    // ── Parameter validation ──

    if (confirm !== true) {
      return NextResponse.json(
        { success: false, error: 'CONFIRM_REQUIRED', message: 'confirm must be true' },
        { status: 400 },
      )
    }

    if (typeof capacity !== 'number' || !Number.isInteger(capacity)) {
      return NextResponse.json(
        { success: false, error: 'INVALID_CAPACITY', message: 'capacity must be an integer' },
        { status: 400 },
      )
    }

    if (capacity < 1) {
      return NextResponse.json(
        { success: false, error: 'CAPACITY_TOO_SMALL', message: 'capacity must be >= 1' },
        { status: 400 },
      )
    }

    if (capacity > 10000) {
      return NextResponse.json(
        { success: false, error: 'CAPACITY_TOO_LARGE', message: 'capacity must be <= 10000' },
        { status: 400 },
      )
    }

    // ── Read current room ──

    const room = await prisma.room.findUnique({
      where: { id: roomId },
    })

    if (!room) {
      return NextResponse.json(
        { success: false, error: 'ROOM_NOT_FOUND', message: `Room #${roomId} not found` },
        { status: 404 },
      )
    }

    if (room.capacity === capacity) {
      return NextResponse.json({
        success: true,
        data: {
          id: room.id,
          name: room.name,
          oldCapacity: room.capacity,
          newCapacity: capacity,
          updated: false,
          maxAssignedStudentCount: 0,
          suggestedCapacity: null,
          warning: null,
        },
      })
    }

    // ── Compute current usage for safety check ──

    const capacityRow = await getRoomCapacityRow(roomId)
    const maxAssignedStudentCount = capacityRow?.maxAssignedStudentCount ?? 0
    const suggestedCapacity =
      maxAssignedStudentCount > 0 ? Math.ceil(maxAssignedStudentCount * 1.1) : null

    // ── Safety: reject if capacity < current max usage ──

    if (capacity < maxAssignedStudentCount) {
      return NextResponse.json(
        {
          success: false,
          error: 'CAPACITY_BELOW_USAGE',
          message: `容量 ${capacity} 低于当前已安排最大人数 ${maxAssignedStudentCount}，可能制造 HC4 容量冲突`,
          data: {
            id: room.id,
            name: room.name,
            oldCapacity: room.capacity,
            newCapacity: capacity,
            updated: false,
            maxAssignedStudentCount,
            suggestedCapacity,
            warning: `容量低于当前已安排最大人数 ${maxAssignedStudentCount}，修改被阻止`,
          },
        },
        { status: 400 },
      )
    }

    // ── Update ──

    const updatedRoom = await prisma.room.update({
      where: { id: roomId },
      data: { capacity },
    })

    // ── Warning if below suggested ──

    let warning: string | null = null
    if (suggestedCapacity != null && capacity < suggestedCapacity) {
      warning = `当前容量 ${capacity} 低于建议容量 ${suggestedCapacity}`
    }

    return NextResponse.json({
      success: true,
      data: {
        id: updatedRoom.id,
        name: updatedRoom.name,
        oldCapacity: room.capacity,
        newCapacity: updatedRoom.capacity,
        updated: true,
        maxAssignedStudentCount,
        suggestedCapacity,
        warning,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { success: false, error: 'UPDATE_FAILED', message },
      { status: 500 },
    )
  }
}
