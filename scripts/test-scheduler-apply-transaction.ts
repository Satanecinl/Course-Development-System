/**
 * Apply Transaction validation script.
 *
 * Strategy: Real apply → verify → manual restore via SchedulerRunChange records.
 *
 * Steps:
 * 1. Create a fresh preview run.
 * 2. Record before-state fingerprints and counts.
 * 3. Apply the preview via apply service.
 * 4. Verify apply results (status=COMPLETED, hardScore=0, etc.).
 * 5. Read SchedulerRunChange records to get old values.
 * 6. Manually restore ScheduleSlot positions to old values.
 * 7. Verify restored fingerprint matches before-state.
 * 8. Report whether cleanup succeeded.
 *
 * Safety:
 * - If restore fails, script exits with error and demands manual cleanup.
 * - Audit records (SchedulingRun, SchedulerRunChange) are kept.
 */
import { PrismaClient } from '@prisma/client'
import {
  computeDatabaseFingerprintFromSlots,
  createSchedulerPreview,
} from '../src/lib/scheduler/preview'
import { applySchedulerPreview } from '../src/lib/scheduler/apply'
import { loadSchedulingContext } from '../src/lib/scheduler/data-loader'
import { buildInitialState } from '../src/lib/scheduler/solver'
import { calculateInitialScore, calculateScoreWithDetails } from '../src/lib/scheduler/score'

const prisma = new PrismaClient()

function countConflictsByType(
  details: { type: string }[],
): { hc1: number; hc2: number; hc3: number; hc4: number } {
  let hc1 = 0, hc2 = 0, hc3 = 0, hc4 = 0
  for (const d of details) {
    if (d.type === 'HC1_ROOM_CONFLICT') hc1++
    else if (d.type === 'HC2_TEACHER_CONFLICT') hc2++
    else if (d.type === 'HC3_CLASS_CONFLICT') hc3++
    else if (d.type === 'HC4_CAPACITY') hc4++
  }
  return { hc1, hc2, hc3, hc4 }
}

