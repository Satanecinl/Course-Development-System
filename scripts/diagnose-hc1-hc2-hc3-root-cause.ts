/**
 * K9-B-HC1-HC2-HC3-ROOT-CAUSE: Root cause diagnostic for remaining hard conflicts
 *
 * Read-only script. Loads scheduling context, runs solver, compares initial vs best state
 * conflict details to identify root causes of HC1/HC2/HC3.
 */
import { loadSchedulingContext } from '../src/lib/scheduler/data-loader'
import { buildInitialState, solve } from '../src/lib/scheduler/solver'
import { calculateScoreWithDetails } from '../src/lib/scheduler/score'
import { expandWeeks, type WeekConstraint } from '../src/lib/conflict'
import type { ScoreDetail, SchedulingContext, ScheduleState } from '../src/lib/scheduler/types'

// ── Helpers ──

interface ConflictInfo {
  type: string
  slotIdA: number
  slotIdB: number
  dayOfWeek: number
  slotIndex: number
  courseA: string
  courseB: string
  teacherA: string
  teacherB: string
  roomA: string
  roomB: string
  classGroupsA: string[]
  classGroupsB: string[]
  taskIdA: number
  taskIdB: number
  teacherIdA: number | null
  teacherIdB: number | null
  roomIdA: number
  roomIdB: number
  weekPatternA: string
  weekPatternB: string
  weekOverlap: boolean
  isSameTeachingTask: boolean
  isSameCourse: boolean
  isSameTeacher: boolean
  isSameRoom: boolean
  sharedClassGroups: string[]
  studentCountA: number
  studentCountB: number
  capacityA: number
  capacityB: number
  message: string
}

function getWeekPattern(task: { startWeek: number; endWeek: number; weekType: string }): string {
  const wc: WeekConstraint = { start: task.startWeek, end: task.endWeek, type: task.weekType as WeekConstraint['type'] }
  const weeks = expandWeeks(wc)
  const sorted = [...weeks].sort((a, b) => a - b)
  if (sorted.length <= 6) return sorted.join(',')
  return `${sorted[0]}-${sorted[sorted.length - 1]} (${sorted.length}w)`
}

function hasWeekOverlap(taskA: { startWeek: number; endWeek: number; weekType: string }, taskB: { startWeek: number; endWeek: number; weekType: string }): boolean {
  const wcA: WeekConstraint = { start: taskA.startWeek, end: taskA.endWeek, type: taskA.weekType as WeekConstraint['type'] }
  const wcB: WeekConstraint = { start: taskB.startWeek, end: taskB.endWeek, type: taskB.weekType as WeekConstraint['type'] }
  const setA = expandWeeks(wcA)
  const setB = expandWeeks(wcB)
  for (const w of setA) { if (setB.has(w)) return true }
  return false
}

function getTaskStudentCount(task: any, ctx: SchedulingContext): number {
  return task.taskClasses.reduce((sum: number, tc: any) => sum + (tc.classGroup.studentCount ?? 50), 0)
}

