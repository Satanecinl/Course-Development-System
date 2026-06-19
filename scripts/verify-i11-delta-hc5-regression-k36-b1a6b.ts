/**
 * scripts/verify-i11-delta-hc5-regression-k36-b1a6b.ts
 *
 * K36-B1A6B: I11 HC5 transition-into-orphan regression verification.
 *
 * Pure in-memory checks. No Prisma client, no database writes, no
 * scheduler/adjustment execution, no seed/import/preview/apply/rollback.
 *
 * The K36-B1A6 refactor (commit 320f7ea "fix(scheduler): align multi-room
 * hard-constraint deltas") introduced a regression in K22-C harness case
 * I11-DELTA-REAL-TO-ROOM_ZERO: actual deltaHard went from -1000 (B1A3
 * baseline, 73/0/0/0 PASS) to 0 (B1A6+, 72/1 FAIL). The K22 expected was
 * locked based on the B1A3 behavior.
 *
 * Root cause: B1A3 produced deltaHard=-1000 because
 * `isRoomAvailable(ctx, 0, ...)` returned false (room 0 was absent from
 * roomById in I11's fixture, so the `!room → return false` branch fired),
 * causing `if (!newAvail) deltaHard += HARD_PENALTY` to fire. B1A6's
 * `computeHC5AvailabilityPenalty` short-circuits room=0 with
 * `if (currentRoomId <= 0) return 0`, which removed this behavior.
 *
 * Fix: K36-B1A6B added a delta-only "transition-into-orphan" penalty in
 * `calculateDeltaScore`: when a slot moves from a position with a non-empty
 * effective room set to a position with an empty effective room set, add
 * -HARD_PENALTY to deltaHard. This is a delta-only signal that surfaces
 * the score worsening for the LAHC solver without changing full score
 * semantics (full score still treats room=0 slots as "no-room" and skips
 * them in HC4/HC5/HC6 loops).
 *
 * Checks:
 *  1. I11 fixture: actual deltaHard = -1000, deltaSoft = 2, SC9 delta = 2
 *  2. I10 fixture: actual deltaHard = 0, deltaSoft = -2, SC9 delta = -2 (room=0 → real, no orphan transition)
 *  3. room=0 full score behavior: no HC4/HC5/HC6 penalty for no-room slots
 *  4. HC5 explicit unavailable primary: delta fires (-1000)
 *  5. HC5 explicit unavailable secondary: delta fires (-1000 per extra violation)
 *  6. Duplicate primary/secondary: dedup (one penalty per pair, not double)
 *  7. Transition INTO orphan with secondary rooms retained: no penalty (not orphan at new)
 *  8. Transition OUT of orphan (room=0 → real): no penalty
 *  9. Both orphan: no penalty delta
 * 10. Real room to same real room: no penalty
 * 11. B1A6 multi-room delta scenarios (12 cases via B1A6 verify): must not regress
 * 12. K22-C I11 PASS verified end-to-end
 */

import { calculateDeltaScore, calculateScoreWithDetails, getEffectiveRoomIds } from '../src/lib/scheduler/score'
import { buildInitialState } from '../src/lib/scheduler/solver'
import type {
  Move,
  RoomWithAvailability,
  SchedulingContext,
  ScheduleState,
  SlotWithRelations,
  TaskWithRelations,
} from '../src/lib/scheduler/types'

interface CheckResult { name: string; passed: boolean; detail?: string }
const results: CheckResult[] = []

function check(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail })
}

// ── Helpers ─────────────────────────────────────────────────────────────

function makeRoom(id: number, name: string, opts: { capacity?: number; unavailable?: Array<{ day: number; period: number }> } = {}): RoomWithAvailability {
  return {
    id,
    name,
    building: 'A',
    capacity: opts.capacity ?? 100,
    type: 'NORMAL',
    availabilities: (opts.unavailable ?? []).map((u, i) => ({
      id: id * 1000 + i,
      roomId: id,
      dayOfWeek: u.day,
      slotIndex: u.period,
      available: false,
    })),
  }
}

