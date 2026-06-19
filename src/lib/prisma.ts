import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// K37-B2: Note — when Prisma schema changes (e.g. new column added via
// migration), the dev server must be RESTARTED to pick up the new client.
// Hot-reload does NOT regenerate the Prisma client. If `isLinxiao` returns
// undefined or queries fail unexpectedly, restart `npm run dev`.