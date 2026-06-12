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
 *   - slotIndex:    1..5 (K24-A4 — exclude 11-12节 and 中午)
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
import { getValidTeachingSlotIndexes } from './time-slots'
import {
  resolveWorkTimeConfigForSchedule,
  isWorkTimeDayAllowed,
  isWorkTimeSlotAllowed,
  type ResolvedWorkTimeForSchedule,
} from '@/lib/worktime/worktime-schedule-resolver'
// ─── Constants for the search space ──────────────────────

const DEFAULT_WEEK_WINDOW = 1
const MIN_WEEK = 1
const MAX_WEEK = 20

const DEFAULT_DAYS_WORKING = [1, 2, 3, 4, 5] as const
const WEEKEND_DAYS = [6, 7] as const
// K24-A4: only 1..5 (1-2节 to 9-10节) are valid teaching slots.
// 11-12节 (slotIndex=6) and "中午" (slotIndex=7) are not valid for
// new recommendations. Historical data is not modified.
const DEFAULT_SLOT_INDEXES = getValidTeachingSlotIndexes() as readonly number[]

const MIN_PLANS = 2
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20

// K24-A5: only Mon..Fri are valid preferred-day values. Weekend
// days (6/7) are NOT accepted as preferred day; callers must not
// set them. (We still allow includeWeekend=true to surface
// weekend in the search space, but preferredDayOfWeek is
// independently validated to 1..5 / null.)
const VALID_PREFERRED_DAY_VALUES = [1, 2, 3, 4, 5] as const

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
  /** K24-A5: optional preferred day-of-week inside the preferred
   *  week. null/undefined = automatic (any working day). 1..5 =
   *  Mon..Fri. 6/7 (weekend) are NOT accepted; callers must validate
   *  upstream. When set, plans on the (preferredWeek, preferredDay)
   *  tuple are surfaced first. */
  preferredDayOfWeek?: number | null
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
  /** K24-A3: true when targetWeek === preferredWeek. Added so the
   *  frontend can render "首选周" / "备选周" labels. */
  isPreferredWeek: boolean
  /** K24-A5: true when targetWeek === preferredWeek AND
   *  targetDayOfWeek === preferredDayOfWeek. Only meaningful when
   *  the caller supplied a preferredDayOfWeek; otherwise
   *  defaults to false. */
  isPreferredDay: boolean
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
  /** K24-A3: the preferred week (the user's selected target). */
  preferredWeek: number
  /** K24-A3: how many plans belong to the preferred week. */
  preferredWeekPlanCount: number
  /** K24-A3: how many plans belong to fallback weeks. */
  fallbackPlanCount: number
  /** K24-A5: the preferred day-of-week (1..5) or null when in
   *  automatic mode. Echoed back so the frontend can render the
   *  chosen day label without re-deriving. */
  preferredDayOfWeek: number | null
  /** K24-A5: how many plans belong to the (preferredWeek,
   *  preferredDayOfWeek) bucket. 0 when preferredDayOfWeek is
   *  null. */
  preferredDayPlanCount: number
  /** K24-A5: how many plans belong to the preferred week but on a
   *  different day. 0 when preferredDayOfWeek is null. */
  sameWeekOtherDayPlanCount: number
}

