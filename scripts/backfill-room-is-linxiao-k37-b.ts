/**
 * scripts/backfill-room-is-linxiao-k37-b.ts
 *
 * K37-B: Backfill Room.isLinxiao based on name.includes('林校').
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/backfill-room-is-linxiao-k37-b.ts           # dry-run
 *   npx tsx scripts/backfill-room-is-linxiao-k37-b.ts --apply   # apply
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const rooms = await prisma.room.findMany({ orderBy: { id: 'asc' } })

  const shouldMarkLinxiao = rooms.filter((r) => r.name.includes('林校'))
  const alreadyTrue = shouldMarkLinxiao.filter((r) => r.isLinxiao)
  const needsUpdate = shouldMarkLinxiao.filter((r) => !r.isLinxiao)

  // Also check for mismatches the other way: isLinxiao=true but name doesn't suggest linxiao
  const falsePositiveLinxiao = rooms.filter((r) => r.isLinxiao && !r.name.includes('林校'))

  console.log(`=== K37-B Room.isLinxiao Backfill (${apply ? 'APPLY' : 'DRY-RUN'}) ===`)
  console.log()
  console.log(`Total rooms:            ${rooms.length}`)
  console.log(`Name suggests linxiao:  ${shouldMarkLinxiao.length}`)
  console.log(`Already isLinxiao=true: ${alreadyTrue.length}`)
  console.log(`Needs update to true:   ${needsUpdate.length}`)
  console.log(`False-positive (isLinxiao=true, name no suggest): ${falsePositiveLinxiao.length}`)

  if (needsUpdate.length > 0) {
    console.log()
    console.log('Rooms to update:')
    for (const r of needsUpdate) {
      console.log(`  Room ${r.id}: "${r.name}" → isLinxiao=true`)
    }
  }

  if (falsePositiveLinxiao.length > 0) {
    console.log()
    console.log('False-positive (isLinxiao=true but name has no 林校):')
    for (const r of falsePositiveLinxiao) {
      console.log(`  Room ${r.id}: "${r.name}" (building: ${r.building ?? 'null'})`)
    }
  }

  if (apply && needsUpdate.length > 0) {
    console.log()
    console.log('Applying updates...')
    for (const r of needsUpdate) {
      await prisma.room.update({
        where: { id: r.id },
        data: { isLinxiao: true },
      })
    }
    console.log(`Updated ${needsUpdate.length} rooms.`)

    // Post-check
    const after = await prisma.room.findMany({
      where: { isLinxiao: true },
      orderBy: { id: 'asc' },
    })
    console.log()
    console.log(`Post-check: isLinxiao=true count = ${after.length}`)
    for (const r of after) {
      console.log(`  Room ${r.id}: "${r.name}" (isLinxiao=true)`)
    }
  } else if (apply && needsUpdate.length === 0) {
    console.log()
    console.log('No updates needed. Already up to date.')
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
