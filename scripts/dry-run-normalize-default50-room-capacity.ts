import { PrismaClient } from '@prisma/client'
import { existsSync, statSync } from 'fs'

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
      room: { select: { id: true, capacity: true } },
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
  if (alreadyMatching.length === 0) {
    console.log('(none)')
  } else {
    console.log('| roomId | roomName | maxAssigned | normalized110 |')
    console.log('| ---: | --- | ---: | ---: |')
    for (const c of alreadyMatching) {
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

  // ── Execute Mode ──
  const executeMode = process.env.K9_ROOM_CAPACITY_DEFAULT50_NORMALIZE_EXECUTE === 'YES'
  const backupPath = process.env.K9_ROOM_CAPACITY_BACKUP_PATH

  if (!executeMode) {
    await prisma.$disconnect()
    return
  }

  console.log('## Execute Mode\n')
  console.log('- mode: EXECUTE')

  // Validate env vars
  if (!backupPath) {
    console.error('ABORT: K9_ROOM_CAPACITY_BACKUP_PATH not set')
    await prisma.$disconnect()
    process.exit(1)
  }
  if (!existsSync(backupPath)) {
    console.error(`ABORT: Backup not found: ${backupPath}`)
    await prisma.$disconnect()
    process.exit(1)
  }
  const backupSize = statSync(backupPath).size
  if (backupSize === 0) {
    console.error(`ABORT: Backup is empty: ${backupPath}`)
    await prisma.$disconnect()
    process.exit(1)
  }

  // Assert candidates
  if (candidates.length !== 39) {
    console.error(`ABORT: candidates=${candidates.length}, expected=39`)
    await prisma.$disconnect()
    process.exit(1)
  }
  if (needsDown.length !== 39) {
    console.error(`ABORT: needsNormalizeDown=${needsDown.length}, expected=39`)
    await prisma.$disconnect()
    process.exit(1)
  }
  if (needsUp.length !== 0) {
    console.error(`ABORT: needsNormalizeUp=${needsUp.length}, expected=0`)
    await prisma.$disconnect()
    process.exit(1)
  }

  // Validate all candidates
  for (const c of proposedUpdates) {
    if (c.currentCapacity !== 50) {
      console.error(`ABORT: room ${c.roomId} currentCapacity=${c.currentCapacity}, expected=50`)
      await prisma.$disconnect()
      process.exit(1)
    }
    if (c.category !== 'NEEDS_NORMALIZE_DOWN') {
      console.error(`ABORT: room ${c.roomId} category=${c.category}, expected=NEEDS_NORMALIZE_DOWN`)
      await prisma.$disconnect()
      process.exit(1)
    }
    if (c.normalizedCapacity110 <= 0 || !Number.isInteger(c.normalizedCapacity110)) {
      console.error(`ABORT: room ${c.roomId} normalizedCapacity110=${c.normalizedCapacity110}, expected positive integer`)
      await prisma.$disconnect()
      process.exit(1)
    }
    if (c.normalizedCapacity110 > 50) {
      console.error(`ABORT: room ${c.roomId} normalizedCapacity110=${c.normalizedCapacity110} > 50 (should be DOWN)`)
      await prisma.$disconnect()
      process.exit(1)
    }
    if (c.normalizedCapacity110 < c.maxAssignedStudentCount) {
      console.error(`ABORT: room ${c.roomId} normalizedCapacity110=${c.normalizedCapacity110} < maxAssigned=${c.maxAssignedStudentCount}`)
      await prisma.$disconnect()
      process.exit(1)
    }
  }

  console.log(`- backupPath: ${backupPath}`)
  console.log(`- backupSize: ${backupSize} bytes`)
  console.log(`- candidates: ${proposedUpdates.length}`)
  console.log()

  // Execute updates in transaction
  console.log('## Executing Updates')
  let updatedCount = 0

  try {
    await prisma.$transaction(async (tx) => {
      for (const c of proposedUpdates) {
        await tx.room.update({
          where: { id: c.roomId },
          data: { capacity: c.normalizedCapacity110 },
        })
        updatedCount++
        console.log(`  updated room ${c.roomId} (${c.roomName}): ${c.currentCapacity} -> ${c.normalizedCapacity110}`)
      }
    })
    console.log(`\n- transaction: SUCCESS`)
    console.log(`- updatedCount: ${updatedCount}`)
  } catch (e) {
    console.error(`\n- transaction: FAILED`)
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  }

  if (updatedCount !== proposedUpdates.length) {
    console.error(`ABORT: updatedCount ${updatedCount} !== candidates ${proposedUpdates.length}`)
    await prisma.$disconnect()
    process.exit(1)
  }

  console.log('\n## Update Complete')
  console.log('- status: SUCCESS')
  console.log(`- updated: ${updatedCount} Room.capacity records`)
  console.log(`- backup: ${backupPath}`)
  console.log()

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
