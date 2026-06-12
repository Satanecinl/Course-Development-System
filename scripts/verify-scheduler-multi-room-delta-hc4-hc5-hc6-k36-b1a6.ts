/**
 * K36-B1A6 scheduler multi-room HC4/HC5/HC6 delta verification.
 *
 * Pure in-memory fixtures only. No Prisma client, database writes, preview,
 * apply, rollback, import, repair, or seed operations.
 */

import {
  calculateDeltaScore,
  calculateScoreWithDetails,
  clearWeekCache,
  findEffectiveRoomConflict,
} from '../src/lib/scheduler/score'
import { buildInitialState } from '../src/lib/scheduler/solver'
import type {
  Move,
  RoomWithAvailability,
  ScheduleState,
  SchedulingContext,
  SlotWithRelations,
  TaskWithRelations,
} from '../src/lib/scheduler/types'

interface RoomSpec {
  id: number
  capacity: number
  name?: string
  unavailable?: Array<{ day: number; period: number }>
}

interface FixtureSpec {
  primary: number | null
  secondary?: number[]
  rooms: RoomSpec[]
  studentCount?: number
  className?: string
  day?: number
  period?: number
}

interface Result {
  name: string
  passed: boolean
  detail: string
}

const results: Result[] = []

function check(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail })
}

function buildFixture(spec: FixtureSpec): {
  ctx: SchedulingContext
  state: ScheduleState
  slot: SlotWithRelations
} {
  const rooms: RoomWithAvailability[] = spec.rooms.map((room) => ({
    id: room.id,
    name: room.name ?? `SYN-R${room.id}`,
    building: 'SYN',
    capacity: room.capacity,
    type: 'NORMAL',
    availabilities: (room.unavailable ?? []).map((entry, index) => ({
      id: room.id * 100 + index,
      roomId: room.id,
      dayOfWeek: entry.day,
      slotIndex: entry.period,
      available: false,
    })),
  }))
  const roomById = new Map(rooms.map((room) => [room.id, room]))
  const task: TaskWithRelations = {
    id: 1,
    courseId: 1,
    teacherId: 101,
    semesterId: 1,
    weekType: 'ALL',
    startWeek: 1,
    endWeek: 16,
    remark: null,
    importBatchId: null,
    course: {
      id: 1,
      name: 'Synthetic Course',
      code: null,
      credits: null,
      isPractice: false,
    },
    teacher: {
      id: 101,
      name: 'Synthetic Teacher',
      phone: null,
      email: null,
    },
    taskClasses: [{
      id: 1,
      teachingTaskId: 1,
      classGroupId: 1,
      classGroup: {
        id: 1,
        name: spec.className ?? 'Synthetic Class',
        studentCount: spec.studentCount ?? 80,
        advisorName: null,
        advisorPhone: null,
      },
    }],
  }
  const slot: SlotWithRelations = {
    id: 1,
    teachingTaskId: 1,
    roomId: spec.primary,
    dayOfWeek: spec.day ?? 1,
    slotIndex: spec.period ?? 1,
    semesterId: 1,
    weekType: 'ALL',
    room: spec.primary == null ? null : (roomById.get(spec.primary) ?? null),
    additionalRooms: (spec.secondary ?? []).map((roomId, index) => ({
      id: 100 + index,
      scheduleSlotId: 1,
      roomId,
      role: 'SECONDARY',
      room: roomById.get(roomId)!,
    })),
    teachingTask: task,
  }
  const ctx: SchedulingContext = {
    tasks: [task],
    rooms,
    slots: [slot],
    taskById: new Map([[task.id, task]]),
    roomById,
    slotsByTask: new Map([[task.id, [slot]]]),
    slotsByRoom: new Map(),
    slotsByTeacher: new Map(),
    slotsByClass: new Map(),
  }
  return { ctx, state: buildInitialState(ctx), slot }
}

function stateAfterMove(state: ScheduleState, move: Move): ScheduleState {
  return {
    assignments: new Map(state.assignments).set(move.slotId, {
      dayOfWeek: move.newDay,
      slotIndex: move.newSlotIndex,
      roomId: move.newRoomId,
    }),
    originalAssignments: state.originalAssignments,
  }
}

function hardScoreChange(ctx: SchedulingContext, state: ScheduleState, move: Move): number {
  const before = calculateScoreWithDetails(ctx, state).hardScore
  const after = calculateScoreWithDetails(ctx, stateAfterMove(state, move)).hardScore
  return after - before
}

clearWeekCache()

{
  const { ctx, state } = buildFixture({
    primary: 10,
    secondary: [20],
    rooms: [
      { id: 10, capacity: 40 },
      { id: 20, capacity: 30 },
    ],
    studentCount: 80,
  })
  const score = calculateScoreWithDetails(ctx, state)
  const count = score.details.filter((detail) => detail.type === 'HC4_CAPACITY').length
  check(
    'HC4 full uses combined primary and secondary capacity',
    score.hardScore === -1000 && count === 1,
    `hard=${score.hardScore}, hc4=${count}`,
  )
}

