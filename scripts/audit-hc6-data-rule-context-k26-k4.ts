/**
 * scripts/audit-hc6-data-rule-context-k26-k4.ts
 *
 * K26-K4: Deep audit of HC6 classification, slot context, and
 * preview vs post-apply scoring context mismatch.
 *
 * Read-only. Does NOT write DB.
 */

import { prisma } from '@/lib/prisma'
import { loadSchedulingContext } from '@/lib/scheduler/data-loader'
import { buildInitialState } from '@/lib/scheduler/solver'
import { calculateScoreWithDetails } from '@/lib/scheduler/score'
import type { ScheduleState, RoomWithAvailability, TaskWithRelations } from '@/lib/scheduler/types'

// ── Duplicated from score.ts (read-only audit, no semantic change) ──
const AUTOMOTIVE_KEYWORDS = ['汽车', '车辆', '新能源', '智能网联', '汽修']
type SpecialtyClassification =
  | 'AUTOMOTIVE_ONLY' | 'NON_AUTOMOTIVE_ONLY' | 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE'
  | 'NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL' | 'UNKNOWN_NO_SIGNAL'

function classifySpecialtyLocal(task: TaskWithRelations): SpecialtyClassification {
  const cgs = task.taskClasses.map(tc => tc.classGroup.name)
  if (cgs.length === 0) {
    const auxAuto =
      (task.course?.name != null && AUTOMOTIVE_KEYWORDS.some(kw => task.course!.name.includes(kw))) ||
      (task.remark != null && AUTOMOTIVE_KEYWORDS.some(kw => task.remark!.includes(kw)))
    return auxAuto ? 'NO_CLASSGROUP_AUX_AUTOMOTIVE_SIGNAL' : 'UNKNOWN_NO_SIGNAL'
  }
  const anyAuto = cgs.some(n => AUTOMOTIVE_KEYWORDS.some(kw => n.includes(kw)))
  const anyNonAuto = cgs.some(n => !AUTOMOTIVE_KEYWORDS.some(kw => n.includes(kw)))
  if (anyAuto && anyNonAuto) return 'MIXED_AUTOMOTIVE_AND_NON_AUTOMOTIVE'
  if (anyAuto) return 'AUTOMOTIVE_ONLY'
  return 'NON_AUTOMOTIVE_ONLY'
}

function isLinxiaoRoomNameLocal(room: RoomWithAvailability): boolean {
  if (room.name.includes('林校')) return true
  if (room.building && room.building.includes('林校')) return true
  return false
}

function computeHC6PenaltyLocal(cls: SpecialtyClassification, isLx: boolean): number {
  if (!isLx) return 0
  if (cls === 'AUTOMOTIVE_ONLY') return 0
  return -1000
}

interface CheckResult { id: number; name: string; pass: boolean; detail?: string }
const results: CheckResult[] = []
let id = 0
function check(name: string, pass: boolean, detail?: string) {
  id++
  results.push({ id, name, pass, detail })
}

/** Deep-clone assignments for simulation */
function cloneAssignments(a: Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>) {
  const m = new Map<number, { dayOfWeek: number; slotIndex: number; roomId: number }>()
  for (const [k, v] of a) m.set(k, { ...v })
  return m
}

