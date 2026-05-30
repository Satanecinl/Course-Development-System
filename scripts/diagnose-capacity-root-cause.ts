import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('# Capacity Root Cause Diagnosis\n')

  // Load all data
  const rooms = await prisma.room.findMany({ select: { id: true, name: true, capacity: true, building: true, type: true } })
  const roomMap = new Map(rooms.map((r) => [r.id, r]))

  const tasks = await prisma.teachingTask.findMany({
    include: {
      course: { select: { name: true } },
      teacher: { select: { name: true } },
      taskClasses: { include: { classGroup: { select: { name: true, studentCount: true } } } },
      scheduleSlots: true,
    },
  })

  // Build slot occupancy: roomId -> Set of "dayOfWeek|slotIndex" strings
  const roomOccupancy = new Map<number, Set<string>>()
  for (const task of tasks) {
    for (const slot of task.scheduleSlots) {
      if (slot.roomId == null) continue
      const key = `${slot.dayOfWeek}|${slot.slotIndex}`
      let set = roomOccupancy.get(slot.roomId)
      if (!set) { set = new Set(); roomOccupancy.set(slot.roomId, set) }
      set.add(key)
    }
  }

  // Find HC4 conflicts: studentCount > currentRoom.capacity
  const hc4Tasks: Array<{
    task: typeof tasks[number]
    studentCount: number
    currentRoom: typeof rooms[number] | null
    shortage: number
  }> = []

  for (const task of tasks) {
    const totalStudents = task.taskClasses.reduce((sum, tc) => {
      return sum + (tc.classGroup.studentCount ?? 50)
    }, 0)
    if (task.taskClasses.length === 0) continue // fallback

    for (const slot of task.scheduleSlots) {
      if (slot.roomId == null) continue
      const room = roomMap.get(slot.roomId)
      if (!room) continue
      if (totalStudents > room.capacity) {
        // Check if already recorded for this task
        if (!hc4Tasks.some((h) => h.task.id === task.id)) {
          hc4Tasks.push({ task, studentCount: totalStudents, currentRoom: room, shortage: totalStudents - room.capacity })
        }
      }
    }
  }

  console.log(`## HC4 Tasks: ${hc4Tasks.length}\n`)

  // For each HC4 task, analyze candidate rooms
  const results: Array<{
    taskId: number
    courseName: string
    studentCount: number
    currentRoom: string
    currentCapacity: number
    shortage: number
    totalRooms: number
    capacityEnoughRooms: number
    freeAtAllSlots: number
    freeAtRequiredSlots: number
    rootCause: string
    blockingDetail: string
  }> = []

  for (const h of hc4Tasks) {
    const task = h.task
    const slots = task.scheduleSlots
    const studentCount = h.studentCount

    // All rooms with enough capacity
    const capacityEnough = rooms.filter((r) => r.capacity >= studentCount)

    // For each capacity-enough room, check if it's free at ALL required time slots
    const requiredSlots = slots.map((s) => `${s.dayOfWeek}|${s.slotIndex}`)
    let freeAtAllSlots = 0
    let freeAtRequiredSlots = 0

    const candidateDetails: string[] = []
    for (const room of capacityEnough) {
      const occ = roomOccupancy.get(room.id) ?? new Set()
      const occupiedAtRequired = requiredSlots.some((rs) => occ.has(rs))
      const occupiedAtAny = [...occ].length > 0

      if (!occupiedAtRequired) {
        freeAtRequiredSlots++
        if (room.id !== h.currentRoom?.id) {
          candidateDetails.push(`${room.name}(cap=${room.capacity},free)`)
        }
      }
      if (!occupiedAtAny) {
        freeAtAllSlots++
      }
    }

    let rootCause: string
    let blockingDetail: string

    if (capacityEnough.length === 0) {
      rootCause = 'NO_ROOM_LARGE_ENOUGH'
      blockingDetail = `No room with capacity >= ${studentCount}`
    } else if (freeAtRequiredSlots === 0) {
      rootCause = 'ROOM_LARGE_ENOUGH_BUT_TIME_OCCUPIED'
      blockingDetail = `${capacityEnough.length} rooms have capacity, but all occupied at required times`
    } else if (freeAtRequiredSlots > 0) {
      rootCause = 'ROOM_AVAILABLE_BUT_NOT_SELECTED'
      blockingDetail = `${freeAtRequiredSlots} rooms available: ${candidateDetails.slice(0, 5).join(', ')}`
    } else {
      rootCause = 'UNKNOWN_NEEDS_MORE_DIAGNOSIS'
      blockingDetail = `capacityEnough=${capacityEnough.length}, freeAtRequiredSlots=${freeAtRequiredSlots}`
    }

    results.push({
      taskId: task.id,
      courseName: task.course.name,
      studentCount,
      currentRoom: h.currentRoom?.name ?? '-',
      currentCapacity: h.currentRoom?.capacity ?? 0,
      shortage: h.shortage,
      totalRooms: rooms.length,
      capacityEnoughRooms: capacityEnough.length,
      freeAtAllSlots,
      freeAtRequiredSlots,
      rootCause,
      blockingDetail,
    })
  }

  // Output table
  console.log('## Per-Task Analysis\n')
  console.log('| taskId | courseName | students | currentRoom | cap | shortage | capEnough | freeAtRequired | rootCause |')
  console.log('| ---: | --- | ---: | --- | ---: | ---: | ---: | ---: | --- |')
  for (const r of results) {
    console.log(`| ${r.taskId} | ${r.courseName} | ${r.studentCount} | ${r.currentRoom} | ${r.currentCapacity} | ${r.shortage} | ${r.capacityEnoughRooms} | ${r.freeAtRequiredSlots} | ${r.rootCause} |`)
  }
  console.log()

  // Blocking details
  console.log('## Blocking Details\n')
  for (const r of results) {
    console.log(`- task ${r.taskId} (${r.courseName}): ${r.blockingDetail}`)
  }
  console.log()

  // Summary
  const summary = {
    total: results.length,
    NO_ROOM_LARGE_ENOUGH: results.filter((r) => r.rootCause === 'NO_ROOM_LARGE_ENOUGH').length,
    ROOM_AVAILABLE_BUT_NOT_SELECTED: results.filter((r) => r.rootCause === 'ROOM_AVAILABLE_BUT_NOT_SELECTED').length,
    ROOM_LARGE_ENOUGH_BUT_TIME_OCCUPIED: results.filter((r) => r.rootCause === 'ROOM_LARGE_ENOUGH_BUT_TIME_OCCUPIED').length,
    UNKNOWN: results.filter((r) => r.rootCause === 'UNKNOWN_NEEDS_MORE_DIAGNOSIS').length,
  }

  console.log('## Summary\n')
  console.log(`- total HC4 tasks: ${summary.total}`)
  console.log(`- NO_ROOM_LARGE_ENOUGH: ${summary.NO_ROOM_LARGE_ENOUGH}`)
  console.log(`- ROOM_AVAILABLE_BUT_NOT_SELECTED: ${summary.ROOM_AVAILABLE_BUT_NOT_SELECTED}`)
  console.log(`- ROOM_LARGE_ENOUGH_BUT_TIME_OCCUPIED: ${summary.ROOM_LARGE_ENOUGH_BUT_TIME_OCCUPIED}`)
  console.log(`- UNKNOWN: ${summary.UNKNOWN}`)
  console.log()

  // Room inventory
  const capDist: Record<string, number> = {}
  for (const r of rooms) {
    const range = r.capacity <= 50 ? '≤50' : r.capacity <= 80 ? '51-80' : r.capacity <= 100 ? '81-100' : '>100'
    capDist[range] = (capDist[range] || 0) + 1
  }
  console.log('## Room Capacity Inventory\n')
  for (const [range, count] of Object.entries(capDist)) {
    console.log(`- ${range}: ${count} rooms`)
  }
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
