import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  if (process.env.FIX_IMPORT_METADATA !== '1') {
    console.log('⚠️  This script modifies ImportBatch metadata.')
    console.log('Run with FIX_IMPORT_METADATA=1 to execute:')
    console.log()
    console.log('  FIX_IMPORT_METADATA=1 npx tsx scripts/fix-confirmed-import-metadata.ts')
    console.log()
    process.exit(0)
  }

  const batch = await prisma.importBatch.findFirst({
    where: { status: 'confirmed' },
    orderBy: { confirmedAt: 'desc' },
  })

  if (!batch) {
    console.log('没有找到 confirmed 状态的 ImportBatch。')
    process.exit(0)
  }

  console.log(`Found confirmed ImportBatch: id=${batch.id}`)
  console.log()

  // 当前元数据
  console.log('--- Current Metadata ---')
  console.log(`  createdTaskCount: ${batch.createdTaskCount}`)
  console.log(`  createdSlotCount: ${batch.createdSlotCount}`)
  console.log()

  // 实际数量
  const actualTaskCount = await prisma.teachingTask.count({ where: { importBatchId: batch.id } })
  const actualSlotCount = await prisma.scheduleSlot.count({ where: { importBatchId: batch.id } })

  console.log('--- Actual DB Counts ---')
  console.log(`  actualTaskCount: ${actualTaskCount}`)
  console.log(`  actualSlotCount: ${actualSlotCount}`)
  console.log()

  const taskMismatch = batch.createdTaskCount !== actualTaskCount
  const slotMismatch = batch.createdSlotCount !== actualSlotCount

  if (!taskMismatch && !slotMismatch) {
    console.log('No mismatch found. Nothing to fix.')
    process.exit(0)
  }

  // 修正
  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      createdTaskCount: actualTaskCount,
      createdSlotCount: actualSlotCount,
    },
  })

  console.log('--- Fixed ---')
  if (taskMismatch) console.log(`  createdTaskCount: ${batch.createdTaskCount} → ${actualTaskCount}`)
  if (slotMismatch) console.log(`  createdSlotCount: ${batch.createdSlotCount} → ${actualSlotCount}`)
  console.log()

  // 验证
  const after = await prisma.importBatch.findUnique({ where: { id: batch.id } })
  console.log('--- Verified ---')
  console.log(`  createdTaskCount: ${after?.createdTaskCount}`)
  console.log(`  createdSlotCount: ${after?.createdSlotCount}`)
  console.log()
  console.log('DONE')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
