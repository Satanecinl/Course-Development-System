/**
 * scripts/repair-hc6-existing-slot383-k26-k4a.ts
 *
 * K26-K4A: Controlled data repair for pre-existing HC6 violation.
 *
 * Repairs slot383 (林业法规与执法实务) currently placed in room 23 (林校304)
 * which violates HC6_NON_AUTOMOTIVE_FORBID_LINXIAO since the task's
 * classGroup (2024级林业技术1班) is non-automotive.
 *
 * Default: dry-run (no DB writes).
 * Apply: --apply (after dry-run, creates backup, mutates, verifies).
 * Restore: --restore-backup <path> (reverts to backup, no other changes).
 *
 * Selects a non-Linxiao room that:
 *  - is not already occupied at the same day/slotIdx
 *  - does not trigger HC1-HC6
 *  - has capacity >= task student count
 *  - is in the same semester
 *
 * Does NOT modify: solver, score, HC6 classifier, schema, migration, UI, K22 expected.
 */

import { copyFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'
import {
  isLinxiaoRoomName,
  classifySpecialty,
  computeHC6Penalty,
} from '@/lib/scheduler/score'
import type { RoomWithAvailability } from '@/lib/scheduler/types'

// ── Args ──
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run') || (!args.includes('--apply') && !args.includes('--restore-backup'))
const apply = args.includes('--apply')
const restoreArg = args.find((a) => a.startsWith('--restore-backup='))
const restorePath = restoreArg ? restoreArg.split('=')[1] : null
const TARGET_SLOT_ID = 383

// ── Output ──
const output: Record<string, string | number | boolean> = {}
function set(k: string, v: string | number | boolean) { output[k] = v }
function log(s: string) { console.log(s) }
function head(s: string) { console.log(`\n${'─'.repeat(60)}\n${s}\n${'─'.repeat(60)}`) }

const projectRoot = join(__dirname, '..')
const dbPath = join(projectRoot, 'prisma', 'dev.db')

// ── Signatures ──
function hashSlot(s: { id: number; teachingTaskId: number; dayOfWeek: number; slotIndex: number; roomId: number | null }): string {
  return `${s.id}:${s.teachingTaskId}:${s.dayOfWeek}:${s.slotIndex}:${s.roomId ?? 0}`
}
function hashSlots(slots: { id: number; teachingTaskId: number; dayOfWeek: number; slotIndex: number; roomId: number | null }[]): string {
  return [...slots].sort((a, b) => a.id - b.id).map(hashSlot).join('|')
}

async function captureSignatures() {
  const slots = await prisma.scheduleSlot.findMany({
    where: { semesterId: 1 },
    select: { id: true, teachingTaskId: true, dayOfWeek: true, slotIndex: true, roomId: true },
    orderBy: { id: 'asc' },
  })
  const slotHash = hashSlots(slots)
  const slot = await prisma.scheduleSlot.findUnique({ where: { id: TARGET_SLOT_ID } })
  return { slots, slotHash, slot, slotCount: slots.length }
}

// ── Candidate selection ──
async function findReplacementRoom(slot: NonNullable<Awaited<ReturnType<typeof prisma.scheduleSlot.findUnique>>>) {
  const task = await prisma.teachingTask.findUnique({
    where: { id: slot.teachingTaskId },
    include: { taskClasses: { include: { classGroup: true } }, course: true, teacher: true },
  })
  if (!task) throw new Error('TeachingTask not found for slot ' + slot.id)

  // Compute student count
  const tcs = await prisma.teachingTaskClass.findMany({ where: { teachingTaskId: task.id } })
  let totalStudents = 0
  for (const tc of tcs) {
    const cg = await prisma.classGroup.findUnique({ where: { id: tc.classGroupId } })
    totalStudents += cg?.studentCount ?? 0
  }

  // Find rooms already occupied at the same day/slotIdx
  const samePos = await prisma.scheduleSlot.findMany({
    where: {
      semesterId: slot.semesterId,
      dayOfWeek: slot.dayOfWeek,
      slotIndex: slot.slotIndex,
      NOT: { id: slot.id },
    },
    select: { roomId: true, teachingTaskId: true },
  })
  const usedRoomIds = new Set<number>()
  const otherTeacherIds = new Set<number>()
  const otherClassGroupIds = new Set<number>()
  for (const s of samePos) {
    if (s.roomId != null) usedRoomIds.add(s.roomId)
    const otherTask = await prisma.teachingTask.findUnique({ where: { id: s.teachingTaskId } })
    if (otherTask?.teacherId != null) otherTeacherIds.add(otherTask.teacherId)
    const otherTcs = await prisma.teachingTaskClass.findMany({ where: { teachingTaskId: s.teachingTaskId } })
    for (const otc of otherTcs) otherClassGroupIds.add(otc.classGroupId)
  }

  // Classify task specialty
  const cls = classifySpecialty(task as never)

  // Linxiao room IDs
  const allRooms = await prisma.room.findMany({ orderBy: { id: 'asc' } })
  const linxiaoIds = new Set<number>()
  for (const r of allRooms) {
    if (isLinxiaoRoomName(r as RoomWithAvailability)) linxiaoIds.add(r.id)
  }

  // Build candidates
  interface Candidate {
    roomId: number
    name: string
    capacity: number
    type: string
    building: string | null
    rejected: boolean
    rejectReason: string | null
  }
  const candidates: Candidate[] = []
  for (const r of allRooms) {
    if (linxiaoIds.has(r.id)) {
      candidates.push({ roomId: r.id, name: r.name, capacity: r.capacity, type: r.type, building: r.building, rejected: true, rejectReason: 'Linxiao room (HC6)' })
      continue
    }
    if (usedRoomIds.has(r.id)) {
      candidates.push({ roomId: r.id, name: r.name, capacity: r.capacity, type: r.type, building: r.building, rejected: true, rejectReason: 'Already used at same day/slotIdx (HC1)' })
      continue
    }
    if (r.capacity < totalStudents) {
      candidates.push({ roomId: r.id, name: r.name, capacity: r.capacity, type: r.type, building: r.building, rejected: true, rejectReason: `Capacity ${r.capacity} < student count ${totalStudents} (HC4)` })
      continue
    }
    candidates.push({ roomId: r.id, name: r.name, capacity: r.capacity, type: r.type, building: r.building, rejected: false, rejectReason: null })
  }

  // Filter accepted, sort by capacity ascending then roomId
  const accepted = candidates.filter(c => !c.rejected).sort((a, b) => a.capacity - b.capacity || a.roomId - b.roomId)

  return {
    task,
    totalStudents,
    cls,
    candidates,
    selectedRoom: accepted[0] ?? null,
    linxiaoCount: linxiaoIds.size,
    usedRoomCount: usedRoomIds.size,
  }
}

// ── Backup / restore ──
function createBackup(): string {
  if (!existsSync(dbPath)) throw new Error('dev.db not found at ' + dbPath)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(projectRoot, 'prisma', `dev.db.backup-before-k26-k4a-slot383-repair-${ts}`)
  copyFileSync(dbPath, backupPath)
  return backupPath
}

function restoreBackup(backupPath: string) {
  if (!existsSync(backupPath)) throw new Error('Backup not found: ' + backupPath)
  copyFileSync(backupPath, dbPath)
  log(`Restored from: ${backupPath}`)
}

function signBackup(backupPath: string) {
  log(`\nBackup created: ${backupPath}`)
  if (existsSync(backupPath)) {
    const s = statSync(backupPath)
    log(`  size=${s.size} bytes, mtime=${s.mtime.toISOString()}`)
  }
}

// ── Main ──
async function main() {
  head('K26-K4A: HC6 Data Repair (slot383)')
  log(`mode: ${apply ? 'APPLY' : dryRun ? 'DRY-RUN' : 'DRY-RUN (default)'}`)
  log(`dbPath: ${dbPath}`)

  // Handle restore first if requested
  if (restorePath) {
    head('Restore mode')
    log(`Restoring from: ${restorePath}`)
    restoreBackup(restorePath)
    set('restored', true)
    set('restoreFrom', restorePath)
    await prisma.$disconnect()
    return
  }

  // ── 1. Capture pre-repair signatures ──
  head('1. Pre-repair signatures')
  const preSig = await captureSignatures()
  set('preRepairSlotCount', preSig.slotCount)
  set('preRepairSlotHash', preSig.slotHash.slice(0, 64) + '...')
  set('preRepairSlot383', JSON.stringify(preSig.slot))
  log(`  slotCount=${preSig.slotCount}`)
  log(`  slot383=${JSON.stringify(preSig.slot)}`)

  // ── 2. Audit slot383 context ──
  head('2. slot383 audit')
  const task = await prisma.teachingTask.findUnique({
    where: { id: preSig.slot!.teachingTaskId },
    include: { course: true, teacher: true, taskClasses: { include: { classGroup: true } } },
  })
  const tcs = await prisma.teachingTaskClass.findMany({ where: { teachingTaskId: task!.id }, include: { classGroup: true } })
  let totalStudents = 0
  for (const tc of tcs) totalStudents += tc.classGroup.studentCount

  const cls = classifySpecialty(task as never)
  const currentRoom = preSig.slot!.roomId != null
    ? await prisma.room.findUnique({ where: { id: preSig.slot!.roomId } })
    : null
  const currentIsLx = currentRoom ? isLinxiaoRoomName(currentRoom as RoomWithAvailability) : false
  const currentHc6Penalty = computeHC6Penalty(cls, currentIsLx)

  log(`  teachingTaskId=${task!.id}`)
  log(`  course=${task!.course?.name}`)
  log(`  teacher=${task!.teacher?.name}`)
  log(`  classGroups=${tcs.map(tc => tc.classGroup.name).join(', ')}`)
  log(`  studentCount=${totalStudents}`)
  log(`  current roomId=${preSig.slot!.roomId}, roomName=${currentRoom?.name}`)
  log(`  specialtyClassification=${cls}`)
  log(`  currentIsLinxiaoRoom=${currentIsLx}`)
  log(`  currentHc6Penalty=${currentHc6Penalty}`)

  set('slot383PreState', JSON.stringify({
    roomId: preSig.slot!.roomId,
    roomName: currentRoom?.name,
    dayOfWeek: preSig.slot!.dayOfWeek,
    slotIndex: preSig.slot!.slotIndex,
  }))
  set('specialtyClassification', cls)
  set('studentCount', totalStudents)
  set('currentHc6Penalty', currentHc6Penalty)

  // ── 3. Find replacement candidates ──
  head('3. Replacement candidate analysis')
  const repair = await findReplacementRoom(preSig.slot!)
  log(`  task specialty classification: ${repair.cls}`)
  log(`  total students: ${repair.totalStudents}`)
  log(`  Linxiao room IDs (rejected): ${repair.linxiaoCount}`)
  log(`  Used room IDs at (day=${preSig.slot!.dayOfWeek}, slotIdx=${preSig.slot!.slotIndex}) (rejected): ${repair.usedRoomCount}`)

  const accepted = repair.candidates.filter(c => !c.rejected).sort((a, b) => a.capacity - b.capacity || a.roomId - b.roomId)
  const rejected = repair.candidates.filter(c => c.rejected)
  log(`  Total candidates: ${repair.candidates.length}, accepted: ${accepted.length}, rejected: ${rejected.length}`)

  log(`\n  Rejected candidates (top 10):`)
  for (const c of rejected.slice(0, 10)) {
    log(`    room ${c.roomId} (${c.name}): ${c.rejectReason}`)
  }

  log(`\n  Top 5 accepted candidates (sorted by capacity then roomId):`)
  for (const c of accepted.slice(0, 5)) {
    log(`    room ${c.roomId} (${c.name}) cap=${c.capacity} type=${c.type}`)
  }

  if (!repair.selectedRoom) {
    set('blocking', 'BLOCKED_NO_SAFE_REPAIR_CANDIDATE')
    set('recommendedNextStage', 'K26-K4A1-HC6-DATA-REPAIR-MANUAL-DECISION')
    head('BLOCKED: no safe replacement room')
    log('No non-Linxiao, unoccupied, capacity-sufficient room available.')
    log('Manual decision required.')
    await prisma.$disconnect()
    return
  }

  const sel = repair.selectedRoom
  set('selectedRoomId', sel.roomId)
  set('selectedRoomName', sel.name)
  set('selectedRoomCapacity', sel.capacity)
  set('selectedRoomType', sel.type)
  set('selectedRoomBuilding', sel.building ?? '')
  set('plannedMutation', `UPDATE ScheduleSlot SET roomId=${sel.roomId} WHERE id=${TARGET_SLOT_ID}`)

  log(`\n  Selected replacement: room ${sel.roomId} (${sel.name}) cap=${sel.capacity}`)

  // ── 4. Dry-run / apply ──
  head('4. Mutation')
  if (dryRun) {
    log(`  DRY-RUN: would execute: ${output.plannedMutation}`)
    set('blocking', false)
    set('recommendation', 'Re-run with --apply to perform the data repair')
    log('  (No DB changes performed)')
  }

  if (apply) {
    // Create backup
    const backupPath = createBackup()
    signBackup(backupPath)
    set('backupPath', backupPath)
    set('backupCommitted', false)

    // Execute mutation
    log(`  Executing: ${output.plannedMutation}`)
    await prisma.scheduleSlot.update({
      where: { id: TARGET_SLOT_ID },
      data: { roomId: sel.roomId },
    })
    log('  Mutation applied.')

    // ── 5. Verify post-repair state ──
    head('5. Post-repair verification')
    const postSlot = await prisma.scheduleSlot.findUnique({
      where: { id: TARGET_SLOT_ID },
      include: { room: true, teachingTask: { include: { course: true, teacher: true, taskClasses: { include: { classGroup: true } } } } },
    })
    log(`  slot383 post-repair: roomId=${postSlot?.roomId}, roomName=${postSlot?.room?.name}`)

    const postIsLx = postSlot?.room ? isLinxiaoRoomName(postSlot.room as RoomWithAvailability) : false
    const postHc6Penalty = computeHC6Penalty(cls, postIsLx)
    log(`  post-repair isLinxiaoRoom=${postIsLx}`)
    log(`  post-repair HC6 penalty=${postHc6Penalty}`)

    set('postRepairSlot383', JSON.stringify({ roomId: postSlot?.roomId, roomName: postSlot?.room?.name }))
    set('postRepairIsLinxiao', postIsLx)
    set('postRepairHc6Penalty', postHc6Penalty)

    // Verify slot count unchanged
    const postSig = await captureSignatures()
    set('postRepairSlotCount', postSig.slotCount)
    set('slotCountUnchanged', postSig.slotCount === preSig.slotCount)
    log(`  slotCount: ${preSig.slotCount} → ${postSig.slotCount} (unchanged: ${preSig.slotCount === postSig.slotCount})`)

    // Verify only slot383 changed
    const preSlotsById = new Map(preSig.slots.map(s => [s.id, s]))
    const onlySlot383Changed = postSig.slots.every(s => {
      const pre = preSlotsById.get(s.id)
      if (!pre) return false
      if (s.id === TARGET_SLOT_ID) return s.roomId === sel.roomId && s.dayOfWeek === pre.dayOfWeek && s.slotIndex === pre.slotIndex
      return s.roomId === pre.roomId && s.dayOfWeek === pre.dayOfWeek && s.slotIndex === pre.slotIndex
    })
    set('onlySlot383Changed', onlySlot383Changed)
    log(`  only slot383 changed: ${onlySlot383Changed}`)

    if (postHc6Penalty < 0 || postIsLx) {
      log('  ⚠ Post-repair HC6 penalty is negative or still in Linxiao. Consider restoring backup.')
    } else {
      log('  ✓ Post-repair: no HC6, not in Linxiao')
    }

    set('blocking', postIsLx || postHc6Penalty < 0)
    set('recommendation', 'Run controlled trial next')
  }

  head('Summary')
  for (const [k, v] of Object.entries(output)) {
    log(`  ${k}=${v}`)
  }
  log(`  repairStatus=${output.blocking ? 'FAILED' : (apply ? 'APPLIED' : 'DRY_RUN_PLAN')}`)
  log(`  recommendedNextStage=${output.recommendedNextStage ?? (apply ? 'K26-K-CONTROLLED-APPLY-ROLLBACK-TRIAL' : 'REPAIR-HC6-EXISTING-SLOT383-K26-K4A --apply')}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('K26-K4A repair crashed:', e)
  try { await prisma.$disconnect() } catch { /* ignore */ }
  process.exit(1)
})
