/**
 * src/lib/worktime/worktime-snapshot.ts
 *
 * K26-J2: WorkTime snapshot serialization / parsing / validation for
 * `SchedulingRun.workTimeConfigSnapshot`.
 *
 * The snapshot is captured at preview time and carried forward by apply
 * and rollback. It is **the only** source of WorkTime policy that
 * apply / rollback consult — they must NOT re-resolve the current
 * WorkTimeConfig. This guarantees that a run can be reproduced
 * (and a later WorkTimeConfig change does not silently alter the
 * interpretation of the run's changes).
 *
 * Solver and score modules do NOT consume this snapshot directly. The
 * K26-J audit (`docs/k26-worktime-solver-score-integration-audit.md`)
 * defers solver/score integration to K26-J3 / K26-J4. The
 * `toSolverWorkTimeContract` helper is provided as a typed
 * conversion so that the eventual J3/J4 wiring has a stable
 * boundary to read from. It is NOT called by the solver today.
 */

import type { ResolvedWorkTimeForSchedule } from './worktime-schedule-resolver'
import { LEGACY_DISPLAY_SLOT_INDEXES } from '@/lib/schedule/time-slots'

// ── Constants ──

export const WORKTIME_SNAPSHOT_VERSION = 1 as const

export const WORKTIME_SNAPSHOT_SOURCE = ['database', 'staticFallback'] as const
export type WorkTimeSnapshotSource = (typeof WORKTIME_SNAPSHOT_SOURCE)[number]

// ── Snapshot type ──

export interface SchedulingRunWorkTimeSnapshot {
  version: typeof WORKTIME_SNAPSHOT_VERSION
  source: WorkTimeSnapshotSource
  semesterId: number
  workTimeConfigId: number | null
  workTimeConfigName: string | null
  allowWeekend: boolean
  activeTeachingSlotIndexes: number[]
  legacyDisplaySlotIndexes: number[]
  allowedDayOfWeeks: number[]
  weekdayDayOfWeeks: number[]
  weekendDayOfWeeks: number[]
  slotsByIndex: Record<string, {
    slotIndex: number
    label: string
    startsAt: string | null
    endsAt: string | null
    isActive: boolean
    isTeachingSlot: boolean
    isLegacyDisplay: boolean
    sortOrder: number
  }>
  serializedAt: string
}

// ── Minimal additive metadata (embedded in resultSnapshot.workTime) ──

export interface WorkTimeSnapshotAdditiveMetadata {
  snapshotVersion: typeof WORKTIME_SNAPSHOT_VERSION
  source: WorkTimeSnapshotSource
  workTimeConfigId: number | null
  allowWeekend: boolean
  activeTeachingSlotIndexes: number[]
  legacyDisplaySlotIndexes: number[]
}

// ── Solver contract stub (K26-J3 / J4 will consume) ──

export interface SolverWorkTimeContract {
  semesterId: number
  source: WorkTimeSnapshotSource
  workTimeConfigId: number | null
  allowWeekend: boolean
  activeTeachingSlotIndexes: number[]
  legacyDisplaySlotIndexes: number[]
  allowedDayOfWeeks: number[]
  weekdayDayOfWeeks: number[]
  weekendDayOfWeeks: number[]
}

/**
 * Convert a snapshot into a solver-facing contract. NOT consumed by
 * the solver today; reserved for K26-J3 / J4 wiring.
 */
export function toSolverWorkTimeContract(
  snap: SchedulingRunWorkTimeSnapshot
): SolverWorkTimeContract {
  return {
    semesterId: snap.semesterId,
    source: snap.source,
    workTimeConfigId: snap.workTimeConfigId,
    allowWeekend: snap.allowWeekend,
    activeTeachingSlotIndexes: [...snap.activeTeachingSlotIndexes],
    legacyDisplaySlotIndexes: [...snap.legacyDisplaySlotIndexes],
    allowedDayOfWeeks: [...snap.allowedDayOfWeeks],
    weekdayDayOfWeeks: [...snap.weekdayDayOfWeeks],
    weekendDayOfWeeks: [...snap.weekendDayOfWeeks],
  }
}

// ── Apply / rollback response metadata ──

export interface WorkTimeSnapshotReadMetadata {
  present: boolean
  version?: typeof WORKTIME_SNAPSHOT_VERSION
  source?: WorkTimeSnapshotSource
  workTimeConfigId?: number | null
  allowWeekend?: boolean
}

