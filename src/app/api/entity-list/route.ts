import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { activeCanonicalClassGroupWhere } from '@/lib/classgroup-global-query'

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('data:read', request)
    if ('error' in auth) return auth.error
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    if (type === 'classgroup') {
      // L8-C5A: ClassGroup is global master data — return active canonical
      // ClassGroups regardless of semester selection.
      const items = await prisma.classGroup.findMany({
        where: activeCanonicalClassGroupWhere(),
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
      return NextResponse.json(items)
    }

    if (type === 'teacher') {
      // Global — unscoped
      const items = await prisma.teacher.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
      return NextResponse.json(items)
    }

    if (type === 'room') {
      // Global — unscoped
      const items = await prisma.room.findMany({
        select: { id: true, name: true, building: true },
        orderBy: { name: 'asc' },
      })
      return NextResponse.json(items)
    }

    if (type === 'course') {
      // Global — unscoped
      const items = await prisma.course.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
      return NextResponse.json(items)
    }

    return NextResponse.json({ error: 'Invalid type. Use classgroup|teacher|room|course' }, { status: 400 })
  } catch (error) {
    console.error('Entity list error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
