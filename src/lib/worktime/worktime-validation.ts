/**
 * src/lib/worktime/worktime-validation.ts
 *
 * K26-G: WorkTime API validation rules.
 */

import type {
  CreateWorkTimeConfigInput,
  TimeSlotDefinitionInput,
  UpdateWorkTimeConfigInput,
  WorkTimeErrorCode,
} from '@/types/worktime'

// ── Validation result ──

export interface ValidationResult {
  valid: boolean
  error?: WorkTimeErrorCode
  message?: string
}

function ok(): ValidationResult {
  return { valid: true }
}

function fail(error: WorkTimeErrorCode, message: string): ValidationResult {
  return { valid: false, error, message }
}

// ── Time format validation ──

const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

function isValidHHMM(value: string | null | undefined): boolean {
  if (value == null || value === '') return true
  return HH_MM_REGEX.test(value)
}

// ── Config validation ──

export function validateCreateWorkTimeConfig(
  input: Partial<CreateWorkTimeConfigInput>,
): ValidationResult {
  if (!input.semesterId || typeof input.semesterId !== 'number' || input.semesterId < 1) {
    return fail('INVALID_REQUEST', 'semesterId must be a positive integer')
  }

  if (!input.name || typeof input.name !== 'number' && typeof input.name !== 'string') {
    return fail('INVALID_REQUEST', 'name is required')
  }

  if (typeof input.name === 'string') {
    const trimmed = input.name.trim()
    if (trimmed.length === 0) {
      return fail('INVALID_REQUEST', 'name cannot be empty')
    }
    if (trimmed.length > 100) {
      return fail('INVALID_REQUEST', 'name cannot exceed 100 characters')
    }
  }

  if (!Array.isArray(input.slots) || input.slots.length === 0) {
    return fail('INVALID_REQUEST', 'slots array is required and cannot be empty')
  }

  const slotValidation = validateSlotDefinitions(input.slots)
  if (!slotValidation.valid) return slotValidation

  if (input.lunchStart != null && !isValidHHMM(input.lunchStart)) {
    return fail('INVALID_TIME_FORMAT', 'lunchStart must be HH:mm format')
  }

  if (input.lunchEnd != null && !isValidHHMM(input.lunchEnd)) {
    return fail('INVALID_TIME_FORMAT', 'lunchEnd must be HH:mm format')
  }

  if (input.notes != null && typeof input.notes === 'string' && input.notes.length > 500) {
    return fail('INVALID_REQUEST', 'notes cannot exceed 500 characters')
  }

  return ok()
}

export function validateUpdateWorkTimeConfig(
  input: Partial<UpdateWorkTimeConfigInput>,
): ValidationResult {
  if (input.name !== undefined) {
    if (typeof input.name !== 'string') {
      return fail('INVALID_REQUEST', 'name must be a string')
    }
    const trimmed = input.name.trim()
    if (trimmed.length === 0) {
      return fail('INVALID_REQUEST', 'name cannot be empty')
    }
    if (trimmed.length > 100) {
      return fail('INVALID_REQUEST', 'name cannot exceed 100 characters')
    }
  }

  if (input.slots !== undefined) {
    if (!Array.isArray(input.slots) || input.slots.length === 0) {
      return fail('INVALID_REQUEST', 'slots array cannot be empty')
    }
    const slotValidation = validateSlotDefinitions(input.slots)
    if (!slotValidation.valid) return slotValidation
  }

  if (input.lunchStart != null && !isValidHHMM(input.lunchStart)) {
    return fail('INVALID_TIME_FORMAT', 'lunchStart must be HH:mm format')
  }

  if (input.lunchEnd != null && !isValidHHMM(input.lunchEnd)) {
    return fail('INVALID_TIME_FORMAT', 'lunchEnd must be HH:mm format')
  }

  if (input.notes != null && typeof input.notes === 'string' && input.notes.length > 500) {
    return fail('INVALID_REQUEST', 'notes cannot exceed 500 characters')
  }

  return ok()
}

// ── Slot validation ──

function validateSlotDefinitions(
  slots: TimeSlotDefinitionInput[],
): ValidationResult {
  const slotIndexes = new Set<number>()

  for (const slot of slots) {
    if (!slot.slotIndex || typeof slot.slotIndex !== 'number' || slot.slotIndex < 1) {
      return fail('INVALID_SLOT_DEFINITION', 'slotIndex must be a positive integer')
    }

    if (!slot.label || typeof slot.label !== 'string' || slot.label.trim().length === 0) {
      return fail('INVALID_SLOT_DEFINITION', 'label is required and cannot be empty')
    }

    if (slot.label.length > 50) {
      return fail('INVALID_SLOT_DEFINITION', 'label cannot exceed 50 characters')
    }

    if (slot.startsAt != null && !isValidHHMM(slot.startsAt)) {
      return fail('INVALID_TIME_FORMAT', 'startsAt must be HH:mm format')
    }

    if (slot.endsAt != null && !isValidHHMM(slot.endsAt)) {
      return fail('INVALID_TIME_FORMAT', 'endsAt must be HH:mm format')
    }

    // Check uniqueness
    if (slotIndexes.has(slot.slotIndex)) {
      return fail('INVALID_SLOT_DEFINITION', `duplicate slotIndex: ${slot.slotIndex}`)
    }
    slotIndexes.add(slot.slotIndex)

    // K26-G strict rule: slotIndex 6 and 7 cannot be active teaching slots
    if ((slot.slotIndex === 6 || slot.slotIndex === 7) && slot.isTeachingSlot === true) {
      return fail('INVALID_SLOT_DEFINITION', `slotIndex ${slot.slotIndex} cannot be an active teaching slot (legacy display only)`)
    }

    // Legacy display slot should not be active teaching
    if (slot.isLegacyDisplay === true && slot.isTeachingSlot === true) {
      return fail('INVALID_SLOT_DEFINITION', 'legacy display slot cannot be an active teaching slot')
    }
  }

  // Must have at least one active teaching slot
  const hasActiveTeaching = slots.some((s) => s.isActive !== false && s.isTeachingSlot !== false)
  if (!hasActiveTeaching) {
    return fail('INVALID_SLOT_DEFINITION', 'at least one active teaching slot is required')
  }

  return ok()
}