// ── Errors ──

export class WorkTimeSnapshotInvalidError extends Error {
  public readonly code: string
  public readonly cause?: unknown
  constructor(code: string, message: string, cause?: unknown) {
    super(message)
    this.name = 'WorkTimeSnapshotInvalidError'
    this.code = code
    this.cause = cause
  }
}

// ── Helpers ──

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isSlotDef(v: unknown): v is SchedulingRunWorkTimeSnapshot['slotsByIndex'][string] {
  if (!isPlainObject(v)) return false
  if (typeof v.slotIndex !== 'number' || !Number.isInteger(v.slotIndex)) return false
  if (v.slotIndex < 1 || v.slotIndex > 7) return false
  if (typeof v.label !== 'string') return false
  if (v.startsAt !== null && typeof v.startsAt !== 'string') return false
  if (v.endsAt !== null && typeof v.endsAt !== 'string') return false
  if (typeof v.isActive !== 'boolean') return false
  if (typeof v.isTeachingSlot !== 'boolean') return false
  if (typeof v.isLegacyDisplay !== 'boolean') return false
  if (typeof v.sortOrder !== 'number' || !Number.isInteger(v.sortOrder)) return false
  return true
}

function isIntArrayOfRange(v: unknown, lo: number, hi: number): v is number[] {
  if (!Array.isArray(v)) return false
  for (const x of v) {
    if (typeof x !== 'number' || !Number.isInteger(x)) return false
    if (x < lo || x > hi) return false
  }
  return true
}

function isIntArrayOfRangeAllowEmpty(
  v: unknown,
  lo: number,
  hi: number
): v is number[] {
  if (!Array.isArray(v)) return false
  for (const x of v) {
    if (typeof x !== 'number' || !Number.isInteger(x)) return false
    if (x < lo || x > hi) return false
  }
  return true
}

// ── Serializer ──

export interface BuildSnapshotInput {
  semesterId: number
  /** DB WorkTimeConfig.id, null if static fallback */
  workTimeConfigId: number | null
  /** DB WorkTimeConfig.name (null for static fallback) */
  workTimeConfigName: string | null
  resolved: ResolvedWorkTimeForSchedule
}

/**
 * Build a snapshot object from a resolved WorkTime for a semester.
 * The returned object is the in-memory representation; use
 * `serializeWorkTimeSnapshot` to obtain a stable JSON string for
 * persistence, and `parseWorkTimeSnapshot` to recover a typed object.
 */
export function buildWorkTimeSnapshot(
  input: BuildSnapshotInput
): SchedulingRunWorkTimeSnapshot {
  const { semesterId, workTimeConfigId, workTimeConfigName, resolved } = input
  const source: WorkTimeSnapshotSource = resolved.source // 'database' | 'staticFallback'

  const allowedDayOfWeeks = [...resolved.weekdayValues]
  if (resolved.allowWeekend) {
    allowedDayOfWeeks.push(...resolved.weekendDayValues)
  }
  allowedDayOfWeeks.sort((a, b) => a - b)

  // Build slotsByIndex with string keys (JSON-safe) sorted by slotIndex.
  const slotsByIndex: SchedulingRunWorkTimeSnapshot['slotsByIndex'] = {}
  const slotKeys = Object.keys(resolved.slotsByIndex)
    .map((s) => Number(s))
    .sort((a, b) => a - b)
  for (const slotIndex of slotKeys) {
    const def = resolved.slotsByIndex[slotIndex]
    if (!def) continue
    slotsByIndex[String(slotIndex)] = {
      slotIndex: def.slotIndex,
      label: def.label,
      startsAt: def.startsAt,
      endsAt: def.endsAt,
      isActive: def.isActive,
      isTeachingSlot: def.isTeachingSlot,
      isLegacyDisplay: def.isLegacyDisplay,
      sortOrder: def.sortOrder,
    }
  }

  return {
    version: WORKTIME_SNAPSHOT_VERSION,
    source,
    semesterId,
    workTimeConfigId,
    workTimeConfigName,
    allowWeekend: resolved.allowWeekend,
    activeTeachingSlotIndexes: [...resolved.activeTeachingSlotIndexes].sort((a, b) => a - b),
    legacyDisplaySlotIndexes: [...resolved.legacyDisplaySlotIndexes].sort((a, b) => a - b),
    allowedDayOfWeeks,
    weekdayDayOfWeeks: [...resolved.weekdayValues].sort((a, b) => a - b),
    weekendDayOfWeeks: [...resolved.weekendDayValues].sort((a, b) => a - b),
    slotsByIndex,
    serializedAt: new Date().toISOString(),
  }
}

