import { PrismaClient } from '@prisma/client'
import { buildRollbackPlan } from '../src/lib/import/rollback'

const prisma = new PrismaClient()

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

async function main() {
  console.log('=== Test Rollback Dry-Run ===\n')

  // Snapshot database state before dry-run
  const [classGroupCountBefore, teacherCountBefore, courseCountBefore, roomCountBefore] =
    await Promise.all([
      prisma.classGroup.count(),
      prisma.teacher.count(),
      prisma.course.count(),
      prisma.room.count(),
    ])
  const [teachingTaskCountBefore, teachingTaskClassCountBefore, scheduleSlotCountBefore] =
    await Promise.all([
      prisma.teachingTask.count(),
      prisma.teachingTaskClass.count(),
      prisma.scheduleSlot.count(),
    ])

  // Find confirmed batch (may not exist after rollback)
  const confirmedBatch = await prisma.importBatch.findFirst({
    where: { status: 'confirmed' },
    orderBy: { confirmedAt: 'desc' },
  })

  // Find rolled_back batch
  const rolledBackBatch = await prisma.importBatch.findFirst({
    where: { status: 'rolled_back' },
    orderBy: { rolledBackAt: 'desc' },
  })

  if (confirmedBatch) {
    console.log(`1. Confirmed batch: #${confirmedBatch.id} (${confirmedBatch.status})`)

    // Run dry-run on confirmed batch
    const confirmedPlan = await buildRollbackPlan(confirmedBatch.id)

    // Validate confirmed batch plan — 使用动态值，不依赖旧数据库快照
    assert(confirmedPlan.canRollback === true, `confirmed batch canRollback should be true, got ${confirmedPlan.canRollback}`)
    console.log('   canRollback: true (OK)')

    // 数量应与 batch 的 createdTaskCount/createdSlotCount 一致（或 ≥ 实际创建数）
    assert(confirmedPlan.scheduleSlotsToDelete > 0, `scheduleSlotsToDelete should be > 0, got ${confirmedPlan.scheduleSlotsToDelete}`)
    console.log(`   scheduleSlotsToDelete: ${confirmedPlan.scheduleSlotsToDelete} (OK)`)

    assert(confirmedPlan.teachingTasksToDelete > 0, `teachingTasksToDelete should be > 0, got ${confirmedPlan.teachingTasksToDelete}`)
    console.log(`   teachingTasksToDelete: ${confirmedPlan.teachingTasksToDelete} (OK)`)

    assert(confirmedPlan.teachingTaskClassesToDelete > 0, `teachingTaskClassesToDelete should be > 0, got ${confirmedPlan.teachingTaskClassesToDelete}`)
    console.log(`   teachingTaskClassesToDelete: ${confirmedPlan.teachingTaskClassesToDelete} (OK)`)

    assert(confirmedPlan.retainedClassGroups > 0, `retainedClassGroups should be > 0, got ${confirmedPlan.retainedClassGroups}`)
    console.log(`   retainedClassGroups: ${confirmedPlan.retainedClassGroups} (OK)`)

    assert(confirmedPlan.retainedTeachers > 0, `retainedTeachers should be > 0, got ${confirmedPlan.retainedTeachers}`)
    console.log(`   retainedTeachers: ${confirmedPlan.retainedTeachers} (OK)`)

    assert(confirmedPlan.retainedCourses > 0, `retainedCourses should be > 0, got ${confirmedPlan.retainedCourses}`)
    console.log(`   retainedCourses: ${confirmedPlan.retainedCourses} (OK)`)

    assert(confirmedPlan.retainedRooms > 0, `retainedRooms should be > 0, got ${confirmedPlan.retainedRooms}`)
    console.log(`   retainedRooms: ${confirmedPlan.retainedRooms} (OK)`)

    console.log(`   externalSlotsForImportedTasks: ${confirmedPlan.externalSlotsForImportedTasks}`)
    console.log(`   hasPlaceholderTeachers: ${confirmedPlan.hasPlaceholderTeachers}`)
    console.log(`   hasPlaceholderRooms: ${confirmedPlan.hasPlaceholderRooms}`)
    console.log(`   hasOrphanSlots: ${confirmedPlan.hasOrphanSlots}`)
  } else if (rolledBackBatch) {
    console.log(`1. No confirmed batch found. Rolled back batch: #${rolledBackBatch.id} (${rolledBackBatch.status})`)

    // Verify rolled_back batch cannot be rolled back
    const rolledBackPlan = await buildRollbackPlan(rolledBackBatch.id)
    assert(rolledBackPlan.canRollback === false, `rolled_back batch canRollback should be false, got ${rolledBackPlan.canRollback}`)
    console.log('   canRollback: false (OK)')
    assert(rolledBackPlan.blockingReasons.length > 0, 'rolled_back batch should have blockingReasons')
    console.log(`   blockingReasons: ${rolledBackPlan.blockingReasons.join('; ')} (OK)`)
    assert(rolledBackPlan.scheduleSlotsToDelete === 0, `rolled_back scheduleSlotsToDelete should be 0, got ${rolledBackPlan.scheduleSlotsToDelete}`)
    console.log(`   scheduleSlotsToDelete: ${rolledBackPlan.scheduleSlotsToDelete} (OK)`)
  } else {
    console.log('1. No confirmed or rolled_back batch found (OK)')
  }

  // Find pending batch
  const pendingBatch = await prisma.importBatch.findFirst({
    where: { status: 'pending' },
  })

  if (pendingBatch) {
    console.log(`\n2. Pending batch: #${pendingBatch.id} (${pendingBatch.status})`)
    const pendingPlan = await buildRollbackPlan(pendingBatch.id)

    assert(pendingPlan.canRollback === false, `pending batch canRollback should be false, got ${pendingPlan.canRollback}`)
    console.log('   canRollback: false (OK)')

    assert(pendingPlan.blockingReasons.length > 0, `pending batch blockingReasons should be non-empty`)
    console.log(`   blockingReasons: ${pendingPlan.blockingReasons.join('; ')} (OK)`)

    assert(pendingPlan.scheduleSlotsToDelete === 0, `pending scheduleSlotsToDelete should be 0, got ${pendingPlan.scheduleSlotsToDelete}`)
    console.log(`   scheduleSlotsToDelete: ${pendingPlan.scheduleSlotsToDelete} (OK)`)
  } else {
    console.log('\n2. No pending batch found (OK)')
  }

  // Verify database counts unchanged after dry-run
  console.log('\n3. Verifying database counts unchanged...')
  const [classGroupCountAfter, teacherCountAfter, courseCountAfter, roomCountAfter] =
    await Promise.all([
      prisma.classGroup.count(),
      prisma.teacher.count(),
      prisma.course.count(),
      prisma.room.count(),
    ])
  const [teachingTaskCountAfter, teachingTaskClassCountAfter, scheduleSlotCountAfter] =
    await Promise.all([
      prisma.teachingTask.count(),
      prisma.teachingTaskClass.count(),
      prisma.scheduleSlot.count(),
    ])

  assert(classGroupCountBefore === classGroupCountAfter, `ClassGroup count changed: ${classGroupCountBefore} -> ${classGroupCountAfter}`)
  assert(teacherCountBefore === teacherCountAfter, `Teacher count changed: ${teacherCountBefore} -> ${teacherCountAfter}`)
  assert(courseCountBefore === courseCountAfter, `Course count changed: ${courseCountBefore} -> ${courseCountAfter}`)
  assert(roomCountBefore === roomCountAfter, `Room count changed: ${roomCountBefore} -> ${roomCountAfter}`)
  assert(teachingTaskCountBefore === teachingTaskCountAfter, `TeachingTask count changed: ${teachingTaskCountBefore} -> ${teachingTaskCountAfter}`)
  assert(teachingTaskClassCountBefore === teachingTaskClassCountAfter, `TeachingTaskClass count changed: ${teachingTaskClassCountBefore} -> ${teachingTaskClassCountAfter}`)
  assert(scheduleSlotCountBefore === scheduleSlotCountAfter, `ScheduleSlot count changed: ${scheduleSlotCountBefore} -> ${scheduleSlotCountAfter}`)

  console.log('   ClassGroup:     unchanged (OK)')
  console.log('   Teacher:        unchanged (OK)')
  console.log('   Course:         unchanged (OK)')
  console.log('   Room:           unchanged (OK)')
  console.log('   TeachingTask:   unchanged (OK)')
  console.log('   TeachingTaskClass: unchanged (OK)')
  console.log('   ScheduleSlot:   unchanged (OK)')

  // Verify no parsedJsonPath/originalFilePath exposure
  console.log('\n4. Verifying no sensitive field exposure...')
  const primaryBatchId = confirmedBatch?.id ?? rolledBackBatch?.id
  if (primaryBatchId) {
    const planJson = JSON.stringify(await buildRollbackPlan(primaryBatchId))
    assert(!planJson.includes('parsedJsonPath'), 'Rollback plan should not expose parsedJsonPath')
    assert(!planJson.includes('originalFilePath'), 'Rollback plan should not expose originalFilePath')
    console.log('   parsedJsonPath: not exposed (OK)')
    console.log('   originalFilePath: not exposed (OK)')
  } else {
    console.log('   No batch to check (OK)')
  }

  console.log('\n=== ALL CHECKS PASSED ===')
}

main().catch((e) => {
  console.error('\n=== TEST FAILED ===')
  console.error(e)
  process.exit(1)
}).finally(() => {
  prisma.$disconnect()
})
