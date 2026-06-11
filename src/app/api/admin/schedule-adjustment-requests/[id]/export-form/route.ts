// src/app/api/admin/schedule-adjustment-requests/[id]/export-form/route.ts
// K32-A: ADMIN 调课申请表 Excel 导出
//
// - 鉴权：requirePermission('adjustment-request:review')，与 /api/admin/schedule-adjustment-requests
//   完全一致（管理员可访问任意用户的申请）。
// - 只读：不调用 prisma.*.create/update/delete/upsert/deleteMany/updateMany/$transaction，
//   不调用 dryRunScheduleAdjustment，不修改 ScheduleSlot / ScheduleAdjustment。
// - 模板：项目相对路径 templates/串课申请表模板.xlsx；缺失返回 500 TEMPLATE_NOT_FOUND。

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import {
  buildAdjustmentApplicationFormWorkbook,
  loadRequestForExport,
  safeFilename,
  templateExists,
} from '@/lib/schedule/adjustment-application-form'

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('adjustment-request:review', request)
  if ('error' in auth) return auth.error

  let requestId: number
  try {
    const { id } = await ctx.params
    const n = Number.parseInt(id, 10)
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json(
        { success: false, error: 'INVALID_INPUT', message: 'id 必须为正整数' },
        { status: 400 },
      )
    }
    requestId = n
  } catch {
    return NextResponse.json(
      { success: false, error: 'INVALID_INPUT', message: 'id 解析失败' },
      { status: 400 },
    )
  }

  if (!templateExists()) {
    return NextResponse.json(
      { success: false, error: 'TEMPLATE_NOT_FOUND', message: '导出模板缺失' },
      { status: 500 },
    )
  }

  const req = await loadRequestForExport(requestId)
  if (!req) {
    return NextResponse.json(
      { success: false, error: 'REQUEST_NOT_FOUND', message: '未找到该申请' },
      { status: 404 },
    )
  }

  // ADMIN：无所有权检查（与 listAdjustmentRequests admin route 一致）。

  try {
    const { workbook } = await buildAdjustmentApplicationFormWorkbook(req)
    const buffer = await workbook.xlsx.writeBuffer()
    const filename = safeFilename(
      req.teachingTask?.course?.name ?? '',
      req.submittedByNameSnapshot ?? req.submittedBy?.displayName ?? '',
      req.id,
    )
    const headers = new Headers()
    headers.set(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    return new NextResponse(buffer, { headers })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'UNKNOWN'
    return NextResponse.json(
      { success: false, error: 'INTERNAL', message },
      { status: 500 },
    )
  }
}
