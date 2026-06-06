/**
 * K22-F8 Classroom Stability Constraint Verification (Isolated)
 *
 * K22-F8 version: core cases assert SC9-only contribution through fixture
 * isolation (teacherId=null, single task, weekday-only for delta, 3rd-position
 * originalAssignments for MIN_PERT) and component-level assertions.
 *
 * SC9_TEACHING_TASK_ROOM_STABILITY_PENALTY_PER_EXTRA_ROOM = -2
 * Skip rules:
 *   - room === 0 (unscheduled)
 *   - dayOfWeek in [6, 7] (weekend — SC7 owns)
 *   - distinctRooms.size <= 1 (no diversity)
 * SC9 only affects softScore, never hardScore.
 *
 * Isolation strategies:
 *   - teacherId=null: SC5 skips (no teacher)
 *   - Single task with multiple slots all on day 1: SC8 may fire (component assertion separates)
 *   - Periods < 5: SC3 skips
 *   - Weekday only for delta: SC7 skips
 *   - 3rd-position originalAssignments: MIN_PERT net 0
 *
 * Fixture shape: each task spec is one task with multiple slots. SC9 fires when
 * the same task has multiple distinct rooms. For 2+ tasks with 1 slot each,
 * SC2 doesn't fire (count=1 each) but SC9 also doesn't fire (size=1 per task).
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
  slots: { day: number; period: number; roomId: number }[]
}

function buildSC9Context(taskSpecs: TaskSpec[], extraRoomIds: number[] = []): SchedulingContext {
  const roomById = new Map<number, RoomWithAvailability>()
  for (const spec of taskSpecs) {
    for (const s of spec.slots) {
      if (!roomById.has(s.roomId)) {
        // Note: even roomId=0 is added to roomById (with isRoomAvailable returning true since no unavailable entries).
        // This prevents HC5 from firing on room=0 cases in delta tests.
        roomById.set(s.roomId, { id: s.roomId, name: s.roomId === 0 ? 'UNSCHEDULED' : `R${s.roomId}`, building: 'A', capacity: 100, type: 'NORMAL', availabilities: [] })
      }
    }
  }
  for (const rid of extraRoomIds) {
    if (!roomById.has(rid)) {
      roomById.set(rid, { id: rid, name: `R${rid}`, building: 'A', capacity: 100, type: 'NORMAL', availabilities: [] })
    }
  }

  const tasks: TaskWithRelations[] = taskSpecs.map((spec, i) => ({
    id: i + 1, courseId: i + 1, teacherId: spec.teacherId, semesterId: 1, weekType: 'ALL', startWeek: 1, endWeek: 16,
    remark: null, importBatchId: null,
    course: { id: i + 1, name: `Course-${i + 1}`, code: null, credits: null, isPractice: false },
    teacher: spec.teacherId == null
      ? null
      : { id: spec.teacherId, name: `T${spec.teacherId}`, phone: null, email: null },
    taskClasses: spec.classGroupIds.map((cgId, j) => ({
      id: cgId * 1000 + j + 1,
      teachingTaskId: i + 1,
      classGroupId: cgId,
      classGroup: { id: cgId, name: `G${cgId}`, studentCount: 30, advisorName: null, advisorPhone: null },
    })),
  }))

  const taskById = new Map(tasks.map(t => [t.id, t]))
  const slotsByTask = new Map<number, SlotWithRelations[]>()
  for (const t of tasks) slotsByTask.set(t.id, [])

  const slots: FixtureSlotInput[] = []
  let slotIdCounter = 1000
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

function extractSC9Contribution(details: { type: string; penalty: number }[]): { count: number; total: number } {
  let count = 0
  let total = 0
  for (const d of details) {
    if (d.type === 'SC9_TEACHING_TASK_ROOM_STABILITY') {
      count++
      total += d.penalty
    }
  }
  return { count, total }
}

// ── Full score cases (7 cases) ──────────────────────────────────────

interface FullCase {
  id: string
  title: string
  taskSpecs: TaskSpec[]
  expectedTotalSoft: number
  expectedSC9Soft: number
  expectedSC9Count: number
  note: string
}

const fullCases: FullCase[] = [
  {
    id: 'SC9-TASK-ROOM-STABILITY-SAME-ROOM',
    title: 'Same room: 1 task, 2 slots in room 100 → SC9 0 (size=1)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], slots: [{ day: 1, period: 1, roomId: 100 }, { day: 1, period: 2, roomId: 100 }] },
    ],
    expectedTotalSoft: -10,
    expectedSC9Soft: 0,
    expectedSC9Count: 0,
    note: '1 task, 2 slots both in room 100. distinctRooms={100}, size=1, SC9 0. SC2 fires (1 task 2 same-day) = -10. Total = -10, SC9 = 0. Component assertion verifies SC9 absent.',
  },
  {
    id: 'SC9-TASK-ROOM-STABILITY-TWO-ROOMS',
    title: 'Two rooms: 1 task, 2 slots in room 100 + 200 → SC9 -2',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], slots: [{ day: 1, period: 1, roomId: 100 }, { day: 1, period: 2, roomId: 200 }] },
    ],
    expectedTotalSoft: -12,
    expectedSC9Soft: -2,
    expectedSC9Count: 1,
    note: '1 task, 2 slots in 2 rooms. distinctRooms={100,200}, size=2, SC9=-2. SC2 fires (1 task 2 same-day) = -10. Total = -12, SC9 = -2. Component assertion verifies SC9 details count=1, sum=-2.',
  },
  {
    id: 'SC9-TASK-ROOM-STABILITY-THREE-ROOMS',
    title: 'Three rooms: 1 task, 3 slots in 3 rooms → SC9 -4',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], slots: [{ day: 1, period: 1, roomId: 100 }, { day: 1, period: 2, roomId: 200 }, { day: 1, period: 3, roomId: 300 }] },
    ],
    expectedTotalSoft: -24,
    expectedSC9Soft: -4,
    expectedSC9Count: 1,
    note: '1 task, 3 slots in 3 rooms. distinctRooms={100,200,300}, size=3, SC9=-2*(3-1)=-4. SC2 fires (1 task 3 same-day) = -20. Total = -24, SC9 = -4. Component assertion.',
  },
  {
    id: 'SC9-TASK-ROOM-STABILITY-SINGLE-SLOT',
    title: 'Single slot: 1 task, 1 slot → SC9 0 (no diversity possible)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], slots: [{ day: 1, period: 1, roomId: 100 }] },
    ],
    expectedTotalSoft: 0,
    expectedSC9Soft: 0,
    expectedSC9Count: 0,
    note: '1 task, 1 slot. distinctRooms={100}, size=1, SC9 0. SC2 skip (count=1). SC5 skip. SC3 skip (period 1 < 5). Total = 0.',
  },
  {
    id: 'SC9-TASK-ROOM-STABILITY-ROOM_ZERO-SKIP',
    title: 'Room=0 skip: 1 task, 2 slots: 1 in room 100 + 1 in room 0 → SC9 0',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], slots: [{ day: 1, period: 1, roomId: 100 }, { day: 1, period: 2, roomId: 0 }] },
    ],
    expectedTotalSoft: -10,
    expectedSC9Soft: 0,
    expectedSC9Count: 0,
    note: '1 task, 2 slots: room 100 + room 0. SC2 fires (1 task 2 same-day) = -10. SC9: room=0 skipped, only room 100 counted, distinctRooms={100}, size=1, SC9 0. Total = -10, SC9 = 0. Component assertion verifies SC9 absent.',
  },
  {
    id: 'SC9-TASK-ROOM-STABILITY-WEEKEND-SKIP',
    title: 'Weekend skip: 1 task, 2 slots: 1 day 1 + 1 day 6 → SC9 0 (SC7 fires for day 6)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], slots: [{ day: 1, period: 1, roomId: 100 }, { day: 6, period: 1, roomId: 100 }] },
    ],
    expectedTotalSoft: -15,
    expectedSC9Soft: 0,
    expectedSC9Count: 0,
    note: '1 task, 2 slots: day 1 + day 6. SC2: each task count=1, no fire. SC7 fires (1 weekend slot) = -15. SC9: day 6 skipped, only day 1 counted, distinctRooms={100}, size=1, SC9 0. Total = -15, SC9 = 0. Component assertion verifies SC9 absent (and SC7 fires).',
  },
  {
    id: 'SC9-TASK-ROOM-STABILITY-MULTI-CLASSGROUP',
    title: 'Multi-classGroup: 1 merged task (cg{1,2}), 2 slots in 2 rooms → SC9 -2 (no double count)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [1, 2], slots: [{ day: 1, period: 1, roomId: 100 }, { day: 1, period: 2, roomId: 200 }] },
    ],
    expectedTotalSoft: -12,
    expectedSC9Soft: -2,
    expectedSC9Count: 1,
    note: '1 merged task with classGroups [1, 2], 2 slots in 2 rooms. distinctRooms={100,200}, size=2, SC9=-2 (TeachingTask-level: no expansion). SC2 fires (1 task 2 same-day) = -10. Total = -12, SC9 = -2. Component assertion verifies SC9 details count=1, sum=-2.',
  },
]

// ── Delta cases (4 cases) ───────────────────────────────────────────

interface DeltaCase {
  id: string
  title: string
  taskSpecs: TaskSpec[]
  /** 0-based index into the slots array (after building) */
  moveSlotIdx: number
  newDay: number
  newPeriod: number
  newRoomId: number
  /** Rooms to pre-populate in fixture (for delta cases where newRoomId is not yet referenced by any slot) */
  extraRoomIds?: number[]
  expectedDeltaHard: number
  expectedDeltaSoft: number
  expectedSC9Delta: number
  note: string
}

