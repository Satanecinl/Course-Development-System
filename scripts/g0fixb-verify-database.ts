/**
 * G0-FIX-B: 重建后数据库验收脚本
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ILLEGAL_COURSES = [
  '周六', '周日', '周一', '周二', '周三', '周四', '周五',
  '一', '二', '三', '四', '五', '六', '日',
  '1、2', '3、4', '5、6', '7、8', '9、10', '9.10',
  '1-2节', '3-4节', '5-6节', '7-8节', '9-10节',
  '专业年级班', '人数', '教室',
]

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('              G0-FIX-B 数据库验收')
  console.log('═══════════════════════════════════════════════════════════════')

  let allPassed = true

  // ── 1. 非法课程检查 ──
  console.log('\n--- 1. 非法课程检查 ---')
  const illegalFound: string[] = []
  for (const name of ILLEGAL_COURSES) {
    const course = await prisma.course.findUnique({ where: { name } })
    if (course) illegalFound.push(name)
  }
  if (illegalFound.length === 0) {
    console.log('✅ 非法课程: 0 个')
  } else {
    console.log(`❌ 非法课程: ${illegalFound.length} 个 — [${illegalFound.join(', ')}]`)
    allPassed = false
  }

  // ── 2. 重复 ScheduleSlot 检查 ──
  console.log('\n--- 2. 重复 ScheduleSlot 检查 ---')
  const duplicates = await prisma.$queryRaw<Array<{
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
      GROUP_CONCAT(ss.id, ',') as slotIds
    FROM ScheduleSlot ss
    JOIN TeachingTask tt ON ss.teachingTaskId = tt.id
    JOIN TeachingTaskClass ttc ON ttc.teachingTaskId = tt.id
    GROUP BY tt.courseId, ttc.classGroupId, tt.teacherId, ss.roomId, ss.dayOfWeek, ss.slotIndex, tt.weekType, tt.startWeek, tt.endWeek
    HAVING COUNT(*) > 1
  `

  if (duplicates.length === 0) {
    console.log('✅ 重复 ScheduleSlot: 0 组')
  } else {
    console.log(`❌ 重复 ScheduleSlot: ${duplicates.length} 组`)
    for (const d of duplicates) {
      const course = await prisma.course.findUnique({ where: { id: d.courseId } })
      const cls = await prisma.classGroup.findUnique({ where: { id: d.classGroupId } })
      console.log(`    course="${course?.name}" class="${cls?.name}" cnt=${d.cnt} slotIds=[${d.slotIds}]`)
    }
    allPassed = false
  }

  // ── 3. 汽车制造相关班级重点验收 ──
  console.log('\n--- 3. 汽车制造相关班级重点验收 ---')
  const targetClasses = [
    '2024级汽车制造与试验技术2班',
    '2025级两年制汽车制造与试验技术',
    '2024级汽车制造与试验技术1班',
  ]
  const targetCourses = [
    '底盘电控系统集成与性能验证',
    '汽车智能网联系统集成技术',
    '新能源汽车动力系统构造与测试',
    '汽车营销（非学徒制）',
    '企业学徒实训（学徒制）',
    '汽车保险与理赔（非学徒制）',
  ]

  for (const className of targetClasses) {
    console.log(`\n  📋 ${className}`)
    const cg = await prisma.classGroup.findFirst({ where: { name: className } })
    if (!cg) {
      console.log(`    [SKIP] 班级不存在`)
      continue
    }

    const ttcs = await prisma.teachingTaskClass.findMany({
      where: { classGroupId: cg.id },
      include: {
        teachingTask: {
          include: {
            course: true,
            teacher: true,
            scheduleSlots: { include: { room: true } },
          },
        },
      },
    })

    // 检查重复 slot
    const slotSignatures = new Map<string, number>()
    for (const ttc of ttcs) {
      for (const slot of ttc.teachingTask.scheduleSlots) {
        const sig = `${ttc.teachingTask.course.name}|${ttc.teachingTask.teacher?.name ?? '-'}|${slot.room?.name ?? '-'}|${slot.dayOfWeek}|${slot.slotIndex}|${ttc.teachingTask.weekType}|${ttc.teachingTask.startWeek}-${ttc.teachingTask.endWeek}`
        slotSignatures.set(sig, (slotSignatures.get(sig) ?? 0) + 1)
      }
    }

    const dups = [...slotSignatures.entries()].filter(([_, cnt]) => cnt > 1)
    if (dups.length === 0) {
      console.log(`    ✅ 无重复 slot`)
    } else {
      console.log(`    ❌ 发现 ${dups.length} 个重复 slot:`)
      for (const [sig, cnt] of dups) {
        console.log(`       ${sig} (x${cnt})`)
      }
      allPassed = false
    }

    // 检查目标课程
    for (const courseName of targetCourses) {
      const matches = ttcs.filter((ttc) => ttc.teachingTask.course.name === courseName)
      if (matches.length > 0) {
        const slotCount = matches.reduce((sum, ttc) => sum + ttc.teachingTask.scheduleSlots.length, 0)
        console.log(`    ✅ ${courseName}: ${matches.length} 个 task, ${slotCount} 个 slot`)
      }
    }
  }

  // ── 4. 合班检查 ──
  console.log('\n--- 4. 合班检查 ---')
  const tasksWithMultipleClasses = await prisma.teachingTask.findMany({
    where: { taskClasses: { some: {} } },
    include: {
      taskClasses: { include: { classGroup: true } },
      course: true,
    },
  })
  const merged = tasksWithMultipleClasses.filter((t) => t.taskClasses.length > 1)
  console.log(`  合班任务数: ${merged.length}`)
  if (merged.length > 0) {
    for (const t of merged.slice(0, 5)) {
      const classNames = t.taskClasses.map((tc) => tc.classGroup.name).join(', ')
      console.log(`    - ${t.course.name}: [${classNames}]`)
    }
  }

  // ── 5. 总体统计 ──
  console.log('\n--- 5. 总体统计 ---')
  const stats = {
    classGroup: await prisma.classGroup.count(),
    teacher: await prisma.teacher.count(),
    course: await prisma.course.count(),
    room: await prisma.room.count(),
    teachingTask: await prisma.teachingTask.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
    importBatch: await prisma.importBatch.count(),
  }
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k}: ${v}`)
  }

  // ── 6. 结论 ──
  console.log('\n═══════════════════════════════════════════════════════════════')
  if (allPassed) {
    console.log('  ✅ G0-FIX-B 数据库验收全部通过')
  } else {
    console.log('  ❌ G0-FIX-B 数据库验收未通过')
  }
  console.log('═══════════════════════════════════════════════════════════════')

  await prisma.$disconnect()
  if (!allPassed) process.exit(1)
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
