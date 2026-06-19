/**
 * scripts/backfill-adjustment-rule-config-k38-b.ts
 *
 * K38-B: Backfill AdjustmentRuleConfig singleton row.
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/backfill-adjustment-rule-config-k38-b.ts           # dry-run
 *   npx tsx scripts/backfill-adjustment-rule-config-k38-b.ts --apply   # apply
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const existing = await prisma.adjustmentRuleConfig.findFirst()

  console.log(`=== K38-B AdjustmentRuleConfig Backfill (${apply ? 'APPLY' : 'DRY-RUN'}) ===`)
  console.log()
  console.log(`Existing config: ${existing ? `yes (key=${existing.key}, limit=${existing.defaultRecommendationLimit})` : 'none'}`)

  const targetLimit = 5

  if (existing) {
    if (existing.defaultRecommendationLimit === targetLimit) {
      console.log('Already at default (5). No action needed.')
    } else {
      console.log(`Would update: defaultRecommendationLimit ${existing.defaultRecommendationLimit} → ${targetLimit}`)
      if (apply) {
        await prisma.adjustmentRuleConfig.update({
          where: { key: 'default' },
          data: { defaultRecommendationLimit: targetLimit },
        })
        console.log(`Updated to ${targetLimit}.`)
      }
    }
  } else {
    console.log(`Would create: key=default, defaultRecommendationLimit=${targetLimit}`)
    if (apply) {
      await prisma.adjustmentRuleConfig.create({
        data: { key: 'default', defaultRecommendationLimit: targetLimit },
      })
      console.log(`Created config with limit=${targetLimit}.`)
    }
  }

  // Post-check
  if (apply) {
    const row = await prisma.adjustmentRuleConfig.findFirst()
    console.log()
    console.log(`Post-check: ${row ? `limit=${row.defaultRecommendationLimit}` : 'row missing'}`)
  } else {
    console.log()
    console.log('Dry-run complete. Use --apply to execute.')
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('Backfill error:', e)
  process.exit(1)
})