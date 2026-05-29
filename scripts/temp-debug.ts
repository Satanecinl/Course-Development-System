import { PrismaClient } from '@prisma/client'
import { createSession } from '../src/lib/auth/session'
import { getCurrentUser } from '../src/lib/auth/current-user'
import { SESSION_COOKIE_NAME } from '../src/lib/auth/constants'

const prisma = new PrismaClient()

async function main() {
  // Check sessions
  const sessions = await prisma.session.findMany({ take: 3, orderBy: { id: 'desc' } })
  console.log('Sessions count:', sessions.length)
  for (const s of sessions) {
    console.log(`  id=${s.id} userId=${s.userId} revokedAt=${s.revokedAt} expiresAt=${s.expiresAt}`)
  }

  // Create a fresh session
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } })
  if (!admin) { console.log('No admin user'); return }

  const { sessionToken } = await createSession(admin.id)
  const cookie = SESSION_COOKIE_NAME + '=' + sessionToken
  console.log('\nCookie:', cookie)

  // Test getCurrentUser directly
  const user = await getCurrentUser(sessionToken)
  console.log('\ngetCurrentUser result:', user ? `id=${user.id} username=${user.username} perms=${user.permissions.size}` : 'null')

  // Test fetch
  const res = await fetch('http://localhost:3000/api/rooms', {
    headers: { Cookie: cookie },
  })
  console.log('\nFetch status:', res.status)
  const body = await res.text()
  console.log('Fetch body:', body.substring(0, 200))

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); prisma.$disconnect().then(() => process.exit(1)) })
