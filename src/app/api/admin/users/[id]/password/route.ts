import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { hashPassword } from '@/lib/auth/crypto'

interface RouteContext {
  params: Promise<{ id: string }>
}

// PATCH /api/admin/users/[id]/password — reset user password
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requirePermission('users:manage', request)
  if ('error' in auth) return auth.error

  try {
    const { id: idStr } = await context.params
    const id = parseInt(idStr, 10)

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { success: false, error: '无效的用户 ID' },
        { status: 400 },
      )
    }

    const body = await request.json()
    const { password } = body

    // Validation
    if (!password) {
      return NextResponse.json(
        { success: false, error: '密码不能为空' },
        { status: 400 },
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: '密码长度不能少于 8 位' },
        { status: 400 },
      )
    }

    // Check user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, isActive: true },
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 },
      )
    }

    // Hash new password
    const passwordHash = await hashPassword(password)

    // Update password and revoke all sessions in a transaction
    await prisma.$transaction(async (tx) => {
      // Update password
      await tx.user.update({
        where: { id },
        data: { passwordHash },
      })

      // Revoke all active sessions for this user
      await tx.session.updateMany({
        where: {
          userId: id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      })
    })

    return NextResponse.json({
      success: true,
      message: '密码已重置，用户所有会话已撤销',
      userId: id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
