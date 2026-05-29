import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const slots = await prisma.scheduleSlot.findMany({
    where: { id: { in: [34, 209] } },
    include: {
      teachingTask: {
        include: {
          course: true,
          teacher: true,
          taskClasses: { include: { classGroup: true } },
        },
      },
      room: true,
    },
  })
  for (const s of slots) {
    console.log('slotId:', s.id)
    console.log('  teachingTaskId:', s.teachingTaskId)
    console.log('  dayOfWeek:', s.dayOfWeek, 'slotIndex:', s.slotIndex)
    console.log('  room:', s.room?.name ?? '-')
    console.log('  course:', s.teachingTask.course.name)
    console.log('  teacher:', s.teachingTask.teacher?.name ?? '-')
    console.log('  week:', s.teachingTask.weekType, s.teachingTask.startWeek, s.teachingTask.endWeek)
    console.log('  remark:', s.teachingTask.remark ?? '-')
    console.log('  classes:', s.teachingTask.taskClasses.map(tc => tc.classGroup.name).join(', '))
    console.log('')
  }

  // 检查所有重复组
  const dups = await prisma.$queryRaw<Array<{
    courseId: number
    classGroupId: number
    teacherId: number | null
    roomId: number | null
    dayOfWeek: number
    slotIndex: number
    weekType: string
    startWeek: number
    endWeek: number
    cnt: number
    slotIds: string
    taskIds: string
  }>>`
    SELECT
      tt.courseId,
      ttc.classGroupId,
      tt.teacherId,
      ss.roomId,
      ss.dayOfWeek,
      ss.slotIndex,
      tt.weekType,
      tt.startWeek,
      tt.endWeek,
      COUNT(*) as cnt,
      GROUP_CONCAT(ss.id, ',') as slotIds,
      GROUP_CONCAT(tt.id, ',') as taskIds
    FROM ScheduleSlot ss
    JOIN TeachingTask tt ON ss.teachingTaskId = tt.id
    JOIN TeachingTaskClass ttc ON ttc.teachingTaskId = tt.id
    GROUP BY tt.courseId, ttc.classGroupId, tt.teacherId, ss.roomId, ss.dayOfWeek, ss.slotIndex, tt.weekType, tt.startWeek, tt.endWeek
    HAVING COUNT(*) > 1
  `

  console.log(`\n重复组数: ${dups.length}`)
  for (const d of dups) {
    const course = await prisma.course.findUnique({ where: { id: d.courseId } })
    const cls = await prisma.classGroup.findUnique({ where: { id: d.classGroupId } })
    console.log(`\n  course="${course?.name}" class="${cls?.name}"`)
    console.log(`    slotIds=[${d.slotIds}] taskIds=[${d.taskIds}]`)
  }

  await prisma.$disconnect()
}

main()
