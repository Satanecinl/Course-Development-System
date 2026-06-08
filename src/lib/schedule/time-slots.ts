/**
 * src/lib/schedule/time-slots.ts
 *
 * K24-A4: Shared valid teaching time-slot constants.
 * K26-D:   Static time-slot extraction. Unified source of truth for
 *          active teaching slots, legacy display slots, and day rules.
 *
 * Business rule (effective since the academic schedule only goes up
 * to 9-10节):
 *   - 1 → 1-2节
 *   - 2 → 3-4节
 *   - 3 → 5-6节
 *   - 4 → 7-8节
 *   - 5 → 9-10节
 *
 * slotIndex=6 (11-12节) and slotIndex=7 ("中午" lunch break) are NOT
 * valid teaching slots for new recommendations / new selections.
 *
 * Historical ScheduleSlot rows with slotIndex=6/7 are NOT modified —
 * only new recommendation and UI entry points are constrained.
 *
 * NOTE: types/schedule.ts SLOTS_INDEX_MAP / TIME_SLOTS still expose
 * entries 1..7 for display purposes (legacy / historical rendering
 * compatibility). The K26-D unified helper below is the source of truth
 * for both new operations (active-only) AND display labels (full range
 * including legacy 6/7).
 */

export const VALID_TEACHING_SLOT_INDEXES = [1, 2, 3, 4, 5] as const

export type ValidTeachingSlotIndex =
  (typeof VALID_TEACHING_SLOT_INDEXES)[number]

/**
 * Legacy display-only slot indexes (slotIndex=6 = 11-12节, slotIndex=7 = 中午).
 * These are NOT valid for new recommendations or new selections, but
 * historical ScheduleSlot rows may still reference them and must remain
 * displayable.
 */
export const LEGACY_DISPLAY_SLOT_INDEXES = [6, 7] as const

export type LegacyDisplaySlotIndex =
  (typeof LEGACY_DISPLAY_SLOT_INDEXES)[number]

/**
 * All slot indexes that must have a display label (active + legacy).
 * Used to drive display maps, conflict messages, and grid rendering.
 */
export const ALL_DISPLAY_SLOT_INDEXES = [
  ...VALID_TEACHING_SLOT_INDEXES,
  ...LEGACY_DISPLAY_SLOT_INDEXES,
] as const

export type DisplaySlotIndex = (typeof ALL_DISPLAY_SLOT_INDEXES)[number]

/**
 * Preferred day values for plan recommendation / API validation.
 * Weekends (6, 7) are explicitly excluded from preferred days.
 */
export const VALID_PREFERRED_DAY_VALUES = [1, 2, 3, 4, 5] as const

export type ValidPreferredDayValue =
  (typeof VALID_PREFERRED_DAY_VALUES)[number]

/**
 * Weekend day values (dayOfWeek=6 = 周六, dayOfWeek=7 = 周日).
 */
export const WEEKEND_DAY_VALUES = [6, 7] as const

export type WeekendDayValue = (typeof WEEKEND_DAY_VALUES)[number]

export function getValidTeachingSlotIndexes(): number[] {
  return [...VALID_TEACHING_SLOT_INDEXES]
}

export function getLegacyDisplaySlotIndexes(): number[] {
  return [...LEGACY_DISPLAY_SLOT_INDEXES]
}

export function getAllDisplaySlotIndexes(): number[] {
  return [...ALL_DISPLAY_SLOT_INDEXES]
}

export function isValidTeachingSlotIndex(
  slotIndex: number,
): slotIndex is ValidTeachingSlotIndex {
  return (VALID_TEACHING_SLOT_INDEXES as readonly number[]).includes(slotIndex)
}

export function isLegacyDisplaySlotIndex(
  slotIndex: number,
): slotIndex is LegacyDisplaySlotIndex {
  return (LEGACY_DISPLAY_SLOT_INDEXES as readonly number[]).includes(slotIndex)
}

export function isActiveTeachingSlot(slotIndex: number): boolean {
  return isValidTeachingSlotIndex(slotIndex)
}

/** Alias retained for clarity at call sites that distinguish active vs. legacy. */
export function isRecommendationSlot(slotIndex: number): boolean {
  return isValidTeachingSlotIndex(slotIndex)
}

export function isLegacyDisplaySlot(slotIndex: number): boolean {
  return isLegacyDisplaySlotIndex(slotIndex)
}

