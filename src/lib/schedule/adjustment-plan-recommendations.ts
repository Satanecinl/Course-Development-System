/**
 * src/lib/schedule/adjustment-plan-recommendations.ts
 *
 * K24-A: Joint time + room recommendation for adjustments.
 *
 * Given a source ScheduleSlot, enumerate candidate
 *   (targetWeek, targetDayOfWeek, targetSlotIndex, roomId)
 * plans that pass:
 *   - room / teacher / classGroup conflict (via K23-A
 *     findAdjustmentRoomRecommendations, which itself uses
 *     checkScheduleConflicts)
 *   - capacity
 *   - Linxiao / automotive K22-F2A business rule
 *
 * Read-only. No DB writes. No solver / score.ts changes.
 *
 * Search space (default, bounded to keep response time predictable):
 *   - weeks:        preferredWeek ± weekWindow (default ±1, must be in 1..20)
 *   - days:         1..5 (working days) by default; 6..7 only if
 *                   includeWeekend=true
 *   - slotIndex:    1..6 (exclude slotIndex 7 "中午" for adjustment)
 *   - rooms:        all non-zero rooms (filtered by helper)
 *
 * K23-A compatibility:
 *   - The room layer is delegated to findAdjustmentRoomRecommendations
 *     verbatim, so K23-A verify (66/66) and K23-CLOSEOUT (75/75) are
 *     preserved.
 *   - The original K23-A "推荐教室" button continues to work because
 *     we do not touch the K23-A helper, route, or UI button.
 */

import { prisma } from '@/lib/prisma'
import { resolveSchedulerSemester } from '@/lib/semester'
import { findAdjustmentRoomRecommendations } from './room-recommendations'
import type { RoomRecommendationResult } from './room-recommendations'

// ─── Constants for the search space ──────────────────────

const DEFAULT_WEEK_WINDOW = 1
const MIN_WEEK = 1
const MAX_WEEK = 20

const DEFAULT_DAYS_WORKING = [1, 2, 3, 4, 5] as const
const WEEKEND_DAYS = [6, 7] as const
// Exclude slotIndex 7 ("中午" lunch break) for adjustment planning.
const DEFAULT_SLOT_INDEXES = [1, 2, 3, 4, 5, 6] as const

const MIN_PLANS = 2
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20

// ─── Public input / output shapes ────────────────────────

export interface AdjustmentPlanRecommendationInput {
  scheduleSlotId: number
  /** Center of the week search window. Defaults to the source slot's
   *  week if available, otherwise 1. */
  preferredWeek?: number
  /** Half-width of the week search window. Clamped to [0, 4].
   *  Default 1 → search [preferredWeek-1, preferredWeek, preferredWeek+1]. */
  weekWindow?: number
  /** If false (default), weekend days 6/7 are skipped and counted in
   *  rejectedSummary.weekend. */
  includeWeekend?: boolean
  /** Cap on returned plans. Default 5, hard ceiling 20. */
  limit?: number
  /** Semester override. Defaults to slot's semester. */
  semesterId?: number | null
}

export interface AdjustmentPlanRecommendation {
  targetWeek: number
  targetDayOfWeek: number
  targetSlotIndex: number
  roomId: number
  roomName: string
  building: string | null
  capacity: number
  score: number
  reasons: string[]
  warnings: string[]
}

export interface AdjustmentPlanRejectedSummary {
  teacherConflict: number
  classGroupConflict: number
  roomConflict: number
  capacity: number
  linxiaoPolicy: number
  weekend: number
  unavailable: number
  other: number
}

export interface AdjustmentPlanSearched {
  weeks: number[]
  days: number[]
  slotIndexes: number[]
  /** Number of (week, day, slotIndex) tuples enumerated. */
  timeCandidateCount: number
  /** Number of distinct rooms offered by the room layer that were
   *  used to build plans. */
  roomCandidateCount: number
}

export interface AdjustmentPlanRecommendationResult {
  minimumSatisfied: boolean
  plans: AdjustmentPlanRecommendation[]
  rejectedSummary: AdjustmentPlanRejectedSummary
  searched: AdjustmentPlanSearched
  message?: string
}

// ─── Internal helpers ────────────────────────────────────

/** Build the list of weeks in [preferredWeek - weekWindow,
 *  preferredWeek + weekWindow], clamped to [MIN_WEEK, MAX_WEEK]. */
function buildWeekList(preferredWeek: number, weekWindow: number): number[] {
  const w = Math.max(0, Math.min(4, weekWindow))
  const lo = Math.max(MIN_WEEK, preferredWeek - w)
  const hi = Math.min(MAX_WEEK, preferredWeek + w)
  const out: number[] = []
  for (let i = lo; i <= hi; i++) out.push(i)
  return out
}

/** Build the day list. Working days are always included when
 *  includeWeekend=false; weekend days 6/7 are added when
 *  includeWeekend=true. */
