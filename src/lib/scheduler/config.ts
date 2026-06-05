// src/lib/scheduler/config.ts
// K21-FIX-F-SOLVER-CONFIG-API-IMPLEMENTATION
//
// Server-side helpers for SchedulingConfig CRUD + resolution.
// Provides:
//   - Server default solver config (single source of truth)
//   - Validation helpers for create/update payloads
//   - Parse helpers for JSON-string fields (lockedSlotIds / lockedTaskIds)
//   - resolveConfigForPreview: load + validate config + merge with overrides
//   - serializeConfigForSnapshot: write resolved config into resultSnapshot.config
//
// Companion to src/lib/scheduler/preview.ts. Pure module — no DB writes
// except the single read inside resolveConfigForPreview.

import { prisma } from '@/lib/prisma'

// ─── Server defaults ─────────────────────────────────────────────

/**
 * Solver version string baked into each SchedulingRun.
 * Kept in sync with preview.ts / apply.ts / rollback.ts.
 */
export const SOLVER_VERSION = 'lahc-hard-first-v3'

/**
 * Server-side defaults applied when neither configId nor overrides
 * are supplied to a preview request. These are the pre-K21-FIX-F
 * hardcoded constants from preview.ts.
 */
export const DEFAULT_SOLVER_CONFIG = {
  maxIterations: 10000,
  lahcWindowSize: 500,
  randomSeed: null as number | null,
  lockedSlotIds: [] as number[],
  solverVersion: SOLVER_VERSION,
} as const

// ─── Validation ranges ────────────────────────────────────────────

export const CONFIG_LIMITS = {
  nameMinLen: 1,
  nameMaxLen: 100,
  maxIterationsMin: 100,
  maxIterationsMax: 15000,
  lahcWindowSizeMin: 50,
  lahcWindowSizeMax: 2000,
  randomSeedMin: 0,
  randomSeedMax: 2147483647, // 2^31 - 1
  solverVersionMaxLen: 50,
  lockedSlotIdsMaxLen: 500,
  overridesMaxLen: 4,
} as const

// ─── JSON parse helpers ──────────────────────────────────────────

/**
 * Safely parse a JSON-string array of integers.
 * Returns null on invalid input. Empty string / null → [].
 */
export function parseLockedSlotIdsJson(raw: string | null | undefined): number[] | null {
  if (raw == null || raw === '') return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const out: number[] = []
    for (const v of parsed) {
      if (!Number.isInteger(v) || v <= 0) return null
      out.push(v)
    }
    return [...new Set(out)]
  } catch {
    return null
  }
}

/**
 * Serialize an array of integers to a JSON string.
 */
export function serializeLockedSlotIds(ids: number[] | null | undefined): string | null {
  if (ids == null) return null
  return JSON.stringify([...new Set(ids)])
}

/**
 * Resolve the effective locked slot IDs from a SchedulingConfig row.
 * Priority: new lockedSlotIds field, then legacy lockedTaskIds.
 * lockedTaskIds is task-id bag (not slot-id) — K21-FIX-F keeps it
 * deprecated and does NOT expand to slot IDs (task-level lock is K22+).
 */
export function resolveLockedSlotIdsFromConfig(config: {
  lockedSlotIds: string | null
  lockedTaskIds: string
}): number[] {
  const parsed = parseLockedSlotIdsJson(config.lockedSlotIds)
  if (parsed != null && parsed.length > 0) return parsed
  // lockedTaskIds fallback: if non-empty and parses as slot IDs, use it.
  // (task-id expansion is out of scope for K21-FIX-F.)
  const legacy = parseLockedSlotIdsJson(config.lockedTaskIds)
  return legacy ?? []
}

// ─── Validation ──────────────────────────────────────────────────

export type ValidationError =
  | 'INVALID_NAME'
  | 'INVALID_SEMESTER_ID'
  | 'INVALID_MAX_ITERATIONS'
  | 'INVALID_LAHC_WINDOW_SIZE'
  | 'INVALID_RANDOM_SEED'
  | 'INVALID_LOCKED_SLOT_IDS'
  | 'INVALID_SOLVER_VERSION'
  | 'INVALID_CONFIG_ID'

