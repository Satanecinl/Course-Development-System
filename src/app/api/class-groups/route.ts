import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { activeCanonicalClassGroupWhere } from '@/lib/classgroup-global-query'

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('data:read', request)
    if ('error' in auth) return auth.error

    // L8-C5A: ClassGroup is global master data — return active canonical
    // ClassGroups regardless of semester selection.
    const classGroups = await prisma.classGroup.findMany({
      where: activeCanonicalClassGroupWhere(),
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    return NextResponse.json(classGroups)
  } catch (error) {
    console.error('Class groups fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
