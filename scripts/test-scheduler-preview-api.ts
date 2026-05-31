/**
 * Preview API service validation script.
 *
 * Tests the createSchedulerPreview service directly (no HTTP server).
 * Verifies:
 * - ScheduleSlot fingerprint unchanged (no real data modified)
 * - SchedulerRunChange count unchanged (no change records created)
 * - SchedulingRun count increased by 1 (preview audit record created)
 * - Solver achieves hardScore=0
 * - Status = COMPLETED
 */
import { PrismaClient } from '@prisma/client'
import { computeDatabaseFingerprintFromSlots, createSchedulerPreview } from '../src/lib/scheduler/preview'

const prisma = new PrismaClient()

async function main() {
  console.log('# Scheduler Preview API Validation\n')

  // 1. Before state
  const beforeSlots = await prisma.scheduleSlot.findMany({
    select: { id: true, teachingTaskId: true, dayOfWeek: true, slotIndex: true, roomId: true },
    orderBy: { id: 'asc' },
  })
  const beforeFingerprint = computeDatabaseFingerprintFromSlots(beforeSlots)
  console.log(`- before ScheduleSlot count: ${beforeSlots.length}`)
  console.log(`- before ScheduleSlot fingerprint: ${beforeFingerprint}`)

  const beforeRunCount = await prisma.schedulingRun.count()
  const beforeChangeCount = await prisma.schedulerRunChange.count()
  const beforeConfigCount = await prisma.schedulingConfig.count()
  console.log(`- before SchedulingRun count: ${beforeRunCount}`)
  console.log(`- before SchedulerRunChange count: ${beforeChangeCount}`)
  console.log(`- before SchedulingConfig count: ${beforeConfigCount}`)

  // 2. Run preview service
  console.log('\n--- Running preview service ---')
  const result = await createSchedulerPreview({
    maxIterations: 10000,
    lahcWindowSize: 500,
    operatorId: null,
    operatorName: 'Preview Validation Script',
  })

  console.log(`\n- runId: ${result.runId}`)
  console.log(`- mode: ${result.mode}`)
  console.log(`- status: ${result.status}`)
  console.log(`- blocked: ${result.blocked}`)
  console.log(`- blockReasons: ${JSON.stringify(result.blockReasons)}`)
  console.log(`- scoreBefore: hard=${result.scoreBefore.hardScore}, soft=${result.scoreBefore.softScore}`)
  console.log(`- scoreAfter: hard=${result.scoreAfter.hardScore}, soft=${result.scoreAfter.softScore}`)
  console.log(`- hcBefore: HC1=${result.hcBefore.hc1}, HC2=${result.hcBefore.hc2}, HC3=${result.hcBefore.hc3}, HC4=${result.hcBefore.hc4}`)
  console.log(`- hcAfter: HC1=${result.hcAfter.hc1}, HC2=${result.hcAfter.hc2}, HC3=${result.hcAfter.hc3}, HC4=${result.hcAfter.hc4}`)
  console.log(`- changedSlotCount: ${result.changedSlotCount}`)
  console.log(`- proposedChanges count: ${result.proposedChanges.length}`)
  console.log(`- previewExpiresAt: ${result.previewExpiresAt}`)
  console.log(`- databaseFingerprint: ${result.databaseFingerprint}`)
  console.log(`- iterations: ${result.iterations}`)
  console.log(`- durationMs: ${result.durationMs}`)

  // 3. Verify SchedulingRun record
  const run = await prisma.schedulingRun.findUnique({ where: { id: result.runId } })
  if (!run) {
    console.error('\nFAIL: SchedulingRun not found')
    process.exit(1)
  }
  console.log(`\n- SchedulingRun.mode: ${run.mode}`)
  console.log(`- SchedulingRun.status: ${run.status}`)

  // 4. After state
  const afterSlots = await prisma.scheduleSlot.findMany({
    select: { id: true, teachingTaskId: true, dayOfWeek: true, slotIndex: true, roomId: true },
    orderBy: { id: 'asc' },
  })
  const afterFingerprint = computeDatabaseFingerprintFromSlots(afterSlots)
  console.log(`\n- after ScheduleSlot fingerprint: ${afterFingerprint}`)

  const afterRunCount = await prisma.schedulingRun.count()
  const afterChangeCount = await prisma.schedulerRunChange.count()
  const afterConfigCount = await prisma.schedulingConfig.count()
  console.log(`- after SchedulingRun count: ${afterRunCount}`)
  console.log(`- after SchedulerRunChange count: ${afterChangeCount}`)
  console.log(`- after SchedulingConfig count: ${afterConfigCount}`)

  // 5. Assertions
  let failures = 0

  function check(name: string, actual: unknown, expected: unknown) {
    const pass = actual === expected
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name} (actual=${actual}, expected=${expected})`)
    if (!pass) failures++
  }

  console.log('\n--- Assertions ---')
  check('ScheduleSlot fingerprint unchanged', afterFingerprint, beforeFingerprint)
  check('SchedulerRunChange count unchanged', afterChangeCount, beforeChangeCount)
  check('SchedulingConfig count unchanged', afterConfigCount, beforeConfigCount)
  check('SchedulingRun count increased by 1', afterRunCount, beforeRunCount + 1)
  check('mode = PREVIEW', run.mode, 'PREVIEW')
  check('status = COMPLETED', run.status, 'COMPLETED')
  check('hardScoreAfter = 0', run.hardScoreAfter, 0)
  check('hc1After = 0', run.hc1After, 0)
  check('hc2After = 0', run.hc2After, 0)
  check('hc3After = 0', run.hc3After, 0)
  check('hc4After = 0', run.hc4After, 0)
  check('blocked = false', result.blocked, false)
  check('changedSlotCount matches proposedChanges', result.changedSlotCount, result.proposedChanges.length)
  check('resultSnapshot present', run.resultSnapshot !== null, true)
  check('conflictSummary present', run.conflictSummary !== null, true)
  check('databaseFingerprint present', run.databaseFingerprint !== null, true)

  if (result.previewExpiresAt !== null) {
    const expiresAt = new Date(result.previewExpiresAt)
    const now = new Date()
    check('previewExpiresAt is in the future', expiresAt > now, true)
  }

  console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`)

  await prisma.$disconnect()
  if (failures > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
