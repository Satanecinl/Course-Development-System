import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { hashPassword } from '@/lib/auth/crypto'

// GET /api/admin/users — list all users
export async function GET(request: NextRequest) {
  const auth = await requirePermission('users:manage', request)
  if ('error' in auth) return auth.error

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        isActive: true,
        createdAt: true,
        userRoles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    })

    const usersWithRoles = users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      isActive: u.isActive,
      createdAt: u.createdAt,
      roles: u.userRoles.map((ur) => ur.role.name),
    }))

    return NextResponse.json({ success: true, users: usersWithRoles })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// POST /api/admin/users — create a new user
export async function POST(request: NextRequest) {
  const auth = await requirePermission('users:manage', request)
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const { username, password, displayName } = body

    // Validation
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: '用户名和密码不能为空' },
        { status: 400 },
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: '密码长度不能少于 8 位' },
        { status: 400 },
      )
    }

    // Check username uniqueness
    const existingUser = await prisma.user.findUnique({
      where: { username },
    })
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: '用户名已存在' },
        { status: 409 },
      )
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user with USER role
    const userRole = await prisma.role.findUnique({
      where: { name: 'USER' },
    })

    if (!userRole) {
      return NextResponse.json(
        { success: false, error: 'USER 角色不存在，请先运行 seed:auth' },
        { status: 500 },
      )
    }

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        displayName: displayName || username,
        isActive: true,
        userRoles: {
          create: {
            roleId: userRole.id,
          },
        },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        isActive: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ success: true, user })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
