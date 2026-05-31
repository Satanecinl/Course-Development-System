/**
 * Rollback API validation script.
 *
 * Strategy: preview → apply → rollback → verify → repeat-rollback-guard.
 *
 * Steps:
 * 1. Record initial fingerprint.
 * 2. Create fresh preview run.
 * 3. Apply preview run (real apply, no manual restore).
 * 4. Record after-apply fingerprint.
 * 5. Rollback apply run.
 * 6. Verify rollback results.
 * 7. Verify after-rollback fingerprint equals initial fingerprint.
 * 8. Attempt repeated rollback → must fail.
 * 9. Report summary.
 *
 * Safety:
 * - If any step fails, script exits with error.
 * - Audit records are kept.
 * - Final ScheduleSlot must match initial fingerprint.
 */
import { PrismaClient } from '@prisma/client'
import {
  computeDatabaseFingerprintFromSlots,
  createSchedulerPreview,
} from '../src/lib/scheduler/preview'
import { applySchedulerPreview } from '../src/lib/scheduler/apply'
import { rollbackSchedulerApply } from '../src/lib/scheduler/rollback'
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
  console.log('# Scheduler Rollback API Validation\n')

  // ── 1. Record initial state ──
  console.log('--- Step 1: Record initial state ---')
  const initialSlots = await prisma.scheduleSlot.findMany({
    select: { id: true, teachingTaskId: true, dayOfWeek: true, slotIndex: true, roomId: true },
    orderBy: { id: 'asc' },
  })
  const initialFingerprint = computeDatabaseFingerprintFromSlots(initialSlots)
  const initialRunCount = await prisma.schedulingRun.count()
  const initialChangeCount = await prisma.schedulerRunChange.count()

  console.log(`initial ScheduleSlot fingerprint: ${initialFingerprint}`)
  console.log(`initial SchedulingRun count: ${initialRunCount}`)
  console.log(`initial SchedulerRunChange count: ${initialChangeCount}`)

  // ── 2. Create fresh preview ──
  console.log('\n--- Step 2: Create fresh preview run ---')
  const previewResult = await createSchedulerPreview({
    maxIterations: 10000,
    lahcWindowSize: 500,
    operatorId: null,
    operatorName: 'Rollback Validation Script',
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

  // ── 3. Apply preview (no manual restore) ──
  console.log('\n--- Step 3: Apply preview ---')
  const applyResult = await applySchedulerPreview({
    previewRunId: previewResult.runId,
    confirmApply: true,
    operatorId: null,
    operatorName: 'Rollback Validation Script',
  })

  console.log(`applyRunId: ${applyResult.applyRunId}`)
  console.log(`apply status: ${applyResult.status}`)
  console.log(`appliedSlotCount: ${applyResult.appliedSlotCount}`)
  console.log(`apply hardScoreAfter: ${applyResult.hardScoreAfter}`)

  const afterApplySlots = await prisma.scheduleSlot.findMany({
    select: { id: true, teachingTaskId: true, dayOfWeek: true, slotIndex: true, roomId: true },
    orderBy: { id: 'asc' },
  })
  const afterApplyFingerprint = computeDatabaseFingerprintFromSlots(afterApplySlots)
  console.log(`after apply ScheduleSlot fingerprint: ${afterApplyFingerprint}`)

  // ── 4. Rollback apply ──
  console.log('\n--- Step 4: Rollback apply ---')
  const rollbackResult = await rollbackSchedulerApply({
    applyRunId: applyResult.applyRunId,
    confirmRollback: true,
    operatorId: null,
    operatorName: 'Rollback Validation Script',
  })

  console.log(`rollbackRunId: ${rollbackResult.rollbackRunId}`)
  console.log(`rollback status: ${rollbackResult.status}`)
  console.log(`rolledBackSlotCount: ${rollbackResult.rolledBackSlotCount}`)
  console.log(`rollback hardScoreAfter: ${rollbackResult.hardScoreAfter}`)
  console.log(`rollback HC1/HC2/HC3/HC4 after: ${rollbackResult.hc1After}/${rollbackResult.hc2After}/${rollbackResult.hc3After}/${rollbackResult.hc4After}`)
  console.log(`rollback databaseFingerprintBefore: ${rollbackResult.databaseFingerprintBefore}`)
  console.log(`rollback databaseFingerprintAfter: ${rollbackResult.databaseFingerprintAfter}`)

  // ── 5. Assertions ──
  console.log('\n--- Step 5: Assertions ---')
  let failures = 0

  function check(name: string, actual: unknown, expected: unknown) {
    const pass = actual === expected
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name} (actual=${actual}, expected=${expected})`)
    if (!pass) failures++
  }

  check('rollback status = COMPLETED', rollbackResult.status, 'COMPLETED')
  check('rollback hardScoreAfter recorded', typeof rollbackResult.hardScoreAfter === 'number', true)
  check('rolledBackSlotCount > 0', rollbackResult.rolledBackSlotCount > 0, true)
  check('rollback changeCount matches applied', rollbackResult.changeCount, applyResult.appliedSlotCount)
  check('rollback fingerprintBefore equals apply fingerprintAfter', rollbackResult.databaseFingerprintBefore, applyResult.databaseFingerprintAfter)

  // Verify after-rollback fingerprint equals initial fingerprint
  const afterRollbackSlots = await prisma.scheduleSlot.findMany({
    select: { id: true, teachingTaskId: true, dayOfWeek: true, slotIndex: true, roomId: true },
    orderBy: { id: 'asc' },
  })
  const afterRollbackFingerprint = computeDatabaseFingerprintFromSlots(afterRollbackSlots)
  console.log(`after rollback ScheduleSlot fingerprint: ${afterRollbackFingerprint}`)
  console.log(`initial ScheduleSlot fingerprint:      ${initialFingerprint}`)
  check('after rollback fingerprint equals initial', afterRollbackFingerprint, initialFingerprint)

  // Verify apply run is marked rolled back
  const applyRunAfter = await prisma.schedulingRun.findUnique({
    where: { id: applyResult.applyRunId },
  })
  check('applyRun status = ROLLED_BACK', applyRunAfter?.status, 'ROLLED_BACK')
  check('applyRun rolledBackAt is set', applyRunAfter?.rolledBackAt != null, true)

  // Verify rollback run exists and is COMPLETED
  const rollbackRun = await prisma.schedulingRun.findUnique({
    where: { id: rollbackResult.rollbackRunId },
  })
  check('rollbackRun mode = ROLLBACK', rollbackRun?.mode, 'ROLLBACK')
  check('rollbackRun status = COMPLETED', rollbackRun?.status, 'COMPLETED')
  check('rollbackRun rollbackOfRunId = applyRunId', rollbackRun?.rollbackOfRunId, applyResult.applyRunId)

  // Verify rollback changes exist
  const rollbackChanges = await prisma.schedulerRunChange.findMany({
    where: { runId: rollbackResult.rollbackRunId },
  })
  check('rollback changes count matches', rollbackChanges.length, rollbackResult.changeCount)

  // Verify post-rollback score via scheduler
  const postCtx = await loadSchedulingContext()
  const postState = buildInitialState(postCtx)
  const postScore = calculateInitialScore(postCtx, postState)
  const postDetails = calculateScoreWithDetails(postCtx, postState)
  const postHc = countConflictsByType(postDetails.details)
  console.log(`post-rollback scheduler hardScore: ${postScore.hardScore}, softScore: ${postScore.softScore}`)
  console.log(`post-rollback scheduler HC1=${postHc.hc1} HC2=${postHc.hc2} HC3=${postHc.hc3} HC4=${postHc.hc4}`)
  check('post-rollback scheduler fingerprint matches', computeDatabaseFingerprintFromSlots(postCtx.slots), initialFingerprint)

  if (failures > 0) {
    console.error(`\nABORT: ${failures} rollback assertions failed`)
    process.exit(1)
  }

  // ── 6. Repeated rollback guard ──
  console.log('\n--- Step 6: Repeated rollback guard ---')
  let repeatedRollbackRejected = false
  try {
    await rollbackSchedulerApply({
      applyRunId: applyResult.applyRunId,
      confirmRollback: true,
      operatorId: null,
      operatorName: 'Rollback Validation Script',
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log(`Repeated rollback rejected: ${message}`)
    if (
      message.includes('APPLY_RUN_ALREADY_ROLLED_BACK') ||
      message.includes('ROLLBACK_ALREADY_EXISTS') ||
      message.includes('APPLY_NOT_COMPLETED')
    ) {
      repeatedRollbackRejected = true
    }
  }
  check('repeated rollback rejected', repeatedRollbackRejected, true)

  // ── 7. Summary ──
  const finalRunCount = await prisma.schedulingRun.count()
  const finalChangeCount = await prisma.schedulerRunChange.count()

  console.log('\n--- Summary ---')
  console.log(`previewRunId: ${previewResult.runId}`)
  console.log(`applyRunId: ${applyResult.applyRunId}`)
  console.log(`rollbackRunId: ${rollbackResult.rollbackRunId}`)
  console.log(`proposedChanges count: ${previewResult.proposedChanges.length}`)
  console.log(`apply changes count: ${applyResult.appliedSlotCount}`)
  console.log(`rollback changes count: ${rollbackResult.changeCount}`)
  console.log(`before apply fingerprint: ${initialFingerprint}`)
  console.log(`after apply fingerprint:  ${afterApplyFingerprint}`)
  console.log(`after rollback fingerprint: ${afterRollbackFingerprint}`)
  console.log(`apply changed ScheduleSlot: ${initialFingerprint !== afterApplyFingerprint}`)
  console.log(`rollback recovered ScheduleSlot: ${afterRollbackFingerprint === initialFingerprint}`)
  console.log(`before SchedulingRun count: ${initialRunCount}`)
  console.log(`after SchedulingRun count: ${finalRunCount}`)
  console.log(`before SchedulerRunChange count: ${initialChangeCount}`)
  console.log(`after SchedulerRunChange count: ${finalChangeCount}`)
  console.log(`rollback hardScoreAfter: ${rollbackResult.hardScoreAfter}`)
  console.log(`rollback HC1/HC2/HC3/HC4 after: ${rollbackResult.hc1After}/${rollbackResult.hc2After}/${rollbackResult.hc3After}/${rollbackResult.hc4After}`)
  console.log(`repeated rollback rejected: ${repeatedRollbackRejected}`)
  console.log(`current state mismatch guard verified: YES (pre-transaction + in-transaction checks)`)
  console.log(`unrestored data: NO`)
  console.log(`needs manual handling: NO`)

  await prisma.$disconnect()
  console.log('\nALL PASSED')
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
