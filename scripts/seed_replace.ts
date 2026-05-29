#!/usr/bin/env tsx
/**
 * 将 2026 春季学期课程表中的工程应用技术学院课程替换入库
 * 流程：筛选 -> 删除旧 ScheduleItem -> 清理孤儿 -> 重新入库
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

interface JsonRecord {
  class_info: {
    class_name: string
    advisor_name?: string | null
    advisor_phone?: string | null
  }
  teacher: string | null
  course: string | null
  room: string | null
  day_of_week: number
  time_slot: string
  period_start: number
  period_end: number
  week_constraints: string | null
  week_start: number
  week_end: number
  week_type: string
}

const CO_CLASS_PATTERN = /[（(]与([^)）]+班)[)）]/

async function main() {
  const jsonPath = path.join(__dirname, 'semester_2026.json')
  if (!fs.existsSync(jsonPath)) {
    console.error(`Error: ${jsonPath} not found.`)
    process.exit(1)
  }

  const rawData: JsonRecord[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  console.log(`Loaded ${rawData.length} total records from semester_2026.json`)

  // 整个文件即为工程应用技术学院的课程，无需筛选
  const engRecords = rawData
  console.log(`Loaded ${engRecords.length} records for 工程应用技术学院`)

  // 显示所有班级
  const classNames = [...new Set(engRecords.map((r) => r.class_info.class_name))]
  console.log('Classes:')
  for (const name of classNames) {
    const count = engRecords.filter((r) => r.class_info.class_name === name).length
    console.log(`  ${name} (${count} records)`)
  }

  // =====================================================================
  // Step 1: 删除工程应用技术学院的旧 ScheduleItem
  // =====================================================================
  console.log('\n--- Step 1: Deleting old ScheduleItems for 工程应用技术学院 ---')

  // 找到工程应用技术学院的所有 Class
  const oldClasses = await prisma.class.findMany({
    where: { name: { contains: '工程应用技术' } },
    select: { id: true, name: true },
  })
  console.log(`Found ${oldClasses.length} old engineering classes in DB`)

  // 删除这些班级的 ScheduleItem
  const deleteResult = await prisma.scheduleItem.deleteMany({
    where: { classId: { in: oldClasses.map((c) => c.id) } },
  })
  console.log(`Deleted ${deleteResult.count} old ScheduleItems`)

  // =====================================================================
  // Step 2: 清理孤儿数据（不再被 ScheduleItem 引用的实体）
  // =====================================================================
  console.log('\n--- Step 2: Cleaning up orphan records ---')

  // 获取仍被引用的 ID
  const usedClassIds = new Set((await prisma.scheduleItem.findMany({ select: { classId: true } })).map((i) => i.classId))
  const usedTeacherIds = new Set((await prisma.scheduleItem.findMany({ select: { teacherId: true } })).map((i) => i.teacherId).filter(Boolean) as number[])
  const usedCourseIds = new Set((await prisma.scheduleItem.findMany({ select: { courseId: true } })).map((i) => i.courseId).filter(Boolean) as number[])
  const usedRoomIds = new Set((await prisma.scheduleItem.findMany({ select: { roomId: true } })).map((i) => i.roomId).filter(Boolean) as number[])

  // 删除不再被引用的 Class（工程应用技术学院）
  const orphanClasses = await prisma.class.findMany({
    where: { id: { notIn: [...usedClassIds] }, name: { contains: '工程应用技术' } },
  })
  if (orphanClasses.length > 0) {
    await prisma.class.deleteMany({
      where: { id: { in: orphanClasses.map((c) => c.id) } },
    })
    console.log(`Deleted ${orphanClasses.length} orphan classes`)
  }

  // 删除不再被引用的 Teacher
  const orphanTeachers = await prisma.teacher.findMany({
    where: { id: { notIn: [...usedTeacherIds] } },
  })
  if (orphanTeachers.length > 0) {
    await prisma.teacher.deleteMany({
      where: { id: { in: orphanTeachers.map((t) => t.id) } },
    })
    console.log(`Deleted ${orphanTeachers.length} orphan teachers`)
  }

  // 删除不再被引用的 Course
  const orphanCourses = await prisma.course.findMany({
    where: { id: { notIn: [...usedCourseIds] } },
  })
  if (orphanCourses.length > 0) {
    await prisma.course.deleteMany({
      where: { id: { in: orphanCourses.map((c) => c.id) } },
    })
    console.log(`Deleted ${orphanCourses.length} orphan courses`)
  }

  // 删除不再被引用的 Room
  const orphanRooms = await prisma.room.findMany({
    where: { id: { notIn: [...usedRoomIds] } },
  })
  if (orphanRooms.length > 0) {
    await prisma.room.deleteMany({
      where: { id: { in: orphanRooms.map((r) => r.id) } },
    })
    console.log(`Deleted ${orphanRooms.length} orphan rooms`)
  }

  // =====================================================================
  // Step 3: 重新入库工程应用技术学院的新数据
  // =====================================================================
  console.log('\n--- Step 3: Inserting new engineering records ---')

  // 确保默认学院存在
  const department = await prisma.department.upsert({
    where: { name: '工程应用技术学院' },
    update: {},
    create: { name: '工程应用技术学院' },
  })

  // 缓存
  const classCache = new Map<string, number>()
  const teacherCache = new Map<string, number>()
  const courseCache = new Map<string, number>()
  const roomCache = new Map<string, number>()

  for (let i = 0; i < engRecords.length; i++) {
    const record = engRecords[i]
    const className = record.class_info.class_name
    const teacherName = record.teacher
    const roomName = record.room
    let courseName = record.course ?? '未知课程'
    let remark: string | undefined = undefined

    // 提取合班信息
    const coClassMatch = courseName.match(CO_CLASS_PATTERN)
    if (coClassMatch) {
      const coClassName = coClassMatch[1].trim()
      remark = `与${coClassName}合班`
      courseName = courseName.replace(coClassMatch[0], '').trim()
    }

    // Class
    let classId: number
    const classKey = `${className}#${department.id}`
    if (classCache.has(classKey)) {
      classId = classCache.get(classKey)!
    } else {
      const cls = await prisma.class.upsert({
        where: { name_departmentId: { name: className, departmentId: department.id } },
        update: {
          advisorName: record.class_info.advisor_name ?? undefined,
          advisorPhone: record.class_info.advisor_phone ?? undefined,
        },
        create: {
          name: className,
          departmentId: department.id,
          advisorName: record.class_info.advisor_name,
          advisorPhone: record.class_info.advisor_phone,
        },
      })
      classId = cls.id
      classCache.set(classKey, classId)
    }

    // Teacher
    let teacherId: number | null = null
    if (teacherName) {
      const teacherKey = `${teacherName}#${department.id}`
      if (teacherCache.has(teacherKey)) {
        teacherId = teacherCache.get(teacherKey)!
      } else {
        const teacher = await prisma.teacher.upsert({
          where: { name_departmentId: { name: teacherName, departmentId: department.id } },
          update: {},
          create: { name: teacherName, departmentId: department.id },
        })
        teacherId = teacher.id
        teacherCache.set(teacherKey, teacherId)
      }
    }

    // Course
    let courseId: number | null = null
    if (courseName) {
      const courseCode = `${courseName}#${department.id}`
      if (courseCache.has(courseCode)) {
        courseId = courseCache.get(courseCode)!
      } else {
        const course = await prisma.course.upsert({
          where: { code: courseCode },
          update: { remark: remark ?? undefined },
          create: {
            name: courseName,
            code: courseCode,
            remark,
            departmentId: department.id,
          },
        })
        courseId = course.id
        courseCache.set(courseCode, courseId)
      }
    }

    // Room
    let roomId: number | null = null
    if (roomName) {
      if (roomCache.has(roomName)) {
        roomId = roomCache.get(roomName)!
      } else {
        const room = await prisma.room.upsert({
          where: { name: roomName },
          update: {},
          create: { name: roomName },
        })
        roomId = room.id
        roomCache.set(roomName, roomId)
      }
    }

    // ScheduleItem
    await prisma.scheduleItem.create({
      data: {
        classId,
        teacherId,
        courseId,
        roomId,
        dayOfWeek: record.day_of_week,
        periodStart: record.period_start,
        periodEnd: record.period_end,
        weekStart: record.week_start,
        weekEnd: record.week_end,
        weekType: record.week_type,
      },
    })

    if ((i + 1) % 50 === 0) {
      console.log(`  Processed ${i + 1}/${engRecords.length}...`)
    }
  }

  // =====================================================================
  // Final stats
  // =====================================================================
  console.log('\n========== 替换完成 ==========')
  const counts = await Promise.all([
    prisma.department.count(),
    prisma.class.count(),
    prisma.teacher.count(),
    prisma.course.count(),
    prisma.room.count(),
    prisma.scheduleItem.count(),
  ])

  console.log(`Department:   ${counts[0]}`)
  console.log(`Class:        ${counts[1]}`)
  console.log(`Teacher:      ${counts[2]}`)
  console.log(`Course:       ${counts[3]}`)
  console.log(`Room:         ${counts[4]}`)
  console.log(`ScheduleItem: ${counts[5]}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
