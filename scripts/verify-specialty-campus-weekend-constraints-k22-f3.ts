/**
 * K22-F3 Specialty Campus Weekend Constraints Verification
 *
 * Verifies HC6 (non-automotive forbidden in Linxiao), SC6 (automotive prefers Linxiao),
 * and SC7 (weekend avoidance) with 16 harness cases.
 *
 * Strong constraints:
 *   - NO Prisma writes. NO DB access.
 *   - NO score.ts modifications beyond K22-F3 scope.
 *
 * Cases covered:
 *   AUTO_ONLY-LINXIAO, AUTO_ONLY-NON_LINXIAO, NON_AUTO-LINXIAO, NON_AUTO-NON_LINXIAO,
 *   MIXED-LINXIAO, MIXED-NON_LINXIAO, COURSE_NAME_AUTO-BUT-NON_AUTO_CLASS-LINXIAO,
 *   REMARK_AUTO-BUT-NON_AUTO_CLASS-LINXIAO, NO_CLASSGROUP_AUX_AUTO_SIGNAL-LINXIAO,
 *   UNKNOWN_NO_SIGNAL-LINXIAO, SC7-WEEKEND, SC7-WEEKDAY,
 *   DELTA-AUTO-NON_LINXIAO-TO-LINXIAO, DELTA-NON_AUTO-NON_LINXIAO-TO-LINXIAO,
 *   DELTA-MIXED-NON_LINXIAO-TO-LINXIAO, DELTA-WEEKDAY-TO-WEEKEND
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
  teacherId: number | null
  courseId?: number
  courseName?: string
  remark?: string | null
  classGroupIds?: number[]
  classGroupNames?: string[]
  classGroupStudentCounts?: (number | null)[]
  weekType?: string
  startWeek?: number
  endWeek?: number
}

interface FixtureRoomInput {
  id: number
  name: string
  building: string | null
  capacity?: number
}

interface FixtureSlotInput {
  id: number
  teachingTaskId: number
  dayOfWeek: number
  slotIndex: number
  roomId: number
  semesterId?: number
}

function buildContext(
  taskInputs: FixtureTaskInput[],
  roomInputs: FixtureRoomInput[],
  slotInputs: FixtureSlotInput[],
): SchedulingContext {
  const tasks: TaskWithRelations[] = taskInputs.map((t) => ({
    id: t.id,
    courseId: t.courseId ?? t.id,
    teacherId: t.teacherId,
    semesterId: 1,
    weekType: t.weekType ?? 'ALL',
    startWeek: t.startWeek ?? 1,
    endWeek: t.endWeek ?? 16,
    remark: t.remark ?? null,
    importBatchId: null,
    course: {
      id: t.courseId ?? t.id,
      name: t.courseName ?? `Course-${t.id}`,
      code: null,
      credits: null,
      isPractice: false,
    },
    teacher: t.teacherId == null
      ? null
      : { id: t.teacherId, name: `Teacher-${t.teacherId}`, phone: null, email: null },
    taskClasses: (t.classGroupIds ?? []).map((cgId, i) => ({
      id: cgId * 1000 + i,
      teachingTaskId: t.id,
      classGroupId: cgId,
      classGroup: {
        id: cgId,
        name: t.classGroupNames?.[i] ?? `Class-${cgId}`,
        studentCount: t.classGroupStudentCounts?.[i] ?? null,
        advisorName: null,
        advisorPhone: null,
      },
    })),
  }))

  const rooms: RoomWithAvailability[] = roomInputs.map((r) => ({
    id: r.id,
    name: r.name,
    building: r.building,
    capacity: r.capacity ?? 50,
    type: 'NORMAL',
    availabilities: [],
  }))

  const slots: SlotWithRelations[] = slotInputs.map((s) => {
    const task = tasks.find((t) => t.id === s.teachingTaskId)!
    const room = rooms.find((r) => r.id === s.roomId)!
    return {
      id: s.id,
      teachingTaskId: s.teachingTaskId,
      roomId: s.roomId,
      dayOfWeek: s.dayOfWeek,
      slotIndex: s.slotIndex,
      semesterId: s.semesterId ?? 1,
      weekType: 'ALL',
      room,
      teachingTask: task,
    }
  })

  const taskById = new Map<number, TaskWithRelations>(tasks.map((t) => [t.id, t]))
  const roomById = new Map<number, RoomWithAvailability>(rooms.map((r) => [r.id, r]))
  const slotsByTask = new Map<number, SlotWithRelations[]>()
  const slotsByRoom = new Map<string, SlotWithRelations[]>()
  const slotsByTeacher = new Map<string, SlotWithRelations[]>()
  const slotsByClass = new Map<string, SlotWithRelations[]>()

  for (const slot of slots) {
    let arr = slotsByTask.get(slot.teachingTaskId)
    if (!arr) { arr = []; slotsByTask.set(slot.teachingTaskId, arr) }
    arr.push(slot)

    const rk = `${slot.roomId}-${slot.dayOfWeek}-${slot.slotIndex}`
    let rArr = slotsByRoom.get(rk)
    if (!rArr) { rArr = []; slotsByRoom.set(rk, rArr) }
    rArr.push(slot)

    if (slot.teachingTask.teacherId != null) {
      const tk = `${slot.teachingTask.teacherId}-${slot.dayOfWeek}-${slot.slotIndex}`
      let tArr = slotsByTeacher.get(tk)
      if (!tArr) { tArr = []; slotsByTeacher.set(tk, tArr) }
      tArr.push(slot)
    }

    for (const tc of slot.teachingTask.taskClasses) {
      const ck = `${tc.classGroupId}-${slot.dayOfWeek}-${slot.slotIndex}`
      let cArr = slotsByClass.get(ck)
      if (!cArr) { cArr = []; slotsByClass.set(ck, cArr) }
      cArr.push(slot)
    }
  }

  return { tasks, rooms, slots, taskById, roomById, slotsByTask, slotsByRoom, slotsByTeacher, slotsByClass }
}

function buildStateFromSlots(ctx: SchedulingContext): ScheduleState {
  const assignments = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  for (const slot of ctx.slots) {
    assignments.set(slot.id, { dayOfWeek: slot.dayOfWeek, slotIndex: slot.slotIndex, roomId: slot.roomId ?? 0 })
  }
  return { assignments, originalAssignments: new Map(assignments) }
}

/**
 * Build state where originalAssignments is set to a THIRD position that differs from
 * both the old (current) and new (target) positions. This ensures MIN_PERT fires at
 * BOTH the before and after states, and the MIN_PERT contributions cancel out (net zero).
 * This isolates the HC6/SC6/SC7 delta contribution from MIN_PERT.
 *
 * Key insight: if original = {day=2, roomId=300} (neither old nor new), then:
 *   - Before: slot at old ≠ original → MIN_PERT fires (-2)
 *   - After: slot at new ≠ original → MIN_PERT fires (-2)
 *   - Delta: -2 - (-2) = 0 → MIN_PERT net zero
 */
