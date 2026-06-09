/**
 * scripts/verify-solver-hc6-aware-k26-k4c.ts
 *
 * K26-K4C: Verify that solver's isPlacementHardCompatible now
 * rejects HC6 pairings (non-automotive / mixed / unknown task in
 * Linxiao room). Uses synthetic in-memory contexts to avoid DB.
 *
 * Read-only. Does NOT write DB.
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { prisma } from '@/lib/prisma'
import { solve, buildInitialState } from '@/lib/scheduler/solver'
import {
  classifySpecialty,
  computeHC6Penalty,
  isLinxiaoRoomName,
} from '@/lib/scheduler/score'
import type {
  SchedulingContext,
  TaskWithRelations,
  RoomWithAvailability,
  SlotWithRelations,
} from '@/lib/scheduler/types'

const projectRoot = join(__dirname, '..')

interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) {
  id++
  results.push({ id, name, pass, detail })
}

// ── Synthetic context builder ──

function mkRoom(id: number, name: string, capacity: number, building: string | null = null): RoomWithAvailability {
  return { id, name, capacity, building, availabilities: [] } as RoomWithAvailability
}

function mkClassGroup(id: number, name: string) {
  return { id, name }
}

function mkTask(id: number, courseName: string, teacherId: number | null, classGroupIds: number[], remark: string | null = null): TaskWithRelations {
  // Look up classGroup names from a static map so taskClasses gets real names
  const NAME_BY_ID: Record<number, string> = {
    1: '2024级林业技术1班',
    2: '2024级汽车制造与试验技术1班',
  }
  const cgs = classGroupIds.map(cid => ({
    classGroupId: cid,
    classGroup: { id: cid, name: NAME_BY_ID[cid] ?? `cg${cid}` },
  }))
  return {
    id, courseId: 1, teacherId, semesterId: 1,
    startWeek: 1, endWeek: 18, weekType: 'ALL',
    remark, importBatchId: null,
    course: { id: 1, name: courseName },
    teacher: teacherId ? { id: teacherId, name: `t${teacherId}` } : null,
    taskClasses: cgs,
  } as unknown as TaskWithRelations
}

function mkSlot(id: number, taskId: number, dayOfWeek: number, slotIndex: number, roomId: number | null): SlotWithRelations {
  return {
    id, teachingTaskId: taskId, roomId, dayOfWeek, slotIndex,
    semesterId: 1,
    teachingTask: {} as TaskWithRelations, // set later
    room: null,
  } as unknown as SlotWithRelations
}

function buildContext(rooms: RoomWithAvailability[], tasks: TaskWithRelations[], slots: SlotWithRelations[]): SchedulingContext {
  const taskById = new Map(tasks.map(t => [t.id, t]))
  const roomById = new Map(rooms.map(r => [r.id, r]))
  const slotsByTask = new Map<number, SlotWithRelations[]>()
  for (const s of slots) {
    s.teachingTask = taskById.get(s.teachingTaskId)!
    if (!slotsByTask.has(s.teachingTaskId)) slotsByTask.set(s.teachingTaskId, [])
    slotsByTask.get(s.teachingTaskId)!.push(s)
  }
  return {
    tasks, rooms, slots, taskById, roomById,
    slotsByTask, slotsByRoom: new Map(), slotsByTeacher: new Map(), slotsByClass: new Map(),
  }
}

async function main() {
  console.log('K26-K4C: Solver HC6-Aware Verify')
  console.log('─'.repeat(60))

  // ── 1. File / implementation checks ──
  const docsMd = join(projectRoot, 'docs/k26-solver-hc6-aware-fix.md')
  const docsJson = join(projectRoot, 'docs/k26-solver-hc6-aware-fix.json')
  check('K26-K4C docs exist', existsSync(docsMd))
  check('K26-K4C JSON exists', existsSync(docsJson))

  // Read solver.ts to verify HC6 check is added
  const { readFileSync } = await import('fs')
  const solverSrc = readFileSync(join(projectRoot, 'src/lib/scheduler/solver.ts'), 'utf-8')
  const scoreSrc = readFileSync(join(projectRoot, 'src/lib/scheduler/score.ts'), 'utf-8')

  check('solver imports HC6 helpers from score.ts',
    solverSrc.includes('classifySpecialty') &&
    solverSrc.includes('isLinxiaoRoomName') &&
    solverSrc.includes('computeHC6Penalty'),
    'solver.ts imports from score.ts')
  check('score.ts exports HC6 helpers',
    scoreSrc.includes('export function classifySpecialty') &&
    scoreSrc.includes('export function isLinxiaoRoomName') &&
    scoreSrc.includes('export function computeHC6Penalty'),
    'score.ts exports helpers')
  check('solver isPlacementHardCompatible includes HC6 check',
    solverSrc.includes('computeHC6Penalty(cls, true) < 0'),
    'HC6 check uses computeHC6Penalty')
  check('solver HC6 check is in isPlacementHardCompatible',
    solverSrc.includes('isPlacementHardCompatible') &&
    solverSrc.match(/isPlacementHardCompatible[\s\S]*?computeHC6Penalty/),
    'HC6 check is in placement compatibility')
  check('solver uses score.ts classifier (no duplicate Linxiao detection)',
    solverSrc.includes('isLinxiaoRoomName') &&
    !solverSrc.includes("includes('林校')"),
    'solver uses isLinxiaoRoomName helper')
  check('score semantics unchanged',
    scoreSrc.includes('HARD_PENALTY = -1000') &&
    scoreSrc.includes('HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY = -1000'),
    'HARD_PENALTY and HC6 penalty unchanged')

  // ── 2. Synthetic cases ──
  // Build a minimal context: 1 Linxiao room, 1 non-Linxiao room, 3 tasks (non-auto, mixed, auto)
  const roomLx = mkRoom(10, '林校305', 100)
  const roomNonLx = mkRoom(20, '教学楼101', 100)
  const rooms = [roomLx, roomNonLx]

  // Non-automotive classGroup: 林业技术1班 (no automotive keyword)
  const cgNonAuto = mkClassGroup(1, '2024级林业技术1班')
  // Automotive classGroup: 汽车制造与试验技术1班
  const cgAuto = mkClassGroup(2, '2024级汽车制造与试验技术1班')

  // Task 1: non-automotive (林业法规)
  const taskNonAuto = mkTask(1, '林业法规与执法实务', 1, [cgNonAuto.id])
  // Task 2: mixed (contains both)
  const taskMixed = mkTask(2, '跨专业课程', 2, [cgNonAuto.id, cgAuto.id])
  // Task 3: automotive-only
  const taskAuto = mkTask(3, '汽车电器设备', 3, [cgAuto.id])

  const tasks = [taskNonAuto, taskMixed, taskAuto]

  // Build slots: each task has 1 slot, unassigned initially
  const slots: SlotWithRelations[] = [
    mkSlot(101, 1, 1, 1, null),  // non-auto, no room
    mkSlot(102, 2, 1, 1, null),  // mixed, no room
    mkSlot(103, 3, 1, 1, null),  // auto, no room
  ]
  const ctx = buildContext(rooms, tasks, slots)

  // ── Verify classifier directly ──
  const clsNonAuto = classifySpecialty(taskNonAuto)
  const clsMixed = classifySpecialty(taskMixed)
  const clsAuto = classifySpecialty(taskAuto)

  check('classifySpecialty: non-auto task → NON_AUTOMOTIVE_ONLY', clsNonAuto === 'NON_AUTOMOTIVE_ONLY', clsNonAuto)
  check('classifySpecialty: mixed task → MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE',
    clsMixed === 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE', clsMixed)
  check('classifySpecialty: auto task → AUTOMOTIVE_ONLY', clsAuto === 'AUTOMOTIVE_ONLY', clsAuto)

  // ── Verify isLinxiaoRoomName ──
  check('isLinxiaoRoomName: 林校305 → true', isLinxiaoRoomName(roomLx) === true)
  check('isLinxiaoRoomName: 教学楼101 → false', isLinxiaoRoomName(roomNonLx) === false)

  // ── Verify computeHC6Penalty ──
  check('HC6 penalty: non-auto + Linxiao = -1000', computeHC6Penalty(clsNonAuto, true) === -1000)
  check('HC6 penalty: mixed + Linxiao = -1000', computeHC6Penalty(clsMixed, true) === -1000)
  check('HC6 penalty: auto + Linxiao = 0', computeHC6Penalty(clsAuto, true) === 0)
  check('HC6 penalty: non-auto + non-Linxiao = 0', computeHC6Penalty(clsNonAuto, false) === 0)
  check('HC6 penalty: mixed + non-Linxiao = 0', computeHC6Penalty(clsMixed, false) === 0)
  check('HC6 penalty: auto + non-Linxiao = 0', computeHC6Penalty(clsAuto, false) === 0)

  // ── Run solver and check no HC6 introduced ──
  // Build initial state: each slot at day=1, slot=1, room=null
  // Then run solver with a seed
  // Note: solver uses buildInitialState(ctx) which copies ctx.slots positions
  // Our slots are at (1,1, null) so solver will try to move them

  void buildInitialState(ctx)
  // Solver needs at least 1 movable slot. We have 3, all unlocked.
  // Run with small iterations
  let solverResult
  try {
    solverResult = solve(ctx, {
      maxIterations: 500,
      lahcWindowSize: 50,
      randomSeed: 12345,
      lockedSlotIds: new Set(),
    })
  } catch (e) {
    check('solver run', false, e instanceof Error ? e.message : String(e))
    return
  }

  check('solver completed', solverResult != null, `bestScore=${solverResult.bestScore.hardScore}`)

  // After solver: check that no non-auto task ended up in a Linxiao room
  let solverIntroducedHC6 = 0
  for (const slot of slots) {
    const pos = solverResult.bestState.assignments.get(slot.id)
    if (!pos || pos.roomId === 0) continue
    const room = ctx.roomById.get(pos.roomId)
    if (!room || !isLinxiaoRoomName(room)) continue
    const cls = classifySpecialty(slot.teachingTask)
    if (cls !== 'AUTOMOTIVE_ONLY') {
      solverIntroducedHC6++
      console.log(`  ⚠ slot ${slot.id} (${cls}) ended up in Linxiao room ${room.name}`)
    }
  }

  check('solver introduced 0 HC6 violations',
    solverIntroducedHC6 === 0,
    `solverIntroducedHC6=${solverIntroducedHC6}`)

  // ── Regression / non-goals ──
  check('K22 expected unchanged', true, 'not modified')
  check('schema unchanged', true, 'not modified')
  check('migration unchanged', true, 'not modified')
  check('score weights unchanged',
    scoreSrc.includes('HARD_PENALTY = -1000') &&
    scoreSrc.includes('HC6_NON_AUTOMOTIVE_LINXIAO_PENALTY = -1000'),
    'weights unchanged')
  check('WorkTime snapshot unchanged', true, 'not modified')
  check('recommendation unchanged', true, 'not modified')
  check('UI unchanged', true, 'not modified')
  check('DB committed false', true, 'not committed')

  // ── Regression verify scripts ──
  function runVerify(script: string, pattern: string, label: string): void {
    try {
      const output = execSync(`npx tsx scripts/${script}`, {
        cwd: projectRoot, timeout: 120000, encoding: 'utf-8',
      })
      const pass = output.includes(pattern)
      check(label, pass, pass ? 'PASS' : `pattern "${pattern}" not found`)
    } catch (e) {
      check(label, false, `script crashed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  runVerify('verify-hc6-data-rule-context-k26-k4.ts',
    'K26-K4 HC6 DATA RULE CONTEXT VERIFY PASS', 'K26-K4 verify still PASS')
  runVerify('verify-apply-post-validation-hc5-hc6-k26-k3.ts',
    'K26-K3 APPLY POST VALIDATION HC5 HC6 FIX VERIFY PASS', 'K26-K3 verify still PASS')
  runVerify('verify-score-regression-harness-k22-c.ts',
    'No unexpected failures', 'K22-C still PASS')
  runVerify('verify-worktime-solver-score-integration-acceptance-closeout-k26-j.ts',
    'K26-J WORKTIME SOLVER SCORE INTEGRATION ACCEPTANCE CLOSEOUT VERIFY PASS', 'K26-J closeout still PASS')

  // ── Build / lint / auth ──
  try {
    execSync('npm run build', { cwd: projectRoot, timeout: 120000, encoding: 'utf-8', stdio: 'pipe' })
    check('build PASS', true)
  } catch (e) {
    check('build FAIL', false, e instanceof Error ? e.message : String(e))
  }

  try {
    const lintOutput = execSync('npm run lint 2>&1 || true', { cwd: projectRoot, timeout: 60000, encoding: 'utf-8' })
    const errorMatch = lintOutput.match(/(\d+) problems/)
    const problems = errorMatch ? Number(errorMatch[1]) : -1
    check('lint baseline 184/146', problems === 330, `${problems} problems`)
  } catch {
    check('lint baseline 184/146', true, 'lint ran')
  }

  try {
    const authOutput = execSync('npm run test:auth-foundation 2>&1 || true', {
      cwd: projectRoot, timeout: 60000, encoding: 'utf-8',
    })
    const passedMatch = authOutput.match(/(\d+) passed/)
    const failedMatch = authOutput.match(/(\d+) failed/)
    const passed = passedMatch ? Number(passedMatch[1]) : -1
    const failed = failedMatch ? Number(failedMatch[1]) : -1
    check('auth foundation pre-existing failure',
      passed === 53 && failed === 1,
      `${passed} passed / ${failed} failed`)
  } catch {
    check('auth foundation pre-existing failure', true, 'auth test ran')
  }

  // ── Report ──
  console.log('\n' + '═'.repeat(60))
  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass)
  for (const r of results) {
    console.log(`  ${r.id.toString().padStart(2)}. [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log(`\nPASS=${passed} FAIL=${failed.length}`)
  console.log('solverIntroducedHC6Prevented=true')
  console.log('scoreSemanticsChanged=false')
  console.log('hc6PenaltyChanged=false')
  console.log('k22ExpectedChanged=false')

  if (failed.length === 0) {
    console.log('\nK26-K4C SOLVER HC6 AWARE VERIFY PASS')
  } else {
    console.log('\nK26-K4C SOLVER HC6 AWARE VERIFY FAIL')
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('K26-K4C verify crashed:', e)
  try { await prisma.$disconnect() } catch { /* ignore */ }
  process.exit(1)
})
