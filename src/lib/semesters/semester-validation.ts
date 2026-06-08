/**
 * K25-H: Semester input validation.
 *
 * Pure validation functions — no DB access, no side effects.
 */

export interface SemesterCreateInput {
  name: string
  code: string
  academicYear?: string | null
  term?: string | null
  startsAt?: string | null
  endsAt?: string | null
  isActive?: boolean
}

export interface SemesterUpdateInput {
  name?: string
  code?: string
  academicYear?: string | null
  term?: string | null
  startsAt?: string | null
  endsAt?: string | null
  isActive?: boolean
}

export interface ValidationError {
  code: string
  message: string
}

/**
 * Parse a semester id from a string or number.
 * Returns the integer id or a validation error.
 */
export function parseSemesterId(value: unknown): number | ValidationError {
  if (value == null) {
    return { code: 'INVALID_SEMESTER_ID', message: '学期 ID 不能为空' }
  }
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(num) || num <= 0) {
    return { code: 'INVALID_SEMESTER_ID', message: `学期 ID 无效: ${String(value)}` }
  }
  return num
}

/**
 * Parse an ISO date string or null.
 * Returns a Date object, null, or a validation error.
 */
export function parseDateOrNull(value: unknown): Date | null | ValidationError {
  if (value == null || value === '') return null
  if (typeof value !== 'string') {
    return { code: 'INVALID_DATE', message: '日期格式无效' }
  }
  const date = new Date(value)
  if (isNaN(date.getTime())) {
    return { code: 'INVALID_DATE', message: `日期格式无效: ${value}` }
  }
  return date
}

/**
 * Validate semester create input.
 * Returns an array of errors (empty if valid).
 */
export function validateSemesterCreate(input: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = []

  // name required
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) {
    errors.push({ code: 'VALIDATION_ERROR', message: '学期名称不能为空' })
  }

  // code required
  const code = typeof input.code === 'string' ? input.code.trim() : ''
  if (!code) {
    errors.push({ code: 'VALIDATION_ERROR', message: '学期代码不能为空' })
  }

  // date range
  if (input.startsAt != null && input.startsAt !== '' &&
      input.endsAt != null && input.endsAt !== '') {
    const start = new Date(String(input.startsAt))
    const end = new Date(String(input.endsAt))
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start >= end) {
      errors.push({ code: 'INVALID_DATE_RANGE', message: '开始日期必须早于结束日期' })
    }
  }

  return errors
}

/**
 * Validate semester update input.
 * Returns an array of errors (empty if valid).
 */
export function validateSemesterUpdate(
  input: Record<string, unknown>,
  existing: { startsAt: Date | null; endsAt: Date | null },
): ValidationError[] {
  const errors: ValidationError[] = []

  // name if provided
  if (input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) {
      errors.push({ code: 'VALIDATION_ERROR', message: '学期名称不能为空' })
    }
  }

  // code if provided
  if (input.code !== undefined) {
    const code = typeof input.code === 'string' ? input.code.trim() : ''
    if (!code) {
      errors.push({ code: 'VALIDATION_ERROR', message: '学期代码不能为空' })
    }
  }

  // date range — merge with existing
  const effectiveStart = input.startsAt !== undefined
    ? (input.startsAt == null || input.startsAt === '' ? null : new Date(String(input.startsAt)))
    : existing.startsAt
  const effectiveEnd = input.endsAt !== undefined
    ? (input.endsAt == null || input.endsAt === '' ? null : new Date(String(input.endsAt)))
    : existing.endsAt

  if (effectiveStart && effectiveEnd && !isNaN(effectiveStart.getTime()) && !isNaN(effectiveEnd.getTime())) {
    if (effectiveStart >= effectiveEnd) {
      errors.push({ code: 'INVALID_DATE_RANGE', message: '开始日期必须早于结束日期' })
    }
  }

  return errors
}