function extractConflicts(details: ScoreDetail[], ctx: SchedulingContext, state: ScheduleState): ConflictInfo[] {
  const conflicts: ConflictInfo[] = []
  const slotMap = new Map(ctx.slots.map(s => [s.id, s]))

  for (const d of details) {
    if (d.type !== 'HC1_ROOM_CONFLICT' && d.type !== 'HC2_TEACHER_CONFLICT' && d.type !== 'HC3_CLASS_CONFLICT') continue
    if (!d.slotId || !d.relatedSlotId) continue

    const slotA = slotMap.get(d.slotId)
    const slotB = slotMap.get(d.relatedSlotId)
    if (!slotA || !slotB) continue

    const posA = state.assignments.get(d.slotId)
    const posB = state.assignments.get(d.relatedSlotId)
    if (!posA || !posB) continue

    const taskA = slotA.teachingTask
    const taskB = slotB.teachingTask

    const classGroupsA = taskA.taskClasses.map((tc: any) => tc.classGroup.name)
    const classGroupsB = taskB.taskClasses.map((tc: any) => tc.classGroup.name)
    const sharedClassGroups: string[] = []
    for (const tcA of taskA.taskClasses) {
      for (const tcB of taskB.taskClasses) {
        if (tcA.classGroupId === tcB.classGroupId && !sharedClassGroups.includes(tcA.classGroup.name)) {
          sharedClassGroups.push(tcA.classGroup.name)
        }
      }
    }

    const roomA = ctx.roomById.get(posA.roomId)
    const roomB = ctx.roomById.get(posB.roomId)

    conflicts.push({
      type: d.type,
      slotIdA: d.slotId,
      slotIdB: d.relatedSlotId,
      dayOfWeek: posA.dayOfWeek,
      slotIndex: posA.slotIndex,
      courseA: taskA.course?.name ?? '?',
      courseB: taskB.course?.name ?? '?',
      teacherA: taskA.teacher?.name ?? '-',
      teacherB: taskB.teacher?.name ?? '-',
      roomA: roomA?.name ?? String(posA.roomId),
      roomB: roomB?.name ?? String(posB.roomId),
      classGroupsA,
      classGroupsB,
      taskIdA: taskA.id,
      taskIdB: taskB.id,
      teacherIdA: taskA.teacherId,
      teacherIdB: taskB.teacherId,
      roomIdA: posA.roomId,
      roomIdB: posB.roomId,
      weekPatternA: getWeekPattern(taskA),
      weekPatternB: getWeekPattern(taskB),
      weekOverlap: hasWeekOverlap(taskA, taskB),
      isSameTeachingTask: taskA.id === taskB.id,
      isSameCourse: taskA.course?.name === taskB.course?.name,
      isSameTeacher: taskA.teacherId != null && taskA.teacherId === taskB.teacherId,
      isSameRoom: posA.roomId === posB.roomId,
      sharedClassGroups,
      studentCountA: getTaskStudentCount(taskA, ctx),
      studentCountB: getTaskStudentCount(taskB, ctx),
      capacityA: roomA?.capacity ?? 0,
      capacityB: roomB?.capacity ?? 0,
      message: d.message ?? '',
    })
  }
  return conflicts
}

function conflictKey(c: ConflictInfo): string {
  const [minSlot, maxSlot] = c.slotIdA < c.slotIdB ? [c.slotIdA, c.slotIdB] : [c.slotIdB, c.slotIdA]
  return `${c.type}:${minSlot}:${maxSlot}`
}

function classifyHC1(c: ConflictInfo): string {
  if (c.isSameTeachingTask) return 'SAME_TEACHING_TASK_FALSE_POSITIVE'
  if (c.isSameCourse && !c.isSameRoom) return 'ROOM_ID_DUPLICATE_NAME_CONFUSION'
  if (!c.weekOverlap) return 'WEEK_OVERLAP_FALSE_POSITIVE'
  return 'INITIAL_DATA_ROOM_CONFLICT'
}

function classifyHC2(c: ConflictInfo): string {
  if (c.isSameTeachingTask) return 'SAME_TEACHING_TASK_FALSE_POSITIVE'
  if (!c.weekOverlap) return 'WEEK_OVERLAP_FALSE_POSITIVE'
  return 'INITIAL_DATA_TEACHER_CONFLICT'
}

function classifyHC3(c: ConflictInfo): string {
  if (c.isSameTeachingTask) return 'SAME_TEACHING_TASK_FALSE_POSITIVE'
  if (!c.weekOverlap) return 'WEEK_OVERLAP_FALSE_POSITIVE'
  if (c.sharedClassGroups.length > 0 && c.isSameCourse) return 'INITIAL_DATA_CLASS_CONFLICT'
  return 'INITIAL_DATA_CLASS_CONFLICT'
}

function printConflictTable(conflicts: ConflictInfo[], label: string): void {
  if (conflicts.length === 0) {
    console.log(`(none)\n`)
    return
  }
  console.log('| # | type | day | slot | courseA | courseB | roomA | roomB | teacherA | teacherB | classGroups | weekA | weekB | weekOverlap | isSameTask | 分类 |')
  console.log('| ---: | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (let i = 0; i < conflicts.length; i++) {
    const c = conflicts[i]
    let classification: string
    if (c.type === 'HC1_ROOM_CONFLICT') classification = classifyHC1(c)
    else if (c.type === 'HC2_TEACHER_CONFLICT') classification = classifyHC2(c)
    else classification = classifyHC3(c)
    console.log(`| ${i + 1} | ${c.type} | ${c.dayOfWeek} | ${c.slotIndex} | ${c.courseA} | ${c.courseB} | ${c.roomA} | ${c.roomB} | ${c.teacherA} | ${c.teacherB} | ${c.sharedClassGroups.join(', ') || '-'} | ${c.weekPatternA} | ${c.weekPatternB} | ${c.weekOverlap} | ${c.isSameTeachingTask} | ${classification} |`)
  }
  console.log()
}