function buildStateForDeltaTarget(
  ctx: SchedulingContext,
  targetSlotId: number,
): ScheduleState {
  const assignments = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  const originalAssignments = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  for (const slot of ctx.slots) {
    const pos = { dayOfWeek: slot.dayOfWeek, slotIndex: slot.slotIndex, roomId: slot.roomId ?? 0 }
    assignments.set(slot.id, pos)
    // For the target slot, set originalAssignments to a THIRD position that differs from
    // both the current (old) position and the target (new) position.
    // This makes MIN_PERT fire at both old and new, netting zero.
    if (slot.id === targetSlotId) {
      originalAssignments.set(slot.id, { dayOfWeek: 9, slotIndex: 1, roomId: 999 })
    } else {
      originalAssignments.set(slot.id, { ...pos })
    }
  }
  return { assignments, originalAssignments }
}

// ── Linxiao rooms ───────────────────────────────────────────────────

const LX_ROOM: FixtureRoomInput = { id: 100, name: '林校301', building: null, capacity: 100 }
const NON_LX_ROOM: FixtureRoomInput = { id: 200, name: 'A101', building: 'A', capacity: 100 }

// ── Full score cases ────────────────────────────────────────────────

interface FullScoreCase {
  id: string
  title: string
  taskInput: FixtureTaskInput
  room: FixtureRoomInput
  dayOfWeek: number
  expectedHard: number
  expectedSoft: number
  note: string
}

