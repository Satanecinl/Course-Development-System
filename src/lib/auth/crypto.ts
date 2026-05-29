// src/lib/auth/crypto.ts
// Password hashing and session token utilities

import { hash, verify } from '@node-rs/argon2'
import { randomBytes, createHash } from 'crypto'

// ─── Password Hash ──────────────────────────────────────────────

const ARGON2_OPTIONS = {
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return verify(passwordHash, password)
}

// ─── Session Token ──────────────────────────────────────────────

export function generateSessionToken(): string {
  // 32 bytes = 64 hex chars
  return randomBytes(32).toString('hex')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
