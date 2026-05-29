import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'

interface RouteContext {
  params: Promise<{ id: string }>
}

// PATCH /api/admin/users/[id]/status — enable or disable user
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
    const { isActive } = body

    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'isActive 必须为布尔值' },
        { status: 400 },
      )
    }

    // Check user exists
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 },
      )
    }

    // Prevent disabling the last active ADMIN
    if (!isActive) {
      const isAdmin = user.userRoles.some((ur) => ur.role.name === 'ADMIN')
      if (isAdmin) {
        const activeAdminCount = await prisma.user.count({
          where: {
            isActive: true,
            userRoles: {
              some: {
                role: { name: 'ADMIN' },
              },
            },
          },
        })
        if (activeAdminCount <= 1) {
          return NextResponse.json(
            { success: false, error: '不能停用最后一个管理员账号' },
            { status: 400 },
          )
        }
      }
    }

    // Update user status
    const updated = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        username: true,
        displayName: true,
        isActive: true,
      },
    })

    return NextResponse.json({ success: true, user: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
