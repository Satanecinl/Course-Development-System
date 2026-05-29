import type {
  SchedulingContext,
  ScheduleState,
  Move,
  Score,
  SolverConfig,
} from './types'
import { isScoreBetter } from './types'
import { calculateInitialScore, calculateDeltaScore } from './score'
import { getTaskStudentCount } from './capacity'

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

/** 随机整数 [min, max] */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 找出有冲突的 slot ID 集合 */
function findConflictingSlots(ctx: SchedulingContext, state: ScheduleState): Set<number> {
  const conflicting = new Set<number>()
  const slots = ctx.slots

  for (let i = 0; i < slots.length; i++) {
    const a = slots[i]
    const aPos = state.assignments.get(a.id)
    if (!aPos || aPos.roomId === 0) continue

    for (let j = i + 1; j < slots.length; j++) {
      const b = slots[j]
      const bPos = state.assignments.get(b.id)
      if (!bPos || bPos.roomId === 0) continue
      if (aPos.dayOfWeek !== bPos.dayOfWeek || aPos.slotIndex !== bPos.slotIndex) continue

      const hasRoomConflict = aPos.roomId === bPos.roomId
      const hasTeacherConflict = a.teachingTask.teacherId != null &&
        a.teachingTask.teacherId === b.teachingTask.teacherId
      let hasClassConflict = false
      for (const tcA of a.teachingTask.taskClasses) {
        for (const tcB of b.teachingTask.taskClasses) {
          if (tcA.classGroupId === tcB.classGroupId) { hasClassConflict = true; break }
        }
        if (hasClassConflict) break
      }

      if (hasRoomConflict || hasTeacherConflict || hasClassConflict) {
        conflicting.add(a.id)
        conflicting.add(b.id)
      }
    }
  }

  return conflicting
}

/** 求解器结果 */
export interface SolveResult {
  bestScore: Score
  bestState: ScheduleState
  iterations: number
}

/**
 * LAHC 求解器
 */
export function solve(
  ctx: SchedulingContext,
  config: SolverConfig,
  onProgress?: (iteration: number, score: Score) => void,
): SolveResult {
  const state = buildInitialState(ctx)
  const currentScore = calculateInitialScore(ctx, state)

  // 追踪 best
  let bestScore: Score = { hardScore: currentScore.hardScore, softScore: currentScore.softScore }
  let bestAssignments = cloneAssignments(state.assignments)

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
    return { bestScore, bestState: state, iterations: 0 }
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

  // 缓存冲突 slot 集合
  let conflictingCache = findConflictingSlots(ctx, state)
  let conflictingArray = [...conflictingCache]

  for (let i = 0; i < maxIterations; i++) {
    if (i % 500 === 0 && i > 0) {
      conflictingCache = findConflictingSlots(ctx, state)
      conflictingArray = [...conflictingCache]
    }

    const pool = conflictingArray.length > 0 ? conflictingArray : allMovable
    const slotId = pool[randInt(0, pool.length - 1)]

    const newDay = randInt(1, 7)
    const newSlot = randInt(1, 6)

    // 优先从容量足够的教室中选，如果没有则 fallback 到所有教室
    const slotData = ctx.slots.find((s) => s.id === slotId)
    const eligibleRooms = slotData ? eligibleRoomsByTask.get(slotData.teachingTaskId) : null
    const roomPool = eligibleRooms && eligibleRooms.length > 0 ? eligibleRooms.map((r) => r.id) : allRoomIds
    const newRoom = roomPool[randInt(0, roomPool.length - 1)]

    const move: Move = { slotId, newDay, newSlotIndex: newSlot, newRoomId: newRoom }

    const delta = calculateDeltaScore(ctx, state, move)
    const newTotal = currentTotal + delta.deltaHard + delta.deltaSoft

    // Late Acceptance 判定（分数为负，越大越好）
    if (newTotal >= history[historyIndex] || newTotal >= currentTotal) {
      applyMove(state, move)
      currentTotal = newTotal
      currentScore.hardScore += delta.deltaHard
      currentScore.softScore += delta.deltaSoft

      // 更新 best
      if (isScoreBetter(currentScore, bestScore)) {
        bestScore = { hardScore: currentScore.hardScore, softScore: currentScore.softScore }
        bestAssignments = cloneAssignments(state.assignments)
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

  return { bestScore, bestState, iterations: maxIterations }
}
