/**
 * K22-F6A Class Gap Reduction Constraint Verification (Isolated)
 *
 * K22-F6A version: core cases assert SC8-only contribution through fixture
 * isolation (teacherId=null, unique tasks, weekend skip) and component-level
 * assertions. Delta cases use 3rd-position originalAssignments to isolate
 * MIN_PERT. Aggregate soft/delta values are still shown as diagnostic info.
 *
 * SC8_CLASS_GAP_PENALTY_PER_EMPTY_PERIOD = -2
 * Skip rules:
 *   - room === 0 (unscheduled)
 *   - dayOfWeek in [6, 7] (weekend → SC7 owns)
 *   - taskClasses.length === 0 (orphan task)
 *   - periodSet.size < 2 (no gap possible)
 * SC8 only affects softScore, never hardScore.
 *
 * Isolation strategies:
 *   - teacherId=null: SC5 skips (no teacher)
 *   - 1 slot per task: SC2 skips (no same-day multi per task)
 *   - periods < 5: SC3 skips (extreme time only)
 *   - weekday only: SC7 skips
 *   - 3rd-position originalAssignments: MIN_PERT net 0
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
  /** null = no teacher (SC5 skips). Use unique teacherId per task to avoid SC5. */
  teacherId: number | null
  /** classGroupIds for this task. Empty array = orphan. */
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
 * teacherId=null → SC5 skipped.
 * 1 slot per task → SC2 skipped (no same-day multi per task).
 */
