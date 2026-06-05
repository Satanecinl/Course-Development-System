// src/app/api/admin/scheduler/configs/route.ts
// K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION
//
// GET  /api/admin/scheduler/configs           list configs (optional ?semesterId=)
// POST /api/admin/scheduler/configs           create new config
//
// Permission: schedule:adjust
// No business data writes outside SchedulingConfig table.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import {
  validateConfigPayload,
  mapConfigToDto,
  serializeLockedSlotIds,
} from '@/lib/scheduler/config'

// ─── GET /api/admin/scheduler/configs ───────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const semesterIdParam = searchParams.get('semesterId')

    let where: { semesterId?: number | null } = {}
    if (semesterIdParam != null) {
      const sid = parseInt(semesterIdParam, 10)
      if (Number.isNaN(sid) || sid <= 0) {
        return NextResponse.json(
          { success: false, error: 'INVALID_SEMESTER_ID', message: 'semesterId must be a positive integer' },
          { status: 400 },
        )
      }
      where = { semesterId: sid }
    }

    const configs = await prisma.schedulingConfig.findMany({
      where,
      orderBy: [{ semesterId: 'asc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({
      success: true,
      configs: configs.map(mapConfigToDto),
      total: configs.length,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[scheduler/configs] GET error:', message)
    return NextResponse.json(
      { success: false, error: 'FETCH_FAILED', message },
      { status: 500 },
    )
  }
}

// ─── POST /api/admin/scheduler/configs ──────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const body: Record<string, unknown> = await request.json().catch(() => ({}))

    const v = validateConfigPayload(body, { nameRequired: true })
    if (!v.ok || !v.value) {
      return NextResponse.json(
        { success: false, error: v.error, message: v.message },
        { status: 400 },
      )
    }
    const input = v.value

    // semesterId must exist if provided
    if (input.semesterId != null) {
      const semester = await prisma.semester.findUnique({ where: { id: input.semesterId } })
      if (!semester) {
        return NextResponse.json(
          { success: false, error: 'SEMESTER_NOT_FOUND', message: `Semester ${input.semesterId} not found` },
          { status: 400 },
        )
      }
    }

    const created = await prisma.schedulingConfig.create({
      data: {
        name: input.name,
        semesterId: input.semesterId,
        maxIterations: input.maxIterations ?? 10000,
        lahcWindowSize: input.lahcWindowSize ?? 500,
        randomSeed: input.randomSeed ?? null,
        solverVersion: input.solverVersion ?? null,
        lockedSlotIds: serializeLockedSlotIds(input.lockedSlotIds),
        // lockedTaskIds stays default "[]"
      },
    })

    return NextResponse.json({ success: true, config: mapConfigToDto(created) }, { status: 201 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[scheduler/configs] POST error:', message)
    return NextResponse.json(
      { success: false, error: 'CREATE_FAILED', message },
      { status: 500 },
    )
  }
}
