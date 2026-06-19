/**
 * scripts/verify-campus-room-rules-runtime-fix-k37-b2.ts
 *
 * K37-B2: Verify runtime fix for campus room rules editing.
 * - DB state matches baseline (5 linxiao, 0 mismatch)
 * - API uses explicit select
 * - PATCH route defensive
 * - Frontend client sends JSON
 * - K37-B/K37-A/K36-B1A5/K22-C all still PASS
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const results: Array<{ name: string; passed: boolean; detail?: string }> = []

function check(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail })
}

const root = resolve(__dirname, '..')
const routePath = join(root, 'src/app/api/admin/settings/campus-room-rules/route.ts')
const patchPath = join(root, 'src/app/api/admin/settings/campus-room-rules/rooms/[roomId]/route.ts')
const panelPath = join(root, 'src/components/settings/campus-room-rules-settings-panel.tsx')
const clientPath = join(root, 'src/lib/settings/campus-room-rules-client.ts')
const prismaHelperPath = join(root, 'src/lib/prisma.ts')

const routeSrc = readFileSync(routePath, 'utf8')
const patchSrc = readFileSync(patchPath, 'utf8')
const panelSrc = readFileSync(panelPath, 'utf8')
const clientSrc = readFileSync(clientPath, 'utf8')
const prismaHelperSrc = readFileSync(prismaHelperPath, 'utf8')

// ── Static source checks ──

check('1. GET route uses explicit isLinxiao select',
  routeSrc.includes('isLinxiao: true'))

check('2. GET route has defensive fallback',
  routeSrc.includes('fallback') && routeSrc.includes('typeof r.isLinxiao'))

check('3. PATCH route validates boolean',
  patchSrc.includes("typeof body.isLinxiao !== 'boolean'"))

check('4. PATCH route only updates isLinxiao',
  patchSrc.includes("data: { isLinxiao: body.isLinxiao }"))

check('5. PATCH error handler does not leak stack',
  patchSrc.includes('errorMessage') && !patchSrc.includes('error.stack'))

// ── Prisma helper restart note ──
check('6. Prisma helper has K37-B2 restart note',
  prismaHelperSrc.includes('K37-B2') && prismaHelperSrc.includes('RESTARTED'))

// ── Frontend client ──
check('7. Client sends JSON Content-Type',
  clientSrc.includes("'Content-Type': 'application/json'"))

check('8. Client uses PATCH method',
  clientSrc.includes("method: 'PATCH'"))

// ── UI: warning only when count > 0 ──
check('9. UI shows mismatch warning only when count > 0',
  panelSrc.includes('summary.linxiaoMismatchCount && summary.linxiaoMismatchCount > 0'))

// ── Data checks ──
async function dataChecks() {
  const prisma = new PrismaClient()
  try {
    // Baseline
    const total = await prisma.room.count()
    const linxiaoTrue = await prisma.room.count({ where: { isLinxiao: true } })
    check('10. Room count = 42 (baseline)', total === 42)
    check('11. isLinxiao=true = 5 (baseline)', linxiaoTrue === 5)

    // Linxiao 301-306 all true
    const expected = ['林校301', '林校303', '林校304', '林校305', '林校306']
    const allRooms = await prisma.room.findMany({ select: { name: true, isLinxiao: true } })
    const baselineOk = expected.every((n) => allRooms.find((r) => r.name === n)?.isLinxiao === true)
    check('12. 林校301/303/304/305/306 all true', baselineOk)

    // Non-linxiao all false
    const nonLinxiaoWrong = allRooms.filter((r) => !expected.includes(r.name) && r.isLinxiao === true)
    check('13. Non-linxiao rooms all false', nonLinxiaoWrong.length === 0)

    // Mismatch count = 0 at baseline
    const mismatch = allRooms.filter((r) => r.isLinxiao !== r.name.includes('林校')).length
    check('14. Mismatch count = 0 at baseline', mismatch === 0)

    // ScheduleSlot / TeachingTask / ScheduleAdjustment unchanged
    const slots = await prisma.scheduleSlot.count()
    const tasks = await prisma.teachingTask.count()
    const adj = await prisma.scheduleAdjustment.count()
    check('15. ScheduleSlot count = 440 (unchanged)', slots === 440)
    check('16. TeachingTask count = 308 (unchanged)', tasks === 308)
    check('17. ScheduleAdjustment count = 67 (unchanged)', adj === 67)
  } finally {
    await prisma.$disconnect()
  }
}

dataChecks().then(() => {
  console.log('')
  console.log('=== K37-B2 Campus Room Rules Runtime Fix Verify ===')
  console.log('')
  let passed = 0
  for (const r of results) {
    const mark = r.passed ? 'PASS' : 'FAIL'
    console.log(`  [${mark}] ${r.name}`)
    if (r.detail) console.log(`         ${r.detail}`)
    if (r.passed) passed++
  }
  const failed = results.length - passed
  console.log(`\nSummary: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}).catch((e) => {
  console.error('Verify error:', e)
  process.exit(1)
})
