/**
 * K36-B1A1 multi-room conflict service verification.
 *
 * Pure in-memory checks plus static source assertions. No Prisma client,
 * database writes, adjustment execution, import, apply, or rollback.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  checkOccupancyConflicts,
  findRoomConflictId,
  getEffectiveRoomIds,
  type ScheduleConflictCandidate,
  type ScheduleConflictOccupancy,
} from '../src/lib/schedule/conflict-rules'

interface CheckResult {
  name: string
  passed: boolean
  detail?: string
}

const results: CheckResult[] = []

function check(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail })
}

const baseCandidate: ScheduleConflictCandidate = {
  teacherId: 10,
  classGroupIds: [100],
  roomId: 1,
  dayOfWeek: 1,
  slotIndex: 1,
  weeks: [1, 2, 3],
  semesterId: 1,
}

const baseOccupancy: ScheduleConflictOccupancy = {
  id: 20,
  teachingTaskId: 30,
  teacherId: 11,
  classGroupIds: [101],
  roomId: 2,
  dayOfWeek: 1,
  slotIndex: 1,
  weekConstraint: { start: 1, end: 16, type: 'ALL' },
  semesterId: 1,
}

function roomMatches(
  candidate: ScheduleConflictCandidate,
  occupancy: ScheduleConflictOccupancy,
) {
  return checkOccupancyConflicts(candidate, occupancy).filter((match) => match.type === 'room')
}

check(
  'primary-primary conflict',
  roomMatches({ ...baseCandidate, roomId: 5 }, { ...baseOccupancy, roomId: 5 }).length === 1,
)

check(
  'primary candidate vs existing secondary',
  roomMatches(
    { ...baseCandidate, roomId: 5 },
    { ...baseOccupancy, roomId: 6, additionalRoomIds: [5] },
  ).length === 1,
)

check(
  'secondary candidate vs existing primary',
  roomMatches(
    { ...baseCandidate, roomId: 6, additionalRoomIds: [5] },
    { ...baseOccupancy, roomId: 5 },
  ).length === 1,
)

check(
  'secondary-secondary conflict',
  roomMatches(
    { ...baseCandidate, roomId: 6, additionalRoomIds: [5] },
    { ...baseOccupancy, roomId: 7, additionalRoomIds: [5] },
  ).length === 1,
)

const duplicatePrimarySecondary = roomMatches(
  { ...baseCandidate, roomId: 5, additionalRoomIds: [5, 5] },
  { ...baseOccupancy, roomId: 5, additionalRoomIds: [5] },
)
check(
  'duplicate primary-secondary emits one room conflict',
  duplicatePrimarySecondary.length === 1 && duplicatePrimarySecondary[0].roomId === 5,
)

const dedupedAdditionalRooms = getEffectiveRoomIds({
  roomId: 5,
  additionalRoomIds: [6, 6, 7, 7],
})
check(
  'duplicate additional rooms are deduplicated',
  dedupedAdditionalRooms.size === 3 &&
    dedupedAdditionalRooms.has(5) &&
    dedupedAdditionalRooms.has(6) &&
    dedupedAdditionalRooms.has(7),
)

check(
  'cross-semester same room and time does not conflict',
  roomMatches(
    { ...baseCandidate, roomId: 5, semesterId: 1 },
    { ...baseOccupancy, roomId: 5, semesterId: 2 },
  ).length === 0,
)

check(
  'no-room slot does not produce room conflict',
  findRoomConflictId(
    { ...baseCandidate, roomId: null, additionalRoomIds: [] },
    { ...baseOccupancy, roomId: null, additionalRoomIds: [] },
  ) === null,
)

const identityMatches = checkOccupancyConflicts(
  {
    ...baseCandidate,
    roomId: 8,
    teacherId: 42,
    classGroupIds: [420],
  },
  {
    ...baseOccupancy,
    roomId: 9,
    teacherId: 42,
    classGroupIds: [420],
  },
)
check(
  'teacher and class conflicts remain unaffected',
  identityMatches.some((match) => match.type === 'teacher') &&
    identityMatches.some((match) => match.type === 'classGroup') &&
    !identityMatches.some((match) => match.type === 'room'),
)

check(
  'legacy primary-only call remains compatible',
  roomMatches(
    { ...baseCandidate, roomId: 12, additionalRoomIds: undefined },
    { ...baseOccupancy, roomId: 12, additionalRoomIds: undefined },
  ).length === 1,
)

check(
  'exclude self prevents all conflicts',
  checkOccupancyConflicts(
    { ...baseCandidate, roomId: 5, excludeOccupancyId: 20 },
    { ...baseOccupancy, id: 20, roomId: 5 },
  ).length === 0,
)

const root = resolve(__dirname, '..')
const conflictCheckSource = readFileSync(
  join(root, 'src/lib/schedule/conflict-check.ts'),
  'utf8',
)
check(
  'conflict-check loads existing additional rooms',
  /additionalRooms:\s*\{\s*select:\s*\{\s*roomId:\s*true\s*\}/s.test(conflictCheckSource),
)
check(
  'conflict-check keeps semester query scope',
  conflictCheckSource.includes('timeWhere.semesterId = input.semesterId'),
)
check(
  'conflict-check remains read-only',
  !/\bprisma\.\w+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/.test(
    conflictCheckSource,
  ),
)

console.log('\n=== K36-B1A1 Multi-room Conflict Service Verification ===\n')

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
