import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { validateSemesterCreate, parseDateOrNull } from '@/lib/semesters/semester-validation'
import { createSemester, getSemesterDependencies, formatSemesterSummary } from '@/lib/semesters/semester-service'

// GET /api/semesters — semester list for frontend selector (K25-E) with optional dependency counts (K25-H)
//
// Basic GET (no params): public read for SemesterSelector — no auth gate.
// ?includeCounts=true: requires settings:manage — returns dependency counts for admin UI.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeCounts = searchParams.get('includeCounts') === 'true'

    // includeCounts requires settings:manage (admin-only info)
    if (includeCounts) {
      const auth = await requirePermission('settings:manage', request)
      if ('error' in auth) return auth.error
    }

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
        createdAt: true,
        updatedAt: true,
      },
    })

    const active = semesters.find((s) => s.isActive)
    const totalCount = semesters.length

    const result = await Promise.all(
      semesters.map(async (s) => {
        const summary = formatSemesterSummary(s)

        if (!includeCounts) return summary

        const deps = await getSemesterDependencies(s.id)
        const canDelete = !s.isActive && totalCount > 1 && deps.total === 0
        const blockers: string[] = []
        if (s.isActive) blockers.push('当前激活学期')
        if (totalCount <= 1) blockers.push('系统最后一个学期')
        if (deps.total > 0) blockers.push(`已有 ${deps.total} 条业务数据`)

        return {
          ...summary,
          counts: deps,
          canDelete,
          deleteBlockers: blockers,
        }
      }),
    )

    return NextResponse.json({
      success: true,
      semesters: result,
      activeSemesterId: active?.id ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// POST /api/semesters — create a new semester (K25-H)
//
// Requires settings:manage permission.
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('settings:manage', request)
    if ('error' in auth) return auth.error

    const body = await request.json()

    // Validate
    const errors = validateSemesterCreate(body)
    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors[0].code, message: errors[0].message },
        { status: 400 },
      )
    }

    const name = String(body.name).trim()
    const code = String(body.code).trim()

    // Code uniqueness
    const existing = await prisma.semester.findUnique({ where: { code } })
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'SEMESTER_CODE_EXISTS', message: `学期代码 "${code}" 已存在` },
        { status: 409 },
      )
    }

    // Parse dates
    const startsAt = parseDateOrNull(body.startsAt)
    if (startsAt && typeof startsAt === 'object' && 'code' in startsAt) {
      return NextResponse.json({ success: false, error: startsAt.code, message: startsAt.message }, { status: 400 })
    }
    const endsAt = parseDateOrNull(body.endsAt)
    if (endsAt && typeof endsAt === 'object' && 'code' in endsAt) {
      return NextResponse.json({ success: false, error: endsAt.code, message: endsAt.message }, { status: 400 })
    }

    const semester = await createSemester({
      name,
      code,
      academicYear: body.academicYear ?? null,
      term: body.term ?? null,
      startsAt: startsAt as Date | null,
      endsAt: endsAt as Date | null,
      isActive: body.isActive ?? false,
    })

    return NextResponse.json({ success: true, semester }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: 'INTERNAL_ERROR', message }, { status: 500 })
  }
}
