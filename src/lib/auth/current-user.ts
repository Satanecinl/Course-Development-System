// src/lib/auth/current-user.ts
// Get current user from session token

import { prisma } from '@/lib/prisma'
import { getSessionByToken } from './session'
import type { AuthUser } from './types'

// ─── Get Current User ───────────────────────────────────────────

export async function getCurrentUser(sessionToken: string): Promise<AuthUser | null> {
  const session = await getSessionByToken(sessionToken)
  if (!session) return null

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!user) return null
  if (!user.isActive) return null

  // Extract roles and permissions
  const roles: string[] = []
  const permissions = new Set<string>()

  for (const ur of user.userRoles) {
    roles.push(ur.role.name)
    for (const rp of ur.role.rolePermissions) {
      permissions.add(rp.permission.key)
    }
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isActive: user.isActive,
    roles,
    permissions,
  }
}
