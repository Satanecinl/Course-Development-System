import { prisma } from '@/lib/prisma'
import { buildInitialState } from './solver'
import { calculateInitialScore, calculateScoreWithDetails } from './score'
import {
  computeDatabaseFingerprintFromSlots,
} from './preview'
import type {
  SchedulingContext,
  SlotWithRelations,
  TaskWithRelations,
  RoomWithAvailability,
} from './types'
import type { Prisma } from '@prisma/client'

// ── Types ──

export interface RollbackOptions {
  applyRunId: number
  confirmRollback?: boolean
  operatorId?: number | null
  operatorName?: string | null
}

export interface RollbackResult {
  rollbackRunId: number
  applyRunId: number
  status: 'COMPLETED' | 'FAILED' | 'BLOCKED'
  rolledBackSlotCount: number
  hardScoreAfter: number
  softScoreAfter: number
  hc1After: number
  hc2After: number
  hc3After: number
  hc4After: number
  databaseFingerprintBefore: string
  databaseFingerprintAfter: string
  changeCount: number
  durationMs: number
}

// ── Helpers ──

function countConflictsByType(
  details: { type: string }[],
): { hc1: number; hc2: number; hc3: number; hc4: number } {
  let hc1 = 0, hc2 = 0, hc3 = 0, hc4 = 0
  for (const d of details) {
    if (d.type === 'HC1_ROOM_CONFLICT') hc1++
    else if (d.type === 'HC2_TEACHER_CONFLICT') hc2++
    else if (d.type === 'HC3_CLASS_CONFLICT') hc3++
    else if (d.type === 'HC4_CAPACITY') hc4++
  }
  return { hc1, hc2, hc3, hc4 }
}

/**
 * Load scheduling context using a given Prisma client (supports transaction client).
 */
async function loadSchedulingContextWithClient(
  client: Prisma.TransactionClient | typeof prisma,
): Promise<SchedulingContext> {
  const [tasks, rooms, slots] = await Promise.all([
    client.teachingTask.findMany({
      include: {
        course: true,
        teacher: true,
        taskClasses: { include: { classGroup: true } },
      },
    }) as Promise<TaskWithRelations[]>,
    client.room.findMany({
      include: { availabilities: true },
    }) as Promise<RoomWithAvailability[]>,
    client.scheduleSlot.findMany({
      include: {
        room: true,
        teachingTask: {
          include: {
            course: true,
            teacher: true,
            taskClasses: { include: { classGroup: true } },
          },
        },
      },
    }) as Promise<SlotWithRelations[]>,
  ])

  const taskById = new Map<number, TaskWithRelations>()
  for (const t of tasks) taskById.set(t.id, t)

  const roomById = new Map<number, RoomWithAvailability>()
  for (const r of rooms) roomById.set(r.id, r)

  const slotsByTask = new Map<number, SlotWithRelations[]>()
  const slotsByRoom = new Map<string, SlotWithRelations[]>()
  const slotsByTeacher = new Map<string, SlotWithRelations[]>()
  const slotsByClass = new Map<string, SlotWithRelations[]>()

  for (const slot of slots) {
    const { teachingTaskId, roomId, dayOfWeek, slotIndex } = slot
    const task = slot.teachingTask

    let arr = slotsByTask.get(teachingTaskId)
    if (!arr) { arr = []; slotsByTask.set(teachingTaskId, arr) }
    arr.push(slot)

    if (roomId != null) {
      const rk = `${roomId}-${dayOfWeek}-${slotIndex}`
      let rArr = slotsByRoom.get(rk)
      if (!rArr) { rArr = []; slotsByRoom.set(rk, rArr) }
      rArr.push(slot)
    }

    if (task.teacherId != null) {
      const tk = `${task.teacherId}-${dayOfWeek}-${slotIndex}`
      let tArr = slotsByTeacher.get(tk)
      if (!tArr) { tArr = []; slotsByTeacher.set(tk, tArr) }
      tArr.push(slot)
    }

    for (const tc of task.taskClasses) {
      const ck = `${tc.classGroupId}-${dayOfWeek}-${slotIndex}`
      let cArr = slotsByClass.get(ck)
      if (!cArr) { cArr = []; slotsByClass.set(ck, cArr) }
      cArr.push(slot)
    }
  }

  return {
    tasks,
    rooms,
    slots,
    taskById,
    roomById,
    slotsByTask,
    slotsByRoom,
    slotsByTeacher,
    slotsByClass,
  }
}

// ── Main Service ──

const SOLVER_VERSION = 'lahc-hard-first-v3'

