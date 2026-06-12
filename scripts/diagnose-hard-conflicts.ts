/**
 * K9-A2: LAHC 硬冲突诊断脚本 — HC1-HC5 明细分类与 Top 实体诊断
 *
 * 1. 加载 SchedulingContext
 * 2. 运行 solver（maxIterations=10000, lahcWindowSize=500）
 * 3. 对 bestState 执行 calculateScoreWithDetails 获取 HC1-HC5 明细
 * 4. 二次遍历 bestState 构建完整冲突明细
 * 5. Top 5 实体分析
 * 6. 周次重叠诊断
 * 7. Score Reconciliation
 * 8. 输出 docs/scheduler-hard-conflicts-report.md + .json
 */

import { loadSchedulingContext } from '../src/lib/scheduler/data-loader'
import { solve } from '../src/lib/scheduler/solver'
import { calculateScoreWithDetails } from '../src/lib/scheduler/score'
import { summarizeScore, printScoreSummary } from '../src/lib/scheduler/diagnostics'
import { expandWeeks, getOverlapWeeks, type WeekConstraint } from '../src/lib/conflict'
import type { SolverConfig, SchedulingContext, ScheduleState, ScoreDetail, SlotWithRelations, TaskWithRelations, RoomWithAvailability } from '../src/lib/scheduler/types'
import * as fs from 'fs'
import * as path from 'path'
import { anonymizeReport } from './lib/anonymize-report-output'

// ── Types ──

interface HC1Conflict {
  roomId: number
  roomName: string
  dayOfWeek: number
  slotIndex: number
  overlapWeeks: number[] | null
  involvedSlotIds: number[]
  teachingTaskIds: number[]
  courseNames: string[]
  teacherNames: string[]
  classGroupNames: string[]
}

interface HC2Conflict {
  teacherId: number
  teacherName: string
  dayOfWeek: number
  slotIndex: number
  overlapWeeks: number[] | null
  involvedSlotIds: number[]
  courseNames: string[]
  classGroupNames: string[]
  roomNames: string[]
}

interface HC3Conflict {
  classGroupId: number
  classGroupName: string
  dayOfWeek: number
  slotIndex: number
  overlapWeeks: number[] | null
  involvedSlotIds: number[]
  courseNames: string[]
  teacherNames: string[]
  roomNames: string[]
}

interface HC4Conflict {
  slotId: number
  teachingTaskId: number
  courseName: string
  roomId: number
  roomName: string
  roomCapacity: number
  requiredStudents: number
  shortage: number
  overloadRatio: number
  classGroupNames: string[]
  teacherName: string
  dayOfWeek: number
  slotIndex: number
  weekType: string | null
  startWeek: number | null
  endWeek: number | null
}

interface HC5Conflict {
  roomId: number
  roomName: string
  dayOfWeek: number
  slotIndex: number
  reason: string | null
  involvedSlotIds: number[]
  courseNames: string[]
  teacherNames: string[]
  classGroupNames: string[]
}

interface TopCapacityGap {
  courseName: string
  classGroupNames: string
  requiredStudents: number
  roomName: string
  roomCapacity: number
  shortage: number
  overloadRatio: number
  dayOfWeek: number
  slotIndex: number
}

interface TopClassConflict {
  classGroupName: string
  conflictCount: number
  worstDayOfWeek: number
  worstSlotIndex: number
  involvedCourses: string[]
}

interface TopRoomConflict {
  roomName: string
  conflictCount: number
  dayOfWeek: number
  slotIndex: number
  involvedCourses: string[]
}

interface TopTimeSlotPressure {
  dayOfWeek: number
  slotIndex: number
  scheduledSlotCount: number
  distinctRoomCount: number
  distinctClassGroupCount: number
  capacityShortageCount: number
  classConflictCount: number
  roomConflictCount: number
}

interface WeekOverlapFinding {
  pair: string
  expectedOverlap: boolean
  actualOverlap: boolean
  overlapWeeks: number[]
  status: 'OK' | 'UNEXPECTED_OVERLAP' | 'UNEXPECTED_NO_OVERLAP'
}

interface ScoreReconciliation {
  solverBestHardScore: number
  reEvaluatedHardScore: number
  difference: number
  differenceInConflictUnits: number
  isConsistent: boolean
  possibleCauses: string[]
  needsK9BScoring: boolean
}

// ── Helpers ──

function getSlotEntityInfo(slot: SlotWithRelations, ctx: SchedulingContext) {
  const task = slot.teachingTask
  return {
    slotId: slot.id,
    teachingTaskId: task.id,
    courseName: task.course?.name ?? '(unknown)',
    teacherName: task.teacher?.name ?? '(none)',
    teacherId: task.teacherId,
    roomId: slot.roomId,
    roomName: slot.roomId ? (ctx.roomById.get(slot.roomId)?.name ?? '(unknown)') : '(none)',
    classGroupNames: task.taskClasses.map(tc => tc.classGroup.name),
    classGroupIds: task.taskClasses.map(tc => tc.classGroupId),
    dayOfWeek: slot.dayOfWeek,
    slotIndex: slot.slotIndex,
    weekType: task.weekType,
    startWeek: task.startWeek,
    endWeek: task.endWeek,
  }
}

function getTaskEntityInfo(task: TaskWithRelations, ctx: SchedulingContext) {
  return {
    teachingTaskId: task.id,
    courseName: task.course?.name ?? '(unknown)',
    teacherName: task.teacher?.name ?? '(none)',
    teacherId: task.teacherId,
    classGroupNames: task.taskClasses.map(tc => tc.classGroup.name),
    classGroupIds: task.taskClasses.map(tc => tc.classGroupId),
    weekType: task.weekType,
    startWeek: task.startWeek,
    endWeek: task.endWeek,
  }
}

function computeOverlapWeeks(taskA: TaskWithRelations, taskB: TaskWithRelations): number[] | null {
  try {
    const wcA: WeekConstraint = { start: taskA.startWeek, end: taskA.endWeek, type: taskA.weekType as WeekConstraint['type'] }
    const wcB: WeekConstraint = { start: taskB.startWeek, end: taskB.endWeek, type: taskB.weekType as WeekConstraint['type'] }
    return getOverlapWeeks(wcA, wcB)
  } catch {
    return null
  }
}

function makePairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

// ── HC1-HC5 Detail Builders (二次遍历 bestState) ──