/**
 * Serialize a snapshot to a JSON string.
 */
export function serializeWorkTimeSnapshot(
  snap: SchedulingRunWorkTimeSnapshot
): string {
  return JSON.stringify(snap)
}

/**
 * Build + serialize in one call.
 */
export function buildAndSerializeWorkTimeSnapshot(
  input: BuildSnapshotInput
): { snapshot: SchedulingRunWorkTimeSnapshot; json: string } {
  const snapshot = buildWorkTimeSnapshot(input)
  return { snapshot, json: serializeWorkTimeSnapshot(snapshot) }
}

/**
 * Additive metadata for `resultSnapshot.workTime`. The full snapshot
 * is stored separately in `SchedulingRun.workTimeConfigSnapshot`;
 * this object is the small projection that travels inside the
 * result JSON for audit / UI rendering.
 */
export function toAdditiveMetadata(
  snap: SchedulingRunWorkTimeSnapshot
): WorkTimeSnapshotAdditiveMetadata {
  return {
    snapshotVersion: snap.version,
    source: snap.source,
    workTimeConfigId: snap.workTimeConfigId,
    allowWeekend: snap.allowWeekend,
    activeTeachingSlotIndexes: [...snap.activeTeachingSlotIndexes],
    legacyDisplaySlotIndexes: [...snap.legacyDisplaySlotIndexes],
  }
}

// ── Parser / validator ──

/**
 * Parse a JSON string into a typed snapshot. Throws
 * `WorkTimeSnapshotInvalidError` on malformed JSON, wrong version,
 * missing required fields, or policy violations. Does NOT silently
 * fall back.
 */
export function parseWorkTimeSnapshot(
  json: string | null | undefined
): SchedulingRunWorkTimeSnapshot {
  if (json == null || json === '') {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_MISSING',
      'WorkTime snapshot is missing on the run.',
    )
  }
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (e) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_INVALID_JSON',
      'WorkTime snapshot is not valid JSON.',
      e,
    )
  }
  return assertValidWorkTimeSnapshot(raw)
}

/**
 * Validate an unknown value as a snapshot.
 */
