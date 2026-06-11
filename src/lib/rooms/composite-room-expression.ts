// src/lib/rooms/composite-room-expression.ts
// K34-A3: Parse composite room expressions like "11-322 或 10-104".
//
// The DOCX parser may extract room strings that contain the Chinese
// character "或" (meaning "or") connecting two room names. These are
// NOT new room names — they express that the same lesson is associated
// with two alternative / parallel rooms (typically a regular classroom
// + a lab / training room).
//
// This module provides `parseCompositeRoomExpression(raw)` which:
//   1. Detects the "或" delimiter.
//   2. Splits the raw string into component room names.
//   3. Returns `{ rooms, isComposite, delimiter }` so the importer
//      can create/match each component room separately.
//
// The returned component names are **raw strings** — the caller should
// apply `normalizeRoomNameForMatch` (from K34-A2) before matching
// against existing Room rows.
//
// IMPORTANT: "或" is only split when both sides match a plausible room
// name pattern (alphanumeric + hyphen + optional Chinese). This avoids
// false splits on other fields that may contain "或".

export interface CompositeRoomParseResult {
  /** The original raw input. */
  raw: string
  /** Component room names (trimmed). If not composite, contains just the raw input. */
  rooms: string[]
  /** True if the expression was split on "或". */
  isComposite: boolean
  /** The delimiter that was used to split, or null if not composite. */
  delimiter: string | null
}

/**
 * A room name is "plausible" if it contains at least one alphanumeric
 * or hyphen character. This is intentionally loose — the importer
 * applies `normalizeRoomNameForMatch` afterward, which is the
 * authoritative normalization step.
 *
 * Plausible: "11-322", "林校304", "实训楼A", "10-104"
 * Not plausible: empty string, "或", "  "
 */
function isPlausibleRoomName(s: string): boolean {
  if (!s || !s.trim()) return false
  // Must contain at least one digit OR one Chinese character OR one letter.
  return /[\d一-鿿A-Za-z]/.test(s)
}

/**
 * Parse a raw room expression, splitting on "或" / "或者" if both sides
 * are plausible room names. Returns the original string if the
 * expression is not composite.
 *
 * Handles:
 *   "11-322 或 10-104"           -> ["11-322", "10-104"]
 *   "11-322或10-104"             -> ["11-322", "10-104"]
 *   "11-322 或10-104"            -> ["11-322", "10-104"]
 *   "11-322或 10-104"            -> ["11-322", "10-104"]
 *   "11-322 或者 10-104"         -> ["11-322", "10-104"]
 *   "11-322 或 10-104 或 12-111" -> ["11-322", "10-104", "12-111"]
 *   "林校 304 或 10-104"         -> ["林校 304", "10-104"]
 *   "11-322"                     -> ["11-322"]  (not composite)
 *   ""                           -> []          (empty)
 *   null                         -> []          (null)
 */
export function parseCompositeRoomExpression(
  raw: string | null | undefined,
): CompositeRoomParseResult {
  if (raw == null) return { raw: '', rooms: [], isComposite: false, delimiter: null }
  const trimmed = raw.trim()
  if (!trimmed) return { raw, rooms: [], isComposite: false, delimiter: null }

  // Try splitting on "或者" first (longer match), then "或".
  // Split on all occurrences, not just the first.
  const patterns = ['或者', '或']

  for (const delim of patterns) {
    const parts = trimmed.split(delim)
    if (parts.length < 2) continue

    // Trim each part.
    const trimmedParts = parts.map((p) => p.trim())
    // ALL parts must be plausible room names.
    const allPlausible = trimmedParts.every(isPlausibleRoomName)
    if (!allPlausible) continue

    // At least one side must be non-empty and not just whitespace.
    const nonEmpty = trimmedParts.filter((p) => p.length > 0)
    if (nonEmpty.length < 2) continue

    return {
      raw,
      rooms: nonEmpty,
      isComposite: true,
      delimiter: delim,
    }
  }

  // Not composite — return the trimmed string as a single-element list.
  return {
    raw,
    rooms: [trimmed],
    isComposite: false,
    delimiter: null,
  }
}
