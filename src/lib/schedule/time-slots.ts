/**
 * src/lib/schedule/time-slots.ts
 *
 * K24-A4: Shared valid teaching time-slot constants.
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
 * compatibility). The K24-A4 valid range is the source of truth for
 * new operations: prefer this helper over the display-only types.
 */

export const VALID_TEACHING_SLOT_INDEXES = [1, 2, 3, 4, 5] as const

export type ValidTeachingSlotIndex =
  (typeof VALID_TEACHING_SLOT_INDEXES)[number]

export function getValidTeachingSlotIndexes(): number[] {
  return [...VALID_TEACHING_SLOT_INDEXES]
}

export function isValidTeachingSlotIndex(
  slotIndex: number,
): slotIndex is ValidTeachingSlotIndex {
  return (VALID_TEACHING_SLOT_INDEXES as readonly number[]).includes(slotIndex)
}

export function getMaxValidTeachingSlotIndex(): number {
  return VALID_TEACHING_SLOT_INDEXES[VALID_TEACHING_SLOT_INDEXES.length - 1]
}

const TEACHING_SLOT_LABELS: Record<ValidTeachingSlotIndex, string> = {
  1: '1-2节',
  2: '3-4节',
  3: '5-6节',
  4: '7-8节',
  5: '9-10节',
}

export function formatTeachingSlotLabel(slotIndex: number): string {
  if (isValidTeachingSlotIndex(slotIndex)) {
    return TEACHING_SLOT_LABELS[slotIndex]
  }
  return `第${slotIndex}节`
}

/** Returns the human-readable label list for UI dropdowns / selects. */
export function getTeachingSlotLabelOptions(): Array<{
  index: ValidTeachingSlotIndex
  label: string
}> {
  return VALID_TEACHING_SLOT_INDEXES.map((index) => ({
    index,
    label: TEACHING_SLOT_LABELS[index],
  }))
}
