// src/app/api/admin/users/[id]/route.ts
// K33-A: PATCH (update displayName) + DELETE (safe delete with dependency checks)

import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'

// ── Helpers ──

const SUCCESS_RESPONSE = { success: true as const }

// ── PATCH: Update displayName ──

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('users:manage', request)
  if ('error' in auth) return auth.error

  const { id: idStr } = await ctx.params
  const userId = Number.parseInt(idStr, 10)
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json(
      { success: false, error: 'INVALID_INPUT', message: 'id 必须为正整数' },
      { status: 400 },
    )
  }

  const body = await request.json().catch(() => ({}))
  const { displayName } = body ?? {}

  // displayName validation: must be non-empty string, trimmed, 1-50 chars
  if (typeof displayName !== 'string') {
    return NextResponse.json(
      { success: false, error: 'INVALID_INPUT', message: 'displayName 必须为字符串' },
      { status: 400 },
    )
  }
  const trimmed = displayName.trim()
  if (trimmed.length === 0) {
    return NextResponse.json(
      { success: false, error: 'INVALID_INPUT', message: 'displayName 不能为空' },
      { status: 400 },
    )
  }
  if (trimmed.length > 50) {
    return NextResponse.json(
      { success: false, error: 'INVALID_INPUT', message: 'displayName 长度不能超过 50 字符' },
      { status: 400 },
    )
  }

  // Find the user
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'USER_NOT_FOUND', message: '用户不存在' },
      { status: 404 },
    )
  }

  // Update only displayName
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { displayName: trimmed },
    select: { id: true, username: true, displayName: true },
  })

  return NextResponse.json({
    success: true,
    user: updated,
  })
}

// ── DELETE: Safe delete with dependency checks ──

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('users:manage', request)
  if ('error' in auth) return auth.error
  const currentUser = auth.user

  const { id: idStr } = await ctx.params
  const userId = Number.parseInt(idStr, 10)
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json(
      { success: false, error: 'INVALID_INPUT', message: 'id 必须为正整数' },
      { status: 400 },
    )
  }

  // 1. User not found
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: { role: { select: { name: true } } },
      },
    },
  })
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'USER_NOT_FOUND', message: '用户不存在' },
      { status: 404 },
    )
  }

  // 2. Self-delete forbidden
  if (user.id === currentUser.id) {
    return NextResponse.json(
      { success: false, error: 'SELF_DELETE_FORBIDDEN', message: '不能删除当前登录用户' },
      { status: 409 },
    )
  }

  // 3. Built-in admin (username === 'admin') forbidden
  if (user.username === 'admin') {
    return NextResponse.json(
      { success: false, error: 'BUILTIN_ADMIN_DELETE_FORBIDDEN', message: '不能删除内置 admin 用户' },
      { status: 409 },
    )
  }

  // 4. Last ADMIN forbidden
  const isAdmin = user.userRoles.some((ur) => ur.role.name === 'ADMIN')
  if (isAdmin) {
    const adminCount = await prisma.userRole.count({
      where: {
        role: { name: 'ADMIN' },
      },
    })
    if (adminCount <= 1) {
      return NextResponse.json(
        { success: false, error: 'LAST_ADMIN_DELETE_FORBIDDEN', message: '不能删除最后一个 ADMIN 用户' },
        { status: 409 },
      )
    }
  }

  // 5. Business dependency check
  const [submittedCount, reviewedCount, schedulingRunCount] = await Promise.all([
    prisma.scheduleAdjustmentRequest.count({ where: { submittedByUserId: userId } }),
    prisma.scheduleAdjustmentRequest.count({ where: { reviewedByUserId: userId } }),
    prisma.schedulingRun.count({ where: { operatorId: userId } }),
  ])

  const dependencies: Record<string, number> = {}
  if (submittedCount > 0) dependencies.submittedAdjustmentRequests = submittedCount
  if (reviewedCount > 0) dependencies.reviewedAdjustmentRequests = reviewedCount
  if (schedulingRunCount > 0) dependencies.schedulingRuns = schedulingRunCount

  if (Object.keys(dependencies).length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'USER_HAS_DEPENDENCIES',
        message: '该用户已有业务记录，不能删除。请使用"停用"。',
        dependencies,
      },
      { status: 409 },
    )
  }

  // 6. Safe to delete — use transaction to ensure consistency
  //    UserRole and Session are ON DELETE CASCADE, so prisma.user.delete
  //    will clean them up automatically.
  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ])

  return NextResponse.json(SUCCESS_RESPONSE)
}
