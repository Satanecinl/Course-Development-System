// src/lib/auth/session.ts
// Session management: create, get, revoke

import { prisma } from '@/lib/prisma'
import {
  generateSessionToken,
  hashSessionToken,
} from './crypto'
import { SESSION_DURATION_HOURS } from './constants'
import type { CreateSessionResult, SessionData } from './types'

// ─── Create Session ─────────────────────────────────────────────

export async function createSession(userId: number): Promise<CreateSessionResult> {
  const sessionToken = generateSessionToken()
  const tokenHash = hashSessionToken(sessionToken)

  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + SESSION_DURATION_HOURS)

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  })

  return {
    sessionToken,
    session: {
      id: session.id,
      userId: session.userId,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    },
  }
}

// ─── Get Session by Token ───────────────────────────────────────

export async function getSessionByToken(
  token: string
): Promise<SessionData | null> {
  const tokenHash = hashSessionToken(token)

  const session = await prisma.session.findUnique({
    where: { tokenHash },
  })

  if (!session) return null

  // Check if revoked
  if (session.revokedAt) return null

  // Check if expired
  if (session.expiresAt < new Date()) return null

  return {
    id: session.id,
    userId: session.userId,
    tokenHash: session.tokenHash,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
  }
}

// ─── Revoke Session ─────────────────────────────────────────────

export async function revokeSession(sessionId: number): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  })
}

export async function revokeSessionByToken(token: string): Promise<boolean> {
  const tokenHash = hashSessionToken(token)

  const session = await prisma.session.findUnique({
    where: { tokenHash },
  })

  if (!session) return false

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  })

  return true
}

// ─── Cleanup Expired Sessions ───────────────────────────────────

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null } },
      ],
    },
  })

  return result.count
}
