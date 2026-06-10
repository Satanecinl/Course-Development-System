// src/app/api/schedule-adjustment-requests/mine/route.ts
// K28-A: USER lists their own adjustment requests.

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { listMyAdjustmentRequests } from '@/lib/schedule/adjustment-request-service'

export async function GET(request: NextRequest) {
  const auth = await requirePermission('adjustment-request:read', request)
  if ('error' in auth) return auth.error
  const user = auth.user

  try {
    const result = await listMyAdjustmentRequests(user.id)
    return NextResponse.json({
      success: true,
      total: result.total,
      items: result.items.map(serializeItem),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: 'INTERNAL', message },
      { status: 500 },
    )
  }
}

function serializeItem(r: Awaited<ReturnType<typeof listMyAdjustmentRequests>>['items'][number]) {
  return {
    id: r.id,
    status: r.status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED',
    semesterId: r.semesterId,
    semesterName: r.semester?.name,
    semesterCode: r.semester?.code,
    sourceScheduleSlotId: r.sourceScheduleSlotId,
    sourceDayOfWeek: r.sourceDayOfWeek,
    sourceSlotIndex: r.sourceSlotIndex,
    sourceRoomId: r.sourceRoomId,
    sourceRoomName: r.sourceScheduleSlot?.room?.name ?? null,
    sourceCourseName: r.sourceScheduleSlot?.teachingTask?.course?.name
      ?? r.teachingTask?.course?.name
      ?? '',
    sourceTeacherName: r.sourceScheduleSlot?.teachingTask?.teacher?.name ?? null,
    targetWeek: r.targetWeek,
    targetDayOfWeek: r.targetDayOfWeek,
    targetSlotIndex: r.targetSlotIndex,
    targetRoomId: r.targetRoomId,
    reason: r.reason,
    submittedByUserId: r.submittedByUserId,
    submittedByDisplayName: r.submittedByNameSnapshot ?? r.submittedBy?.displayName ?? '',
    submittedByRoleSnapshot: r.submittedByRoleSnapshot,
    submittedAt: r.createdAt.toISOString(),
    reviewedByUserId: r.reviewedByUserId,
    reviewedByDisplayName: r.reviewedByNameSnapshot ?? r.reviewedBy?.displayName ?? null,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewNote: r.reviewNote,
    approvedAdjustmentId: r.approvedAdjustmentId,
  }
}
