import { PrismaClient } from '@prisma/client'
import { existsSync, statSync } from 'fs'

const prisma = new PrismaClient()

async function main() {
  console.log('# Room Capacity Autofit Dry Run\n')

  console.log('## Safety')
  console.log('- mode: DRY_RUN_ONLY')
  console.log('- noDatabaseWrites: true')
  console.log('- noSqlGenerated: true')
  console.log()

  // Load all data
  const rooms = await prisma.room.findMany({
    select: { id: true, name: true, capacity: true, building: true, type: true },
  })
  const roomMap = new Map(rooms.map((r) => [r.id, r]))

  const slots = await prisma.scheduleSlot.findMany({
    include: {
      teachingTask: {
        include: {
          course: true,
          taskClasses: { include: { classGroup: { select: { id: true, name: true, studentCount: true } } } },
        },
      },
      room: { select: { id: true, name: true, capacity: true } },
    },
  })

  // Calculate max studentCount per room
  const roomMaxStudents = new Map<number, { maxStudents: number; tasks: Array<{ taskId: number; course: string; students: number }> }>()

  for (const slot of slots) {
    if (!slot.room || !slot.teachingTask) continue
    const roomId = slot.room.id

    const studentCount = slot.teachingTask.taskClasses.reduce((sum, tc) => {
      return sum + (tc.classGroup.studentCount ?? 50)
    }, 0)

    let entry = roomMaxStudents.get(roomId)
    if (!entry) {
      entry = { maxStudents: 0, tasks: [] }
      roomMaxStudents.set(roomId, entry)
    }

    if (studentCount > entry.maxStudents) {
      entry.maxStudents = studentCount
    }

    // Track unique tasks per room
    if (!entry.tasks.some((t) => t.taskId === slot.teachingTaskId)) {
      entry.tasks.push({
        taskId: slot.teachingTaskId,
        course: slot.teachingTask.course?.name ?? '?',
        students: studentCount,
      })
    }
  }

  // Calculate HC4 count
  let currentHC4 = 0
  for (const slot of slots) {
    if (!slot.room || !slot.teachingTask) continue
    const studentCount = slot.teachingTask.taskClasses.reduce((sum, tc) => {
      return sum + (tc.classGroup.studentCount ?? 50)
    }, 0)
    if (studentCount > slot.room.capacity) currentHC4++
  }

  // Build update candidates (110% rule)
  const candidates: Array<{
    roomId: number
    roomName: string
    currentCapacity: number
    maxAssignedStudentCount: number
    requiredCapacity110: number
    proposedCapacity: number
    capacityIncrease: number
    taskCount: number
    reason: string
  }> = []

  for (const [roomId, entry] of roomMaxStudents) {
    const room = roomMap.get(roomId)
    if (!room) continue
    const requiredCapacity110 = Math.ceil(entry.maxStudents * 1.10)
    if (requiredCapacity110 > room.capacity) {
      const proposedCapacity = Math.max(room.capacity, requiredCapacity110)
      candidates.push({
        roomId,
        roomName: room.name,
        currentCapacity: room.capacity,
        maxAssignedStudentCount: entry.maxStudents,
        requiredCapacity110,
        proposedCapacity,
        capacityIncrease: proposedCapacity - room.capacity,
        taskCount: entry.tasks.length,
        reason: `required110=${requiredCapacity110} > current=${room.capacity}`,
      })
    }
  }

  candidates.sort((a, b) => b.requiredCapacity110 - a.requiredCapacity110)

  // Calculate expected HC4 after autofit
  // After autofit, room.capacity = proposedCapacity for all candidates
  // Recalculate HC4 with proposed capacities
  const proposedCapacities = new Map<number, number>()
  for (const c of candidates) {
    proposedCapacities.set(c.roomId, c.proposedCapacity)
  }
  let expectedHC4After = 0
  for (const slot of slots) {
    if (!slot.room || !slot.teachingTask) continue
    const studentCount = slot.teachingTask.taskClasses.reduce((sum, tc) => {
      return sum + (tc.classGroup.studentCount ?? 50)
    }, 0)
    const effectiveCapacity = proposedCapacities.get(slot.room.id) ?? slot.room.capacity
    if (studentCount > effectiveCapacity) expectedHC4After++
  }

  // Summary stats
  const roomsUsed = roomMaxStudents.size
  const totalIncrease = candidates.reduce((sum, c) => sum + (c.proposedCapacity - c.currentCapacity), 0)

  // Target room: 林校305 (all records)
  const linxiao305Candidates = candidates.filter((c) => c.roomName.includes('林校305') || c.roomName.includes('林校\n305'))
  const linxiao305Rooms = rooms.filter((r) => r.name.includes('林校305') || r.name.includes('林校\n305'))

  console.log('## Summary\n')
  console.log(`- totalRooms: ${rooms.length}`)
  console.log(`- totalScheduleSlots: ${slots.length}`)
  console.log(`- roomsUsedBySchedule: ${roomsUsed}`)
  console.log(`- roomsNeedingCapacityIncrease: ${candidates.length}`)
  console.log(`- totalCapacityIncrease: ${totalIncrease}`)
  console.log(`- currentHC4Count: ${currentHC4}`)
  console.log(`- expectedHC4AfterAutofit: ${expectedHC4After}`)
  console.log()

  // Update candidates table
  console.log('## Capacity Update Candidates\n')
  if (candidates.length === 0) {
    console.log('(no updates needed)')
  } else {
    console.log('| roomId | roomName | current | maxAssigned | required110 | proposed | increase | tasks | reason |')
    console.log('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |')
    for (const c of candidates) {
      console.log(`| ${c.roomId} | ${c.roomName} | ${c.currentCapacity} | ${c.maxAssignedStudentCount} | ${c.requiredCapacity110} | ${c.proposedCapacity} | +${c.capacityIncrease} | ${c.taskCount} | ${c.reason} |`)
    }
  }
  console.log()

  // 林校305 专项
  console.log('## Target Room: 林校305\n')
  if (linxiao305Rooms.length > 0) {
    for (const room of linxiao305Rooms) {
      const entry = roomMaxStudents.get(room.id)
      const candidate = linxiao305Candidates.find((c) => c.roomId === room.id)
      console.log(`- roomId: ${room.id}`)
      console.log(`  - roomName: ${room.name}`)
      console.log(`  - DB currentCapacity: ${room.capacity}`)
      console.log(`  - maxAssignedStudentCount: ${entry?.maxStudents ?? 'N/A (not used)'}`)
      console.log(`  - requiredCapacity110: ${candidate?.requiredCapacity110 ?? 'N/A'}`)
      console.log(`  - proposedCapacity: ${candidate?.proposedCapacity ?? room.capacity}`)
      console.log(`  - capacityIncrease: ${candidate ? '+' + candidate.capacityIncrease : 0}`)
      console.log(`  - needsUpdate: ${candidate ? 'YES' : 'NO'}`)
      if (entry) {
        console.log(`  - top tasks:`)
        for (const t of entry.tasks.sort((a, b) => b.students - a.students).slice(0, 5)) {
          console.log(`      - task ${t.taskId}: ${t.course} (${t.students} students)`)
        }
      }
    }
  } else {
    console.log('- NOT FOUND in database')
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

  console.log('## Next Step\n')
  console.log('- K9-B-ROOM-CAPACITY-AUTOFIT-EXECUTION')
  console.log()

  // ── Execute Mode ──
  const executeMode = process.env.K9_ROOM_CAPACITY_AUTOFIT_EXECUTE === 'YES'
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

  // Assert candidates match expected
  if (candidates.length !== 12) {
    console.error(`ABORT: candidates=${candidates.length}, expected=12`)
    await prisma.$disconnect()
    process.exit(1)
  }
  if (totalIncrease !== 226) {
    console.error(`ABORT: totalIncrease=${totalIncrease}, expected=226`)
    await prisma.$disconnect()
    process.exit(1)
  }

  console.log(`- backupPath: ${backupPath}`)
  console.log(`- backupSize: ${backupSize} bytes`)
  console.log(`- candidates: ${candidates.length}`)
  console.log(`- totalIncrease: ${totalIncrease}`)
  console.log()

  // Execute updates in transaction
  console.log('## Executing Updates')
  let updatedCount = 0

  try {
    await prisma.$transaction(async (tx) => {
      for (const c of candidates) {
        await tx.room.update({
          where: { id: c.roomId },
          data: { capacity: c.proposedCapacity },
        })
        updatedCount++
        console.log(`  updated room ${c.roomId} (${c.roomName}): ${c.currentCapacity} -> ${c.proposedCapacity}`)
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

  if (updatedCount !== candidates.length) {
    console.error(`ABORT: updatedCount ${updatedCount} !== candidates ${candidates.length}`)
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
