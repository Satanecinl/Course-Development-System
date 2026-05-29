/**
 * 导出 ScheduleAdjustment 快照，用于 G0-FIX-B 审计留档
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  const adjustments = await prisma.scheduleAdjustment.findMany({
    include: {
      originalSlot: {
        include: {
          teachingTask: {
            include: {
              course: true,
              teacher: true,
              taskClasses: {
                include: { classGroup: true },
              },
            },
          },
          room: true,
        },
      },
      newRoom: true,
    },
  })

  const snapshot = {
    exportedAt: new Date().toISOString(),
    count: adjustments.length,
    adjustments: adjustments.map((a) => ({
      id: a.id,
      type: a.type,
      status: a.status,
      week: a.week,
      targetWeek: a.targetWeek,
      originalSlotId: a.originalSlotId,
      originalSlot: a.originalSlot
        ? {
            dayOfWeek: a.originalSlot.dayOfWeek,
            slotIndex: a.originalSlot.slotIndex,
            courseName: a.originalSlot.teachingTask?.course?.name ?? null,
            teacherName: a.originalSlot.teachingTask?.teacher?.name ?? null,
            classNames: a.originalSlot.teachingTask?.taskClasses.map((tc) => tc.classGroup.name) ?? [],
            roomName: a.originalSlot.room?.name ?? null,
          }
        : null,
      newDayOfWeek: a.newDayOfWeek,
      newSlotIndex: a.newSlotIndex,
      newRoomId: a.newRoomId,
      newRoomName: a.newRoom?.name ?? null,
      reason: a.reason,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
  }

  const outDir = path.resolve(__dirname, '..', 'prisma', 'backups')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = path.join(outDir, `schedule-adjustments-before-g0fixb-${timestamp}.json`)
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf-8')

  console.log(`导出完成: ${outPath}`)
  console.log(`总记录数: ${snapshot.count}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
