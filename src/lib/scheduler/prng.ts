// src/lib/scheduler/prng.ts
// Seeded PRNG helper — mulberry32
// No external dependencies. Same seed → identical sequence. Output in [0, 1).

const MAX_UINT32 = 0xffffffff

/**
 * Normalize any seed value to a stable uint32-compatible number.
 * - number → floor(abs(n)) % MAX_UINT32
 * - string → FNV-1a-like hash to uint32
 * - null/undefined → generates a fresh random seed (for fallback only)
 */
export function normalizeSeed(seed: number | string | null | undefined): number {
  if (seed == null) {
    return Math.floor(Math.random() * MAX_UINT32)
  }

  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) return 0
    return Math.abs(Math.floor(seed)) % MAX_UINT32
  }

  // String seed: simple hash to uint32
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % MAX_UINT32
}

/**
 * Create a seeded random number generator using mulberry32.
 * Returns a function that produces values in [0, 1) with full 32-bit precision.
 *
 * Reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
 */
export function createSeededRandom(seed: number | string): () => number {
  let s = normalizeSeed(seed)

  return function rng(): number {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Pick a random element from an array using the provided rng.
 */
export function pickRandom<T>(rng: () => number, arr: T[]): T {
  if (arr.length === 0) {
    throw new Error('Cannot pick from empty array')
  }
  return arr[Math.floor(rng() * arr.length)]
}

/**
 * Generate a random integer in [min, max] inclusive using the provided rng.
 */
export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

/**
 * Shuffle an array in-place using Fisher-Yates with the provided rng.
 */
export function shuffle<T>(rng: () => number, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}
