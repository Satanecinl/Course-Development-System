// src/lib/auth/claims.ts
// HMAC-signed auth claims cookie for middleware (no Prisma dependency)

import { createHmac } from 'crypto'
import {
  DEV_FALLBACK_COOKIE_SECRET,
  SESSION_DURATION_HOURS,
} from './constants'

// ─── Types ──────────────────────────────────────────────────────

export interface AuthClaims {
  userId: number
  username: string
  roles: string[]
  permissions: string[]
  defaultRedirect: string
  expiresAt: number // Unix timestamp (seconds)
}

// ─── Secret ─────────────────────────────────────────────────────

function getCookieSecret(): string {
  const secret = process.env.AUTH_COOKIE_SECRET
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error(
      'AUTH_COOKIE_SECRET must be set in production'
    )
  }
  return secret || DEV_FALLBACK_COOKIE_SECRET
}

// ─── Base64URL helpers ──────────────────────────────────────────

function base64urlEncode(data: string): string {
  return Buffer.from(data, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64urlDecode(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded, 'base64').toString('utf-8')
}

// ─── Sign / Verify ──────────────────────────────────────────────

function signPayload(payload: string): string {
  const secret = getCookieSecret()
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/**
 * Create a signed auth claims cookie value.
 * Format: base64url(json).base64url(hmac)
 */
export function signAuthClaims(claims: AuthClaims): string {
  const json = JSON.stringify(claims)
  const payload = base64urlEncode(json)
  const signature = signPayload(payload)
  return `${payload}.${signature}`
}

/**
 * Verify and parse an auth claims cookie value.
 * Returns null if invalid, tampered, or expired.
 */
export function verifyAuthClaims(cookieValue: string): AuthClaims | null {
  try {
    const parts = cookieValue.split('.')
    if (parts.length !== 2) return null

    const [payload, signature] = parts

    // Verify signature
    const expectedSig = signPayload(payload)
    if (signature !== expectedSig) return null

    // Decode and parse
    const json = base64urlDecode(payload)
    const claims = JSON.parse(json) as AuthClaims

    // Validate required fields
    if (
      typeof claims.userId !== 'number' ||
      typeof claims.username !== 'string' ||
      !Array.isArray(claims.roles) ||
      !Array.isArray(claims.permissions) ||
      typeof claims.defaultRedirect !== 'string' ||
      typeof claims.expiresAt !== 'number'
    ) {
      return null
    }

    // Check expiry
    const nowSeconds = Math.floor(Date.now() / 1000)
    if (claims.expiresAt <= nowSeconds) return null

    return claims
  } catch {
    return null
  }
}

// ─── Build Claims ───────────────────────────────────────────────

export function buildAuthClaims(user: {
  id: number
  username: string
  roles: string[]
  permissions: Set<string>
  defaultRedirect: string
}): AuthClaims {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_HOURS * 3600

  return {
    userId: user.id,
    username: user.username,
    roles: user.roles,
    permissions: Array.from(user.permissions),
    defaultRedirect: user.defaultRedirect,
    expiresAt,
  }
}
