/**
 * K22-F6 Class Gap Reduction Constraint Verification
 *
 * Verifies SC8_CLASS_GAP_REDUCTION with 16 cases (8 full + 8 delta).
 * SC8 penalizes empty periods between two occupied periods on the same day
 * for the same classGroup.
 *
 * SC8_CLASS_GAP_PENALTY_PER_EMPTY_PERIOD = -2
 * Skip rules:
 *   - room === 0 (unscheduled)
 *   - dayOfWeek in [6, 7] (weekend → SC7 owns)
 *   - taskClasses.length === 0 (orphan task)
 *   - periodSet.size < 2 (no gap possible)
 * SC8 only affects softScore, never hardScore.
 *
 * Exit code: 0 if all PASS; non-zero if FAIL.
 */

import {
  calculateScoreWithDetails,
  calculateDeltaScore,
  clearWeekCache,
} from '@/lib/scheduler/score'
import type {
  SchedulingContext,
  ScheduleState,
  Move,
  TaskWithRelations,
  SlotWithRelations,
  RoomWithAvailability,
} from '@/lib/scheduler/types'

// ── Types ────────────────────────────────────────────────────────────

type Status = 'PASS' | 'FAIL'

interface CheckResult {
  id: string
  title: string
  status: Status
  detail: string
  evidence?: string[]
}

const results: CheckResult[] = []

function record(r: CheckResult): void {
  results.push(r)
  console.log(`${r.status}: [${r.id}] ${r.title}`)
  console.log(`  ${r.detail}`)
  if (r.evidence) {
    for (const e of r.evidence) console.log(`  - ${e}`)
  }
}

// ── Fixture builders ─────────────────────────────────────────────────

interface FixtureTaskInput {
  id: number
  teacherId: number
  /** classGroupIds for this task. Empty array = orphan (should be skipped by SC8). */
  classGroupIds: number[]
}

interface FixtureSlotInput {
  id: number
  teachingTaskId: number
  dayOfWeek: number
  slotIndex: number
  roomId: number
}

/**
 * Build a SchedulingContext for SC8 testing.
 * Each task has a unique teacherId and a (possibly multi) classGroupId.
 * All slots use the same room (id=100) to avoid HC1 room conflicts.
 * Each slot gets a unique slotIndex within its day to avoid HC2 time conflicts.
 */
function buildSC8Context(taskInputs: FixtureTaskInput[], slotInputs: FixtureSlotInput[]): SchedulingContext {
  const room: RoomWithAvailability = { id: 100, name: 'A101', building: 'A', capacity: 100, type: 'NORMAL', availabilities: [] }

  const tasks: TaskWithRelations[] = taskInputs.map(t => ({
    id: t.id, courseId: t.id, teacherId: t.teacherId, semesterId: 1, weekType: 'ALL', startWeek: 1, endWeek: 16,
    remark: null, importBatchId: null,
    course: { id: t.id, name: `Course-${t.id}`, code: null, credits: null, isPractice: false },
    teacher: { id: t.teacherId, name: `T${t.teacherId}`, phone: null, email: null },
    taskClasses: t.classGroupIds.map((cgId, i) => ({
      id: cgId * 1000 + i + 1,
      teachingTaskId: t.id,
      classGroupId: cgId,
      classGroup: { id: cgId, name: `G${cgId}`, studentCount: 30, advisorName: null, advisorPhone: null },
    })),
  }))

  const taskById = new Map(tasks.map(t => [t.id, t]))
  const roomById = new Map([[100, room]])
  const slotsByTask = new Map<number, SlotWithRelations[]>()
  for (const t of tasks) slotsByTask.set(t.id, [])

  const slotObjs: SlotWithRelations[] = slotInputs.map(s => {
    const task = taskById.get(s.teachingTaskId)!
    return {
      id: s.id, teachingTaskId: s.teachingTaskId, roomId: s.roomId, dayOfWeek: s.dayOfWeek,
      slotIndex: s.slotIndex, semesterId: 1, weekType: 'ALL', room, teachingTask: task,
    }
  })

  for (const slot of slotObjs) {
    slotsByTask.get(slot.teachingTaskId)!.push(slot)
  }

  return { tasks, rooms: [room], slots: slotObjs, taskById, roomById, slotsByTask, slotsByRoom: new Map(), slotsByTeacher: new Map(), slotsByClass: new Map() }
}

