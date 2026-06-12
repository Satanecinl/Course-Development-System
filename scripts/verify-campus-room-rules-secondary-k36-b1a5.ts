/**
 * K36-B1A5 campus room rules secondary room verification.
 *
 * Pure static source assertions on the campus-room-rules route.
 * No Prisma client, no database writes, no scheduler/adjustment execution.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

interface CheckResult {
  name: string
  passed: boolean
  detail?: string
}

const results: CheckResult[] = []

function check(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail })
}

const root = resolve(__dirname, '..')
const routePath = join(root, 'src/app/api/admin/settings/campus-room-rules/route.ts')
const routeSrc = readFileSync(routePath, 'utf8')

// ── 1. HC5 primary unavailable room is covered ──
check(
  'HC5 queries primary room (roomId: ua.roomId)',
  routeSrc.includes('roomId: ua.roomId'),
)

// ── 2. HC5 secondary unavailable room is covered ──
check(
  'HC5 queries secondary rooms via additionalRooms.some.roomId',
  routeSrc.includes('additionalRooms: { some: { roomId: ua.roomId } }'),
)

// ── 3. HC5 primary + secondary duplicate dedup ──
check(
  'HC5 uses seenHc5Slots Set for deduplication',
  routeSrc.includes('seenHc5Slots') && routeSrc.includes('if (seenHc5Slots.has(slot.id)) continue'),
)

// ── 4. HC6 primary linxiao violation is covered ──
check(
  'HC6 queries primary room (roomId: { in: linxiaoIds })',
  routeSrc.includes("roomId: { in: linxiaoIds }"),
)

// ── 5. HC6 secondary linxiao violation is covered ──
check(
  'HC6 queries secondary rooms via additionalRooms.some.roomId in linxiaoIds',
  routeSrc.includes('additionalRooms: { some: { roomId: { in: linxiaoIds } } }'),
)

// ── 6. HC6 multiple secondary duplicate slot dedup ──
check(
  'HC6 uses seenHc6Slots Set for deduplication',
  routeSrc.includes('seenHc6Slots') && routeSrc.includes('if (seenHc6Slots.has(slot.id)) continue'),
)

// ── 7. Cross-semester not mixed in (semesterId: 1 remains in queries) ──
check(
  'HC5 query scopes to semesterId',
  /HC5[\s\S]*semesterId:\s*1/.test(routeSrc),
)
check(
  'HC6 query scopes to semesterId',
  /HC6[\s\S]*semesterId:\s*1/.test(routeSrc),
)

// ── 8. Response shape backward compatible ──
check(
  'Response has hc5ViolationCount field',
  routeSrc.includes('hc5ViolationCount'),
)
check(
  'Response has hc6ViolationCount field',
  routeSrc.includes('hc6ViolationCount'),
)
check(
  'Response has violations array',
  routeSrc.includes('violations'),
)
check(
  'Response has summary.totalRooms',
  routeSrc.includes('totalRooms'),
)

// ── 9. Permission unchanged ──
check(
  'Permission check is settings:manage',
  routeSrc.includes("requirePermission('settings:manage'"),
)

// ── 10. No scheduler/adjustment/WorkTime modifications ──
check(
  'Route does not import scheduler score modification',
  !routeSrc.includes('calculateScoreWithDetails') && !routeSrc.includes('calculateDeltaScore'),
)
check(
  'Route does not reference adjustments',
  !routeSrc.includes('ScheduleAdjustment') && !routeSrc.includes('adjustment'),
)
check(
  'Route does not reference WorkTime',
  !routeSrc.includes('WorkTime') && !routeSrc.includes('worktime'),
)

// ── Static: route is read-only ──
check(
  'Route has no database writes',
  !/\bprisma\.\w+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/.test(routeSrc),
)

// ── Static: secondary rooms loaded in HC6 include ──
check(
  'HC6 include loads additionalRooms with room',
  routeSrc.includes('additionalRooms: { include: { room: true } }'),
)

// ── Static: effectiveLinxiaoRoomNames computed for HC6 ──
check(
  'HC6 computes effectiveLinxiaoRoomNames from primary + secondary',
  routeSrc.includes('effectiveLinxiaoRoomNames'),
)

console.log('\n=== K36-B1A5 Campus Room Rules Secondary Room Verification ===\n')

let passed = 0
for (const result of results) {
  console.log(`  [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}`)
  if (result.detail) console.log(`         ${result.detail}`)
  if (result.passed) passed++
}

const failed = results.length - passed
console.log(`\nSummary: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  process.exit(1)
}
