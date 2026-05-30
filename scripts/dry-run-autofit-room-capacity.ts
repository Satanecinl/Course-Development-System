import { PrismaClient } from '@prisma/client'

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

  // Build update candidates
  const candidates: Array<{
    roomId: number
    roomName: string
    currentCapacity: number
    maxAssignedStudentCount: number
    proposedCapacity: number
    taskCount: number
    reason: string
  }> = []

  for (const [roomId, entry] of roomMaxStudents) {
    const room = roomMap.get(roomId)
    if (!room) continue
    if (entry.maxStudents > room.capacity) {
      candidates.push({
        roomId,
        roomName: room.name,
        currentCapacity: room.capacity,
        maxAssignedStudentCount: entry.maxStudents,
        proposedCapacity: entry.maxStudents,
        taskCount: entry.tasks.length,
        reason: `maxAssigned=${entry.maxStudents} > current=${room.capacity}`,
      })
    }
  }

  candidates.sort((a, b) => b.maxAssignedStudentCount - a.maxAssignedStudentCount)

  // Calculate expected HC4 after autofit
  // After autofit, room.capacity = maxAssignedStudentCount for all candidates
  // So HC4 should drop to 0 (all capacity conflicts resolved by definition)
  const expectedHC4After = 0

  // Summary stats
  const roomsUsed = roomMaxStudents.size
  const totalIncrease = candidates.reduce((sum, c) => sum + (c.proposedCapacity - c.currentCapacity), 0)

  // Target room: 林校305
  const linxiao305 = candidates.find((c) => c.roomName.includes('林校305') || c.roomName.includes('林校\n305'))
  const linxiao305Room = rooms.find((r) => r.name.includes('林校305') || r.name.includes('林校\n305'))
  const linxiao305Entry = roomMaxStudents.get(linxiao305Room?.id ?? -1)

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
    console.log('| roomId | roomName | currentCapacity | maxAssigned | proposed | tasks | reason |')
    console.log('| ---: | --- | ---: | ---: | ---: | ---: | --- |')
    for (const c of candidates) {
      console.log(`| ${c.roomId} | ${c.roomName} | ${c.currentCapacity} | ${c.maxAssignedStudentCount} | ${c.proposedCapacity} | ${c.taskCount} | ${c.reason} |`)
    }
  }
  console.log()

  // 林校305 专项
  console.log('## Target Room: 林校305\n')
  if (linxiao305Room) {
    console.log(`- roomName: ${linxiao305Room.name}`)
    console.log(`- DB currentCapacity: ${linxiao305Room.capacity}`)
    console.log(`- maxAssignedStudentCount: ${linxiao305Entry?.maxStudents ?? 'N/A (not used by any slot)'}`)
    console.log(`- proposedCapacity: ${linxiao305 ? linxiao305.proposedCapacity : linxiao305Room.capacity}`)
    console.log(`- needsUpdate: ${linxiao305 ? 'YES' : 'NO'}`)
    if (linxiao305Entry) {
      console.log(`- top tasks:`)
      for (const t of linxiao305Entry.tasks.sort((a, b) => b.students - a.students).slice(0, 5)) {
        console.log(`    - task ${t.taskId}: ${t.course} (${t.students} students)`)
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

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