const fullScoreCases: FullScoreCase[] = [
  // ── SC6 cases ──
  {
    id: 'AUTO_ONLY-LINXIAO',
    title: 'Automotive-only in Linxiao → no penalty',
    taskInput: { id: 1, teacherId: 10, courseName: '汽车检测', classGroupIds: [1], classGroupNames: ['汽车检测1班'] },
    room: LX_ROOM,
    dayOfWeek: 1,
    expectedHard: 0,
    expectedSoft: 0,
    note: 'AUTOMOTIVE_ONLY in Linxiao: no HC6, no SC6.',
  },
  {
    id: 'AUTO_ONLY-NON_LINXIAO',
    title: 'Automotive-only in non-Linxiao → soft -20',
    taskInput: { id: 1, teacherId: 10, courseName: '汽车检测', classGroupIds: [1], classGroupNames: ['汽车检测1班'] },
    room: NON_LX_ROOM,
    dayOfWeek: 1,
    expectedHard: 0,
    expectedSoft: -20,
    note: 'AUTOMOTIVE_ONLY not in Linxiao: SC6 -20.',
  },
  // ── HC6 cases ──
  {
    id: 'NON_AUTO-LINXIAO',
    title: 'Non-automotive in Linxiao → hard -1000',
    taskInput: { id: 1, teacherId: 10, courseName: '高等数学', classGroupIds: [1], classGroupNames: ['计算机1班'] },
    room: LX_ROOM,
    dayOfWeek: 1,
    expectedHard: -1000,
    expectedSoft: 0,
    note: 'NON_AUTOMOTIVE_ONLY in Linxiao: HC6 -1000.',
  },
  {
    id: 'NON_AUTO-NON_LINXIAO',
    title: 'Non-automotive in non-Linxiao → no penalty',
    taskInput: { id: 1, teacherId: 10, courseName: '高等数学', classGroupIds: [1], classGroupNames: ['计算机1班'] },
    room: NON_LX_ROOM,
    dayOfWeek: 1,
    expectedHard: 0,
    expectedSoft: 0,
    note: 'NON_AUTOMOTIVE_ONLY not in Linxiao: no penalty.',
  },
  {
    id: 'MIXED-LINXIAO',
    title: 'MIXED classGroup in Linxiao → hard -1000 (K22-F2A correction)',
    // K22-F11: explicit classGroupStudentCounts= [40, 40] (total 80, util 0.80 in cap=100) so SC10 doesn't fire.
    // Without these, FALLBACK=50×2=100 yields util 1.0 and fires SC10 tight (-2).
    taskInput: { id: 1, teacherId: 10, courseName: '综合实践', classGroupIds: [1, 2], classGroupNames: ['汽车检测1班', '计算机1班'], classGroupStudentCounts: [40, 40] },
    room: LX_ROOM,
    dayOfWeek: 1,
    expectedHard: -1000,
    expectedSoft: 0,
    note: 'MIXED in Linxiao: HC6 -1000 (has non-automotive students). K22-F11: explicit counts prevent SC10 fire.',
  },
  {
    id: 'MIXED-NON_LINXIAO',
    title: 'MIXED classGroup in non-Linxiao → no penalty',
    // K22-F11: explicit classGroupStudentCounts= [40, 40] (total 80, util 0.80 in cap=100) so SC10 doesn't fire.
    taskInput: { id: 1, teacherId: 10, courseName: '综合实践', classGroupIds: [1, 2], classGroupNames: ['汽车检测1班', '计算机1班'], classGroupStudentCounts: [40, 40] },
    room: NON_LX_ROOM,
    dayOfWeek: 1,
    expectedHard: 0,
    expectedSoft: 0,
    note: 'MIXED not in Linxiao: no penalty. K22-F11: explicit counts prevent SC10 fire.',
  },
  {
    id: 'COURSE_NAME_AUTO-BUT-NON_AUTO_CLASS-LINXIAO',
    title: 'courseName has 汽车 but non-auto classGroup in Linxiao → hard -1000',
    taskInput: { id: 1, teacherId: 10, courseName: '汽车概论', classGroupIds: [1], classGroupNames: ['计算机1班'] },
    room: LX_ROOM,
    dayOfWeek: 1,
    expectedHard: -1000,
    expectedSoft: 0,
    note: 'K22-F2A: courseName cannot override classGroup hard rule. ClassGroup dominates → NON_AUTOMOTIVE_ONLY → HC6 -1000.',
  },
  {
    id: 'REMARK_AUTO-BUT-NON_AUTO_CLASS-LINXIAO',
    title: 'remark has 汽车 but non-auto classGroup in Linxiao → hard -1000',
    taskInput: { id: 1, teacherId: 10, courseName: '综合实践', remark: '汽车专业', classGroupIds: [1], classGroupNames: ['计算机1班'] },
    room: LX_ROOM,
    dayOfWeek: 1,
    expectedHard: -1000,
    expectedSoft: 0,
    note: 'K22-F2A: remark cannot override classGroup hard rule. ClassGroup dominates → NON_AUTOMOTIVE_ONLY → HC6 -1000.',
  },
  // ── No classGroup / unknown cases ──
  {
    id: 'NO_CLASSGROUP_AUX_AUTO_SIGNAL-LINXIAO',
    title: 'No classGroup, courseName has 汽车, in Linxiao → hard -1000 (conservative)',
    taskInput: { id: 1, teacherId: 10, courseName: '汽车概论', classGroupIds: [] },
    room: LX_ROOM,
    dayOfWeek: 1,
    expectedHard: -1000,
    expectedSoft: 0,
    note: 'NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL in Linxiao: conservative → HC6 -1000.',
  },
  {
    id: 'UNKNOWN_NO_SIGNAL-LINXIAO',
    title: 'No classGroup, no signal, in Linxiao → hard -1000 (conservative)',
    taskInput: { id: 1, teacherId: 10, courseName: '高等数学', classGroupIds: [] },
    room: LX_ROOM,
    dayOfWeek: 1,
    expectedHard: -1000,
    expectedSoft: 0,
    note: 'UNKNOWN_NO_SIGNAL in Linxiao: conservative → HC6 -1000.',
  },
  // ── SC7 cases ──
  {
    id: 'SC7-WEEKEND',
    title: 'Weekend slot (dayOfWeek=6) → soft -15',
    taskInput: { id: 1, teacherId: 10, courseName: '高等数学', classGroupIds: [1], classGroupNames: ['计算机1班'] },
    room: NON_LX_ROOM,
    dayOfWeek: 6,
    expectedHard: 0,
    expectedSoft: -15,
    note: 'SC7: weekend (day 6) → -15.',
  },
  {
    id: 'SC7-WEEKDAY',
    title: 'Weekday slot (dayOfWeek=3) → no weekend penalty',
    taskInput: { id: 1, teacherId: 10, courseName: '高等数学', classGroupIds: [1], classGroupNames: ['计算机1班'] },
    room: NON_LX_ROOM,
    dayOfWeek: 3,
    expectedHard: 0,
    expectedSoft: 0,
    note: 'SC7: weekday (day 3) → no penalty.',
  },
]