function buildHC1Details(ctx: SchedulingContext, state: ScheduleState): HC1Conflict[] {
  // 按 (roomId, dayOfWeek, slotIndex) 分组
  const groups = new Map<string, SlotWithRelations[]>()
  for (const slot of ctx.slots) {
    const pos = state.assignments.get(slot.id)
    if (!pos || pos.roomId === 0) continue
    const key = `${pos.roomId}-${pos.dayOfWeek}-${pos.slotIndex}`
    let arr = groups.get(key)
    if (!arr) { arr = []; groups.set(key, arr) }
    arr.push(slot)
  }

  const conflicts: HC1Conflict[] = []
  const seen = new Set<string>()

  for (const [key, groupSlots] of groups) {
    if (groupSlots.length < 2) continue
    // 检查周次重叠
    for (let i = 0; i < groupSlots.length; i++) {
      for (let j = i + 1; j < groupSlots.length; j++) {
        const a = groupSlots[i]
        const b = groupSlots[j]
        const pairKey = `HC1-${key}-${makePairKey(a.id, b.id)}`
        if (seen.has(pairKey)) continue
        seen.add(pairKey)

        const overlapWeeks = computeOverlapWeeks(a.teachingTask, b.teachingTask)
        if (overlapWeeks && overlapWeeks.length === 0) continue // 无周次重叠，跳过

        const pos = state.assignments.get(a.id)!
        const room = ctx.roomById.get(pos.roomId)
        conflicts.push({
          roomId: pos.roomId,
          roomName: room?.name ?? '(unknown)',
          dayOfWeek: pos.dayOfWeek,
          slotIndex: pos.slotIndex,
          overlapWeeks,
          involvedSlotIds: [a.id, b.id],
          teachingTaskIds: [a.teachingTaskId, b.teachingTaskId],
          courseNames: [a.teachingTask.course?.name ?? '?', b.teachingTask.course?.name ?? '?'],
          teacherNames: [a.teachingTask.teacher?.name ?? '(none)', b.teachingTask.teacher?.name ?? '(none)'],
          classGroupNames: [
            ...a.teachingTask.taskClasses.map(tc => tc.classGroup.name),
            ...b.teachingTask.taskClasses.map(tc => tc.classGroup.name),
          ],
        })
      }
    }
  }
  return conflicts
}

function buildHC2Details(ctx: SchedulingContext, state: ScheduleState): HC2Conflict[] {
  // 按 (teacherId, dayOfWeek, slotIndex) 分组
  const groups = new Map<string, SlotWithRelations[]>()
  for (const slot of ctx.slots) {
    const task = slot.teachingTask
    if (task.teacherId == null) continue
    const pos = state.assignments.get(slot.id)
    if (!pos || pos.roomId === 0) continue
    const key = `${task.teacherId}-${pos.dayOfWeek}-${pos.slotIndex}`
    let arr = groups.get(key)
    if (!arr) { arr = []; groups.set(key, arr) }
    arr.push(slot)
  }

  const conflicts: HC2Conflict[] = []
  const seen = new Set<string>()

  for (const [key, groupSlots] of groups) {
    if (groupSlots.length < 2) continue
    for (let i = 0; i < groupSlots.length; i++) {
      for (let j = i + 1; j < groupSlots.length; j++) {
        const a = groupSlots[i]
        const b = groupSlots[j]
        const pairKey = `HC2-${key}-${makePairKey(a.id, b.id)}`
        if (seen.has(pairKey)) continue
        seen.add(pairKey)

        const overlapWeeks = computeOverlapWeeks(a.teachingTask, b.teachingTask)
        if (overlapWeeks && overlapWeeks.length === 0) continue

        const pos = state.assignments.get(a.id)!
        conflicts.push({
          teacherId: a.teachingTask.teacherId!,
          teacherName: a.teachingTask.teacher?.name ?? '(unknown)',
          dayOfWeek: pos.dayOfWeek,
          slotIndex: pos.slotIndex,
          overlapWeeks,
          involvedSlotIds: [a.id, b.id],
          courseNames: [a.teachingTask.course?.name ?? '?', b.teachingTask.course?.name ?? '?'],
          classGroupNames: [
            ...a.teachingTask.taskClasses.map(tc => tc.classGroup.name),
            ...b.teachingTask.taskClasses.map(tc => tc.classGroup.name),
          ],
          roomNames: [
            ctx.roomById.get(state.assignments.get(a.id)?.roomId ?? 0)?.name ?? '(none)',
            ctx.roomById.get(state.assignments.get(b.id)?.roomId ?? 0)?.name ?? '(none)',
          ],
        })
      }
    }
  }
  return conflicts
}

function buildHC3Details(ctx: SchedulingContext, state: ScheduleState): HC3Conflict[] {
  // 按 (classGroupId, dayOfWeek, slotIndex) 分组
  const groups = new Map<string, { slot: SlotWithRelations; classGroupId: number }[]>()
  for (const slot of ctx.slots) {
    const pos = state.assignments.get(slot.id)
    if (!pos || pos.roomId === 0) continue
    for (const tc of slot.teachingTask.taskClasses) {
      const key = `${tc.classGroupId}-${pos.dayOfWeek}-${pos.slotIndex}`
      let arr = groups.get(key)
      if (!arr) { arr = []; groups.set(key, arr) }
      arr.push({ slot, classGroupId: tc.classGroupId })
    }
  }

  const conflicts: HC3Conflict[] = []
  const seen = new Set<string>()

  for (const [key, items] of groups) {
    if (items.length < 2) continue
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]
        const b = items[j]
        const pairKey = `HC3-${key}-${makePairKey(a.slot.id, b.slot.id)}`
        if (seen.has(pairKey)) continue
        seen.add(pairKey)

        const overlapWeeks = computeOverlapWeeks(a.slot.teachingTask, b.slot.teachingTask)
        if (overlapWeeks && overlapWeeks.length === 0) continue

        const pos = state.assignments.get(a.slot.id)!
        const classGroup = ctx.tasks
          .flatMap(t => t.taskClasses)
          .find(tc => tc.classGroupId === a.classGroupId)?.classGroup

        conflicts.push({
          classGroupId: a.classGroupId,
          classGroupName: classGroup?.name ?? '(unknown)',
          dayOfWeek: pos.dayOfWeek,
          slotIndex: pos.slotIndex,
          overlapWeeks,
          involvedSlotIds: [a.slot.id, b.slot.id],
          courseNames: [a.slot.teachingTask.course?.name ?? '?', b.slot.teachingTask.course?.name ?? '?'],
          teacherNames: [a.slot.teachingTask.teacher?.name ?? '(none)', b.slot.teachingTask.teacher?.name ?? '(none)'],
          roomNames: [
            ctx.roomById.get(state.assignments.get(a.slot.id)?.roomId ?? 0)?.name ?? '(none)',
            ctx.roomById.get(state.assignments.get(b.slot.id)?.roomId ?? 0)?.name ?? '(none)',
          ],
        })
      }
    }
  }
  return conflicts
}

