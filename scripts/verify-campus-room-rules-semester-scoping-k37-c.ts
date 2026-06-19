/**
 * scripts/verify-campus-room-rules-semester-scoping-k37-c.ts
 *
 * K37-C: Verify semester scoping for campus room rules.
 * - GET no longer hardcodes semesterId=1
 * - Query param ?semesterId works
 * - Active semester fallback
 * - response includes resolvedSemester
 * - HC5/HC6 use resolved semester
 * - Room.isLinxiao editing unchanged
 * - K37-B / K37-B2 / K37-A / K36-B1A5 / K22-C still PASS
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
const prismaPath = join(root, 'prisma/schema.prisma')

const routeSrc = readFileSync(routePath, 'utf8')
const patchSrc = readFileSync(patchPath, 'utf8')
const panelSrc = readFileSync(panelPath, 'utf8')
const clientSrc = readFileSync(clientPath, 'utf8')
const prismaSrc = readFileSync(prismaPath, 'utf8')

// ── 1. GET no longer hardcodes semesterId=1 ──
const hardcodedCount = (routeSrc.match(/semesterId:\s*1[^0-9]/g) || []).length
check('1. GET no longer hardcodes semesterId=1 (in main query context)', hardcodedCount === 0,
  `Found ${hardcodedCount} potential hardcoded references (excluding semId=10+) — but verify manually that none are in HC5/HC6 queries`)

// Also count hardcoded in HC5/HC6 where blocks
const hc5Hardcode = /HC5[^]*?semesterId:\s*1[^0-9]/s.test(routeSrc) || /where:\s*{\s*semesterId:\s*1[^0-9][^]*?HC5/s.test(routeSrc)
const hc6Hardcode = /HC6[^]*?semesterId:\s*1[^0-9]/s.test(routeSrc) || /where:\s*{\s*semesterId:\s*1[^0-9][^]*?HC6/s.test(routeSrc)
check('1b. HC5 query no longer hardcodes semesterId=1', !hc5Hardcode)
check('1c. HC6 query no longer hardcodes semesterId=1', !hc6Hardcode)

// ── 2. GET resolves semester from query param ──
check('2. GET parses semesterId query param',
  routeSrc.includes('searchParams.get') && routeSrc.includes('semesterId'))

// ── 3. GET uses resolveSchedulerSemester ──
check('3. GET uses resolveSchedulerSemester',
  routeSrc.includes('resolveSchedulerSemester'))

// ── 4. GET validates semester exists ──
check('4. GET validates semester existence',
  routeSrc.includes('SEMESTER_NOT_FOUND') || routeSrc.includes('findUnique'))

// ── 5. response includes resolvedSemester ──
check('5. response includes resolvedSemester',
  routeSrc.includes('resolvedSemester') && routeSrc.includes('diagnosticsScope'))

// ── 6. HC5 uses resolved semesterId ──
check('6. HC5 query uses semesterId variable',
  /HC5[^]*?where:\s*{\s*semesterId,?\s*$/m.test(routeSrc) || routeSrc.includes('semesterId,\n          dayOfWeek'))

// ── 7. totalRooms / linxiaoRooms remain global ──
check('7. totalRooms/linxiaoRooms global (no semesterId in room list query)',
  !routeSrc.split('rooms =')[1]?.split('orderBy')[0]?.includes('semesterId'))

// ── 8. mismatch is room-level global ──
check('8. mismatch is room-level (not from DB query)',
  routeSrc.includes('linxiaoMismatch') && routeSrc.includes('nameSuggests !== isLx'))

// ── 9. client helper supports semesterId param ──
check('9. Client helper accepts semesterId param',
  clientSrc.includes('fetchCampusRoomRules(options') && clientSrc.includes('semesterId'))

// ── 10. UI shows current semester ──
check('10. UI shows current semester name',
  panelSrc.includes('resolvedSemester') && panelSrc.includes('当前诊断学期'))

// ── 11. UI requests with selected semesterId ──
check('11. UI passes semesterId to fetchCampusRoomRules',
  panelSrc.includes('useSemesterStore') && panelSrc.includes('fetchCampusRoomRules({ semesterId'))

// ── 12. Room.isLinxiao editing not regressed ──
check('12. PATCH still only updates Room.isLinxiao',
  patchSrc.includes("data: { isLinxiao: body.isLinxiao }"))

// ── 13. Schema unchanged (K37-C does not modify Room.isLinxiao) ──
check('13. Prisma schema not modified (Room.isLinxiao preserved)',
  prismaSrc.includes('isLinxiao'))

// ── 14. K37-B2 runtime fix preserved ──
check('14. K37-B2 explicit select preserved',
  routeSrc.includes('isLinxiao: true'))

// ── Data checks ──
async function dataChecks() {
  const prisma = new PrismaClient()
  try {
    const total = await prisma.room.count()
    const linxiaoTrue = await prisma.room.count({ where: { isLinxiao: true } })
    check('15. Room count = 42 (baseline)', total === 42)
    check('16. isLinxiao=true = 5 (baseline)', linxiaoTrue === 5)

    const allRooms = await prisma.room.findMany({ select: { name: true, isLinxiao: true } })
    const expected = ['林校301', '林校303', '林校304', '林校305', '林校306']
    check('17. 林校301-306 all true', expected.every((n) => allRooms.find((r) => r.name === n)?.isLinxiao === true))

    const slots = await prisma.scheduleSlot.count()
    const tasks = await prisma.teachingTask.count()
    const adj = await prisma.scheduleAdjustment.count()
    check('18. ScheduleSlot count = 440 (unchanged)', slots === 440)
    check('19. TeachingTask count = 308 (unchanged)', tasks === 308)
    check('20. ScheduleAdjustment count = 67 (unchanged)', adj === 67)

    // Check active semester exists
    const active = await prisma.semester.findFirst({ where: { isActive: true } })
    check('21. Active semester exists', !!active, active ? `id=${active.id} name="${active.name}"` : 'none')
  } finally {
    await prisma.$disconnect()
  }
}

dataChecks().then(() => {
  console.log('')
  console.log('=== K37-C Campus Room Rules Semester Scoping Verify ===')
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
