import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('data:read', request)
    if ('error' in auth) return auth.error

    const rooms = await prisma.room.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, capacity: true, building: true },
    })
    return NextResponse.json(rooms)
  } catch (error) {
    console.error('Rooms fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
