import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { loadSchedulingContext } from './data-loader'
import { buildInitialState, solve } from './solver'
import { calculateInitialScore, calculateScoreWithDetails } from './score'
import { resolveSchedulerSemester, type ResolvedSemester } from '@/lib/semester'
import {
  buildScoreBreakdown,
  buildWireBreakdown,
  type ResultSnapshotScoreBreakdown,
} from './score-breakdown'
import {
  resolveWorkTimeConfigForSchedule,
  type ResolvedWorkTimeForSchedule,
} from '@/lib/worktime/worktime-schedule-resolver'
import {
  buildAndSerializeWorkTimeSnapshot,
  toAdditiveMetadata,
  toSolverWorkTimeContract,
  type SchedulingRunWorkTimeSnapshot,
  type WorkTimeSnapshotAdditiveMetadata,
} from '@/lib/worktime/worktime-snapshot'
import type { SchedulingContext, ScheduleState, SlotWithRelations } from './types'

// ── Types ──

export interface PreviewProposedChange {
  scheduleSlotId: number
  teachingTaskId: number
  courseName: string
  teacherName: string
  classGroups: string
  oldDayOfWeek: number
  oldSlotIndex: number
  oldRoomId: number | null
  oldRoomName: string
  newDayOfWeek: number
  newSlotIndex: number
  newRoomId: number | null
  newRoomName: string
}

export interface PreviewResult {
  runId: number
  mode: 'PREVIEW'
  status: 'COMPLETED' | 'BLOCKED' | 'FAILED'
  blocked: boolean
  blockReasons: string[]

  scoreBefore: { hardScore: number; softScore: number }
  scoreAfter: { hardScore: number; softScore: number }

  hcBefore: { hc1: number; hc2: number; hc3: number; hc4: number }
  hcAfter: { hc1: number; hc2: number; hc3: number; hc4: number }

  changedSlotCount: number
  proposedChanges: PreviewProposedChange[]

  previewExpiresAt: string | null
  databaseFingerprint: string

  iterations: number
  durationMs: number
  randomSeed: number | null

  lockedSlotIds: number[]
  lockedSlotCount: number

  semesterId: number
  semesterCode: string
  semesterName: string

  // K22-L2: additive score breakdown (HC1-HC6, SC1-SC10, MIN_PERT)
  // embedded in resultSnapshot.scoreBreakdown and echoed back for live preview.
  scoreBreakdown: ResultSnapshotScoreBreakdown

  // K26-J2: WorkTime snapshot metadata for run reproducibility.
  // The full snapshot is persisted on SchedulingRun.workTimeConfigSnapshot;
  // this projection is embedded in the response so the UI can render it.
  workTimeSnapshot: {
    present: true
    version: SchedulingRunWorkTimeSnapshot['version']
    source: SchedulingRunWorkTimeSnapshot['source']
    workTimeConfigId: number | null
    workTimeConfigName: string | null
    allowWeekend: boolean
    activeTeachingSlotIndexes: number[]
    legacyDisplaySlotIndexes: number[]
    serializedAt: string
  }
}

// ── Helpers ──

/**
 * Compute a stable fingerprint of current ScheduleSlot placements for a given semester.
 * Used to detect concurrent modifications before apply.
 */
export function computeDatabaseFingerprint(): string {
  throw new Error('Use computeDatabaseFingerprintFromSlots(slots)')
}

export function computeDatabaseFingerprintFromSlots(
  slots: { id: number; teachingTaskId: number; dayOfWeek: number; slotIndex: number; roomId: number | null }[],
): string {
  const sorted = [...slots].sort((a, b) => a.id - b.id)
  const payload = sorted
    .map((s) => `${s.id}:${s.teachingTaskId}:${s.dayOfWeek}:${s.slotIndex}:${s.roomId ?? 0}`)
    .join('|')
  return createHash('sha256').update(payload).digest('hex').slice(0, 16)
}

/**
 * Compute a semester-scoped fingerprint: prefix with semesterId and slot count.
 */
export function computeSemesterScopedFingerprint(
  semesterId: number,
  slots: { id: number; teachingTaskId: number; dayOfWeek: number; slotIndex: number; roomId: number | null }[],
): string {
  const base = computeDatabaseFingerprintFromSlots(slots)
  return createHash('sha256').update(`sem${semesterId}:${slots.length}:${base}`).digest('hex').slice(0, 16)
}

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

