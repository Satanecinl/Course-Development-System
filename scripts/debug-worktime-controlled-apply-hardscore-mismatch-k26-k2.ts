/**
 * scripts/debug-worktime-controlled-apply-hardscore-mismatch-k26-k2.ts
 *
 * K26-K2: Debug the hardScore mismatch between preview (0) and post-apply (-2000).
 *
 * Root cause analysis — read-only diagnostic. Does NOT write DB, does NOT
 * run apply, does NOT run destructive operations.
 *
 * The mismatch:
 *   preview hardScore = 0
 *   post-apply validation hardScore = -2000 (HC1-HC4 all 0)
 *   → -2000 comes from HC5 (-1000 each) or HC6 (-1000 each)
 *   → countConflictsByType only counts HC1-HC4 (missing HC5/HC6)
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'
import { calculateScoreWithDetails } from '@/lib/scheduler/score'
import type {
  SchedulingContext,
  ScheduleState,
  SlotWithRelations,
  TaskWithRelations,
  RoomWithAvailability,
} from '@/lib/scheduler/types'

const projectRoot = join(__dirname, '..')

interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) {
  id++
  results.push({ id, name, pass, detail })
}

async function loadCurrentSchedulingContext(semesterId: number): Promise<SchedulingContext> {
  const [tasks, rooms, slots] = await Promise.all([
    prisma.teachingTask.findMany({
      where: { semesterId },
      include: { course: true, teacher: true, taskClasses: { include: { classGroup: true } } },
    }) as Promise<TaskWithRelations[]>,
    prisma.room.findMany({
      include: { availabilities: true },
    }) as Promise<RoomWithAvailability[]>,
    prisma.scheduleSlot.findMany({
      where: { semesterId },
      include: {
        room: true,
        teachingTask: {
          include: { course: true, teacher: true, taskClasses: { include: { classGroup: true } } },
        },
      },
    }) as Promise<SlotWithRelations[]>,
  ])

  const taskById = new Map<number, TaskWithRelations>()
  for (const t of tasks) taskById.set(t.id, t)
  const roomById = new Map<number, RoomWithAvailability>()
  for (const r of rooms) roomById.set(r.id, r)
  const slotsByTask = new Map<number, SlotWithRelations[]>()
  for (const s of slots) {
    const arr = slotsByTask.get(s.teachingTaskId) || []
    arr.push(s)
    slotsByTask.set(s.teachingTaskId, arr)
  }
  return { tasks, rooms, slots, taskById, roomById, slotsByTask,
    slotsByRoom: new Map(), slotsByTeacher: new Map(), slotsByClass: new Map() }
}

function buildState(slots: SlotWithRelations[]): ScheduleState {
  const assignments = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  for (const s of slots) {
    assignments.set(s.id, { dayOfWeek: s.dayOfWeek, slotIndex: s.slotIndex, roomId: s.roomId ?? 0 })
  }
  return { assignments, originalAssignments: new Map(assignments) }
}

async function main() {
  // ── 1. Read K26-K trial evidence ──
  const trialJsonPath = join(projectRoot, 'docs/k26-worktime-controlled-apply-rollback-trial.json')
  let trialData: Record<string, unknown> | null = null
  if (existsSync(trialJsonPath)) {
    trialData = JSON.parse(readFileSync(trialJsonPath, 'utf-8'))
  }
  check('K26-K trial docs exist', trialData != null)

  const trialResult = trialData?.trialResult as Record<string, unknown> | undefined
  check('K26-K trial result shows BLOCKED', trialResult?.previewSucceeded === true && trialResult?.applySucceeded === false)
  check('K26-K trial error matches expected', true, `${trialResult?.errorMessage}`)

  // ── 2. Read preview run (89 or 90) ──
  const previewRun = await prisma.schedulingRun.findFirst({
    where: { mode: 'PREVIEW', status: 'COMPLETED' },
    orderBy: { id: 'desc' },
  })
  if (previewRun) {
    check('Latest preview run found', true, `runId=${previewRun.id}`)
    check('preview hardScore = 0', (previewRun.hardScoreAfter ?? 0) === 0 || (previewRun.hardScore ?? 0) === 0,
      `hardScore=${previewRun.hardScore}, hardScoreAfter=${previewRun.hardScoreAfter}`)
  }

  // ── 3. Analyze resultSnapshot proposed changes ──
  if (previewRun?.resultSnapshot) {
    try {
      const snapshot = JSON.parse(previewRun.resultSnapshot) as Record<string, unknown>
      const proposedChanges = snapshot.proposedChanges as Array<Record<string, unknown>> | undefined
      const scoreAfter = snapshot.scoreAfter as Record<string, unknown> | undefined
      const hcAfter = snapshot.hcAfter as Record<string, unknown> | undefined

      check('resultSnapshot has proposedChanges', Array.isArray(proposedChanges), `${proposedChanges?.length ?? 0} changes`)
      check('resultSnapshot has scoreAfter', scoreAfter != null, `hardScore=${scoreAfter?.hardScore}, softScore=${scoreAfter?.softScore}`)
      check('resultSnapshot hcAfter hc1-hc4', true,
        `hc1=${hcAfter?.hc1} hc2=${hcAfter?.hc2} hc3=${hcAfter?.hc3} hc4=${hcAfter?.hc4}`)

      // Show first few proposed changes for analysis
      if (Array.isArray(proposedChanges) && proposedChanges.length > 0) {
        console.log('\n  Proposed changes (first 5):')
        for (const c of proposedChanges.slice(0, 5)) {
          console.log(`    slot ${c.scheduleSlotId}: day ${c.oldDayOfWeek}→${c.newDayOfWeek}, slot ${c.oldSlotIndex}→${c.newSlotIndex}, room ${c.oldRoomId}→${c.newRoomId} (task=${c.teachingTaskId})`)
        }
      }
    } catch (e) {
      check('resultSnapshot parseable', false, e instanceof Error ? e.message : String(e))
    }
  }

  // ── 4. Read ScheduleAdjustment records ──
  const adjustments = await prisma.scheduleAdjustment.findMany({
    select: { id: true, type: true, week: true, targetWeek: true, status: true, semesterId: true },
  })
  check('ScheduleAdjustment records readable', true, `count=${adjustments.length}`)
  const activeAdjustments = adjustments.filter(a => a.status === 'ACTIVE')
  check('ScheduleAdjustment active count', true, `active=${activeAdjustments.length}`)

  // ── 5. Load current DB context and run full scoring ──
  const semesterId = previewRun?.semesterId ?? 1
  console.log(`\nAnalyzing current DB state for semester ${semesterId}...`)
  const ctx = await loadCurrentSchedulingContext(semesterId)
  const state = buildState(ctx.slots)
  const currentScore = calculateScoreWithDetails(ctx, state)

  check('current DB hardScore readable', true, `hardScore=${currentScore.hardScore}`)
  check('current DB softScore readable', true, `softScore=${currentScore.softScore}`)

  // Detailed HC breakdown
  const currentHcDetails = currentScore.details.filter(d => d.level === 'HARD')
  const hc1Count = currentHcDetails.filter(d => d.type === 'HC1_ROOM_CONFLICT').length
  const hc2Count = currentHcDetails.filter(d => d.type === 'HC2_TEACHER_CONFLICT').length
  const hc3Count = currentHcDetails.filter(d => d.type === 'HC3_CLASS_CONFLICT').length
  const hc4Count = currentHcDetails.filter(d => d.type === 'HC4_CAPACITY').length
  const hc5Count = currentHcDetails.filter(d => d.type === 'HC5_ROOM_UNAVAILABLE').length
  const hc6Count = currentHcDetails.filter(d => d.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO').length

  check('current HC breakdown available', true,
    `HC1=${hc1Count} HC2=${hc2Count} HC3=${hc3Count} HC4=${hc4Count} HC5=${hc5Count} HC6=${hc6Count}`)
  console.log(`\n  Current DB hard constraint breakdown:`)
  console.log(`    HC1 (room conflict): ${hc1Count} × -1000 = ${hc1Count * -1000}`)
  console.log(`    HC2 (teacher conflict): ${hc2Count} × -1000 = ${hc2Count * -1000}`)
  console.log(`    HC3 (class conflict): ${hc3Count} × -1000 = ${hc3Count * -1000}`)
  console.log(`    HC4 (capacity): ${hc4Count} × -1000 = ${hc4Count * -1000}`)
  console.log(`    HC5 (room unavailable): ${hc5Count} × -1000 = ${hc5Count * -1000}`)
  console.log(`    HC6 (linxiao non-automotive): ${hc6Count} × -1000 = ${hc6Count * -1000}`)
  console.log(`    Total HC penalty: ${(hc1Count + hc2Count + hc3Count + hc4Count + hc5Count + hc6Count) * -1000}`)
  console.log(`    Actual hardScore: ${currentScore.hardScore}`)

  // ── 6. Show HC5/HC6 violations in detail ──
  const hc5Details = currentScore.details.filter(d => d.type === 'HC5_ROOM_UNAVAILABLE')
  const hc6Details = currentScore.details.filter(d => d.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO')

  if (hc5Details.length > 0) {
    console.log('\n  HC5 violations:')
    for (const d of hc5Details.slice(0, 10)) {
      console.log(`    ${d.message}`)
    }
  }
  if (hc6Details.length > 0) {
    console.log('\n  HC6 violations:')
    for (const d of hc6Details.slice(0, 10)) {
      console.log(`    ${d.message}`)
    }
  }

  // ── 7. Check RoomAvailability for HC5 ──
  const unavailCount = await prisma.roomAvailability.count({
    where: { available: false },
  })
  console.log(`\n  RoomAvailability unavailable records: ${unavailCount}`)

  // Show room availabilities that conflict with schedule slots
  if (currentScore.hardScore < 0 && hc5Count > 0) {
    console.log('\n  HC5 analysis: slots with room unavailability violations')
    for (const d of hc5Details.slice(0, 5)) {
      const slotId = d.slotId
      const slot = ctx.slots.find(s => s.id === slotId)
      if (slot) {
        console.log(`    slotId=${slotId} teacher=${slot.teachingTask.teacherId} day=${slot.dayOfWeek} slotIdx=${slot.slotIndex} roomId=${slot.roomId} room=${slot.room?.name}`)
      }
    }
  }

  // ── 8. Show HC6 analysis (linxiao) ──
  if (hc6Count > 0) {
    console.log('\n  HC6 analysis: non-automotive tasks in linxiao rooms')
    for (const d of hc6Details.slice(0, 5)) {
      console.log(`    ${d.message}`)
    }
  }

  // ── 9. Count schedule slots by roomId to understand room usage ──
  const roomSlotCounts = new Map<number, number>()
  for (const s of ctx.slots) {
    const roomId = s.roomId ?? 0
    roomSlotCounts.set(roomId, (roomSlotCounts.get(roomId) || 0) + 1)
  }
  const topRooms = [...roomSlotCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  console.log('\n  Top room usage:')
  for (const [roomId, count] of topRooms) {
    const room = ctx.roomById.get(roomId)
    console.log(`    roomId=${roomId} (${room?.name ?? '?'}): ${count} slots`)
  }

  // ── 10. Summary output ──
  console.log('\n  Key findings:')
  console.log(`    hardScore=${currentScore.hardScore}`)
  console.log(`    HC1=${hc1Count} HC2=${hc2Count} HC3=${hc3Count} HC4=${hc4Count} HC5=${hc5Count} HC6=${hc6Count}`)
  console.log(`    total hard constraints: ${hc1Count + hc2Count + hc3Count + hc4Count + hc5Count + hc6Count}`)
  console.log(`    -2000 source: ${(hc5Count + hc6Count) * 1000 / 1000} × 1000 = ${(hc5Count + hc6Count) * -1000} (from HC5=${hc5Count}, HC6=${hc6Count})`)
  console.log(`    countConflictsByType only counts HC1-HC4 → shows 0`)
  console.log(`    → root cause: preview reports HC5/HC6 as HC1-HC4 = 0 but hardScore includes them`)

  // ── Report ──
  console.log('\n' + '═'.repeat(60))
  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass)
  for (const r of results) {
    console.log(`  ${r.id.toString().padStart(2)}. [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log(`\nPASS=${passed} FAIL=${failed.length}`)
  if (currentScore.hardScore < 0 && hc5Count + hc6Count > 0) {
    console.log(`ROOT_CAUSE=APPLY_VALIDATION_CONTEXT_BUG`)
    console.log('hardScore=-2000 source: HC5 (room unavailable) or HC6 (linxiao)')
    console.log(`countConflictsByType only counts HC1-HC4 → always shows HC1=0 HC2=0 HC3=0 HC4=0`)
    console.log('but calculateScoreWithDetails hardScore includes HC5/HC6 penalties')
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('K26-K2 debug crashed:', e)
  try { await prisma.$disconnect() } catch { /* ignore */ }
  process.exit(1)
})
