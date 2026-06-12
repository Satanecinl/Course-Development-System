/**
 * K36-A5D3A: Audit-report output anonymization helper.
 *
 * Purpose: when scripts/*.ts write audit/diagnostic JSON (and matching MD)
 * to docs/, replace real teacher / class / course / room names and any
 * free-text fields that may embed real names with stable pseudonyms.
 *
 * Strict rules (per K36-A5D3A spec):
 *  - No mapping file is ever written to disk.
 *  - No real value is ever logged.
 *  - Mapping is per-process; the same real value within a single report
 *    object always maps to the same pseudonym.
 *  - Pseudonyms use a `T0xx` / `CG0xx` / `Course0xx` / `Room0xx` /
 *    `<REDACTED_TEXT>` scheme. No plaintext hash (avoids dictionary
 *    reverse-lookup).
 *  - Helper never reads or writes the database.
 *
 * Allowed callers: read-only / diagnostic audit scripts that emit
 * docs/*.json. Not for runtime API responses.
 */

export type AnonymizedScalar = string | number | boolean | null

export interface AnonymizeOptions {
  /** Default true: redact free-text fields whose value embeds a known
   *  real name. Set false for fields you know are safe. */
  redactFreeText?: boolean
  /** When true, also walk into plain object values that are not in the
   *  default redact set (rarely needed). */
  deep?: boolean
}

interface MutableMaps {
  teacher: Map<string, string>
  classGroup: Map<string, string>
  course: Map<string, string>
  room: Map<string, string>
}

// Names of fields that hold a single real-name string. Walked by
// anonymizeScalarInPlace when deep=true.
const NAME_FIELDS = new Set([
  'teacherName',
  'teacher',
])

// Names of fields that hold an array of real-name strings.
const NAME_ARRAY_FIELDS = new Set([
  'teacherNames',
  'classGroupNames',
  'classGroupName',
  'courseNames',
  'courseName',
  'roomNames',
  'roomName',
])

// Free-text fields that should be wholesale redacted (replaced with
// <REDACTED_TEXT>) when redactFreeText is on. These are the fields
// where scripts historically embedded raw "class=… teacher=… remark=…"
// strings from imported source artifacts.
const FREE_TEXT_FIELDS = new Set([
  'evidence',
  'excerpt',
  'reason',
  'reasons',
  'recommendation',
  'summary',
  'description',
  'detail',
  'expectedDisplayAfterRepair',
  'expectedExportAfterRepair',
  'expectedSolverInputAfterRepair',
  'currentStatus',
  'risk',
])

function newMaps(): MutableMaps {
  return {
    teacher: new Map(),
    classGroup: new Map(),
    course: new Map(),
    room: new Map(),
  }
}

function nextToken(map: Map<string, string>, prefix: string): string {
  const n = map.size + 1
  // Pad to 3 digits; supports up to 999 unique values per kind.
  return `${prefix}${String(n).padStart(3, '0')}`
}

function lookupOrAssign(
  map: Map<string, string>,
  real: string,
  prefix: string,
): string {
  if (!real) return real
  const existing = map.get(real)
  if (existing) return existing
  const token = nextToken(map, prefix)
  map.set(real, token)
  return token
}

function isLikelyRealName(value: string): boolean {
  if (!value) return false
  if (value.length > 30) return false
  // Heuristic: Chinese characters, common for real names. Pure ASCII
  // short tokens are usually IDs or codes — pass through.
  return /[一-鿿]/.test(value)
}

/**
 * Anonymize a report-like object in place.
 *
 * Walks the object graph and replaces real values per the rules
 * described at the top of this file. Returns the same object for
 * convenience.
 */
export function anonymizeReport<T>(input: T, options: AnonymizeOptions = {}): T {
  const redactFreeText = options.redactFreeText !== false
  const maps = newMaps()
  walk(input, maps, redactFreeText, '')
  return input
}