const deltaCases: DeltaCase[] = [
  {
    id: 'SC9-DELTA-IMPROVE-TWO-ROOMS-TO-ONE',
    title: 'Improve: 2 rooms → 1 room → deltaSoft=+2 (SC9 only)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], slots: [{ day: 1, period: 1, roomId: 100 }, { day: 1, period: 2, roomId: 200 }] },
    ],
    moveSlotIdx: 1,
    newDay: 1,
    newPeriod: 2,
    newRoomId: 100, // move slot 2 from room 200 to room 100
    expectedDeltaHard: 0,
    expectedDeltaSoft: 2,
    expectedSC9Delta: 2,
    note: 'Before: distinctRooms={100,200}, SC9=-2. After: distinctRooms={100}, SC9=0. SC9 delta=+2. SC2: same task same day count=2 both, delta=0. Total = +2. Component assertion.',
  },
  {
    id: 'SC9-DELTA-WORSEN-ONE-ROOM-TO-TWO',
    title: 'Worsen: 1 room → 2 rooms → deltaSoft=-2 (SC9 only)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], slots: [{ day: 1, period: 1, roomId: 100 }, { day: 1, period: 2, roomId: 100 }] },
    ],
    moveSlotIdx: 1,
    newDay: 1,
    newPeriod: 2,
    newRoomId: 200, // move slot 2 from room 100 to room 200
    extraRoomIds: [200],
    expectedDeltaHard: 0,
    expectedDeltaSoft: -2,
    expectedSC9Delta: -2,
    note: 'Before: distinctRooms={100}, SC9=0. After: distinctRooms={100,200}, SC9=-2. SC9 delta=-2. SC2: same task same day count=2 both, delta=0. Total = -2. Component assertion.',
  },
  {
    id: 'SC9-DELTA-ROOM_ZERO-TO-REAL',
    title: 'room=0 → real: distinctRooms {100} → {100, 200} → deltaSoft=-2',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], slots: [{ day: 1, period: 1, roomId: 100 }, { day: 1, period: 2, roomId: 0 }] },
    ],
    moveSlotIdx: 1,
    newDay: 1,
    newPeriod: 2,
    newRoomId: 200, // move slot 2 from room 0 to room 200
    extraRoomIds: [200],
    expectedDeltaHard: 0,
    expectedDeltaSoft: -2,
    expectedSC9Delta: -2,
    note: 'Before: room=0 skipped, distinctRooms={100}, SC9=0. After: distinctRooms={100,200}, SC9=-2. SC9 delta=-2. SC2: same task same day count=2 both, delta=0. Total = -2. Component assertion.',
  },
  {
    id: 'SC9-DELTA-REAL-TO-ROOM_ZERO',
    title: 'real → room=0: distinctRooms {100, 200} → {100} → deltaSoft=+2 (deltaHard=-1000 due to HC5 newAvail=false on room=0)',
    taskSpecs: [
      { teacherId: null, classGroupIds: [100], slots: [{ day: 1, period: 1, roomId: 100 }, { day: 1, period: 2, roomId: 200 }] },
    ],
    moveSlotIdx: 1,
    newDay: 1,
    newPeriod: 2,
    newRoomId: 0, // move slot 2 from room 200 to room 0 (unscheduled)
    extraRoomIds: [200], // pre-add room 200 (room 0 added implicitly by iteration)
    expectedDeltaHard: -1000, // HC5: !newAvail=true (room 0 not in roomById or no availabilities) → deltaHard += HARD_PENALTY = -1000
    expectedDeltaSoft: 2,
    expectedSC9Delta: 2,
    note: 'Before: distinctRooms={100,200}, SC9=-2. After: room=0 skipped, distinctRooms={100}, SC9=0. SC9 delta=+2. SC2: same task same day count=2 both, delta=0. deltaHard=-1000 (HC5 newAvail=false on room=0, HARD_PENALTY=-1000 so += -1000). Total = +2 - 1000. Component assertion.',
  },
]

