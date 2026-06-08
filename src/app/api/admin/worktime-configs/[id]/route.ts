/**
 * src/app/api/admin/worktime-configs/[id]/route.ts
 *
 * K26-G: WorkTime config get/update/delete API.
 *
 * GET    - Get a single worktime config by ID
 * PUT    - Update a worktime config
 * DELETE - Delete a worktime config (with protection)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-permission'
import {
  getWorkTimeConfig,
  updateWorkTimeConfig,
  deleteWorkTimeConfig,
} from '@/lib/worktime/worktime-service'
import { validateUpdateWorkTimeConfig } from '@/lib/worktime/worktime-validation'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  try {
    const { id: idStr } = await params
    const id = Number(idStr)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json(
        { success: false, error: 'INVALID_REQUEST', message: 'Invalid id' },
        { status: 400 },
      )
    }

    const result = await getWorkTimeConfig(id)
    if (!result.ok) {
      const status = result.error === 'WORKTIME_CONFIG_NOT_FOUND' ? 404 : 400
      return NextResponse.json(
        { success: false, error: result.error, message: result.message },
        { status },
      )
    }

    return NextResponse.json({ success: true, item: result.data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: 'INVALID_REQUEST', message },
      { status: 500 },
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  try {
    const { id: idStr } = await params
    const id = Number(idStr)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json(
        { success: false, error: 'INVALID_REQUEST', message: 'Invalid id' },
        { status: 400 },
      )
    }

    const body = await request.json()

    // Validate input
    const validation = validateUpdateWorkTimeConfig(body)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error, message: validation.message },
        { status: 400 },
      )
    }

    const result = await updateWorkTimeConfig(id, body)
    if (!result.ok) {
      const status =
        result.error === 'WORKTIME_CONFIG_NOT_FOUND' ? 404 :
        result.error === 'WORKTIME_CONFIG_NAME_EXISTS' ? 409 :
        400
      return NextResponse.json(
        { success: false, error: result.error, message: result.message },
        { status },
      )
    }

    return NextResponse.json({ success: true, item: result.data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: 'INVALID_REQUEST', message },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('settings:manage', request)
  if ('error' in auth) return auth.error

  try {
    const { id: idStr } = await params
    const id = Number(idStr)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json(
        { success: false, error: 'INVALID_REQUEST', message: 'Invalid id' },
        { status: 400 },
      )
    }

    const result = await deleteWorkTimeConfig(id)
    if (!result.ok) {
      const status =
        result.error === 'WORKTIME_CONFIG_NOT_FOUND' ? 404 :
        result.error === 'WORKTIME_CONFIG_DEFAULT_IN_USE' ? 409 :
        result.error === 'WORKTIME_CONFIG_LAST_ACTIVE' ? 409 :
        result.error === 'WORKTIME_CONFIG_USED_BY_RUN' ? 409 :
        400
      return NextResponse.json(
        { success: false, error: result.error, message: result.message },
        { status },
      )
    }

    return NextResponse.json({ success: true, id: result.data.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: 'INVALID_REQUEST', message },
      { status: 500 },
    )
  }
}