async function main() {
  console.log('# HC1/HC2/HC3 Root Cause Diagnostic\n')

  console.log('## Safety')
  console.log('- mode: READ_ONLY')
  console.log('- noDatabaseWrites: true')
  console.log('- noSolverChanges: true')
  console.log('- noScoreChanges: true')
  console.log()

  // Load data
  console.time('Data Loading')
  const ctx = await loadSchedulingContext()
  console.timeEnd('Data Loading')
  console.log(`Tasks: ${ctx.tasks.length}, Rooms: ${ctx.rooms.length}, Slots: ${ctx.slots.length}\n`)

  // Score semantics
  console.log('## Score Semantics\n')
  console.log('- hardScoreSignConvention: negative = violations (hardScore = -1000 * violationCount)')
  console.log('- conflictPenaltyPerItem: -1000 (HARD_PENALTY)')
  console.log('- iterationLogScoreMeaning: currentScore (after move acceptance), NOT bestScore')
  console.log('- returnedStateType: bestState (cloned from best found during search)')
  console.log('- bestStateAvailable: YES')
  console.log('- finalStateAvailable: NO (solver only returns bestState, final state is lost)')
  console.log()

  // Build initial state
  const initState = buildInitialState(ctx)
  const initScore = calculateScoreWithDetails(ctx, initState)

  // Run solver 10000 iterations
  console.log('--- Running LAHC Solver (10000 iterations) ---\n')
  const result = solve(ctx, { maxIterations: 10000, lahcWindowSize: 500 }, (iter, score) => {
    // silent
  })

  const bestScore = calculateScoreWithDetails(ctx, result.bestState)

  // Extract conflicts
  const initConflicts = extractConflicts(initScore.details, ctx, initState)
  const bestConflicts = extractConflicts(bestScore.details, ctx, result.bestState)

  const initHC1 = initConflicts.filter(c => c.type === 'HC1_ROOM_CONFLICT')
  const initHC2 = initConflicts.filter(c => c.type === 'HC2_TEACHER_CONFLICT')
  const initHC3 = initConflicts.filter(c => c.type === 'HC3_CLASS_CONFLICT')
  const bestHC1 = bestConflicts.filter(c => c.type === 'HC1_ROOM_CONFLICT')
  const bestHC2 = bestConflicts.filter(c => c.type === 'HC2_TEACHER_CONFLICT')
  const bestHC3 = bestConflicts.filter(c => c.type === 'HC3_CLASS_CONFLICT')

  // Summary
  console.log('## Initial Conflicts\n')
  console.log(`- HC1 count: ${initHC1.length} (penalty ${initHC1.length * -1000})`)
  console.log(`- HC2 count: ${initHC2.length} (penalty ${initHC2.length * -1000})`)
  console.log(`- HC3 count: ${initHC3.length} (penalty ${initHC3.length * -1000})`)
  console.log(`- total hard: ${initScore.hardScore}\n`)

  console.log('### HC1 Room Conflicts\n')
  printConflictTable(initHC1, 'Initial HC1')

  console.log('### HC2 Teacher Conflicts\n')
  printConflictTable(initHC2, 'Initial HC2')

  console.log('### HC3 Class Conflicts\n')
  printConflictTable(initHC3, 'Initial HC3')

  console.log('## Solver / Best State Conflicts\n')
  console.log(`- HC1 count: ${bestHC1.length} (penalty ${bestHC1.length * -1000})`)
  console.log(`- HC2 count: ${bestHC2.length} (penalty ${bestHC2.length * -1000})`)
  console.log(`- HC3 count: ${bestHC3.length} (penalty ${bestHC3.length * -1000})`)
  console.log(`- total hard: ${bestScore.hardScore}\n`)

  console.log('### HC1 Room Conflicts\n')
  printConflictTable(bestHC1, 'Best HC1')

  console.log('### HC2 Teacher Conflicts\n')
  printConflictTable(bestHC2, 'Best HC2')

  console.log('### HC3 Class Conflicts\n')
  printConflictTable(bestHC3, 'Best HC3')

  // Conflict diff
  const initKeys = new Set(initConflicts.map(conflictKey))
  const bestKeys = new Set(bestConflicts.map(conflictKey))

  const resolved = initConflicts.filter(c => !bestKeys.has(conflictKey(c)))
  const persisted = initConflicts.filter(c => bestKeys.has(conflictKey(c)))
  const introduced = bestConflicts.filter(c => !initKeys.has(conflictKey(c)))

  console.log('## Conflict Diff\n')
  console.log(`- initial conflicts: ${initConflicts.length}`)
  console.log(`- best conflicts: ${bestConflicts.length}`)
  console.log(`- resolved: ${resolved.length}`)
  console.log(`- persisted: ${persisted.length}`)
  console.log(`- newly introduced: ${introduced.length}\n`)

  if (resolved.length > 0) {
    console.log('### Resolved Conflicts\n')
    printConflictTable(resolved, 'Resolved')
  }

  if (persisted.length > 0) {
    console.log('### Persisted Conflicts\n')
    printConflictTable(persisted, 'Persisted')
  }

  if (introduced.length > 0) {
    console.log('### Newly Introduced Conflicts\n')
    printConflictTable(introduced, 'Introduced')
  }

  // Root cause classification
  console.log('## Root Cause Classification\n')

  // HC1
  console.log('### HC1\n')
  for (const c of bestHC1) {
    const isNew = !initHC1.some(ic => conflictKey(ic) === conflictKey(c))
    const classification = classifyHC1(c)
    console.log(`- ${isNew ? 'NEW' : 'INITIAL'} slot ${c.slotIdA} vs ${c.slotIdB}: ${c.courseA} vs ${c.courseB} @ ${c.roomA} (day=${c.dayOfWeek}, slot=${c.slotIndex})`)
    console.log(`  weekOverlap=${c.weekOverlap}, isSameTask=${c.isSameTeachingTask}, isSameCourse=${c.isSameCourse}`)
    console.log(`  classification: ${classification}`)
  }
  if (bestHC1.length === 0) console.log('  (none)')
  console.log()

  // HC2
  console.log('### HC2\n')
  for (const c of bestHC2) {
    const isNew = !initHC2.some(ic => conflictKey(ic) === conflictKey(c))
    const classification = classifyHC2(c)
    console.log(`- ${isNew ? 'NEW' : 'INITIAL'} slot ${c.slotIdA} vs ${c.slotIdB}: ${c.teacherA} ${c.courseA} vs ${c.courseB} (day=${c.dayOfWeek}, slot=${c.slotIndex})`)
    console.log(`  weekOverlap=${c.weekOverlap}, isSameTask=${c.isSameTeachingTask}`)
    console.log(`  classification: ${classification}`)
  }
  if (bestHC2.length === 0) console.log('  (none)')
  console.log()

  // HC3
  console.log('### HC3\n')
  for (const c of bestHC3) {
    const isNew = !initHC3.some(ic => conflictKey(ic) === conflictKey(c))
    const classification = classifyHC3(c)
    console.log(`- ${isNew ? 'NEW' : 'INITIAL'} slot ${c.slotIdA} vs ${c.slotIdB}: ${c.courseA} vs ${c.courseB} (day=${c.dayOfWeek}, slot=${c.slotIndex})`)
    console.log(`  sharedClassGroups: ${c.sharedClassGroups.join(', ') || 'NONE'}`)
    console.log(`  classGroupsA: ${c.classGroupsA.join(', ')}`)
    console.log(`  classGroupsB: ${c.classGroupsB.join(', ')}`)
    console.log(`  weekOverlap=${c.weekOverlap}, isSameTask=${c.isSameTeachingTask}, isSameCourse=${c.isSameCourse}`)
    console.log(`  classification: ${classification}`)
  }
  if (bestHC3.length === 0) console.log('  (none)')
  console.log()

  // Solver behavior diagnosis
  console.log('## Solver Behavior Diagnosis\n')

  const movedCount = [...result.bestState.assignments.entries()].filter(([slotId, pos]) => {
    const orig = result.bestState.originalAssignments.get(slotId)
    return orig && (pos.dayOfWeek !== orig.dayOfWeek || pos.slotIndex !== orig.slotIndex || pos.roomId !== orig.roomId)
  }).length

  console.log(`- totalSlots: ${ctx.slots.length}`)
  console.log(`- slotsMovedFromOriginal: ${movedCount}`)
  console.log(`- bestHardScore: ${bestScore.hardScore}`)
  console.log(`- bestSoftScore: ${bestScore.softScore}`)
  console.log(`- solverIterations: ${result.iterations}`)
  console.log()

  // Check if best state has HC4 (capacity introduced by solver)
  const bestHC4 = bestScore.details.filter(d => d.type === 'HC4_CAPACITY')
  console.log(`- bestState HC4 count: ${bestHC4.length}`)
  if (bestHC4.length > 0) {
    console.log('  WARNING: solver introduced HC4 capacity conflicts!')
    for (const hc4 of bestHC4.slice(0, 5)) {
      console.log(`    - ${hc4.message}`)
    }
  }
  console.log()

  // Check HC5
  const bestHC5 = bestScore.details.filter(d => d.type === 'HC5_ROOM_UNAVAILABLE')
  console.log(`- bestState HC5 count: ${bestHC5.length}`)
  console.log()

  // Key findings
  console.log('## Key Findings\n')

  // Check if any HC3 is same teaching task
  const sameTaskHC3 = bestHC3.filter(c => c.isSameTeachingTask)
  if (sameTaskHC3.length > 0) {
    console.log(`- SAME_TEACHING_TASK_FALSE_POSITIVE HC3: ${sameTaskHC3.length} (solver moved same task's slots to overlap)`)
  }

  // Check week overlap false positives
  const noOverlapHC1 = bestHC1.filter(c => !c.weekOverlap)
  const noOverlapHC2 = bestHC2.filter(c => !c.weekOverlap)
  const noOverlapHC3 = bestHC3.filter(c => !c.weekOverlap)
  console.log(`- WEEK_OVERLAP_FALSE_POSITIVE: HC1=${noOverlapHC1.length}, HC2=${noOverlapHC2.length}, HC3=${noOverlapHC3.length}`)

  // Check new conflicts introduced
  const newHC1 = introduced.filter(c => c.type === 'HC1_ROOM_CONFLICT')
  const newHC2 = introduced.filter(c => c.type === 'HC2_TEACHER_CONFLICT')
  const newHC3 = introduced.filter(c => c.type === 'HC3_CLASS_CONFLICT')
  console.log(`- NEW conflicts: HC1=${newHC1.length}, HC2=${newHC2.length}, HC3=${newHC3.length}`)

  // Check if best state is same as initial
  const isBestSameAsInit = [...result.bestState.assignments.entries()].every(([slotId, pos]) => {
    const orig = initState.assignments.get(slotId)
    return orig && pos.dayOfWeek === orig.dayOfWeek && pos.slotIndex === orig.slotIndex && pos.roomId === orig.roomId
  })
  console.log(`- bestState identical to initialState: ${isBestSameAsInit}`)

  // Check if HC4 was introduced by solver moves
  if (bestHC4.length > 0) {
    console.log('\n- SOLVER INTRODUCED HC4: solver moved tasks to rooms with insufficient capacity')
  }

  console.log()

  // Recommendation
  console.log('## Recommendation\n')
  console.log('Based on analysis:')
  if (bestHC4.length > 0) {
    console.log('- HC4 introduced by solver: move generator must respect capacity constraints')
  }
  if (newHC1.length > 0 || newHC2.length > 0 || newHC3.length > 0) {
    console.log('- Solver introduced NEW conflicts: move generator may lack proper constraint checking')
  }
  if (sameTaskHC3.length > 0) {
    console.log('- Some HC3 are same-task false positives: solver moved same task slots into overlap')
  }
  const totalBestHC = bestHC1.length + bestHC2.length + bestHC3.length + bestHC4.length
  console.log(`- Total best state hard conflicts: ${totalBestHC}`)
  if (totalBestHC === 0) {
    console.log('- Solver CAN find feasible solution (hardScore=0)')
  } else {
    console.log('- Solver CANNOT find feasible solution in 10000 iterations')
  }
  console.log()

  console.log('## Safety\n')
  console.log('- noDatabaseWrites: true')
  console.log('- noSolverChanges: true')
  console.log('- noScoreChanges: true')
  console.log()

  await ctx // keep context alive
}

main().catch(console.error)
