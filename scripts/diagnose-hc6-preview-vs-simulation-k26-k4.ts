/**
 * scripts/diagnose-hc6-preview-vs-simulation-k26-k4.ts
 *
 * K26-K4: Precise diagnostic to find why preview hardScore=0
 * but simulation of applying proposed changes gives HC6=2.
 *
 * Read-only. Does NOT write DB.
 */

import { prisma } from '@/lib/prisma'
import { loadSchedulingContext } from '@/lib/scheduler/data-loader'
import { buildInitialState } from '@/lib/scheduler/solver'
import { calculateScoreWithDetails } from '@/lib/scheduler/score'
import type { RoomWithAvailability, TaskWithRelations } from '@/lib/scheduler/types'

// Duplicated from score.ts
const AUTOMOTIVE_KEYWORDS = ['汽车', '车辆', '新能源', '智能网联', '汽修']
function classifyLocal(task: TaskWithRelations) {
  const cgs = task.taskClasses.map(tc => tc.classGroup.name)
  if (cgs.length === 0) {
    const aux = (task.course?.name != null && AUTOMOTIVE_KEYWORDS.some(kw => task.course!.name.includes(kw))) ||
      (task.remark != null && AUTOMOTIVE_KEYWORDS.some(kw => task.remark!.includes(kw)))
    return aux ? 'AUX_AUTO' : 'UNKNOWN'
  }
  const anyAuto = cgs.some(n => AUTOMOTIVE_KEYWORDS.some(kw => n.includes(kw)))
  const anyNonAuto = cgs.some(n => !AUTOMOTIVE_KEYWORDS.some(kw => n.includes(kw)))
  if (anyAuto && anyNonAuto) return 'MIXED'
  if (anyAuto) return 'AUTO'
  return 'NON_AUTO'
}
function isLx(room: RoomWithAvailability) {
  return room.name.includes('林校') || (room.building?.includes('林校') ?? false)
}

function cloneAssignments(a: Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>) {
  const m = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  for (const [k, v] of a) m.set(k, { ...v })
  return m
}