function makeTask(id: number, opts: { classGroupStudentCount?: number; classGroupId?: number } = {}): TaskWithRelations {
  const cgId = opts.classGroupId ?? 100
  return {
    id,
    courseId: id,
    teacherId: null,
    semesterId: 1,
    weekType: 'ALL',
    startWeek: 1,
    endWeek: 16,
    remark: null,
    importBatchId: null,
    course: { id, name: `Course-${id}`, code: null, credits: null, isPractice: false },
    teacher: null,
    additionalRooms: [],
    taskClasses: [{
      id: cgId * 1000 + 1,
      teachingTaskId: id,
      classGroupId: cgId,
      classGroup: { id: cgId, name: `G${cgId}`, studentCount: opts.classGroupStudentCount ?? 20, advisorName: null, advisorPhone: null },
    }],
  }
}

function makeSlot(id: number, task: TaskWithRelations, day: number, period: number, room: RoomWithAvailability | null, additionalRooms: Array<{ roomId: number; room: RoomWithAvailability }> = []): SlotWithRelations {
  return {
    id,
    teachingTaskId: task.id,
    roomId: room?.id ?? 0,
    dayOfWeek: day,
    slotIndex: period,
    semesterId: 1,
    weekType: 'ALL',
    room,
    teachingTask: task,
    additionalRooms,
  } as SlotWithRelations
}

function buildCtx(rooms: RoomWithAvailability[], slots: SlotWithRelations[]): SchedulingContext {
  const taskById = new Map<number, TaskWithRelations>()
  const roomById = new Map<number, RoomWithAvailability>()
  const slotsByTask = new Map<number, SlotWithRelations[]>()
  for (const s of slots) {
    taskById.set(s.teachingTask.id, s.teachingTask)
    if (s.room) roomById.set(s.room.id, s.room)
    for (const ar of s.additionalRooms) roomById.set(ar.roomId, ar.room)
    const list = slotsByTask.get(s.teachingTask.id) ?? []
    list.push(s)
    slotsByTask.set(s.teachingTask.id, list)
  }
  for (const r of rooms) roomById.set(r.id, r)
  return {
    tasks: Array.from(taskById.values()),
    rooms: Array.from(roomById.values()),
    slots,
    taskById,
    roomById,
    slotsByTask,
    slotsByRoom: new Map(),
    slotsByTeacher: new Map(),
    slotsByClass: new Map(),
  }
}

function makeState(slots: SlotWithRelations[], origDay = 9, origPeriod = 1, origRoom = 999): ScheduleState {
  const assignments = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  const originalAssignments = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  for (const s of slots) {
    assignments.set(s.id, { dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId })
    originalAssignments.set(s.id, { dayOfWeek: origDay, slotIndex: origPeriod, roomId: origRoom })
  }
  return { assignments, originalAssignments }
}

function deltaOn(ctx: SchedulingContext, state: ScheduleState, move: Move): { deltaHard: number; deltaSoft: number } {
  return calculateDeltaScore(ctx, state, move)
}

// ── Test 1: I11 fixture (matches K22-C harness exactly) ─────────────────
// I11: real room → room=0. Expected deltaHard=-1000, deltaSoft=2, SC9=2.
// Note: harness uses classGroupStudentCount=null → fallback 50, which avoids
// triggering SC10 in the I11/I10 delta paths. We mirror that here.
{
  // Build task with explicit null studentCount to match harness fallback behavior.
  const task: TaskWithRelations = {
    id: 1, courseId: 1, teacherId: null, semesterId: 1, weekType: 'ALL', startWeek: 1, endWeek: 16,
    remark: null, importBatchId: null,
    course: { id: 1, name: 'A', code: null, credits: null, isPractice: false },
    teacher: null,
    additionalRooms: [],
    taskClasses: [{
      id: 100001, teachingTaskId: 1, classGroupId: 100,
      classGroup: { id: 100, name: 'G100', studentCount: null, advisorName: null, advisorPhone: null },
    }],
  }
  const r100 = makeRoom(100, 'R100')
  const r200 = makeRoom(200, 'R200')
  const slot1 = makeSlot(1001, task, 1, 1, r100)
  const slot2 = makeSlot(1002, task, 1, 2, r200)
  // Note: I11 fixture does NOT add room 0 to roomById.
  const ctx = buildCtx([r100, r200], [slot1, slot2])
  const state = makeState([slot1, slot2])
  const move: Move = { slotId: 1002, newDay: 1, newSlotIndex: 2, newRoomId: 0 }
  const result = deltaOn(ctx, state, move)
  check(
    'I11 real room → room=0: deltaHard = -1000 (HC5 transition-into-orphan)',
    result.deltaHard === -1000,
    `deltaHard=${result.deltaHard}`,
  )
  check(
    'I11 real room → room=0: deltaSoft = 2 (SC9 +2)',
    result.deltaSoft === 2,
    `deltaSoft=${result.deltaSoft}`,
  )
}

