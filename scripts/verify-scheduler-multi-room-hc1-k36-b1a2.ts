/**
 * K36-B1A2 scheduler multi-room HC1 verification.
 *
 * Pure in-memory fixtures only. No Prisma client, database writes, preview,
 * apply, rollback, import, repair, or seed operations.
 */

import {
  calculateDeltaScore,
  calculateScoreWithDetails,
  clearWeekCache,
  getEffectiveRoomIds,
} from '../src/lib/scheduler/score'
import {
  buildInitialState,
  findHardConflictParticipants,
  isPlacementHardCompatible,
} from '../src/lib/scheduler/solver'
import type {
  Move,
  RoomWithAvailability,
  SchedulingContext,
  SlotWithRelations,
  TaskWithRelations,
} from '../src/lib/scheduler/types'

interface SlotSpec {
  id: number
  taskId: number
  primary: number | null
  secondary?: number[]
  day?: number
  period?: number
  semesterId?: number
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

function buildContext(slotSpecs: SlotSpec[]): SchedulingContext {
  const roomIds = new Set<number>()
  for (const spec of slotSpecs) {
    if (spec.primary != null && spec.primary > 0) roomIds.add(spec.primary)
    for (const roomId of spec.secondary ?? []) roomIds.add(roomId)
  }
  roomIds.add(99)
  roomIds.add(40)

  const rooms: RoomWithAvailability[] = Array.from(roomIds).map((id) => ({
    id,
    name: `SYN-R${id}`,
    building: 'SYN',
    capacity: 200,
    type: 'NORMAL',
    availabilities: [],
  }))
  const roomById = new Map(rooms.map((room) => [room.id, room]))

  const tasks: TaskWithRelations[] = slotSpecs.map((spec) => ({
    id: spec.taskId,
    courseId: spec.taskId,
    teacherId: spec.taskId + 1000,
    semesterId: spec.semesterId ?? 1,
    weekType: 'ALL',
    startWeek: 1,
    endWeek: 16,
    remark: null,
    importBatchId: null,
    course: {
      id: spec.taskId,
      name: `Synthetic Course ${spec.taskId}`,
      code: null,
      credits: null,
      isPractice: false,
    },
    teacher: {
      id: spec.taskId + 1000,
      name: `Synthetic Teacher ${spec.taskId}`,
      phone: null,
      email: null,
    },
    taskClasses: [],
  }))
  const taskById = new Map(tasks.map((task) => [task.id, task]))

  const slots: SlotWithRelations[] = slotSpecs.map((spec) => ({
    id: spec.id,
    teachingTaskId: spec.taskId,
    roomId: spec.primary,
    dayOfWeek: spec.day ?? 1,
    slotIndex: spec.period ?? 1,
    semesterId: spec.semesterId ?? 1,
    weekType: 'ALL',
    room: spec.primary == null ? null : (roomById.get(spec.primary) ?? null),
    additionalRooms: (spec.secondary ?? []).map((roomId, index) => ({
      id: spec.id * 100 + index,
      scheduleSlotId: spec.id,
      roomId,
      role: 'SECONDARY',
      room: roomById.get(roomId)!,
    })),
    teachingTask: taskById.get(spec.taskId)!,
  }))

  const slotsByTask = new Map<number, SlotWithRelations[]>()
  for (const slot of slots) slotsByTask.set(slot.teachingTaskId, [slot])

  return {
    tasks,
    rooms,
    slots,
    taskById,
    roomById,
    slotsByTask,
    slotsByRoom: new Map(),
    slotsByTeacher: new Map(),
    slotsByClass: new Map(),
  }
}

function hc1Result(specs: SlotSpec[]) {
  clearWeekCache()
  const ctx = buildContext(specs)
  const state = buildInitialState(ctx)
  const result = calculateScoreWithDetails(ctx, state)
  const details = result.details.filter((detail) => detail.type === 'HC1_ROOM_CONFLICT')
  return { ctx, state, result, details }
}

for (const scenario of [
  {
    name: 'full primary-primary',
    specs: [
      { id: 1, taskId: 1, primary: 10 },
      { id: 2, taskId: 2, primary: 10 },
    ],
  },
  {
    name: 'full primary-secondary',
    specs: [
      { id: 1, taskId: 1, primary: 10 },
      { id: 2, taskId: 2, primary: 20, secondary: [10] },
    ],
  },
  {
    name: 'full secondary-primary',
    specs: [
      { id: 1, taskId: 1, primary: 20, secondary: [10] },
      { id: 2, taskId: 2, primary: 10 },
    ],
  },
  {
    name: 'full secondary-secondary',
    specs: [
      { id: 1, taskId: 1, primary: 20, secondary: [10] },
      { id: 2, taskId: 2, primary: 30, secondary: [10] },
    ],
  },
] satisfies Array<{ name: string; specs: SlotSpec[] }>) {
  const { result, details } = hc1Result(scenario.specs)
  check(
    scenario.name,
    result.hardScore === -1000 && details.length === 1,
    `hard=${result.hardScore}, hc1=${details.length}`,
  )
}

{
  const { result, details } = hc1Result([
    { id: 1, taskId: 1, primary: 10, secondary: [10, 10, 20] },
    { id: 2, taskId: 2, primary: 10, secondary: [10, 20, 20] },
  ])
  check(
    'duplicate primary-secondary counts once per pair',
    result.hardScore === -1000 && details.length === 1,
    `hard=${result.hardScore}, hc1=${details.length}`,
  )
}

{
  const ctx = buildContext([{ id: 1, taskId: 1, primary: 10, secondary: [20, 20, 30, 30] }])
  const ids = getEffectiveRoomIds(ctx.slots[0], 10)
  check(
    'duplicate additional rooms are deduplicated',
    ids.size === 3 && ids.has(10) && ids.has(20) && ids.has(30),
    `rooms=${Array.from(ids).join(',')}`,
  )
}

{
  const { result, details } = hc1Result([
    { id: 1, taskId: 1, primary: null, secondary: [] },
    { id: 2, taskId: 2, primary: null, secondary: [] },
  ])
  check(
    'no-room slots do not conflict',
    result.hardScore === 0 && details.length === 0,
    `hard=${result.hardScore}, hc1=${details.length}`,
  )
}

{
  const { result, details } = hc1Result([
    { id: 1, taskId: 1, primary: 10, day: 1, period: 1 },
    { id: 2, taskId: 2, primary: 10, day: 1, period: 2 },
  ])
  check(
    'different time does not conflict',
    result.hardScore === 0 && details.length === 0,
    `hard=${result.hardScore}, hc1=${details.length}`,
  )
}

{
  const { result, details } = hc1Result([
    { id: 1, taskId: 1, primary: 10, semesterId: 1 },
    { id: 2, taskId: 2, primary: 10, semesterId: 2 },
  ])
  check(
    'cross-semester room reuse does not conflict',
    result.hardScore === 0 && details.length === 0,
    `hard=${result.hardScore}, hc1=${details.length}`,
  )
}

function verifyDelta(name: string, movingSecondary: number[], otherPrimary: number, otherSecondary: number[]) {
  clearWeekCache()
  const ctx = buildContext([
    { id: 1, taskId: 1, primary: 30, secondary: movingSecondary, day: 1, period: 2 },
    { id: 2, taskId: 2, primary: otherPrimary, secondary: otherSecondary, day: 1, period: 1 },
  ])
  const state = buildInitialState(ctx)
  const move: Move = { slotId: 1, newDay: 1, newSlotIndex: 1, newRoomId: 40 }
  const delta = calculateDeltaScore(ctx, state, move)
  check(name, delta.deltaHard === -1000, `deltaHard=${delta.deltaHard}`)
}

verifyDelta('delta primary-secondary', [], 20, [40])
verifyDelta('delta secondary-secondary', [50], 20, [50])

{
  clearWeekCache()
  const ctx = buildContext([
    { id: 1, taskId: 1, primary: 30, secondary: [50], day: 1, period: 2 },
    { id: 2, taskId: 2, primary: 20, secondary: [40, 50], day: 1, period: 1 },
  ])
  const state = buildInitialState(ctx)
  const compatible = isPlacementHardCompatible(
    ctx,
    state,
    1,
    ctx.slots[0].teachingTask,
    1,
    1,
    40,
  )
  const participants = findHardConflictParticipants(
    ctx,
    {
      assignments: new Map([
        [1, { dayOfWeek: 1, slotIndex: 1, roomId: 40 }],
        [2, { dayOfWeek: 1, slotIndex: 1, roomId: 20 }],
      ]),
      originalAssignments: state.originalAssignments,
    },
  )
  check(
    'solver hard-compatible and participant detection use room sets',
    !compatible && participants.has(1) && participants.has(2),
    `compatible=${compatible}, participants=${Array.from(participants).join(',')}`,
  )
}

{
  clearWeekCache()
  const ctx = buildContext([
    { id: 1, taskId: 1, primary: 10 },
    { id: 2, taskId: 2, primary: 20 },
  ])
  ctx.slots[1].teachingTask.teacherId = ctx.slots[0].teachingTask.teacherId
  const sharedClass = {
    id: 7001,
    teachingTaskId: 1,
    classGroupId: 7,
    classGroup: {
      id: 7,
      name: 'Synthetic Class 7',
      studentCount: 20,
      advisorName: null,
      advisorPhone: null,
    },
  }
  ctx.slots[0].teachingTask.taskClasses = [sharedClass]
  ctx.slots[1].teachingTask.taskClasses = [{ ...sharedClass, teachingTaskId: 2 }]
  const state = buildInitialState(ctx)
  const result = calculateScoreWithDetails(ctx, state)
  const teacherCount = result.details.filter((detail) => detail.type === 'HC2_TEACHER_CONFLICT').length
  const classCount = result.details.filter((detail) => detail.type === 'HC3_CLASS_CONFLICT').length
  check(
    'teacher/class hard conflict behavior remains available',
    teacherCount === 1 && classCount === 1,
    `hc2=${teacherCount}, hc3=${classCount}`,
  )
}

{
  const { result, details } = hc1Result([
    { id: 1, taskId: 1, primary: 10 },
    { id: 2, taskId: 2, primary: 10 },
  ])
  check(
    'legacy primary-only behavior remains unchanged',
    result.hardScore === -1000 && details.length === 1,
    `hard=${result.hardScore}, hc1=${details.length}`,
  )
}

console.log('\n=== K36-B1A2 Scheduler Multi-room HC1 Verification ===\n')
for (const result of results) {
  console.log(`  [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}: ${result.detail}`)
}

const failed = results.filter((result) => !result.passed).length
console.log(`\nSummary: ${results.length - failed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