// ── Delta score cases ───────────────────────────────────────────────

interface DeltaCase {
  id: string
  title: string
  taskInput: FixtureTaskInput
  oldRoom: FixtureRoomInput
  oldDay: number
  newRoom: FixtureRoomInput
  newDay: number
  expectedDeltaHard: number
  expectedDeltaSoft: number
  note: string
}

const deltaCases: DeltaCase[] = [
  {
    id: 'DELTA-AUTO-NON_LINXIAO-TO-LINXIAO',
    title: 'Move AUTOMOTIVE_ONLY from non-Linxiao to Linxiao → deltaSoft=+20 (SC6 isolated)',
    taskInput: { id: 1, teacherId: 10, courseName: '汽车检测', classGroupIds: [1], classGroupNames: ['汽车检测1班'] },
    oldRoom: NON_LX_ROOM,
    oldDay: 1,
    newRoom: LX_ROOM,
    newDay: 1,
    expectedDeltaHard: 0,
    expectedDeltaSoft: 20,
    note: 'SC6 cleared: +20. MIN_PERT isolated (originalAssignments=target).',
  },
  {
    id: 'DELTA-NON_AUTO-NON_LINXIAO-TO-LINXIAO',
    title: 'Move NON_AUTOMOTIVE_ONLY to Linxiao → deltaHard=-1000 (HC6 isolated)',
    taskInput: { id: 1, teacherId: 10, courseName: '高等数学', classGroupIds: [1], classGroupNames: ['计算机1班'] },
    oldRoom: NON_LX_ROOM,
    oldDay: 1,
    newRoom: LX_ROOM,
    newDay: 1,
    expectedDeltaHard: -1000,
    expectedDeltaSoft: 0,
    note: 'HC6 introduced: -1000. MIN_PERT isolated.',
  },
  {
    id: 'DELTA-MIXED-NON_LINXIAO-TO-LINXIAO',
    title: 'Move MIXED to Linxiao → deltaHard=-1000 (HC6 for MIXED, K22-F2A)',
    // K22-F11: explicit classGroupStudentCounts= [40, 40] (total 80, util 0.80 in cap=100) so SC10 doesn't fire.
    taskInput: { id: 1, teacherId: 10, courseName: '综合实践', classGroupIds: [1, 2], classGroupNames: ['汽车检测1班', '计算机1班'], classGroupStudentCounts: [40, 40] },
    oldRoom: NON_LX_ROOM,
    oldDay: 1,
    newRoom: LX_ROOM,
    newDay: 1,
    expectedDeltaHard: -1000,
    expectedDeltaSoft: 0,
    note: 'HC6 introduced for MIXED: -1000. MIN_PERT isolated. K22-F11: explicit counts prevent SC10 fire.',
  },
  {
    id: 'DELTA-WEEKDAY-TO-WEEKEND',
    title: 'Move from weekday to weekend → deltaSoft=-15 (SC7 isolated)',
    taskInput: { id: 1, teacherId: 10, courseName: '高等数学', classGroupIds: [1], classGroupNames: ['计算机1班'] },
    oldRoom: NON_LX_ROOM,
    oldDay: 3,
    newRoom: NON_LX_ROOM,
    newDay: 6,
    expectedDeltaHard: 0,
    expectedDeltaSoft: -15,
    note: 'SC7 introduced: -15. MIN_PERT isolated (originalAssignments=target).',
  },
]