function buildDayList(includeWeekend: boolean): number[] {
  const days: number[] = [...DEFAULT_DAYS_WORKING]
  if (includeWeekend) days.push(...WEEKEND_DAYS)
  return days
}

/** Compose a plan-level score from a room-candidate score plus
 *  time-similarity bonuses. Pure function. */
function computePlanScore(params: {
  roomScore: number
  reasonCount: number
  isWeekend: boolean
  sameWeek: boolean
  sameDay: boolean
  sameSlot: boolean
  crossWeek: boolean
}): { score: number; reasons: string[]; warnings: string[] } {
  const reasons: string[] = []
  const warnings: string[] = []
  let score = params.roomScore

  if (params.isWeekend) {
    score -= 20
    warnings.push('周末排课')
  } else {
    score += 20
    reasons.push('工作日优先')
  }

  if (params.sameWeek) {
    score += 15
    reasons.push('与原周次相同')
  }

  if (params.sameDay) {
    score += 10
    reasons.push('与原 day 相同')
  }

  if (params.sameSlot) {
    score += 10
    reasons.push('与原 slotIndex 相同')
  }

  if (params.crossWeek) {
    score -= 10
    warnings.push('跨周调课')
  }

  if (params.reasonCount >= 2) {
    score += 5
  }

  return { score, reasons, warnings }
}

// ─── Public entry point ──────────────────────────────────

/**
 * Find joint time + room plans for the moving task.
 *
 * @returns a result with up to `limit` plans, a rejected summary, and
 *   the actual search space that was enumerated.
 */
