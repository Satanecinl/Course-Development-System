import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'

// ── Types ──

interface RunDetail {
  id: number
  mode: string | null
  status: string
  createdAt: string
  completedAt: string | null
  startedAt: string | null
  durationMs: number | null
  iterations: number | null
  randomSeed: number | null
  solverVersion: string | null

  hardScoreBefore: number | null
  hardScoreAfter: number | null
  softScoreBefore: number | null
  softScoreAfter: number | null

  hc1Before: number | null
  hc1After: number | null
  hc2Before: number | null
  hc2After: number | null
  hc3Before: number | null
  hc3After: number | null
  hc4Before: number | null
  hc4After: number | null

  changedSlotCount: number
  previewExpiresAt: string | null
  appliedAt: string | null
  rolledBackAt: string | null
  rollbackOfRunId: number | null
  databaseFingerprint: string | null
  operatorNameSnapshot: string | null
  errorMessage: string | null

  lockedSlotIds: number[]
  lockedSlotCount: number
}

interface ChangeDetail {
  id: number
  scheduleSlotId: number
  teachingTaskId: number
  courseName: string | null
  teacherName: string | null
  classGroups: string | null
  oldDayOfWeek: number | null
  oldSlotIndex: number | null
  oldRoomName: string | null
  newDayOfWeek: number | null
  newSlotIndex: number | null
  newRoomName: string | null
  createdAt: string
}

interface RunDetailResponse {
  success: boolean
  data: {
    run: RunDetail
    changes: ChangeDetail[]
  }
}

// ── Helpers ──

function toISOStringOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null
}

// ── GET /api/admin/scheduler/runs/[id] ──

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const { id: idParam } = await params
    const runId = parseInt(idParam, 10)

    if (isNaN(runId) || runId <= 0) {
      return NextResponse.json(
        { success: false, error: 'INVALID_RUN_ID', message: 'runId must be a positive integer' },
        { status: 400 },
      )
    }

    const run = await prisma.schedulingRun.findUnique({
      where: { id: runId },
      include: {
        changes: {
          orderBy: { id: 'asc' },
        },
      },
    })

    if (!run) {
      return NextResponse.json(
        { success: false, error: 'RUN_NOT_FOUND', message: `SchedulingRun #${runId} not found` },
        { status: 404 },
      )
    }

    // Parse lockedSlotIds from resultSnapshot
    let lockedSlotIds: number[] = []
    let lockedSlotCount = 0
    if (run.resultSnapshot) {
      try {
        const snapshot = JSON.parse(run.resultSnapshot)
        lockedSlotIds = snapshot.lockedSlotIds ?? []
        lockedSlotCount = snapshot.lockedSlotCount ?? lockedSlotIds.length
      } catch {
        // Ignore parse errors
      }
    }

    const runDetail: RunDetail = {
      id: run.id,
      mode: run.mode,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      completedAt: toISOStringOrNull(run.completedAt),
      startedAt: toISOStringOrNull(run.startedAt),
      durationMs: run.durationMs,
      iterations: run.iterations,
      randomSeed: run.randomSeed,
      solverVersion: run.solverVersion,
      hardScoreBefore: run.hardScoreBefore,
      hardScoreAfter: run.hardScoreAfter,
      softScoreBefore: run.softScoreBefore,
      softScoreAfter: run.softScoreAfter,
      hc1Before: run.hc1Before,
      hc1After: run.hc1After,
      hc2Before: run.hc2Before,
      hc2After: run.hc2After,
      hc3Before: run.hc3Before,
      hc3After: run.hc3After,
      hc4Before: run.hc4Before,
      hc4After: run.hc4After,
      changedSlotCount: run.changedSlotCount,
      previewExpiresAt: toISOStringOrNull(run.previewExpiresAt),
      appliedAt: toISOStringOrNull(run.appliedAt),
      rolledBackAt: toISOStringOrNull(run.rolledBackAt),
      rollbackOfRunId: run.rollbackOfRunId,
      databaseFingerprint: run.databaseFingerprint,
      operatorNameSnapshot: run.operatorNameSnapshot,
      errorMessage: run.errorMessage,
      lockedSlotIds,
      lockedSlotCount,
    }

    const changes: ChangeDetail[] = run.changes.map((c) => ({
      id: c.id,
      scheduleSlotId: c.scheduleSlotId,
      teachingTaskId: c.teachingTaskId,
      courseName: c.courseNameSnapshot,
      teacherName: c.teacherNameSnapshot,
      classGroups: c.classGroupsSnapshot,
      oldDayOfWeek: c.oldDayOfWeek,
      oldSlotIndex: c.oldSlotIndex,
      oldRoomName: c.roomNameOldSnapshot,
      newDayOfWeek: c.newDayOfWeek,
      newSlotIndex: c.newSlotIndex,
      newRoomName: c.roomNameNewSnapshot,
      createdAt: c.createdAt.toISOString(),
    }))

    const body: RunDetailResponse = {
      success: true,
      data: { run: runDetail, changes },
    }

    return NextResponse.json(body)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { success: false, error: 'FETCH_FAILED', message },
      { status: 500 },
    )
  }
}
