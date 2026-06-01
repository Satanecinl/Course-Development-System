import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { resolveSchedulerSemester } from '@/lib/semester'

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('data:read', request)
    if ('error' in auth) return auth.error

    const { searchParams } = new URL(request.url)
    const semesterIdParam = searchParams.get('semesterId')
    const semester = await resolveSchedulerSemester({
      semesterId: semesterIdParam ? parseInt(semesterIdParam, 10) : undefined,
    })

    const classGroups = await prisma.classGroup.findMany({
      where: { semesterId: semester.id },
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
