// K34-A3D diagnostic: isolate why K22-C J10/J11 and A2/A3/A3b now FAIL.
// Read-only: does not write to DB or files. Only inspects score.ts behavior
// against the synthetic fixtures from the K22-C harness.
import { calculateScoreWithDetails, calculateDeltaScore, clearWeekCache } from '../src/lib/scheduler/score'
import type { SchedulingContext, SlotWithRelations, TaskWithRelations, RoomWithAvailability, Move, ScheduleState } from '../src/lib/scheduler/score'

clearWeekCache()

function buildSC10Context(specs: Array<{
  id: number
  teacherId: number | null
  classGroupIds: number[]
  classGroupStudentCounts: (number | null)[]
  slots: { day: number; period: number; roomId: number; capacity?: number }[]
  extraRoomIds?: { roomId: number; capacity?: number }[]
}>): SchedulingContext {
  const roomById = new Map<number, RoomWithAvailability>()
  for (const spec of specs) {
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
  const tasks: TaskWithRelations[] = specs.map((spec, i) => {
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

  const slots: { id: number; teachingTaskId: number; dayOfWeek: number; slotIndex: number; roomId: number }[] = []
  let slotIdCounter = 2000
  for (let ti = 0; ti < specs.length; ti++) {
    const spec = specs[ti]
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
  console.log('  DEBUG slotObj[0]:', JSON.stringify({ id: slotObjs[0].id, roomId: slotObjs[0].roomId, additionalRooms: (slotObjs[0] as any).additionalRooms }, null, 2))
  for (const slot of slotObjs) slotsByTask.get(slot.teachingTaskId)!.push(slot)

  return {
    tasks, rooms: Array.from(roomById.values()), slots: slotObjs,
    taskById, roomById, slotsByTask, slotsByRoom: new Map(), slotsByTeacher: new Map(), slotsByClass: new Map()
  }
}

function dumpScore(label: string, ctx: SchedulingContext, state: ScheduleState) {
  const r = calculateScoreWithDetails(ctx, state)
  const sc10 = r.details.filter((d) => d.type === 'SC10_ROOM_CAPACITY_UTILIZATION')
  console.log(`[${label}] hard=${r.hardScore} soft=${r.softScore}`)
  console.log(`  SC10 details (${sc10.length}):`)
  for (const d of sc10) console.log(`    - ${d.message}`)
  console.log(`  All details:`)
  for (const d of r.details) console.log(`    - ${d.type} = ${d.penalty}`)
}

console.log('========== J10: 95 students room 200→100 ==========')
{
  const ctx = buildSC10Context([
    { id: 1, teacherId: null, classGroupIds: [100], classGroupStudentCounts: [95],
      slots: [{ day: 1, period: 1, roomId: 200, capacity: 200 }],
      extraRoomIds: [{ roomId: 100, capacity: 100 }] },
  ])
  const slotId = ctx.slots[0].id
  // Before: in room 200 cap=200
  const stateBefore: ScheduleState = {
    assignments: new Map([[slotId, { dayOfWeek: 1, slotIndex: 1, roomId: 200 }]]),
    originalAssignments: new Map([[slotId, { dayOfWeek: 9, slotIndex: 1, roomId: 999 }]]),
  }
  dumpScore('J10-BEFORE (room=200 cap=200)', ctx, stateBefore)
  // After: in room 100 cap=100
  const stateAfter: ScheduleState = {
    assignments: new Map([[slotId, { dayOfWeek: 1, slotIndex: 1, roomId: 100 }]]),
    originalAssignments: new Map([[slotId, { dayOfWeek: 9, slotIndex: 1, roomId: 999 }]]),
  }
  dumpScore('J10-AFTER (room=100 cap=100)', ctx, stateAfter)
}

console.log('\n========== J11: 20 students room 120→40 ==========')
{
  const ctx = buildSC10Context([
    { id: 1, teacherId: null, classGroupIds: [100], classGroupStudentCounts: [20],
      slots: [{ day: 1, period: 1, roomId: 120, capacity: 120 }],
      extraRoomIds: [{ roomId: 40, capacity: 40 }] },
  ])
  const slotId = ctx.slots[0].id
  const stateBefore: ScheduleState = {
    assignments: new Map([[slotId, { dayOfWeek: 1, slotIndex: 1, roomId: 120 }]]),
    originalAssignments: new Map([[slotId, { dayOfWeek: 9, slotIndex: 1, roomId: 999 }]]),
  }
  dumpScore('J11-BEFORE (room=120 cap=120)', ctx, stateBefore)
  const stateAfter: ScheduleState = {
    assignments: new Map([[slotId, { dayOfWeek: 1, slotIndex: 1, roomId: 40 }]]),
    originalAssignments: new Map([[slotId, { dayOfWeek: 9, slotIndex: 1, roomId: 999 }]]),
  }
  dumpScore('J11-AFTER (room=40 cap=40)', ctx, stateAfter)
}

console.log('\n========== A2: SC1 cross-building move ==========')
{
  // A2 fixture
  const roomById = new Map<number, RoomWithAvailability>()
  roomById.set(100, { id: 100, name: 'A101', building: 'A', capacity: 100, type: 'NORMAL', availabilities: [] })
  roomById.set(200, { id: 200, name: 'B201', building: 'B', capacity: 100, type: 'NORMAL', availabilities: [] })
  const task1: TaskWithRelations = {
    id: 1, courseId: 1, teacherId: 10, semesterId: 1, weekType: 'ALL', startWeek: 1, endWeek: 16,
    remark: null, importBatchId: null,
    course: { id: 1, name: 'A', code: null, credits: null, isPractice: false },
    teacher: { id: 10, name: 'T10', phone: null, email: null },
    taskClasses: [{ id: 1001, teachingTaskId: 1, classGroupId: 1, classGroup: { id: 1, name: 'G1', studentCount: 20, advisorName: null, advisorPhone: null } }],
  }
  const task2: TaskWithRelations = { ...task1, id: 2, course: { id: 2, name: 'A2', code: null, credits: null, isPractice: false } }
  const slot1: SlotWithRelations = { id: 1, teachingTaskId: 1, roomId: 100, dayOfWeek: 1, slotIndex: 1, semesterId: 1, weekType: 'ALL', room: roomById.get(100)!, teachingTask: task1 }
  const slot2: SlotWithRelations = { id: 2, teachingTaskId: 2, roomId: 200, dayOfWeek: 1, slotIndex: 2, semesterId: 1, weekType: 'ALL', room: roomById.get(200)!, teachingTask: task2 }
  const taskById = new Map([[1, task1], [2, task2]])
  const ctx: SchedulingContext = {
    tasks: [task1, task2], rooms: Array.from(roomById.values()), slots: [slot1, slot2],
    taskById, roomById, slotsByTask: new Map([[1, [slot1]], [2, [slot2]]]), slotsByRoom: new Map(), slotsByTeacher: new Map(), slotsByClass: new Map()
  }
  const stateBefore: ScheduleState = {
    assignments: new Map([[1, { dayOfWeek: 1, slotIndex: 1, roomId: 100 }], [2, { dayOfWeek: 1, slotIndex: 2, roomId: 200 }]]),
    originalAssignments: new Map([[1, { dayOfWeek: 1, slotIndex: 1, roomId: 100 }], [2, { dayOfWeek: 1, slotIndex: 2, roomId: 200 }]]),
  }
  dumpScore('A2-BEFORE (slot1=A/1/100, slot2=B/2/200)', ctx, stateBefore)
  const stateAfter: ScheduleState = {
    assignments: new Map([[1, { dayOfWeek: 1, slotIndex: 1, roomId: 100 }], [2, { dayOfWeek: 1, slotIndex: 2, roomId: 100 }]]),
    originalAssignments: new Map([[1, { dayOfWeek: 1, slotIndex: 1, roomId: 100 }], [2, { dayOfWeek: 1, slotIndex: 2, roomId: 200 }]]),
  }
  dumpScore('A2-AFTER (slot2 moved to A/2/100)', ctx, stateAfter)
  // delta
  const deltaMove: Move = { slotId: 2, newDay: 1, newSlotIndex: 2, newRoomId: 100 }
  const d = calculateDeltaScore(ctx, stateBefore, deltaMove)
  console.log(`  delta: hard=${d.deltaHard} soft=${d.deltaSoft}`)
}