function buildSC8Context(taskInputs: FixtureTaskInput[], slotInputs: FixtureSlotInput[]): SchedulingContext {
  const room: RoomWithAvailability = { id: 100, name: 'A101', building: 'A', capacity: 100, type: 'NORMAL', availabilities: [] }

  const tasks: TaskWithRelations[] = taskInputs.map(t => ({
    id: t.id, courseId: t.id, teacherId: t.teacherId, semesterId: 1, weekType: 'ALL', startWeek: 1, endWeek: 16,
    remark: null, importBatchId: null,
    course: { id: t.id, name: `Course-${t.id}`, code: null, credits: null, isPractice: false },
    teacher: t.teacherId == null
      ? null
      : { id: t.teacherId, name: `T${t.teacherId}`, phone: null, email: null },
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
 * Helper: extract the sum of SC8_CLASS_GAP penalties from score details.
 */
function extractSC8Contribution(details: { type: string; penalty: number }[]): { count: number; total: number } {
  let count = 0
  let total = 0
  for (const d of details) {
    if (d.type === 'SC8_CLASS_GAP') {
      count++
      total += d.penalty
    }
  }
  return { count, total }
}

// ── Full score cases (8 cases) ──────────────────────────────────────
//
// Isolation strategy:
//   - teacherId=null on all tasks → SC5 skips
//   - 1 slot per task (separate tasks per period) → SC2 skips
//   - periods < 5 except H4 and H8 → SC3 may fire on those
//   - H4, H8 use component-level assertion (SC8 sum vs total) since SC3 also fires
//   - H6 (weekend) uses component-level assertion: SC8 details count = 0 (skip verified)

interface FullCase {
  id: string
  title: string
  /** Task specs. teacherId=null. mergedClassGroupIds: optional, defines merged-class task. */
  taskSpecs: { teacherId: number | null; classGroupIds: number[]; day: number; period: number; roomId?: number }[]
  expectedTotalSoft: number
  expectedSC8Soft: number
  expectedSC8Count: number
  /** Whether to use isolated state (3rd-position originalAssignments) for full score; usually false. */
  isolated?: boolean
  note: string
}

const fullCases: FullCase[] = [
  {
    id: 'SC8-CLASS-GAP-NO-GAP-1_2_3',
    title: 'No gap: {1,2,3} on day 1 → SC8 0 (SC2/SC3/SC5/SC7 all skip)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], day: 1, period: 1 },
      { teacherId: null, classGroupIds: [100], day: 1, period: 2 },
      { teacherId: null, classGroupIds: [100], day: 1, period: 3 },
    ],
    expectedTotalSoft: 0,
    expectedSC8Soft: 0,
    expectedSC8Count: 0,
    note: '3 separate tasks, teacherId=null, periods {1,2,3} on day 1 for classGroup 100. SC2 skip (count=1 each). SC5 skip (no teacher). SC8: {1,2,3} no gap, 0. Total = 0.',
  },
  {
    id: 'SC8-CLASS-GAP-SINGLE-GAP-1_3',
    title: 'Single gap: {1,3} on day 1 → SC8 -2 (others skip)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], day: 1, period: 1 },
      { teacherId: null, classGroupIds: [100], day: 1, period: 3 },
    ],
    expectedTotalSoft: -2,
    expectedSC8Soft: -2,
    expectedSC8Count: 1,
    note: '2 separate tasks, teacherId=null, periods {1,3} on day 1 for classGroup 100. SC2 skip. SC5 skip. SC8: {1,3} gap=1, -2. Total = -2.',
  },
  {
    id: 'SC8-CLASS-GAP-MULTI-GAP-1_4',
    title: 'Multi gap: {1,4} on day 1 → SC8 -4 (others skip)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], day: 1, period: 1 },
      { teacherId: null, classGroupIds: [100], day: 1, period: 4 },
    ],
    expectedTotalSoft: -4,
    expectedSC8Soft: -4,
    expectedSC8Count: 1,
    note: '2 separate tasks, teacherId=null, periods {1,4} on day 1 for classGroup 100. SC2 skip. SC5 skip. SC8: {1,4} gap=2, -4. Total = -4.',
  },
  {
    id: 'SC8-CLASS-GAP-MULTI-SEGMENT-1_3_5',
    title: 'Multi segment: {1,3,5} on day 1 → SC8 -4, SC3 -1 also fires (component assertion)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], day: 1, period: 1 },
      { teacherId: null, classGroupIds: [100], day: 1, period: 3 },
      { teacherId: null, classGroupIds: [100], day: 1, period: 5 },
    ],
    expectedTotalSoft: -5,
    expectedSC8Soft: -4,
    expectedSC8Count: 1,
    note: '3 separate tasks, teacherId=null, periods {1,3,5} on day 1. SC2 skip. SC5 skip. SC3 fires on period 5 (slotIndex >= 5) = -1. SC8: {1,3,5} gaps 1+1=2, -4. Total = -5, SC8 = -4. Component assertion.',
  },
  {
    id: 'SC8-CLASS-GAP-SINGLE-LESSON-SKIP',
    title: 'Single lesson skip: {1} on day 1 → SC8 skip (0)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], day: 1, period: 1 },
    ],
    expectedTotalSoft: 0,
    expectedSC8Soft: 0,
    expectedSC8Count: 0,
    note: '1 task, 1 slot. SC2 skip (count=1). SC5 skip. SC8: {1} size<2 skip, 0 details. Total = 0.',
  },
  {
    id: 'SC8-CLASS-GAP-WEEKEND-SKIP',
    title: 'Weekend skip: day 6 → SC8 skip, SC7 fires (-15). Component: SC8=0',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], day: 6, period: 1 },
    ],
    expectedTotalSoft: -15,
    expectedSC8Soft: 0,
    expectedSC8Count: 0,
    note: '1 task on day 6. SC2 skip. SC5 skip. SC7 fires (weekend) = -15. SC8: day 6 >= 6, skip, 0 details. Total = -15, SC8 = 0. Component assertion: SC8 absent, confirming skip.',
  },
  {
    id: 'SC8-CLASS-GAP-ROOM_ZERO-SKIP',
    title: 'Room=0 skip: 1 scheduled + 1 room=0 → SC8 skip (0)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], day: 1, period: 1, roomId: 100 },
      { teacherId: null, classGroupIds: [100], day: 1, period: 3, roomId: 0 }, // unscheduled
    ],
    expectedTotalSoft: 0,
    expectedSC8Soft: 0,
    expectedSC8Count: 0,
    note: '2 separate tasks. Period 3 has roomId=0 (unscheduled). SC2 skip (count=1 each). SC5 skip. SC8: only period 1 counted, size<2, 0. Total = 0.',
  },
  {
    id: 'SC8-CLASS-GAP-MULTI-CLASSGROUP',
    title: 'Multi-classGroup: merged A(cg{1,2},p1) + B(cg{1},p3) + C(cg{2},p5) → SC8 -8, SC3 -1 also fires (component assertion)',
    taskSpecs: [
      // Merged task: classGroupIds includes both 1 and 2
      { teacherId: null, classGroupIds: [1, 2], day: 1, period: 1 },
      { teacherId: null, classGroupIds: [1], day: 1, period: 3 },
      { teacherId: null, classGroupIds: [2], day: 1, period: 5 },
    ],
    expectedTotalSoft: -9,
    expectedSC8Soft: -8,
    expectedSC8Count: 2,
    note: 'Merged A(cg{1,2},p1) + B(cg{1},p3) + C(cg{2},p5). SC2 skip. SC5 skip. SC3 fires on period 5 = -1. SC8: cg1 {1,3} gap=1 → -2; cg2 {1,5} gap=3 → -6. Total SC8 = -8 (2 details). Total = -9, SC8 = -8. Component assertion: SC8 details count = 2, sum = -8.',
  },
]

