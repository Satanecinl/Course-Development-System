// src/app/api/admin/schedule-adjustment-requests/route.ts
// K28-A: ADMIN lists all adjustment requests.

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { listAdjustmentRequests } from '@/lib/schedule/adjustment-request-service'

export async function GET(request: NextRequest) {
  const auth = await requirePermission('adjustment-request:review', request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? 'ALL'
    const semesterIdParam = searchParams.get('semesterId')
    const submittedByUserIdParam = searchParams.get('submittedByUserId')
    const result = await listAdjustmentRequests({
      status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'ALL',
      semesterId: semesterIdParam ? Number(semesterIdParam) : null,
      submittedByUserId: submittedByUserIdParam ? Number(submittedByUserIdParam) : null,
      limit: 200,
    })
    return NextResponse.json({
      success: true,
      total: result.total,
      items: result.items.map(serializeItem),
    })
  } catch (error) {
    const isPrismaDelegateError = error instanceof TypeError && error.message.includes('findMany')
    const message = isPrismaDelegateError
      ? 'Prisma Client 需要重新生成，请重启开发服务器 (npx prisma generate && npm run dev)'
      : error instanceof Error ? '获取调课申请列表失败' : '获取调课申请列表失败'
    return NextResponse.json(
      { success: false, error: 'INTERNAL', message },
      { status: 500 },
    )
  }
}

function serializeItem(r: Awaited<ReturnType<typeof listAdjustmentRequests>>['items'][number]) {
  return {
    id: r.id,
    status: r.status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED',
    semesterId: r.semesterId,
    semesterName: r.semester?.name,
    semesterCode: r.semester?.code,
    sourceScheduleSlotId: r.sourceScheduleSlotId,
    sourceWeek: r.sourceWeek ?? null, // K32-A3: 返回 sourceWeek（历史数据可能为 null）
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
    targetRoomName: null as string | null, // K32-A3: target room name 未在 list 查询中 include，暂为 null
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
