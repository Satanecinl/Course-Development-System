/**
 * Schedule conflict rules — pure helpers.
 *
 * Single source of truth for the "is this candidate in conflict with this
 * occupancy" rules used by:
 *  - src/lib/schedule/conflict-check.ts:checkScheduleConflicts (room/teacher/classGroup
 *    conflict on a base ScheduleSlot)
 *  - src/lib/schedule/adjustments.ts:dryRunScheduleAdjustment (same rules,
 *    applied to effective schedule items)
 *
 * These helpers are PURE: no Prisma, no NextRequest / NextResponse, no I/O.
 * They take in-memory `Occupancy` and `Candidate` shapes and return
 * rule-match records describing the conflict. The caller is responsible for
 * translating rule matches into a domain-specific response shape
 * (string[] for checkScheduleConflicts, typed ScheduleAdjustmentConflict for
 * dryRunScheduleAdjustment).
 *
 * Adjustment-specific semantics (effective schedule construction, targetWeek
 * single-week filter, capacity warning, typed response) remain in the
 * adjustment layer. This module is the SHARED rule kernel only.
 */

import { checkWeekOverlap, expandWeeks, type WeekConstraint } from '@/lib/conflict'

// ── Input shapes ──

export interface ScheduleConflictOccupancy {
  /** Source ScheduleSlot id; used for exclude-self filtering and traceability. */
  id?: number | null
  /** Teaching task id (for traceability / typed responses). */
  teachingTaskId?: number | null
  /** Teacher on the occupancy (null for business-empty). */
  teacherId?: number | null
  /** Class group ids on the occupancy. */
  classGroupIds: number[]
  /** Room id of the occupancy (null for business-empty). */
  roomId?: number | null
  /** Day of week 1-7. */
  dayOfWeek: number
  /** Slot index 1-6. */
  slotIndex: number
  /**
   * The occupancy's week constraint (the teaching task's start/end + weekType).
   * Required to check week overlap against the candidate.
   */
  weekConstraint: WeekConstraint
  // Optional display fields used by message formatters; safe to omit.
  teacherName?: string | null
  classNames?: string[]
  courseName?: string | null
  roomName?: string | null
}

export interface ScheduleConflictCandidate {
  teachingTaskId?: number | null
  teacherId?: number | null
  classGroupIds: number[]
  roomId?: number | null
  dayOfWeek: number
  slotIndex: number
  /**
   * Either a WeekConstraint (range/odd/even/...) OR a single week number
   * (number[] from expandWeeks). The pure rules treat the candidate as
   * "active in these weeks" and checks overlap with the occupancy's
   * WeekConstraint via checkWeekOverlap.
   */
  weeks: number[]
  excludeOccupancyId?: number | null
  // Optional display fields for message formatting.
  teacherName?: string | null
  classNames?: string[]
}

export type ScheduleConflictRuleType = 'teacher' | 'classGroup' | 'room'

export interface ScheduleConflictRuleMatch {
  type: ScheduleConflictRuleType
  occupancyId?: number
  message: string
}

// ── Time / week predicates ──

export function isSameTimeSlot(
  candidate: Pick<ScheduleConflictCandidate, 'dayOfWeek' | 'slotIndex'>,
  occupancy: Pick<ScheduleConflictOccupancy, 'dayOfWeek' | 'slotIndex'>,
): boolean {
  return candidate.dayOfWeek === occupancy.dayOfWeek && candidate.slotIndex === occupancy.slotIndex
}

export function isWeekOverlapping(
  candidateWeeks: number[],
  occupancyWeek: WeekConstraint,
): boolean {
  if (candidateWeeks.length === 0) return false
  const occWeeks = expandWeeks(occupancyWeek)
  for (const w of candidateWeeks) {
    if (occWeeks.has(w)) return true
  }
  return false
}

export function isWeekOverlappingConstraints(
  candidateWeek: WeekConstraint,
  occupancyWeek: WeekConstraint,
): boolean {
  return checkWeekOverlap(candidateWeek, occupancyWeek)
}

// ── Identity predicates ──

export function isTeacherConflict(
  candidate: Pick<ScheduleConflictCandidate, 'teacherId'>,
  occupancy: Pick<ScheduleConflictOccupancy, 'teacherId'>,
): boolean {
  if (candidate.teacherId == null) return false
  if (occupancy.teacherId == null) return false
  return candidate.teacherId === occupancy.teacherId
}

export function isRoomConflict(
  candidate: Pick<ScheduleConflictCandidate, 'roomId'>,
  occupancy: Pick<ScheduleConflictOccupancy, 'roomId'>,
): boolean {
  if (candidate.roomId == null) return false
  if (occupancy.roomId == null) return false
  return candidate.roomId === occupancy.roomId
}