/**
 * Build ScheduleState where originalAssignments = actual positions (no MIN_PERT).
 * Used for full score cases.
 */
function buildStateNormal(slotInputs: FixtureSlotInput[]): ScheduleState {
  const assignments = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  for (const s of slotInputs) {
    assignments.set(s.id, { dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId })
  }
  return { assignments, originalAssignments: new Map(assignments) }
}

/**
 * Build ScheduleState where originalAssignments is set to a 3rd position (day=9, room=999).
 * MIN_PERT fires at both old and new positions (net zero), isolating SC8 delta.
 * Used for delta test cases.
 */
function buildStateIsolated(slotInputs: FixtureSlotInput[]): ScheduleState {
  const assignments = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  const originalAssignments = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  for (const s of slotInputs) {
    assignments.set(s.id, { dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId })
    originalAssignments.set(s.id, { dayOfWeek: 9, slotIndex: 1, roomId: 999 })
  }
  return { assignments, originalAssignments }
}

/**
 * Helper for full-score cases: build a fixture where each classGroup has its OWN task.
 * This lets us precisely control periods per classGroup. To avoid HC2/HC3 collisions,
 * every task uses a unique teacherId and a unique classGroupId.
 *
 * `specs` is an array of { day, periods, classGroupId } triples. Each triple becomes one task
 * with a unique teacher and the given classGroup; the task gets N slots (one per period).
 *
 * To model a merged-class task, use a different helper.
 */
function makeSingleClassGroupFixture(specs: { day: number; periods: number[]; classGroupId: number }[]): {
  tasks: FixtureTaskInput[]
  slots: FixtureSlotInput[]
} {
  const tasks: FixtureTaskInput[] = []
  const slots: FixtureSlotInput[] = []
  let id = 0
  for (const spec of specs) {
    id++
    const taskId = id
    tasks.push({ id: taskId, teacherId: 10 + taskId, classGroupIds: [spec.classGroupId] })
    for (const p of spec.periods) {
      id++
      slots.push({ id, teachingTaskId: taskId, dayOfWeek: spec.day, slotIndex: p, roomId: 100 })
    }
  }
  return { tasks, slots }
}

// ── Full score cases ────────────────────────────────────────────────

interface FullCase {
  id: string
  title: string
  /** Description of the classGroup day plan and expected penalty. */
  spec: { day: number; periods: number[]; classGroupId: number }[]
  expectedHard: number
  expectedSoft: number
  note: string
}