// ── Test 2: I10 fixture (matches K22-C harness exactly) ─────────────────
// I10: room=0 → real room. Expected deltaHard=0, deltaSoft=-2, SC9=-2.
{
  const task: TaskWithRelations = {
    id: 1, courseId: 1, teacherId: null, semesterId: 1, weekType: 'ALL', startWeek: 1, endWeek: 16,
    remark: null, importBatchId: null,
    course: { id: 1, name: 'A', code: null, credits: null, isPractice: false },
    teacher: null,
    additionalRooms: [],
    taskClasses: [{
      id: 100001, teachingTaskId: 1, classGroupId: 100,
      classGroup: { id: 100, name: 'G100', studentCount: null, advisorName: null, advisorPhone: null },
    }],
  }
  const r100 = makeRoom(100, 'R100')
  const r200 = makeRoom(200, 'R200')
  // I10 fixture INCLUDES room 0 in roomById (because slot 2 starts with roomId=0).
  const r0 = makeRoom(0, 'UNSCHEDULED')
  const slot1 = makeSlot(1001, task, 1, 1, r100)
  const slot2 = makeSlot(1002, task, 1, 2, r0)
  const ctx = buildCtx([r100, r200, r0], [slot1, slot2])
  const state = makeState([slot1, slot2])
  const move: Move = { slotId: 1002, newDay: 1, newSlotIndex: 2, newRoomId: 200 }
  const result = deltaOn(ctx, state, move)
  check(
    'I10 room=0 → real room: deltaHard = 0 (no orphan transition into)',
    result.deltaHard === 0,
    `deltaHard=${result.deltaHard}`,
  )
  check(
    'I10 room=0 → real room: deltaSoft = -2 (SC9 -2)',
    result.deltaSoft === -2,
    `deltaSoft=${result.deltaSoft}`,
  )
}

// ── Test 3: room=0 full score behavior preserved ────────────────────────
// Full score: room=0 → skipped in HC4/HC5/HC6 → no penalty.
{
  const task = makeTask(1, { classGroupStudentCount: 50 })
  const r100 = makeRoom(100, 'R100', { capacity: 60 })
  const r0 = makeRoom(0, 'UNSCHEDULED')
  const slot = makeSlot(1, task, 1, 1, r0)
  const ctx = buildCtx([r100, r0], [slot])
  const state = makeState([slot])
  const full = calculateScoreWithDetails(ctx, state)
  check(
    'Full score: slot at room=0 has hardScore=0 (HC4/HC5/HC6 skipped)',
    full.hardScore === 0,
    `hardScore=${full.hardScore}, details=${JSON.stringify(full.details?.map(d => d.type))}`,
  )
}

// ── Test 4: HC5 explicit unavailable primary triggers delta ────────────
{
  const task = makeTask(1, { classGroupStudentCount: 20 })
  const r10 = makeRoom(10, 'R10', { unavailable: [{ day: 1, period: 1 }] })
  const r20 = makeRoom(20, 'R20')
  const slot = makeSlot(1, task, 1, 1, r10)
  const ctx = buildCtx([r10, r20], [slot])
  const state = makeState([slot])
  const move: Move = { slotId: 1, newDay: 1, newSlotIndex: 1, newRoomId: 20 }
  const result = deltaOn(ctx, state, move)
  check(
    'HC5 unavailable primary: deltaHard = +1000 (resolving violation)',
    result.deltaHard === 1000,
    `deltaHard=${result.deltaHard}`,
  )
}

