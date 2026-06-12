import type {
  SchedulingContext,
  ScheduleState,
  Move,
  Score,
  SolverConfig,
  TaskWithRelations,
} from './types'
import { isScoreBetter } from './types'
import {
  calculateInitialScore,
  calculateDeltaScore,
  findEffectiveRoomConflict,
  getEffectiveRoomIds,
} from './score'
import { classifySpecialty, computeHC6Penalty, isLinxiaoRoomName } from './score'
import { getTaskStudentCount } from './capacity'
import {
  createSeededRandom,
  randInt,
  pickRandom,
} from './prng'
import {
  toScoreWorkTimeContract,
  type SolverWorkTimeContract,
} from '@/lib/worktime/worktime-snapshot'

/** 应用一次移动到状态，返回旧位置 */
export function applyMove(
  state: ScheduleState,
  move: Move,
): { dayOfWeek: number; slotIndex: number; roomId: number } {
  const old = state.assignments.get(move.slotId)!
  state.assignments.set(move.slotId, {
    dayOfWeek: move.newDay,
    slotIndex: move.newSlotIndex,
    roomId: move.newRoomId,
  })
  return old
}

/** 回滚一次移动 */
export function undoMove(
  state: ScheduleState,
  slotId: number,
  oldAssignment: { dayOfWeek: number; slotIndex: number; roomId: number },
): void {
  state.assignments.set(slotId, oldAssignment)
}

/** 深拷贝 assignments Map */
function cloneAssignments(
  assignments: Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>,
): Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }> {
  const clone = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  for (const [k, v] of assignments) {
    clone.set(k, { ...v })
  }
  return clone
}

/** 从 SchedulingContext 构建初始 ScheduleState */
export function buildInitialState(ctx: SchedulingContext): ScheduleState {
  const assignments = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  for (const slot of ctx.slots) {
    assignments.set(slot.id, {
      dayOfWeek: slot.dayOfWeek,
      slotIndex: slot.slotIndex,
      roomId: slot.roomId ?? 0,
    })
  }
  return {
    assignments,
    originalAssignments: cloneAssignments(assignments),
  }
}


// ── Week overlap helper (same logic as score.ts) ──

function getWeekSet(task: TaskWithRelations): Set<number> {
  const weeks: number[] = []
  const { startWeek, endWeek, weekType } = task
  if (weekType === 'ALL' || weekType === 'FIRST_HALF' || weekType === 'SECOND_HALF' || weekType === 'CUSTOM') {
    for (let w = startWeek; w <= endWeek; w++) weeks.push(w)
  } else if (weekType === 'ODD') {
    for (let w = startWeek; w <= endWeek; w++) { if (w % 2 === 1) weeks.push(w) }
  } else if (weekType === 'EVEN') {
    for (let w = startWeek; w <= endWeek; w++) { if (w % 2 === 0) weeks.push(w) }
  }
  return new Set(weeks)
}

const weekSetCache = new Map<number, Set<number>>()

function getCachedWeekSet(task: TaskWithRelations): Set<number> {
  let cached = weekSetCache.get(task.id)
  if (!cached) {
    cached = getWeekSet(task)
    weekSetCache.set(task.id, cached)
  }
  return cached
}

function hasWeekOverlap(taskA: TaskWithRelations, taskB: TaskWithRelations): boolean {
  const setA = getCachedWeekSet(taskA)
  const setB = getCachedWeekSet(taskB)
  const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA]
  for (const w of smaller) {
    if (larger.has(w)) return true
  }
  return false
}

// ── Hard-compatible placement check ──

/**
 * Check if placing a task at (day, slot, room) would create any hard conflict
 * with existing placements. Excludes the moving slot itself.
 */