async function main() {
  console.log('K26-K4: HC6 Preview vs Simulation Diagnostic')
  console.log('─'.repeat(60))

  const semesterId = 1
  const ctx = await loadSchedulingContext({ semesterId })

  // Get latest preview run
  const previewRun = await prisma.schedulingRun.findFirst({
    where: { mode: 'PREVIEW', status: 'COMPLETED' },
    orderBy: { id: 'desc' },
  })
  if (!previewRun?.resultSnapshot) {
    console.log('ERROR: no preview run with resultSnapshot')
    process.exit(1)
  }

  const snapshot = JSON.parse(previewRun.resultSnapshot)
  const changes = snapshot.proposedChanges || []

  console.log(`Preview run ${previewRun.id}: hardScoreAfter=${previewRun.hardScoreAfter}`)
  console.log(`Proposed changes: ${changes.length}`)

  // Build simulation state
  const origState = buildInitialState(ctx)
  const simState = { assignments: cloneAssignments(origState.assignments), originalAssignments: origState.originalAssignments }

  for (const c of changes) {
    simState.assignments.set(c.scheduleSlotId, {
      dayOfWeek: c.newDayOfWeek,
      slotIndex: c.newSlotIndex,
      roomId: c.newRoomId || 0,
    })
  }

  // Score both states
  const origScore = calculateScoreWithDetails(ctx, origState)
  const simScore = calculateScoreWithDetails(ctx, simState)

  console.log(`\nOriginal state: hardScore=${origScore.hardScore}`)
  console.log(`Simulated state: hardScore=${simScore.hardScore}`)

  // Find HC6 differences
  const origHc6 = origScore.details.filter(d => d.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO')
  const simHc6 = simScore.details.filter(d => d.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO')

  console.log(`\nOriginal HC6 violations: ${origHc6.length}`)
  for (const d of origHc6) console.log(`  slotId=${d.slotId}: ${d.message}`)

  console.log(`\nSimulated HC6 violations: ${simHc6.length}`)
  for (const d of simHc6) console.log(`  slotId=${d.slotId}: ${d.message}`)

  // Check: which slots changed position AND are now in Linxiao rooms?
  console.log(`\n── Slots that moved INTO Linxiao rooms ──`)
  let movedToLxCount = 0
  for (const c of changes) {
    const newRoom = ctx.roomById.get(c.newRoomId || 0)
    if (!newRoom || !isLx(newRoom)) continue
    const slot = ctx.slots.find(s => s.id === c.scheduleSlotId)
    if (!slot) continue
    const cls = classifyLocal(slot.teachingTask)
    if (cls === 'AUTO') continue // automotive in Linxiao is fine
    movedToLxCount++
    console.log(`  slotId=${c.scheduleSlotId} task=${slot.teachingTask.course?.name} cls=${cls}`)
    console.log(`    old: room=${c.oldRoomId} (${c.oldRoomName})`)
    console.log(`    new: room=${c.newRoomId} (${c.newRoomName})`)
  }
  console.log(`Total non-auto tasks moved to Linxiao: ${movedToLxCount}`)

  // Check: which slots are in Linxiao in simulation but NOT in proposed changes?
  console.log(`\n── Slots in Linxiao in simulation that were NOT in proposed changes ──`)
  const changeIds = new Set(changes.map((c: { scheduleSlotId: number }) => c.scheduleSlotId))
  for (const [slotId, pos] of simState.assignments) {
    if (changeIds.has(slotId)) continue
    const room = ctx.roomById.get(pos.roomId)
    if (!room || !isLx(room)) continue
    const slot = ctx.slots.find(s => s.id === slotId)
    if (!slot) continue
    const cls = classifyLocal(slot.teachingTask)
    if (cls === 'AUTO') continue
    console.log(`  slotId=${slotId} task=${slot.teachingTask.course?.name} cls=${cls} room=${room.name}`)
  }

  // Check the preview's blocked logic
  const hcAfter = snapshot.hcAfter || {}
  const blocked = snapshot.blockReasons || []
  console.log(`\n── Preview blocked logic ──`)
  console.log(`hcAfter: hc1=${hcAfter.hc1} hc2=${hcAfter.hc2} hc3=${hcAfter.hc3} hc4=${hcAfter.hc4}`)
  console.log(`hardScoreAfter=${previewRun.hardScoreAfter}`)
  console.log(`blocked=${blocked.length > 0}, blockReasons=${blocked.join(', ')}`)
  console.log(`(Note: blocked check only uses HC1-HC4 + hardScore, NOT HC5/HC6)`)

  // CRITICAL: check if preview's hcAfter.hc4 differs from simulation
  console.log(`\n── Comparison ──`)
  console.log(`Preview hcAfter.hc4=${hcAfter.hc4}`)
  const simHc4 = simScore.details.filter(d => d.type === 'HC4_CAPACITY').length
  console.log(`Simulation HC4=${simHc4}`)
  console.log(`Match: ${hcAfter.hc4 === simHc4}`)

  // Check if solver's bestState might have different slot positions
  // by comparing proposed changes to simulation
  console.log(`\n── Verifying proposed changes produce simulation state ──`)
  let mismatches = 0
  for (const c of changes) {
    const simPos = simState.assignments.get(c.scheduleSlotId)
    if (!simPos) { console.log(`  slotId=${c.scheduleSlotId}: NOT in simulation`); mismatches++; continue }
    if (simPos.dayOfWeek !== c.newDayOfWeek || simPos.slotIndex !== c.newSlotIndex || simPos.roomId !== (c.newRoomId || 0)) {
      console.log(`  slotId=${c.scheduleSlotId}: position mismatch sim=(${simPos.dayOfWeek},${simPos.slotIndex},${simPos.roomId}) expected=(${c.newDayOfWeek},${c.newSlotIndex},${c.newRoomId || 0})`)
      mismatches++
    }
  }
  console.log(`Mismatches: ${mismatches}`)

  // KEY TEST: score the simulation state using the exact same function as preview
  // Preview uses: calculateScoreWithDetails(ctx, solveResult.bestState)
  // Our simulation uses: calculateScoreWithDetails(ctx, simState)
  // These should be identical if simState === bestState
  console.log(`\n── Scoring verification ──`)
  console.log(`Simulation hardScore=${simScore.hardScore}`)
  console.log(`Preview hardScoreAfter=${previewRun.hardScoreAfter}`)
  console.log(`These should match if simulation state = solver bestState`)

  if (simScore.hardScore !== previewRun.hardScoreAfter) {
    console.log(`\n⚠ MISMATCH: simulation gives hardScore=${simScore.hardScore} but preview says ${previewRun.hardScoreAfter}`)
    console.log(`This means either:`)
    console.log(`  1. The proposed changes don't fully represent the solver's bestState`)
    console.log(`  2. The solver's ctx is different from our ctx`)
    console.log(`  3. The solver's scoring is different from calculateScoreWithDetails`)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('Diagnostic crashed:', e)
  try { await prisma.$disconnect() } catch { /* ignore */ }
  process.exit(1)
})
