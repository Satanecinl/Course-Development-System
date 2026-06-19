/**
 * K39-B1: Backfill import rule config singleton row.
 *
 * Usage:
 *   npx tsx scripts/backfill-import-rule-config-k39-b1.ts          # dry-run
 *   npx tsx scripts/backfill-import-rule-config-k39-b1.ts --apply   # apply
 *
 * Idempotent. Does NOT modify ImportBatch/TeachingTask/TeachingTaskClass/ScheduleSlot/ScheduleAdjustment.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const KEY = 'default'

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`=== K39-B1: Import Rule Config Backfill (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`)

  const existing = await prisma.importRuleConfig.findUnique({ where: { key: KEY } })

  if (existing) {
    console.log(`✅ Config row already exists: id=${existing.id} key="${existing.key}" requireExplicitSemesterForImport=${existing.requireExplicitSemesterForImport}`)
    console.log('   No action needed.')
    return
  }

  if (!apply) {
    console.log('⚠️  Config row does not exist. Dry-run mode — would create:')
    console.log(`   key="${KEY}" requireExplicitSemesterForImport=false`)
    console.log('\n   Run with --apply to create.')
    return
  }

  const row = await prisma.importRuleConfig.create({
    data: { key: KEY, requireExplicitSemesterForImport: false },
  })

  console.log(`✅ Created config row: id=${row.id} key="${row.key}" requireExplicitSemesterForImport=${row.requireExplicitSemesterForImport}`)

  // Verify
  const verify = await prisma.importRuleConfig.findUnique({ where: { key: KEY } })
  if (verify && verify.requireExplicitSemesterForImport === false) {
    console.log('✅ Verified: config row exists with correct defaults.')
  } else {
    console.error('❌ Verification failed!')
    process.exit(1)
  }

  // Confirm business data unchanged
  const [batchCount, taskCount, ttcCount, slotCount, adjCount] = await Promise.all([
    prisma.importBatch.count(),
    prisma.teachingTask.count(),
    prisma.teachingTaskClass.count(),
    prisma.scheduleSlot.count(),
    prisma.scheduleAdjustment.count(),
  ])
  console.log(`\n📊 Business data unchanged: ImportBatch=${batchCount} TeachingTask=${taskCount} TeachingTaskClass=${ttcCount} ScheduleSlot=${slotCount} ScheduleAdjustment=${adjCount}`)
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
