// src/app/api/admin/scheduler/preview/route.ts
// K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION
//
// POST /api/admin/scheduler/preview
//
// Body (new + legacy compatible):
//   {
//     semesterId?: number,
//     maxIterations?: number,      // legacy top-level
//     lahcWindowSize?: number,     // legacy top-level
//     randomSeed?: number | null,  // legacy top-level
//     lockedSlotIds?: number[],    // legacy top-level
//     configId?: number,           // NEW: load from DB
//     overrides?: {                // NEW: take precedence over config
//       maxIterations?: number,
//       lahcWindowSize?: number,
//       randomSeed?: number | null,
//       lockedSlotIds?: number[],
//     },
//   }
//
// Resolution priority: overrides  >  configId  >  legacy top-level  >  server default
//
// The resolved config is written into SchedulingRun.resultSnapshot.config
// (additive — preserves existing scoreBefore/After, hcBefore/After, etc.).

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSchedulerPreview } from '@/lib/scheduler/preview'
import { prisma } from '@/lib/prisma'
import { resolveSchedulerSemester } from '@/lib/semester'
import {
  resolveConfigForPreview,
  validatePreviewOverrides,
  SchedulingConfigNotFoundError,
  SemesterMismatchError,
} from '@/lib/scheduler/config'

interface PreviewRequest {
  maxIterations?: number
  lahcWindowSize?: number
  randomSeed?: number
  lockedSlotIds?: number[]
  semesterId?: number
  configId?: number
  overrides?: {
    maxIterations?: number
    lahcWindowSize?: number
    randomSeed?: number | null
    lockedSlotIds?: number[]
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const body: PreviewRequest = await request.json().catch(() => ({}))

    // Resolve semester first (so we can validate configId against it).
    const semester = await resolveSchedulerSemester({
      semesterId: typeof body.semesterId === 'number' ? body.semesterId : undefined,
    })

    // Validate overrides
    let validatedOverrides: ReturnType<typeof validatePreviewOverrides> = {}
    if (body.overrides !== undefined && body.overrides !== null) {
      try {
        validatedOverrides = validatePreviewOverrides(body.overrides)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json(
          { success: false, error: 'INVALID_OVERRIDE', message },
          { status: 400 },
        )
      }
    }

    // Resolve the effective config
    const resolved = await resolveConfigForPreview({
      configId: body.configId,
      overrides: validatedOverrides,
      legacyTopLevel: {
        maxIterations: typeof body.maxIterations === 'number' ? body.maxIterations : undefined,
        lahcWindowSize: typeof body.lahcWindowSize === 'number' ? body.lahcWindowSize : undefined,
        randomSeed: typeof body.randomSeed === 'number' ? body.randomSeed : undefined,
        lockedSlotIds: Array.isArray(body.lockedSlotIds) ? body.lockedSlotIds : undefined,
      },
      semesterId: semester.id,
    })

    // Validate lockedSlotIds (real ScheduleSlot.id values, semester-scoped)
    if (resolved.lockedSlotIds.length > 0) {
      if (resolved.lockedSlotIds.length > 1000) {
        return NextResponse.json(
          { success: false, error: 'TOO_MANY_LOCKED_SLOTS', message: 'Maximum 1000 locked slots allowed' },
          { status: 400 },
        )
      }
      const existingSlots = await prisma.scheduleSlot.findMany({
        where: { id: { in: resolved.lockedSlotIds } },
        select: { id: true, semesterId: true },
      })
      const existingIds = new Set(existingSlots.map((s) => s.id))
      const invalidIds = resolved.lockedSlotIds.filter((id) => !existingIds.has(id))
      if (invalidIds.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'INVALID_SLOT_IDS',
            message: `The following slot IDs do not exist: ${invalidIds.join(', ')}`,
            invalidIds,
          },
          { status: 400 },
        )
      }
      const wrongSemesterSlots = existingSlots.filter((s) => s.semesterId !== semester.id)
      if (wrongSemesterSlots.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'LOCKED_SLOT_SEMESTER_MISMATCH',
            message: `The following slot IDs belong to a different semester: ${wrongSemesterSlots.map((s) => s.id).join(', ')}`,
            mismatchedIds: wrongSemesterSlots.map((s) => s.id),
          },
          { status: 400 },
        )
      }
    }

    // Pass resolved values to the existing preview pipeline.
    // The resultSnapshot.config sub-object is built by preview.ts after this returns.
    const result = await createSchedulerPreview({
      maxIterations: resolved.maxIterations,
      lahcWindowSize: resolved.lahcWindowSize,
      randomSeed: resolved.randomSeed,
      lockedSlotIds: resolved.lockedSlotIds,
      operatorId: auth.user.id,
      operatorName: auth.user.displayName,
      semesterId: semester.id,
      configId: resolved.configId ?? undefined,
      // Pass the snapshot config so preview.ts can write it into resultSnapshot.
      resolvedConfigSnapshot: {
        configId: resolved.configId,
        name: resolved.name,
        maxIterations: resolved.maxIterations,
        lahcWindowSize: resolved.lahcWindowSize,
        randomSeed: resolved.randomSeed,
        lockedSlotIds: resolved.lockedSlotIds,
        solverVersion: resolved.solverVersion,
        source: resolved.source,
        snapshotTakenAt: resolved.snapshotTakenAt,
      },
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[scheduler/preview] error:', message)

    // Map known errors
    if (e instanceof SchedulingConfigNotFoundError) {
      return NextResponse.json(
        { success: false, error: 'SCHEDULING_CONFIG_NOT_FOUND', message: e.message },
        { status: 404 },
      )
    }
    if (e instanceof SemesterMismatchError) {
      return NextResponse.json(
        { success: false, error: 'SEMESTER_MISMATCH', message: e.message },
        { status: 400 },
      )
    }

    const knownErrors: Record<string, { code: string; status: number }> = {
      SEMESTER_NOT_FOUND: { code: 'SEMESTER_NOT_FOUND', status: 400 },
      NO_ACTIVE_SEMESTER: { code: 'NO_ACTIVE_SEMESTER', status: 400 },
      MULTIPLE_ACTIVE_SEMESTERS: { code: 'MULTIPLE_ACTIVE_SEMESTERS', status: 400 },
    }

    for (const [prefix, resp] of Object.entries(knownErrors)) {
      if (message.startsWith(prefix)) {
        return NextResponse.json(
          { success: false, error: resp.code, message },
          { status: resp.status },
        )
      }
    }

    return NextResponse.json(
      { success: false, error: 'PREVIEW_FAILED', message },
      { status: 500 },
    )
  }
}
