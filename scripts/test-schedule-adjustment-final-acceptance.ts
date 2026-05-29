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

let failed = false
function softCheck(name: string, ok: boolean, detail: string) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed = true
}

async function main() {
  console.log('=== F2-FIX-E Final Acceptance Test ===\n')

  const baselineActiveCount = await prisma.scheduleAdjustment.count({ where: { status: 'ACTIVE' } })
  console.log(`Baseline ACTIVE adjustments: ${baselineActiveCount}\n`)

  const createdAdjustmentIds: number[] = []

  // ── Helper: cleanup on exit ──
  async function cleanup() {
    for (const id of createdAdjustmentIds) {
      console.log(`[CLEANUP] Voiding adjustment #${id}...`)
      try {
        await fetchAsAdmin(`/api/schedule-adjustments/${id}/void`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmText: 'VOID_ADJUSTMENT' }),
        })
      } catch (e) {
        console.log(`[CLEANUP] Void #${id} failed:`, e)
      }
    }
  }

  try {
    // ============================================================
    // PART 1: Find a test slot
    // ============================================================
    console.log('--- PART 1: Find test slot ---')
    const week7Res = await fetchJson('/api/schedule?week=7&applyAdjustments=true')
    check('week=7 effective fetchable', week7Res.status === 200, `status=${week7Res.status}`)

    const week7Items = week7Res.data as any[]
    const testItem = week7Items.find((item) => item.teacherId != null && !item.isAdjusted)
    check('Found test item', testItem != null, 'no suitable item')

    const originalSlotId: number = testItem.slotId
    const preSlot = await prisma.scheduleSlot.findUnique({ where: { id: originalSlotId } })
    check('Pre-slot exists', preSlot != null, `id=${originalSlotId}`)

    console.log(`  originalSlotId=${originalSlotId}, course=${testItem.courseName}`)
    console.log(`  original: day=${testItem.dayOfWeek}, slot=${testItem.slotIndex}, roomId=${testItem.roomId}\n`)

    // ============================================================
    // PART 2: Same-week adjustment闭环
    // ============================================================
    console.log('--- PART 2: Same-week adjustment ---')

    // Find conflict-free position in week 7
    let sameWeekTargetDay = testItem.dayOfWeek === 7 ? 1 : testItem.dayOfWeek + 1
    let sameWeekTargetSlot = testItem.slotIndex === 6 ? 1 : testItem.slotIndex + 1
    let swFoundFree = false
    const swSearchOrder = [
      { d: 2, s: 3 }, { d: 2, s: 4 }, { d: 2, s: 5 },
      { d: 3, s: 3 }, { d: 3, s: 4 }, { d: 3, s: 5 },
      { d: 4, s: 3 }, { d: 4, s: 4 }, { d: 4, s: 5 },
      { d: 5, s: 3 }, { d: 5, s: 4 }, { d: 5, s: 5 },
    ]
    for (const pos of swSearchOrder) {
      const itemsAtPos = week7Items.filter((item) => item.dayOfWeek === pos.d && item.slotIndex === pos.s)
      const teacherConflict = itemsAtPos.some((item) => item.teacherId === testItem.teacherId)
      const classConflict = itemsAtPos.some(
        (item) => item.classGroupIds && item.classGroupIds.some((id: number) => testItem.classGroupIds?.includes(id)),
      )
      const roomConflict = testItem.roomId != null && itemsAtPos.some((item) => item.roomId === testItem.roomId)
      if (!teacherConflict && !classConflict && !roomConflict) {
        sameWeekTargetDay = pos.d
        sameWeekTargetSlot = pos.s
        swFoundFree = true
        break
      }
    }
    check('Found conflict-free target in week 7', swFoundFree, 'no free position')
    console.log(`  same-week target: day=${sameWeekTargetDay}, slot=${sameWeekTargetSlot}\n`)

    // Dry-run
    const swDry = await fetchJson('/api/schedule-adjustments/dry-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'MOVE',
        week: 7,
        targetWeek: 7,
        originalSlotId,
        newDayOfWeek: sameWeekTargetDay,
        newSlotIndex: sameWeekTargetSlot,
        newRoomId: testItem.roomId,
        reason: 'F2-FIX-E same-week test',
      }),
    })
    check('Same-week dry-run success', swDry.data.success === true, `success=${swDry.data.success}`)
    check('Same-week dry-run canApply', swDry.data.dryRun?.canApply === true, `canApply=${swDry.data.dryRun?.canApply}, conflicts=${JSON.stringify(swDry.data.dryRun?.conflicts?.map((c: any) => c.message))}`)

    // Create
    const swCreate = await fetchJson('/api/schedule-adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'MOVE',
        week: 7,
        targetWeek: 7,
        originalSlotId,
        newDayOfWeek: sameWeekTargetDay,
        newSlotIndex: sameWeekTargetSlot,
        newRoomId: testItem.roomId,
        reason: 'F2-FIX-E same-week test',
        confirmText: 'CONFIRM_ADJUSTMENT',
      }),
    })
    check('Same-week create success', swCreate.data.success === true, `success=${swCreate.data.success}`)
    const swAdjId = swCreate.data.adjustment?.id
    check('Same-week adjustmentId', swAdjId != null, `id=${swAdjId}`)
    createdAdjustmentIds.push(swAdjId)
    console.log(`  same-week adjustmentId=${swAdjId}\n`)

    // Verify week 7 adjusted
    const swW7 = await fetchJson('/api/schedule?week=7&applyAdjustments=true')
    const swMovedItem = swW7.data.find((item: any) => item.adjustmentId === swAdjId)
    check('Same-week moved item in week 7', swMovedItem != null, 'not found')
    if (swMovedItem) {
      check('Same-week new day', swMovedItem.dayOfWeek === sameWeekTargetDay, `day=${swMovedItem.dayOfWeek}`)
      check('Same-week new slot', swMovedItem.slotIndex === sameWeekTargetSlot, `slot=${swMovedItem.slotIndex}`)
      check('Same-week isAdjusted', swMovedItem.isAdjusted === true, `isAdjusted=${swMovedItem.isAdjusted}`)
    }

    // Void same-week
    const swVoid = await fetchJson(`/api/schedule-adjustments/${swAdjId}/void`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmText: 'VOID_ADJUSTMENT' }),
    })
    check('Same-week void success', swVoid.data.success === true, `success=${swVoid.data.success}`)

    // Verify restored
    const swW7After = await fetchJson('/api/schedule?week=7&applyAdjustments=true')
    const swRestored = swW7After.data.find((item: any) => item.slotId === originalSlotId)
    check('Same-week restored', swRestored != null, 'not restored')
    if (swRestored) {
      check('Same-week restored day', swRestored.dayOfWeek === testItem.dayOfWeek, `day=${swRestored.dayOfWeek}`)
      check('Same-week restored slot', swRestored.slotIndex === testItem.slotIndex, `slot=${swRestored.slotIndex}`)
    }
    console.log()

    // ============================================================
    // PART 3: Cross-week adjustment闭环
    // ============================================================
    console.log('--- PART 3: Cross-week adjustment ---')

    // Find conflict-free position in week 8
    const w8Res = await fetchJson('/api/schedule?week=8&applyAdjustments=true')
    const w8Items = w8Res.data as any[]
    let cwTargetDay = 2
    let cwTargetSlot = 3
    let foundFree = false
    const searchOrder = [
      { d: 2, s: 3 }, { d: 2, s: 4 }, { d: 2, s: 5 },
      { d: 3, s: 3 }, { d: 3, s: 4 }, { d: 3, s: 5 },
      { d: 4, s: 3 }, { d: 4, s: 4 }, { d: 4, s: 5 },
    ]
    for (const pos of searchOrder) {
      const itemsAtPos = w8Items.filter((item) => item.dayOfWeek === pos.d && item.slotIndex === pos.s)
      const teacherConflict = itemsAtPos.some((item) => item.teacherId === testItem.teacherId)
      const classConflict = itemsAtPos.some(
        (item) => item.classGroupIds && item.classGroupIds.some((id: number) => testItem.classGroupIds?.includes(id)),
      )
      const roomConflict = testItem.roomId != null && itemsAtPos.some((item) => item.roomId === testItem.roomId)
      if (!teacherConflict && !classConflict && !roomConflict) {
        cwTargetDay = pos.d
        cwTargetSlot = pos.s
        foundFree = true
        break
      }
    }
    check('Found conflict-free target in week 8', foundFree, 'no free position')
    console.log(`  target: day=${cwTargetDay}, slot=${cwTargetSlot}, roomId=${testItem.roomId}\n`)

    // Dry-run cross-week
    const cwDry = await fetchJson('/api/schedule-adjustments/dry-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'MOVE',
        week: 7,
        targetWeek: 8,
        originalSlotId,
        newDayOfWeek: cwTargetDay,
        newSlotIndex: cwTargetSlot,
        newRoomId: testItem.roomId,
        reason: 'F2-FIX-E cross-week test',
      }),
    })
    check('Cross-week dry-run success', cwDry.data.success === true, `success=${cwDry.data.success}`)
    check('Cross-week dry-run canApply', cwDry.data.dryRun?.canApply === true, `canApply=${cwDry.data.dryRun?.canApply}`)

    // Create cross-week
    const cwCreate = await fetchJson('/api/schedule-adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'MOVE',
        week: 7,
        targetWeek: 8,
        originalSlotId,
        newDayOfWeek: cwTargetDay,
        newSlotIndex: cwTargetSlot,
        newRoomId: testItem.roomId,
        reason: 'F2-FIX-E cross-week test',
        confirmText: 'CONFIRM_ADJUSTMENT',
      }),
    })
    check('Cross-week create success', cwCreate.data.success === true, `success=${cwCreate.data.success}`)
    const cwAdjId = cwCreate.data.adjustment?.id
    check('Cross-week adjustmentId', cwAdjId != null, `id=${cwAdjId}`)
    createdAdjustmentIds.push(cwAdjId)
    console.log(`  cross-week adjustmentId=${cwAdjId}\n`)

    // Verify week 7: original removed
    const cwW7 = await fetchJson('/api/schedule?week=7&applyAdjustments=true')
    const cwOriginalInW7 = cwW7.data.find((item: any) => item.slotId === originalSlotId && !item.isAdjusted)
    check('Cross-week original removed from week 7', cwOriginalInW7 == null, 'still visible')

    // Verify week 8: moved-in present
    const cwW8 = await fetchJson('/api/schedule?week=8&applyAdjustments=true')
    const cwMovedItem = cwW8.data.find((item: any) => item.adjustmentId === cwAdjId)
    check('Cross-week moved item in week 8', cwMovedItem != null, 'not found')
    if (cwMovedItem) {
      check('Cross-week isAdjusted', cwMovedItem.isAdjusted === true, `isAdjusted=${cwMovedItem.isAdjusted}`)
      check('Cross-week sourceWeek=7', cwMovedItem.sourceWeek === 7, `sourceWeek=${cwMovedItem.sourceWeek}`)
      check('Cross-week targetWeek=8', cwMovedItem.targetWeek === 8, `targetWeek=${cwMovedItem.targetWeek}`)
      check('Cross-week day matches', cwMovedItem.dayOfWeek === cwTargetDay, `day=${cwMovedItem.dayOfWeek}`)
      check('Cross-week slot matches', cwMovedItem.slotIndex === cwTargetSlot, `slot=${cwMovedItem.slotIndex}`)
    }

    // Verify week 8 raw: no moved item
    const cwW8Raw = await fetchJson('/api/schedule?week=8')
    const cwRawMoved = cwW8Raw.data.find((item: any) => item.adjustmentId === cwAdjId)
    check('Cross-week raw week 8 no moved item', cwRawMoved == null, 'found in raw')
    console.log()

    // ============================================================
    // PART 4: Filter compatibility
    // ============================================================
    console.log('--- PART 4: Filter compatibility ---')

    // Class filter in week 7
    const classId = testItem.classGroupIds?.[0]
    if (classId) {
      const w7Class = await fetchJson(`/api/schedule?week=7&applyAdjustments=true&viewType=class&targetId=${classId}`)
      check('Week 7 class filter fetchable', w7Class.status === 200, `status=${w7Class.status}`)
      const classItems = w7Class.data as any[]
      const testItemInClass = classItems.find((item) => item.slotId === originalSlotId || item.originalSlotId === originalSlotId)
      check('Week 7 class filter: original removed', testItemInClass == null || testItemInClass.isAdjusted, 'filter issue')
    }

    // Class filter in week 8 (should show moved item)
    if (classId) {
      const w8Class = await fetchJson(`/api/schedule?week=8&applyAdjustments=true&viewType=class&targetId=${classId}`)
      check('Week 8 class filter fetchable', w8Class.status === 200, `status=${w8Class.status}`)
      const classItemsW8 = w8Class.data as any[]
      const movedInClass = classItemsW8.find((item) => item.adjustmentId === cwAdjId)
      check('Week 8 class filter: moved item visible', movedInClass != null, 'moved item not in class filter')
    }

    // Teacher filter in week 8
    if (testItem.teacherId) {
      const w8Teacher = await fetchJson(`/api/schedule?week=8&applyAdjustments=true&viewType=teacher&targetId=${testItem.teacherId}`)
      check('Week 8 teacher filter fetchable', w8Teacher.status === 200, `status=${w8Teacher.status}`)
      const teacherItems = w8Teacher.data as any[]
      const movedInTeacher = teacherItems.find((item) => item.adjustmentId === cwAdjId)
      check('Week 8 teacher filter: moved item visible', movedInTeacher != null, 'moved item not in teacher filter')
    }

    // Room filter in week 8
    if (testItem.roomId) {
      const w8Room = await fetchJson(`/api/schedule?week=8&applyAdjustments=true&viewType=room&targetId=${testItem.roomId}`)
      check('Week 8 room filter fetchable', w8Room.status === 200, `status=${w8Room.status}`)
      const roomItems = w8Room.data as any[]
      const movedInRoom = roomItems.find((item) => item.adjustmentId === cwAdjId)
      check('Week 8 room filter: moved item visible', movedInRoom != null, 'moved item not in room filter')
    }
    console.log()

    // ============================================================
    // PART 5: Excel export acceptance
    // ============================================================
    console.log('--- PART 5: Excel export acceptance ---')

    // 5.1 ALL export
    const allExcelRes = await fetchAsAdmin('/api/export/excel')
    softCheck('ALL Excel export status', allExcelRes.status === 200, `status=${allExcelRes.status}`)
    softCheck('ALL Excel content-type', allExcelRes.headers.get('content-type')?.includes('spreadsheet') ?? false, `type=${allExcelRes.headers.get('content-type')}`)
    console.log('  ALL export: OK')

    // 5.2 Week 7 export with adjustments (cross-week active)
    const w7ExcelRes = await fetchAsAdmin('/api/export/excel?week=7&applyAdjustments=true')
    softCheck('Week 7 Excel export status', w7ExcelRes.status === 200, `status=${w7ExcelRes.status}`)
    console.log('  Week 7 export: OK')

    // 5.3 Week 8 export with adjustments (should show moved-in)
    const w8ExcelRes = await fetchAsAdmin('/api/export/excel?week=8&applyAdjustments=true')
    softCheck('Week 8 Excel export status', w8ExcelRes.status === 200, `status=${w8ExcelRes.status}`)
    console.log('  Week 8 export: OK')

    // 5.4 Week 7 raw export (should NOT show moved-out course since it uses base schedule + week filter)
    const w7RawExcelRes = await fetchAsAdmin('/api/export/excel?week=7')
    softCheck('Week 7 raw Excel export status', w7RawExcelRes.status === 200, `status=${w7RawExcelRes.status}`)
    console.log('  Week 7 raw export: OK')
    console.log()

    // ============================================================
    // PART 6: Void cross-week adjustment
    // ============================================================
    console.log('--- PART 6: Void cross-week adjustment ---')
    const cwVoid = await fetchJson(`/api/schedule-adjustments/${cwAdjId}/void`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmText: 'VOID_ADJUSTMENT' }),
    })
    check('Cross-week void success', cwVoid.data.success === true, `success=${cwVoid.data.success}`)

    // Verify week 7 restored
    const cwW7After = await fetchJson('/api/schedule?week=7&applyAdjustments=true')
    const cwRestored = cwW7After.data.find((item: any) => item.slotId === originalSlotId)
    check('Cross-week week 7 restored', cwRestored != null, 'not restored')
    if (cwRestored) {
      check('Cross-week restored day', cwRestored.dayOfWeek === testItem.dayOfWeek, `day=${cwRestored.dayOfWeek}`)
      check('Cross-week restored slot', cwRestored.slotIndex === testItem.slotIndex, `slot=${cwRestored.slotIndex}`)
      check('Cross-week restored not adjusted', cwRestored.isAdjusted !== true, `isAdjusted=${cwRestored.isAdjusted}`)
    }

    // Verify week 8 removed
    const cwW8After = await fetchJson('/api/schedule?week=8&applyAdjustments=true')
    const cwRemoved = cwW8After.data.find((item: any) => item.adjustmentId === cwAdjId)
    check('Cross-week week 8 removed', cwRemoved == null, 'still in week 8')
    console.log()

    // ============================================================
    // PART 7: Excel export after void
    // ============================================================
    console.log('--- PART 7: Excel export after void ---')
    const w7AfterVoidExcel = await fetchAsAdmin('/api/export/excel?week=7&applyAdjustments=true')
    softCheck('Week 7 after void Excel status', w7AfterVoidExcel.status === 200, `status=${w7AfterVoidExcel.status}`)

    const w8AfterVoidExcel = await fetchAsAdmin('/api/export/excel?week=8&applyAdjustments=true')
    softCheck('Week 8 after void Excel status', w8AfterVoidExcel.status === 200, `status=${w8AfterVoidExcel.status}`)
    console.log()

    // ============================================================
    // PART 8: Final verification
    // ============================================================
    console.log('--- PART 8: Final verification ---')
    const finalActiveCount = await prisma.scheduleAdjustment.count({ where: { status: 'ACTIVE' } })
    check('ACTIVE count unchanged', finalActiveCount === baselineActiveCount, `before=${baselineActiveCount}, after=${finalActiveCount}`)

    const finalSlot = await prisma.scheduleSlot.findUnique({ where: { id: originalSlotId } })
    check('ScheduleSlot day unchanged', finalSlot?.dayOfWeek === preSlot?.dayOfWeek, `day changed`)
    check('ScheduleSlot slot unchanged', finalSlot?.slotIndex === preSlot?.slotIndex, `slot changed`)
    check('ScheduleSlot room unchanged', finalSlot?.roomId === preSlot?.roomId, `room changed`)

    console.log()
    if (failed) {
      console.log('FAIL — Some soft checks failed')
      await cleanup()
      process.exit(1)
    }
    console.log('PASS — All acceptance tests passed')
  } catch (e) {
    console.error('\nTest failed:', e)
    await cleanup()
    process.exit(1)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
