/**
 * src/lib/schedule/room-recommendations.ts
 *
 * K23-A: Adjustment-time automatic room recommendations.
 *
 * Given a target time slot (week / dayOfWeek / slotIndex) and the moving
 * TeachingTask, find at least 2 candidate rooms that:
 *  - pass room / teacher / classGroup conflict (reuse checkScheduleConflicts)
 *  - satisfy capacity (reuse getTaskStudentCount logic)
 *  - satisfy the Linxiao / automotive K22-F2A business rule
 *
 * Reuses existing dry-run / conflict-check rules. Does NOT modify
 * score.ts / solver algorithm / Prisma schema. Read-only: no DB writes.
 *
 * Specialty classification is intentionally a verbatim copy of
 * score.ts:classifySpecialty (K22-F2A) so that K22-C 73/0/0/0 remains
 * unaffected. If K22-F2A is ever extracted to a shared module, this
 * copy should be replaced with the shared import.
 */

import { prisma } from '@/lib/prisma'
import { resolveSchedulerSemester } from '@/lib/semester'
import { getTaskStudentCount } from '@/lib/scheduler/capacity'
import { checkScheduleConflicts } from '@/lib/schedule/conflict-check'
import {
  resolveWorkTimeConfigForSchedule,
  checkWorkTimeTargetAllowed,
  type ResolvedWorkTimeForSchedule,
} from '@/lib/worktime/worktime-schedule-resolver'

// ─── K22-F2A specialty classification (verbatim copy from score.ts) ───

const AUTOMOTIVE_KEYWORDS = ['汽车', '车辆', '新能源', '智能网联', '汽修']

export type SpecialtyClassification =
  | 'AUTOMOTIVE_ONLY'
  | 'NON_AUTOMOTIVE_ONLY'
  | 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE'
  | 'NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL'
  | 'UNKNOWN_NO_SIGNAL'

function classifySpecialty(input: {
  classGroupNames: string[]
  courseName: string | null
  remark: string | null
}): SpecialtyClassification {
  const cgs = input.classGroupNames
  if (cgs.length === 0) {
    const auxAuto =
      (input.courseName != null && AUTOMOTIVE_KEYWORDS.some((kw) => input.courseName!.includes(kw))) ||
      (input.remark != null && AUTOMOTIVE_KEYWORDS.some((kw) => input.remark!.includes(kw)))
    return auxAuto ? 'NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL' : 'UNKNOWN_NO_SIGNAL'
  }
  const anyAuto = cgs.some((n) => AUTOMOTIVE_KEYWORDS.some((kw) => n.includes(kw)))
  const anyNonAuto = cgs.some((n) => !AUTOMOTIVE_KEYWORDS.some((kw) => n.includes(kw)))
  if (anyAuto && anyNonAuto) return 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE'
  if (anyAuto) return 'AUTOMOTIVE_ONLY'
  return 'NON_AUTOMOTIVE_ONLY'
}

function isLinxiaoRoom(room: { name: string; building: string | null }): boolean {
  if (room.name.includes('林校')) return true
  if (room.building && room.building.includes('林校')) return true
  return false
}

/**
 * Returns true if the task is allowed to be placed in a Linxiao room.
 *
 * K22-F2A rule:
 *   - AUTOMOTIVE_ONLY: yes
 *   - NON_AUTOMOTIVE_ONLY: no (HC6 hard)
 *   - MIXED: no (HC6 hard — non-auto students present)
 *   - NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL: no (course/remark is auxiliary, classGroup hard-rule dominates)
 *   - UNKNOWN_NO_SIGNAL: no (safer default)
 */
function isLinxiaoAllowedForTask(cls: SpecialtyClassification): boolean {
  return cls === 'AUTOMOTIVE_ONLY'
}

// ─── Public input / output shapes ───

export interface RoomRecommendationInput {
  scheduleSlotId: number
  targetWeek: number
  targetDayOfWeek: number
  targetSlotIndex: number
  /** Optional cap (default 5). Helper always tries to return at least 2. */
  limit?: number
  /** Optional semester override. Defaults to slot's semester. */
  semesterId?: number | null
  /**
   * Secondary rooms retained by the moving slot. Normally resolved from the
   * source slot; plan recommendation may pass them explicitly.
   */
  retainedAdditionalRoomIds?: number[]
}

export interface RoomRecommendationCandidate {
  roomId: number
  roomName: string
  building: string | null
  capacity: number
  type: string
  score: number
  reasons: string[]
  warnings: string[]
}