// ── Delta cases (4 cases) ───────────────────────────────────────────
//
// Isolation strategy:
//   - teacherId=null → SC5 delta = 0
//   - 1 slot per task → SC2 delta = 0
//   - weekday moves → SC7 delta = 0
//   - 3rd-position originalAssignments → MIN_PERT net 0
//   - All delta cases should be SC8-only contribution

interface DeltaCase {
  id: string
  title: string
  taskSpecs: { teacherId: number | null; classGroupIds: number[]; day: number; period: number; roomId?: number }[]
  /** 0-based index into the slots array (after building) */
  moveSlotIdx: number
  newDay: number
  newSlotIndex: number
  expectedDeltaSoft: number
  expectedSC8Delta: number
  note: string
}

const deltaCases: DeltaCase[] = [
  {
    id: 'SC8-DELTA-REDUCE-GAP-1_3-TO-1_2',
    title: 'Reduce gap: {1,3}→{1,2} on day 1 → SC8 delta +2 (only SC8 fires)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], day: 1, period: 1 },
      { teacherId: null, classGroupIds: [100], day: 1, period: 3 },
    ],
    moveSlotIdx: 1, // the period-3 slot
    newDay: 1,
    newSlotIndex: 2,
    expectedDeltaSoft: 2,
    expectedSC8Delta: 2,
    note: 'Before: {1,3} gap=1, SC8=-2. After: {1,2} no gap, SC8=0. SC8 delta=+2. SC2 delta=0, SC5 delta=0, SC7 delta=0, MIN_PERT=0 (isolated). Total = +2.',
  },
  {
    id: 'SC8-DELTA-INTRODUCE-GAP-1_2-TO-1_3',
    title: 'Introduce gap: {1,2}→{1,3} on day 1 → SC8 delta -2 (only SC8 fires)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], day: 1, period: 1 },
      { teacherId: null, classGroupIds: [100], day: 1, period: 2 },
    ],
    moveSlotIdx: 1,
    newDay: 1,
    newSlotIndex: 3,
    expectedDeltaSoft: -2,
    expectedSC8Delta: -2,
    note: 'Before: {1,2} no gap, SC8=0. After: {1,3} gap=1, SC8=-2. SC8 delta=-2. Other deltas 0. Total = -2.',
  },
  {
    id: 'SC8-DELTA-MOVE-CROSS-DAY-WEEKDAY',
    title: 'Move cross-day weekday: {1,3} day 1 → day 2 (no weekend, no SC2/SC5/SC7) → SC8 delta +2',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], day: 1, period: 1 },
      { teacherId: null, classGroupIds: [100], day: 1, period: 3 },
    ],
    moveSlotIdx: 1,
    newDay: 2, // weekday, no SC7
    newSlotIndex: 1,
    expectedDeltaSoft: 2,
    expectedSC8Delta: 2,
    note: 'Before: cg day 1 {1,3} gap=1, SC8=-2. After: cg day 1 {1} size<2 skip; day 2 {1} size<2 skip. SC8 delta = +2. SC2 delta = 0. SC5 delta = 0. SC7 delta = 0. MIN_PERT = 0 (isolated). Total = +2. (F6A variant: cross-day weekday instead of move-to-weekend, to fully isolate SC8.)',
  },
  {
    id: 'SC8-DELTA-MULTI-CLASSGROUP',
    title: 'Multi-classGroup: merged A(cg{1,2},p1)→p2 with B(cg{1},p3) → SC8 delta +4 (cg1 +2, cg2 +2)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [1, 2], day: 1, period: 1 },
      { teacherId: null, classGroupIds: [1], day: 1, period: 3 },
      { teacherId: null, classGroupIds: [2], day: 1, period: 5 },
    ],
    moveSlotIdx: 0, // the period-1 slot of merged task A
    newDay: 1,
    newSlotIndex: 2,
    expectedDeltaSoft: 4,
    expectedSC8Delta: 4,
    note: 'Before: cg1 {1,3} gap=1 → SC8=-2; cg2 {1,5} gap=3 → SC8=-6. After: cg1 {2,3} no gap → SC8=0; cg2 {2,5} gap=2 → SC8=-4. SC8 delta cg1 = +2, cg2 = +2. Total SC8 = +4. Other deltas 0. Total = +4.',
  },
]

// ── Fixture construction ────────────────────────────────────────────