async function main() {
  console.log('K26-K4: HC6 Data/Rule Context Audit')
  console.log('─'.repeat(60))

  // ── 1. Load current DB context ──
  const semesterId = 1 // active semester
  const ctx = await loadSchedulingContext({ semesterId })
  const state = buildInitialState(ctx)

  console.log(`\nContext: ${ctx.tasks.length} tasks, ${ctx.rooms.length} rooms, ${ctx.slots.length} slots`)

  // ── 2. Full HC6 scoring of current DB state ──
  const currentScore = calculateScoreWithDetails(ctx, state)
  const hc6Details = currentScore.details.filter(d => d.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO')
  console.log(`\nCurrent DB: hardScore=${currentScore.hardScore}, HC6 violations=${hc6Details.length}`)
  for (const d of hc6Details) {
    console.log(`  slotId=${d.slotId}: ${d.message}`)
  }

  // ── 3. Audit slot244 ──
  const slot244 = ctx.slots.find(s => s.id === 244)
  if (slot244) {
    const room = ctx.roomById.get(slot244.roomId ?? 0)
    const task = slot244.teachingTask
    const cls = classifySpecialtyLocal(task)
    const isLx = room ? isLinxiaoRoomNameLocal(room) : false
    const hc6pen = computeHC6PenaltyLocal(cls, isLx)

    console.log(`\n── slot244 ──`)
    console.log(`  teachingTaskId=${slot244.teachingTaskId}`)
    console.log(`  course=${task.course?.name}`)
    console.log(`  teacher=${task.teacher?.name ?? '(null)'}`)
    console.log(`  roomId=${slot244.roomId}, roomName=${room?.name}, building=${room?.building}`)
    console.log(`  dayOfWeek=${slot244.dayOfWeek}, slotIndex=${slot244.slotIndex}`)
    console.log(`  classGroups: ${task.taskClasses.map(tc => `${tc.classGroup.name} (id=${tc.classGroupId})`).join(', ')}`)
    console.log(`  specialtyClassification=${cls}`)
    console.log(`  isLinxiaoRoom=${isLx}`)
    console.log(`  hc6Penalty=${hc6pen}`)
    console.log(`  current position: day=${state.assignments.get(244)?.dayOfWeek}, slot=${state.assignments.get(244)?.slotIndex}, room=${state.assignments.get(244)?.roomId}`)

    check('slot244 exists', true)
    check('slot244 classGroup classification', true, cls)
    check('slot244 Linxiao room', isLx, room?.name)
    check('slot244 HC6 expected', hc6pen !== 0, `hc6Penalty=${hc6pen}`)
  } else {
    check('slot244 exists', false, 'slot not found in current context')
  }

  // ── 4. Audit slot383 ──
  const slot383 = ctx.slots.find(s => s.id === 383)
  if (slot383) {
    const room = ctx.roomById.get(slot383.roomId ?? 0)
    const task = slot383.teachingTask
    const cls = classifySpecialtyLocal(task)
    const isLx = room ? isLinxiaoRoomNameLocal(room) : false
    const hc6pen = computeHC6PenaltyLocal(cls, isLx)

    console.log(`\n── slot383 ──`)
    console.log(`  teachingTaskId=${slot383.teachingTaskId}`)
    console.log(`  course=${task.course?.name}`)
    console.log(`  teacher=${task.teacher?.name ?? '(null)'}`)
    console.log(`  roomId=${slot383.roomId}, roomName=${room?.name}, building=${room?.building}`)
    console.log(`  dayOfWeek=${slot383.dayOfWeek}, slotIndex=${slot383.slotIndex}`)
    console.log(`  classGroups: ${task.taskClasses.map(tc => `${tc.classGroup.name} (id=${tc.classGroupId})`).join(', ')}`)
    console.log(`  specialtyClassification=${cls}`)
    console.log(`  isLinxiaoRoom=${isLx}`)
    console.log(`  hc6Penalty=${hc6pen}`)
    console.log(`  current position: day=${state.assignments.get(383)?.dayOfWeek}, slot=${state.assignments.get(383)?.slotIndex}, room=${state.assignments.get(383)?.roomId}`)

    check('slot383 exists', true)
    check('slot383 classGroup classification', true, cls)
    check('slot383 Linxiao room', isLx, room?.name)
    check('slot383 HC6 expected', hc6pen !== 0, `hc6Penalty=${hc6pen}`)
  } else {
    check('slot383 exists', false, 'slot not found in current context')
  }

  // ── 5. Read latest preview run resultSnapshot ──
  const previewRun = await prisma.schedulingRun.findFirst({
    where: { mode: 'PREVIEW', status: 'COMPLETED' },
    orderBy: { id: 'desc' },
  })
  check('latest preview run exists', previewRun != null, `runId=${previewRun?.id}`)

  if (previewRun?.resultSnapshot) {
    const snapshot = JSON.parse(previewRun.resultSnapshot) as Record<string, unknown>
    const proposedChanges = (snapshot.proposedChanges ?? []) as Array<Record<string, unknown>>
    const scoreAfter = (snapshot.scoreAfter ?? {}) as Record<string, unknown>

    console.log(`\n── Preview Run 94 ──`)
    console.log(`  hardScoreAfter=${scoreAfter.hardScore}, softScoreAfter=${scoreAfter.softScore}`)
    console.log(`  proposedChanges count=${proposedChanges.length}`)

    // Check if slot244 or slot383 are in proposed changes
    const change244 = proposedChanges.find(c => c.scheduleSlotId === 244)
    const change383 = proposedChanges.find(c => c.scheduleSlotId === 383)

    if (change244) {
      console.log(`\n  slot244 proposed change:`)
      console.log(`    old: day=${change244.oldDayOfWeek}, slot=${change244.oldSlotIndex}, room=${change244.oldRoomId} (${change244.oldRoomName})`)
      console.log(`    new: day=${change244.newDayOfWeek}, slot=${change244.newSlotIndex}, room=${change244.newRoomId} (${change244.newRoomName})`)
      check('slot244 in proposed changes', true)
    } else {
      console.log(`\n  slot244 NOT in proposed changes (solver kept original position)`)
      check('slot244 in proposed changes', false, 'solver kept original position')
    }

    if (change383) {
      console.log(`\n  slot383 proposed change:`)
      console.log(`    old: day=${change383.oldDayOfWeek}, slot=${change383.oldSlotIndex}, room=${change383.oldRoomId} (${change383.oldRoomName})`)
      console.log(`    new: day=${change383.newDayOfWeek}, slot=${change383.newSlotIndex}, room=${change383.newRoomId} (${change383.newRoomName})`)
      check('slot383 in proposed changes', true)
    } else {
      console.log(`\n  slot383 NOT in proposed changes (solver kept original position)`)
      check('slot383 in proposed changes', false, 'solver kept original position')
    }

    // ── 6. Simulate apply: apply proposed changes to state and re-score ──
    console.log(`\n── Simulating apply ──`)
    const simState: ScheduleState = {
      assignments: cloneAssignments(state.assignments),
      originalAssignments: state.originalAssignments,
    }

    let changesApplied = 0
    for (const change of proposedChanges) {
      const slotId = change.scheduleSlotId as number
      simState.assignments.set(slotId, {
        dayOfWeek: change.newDayOfWeek as number,
        slotIndex: change.newSlotIndex as number,
        roomId: (change.newRoomId as number) || 0,
      })
      changesApplied++
    }
    console.log(`  Applied ${changesApplied} changes to simulation state`)

    // Score the simulated post-apply state
    const simScore = calculateScoreWithDetails(ctx, simState)
    const simHc6 = simScore.details.filter(d => d.type === 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO')
    console.log(`  Simulated post-apply: hardScore=${simScore.hardScore}, HC6=${simHc6.length}`)

    for (const d of simHc6) {
      const simSlot = ctx.slots.find(s => s.id === d.slotId)
      const simPos = simState.assignments.get(d.slotId ?? 0)
      const simRoom = simPos ? ctx.roomById.get(simPos.roomId) : null
      console.log(`    slotId=${d.slotId}: ${d.message}`)
      if (simSlot && simPos) {
        const task = simSlot.teachingTask
        const cls = classifySpecialtyLocal(task)
        console.log(`      simulated position: day=${simPos.dayOfWeek}, slot=${simPos.slotIndex}, room=${simPos.roomId} (${simRoom?.name})`)
        console.log(`      task course=${task.course?.name}, classGroups=${task.taskClasses.map(tc => tc.classGroup.name).join(', ')}`)
        console.log(`      specialtyClassification=${cls}`)
      }
    }

    // Compare with preview's hardScore
    const previewHardScore = scoreAfter.hardScore as number
    console.log(`\n  Preview hardScore=${previewHardScore}, Simulated hardScore=${simScore.hardScore}`)
    console.log(`  Match: ${previewHardScore === simScore.hardScore}`)

    check('preview hardScore matches simulation', previewHardScore === simScore.hardScore,
      `preview=${previewHardScore}, sim=${simScore.hardScore}`)

    if (simHc6.length > 0) {
      console.log(`\n  ⚠ SIMULATION SHOWS HC6=${simHc6.length} despite preview hardScore=0`)
      console.log(`  This means the preview scoring and post-apply scoring use DIFFERENT contexts.`)
      check('simulation HC6 matches preview', false,
        `preview HC6=0 (from hardScore=0), simulation HC6=${simHc6.length}`)
    } else {
      check('simulation HC6=0', true, 'simulation confirms no HC6 after apply')
    }

    // ── 7. Check ALL Linxiao rooms and all slots in them ──
    console.log(`\n── All Linxiao rooms ──`)
    const linxiaoRooms = ctx.rooms.filter(r => isLinxiaoRoomNameLocal(r))
    for (const room of linxiaoRooms) {
      const slotsInRoom = ctx.slots.filter(s => s.roomId === room.id)
      const posSlots = slotsInRoom.filter(s => {
        const pos = state.assignments.get(s.id)
        return pos && pos.roomId === room.id
      })
      console.log(`  roomId=${room.id} (${room.name}): ${slotsInRoom.length} slots total, ${posSlots.length} at this room position`)
      for (const s of posSlots) {
        const cls = classifySpecialtyLocal(s.teachingTask)
        const hc6 = computeHC6PenaltyLocal(cls, true)
        console.log(`    slotId=${s.id} task=${s.teachingTask.course?.name} classGroups=${s.teachingTask.taskClasses.map(tc => tc.classGroup.name).join(', ')} cls=${cls} hc6=${hc6}`)
      }
    }

    // ── 8. Check simulated state Linxiao assignments ──
    console.log(`\n── Simulated state Linxiao assignments ──`)
    for (const room of linxiaoRooms) {
      const slotsInRoom = simScore.details.filter(d => {
        if (d.type !== 'HC6_NON_AUTOMOTIVE_FORBID_LINXIAO') return false
        // Check if the slot is at this room in simulated state
        const simPos = simState.assignments.get(d.slotId ?? 0)
        return simPos && simPos.roomId === room.id
      })
      if (slotsInRoom.length > 0) {
        console.log(`  roomId=${room.id} (${room.name}): ${slotsInRoom.length} HC6 violations`)
      }
    }

    // ── 9. Check preview's hcAfter in resultSnapshot ──
    const hcAfter = (snapshot.hcAfter ?? {}) as Record<string, number>
    console.log(`\n── Preview hcAfter (from snapshot) ──`)
    console.log(`  hc1=${hcAfter.hc1}, hc2=${hcAfter.hc2}, hc3=${hcAfter.hc3}, hc4=${hcAfter.hc4}`)
    console.log(`  (note: hc5/hc6 not tracked by preview's countConflictsByType)`)

    // ── 10. Check preview's blocked logic ──
    const blocked = (snapshot.blockReasons ?? []) as string[]
    console.log(`  blocked=${blocked.length > 0}, blockReasons=${blocked.join(', ')}`)
    console.log(`  (blocked check does NOT include HC5/HC6 — only HC1-HC4)`)

    // ── 11. Verify: does preview's blocked check miss HC5/HC6? ──
    // Preview blocked = hardScore !== 0 || hc1-4 !== 0
    // But HC5/HC6 could make hardScore != 0 even if hc1-4 = 0
    // If preview hardScore=0, then ALL hard constraints (HC1-HC6) are satisfied
    void previewHardScore
    console.log(`\n── Key insight ──`)
    console.log(`  preview hardScore=0 means solver found state with HC1-HC6 all = 0`)
    console.log(`  BUT: preview's hcAfter only tracks HC1-HC4`)
    console.log(`  AND: preview's blocked check only uses HC1-HC4 + hardScore`)
    console.log(`  If hardScore=0, solver state has NO HC6 violations`)
    console.log(`  So the question is: why does simulated post-apply show HC6?`)
  }

  // ── Report ──
  console.log('\n' + '═'.repeat(60))
  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass)
  for (const r of results) {
    console.log(`  ${r.id.toString().padStart(2)}. [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log(`\nPASS=${passed} FAIL=${failed.length}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('K26-K4 audit crashed:', e)
  try { await prisma.$disconnect() } catch { /* ignore */ }
  process.exit(1)
})
