// src/app/admin/import/import-display-utils.ts
// K34-A1: Defensive display helpers for the import management page.
//
// Background:
//   `ImportBatch.warningsJson` is stored in TWO different shapes by the
//   existing import pipeline:
//     1. POST /api/admin/import/parse writes
//          warningsJson = JSON.stringify(quality.warnings)
//        where `quality.warnings: ImportParseWarning[]` is an array of
//        objects like {type, message, recordIndex, className?, courseName?,
//        teacher?, room?, rawText?}. This is the "pending" batch shape.
//     2. POST /api/admin/import/confirm writes
//          warningsJson = JSON.stringify({version, generatedAt, warnings,
//            crossCohortApprovals})
//        where `warnings` is a string[] of human-readable strings. This is
//        the "confirmed" batch shape.
//
//   The detail route runs `safeJsonParse(batch.warningsJson, [])` and
//   returns whatever JSON.parse yields, so the client-side
//   `batch.warnings` field can be EITHER `string[]` (confirmed) OR
//   `ImportParseWarning[]` (pending) OR an object wrapper. The page must
//   never assume a single shape, and must never render a raw object as a
//   React child (which would throw "Objects are not valid as a React
//   child").
//
// All formatters below are pure, side-effect free, and handle every
// possible input gracefully (string, number, boolean, null, undefined,
// array, plain object, nested object, JSON-string, non-JSON string).

/**
 * Format any value as a human-readable string suitable for direct
 * rendering inside JSX text nodes. Never throws and never returns an
 * object.
 */
export function formatImportDisplayValue(value: unknown): string {
  if (value == null) return '-'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return value.map((v) => formatImportDisplayValue(v)).join('; ')
  }
  if (typeof value === 'object') {
    // Object — try to extract a sensible readable summary.
    const obj = value as Record<string, unknown>
    if (typeof obj.message === 'string' && obj.message.length > 0) {
      // warningsJson / parse warnings shape
      const type = typeof obj.type === 'string' ? obj.type : ''
      const rec = typeof obj.recordIndex === 'number' ? ` #${obj.recordIndex}` : ''
      return type ? `[${type}]${rec} ${obj.message}` : obj.message
    }
    // Fallback — JSON.stringify with try/catch in case of circular refs.
    try {
      return JSON.stringify(value)
    } catch {
      return '[unserializable object]'
    }
  }
  return String(value)
}

/**
 * Format a single import warning (string or ImportParseWarning-shaped
 * object) into a multi-line readable string. The output never contains
 * `undefined` substrings — missing fields collapse to empty.
 *
 * Example output for `{type: 'DUPLICATE_CANDIDATE', message: '...',
 * recordIndex: 5, className: '森防1班', courseName: '防火', room: 'A101'}`:
 *
 *   [DUPLICATE_CANDIDATE] 第 5 条：...
 *   班级：森防1班
 *   课程：防火
 *   教室：A101
 */
export function formatImportWarning(warning: unknown): string {
  if (warning == null) return '-'
  if (typeof warning === 'string') return warning
  if (typeof warning !== 'object') return String(warning)

  const w = warning as Record<string, unknown>
  const lines: string[] = []

  const type = typeof w.type === 'string' && w.type.length > 0 ? w.type : null
  const message = typeof w.message === 'string' && w.message.length > 0 ? w.message : null
  const recordIndex = typeof w.recordIndex === 'number' ? w.recordIndex : null

  if (type && message) {
    const rec = recordIndex !== null ? `第 ${recordIndex} 条` : ''
    lines.push(`[${type}]${rec ? ` ${rec}：` : '：'}${message}`)
  } else if (message) {
    lines.push(message)
  } else if (type) {
    lines.push(`[${type}]`)
  } else {
    // No structured fields — fall back to JSON.
    try {
      lines.push(JSON.stringify(warning))
    } catch {
      lines.push('[unserializable warning]')
    }
  }

  // Append context lines for known fields, skipping missing ones.
  const contextPairs: Array<[string, unknown]> = [
    ['班级', w.className],
    ['课程', w.courseName],
    ['教师', w.teacher],
    ['教室', w.room],
  ]
  for (const [label, val] of contextPairs) {
    if (typeof val === 'string' && val.length > 0) {
      lines.push(`${label}：${val}`)
    } else if (typeof val === 'number') {
      lines.push(`${label}：${val}`)
    }
  }

  return lines.join('\n')
}

/**
 * Normalize an unknown `batch.warnings` value (string[], object[],
 * payload-wrapper object, JSON string, or null) into a `string[]` of
 * human-readable warnings. Safe to call with any input — never throws.
 */
export function normalizeImportWarnings(value: unknown): string[] {
  if (value == null) return []
  if (typeof value === 'string') {
    // Try to parse as JSON; if that fails, return as a single string.
    try {
      const parsed = JSON.parse(value)
      return normalizeImportWarnings(parsed)
    } catch {
      return [value]
    }
  }
  if (Array.isArray(value)) {
    return value.map((v) => formatImportWarning(v))
  }
  if (typeof value === 'object') {
    // Payload-wrapper shape: {version, generatedAt, warnings: [...],
    // crossCohortApprovals: [...]}
    const obj = value as Record<string, unknown>
    if (Array.isArray(obj.warnings)) {
      return normalizeImportWarnings(obj.warnings)
    }
    // Single warning object (e.g. from a partial write).
    if (typeof obj.type === 'string' || typeof obj.message === 'string') {
      return [formatImportWarning(obj)]
    }
    // Unknown object shape — best-effort JSON.
    try {
      return [JSON.stringify(obj)]
    } catch {
      return ['[unserializable warnings payload]']
    }
  }
  return [String(value)]
}
