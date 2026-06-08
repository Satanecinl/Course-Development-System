import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/semesters — read-only semester list for frontend selector (K25-E)
//
// Returns all semesters ordered by id (most recent first) plus the
// currently active semester id. No auth gate — the list is non-sensitive
// and used broadly by the semester selector UI.
export async function GET() {
  try {
    const semesters = await prisma.semester.findMany({
      orderBy: { id: 'desc' },
      select: {
        id: true,
        name: true,
        code: true,
        academicYear: true,
        term: true,
        startsAt: true,
        endsAt: true,
        isActive: true,
      },
    })

    const active = semesters.find((s) => s.isActive)

    return NextResponse.json({
      success: true,
      semesters,
      activeSemesterId: active?.id ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
