import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'

// ── Types ──

interface RunListItem {
  id: number
  mode: string | null
  status: string
  createdAt: string
  completedAt: string | null
  durationMs: number | null

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
}

interface RunListResponse {
  success: boolean
  data: {
    items: RunListItem[]
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

// ── Helpers ──

function parseIntParam(value: string | null, defaultValue: number, min: number, max: number): number {
  if (!value) return defaultValue
  const n = parseInt(value, 10)
  if (isNaN(n)) return defaultValue
  return Math.min(Math.max(n, min), max)
}

function toISOStringOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null
}

function mapRunToListItem(run: {
  id: number
  mode: string
  status: string
  createdAt: Date
  completedAt: Date | null
  durationMs: number | null
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
  previewExpiresAt: Date | null
  appliedAt: Date | null
  rolledBackAt: Date | null
  rollbackOfRunId: number | null
  databaseFingerprint: string | null
  operatorNameSnapshot: string | null
}): RunListItem {
  return {
    id: run.id,
    mode: run.mode,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    completedAt: toISOStringOrNull(run.completedAt),
    durationMs: run.durationMs,
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
  }
}

// ── GET /api/admin/scheduler/runs ──

export async function GET(request: NextRequest) {
  const auth = await requirePermission('schedule:adjust', request)
  if ('error' in auth) return auth.error

  try {
    const { searchParams } = new URL(request.url)

    // Pagination
    const page = parseIntParam(searchParams.get('page'), 1, 1, 10000)
    const pageSize = parseIntParam(searchParams.get('pageSize'), 20, 1, 100)
    const skip = (page - 1) * pageSize

    // Filters
    const mode = searchParams.get('mode')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (mode) {
      where.mode = mode.toUpperCase()
    }
    if (status) {
      where.status = status.toUpperCase()
    }

    // Count total
    const total = await prisma.schedulingRun.count({ where })

    // Fetch items
    const runs = await prisma.schedulingRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        mode: true,
        status: true,
        createdAt: true,
        completedAt: true,
        durationMs: true,
        hardScoreBefore: true,
        hardScoreAfter: true,
        softScoreBefore: true,
        softScoreAfter: true,
        hc1Before: true,
        hc1After: true,
        hc2Before: true,
        hc2After: true,
        hc3Before: true,
        hc3After: true,
        hc4Before: true,
        hc4After: true,
        changedSlotCount: true,
        previewExpiresAt: true,
        appliedAt: true,
        rolledBackAt: true,
        rollbackOfRunId: true,
        databaseFingerprint: true,
        operatorNameSnapshot: true,
      },
    })

    const totalPages = Math.ceil(total / pageSize)

    const body: RunListResponse = {
      success: true,
      data: {
        items: runs.map(mapRunToListItem),
        page,
        pageSize,
        total,
        totalPages,
      },
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
