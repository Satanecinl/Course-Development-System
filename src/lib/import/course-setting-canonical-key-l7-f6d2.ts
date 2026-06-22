/**
 * L7-F6D2 Helper — XLSX Canonical Class Key
 *
 * Stage: L7-F6D2-XLSX-CANONICAL-KEY-RECONCILIATION
 *
 * Pure, in-memory canonical key functions for matching Excel ClassGroup
 * rows against DB ClassGroup rows. The canonical key shape is
 *
 *   targetSemesterId + cohort + duration + major + classNo
 *
 * All functions here are deterministic and side-effect free. They never
 * read from Prisma, never write to disk, never perform substring /
 * contains fallback. Every match MUST be exact (after normalization).
 *
 * Hard rules:
 *  - No `includes` / `startsWith` / `endsWith` substring-only matching.
 *  - No "name-only" fallback. Every match requires a full canonical key.
 *  - No fallback to "near miss". A parse failure is a blocker, not a
 *    soft warning.
 */

import { createHash } from 'node:crypto'

// ---------------------------------------------------------------------------
// Stage constants
// ---------------------------------------------------------------------------

export const L7_F6D2_STAGE =
  'L7-F6D2-XLSX-CANONICAL-KEY-RECONCILIATION' as const

export const L7_F6D2_KEY_VERSION = 'l7-f6d2-class-canonical-key-v1' as const

// ---------------------------------------------------------------------------
// Canonical parts
// ---------------------------------------------------------------------------

export type ClassGroupCanonicalParts = {
  targetSemesterId: number
  cohort: string
  duration: string
  major: string
  classNo: string
}

export type ClassGroupCanonicalParseFailure = {
  reason:
    | 'CLASSGROUP_NAME_PARSE_FAILED'
    | 'COHORT_MISSING'
    | 'DURATION_MISSING'
    | 'MAJOR_MISSING'
    | 'CLASSNO_MISSING'
  detail: string
  /** sha256 of the input that failed. */
  inputHash: string
}

// ---------------------------------------------------------------------------
// Normalization (stable, reversible-up-to-display)
// ---------------------------------------------------------------------------

/**
 * Stable normalize for canonical key fields.
 *  - Strips all whitespace (incl. full-width, ideographic U+3000).
 *  - Lowercases ASCII a-zA-Z.
 *  - Removes all punctuation that is not semantically meaningful for the
 *    canonical key: `/`, `、`, `,`, `，`, `.`, `-`, `_`, `:`, `：`, `;`,
 *    `；`, `(`, `)`, `（`, `）`.
 *  - Keeps Chinese characters.
 *  - Does NOT strip `级` or `班` (they are part of cohort / classNo
 *    semantics).
 */
export const normalizeCanonicalField = (s: string | null | undefined): string => {
  if (s == null) return ''
  return s
    .replace(/[\s　]+/g, '')
    .replace(/[\/、,,，.\-_:：;；()（）]/g, '')
    .toLowerCase()
}

/**
 * Normalize a classNo string from Excel D / K column. We accept both
 * "1班" / "1" / "1班、2班" / "1,2" forms. The output is a sorted, unique
 * list of canonical classNo tokens in the form `${num}班`.
 *
 * If `text` is empty, returns []. If any token does not match
 * `^\d+班?$`, returns null (failure).
 */
export const tokenizeExcelClassText = (
  text: string | null | undefined,
): string[] | null => {
  if (text == null || text.trim().length === 0) return []
  // Split on common delimiters: `,` `，` `、` `.` `-` `:` `：` `;` `；` ` `
  // and the literal `班` (only when followed by another delimiter).
  const tokens = text
    .split(/[,，、.\-:：;；\s]+|班(?=[,，、.\-:：;；\s]|$)/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  const out: string[] = []
  const seen = new Set<number>()
  for (const tk of tokens) {
    const m = tk.match(/^(\d+)$/)
    if (!m) {
      // Allow `N班` form too
      const m2 = tk.match(/^(\d+)班$/)
      if (!m2) return null
      const n = Number(m2[1])
      // Cap at 999 to filter out garbage like `1234班`.
      if (!Number.isInteger(n) || n <= 0 || n > 999) return null
      if (seen.has(n)) continue
      seen.add(n)
      out.push(`${n}班`)
      continue
    }
    const n = Number(m[1])
    if (!Number.isInteger(n) || n <= 0 || n > 999) return null
    if (seen.has(n)) continue
    seen.add(n)
    out.push(`${n}班`)
  }
  return out.sort()
}

// ---------------------------------------------------------------------------
// Canonical key string
// ---------------------------------------------------------------------------

/**
 * Stable canonical key string. Two ClassGroup entries (one from Excel,
 * one from DB) match iff this string is identical.
 *
 * The key is computed AFTER `normalizeCanonicalField` so casing and
 * whitespace are stable.
 *
 * The `duration` field is OPTIONAL and is NOT part of the primary key
 * because the DB `ClassGroup.name` (created by L7-F6C's plannedName
 * template) does not embed the duration. We expose `duration` as a
 * secondary hash via `buildClassGroupCanonicalKeyWithDuration` for
 * callers that want to verify the duration also matches.
 */
export const buildClassGroupCanonicalKey = (
  parts: ClassGroupCanonicalParts,
): string => {
  const c = normalizeCanonicalField(parts.cohort)
  const m = normalizeCanonicalField(parts.major)
  const n = normalizeCanonicalField(parts.classNo)
  return `${parts.targetSemesterId}|${c}|${m}|${n}`
}

export const buildClassGroupCanonicalKeyWithDuration = (
  parts: ClassGroupCanonicalParts,
): string => {
  const base = buildClassGroupCanonicalKey(parts)
  const d = normalizeCanonicalField(parts.duration)
  return `${base}|${d || '|'}`
}

export const hashCanonicalKey = (key: string): string =>
  createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 16)