const fullCases: FullCase[] = [
  {
    id: 'SC8-FULL-1',
    title: 'No gap: {1, 2, 3} on day 1 → soft=-23 (SC2 -20 + SC5 -3, SC8 0)',
    spec: [{ day: 1, periods: [1, 2, 3], classGroupId: 100 }],
    expectedHard: 0,
    expectedSoft: -23,
    note: 'Set {1,2,3}, gaps = 0+0 = 0, SC8=0. SC2 fires (1 task 3 same-day slots) = -20. SC5 fires (teacher 11 has 3 slots day 1) = -3. Total = -23.',
  },
  {
    id: 'SC8-FULL-2',
    title: 'Single gap: {1, 3} on day 1 → soft=-12 (SC2 -10, SC8 -2)',
    spec: [{ day: 1, periods: [1, 3], classGroupId: 100 }],
    expectedHard: 0,
    expectedSoft: -12,
    note: 'Set {1,3}, gap = 1, SC8 = -2. SC2 fires (1 task 2 same-day) = -10. SC5 skip (total<3). Total = -12.',
  },
  {
    id: 'SC8-FULL-3',
    title: 'Multi gap: {1, 4} on day 1 → soft=-14 (SC2 -10, SC8 -4)',
    spec: [{ day: 1, periods: [1, 4], classGroupId: 100 }],
    expectedHard: 0,
    expectedSoft: -14,
    note: 'Set {1,4}, gap = 2, SC8 = -4. SC2 fires (1 task 2 same-day) = -10. SC5 skip. Total = -14.',
  },
  {
    id: 'SC8-FULL-4',
    title: 'Multi segment: {1, 3, 5} on day 1 → soft=-28 (SC2 -20, SC3 -1, SC5 -3, SC8 -4)',
    spec: [{ day: 1, periods: [1, 3, 5], classGroupId: 100 }],
    expectedHard: 0,
    expectedSoft: -28,
    note: 'Set {1,3,5}, gaps = 1+1 = 2, SC8 = -4. SC2 fires (1 task 3 same-day) = -20. SC3 fires (period 5 >= 5) = -1. SC5 fires (teacher 3 slots day 1) = -3. Total = -28.',
  },
  {
    id: 'SC8-FULL-5',
    title: 'Single lesson skip: {1} on day 1 → soft=0',
    spec: [{ day: 1, periods: [1], classGroupId: 100 }],
    expectedHard: 0,
    expectedSoft: 0,
    note: 'Set {1}, size < 2, SC8 skip. SC2 skip (count=1). SC5 skip. Total = 0.',
  },
  {
    id: 'SC8-FULL-6',
    title: 'Weekend skip: day 6 → soft=-40 (SC2 -10, SC7 -30, SC8 0)',
    spec: [{ day: 6, periods: [1, 3], classGroupId: 100 }],
    expectedHard: 0,
    expectedSoft: -40,
    note: 'day 6 >= 6: SC8 skips. SC2 fires (1 task 2 same-day) = -10. SC7 fires (2 weekend slots × -15) = -30. Total = -40.',
  },
  {
    id: 'SC8-FULL-7',
    title: 'Room=0 (unscheduled) skip: only scheduled slot counted → soft=0',
    spec: [{ day: 1, periods: [1], classGroupId: 100 }], // The period 3 will be added as room=0 below
    expectedHard: 0,
    expectedSoft: 0,
    note: 'Room=0 (period 3) skipped; only period 1 remains; size<2; SC8=0. SC2 skip (count=1). Total = 0.',
  },
  {
    id: 'SC8-FULL-8',
    title: 'Merged-class: task A (cg{1,2}, p1) + task B (cg{1}, p3) + task C (cg{2}, p5) → soft=-9 (SC3 -1, SC8 -8)',
    spec: [
      // F5 example: A (merged cg{1,2}, p1), B (cg{1}, p3), C (cg{2}, p5)
      { day: 1, periods: [1], classGroupId: 1 }, // placeholder (will be replaced by merged task A)
      { day: 1, periods: [3], classGroupId: 1 },
      { day: 1, periods: [5], classGroupId: 2 },
    ],
    expectedHard: 0,
    expectedSoft: -9,
    note: 'classGroup 1: {1,3} gap=1 → -2; classGroup 2: {1,5} gap=3 → -6; SC8 = -8. SC3 fires (period 5) = -1. SC2 skip (each task 1 slot). Total = -9.',
  },
]

// ── Delta cases ─────────────────────────────────────────────────────

interface DeltaCase {
  id: string
  title: string
  /** Initial spec for fixtures (same as full-case) */
  spec: { day: number; periods: number[]; classGroupId: number }[]
  /** Slot id to move (1-based, within the slots array) */
  moveSlotIdx: number
  newDay: number
  newSlotIndex: number
  /** If true, mark the new room as room=0 to test room=0 skip in delta */
  newRoomIsZero?: boolean
  expectedDeltaHard: number
  expectedDeltaSoft: number
  note: string
}