function buildProposedChanges(
  ctx: SchedulingContext,
  state: ScheduleState,
  originalSlots: SlotWithRelations[],
): PreviewProposedChange[] {
  const changes: PreviewProposedChange[] = []

  for (const slot of originalSlots) {
    const bestPos = state.assignments.get(slot.id)
    if (!bestPos) continue

    const origDay = slot.dayOfWeek
    const origSlot = slot.slotIndex
    const origRoom = slot.roomId ?? 0

    if (
      bestPos.dayOfWeek === origDay &&
      bestPos.slotIndex === origSlot &&
      bestPos.roomId === origRoom
    ) {
      continue
    }

    const task = slot.teachingTask
    const oldRoomName = slot.room?.name ?? '-'
    const newRoom = bestPos.roomId ? ctx.roomById.get(bestPos.roomId) : null
    const newRoomName = newRoom?.name ?? '-'

    changes.push({
      scheduleSlotId: slot.id,
      teachingTaskId: slot.teachingTaskId,
      courseName: task.course?.name ?? '?',
      teacherName: task.teacher?.name ?? '-',
      classGroups: task.taskClasses.map((tc) => tc.classGroup.name).join(', '),
      oldDayOfWeek: origDay,
      oldSlotIndex: origSlot,
      oldRoomId: slot.roomId,
      oldRoomName,
      newDayOfWeek: bestPos.dayOfWeek,
      newSlotIndex: bestPos.slotIndex,
      newRoomId: bestPos.roomId || null,
      newRoomName,
    })
  }

  return changes
}

// ── Main Service ──

