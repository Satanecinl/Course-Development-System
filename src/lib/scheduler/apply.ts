import { prisma } from '@/lib/prisma'
import { buildInitialState } from './solver'
import { calculateInitialScore, calculateScoreWithDetails } from './score'
import {
  computeSemesterScopedFingerprint,
  type PreviewProposedChange,
} from './preview'
import {
  readWorkTimeSnapshotFromRun,
  toReadMetadata,
  type SchedulingRunWorkTimeSnapshot,
  type WorkTimeSnapshotReadMetadata,
  WorkTimeSnapshotInvalidError,
} from '@/lib/worktime/worktime-snapshot'
import type {
  SchedulingContext,
  SlotWithRelations,
  TaskWithRelations,
  RoomWithAvailability,
} from './types'
import type { Prisma } from '@prisma/client'

// ── Types ──

export interface ApplyOptions {
  previewRunId: number
  confirmApply?: boolean
  operatorId?: number | null
  operatorName?: string | null
}

export interface ApplyResult {
  applyRunId: number
  previewRunId: number
  status: 'COMPLETED' | 'FAILED' | 'BLOCKED'
  appliedSlotCount: number
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
  // K26-J2: WorkTime snapshot metadata carried from the preview run.
  // Apply does NOT re-resolve the current WorkTime; the snapshot on
  // the preview run is the single source of truth for this apply.
  workTimeSnapshot: WorkTimeSnapshotReadMetadata
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
 * Scoped by semesterId when provided.
 */
async function loadSchedulingContextWithClient(
  client: Prisma.TransactionClient | typeof prisma,
  semesterId?: number,
): Promise<SchedulingContext> {
  const taskWhere = semesterId != null ? { semesterId } : {}
  const slotWhere = semesterId != null ? { semesterId } : {}

  const [tasks, rooms, slots] = await Promise.all([
    client.teachingTask.findMany({
      where: taskWhere,
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
      where: slotWhere,
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

export async function applySchedulerPreview(
  options: ApplyOptions,
): Promise<ApplyResult> {
  const startedAt = new Date()

  // 1. Confirm apply guard
  if (options.confirmApply !== true) {
    throw new Error('CONFIRM_APPLY_REQUIRED')
  }

  // 2. Read preview run
  const previewRun = await prisma.schedulingRun.findUnique({
    where: { id: options.previewRunId },
  })

  if (!previewRun) {
    throw new Error('PREVIEW_RUN_NOT_FOUND')
  }

  // 3. Validate preview state
  if (previewRun.mode !== 'PREVIEW') {
    throw new Error('INVALID_PREVIEW_MODE')
  }
  if (previewRun.status !== 'COMPLETED') {
    throw new Error('PREVIEW_NOT_COMPLETED')
  }
  if (previewRun.hardScoreAfter !== 0) {
    throw new Error('PREVIEW_HAS_HARD_CONFLICTS')
  }
  if (
    (previewRun.hc1After ?? 0) !== 0 ||
    (previewRun.hc2After ?? 0) !== 0 ||
    (previewRun.hc3After ?? 0) !== 0 ||
    (previewRun.hc4After ?? 0) !== 0
  ) {
    throw new Error('PREVIEW_HAS_REMAINING_CONFLICTS')
  }
  if (!previewRun.previewExpiresAt) {
    throw new Error('PREVIEW_EXPIRED')
  }
  if (new Date(previewRun.previewExpiresAt) < new Date()) {
    throw new Error('PREVIEW_EXPIRED')
  }
  if (!previewRun.resultSnapshot) {
    throw new Error('PREVIEW_RESULT_SNAPSHOT_MISSING')
  }
  if (!previewRun.databaseFingerprint) {
    throw new Error('PREVIEW_FINGERPRINT_MISSING')
  }

  // 3a. Validate semesterId on preview run
  const semesterId = previewRun.semesterId
  if (semesterId == null) {
    throw new Error('PREVIEW_RUN_MISSING_SEMESTER_ID: Cannot apply a preview that has no semesterId.')
  }

  // 3b. K26-J2: read WorkTime snapshot from preview run.
  //
  // Compatibility policy:
  //  - If the preview run has no snapshot field at all (legacy run
  //    created before K26-J2), the apply path proceeds but the
  //    response marks `present: false`. Apply/rollback do not consult
  //    the snapshot today (solver/score are not WorkTime-aware), so
  //    missing snapshot is non-fatal at the apply layer.
  //  - If the preview run has a snapshot field but it is malformed
  //    (wrong version, invalid JSON, etc.), apply fails fast.
  //  - In both branches, apply never re-resolves the current
  //    WorkTimeConfig; the snapshot is the single source of truth
  //    for this run.
  let workTimeSnapshot: SchedulingRunWorkTimeSnapshot | null = null
  try {
    workTimeSnapshot = readWorkTimeSnapshotFromRun(previewRun)
  } catch (e) {
    if (e instanceof WorkTimeSnapshotInvalidError) {
      throw new Error(`PREVIEW_WORKTIME_SNAPSHOT_INVALID: ${e.code} ${e.message}`)
    }
    throw e
  }
  const workTimeSnapshotMetadata = toReadMetadata(workTimeSnapshot)

  // 4. Parse proposed changes from resultSnapshot
  // K21-FIX-F: extract config sub-object (resolved config snapshot from preview)
  let snapshot: {
    proposedChanges?: PreviewProposedChange[]
    scoreBefore?: { hardScore: number; softScore: number }
    scoreAfter?: { hardScore: number; softScore: number }
    hcBefore?: { hc1: number; hc2: number; hc3: number; hc4: number }
    hcAfter?: { hc1: number; hc2: number; hc3: number; hc4: number }
    blockReasons?: string[]
    solverMetrics?: unknown
    config?: {
      configId: number | null
      name: string | null
      maxIterations: number
      lahcWindowSize: number
      randomSeed: number | null
      lockedSlotIds: number[]
      solverVersion: string
      source: 'CONFIG' | 'INLINE' | 'DEFAULT' | 'MIXED'
      snapshotTakenAt: string
    }
  }
  try {
    snapshot = JSON.parse(previewRun.resultSnapshot)
  } catch {
    throw new Error('PREVIEW_RESULT_SNAPSHOT_INVALID_JSON')
  }

  const proposedChanges = snapshot.proposedChanges ?? []
  if (proposedChanges.length === 0) {
    throw new Error('PREVIEW_NO_PROPOSED_CHANGES')
  }
  if (previewRun.changedSlotCount !== proposedChanges.length) {
    throw new Error('PREVIEW_CHANGED_SLOT_COUNT_MISMATCH')
  }

  // K26-J2: carry the raw WorkTime snapshot JSON forward to the
  // apply run. We use the raw JSON (not the parsed object) so the
  // wire representation is byte-identical to what the preview run
  // persisted. This is intentionally a verbatim copy; apply does
  // not mutate or "re-serialize" the snapshot.
  const carriedWorkTimeSnapshotJson =
    workTimeSnapshot != null ? previewRun.workTimeConfigSnapshot : null

  // 5. Compute current semester-scoped database fingerprint
  const currentSlots = await prisma.scheduleSlot.findMany({
    where: { semesterId },
    select: {
      id: true,
      teachingTaskId: true,
      dayOfWeek: true,
      slotIndex: true,
      roomId: true,
    },
    orderBy: { id: 'asc' },
  })
  const currentFingerprint = computeSemesterScopedFingerprint(semesterId, currentSlots)

  if (currentFingerprint !== previewRun.databaseFingerprint) {
    throw new Error('DATABASE_FINGERPRINT_MISMATCH')
  }

  // 6. Pre-validate: every proposed slot exists in current DB (within same semester)
  const currentSlotMap = new Map(currentSlots.map((s) => [s.id, s]))
  for (const change of proposedChanges) {
    const slot = currentSlotMap.get(change.scheduleSlotId)
    if (!slot) {
      throw new Error(`SLOT_NOT_FOUND: ${change.scheduleSlotId}`)
    }
  }

  const databaseFingerprintBefore = currentFingerprint

  // 7. Execute in transaction
  const applyResult = await prisma.$transaction(async (tx) => {
    // 7a. Create APPLY run
    const applyRun = await tx.schedulingRun.create({
      data: {
        configId: previewRun.configId,
        semesterId: semesterId,
        mode: 'APPLY',
        status: 'APPLYING',
        operatorId: options.operatorId ?? null,
        operatorNameSnapshot: options.operatorName ?? null,
        startedAt,
        hardScoreBefore: previewRun.hardScoreBefore,
        softScoreBefore: previewRun.softScoreBefore,
        hc1Before: previewRun.hc1Before,
        hc2Before: previewRun.hc2Before,
        hc3Before: previewRun.hc3Before,
        hc4Before: previewRun.hc4Before,
        databaseFingerprint: databaseFingerprintBefore,
        changedSlotCount: proposedChanges.length,
        solverVersion: SOLVER_VERSION,
        // K26-J2: carry the preview's WorkTime snapshot forward.
        workTimeConfigSnapshot: carriedWorkTimeSnapshotJson,
      },
    })

    // 7b. Read slots to be modified within transaction
    const slotIds = proposedChanges.map((c) => c.scheduleSlotId)
    const txSlots = await tx.scheduleSlot.findMany({
      where: { id: { in: slotIds } },
    })
    const txSlotMap = new Map(txSlots.map((s) => [s.id, s]))

    // 7c. Validate old values and create changes + updates
    for (const change of proposedChanges) {
      const slot = txSlotMap.get(change.scheduleSlotId)
      if (!slot) {
        throw new Error(`TX_SLOT_NOT_FOUND: ${change.scheduleSlotId}`)
      }

      // Verify slot belongs to the same semester
      if (slot.semesterId !== semesterId) {
        throw new Error(
          `SLOT_SEMESTER_MISMATCH: ${change.scheduleSlotId} semesterId=${slot.semesterId} expected=${semesterId}`,
        )
      }

      // Verify current values match preview old values
      const currentRoomId = slot.roomId ?? null
      const expectedOldRoomId = change.oldRoomId ?? null
      if (
        slot.dayOfWeek !== change.oldDayOfWeek ||
        slot.slotIndex !== change.oldSlotIndex ||
        currentRoomId !== expectedOldRoomId
      ) {
        throw new Error(
          `SLOT_VALUE_MISMATCH: ${change.scheduleSlotId} ` +
          `current=(${slot.dayOfWeek},${slot.slotIndex},${currentRoomId}) ` +
          `expected=(${change.oldDayOfWeek},${change.oldSlotIndex},${expectedOldRoomId})`,
        )
      }

      // Create SchedulerRunChange
      await tx.schedulerRunChange.create({
        data: {
          runId: applyRun.id,
          scheduleSlotId: change.scheduleSlotId,
          teachingTaskId: change.teachingTaskId,
          oldDayOfWeek: change.oldDayOfWeek,
          oldSlotIndex: change.oldSlotIndex,
          oldRoomId: change.oldRoomId,
          newDayOfWeek: change.newDayOfWeek,
          newSlotIndex: change.newSlotIndex,
          newRoomId: change.newRoomId,
          courseNameSnapshot: change.courseName,
          teacherNameSnapshot: change.teacherName,
          classGroupsSnapshot: change.classGroups,
          roomNameOldSnapshot: change.oldRoomName,
          roomNameNewSnapshot: change.newRoomName,
        },
      })

      // Update ScheduleSlot
      await tx.scheduleSlot.update({
        where: { id: change.scheduleSlotId },
        data: {
          dayOfWeek: change.newDayOfWeek,
          slotIndex: change.newSlotIndex,
          roomId: change.newRoomId,
        },
      })
    }

    // 7d. Post-apply scoring inside transaction (semester-scoped)
    const postCtx = await loadSchedulingContextWithClient(tx, semesterId)
    const postState = buildInitialState(postCtx)
    const postScore = calculateInitialScore(postCtx, postState)
    const postDetails = calculateScoreWithDetails(postCtx, postState)
    const postHc = countConflictsByType(postDetails.details)

    if (postScore.hardScore !== 0) {
      throw new Error(
        `APPLY_POST_HARD_SCORE_NON_ZERO: hardScore=${postScore.hardScore} ` +
        `HC1=${postHc.hc1} HC2=${postHc.hc2} HC3=${postHc.hc3} HC4=${postHc.hc4}`,
      )
    }
    if (postHc.hc1 !== 0 || postHc.hc2 !== 0 || postHc.hc3 !== 0 || postHc.hc4 !== 0) {
      throw new Error(
        `APPLY_POST_HC_NON_ZERO: HC1=${postHc.hc1} HC2=${postHc.hc2} HC3=${postHc.hc3} HC4=${postHc.hc4}`,
      )
    }

    // 7e. Compute post-apply semester-scoped fingerprint
    const postSlots = await tx.scheduleSlot.findMany({
      where: { semesterId },
      select: {
        id: true,
        teachingTaskId: true,
        dayOfWeek: true,
        slotIndex: true,
        roomId: true,
      },
      orderBy: { id: 'asc' },
    })
    const postFingerprint = computeSemesterScopedFingerprint(semesterId, postSlots)

    // 7f. Update APPLY run to COMPLETED
    const completedAt = new Date()
    const durationMs = completedAt.getTime() - startedAt.getTime()

    const updatedRun = await tx.schedulingRun.update({
      where: { id: applyRun.id },
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
        // K21-FIX-F: carry the preview's resolved config snapshot forward
        // so apply/rollback chains are reproducible from any one of the runs.
        // K26-J2: also carry the parsed WorkTime snapshot's additive
        // metadata (or `null` when the preview run is legacy and
        // had no snapshot) so audit / UI can render the policy that
        // was in effect at preview time.
        resultSnapshot: JSON.stringify({
          postScore,
          postHc,
          proposedChangesApplied: proposedChanges.length,
          previewRunId: previewRun.id,
          workTime: workTimeSnapshotMetadata,
          // Carry the config snapshot from the preview run
          ...(snapshot.config ? { config: snapshot.config } : {}),
        }),
        conflictSummary: JSON.stringify({
          HC1: postHc.hc1,
          HC2: postHc.hc2,
          HC3: postHc.hc3,
          HC4: postHc.hc4,
        }),
      },
    })

    return {
      applyRunId: updatedRun.id,
      status: updatedRun.status as 'COMPLETED',
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
    applyRunId: applyResult.applyRunId,
    previewRunId: options.previewRunId,
    status: applyResult.status,
    appliedSlotCount: proposedChanges.length,
    hardScoreAfter: applyResult.hardScoreAfter,
    softScoreAfter: applyResult.softScoreAfter,
    hc1After: applyResult.hc1After,
    hc2After: applyResult.hc2After,
    hc3After: applyResult.hc3After,
    hc4After: applyResult.hc4After,
    databaseFingerprintBefore,
    databaseFingerprintAfter: applyResult.databaseFingerprintAfter,
    changeCount: proposedChanges.length,
    durationMs,
    workTimeSnapshot: workTimeSnapshotMetadata,
  }
}
