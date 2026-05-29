import { PrismaClient } from '@prisma/client'
import { simulateRollbackImportBatch } from '../src/lib/import/rollback'

const prisma = new PrismaClient()

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

async function main() {
  console.log('=== Test Rollback Transaction Rollback ===\n')

  // Find the most recent confirmed ImportBatch
  const batch = await prisma.importBatch.findFirst({
    where: { status: 'confirmed' },
    orderBy: { confirmedAt: 'desc' },
  })

  if (!batch) {
    console.log('No confirmed ImportBatch found.')
    console.log('Please run a confirmed import first, then run this test.')
    console.log('SKIPPED (not a code failure)')
    process.exit(0)
  }

  console.log(`1. Confirmed batch: #${batch.id} (${batch.status})\n`)

  // Record counts before simulation
  const before = {
    classGroup: await prisma.classGroup.count(),
    teacher: await prisma.teacher.count(),
    course: await prisma.course.count(),
    room: await prisma.room.count(),
    teachingTask: await prisma.teachingTask.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
    batchStatus: (await prisma.importBatch.findUnique({ where: { id: batch.id } }))!.status,
  }

  console.log('--- Before ---')
  console.log(`  ClassGroup:        ${before.classGroup}`)
  console.log(`  Teacher:           ${before.teacher}`)
  console.log(`  Course:            ${before.course}`)
  console.log(`  Room:              ${before.room}`)
  console.log(`  TeachingTask:      ${before.teachingTask}`)
  console.log(`  TeachingTaskClass: ${before.teachingTaskClass}`)
  console.log(`  ScheduleSlot:      ${before.scheduleSlot}`)
  console.log(`  BatchStatus:       ${before.batchStatus}`)
  console.log()

  // Execute rollback simulation
  const result = await simulateRollbackImportBatch(batch.id)

  console.log('--- Simulation Result ---')
  console.log(`  batchId:                     ${result.batchId}`)
  console.log(`  simulated:                   ${result.simulated}`)
  console.log(`  canRollback:                 ${result.canRollback}`)
  console.log(`  deletedScheduleSlots:        ${result.deletedScheduleSlots}`)
  console.log(`  deletedTeachingTaskClasses:  ${result.deletedTeachingTaskClasses}`)
  console.log(`  deletedTeachingTasks:        ${result.deletedTeachingTasks}`)
  console.log(`  retainedClassGroups:         ${result.retainedClassGroups}`)
  console.log(`  retainedTeachers:            ${result.retainedTeachers}`)
  console.log(`  retainedCourses:             ${result.retainedCourses}`)
  console.log(`  retainedRooms:               ${result.retainedRooms}`)
  console.log()

  if (result.blockingReasons.length > 0) {
    console.log('  blockingReasons:')
    for (const r of result.blockingReasons) console.log(`    - ${r}`)
  }
  if (result.warnings.length > 0) {
    console.log('  warnings (first 10):')
    for (const w of result.warnings.slice(0, 10)) console.log(`    - ${w}`)
  }
  console.log()

  // Record counts after simulation
  const after = {
    classGroup: await prisma.classGroup.count(),
    teacher: await prisma.teacher.count(),
    course: await prisma.course.count(),
    room: await prisma.room.count(),
    teachingTask: await prisma.teachingTask.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
    batchStatus: (await prisma.importBatch.findUnique({ where: { id: batch.id } }))!.status,
  }

  console.log('--- After ---')
  console.log(`  ClassGroup:        ${after.classGroup}`)
  console.log(`  Teacher:           ${after.teacher}`)
  console.log(`  Course:            ${after.course}`)
  console.log(`  Room:              ${after.room}`)
  console.log(`  TeachingTask:      ${after.teachingTask}`)
  console.log(`  TeachingTaskClass: ${after.teachingTaskClass}`)
  console.log(`  ScheduleSlot:      ${after.scheduleSlot}`)
  console.log(`  BatchStatus:       ${after.batchStatus}`)
  console.log()

  // Invariant checks
  console.log('--- Invariant Checks ---')
  let failed = false

  function check(name: string, ok: boolean, detail: string) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}${ok ? '' : ` — ${detail}`}`)
    if (!ok) failed = true
  }

  check('ClassGroup count unchanged', before.classGroup === after.classGroup, `${before.classGroup} → ${after.classGroup}`)
  check('Teacher count unchanged', before.teacher === after.teacher, `${before.teacher} → ${after.teacher}`)
  check('Course count unchanged', before.course === after.course, `${before.course} → ${after.course}`)
  check('Room count unchanged', before.room === after.room, `${before.room} → ${after.room}`)
  check('TeachingTask count unchanged', before.teachingTask === after.teachingTask, `${before.teachingTask} → ${after.teachingTask}`)
  check('TeachingTaskClass count unchanged', before.teachingTaskClass === after.teachingTaskClass, `${before.teachingTaskClass} → ${after.teachingTaskClass}`)
  check('ScheduleSlot count unchanged', before.scheduleSlot === after.scheduleSlot, `${before.scheduleSlot} → ${after.scheduleSlot}`)
  check('BatchStatus still confirmed', after.batchStatus === 'confirmed', `status=${after.batchStatus}`)
  check('simulated === true', result.simulated === true, `simulated=${result.simulated}`)
  check('canRollback === true', result.canRollback === true, `canRollback=${result.canRollback}`)
  check('deletedScheduleSlots === 189', result.deletedScheduleSlots === 189, `deleted=${result.deletedScheduleSlots}`)
  check('deletedTeachingTaskClasses === 178', result.deletedTeachingTaskClasses === 178, `deleted=${result.deletedTeachingTaskClasses}`)
  check('deletedTeachingTasks === 56', result.deletedTeachingTasks === 56, `deleted=${result.deletedTeachingTasks}`)

  console.log()

  if (failed) {
    console.log('FAIL — database was modified or invariants violated')
    process.exit(1)
  }

  console.log('PASS — transaction rolled back cleanly, all counts unchanged')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('\n=== TEST FAILED ===')
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