const deltaCases: DeltaCase[] = [
  {
    id: 'SC8-DELTA-1',
    title: 'Reduce gap: {1,3} → {1,2}, deltaSoft=+2 (SC8 +2, SC2 0)',
    spec: [{ day: 1, periods: [1, 3], classGroupId: 100 }],
    moveSlotIdx: 1, // the period-3 slot
    newDay: 1,
    newSlotIndex: 2,
    expectedDeltaHard: 0,
    expectedDeltaSoft: 2,
    note: 'Before: {1,3} gap=1, SC8=-2. After: {1,2} no gap, SC8=0. SC8 delta = +2. SC2: 1 task 2 same-day both before and after, delta=0. SC5 skip. Total = +2.',
  },
  {
    id: 'SC8-DELTA-2',
    title: 'Introduce gap: {1,2} → {1,3}, deltaSoft=-2 (SC8 -2, SC2 0)',
    spec: [{ day: 1, periods: [1, 2], classGroupId: 100 }],
    moveSlotIdx: 1, // the period-2 slot
    newDay: 1,
    newSlotIndex: 3,
    expectedDeltaHard: 0,
    expectedDeltaSoft: -2,
    note: 'Before: {1,2} no gap, SC8=0. After: {1,3} gap=1, SC8=-2. SC8 delta = -2. SC2: 1 task 2 same-day both before and after, delta=0. SC5 skip. Total = -2.',
  },
  {
    id: 'SC8-DELTA-3',
    title: 'Move to weekend: {1,3} on day 1 → period 3 to day 6, deltaSoft=-3 (SC8 +2, SC2 +10, SC7 -15)',
    spec: [{ day: 1, periods: [1, 3], classGroupId: 100 }],
    moveSlotIdx: 1,
    newDay: 6, // weekend → SC8 skips, SC7 fires
    newSlotIndex: 1,
    expectedDeltaHard: 0,
    expectedDeltaSoft: -3,
    note: 'Before (cg, day=1): {1,3} gap=1, SC8=-2. After (cg, day=1): {1} size<2, SC8=0. SC8 delta = +2. SC2 before: 1 task 2 same-day = -10. After: 1 task, 1 slot day 1 + 1 slot day 6, no same-day multi = 0. SC2 delta = +10. SC7 delta = -15 (new weekend). SC5: total<3 skip. Total = +2 + 10 - 15 = -3.',
  },
  {
    id: 'SC8-DELTA-4',
    title: 'Merged-class: move task A (cg{1,2}) from p1 to p2 with B (cg{1}) at p3 → deltaSoft=+4 (SC8 +2 for cg1, +2 for cg2)',
    spec: [
      { day: 1, periods: [1], classGroupId: 1 }, // placeholder (replaced by merged task A)
      { day: 1, periods: [3], classGroupId: 1 },
      { day: 1, periods: [5], classGroupId: 2 },
    ],
    moveSlotIdx: 0, // the period-1 slot of merged task A
    newDay: 1,
    newSlotIndex: 2,
    expectedDeltaHard: 0,
    expectedDeltaSoft: 4,
    note: 'Before: cg1 has {1,3} gap=1 → SC8=-2; cg2 has {1,5} gap=3 → SC8=-6. After: cg1 has {2,3} no gap → SC8=0; cg2 has {2,5} gap=2 → SC8=-4. SC8 delta cg1 = 0-(-2) = +2. SC8 delta cg2 = -4-(-6) = +2. Total SC8 delta = +4. SC2 stays 0 (each task 1 slot). SC5 skip (3 teachers, each total<3). SC3 fires (period 5). Total = +4. (merged task A injected post-build)',
  },
]

// ── Special fixture injectors ────────────────────────────────────────

/**
 * Inject an extra room=0 slot for SC8-FULL-7.
 * Adds a slot with roomId=0 (unscheduled) at period 3, day 1, attached to a fresh task
 * whose only classGroup is the same as the existing spec.
 */
function withExtraRoomZeroSlot(
  spec: { day: number; periods: number[]; classGroupId: number }[],
): { tasks: FixtureTaskInput[]; slots: FixtureSlotInput[] } {
  const base = makeSingleClassGroupFixture(spec)
  const nextTaskId = base.tasks.length + 1
  const nextSlotId = base.slots.length > 0 ? Math.max(...base.slots.map(s => s.id)) + 1 : 1
  base.tasks.push({ id: nextTaskId, teacherId: 999, classGroupIds: [spec[0].classGroupId] })
  base.slots.push({ id: nextSlotId, teachingTaskId: nextTaskId, dayOfWeek: 1, slotIndex: 3, roomId: 0 })
  return base
}

// ── Run ─────────────────────────────────────────────────────────────

