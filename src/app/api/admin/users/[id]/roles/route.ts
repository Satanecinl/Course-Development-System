import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'

interface RouteContext {
  params: Promise<{ id: string }>
}

// PATCH /api/admin/users/[id]/roles — update user roles
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
    const { roleIds } = body

    if (!Array.isArray(roleIds)) {
      return NextResponse.json(
        { success: false, error: 'roleIds 必须为数组' },
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

    // Validate all role IDs exist
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } },
    })

    if (roles.length !== roleIds.length) {
      const foundIds = new Set(roles.map((r) => r.id))
      const missingIds = roleIds.filter((id: number) => !foundIds.has(id))
      return NextResponse.json(
        { success: false, error: `以下角色 ID 不存在: ${missingIds.join(', ')}` },
        { status: 400 },
      )
    }

    // Check if removing ADMIN role from last active ADMIN
    const currentRoleNames = new Set(user.userRoles.map((ur) => ur.role.name))
    const newRoleNames = new Set(roles.map((r) => r.name))

    // If user currently has ADMIN but new roles don't include ADMIN
    if (currentRoleNames.has('ADMIN') && !newRoleNames.has('ADMIN')) {
      // Check if this is the last active ADMIN
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
          { success: false, error: '不能移除最后一个管理员的 ADMIN 角色' },
          { status: 400 },
        )
      }
    }

    // Update user roles in a transaction
    await prisma.$transaction(async (tx) => {
      // Remove all existing roles
      await tx.userRole.deleteMany({
        where: { userId: id },
      })

      // Add new roles
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId: number) => ({
            userId: id,
            roleId,
          })),
        })
      }
    })

    // Fetch updated user with roles
    const updatedUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
        isActive: true,
        userRoles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser!.id,
        username: updatedUser!.username,
        displayName: updatedUser!.displayName,
        isActive: updatedUser!.isActive,
        roles: updatedUser!.userRoles.map((ur) => ur.role),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