function buildFixtureFromSpecs(taskSpecs: FullCase['taskSpecs']): { tasks: FixtureTaskInput[]; slots: FixtureSlotInput[] } {
  const tasks: FixtureTaskInput[] = []
  const slots: FixtureSlotInput[] = []
  let id = 0
  for (const spec of taskSpecs) {
    id++
    tasks.push({ id, teacherId: spec.teacherId, classGroupIds: spec.classGroupIds })
    slots.push({ id: id + 1000, teachingTaskId: id, dayOfWeek: spec.day, slotIndex: spec.period, roomId: spec.roomId ?? 100 })
  }
  return { tasks, slots }
}

// ── Run ─────────────────────────────────────────────────────────────

function main() {
  clearWeekCache()
  console.log('K22-F6A Class Gap Reduction Constraint Verification (Isolated)')
  console.log('============================================================\n')

  // ── Full score cases ──
  for (const tc of fullCases) {
    const { tasks, slots } = buildFixtureFromSpecs(tc.taskSpecs)
    const ctx = buildSC8Context(tasks, slots)
    const state = buildStateNormal(slots)
    const result = calculateScoreWithDetails(ctx, state)
    const sc8 = extractSC8Contribution(result.details)
    const totalOK = result.softScore === tc.expectedTotalSoft
    const sc8OK = sc8.total === tc.expectedSC8Soft && sc8.count === tc.expectedSC8Count
    const hardOK = result.hardScore === 0
    const status: Status = (hardOK && totalOK && sc8OK) ? 'PASS' : 'FAIL'
    const sc8Details = result.details.filter(d => d.type === 'SC8_CLASS_GAP')
    const breakdown = result.details.map(d => `${d.type}=${d.penalty}`).join(', ')
    record({
      id: tc.id, title: tc.title, status,
      detail: `hard=${result.hardScore} (expect 0); total soft=${result.softScore} (expect ${tc.expectedTotalSoft}); SC8 count=${sc8.count} (expect ${tc.expectedSC8Count}); SC8 sum=${sc8.total} (expect ${tc.expectedSC8Soft})`,
      evidence: [tc.note, `SC8 details: ${sc8Details.length}`, `Full breakdown: ${breakdown || '(none)'}`],
    })
  }

  // ── Delta cases ──
  for (const dc of deltaCases) {
    const { tasks, slots } = buildFixtureFromSpecs(dc.taskSpecs)
    const ctx = buildSC8Context(tasks, slots)
    // 3rd-position originalAssignments isolates MIN_PERT
    const state = buildStateIsolated(slots)
    const moveSlotId = slots[dc.moveSlotIdx].id
    const move: Move = { slotId: moveSlotId, newDay: dc.newDay, newSlotIndex: dc.newSlotIndex, newRoomId: 100 }
    const delta = calculateDeltaScore(ctx, state, move)
    // Re-evaluate full scores before/after to extract SC8 delta via component analysis
    const stateBefore = { assignments: new Map(slots.map(s => [s.id, { dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId }])), originalAssignments: new Map(slots.map(s => [s.id, { dayOfWeek: 9, slotIndex: 1, roomId: 999 }])) }
    const stateAfter = { assignments: new Map(slots.map(s => [s.id, s.id === moveSlotId ? { dayOfWeek: move.newDay, slotIndex: move.newSlotIndex, roomId: 100 } : { dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId }])), originalAssignments: new Map(slots.map(s => [s.id, { dayOfWeek: 9, slotIndex: 1, roomId: 999 }])) }
    const sc8Before = extractSC8Contribution(calculateScoreWithDetails(ctx, stateBefore).details)
    const sc8After = extractSC8Contribution(calculateScoreWithDetails(ctx, stateAfter).details)
    const sc8DeltaByComponent = sc8After.total - sc8Before.total
    const totalOK = delta.deltaSoft === dc.expectedDeltaSoft
    const sc8OK = sc8DeltaByComponent === dc.expectedSC8Delta
    const hardOK = delta.deltaHard === 0
    const status: Status = (hardOK && totalOK && sc8OK) ? 'PASS' : 'FAIL'
    record({
      id: dc.id, title: dc.title, status,
      detail: `deltaHard=${delta.deltaHard} (expect 0); deltaSoft=${delta.deltaSoft} (expect ${dc.expectedDeltaSoft}); SC8 component delta=${sc8DeltaByComponent} (expect ${dc.expectedSC8Delta}); SC8 details: before count=${sc8Before.count} sum=${sc8Before.total}, after count=${sc8After.count} sum=${sc8After.total}`,
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