function main() {
  clearWeekCache()
  console.log('K22-F6 Class Gap Reduction Constraint Verification')
  console.log('====================================================\n')

  // ── Full score cases ──
  for (const tc of fullCases) {
    let tasks: FixtureTaskInput[]
    let slots: FixtureSlotInput[]
    if (tc.id === 'SC8-FULL-8') {
      // merged-class fixture: task A (cg{1,2}, p1) + task B (cg{1}, p3) + task C (cg{2}, p5)
      tasks = []
      slots = []
      let id = 0
      id++
      tasks.push({ id, teacherId: 11, classGroupIds: [1, 2] })
      id++
      slots.push({ id, teachingTaskId: id - 1, dayOfWeek: 1, slotIndex: 1, roomId: 100 })
      id++
      tasks.push({ id, teacherId: 12, classGroupIds: [1] })
      id++
      slots.push({ id, teachingTaskId: id - 1, dayOfWeek: 1, slotIndex: 3, roomId: 100 })
      id++
      tasks.push({ id, teacherId: 13, classGroupIds: [2] })
      id++
      slots.push({ id, teachingTaskId: id - 1, dayOfWeek: 1, slotIndex: 5, roomId: 100 })
    } else if (tc.id === 'SC8-FULL-7') {
      const fx = withExtraRoomZeroSlot(tc.spec)
      tasks = fx.tasks
      slots = fx.slots
    } else {
      const fx = makeSingleClassGroupFixture(tc.spec)
      tasks = fx.tasks
      slots = fx.slots
    }
    const ctx = buildSC8Context(tasks, slots)
    const state = buildStateNormal(slots)
    const result = calculateScoreWithDetails(ctx, state)
    const hardOK = result.hardScore === tc.expectedHard
    const softOK = result.softScore === tc.expectedSoft
    const status: Status = hardOK && softOK ? 'PASS' : 'FAIL'
    const sc8Details = result.details.filter(d => d.type === 'SC8_CLASS_GAP')
    record({
      id: tc.id, title: tc.title, status,
      detail: `hard=${result.hardScore} (expect ${tc.expectedHard}), soft=${result.softScore} (expect ${tc.expectedSoft})`,
      evidence: [tc.note, `SC8 details: ${sc8Details.length}`],
    })
  }

  // ── Delta cases ──
  for (const dc of deltaCases) {
    let tasks: FixtureTaskInput[]
    let slots: FixtureSlotInput[]
    if (dc.id === 'SC8-DELTA-4') {
      // merged-class fixture: task A (cg{1,2}, p1) + task B (cg{1}, p3) + task C (cg{2}, p5)
      tasks = []
      slots = []
      let id = 0
      id++
      tasks.push({ id, teacherId: 11, classGroupIds: [1, 2] })
      id++
      slots.push({ id, teachingTaskId: id - 1, dayOfWeek: 1, slotIndex: 1, roomId: 100 })
      id++
      tasks.push({ id, teacherId: 12, classGroupIds: [1] })
      id++
      slots.push({ id, teachingTaskId: id - 1, dayOfWeek: 1, slotIndex: 3, roomId: 100 })
      id++
      tasks.push({ id, teacherId: 13, classGroupIds: [2] })
      id++
      slots.push({ id, teachingTaskId: id - 1, dayOfWeek: 1, slotIndex: 5, roomId: 100 })
    } else {
      const fx = makeSingleClassGroupFixture(dc.spec)
      tasks = fx.tasks
      slots = fx.slots
    }
    const ctx = buildSC8Context(tasks, slots)
    // Use isolated state (3rd-position originalAssignments) to isolate SC8 delta from MIN_PERT
    const state = buildStateIsolated(slots)
    // Slot ids: in our fixture builder, slots start from id 2 (since task 1 is id 1).
    // We map moveSlotIdx (0-based into the slots array) to its actual slot id.
    const moveSlotId = slots[dc.moveSlotIdx].id
    const move: Move = { slotId: moveSlotId, newDay: dc.newDay, newSlotIndex: dc.newSlotIndex, newRoomId: 100 }
    const delta = calculateDeltaScore(ctx, state, move)
    const hardOK = delta.deltaHard === dc.expectedDeltaHard
    const softOK = delta.deltaSoft === dc.expectedDeltaSoft
    const status: Status = hardOK && softOK ? 'PASS' : 'FAIL'
    record({
      id: dc.id, title: dc.title, status,
      detail: `deltaHard=${delta.deltaHard} (expect ${dc.expectedDeltaHard}), deltaSoft=${delta.deltaSoft} (expect ${dc.expectedDeltaSoft})`,
      evidence: [dc.note],
    })
  }

  // ── Summary ──
  const pass = results.filter(r => r.status === 'PASS').length
  const fail = results.filter(r => r.status === 'FAIL').length
  console.log(`\nSummary:`)
  console.log(`PASS: ${pass}`)
  console.log(`FAIL: ${fail}`)
  console.log(`TOTAL: ${results.length}`)
  if (fail > 0) {
    console.error(`\nFAIL: ${fail} unexpected failure(s). Exit code = 1.`)
    process.exit(1)
  } else {
    console.log(`\nAll ${results.length} cases PASS. Exit code = 0.`)
    process.exit(0)
  }
}

main()
