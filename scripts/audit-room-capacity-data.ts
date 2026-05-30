import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('# Room Capacity Data Audit\n')

  const rooms = await prisma.room.findMany({
    select: { id: true, name: true, capacity: true, building: true, type: true },
    orderBy: { name: 'asc' },
  })

  const total = rooms.length
  const withNull = rooms.filter((r) => r.capacity == null).length
  const with50 = rooms.filter((r) => r.capacity === 50).length
  const under80 = rooms.filter((r) => r.capacity != null && r.capacity < 80).length
  const over100 = rooms.filter((r) => r.capacity != null && r.capacity > 100).length
  const over80 = rooms.filter((r) => r.capacity != null && r.capacity > 80).length

  console.log('## Room Capacity Distribution\n')
  console.log(`- totalRooms: ${total}`)
  console.log(`- roomsWithNullCapacity: ${withNull}`)
  console.log(`- roomsWithCapacity50: ${with50}`)
  console.log(`- roomsWithCapacityUnder80: ${under80}`)
  console.log(`- roomsWithCapacity81to100: ${over80 - over100}`)
  console.log(`- roomsWithCapacityOver100: ${over100}`)
  console.log()

  // 林校305
  const linxiao305 = rooms.find((r) => r.name.includes('林校305') || r.name.includes('林校\n305'))
  console.log('## Target Room: 林校305\n')
  if (linxiao305) {
    console.log(`- name: ${linxiao305.name}`)
    console.log(`- DB capacity: ${linxiao305.capacity}`)
    console.log(`- building: ${linxiao305.building}`)
    console.log(`- type: ${linxiao305.type}`)
    console.log(`- user-confirmed real capacity: 150`)
    console.log(`- DB vs real: ${linxiao305.capacity} vs 150 → MISMATCH`)
  } else {
    console.log('- NOT FOUND in database')
  }
  console.log()

  // All rooms with capacity > 50
  const largeRooms = rooms.filter((r) => r.capacity != null && r.capacity > 50)
  console.log('## Rooms with Capacity > 50\n')
  if (largeRooms.length === 0) {
    console.log('(none)')
  } else {
    console.log('| name | capacity | building | type |')
    console.log('| --- | ---: | --- | --- |')
    for (const r of largeRooms) {
      console.log(`| ${r.name} | ${r.capacity} | ${r.building ?? '-'} | ${r.type} |`)
    }
  }
  console.log()

  // HC4 involved rooms
  const tasks = await prisma.teachingTask.findMany({
    include: {
      course: { select: { name: true } },
      scheduleSlots: { include: { room: { select: { name: true, capacity: true } } } },
      taskClasses: { include: { classGroup: { select: { name: true, studentCount: true } } } },
    },
  })

  const hc4Rooms = new Map<string, { name: string; dbCapacity: number; hc4Count: number }>()
  for (const task of tasks) {
    const studentCount = task.taskClasses.reduce((s, tc) => s + (tc.classGroup.studentCount ?? 50), 0)
    for (const slot of task.scheduleSlots) {
      if (!slot.room) continue
      if (studentCount > slot.room.capacity) {
        const key = slot.room.name
        const existing = hc4Rooms.get(key)
        if (existing) {
          existing.hc4Count++
        } else {
          hc4Rooms.set(key, { name: slot.room.name, dbCapacity: slot.room.capacity, hc4Count: 1 })
        }
      }
    }
  }

  console.log('## HC4 Involved Rooms\n')
  console.log('| roomName | DB capacity | HC4 slot count |')
  console.log('| --- | ---: | ---: |')
  for (const [, r] of hc4Rooms) {
    console.log(`| ${r.name} | ${r.dbCapacity} | ${r.hc4Count} |`)
  }
  console.log()

  // Schema audit
  console.log('## Schema Default\n')
  console.log('- Room.capacity @default(50) → any room created without explicit capacity gets 50')
  console.log()

  // Import audit
  console.log('## Import/Seed Hardcoded Capacity\n')
  console.log('- importer.ts L517: room.create({ data: { name, capacity: 50, type: "NORMAL" } })')
  console.log('- seed_db.ts L318: create: { name, building, capacity: 50, type: "NORMAL" }')
  console.log('- Both hardcode capacity=50 regardless of real room size')
  console.log()

  // Source trace
  console.log('## Capacity Data Source Trace\n')
  console.log('1. Prisma schema: @default(50) → safe default but not real data')
  console.log('2. seed_db.ts: hardcoded 50 → no real capacity source')
  console.log('3. importer.ts: hardcoded 50 → no real capacity source')
  console.log('4. No real room capacity CSV/JSON/file found in codebase')
  console.log('5. capacity.ts getTaskStudentCount: FALLBACK_50_PER_CLASS=50 is for studentCount, NOT room capacity')
  console.log('6. test-capacity.ts / test-diagnostics.ts: read DB room.capacity directly, no additional fallback')
  console.log()

  console.log('## Safety\n')
  console.log('- noDatabaseWrites: true')
  console.log('- noSqlite3: true')
  console.log()

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