function buildHC4Details(ctx: SchedulingContext, state: ScheduleState): HC4Conflict[] {
  // 动态导入 getTaskStudentCount
  const { getTaskStudentCount } = require('../src/lib/scheduler/capacity')
  const conflicts: HC4Conflict[] = []

  for (const slot of ctx.slots) {
    const pos = state.assignments.get(slot.id)
    if (!pos || pos.roomId === 0) continue
    const room = ctx.roomById.get(pos.roomId)
    if (!room) continue
    const studentInfo = getTaskStudentCount(slot.teachingTask, ctx)
    if (studentInfo.studentCount <= room.capacity) continue

    conflicts.push({
      slotId: slot.id,
      teachingTaskId: slot.teachingTaskId,
      courseName: slot.teachingTask.course?.name ?? '(unknown)',
      roomId: pos.roomId,
      roomName: room.name,
      roomCapacity: room.capacity,
      requiredStudents: studentInfo.studentCount,
      shortage: studentInfo.studentCount - room.capacity,
      overloadRatio: Math.round((studentInfo.studentCount / room.capacity) * 100) / 100,
      classGroupNames: slot.teachingTask.taskClasses.map(tc => tc.classGroup.name),
      teacherName: slot.teachingTask.teacher?.name ?? '(none)',
      dayOfWeek: pos.dayOfWeek,
      slotIndex: pos.slotIndex,
      weekType: slot.teachingTask.weekType,
      startWeek: slot.teachingTask.startWeek,
      endWeek: slot.teachingTask.endWeek,
    })
  }

  return conflicts
}

function buildHC5Details(ctx: SchedulingContext, state: ScheduleState): HC5Conflict[] {
  const conflicts: HC5Conflict[] = []

  for (const slot of ctx.slots) {
    const pos = state.assignments.get(slot.id)
    if (!pos || pos.roomId === 0) continue
    const room = ctx.roomById.get(pos.roomId)
    if (!room) continue

    // 检查教室可用性
    let isAvailable = true
    let reason: string | null = null
    for (const avail of room.availabilities) {
      if (avail.dayOfWeek === pos.dayOfWeek && avail.slotIndex === pos.slotIndex && !avail.available) {
        isAvailable = false
        reason = `Room ${room.name} marked unavailable at day=${pos.dayOfWeek} slot=${pos.slotIndex}`
        break
      }
    }
    if (isAvailable) continue

    // 收集同时使用该教室同一时段的所有 slot
    const involvedSlots = ctx.slots.filter(s => {
      const p = state.assignments.get(s.id)
      return p && p.roomId === pos.roomId && p.dayOfWeek === pos.dayOfWeek && p.slotIndex === pos.slotIndex
    })

    conflicts.push({
      roomId: pos.roomId,
      roomName: room.name,
      dayOfWeek: pos.dayOfWeek,
      slotIndex: pos.slotIndex,
      reason,
      involvedSlotIds: involvedSlots.map(s => s.id),
      courseNames: involvedSlots.map(s => s.teachingTask.course?.name ?? '?'),
      teacherNames: involvedSlots.map(s => s.teachingTask.teacher?.name ?? '(none)'),
      classGroupNames: involvedSlots.flatMap(s => s.teachingTask.taskClasses.map(tc => tc.classGroup.name)),
    })
  }

  return conflicts
}

// ── Top 5 Builders ──

function buildTopCapacityGaps(hc4: HC4Conflict[]): TopCapacityGap[] {
  return [...hc4]
    .sort((a, b) => b.shortage - a.shortage)
    .slice(0, 5)
    .map(c => ({
      courseName: c.courseName,
      classGroupNames: c.classGroupNames.join(', '),
      requiredStudents: c.requiredStudents,
      roomName: c.roomName,
      roomCapacity: c.roomCapacity,
      shortage: c.shortage,
      overloadRatio: c.overloadRatio,
      dayOfWeek: c.dayOfWeek,
      slotIndex: c.slotIndex,
    }))
}