export interface ValidatedConfigInput {
  name: string
  semesterId: number | null
  maxIterations: number
  lahcWindowSize: number
  randomSeed: number | null
  solverVersion: string | null
  lockedSlotIds: number[]
}

export interface ValidationResult {
  ok: boolean
  error?: ValidationError
  message?: string
  value?: ValidatedConfigInput
}

/**
 * Validate a partial or full SchedulingConfig payload for POST/PUT.
 * All fields optional except on POST where name is required.
 */
export function validateConfigPayload(
  body: Record<string, unknown>,
  options: { nameRequired: boolean },
): ValidationResult {
  const out: Partial<ValidatedConfigInput> = {}

  // name
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      return { ok: false, error: 'INVALID_NAME', message: 'name must be a string' }
    }
    const trimmed = body.name.trim()
    if (trimmed.length < CONFIG_LIMITS.nameMinLen || trimmed.length > CONFIG_LIMITS.nameMaxLen) {
      return {
        ok: false,
        error: 'INVALID_NAME',
        message: `name must be ${CONFIG_LIMITS.nameMinLen}-${CONFIG_LIMITS.nameMaxLen} characters`,
      }
    }
    out.name = trimmed
  } else if (options.nameRequired) {
    return { ok: false, error: 'INVALID_NAME', message: 'name is required' }
  }

  // semesterId
  if (body.semesterId !== undefined && body.semesterId !== null) {
    if (typeof body.semesterId !== 'number' || !Number.isInteger(body.semesterId) || body.semesterId <= 0) {
      return { ok: false, error: 'INVALID_SEMESTER_ID', message: 'semesterId must be a positive integer or null' }
    }
    out.semesterId = body.semesterId
  } else if (body.semesterId === null) {
    out.semesterId = null
  }

  // maxIterations
  if (body.maxIterations !== undefined) {
    if (
      typeof body.maxIterations !== 'number' ||
      !Number.isInteger(body.maxIterations) ||
      body.maxIterations < CONFIG_LIMITS.maxIterationsMin ||
      body.maxIterations > CONFIG_LIMITS.maxIterationsMax
    ) {
      return {
        ok: false,
        error: 'INVALID_MAX_ITERATIONS',
        message: `maxIterations must be integer in [${CONFIG_LIMITS.maxIterationsMin}, ${CONFIG_LIMITS.maxIterationsMax}]`,
      }
    }
    out.maxIterations = body.maxIterations
  }

  // lahcWindowSize
  if (body.lahcWindowSize !== undefined) {
    if (
      typeof body.lahcWindowSize !== 'number' ||
      !Number.isInteger(body.lahcWindowSize) ||
      body.lahcWindowSize < CONFIG_LIMITS.lahcWindowSizeMin ||
      body.lahcWindowSize > CONFIG_LIMITS.lahcWindowSizeMax
    ) {
      return {
        ok: false,
        error: 'INVALID_LAHC_WINDOW_SIZE',
        message: `lahcWindowSize must be integer in [${CONFIG_LIMITS.lahcWindowSizeMin}, ${CONFIG_LIMITS.lahcWindowSizeMax}]`,
      }
    }
    out.lahcWindowSize = body.lahcWindowSize
  }

  // randomSeed
  if (body.randomSeed !== undefined && body.randomSeed !== null) {
    if (
      typeof body.randomSeed !== 'number' ||
      !Number.isInteger(body.randomSeed) ||
      body.randomSeed < CONFIG_LIMITS.randomSeedMin ||
      body.randomSeed > CONFIG_LIMITS.randomSeedMax
    ) {
      return {
        ok: false,
        error: 'INVALID_RANDOM_SEED',
        message: `randomSeed must be integer in [${CONFIG_LIMITS.randomSeedMin}, ${CONFIG_LIMITS.randomSeedMax}]`,
      }
    }
    out.randomSeed = body.randomSeed
  } else if (body.randomSeed === null) {
    out.randomSeed = null
  }

  // solverVersion
  if (body.solverVersion !== undefined && body.solverVersion !== null) {
    if (typeof body.solverVersion !== 'string') {
      return { ok: false, error: 'INVALID_SOLVER_VERSION', message: 'solverVersion must be a string' }
    }
    if (body.solverVersion.length > CONFIG_LIMITS.solverVersionMaxLen) {
      return {
        ok: false,
        error: 'INVALID_SOLVER_VERSION',
        message: `solverVersion must be at most ${CONFIG_LIMITS.solverVersionMaxLen} characters`,
      }
    }
    out.solverVersion = body.solverVersion
  } else if (body.solverVersion === null) {
    out.solverVersion = null
  }

  // lockedSlotIds
  if (body.lockedSlotIds !== undefined && body.lockedSlotIds !== null) {
    if (!Array.isArray(body.lockedSlotIds)) {
      return { ok: false, error: 'INVALID_LOCKED_SLOT_IDS', message: 'lockedSlotIds must be an array' }
    }
    if (body.lockedSlotIds.length > CONFIG_LIMITS.lockedSlotIdsMaxLen) {
      return {
        ok: false,
        error: 'INVALID_LOCKED_SLOT_IDS',
        message: `lockedSlotIds max length is ${CONFIG_LIMITS.lockedSlotIdsMaxLen}`,
      }
    }
    for (const id of body.lockedSlotIds) {
      if (!Number.isInteger(id) || id <= 0) {
        return { ok: false, error: 'INVALID_LOCKED_SLOT_IDS', message: `Invalid slot id: ${id}` }
      }
    }
    out.lockedSlotIds = [...new Set(body.lockedSlotIds as number[])]
  } else if (body.lockedSlotIds === null) {
    out.lockedSlotIds = []
  }

  return { ok: true, value: out as ValidatedConfigInput }
}

