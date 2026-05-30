import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('# Default-50 Room Capacity Normalize Dry Run\n')

  console.log('## Safety')
  console.log('- mode: DRY_RUN_ONLY')
  console.log('- noDatabaseWrites: true')
  console.log('- noSqlGenerated: true')
  console.log('- onlyAnalyzesCapacity50Rooms: true')
  console.log('- formula: normalizedCapacity110 = ceil(maxAssignedStudentCount * 1.10)')
  console.log('- futurePolicy: Room.capacity is fixed after normalization; no automatic recalculation')
  console.log()

  // Load all data
  const rooms = await prisma.room.findMany({
    select: { id: true, name: true, capacity: true },
  })

  const slots = await prisma.scheduleSlot.findMany({
    include: {
      teachingTask: {
        include: {
          taskClasses: { include: { classGroup: { select: { id: true, studentCount: true } } } },
        },
      },
      room: { select: { id: true } },
    },
  })

  // Calculate max studentCount per room (only for capacity=50 rooms)
  const capacity50Rooms = rooms.filter((r) => r.capacity === 50)
  const roomMaxStudents = new Map<number, number>()

  for (const slot of slots) {
    if (!slot.room || !slot.teachingTask) continue
    const roomId = slot.room.id
    if (!capacity50Rooms.some((r) => r.id === roomId)) continue

    const studentCount = slot.teachingTask.taskClasses.reduce((sum, tc) => {
      return sum + (tc.classGroup.studentCount ?? 50)
    }, 0)

    const current = roomMaxStudents.get(roomId) ?? 0
    if (studentCount > current) roomMaxStudents.set(roomId, studentCount)
  }

  // Classify each capacity=50 room
  type Category = 'NEEDS_NORMALIZE_UP' | 'NEEDS_NORMALIZE_DOWN' | 'ALREADY_MATCHES_110_RULE' | 'UNUSED_KEEP_DEFAULT' | 'CANNOT_CALCULATE'

  interface NormalizeCandidate {
    roomId: number
    roomName: string
    currentCapacity: number
    maxAssignedStudentCount: number
    normalizedCapacity110: number
    delta: number
    category: Category
    reason: string
  }

  const candidates: NormalizeCandidate[] = []
  const alreadyMatching: Array<{ roomId: number; roomName: string; maxAssigned: number; normalized: number }> = []
  const unused: Array<{ roomId: number; roomName: string }> = []

  for (const room of capacity50Rooms) {
    const maxAssigned = roomMaxStudents.get(room.id) ?? 0

    if (maxAssigned === 0) {
      unused.push({ roomId: room.id, roomName: room.name })
      candidates.push({
        roomId: room.id,
        roomName: room.name,
        currentCapacity: 50,
        maxAssignedStudentCount: 0,
        normalizedCapacity110: 50,
        delta: 0,
        category: 'UNUSED_KEEP_DEFAULT',
        reason: 'No ScheduleSlot assigned',
      })
      continue
    }

    const normalized = Math.ceil(maxAssigned * 1.10)
    const delta = normalized - 50

    let category: Category
    let reason: string

    if (normalized > 50) {
      category = 'NEEDS_NORMALIZE_UP'
      reason = `normalized110=${normalized} > default=50`
    } else if (normalized < 50) {
      category = 'NEEDS_NORMALIZE_DOWN'
      reason = `normalized110=${normalized} < default=50 (capacity tightening)`
    } else {
      category = 'ALREADY_MATCHES_110_RULE'
      reason = `normalized110=50 matches default`
      alreadyMatching.push({ roomId: room.id, roomName: room.name, maxAssigned, normalized })
    }

    candidates.push({
      roomId: room.id,
      roomName: room.name,
      currentCapacity: 50,
      maxAssignedStudentCount: maxAssigned,
      normalizedCapacity110: normalized,
      delta,
      category,
      reason,
    })
  }

  // Summary stats
  const needsUp = candidates.filter((c) => c.category === 'NEEDS_NORMALIZE_UP')
  const needsDown = candidates.filter((c) => c.category === 'NEEDS_NORMALIZE_DOWN')
  const alreadyMatch = candidates.filter((c) => c.category === 'ALREADY_MATCHES_110_RULE')
  const unusedRooms = candidates.filter((c) => c.category === 'UNUSED_KEEP_DEFAULT')
  const proposedUpdates = [...needsUp, ...needsDown]

  // Expected HC4 after normalize
  const proposedCapacities = new Map<number, number>()
  for (const c of proposedUpdates) proposedCapacities.set(c.roomId, c.normalizedCapacity110)

  let expectedHC4 = 0
  for (const slot of slots) {
    if (!slot.room || !slot.teachingTask) continue
    const studentCount = slot.teachingTask.taskClasses.reduce((sum, tc) => {
      return sum + (tc.classGroup.studentCount ?? 50)
    }, 0)
    const effectiveCap = proposedCapacities.get(slot.room.id) ?? slot.room.capacity
    if (studentCount > effectiveCap) expectedHC4++
  }

  console.log('## Summary\n')
  console.log(`- totalRooms: ${rooms.length}`)
  console.log(`- roomsWithCapacity50: ${capacity50Rooms.length}`)
  console.log(`- capacity50RoomsUsedBySchedule: ${capacity50Rooms.length - unused.length}`)
  console.log(`- capacity50RoomsUnused: ${unused.length}`)
  console.log(`- needsNormalizeUp: ${needsUp.length}`)
  console.log(`- needsNormalizeDown: ${needsDown.length}`)
  console.log(`- alreadyMatches110Rule: ${alreadyMatch.length}`)
  console.log(`- cannotCalculateBlocked: 0`)
  console.log(`- proposedUpdateCount: ${proposedUpdates.length}`)
  console.log(`- expectedHC4AfterNormalize: ${expectedHC4}`)
  console.log()

  // Normalize candidates
  console.log('## Normalize Candidates\n')
  const normalizeCandidates = [...needsUp, ...needsDown].sort((a, b) => b.normalizedCapacity110 - a.normalizedCapacity110)
  if (normalizeCandidates.length === 0) {
    console.log('(no updates needed)')
  } else {
    console.log('| roomId | roomName | current | maxAssigned | normalized110 | delta | category | reason |')
    console.log('| ---: | --- | ---: | ---: | ---: | ---: | --- | --- |')
    for (const c of normalizeCandidates) {
      console.log(`| ${c.roomId} | ${c.roomName} | ${c.currentCapacity} | ${c.maxAssignedStudentCount} | ${c.normalizedCapacity110} | ${c.delta > 0 ? '+' : ''}${c.delta} | ${c.category} | ${c.reason} |`)
    }
  }
  console.log()

  // Already matching
  console.log('## Capacity 50 Rooms Already Matching Rule\n')
  if (alreadyMatch.length === 0) {
    console.log('(none)')
  } else {
    console.log('| roomId | roomName | maxAssigned | normalized110 |')
    console.log('| ---: | --- | ---: | ---: |')
    for (const c of alreadyMatch) {
      console.log(`| ${c.roomId} | ${c.roomName} | ${c.maxAssigned} | ${c.normalized} |`)
    }
  }
  console.log()

  // Unused
  console.log('## Unused Capacity 50 Rooms\n')
  if (unused.length === 0) {
    console.log('(none)')
  } else {
    console.log('| roomId | roomName | category | reason |')
    console.log('| ---: | --- | --- | --- |')
    for (const u of unused) {
      console.log(`| ${u.roomId} | ${u.roomName} | UNUSED_KEEP_DEFAULT | No ScheduleSlot assigned |`)
    }
  }
  console.log()

  // Validation
  const slotsWithoutRoom = slots.filter((s) => !s.room).length
  const slotsWithoutTask = slots.filter((s) => !s.teachingTask).length
  const tasksWithoutClassGroup = slots.filter((s) => s.teachingTask && s.teachingTask.taskClasses.length === 0).length

  console.log('## Validation\n')
  console.log(`- slotsMissingRoom: ${slotsWithoutRoom}`)
  console.log(`- slotsMissingTask: ${slotsWithoutTask}`)
  console.log(`- tasksMissingClassGroup: ${tasksWithoutClassGroup}`)
  console.log(`- anomaliesNeedReview: ${slotsWithoutRoom + slotsWithoutTask + tasksWithoutClassGroup}`)
  console.log()

  console.log('## Next Step Recommendation\n')
  if (proposedUpdates.length > 0) {
    console.log('- K9-B-ROOM-CAPACITY-DEFAULT50-NORMALIZE-EXECUTION')
  } else {
    console.log('- No updates needed. All capacity=50 rooms either match rule or are unused.')
  }
  console.log()

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