export function isPlacementHardCompatible(
  ctx: SchedulingContext,
  state: ScheduleState,
  movingSlotId: number,
  movingTask: TaskWithRelations,
  proposedDay: number,
  proposedSlotIndex: number,
  proposedRoomId: number,
): boolean {
  if (proposedRoomId === 0) return false

  const proposedRoom = ctx.roomById.get(proposedRoomId)
  if (!proposedRoom) return false

  // HC4: capacity check
  const studentInfo = getTaskStudentCount(movingTask, ctx)
  if (studentInfo.studentCount > proposedRoom.capacity) return false

  // K26-K4C: HC6 — non-automotive / mixed / unknown task cannot be placed in a
  // Linxiao room. Mirrors score.ts HC6 penalty computation. Reuses the same
  // helper so classifier semantics stay in sync.
  const isLx = isLinxiaoRoomName(proposedRoom)
  if (isLx) {
    const cls = classifySpecialty(movingTask)
    if (computeHC6Penalty(cls, true) < 0) return false
  }

  const movingClassGroupIds = new Set(movingTask.taskClasses.map(tc => tc.classGroupId))
  const movingSlot = ctx.slots.find(s => s.id === movingSlotId)
  if (!movingSlot) return false
  const proposedRoomIds = getEffectiveRoomIds(movingSlot, proposedRoomId)

  // Exclude only the moving slot itself (not siblings — siblings at the same
  // position would create a duplicate, which we must detect)
  for (const [slotId, pos] of state.assignments) {
    if (slotId === movingSlotId) continue
    if (pos.dayOfWeek !== proposedDay || pos.slotIndex !== proposedSlotIndex) continue
    const otherSlot = ctx.slots.find(s => s.id === slotId)
    if (!otherSlot) continue
    const otherTask = otherSlot.teachingTask

    // week overlap check
    if (!hasWeekOverlap(movingTask, otherTask)) continue

    // HC1: room conflict
    if (
      proposedRoomIds.size > 0 &&
      findEffectiveRoomConflict(movingSlot, proposedRoomId, otherSlot, pos.roomId) != null
    ) {
      return false
    }

    if (pos.roomId === 0) continue

    // HC2: teacher conflict
    if (movingTask.teacherId != null && movingTask.teacherId === otherTask.teacherId) return false

    // HC3: class conflict
    for (const tc of otherTask.taskClasses) {
      if (movingClassGroupIds.has(tc.classGroupId)) return false
    }
  }

  return true
}

// ── Hard conflict participant detection ──

export function findHardConflictParticipants(
  ctx: SchedulingContext,
  state: ScheduleState,
): Set<number> {
  const participants = new Set<number>()
  const slots = ctx.slots

  for (let i = 0; i < slots.length; i++) {
    const a = slots[i]
    const aPos = state.assignments.get(a.id)
    if (!aPos) continue

    for (let j = i + 1; j < slots.length; j++) {
      const b = slots[j]
      const bPos = state.assignments.get(b.id)
      if (!bPos) continue
      if (aPos.dayOfWeek !== bPos.dayOfWeek || aPos.slotIndex !== bPos.slotIndex) continue
      if (!hasWeekOverlap(a.teachingTask, b.teachingTask)) continue

      const hasRoomConflict = findEffectiveRoomConflict(a, aPos.roomId, b, bPos.roomId) != null
      const bothHavePrimaryRooms = aPos.roomId !== 0 && bPos.roomId !== 0
      const hasTeacherConflict = bothHavePrimaryRooms && a.teachingTask.teacherId != null &&
        a.teachingTask.teacherId === b.teachingTask.teacherId
      let hasClassConflict = false
      if (bothHavePrimaryRooms) {
        for (const tcA of a.teachingTask.taskClasses) {
          for (const tcB of b.teachingTask.taskClasses) {
            if (tcA.classGroupId === tcB.classGroupId) { hasClassConflict = true; break }
          }
          if (hasClassConflict) break
        }
      }

      if (hasRoomConflict || hasTeacherConflict || hasClassConflict) {
        participants.add(a.id)
        participants.add(b.id)
      }
    }
  }

  return participants
}

// ── Move types ──

type MoveType = 'ROOM_ONLY' | 'TIME_ONLY' | 'TIME_AND_ROOM'

// ── Solver metrics ──

interface SolverMetrics {
  attemptedMoves: number
  acceptedMoves: number
  rejectedHardWorseMoves: number
  rejectedIncompatibleMoves: number
  noCandidateIterations: number
  roomOnlyMoves: number
  timeOnlyMoves: number
  timeAndRoomMoves: number
  bestHardScoreIteration: number
}

/** 求解器结果 */
export interface SolveResult {
  bestScore: Score
  bestState: ScheduleState
  iterations: number
  metrics?: SolverMetrics
  /** 实际使用的随机种子 */
  usedSeed: number
}

/**
 * LAHC 求解器 — hard-first acceptance with compatibility checks
 *
 * K26-J3: accepts optional `workTime` contract. When provided, candidate
 * day/slot generation uses `workTime.allowedDayOfWeeks` and
 * `workTime.candidateSlotIndexes` instead of the legacy hardcoded ranges.
 * When omitted, falls back to days [1..7] and slots [1..6] (backward
 * compatible with existing tests and callsites).
 */
