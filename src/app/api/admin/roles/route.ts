import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'

// GET /api/admin/roles — list all roles
export async function GET(request: NextRequest) {
  const auth = await requirePermission('users:manage', request)
  if ('error' in auth) return auth.error

  try {
    const roles = await prisma.role.findMany({
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: { id: 'asc' },
    })

    return NextResponse.json({ success: true, roles })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
