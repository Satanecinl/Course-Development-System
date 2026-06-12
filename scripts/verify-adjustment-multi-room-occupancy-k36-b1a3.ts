/**
 * K36-B1A3 adjustment/recommendation multi-room verification.
 *
 * Pure fixture and static source checks only. No Prisma client, database
 * writes, real adjustment apply, rollback, import, scheduler apply, or seed.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { findAdjustmentRoomConflict } from '../src/lib/schedule/adjustments'
import {
  checkOccupancyConflicts,
  type ScheduleConflictCandidate,
  type ScheduleConflictOccupancy,
} from '../src/lib/schedule/conflict-rules'

interface Result {
  name: string
  passed: boolean
  detail: string
}

const results: Result[] = []

function check(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail })
}

const candidate: ScheduleConflictCandidate = {
  teachingTaskId: 1,
  teacherId: 101,
  classGroupIds: [201],
  roomId: 10,
  additionalRoomIds: [20],
  semesterId: 1,
  dayOfWeek: 1,
  slotIndex: 1,
  weeks: [1],
  excludeOccupancyId: 1,
}

const occupancy: ScheduleConflictOccupancy = {
  id: 2,
  teachingTaskId: 2,
  teacherId: 102,
  classGroupIds: [202],
  roomId: 30,
  additionalRoomIds: [40],
  semesterId: 1,
  dayOfWeek: 1,
  slotIndex: 1,
  weekConstraint: { start: 1, end: 16, type: 'ALL' },
}

function conflicts(
  candidateOverride: Partial<ScheduleConflictCandidate>,
  occupancyOverride: Partial<ScheduleConflictOccupancy>,
) {
  return findAdjustmentRoomConflict(
    { ...candidate, ...candidateOverride },
    [{ ...occupancy, ...occupancyOverride }],
  )
}

check(
  'target primary vs existing primary',
  conflicts({ roomId: 10, additionalRoomIds: [] }, { roomId: 10, additionalRoomIds: [] })?.id === 2,
  'room-set intersection detected',
)
check(
  'target primary vs existing secondary',
  conflicts({ roomId: 10, additionalRoomIds: [] }, { roomId: 30, additionalRoomIds: [10] })?.id === 2,
  'existing secondary detected',
)
check(
  'retained secondary vs existing primary',
  conflicts({ roomId: 10, additionalRoomIds: [20] }, { roomId: 20, additionalRoomIds: [] })?.id === 2,
  'retained secondary detected',
)
check(
  'retained secondary vs existing secondary',
  conflicts({ roomId: 10, additionalRoomIds: [20] }, { roomId: 30, additionalRoomIds: [20] })?.id === 2,
  'secondary-secondary detected',
)
check(
  'exclude-self',
  conflicts({ excludeOccupancyId: 2 }, { id: 2, roomId: 10 }) == null,
  'self occupancy excluded',
)
check(
  'cross-week self occupancy remains detectable',
  conflicts({ excludeOccupancyId: null, roomId: 10 }, { id: 1, roomId: 10 })?.id === 1,
  'source recurrence remains occupied in target week',
)
check(
  'cross-semester',
  conflicts({ semesterId: 1 }, { semesterId: 2, roomId: 10 }) == null,
  'different semester ignored',
)

const noRoomMatches = checkOccupancyConflicts(
  {
    ...candidate,
    roomId: null,
    additionalRoomIds: [],
    teacherId: 999,
    classGroupIds: [999],
  },
  {
    ...occupancy,
    roomId: null,
    additionalRoomIds: [],
    teacherId: 999,
    classGroupIds: [999],
  },
)
check(
  'no-room keeps teacher/class conflicts',
  !noRoomMatches.some((match) => match.type === 'room') &&
    noRoomMatches.some((match) => match.type === 'teacher') &&
    noRoomMatches.some((match) => match.type === 'classGroup'),
  `matches=${noRoomMatches.map((match) => match.type).join(',')}`,
)
check(
  'duplicate primary/secondary is deduplicated',
  conflicts(
    { roomId: 10, additionalRoomIds: [10, 10, 20, 20] },
    { roomId: 30, additionalRoomIds: [10, 10] },
  )?.id === 2,
  'single occupancy match returned',
)
check(
  'legacy primary-only behavior',
  conflicts(
    { roomId: 10, additionalRoomIds: undefined },
    { roomId: 10, additionalRoomIds: undefined },
  )?.id === 2,
  'primary-only intersection detected',
)

const root = resolve(__dirname, '..')
const adjustments = readFileSync(join(root, 'src/lib/schedule/adjustments.ts'), 'utf8')
const roomRecommendations = readFileSync(
  join(root, 'src/lib/schedule/room-recommendations.ts'),
  'utf8',
)
const planRecommendations = readFileSync(
  join(root, 'src/lib/schedule/adjustment-plan-recommendations.ts'),
  'utf8',
)
const requestService = readFileSync(
  join(root, 'src/lib/schedule/adjustment-request-service.ts'),
  'utf8',
)

check(
  'dry-run retains source secondary rooms',
  adjustments.includes('retainedAdditionalRoomIds') &&
    adjustments.includes('additionalRoomIds: item.additionalRoomIds ?? []'),
  'adjustment occupancy carries secondary rooms',
)
check(
  'direct create reuses dry-run guard',
  /createScheduleAdjustment[\s\S]*dryRunScheduleAdjustment\(input\)/.test(adjustments),
  'direct create guarded',
)
check(
  'request submit and approval reuse dry-run guard',
  (requestService.match(/dryRunScheduleAdjustment\(dryRunInput\)/g) ?? []).length >= 2,
  'submit and approve guarded',
)
check(
  'room recommendation passes retained secondary rooms',
  roomRecommendations.includes('targetAdditionalRoomIds: retainedAdditionalRoomIds'),
  'room candidates use effective room set',
)
check(
  'plan recommendation propagates retained secondary rooms',
  planRecommendations.includes('retainedAdditionalRoomIds: slot.additionalRooms.map'),
  'plan delegates retained rooms',
)

console.log('\n=== K36-B1A3 Adjustment Multi-room Occupancy Verification ===\n')
for (const result of results) {
  console.log(`  [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}: ${result.detail}`)
}

const failed = results.filter((result) => !result.passed).length
console.log(`\nSummary: ${results.length - failed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
