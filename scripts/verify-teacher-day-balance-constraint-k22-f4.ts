/**
 * K22-F4 Teacher Day Balance Constraint Verification
 *
 * Verifies SC5_TEACHER_DAY_BALANCE with 13 cases (8 full + 5 delta).
 * SC5 penalizes teachers whose weekly teaching load is unevenly distributed across weekdays.
 *
 * TEACHING_DAYS = [1, 2, 3, 4, 5] (Mon-Fri)
 * SC5_PENALTY_PER_EXCESS = -3
 * SC5_THRESHOLD = 2
 * SC5_MIN_TOTAL = 3
 *
 * min includes 0-count days (initialized to 0 for all 5 teaching days).
 * Weekend slots (day >= 6) do NOT participate in SC5.
 * SC5 only affects softScore, never hardScore.
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

interface FixtureSlotInput {
  id: number
  teachingTaskId: number
  dayOfWeek: number
  slotIndex: number
  roomId: number
}

interface FixtureTaskInput {
  id: number
  teacherId: number
  classGroupId?: number
}

/**
 * Build a SchedulingContext for SC5 testing.
 * Each task has a unique teacherId and classGroupId to avoid HC2/HC3 conflicts.
 * All slots use the same room (id=100) to avoid HC1 room conflicts on different days.
 * Each slot gets a unique slotIndex within its day to avoid same-day time conflicts.
 */