{
  const { ctx, state } = buildFixture({
    primary: 10,
    secondary: [20],
    rooms: [
      { id: 10, capacity: 60 },
      { id: 20, capacity: 30 },
      { id: 30, capacity: 20 },
    ],
    studentCount: 80,
  })
  const move: Move = { slotId: 1, newDay: 1, newSlotIndex: 1, newRoomId: 30 }
  const expected = hardScoreChange(ctx, state, move)
  const actual = calculateDeltaScore(ctx, state, move).deltaHard
  check(
    'HC4 delta introduces retained-secondary capacity violation',
    expected === -1000 && actual === expected,
    `fullChange=${expected}, deltaHard=${actual}`,
  )
}

{
  const { ctx, state } = buildFixture({
    primary: 10,
    secondary: [20],
    rooms: [
      { id: 10, capacity: 20 },
      { id: 20, capacity: 30 },
      { id: 30, capacity: 60 },
    ],
    studentCount: 80,
  })
  const move: Move = { slotId: 1, newDay: 1, newSlotIndex: 1, newRoomId: 30 }
  const expected = hardScoreChange(ctx, state, move)
  const actual = calculateDeltaScore(ctx, state, move).deltaHard
  check(
    'HC4 delta resolves retained-secondary capacity violation',
    expected === 1000 && actual === expected,
    `fullChange=${expected}, deltaHard=${actual}`,
  )
}

{
  const { ctx, state } = buildFixture({
    primary: 10,
    secondary: [20],
    rooms: [
      { id: 10, capacity: 200 },
      { id: 20, capacity: 200, unavailable: [{ day: 1, period: 1 }] },
    ],
    studentCount: 20,
  })
  const score = calculateScoreWithDetails(ctx, state)
  const count = score.details.filter((detail) => detail.type === 'HC5_ROOM_UNAVAILABLE').length
  check(
    'HC5 full catches unavailable secondary room',
    score.hardScore === -1000 && count === 1,
    `hard=${score.hardScore}, hc5=${count}`,
  )
}

{
  const { ctx, state } = buildFixture({
    primary: 10,
    secondary: [20],
    rooms: [
      { id: 10, capacity: 200 },
      { id: 20, capacity: 200, unavailable: [{ day: 2, period: 1 }] },
    ],
    studentCount: 20,
  })
  const move: Move = { slotId: 1, newDay: 2, newSlotIndex: 1, newRoomId: 10 }
  const expected = hardScoreChange(ctx, state, move)
  const actual = calculateDeltaScore(ctx, state, move).deltaHard
  check(
    'HC5 delta introduces retained-secondary availability violation',
    expected === -1000 && actual === expected,
    `fullChange=${expected}, deltaHard=${actual}`,
  )
}

{
  const { ctx, state } = buildFixture({
    primary: 10,
    secondary: [20],
    rooms: [
      { id: 10, capacity: 200 },
      { id: 20, capacity: 200, unavailable: [{ day: 1, period: 1 }] },
    ],
    studentCount: 20,
  })
  const move: Move = { slotId: 1, newDay: 2, newSlotIndex: 1, newRoomId: 10 }
  const expected = hardScoreChange(ctx, state, move)
  const actual = calculateDeltaScore(ctx, state, move).deltaHard
  check(
    'HC5 delta resolves retained-secondary availability violation',
    expected === 1000 && actual === expected,
    `fullChange=${expected}, deltaHard=${actual}`,
  )
}

{
  const { ctx, state } = buildFixture({
    primary: 10,
    secondary: [20],
    rooms: [
      { id: 10, capacity: 200 },
      { id: 20, capacity: 200, name: 'SYN-林校-R20' },
    ],
    studentCount: 20,
  })
  const score = calculateScoreWithDetails(ctx, state)
  const count = score.details.filter(
    (detail) => detail.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO',
  ).length
  check(
    'HC6 full catches secondary Linxiao violation',
    score.hardScore === -1000 && count === 1,
    `hard=${score.hardScore}, hc6=${count}`,
  )
}

{
  const { ctx, state } = buildFixture({
    primary: null,
    secondary: [20],
    rooms: [
      { id: 10, capacity: 200 },
      { id: 20, capacity: 200, name: 'SYN-林校-R20' },
    ],
    studentCount: 20,
  })
  const move: Move = { slotId: 1, newDay: 1, newSlotIndex: 1, newRoomId: 10 }
  const expected = hardScoreChange(ctx, state, move)
  const actual = calculateDeltaScore(ctx, state, move).deltaHard
  check(
    'HC6 delta introduces secondary violation when leaving no-room state',
    expected === -1000 && actual === expected,
    `fullChange=${expected}, deltaHard=${actual}`,
  )
}