async function main() {
  console.log('# Scheduler Apply Transaction Validation\n')

  // ── 1. Create a fresh preview run ──
  console.log('--- Step 1: Create fresh preview run ---')
  const previewResult = await createSchedulerPreview({
    maxIterations: 10000,
    lahcWindowSize: 500,
    operatorId: null,
    operatorName: 'Apply Validation Script',
  })

  console.log(`previewRunId: ${previewResult.runId}`)
  console.log(`preview mode: ${previewResult.mode}`)
  console.log(`preview status: ${previewResult.status}`)
  console.log(`preview hardScoreAfter: ${previewResult.scoreAfter.hardScore}`)
  console.log(`preview changedSlotCount: ${previewResult.changedSlotCount}`)
  console.log(`preview proposedChanges: ${previewResult.proposedChanges.length}`)

  if (previewResult.status !== 'COMPLETED' || previewResult.scoreAfter.hardScore !== 0) {
    console.error('\nABORT: Preview is not safe to apply')
    process.exit(1)
  }

  // ── 2. Record before-state ──
  console.log('\n--- Step 2: Record before-state ---')
  const beforeSlots = await prisma.scheduleSlot.findMany({
    select: { id: true, teachingTaskId: true, dayOfWeek: true, slotIndex: true, roomId: true },
    orderBy: { id: 'asc' },
  })
  const beforeFingerprint = computeDatabaseFingerprintFromSlots(beforeSlots)
  const beforeRunCount = await prisma.schedulingRun.count()
  const beforeChangeCount = await prisma.schedulerRunChange.count()

  console.log(`before ScheduleSlot fingerprint: ${beforeFingerprint}`)
  console.log(`before SchedulingRun count: ${beforeRunCount}`)
  console.log(`before SchedulerRunChange count: ${beforeChangeCount}`)

  // ── 3. Apply the preview ──
  console.log('\n--- Step 3: Apply preview ---')
  const applyResult = await applySchedulerPreview({
    previewRunId: previewResult.runId,
    confirmApply: true,
    operatorId: null,
    operatorName: 'Apply Validation Script',
  })

  console.log(`applyRunId: ${applyResult.applyRunId}`)
  console.log(`apply status: ${applyResult.status}`)
  console.log(`appliedSlotCount: ${applyResult.appliedSlotCount}`)
  console.log(`hardScoreAfter: ${applyResult.hardScoreAfter}`)
  console.log(`HC1/HC2/HC3/HC4 after: ${applyResult.hc1After}/${applyResult.hc2After}/${applyResult.hc3After}/${applyResult.hc4After}`)
  console.log(`databaseFingerprintBefore: ${applyResult.databaseFingerprintBefore}`)
  console.log(`databaseFingerprintAfter: ${applyResult.databaseFingerprintAfter}`)

  // ── 4. Verify apply results ──
  console.log('\n--- Step 4: Assertions ---')
  let failures = 0

  function check(name: string, actual: unknown, expected: unknown) {
    const pass = actual === expected
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name} (actual=${actual}, expected=${expected})`)
    if (!pass) failures++
  }

  check('apply status = COMPLETED', applyResult.status, 'COMPLETED')
  check('hardScoreAfter = 0', applyResult.hardScoreAfter, 0)
  check('hc1After = 0', applyResult.hc1After, 0)
  check('hc2After = 0', applyResult.hc2After, 0)
  check('hc3After = 0', applyResult.hc3After, 0)
  check('hc4After = 0', applyResult.hc4After, 0)
  check('appliedSlotCount > 0', applyResult.appliedSlotCount > 0, true)
  check('databaseFingerprint changed', applyResult.databaseFingerprintBefore !== applyResult.databaseFingerprintAfter, true)

  const afterRunCount = await prisma.schedulingRun.count()
  const afterChangeCount = await prisma.schedulerRunChange.count()
  check('SchedulingRun count increased by 1', afterRunCount, beforeRunCount + 1)
  check('SchedulerRunChange count increased', afterChangeCount, beforeChangeCount + applyResult.changeCount)

  // Verify post-apply fingerprint via re-read
  const afterApplySlots = await prisma.scheduleSlot.findMany({
    select: { id: true, teachingTaskId: true, dayOfWeek: true, slotIndex: true, roomId: true },
    orderBy: { id: 'asc' },
  })
  const afterApplyFingerprint = computeDatabaseFingerprintFromSlots(afterApplySlots)
  check('post-apply fingerprint matches apply result', afterApplyFingerprint, applyResult.databaseFingerprintAfter)

  // Verify post-apply score via scheduler
  const postCtx = await loadSchedulingContext()
  const postState = buildInitialState(postCtx)
  const postScore = calculateInitialScore(postCtx, postState)
  const postDetails = calculateScoreWithDetails(postCtx, postState)
  const postHc = countConflictsByType(postDetails.details)
  console.log(`post-apply scheduler hardScore: ${postScore.hardScore}, softScore: ${postScore.softScore}`)
  console.log(`post-apply scheduler HC1=${postHc.hc1} HC2=${postHc.hc2} HC3=${postHc.hc3} HC4=${postHc.hc4}`)
  check('post-apply scheduler hardScore = 0', postScore.hardScore, 0)
  check('post-apply scheduler HC1 = 0', postHc.hc1, 0)
  check('post-apply scheduler HC2 = 0', postHc.hc2, 0)
  check('post-apply scheduler HC3 = 0', postHc.hc3, 0)
  check('post-apply scheduler HC4 = 0', postHc.hc4, 0)

  if (failures > 0) {
    console.error(`\nABORT: ${failures} apply assertions failed`)
    process.exit(1)
  }

  // ── 5. Restore ScheduleSlot positions via SchedulerRunChange records ──
  console.log('\n--- Step 5: Restore ScheduleSlot positions ---')
  const changes = await prisma.schedulerRunChange.findMany({
    where: { runId: applyResult.applyRunId },
    orderBy: { id: 'asc' },
  })

  console.log(`Found ${changes.length} SchedulerRunChange records to restore`)

  let restoreFailures = 0
  for (const change of changes) {
    const currentSlot = await prisma.scheduleSlot.findUnique({
      where: { id: change.scheduleSlotId },
    })
    if (!currentSlot) {
      console.error(`RESTORE FAIL: Slot ${change.scheduleSlotId} not found`)
      restoreFailures++
      continue
    }

    // Verify current values match apply new values
    const currentRoomId = currentSlot.roomId ?? null
    const expectedNewRoomId = change.newRoomId ?? null
    if (
      currentSlot.dayOfWeek !== change.newDayOfWeek ||
      currentSlot.slotIndex !== change.newSlotIndex ||
      currentRoomId !== expectedNewRoomId
    ) {
      console.error(
        `RESTORE WARN: Slot ${change.scheduleSlotId} current values ` +
        `(${currentSlot.dayOfWeek},${currentSlot.slotIndex},${currentRoomId}) ` +
        `do not match apply new values ` +
        `(${change.newDayOfWeek},${change.newSlotIndex},${expectedNewRoomId}). ` +
        `Still restoring to old values.`,
      )
    }

    // Restore to old values
    await prisma.scheduleSlot.update({
      where: { id: change.scheduleSlotId },
      data: {
        dayOfWeek: change.oldDayOfWeek,
        slotIndex: change.oldSlotIndex,
        roomId: change.oldRoomId,
      },
    })
  }

  if (restoreFailures > 0) {
    console.error(`\nCRITICAL: ${restoreFailures} slots could not be restored. MANUAL CLEANUP REQUIRED.`)
    await prisma.$disconnect()
    process.exit(1)
  }

  // ── 6. Verify restoration ──
  console.log('\n--- Step 6: Verify restoration ---')
  const restoredSlots = await prisma.scheduleSlot.findMany({
    select: { id: true, teachingTaskId: true, dayOfWeek: true, slotIndex: true, roomId: true },
    orderBy: { id: 'asc' },
  })
  const restoredFingerprint = computeDatabaseFingerprintFromSlots(restoredSlots)
  console.log(`restored ScheduleSlot fingerprint: ${restoredFingerprint}`)
  console.log(`before ScheduleSlot fingerprint:   ${beforeFingerprint}`)

  const fingerprintRestored = restoredFingerprint === beforeFingerprint
  check('ScheduleSlot fingerprint restored', fingerprintRestored, true)

  // Verify post-restore score matches original
  const restoreCtx = await loadSchedulingContext()
  const restoreState = buildInitialState(restoreCtx)
  const restoreScore = calculateInitialScore(restoreCtx, restoreState)
  const restoreDetails = calculateScoreWithDetails(restoreCtx, restoreState)
  const restoreHc = countConflictsByType(restoreDetails.details)
  console.log(`post-restore scheduler hardScore: ${restoreScore.hardScore}, softScore: ${restoreScore.softScore}`)
  console.log(`post-restore scheduler HC1=${restoreHc.hc1} HC2=${restoreHc.hc2} HC3=${restoreHc.hc3} HC4=${restoreHc.hc4}`)

  // The original state had hard conflicts, so restored state should match original
  check('post-restore fingerprint matches before', restoredFingerprint, beforeFingerprint)

  // ── 7. Summary ──
  console.log('\n--- Summary ---')
  console.log(`Test strategy: real apply then restore via SchedulerRunChange`)
  console.log(`previewRunId: ${previewResult.runId}`)
  console.log(`applyRunId: ${applyResult.applyRunId}`)
  console.log(`proposedChanges count: ${previewResult.proposedChanges.length}`)
  console.log(`before fingerprint: ${beforeFingerprint}`)
  console.log(`after apply fingerprint: ${applyResult.databaseFingerprintAfter}`)
  console.log(`after restore fingerprint: ${restoredFingerprint}`)
  console.log(`apply changed ScheduleSlot: ${beforeFingerprint !== applyResult.databaseFingerprintAfter}`)
  console.log(`restore recovered ScheduleSlot: ${restoredFingerprint === beforeFingerprint}`)
  console.log(`before SchedulingRun count: ${beforeRunCount}`)
  console.log(`after SchedulingRun count: ${afterRunCount}`)
  console.log(`before SchedulerRunChange count: ${beforeChangeCount}`)
  console.log(`after SchedulerRunChange count: ${afterChangeCount}`)
  console.log(`apply hardScoreAfter: ${applyResult.hardScoreAfter}`)
  console.log(`apply HC1/HC2/HC3/HC4 after: ${applyResult.hc1After}/${applyResult.hc2After}/${applyResult.hc3After}/${applyResult.hc4After}`)
  console.log(`unrestored data: ${!fingerprintRestored ? 'YES - MANUAL CLEANUP REQUIRED' : 'NO'}`)
  console.log(`needs manual handling: ${!fingerprintRestored ? 'YES' : 'NO'}`)

  await prisma.$disconnect()

  if (!fingerprintRestored) {
    console.error('\nCRITICAL: ScheduleSlot was NOT fully restored. Manual intervention required.')
    process.exit(1)
  }

  console.log('\nALL PASSED')
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
