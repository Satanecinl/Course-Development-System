/**
 * scripts/diagnose-secondary-room-runtime-filter-k34-a3e.ts
 *
 * K34-A3E: Read-only diagnostic.
 *
 * For each affected secondary room (10-104, 11-105), reports:
 *   - roomId
 *   - as primary schedule slots count
 *   - as additional schedule slots count
 *   - expected dashboard matched slots count (PRIMARY OR ADDITIONAL, deduped)
 *   - expected capacity maxAssignedStudentCount
 *   - expected capacity slotCount
 *   - expected capacity distinct course count
 *   - sample matched courses with composite room display
 *
 * Does NOT modify DB, does NOT modify files.
 */

import { PrismaClient } from '@prisma/client'

const TARGET_ROOM_NAMES = ['10-104', '11-105']

async function main() {
  const prisma = new PrismaClient()
  try {
    const rooms = await prisma.room.findMany({
      where: { name: { in: TARGET_ROOM_NAMES } },
    })
    if (rooms.length === 0) {
      console.log('No target rooms found in DB. Aborting.')
      return
    }

    for (const room of rooms) {
      console.log('─'.repeat(72))
      console.log(`Room ${room.name} (id=${room.id}) building=${room.building} capacity=${room.capacity}`)

      // As primary (roomId field is the primary)
      const asPrimaryCount = await prisma.scheduleSlot.count({
        where: { roomId: room.id },
      })

      // As additional (via ScheduleSlotAdditionalRoom)
      const asAdditionalRows = await prisma.scheduleSlotAdditionalRoom.findMany({
        where: { roomId: room.id },
        select: { scheduleSlotId: true },
      })
      const additionalSlotIds = new Set(asAdditionalRows.map((r) => r.scheduleSlotId))

      // Expected dashboard matched slots = primary ∪ additional (deduped by slotId)
      const matchedSlotIds = new Set<number>()
      // primary
      const primarySlots = await prisma.scheduleSlot.findMany({
        where: { roomId: room.id },
        select: { id: true },
      })
      for (const s of primarySlots) matchedSlotIds.add(s.id)
      for (const id of additionalSlotIds) matchedSlotIds.add(id)

      // Compute expected capacity stats
      const matchedSlots = await prisma.scheduleSlot.findMany({
        where: { id: { in: Array.from(matchedSlotIds) } },
        include: {
          room: { select: { name: true } },
          teachingTask: {
            include: {
              taskClasses: {
                include: { classGroup: { select: { studentCount: true, name: true } } },
              },
              course: { select: { name: true } },
              teacher: { select: { name: true } },
            },
          },
        },
      })
      // distinct courses per room
      const taskStudentCount = new Map<number, number>()
      const taskCourseName = new Map<number, string>()
      const taskTeacherName = new Map<number, string>()
      for (const s of matchedSlots) {
        if (taskStudentCount.has(s.teachingTaskId)) continue
        let total = 0
        for (const tc of s.teachingTask.taskClasses) {
          total += tc.classGroup.studentCount ?? 0
        }
        taskStudentCount.set(s.teachingTaskId, total)
        taskCourseName.set(s.teachingTaskId, s.teachingTask.course.name)
        taskTeacherName.set(s.teachingTaskId, s.teachingTask.teacher?.name ?? '?')
      }
      // For slot count: each slot contributes 1; maxAssignedStudentCount: per-slot max of task's student count
      let maxAssignedStudentCount = 0
      for (const s of matchedSlots) {
        const sc = taskStudentCount.get(s.teachingTaskId) ?? 0
        if (sc > maxAssignedStudentCount) maxAssignedStudentCount = sc
      }
      const courseCount = taskStudentCount.size

      console.log(`  as primary schedule slots: ${asPrimaryCount}`)
      console.log(`  as additional schedule slots: ${additionalSlotIds.size}`)
      console.log(`  expected dashboard matched slots (PRIMARY ∪ ADDITIONAL, dedup): ${matchedSlotIds.size}`)
      console.log(`  expected capacity maxAssignedStudentCount (per-slot max): ${maxAssignedStudentCount}`)
      console.log(`  expected capacity slotCount: ${matchedSlotIds.size}`)
      console.log(`  expected capacity distinct course count: ${courseCount}`)

      // Print sample matched courses — pick slots where this room is additional
      const sampleSlotIds = Array.from(additionalSlotIds).slice(0, 5)
      if (sampleSlotIds.length > 0) {
        const sampleSlots = await prisma.scheduleSlot.findMany({
          where: { id: { in: sampleSlotIds } },
          include: {
            room: { select: { name: true } },
            additionalRooms: { include: { room: { select: { name: true } } }, orderBy: { id: 'asc' } },
            teachingTask: {
              include: {
                course: { select: { name: true } },
                teacher: { select: { name: true } },
              },
            },
          },
        })
        console.log(`  sample matched courses (where this room is ADDITIONAL, up to 5):`)
        for (const s of sampleSlots) {
          const display = s.additionalRooms.length > 0
            ? s.room.name + ' 或 ' + s.additionalRooms.map((ar) => ar.room.name).join(' 或 ')
            : s.room.name
          console.log(
            `    - slot=${s.id} day=${s.dayOfWeek} period=${s.slotIndex}` +
            ` course=${s.teachingTask.course.name}` +
            ` teacher=${s.teachingTask.teacher?.name ?? '?'}` +
            ` display=${display}`,
          )
        }
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