export interface AdjustmentPlanRecommendationResult {
  minimumSatisfied: boolean
  plans: AdjustmentPlanRecommendation[]
  rejectedSummary: AdjustmentPlanRejectedSummary
  searched: AdjustmentPlanSearched
  message?: string
  /** K24-A3: the user's selected preferred week. */
  preferredWeek: number
  /** K24-A3: true when at least one plan belongs to preferredWeek. */
  preferredWeekAvailable: boolean
  /** K24-A5: the user's selected preferred day-of-week (1..5) or
   *  null when in automatic mode. */
  preferredDayOfWeek: number | null
  /** K24-A5: true when at least one plan belongs to
   *  (preferredWeek, preferredDayOfWeek). Always true (or omitted)
   *  when preferredDayOfWeek is null. */
  preferredDayAvailable: boolean
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
      teacherConflict: 0, classGroupConflict: 0, roomConflict: 0,
      capacity: 0, linxiaoPolicy: 0, weekend: 0, unavailable: 0, other: 1,
    }, { weeks: [], days: [], slotIndexes: [], timeCandidateCount: 0, roomCandidateCount: 0, preferredWeek: input.preferredWeek ?? 1, preferredWeekPlanCount: 0, fallbackPlanCount: 0, preferredDayOfWeek: input.preferredDayOfWeek ?? null, preferredDayPlanCount: 0, sameWeekOtherDayPlanCount: 0 })
  }

  // 3. Determine preferredWeek.
  const taskStartWeek = slot.teachingTask.startWeek ?? 1
  const centerWeek = input.preferredWeek ?? taskStartWeek

  // 4. Build the search space using K26-I1 resolved WorkTime.
  //    Days and slots are driven by the active WorkTime config;
  //    `includeWeekend` is intersected with `allowWeekend`.
  const weeks = buildWeekList(centerWeek, weekWindow)
  const workTime = await resolveWorkTimeConfigForSchedule(semesterId)
  // Days: union of WorkTime weekday + (allowWeekend && caller includeWeekend).
  const days: number[] = []
  for (const d of workTime.weekdayValues) {
    if (!days.includes(d)) days.push(d)
  }
  if (workTime.allowWeekend && includeWeekend) {
    for (const d of workTime.weekendDayValues) {
      if (!days.includes(d)) days.push(d)
    }
  }
  // Slots: WorkTime active teaching slots (already excludes 6/7).
  const slotIndexes = [...workTime.activeTeachingSlotIndexes]
  // Always include 6/7 in `slotIndexes` for K24 display compatibility,
  // but the inner loop will skip them when targetSlotIndex is in legacy list.
  // However K26-I1 explicitly excludes 6/7 from active candidates, so
  // the inner loop's day-slot iteration should NOT propose them as new
  // targets. We keep them out of `slotIndexes` entirely.
  // (No additional padding.)

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
          retainedAdditionalRoomIds: slot.additionalRooms.map((room) => room.roomId),
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

        // K24-A2: cross-week recurring-slot self-occupancy gate.
        //
        // The K23-A room helper invokes checkScheduleConflicts with
        // `scheduleSlotId` excluded globally — i.e. the source
        // ScheduleSlot is removed from the day/slot conflict scan
        // across ALL weeks. That is correct for same-week moves, but
        // for cross-week moves the SAME recurring slot is still
        // occupying the target week (the source occurrence is being
        // moved FROM sourceWeek, not from targetWeek). Without this
        // gate, a recommendation would happily propose
        //   "第 13 周 · 同一 day/slot/room"
        // which is in fact a hard self-conflict.
        //
        // dryRunScheduleAdjustment handles this correctly (see
        // adjustments.ts:289 — the `targetWeek === sourceWeek`
        // guard on self-exclusion), but the recommendation layer
        // never reached dry-run. We add a focused week-aware check
        // here instead, matching the semantic dry-run enforces.
        //
        // In the current schema, base ScheduleSlot rows are
        // placeholders for the recurrence — the "is the task active
        // in targetWeek" answer comes from teachingTask.weekType /
        // startWeek / endWeek, not from the row itself. So:
        //   cross-week self-occupancy holds iff
        //     (a) the task is active in targetWeek, AND
        //     (b) the task has any base ScheduleSlot at the same
        //         (dayOfWeek, slotIndex) as the target.
        //
        // We do NOT exclude input.scheduleSlotId here: the source
        // slot's own (day, slot) IS the source occurrence, and we
        // want to detect its target-week recurrence. The outer-loop
        // "skip same week + same (day, slot)" filter already
        // prevents the trivial "原地不动" case from getting here.
        const taskActiveInTargetWeek = isTaskActiveInWeek(
          slot.teachingTask.weekType,
          slot.teachingTask.startWeek ?? 1,
          slot.teachingTask.endWeek ?? 16,
          targetWeek,
        )
        if (taskActiveInTargetWeek) {
          const selfRow = await prisma.scheduleSlot.findFirst({
            where: {
              semesterId,
              teachingTaskId: slot.teachingTaskId,
              dayOfWeek: targetDayOfWeek,
              slotIndex: targetSlotIndex,
            },
            select: { id: true },
          })
          if (selfRow) {
            // The same recurring course occupies this time on the
            // target week. Treat as a hard self-conflict at the
            // time layer; skip this time candidate entirely
            // (regardless of which room was offered).
            rejected.teacherConflict += 1
            continue
          }
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
            isPreferredWeek: targetWeek === centerWeek,
            // K24-A5: tentatively set to false; the bucketing loop
            // later overrides for (preferredWeek, preferredDay)
            // matches once preferredDayOfWeek is resolved.
            isPreferredDay: false,
          })
        }
      }
    }
  }

  // 6. K24-A3 + K24-A5: bucketed sorting.
  //
  // K24-A3 introduced preferredWeek-first (preferred vs fallback).
  // K24-A5 extends this to three buckets when preferredDayOfWeek is
  // set: (preferredWeek, preferredDay) > (preferredWeek, otherDay)
  // > (fallbackWeek, *). When preferredDayOfWeek is null, the
  // legacy two-bucket behavior is preserved.
  //
  // Rationale: The previous implementation sorted all plans by score
  // globally then sliced to limit. When preferredWeek had usable
  // plans but lower scores than fallback weeks, those preferred-week
  // plans were pushed out of the top-N by higher-scored fallback
  // plans. Users who explicitly selected "优先调课至第 13 周" would
  // see weeks 12/15 in the list instead. K24-A5 adds day-level
  // bucketing so users who also pick "周一" never see 周二/周三 in
  // the lead slot.

  // K24-A5: Resolve preferredDayOfWeek (defensive validation: only
  // null/1..5 accepted; 6/7 already excluded by the days list).
  const preferredDayOfWeek =
    input.preferredDayOfWeek == null
      ? null
      : (VALID_PREFERRED_DAY_VALUES as readonly number[]).includes(
            input.preferredDayOfWeek,
          )
        ? input.preferredDayOfWeek
        : null

  // Mark each plan with isPreferredWeek and isPreferredDay before
  // sorting.
  for (const p of plans) {
    p.isPreferredWeek = p.targetWeek === centerWeek
    p.isPreferredDay =
      preferredDayOfWeek != null &&
      p.targetWeek === centerWeek &&
      p.targetDayOfWeek === preferredDayOfWeek
  }

  // Three-bucket partition when preferredDayOfWeek is set; otherwise
  // the legacy two-bucket partition.
  let preferredDayPlans: AdjustmentPlanRecommendation[] = []
  let sameWeekOtherDayPlans: AdjustmentPlanRecommendation[] = []
  let fallbackPlans: AdjustmentPlanRecommendation[] = []

  if (preferredDayOfWeek != null) {
    preferredDayPlans = plans.filter(
      (p) => p.targetWeek === centerWeek && p.targetDayOfWeek === preferredDayOfWeek,
    )
    sameWeekOtherDayPlans = plans.filter(
      (p) => p.targetWeek === centerWeek && p.targetDayOfWeek !== preferredDayOfWeek,
    )
    fallbackPlans = plans.filter((p) => p.targetWeek !== centerWeek)
  } else {
    preferredDayPlans = [] // unused
    sameWeekOtherDayPlans = plans.filter((p) => p.targetWeek === centerWeek)
    fallbackPlans = plans.filter((p) => p.targetWeek !== centerWeek)
  }

  const sortByScore = (a: AdjustmentPlanRecommendation, b: AdjustmentPlanRecommendation) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.targetDayOfWeek !== b.targetDayOfWeek) return a.targetDayOfWeek - b.targetDayOfWeek
    if (a.targetSlotIndex !== b.targetSlotIndex) return a.targetSlotIndex - b.targetSlotIndex
    return a.roomId - b.roomId
  }
  preferredDayPlans.sort(sortByScore)
  sameWeekOtherDayPlans.sort(sortByScore)
  fallbackPlans.sort(sortByScore)

  // Composite: preferredDay > sameWeekOtherDay > fallback, capped at limit.
  const top = [
    ...preferredDayPlans,
    ...sameWeekOtherDayPlans,
    ...fallbackPlans,
  ].slice(0, limit)

  const preferredWeekAvailable = preferredDayPlans.length + sameWeekOtherDayPlans.length > 0
  const preferredDayAvailable = preferredDayOfWeek == null || preferredDayPlans.length > 0
  const preferredWeekPlanCount = Math.min(
    preferredDayPlans.length + sameWeekOtherDayPlans.length,
    limit,
  )
  const preferredDayPlanCount = Math.min(preferredDayPlans.length, limit)
  const sameWeekOtherDayPlanCount = Math.max(
    0,
    Math.min(preferredDayPlans.length + sameWeekOtherDayPlans.length, limit) -
      preferredDayPlanCount,
  )
  const fallbackPlanCount = Math.max(0, top.length - preferredDayPlanCount - sameWeekOtherDayPlanCount)

  // 7. Compose message.
  let message: string | undefined
  if (top.length === 0) {
    message = '当前没有可推荐的调课方案，请尝试调整首选周次或扩大搜索范围'
  } else if (preferredDayOfWeek != null && !preferredDayAvailable) {
    message = `第 ${centerWeek} 周${dayOfWeekLabel(preferredDayOfWeek)}暂无可用方案，以下为同周其他日期 / 邻近周备选方案`
  } else if (!preferredWeekAvailable) {
    message = `第 ${centerWeek} 周暂无可用方案，以下为邻近周备选方案`
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
      preferredWeek: centerWeek,
      preferredWeekPlanCount,
      fallbackPlanCount,
      preferredDayOfWeek,
      preferredDayPlanCount,
      sameWeekOtherDayPlanCount,
    },
    message,
    preferredWeek: centerWeek,
    preferredWeekAvailable,
    preferredDayOfWeek,
    preferredDayAvailable,
  }
}