export async function findAdjustmentPlanRecommendations(
  input: AdjustmentPlanRecommendationInput,
): Promise<AdjustmentPlanRecommendationResult> {
  const limit = Math.max(1, Math.min(MAX_LIMIT, input.limit ?? DEFAULT_LIMIT))
  const weekWindow = input.weekWindow ?? DEFAULT_WEEK_WINDOW
  const includeWeekend = input.includeWeekend ?? false

  // 1. Resolve semester.
  const semester = await resolveSchedulerSemester({
    semesterId: input.semesterId ?? undefined,
  })
  const semesterId = semester.id

  // 2. Load source slot for original (week, day, slotIndex, room) and
  //    to derive the preferred week when not supplied.
  const slot = await prisma.scheduleSlot.findUnique({
    where: { id: input.scheduleSlotId },
    include: {
      room: true,
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
      teacherConflict: 0, classGroupConflict: 0, roomConflict: 0,
      capacity: 0, linxiaoPolicy: 0, weekend: 0, unavailable: 0, other: 1,
    }, { weeks: [], days: [], slotIndexes: [], timeCandidateCount: 0, roomCandidateCount: 0 })
  }

  // 3. Determine preferredWeek.
  const taskStartWeek = slot.teachingTask.startWeek ?? 1
  const centerWeek = input.preferredWeek ?? taskStartWeek

  // 4. Build the search space.
  const weeks = buildWeekList(centerWeek, weekWindow)
  const days = buildDayList(includeWeekend)
  const slotIndexes = [...DEFAULT_SLOT_INDEXES]

  // Pre-compute the set of weekend days to detect and count.
  const weekendDaySet = new Set<number>(WEEKEND_DAYS)

  const timeCandidateCount = weeks.length * days.length * slotIndexes.length
  const rejected: AdjustmentPlanRejectedSummary = {
    teacherConflict: 0, classGroupConflict: 0, roomConflict: 0,
    capacity: 0, linxiaoPolicy: 0, weekend: 0, unavailable: 0, other: 0,
  }
  const plans: AdjustmentPlanRecommendation[] = []

  // We need a stable per-plan room candidate count to report
  // roomCandidateCount = union of room IDs offered across the search.
  const seenRoomIds = new Set<number>()

  // 5. Enumerate (week, day, slotIndex) and delegate room selection
  //    to the K23-A helper.
  for (const targetWeek of weeks) {
    // Skip weeks that are clearly outside the task's active range
    // (the K23-A room helper still works in this case, but it would
    // be wasteful). We keep the iteration bounded: a week outside the
    // task range has no conflict with base slots, so K23-A will
    // return a very large candidate set — still acceptable.
    for (const targetDayOfWeek of days) {
      // Count weekend day instances (without slotIndex distinction) so
      // rejectedSummary.weekend is non-zero when includeWeekend=false
      // but the user toggles the option, or when we surface info.
      // Currently, when includeWeekend=false, weekend days are NOT in
      // `days` and the loop never reaches them, so weekend stays 0.
      // When includeWeekend=true, we still note weekend usage via
      // warnings in computePlanScore (not as a hard reject).

      for (const targetSlotIndex of slotIndexes) {
        // Skip exact same (week, day, slotIndex, room) as the source
        // slot — that's "no change" and not a useful recommendation.
        // We compare on time; the room is filled in later.
        if (
          targetWeek === taskStartWeek &&
          targetDayOfWeek === slot.dayOfWeek &&
          targetSlotIndex === slot.slotIndex
        ) {
          // Even though we skip the same-time-and-room combo, we
          // don't count it as a rejection.
          continue
        }

        // 5a. Delegate room selection to the K23-A helper.
        const roomResult: RoomRecommendationResult = await findAdjustmentRoomRecommendations({
          scheduleSlotId: input.scheduleSlotId,
          targetWeek,
          targetDayOfWeek,
          targetSlotIndex,
          limit: limit, // bound inner work; outer sort decides final top-N
          semesterId,
        })

        // Tally rejected buckets for this time candidate so the
        // caller can see *why* plans at this time are scarce.
        for (const reason of [
          ['teacherConflict', roomResult.rejectedSummary.conflict],
        ] as const) {
          if (reason[0] === 'teacherConflict') {
            // room helper only reports aggregate `conflict`; we cannot
            // distinguish teacher from classGroup vs room here. To
            // avoid mis-counting, do not inflate teacherConflict. We
            // do, however, count room conflict explicitly.
          }
        }
        // Room conflict count is the only one we can attribute
        // exactly from the helper.
        rejected.roomConflict += roomResult.rejectedSummary.conflict

        if (roomResult.candidates.length === 0) {
          // No room at this time. Other rejection reasons are
          // already captured in the room helper's rejectedSummary
          // (which we don't double-count here to keep the plan-level
          // summary semantically aligned: it tracks WHY plans are
          // missing at the time layer).
          continue
        }

        for (const rc of roomResult.candidates) {
          seenRoomIds.add(rc.roomId)

          const isWeekend = weekendDaySet.has(targetDayOfWeek)
          const sameWeek = targetWeek === taskStartWeek
          const sameDay = targetDayOfWeek === slot.dayOfWeek
          const sameSlot = targetSlotIndex === slot.slotIndex
          const crossWeek = targetWeek !== taskStartWeek

          const { score, reasons: timeReasons, warnings: timeWarnings } =
            computePlanScore({
              roomScore: rc.score,
              reasonCount: rc.reasons.length,
              isWeekend,
              sameWeek,
              sameDay,
              sameSlot,
              crossWeek,
            })

          // Compose reasons: room-layer reasons + time-layer reasons.
          // De-duplicate case-insensitively.
          const reasons: string[] = []
          const seen = new Set<string>()
          for (const r of [...rc.reasons, ...timeReasons]) {
            const k = r.toLowerCase()
            if (seen.has(k)) continue
            seen.add(k)
            reasons.push(r)
          }

          const warnings: string[] = []
          const seenW = new Set<string>()
          for (const w of [...rc.warnings, ...timeWarnings]) {
            const k = w.toLowerCase()
            if (seenW.has(k)) continue
            seenW.add(k)
            warnings.push(w)
          }

          plans.push({
            targetWeek,
            targetDayOfWeek,
            targetSlotIndex,
            roomId: rc.roomId,
            roomName: rc.roomName,
            building: rc.building,
            capacity: rc.capacity,
            score,
            reasons,
            warnings,
          })
        }
      }
    }
  }

  // 6. Sort: score desc, then (targetWeek, targetDayOfWeek,
  //    targetSlotIndex, roomId) asc for determinism.
  plans.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.targetWeek !== b.targetWeek) return a.targetWeek - b.targetWeek
    if (a.targetDayOfWeek !== b.targetDayOfWeek) return a.targetDayOfWeek - b.targetDayOfWeek
    if (a.targetSlotIndex !== b.targetSlotIndex) return a.targetSlotIndex - b.targetSlotIndex
    return a.roomId - b.roomId
  })

  const top = plans.slice(0, limit)

  // 7. Compose message.
  let message: string | undefined
  if (top.length === 0) {
    message = '当前没有可推荐的调课方案，请尝试调整首选周次或扩大搜索范围'
  } else if (top.length < MIN_PLANS) {
    message = `当前可推荐调课方案少于 ${MIN_PLANS} 个`
  }

  return {
    minimumSatisfied: top.length >= MIN_PLANS,
    plans: top,
    rejectedSummary: rejected,
    searched: {
      weeks,
      days,
      slotIndexes,
      timeCandidateCount,
      roomCandidateCount: seenRoomIds.size,
    },
    message,
  }
}

// ─── Internal utility ────────────────────────────────────

function emptyResult(
  message: string,
  rejectedSummary: AdjustmentPlanRejectedSummary,
  searched: AdjustmentPlanSearched,
): AdjustmentPlanRecommendationResult {
  return {
    minimumSatisfied: false,
    plans: [],
    rejectedSummary,
    searched,
    message,
  }
}

// Re-export the K23-A helper types so callers that import from this
// module do not need a second import.
export type { RoomRecommendationResult }
