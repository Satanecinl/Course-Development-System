import { PrismaClient } from '@prisma/client'
import { simulateConfirmImportBatch } from '../src/lib/import/importer'

const prisma = new PrismaClient()

async function main() {
  // 查找最近一条 pending ImportBatch
  const batch = await prisma.importBatch.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
  })

  if (!batch) {
    console.log('没有找到 pending 状态的 ImportBatch。')
    console.log('请先通过 /admin/db 上传 .docx 文件生成 pending batch，再运行此测试。')
    process.exit(0)
  }

  console.log(`找到 pending ImportBatch: id=${batch.id}\n`)

  const activeSemester = await prisma.semester.findFirst({ where: { isActive: true } })
  if (!activeSemester) {
    console.error('No active semester found')
    process.exit(1)
  }

  // 记录导入前数据库数量
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
  console.log(`  ClassGroup:       ${before.classGroup}`)
  console.log(`  Teacher:          ${before.teacher}`)
  console.log(`  Course:           ${before.course}`)
  console.log(`  Room:             ${before.room}`)
  console.log(`  TeachingTask:     ${before.teachingTask}`)
  console.log(`  TeachingTaskClass: ${before.teachingTaskClass}`)
  console.log(`  ScheduleSlot:     ${before.scheduleSlot}`)
  console.log(`  BatchStatus:      ${before.batchStatus}`)
  console.log()

  // 执行事务回滚演练
  const result = await simulateConfirmImportBatch(batch.id, 'UPSERT_BY_NATURAL_KEY', activeSemester.id)

  console.log('--- Execution Result ---')
  console.log(`  simulated:              ${result.simulated}`)
  console.log(`  canImport:              ${result.canImport}`)
  console.log(`  classGroups.created:    ${result.classGroups.created}`)
  console.log(`  classGroups.updated:    ${result.classGroups.updatedStudentCount}`)
  console.log(`  classGroups.conflicts:  ${result.classGroups.conflictCount}`)
  console.log(`  teachers.created:       ${result.teachers.created}`)
  console.log(`  teachers.missing:       ${result.teachers.missing}`)
  console.log(`  courses.created:        ${result.courses.created}`)
  console.log(`  rooms.created:          ${result.rooms.created}`)
  console.log(`  rooms.missing:          ${result.rooms.missing}`)
  console.log(`  teachingTasks.created:  ${result.teachingTasks.created}`)
  console.log(`  teachingTasks.reused:   ${result.teachingTasks.reused}`)
  console.log(`  ttc.created:            ${result.teachingTaskClasses.created}`)
  console.log(`  scheduleSlots.created:  ${result.scheduleSlots.created}`)
  console.log(`  scheduleSlots.reused:   ${result.scheduleSlots.reused}`)
  console.log(`  scheduleSlots.missing:  ${result.scheduleSlots.missingRoom}`)
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

  // 记录导入后数据库数量
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
  console.log(`  ClassGroup:       ${after.classGroup}`)
  console.log(`  Teacher:          ${after.teacher}`)
  console.log(`  Course:           ${after.course}`)
  console.log(`  Room:             ${after.room}`)
  console.log(`  TeachingTask:     ${after.teachingTask}`)
  console.log(`  TeachingTaskClass: ${after.teachingTaskClass}`)
  console.log(`  ScheduleSlot:     ${after.scheduleSlot}`)
  console.log(`  BatchStatus:      ${after.batchStatus}`)
  console.log()

  // Invariant 检查
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
  check('BatchStatus still pending', after.batchStatus === 'pending', `status=${after.batchStatus}`)
  check('simulated === true', result.simulated === true, `simulated=${result.simulated}`)
  check('canImport === true', result.canImport === true, `canImport=${result.canImport}`)

  // 执行结果应有实际写入数据
  check('teachingTasks.created > 0', result.teachingTasks.created > 0, `created=${result.teachingTasks.created}`)
  check('scheduleSlots.created > 0', result.scheduleSlots.created > 0, `created=${result.scheduleSlots.created}`)

  console.log()

  if (failed) {
    console.log('FAIL — database was modified or invariants violated')
    process.exit(1)
  }

  console.log('PASS — transaction rolled back cleanly, all counts unchanged')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