export function getMaxValidTeachingSlotIndex(): number {
  return VALID_TEACHING_SLOT_INDEXES[VALID_TEACHING_SLOT_INDEXES.length - 1]
}

/**
 * Alias for the slot indexes that may be selected as a *new* recommendation
 * or new target. Always equal to active teaching slots (1-5); legacy
 * display slots (6, 7) are NEVER returned.
 */
export function getRecommendationSlotIndexes(): number[] {
  return [...VALID_TEACHING_SLOT_INDEXES]
}

// Exported for K26-D verify script. Not part of the public contract.
export const ACTIVE_SLOT_LABELS_INTERNAL: Record<ValidTeachingSlotIndex, string> = {
  1: '1-2节',
  2: '3-4节',
  3: '5-6节',
  4: '7-8节',
  5: '9-10节',
}

const ACTIVE_SLOT_LABELS = ACTIVE_SLOT_LABELS_INTERNAL

const LEGACY_SLOT_LABELS: Record<LegacyDisplaySlotIndex, string> = {
  6: '11-12节',
  7: '中午',
}

/**
 * Unified slot display label formatter. Returns a human-readable label
 * for:
 *   - active teaching slots (1-5)
 *   - legacy display slots (6 → 11-12节, 7 → 中午)
 *   - unknown values → safe fallback `第${n}节` (never throws)
 *
 * This is the single source of truth for display labels. UI components,
 * conflict messages, grid rendering, and Excel export should all route
 * through this function.
 */
export function formatTeachingSlotLabel(slotIndex: number): string {
  if (isValidTeachingSlotIndex(slotIndex)) {
    return ACTIVE_SLOT_LABELS[slotIndex]
  }
  if (isLegacyDisplaySlotIndex(slotIndex)) {
    return LEGACY_SLOT_LABELS[slotIndex]
  }
  return `第${slotIndex}节`
}

/**
 * Returns options for UI dropdowns / selects that drive new targets
 * (e.g. "调课" preferred slot, room recommendation, etc.). Only active
 * teaching slots (1-5) are exposed — never 6/7.
 */
export function getTeachingSlotOptions(): Array<{
  index: ValidTeachingSlotIndex
  label: string
}> {
  return VALID_TEACHING_SLOT_INDEXES.map((index) => ({
    index,
    label: ACTIVE_SLOT_LABELS[index],
  }))
}

/** Alias retained for clarity at call sites that distinguish selectable from display. */
export function getRecommendationSlotOptions(): Array<{
  index: ValidTeachingSlotIndex
  label: string
}> {
  return getTeachingSlotOptions()
}

/** Returns the human-readable label list for UI dropdowns / selects. */
export function getTeachingSlotLabelOptions(): Array<{
  index: ValidTeachingSlotIndex
  label: string
}> {
  return getTeachingSlotOptions()
}

// ---------------------------------------------------------------------------
// Day helpers
// ---------------------------------------------------------------------------

export function isValidPreferredDayValue(
  dayOfWeek: number,
): dayOfWeek is ValidPreferredDayValue {
  return (VALID_PREFERRED_DAY_VALUES as readonly number[]).includes(dayOfWeek)
}

export function isWeekendDayValue(
  dayOfWeek: number,
): dayOfWeek is WeekendDayValue {
  return (WEEKEND_DAY_VALUES as readonly number[]).includes(dayOfWeek)
}

export function isWeekday(dayOfWeek: number): boolean {
  return isValidPreferredDayValue(dayOfWeek)
}

export function isWeekend(dayOfWeek: number): boolean {
  return isWeekendDayValue(dayOfWeek)
}

export function getPreferredDayOptions(): Array<{
  value: ValidPreferredDayValue
  label: string
}> {
  const dayLabels: Record<ValidPreferredDayValue, string> = {
    1: '周一',
    2: '周二',
    3: '周三',
    4: '周四',
    5: '周五',
  }
  return VALID_PREFERRED_DAY_VALUES.map((value) => ({
    value,
    label: dayLabels[value],
  }))
}

export function getWeekendDayOptions(): Array<{
  value: WeekendDayValue
  label: string
}> {
  const dayLabels: Record<WeekendDayValue, string> = {
    6: '周六',
    7: '周日',
  }
  return WEEKEND_DAY_VALUES.map((value) => ({
    value,
    label: dayLabels[value],
  }))
}