/**
 * Validate the overrides object on a preview request.
 * Returns validated overrides or throws an Error with code prefix.
 */
export function validatePreviewOverrides(raw: unknown): {
  maxIterations?: number
  lahcWindowSize?: number
  randomSeed?: number | null
  lockedSlotIds?: number[]
} {
  if (raw == null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('INVALID_OVERRIDES: overrides must be an object')
  }
  const o = raw as Record<string, unknown>
  const out: ReturnType<typeof validatePreviewOverrides> = {}

  if (o.maxIterations !== undefined) {
    if (
      typeof o.maxIterations !== 'number' ||
      !Number.isInteger(o.maxIterations) ||
      o.maxIterations < CONFIG_LIMITS.maxIterationsMin ||
      o.maxIterations > CONFIG_LIMITS.maxIterationsMax
    ) {
      throw new Error(
        `INVALID_OVERRIDES: maxIterations must be integer in [${CONFIG_LIMITS.maxIterationsMin}, ${CONFIG_LIMITS.maxIterationsMax}]`,
      )
    }
    out.maxIterations = o.maxIterations
  }

  if (o.lahcWindowSize !== undefined) {
    if (
      typeof o.lahcWindowSize !== 'number' ||
      !Number.isInteger(o.lahcWindowSize) ||
      o.lahcWindowSize < CONFIG_LIMITS.lahcWindowSizeMin ||
      o.lahcWindowSize > CONFIG_LIMITS.lahcWindowSizeMax
    ) {
      throw new Error(
        `INVALID_OVERRIDES: lahcWindowSize must be integer in [${CONFIG_LIMITS.lahcWindowSizeMin}, ${CONFIG_LIMITS.lahcWindowSizeMax}]`,
      )
    }
    out.lahcWindowSize = o.lahcWindowSize
  }

  if (o.randomSeed !== undefined && o.randomSeed !== null) {
    if (
      typeof o.randomSeed !== 'number' ||
      !Number.isInteger(o.randomSeed) ||
      o.randomSeed < CONFIG_LIMITS.randomSeedMin ||
      o.randomSeed > CONFIG_LIMITS.randomSeedMax
    ) {
      throw new Error(
        `INVALID_OVERRIDES: randomSeed must be integer in [${CONFIG_LIMITS.randomSeedMin}, ${CONFIG_LIMITS.randomSeedMax}]`,
      )
    }
    out.randomSeed = o.randomSeed
  } else if (o.randomSeed === null) {
    out.randomSeed = null
  }

  if (o.lockedSlotIds !== undefined) {
    if (!Array.isArray(o.lockedSlotIds)) {
      throw new Error('INVALID_OVERRIDES: lockedSlotIds must be an array')
    }
    for (const id of o.lockedSlotIds) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`INVALID_OVERRIDES: invalid slot id ${id}`)
      }
    }
    out.lockedSlotIds = [...new Set(o.lockedSlotIds as number[])]
  }

  return out
}