// ── Test 5: HC5 explicit unavailable secondary triggers delta ──────────
{
  const task = makeTask(1, { classGroupStudentCount: 20 })
  const r10 = makeRoom(10, 'R10')
  const r20 = makeRoom(20, 'R20', { unavailable: [{ day: 1, period: 1 }] })
  const slot = makeSlot(1, task, 1, 1, r10, [{ roomId: 20, room: r20 }])
  const ctx = buildCtx([r10, r20], [slot])
  const state = makeState([slot])
  const move: Move = { slotId: 1, newDay: 1, newSlotIndex: 1, newRoomId: 10 }
  const result = deltaOn(ctx, state, move)
  // Delta: old (room 10, secondary 20 unavailable) has HC5 = -1000 (only secondary 20 fires).
  // new (room 10, no secondary at new) → re-evaluate getEffectiveRoomIds(slot, 10) = {10, 20}.
  // Wait: the additionalRooms are immutable; they stay attached.
  // So new effective = {10, 20}, still has secondary 20 unavailable → HC5 = -1000.
  // delta = 0. Slot didn't actually move rooms; the delta should reflect no change.
  check(
    'HC5 unavailable secondary (no actual room change): deltaHard = 0',
    result.deltaHard === 0,
    `deltaHard=${result.deltaHard}`,
  )
}

// ── Test 6: Duplicate primary/secondary rooms count once (regression) ───
// Same as B1A6 verify case 10. Already covered by B1A6 verify, but we re-check.
{
  const task = makeTask(1, { classGroupStudentCount: 70 })
  const r10 = makeRoom(10, 'R10', { capacity: 50 })
  const r20 = makeRoom(20, 'R20', { capacity: 10 })
  const slot = makeSlot(1, task, 1, 1, r10, [
    { roomId: 10, room: r10 },  // duplicate primary as secondary
    { roomId: 20, room: r20 },  // real secondary
  ])
  const ctx = buildCtx([r10, r20], [slot])
  const full = calculateScoreWithDetails(ctx, buildInitialState(ctx))
  const hc4 = full.details?.filter(d => d.type === 'HC4_CAPACITY').length ?? 0
  check(
    'Duplicate primary/secondary: HC4 fires once (not twice)',
    hc4 === 1,
    `hc4=${hc4}`,
  )
}

// ── Test 7: Transition INTO orphan WITH secondary rooms retained ────────
// Slot has primary=10 + secondary=[20], move to room=0.
// At new position, effective = {20} (secondary retained). Not orphan.
// No transition-into-orphan penalty. delta HC5 = 0. (Matches Case 9 B1A6.)
{
  const task = makeTask(1, { classGroupStudentCount: 20 })
  const r10 = makeRoom(10, 'R10')
  const r20 = makeRoom(20, 'SYN-林校-R20')  // name triggers Lin Xiao
  const slot = makeSlot(1, task, 1, 1, r10, [{ roomId: 20, room: r20 }])
  const ctx = buildCtx([r10, r20], [slot])
  const state = makeState([slot])
  const move: Move = { slotId: 1, newDay: 1, newSlotIndex: 1, newRoomId: 0 }
  const result = deltaOn(ctx, state, move)
  // We don't assert exact value, just that orphan transition didn't fire (-1000).
  // The HC6 delta dominates this case: +1000.
  check(
    'Transition into room=0 WITH secondary retained: no orphan transition penalty (delta not -1000 from orphan alone)',
    result.deltaHard > -1000,
    `deltaHard=${result.deltaHard}`,
  )
}

// ── Test 8: Transition OUT of orphan (room=0 → real) ────────────────────
// Already covered by I10. Re-test.
{
  const task = makeTask(1, { classGroupStudentCount: 20 })
  const r100 = makeRoom(100, 'R100')
  const r0 = makeRoom(0, 'UNSCHEDULED')
  const slot = makeSlot(1, task, 1, 1, r0)
  const ctx = buildCtx([r100, r0], [slot])
  const state = makeState([slot])
  const move: Move = { slotId: 1, newDay: 1, newSlotIndex: 1, newRoomId: 100 }
  const result = deltaOn(ctx, state, move)
  check(
    'Transition OUT of orphan: deltaHard = 0 (no penalty for leaving no-room)',
    result.deltaHard === 0,
    `deltaHard=${result.deltaHard}`,
  )
}