export async function rollbackSchedulerApply(
  options: RollbackOptions,
): Promise<RollbackResult> {
  const startedAt = new Date()

  // 1. Confirm rollback guard
  if (options.confirmRollback !== true) {
    throw new Error('CONFIRM_ROLLBACK_REQUIRED')
  }

  // 2. Read apply run
  const applyRun = await prisma.schedulingRun.findUnique({
    where: { id: options.applyRunId },
  })

  if (!applyRun) {
    throw new Error('APPLY_RUN_NOT_FOUND')
  }

  // 3. Validate apply run state
  if (applyRun.mode !== 'APPLY') {
    throw new Error('INVALID_APPLY_MODE')
  }
  if (applyRun.rolledBackAt != null) {
    throw new Error('APPLY_RUN_ALREADY_ROLLED_BACK')
  }
  if (applyRun.status !== 'COMPLETED') {
    throw new Error('APPLY_NOT_COMPLETED')
  }

  // 4. Check no existing completed rollback for this apply run
  const existingRollback = await prisma.schedulingRun.findFirst({
    where: {
      rollbackOfRunId: applyRun.id,
      status: 'COMPLETED',
    },
  })
  if (existingRollback) {
    throw new Error('ROLLBACK_ALREADY_EXISTS')
  }

  // 5. Read SchedulerRunChange records
  const applyChanges = await prisma.schedulerRunChange.findMany({
    where: { runId: applyRun.id },
    orderBy: { id: 'asc' },
  })

  if (applyChanges.length === 0) {
    throw new Error('APPLY_CHANGES_EMPTY')
  }
  if (applyRun.changedSlotCount !== applyChanges.length) {
    throw new Error('APPLY_CHANGED_SLOT_COUNT_MISMATCH')
  }

  // 6. Compute current database fingerprint
  const currentSlots = await prisma.scheduleSlot.findMany({
    select: {
      id: true,
      teachingTaskId: true,
      dayOfWeek: true,
      slotIndex: true,
      roomId: true,
    },
    orderBy: { id: 'asc' },
  })
  const currentFingerprint = computeDatabaseFingerprintFromSlots(currentSlots)

  // 7. Pre-validate: every target slot exists and current values match apply new values
  const currentSlotMap = new Map(currentSlots.map((s) => [s.id, s]))
  for (const change of applyChanges) {
    const slot = currentSlotMap.get(change.scheduleSlotId)
    if (!slot) {
      throw new Error(`SLOT_NOT_FOUND: ${change.scheduleSlotId}`)
    }

    const currentRoomId = slot.roomId ?? null
    const expectedNewRoomId = change.newRoomId ?? null
    if (
      slot.dayOfWeek !== change.newDayOfWeek ||
      slot.slotIndex !== change.newSlotIndex ||
      currentRoomId !== expectedNewRoomId
    ) {
      throw new Error(
        `SLOT_STATE_MISMATCH: ${change.scheduleSlotId} ` +
        `current=(${slot.dayOfWeek},${slot.slotIndex},${currentRoomId}) ` +
        `expected=(${change.newDayOfWeek},${change.newSlotIndex},${expectedNewRoomId})`,
      )
    }
  }

  const databaseFingerprintBefore = currentFingerprint

  // 8. Execute in transaction
  const rollbackResult = await prisma.$transaction(async (tx) => {
    // 8a. Create ROLLBACK run
    const rollbackRun = await tx.schedulingRun.create({
      data: {
        configId: applyRun.configId,
        mode: 'ROLLBACK',
        status: 'ROLLING_BACK',
        operatorId: options.operatorId ?? null,
        operatorNameSnapshot: options.operatorName ?? null,
        startedAt,
        rollbackOfRunId: applyRun.id,
        hardScoreBefore: applyRun.hardScoreAfter,
        softScoreBefore: applyRun.softScoreAfter,
        hc1Before: applyRun.hc1After,
        hc2Before: applyRun.hc2After,
        hc3Before: applyRun.hc3After,
        hc4Before: applyRun.hc4After,
        databaseFingerprint: databaseFingerprintBefore,
        changedSlotCount: applyChanges.length,
        solverVersion: SOLVER_VERSION,
      },
    })

    // 8b. Read slots to be restored within transaction
    const slotIds = applyChanges.map((c) => c.scheduleSlotId)
    const txSlots = await tx.scheduleSlot.findMany({
      where: { id: { in: slotIds } },
    })
    const txSlotMap = new Map(txSlots.map((s) => [s.id, s]))

    // 8c. Validate and create reverse changes + restore slots
    for (const change of applyChanges) {
      const slot = txSlotMap.get(change.scheduleSlotId)
      if (!slot) {
        throw new Error(`TX_SLOT_NOT_FOUND: ${change.scheduleSlotId}`)
      }

      // Verify current values match apply new values
      const currentRoomId = slot.roomId ?? null
      const expectedNewRoomId = change.newRoomId ?? null
      if (
        slot.dayOfWeek !== change.newDayOfWeek ||
        slot.slotIndex !== change.newSlotIndex ||
        currentRoomId !== expectedNewRoomId
      ) {
        throw new Error(
          `TX_SLOT_STATE_MISMATCH: ${change.scheduleSlotId} ` +
          `current=(${slot.dayOfWeek},${slot.slotIndex},${currentRoomId}) ` +
          `expected=(${change.newDayOfWeek},${change.newSlotIndex},${expectedNewRoomId})`,
        )
      }

      // Create reverse SchedulerRunChange (old=new, new=old)
      await tx.schedulerRunChange.create({
        data: {
          runId: rollbackRun.id,
          scheduleSlotId: change.scheduleSlotId,
          teachingTaskId: change.teachingTaskId,
          oldDayOfWeek: change.newDayOfWeek,
          oldSlotIndex: change.newSlotIndex,
          oldRoomId: change.newRoomId,
          newDayOfWeek: change.oldDayOfWeek,
          newSlotIndex: change.oldSlotIndex,
          newRoomId: change.oldRoomId,
          courseNameSnapshot: change.courseNameSnapshot,
          teacherNameSnapshot: change.teacherNameSnapshot,
          classGroupsSnapshot: change.classGroupsSnapshot,
          roomNameOldSnapshot: change.roomNameNewSnapshot,
          roomNameNewSnapshot: change.roomNameOldSnapshot,
        },
      })

      // Restore ScheduleSlot to old values
      await tx.scheduleSlot.update({
        where: { id: change.scheduleSlotId },
        data: {
          dayOfWeek: change.oldDayOfWeek,
          slotIndex: change.oldSlotIndex,
          roomId: change.oldRoomId,
        },
      })
    }

    // 8d. Post-rollback scoring inside transaction
    const postCtx = await loadSchedulingContextWithClient(tx)
    const postState = buildInitialState(postCtx)
    const postScore = calculateInitialScore(postCtx, postState)
    const postDetails = calculateScoreWithDetails(postCtx, postState)
    const postHc = countConflictsByType(postDetails.details)

    // 8e. Compute post-rollback fingerprint
    const postSlots = await tx.scheduleSlot.findMany({
      select: {
        id: true,
        teachingTaskId: true,
        dayOfWeek: true,
        slotIndex: true,
        roomId: true,
      },
      orderBy: { id: 'asc' },
    })
    const postFingerprint = computeDatabaseFingerprintFromSlots(postSlots)

    // 8f. Update ROLLBACK run to COMPLETED
    const completedAt = new Date()
    const durationMs = completedAt.getTime() - startedAt.getTime()

    const updatedRollbackRun = await tx.schedulingRun.update({
      where: { id: rollbackRun.id },
      data: {
        status: 'COMPLETED',
        completedAt,
        durationMs,
        hardScore: postScore.hardScore,
        softScore: postScore.softScore,
        hardScoreAfter: postScore.hardScore,
        softScoreAfter: postScore.softScore,
        hc1After: postHc.hc1,
        hc2After: postHc.hc2,
        hc3After: postHc.hc3,
        hc4After: postHc.hc4,
        databaseFingerprint: postFingerprint,
        resultSnapshot: JSON.stringify({
          postScore,
          postHc,
          changesRestored: applyChanges.length,
          applyRunId: applyRun.id,
        }),
        conflictSummary: JSON.stringify({
          HC1: postHc.hc1,
          HC2: postHc.hc2,
          HC3: postHc.hc3,
          HC4: postHc.hc4,
        }),
      },
    })

    // 8g. Update original apply run to mark rolled back
    await tx.schedulingRun.update({
      where: { id: applyRun.id },
      data: {
        status: 'ROLLED_BACK',
        rolledBackAt: completedAt,
      },
    })

    return {
      rollbackRunId: updatedRollbackRun.id,
      status: updatedRollbackRun.status as 'COMPLETED',
      hardScoreAfter: postScore.hardScore,
      softScoreAfter: postScore.softScore,
      hc1After: postHc.hc1,
      hc2After: postHc.hc2,
      hc3After: postHc.hc3,
      hc4After: postHc.hc4,
      databaseFingerprintAfter: postFingerprint,
    }
  })

  const completedAt = new Date()
  const durationMs = completedAt.getTime() - startedAt.getTime()

  return {
    rollbackRunId: rollbackResult.rollbackRunId,
    applyRunId: options.applyRunId,
    status: rollbackResult.status,
    rolledBackSlotCount: applyChanges.length,
    hardScoreAfter: rollbackResult.hardScoreAfter,
    softScoreAfter: rollbackResult.softScoreAfter,
    hc1After: rollbackResult.hc1After,
    hc2After: rollbackResult.hc2After,
    hc3After: rollbackResult.hc3After,
    hc4After: rollbackResult.hc4After,
    databaseFingerprintBefore,
    databaseFingerprintAfter: rollbackResult.databaseFingerprintAfter,
    changeCount: applyChanges.length,
    durationMs,
  }
}