export function solve(
  ctx: SchedulingContext,
  config: SolverConfig,
  onProgress?: (iteration: number, score: Score) => void,
  workTime?: SolverWorkTimeContract,
): SolveResult {
  // Initialize seeded RNG
  const usedSeed = config.randomSeed ?? 0
  const rng = createSeededRandom(usedSeed)

  // K26-J3: candidate day/slot arrays from WorkTime contract.
  // When no contract is provided, falls back to the legacy ranges
  // that were hardcoded before J3 (days 1-7, slots 1-6).
  const candidateDays = workTime
    ? workTime.allowedDayOfWeeks
    : [1, 2, 3, 4, 5, 6, 7]
  const candidateSlots = workTime
    ? workTime.candidateSlotIndexes
    : [1, 2, 3, 4, 5, 6]

  // K26-J4: derive WorkTimeForScore from the solver contract.
  // This is the same contract that score.ts uses for SC3/SC7.
  // When no contract is provided, the legacy static contract is used,
  // which produces identical results to the pre-J4 hardcoded behavior.
  const scoreWorkTime = workTime
    ? toScoreWorkTimeContract(workTime)
    : undefined

  const state = buildInitialState(ctx)
  const currentScore = calculateInitialScore(ctx, state, scoreWorkTime)

  // 追踪 best
  let bestScore: Score = { hardScore: currentScore.hardScore, softScore: currentScore.softScore }
  let bestAssignments = cloneAssignments(state.assignments)
  let bestIteration = 0

  const { maxIterations, lahcWindowSize, lockedSlotIds } = config

  // LAHC 历史分数队列
  const initialTotal = currentScore.hardScore + currentScore.softScore
  const history = new Array(lahcWindowSize).fill(initialTotal)
  let historyIndex = 0

  // 未锁定的 slot ID 列表
  const allMovable: number[] = []
  for (const slot of ctx.slots) {
    if (!lockedSlotIds?.has(slot.id)) {
      allMovable.push(slot.id)
    }
  }

  if (allMovable.length === 0) {
    return { bestScore, bestState: state, iterations: 0, usedSeed }
  }

  // 预计算每个 task 的容量足够教室（按容量升序）
  const eligibleRoomsByTask = new Map<number, { id: number; capacity: number }[]>()
  for (const task of ctx.tasks) {
    const info = getTaskStudentCount(task, ctx)
    const eligible = ctx.rooms
      .filter((r) => r.capacity >= info.studentCount)
      .sort((a, b) => a.capacity - b.capacity)
      .map((r) => ({ id: r.id, capacity: r.capacity }))
    eligibleRoomsByTask.set(task.id, eligible)
  }

  // 所有 room 的 ID 列表（fallback）
  const allRoomIds = ctx.rooms.map((r) => r.id)

  let currentTotal = initialTotal

  // Metrics
  const metrics: SolverMetrics = {
    attemptedMoves: 0,
    acceptedMoves: 0,
    rejectedHardWorseMoves: 0,
    rejectedIncompatibleMoves: 0,
    noCandidateIterations: 0,
    roomOnlyMoves: 0,
    timeOnlyMoves: 0,
    timeAndRoomMoves: 0,
    bestHardScoreIteration: 0,
  }

  const CANDIDATES_PER_ITERATION = 32
  const SOURCE_RETRIES = 4

  for (let i = 0; i < maxIterations; i++) {
    // Find hard conflict participants for targeted selection
    const conflictParticipants = findHardConflictParticipants(ctx, state)
    const hasConflicts = conflictParticipants.size > 0

    // Try multiple source slots if needed
    let bestCandidate: Move | null = null
    let bestCandidateHard = -Infinity
    let bestCandidateSoft = -Infinity
    let foundCandidate = false

    // Exhaustive search mode: when hard conflicts exist, try all 42 time slots
    // for each conflict slot with the first eligible room
    if (hasConflicts) {
      const conflictArr = [...conflictParticipants]
      // Shuffle to avoid always trying the same slot first
      for (let ci = conflictArr.length - 1; ci > 0; ci--) {
        const cj = randInt(rng, 0, ci)
        const tmp = conflictArr[ci]; conflictArr[ci] = conflictArr[cj]; conflictArr[cj] = tmp
      }

      for (const slotId of conflictArr) {
        const slot = ctx.slots.find(s => s.id === slotId)
        if (!slot) continue
        const pos = state.assignments.get(slotId)
        if (!pos) continue
        const task = slot.teachingTask
        const rooms = eligibleRoomsByTask.get(task.id) ?? []
        if (rooms.length === 0) continue

        for (const day of candidateDays) {
          if (foundCandidate) break
          for (const si of candidateSlots) {
            if (foundCandidate) break
            if (day === pos.dayOfWeek && si === pos.slotIndex) continue
            // Try the first eligible room
            const roomId = rooms[0].id
            if (isPlacementHardCompatible(ctx, state, slotId, task, day, si, roomId)) {
              const move: Move = { slotId, newDay: day, newSlotIndex: si, newRoomId: roomId }
              const delta = calculateDeltaScore(ctx, state, move, scoreWorkTime)
              const newHard = currentScore.hardScore + delta.deltaHard
              const newSoft = currentScore.softScore + delta.deltaSoft
              if (newHard > bestCandidateHard || (newHard === bestCandidateHard && newSoft > bestCandidateSoft)) {
                bestCandidate = move
                bestCandidateHard = newHard
                bestCandidateSoft = newSoft
                foundCandidate = true
              }
            }
          }
        }
        // If first room didn't work, try other eligible rooms
        if (!foundCandidate && rooms.length > 1) {
          for (let ri = 1; ri < rooms.length && !foundCandidate; ri++) {
            for (const day of candidateDays) {
              if (foundCandidate) break
              for (const si of candidateSlots) {
                if (foundCandidate) break
                if (day === pos.dayOfWeek && si === pos.slotIndex) continue
                if (isPlacementHardCompatible(ctx, state, slotId, task, day, si, rooms[ri].id)) {
                  const move: Move = { slotId, newDay: day, newSlotIndex: si, newRoomId: rooms[ri].id }
                  const delta = calculateDeltaScore(ctx, state, move, scoreWorkTime)
                  const newHard = currentScore.hardScore + delta.deltaHard
                  const newSoft = currentScore.softScore + delta.deltaSoft
                  if (newHard > bestCandidateHard || (newHard === bestCandidateHard && newSoft > bestCandidateSoft)) {
                    bestCandidate = move
                    bestCandidateHard = newHard
                    bestCandidateSoft = newSoft
                    foundCandidate = true
                  }
                }
              }
            }
          }
        }
        if (foundCandidate) break
      }
    }

    // Fallback: random candidate generation (for soft optimization or if exhaustive failed)
    if (!foundCandidate) {
      for (let srcTry = 0; srcTry < SOURCE_RETRIES && !foundCandidate; srcTry++) {
        let sourceSlotId: number
        if (hasConflicts) {
          const conflictArr = [...conflictParticipants]
          sourceSlotId = conflictArr[randInt(rng, 0, conflictArr.length - 1)]
        } else {
          sourceSlotId = allMovable[randInt(rng, 0, allMovable.length - 1)]
        }

        const sourceSlot = ctx.slots.find(s => s.id === sourceSlotId)
        if (!sourceSlot) continue
        const sourcePos = state.assignments.get(sourceSlotId)
        if (!sourcePos) continue
        const sourceTask = sourceSlot.teachingTask
        const eligibleRooms = eligibleRoomsByTask.get(sourceTask.id) ?? []

        if (eligibleRooms.length === 0) continue

        for (let c = 0; c < CANDIDATES_PER_ITERATION; c++) {
          const moveTypeRoll = rng()
          let moveType: MoveType
          if (moveTypeRoll < 0.4) moveType = 'ROOM_ONLY'
          else if (moveTypeRoll < 0.7) moveType = 'TIME_ONLY'
          else moveType = 'TIME_AND_ROOM'

          let newDay: number
          let newSlotIndex: number
          let newRoomId: number

          if (moveType === 'ROOM_ONLY') {
            newDay = sourcePos.dayOfWeek
            newSlotIndex = sourcePos.slotIndex
            newRoomId = eligibleRooms[randInt(rng, 0, eligibleRooms.length - 1)].id
          } else if (moveType === 'TIME_ONLY') {
            newDay = pickRandom(rng, candidateDays)
            newSlotIndex = pickRandom(rng, candidateSlots)
            newRoomId = sourcePos.roomId
          } else {
            newDay = pickRandom(rng, candidateDays)
            newSlotIndex = pickRandom(rng, candidateSlots)
            newRoomId = eligibleRooms[randInt(rng, 0, eligibleRooms.length - 1)].id
          }

          if (newDay === sourcePos.dayOfWeek && newSlotIndex === sourcePos.slotIndex && newRoomId === sourcePos.roomId) {
            continue
          }

          if (!isPlacementHardCompatible(ctx, state, sourceSlotId, sourceTask, newDay, newSlotIndex, newRoomId)) {
            metrics.rejectedIncompatibleMoves++
            continue
          }

          const move: Move = { slotId: sourceSlotId, newDay, newSlotIndex, newRoomId }
          const delta = calculateDeltaScore(ctx, state, move, scoreWorkTime)
          const newHard = currentScore.hardScore + delta.deltaHard
          const newSoft = currentScore.softScore + delta.deltaSoft

          if (newHard > bestCandidateHard || (newHard === bestCandidateHard && newSoft > bestCandidateSoft)) {
            bestCandidate = move
            bestCandidateHard = newHard
            bestCandidateSoft = newSoft
            foundCandidate = true
          }
        }
      }
    }

    if (!bestCandidate) {
      metrics.noCandidateIterations++
      history[historyIndex] = currentTotal
      historyIndex = (historyIndex + 1) % lahcWindowSize
      continue
    }

    metrics.attemptedMoves++

    // Apply the best candidate and compute actual new scores
    const delta = calculateDeltaScore(ctx, state, bestCandidate)
    const newTotal = currentTotal + delta.deltaHard + delta.deltaSoft
    const newHard = currentScore.hardScore + delta.deltaHard
    const newSoft = currentScore.softScore + delta.deltaSoft

    // Hard-first acceptance: reject if hard score worsens
    if (newHard < currentScore.hardScore) {
      metrics.rejectedHardWorseMoves++
      history[historyIndex] = currentTotal
      historyIndex = (historyIndex + 1) % lahcWindowSize
      continue
    }

    // Hard=0 regression guard: when already feasible, reject any move
    // that could introduce hard conflicts (delta.hard != 0 may be slightly
    // inaccurate due to week-overlap nuances, so reject delta.hard >= 0 too
    // to prevent drift).
    if (currentScore.hardScore === 0 && delta.deltaHard !== 0) {
      metrics.rejectedHardWorseMoves++
      history[historyIndex] = currentTotal
      historyIndex = (historyIndex + 1) % lahcWindowSize
      continue
    }

    // Accept: either hard improves, or hard equal + LAHC/soft acceptance
    let accept = false
    if (newHard > currentScore.hardScore) {
      accept = true
    } else {
      // hard equal — use LAHC acceptance
      if (newTotal >= history[historyIndex] || newTotal >= currentTotal) {
        accept = true
      }
    }

    if (accept) {
      applyMove(state, bestCandidate)
      currentTotal = newTotal
      currentScore.hardScore = newHard
      currentScore.softScore = newSoft
      metrics.acceptedMoves++

      // Track move type (get source pos from the best candidate's slot)
      const candSourcePos = state.assignments.get(bestCandidate.slotId)
      if (candSourcePos) {
        const isRoomOnly = bestCandidate.newDay === candSourcePos.dayOfWeek && bestCandidate.newSlotIndex === candSourcePos.slotIndex
        const isTimeOnly = bestCandidate.newRoomId === candSourcePos.roomId
        if (isRoomOnly) metrics.roomOnlyMoves++
        else if (isTimeOnly) metrics.timeOnlyMoves++
        else metrics.timeAndRoomMoves++
      }

      // Update best
      if (isScoreBetter(currentScore, bestScore)) {
        bestScore = { hardScore: currentScore.hardScore, softScore: currentScore.softScore }
        bestAssignments = cloneAssignments(state.assignments)
        bestIteration = i + 1
        metrics.bestHardScoreIteration = i + 1
      }
    }

    history[historyIndex] = currentTotal
    historyIndex = (historyIndex + 1) % lahcWindowSize

    if ((i + 1) % 1000 === 0 && onProgress) {
      onProgress(i + 1, { hardScore: currentScore.hardScore, softScore: currentScore.softScore })
    }
  }

  // 恢复 bestState
  const bestState: ScheduleState = {
    assignments: bestAssignments,
    originalAssignments: state.originalAssignments,
  }

  return { bestScore, bestState, iterations: maxIterations, metrics, usedSeed }
}