export interface RoomRecommendationRejectedSummary {
  conflict: number
  capacity: number
  linxiaoPolicy: number
  unavailable: number
  other: number
}

export interface RoomRecommendationResult {
  minimumSatisfied: boolean
  candidates: RoomRecommendationCandidate[]
  rejectedSummary: RoomRecommendationRejectedSummary
  message?: string
  /** K26-I3: WorkTime error when target is blocked by WorkTime policy. */
  workTimeError?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

// ─── Constants for ranking ───

const MIN_CANDIDATES = 2
const DEFAULT_LIMIT = 5

// ─── Helper entry point ───

/**
 * Find candidate rooms for a target adjustment time.
 *
 * The function is read-only (no DB writes). It walks every non-zero
 * room and runs the existing `checkScheduleConflicts` rule engine to
 * decide pass / fail. It then applies:
 *   - capacity filter (using getTaskStudentCount logic)
 *   - Linxiao / automotive K22-F2A hard rule
 *   - score ranking (larger is better)
 *
 * @returns a result with up to `limit` candidates and a rejected
 *   summary. `minimumSatisfied` is true iff at least MIN_CANDIDATES
 *   candidates are present.
 */
export async function findAdjustmentRoomRecommendations(
  input: RoomRecommendationInput,
): Promise<RoomRecommendationResult> {
  const limit = input.limit ?? DEFAULT_LIMIT

  // 1. Resolve semester
  const semester = await resolveSchedulerSemester({
    semesterId: input.semesterId ?? undefined,
  })
  const semesterId = semester.id

  // 1a. K26-I3: WorkTime guard — block targets that violate WorkTime policy
  // before any room query / capacity / conflict check.
  let workTime: ResolvedWorkTimeForSchedule
  try {
    workTime = await resolveWorkTimeConfigForSchedule(semesterId)
  } catch {
    return emptyResult('无法解析作息配置，请稍后重试', {
      conflict: 0, capacity: 0, linxiaoPolicy: 0, unavailable: 0, other: 1,
    }, { code: 'WORKTIME_DAY_DISABLED', message: '无法解析作息配置，请稍后重试。' })
  }

  const targetCheck = checkWorkTimeTargetAllowed(workTime, {
    dayOfWeek: input.targetDayOfWeek,
    slotIndex: input.targetSlotIndex,
  })
  if (!targetCheck.ok) {
    return emptyResult(targetCheck.message, {
      conflict: 0, capacity: 0, linxiaoPolicy: 0, unavailable: 0, other: 1,
    }, {
      code: targetCheck.code,
      message: targetCheck.message,
      details: targetCheck.details,
    })
  }

  // 2. Load the source slot + teaching task with class groups
  const slot = await prisma.scheduleSlot.findUnique({
    where: { id: input.scheduleSlotId },
    include: {
      room: true,
      additionalRooms: {
        select: { roomId: true },
        orderBy: { id: 'asc' },
      },
      teachingTask: {
        include: {
          course: true,
          taskClasses: { include: { classGroup: true } },
        },
      },
    },
  })
  if (!slot) {
    return emptyResult('ScheduleSlot 不存在', {
      conflict: 0, capacity: 0, linxiaoPolicy: 0, unavailable: 0, other: 1,
    })
  }

  // 3. Source task context
  const task = slot.teachingTask
  const retainedAdditionalRoomIds =
    input.retainedAdditionalRoomIds ?? slot.additionalRooms.map((item) => item.roomId)
  const classGroupIds = task.taskClasses.map((tc) => tc.classGroupId)
  const classGroupNames = task.taskClasses.map((tc) => tc.classGroup.name)

  // 4. Compute specialty classification (K22-F2A copy)
  const cls = classifySpecialty({
    classGroupNames,
    courseName: task.course?.name ?? null,
    remark: task.remark ?? null,
  })

  // 5. Compute total student count (mirror of adjustments.ts:sum(classGroup.studentCount ?? 50))
  const studentCount = task.taskClasses.reduce(
    (sum, tc) => sum + (tc.classGroup.studentCount ?? 50),
    0,
  )

  // 6. Compute the moving task's active weeks as a single-week set [targetWeek]
  // Recommendations only make sense for the target week; recommendation API
  // does not move across multiple weeks.
  const candidateWeeks: number[] = [input.targetWeek]

  // 7. Collect historical room preference for this teaching task
  const historicalRoomIds = await collectHistoricalRoomIds(task.id, semesterId)

  // 8. Load all non-zero rooms
  const allRooms = await prisma.room.findMany({
    where: { id: { not: 0 } },
    orderBy: [{ id: 'asc' }],
  })

  // 9. Walk each room; compute pass / fail and reasons
  const accepted: RoomRecommendationCandidate[] = []
  const rejected: RoomRecommendationRejectedSummary = {
    conflict: 0, capacity: 0, linxiaoPolicy: 0, unavailable: 0, other: 0,
  }

  for (const room of allRooms) {
    // 9a. Linxiao K22-F2A hard rule
    if (isLinxiaoRoom(room) && !isLinxiaoAllowedForTask(cls)) {
      rejected.linxiaoPolicy++
      continue
    }

    // 9b. Capacity check
    if (studentCount > room.capacity) {
      rejected.capacity++
      continue
    }

    // 9c. Conflict check (room / teacher / classGroup with week overlap)
    // Note: scheduleSlotId=input.scheduleSlotId excludes the source slot
    // so a self-conflict isn't reported when the room is unchanged.
    const conflictResult = await checkScheduleConflicts({
      scheduleSlotId: input.scheduleSlotId,
      teachingTaskId: task.id,
      targetDayOfWeek: input.targetDayOfWeek,
      targetSlotIndex: input.targetSlotIndex,
      targetRoomId: room.id,
      targetAdditionalRoomIds: retainedAdditionalRoomIds,
      semesterId,
    })
    if (conflictResult.hasConflict) {
      rejected.conflict++
      continue
    }

    // 9d. Build candidate
    const reasons: string[] = []
    const warnings: string[] = []
    let score = 100

    reasons.push('无教室冲突')
    reasons.push('无教师/班级冲突')
    reasons.push(`容量满足：${studentCount} / ${room.capacity}`)

    // Capacity utilization hint
    const util = room.capacity > 0 ? studentCount / room.capacity : 0
    if (util >= 0.30 && util <= 0.90) {
      score += 10
      reasons.push('容量利用率合理')
    } else if (util > 0.90) {
      score += 5
      warnings.push('容量较紧，余量较小')
    } else {
      // util < 0.30 — small class in big room
      score -= 10
      warnings.push('小班占用超大教室')
    }

    if (historicalRoomIds.has(room.id)) {
      score += 20
      reasons.push('与该教学任务历史教室一致')
    }

    if (cls === 'AUTOMOTIVE_ONLY' && isLinxiaoRoom(room)) {
      score += 15
      reasons.push('汽车专业优先林校')
    }

    if (room.building && room.building === slot.room?.building) {
      score += 5
      reasons.push('同楼栋优先')
    }

    accepted.push({
      roomId: room.id,
      roomName: room.name,
      building: room.building,
      capacity: room.capacity,
      type: room.type,
      score,
      reasons,
      warnings,
    })
  }

  // 10. Sort by score desc, then by roomId asc for determinism
  accepted.sort((a, b) => b.score - a.score || a.roomId - b.roomId)
  const top = accepted.slice(0, limit)

  const minimumSatisfied = top.length >= MIN_CANDIDATES

  // 11. Build message
  let message: string | undefined
  if (top.length === 0) {
    message = '当前时间段没有可用教室'
  } else if (!minimumSatisfied) {
    message = `当前时间段可用教室少于 ${MIN_CANDIDATES} 个`
  }

  return {
    minimumSatisfied,
    candidates: top,
    rejectedSummary: rejected,
    message,
  }
}

// ─── Internal helpers ───

async function collectHistoricalRoomIds(
  teachingTaskId: number,
  semesterId: number,
): Promise<Set<number>> {
  const slots = await prisma.scheduleSlot.findMany({
    where: { teachingTaskId, semesterId, roomId: { not: null } },
    select: { roomId: true },
  })
  const ids = new Set<number>()
  for (const s of slots) {
    if (s.roomId != null) ids.add(s.roomId)
  }
  return ids
}

function emptyResult(
  message: string,
  rejectedSummary: RoomRecommendationRejectedSummary,
  workTimeError?: RoomRecommendationResult['workTimeError'],
): RoomRecommendationResult {
  return {
    minimumSatisfied: false,
    candidates: [],
    rejectedSummary,
    message,
    workTimeError,
  }
}

// Re-export the task student count helper for callers that want to
// display the same number used internally.
export { getTaskStudentCount }
