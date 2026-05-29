import { PrismaClient } from '@prisma/client'
import { rollbackImportBatch } from '../src/lib/import/rollback'

const prisma = new PrismaClient()

async function main() {
  if (process.env.ROLLBACK_IMPORT !== '1') {
    console.log('⚠️  This script mutates the database.')
    console.log('Run with ROLLBACK_IMPORT=1 to execute:')
    console.log()
    console.log('  ROLLBACK_IMPORT=1 npx tsx scripts/rollback-import-once.ts')
    console.log()
    process.exit(0)
  }

  const batch = await prisma.importBatch.findFirst({
    where: { status: 'confirmed' },
    orderBy: { confirmedAt: 'desc' },
  })

  if (!batch) {
    console.log('No confirmed ImportBatch found.')
    console.log('Nothing to rollback.')
    process.exit(0)
  }

  console.log(`Found confirmed ImportBatch: id=${batch.id}\n`)

  // Record counts before
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
  for (const [k, v] of Object.entries(before)) console.log(`  ${k}: ${v}`)
  console.log()

  try {
    const result = await rollbackImportBatch(batch.id)

    console.log('--- Rollback Result ---')
    console.log(`  rolledBack:                 ${result.rolledBack}`)
    console.log(`  deletedScheduleSlots:       ${result.deletedScheduleSlots}`)
    console.log(`  deletedTeachingTaskClasses: ${result.deletedTeachingTaskClasses}`)
    console.log(`  deletedTeachingTasks:       ${result.deletedTeachingTasks}`)
    console.log(`  retainedClassGroups:        ${result.retainedClassGroups}`)
    console.log(`  retainedTeachers:           ${result.retainedTeachers}`)
    console.log(`  retainedCourses:            ${result.retainedCourses}`)
    console.log(`  retainedRooms:              ${result.retainedRooms}`)
    if (result.warnings.length > 0) {
      console.log('  warnings:')
      for (const w of result.warnings) console.log(`    - ${w}`)
    }
    console.log()

    // Record counts after
    const after = {
      classGroup: await prisma.classGroup.count(),
      teacher: await prisma.teacher.count(),
      course: await prisma.course.count(),
      room: await prisma.room.count(),
      teachingTask: await prisma.teachingTask.count(),
      teachingTaskClass: await prisma.teachingTaskClass.count(),
      scheduleSlot: await prisma.scheduleSlot.count(),
    }

    console.log('--- After ---')
    for (const [k, v] of Object.entries(after)) console.log(`  ${k}: ${v}`)
    console.log()

    console.log('--- Diff ---')
    for (const k of ['classGroup', 'teacher', 'course', 'room', 'teachingTask', 'teachingTaskClass', 'scheduleSlot'] as const) {
      const diff = after[k] - before[k]
      if (diff !== 0) console.log(`  ${k}: ${diff}`)
    }

    const afterBatch = await prisma.importBatch.findUnique({ where: { id: batch.id } })
    console.log(`\nBatch status: ${afterBatch?.status}`)
    console.log('\nDONE')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`\nRollback failed: ${msg}`)
    const afterBatch = await prisma.importBatch.findUnique({ where: { id: batch.id } })
    console.log(`Batch status: ${afterBatch?.status}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
