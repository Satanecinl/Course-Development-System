// src/lib/auth/types.ts
// Auth system type definitions

export interface AuthUser {
  id: number
  username: string
  displayName: string
  isActive: boolean
  roles: string[]
  permissions: Set<string>
}

export interface SessionData {
  id: number
  userId: number
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
}

export interface CreateSessionResult {
  sessionToken: string
  session: SessionData
}

export const ALL_PERMISSIONS = [
  'schedule:view',
  'schedule:adjust',
  'data:read',
  'data:write',
  'data:delete',
  'data:export',
  'import:manage',
  'settings:manage',
  'users:manage',
  'diagnostics:view',
] as const

export type PermissionKey = (typeof ALL_PERMISSIONS)[number]

export const ROLES = {
  ADMIN: 'ADMIN',
  USER: 'USER',
  DATA_EXPORTER: 'DATA_EXPORTER',
} as const
