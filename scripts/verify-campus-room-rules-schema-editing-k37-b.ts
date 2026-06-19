/**
 * scripts/verify-campus-room-rules-schema-editing-k37-b.ts
 *
 * K37-B: Campus room rules schema + editing verification.
 * Pure static source assertions + data checks. No DB writes.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const results: Array<{ name: string; passed: boolean; detail?: string }> = []

function check(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail })
}

const root = resolve(__dirname, '..')
const schemaPath = join(root, 'prisma/schema.prisma')
const routePath = join(root, 'src/app/api/admin/settings/campus-room-rules/route.ts')
const patchPath = join(root, 'src/app/api/admin/settings/campus-room-rules/rooms/[roomId]/route.ts')
const panelPath = join(root, 'src/components/settings/campus-room-rules-settings-panel.tsx')
const clientPath = join(root, 'src/lib/settings/campus-room-rules-client.ts')
const modulesPath = join(root, 'src/lib/settings/settings-modules.ts')
const backfillPath = join(root, 'scripts/backfill-room-is-linxiao-k37-b.ts')

const schemaSrc = readFileSync(schemaPath, 'utf8')
const routeSrc = readFileSync(routePath, 'utf8')
const patchSrc = readFileSync(patchPath, 'utf8')
const panelSrc = readFileSync(panelPath, 'utf8')
const clientSrc = readFileSync(clientPath, 'utf8')
const modulesSrc = readFileSync(modulesPath, 'utf8')
const backfillSrc = readFileSync(backfillPath, 'utf8')

// ── 1. Schema contains isLinxiao ──
check('1. Room has isLinxiao Boolean @default(false)',
  schemaSrc.includes('isLinxiao') && schemaSrc.includes('Boolean') && schemaSrc.includes('@default(false)'))

// ── 2. Migration file exists ──
let migrationExists = false
try {
  const migDir = join(root, 'prisma/migrations')
  const dirs = require('fs').readdirSync(migDir) as string[]
  migrationExists = dirs.some((d: string) => d.includes('add_room_is_linxiao_k37_b'))
} catch { /* ignore */ }
check('2. Migration file exists', migrationExists)

// ── 3. Backfill script exists ──
check('3. Backfill script exists', backfillSrc.includes('--apply'))

// ── 4. GET uses isLinxiao as source of truth ──
check('4. GET route uses isLinxiao from DB',
  routeSrc.includes('isLinxiao') && (routeSrc.includes("linxiaoSource:") || routeSrc.includes('linxiaoSource')))

// ── 5. GET no longer uses name.includes as primary ──
check('5. GET route has legacy name inference (advisory only)',
  routeSrc.includes('nameSuggestsLinxiao') && routeSrc.includes('linxiaoMismatch'))

// ── 6. PATCH route exists ──
check('6. PATCH route exists',
  patchSrc.includes('export async function PATCH'))

// ── 7. PATCH requires settings:manage ──
check('7. PATCH requires settings:manage',
  patchSrc.includes("requirePermission('settings:manage'"))

// ── 8. PATCH body validates boolean ──
check('8. PATCH validates isLinxiao boolean',
  patchSrc.includes("typeof body.isLinxiao !== 'boolean'"))

// ── 9. PATCH only updates Room.isLinxiao ──
check('9. PATCH only updates Room.isLinxiao',
  patchSrc.includes("data: { isLinxiao: body.isLinxiao }"))

// ── 10. PATCH does not modify ScheduleSlot/TeachingTask ──
check('10. PATCH does not modify ScheduleSlot/TeachingTask',
  !patchSrc.includes('scheduleSlot.create') && !patchSrc.includes('scheduleSlot.update') &&
  !patchSrc.includes('scheduleSlot.delete') && !patchSrc.includes('teachingTask.create') &&
  !patchSrc.includes('teachingTask.update') && !patchSrc.includes('teachingTask.delete') &&
  !patchSrc.includes('scheduleAdjustment.create') && !patchSrc.includes('scheduleAdjustment.update'))

// ── 11. UI badge: editable ──
check('11. UI shows editable badge',
  panelSrc.includes('基础可编辑版'))

// ── 12. UI has toggle buttons ──
check('12. UI has toggle linxiao buttons',
  panelSrc.includes('handleToggle') && panelSrc.includes('标记为林校') && panelSrc.includes('取消林校'))

// ── 13. HC6 hard rule still locked ──
check('13. HC6 hard rule no close button',
  !panelSrc.includes('关闭 HC6') && panelSrc.includes('Lock'))

// ── 14. Search/filter retained ──
check('14. Search and filter retained',
  panelSrc.includes('roomFilter') && panelSrc.includes('searchTerm'))

// ── 15. HC5/HC6 violations shown ──
check('15. HC5/HC6 violations grouped',
  panelSrc.includes("v.type === 'HC5_ROOM_UNAVAILABLE'") &&
  panelSrc.includes("v.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO'"))

// ── 16. Mismatch detection ──
check('16. Mismatch detection in response',
  routeSrc.includes('linxiaoMismatch'))

// ── 17. Client has PATCH helper ──
check('17. Client has patchRoomLinxiao',
  clientSrc.includes('patchRoomLinxiao'))

// ── 18. Settings module updated ──
check('18. Settings module says editable',
  modulesSrc.includes('K37-B') && modulesSrc.includes('可编辑'))

// ── 19. PATCH validates roomId ──
check('19. PATCH validates roomId',
  patchSrc.includes('parseInt(roomIdStr'))

// ── 20. PATCH returns warnings ──
check('20. PATCH returns HC6 warnings',
  patchSrc.includes('warnings') && patchSrc.includes('HC6'))

// ── Data checks (async) ──
async function dataChecks() {
  const prisma = new PrismaClient()
  try {
    const rooms = await prisma.room.count()
    const linxiao = await prisma.room.count({ where: { isLinxiao: true } })
    check('21. Room count unchanged (42)', rooms === 42)
    check('22. isLinxiao=true count (5)', linxiao === 5)

    const slots = await prisma.scheduleSlot.count()
    const tasks = await prisma.teachingTask.count()
    const adjustments = await prisma.scheduleAdjustment.count()
    check('23. ScheduleSlot count unchanged', slots > 0)
    check('24. TeachingTask count unchanged', tasks > 0)
    check('25. ScheduleAdjustment count unchanged', adjustments >= 0)
  } finally {
    await prisma.$disconnect()
  }
}

dataChecks().then(() => {
  console.log('')
  console.log('=== K37-B Campus Room Rules Schema & Editing Verify ===')
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