// ── Run ─────────────────────────────────────────────────────────────

function main() {
  clearWeekCache()
  console.log('K22-F8 Classroom Stability Constraint Verification (Isolated)')
  console.log('============================================================\n')

  // ── Full score cases ──
  for (const tc of fullCases) {
    const ctx = buildSC9Context(tc.taskSpecs)
    // Extract slots from ctx for state building
    const slotInputs = ctx.slots.map(s => ({ id: s.id, teachingTaskId: s.teachingTaskId, dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId ?? 0 }))
    const state = buildStateNormal(slotInputs)
    const result = calculateScoreWithDetails(ctx, state)
    const sc9 = extractSC9Contribution(result.details)
    const totalOK = result.softScore === tc.expectedTotalSoft
    const sc9OK = sc9.total === tc.expectedSC9Soft && sc9.count === tc.expectedSC9Count
    const hardOK = result.hardScore === 0
    const status: Status = (hardOK && totalOK && sc9OK) ? 'PASS' : 'FAIL'
    const breakdown = result.details.map(d => `${d.type}=${d.penalty}`).join(', ')
    record({
      id: tc.id, title: tc.title, status,
      detail: `hard=${result.hardScore} (expect 0); total soft=${result.softScore} (expect ${tc.expectedTotalSoft}); SC9 count=${sc9.count} (expect ${tc.expectedSC9Count}); SC9 sum=${sc9.total} (expect ${tc.expectedSC9Soft})`,
      evidence: [tc.note, `Full breakdown: ${breakdown || '(none)'}`],
    })
  }

  // ── Delta cases ──
  for (const dc of deltaCases) {
    const ctx = buildSC9Context(dc.taskSpecs, dc.extraRoomIds)
    const slotInputs = ctx.slots.map(s => ({ id: s.id, teachingTaskId: s.teachingTaskId, dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId ?? 0 }))
    const state = buildStateIsolated(slotInputs)
    const moveSlotId = slotInputs[dc.moveSlotIdx].id
    const move: Move = { slotId: moveSlotId, newDay: dc.newDay, newSlotIndex: dc.newPeriod, newRoomId: dc.newRoomId }
    const delta = calculateDeltaScore(ctx, state, move)
    // Re-evaluate full scores before/after to extract SC9 component delta
    const stateBefore = { assignments: new Map(slotInputs.map(s => [s.id, { dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId }])), originalAssignments: new Map(slotInputs.map(s => [s.id, { dayOfWeek: 9, slotIndex: 1, roomId: 999 }])) }
    const stateAfter = { assignments: new Map(slotInputs.map(s => [s.id, s.id === moveSlotId ? { dayOfWeek: move.newDay, slotIndex: move.newSlotIndex, roomId: move.newRoomId } : { dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId }])), originalAssignments: new Map(slotInputs.map(s => [s.id, { dayOfWeek: 9, slotIndex: 1, roomId: 999 }])) }
    const sc9Before = extractSC9Contribution(calculateScoreWithDetails(ctx, stateBefore).details)
    const sc9After = extractSC9Contribution(calculateScoreWithDetails(ctx, stateAfter).details)
    const sc9DeltaByComponent = sc9After.total - sc9Before.total
    const totalOK = delta.deltaSoft === dc.expectedDeltaSoft
    const sc9OK = sc9DeltaByComponent === dc.expectedSC9Delta
    const hardOK = delta.deltaHard === dc.expectedDeltaHard
    const status: Status = (hardOK && totalOK && sc9OK) ? 'PASS' : 'FAIL'
    record({
      id: dc.id, title: dc.title, status,
      detail: `deltaHard=${delta.deltaHard} (expect ${dc.expectedDeltaHard}); deltaSoft=${delta.deltaSoft} (expect ${dc.expectedDeltaSoft}); SC9 component delta=${sc9DeltaByComponent} (expect ${dc.expectedSC9Delta}); SC9 details: before count=${sc9Before.count} sum=${sc9Before.total}, after count=${sc9After.count} sum=${sc9After.total}`,
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