export interface PreviewOptions {
  maxIterations?: number
  lahcWindowSize?: number
  randomSeed?: number | null
  lockedSlotIds?: number[]
  operatorId?: number | null
  operatorName?: string | null
  configId?: number
  /** Explicit semesterId. If not provided, uses active semester. */
  semesterId?: number | null
  /**
   * K21-FIX-F: pre-resolved config snapshot to embed in resultSnapshot.config.
   * Built by the preview route via resolveConfigForPreview().
   */
  resolvedConfigSnapshot?: {
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

const SOLVER_VERSION = 'lahc-hard-first-v3'
const PREVIEW_TTL_MS = 30 * 60 * 1000 // 30 minutes
const MAX_ITERATIONS = 15000

export async function createSchedulerPreview(
  options: PreviewOptions = {},
): Promise<PreviewResult> {
  const maxIterations = Math.min(options.maxIterations ?? 10000, MAX_ITERATIONS)
  const lahcWindowSize = options.lahcWindowSize ?? 500
  const randomSeed = options.randomSeed ?? Math.floor(Math.random() * 0x7fffffff)
  const lockedSlotIds = options.lockedSlotIds ?? []

  // 0. Resolve semester
  const semester = await resolveSchedulerSemester({ semesterId: options.semesterId })

  // 0a. K26-J2: resolve WorkTime for the semester and capture a
  // stable snapshot. The snapshot is persisted on
  // `SchedulingRun.workTimeConfigSnapshot` and carried forward by
  // apply/rollback. Solver/score do NOT consult the snapshot today
  // (K26-J3/J4 deferred); this is purely a persistence + audit
  // channel at this stage.
  const workTimeResolved: ResolvedWorkTimeForSchedule =
    await resolveWorkTimeConfigForSchedule(semester.id)
  let workTimeConfigId: number | null = null
  let workTimeConfigName: string | null = null
  if (workTimeResolved.source === 'database') {
    const cfg = await prisma.workTimeConfig.findFirst({
      where: { semesterId: semester.id, isDefault: true, isActive: true },
      select: { id: true, name: true },
    })
    if (cfg) {
      workTimeConfigId = cfg.id
      workTimeConfigName = cfg.name
    }
  }
  const { snapshot: workTimeSnapshot, json: workTimeSnapshotJson } =
    buildAndSerializeWorkTimeSnapshot({
      semesterId: semester.id,
      workTimeConfigId,
      workTimeConfigName,
      resolved: workTimeResolved,
    })
  const workTimeAdditive: WorkTimeSnapshotAdditiveMetadata =
    toAdditiveMetadata(workTimeSnapshot)

  // 1. Load scheduling context (scoped by semester)
  const ctx = await loadSchedulingContext({ semesterId: semester.id })

  // 2. Compute semester-scoped database fingerprint
  const fingerprintSlots = ctx.slots.map((s) => ({
    id: s.id,
    teachingTaskId: s.teachingTaskId,
    dayOfWeek: s.dayOfWeek,
    slotIndex: s.slotIndex,
    roomId: s.roomId,
  }))
  const databaseFingerprint = computeSemesterScopedFingerprint(semester.id, fingerprintSlots)

  // 3. Build initial state and score
  const initialState = buildInitialState(ctx)
  const initialScore = calculateInitialScore(ctx, initialState)
  const initialDetails = calculateScoreWithDetails(ctx, initialState)
  const hcBefore = countConflictsByType(initialDetails.details)

  const scoreBefore = {
    hardScore: initialScore.hardScore,
    softScore: initialScore.softScore,
  }

  // 4. Run solver
  // K26-J3: build the solver WorkTime contract from the snapshot.
  // This is the canonical source for candidate generation; the solver
  // uses `allowedDayOfWeeks` and `candidateSlotIndexes` from this
  // contract instead of hardcoded ranges.
  const solverWorkTimeContract = toSolverWorkTimeContract(workTimeSnapshot)
  const startedAt = new Date()

  const solveResult = solve(ctx, {
    maxIterations,
    lahcWindowSize,
    randomSeed,
    lockedSlotIds: new Set(lockedSlotIds),
  }, undefined, solverWorkTimeContract)
  const completedAt = new Date()
  const durationMs = completedAt.getTime() - startedAt.getTime()

  const usedSeed = solveResult.usedSeed

  // 5. Calculate best score with details
  const bestDetails = calculateScoreWithDetails(ctx, solveResult.bestState)
  const hcAfter = countConflictsByType(bestDetails.details)

  // K26-K4: Use the re-scored values from calculateScoreWithDetails instead
  // of the solver's accumulated bestScore. The solver tracks score via delta
  // accumulation which may drift from the true score of bestState.
  const scoreAfter = {
    hardScore: bestDetails.hardScore,
    softScore: bestDetails.softScore,
  }

  // K22-L2: compute structured score breakdown for UI
  const beforeBreakdown = buildScoreBreakdown('BEFORE', initialDetails)
  const afterBreakdown = buildScoreBreakdown('AFTER', bestDetails)
  const scoreBreakdown = buildWireBreakdown(beforeBreakdown, afterBreakdown)

  // 6. Build proposed changes
  const proposedChanges = buildProposedChanges(ctx, solveResult.bestState, ctx.slots)
  const changedSlotCount = proposedChanges.length

  // 7. Determine blocked status
  // K26-K4: Use re-scored scoreAfter (from bestDetails) for blocked check,
  // not the solver's accumulated bestScore which may drift.
  const blocked = scoreAfter.hardScore !== 0 ||
    hcAfter.hc1 !== 0 || hcAfter.hc2 !== 0 || hcAfter.hc3 !== 0 || hcAfter.hc4 !== 0

  const blockReasons: string[] = []
  if (solveResult.bestScore.hardScore !== 0) {
    blockReasons.push('HARD_CONFLICTS_REMAIN')
  }
  if (hcAfter.hc1 !== 0) blockReasons.push('HC1_ROOM_CONFLICT')
  if (hcAfter.hc2 !== 0) blockReasons.push('HC2_TEACHER_CONFLICT')
  if (hcAfter.hc3 !== 0) blockReasons.push('HC3_CLASS_CONFLICT')
  if (hcAfter.hc4 !== 0) blockReasons.push('HC4_CAPACITY')

  const status = blocked ? 'BLOCKED' : 'COMPLETED'
  const previewExpiresAt = blocked ? null : new Date(Date.now() + PREVIEW_TTL_MS)

  // 8. Build result snapshot for SchedulingRun.resultSnapshot
  // K21-FIX-F: add config sub-object with resolved config (source: CONFIG/INLINE/DEFAULT/MIXED)
  // K22-L2: add scoreBreakdown sub-object (HC1-HC6, SC1-SC10, MIN_PERT)
  // K26-J2: add workTime sub-object with snapshot additive metadata
  const resultSnapshot = JSON.stringify({
    scoreBefore,
    scoreAfter,
    hcBefore,
    hcAfter,
    proposedChanges,
    blockReasons,
    solverMetrics: solveResult.metrics ?? null,
    lockedSlotIds,
    lockedSlotCount: lockedSlotIds.length,
    semesterId: semester.id,
    semesterCode: semester.code,
    semesterName: semester.name,
    scoreBreakdown,
    workTime: workTimeAdditive,
    config: options.resolvedConfigSnapshot ?? {
      configId: null,
      name: null,
      maxIterations,
      lahcWindowSize,
      randomSeed: usedSeed,
      lockedSlotIds,
      solverVersion: SOLVER_VERSION,
      source: 'DEFAULT',
      snapshotTakenAt: new Date().toISOString(),
    },
  })

  const conflictSummary = JSON.stringify({
    HC1: hcAfter.hc1,
    HC2: hcAfter.hc2,
    HC3: hcAfter.hc3,
    HC4: hcAfter.hc4,
  })

  // 9. Resolve SchedulingConfig (read-only — never create)
  let configId: number
  if (options.configId != null) {
    const config = await prisma.schedulingConfig.findUnique({
      where: { id: options.configId },
    })
    if (!config) {
      throw new Error('SCHEDULING_CONFIG_NOT_FOUND')
    }
    configId = config.id
  } else {
    const config = await prisma.schedulingConfig.findFirst({
      orderBy: { id: 'asc' },
    })
    if (!config) {
      throw new Error('SCHEDULING_CONFIG_REQUIRED')
    }
    configId = config.id
  }

  const run = await prisma.schedulingRun.create({
    data: {
      configId: configId,
      semesterId: semester.id,
      mode: 'PREVIEW',
      status,
      operatorId: options.operatorId ?? null,
      operatorNameSnapshot: options.operatorName ?? null,
      startedAt,
      completedAt,
      iterations: solveResult.iterations,
      durationMs,
      randomSeed: usedSeed,
      solverVersion: SOLVER_VERSION,
      hardScore: solveResult.bestScore.hardScore,
      softScore: solveResult.bestScore.softScore,
      hardScoreBefore: scoreBefore.hardScore,
      softScoreBefore: scoreBefore.softScore,
      hardScoreAfter: scoreAfter.hardScore,
      softScoreAfter: scoreAfter.softScore,
      hc1Before: hcBefore.hc1,
      hc2Before: hcBefore.hc2,
      hc3Before: hcBefore.hc3,
      hc4Before: hcBefore.hc4,
      hc1After: hcAfter.hc1,
      hc2After: hcAfter.hc2,
      hc3After: hcAfter.hc3,
      hc4After: hcAfter.hc4,
      resultSnapshot,
      // K26-J2: persist the captured WorkTime snapshot. Apply/rollback
      // read this field instead of re-resolving the current WorkTime
      // configuration. The snapshot is immutable for the lifetime of
      // the run.
      workTimeConfigSnapshot: workTimeSnapshotJson,
      conflictSummary,
      databaseFingerprint,
      previewExpiresAt: previewExpiresAt ?? undefined,
      changedSlotCount,
      errorMessage: blocked ? `Blocked: ${blockReasons.join(', ')}` : null,
    },
  })

  return {
    runId: run.id,
    mode: 'PREVIEW',
    status,
    blocked,
    blockReasons,
    scoreBefore,
    scoreAfter,
    hcBefore,
    hcAfter,
    changedSlotCount,
    proposedChanges,
    previewExpiresAt: previewExpiresAt?.toISOString() ?? null,
    databaseFingerprint,
    iterations: solveResult.iterations,
    durationMs,
    randomSeed: usedSeed,
    lockedSlotIds,
    lockedSlotCount: lockedSlotIds.length,
    semesterId: semester.id,
    semesterCode: semester.code,
    semesterName: semester.name,
    scoreBreakdown,
    workTimeSnapshot: {
      present: true,
      version: workTimeSnapshot.version,
      source: workTimeSnapshot.source,
      workTimeConfigId: workTimeSnapshot.workTimeConfigId,
      workTimeConfigName: workTimeSnapshot.workTimeConfigName,
      allowWeekend: workTimeSnapshot.allowWeekend,
      activeTeachingSlotIndexes: workTimeSnapshot.activeTeachingSlotIndexes,
      legacyDisplaySlotIndexes: workTimeSnapshot.legacyDisplaySlotIndexes,
      serializedAt: workTimeSnapshot.serializedAt,
    },
  }
}