// ─── Resolve config for preview ──────────────────────────────────

export interface ResolvedSolverConfig {
  configId: number | null
  name: string | null
  maxIterations: number
  lahcWindowSize: number
  randomSeed: number | null
  lockedSlotIds: number[]
  solverVersion: string
  source: 'CONFIG' | 'INLINE' | 'DEFAULT' | 'MIXED'
  snapshotTakenAt: string
}

export interface ResolveConfigInput {
  configId?: number | null
  overrides?: {
    maxIterations?: number
    lahcWindowSize?: number
    randomSeed?: number | null
    lockedSlotIds?: number[]
  }
  /** Pre-existing legacy top-level fields. Treated as overrides of last resort. */
  legacyTopLevel?: {
    maxIterations?: number
    lahcWindowSize?: number
    randomSeed?: number
    lockedSlotIds?: number[]
  }
  semesterId: number
}

export class SchedulingConfigNotFoundError extends Error {
  constructor(public configId: number) {
    super(`SCHEDULING_CONFIG_NOT_FOUND: configId=${configId}`)
    this.name = 'SchedulingConfigNotFoundError'
  }
}

export class SemesterMismatchError extends Error {
  constructor(public configSemesterId: number, public requestSemesterId: number) {
    super(`SEMESTER_MISMATCH: config.semesterId=${configSemesterId} request.semesterId=${requestSemesterId}`)
    this.name = 'SemesterMismatchError'
  }
}

/**
 * Resolve the effective solver config for a preview run.
 *
 * Priority:
 *   overrides  >  configId  >  legacy top-level  >  server default
 *
 * Throws:
 *   - SchedulingConfigNotFoundError: configId provided but row not found
 *   - SemesterMismatchError: configId provided but semesterId is non-null and differs
 *   - Invalid semesterId (via Semester.findUnique) propagates naturally
 */
