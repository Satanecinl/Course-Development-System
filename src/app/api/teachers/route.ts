import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('data:read', request)
    if ('error' in auth) return auth.error
    const teachers = await prisma.teacher.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    return NextResponse.json(teachers)
  } catch (error) {
    console.error('Teachers fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('data:write', request)
    if ('error' in auth) return auth.error
    const body = await request.json()
    const { name } = body as { name?: string }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Teacher name is required' }, { status: 400 })
    }

    const trimmedName = name.trim()

    const existing = await prisma.teacher.findUnique({
      where: { name: trimmedName },
      select: { id: true, name: true },
    })

    if (existing) {
      return NextResponse.json(existing)
    }

    const teacher = await prisma.teacher.create({
      data: { name: trimmedName },
      select: { id: true, name: true },
    })

    return NextResponse.json(teacher, { status: 201 })
  } catch (error) {
    console.error('Teacher create error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