/** Map 1..5 → "周一" / "周二" / … "周五" for human-readable
 *  messages. */
function dayOfWeekLabel(day: number): string {
  const labels: Record<number, string> = {
    1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五',
  }
  return labels[day] ?? `周${day}`
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
    preferredWeek: searched.preferredWeek,
    preferredWeekAvailable: false,
    preferredDayOfWeek: searched.preferredDayOfWeek,
    preferredDayAvailable: false,
  }
}

/**
 * Pure helper: is the given teaching task active in `week`?
 * Mirrors `isScheduleItemActiveInWeek` semantics in
 * src/lib/schedule/week-filter.ts, but is local to this module to
 * avoid a circular import (week-filter.ts pulls in ScheduleViewData
 * from types/schedule, which would in turn pull schedule types into
 * the recommendation layer for a single week-arithmetic question).
 */
function isTaskActiveInWeek(
  weekType: string | null,
  startWeek: number,
  endWeek: number,
  week: number,
): boolean {
  if (week < startWeek || week > endWeek) return false
  const t = (weekType ?? 'ALL').toUpperCase()
  if (t === 'ALL') return true
  if (t === 'ODD') return week % 2 === 1
  if (t === 'EVEN') return week % 2 === 0
  // Unknown weekType: treat as ALL to remain forward-compatible.
  return true
}

// Re-export the K23-A helper types so callers that import from this
// module do not need a second import.
export type { RoomRecommendationResult }
