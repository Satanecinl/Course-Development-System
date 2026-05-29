import { PrismaClient } from '@prisma/client'
import { createSession } from '../src/lib/auth/session'
import { SESSION_COOKIE_NAME } from '../src/lib/auth/constants'

const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.findUnique({ where: { username: 'admin' } })
  if (!user) { console.error('No admin user'); return }
  const { sessionToken } = await createSession(user.id)
  console.log(SESSION_COOKIE_NAME + '=' + sessionToken)
  await prisma.$disconnect()
}

main()
