// src/lib/schedule/adjustment-request-service.ts
// K28-A: Service layer for USER adjustment request → ADMIN approval flow.
//
// Invariants enforced by this service (and verified by the verify script):
//   1. SUBMIT: USER dry-runs first; if not clean, no PENDING row is created.
//   2. SUBMIT: does NOT mutate any ScheduleSlot and does NOT create an
//      ACTIVE ScheduleAdjustment. The official schedule is unchanged.
//   3. CANCEL: only the original submitter can cancel a PENDING request.
//      Cancel does NOT mutate the official schedule.
//   4. APPROVE: re-runs dry-run against the CURRENT (latest) state. Only
//      creates a ScheduleAdjustment (status=ACTIVE) if the dry-run is clean.
//   5. REJECT: only changes the request status. Does NOT mutate the
//      official schedule.
//   6. Every transition records submittedBy / reviewedBy (User FK +
//      nameSnapshot + roleSnapshot for audit-trail even if the user is
//      later deleted).

import { prisma } from '@/lib/prisma'
import { resolveSchedulerSemester } from '@/lib/semester'
import { dryRunScheduleAdjustment } from './adjustments'
import type { ScheduleAdjustmentInput } from '@/types/schedule-adjustment'
import type { Prisma } from '@prisma/client'

// ── Types ──

export type AdjustmentRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export interface SubmitterSnapshot {
  id: number
  username: string
  displayName: string
  roles: string[]
}

export interface SubmitRequestInput {
  sourceScheduleSlotId: number
  /**
   * K32-A2: 当前 dashboard 查看周次（即"原位置"周次）。Optional。
   * 写入 ScheduleAdjustmentRequest.sourceWeek，让导出能输出具体日期。
   * null/undefined 仍然允许（向后兼容历史数据，导出 fallback "第?周 星期X"）。
   */
  sourceWeek?: number | null
  targetWeek: number
  targetDayOfWeek: number
  targetSlotIndex: number
  targetRoomId?: number | null
  reason?: string | null
  /** Optional; resolved from active semester if not provided. */
  semesterId?: number | null
  submitter: SubmitterSnapshot
}

export interface CancelRequestInput {
  requestId: number
  submitter: SubmitterSnapshot
}

export interface ApproveRequestInput {
  requestId: number
  reviewer: SubmitterSnapshot
  reviewNote?: string | null
}

export interface RejectRequestInput {
  requestId: number
  reviewer: SubmitterSnapshot
  reviewNote: string
}

export interface ListFilter {
  status?: AdjustmentRequestStatus | 'ALL'
  semesterId?: number | null
  submittedByUserId?: number | null
  limit?: number
  offset?: number
}

// ── Submit ──

export async function submitAdjustmentRequest(input: SubmitRequestInput) {
  // Resolve semester (caller may pass; otherwise active)
  const semester = await resolveSchedulerSemester({
    semesterId: input.semesterId ?? undefined,
  })
  const semesterId = semester.id

  // Load source slot
  const sourceSlot = await prisma.scheduleSlot.findUnique({
    where: { id: input.sourceScheduleSlotId },
    include: {
      teachingTask: {
        include: {
          course: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
        },
      },
      room: { select: { id: true, name: true } },
    },
  })
  if (!sourceSlot) {
    return { success: false, error: 'SOURCE_SLOT_NOT_FOUND' as const }
  }
  if (sourceSlot.semesterId !== semesterId) {
    return { success: false, error: 'SOURCE_SLOT_SEMESTER_MISMATCH' as const }
  }

  // Build ScheduleAdjustmentInput mirroring the existing dry-run contract.
  // We use type=MOVE because the newScheduleAdjustmentRequest represents a
  // user asking to move (or change room) of a slot; CANCEL is the alternate
  // type and is supported by the same path.
  const dryRunInput: ScheduleAdjustmentInput = {
    type: 'MOVE',
    week: input.targetWeek,
    originalSlotId: sourceSlot.id,
    newDayOfWeek: input.targetDayOfWeek,
    newSlotIndex: input.targetSlotIndex,
    newRoomId: input.targetRoomId ?? null,
    reason: input.reason ?? null,
    semesterId,
  }

  // Run dry-run. This does NOT mutate the official schedule.
  const dryRun = await dryRunScheduleAdjustment(dryRunInput)
  if (!dryRun.canApply) {
    return {
      success: false,
      error: 'DRY_RUN_FAILED' as const,
      dryRun,
    }
  }

  // Create PENDING request. We DO NOT touch ScheduleSlot, and we DO NOT
  // create an ACTIVE ScheduleAdjustment here.
  const request = await prisma.scheduleAdjustmentRequest.create({
    data: {
      semesterId,
      sourceScheduleSlotId: sourceSlot.id,
      teachingTaskId: sourceSlot.teachingTaskId,
      sourceWeek: input.sourceWeek ?? null, // K32-A2: 之前永远写 null，现在用 caller 传入的 sourceWeek
      sourceDayOfWeek: sourceSlot.dayOfWeek,
      sourceSlotIndex: sourceSlot.slotIndex,
      sourceRoomId: sourceSlot.roomId ?? null,
      targetWeek: input.targetWeek,
      targetDayOfWeek: input.targetDayOfWeek,
      targetSlotIndex: input.targetSlotIndex,
      targetRoomId: input.targetRoomId ?? null,
      reason: input.reason ?? null,
      status: 'PENDING',
      submittedByUserId: input.submitter.id,
      submittedByNameSnapshot: input.submitter.displayName,
      submittedByRoleSnapshot: input.submitter.roles.join(','),
    },
  })

  return { success: true, request, dryRun }
}

// ── Cancel (submitter cancels their own PENDING request) ──