function walk(
  value: unknown,
  maps: MutableMaps,
  redactFreeText: boolean,
  parentKey: string,
): void {
  if (value === null || value === undefined) return
  if (Array.isArray(value)) {
    // If parent is a known name-array field, treat each element as a
    // real name. Otherwise recurse.
    if (NAME_ARRAY_FIELDS.has(parentKey)) {
      for (let i = 0; i < value.length; i++) {
        const v = value[i]
        if (typeof v === 'string' && isLikelyRealName(v)) {
          ;(value as unknown[])[i] = pickToken(v, parentKey, maps)
        }
      }
      return
    }
    for (const item of value) walk(item, maps, redactFreeText, '')
    return
  }
  if (typeof value !== 'object') return

  const obj = value as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    const v = obj[key]
    if (v === null || v === undefined) continue

    if (typeof v === 'string') {
      if (NAME_FIELDS.has(key) && isLikelyRealName(v)) {
        obj[key] = pickToken(v, key, maps)
        continue
      }
      if (NAME_ARRAY_FIELDS.has(key) && isLikelyRealName(v)) {
        obj[key] = pickToken(v, key, maps)
        continue
      }
      if (FREE_TEXT_FIELDS.has(key) && redactFreeText) {
        // Replace any embedded real name with the matching token; if
        // anything remains that looks like Chinese prose (i.e. we
        // could not strip it), keep it as-is — but the only safe
        // option for a free-text field is to redact entirely. We
        // redact only when the string is non-empty; we DO NOT
        // attempt substring substitution (too easy to leak partial
        // matches). Instead we mask only if the field value contains
        // Chinese characters; otherwise we leave it (e.g. SQL preview
        // strings that contain no names).
        if (/[一-鿿]/.test(v) && v.length <= 200) {
          // Short Chinese free-text → fully redact. This matches the
          // historical pattern where these fields embedded "class=…,
          // teacher=…, remark=…".
          obj[key] = '<REDACTED_TEXT>'
        } else if (/[一-鿿]/.test(v)) {
          // Long Chinese free-text → fully redact as well, since we
          // cannot reliably strip every real name from arbitrary
          // prose without risking partial leaks.
          obj[key] = '<REDACTED_TEXT>'
        }
        continue
      }
      // Numeric or ID-like strings pass through.
      continue
    }

    if (Array.isArray(v)) {
      if (NAME_ARRAY_FIELDS.has(key)) {
        for (let i = 0; i < v.length; i++) {
          const item = v[i]
          if (typeof item === 'string' && isLikelyRealName(item)) {
            ;(v as unknown[])[i] = pickToken(item, key, maps)
          }
        }
        continue
      }
      walk(v, maps, redactFreeText, key)
      continue
    }

    if (typeof v === 'object') {
      walk(v, maps, redactFreeText, key)
      continue
    }
  }
}

function pickToken(
  real: string,
  fieldHint: string,
  maps: MutableMaps,
): string {
  // Choose which map to use based on the field name. Falls back to
  // classGroup (most common free-text field) for unknown hints.
  if (fieldHint === 'teacherName' || fieldHint === 'teacher' || fieldHint === 'teacherNames') {
    return lookupOrAssign(maps.teacher, real, 'T')
  }
  if (fieldHint === 'classGroupName' || fieldHint === 'classGroupNames') {
    return lookupOrAssign(maps.classGroup, real, 'CG')
  }
  if (fieldHint === 'courseName' || fieldHint === 'courseNames') {
    return lookupOrAssign(maps.course, real, 'Course')
  }
  if (fieldHint === 'roomName' || fieldHint === 'roomNames') {
    return lookupOrAssign(maps.room, real, 'Room')
  }
  // For free-text sub-fields, default to teacher (most likely entity
  // in old evidence strings). Conservative fallback: do not invent
  // a token for a hint we don't recognize — return the original.
  return real
}

/**
 * Convenience for scripts that have free-text reason/evidence/etc.
 * already built up as strings: a best-effort replacement. This does
 * NOT try to be exhaustive; callers that need provable redaction
 * must construct the report via anonymizeReport before stringifying.
 */
export function maskFreeText(value: string): string {
  if (!value) return value
  if (/[一-鿿]/.test(value)) return '<REDACTED_TEXT>'
  return value
}