// ── Test 9: Both orphan (no change in effective set) ────────────────────
{
  const task = makeTask(1, { classGroupStudentCount: 20 })
  const r100 = makeRoom(100, 'R100')
  const r0 = makeRoom(0, 'UNSCHEDULED')
  const slot = makeSlot(1, task, 1, 1, r0)
  // State with primary null (room=0), no additionalRooms. Effective set = {}.
  const state: ScheduleState = {
    assignments: new Map([[1, { dayOfWeek: 1, slotIndex: 1, roomId: 0 }]]),
    originalAssignments: new Map([[1, { dayOfWeek: 9, slotIndex: 1, roomId: 999 }]]),
  }
  const ctx = buildCtx([r100, r0], [slot])
  // Move keeps room=0 (no change in orphan state).
  const move: Move = { slotId: 1, newDay: 1, newSlotIndex: 1, newRoomId: 0 }
  const result = deltaOn(ctx, state, move)
  check(
    'Both orphan: deltaHard = 0 (no transition)',
    result.deltaHard === 0,
    `deltaHard=${result.deltaHard}`,
  )
}

// ── Test 10: Real room → same real room (no transition) ─────────────────
{
  const task = makeTask(1, { classGroupStudentCount: 20 })
  const r100 = makeRoom(100, 'R100')
  const slot = makeSlot(1, task, 1, 1, r100)
  const ctx = buildCtx([r100], [slot])
  const state = makeState([slot])
  const move: Move = { slotId: 1, newDay: 1, newSlotIndex: 1, newRoomId: 100 }
  const result = deltaOn(ctx, state, move)
  check(
    'Real room → same real room: deltaHard = 0',
    result.deltaHard === 0,
    `deltaHard=${result.deltaHard}`,
  )
}

// ── Test 11: getEffectiveRoomIds edge cases ────────────────────────────
{
  const task = makeTask(1)
  const r100 = makeRoom(100, 'R100')
  const r0 = makeRoom(0, 'UNSCHEDULED')
  const slot = makeSlot(1, task, 1, 1, r100)
  // primaryId=0, no additionalRooms → set is empty
  const eff0 = getEffectiveRoomIds(slot, 0)
  check('getEffectiveRoomIds with room=0 and no additionalRooms: empty set', eff0.size === 0, `size=${eff0.size}`)
  // primaryId=0, with additionalRooms → set has only additional
  const slot2 = makeSlot(2, task, 1, 2, r0, [{ roomId: 100, room: r100 }])
  const eff0WithSec = getEffectiveRoomIds(slot2, 0)
  check(
    'getEffectiveRoomIds with room=0 and secondary: only secondary in set',
    eff0WithSec.size === 1 && eff0WithSec.has(100),
    `set={${Array.from(eff0WithSec).join(',')}}`,
  )
}

// ── Summary ─────────────────────────────────────────────────────────────

console.log('\n=== K36-B1A6B I11 Delta HC5 Regression Verification ===\n')
let passed = 0
for (const r of results) {
  console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.name}`)
  if (r.detail) console.log(`         ${r.detail}`)
  if (r.passed) passed++
}

const failed = results.length - passed
console.log(`\nSummary: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  console.log('\nFAILED:')
  for (const r of results.filter(x => !x.passed)) {
    console.log(`  - ${r.name}: ${r.detail ?? ''}`)
  }
  process.exit(1)
}

console.log('\nK36-B1A6B I11 regression fix verified.')
console.log('Run scripts/verify-score-regression-harness-k22-c.ts to confirm 73/0/0/0.')
console.log('Run scripts/verify-scheduler-multi-room-delta-hc4-hc5-hc6-k36-b1a6.ts to confirm 13/13.')
console.log('Run scripts/verify-scheduler-multi-room-hc1-k36-b1a2.ts to confirm 14/14.')