export function isClassGroupConflict(
  candidate: Pick<ScheduleConflictCandidate, 'classGroupIds'>,
  occupancy: Pick<ScheduleConflictOccupancy, 'classGroupIds'>,
): boolean {
  if (candidate.classGroupIds.length === 0) return false
  if (occupancy.classGroupIds.length === 0) return false
  for (const id of candidate.classGroupIds) {
    if (occupancy.classGroupIds.includes(id)) return true
  }
  return false
}

// ── Single-occupancy rule check ──

export interface ScheduleConflictRuleCheckOptions {
  /**
   * If true, room/teacher/classGroup matches are reported. If false, the
   * candidate is treated as just a time/week query (e.g., when caller
   * only wants to know if a slot is occupied in a given day/slot/week).
   * Defaults to true.
   */
  checkRules?: boolean
  /**
   * If true, skip the occupancy whose id equals
   * candidate.excludeOccupancyId. Defaults to true.
   */
  honorExcludeSelf?: boolean
}

/**
 * Run the rule kernel against a single occupancy.
 * Returns a list of rule matches (may be empty).
 *
 * Pure — no I/O, no Prisma.
 */
export function checkOccupancyConflicts(
  candidate: ScheduleConflictCandidate,
  occupancy: ScheduleConflictOccupancy,
  options: ScheduleConflictRuleCheckOptions = {},
): ScheduleConflictRuleMatch[] {
  const { checkRules = true, honorExcludeSelf = true } = options
  const matches: ScheduleConflictRuleMatch[] = []

  if (honorExcludeSelf && candidate.excludeOccupancyId != null && occupancy.id === candidate.excludeOccupancyId) {
    return matches
  }
  if (!isSameTimeSlot(candidate, occupancy)) return matches
  if (!isWeekOverlapping(candidate.weeks, occupancy.weekConstraint)) return matches
  if (!checkRules) return matches

  if (isRoomConflict(candidate, occupancy)) {
    matches.push({
      type: 'room',
      occupancyId: occupancy.id ?? undefined,
      message: '', // formatter fills in
    })
  }
  if (isTeacherConflict(candidate, occupancy)) {
    matches.push({
      type: 'teacher',
      occupancyId: occupancy.id ?? undefined,
      message: '',
    })
  }
  if (isClassGroupConflict(candidate, occupancy)) {
    matches.push({
      type: 'classGroup',
      occupancyId: occupancy.id ?? undefined,
      message: '',
    })
  }

  return matches
}

// ── Bulk helpers ──

/**
 * Find all rule matches of any kind (teacher / classGroup / room) between
 * the candidate and the occupancy list. Time/week must overlap for a
 * match to be reported; rule predicates are short-circuited by occupancy.
 *
 * Use this when the caller has a pre-filtered occupancy list (e.g., from
 * a Prisma findMany by day/slotIndex) and wants to apply the rule kernel.
 */
export function findRuleMatches(
  candidate: ScheduleConflictCandidate,
  occupancies: ScheduleConflictOccupancy[],
  options: ScheduleConflictRuleCheckOptions = {},
): ScheduleConflictRuleMatch[] {
  const matches: ScheduleConflictRuleMatch[] = []
  for (const occ of occupancies) {
    matches.push(...checkOccupancyConflicts(candidate, occ, options))
  }
  return matches
}

// ── Chinese message formatters (preserved from checkScheduleConflicts) ──

function dayOfWeekToChinese(day: number): string {
  const map: Record<number, string> = {
    1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日',
  }
  return map[day] || `周${day}`
}

function getSlotLabel(slotIndex: number): string {
  const labels = ['', '1-2节', '3-4节', '5-6节', '7-8节', '9-10节', '11-12节', '中午']
  return labels[slotIndex] || `${slotIndex * 2 - 1}-${slotIndex * 2}节`
}

export function formatRuleMatchMessage(
  match: ScheduleConflictRuleMatch,
  candidate: ScheduleConflictCandidate,
  occupancy: ScheduleConflictOccupancy,
): string {
  const dayLabel = dayOfWeekToChinese(occupancy.dayOfWeek)
  const slotLabel = getSlotLabel(occupancy.slotIndex)
  const classNames = occupancy.classNames?.join('、') ?? ''
  const courseName = occupancy.courseName || '未知课程'
  const teacherName = occupancy.teacherName || '未知'
  const roomName = occupancy.roomName || '未知'
  const candidateTeacher = candidate.teacherName || ''
  const candidateClassNames = candidate.classNames?.join('、') || '未知'

  switch (match.type) {
    case 'room': {
      const roomLabel = occupancy.roomName || String(occupancy.roomId ?? '')
      return `教室${roomLabel}在${dayLabel}${slotLabel}已被${classNames}的《${courseName}》占用（教师：${teacherName}）`
    }
    case 'teacher': {
      return `教师${candidateTeacher || teacherName}在${dayLabel}${slotLabel}已有《${courseName}》（${classNames}，教室：${roomName}）`
    }
    case 'classGroup': {
      return `班级${candidateClassNames}在${dayLabel}${slotLabel}已有《${courseName}》（教师：${teacherName}，教室：${roomName}）`
    }
  }
}
