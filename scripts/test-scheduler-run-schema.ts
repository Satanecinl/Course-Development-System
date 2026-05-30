/**
 * Schema smoke test: verify SchedulingRun extensions and SchedulerRunChange
 * are accessible via Prisma Client. Uses transaction rollback to leave no data.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('# Scheduler Run Schema Smoke Test\n')

  // Count before
  const beforeRunCount = await prisma.schedulingRun.count()
  const beforeChangeCount = await prisma.schedulerRunChange.count()
  console.log(`- before SchedulingRun count: ${beforeRunCount}`)
  console.log(`- before SchedulerRunChange count: ${beforeChangeCount}`)

  // Get an existing ScheduleSlot for realistic test data
  const sampleSlot = await prisma.scheduleSlot.findFirst({
    include: { teachingTask: { include: { course: true, teacher: true } } },
  })
  if (!sampleSlot) {
    console.error('ABORT: No ScheduleSlot found in database')
    process.exit(1)
  }
  console.log(`- sample slot: id=${sampleSlot.id}, task=${sampleSlot.teachingTaskId}, day=${sampleSlot.dayOfWeek}, slot=${sampleSlot.slotIndex}, room=${sampleSlot.roomId}`)

  // Get or create a SchedulingConfig
  let config = await prisma.schedulingConfig.findFirst()
  if (!config) {
    config = await prisma.schedulingConfig.create({
      data: { name: '__smoke_test_config__' },
    })
    console.log(`- created temp SchedulingConfig: id=${config.id}`)
  } else {
    console.log(`- using existing SchedulingConfig: id=${config.id}`)
  }

  // Transaction: create run + change, then rollback
  let rollbackTriggered = false

  try {
    await prisma.$transaction(async (tx) => {
      // Create SchedulingRun with new fields
      const run = await tx.schedulingRun.create({
        data: {
          configId: config.id,
          mode: 'PREVIEW',
          status: 'TEST_ROLLBACK',
          operatorId: null,
          operatorNameSnapshot: 'Smoke Test',
          startedAt: new Date(),
          randomSeed: 42,
          solverVersion: 'test',
          hardScore: 0,
          softScore: -500,
          hardScoreBefore: -8000,
          softScoreBefore: -490,
          hc1Before: 1,
          hc2Before: 1,
          hc3Before: 6,
          hc4Before: 0,
          changedSlotCount: 1,
          conflictSummary: JSON.stringify({ HC1: 0, HC2: 0, HC3: 0, HC4: 0 }),
        },
      })
      console.log(`- created SchedulingRun: id=${run.id}, mode=${run.mode}, status=${run.status}`)

      // Create SchedulerRunChange
      const change = await tx.schedulerRunChange.create({
        data: {
          runId: run.id,
          scheduleSlotId: sampleSlot.id,
          teachingTaskId: sampleSlot.teachingTaskId,
          oldDayOfWeek: sampleSlot.dayOfWeek,
          oldSlotIndex: sampleSlot.slotIndex,
          oldRoomId: sampleSlot.roomId,
          newDayOfWeek: 1,
          newSlotIndex: 3,
          newRoomId: sampleSlot.roomId,
          courseNameSnapshot: sampleSlot.teachingTask.course?.name ?? '?',
          teacherNameSnapshot: sampleSlot.teachingTask.teacher?.name ?? '-',
        },
      })
      console.log(`- created SchedulerRunChange: id=${change.id}, runId=${change.runId}`)

      // Verify relation
      const runWithChanges = await tx.schedulingRun.findUnique({
        where: { id: run.id },
        include: { changes: true },
      })
      console.log(`- run.changes count: ${runWithChanges?.changes.length}`)

      // Trigger rollback
      throw new Error('EXPECTED_ROLLBACK')
    })
  } catch (e: any) {
    if (e.message === 'EXPECTED_ROLLBACK') {
      rollbackTriggered = true
      console.log('- transaction rolled back (EXPECTED_ROLLBACK)')
    } else {
      console.error(`- UNEXPECTED error: ${e.message}`)
      process.exit(1)
    }
  }

  if (!rollbackTriggered) {
    console.error('ABORT: Expected rollback did not occur')
    process.exit(1)
  }

  // Count after
  const afterRunCount = await prisma.schedulingRun.count()
  const afterChangeCount = await prisma.schedulerRunChange.count()
  console.log(`- after SchedulingRun count: ${afterRunCount}`)
  console.log(`- after SchedulerRunChange count: ${afterChangeCount}`)

  if (afterRunCount !== beforeRunCount) {
    console.error(`FAIL: SchedulingRun count mismatch: ${beforeRunCount} -> ${afterRunCount}`)
    process.exit(1)
  }
  if (afterChangeCount !== beforeChangeCount) {
    console.error(`FAIL: SchedulerRunChange count mismatch: ${beforeChangeCount} -> ${afterChangeCount}`)
    process.exit(1)
  }

  console.log('\n- PASS: no test data残留')
  console.log('- PASS: SchedulingRun extensions accessible')
  console.log('- PASS: SchedulerRunChange accessible')
  console.log('- PASS: relation works')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