function buildSC5Context(taskInputs: FixtureTaskInput[], slotInputs: FixtureSlotInput[]): SchedulingContext {
  const room: RoomWithAvailability = { id: 100, name: 'A101', building: 'A', capacity: 100, type: 'NORMAL', availabilities: [] }

  const tasks: TaskWithRelations[] = taskInputs.map(t => ({
    id: t.id, courseId: t.id, teacherId: t.teacherId, semesterId: 1, weekType: 'ALL', startWeek: 1, endWeek: 16,
    remark: null, importBatchId: null,
    course: { id: t.id, name: `Course-${t.id}`, code: null, credits: null, isPractice: false },
    teacher: { id: t.teacherId, name: `T${t.teacherId}`, phone: null, email: null },
    taskClasses: [{
      id: (t.classGroupId ?? t.id) * 1000 + 1,
      teachingTaskId: t.id,
      classGroupId: t.classGroupId ?? t.id,
      classGroup: { id: t.classGroupId ?? t.id, name: `G${t.classGroupId ?? t.id}`, studentCount: 30, advisorName: null, advisorPhone: null },
    }],
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
 * MIN_PERT fires at both old and new positions (net zero), isolating SC5 delta.
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
 * Helper: build task inputs and slot inputs for a given day distribution.
 * All tasks share the SAME teacher (teacherId=10) to allow SC5 to aggregate.
 * Each task has a DIFFERENT taskId and classGroupId to avoid SC2/HC3 conflicts.
 * All slots get unique slotIndex within each day to avoid same-day time conflicts (HC2).
 */
function makeFixture(days: number[]): { tasks: FixtureTaskInput[]; slots: FixtureSlotInput[] } {
  const daySlotCount = new Map<number, number>()
  const tasks: FixtureTaskInput[] = []
  const slots: FixtureSlotInput[] = []
  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    const idx = (daySlotCount.get(day) ?? 0) + 1
    daySlotCount.set(day, idx)
    const taskId = i + 1
    // All tasks share teacherId=10 (same teacher) but have different classGroupId
    tasks.push({ id: taskId, teacherId: 10, classGroupId: i + 100 })
    slots.push({ id: taskId, teachingTaskId: taskId, dayOfWeek: day, slotIndex: idx, roomId: 100 })
  }
  return { tasks, slots }
}

// ── Full score cases ────────────────────────────────────────────────

interface FullCase {
  id: string
  title: string
  days: number[]
  expectedHard: number
  expectedSoft: number
  note: string
}

const fullCases: FullCase[] = [
  {
    id: 'SC5-4_0_0_0_0',
    title: '4 slots on day 1 → diff=4, penalty=-6',
    days: [1, 1, 1, 1],
    expectedHard: 0,
    expectedSoft: -6,
    note: 'dailyCounts=[4,0,0,0,0], diff=4>2, penalty=-3*(4-2)=-6',
  },
  {
    id: 'SC5-3_1_0_0_0',
    title: '3 on day1, 1 on day2 → diff=3, penalty=-3',
    days: [1, 1, 1, 2],
    expectedHard: 0,
    expectedSoft: -3,
    note: 'dailyCounts=[3,1,0,0,0], diff=3>2, penalty=-3*(3-2)=-3',
  },
  {
    id: 'SC5-2_2_0_0_0',
    title: '2 on day1, 2 on day2 → diff=2, penalty=0',
    days: [1, 1, 2, 2],
    expectedHard: 0,
    expectedSoft: 0,
    note: 'dailyCounts=[2,2,0,0,0], diff=2=threshold, no penalty',
  },
  {
    id: 'SC5-TOTAL_LT_3',
    title: '2 slots total (< 3) → skip, penalty=0',
    days: [1, 2],
    expectedHard: 0,
    expectedSoft: 0,
    note: 'total=2<3, skip',
  },
  {
    id: 'SC5-1_1_1_0_0',
    title: '1 on day1, 1 on day2, 1 on day3 → diff=1, penalty=0',
    days: [1, 2, 3],
    expectedHard: 0,
    expectedSoft: 0,
    note: 'dailyCounts=[1,1,1,0,0], diff=1<=2, no penalty',
  },
  {
    id: 'SC5-2_1_0_0_0',
    title: '2 on day1, 1 on day2 → diff=2, penalty=0',
    days: [1, 1, 2],
    expectedHard: 0,
    expectedSoft: 0,
    note: 'dailyCounts=[2,1,0,0,0], diff=2=threshold, no penalty',
  },
  {
    id: 'SC5-4_0_0_0_1',
    title: '4 on day1, 1 on day5 → diff=4, penalty=-6',
    days: [1, 1, 1, 1, 5],
    expectedHard: 0,
    expectedSoft: -6,
    note: 'dailyCounts=[4,0,0,0,1], diff=4>2, penalty=-3*(4-2)=-6',
  },
  {
    id: 'SC5-BALANCED',
    title: '1 on each weekday → diff=0, penalty=0',
    days: [1, 2, 3, 4, 5],
    expectedHard: 0,
    expectedSoft: 0,
    note: 'dailyCounts=[1,1,1,1,1], diff=0<=2, no penalty',
  },
]

// ── Delta cases ─────────────────────────────────────────────────────

interface DeltaCase {
  id: string
  title: string
  days: number[]
  moveSlotIdx: number // index in the slots array (0-based)
  newDay: number
  newSlotIndex: number // must be unique within the target day to avoid HC2 time conflicts
  expectedDeltaHard: number
  expectedDeltaSoft: number
  note: string
}

const deltaCases: DeltaCase[] = [
  {
    id: 'SC5-DELTA-IMPROVE',
    title: 'Move from day1 to day2: [3,0,0,0,1] → [2,1,0,0,1], deltaSoft=+3',
    days: [1, 1, 1, 5],
    moveSlotIdx: 0,
    newDay: 2,
    newSlotIndex: 1, // day 2 has no slots, idx 1 is free
    expectedDeltaHard: 0,
    expectedDeltaSoft: 3,
    note: 'Before: diff=3>2, penalty=-3. After: diff=2=threshold, penalty=0. Delta=+3.',
  },
  {
    id: 'SC5-DELTA-WORSEN',
    title: 'Move from day5 to day1: [2,0,0,0,1] → [3,0,0,0,0], deltaSoft=-3',
    days: [1, 1, 5],
    moveSlotIdx: 2,
    newDay: 1,
    newSlotIndex: 3, // day 1 already has 2 slots (idx 1, 2), use idx 3
    expectedDeltaHard: 0,
    expectedDeltaSoft: -3,
    note: 'Before: diff=2=threshold, penalty=0. After: diff=3>2, penalty=-3. Delta=-3.',
  },
  {
    id: 'SC5-DELTA-SKIP-LT3',
    title: 'Move when total < 3: [1,0,0,0,1] → [2,0,0,0,0], deltaSoft=0',
    days: [1, 5],
    moveSlotIdx: 1,
    newDay: 1,
    newSlotIndex: 2, // day 1 already has 1 slot (idx 1), use idx 2
    expectedDeltaHard: 0,
    expectedDeltaSoft: 0,
    note: 'total=2<3, both before and after skip. Delta=0.',
  },
  {
    id: 'SC5-DELTA-IMPROVE-DEEP',
    title: 'Move from day1 to day2: [4,0,0,0,1] → [3,1,0,0,1], deltaSoft=+3',
    days: [1, 1, 1, 1, 5],
    moveSlotIdx: 0,
    newDay: 2,
    newSlotIndex: 1, // day 2 has no slots, idx 1 is free
    expectedDeltaHard: 0,
    expectedDeltaSoft: 3,
    note: 'Before: diff=4>2, penalty=-6. After: diff=3>2, penalty=-3. Delta=+3.',
  },
  {
    id: 'SC5-DELTA-NO-CHANGE',
    title: 'Move from day1 to day2: [2,2,0,0,0] → [1,3,0,0,0], deltaSoft=-3',
    days: [1, 1, 2, 2],
    moveSlotIdx: 0,
    newDay: 2,
    newSlotIndex: 3, // day 2 already has 2 slots (idx 1, 2), use idx 3
    expectedDeltaHard: 0,
    expectedDeltaSoft: -3,
    note: 'Before: diff=2=threshold, penalty=0. After: diff=3>2, penalty=-3. Delta=-3.',
  },
]

// ── Run ─────────────────────────────────────────────────────────────

function main() {
  clearWeekCache()
  console.log('K22-F4 Teacher Day Balance Constraint Verification')
  console.log('==================================================\n')

  // ── Full score cases ──
  for (const tc of fullCases) {
    const { tasks, slots } = makeFixture(tc.days)
    const ctx = buildSC5Context(tasks, slots)
    const state = buildStateNormal(slots)
    const result = calculateScoreWithDetails(ctx, state)
    const hardOK = result.hardScore === tc.expectedHard
    const softOK = result.softScore === tc.expectedSoft
    const status: Status = hardOK && softOK ? 'PASS' : 'FAIL'
    const sc5Details = result.details.filter(d => d.type === 'SC5_TEACHER_DAY_BALANCE')
    record({
      id: tc.id, title: tc.title, status,
      detail: `hard=${result.hardScore} (expect ${tc.expectedHard}), soft=${result.softScore} (expect ${tc.expectedSoft})`,
      evidence: [tc.note, `SC5 details: ${sc5Details.length}`],
    })
  }

  // ── Delta cases ──
  for (const dc of deltaCases) {
    const { tasks, slots } = makeFixture(dc.days)
    const ctx = buildSC5Context(tasks, slots)
    // Use isolated state (3rd-position originalAssignments) to isolate SC5 delta from MIN_PERT
    const state = buildStateIsolated(slots)
    const moveSlotId = dc.moveSlotIdx + 1 // 1-based
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
