// src/lib/rooms/room-name-normalization.ts
// K34-A2: Room name normalization for matching purposes.
//
// Background:
//   The Python DOCX parser (`scripts/parse_schedule.py`) extracts room
//   names from cell text. When a cell contains a soft line break (e.g.
//   from a multi-line table cell), the resulting string contains an
//   embedded `\n`. The result is that the same physical room may be
//   represented as BOTH `"林校304"` AND `"林校\n304"` in the parsed
//   records. Worse, Excel/Word often inserts inconsistent whitespace
//   (ASCII space, full-width space, tab, non-breaking space) between
//   building and number — e.g. `"林校 304"`, `"林校　304"`,
//   `"11 - 301"`, `"11  -  301"`, `" 11-301 "`.
//
//   Without normalization, the importer's `prisma.room.findUnique({
//   where: { name } })` performs an exact match and creates a new Room
//   row for each variant — leading to 5+ duplicate Linxiao rooms
//   ("林校301" / "林校 301" / "林校\n301" etc.) and split ScheduleSlot
//   references across them.
//
//   This helper provides:
//     1. `normalizeRoomNameForMatch(raw)` — the canonical MATCHING KEY.
//        Used to look up and compare room names everywhere a match is
//        needed. It MUST be side-effect-free and never throw.
//     2. `isLikelyDuplicateRoomName(a, b)` — checks if two raw names
//        belong to the same canonical group.
//     3. `pickCanonicalRoom(candidates)` — chooses the best display
//        name from a set of variants. Convention: prefer the name
//        without internal whitespace (e.g. `"林校304"` over
//        `"林校\n304"`), break ties by refCount then id.
//
// IMPORTANT:
//   This helper MUST NOT change the stored display name. Existing
//   `Room.name` values stay byte-for-byte. Only the matching key (and
//   dedup / repair logic) consult the normalized form. A future
//   migration may add a unique index on the normalized form; that is
//   out of scope for K34-A2.

/**
 * Codepoints we treat as "whitespace" when computing the matching
 * key. Includes ASCII whitespace plus a wide range of Unicode
 * whitespace / format characters that DOCX/Excel/Word may insert.
 *
 *   \s          ASCII whitespace
 *        NBSP
 *        Ogham space mark
 *        en quad, em quad, etc. (U+2000..U+200A)
 *        line separator
 *        paragraph separator
 *        narrow no-break space
 *        medium mathematical space
 *   　    ideographic space
 *   ​    zero-width space
 *   ‌    zero-width non-joiner
 *   ‍    zero-width joiner
 *   ⁠    word joiner
 *   ﻿    byte order mark
 *
 * Built as a `Set<number>` and applied as a per-codepoint check, which
 * sidesteps the parser-portability issues of an explicit regex
 * character class. Slightly slower than a compiled regex for very long
 * strings but perfectly fine for room-name-sized inputs (≤ ~50 chars).
 */
const WHITESPACE_CODEPOINTS: ReadonlySet<number> = new Set<number>([
  // ASCII whitespace (already covered by \s below, but list
  // explicitly so the set is self-documenting).
  // 0x09 tab, 0x0A lf, 0x0B vt, 0x0C ff, 0x0D cr, 0x20 space.
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20,
  0xa0,    // NBSP
  0x1680,  // Ogham space mark
  // En quad..hair space (U+2000..U+200A)
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028,  // line separator
  0x2029,  // paragraph separator
  0x202f,  // narrow no-break space
  0x205f,  // medium mathematical space
  0x3000,  // ideographic space
  0x200b,  // zero-width space
  0x200c,  // zero-width non-joiner
  0x200d,  // zero-width joiner
  0x2060,  // word joiner
  0xfeff,  // byte order mark
])

