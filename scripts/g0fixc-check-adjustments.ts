/**
 * G0-FIX-C: 检查 ScheduleAdjustment 和 ImportBatch 状态
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('              G0-FIX-C: 调课记录与导入批次检查')
  console.log('═══════════════════════════════════════════════════════════════')

  // ImportBatch 状态
  const batches = await prisma.importBatch.findMany({ orderBy: { id: 'asc' } })
  console.log('\n--- ImportBatch 状态 ---')
  for (const b of batches) {
    console.log(`  Batch #${b.id}: status=${b.status}, tasks=${b.createdTaskCount ?? '-'}, slots=${b.createdSlotCount ?? '-'}, filename=${b.filename}`)
  }

  // ScheduleAdjustment 状态
  const activeAdjustments = await prisma.scheduleAdjustment.findMany({
    where: { status: 'ACTIVE' },
    include: {
      originalSlot: {
        include: {
          teachingTask: { include: { course: true } },
        },
      },
    },
  })

  console.log(`\n--- ScheduleAdjustment 状态 ---`)
  console.log(`  ACTIVE 数量: ${activeAdjustments.length}`)

  if (activeAdjustments.length > 0) {
    for (const a of activeAdjustments) {
      console.log(`    #${a.id}: ${a.originalSlot?.teachingTask?.course?.name ?? '?'} | type=${a.type} | week=${a.week} | status=${a.status}`)
    }
  } else {
    console.log('    ✅ 无 ACTIVE 调课记录残留')
  }

  // 检查是否还有旧 Batch 残留
  const oldBatches = batches.filter((b) => b.id !== 1)
  if (oldBatches.length === 0) {
    console.log('\n  ✅ 无旧 ImportBatch 残留（只有 Batch#1）')
  } else {
    console.log(`\n  ⚠️ 发现 ${oldBatches.length} 个旧 ImportBatch: [${oldBatches.map((b) => b.id).join(', ')}]`)
  }

  // 检查 seed 数据（importBatchId=null）
  const seedTasks = await prisma.teachingTask.count({ where: { importBatchId: null } })
  const seedSlots = await prisma.scheduleSlot.count({ where: { importBatchId: null } })
  console.log(`\n--- Seed 数据检查 ---`)
  console.log(`  importBatchId=null 的 TeachingTask: ${seedTasks}`)
  console.log(`  importBatchId=null 的 ScheduleSlot: ${seedSlots}`)
  if (seedTasks === 0 && seedSlots === 0) {
    console.log('  ✅ 无旧 seed 数据残留')
  } else {
    console.log('  ⚠️ 存在 importBatchId=null 的数据（如通过 seed_db.ts 导入则正常）')
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