// ── Run ─────────────────────────────────────────────────────────────

function main() {
  clearWeekCache()
  console.log('K22-F3 Specialty Campus Weekend Constraints Verification')
  console.log('=======================================================\n')

  // ── Full score cases ──
  for (const tc of fullScoreCases) {
    const ctx = buildContext(
      [tc.taskInput],
      [tc.room, tc.taskInput.classGroupIds?.length ? NON_LX_ROOM : LX_ROOM], // ensure non-LX room exists for delta cases
      [{ id: 1, teachingTaskId: tc.taskInput.id, dayOfWeek: tc.dayOfWeek, slotIndex: 1, roomId: tc.room.id }],
    )
    const state = buildStateFromSlots(ctx)
    const result = calculateScoreWithDetails(ctx, state)

    const hardOK = result.hardScore === tc.expectedHard
    const softOK = result.softScore === tc.expectedSoft
    const status: Status = hardOK && softOK ? 'PASS' : 'FAIL'

    record({
      id: tc.id,
      title: tc.title,
      status,
      detail: `hard=${result.hardScore} (expect ${tc.expectedHard}), soft=${result.softScore} (expect ${tc.expectedSoft})`,
      evidence: [tc.note],
    })
  }

  // ── Delta score cases ──
  for (const dc of deltaCases) {
    const ctx = buildContext(
      [dc.taskInput],
      [dc.oldRoom, dc.newRoom],
      [{ id: 1, teachingTaskId: dc.taskInput.id, dayOfWeek: dc.oldDay, slotIndex: 1, roomId: dc.oldRoom.id }],
    )
    // Use buildStateForDeltaTarget to set originalAssignments to the TARGET position.
    // This isolates the HC6/SC6/SC7 delta from MIN_PERT:
    // When the move brings the slot to the target, it "returns to original" and MIN_PERT is cleared.
    const state = buildStateForDeltaTarget(ctx, 1)
    const move: Move = { slotId: 1, newDay: dc.newDay, newSlotIndex: 1, newRoomId: dc.newRoom.id }
    const delta = calculateDeltaScore(ctx, state, move)

    const hardOK = delta.deltaHard === dc.expectedDeltaHard
    const softOK = delta.deltaSoft === dc.expectedDeltaSoft
    const status: Status = hardOK && softOK ? 'PASS' : 'FAIL'

    record({
      id: dc.id,
      title: dc.title,
      status,
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
