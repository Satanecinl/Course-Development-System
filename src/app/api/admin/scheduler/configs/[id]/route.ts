// src/app/api/admin/scheduler/configs/[id]/route.ts
// K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION
//
// GET    /api/admin/scheduler/configs/[id]   fetch one config
// PUT    /api/admin/scheduler/configs/[id]   partial update
// DELETE /api/admin/scheduler/configs/[id]   delete (409 CONFIG_IN_USE if referenced)
//
// Permission: schedule:adjust

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import {
  validateConfigPayload,
  mapConfigToDto,
  serializeLockedSlotIds,
} from '@/lib/scheduler/config'

function parseId(idParam: string): number | null {
  const n = parseInt(idParam, 10)
  if (Number.isNaN(n) || n <= 0) return null
  return n
}

// ─── GET /api/admin/scheduler/configs/[id] ──────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const { id: idParam } = await params
    const id = parseId(idParam)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: 'INVALID_CONFIG_ID', message: 'id must be a positive integer' },
        { status: 400 },
      )
    }

    const config = await prisma.schedulingConfig.findUnique({ where: { id } })
    if (!config) {
      return NextResponse.json(
        { success: false, error: 'SCHEDULING_CONFIG_NOT_FOUND', message: `Config ${id} not found` },
        { status: 404 },
      )
    }

    return NextResponse.json({ success: true, config: mapConfigToDto(config) })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[scheduler/configs/id] GET error:', message)
    return NextResponse.json(
      { success: false, error: 'FETCH_FAILED', message },
      { status: 500 },
    )
  }
}

// ─── PUT /api/admin/scheduler/configs/[id] ──────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const { id: idParam } = await params
    const id = parseId(idParam)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: 'INVALID_CONFIG_ID', message: 'id must be a positive integer' },
        { status: 400 },
      )
    }

    const existing = await prisma.schedulingConfig.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'SCHEDULING_CONFIG_NOT_FOUND', message: `Config ${id} not found` },
        { status: 404 },
      )
    }

    const body: Record<string, unknown> = await request.json().catch(() => ({}))
    const v = validateConfigPayload(body, { nameRequired: false })
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

    const data: Record<string, unknown> = {}
    if (input.name !== undefined) data.name = input.name
    if (input.semesterId !== undefined) data.semesterId = input.semesterId
    if (input.maxIterations !== undefined) data.maxIterations = input.maxIterations
    if (input.lahcWindowSize !== undefined) data.lahcWindowSize = input.lahcWindowSize
    if (input.randomSeed !== undefined) data.randomSeed = input.randomSeed
    if (input.solverVersion !== undefined) data.solverVersion = input.solverVersion
    if (input.lockedSlotIds !== undefined) {
      data.lockedSlotIds = serializeLockedSlotIds(input.lockedSlotIds)
    }

    const updated = await prisma.schedulingConfig.update({ where: { id }, data })
    return NextResponse.json({ success: true, config: mapConfigToDto(updated) })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[scheduler/configs/id] PUT error:', message)
    return NextResponse.json(
      { success: false, error: 'UPDATE_FAILED', message },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/admin/scheduler/configs/[id] ───────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const { id: idParam } = await params
    const id = parseId(idParam)
    if (id == null) {
      return NextResponse.json(
        { success: false, error: 'INVALID_CONFIG_ID', message: 'id must be a positive integer' },
        { status: 400 },
      )
    }

    const existing = await prisma.schedulingConfig.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'SCHEDULING_CONFIG_NOT_FOUND', message: `Config ${id} not found` },
        { status: 404 },
      )
    }

    // 409 CONFIG_IN_USE: any SchedulingRun referencing this config
    const referencingRuns = await prisma.schedulingRun.findMany({
      where: { configId: id },
      select: { id: true },
      take: 100,
    })
    if (referencingRuns.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'CONFIG_IN_USE',
          message: `Cannot delete config: ${referencingRuns.length} SchedulingRun(s) reference this config`,
          runIds: referencingRuns.map((r) => r.id),
        },
        { status: 409 },
      )
    }

    await prisma.schedulingConfig.delete({ where: { id } })
    return NextResponse.json({ success: true, deleted: true, id })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[scheduler/configs/id] DELETE error:', message)
    return NextResponse.json(
      { success: false, error: 'DELETE_FAILED', message },
      { status: 500 },
    )
  }
}
