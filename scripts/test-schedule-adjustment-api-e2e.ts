import { PrismaClient } from '@prisma/client'
import { fetchJsonAsAdmin } from './test-auth-helper'

const prisma = new PrismaClient()

async function fetchJson(path: string, options?: RequestInit): Promise<{ status: number; data: any }> {
  return fetchJsonAsAdmin(path, options) as Promise<{ status: number; data: any }>
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

async function main() {
  console.log('=== Schedule Adjustment API E2E Test ===\n')

  // Find a slot active in week 6
  const slot = await prisma.scheduleSlot.findFirst({
    where: {
      teachingTask: { weekType: 'ALL' },
    },
    include: {
      teachingTask: {
        include: {
          course: true,
          teacher: true,
          taskClasses: { include: { classGroup: true } },
        },
      },
      room: true,
    },
  })

  if (!slot) {
    console.log('No valid ScheduleSlot found.')
    console.log('SKIPPED (not a code failure)')
    process.exit(0)
  }

  console.log(`Using slot #${slot.id}: ${slot.teachingTask.course.name}`)
  console.log(`  dayOfWeek=${slot.dayOfWeek}, slotIndex=${slot.slotIndex}`)
  console.log(`  teacher=${slot.teachingTask.teacher?.name ?? 'null'}`)
  console.log(`  room=${slot.room?.name ?? 'null'}`)
  console.log()

  // Choose target position (same position for no-op MOVE to avoid conflicts)
  const targetDay = slot.dayOfWeek
  const targetSlot = slot.slotIndex
  const targetRoomId = slot.roomId

  let failed = false

  function check(name: string, ok: boolean, detail: string) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}${ok ? '' : ` — ${detail}`}`)
    if (!ok) failed = true
  }

  // Record pre-test state
  const preActiveCount = await prisma.scheduleAdjustment.count({ where: { status: 'ACTIVE' } })
  const preSlot = await prisma.scheduleSlot.findUnique({ where: { id: slot.id } })

  // ── Step 1: Dry-run MOVE ──
  console.log('--- Step 1: Dry-run MOVE ---')
  const dryRunRes = await fetchJson('/api/schedule-adjustments/dry-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'MOVE',
      week: 6,
      originalSlotId: slot.id,
      newDayOfWeek: targetDay,
      newSlotIndex: targetSlot,
      newRoomId: targetRoomId,
      reason: 'F1+ API E2E test',
    }),
  })
  check('dry-run success', dryRunRes.data.success === true, `success=${dryRunRes.data.success}`)
  check('dry-run canApply', dryRunRes.data.dryRun?.canApply === true, `canApply=${dryRunRes.data.dryRun?.canApply}`)
  check('dry-run no conflicts', (dryRunRes.data.dryRun?.conflicts?.length ?? 0) === 0, `conflicts=${dryRunRes.data.dryRun?.conflicts?.length}`)
  console.log()

  // ── Step 2: Create adjustment ──
  console.log('--- Step 2: Create adjustment ---')
  const createRes = await fetchJson('/api/schedule-adjustments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'MOVE',
      week: 6,
      originalSlotId: slot.id,
      newDayOfWeek: targetDay,
      newSlotIndex: targetSlot,
      newRoomId: targetRoomId,
      reason: 'F1+ API E2E test',
      confirmText: 'CONFIRM_ADJUSTMENT',
    }),
  })
  check('create success', createRes.data.success === true, `success=${createRes.data.success}`)
  const adjustmentId = createRes.data.adjustment?.id
  check('adjustment id returned', adjustmentId != null, `id=${adjustmentId}`)
  check('adjustment status ACTIVE', createRes.data.adjustment?.status === 'ACTIVE', `status=${createRes.data.adjustment?.status}`)
  console.log()

  // ── Step 3: Verify database ──
  console.log('--- Step 3: Verify database ---')
  const dbAdj = await prisma.scheduleAdjustment.findUnique({ where: { id: adjustmentId } })
  check('adjustment exists in DB', dbAdj != null, `id=${adjustmentId}`)
  check('type = MOVE', dbAdj?.type === 'MOVE', `type=${dbAdj?.type}`)
  check('week = 6', dbAdj?.week === 6, `week=${dbAdj?.week}`)
  check('status = ACTIVE', dbAdj?.status === 'ACTIVE', `status=${dbAdj?.status}`)
  check('originalSlotId correct', dbAdj?.originalSlotId === slot.id, `originalSlotId=${dbAdj?.originalSlotId}`)

  // Verify original slot unchanged
  const postCreateSlot = await prisma.scheduleSlot.findUnique({ where: { id: slot.id } })
  check('original slot dayOfWeek unchanged', postCreateSlot?.dayOfWeek === preSlot?.dayOfWeek, `${preSlot?.dayOfWeek} → ${postCreateSlot?.dayOfWeek}`)
  check('original slot slotIndex unchanged', postCreateSlot?.slotIndex === preSlot?.slotIndex, `${preSlot?.slotIndex} → ${postCreateSlot?.slotIndex}`)
  console.log()

  // ── Step 4: GET effective schedule with adjustments ──
  console.log('--- Step 4: Effective schedule with adjustments ---')
  const effectiveRes = await fetchJson('/api/schedule?week=6&applyAdjustments=true')
  check('effective schedule success', effectiveRes.status === 200, `status=${effectiveRes.status}`)

  const adjustedItem = effectiveRes.data.find((item: any) => item.slotId === slot.id || item.originalSlotId === slot.id)
  check('adjusted item found', adjustedItem != null, `found=${adjustedItem != null}`)
  if (adjustedItem) {
    check('isAdjusted = true', adjustedItem.isAdjusted === true, `isAdjusted=${adjustedItem.isAdjusted}`)
    check('adjustmentId matches', adjustedItem.adjustmentId === adjustmentId, `adjustmentId=${adjustedItem.adjustmentId}`)
    check('dayOfWeek is new value', adjustedItem.dayOfWeek === targetDay, `dayOfWeek=${adjustedItem.dayOfWeek}`)
    check('slotIndex is new value', adjustedItem.slotIndex === targetSlot, `slotIndex=${adjustedItem.slotIndex}`)
  }
  console.log()

  // ── Step 5: GET schedule without applyAdjustments ──
  console.log('--- Step 5: Schedule without applyAdjustments ---')
  const rawRes = await fetchJson('/api/schedule?week=6')
  check('raw schedule success', rawRes.status === 200, `status=${rawRes.status}`)

  const rawItem = rawRes.data.find((item: any) => item.slotId === slot.id)
  check('raw item found', rawItem != null, `found=${rawItem != null}`)
  if (rawItem) {
    check('raw item NOT adjusted', rawItem.isAdjusted !== true, `isAdjusted=${rawItem.isAdjusted}`)
    check('raw item original dayOfWeek', rawItem.dayOfWeek === preSlot?.dayOfWeek, `dayOfWeek=${rawItem.dayOfWeek}`)
  }
  console.log()

  // ── Step 6: Void adjustment ──
  console.log('--- Step 6: Void adjustment ---')
  const voidRes = await fetchJson(`/api/schedule-adjustments/${adjustmentId}/void`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmText: 'VOID_ADJUSTMENT' }),
  })
  check('void success', voidRes.data.success === true, `success=${voidRes.data.success}`)
  check('void status = VOID', voidRes.data.status === 'VOID', `status=${voidRes.data.status}`)
  console.log()

  // ── Step 7: Verify void in database ──
  console.log('--- Step 7: Verify void in database ---')
  const voidedAdj = await prisma.scheduleAdjustment.findUnique({ where: { id: adjustmentId } })
  check('adjustment status = VOID', voidedAdj?.status === 'VOID', `status=${voidedAdj?.status}`)
  console.log()

  // ── Step 8: Effective schedule after void ──
  console.log('--- Step 8: Effective schedule after void ---')
  const afterVoidRes = await fetchJson('/api/schedule?week=6&applyAdjustments=true')
  check('after-void schedule success', afterVoidRes.status === 200, `status=${afterVoidRes.status}`)

  const afterVoidItem = afterVoidRes.data.find((item: any) => item.slotId === slot.id)
  check('slot restored to original', afterVoidItem != null, `found=${afterVoidItem != null}`)
  if (afterVoidItem) {
    check('NOT adjusted after void', afterVoidItem.isAdjusted !== true, `isAdjusted=${afterVoidItem.isAdjusted}`)
    check('original dayOfWeek restored', afterVoidItem.dayOfWeek === preSlot?.dayOfWeek, `dayOfWeek=${afterVoidItem.dayOfWeek}`)
  }
  console.log()

  // ── Step 9: Guard tests ──
  console.log('--- Step 9: Guard tests ---')

  // create missing confirmText
  const g1 = await fetchJson('/api/schedule-adjustments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'CANCEL', week: 6, originalSlotId: slot.id }),
  })
  check('create missing confirmText → 400', g1.status === 400, `status=${g1.status}`)

  // create wrong confirmText
  const g2 = await fetchJson('/api/schedule-adjustments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'CANCEL', week: 6, originalSlotId: slot.id, confirmText: 'WRONG' }),
  })
  check('create wrong confirmText → 400', g2.status === 400, `status=${g2.status}`)

  // void missing confirmText
  const g3 = await fetchJson(`/api/schedule-adjustments/${adjustmentId}/void`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  check('void missing confirmText → 400', g3.status === 400, `status=${g3.status}`)

  // void wrong confirmText
  const g4 = await fetchJson(`/api/schedule-adjustments/${adjustmentId}/void`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmText: 'WRONG' }),
  })
  check('void wrong confirmText → 400', g4.status === 400, `status=${g4.status}`)

  // void non-ACTIVE adjustment
  const g5 = await fetchJson(`/api/schedule-adjustments/${adjustmentId}/void`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmText: 'VOID_ADJUSTMENT' }),
  })
  check('void non-ACTIVE → 400', g5.status === 400, `status=${g5.status}`)

  // dry-run week=0
  const g6 = await fetchJson('/api/schedule-adjustments/dry-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'MOVE', week: 0, originalSlotId: slot.id, newDayOfWeek: 1, newSlotIndex: 1 }),
  })
  check('dry-run week=0 → rejected', g6.data.success === false || g6.data.dryRun?.canApply === false, `success=${g6.data.success}`)

  // dry-run week=21
  const g7 = await fetchJson('/api/schedule-adjustments/dry-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'MOVE', week: 21, originalSlotId: slot.id, newDayOfWeek: 1, newSlotIndex: 1 }),
  })
  check('dry-run week=21 → rejected', g7.data.success === false || g7.data.dryRun?.canApply === false, `success=${g7.data.success}`)
  console.log()

  // ── Step 10: Final verification ──
  console.log('--- Step 10: Final verification ---')
  const postActiveCount = await prisma.scheduleAdjustment.count({ where: { status: 'ACTIVE' } })
  check('ACTIVE adjustment count unchanged', preActiveCount === postActiveCount, `before=${preActiveCount}, after=${postActiveCount}`)

  const finalSlot = await prisma.scheduleSlot.findUnique({ where: { id: slot.id } })
  check('original slot dayOfWeek unchanged', finalSlot?.dayOfWeek === preSlot?.dayOfWeek, `${preSlot?.dayOfWeek} → ${finalSlot?.dayOfWeek}`)
  check('original slot slotIndex unchanged', finalSlot?.slotIndex === preSlot?.slotIndex, `${preSlot?.slotIndex} → ${finalSlot?.slotIndex}`)
  check('original slot roomId unchanged', finalSlot?.roomId === preSlot?.roomId, `${preSlot?.roomId} → ${finalSlot?.roomId}`)
  console.log()

  if (failed) {
    console.log('FAIL')
    process.exit(1)
  }

  console.log('PASS — All API E2E tests passed, no ACTIVE adjustments remain')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
