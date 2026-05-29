import { PrismaClient } from '@prisma/client'
import { fetchJsonAsAdmin, fetchAsAdmin } from './test-auth-helper'

const prisma = new PrismaClient()

async function fetchJson(path: string, options?: RequestInit): Promise<{ status: number; data: any }> {
  return fetchJsonAsAdmin(path, options) as Promise<{ status: number; data: any }>
}

function check(name: string, ok: boolean, detail: string) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) throw new Error(`CHECK FAILED: ${name} — ${detail}`)
}

async function main() {
  console.log('=== Cross-Week Schedule Adjustment E2E Test ===\n')

  // ── 0. Record baseline ──
  const baselineActiveCount = await prisma.scheduleAdjustment.count({ where: { status: 'ACTIVE' } })
  console.log(`Baseline ACTIVE adjustments: ${baselineActiveCount}\n`)

  let createdAdjustmentId: number | null = null

  // ── 1. Find a slot active in week 7 ──
  console.log('--- Step 1: Find original slot ---')
  const week7Res = await fetchJson('/api/schedule?week=7&applyAdjustments=true')
  check('week=7 effective schedule fetchable', week7Res.status === 200, `status=${week7Res.status}`)

  const week7Items = week7Res.data as any[]
  check('week=7 has items', week7Items.length > 0, `count=${week7Items.length}`)

  // Pick a slot with a teacher (for meaningful conflict checks) and not already adjusted
  const originalSlot = week7Items.find((item) => item.teacherId != null && !item.isAdjusted)
  check('Found suitable original slot', originalSlot != null, 'no slot with teacherId and not adjusted')

  const originalSlotId: number = originalSlot.slotId
  const preSlot = await prisma.scheduleSlot.findUnique({ where: { id: originalSlotId } })
  check('Original slot exists in DB', preSlot != null, `slotId=${originalSlotId}`)

  console.log(`  originalSlotId=${originalSlotId}`)
  console.log(`  course=${originalSlot.courseName}`)
  console.log(`  teacherId=${originalSlot.teacherId}`)
  console.log(`  classGroupIds=${JSON.stringify(originalSlot.classGroupIds)}`)
  console.log(`  roomId=${originalSlot.roomId}`)
  console.log(`  dayOfWeek=${originalSlot.dayOfWeek}, slotIndex=${originalSlot.slotIndex}\n`)

  // ── 2. Find conflict-free target position in week 8 ──
  console.log('--- Step 2: Find conflict-free target position ---')
  const week8Res = await fetchJson('/api/schedule?week=8&applyAdjustments=true')
  check('week=8 effective schedule fetchable', week8Res.status === 200, `status=${week8Res.status}`)

  const week8Items = week8Res.data as any[]

  // Find a free (day, slot, room) combination in week 8
  let targetDay = 2
  let targetSlotIndex = 3
  let targetRoomId = originalSlot.roomId

  // Search for a slot that has no teacher/class/room conflict
  const searchOrder = [
    { d: 2, s: 3 }, { d: 2, s: 4 }, { d: 2, s: 5 },
    { d: 3, s: 3 }, { d: 3, s: 4 }, { d: 3, s: 5 },
    { d: 4, s: 3 }, { d: 4, s: 4 }, { d: 4, s: 5 },
    { d: 5, s: 3 }, { d: 5, s: 4 }, { d: 5, s: 5 },
  ]

  let foundFree = false
  for (const pos of searchOrder) {
    const itemsAtPos = week8Items.filter(
      (item) => item.dayOfWeek === pos.d && item.slotIndex === pos.s,
    )
    const teacherConflict = itemsAtPos.some((item) => item.teacherId === originalSlot.teacherId)
    const classConflict = itemsAtPos.some(
      (item) =>
        item.classGroupIds &&
        item.classGroupIds.some((id: number) => originalSlot.classGroupIds?.includes(id)),
    )
    const roomConflict = targetRoomId != null && itemsAtPos.some((item) => item.roomId === targetRoomId)

    if (!teacherConflict && !classConflict && !roomConflict) {
      targetDay = pos.d
      targetSlotIndex = pos.s
      foundFree = true
      break
    }
  }

  check('Found conflict-free target position', foundFree, 'no free (day, slot) in week 8')
  console.log(`  targetDay=${targetDay}, targetSlotIndex=${targetSlotIndex}, targetRoomId=${targetRoomId}\n`)

  const sourceWeek = 7
  const targetWeek = 8

  // ── 3. Dry-run cross-week MOVE ──
  console.log('--- Step 3: Dry-run cross-week MOVE ---')
  const dryRunRes = await fetchJson('/api/schedule-adjustments/dry-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'MOVE',
      week: sourceWeek,
      targetWeek,
      originalSlotId,
      newDayOfWeek: targetDay,
      newSlotIndex: targetSlotIndex,
      newRoomId: targetRoomId,
      reason: 'cross-week adjustment e2e',
    }),
  })
  check('dry-run success', dryRunRes.data.success === true, `success=${dryRunRes.data.success}`)
  check('dry-run canApply', dryRunRes.data.dryRun?.canApply === true, `canApply=${dryRunRes.data.dryRun?.canApply}`)
  check('dry-run no conflicts', (dryRunRes.data.dryRun?.conflicts?.length ?? 0) === 0, `conflicts=${JSON.stringify(dryRunRes.data.dryRun?.conflicts)}`)
  console.log()

  // ── 4. Create cross-week adjustment ──
  console.log('--- Step 4: Create cross-week adjustment ---')
  const createRes = await fetchJson('/api/schedule-adjustments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'MOVE',
      week: sourceWeek,
      targetWeek,
      originalSlotId,
      newDayOfWeek: targetDay,
      newSlotIndex: targetSlotIndex,
      newRoomId: targetRoomId,
      reason: 'cross-week adjustment e2e',
      confirmText: 'CONFIRM_ADJUSTMENT',
    }),
  })
  check('create success', createRes.data.success === true, `success=${createRes.data.success}, error=${createRes.data.error}`)
  createdAdjustmentId = createRes.data.adjustment?.id
  check('adjustment id returned', createdAdjustmentId != null, `id=${createdAdjustmentId}`)
  check('adjustment status ACTIVE', createRes.data.adjustment?.status === 'ACTIVE', `status=${createRes.data.adjustment?.status}`)
  check('adjustment targetWeek=8', createRes.data.adjustment?.targetWeek === targetWeek, `targetWeek=${createRes.data.adjustment?.targetWeek}`)
  console.log(`  adjustmentId=${createdAdjustmentId}\n`)

  // ── 5. Verify week=7 adjusted schedule: original course removed ──
  console.log('--- Step 5: Week 7 adjusted schedule ---')
  const w7AdjRes = await fetchJson(`/api/schedule?week=${sourceWeek}&applyAdjustments=true`)
  check('week=7 adjusted fetchable', w7AdjRes.status === 200, `status=${w7AdjRes.status}`)

  const w7AdjItems = w7AdjRes.data as any[]
  // The original slot should NOT appear as a non-adjusted item in week 7
  const originalInW7 = w7AdjItems.find((item) => item.slotId === originalSlotId && !item.isAdjusted)
  check('week=7 original course removed', originalInW7 == null, 'original slot still visible in week 7')

  // If there is an adjusted item with originalSlotId, it should be from a cross-week move
  // But for sourceWeek, the moved item should NOT appear (it's in targetWeek)
  const movedInW7 = w7AdjItems.find((item) => item.originalSlotId === originalSlotId)
  check('week=7 no moved item', movedInW7 == null, 'moved item incorrectly shown in source week')
  console.log()

  // ── 6. Verify week=8 adjusted schedule: moved-in course present ──
  console.log('--- Step 6: Week 8 adjusted schedule ---')
  const w8AdjRes = await fetchJson(`/api/schedule?week=${targetWeek}&applyAdjustments=true`)
  check('week=8 adjusted fetchable', w8AdjRes.status === 200, `status=${w8AdjRes.status}`)

  const w8AdjItems = w8AdjRes.data as any[]
  const movedItem = w8AdjItems.find((item) => item.adjustmentId === createdAdjustmentId)
  check('week=8 moved item exists', movedItem != null, `adjustmentId=${createdAdjustmentId} not found in week 8`)
  if (movedItem) {
    check('isAdjusted=true', movedItem.isAdjusted === true, `isAdjusted=${movedItem.isAdjusted}`)
    check('originalSlotId correct', movedItem.originalSlotId === originalSlotId, `originalSlotId=${movedItem.originalSlotId}`)
    check('sourceWeek=7', movedItem.sourceWeek === sourceWeek, `sourceWeek=${movedItem.sourceWeek}`)
    check('targetWeek=8', movedItem.targetWeek === targetWeek, `targetWeek=${movedItem.targetWeek}`)
    check('dayOfWeek matches', movedItem.dayOfWeek === targetDay, `dayOfWeek=${movedItem.dayOfWeek}`)
    check('slotIndex matches', movedItem.slotIndex === targetSlotIndex, `slotIndex=${movedItem.slotIndex}`)
    check('roomId matches', movedItem.roomId === targetRoomId, `roomId=${movedItem.roomId}`)
  }
  console.log()

  // ── 7. Verify week=8 raw schedule: no adjustment effect ──
  console.log('--- Step 7: Week 8 raw schedule ---')
  const w8RawRes = await fetchJson(`/api/schedule?week=${targetWeek}`)
  check('week=8 raw fetchable', w8RawRes.status === 200, `status=${w8RawRes.status}`)

  const w8RawItems = w8RawRes.data as any[]
  const rawMovedItem = w8RawItems.find((item) => item.adjustmentId === createdAdjustmentId)
  check('week=8 raw no moved item', rawMovedItem == null, 'moved item shown in raw schedule')
  console.log()

  // ── 8. Duplicate ACTIVE adjustment guard ──
  console.log('--- Step 8: Duplicate ACTIVE adjustment guard ---')
  const dupRes = await fetchJson('/api/schedule-adjustments/dry-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'MOVE',
      week: sourceWeek,
      targetWeek,
      originalSlotId,
      newDayOfWeek: targetDay,
      newSlotIndex: targetSlotIndex,
      newRoomId: targetRoomId,
    }),
  })
  check('duplicate dry-run rejected', dupRes.data.success === false || dupRes.data.dryRun?.canApply === false, `success=${dupRes.data.success}, canApply=${dupRes.data.dryRun?.canApply}`)

  const dupCreateRes = await fetchJson('/api/schedule-adjustments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'MOVE',
      week: sourceWeek,
      targetWeek,
      originalSlotId,
      newDayOfWeek: targetDay,
      newSlotIndex: targetSlotIndex,
      newRoomId: targetRoomId,
      confirmText: 'CONFIRM_ADJUSTMENT',
    }),
  })
  check('duplicate create rejected', dupCreateRes.data.success === false, `success=${dupCreateRes.data.success}`)
  console.log()

  // ── 9. Target week boundary guards ──
  console.log('--- Step 9: Target week boundary guards ---')
  const tw0Res = await fetchJson('/api/schedule-adjustments/dry-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'MOVE',
      week: sourceWeek,
      targetWeek: 0,
      originalSlotId,
      newDayOfWeek: targetDay,
      newSlotIndex: targetSlotIndex,
    }),
  })
  check('targetWeek=0 rejected', tw0Res.data.success === false || tw0Res.data.dryRun?.canApply === false, `success=${tw0Res.data.success}`)

  const tw21Res = await fetchJson('/api/schedule-adjustments/dry-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'MOVE',
      week: sourceWeek,
      targetWeek: 21,
      originalSlotId,
      newDayOfWeek: targetDay,
      newSlotIndex: targetSlotIndex,
    }),
  })
  check('targetWeek=21 rejected', tw21Res.data.success === false || tw21Res.data.dryRun?.canApply === false, `success=${tw21Res.data.success}`)
  console.log()

  // ── 10. Void adjustment ──
  console.log('--- Step 10: Void adjustment ---')
  const voidRes = await fetchJson(`/api/schedule-adjustments/${createdAdjustmentId}/void`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmText: 'VOID_ADJUSTMENT' }),
  })
  check('void success', voidRes.data.success === true, `success=${voidRes.data.success}`)
  check('void status=VOID', voidRes.data.status === 'VOID', `status=${voidRes.data.status}`)
  console.log()

  // ── 11. Verify week=7 after void: original restored ──
  console.log('--- Step 11: Week 7 after void ---')
  const w7AfterVoidRes = await fetchJson(`/api/schedule?week=${sourceWeek}&applyAdjustments=true`)
  check('week=7 after void fetchable', w7AfterVoidRes.status === 200, `status=${w7AfterVoidRes.status}`)

  const w7AfterVoidItems = w7AfterVoidRes.data as any[]
  const restoredItem = w7AfterVoidItems.find((item) => item.slotId === originalSlotId)
  check('week=7 original course restored', restoredItem != null, 'original slot not restored in week 7')
  if (restoredItem) {
    check('restored isAdjusted=false', restoredItem.isAdjusted !== true, `isAdjusted=${restoredItem.isAdjusted}`)
    check('restored dayOfWeek', restoredItem.dayOfWeek === preSlot?.dayOfWeek, `dayOfWeek=${restoredItem.dayOfWeek}`)
    check('restored slotIndex', restoredItem.slotIndex === preSlot?.slotIndex, `slotIndex=${restoredItem.slotIndex}`)
  }
  console.log()

  // ── 12. Verify week=8 after void: moved-in removed ──
  console.log('--- Step 12: Week 8 after void ---')
  const w8AfterVoidRes = await fetchJson(`/api/schedule?week=${targetWeek}&applyAdjustments=true`)
  check('week=8 after void fetchable', w8AfterVoidRes.status === 200, `status=${w8AfterVoidRes.status}`)

  const w8AfterVoidItems = w8AfterVoidRes.data as any[]
  const afterVoidMovedItem = w8AfterVoidItems.find((item) => item.adjustmentId === createdAdjustmentId)
  check('week=8 moved item removed', afterVoidMovedItem == null, 'moved item still in week 8 after void')
  console.log()

  // ── 13. Final verification ──
  console.log('--- Step 13: Final verification ---')
  const finalActiveCount = await prisma.scheduleAdjustment.count({ where: { status: 'ACTIVE' } })
  check('ACTIVE count unchanged', finalActiveCount === baselineActiveCount, `before=${baselineActiveCount}, after=${finalActiveCount}`)

  const finalSlot = await prisma.scheduleSlot.findUnique({ where: { id: originalSlotId } })
  check('ScheduleSlot unchanged', finalSlot?.dayOfWeek === preSlot?.dayOfWeek, `dayOfWeek changed`)
  check('ScheduleSlot unchanged', finalSlot?.slotIndex === preSlot?.slotIndex, `slotIndex changed`)
  check('ScheduleSlot unchanged', finalSlot?.roomId === preSlot?.roomId, `roomId changed`)

  console.log('\nPASS — All cross-week E2E tests passed')
  await prisma.$disconnect()
}

async function cleanup() {
  if (createdAdjustmentId != null) {
    console.log(`\n[CLEANUP] Voiding adjustment #${createdAdjustmentId}...`)
    try {
      await fetchAsAdmin(`/api/schedule-adjustments/${createdAdjustmentId}/void`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmText: 'VOID_ADJUSTMENT' }),
      })
      console.log('[CLEANUP] Voided successfully')
    } catch (e) {
      console.log('[CLEANUP] Void failed:', e)
    }
  }
  await prisma.$disconnect()
}

let createdAdjustmentId: number | null = null

main().catch(async (e) => {
  console.error('\nTest failed:', e)
  await cleanup()
  process.exit(1)
})