export async function resolveConfigForPreview(
  input: ResolveConfigInput,
): Promise<ResolvedSolverConfig> {
  // 1. Load config (if any)
  let config: {
    id: number
    name: string
    semesterId: number | null
    maxIterations: number
    lahcWindowSize: number
    randomSeed: number | null
    solverVersion: string | null
    lockedSlotIds: string | null
    lockedTaskIds: string
  } | null = null

  if (input.configId != null) {
    const found = await prisma.schedulingConfig.findUnique({
      where: { id: input.configId },
    })
    if (!found) {
      throw new SchedulingConfigNotFoundError(input.configId)
    }
    if (found.semesterId != null && found.semesterId !== input.semesterId) {
      throw new SemesterMismatchError(found.semesterId, input.semesterId)
    }
    config = {
      id: found.id,
      name: found.name,
      semesterId: found.semesterId,
      maxIterations: found.maxIterations,
      lahcWindowSize: found.lahcWindowSize,
      randomSeed: found.randomSeed,
      solverVersion: found.solverVersion,
      lockedSlotIds: found.lockedSlotIds,
      lockedTaskIds: found.lockedTaskIds,
    }
  }

  // 2. Merge values with priority: overrides > config > legacy > default
  const ov = input.overrides ?? {}
  const legacy = input.legacyTopLevel ?? {}

  const maxIterations =
    ov.maxIterations ?? config?.maxIterations ?? legacy.maxIterations ?? DEFAULT_SOLVER_CONFIG.maxIterations

  const lahcWindowSize =
    ov.lahcWindowSize ??
    config?.lahcWindowSize ??
    legacy.lahcWindowSize ??
    DEFAULT_SOLVER_CONFIG.lahcWindowSize

  // randomSeed: explicit null in overrides means "use server default (null → runtime generates)"
  let randomSeed: number | null
  if (ov.randomSeed !== undefined) {
    randomSeed = ov.randomSeed
  } else if (config?.randomSeed != null) {
    randomSeed = config.randomSeed
  } else if (legacy.randomSeed !== undefined) {
    randomSeed = legacy.randomSeed
  } else {
    randomSeed = DEFAULT_SOLVER_CONFIG.randomSeed
  }

  // lockedSlotIds: explicit [] in overrides means "no locks"
  let lockedSlotIds: number[]
  if (ov.lockedSlotIds !== undefined) {
    lockedSlotIds = ov.lockedSlotIds
  } else if (config) {
    lockedSlotIds = resolveLockedSlotIdsFromConfig(config)
  } else if (legacy.lockedSlotIds !== undefined) {
    lockedSlotIds = [...new Set(legacy.lockedSlotIds)]
  } else {
    lockedSlotIds = DEFAULT_SOLVER_CONFIG.lockedSlotIds
  }

  // solverVersion: precedence
  let solverVersion: string
  if (config?.solverVersion) {
    solverVersion = config.solverVersion
  } else {
    solverVersion = SOLVER_VERSION
  }

  // 3. Determine source label
  const overridesProvided = ov.maxIterations !== undefined ||
    ov.lahcWindowSize !== undefined ||
    ov.randomSeed !== undefined ||
    ov.lockedSlotIds !== undefined
  const legacyProvided = legacy.maxIterations !== undefined ||
    legacy.lahcWindowSize !== undefined ||
    legacy.randomSeed !== undefined ||
    legacy.lockedSlotIds !== undefined

  let source: ResolvedSolverConfig['source']
  if (config && overridesProvided) source = 'MIXED'
  else if (config) source = 'CONFIG'
  else if (overridesProvided || legacyProvided) source = 'INLINE'
  else source = 'DEFAULT'

  return {
    configId: config?.id ?? null,
    name: config?.name ?? null,
    maxIterations,
    lahcWindowSize,
    randomSeed,
    lockedSlotIds,
    solverVersion,
    source,
    snapshotTakenAt: new Date().toISOString(),
  }
}

/**
 * Build the config sub-object written to SchedulingRun.resultSnapshot.config.
 */
export function serializeConfigForSnapshot(resolved: ResolvedSolverConfig): {
  configId: number | null
  name: string | null
  maxIterations: number
  lahcWindowSize: number
  randomSeed: number | null
  lockedSlotIds: number[]
  solverVersion: string
  source: ResolvedSolverConfig['source']
  snapshotTakenAt: string
} {
  return {
    configId: resolved.configId,
    name: resolved.name,
    maxIterations: resolved.maxIterations,
    lahcWindowSize: resolved.lahcWindowSize,
    randomSeed: resolved.randomSeed,
    lockedSlotIds: resolved.lockedSlotIds,
    solverVersion: resolved.solverVersion,
    source: resolved.source,
    snapshotTakenAt: resolved.snapshotTakenAt,
  }
}

/**
 * Map a SchedulingConfig DB row to a wire-format DTO.
 * lockedSlotIds and lockedTaskIds returned as parsed arrays.
 */
export function mapConfigToDto(config: {
  id: number
  name: string
  semesterId: number | null
  maxIterations: number
  lahcWindowSize: number
  randomSeed: number | null
  solverVersion: string | null
  lockedSlotIds: string | null
  lockedTaskIds: string
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: config.id,
    name: config.name,
    semesterId: config.semesterId,
    maxIterations: config.maxIterations,
    lahcWindowSize: config.lahcWindowSize,
    randomSeed: config.randomSeed,
    solverVersion: config.solverVersion,
    lockedSlotIds: parseLockedSlotIdsJson(config.lockedSlotIds) ?? [],
    lockedTaskIds: config.lockedTaskIds,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  }
}
