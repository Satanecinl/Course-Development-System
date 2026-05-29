// src/lib/auth/claims-edge.ts
// Edge Runtime safe claims — uses Web Crypto API (no node:crypto, no Buffer)
// Compatible with cookies signed by claims.ts (Node.js)

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

// ─── Base64URL helpers (no Buffer) ──────────────────────────────

function base64urlEncode(data: string): string {
  // btoa only handles latin1; encode UTF-8 first
  const encoded = encodeURIComponent(data).replace(
    /%([0-9A-F]{2})/g,
    (_, p1) => String.fromCharCode(parseInt(p1, 16))
  )
  return btoa(encoded)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64urlDecode(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded)
  // Decode UTF-8
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function base64urlToBytes(data: string): Uint8Array {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function bytesToBase64url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ─── HMAC via Web Crypto ────────────────────────────────────────

async function hmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

async function signPayload(payload: string): Promise<string> {
  const secret = getCookieSecret()
  const key = await hmacKey(secret)
  const encoder = new TextEncoder()
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return bytesToBase64url(sig)
}

// ─── Sign / Verify ──────────────────────────────────────────────

/**
 * Create a signed auth claims cookie value.
 * Format: base64url(json).base64url(hmac)
 * Compatible with claims.ts (Node.js) signatures.
 */
export async function signAuthClaims(claims: AuthClaims): Promise<string> {
  const json = JSON.stringify(claims)
  const payload = base64urlEncode(json)
  const signature = await signPayload(payload)
  return `${payload}.${signature}`
}

/**
 * Verify and parse an auth claims cookie value.
 * Returns null if invalid, tampered, or expired.
 * Compatible with cookies signed by claims.ts (Node.js).
 */
export async function verifyAuthClaims(
  cookieValue: string
): Promise<AuthClaims | null> {
  try {
    const parts = cookieValue.split('.')
    if (parts.length !== 2) return null

    const [payload, signature] = parts

    // Verify signature
    const expectedSig = await signPayload(payload)
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