export function assertValidWorkTimeSnapshot(
  raw: unknown
): SchedulingRunWorkTimeSnapshot {
  if (!isPlainObject(raw)) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_VALIDATION_FAILED',
      'WorkTime snapshot root must be a JSON object.',
    )
  }
  if (raw.version !== WORKTIME_SNAPSHOT_VERSION) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_WRONG_VERSION',
      `WorkTime snapshot version must be ${WORKTIME_SNAPSHOT_VERSION}, got ${String(raw.version)}.`,
    )
  }
  if (typeof raw.source !== 'string' || !WORKTIME_SNAPSHOT_SOURCE.includes(raw.source as WorkTimeSnapshotSource)) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_VALIDATION_FAILED',
      `WorkTime snapshot source must be one of ${WORKTIME_SNAPSHOT_SOURCE.join(', ')}, got ${String(raw.source)}.`,
    )
  }
  if (typeof raw.semesterId !== 'number' || !Number.isInteger(raw.semesterId) || raw.semesterId < 1) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_VALIDATION_FAILED',
      'WorkTime snapshot semesterId must be a positive integer.',
    )
  }
  if (raw.workTimeConfigId !== null && (typeof raw.workTimeConfigId !== 'number' || !Number.isInteger(raw.workTimeConfigId) || raw.workTimeConfigId < 1)) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_VALIDATION_FAILED',
      'WorkTime snapshot workTimeConfigId must be a positive integer or null.',
    )
  }
  if (raw.workTimeConfigName !== null && typeof raw.workTimeConfigName !== 'string') {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_VALIDATION_FAILED',
      'WorkTime snapshot workTimeConfigName must be a string or null.',
    )
  }
  if (typeof raw.allowWeekend !== 'boolean') {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_VALIDATION_FAILED',
      'WorkTime snapshot allowWeekend must be a boolean.',
    )
  }
  if (!isIntArrayOfRange(raw.activeTeachingSlotIndexes, 1, 7) || raw.activeTeachingSlotIndexes.length === 0) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_MISSING_ACTIVE_SLOTS',
      'WorkTime snapshot activeTeachingSlotIndexes must be a non-empty array of integers in [1..7].',
    )
  }
  if (!isIntArrayOfRangeAllowEmpty(raw.legacyDisplaySlotIndexes, 1, 7)) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_VALIDATION_FAILED',
      'WorkTime snapshot legacyDisplaySlotIndexes must be an array of integers in [1..7].',
    )
  }
  if (!isIntArrayOfRange(raw.allowedDayOfWeeks, 1, 7) || raw.allowedDayOfWeeks.length === 0) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_VALIDATION_FAILED',
      'WorkTime snapshot allowedDayOfWeeks must be a non-empty array of integers in [1..7].',
    )
  }
  if (!isIntArrayOfRange(raw.weekdayDayOfWeeks, 1, 7) || raw.weekdayDayOfWeeks.length === 0) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_VALIDATION_FAILED',
      'WorkTime snapshot weekdayDayOfWeeks must be a non-empty array of integers in [1..7].',
    )
  }
  if (!isIntArrayOfRangeAllowEmpty(raw.weekendDayOfWeeks, 1, 7)) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_VALIDATION_FAILED',
      'WorkTime snapshot weekendDayOfWeeks must be an array of integers in [1..7].',
    )
  }
  if (!isPlainObject(raw.slotsByIndex)) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_VALIDATION_FAILED',
      'WorkTime snapshot slotsByIndex must be a JSON object.',
    )
  }
  for (const [k, v] of Object.entries(raw.slotsByIndex)) {
    if (!isSlotDef(v)) {
      throw new WorkTimeSnapshotInvalidError(
        'WORKTIME_SNAPSHOT_VALIDATION_FAILED',
        `WorkTime snapshot slotsByIndex[${k}] is not a valid slot definition.`,
      )
    }
  }
  if (typeof raw.serializedAt !== 'string' || raw.serializedAt.length === 0) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_VALIDATION_FAILED',
      'WorkTime snapshot serializedAt must be a non-empty string.',
    )
  }

  // Policy: legacy display slots must not be in active teaching set.
  for (const idx of raw.activeTeachingSlotIndexes) {
    if (LEGACY_DISPLAY_SLOT_INDEXES.includes(idx as 6 | 7)) {
      throw new WorkTimeSnapshotInvalidError(
        'WORKTIME_SNAPSHOT_LEGACY_IN_ACTIVE',
        `activeTeachingSlotIndexes must not include legacy display slot ${idx}.`,
      )
    }
  }
  // Policy: at least one of the active slots must be non-legacy.
  const nonLegacyActive = raw.activeTeachingSlotIndexes.filter(
    (s) => !LEGACY_DISPLAY_SLOT_INDEXES.includes(s as 6 | 7)
  )
  if (nonLegacyActive.length === 0) {
    throw new WorkTimeSnapshotInvalidError(
      'WORKTIME_SNAPSHOT_LEGACY_ONLY_ACTIVE',
      'activeTeachingSlotIndexes must contain at least one non-legacy slot.',
    )
  }

  // At this point the structural checks have all passed; we can
  // safely cast to the typed snapshot.
  return raw as unknown as SchedulingRunWorkTimeSnapshot
}

/**
 * Read a snapshot from a run row. Returns null when the field is
 * absent (legacy run without a snapshot). Throws
 * `WorkTimeSnapshotInvalidError` if the field is non-null but
 * malformed.
 */
export function readWorkTimeSnapshotFromRun(row: {
  workTimeConfigSnapshot: string | null
}): SchedulingRunWorkTimeSnapshot | null {
  if (row.workTimeConfigSnapshot == null) return null
  return parseWorkTimeSnapshot(row.workTimeConfigSnapshot)
}

/**
 * Build apply/rollback response metadata. If `snap` is null (legacy
 * run), the response marks `present: false`; if `snap` is invalid,
 * callers should pass `null` and the apply / rollback path will
 * fail-fast elsewhere.
 */
export function toReadMetadata(
  snap: SchedulingRunWorkTimeSnapshot | null
): WorkTimeSnapshotReadMetadata {
  if (!snap) {
    return { present: false }
  }
  return {
    present: true,
    version: snap.version,
    source: snap.source,
    workTimeConfigId: snap.workTimeConfigId,
    allowWeekend: snap.allowWeekend,
  }
}
