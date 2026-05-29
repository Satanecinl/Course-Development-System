import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const batch = await prisma.importBatch.findFirst({
    where: { status: 'confirmed' },
    orderBy: { confirmedAt: 'desc' },
  })

  if (!batch) {
    console.log('没有找到 confirmed 状态的 ImportBatch。（可能已 rollback）')
    console.log('SKIPPED — no confirmed batch to audit')
    process.exit(0)
  }

  console.log('=== ImportBatch ===')
  console.log(`  id:               ${batch.id}`)
  console.log(`  status:           ${batch.status}`)
  console.log(`  filename:         ${batch.filename}`)
  console.log(`  strategy:         ${batch.strategy}`)
  console.log(`  recordCount:      ${batch.recordCount}`)
  console.log(`  createdTaskCount: ${batch.createdTaskCount}`)
  console.log(`  createdSlotCount: ${batch.createdSlotCount}`)
  console.log(`  confirmedAt:      ${batch.confirmedAt}`)
  console.log()

  // 实际关联数量
  const actualTaskCount = await prisma.teachingTask.count({ where: { importBatchId: batch.id } })
  const actualSlotCount = await prisma.scheduleSlot.count({ where: { importBatchId: batch.id } })
  const actualTTCCount = await prisma.teachingTaskClass.count({
    where: { teachingTask: { importBatchId: batch.id } },
  })

  console.log('=== Actual DB Counts ===')
  console.log(`  actualCreatedTaskCount:      ${actualTaskCount}`)
  console.log(`  actualCreatedSlotCount:      ${actualSlotCount}`)
  console.log(`  actualTeachingTaskClassCount: ${actualTTCCount}`)
  console.log()

  // 校验 mismatch
  const taskMismatch = batch.createdTaskCount !== actualTaskCount
  const slotMismatch = batch.createdSlotCount !== actualSlotCount

  console.log('=== Metadata Validation ===')
  console.log(`  createdTaskCount match: ${taskMismatch ? 'MISMATCH' : 'OK'} (batch=${batch.createdTaskCount}, actual=${actualTaskCount})`)
  console.log(`  createdSlotCount match: ${slotMismatch ? 'MISMATCH' : 'OK'} (batch=${batch.createdSlotCount}, actual=${actualSlotCount})`)
  console.log()

  // 孤立 ScheduleSlot 检查
  const orphanSlots = await prisma.scheduleSlot.count({
    where: {
      importBatchId: batch.id,
      teachingTask: { importBatchId: { not: batch.id } },
    },
  })
  console.log(`  orphan ScheduleSlots (teachingTask not in batch): ${orphanSlots}`)
  console.log()

  // null 统计
  const nullTeacherTasks = await prisma.teachingTask.count({
    where: { importBatchId: batch.id, teacherId: null },
  })
  const nullRoomSlots = await prisma.scheduleSlot.count({
    where: { importBatchId: batch.id, roomId: null },
  })
  console.log('=== Null Statistics ===')
  console.log(`  importedNullTeacherTaskCount: ${nullTeacherTasks}`)
  console.log(`  importedNullRoomSlotCount:    ${nullRoomSlots}`)
  console.log()

  // 待定实体检查
  const pendingTeachers = await prisma.teacher.count({ where: { name: { contains: '待定' } } })
  const pendingRooms = await prisma.room.count({ where: { name: { contains: '待定' } } })
  console.log('=== Fake Entity Check ===')
  console.log(`  待定教师: ${pendingTeachers} (expected: 0)`)
  console.log(`  待定教室: ${pendingRooms} (expected: 0)`)
  console.log()

  // warningsJson
  if (batch.warningsJson) {
    const warnings = JSON.parse(batch.warningsJson)
    console.log(`=== Warnings (${warnings.length}) ===`)
    for (const w of warnings.slice(0, 5)) console.log(`  - ${w}`)
    if (warnings.length > 5) console.log(`  ... and ${warnings.length - 5} more`)
    console.log()
  }

  const hasMismatch = taskMismatch || slotMismatch || orphanSlots > 0 || pendingTeachers > 0 || pendingRooms > 0
  console.log(hasMismatch ? 'AUDIT: ISSUES FOUND' : 'AUDIT: ALL CHECKS PASSED')
  process.exit(hasMismatch ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
