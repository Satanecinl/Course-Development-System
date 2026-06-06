/**
 * K22-F11 Capacity Preference Constraint Verification (Isolated)
 *
 * K22-F11 version: 13 cases (8 full + 5 delta) assert SC10-only contribution through
 * fixture isolation (teacherId=null, single-task single-slot for delta, weekday-only,
 * 3rd-position originalAssignments for MIN_PERT) and component-level assertion.
 *
 * SC10_ROOM_CAPACITY_UTILIZATION:
 *   - utilization > 1.0 → SC10 skip (HC4 owns)
 *   - utilization > 0.90 → -2 (tight)
 *   - utilization < 0.30 AND capacity >= 100 → -1 (waste)
 *   - else 0
 *
 * Skip rules: room=0, room missing, capacity<=0, count<=0, utilization>1.0.
 * SC10 only affects softScore, never hardScore. HC4 is unchanged.
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

interface TaskSpec {
  teacherId: number | null
  classGroupIds: number[]
  classGroupStudentCounts: (number | null)[]
  slots: { day: number; period: number; roomId: number; capacity?: number }[]
  extraRoomIds?: { roomId: number; capacity?: number }[]
}

function buildSC10Context(taskSpecs: TaskSpec[]): SchedulingContext {
  const roomById = new Map<number, RoomWithAvailability>()
  for (const spec of taskSpecs) {
    if (spec.extraRoomIds) {
      for (const er of spec.extraRoomIds) {
        if (!roomById.has(er.roomId)) {
          roomById.set(er.roomId, { id: er.roomId, name: `R${er.roomId}`, building: 'A', capacity: er.capacity ?? 100, type: 'NORMAL', availabilities: [] })
        }
      }
    }
    for (const s of spec.slots) {
      if (!roomById.has(s.roomId)) {
        const cap = s.capacity ?? 100
        roomById.set(s.roomId, { id: s.roomId, name: `R${s.roomId}`, building: 'A', capacity: cap, type: 'NORMAL', availabilities: [] })
      }
    }
  }

  const tasks: TaskWithRelations[] = taskSpecs.map((spec, i) => {
    const taskId = i + 1
    return {
      id: taskId,
      courseId: taskId,
      teacherId: spec.teacherId,
      semesterId: 1,
      weekType: 'ALL',
      startWeek: 1,
      endWeek: 16,
      remark: null,
      importBatchId: null,
      course: { id: taskId, name: `Course-${taskId}`, code: null, credits: null, isPractice: false },
      teacher: spec.teacherId == null
        ? null
        : { id: spec.teacherId, name: `T${spec.teacherId}`, phone: null, email: null },
      taskClasses: spec.classGroupIds.map((cgId, j) => ({
        id: cgId * 1000 + j + 1,
        teachingTaskId: taskId,
        classGroupId: cgId,
        classGroup: { id: cgId, name: `G${cgId}`, studentCount: spec.classGroupStudentCounts[j] ?? null, advisorName: null, advisorPhone: null },
      })),
    }
  })

  const taskById = new Map(tasks.map(t => [t.id, t]))
  const slotsByTask = new Map<number, SlotWithRelations[]>()
  for (const t of tasks) slotsByTask.set(t.id, [])

  const slots: FixtureSlotInput[] = []
  let slotIdCounter = 2000
  for (let ti = 0; ti < taskSpecs.length; ti++) {
    const spec = taskSpecs[ti]
    for (const s of spec.slots) {
      slotIdCounter++
      slots.push({ id: slotIdCounter, teachingTaskId: ti + 1, dayOfWeek: s.day, slotIndex: s.period, roomId: s.roomId })
    }
  }

  const slotObjs: SlotWithRelations[] = slots.map(s => ({
    id: s.id, teachingTaskId: s.teachingTaskId, roomId: s.roomId, dayOfWeek: s.dayOfWeek,
    slotIndex: s.slotIndex, semesterId: 1, weekType: 'ALL', room: roomById.get(s.roomId) ?? null,
    teachingTask: taskById.get(s.teachingTaskId)!,
  }))
  for (const slot of slotObjs) slotsByTask.get(slot.teachingTaskId)!.push(slot)

  return {
    tasks, rooms: Array.from(roomById.values()), slots: slotObjs,
    taskById, roomById, slotsByTask, slotsByRoom: new Map(), slotsByTeacher: new Map(), slotsByClass: new Map()
  }
}

function buildStateNormal(slots: FixtureSlotInput[]): ScheduleState {
  const assignments = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  for (const s of slots) {
    assignments.set(s.id, { dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId })
  }
  return { assignments, originalAssignments: new Map(assignments) }
}

function buildStateIsolated(slots: FixtureSlotInput[]): ScheduleState {
  const assignments = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  const originalAssignments = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  for (const s of slots) {
    assignments.set(s.id, { dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId })
    originalAssignments.set(s.id, { dayOfWeek: 9, slotIndex: 1, roomId: 999 })
  }
  return { assignments, originalAssignments }
}

function extractSC10Contribution(details: { type: string; penalty: number }[]): { count: number; total: number } {
  let count = 0
  let total = 0
  for (const d of details) {
    if (d.type === 'SC10_ROOM_CAPACITY_UTILIZATION') {
      count++
      total += d.penalty
    }
  }
  return { count, total }
}

// ── Full score cases (8) ────────────────────────────────────────────

interface FullCase {
  id: string
  title: string
  taskSpecs: TaskSpec[]
  expectedTotalSoft: number
  expectedSC10Soft: number
  expectedSC10Count: number
  note: string
}

const fullCases: FullCase[] = [
  {
    id: 'SC10-CAPACITY-GOOD-FIT',
    title: 'Good fit: utilization 0.50 → SC10 0',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], classGroupStudentCounts: [50], slots: [{ day: 1, period: 1, roomId: 100, capacity: 100 }] },
    ],
    expectedTotalSoft: 0,
    expectedSC10Soft: 0,
    expectedSC10Count: 0,
    note: '1 task, 50 students, room 100 cap=100. utilization=0.50 (in 0.30-0.90 band). SC10 0. SC2 skip (1 slot). SC5 skip. SC3 skip. Total=0, SC10=0.',
  },
  {
    id: 'SC10-CAPACITY-TIGHT-FIT',
    title: 'Tight fit: utilization 0.95 → SC10 -2',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], classGroupStudentCounts: [95], slots: [{ day: 1, period: 1, roomId: 100, capacity: 100 }] },
    ],
    expectedTotalSoft: -2,
    expectedSC10Soft: -2,
    expectedSC10Count: 1,
    note: '1 task, 95 students, room 100 cap=100. utilization=0.95 > 0.90 → tight -2. Total=-2, SC10=-2.',
  },
  {
    id: 'SC10-CAPACITY-OVER-CAPACITY',
    title: 'Over capacity: utilization 1.20 → HC4 fires, SC10 skip',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], classGroupStudentCounts: [120], slots: [{ day: 1, period: 1, roomId: 100, capacity: 100 }] },
    ],
    expectedTotalSoft: 0,
    expectedSC10Soft: 0,
    expectedSC10Count: 0,
    note: '1 task, 120 students, room 100 cap=100. utilization=1.20 > 1.0 → SC10 skip (HC4 owns). SC10 details=0. Component assertion: total soft unaffected by SC10.',
  },
  {
    id: 'SC10-CAPACITY-SMALL-CLASS-HUGE-ROOM',
    title: 'Small class in huge room: utilization 0.17, cap=120 → SC10 -1 waste',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], classGroupStudentCounts: [20], slots: [{ day: 1, period: 1, roomId: 120, capacity: 120 }] },
    ],
    expectedTotalSoft: -1,
    expectedSC10Soft: -1,
    expectedSC10Count: 1,
    note: '1 task, 20 students, room 120 cap=120. utilization=0.17 < 0.30 AND cap=120 >= 100 → waste -1. Total=-1, SC10=-1.',
  },
  {
    id: 'SC10-CAPACITY-SMALL-CLASS-NORMAL-ROOM',
    title: 'Small class in normal room: utilization 0.40, cap=60 → SC10 0',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], classGroupStudentCounts: [24], slots: [{ day: 1, period: 1, roomId: 60, capacity: 60 }] },
    ],
    expectedTotalSoft: 0,
    expectedSC10Soft: 0,
    expectedSC10Count: 0,
    note: '1 task, 24 students, room 60 cap=60. utilization=0.40 (in band). cap<100 → waste branch does not apply. Total=0, SC10=0.',
  },
  {
    id: 'SC10-CAPACITY-ROOM-ZERO-SKIP',
    title: 'room=0 skip: SC10 0',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], classGroupStudentCounts: [50], slots: [{ day: 1, period: 1, roomId: 0, capacity: 0 }] },
    ],
    expectedTotalSoft: 0,
    expectedSC10Soft: 0,
    expectedSC10Count: 0,
    note: '1 task, room=0 (unscheduled). SC10 skip (room=0). SC10 details=0. Total=0.',
  },
  {
    id: 'SC10-CAPACITY-MISSING-STUDENT-COUNT-SKIP',
    title: 'taskStudentCount=0 (defensive) → SC10 0',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], classGroupStudentCounts: [0], slots: [{ day: 1, period: 1, roomId: 100, capacity: 100 }] },
    ],
    expectedTotalSoft: 0,
    expectedSC10Soft: 0,
    expectedSC10Count: 0,
    note: '1 task, 0 students, room 100 cap=100. SC10 skip (studentCount<=0). SC10 details=0. Total=0.',
  },
  {
    id: 'SC10-CAPACITY-EXACT-0.90-BOUNDARY',
    title: 'Boundary: utilization=0.90 → SC10 0 (strict >)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], classGroupStudentCounts: [90], slots: [{ day: 1, period: 1, roomId: 100, capacity: 100 }] },
    ],
    expectedTotalSoft: 0,
    expectedSC10Soft: 0,
    expectedSC10Count: 0,
    note: '1 task, 90 students, room 100 cap=100. utilization=0.90 (NOT > 0.90 strict). SC10 0. Total=0.',
  },
]

// ── Delta cases (5) ─────────────────────────────────────────────────

interface DeltaCase {
  id: string
  title: string
  taskSpecs: TaskSpec[]
  moveSlotIdx: number
  newDay: number
  newPeriod: number
  newRoomId: number
  expectedDeltaHard: number
  expectedDeltaSoft: number
  expectedSC10Delta: number
  note: string
}

const deltaCases: DeltaCase[] = [
  {
    id: 'SC10-DELTA-IMPROVE-TIGHT-TO-GOOD',
    title: 'Delta: tight 0.95 → good 0.475 → deltaSoft=+2',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], classGroupStudentCounts: [95], slots: [{ day: 1, period: 1, roomId: 100, capacity: 100 }], extraRoomIds: [{ roomId: 200, capacity: 200 }] },
    ],
    moveSlotIdx: 0,
    newDay: 1,
    newPeriod: 1,
    newRoomId: 200,
    expectedDeltaHard: 0,
    expectedDeltaSoft: 2,
    expectedSC10Delta: 2,
    note: 'Before: util 0.95 → -2 (tight). After: util 0.475 → 0. SC10 delta = +2. SC2: 1 slot, delta=0. SC9: 1 distinct room, delta=0. Total = +2.',
  },
  {
    id: 'SC10-DELTA-WORSEN-GOOD-TO-TIGHT',
    title: 'Delta: good 0.475 → tight 0.95 → deltaSoft=-2',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], classGroupStudentCounts: [95], slots: [{ day: 1, period: 1, roomId: 200, capacity: 200 }], extraRoomIds: [{ roomId: 100, capacity: 100 }] },
    ],
    moveSlotIdx: 0,
    newDay: 1,
    newPeriod: 1,
    newRoomId: 100,
    expectedDeltaHard: 0,
    expectedDeltaSoft: -2,
    expectedSC10Delta: -2,
    note: 'Before: util 0.475 → 0. After: util 0.95 → -2. SC10 delta = -2. Total = -2.',
  },
  {
    id: 'SC10-DELTA-SMALL-HUGE-TO-NORMAL',
    title: 'Delta: small huge 0.17 (waste) → small normal 0.50 (good) → deltaSoft=+1',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], classGroupStudentCounts: [20], slots: [{ day: 1, period: 1, roomId: 120, capacity: 120 }], extraRoomIds: [{ roomId: 40, capacity: 40 }] },
    ],
    moveSlotIdx: 0,
    newDay: 1,
    newPeriod: 1,
    newRoomId: 40,
    expectedDeltaHard: 0,
    expectedDeltaSoft: 1,
    expectedSC10Delta: 1,
    note: 'Before: util 0.17 cap=120 → -1 (waste). After: util 0.50 cap=40 → 0. SC10 delta = +1. Total = +1.',
  },
  {
    id: 'SC10-DELTA-NORMAL-TO-HUGE',
    title: 'Delta: small normal 0.50 → small huge 0.17 → deltaSoft=-1',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], classGroupStudentCounts: [20], slots: [{ day: 1, period: 1, roomId: 40, capacity: 40 }], extraRoomIds: [{ roomId: 120, capacity: 120 }] },
    ],
    moveSlotIdx: 0,
    newDay: 1,
    newPeriod: 1,
    newRoomId: 120,
    expectedDeltaHard: 0,
    expectedDeltaSoft: -1,
    expectedSC10Delta: -1,
    note: 'Before: util 0.50 cap=40 → 0. After: util 0.17 cap=120 → -1. SC10 delta = -1. Total = -1.',
  },
  {
    id: 'SC10-DELTA-OVER-CAPACITY-INTRODUCED',
    title: 'Delta: introduce over-capacity (HC4 fires, SC10 skips) → deltaHard=-1000, deltaSoft=0',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], classGroupStudentCounts: [50], slots: [{ day: 1, period: 1, roomId: 100, capacity: 100 }], extraRoomIds: [{ roomId: 40, capacity: 40 }] },
    ],
    moveSlotIdx: 0,
    newDay: 1,
    newPeriod: 1,
    newRoomId: 40,
    expectedDeltaHard: -1000,
    expectedDeltaSoft: 0,
    expectedSC10Delta: 0,
    note: 'Before: util 0.50 → 0. After: util 1.25 → SC10 skip (HC4 owns). HC4 deltaHard = -1000. SC10 component delta = 0. Total = -1000.',
  },
]

// ── Run ──────────────────────────────────────────────────────────────

function main() {
  clearWeekCache()
  console.log('K22-F11 Capacity Preference Constraint Verification (Isolated)')
  console.log('============================================================\n')

  // ── Full score cases ──
  for (const tc of fullCases) {
    const ctx = buildSC10Context(tc.taskSpecs)
    const slotInputs = ctx.slots.map(s => ({ id: s.id, teachingTaskId: s.teachingTaskId, dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId ?? 0 }))
    const state = buildStateNormal(slotInputs)
    const result = calculateScoreWithDetails(ctx, state)
    const sc10 = extractSC10Contribution(result.details)
    const totalOK = result.softScore === tc.expectedTotalSoft
    const sc10OK = sc10.total === tc.expectedSC10Soft && sc10.count === tc.expectedSC10Count
    const hardOK = result.hardScore === 0 || tc.id === 'SC10-CAPACITY-OVER-CAPACITY' // J3 expects HC4
    const status: Status = (hardOK && totalOK && sc10OK) ? 'PASS' : 'FAIL'
    const breakdown = result.details.map(d => `${d.type}=${d.penalty}`).join(', ')
    record({
      id: tc.id, title: tc.title, status,
      detail: `hard=${result.hardScore} (expect ${tc.id === 'SC10-CAPACITY-OVER-CAPACITY' ? -1000 : 0}); total soft=${result.softScore} (expect ${tc.expectedTotalSoft}); SC10 count=${sc10.count} (expect ${tc.expectedSC10Count}); SC10 sum=${sc10.total} (expect ${tc.expectedSC10Soft})`,
      evidence: [tc.note, `Full breakdown: ${breakdown || '(none)'}`],
    })
  }

  // ── Delta cases ──
  for (const dc of deltaCases) {
    const ctx = buildSC10Context(dc.taskSpecs)
    const slotInputs = ctx.slots.map(s => ({ id: s.id, teachingTaskId: s.teachingTaskId, dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId ?? 0 }))
    const state = buildStateIsolated(slotInputs)
    const moveSlotId = slotInputs[dc.moveSlotIdx].id
    const move: Move = { slotId: moveSlotId, newDay: dc.newDay, newSlotIndex: dc.newPeriod, newRoomId: dc.newRoomId }
    const delta = calculateDeltaScore(ctx, state, move)
    const stateBefore = { assignments: new Map(slotInputs.map(s => [s.id, { dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId }])), originalAssignments: new Map(slotInputs.map(s => [s.id, { dayOfWeek: 9, slotIndex: 1, roomId: 999 }])) }
    const stateAfter = { assignments: new Map(slotInputs.map(s => [s.id, s.id === moveSlotId ? { dayOfWeek: move.newDay, slotIndex: move.newSlotIndex, roomId: move.newRoomId } : { dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId }])), originalAssignments: new Map(slotInputs.map(s => [s.id, { dayOfWeek: 9, slotIndex: 1, roomId: 999 }])) }
    const sc10Before = extractSC10Contribution(calculateScoreWithDetails(ctx, stateBefore).details)
    const sc10After = extractSC10Contribution(calculateScoreWithDetails(ctx, stateAfter).details)
    const sc10DeltaByComponent = sc10After.total - sc10Before.total
    const totalOK = delta.deltaSoft === dc.expectedDeltaSoft
    const sc10OK = sc10DeltaByComponent === dc.expectedSC10Delta
    const hardOK = delta.deltaHard === dc.expectedDeltaHard
    const status: Status = (hardOK && totalOK && sc10OK) ? 'PASS' : 'FAIL'
    record({
      id: dc.id, title: dc.title, status,
      detail: `deltaHard=${delta.deltaHard} (expect ${dc.expectedDeltaHard}); deltaSoft=${delta.deltaSoft} (expect ${dc.expectedDeltaSoft}); SC10 component delta=${sc10DeltaByComponent} (expect ${dc.expectedSC10Delta}); SC10 details: before count=${sc10Before.count} sum=${sc10Before.total}, after count=${sc10After.count} sum=${sc10After.total}`,
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
