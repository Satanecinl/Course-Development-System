/**
 * scripts/diagnose-campus-room-rules-runtime-k37-b2.ts
 *
 * K37-B2: Diagnose runtime state of Room.isLinxiao.
 * Pure read-only diagnostics — no DB writes.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== K37-B2 Runtime Diagnosis ===')
  console.log()

  // 1. Prisma client can read isLinxiao
  const sample = await prisma.room.findFirst({ select: { id: true, name: true, isLinxiao: true } })
  console.log(`1. Prisma can read isLinxiao: ${sample ? `yes (sample: id=${sample.id}, isLinxiao=${sample.isLinxiao})` : 'no data'}`)

  // 2. Total Room count
  const total = await prisma.room.count()
  console.log(`2. Room count: ${total}`)

  // 3. isLinxiao=true count
  const linxiaoCount = await prisma.room.count({ where: { isLinxiao: true } })
  console.log(`3. isLinxiao=true count: ${linxiaoCount}`)

  // 4. name includes 林校
  const allRooms = await prisma.room.findMany({ select: { id: true, name: true, isLinxiao: true }, orderBy: { id: 'asc' } })
  const nameSuggests = allRooms.filter((r) => r.name.includes('林校'))
  console.log(`4. name.includes('林校') count: ${nameSuggests.length}`)

  // 5. Mismatch summary (advisory only, no sensitive data)
  const mismatches = allRooms.filter((r) => r.isLinxiao !== r.name.includes('林校'))
  console.log(`5. Mismatch count: ${mismatches.length}`)
  if (mismatches.length > 0 && mismatches.length <= 10) {
    for (const m of mismatches) {
      console.log(`   - Room ${m.id}: "${m.name}" isLinxiao=${m.isLinxiao} nameSuggest=${m.name.includes('林校')}`)
    }
  }

  // 6. Linxiao 301-306 specific values
  console.log(`6. Linxiao 301/303/304/305/306 status:`)
  for (const r of allRooms.filter((r) => ['林校301', '林校303', '林校304', '林校305', '林校306'].includes(r.name))) {
    console.log(`   - ${r.name} (id=${r.id}): isLinxiao=${r.isLinxiao}`)
  }

  // 7. ScheduleSlot / TeachingTask / ScheduleAdjustment
  const slotCount = await prisma.scheduleSlot.count()
  const taskCount = await prisma.teachingTask.count()
  const adjCount = await prisma.scheduleAdjustment.count()
  console.log(`7. ScheduleSlot: ${slotCount}, TeachingTask: ${taskCount}, ScheduleAdjustment: ${adjCount}`)

  // 8. Schema check
  console.log(`8. Schema: isLinxiao field is accessible via Prisma Client (confirmed by sample query)`)

  // 9. Baseline check
  const expectedNames = ['林校301', '林校303', '林校304', '林校305', '林校306']
  const expectedTrue = allRooms.filter((r) => expectedNames.includes(r.name) && r.isLinxiao === true)
  console.log(`9. Baseline check: expected 5 linxiao (林校301-306), actual true = ${expectedTrue.length}`)

  console.log()
  console.log('=== Diagnosis Complete ===')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('Diagnose error:', e)
  process.exit(1)
})
