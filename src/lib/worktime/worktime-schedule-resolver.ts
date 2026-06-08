/**
 * src/lib/worktime/worktime-schedule-resolver.ts
 *
 * K26-I1: Schedule-safe WorkTime resolver for adjustment recommendation.
 *
 * Wraps K26-G `resolveWorkTimeConfig` with a lightweight, scheduler-friendly
 * mapper that exposes only the policy fields needed by plan/room/dry-run/apply.
 * Falls back to the K26-D static helper when no DB config exists.
 *
 * CRITICAL: this module is read-only. It never writes to the DB.
 */

import { prisma } from '@/lib/prisma'
import { VALID_TEACHING_SLOT_INDEXES, LEGACY_DISPLAY_SLOT_INDEXES } from '@/lib/schedule/time-slots'
import type { WorkTimeTargetErrorCode } from '@/types/schedule-adjustment'

// ── Types ──

export interface ResolvedSlotDefinition {
  slotIndex: number
  label: string
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  isTeachingSlot: boolean
  isLegacyDisplay: boolean
  sortOrder: number
}

export interface ResolvedWorkTimeForSchedule {
  semesterId: number
  source: 'database' | 'staticFallback'
  allowWeekend: boolean
  activeTeachingSlotIndexes: number[]
  legacyDisplaySlotIndexes: number[]
  weekendDayValues: number[]
  weekdayValues: number[]
  slotsByIndex: Record<number, ResolvedSlotDefinition>
}

// ── Constants (mirrors K26-D helper) ──

const WEEKDAY_VALUES = [1, 2, 3, 4, 5] as const
const WEEKEND_DAY_VALUES = [6, 7] as const

// ── Static fallback builder ──

function buildStaticFallback(semesterId: number): ResolvedWorkTimeForSchedule {
  const activeSlots: ResolvedSlotDefinition[] = VALID_TEACHING_SLOT_INDEXES.map((slotIndex) => ({
    slotIndex,
    label: defaultLabelFor(slotIndex),
    startsAt: null,
    endsAt: null,
    isActive: true,
    isTeachingSlot: true,
    isLegacyDisplay: false,
    sortOrder: slotIndex,
  }))

  const legacySlots: ResolvedSlotDefinition[] = LEGACY_DISPLAY_SLOT_INDEXES.map((slotIndex) => ({
    slotIndex,
    label: defaultLabelFor(slotIndex),
    startsAt: null,
    endsAt: null,
    isActive: false,
    isTeachingSlot: false,
    isLegacyDisplay: true,
    sortOrder: slotIndex,
  }))

  const slotsByIndex: Record<number, ResolvedSlotDefinition> = {}
  for (const s of [...activeSlots, ...legacySlots]) slotsByIndex[s.slotIndex] = s

  return {
    semesterId,
    source: 'staticFallback',
    allowWeekend: false,
    activeTeachingSlotIndexes: [...VALID_TEACHING_SLOT_INDEXES],
    legacyDisplaySlotIndexes: [...LEGACY_DISPLAY_SLOT_INDEXES],
    weekendDayValues: [...WEEKEND_DAY_VALUES],
    weekdayValues: [...WEEKDAY_VALUES],
    slotsByIndex,
  }
}

function defaultLabelFor(slotIndex: number): string {
  if (slotIndex === 1) return '1-2节'
  if (slotIndex === 2) return '3-4节'
  if (slotIndex === 3) return '5-6节'
  if (slotIndex === 4) return '7-8节'
  if (slotIndex === 5) return '9-10节'
  if (slotIndex === 6) return '11-12节'
  if (slotIndex === 7) return '中午'
  return `第${slotIndex}节`
}

// ── Main resolver ──

/**
 * Resolves the active WorkTime config for a given semester, returning
 * only the policy fields required by adjustment recommendation/guard code.
 *
 * Resolution priority:
 *   1. Default active WorkTimeConfig for the semester.
 *   2. Static fallback derived from K26-D helper.
 *
 * Slot 6/7 are ALWAYS excluded from active teaching candidates, even if
 * malformed DB says otherwise. This is enforced by the K26-D invariant and
 * the K26-J solver/score threshold semantics. K26-J may change this.
 */
export async function resolveWorkTimeConfigForSchedule(
  semesterId: number
): Promise<ResolvedWorkTimeForSchedule> {
  if (!Number.isFinite(semesterId) || semesterId < 1) {
    throw new Error(`resolveWorkTimeConfigForSchedule: invalid semesterId=${semesterId}`)
  }

  // Try DB
  const config = await prisma.workTimeConfig.findFirst({
    where: {
      semesterId,
      isDefault: true,
      isActive: true,
    },
    include: {
      slots: true,
    },
  })

  if (config) {
    // Active teaching = isActive=true AND isTeachingSlot=true AND isLegacyDisplay=false
    // Force-exclude slot 6/7 (legacy display) regardless of DB flags.
    const activeSet = new Set<number>([...VALID_TEACHING_SLOT_INDEXES])
    const activeCandidates = config.slots
      .filter(
        (s) =>
          s.isActive &&
          s.isTeachingSlot &&
          !s.isLegacyDisplay &&
          activeSet.has(s.slotIndex)
      )
      .map((s) => s.slotIndex)

    // De-duplicate + sort
    const activeTeachingSlotIndexes = Array.from(new Set(activeCandidates)).sort((a, b) => a - b)

    // If DB had no valid active slots, fall through to static fallback
    if (activeTeachingSlotIndexes.length > 0) {
      const legacyCandidates = config.slots
        .filter((s) => s.isLegacyDisplay)
        .map((s) => s.slotIndex)
      const legacyDisplaySlotIndexes = Array.from(new Set(legacyCandidates)).sort((a, b) => a - b)

      const slotsByIndex: Record<number, ResolvedSlotDefinition> = {}
      for (const s of config.slots) {
        slotsByIndex[s.slotIndex] = {
          slotIndex: s.slotIndex,
          label: s.label,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          isActive: s.isActive,
          isTeachingSlot: s.isTeachingSlot,
          isLegacyDisplay: s.isLegacyDisplay,
          sortOrder: s.sortOrder,
        }
      }

      return {
        semesterId,
        source: 'database',
        allowWeekend: config.allowWeekend,
        activeTeachingSlotIndexes,
        legacyDisplaySlotIndexes,
        weekendDayValues: [...WEEKEND_DAY_VALUES],
        weekdayValues: [...WEEKDAY_VALUES],
        slotsByIndex,
      }
    }
    // DB had config but no valid active slots — fall through to static fallback
  }

  return buildStaticFallback(semesterId)
}