/**
 * Compute a canonical matching key for a room name. Two rooms whose
 * names normalize to the same key are considered the same physical
 * room for matching purposes.
 *
 * Steps:
 *   1. Coerce null / undefined / non-string to empty string.
 *   2. NFKC normalize (handles fullwidth digits, halfwidth kana, etc.).
 *   3. Strip every codepoint in `WHITESPACE_CODEPOINTS`.
 *
 * Examples:
 *   normalizeRoomNameForMatch('林校304')      === '林校304'
 *   normalizeRoomNameForMatch('林校 304')     === '林校304'
 *   normalizeRoomNameForMatch(' 林校　304 ')  === '林校304'
 *   normalizeRoomNameForMatch('林 校 304')    === '林校304'
 *   normalizeRoomNameForMatch('11 - 301')     === '11-301'
 *   normalizeRoomNameForMatch('林校\n304')    === '林校304'
 *   normalizeRoomNameForMatch('')             === ''
 *   normalizeRoomNameForMatch(null)           === ''
 */
export function normalizeRoomNameForMatch(raw: string | null | undefined): string {
  if (raw == null) return ''
  let s: string
  if (typeof raw !== 'string') {
    try {
      s = String(raw)
    } catch {
      return ''
    }
  } else {
    s = raw
  }
  // NFKC normalizes fullwidth/halfwidth and other compatibility forms.
  const nfkc = s.normalize('NFKC')
  // Per-codepoint whitespace strip. Also normalizes non-NFKC
  // whitespace (e.g. tab → ASCII space, but tab is in the set, so
  // it is removed directly).
  let out = ''
  for (const ch of nfkc) {
    const cp = ch.codePointAt(0)!
    if (!WHITESPACE_CODEPOINTS.has(cp)) out += ch
  }
  return out
}

/**
 * Return true if the two room names should be considered the same
 * physical room for matching purposes. Both null / undefined / empty
 * inputs are treated as "no match possible" and return false.
 */
export function isLikelyDuplicateRoomName(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeRoomNameForMatch(a)
  const nb = normalizeRoomNameForMatch(b)
  if (!na || !nb) return false
  return na === nb
}

export interface CanonicalRoomCandidate {
  id: number
  name: string
  /** Reference count — number of foreign-key rows pointing at this room. */
  refCount: number
}

/**
 * Choose the canonical room from a set of duplicate candidates.
 * Strategy:
 *   1. Prefer the name whose normalized form is itself (i.e. no
 *      internal whitespace was stripped). This favours `"林校304"` over
 *      `"林校\n304"`.
 *   2. Among the remaining, prefer the one with the most references.
 *   3. Break further ties by smallest id.
 *
 * Returns the chosen candidate, or null if `candidates` is empty.
 */
export function pickCanonicalRoom<T extends CanonicalRoomCandidate>(
  candidates: ReadonlyArray<T>,
): T | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  const scored = candidates.map((c) => ({
    c,
    notNormalizedPenalty: c.name === normalizeRoomNameForMatch(c.name) ? 0 : 1,
  }))
  scored.sort((a, b) => {
    if (a.notNormalizedPenalty !== b.notNormalizedPenalty) {
      return a.notNormalizedPenalty - b.notNormalizedPenalty
    }
    if (a.c.refCount !== b.c.refCount) {
      // Higher refCount first
      return b.c.refCount - a.c.refCount
    }
    // Tiebreak: smallest id first (deterministic)
    return a.c.id - b.c.id
  })
  return scored[0].c
}

/**
 * Group an array of room records by their normalized matching key.
 * Only groups with more than one member are returned. Used by the
 * duplicate-repair script.
 */
export function groupDuplicatesByNormalizedName<T extends { id: number; name: string }>(
  rooms: ReadonlyArray<T>,
): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const r of rooms) {
    const k = normalizeRoomNameForMatch(r.name)
    if (!k) continue
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }
  const dupOnly = new Map<string, T[]>()
  for (const [k, list] of groups) {
    if (list.length > 1) dupOnly.set(k, list)
  }
  return dupOnly
}