{
  const { ctx, state } = buildFixture({
    primary: 10,
    secondary: [20],
    rooms: [
      { id: 10, capacity: 200 },
      { id: 20, capacity: 200, name: 'SYN-林校-R20' },
    ],
    studentCount: 20,
  })
  const move: Move = { slotId: 1, newDay: 1, newSlotIndex: 1, newRoomId: 0 }
  const expected = hardScoreChange(ctx, state, move)
  const actual = calculateDeltaScore(ctx, state, move).deltaHard
  check(
    'HC6 delta resolves secondary violation when entering no-room state',
    expected === 1000 && actual === expected,
    `fullChange=${expected}, deltaHard=${actual}`,
  )
}

{
  const { ctx, state } = buildFixture({
    primary: 10,
    secondary: [10, 10],
    rooms: [{
      id: 10,
      capacity: 40,
      name: 'SYN-林校-R10',
      unavailable: [{ day: 1, period: 1 }],
    }],
    studentCount: 70,
  })
  const score = calculateScoreWithDetails(ctx, state)
  const hc4 = score.details.filter((detail) => detail.type === 'HC4_CAPACITY').length
  const hc5 = score.details.filter((detail) => detail.type === 'HC5_ROOM_UNAVAILABLE').length
  const hc6 = score.details.filter(
    (detail) => detail.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO',
  ).length
  check(
    'duplicate primary and secondary rooms count once',
    score.hardScore === -3000 && hc4 === 1 && hc5 === 1 && hc6 === 1,
    `hard=${score.hardScore}, hc4=${hc4}, hc5=${hc5}, hc6=${hc6}`,
  )
}

{
  const { ctx, state } = buildFixture({
    primary: null,
    secondary: [20, 20],
    rooms: [{
      id: 20,
      capacity: 10,
      name: 'SYN-林校-R20',
      unavailable: [{ day: 1, period: 1 }],
    }],
    studentCount: 80,
  })
  const move: Move = { slotId: 1, newDay: 1, newSlotIndex: 1, newRoomId: 0 }
  const score = calculateScoreWithDetails(ctx, state)
  const delta = calculateDeltaScore(ctx, state, move)
  check(
    'no-room behavior remains unchanged',
    score.hardScore === 0 && delta.deltaHard === 0,
    `hard=${score.hardScore}, deltaHard=${delta.deltaHard}`,
  )
}

{
  const { ctx, state } = buildFixture({
    primary: 10,
    rooms: [
      { id: 10, capacity: 200 },
      {
        id: 20,
        capacity: 30,
        name: 'SYN-林校-R20',
        unavailable: [{ day: 2, period: 1 }],
      },
    ],
    studentCount: 80,
  })
  const move: Move = { slotId: 1, newDay: 2, newSlotIndex: 1, newRoomId: 20 }
  const expected = hardScoreChange(ctx, state, move)
  const actual = calculateDeltaScore(ctx, state, move).deltaHard
  check(
    'legacy primary-only HC4 HC5 HC6 behavior remains aligned',
    expected === -3000 && actual === expected,
    `fullChange=${expected}, deltaHard=${actual}`,
  )
}

{
  const first = buildFixture({
    primary: 10,
    secondary: [20],
    rooms: [
      { id: 10, capacity: 200 },
      { id: 20, capacity: 200 },
      { id: 30, capacity: 200 },
    ],
    studentCount: 20,
  })
  const secondSlot: SlotWithRelations = {
    ...first.slot,
    id: 2,
    teachingTaskId: 2,
    roomId: 30,
    room: first.ctx.roomById.get(30)!,
    additionalRooms: [{
      id: 201,
      scheduleSlotId: 2,
      roomId: 20,
      role: 'SECONDARY',
      room: first.ctx.roomById.get(20)!,
    }],
    teachingTask: {
      ...first.slot.teachingTask,
      id: 2,
      courseId: 2,
      teacherId: 102,
      course: {
        ...first.slot.teachingTask.course!,
        id: 2,
        name: 'Synthetic Course 2',
      },
      teacher: {
        ...first.slot.teachingTask.teacher!,
        id: 102,
        name: 'Synthetic Teacher 2',
      },
      taskClasses: [],
    },
  }
  const conflict = findEffectiveRoomConflict(first.slot, 10, secondSlot, 30)
  check(
    'HC1 effective-room conflict helper remains intact',
    conflict === 20,
    `conflictingRoomId=${conflict ?? 'none'}`,
  )
}

console.log('\n=== K36-B1A6 Scheduler Multi-room Delta Verification ===\n')
for (const result of results) {
  console.log(`  [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}: ${result.detail}`)
}

const failed = results.filter((result) => !result.passed).length
console.log(`\nSummary: ${results.length - failed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