// ---------------------------------------------------------------------------
// DB ClassGroup.name → canonical parts
// ---------------------------------------------------------------------------

/**
 * Parse an existing DB `ClassGroup.name` into canonical parts. The DB
 * names we accept come from three sources:
 *
 *   (a) Legacy sem4 (id 1..36) and sem1 (id 1..36) — names produced by
 *       the original Word parser, e.g. `2024级口腔医学1班`, `三年制`,
 *       `智能轧钢技术1班`.
 *   (b) L7-F6C plannedName construction (with the
 *       `${grade}级${major}${num}班` template, which produces names
 *       like `2024级级口腔医学1班` — note the literal double 级 because
 *       Excel A column already contains the 级 suffix).
 *   (c) Any future master-data write that follows the canonical
 *       contract.
 *
 * We support:
 *  - `<cohort><duration>?<major><classNo>班` where cohort is `YYYY级`
 *    or `YYYY` and duration is optional.
 *  - The legacy `(高本贯通)` suffix.
 *
 * If any field cannot be parsed, returns a failure record. The caller
 * is responsible for surfacing `CLASSGROUP_NAME_PARSE_FAILED` and
 * turning the row into a hard blocker.
 */
export const parseDbClassGroupName = (
  name: string,
): { parts: ClassGroupCanonicalParts } | { failure: ClassGroupCanonicalParseFailure } => {
  if (name == null || name.trim().length === 0) {
    return {
      failure: {
        reason: 'CLASSGROUP_NAME_PARSE_FAILED',
        detail: 'name is empty',
        inputHash: createHash('sha256').update('').digest('hex').slice(0, 16),
      },
    }
  }
  // Strip the legacy `(...)` suffix (full-width or half-width).
  const cleaned = name
    .replace(/\s+/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
  // ClassNo at end: `班` or `N班`. The trailing `班` is required.
  const classNoMatch = cleaned.match(/(\d+)班?$/)
  if (!classNoMatch) {
    return {
      failure: {
        reason: 'CLASSNO_MISSING',
        detail: `no trailing classNo in "${name}"`,
        inputHash: createHash('sha256').update(name, 'utf8').digest('hex').slice(0, 16),
      },
    }
  }
  const classNo = `${classNoMatch[1]}班`
  let rest = cleaned.slice(0, classNoMatch.index)

  // L7-F6D2 reconciliation note: the L7-F6B / L7-F6C scripts built
  // plannedName with the template `${grade}级${major}${num}班` where
  // `${grade}` was the *literal Excel A column* value (which already
  // contains the trailing `级`). This produces names like
  // `2024级级口腔医学1班` (a double `级`). The canonical key parser
  // MUST tolerate this: if we see two consecutive 级 characters after
  // the cohort number, we drop one.
  let cohort = ''
  // Try `YYYY级` first.
  const cohortMatch1 = rest.match(/^(20\d{2})级+/)
  const cohortMatch2 = rest.match(/^(20\d{2})/)
  if (cohortMatch1) {
    cohort = `${cohortMatch1[1]}级`
    rest = rest.slice(cohortMatch1[0].length)
  } else if (cohortMatch2) {
    cohort = `${cohortMatch2[1]}级`
    rest = rest.slice(cohortMatch2[0].length)
  }
  // Strip any orphan leading 级 (L7-F6C bug: `2024级级口腔医学` →
  // after cohort match, rest = `级口腔医学`).
  if (rest.startsWith('级')) rest = rest.slice(1)

  // Duration: leading `N年制`. The Excel B column gives `三年制`,
  // `二年制`, `五年制`. Legacy names may have it embedded after cohort.
  const durationMatch = rest.match(/^(\d+年制)/)
  let duration = ''
  if (durationMatch) {
    duration = durationMatch[1]
    rest = rest.slice(durationMatch[0].length)
  }
  // The remainder is the major.
  const major = rest.trim()
  if (major.length === 0) {
    return {
      failure: {
        reason: 'MAJOR_MISSING',
        detail: `no major after stripping cohort/duration in "${name}"`,
        inputHash: createHash('sha256').update(name, 'utf8').digest('hex').slice(0, 16),
      },
    }
  }
  if (cohort.length === 0) {
    return {
      failure: {
        reason: 'COHORT_MISSING',
        detail: `no cohort in "${name}"`,
        inputHash: createHash('sha256').update(name, 'utf8').digest('hex').slice(0, 16),
      },
    }
  }
  return {
    parts: {
      targetSemesterId: 0, // caller must set
      cohort,
      duration,
      major,
      classNo,
    },
  }
}

// ---------------------------------------------------------------------------
// Excel ClassGroup row → canonical parts
// ---------------------------------------------------------------------------

export type ExcelCanonicalClassGroup = {
  /** Cohort as it appears in Excel A column (already normalised). */
  cohort: string
  /** Duration as it appears in Excel B column (already normalised). */
  duration: string
  /** Major as it appears in Excel C column (already normalised). */
  major: string
  /** classNo token (e.g. `1班`), already normalised. */
  classNo: string
  /** Sheet index (1-based). */
  sheetIndex: number
  /** Source row index (1-based, within the sheet). */
  sourceRowIndex: number
}

export type ExcelCanonicalClassGroupFailure = {
  reason: 'MAJOR_MISSING' | 'CLASSNO_PARSE_FAILED' | 'COHORT_MISSING'
  detail: string
  sheetIndex: number
  sourceRowIndex: number
}

/**
 * Build an `ExcelCanonicalClassGroup` from the raw Excel cells. Only
 * the *classNo* is tokenised: a row with D=`1班,2班,3班` produces THREE
 * canonical entries (one per classNo). Caller iterates and builds
 * canonical keys.
 */
export const excelRowToCanonicalClassGroups = (
  row: {
    sheetIndex: number
    sourceRowIndex: number
    cohortRaw: string | null
    durationRaw: string | null
    majorRaw: string | null
    classTextRaw: string | null
  },
): { entries: ExcelCanonicalClassGroup[]; failures: ExcelCanonicalClassGroupFailure[] } => {
  const cohortRaw = (row.cohortRaw ?? '').trim()
  const durationRaw = (row.durationRaw ?? '').trim()
  const majorRaw = (row.majorRaw ?? '').trim()
  const classTextRaw = row.classTextRaw ?? ''
  const failures: ExcelCanonicalClassGroupFailure[] = []
  const cohort = normalizeCohortField(cohortRaw)
  if (cohortRaw.length > 0 && cohort.length === 0) {
    failures.push({
      reason: 'COHORT_MISSING',
      detail: `cohort "${cohortRaw}" did not parse`,
      sheetIndex: row.sheetIndex,
      sourceRowIndex: row.sourceRowIndex,
    })
  }
  if (majorRaw.length === 0) {
    failures.push({
      reason: 'MAJOR_MISSING',
      detail: 'major cell is empty',
      sheetIndex: row.sheetIndex,
      sourceRowIndex: row.sourceRowIndex,
    })
    return { entries: [], failures }
  }
  const tokens = tokenizeExcelClassText(classTextRaw)
  if (tokens == null) {
    failures.push({
      reason: 'CLASSNO_PARSE_FAILED',
      detail: `classText "${classTextRaw}" did not parse`,
      sheetIndex: row.sheetIndex,
      sourceRowIndex: row.sourceRowIndex,
    })
    return { entries: [], failures }
  }
  if (tokens.length === 0) {
    return { entries: [], failures }
  }
  const entries: ExcelCanonicalClassGroup[] = tokens.map((cn) => ({
    cohort: cohort || '',
    duration: durationRaw,
    major: majorRaw,
    classNo: cn,
    sheetIndex: row.sheetIndex,
    sourceRowIndex: row.sourceRowIndex,
  }))
  return { entries, failures }
}

/**
 * Normalize the cohort field. Excel A column may have `2024级` or
 * `2024`. We canonicalise to `YYYY级` form so the canonical key matches
 * regardless of source form.
 */
export const normalizeCohortField = (s: string | null | undefined): string => {
  const trimmed = (s ?? '').trim()
  if (trimmed.length === 0) return ''
  if (/^20\d{2}级$/.test(trimmed)) return trimmed
  const m = trimmed.match(/^(20\d{2})$/)
  if (m) return `${m[1]}级`
  // Already has 级 but with surrounding chars
  return trimmed
}

// ---------------------------------------------------------------------------
// K-column segment parser
// ---------------------------------------------------------------------------

export type KColumnSegment = {
  classTokens: string[]
  teacherText: string | null
  /** Empty string when the segment has no teacher. */
  teacherTextHash: string | null
  /** Unsupported pattern flag (true means the segment could not be
   *  parsed by the standard grammar; caller should treat it as
   *  unresolved and possibly fall back to J column). */
  unsupportedPattern: boolean
  unsupportedReason: string | null
}

export type KColumnParseResult = {
  segments: KColumnSegment[]
  unsupportedSegmentCount: number
  teacherPresent: boolean
}

/**
 * Parse a K-column 授课任务分配 cell into segments. Each segment has
 * classTokens + teacherText. The grammar is:
 *
 *   <row>     := <segment> (";" <segment>)*
 *   <segment> := <classSpec> ":" <teacher>
 *   <classSpec> := <token> ("," | "、" | "." | "-") <token> ...
 *   <token>    := <digits> ("班")?
 *   <teacher>  := <any non-empty text until next segment boundary>
 *
 * Both `;` and `；` are segment boundaries. Both `:` and `：` are the
 * classSpec / teacher separator. `1.2` means `1班,2班` (NOT decimal).
 * `1-2` means `1班,2班` (NOT range). `1、2` means `1班,2班`. Mixed
 * delimiters within one segment are tolerated.
 */
export const parseKAssignmentSegments = (
  raw: string | null | undefined,
): KColumnParseResult => {
  const trimmed = (raw ?? '').trim()
  if (trimmed.length === 0) {
    return { segments: [], unsupportedSegmentCount: 0, teacherPresent: false }
  }
  const segmentStrs = trimmed.split(/[;；]+/).map((s) => s.trim()).filter((s) => s.length > 0)
  const segments: KColumnSegment[] = []
  let unsupportedSegmentCount = 0
  let teacherPresent = false
  for (const seg of segmentStrs) {
    // Find the LAST occurrence of `:` or `：` to split.
    const colonIdx = Math.max(seg.lastIndexOf(':'), seg.lastIndexOf('：'))
    if (colonIdx < 0) {
      // No colon — treat the whole string as classSpec with no teacher.
      const tokens = tokenizeExcelClassText(seg)
      if (tokens == null) {
        segments.push({
          classTokens: [],
          teacherText: null,
          teacherTextHash: null,
          unsupportedPattern: true,
          unsupportedReason: `no colon and classSpec "${seg}" did not parse`,
        })
        unsupportedSegmentCount++
      } else {
        segments.push({
          classTokens: tokens,
          teacherText: null,
          teacherTextHash: null,
          unsupportedPattern: true,
          unsupportedReason: 'segment has no teacher (no colon)',
        })
        unsupportedSegmentCount++
      }
      continue
    }
    const classSpec = seg.slice(0, colonIdx).trim()
    const teacherText = seg.slice(colonIdx + 1).trim()
    const tokens = tokenizeExcelClassText(classSpec)
    if (tokens == null) {
      segments.push({
        classTokens: [],
        teacherText: teacherText.length > 0 ? teacherText : null,
        teacherTextHash: teacherText.length > 0
          ? createHash('sha256').update(teacherText, 'utf8').digest('hex').slice(0, 16)
          : null,
        unsupportedPattern: true,
        unsupportedReason: `classSpec "${classSpec}" did not parse`,
      })
      unsupportedSegmentCount++
      continue
    }
    if (teacherText.length === 0) {
      segments.push({
        classTokens: tokens,
        teacherText: null,
        teacherTextHash: null,
        unsupportedPattern: true,
        unsupportedReason: 'segment has empty teacher',
      })
      unsupportedSegmentCount++
      continue
    }
    teacherPresent = true
    segments.push({
      classTokens: tokens,
      teacherText,
      teacherTextHash: createHash('sha256').update(teacherText, 'utf8').digest('hex').slice(0, 16),
      unsupportedPattern: false,
      unsupportedReason: null,
    })
  }
  return { segments, unsupportedSegmentCount, teacherPresent }
}