// ── Policy helpers ──

export function isWorkTimeDayAllowed(
  workTime: ResolvedWorkTimeForSchedule,
  dayOfWeek: number
): boolean {
  if (workTime.weekdayValues.includes(dayOfWeek)) return true
  if (workTime.allowWeekend && workTime.weekendDayValues.includes(dayOfWeek)) return true
  return false
}

export function isWorkTimeSlotAllowed(
  workTime: ResolvedWorkTimeForSchedule,
  slotIndex: number
): boolean {
  if (workTime.legacyDisplaySlotIndexes.includes(slotIndex)) return false
  if (LEGACY_DISPLAY_SLOT_INDEXES.includes(slotIndex as 6 | 7)) return false
  return workTime.activeTeachingSlotIndexes.includes(slotIndex)
}

export function getAllowedWorkTimeCandidateDays(
  workTime: ResolvedWorkTimeForSchedule
): number[] {
  const days = [...workTime.weekdayValues]
  if (workTime.allowWeekend) {
    days.push(...workTime.weekendDayValues)
  }
  return days
}

export function getAllowedWorkTimeCandidateSlots(
  workTime: ResolvedWorkTimeForSchedule
): number[] {
  return [...workTime.activeTeachingSlotIndexes]
}

// ── K26-I2: Target legality guard ──

/**
 * Result of checking whether a schedule adjustment target (day + slot) is
 * allowed under the resolved WorkTime policy.
 */
export type WorkTimeTargetCheckResult =
  | { ok: true }
  | {
      ok: false
      code: WorkTimeTargetErrorCode
      message: string
      details?: Record<string, unknown>
    }

/**
 * Checks whether a MOVE target (dayOfWeek + slotIndex) is legal under the
 * resolved WorkTime configuration.
 *
 * Rules:
 *  1. Day must be allowed: weekday (1-5) always OK; weekend (6/7) only if allowWeekend=true.
 *  2. Slot must be in activeTeachingSlotIndexes.
 *  3. Slot must not be a legacy display slot (6/7 or isLegacyDisplay).
 *  4. Slot must not be inactive or non-teaching.
 *
 * This function is purely read-only and never writes to the DB.
 */
export function checkWorkTimeTargetAllowed(
  workTime: ResolvedWorkTimeForSchedule,
  target: { dayOfWeek: number; slotIndex: number }
): WorkTimeTargetCheckResult {
  const { dayOfWeek, slotIndex } = target

  // 1. Day check
  if (!workTime.weekdayValues.includes(dayOfWeek)) {
    if (workTime.weekendDayValues.includes(dayOfWeek)) {
      if (!workTime.allowWeekend) {
        return {
          ok: false,
          code: 'WORKTIME_WEEKEND_DISABLED',
          message: '当前作息配置不允许调课到周末。',
          details: { dayOfWeek, allowWeekend: workTime.allowWeekend, source: workTime.source },
        }
      }
      // allowWeekend=true → weekend day is allowed, fall through to slot check
    } else {
      return {
        ok: false,
        code: 'WORKTIME_DAY_DISABLED',
        message: '当前作息配置不允许调课到该日期。',
        details: { dayOfWeek, source: workTime.source },
      }
    }
  }

  // 2. Slot: legacy display (6/7) — catch before DB lookup
  if (LEGACY_DISPLAY_SLOT_INDEXES.includes(slotIndex as 6 | 7)) {
    return {
      ok: false,
      code: 'WORKTIME_SLOT_LEGACY_ONLY',
      message: '该节次仅用于历史显示，不能作为新的调课目标。',
      details: { slotIndex, source: workTime.source },
    }
  }

  // 3. Slot: DB-level legacy display flag
  const slotDef = workTime.slotsByIndex[slotIndex]
  if (slotDef?.isLegacyDisplay) {
    return {
      ok: false,
      code: 'WORKTIME_SLOT_LEGACY_ONLY',
      message: '该节次仅用于历史显示，不能作为新的调课目标。',
      details: { slotIndex, source: workTime.source },
    }
  }

  // 4. Slot: not active teaching (inactive, non-teaching, or not in active list)
  if (
    !workTime.activeTeachingSlotIndexes.includes(slotIndex) ||
    slotDef === undefined ||
    !slotDef.isActive ||
    !slotDef.isTeachingSlot
  ) {
    return {
      ok: false,
      code: 'WORKTIME_SLOT_DISABLED',
      message: '当前作息配置不允许调课到该节次。',
      details: {
        slotIndex,
        allowedSlotIndexes: workTime.activeTeachingSlotIndexes,
        source: workTime.source,
      },
    }
  }

  return { ok: true }
}