export async function cancelAdjustmentRequest(input: CancelRequestInput) {
  const request = await prisma.scheduleAdjustmentRequest.findUnique({
    where: { id: input.requestId },
  })
  if (!request) {
    return { success: false, error: 'REQUEST_NOT_FOUND' as const }
  }
  if (request.submittedByUserId !== input.submitter.id) {
    return { success: false, error: 'NOT_OWNER' as const }
  }
  if (request.status !== 'PENDING') {
    return {
      success: false,
      error: 'NOT_PENDING' as const,
      currentStatus: request.status,
    }
  }

  const updated = await prisma.scheduleAdjustmentRequest.update({
    where: { id: request.id },
    data: { status: 'CANCELLED' },
  })
  return { success: true, request: updated }
}

// ── Approve (ADMIN) ──

export async function approveAdjustmentRequest(input: ApproveRequestInput) {
  const request = await prisma.scheduleAdjustmentRequest.findUnique({
    where: { id: input.requestId },
  })
  if (!request) {
    return { success: false, error: 'REQUEST_NOT_FOUND' as const }
  }
  if (request.status !== 'PENDING') {
    return {
      success: false,
      error: 'NOT_PENDING' as const,
      currentStatus: request.status,
    }
  }

  // CRITICAL: re-run dry-run against CURRENT state. The user-submitted
  // dry-run may have passed at submit-time, but conflicts may have
  // appeared since.
  const dryRunInput: ScheduleAdjustmentInput = {
    type: 'MOVE',
    week: request.targetWeek,
    originalSlotId: request.sourceScheduleSlotId,
    newDayOfWeek: request.targetDayOfWeek,
    newSlotIndex: request.targetSlotIndex,
    newRoomId: request.targetRoomId ?? null,
    reason: request.reason ?? null,
    semesterId: request.semesterId,
  }
  const dryRun = await dryRunScheduleAdjustment(dryRunInput)
  if (!dryRun.canApply) {
    return {
      success: false,
      error: 'DRY_RUN_FAILED_AT_APPROVAL' as const,
      dryRun,
    }
  }

  // Create the actual ScheduleAdjustment (status=ACTIVE).
  // This re-uses the existing createScheduleAdjustment, which itself runs
  // dry-run + create inside a single operation. We intentionally do not
  // call createScheduleAdjustment because we want the WHOLE approve flow
  // to be transactional AND we want the request to also be updated.
  const result = await prisma.$transaction(async (tx) => {
    // Re-create dry-run-checked adjustment (we know it canApply because
    // we just checked above).
    const adjustment = await tx.scheduleAdjustment.create({
      data: {
        type: 'MOVE',
        week: request.targetWeek,
        targetWeek: null,
        originalSlotId: request.sourceScheduleSlotId,
        newDayOfWeek: request.targetDayOfWeek,
        newSlotIndex: request.targetSlotIndex,
        newRoomId: request.targetRoomId ?? null,
        reason: request.reason ?? null,
        semesterId: request.semesterId,
        status: 'ACTIVE',
      },
    })

    const updated = await tx.scheduleAdjustmentRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        reviewedByUserId: input.reviewer.id,
        reviewedByNameSnapshot: input.reviewer.displayName,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote ?? null,
        approvedAdjustmentId: adjustment.id,
      },
    })

    return { adjustment, request: updated }
  })

  return { success: true, ...result }
}

// ── Reject (ADMIN) ──

export async function rejectAdjustmentRequest(input: RejectRequestInput) {
  const request = await prisma.scheduleAdjustmentRequest.findUnique({
    where: { id: input.requestId },
  })
  if (!request) {
    return { success: false, error: 'REQUEST_NOT_FOUND' as const }
  }
  if (request.status !== 'PENDING') {
    return {
      success: false,
      error: 'NOT_PENDING' as const,
      currentStatus: request.status,
    }
  }
  if (!input.reviewNote || input.reviewNote.trim().length === 0) {
    return { success: false, error: 'REVIEW_NOTE_REQUIRED' as const }
  }

  const updated = await prisma.scheduleAdjustmentRequest.update({
    where: { id: request.id },
    data: {
      status: 'REJECTED',
      reviewedByUserId: input.reviewer.id,
      reviewedByNameSnapshot: input.reviewer.displayName,
      reviewedAt: new Date(),
      reviewNote: input.reviewNote,
    },
  })
  return { success: true, request: updated }
}

// ── List ──

export async function listAdjustmentRequests(filter: ListFilter) {
  const where: Prisma.ScheduleAdjustmentRequestWhereInput = {}
  if (filter.status && filter.status !== 'ALL') {
    where.status = filter.status
  }
  if (filter.semesterId != null) {
    where.semesterId = filter.semesterId
  }
  if (filter.submittedByUserId != null) {
    where.submittedByUserId = filter.submittedByUserId
  }

  const items = await prisma.scheduleAdjustmentRequest.findMany({
    where,
    include: {
      sourceScheduleSlot: {
        include: {
          teachingTask: { include: { course: true, teacher: true } },
          room: true,
        },
      },
      teachingTask: { include: { course: true } },
      submittedBy: { select: { id: true, username: true, displayName: true } },
      reviewedBy: { select: { id: true, username: true, displayName: true } },
      approvedAdjustment: true,
      semester: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: filter.limit ?? 100,
    skip: filter.offset ?? 0,
  })

  const total = await prisma.scheduleAdjustmentRequest.count({ where })
  return { items, total }
}

// ── List by submitter (USER's "mine") ──

export async function listMyAdjustmentRequests(submitterId: number) {
  return listAdjustmentRequests({ submittedByUserId: submitterId, limit: 100 })
}