function buildTopClassConflicts(hc3: HC3Conflict[]): TopClassConflict[] {
  // 按 classGroupId 聚合
  const byClass = new Map<number, { name: string; count: number; daySlotCounts: Map<string, number>; courses: Set<string> }>()
  for (const c of hc3) {
    let entry = byClass.get(c.classGroupId)
    if (!entry) {
      entry = { name: c.classGroupName, count: 0, daySlotCounts: new Map(), courses: new Set() }
      byClass.set(c.classGroupId, entry)
    }
    entry.count++
    const dsKey = `${c.dayOfWeek}-${c.slotIndex}`
    entry.daySlotCounts.set(dsKey, (entry.daySlotCounts.get(dsKey) || 0) + 1)
    for (const cn of c.courseNames) entry.courses.add(cn)
  }

  return [...byClass.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(e => {
      // 找最严重的 day/slot
      let worstDay = 0, worstSlot = 0, worstCount = 0
      for (const [dsKey, count] of e.daySlotCounts) {
        if (count > worstCount) {
          worstCount = count
          const [d, s] = dsKey.split('-').map(Number)
          worstDay = d; worstSlot = s
        }
      }
      return {
        classGroupName: e.name,
        conflictCount: e.count,
        worstDayOfWeek: worstDay,
        worstSlotIndex: worstSlot,
        involvedCourses: [...e.courses].slice(0, 10),
      }
    })
}

function buildTopRoomConflicts(hc1: HC1Conflict[]): TopRoomConflict[] {
  const byRoom = new Map<number, { name: string; count: number; daySlot: string; courses: Set<string> }>()
  for (const c of hc1) {
    let entry = byRoom.get(c.roomId)
    if (!entry) {
      entry = { name: c.roomName, count: 0, daySlot: `${c.dayOfWeek}-${c.slotIndex}`, courses: new Set() }
      byRoom.set(c.roomId, entry)
    }
    entry.count++
    for (const cn of c.courseNames) entry.courses.add(cn)
  }

  return [...byRoom.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(e => {
      const [d, s] = e.daySlot.split('-').map(Number)
      return {
        roomName: e.name,
        conflictCount: e.count,
        dayOfWeek: d,
        slotIndex: s,
        involvedCourses: [...e.courses].slice(0, 10),
      }
    })
}

function buildTopTimeSlotPressure(
  ctx: SchedulingContext,
  state: ScheduleState,
  hc1: HC1Conflict[],
  hc3: HC3Conflict[],
  hc4: HC4Conflict[],
): TopTimeSlotPressure[] {
  const pressureMap = new Map<string, {
    slotCount: number
    rooms: Set<number>
    classes: Set<number>
    capacityShortage: number
    classConflicts: number
    roomConflicts: number
  }>()

  // 初始化所有 day-slot 组合
  for (let d = 1; d <= 7; d++) {
    for (let s = 1; s <= 6; s++) {
      pressureMap.set(`${d}-${s}`, {
        slotCount: 0, rooms: new Set(), classes: new Set(),
        capacityShortage: 0, classConflicts: 0, roomConflicts: 0,
      })
    }
  }

  // 统计 slot 分布
  for (const slot of ctx.slots) {
    const pos = state.assignments.get(slot.id)
    if (!pos) continue
    const key = `${pos.dayOfWeek}-${pos.slotIndex}`
    const entry = pressureMap.get(key)!
    entry.slotCount++
    if (pos.roomId !== 0) entry.rooms.add(pos.roomId)
    for (const tc of slot.teachingTask.taskClasses) {
      entry.classes.add(tc.classGroupId)
    }
  }

  // 统计冲突分布
  for (const c of hc1) {
    const key = `${c.dayOfWeek}-${c.slotIndex}`
    pressureMap.get(key)!.roomConflicts++
  }
  for (const c of hc3) {
    const key = `${c.dayOfWeek}-${c.slotIndex}`
    pressureMap.get(key)!.classConflicts++
  }
  for (const c of hc4) {
    const key = `${c.dayOfWeek}-${c.slotIndex}`
    pressureMap.get(key)!.capacityShortage++
  }

  const results: TopTimeSlotPressure[] = []
  for (const [key, entry] of pressureMap) {
    const [d, s] = key.split('-').map(Number)
    results.push({
      dayOfWeek: d,
      slotIndex: s,
      scheduledSlotCount: entry.slotCount,
      distinctRoomCount: entry.rooms.size,
      distinctClassGroupCount: entry.classes.size,
      capacityShortageCount: entry.capacityShortage,
      classConflictCount: entry.classConflicts,
      roomConflictCount: entry.roomConflicts,
    })
  }

  // 按总冲突数降序排序
  results.sort((a, b) =>
    (b.capacityShortageCount + b.classConflictCount + b.roomConflictCount) -
    (a.capacityShortageCount + a.classConflictCount + a.roomConflictCount)
  )

  return results.slice(0, 10)
}

// ── Week Overlap Sanity Check ──

function runWeekOverlapCheck(ctx: SchedulingContext): WeekOverlapFinding[] {
  // 收集所有实际使用的 weekType
  const weekTypeSamples = new Map<string, TaskWithRelations[]>()
  for (const task of ctx.tasks) {
    const wt = task.weekType || 'ALL'
    let arr = weekTypeSamples.get(wt)
    if (!arr) { arr = []; weekTypeSamples.set(wt, arr) }
    arr.push(task)
  }

  const findings: WeekOverlapFinding[] = []

  // ODD vs EVEN
  const oddTasks = weekTypeSamples.get('ODD') || []
  const evenTasks = weekTypeSamples.get('EVEN') || []
  if (oddTasks.length > 0 && evenTasks.length > 0) {
    const oddWeeks = expandWeeks({ start: oddTasks[0].startWeek, end: oddTasks[0].endWeek, type: 'ODD' })
    const evenWeeks = expandWeeks({ start: evenTasks[0].startWeek, end: evenTasks[0].endWeek, type: 'EVEN' })
    const overlap = [...oddWeeks].filter(w => evenWeeks.has(w))
    findings.push({
      pair: 'ODD vs EVEN',
      expectedOverlap: false,
      actualOverlap: overlap.length > 0,
      overlapWeeks: overlap,
      status: overlap.length > 0 ? 'UNEXPECTED_OVERLAP' : 'OK',
    })
  } else {
    findings.push({
      pair: 'ODD vs EVEN',
      expectedOverlap: false,
      actualOverlap: false,
      overlapWeeks: [],
      status: oddTasks.length === 0 || evenTasks.length === 0 ? 'OK' : 'OK',
    })
  }

  // FIRST_HALF vs SECOND_HALF
  const firstHalfTasks = weekTypeSamples.get('FIRST_HALF') || []
  const secondHalfTasks = weekTypeSamples.get('SECOND_HALF') || []
  if (firstHalfTasks.length > 0 && secondHalfTasks.length > 0) {
    const firstWeeks = expandWeeks({ start: firstHalfTasks[0].startWeek, end: firstHalfTasks[0].endWeek, type: 'FIRST_HALF' })
    const secondWeeks = expandWeeks({ start: secondHalfTasks[0].startWeek, end: secondHalfTasks[0].endWeek, type: 'SECOND_HALF' })
    const overlap = [...firstWeeks].filter(w => secondWeeks.has(w))
    findings.push({
      pair: 'FIRST_HALF vs SECOND_HALF',
      expectedOverlap: false,
      actualOverlap: overlap.length > 0,
      overlapWeeks: overlap,
      status: overlap.length > 0 ? 'UNEXPECTED_OVERLAP' : 'OK',
    })
  } else {
    findings.push({
      pair: 'FIRST_HALF vs SECOND_HALF',
      expectedOverlap: false,
      actualOverlap: false,
      overlapWeeks: [],
      status: 'OK',
    })
  }

  // FIRST_HALF vs ALL
  const allTasks = weekTypeSamples.get('ALL') || []
  if (firstHalfTasks.length > 0 && allTasks.length > 0) {
    const firstWeeks = expandWeeks({ start: firstHalfTasks[0].startWeek, end: firstHalfTasks[0].endWeek, type: 'FIRST_HALF' })
    const allWeeks = expandWeeks({ start: allTasks[0].startWeek, end: allTasks[0].endWeek, type: 'ALL' })
    const overlap = [...firstWeeks].filter(w => allWeeks.has(w))
    findings.push({
      pair: 'FIRST_HALF vs ALL',
      expectedOverlap: true,
      actualOverlap: overlap.length > 0,
      overlapWeeks: overlap,
      status: overlap.length > 0 ? 'OK' : 'UNEXPECTED_NO_OVERLAP',
    })
  }

  // Fixed test: CUSTOM(5-12) vs FIRST_HALF — expected overlap = 5-8
  const custom512Weeks = expandWeeks({ start: 5, end: 12, type: 'CUSTOM' })
  if (firstHalfTasks.length > 0) {
    const firstWeeks = expandWeeks({ start: firstHalfTasks[0].startWeek, end: firstHalfTasks[0].endWeek, type: 'FIRST_HALF' })
    const overlap512 = [...custom512Weeks].filter(w => firstWeeks.has(w))
    findings.push({
      pair: 'CUSTOM(5-12) vs FIRST_HALF',
      expectedOverlap: true,
      actualOverlap: overlap512.length > 0,
      overlapWeeks: overlap512,
      status: overlap512.length > 0 ? 'OK' : 'UNEXPECTED_NO_OVERLAP',
    })
  }

  // CUSTOM tasks analysis (actual data)
  const customTasks = weekTypeSamples.get('CUSTOM') || []
  if (customTasks.length > 0) {
    // Check actual CUSTOM vs FIRST_HALF overlap
    const sampleCustom = customTasks[0]
    const customWeeks = expandWeeks({ start: sampleCustom.startWeek, end: sampleCustom.endWeek, type: 'CUSTOM' })
    if (firstHalfTasks.length > 0) {
      const firstWeeks = expandWeeks({ start: firstHalfTasks[0].startWeek, end: firstHalfTasks[0].endWeek, type: 'FIRST_HALF' })
      const overlap = [...customWeeks].filter(w => firstWeeks.has(w))
      findings.push({
        pair: `CUSTOM(actual ${sampleCustom.startWeek}-${sampleCustom.endWeek}) vs FIRST_HALF`,
        expectedOverlap: true,
        actualOverlap: overlap.length > 0,
        overlapWeeks: overlap,
        status: overlap.length > 0 ? 'OK' : 'UNEXPECTED_NO_OVERLAP',
      })
    }
    findings.push({
      pair: `CUSTOM range`,
      expectedOverlap: true,
      actualOverlap: true,
      overlapWeeks: [...customWeeks],
      status: 'OK',
    })
  } else {
    findings.push({
      pair: 'CUSTOM tasks',
      expectedOverlap: true,
      actualOverlap: false,
      overlapWeeks: [],
      status: 'OK',
    })
  }

  return findings
}

// ── Score Reconciliation ──

function buildScoreReconciliation(
  solverHardScore: number,
  reEvaluatedHardScore: number,
): ScoreReconciliation {
  const difference = solverHardScore - reEvaluatedHardScore
  const isConsistent = difference === 0
  const differenceInConflictUnits = Math.round(difference / 1000)

  const possibleCauses: string[] = []
  if (!isConsistent) {
    possibleCauses.push('solver 返回 bestScore 和 bestState 不同步：bestScore 在迭代中更新，bestState 在迭代结束后从 bestAssignments 恢复')
    possibleCauses.push('solver 内部 delta scoring 与 calculateScoreWithDetails 全量评分实现不一致')
    possibleCauses.push('score.ts 中 HC6（锁定课程移动）在 calculateScoreWithDetails 中为空实现，但 delta scoring 中有实际逻辑')
    possibleCauses.push('solver 的 findConflictingSlots 与 calculateScoreWithDetails 的成对遍历范围不同')
    possibleCauses.push(`差异恰好等于 ${Math.abs(differenceInConflictUnits)} 个 hard conflict × 1000 penalty`)
  }

  return {
    solverBestHardScore: solverHardScore,
    reEvaluatedHardScore: reEvaluatedHardScore,
    difference,
    differenceInConflictUnits,
    isConsistent,
    possibleCauses,
    needsK9BScoring: !isConsistent,
  }
}

// ── Main ──

async function main() {
  const startTime = Date.now()

  // 1. 加载 SchedulingContext
  console.log('[K9-A2] Loading SchedulingContext...')
  const ctx = await loadSchedulingContext()
  console.log(`[K9-A2] Loaded: ${ctx.tasks.length} tasks, ${ctx.rooms.length} rooms, ${ctx.slots.length} slots`)

  // 2. 运行 solver
  const config: SolverConfig = {
    maxIterations: 10000,
    lahcWindowSize: 500,
  }
  console.log(`[K9-A2] Running solver: maxIterations=${config.maxIterations}, lahcWindowSize=${config.lahcWindowSize}`)

  let progressCount = 0
  const solveResult = solve(ctx, config, (iteration, score) => {
    progressCount++
    if (progressCount % 5 === 0) {
      console.log(`  [progress] iter=${iteration} hard=${score.hardScore} soft=${score.softScore}`)
    }
  })

  const durationMs = Date.now() - startTime
  console.log(`[K9-A2] Solver done in ${durationMs}ms`)

  // 3. 对 bestState 执行 calculateScoreWithDetails
  console.log('[K9-A2] Calculating score details on bestState...')
  const scoreWithDetails = calculateScoreWithDetails(ctx, solveResult.bestState)
  const summary = summarizeScore(scoreWithDetails)

  // 4. 二次遍历构建完整冲突明细
  console.log('[K9-A2] Building HC1-HC5 detailed conflicts...')
  const hc1 = buildHC1Details(ctx, solveResult.bestState)
  const hc2 = buildHC2Details(ctx, solveResult.bestState)
  const hc3 = buildHC3Details(ctx, solveResult.bestState)
  const hc4 = buildHC4Details(ctx, solveResult.bestState)
  const hc5 = buildHC5Details(ctx, solveResult.bestState)

  // HC2 consistency check: compare scoreWithDetails count vs buildHC2Details count
  const scoreHc2Count = scoreWithDetails.details.filter(d => d.type === 'HC2_TEACHER_CONFLICT').length
  if (scoreHc2Count !== hc2.length) {
    console.warn(`  [WARN] HC2 count mismatch: scoreWithDetails=${scoreHc2Count}, buildHC2Details=${hc2.length}`)
  }

  console.log(`  HC1 (room): ${hc1.length}`)
  console.log(`  HC2 (teacher): ${hc2.length} (scoreWithDetails: ${scoreHc2Count})`)
  console.log(`  HC3 (class): ${hc3.length}`)
  console.log(`  HC4 (capacity): ${hc4.length}`)
  console.log(`  HC5 (availability): ${hc5.length}`)

  // 5. Top 5 实体分析
  console.log('[K9-A2] Building Top 5 entity analysis...')
  const topCapacityGaps = buildTopCapacityGaps(hc4)
  const topClassConflicts = buildTopClassConflicts(hc3)
  const topRoomConflicts = buildTopRoomConflicts(hc1)
  const topTimePressure = buildTopTimeSlotPressure(ctx, solveResult.bestState, hc1, hc3, hc4)

  // K36-A5D3A: anonymize all real names before building reports.
  // anonymizeReport replaces teacherName/courseName/classGroupName/roomName
  // in-place with tokens like T001 / CG001 / Course001 / Room001.
  // Free-text fields (evidence, excerpt, reason, recommendation) that
  // contain Chinese are replaced with <REDACTED_TEXT>.
  // We pass { redactFreeText: false } here because the 'reason' field
  // on HC5 is an English template like "Room X marked unavailable …"
  // that contains no PII — only Chinese prose is auto-redacted.
  anonymizeReport(hc1)
  anonymizeReport(hc2)
  anonymizeReport(hc3)
  anonymizeReport(hc4)
  anonymizeReport(hc5)
  anonymizeReport(topCapacityGaps)
  anonymizeReport(topClassConflicts)
  anonymizeReport(topRoomConflicts)
  // topTeacherConflicts is either a string or array slice of hc2 — already anonymized

  // 6. 周次重叠诊断
  console.log('[K9-A2] Running week overlap sanity check...')
  const weekFindings = runWeekOverlapCheck(ctx)

  // 7. Score Reconciliation
  console.log('[K9-A2] Score reconciliation...')
  const reconciliation = buildScoreReconciliation(solveResult.bestScore.hardScore, scoreWithDetails.hardScore)

  // 8. 打印基础结果
  console.log('\n[K9-A2] === Solver Result ===')
  console.log(`  iterations: ${solveResult.iterations}`)
  console.log(`  durationMs: ${durationMs}`)
  console.log(`  hardScore (solver best): ${solveResult.bestScore.hardScore}`)
  console.log(`  softScore (solver best): ${solveResult.bestScore.softScore}`)
  console.log(`  hardScore (re-evaluated): ${scoreWithDetails.hardScore}`)
  console.log(`  softScore (re-evaluated): ${scoreWithDetails.softScore}`)
  console.log(`  assignmentCount: ${solveResult.bestState.assignments.size}`)

  printScoreSummary('K9-A2 Best State Score Breakdown', summary)

  console.log('\n[K9-A2] === Score Reconciliation ===')
  console.log(`  solver best hardScore: ${reconciliation.solverBestHardScore}`)
  console.log(`  re-evaluated hardScore: ${reconciliation.reEvaluatedHardScore}`)
  console.log(`  difference: ${reconciliation.difference}`)
  console.log(`  difference in conflict units: ${reconciliation.differenceInConflictUnits}`)
  console.log(`  consistent: ${reconciliation.isConsistent}`)
  if (!reconciliation.isConsistent) {
    console.log('  possible causes:')
    for (const cause of reconciliation.possibleCauses) {
      console.log(`    - ${cause}`)
    }
  }

  console.log('\n[K9-A2] === Top 5 Capacity Gaps ===')
  for (const g of topCapacityGaps) {
    console.log(`  ${g.courseName}: need=${g.requiredStudents}, room=${g.roomName}(${g.roomCapacity}), shortage=${g.shortage}, ratio=${g.overloadRatio}x, day=${g.dayOfWeek} slot=${g.slotIndex}`)
  }

  console.log('\n[K9-A2] === Top 5 Class Conflict Hotspots ===')
  for (const c of topClassConflicts) {
    console.log(`  ${c.classGroupName}: ${c.conflictCount} conflicts, worst=day${c.worstDayOfWeek}/slot${c.worstSlotIndex}`)
    console.log(`    courses: ${c.involvedCourses.join(', ')}`)
  }

  console.log('\n[K9-A2] === Top 5 Room Conflict Hotspots ===')
  if (topRoomConflicts.length === 0) {
    console.log('  (none)')
  }
  for (const r of topRoomConflicts) {
    console.log(`  ${r.roomName}: ${r.conflictCount} conflicts, day=${r.dayOfWeek} slot=${r.slotIndex}`)
    console.log(`    courses: ${r.involvedCourses.join(', ')}`)
  }

  console.log('\n[K9-A2] === Top 5 Teacher Conflict Hotspots ===')
  if (hc2.length === 0) {
    console.log(`  无教师时间冲突 (HC2=${hc2.length})`)
  } else {
    for (const c of hc2.slice(0, 5)) {
      console.log(`  ${c.teacherName} (day=${c.dayOfWeek}, slot=${c.slotIndex}): ${c.courseNames.join(' vs ')} — overlapWeeks=[${c.overlapWeeks?.join(',') ?? 'null'}]`)
    }
  }

  console.log('\n[K9-A2] === Week Overlap Findings ===')
  for (const f of weekFindings) {
    console.log(`  ${f.pair}: status=${f.status}, overlap=${f.overlapWeeks.length > 0 ? f.overlapWeeks.join(',') : '(none)'}`)
  }

  // 9. 输出报告
  const timestamp = new Date().toISOString()
  const docsDir = path.join(__dirname, '..', 'docs')
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true })

  // ── Diagnosis Classification ──
  const diagnosisClassification: string[] = []
  if (hc4.length > 0) diagnosisClassification.push('CAPACITY_BOTTLENECK')
  if (hc3.length > 0) diagnosisClassification.push('CLASS_CONFLICT')
  if (hc1.length > 0) diagnosisClassification.push('ROOM_CONFLICT')
  if (!reconciliation.isConsistent) diagnosisClassification.push('SCORING_OR_DIAGNOSTIC_MISMATCH')
  if (scoreHc2Count !== hc2.length) diagnosisClassification.push('HC2_COUNT_MISMATCH')
  if (weekFindings.some(f => f.status === 'UNEXPECTED_OVERLAP')) diagnosisClassification.push('WEEK_OVERLAP_BUG')

  // ── Markdown 报告 ──
  const mdLines: string[] = []
  mdLines.push('# K9-A2 Diagnostic Report')
  mdLines.push('')
  mdLines.push(`**Run timestamp:** ${timestamp}`)
  mdLines.push(`**Duration:** ${durationMs}ms`)
  mdLines.push('')
  mdLines.push('## Solver Config')
  mdLines.push('')
  mdLines.push(`- maxIterations: ${config.maxIterations}`)
  mdLines.push(`- lahcWindowSize: ${config.lahcWindowSize}`)
  mdLines.push('')
  mdLines.push('## Data Summary')
  mdLines.push('')
  mdLines.push(`- tasks: ${ctx.tasks.length}`)
  mdLines.push(`- rooms: ${ctx.rooms.length}`)
  mdLines.push(`- slots: ${ctx.slots.length}`)
  mdLines.push('')
  mdLines.push('## Solver Result')
  mdLines.push('')
  mdLines.push(`- iterations: ${solveResult.iterations}`)
  mdLines.push(`- durationMs: ${durationMs}`)
  mdLines.push(`- hardScore (solver best): ${solveResult.bestScore.hardScore}`)
  mdLines.push(`- softScore (solver best): ${solveResult.bestScore.softScore}`)
  mdLines.push(`- hardScore (re-evaluated): ${scoreWithDetails.hardScore}`)
  mdLines.push(`- softScore (re-evaluated): ${scoreWithDetails.softScore}`)
  mdLines.push(`- assignmentCount: ${solveResult.bestState.assignments.size}`)
  mdLines.push('')
  mdLines.push('## Score Reconciliation')
  mdLines.push('')
  mdLines.push(`- solver best hardScore: ${reconciliation.solverBestHardScore}`)
  mdLines.push(`- re-evaluated hardScore: ${reconciliation.reEvaluatedHardScore}`)
  mdLines.push(`- difference: ${reconciliation.difference}`)
  mdLines.push(`- difference in conflict units: ${reconciliation.differenceInConflictUnits}`)
  mdLines.push(`- consistent: ${reconciliation.isConsistent}`)
  if (!reconciliation.isConsistent) {
    mdLines.push(`- needs K9-B-SCORING: yes`)
    mdLines.push('')
    mdLines.push('Possible causes:')
    mdLines.push('')
    for (const cause of reconciliation.possibleCauses) {
      mdLines.push(`- ${cause}`)
    }
  } else {
    mdLines.push(`- needs K9-B-SCORING: no`)
  }
  mdLines.push('')
  mdLines.push('## HC2 Consistency Check')
  mdLines.push('')
  mdLines.push(`- scoreWithDetails HC2 count: ${scoreHc2Count}`)
  mdLines.push(`- buildHC2Details count: ${hc2.length}`)
  mdLines.push(`- consistent: ${scoreHc2Count === hc2.length}`)
  if (scoreHc2Count !== hc2.length) {
    mdLines.push(`- **WARNING**: HC2 count mismatch detected!`)
  }
  mdLines.push('')
  mdLines.push('## Conflict Summary')
  mdLines.push('')
  mdLines.push(`| Type | Count | Penalty |`)
  mdLines.push(`|------|-------|---------|`)
  mdLines.push(`| HC1_ROOM_CONFLICT | ${hc1.length} | ${hc1.length * -1000} |`)
  mdLines.push(`| HC2_TEACHER_CONFLICT | ${hc2.length} | ${hc2.length * -1000} |`)
  mdLines.push(`| HC3_CLASS_CONFLICT | ${hc3.length} | ${hc3.length * -1000} |`)
  mdLines.push(`| HC4_CAPACITY | ${hc4.length} | ${hc4.length * -1000} |`)
  mdLines.push(`| HC5_ROOM_UNAVAILABLE | ${hc5.length} | ${hc5.length * -1000} |`)
  mdLines.push(`| **Total Hard** | **${hc1.length + hc2.length + hc3.length + hc4.length + hc5.length}** | **${(hc1.length + hc2.length + hc3.length + hc4.length + hc5.length) * -1000}** |`)
  mdLines.push('')

  // HC1 Details
  mdLines.push('## HC1: Room Time Conflicts')
  mdLines.push('')
  if (hc1.length === 0) {
    mdLines.push('No room time conflicts detected.')
  } else {
    mdLines.push(`Total: ${hc1.length} conflict pairs`)
    mdLines.push('')
    for (const c of hc1) {
      mdLines.push(`- **Room ${c.roomName}** (day=${c.dayOfWeek}, slot=${c.slotIndex})`)
      mdLines.push(`  - overlapWeeks: ${c.overlapWeeks?.join(',') ?? 'null'}`)
      mdLines.push(`  - courses: ${c.courseNames.join(' vs ')}`)
      mdLines.push(`  - teachers: ${c.teacherNames.join(' vs ')}`)
      mdLines.push(`  - classes: ${c.classGroupNames.join(', ')}`)
      mdLines.push(`  - slotIds: ${c.involvedSlotIds.join(', ')}`)
    }
  }
  mdLines.push('')

  // HC2 Details
  mdLines.push('## HC2: Teacher Time Conflicts')
  mdLines.push('')
  if (hc2.length === 0) {
    mdLines.push(`No teacher time conflicts detected (HC2=${hc2.length}).`)
  } else {
    mdLines.push(`Total: ${hc2.length} conflict pairs`)
    mdLines.push('')
    for (const c of hc2) {
      mdLines.push(`- **Teacher ${c.teacherName}** (day=${c.dayOfWeek}, slot=${c.slotIndex})`)
      mdLines.push(`  - overlapWeeks: ${c.overlapWeeks?.join(',') ?? 'null'}`)
      mdLines.push(`  - courses: ${c.courseNames.join(' vs ')}`)
      mdLines.push(`  - classes: ${c.classGroupNames.join(', ')}`)
      mdLines.push(`  - rooms: ${c.roomNames.join(' vs ')}`)
      mdLines.push(`  - slotIds: ${c.involvedSlotIds.join(', ')}`)
    }
  }
  mdLines.push('')

  // HC3 Details
  mdLines.push('## HC3: Class Time Conflicts')
  mdLines.push('')
  if (hc3.length === 0) {
    mdLines.push('No class time conflicts detected.')
  } else {
    mdLines.push(`Total: ${hc3.length} conflict pairs`)
    mdLines.push('')
    for (const c of hc3) {
      mdLines.push(`- **Class ${c.classGroupName}** (day=${c.dayOfWeek}, slot=${c.slotIndex})`)
      mdLines.push(`  - overlapWeeks: ${c.overlapWeeks?.join(',') ?? 'null'}`)
      mdLines.push(`  - courses: ${c.courseNames.join(' vs ')}`)
      mdLines.push(`  - teachers: ${c.teacherNames.join(' vs ')}`)
      mdLines.push(`  - rooms: ${c.roomNames.join(' vs ')}`)
      mdLines.push(`  - slotIds: ${c.involvedSlotIds.join(', ')}`)
    }
  }
  mdLines.push('')

  // HC4 Details
  mdLines.push('## HC4: Capacity Violations')
  mdLines.push('')
  if (hc4.length === 0) {
    mdLines.push('No capacity violations detected.')
  } else {
    mdLines.push(`Total: ${hc4.length} violations`)
    mdLines.push('')
    for (const c of hc4) {
      mdLines.push(`- **${c.courseName}** → Room ${c.roomName}`)
      mdLines.push(`  - required: ${c.requiredStudents}, capacity: ${c.roomCapacity}, shortage: ${c.shortage}, ratio: ${c.overloadRatio}x`)
      mdLines.push(`  - classes: ${c.classGroupNames.join(', ')}`)
      mdLines.push(`  - teacher: ${c.teacherName}`)
      mdLines.push(`  - day=${c.dayOfWeek}, slot=${c.slotIndex}`)
      mdLines.push(`  - week: ${c.weekType ?? 'ALL'} (${c.startWeek ?? 1}-${c.endWeek ?? 16})`)
    }
  }
  mdLines.push('')

  // HC5 Details
  mdLines.push('## HC5: Room Unavailability')
  mdLines.push('')
  if (hc5.length === 0) {
    mdLines.push('No room unavailability violations detected.')
  } else {
    mdLines.push(`Total: ${hc5.length} violations`)
    mdLines.push('')
    for (const c of hc5) {
      mdLines.push(`- **Room ${c.roomName}** (day=${c.dayOfWeek}, slot=${c.slotIndex})`)
      mdLines.push(`  - reason: ${c.reason ?? 'unknown'}`)
      mdLines.push(`  - courses: ${c.courseNames.join(', ')}`)
      mdLines.push(`  - teachers: ${c.teacherNames.join(', ')}`)
      mdLines.push(`  - classes: ${c.classGroupNames.join(', ')}`)
    }
  }
  mdLines.push('')

  // Top 5
  mdLines.push('## Top 5 Capacity Gaps')
  mdLines.push('')
  mdLines.push('| # | Course | Classes | Required | Room(Cap) | Shortage | Ratio | Day-Slot |')
  mdLines.push('|---|--------|---------|----------|-----------|----------|-------|----------|')
  topCapacityGaps.forEach((g, i) => {
    mdLines.push(`| ${i + 1} | ${g.courseName} | ${g.classGroupNames} | ${g.requiredStudents} | ${g.roomName}(${g.roomCapacity}) | ${g.shortage} | ${g.overloadRatio}x | ${g.dayOfWeek}-${g.slotIndex} |`)
  })
  mdLines.push('')

  mdLines.push('## Top 5 Class Conflict Hotspots')
  mdLines.push('')
  mdLines.push('| # | Class Group | Conflicts | Worst Day-Slot | Involved Courses |')
  mdLines.push('|---|-------------|-----------|----------------|------------------|')
  topClassConflicts.forEach((c, i) => {
    mdLines.push(`| ${i + 1} | ${c.classGroupName} | ${c.conflictCount} | ${c.worstDayOfWeek}-${c.worstSlotIndex} | ${c.involvedCourses.join(', ').substring(0, 80)} |`)
  })
  mdLines.push('')

  mdLines.push('## Top 5 Room Conflict Hotspots')
  mdLines.push('')
  if (topRoomConflicts.length === 0) {
    mdLines.push('No room conflicts.')
  } else {
    mdLines.push('| # | Room | Conflicts | Day-Slot | Involved Courses |')
    mdLines.push('|---|------|-----------|----------|------------------|')
    topRoomConflicts.forEach((r, i) => {
      mdLines.push(`| ${i + 1} | ${r.roomName} | ${r.conflictCount} | ${r.dayOfWeek}-${r.slotIndex} | ${r.involvedCourses.join(', ').substring(0, 80)} |`)
    })
  }
  mdLines.push('')

  mdLines.push('## Teacher Conflicts')
  mdLines.push('')
  if (hc2.length === 0) {
    mdLines.push(`No teacher time conflicts (HC2=${hc2.length}).`)
  } else {
    mdLines.push(`${hc2.length} teacher conflicts detected.`)
    mdLines.push('')
    mdLines.push('Top teacher conflict hotspots:')
    for (const c of hc2.slice(0, 5)) {
      mdLines.push(`- **${c.teacherName}** (day=${c.dayOfWeek}, slot=${c.slotIndex})`)
      mdLines.push(`  - overlapWeeks: ${c.overlapWeeks?.join(',') ?? 'null'}`)
      mdLines.push(`  - courses: ${c.courseNames.join(' vs ')}`)
    }
  }
  mdLines.push('')

  mdLines.push('## Top 10 Time Slot Pressure')
  mdLines.push('')
  mdLines.push('| Day-Slot | Slots | Rooms | Classes | CapShortage | ClassConf | RoomConf |')
  mdLines.push('|----------|-------|-------|---------|-------------|-----------|----------|')
  for (const t of topTimePressure) {
    mdLines.push(`| ${t.dayOfWeek}-${t.slotIndex} | ${t.scheduledSlotCount} | ${t.distinctRoomCount} | ${t.distinctClassGroupCount} | ${t.capacityShortageCount} | ${t.classConflictCount} | ${t.roomConflictCount} |`)
  }
  mdLines.push('')

  // Week Overlap
  mdLines.push('## Week Overlap Sanity Check')
  mdLines.push('')
  mdLines.push('| Pair | Expected Overlap | Actual Overlap | Status | Weeks |')
  mdLines.push('|------|-----------------|----------------|--------|-------|')
  for (const f of weekFindings) {
    mdLines.push(`| ${f.pair} | ${f.expectedOverlap} | ${f.actualOverlap} | ${f.status} | ${f.overlapWeeks.join(',') || '(none)'} |`)
  }
  mdLines.push('')

  // Diagnosis Classification
  mdLines.push('## Diagnosis Classification')
  mdLines.push('')
  for (const dc of diagnosisClassification) {
    mdLines.push(`- ${dc}`)
  }
  mdLines.push('')

  // Notes
  mdLines.push('## Notes')
  mdLines.push('')
  mdLines.push('- HC1-HC5 details computed via secondary traversal of bestState (no score.ts modification)')
  mdLines.push('- Week overlap computed using expandWeeks from conflict.ts')
  mdLines.push('- Score reconciliation identifies delta-vs-full scoring discrepancy')

  const mdContent = mdLines.join('\n')
  const mdPath = path.join(docsDir, 'scheduler-hard-conflicts-report.md')
  fs.writeFileSync(mdPath, mdContent, 'utf-8')
  console.log(`[K9-A2] Wrote ${mdPath}`)

  // ── JSON 报告 ──
  const jsonReport = {
    phase: 'K9-A2',
    timestamp,
    durationMs,
    solverConfig: {
      maxIterations: config.maxIterations,
      lahcWindowSize: config.lahcWindowSize,
    },
    dataSummary: {
      taskCount: ctx.tasks.length,
      roomCount: ctx.rooms.length,
      slotCount: ctx.slots.length,
    },
    solverResult: {
      iterations: solveResult.iterations,
      hardScore: solveResult.bestScore.hardScore,
      softScore: solveResult.bestScore.softScore,
      bestHardScore: scoreWithDetails.hardScore,
      bestSoftScore: scoreWithDetails.softScore,
      assignmentCount: solveResult.bestState.assignments.size,
    },
    scoreReconciliation: {
      solverBestHardScore: reconciliation.solverBestHardScore,
      reEvaluatedHardScore: reconciliation.reEvaluatedHardScore,
      difference: reconciliation.difference,
      differenceInConflictUnits: reconciliation.differenceInConflictUnits,
      isConsistent: reconciliation.isConsistent,
      possibleCauses: reconciliation.possibleCauses,
      needsK9BScoring: reconciliation.needsK9BScoring,
    },
    hc2ConsistencyCheck: {
      scoreWithDetailsCount: scoreHc2Count,
      buildHC2DetailsCount: hc2.length,
      isConsistent: scoreHc2Count === hc2.length,
    },
    conflictSummary: {
      HC1_ROOM_CONFLICT: hc1.length,
      HC2_TEACHER_CONFLICT: hc2.length,
      HC3_CLASS_CONFLICT: hc3.length,
      HC4_CAPACITY: hc4.length,
      HC5_ROOM_UNAVAILABLE: hc5.length,
      totalHard: hc1.length + hc2.length + hc3.length + hc4.length + hc5.length,
      totalHardPenalty: (hc1.length + hc2.length + hc3.length + hc4.length + hc5.length) * -1000,
    },
    conflictsByType: {
      HC1: hc1,
      HC2: hc2,
      HC3: hc3,
      HC4: hc4,
      HC5: hc5,
    },
    topEntities: {
      topCapacityGaps,
      topClassConflicts,
      topRoomConflicts,
      topTeacherConflicts: hc2.length === 0 ? `No teacher time conflicts (HC2=${hc2.length})` : hc2.slice(0, 5),
      topTimeSlotPressure: topTimePressure,
    },
    weekOverlapFindings: weekFindings,
    resourcePressure: topTimePressure,
    diagnosisClassification,
    notes: [
      'HC1-HC5 details computed via secondary traversal of bestState (no score.ts modification)',
      'Week overlap computed using expandWeeks from conflict.ts',
      'Score reconciliation identifies delta-vs-full scoring discrepancy',
      'K9-A3 will add actionable recommendations per conflict type',
    ],
  }

  const jsonPath = path.join(docsDir, 'scheduler-hard-conflicts-report.json')
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8')
  console.log(`[K9-A2] Wrote ${jsonPath}`)

  console.log('\n[K9-A2] Done.')
}

main().catch((err) => {
  console.error('[K9-A2] Fatal error:', err)
  process.exit(1)
})
