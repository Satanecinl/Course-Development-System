import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('data:write', request)
    if ('error' in auth) return auth.error
    const body = await request.json()
    const { name } = body as { name?: string }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Course name is required' }, { status: 400 })
    }

    const trimmedName = name.trim()

    const existing = await prisma.course.findUnique({
      where: { name: trimmedName },
      select: { id: true, name: true },
    })

    if (existing) {
      return NextResponse.json(existing)
    }

    const course = await prisma.course.create({
      data: { name: trimmedName },
      select: { id: true, name: true },
    })

    return NextResponse.json(course, { status: 201 })
  } catch (error) {
    console.error('Course create error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
