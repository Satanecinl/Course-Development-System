#!/usr/bin/env tsx
/**
 * 冲突检测 API 测试脚本
 *
 * 模拟将一个课程移动到已被占用的时间槽，验证冲突检测逻辑。
 */

import { PrismaClient } from '@prisma/client'
import { checkScheduleConflict } from '../src/lib/conflict-check'
import { checkWeekOverlap, expandWeeks, WeekConstraint } from '../src/lib/conflict'

const prisma = new PrismaClient()

async function main() {
  console.log('========== 周次展开工具测试 ==========\n')

  // 测试 expandWeeks
  const allWeeks: WeekConstraint = { start: 1, end: 16, type: 'ALL' }
  const oddWeeks: WeekConstraint = { start: 1, end: 16, type: 'ODD' }
  const evenWeeks: WeekConstraint = { start: 1, end: 16, type: 'EVEN' }
  const firstHalf: WeekConstraint = { start: 1, end: 8, type: 'FIRST_HALF' }
  const secondHalf: WeekConstraint = { start: 9, end: 16, type: 'SECOND_HALF' }
  const custom: WeekConstraint = { start: 1, end: 12, type: 'CUSTOM' }

  console.log('ALL (1-16):', [...expandWeeks(allWeeks)].join(','))
  console.log('ODD (1-16):', [...expandWeeks(oddWeeks)].join(','))
  console.log('EVEN (1-16):', [...expandWeeks(evenWeeks)].join(','))
  console.log('FIRST_HALF:', [...expandWeeks(firstHalf)].join(','))
  console.log('SECOND_HALF:', [...expandWeeks(secondHalf)].join(','))
  console.log('CUSTOM (1-12):', [...expandWeeks(custom)].join(','))

  // 测试 checkWeekOverlap
  console.log('\n--- 重叠检测 ---')
  console.log('ALL vs FIRST_HALF:', checkWeekOverlap(allWeeks, firstHalf)) // true
  console.log('ODD vs EVEN:', checkWeekOverlap(oddWeeks, evenWeeks)) // false
  console.log('ODD vs ALL:', checkWeekOverlap(oddWeeks, allWeeks)) // true
  console.log('FIRST_HALF vs SECOND_HALF:', checkWeekOverlap(firstHalf, secondHalf)) // false
  console.log('CUSTOM(1-12) vs SECOND_HALF(9-16):', checkWeekOverlap(custom, secondHalf)) // true (9-12重叠)

  console.log('\n========== 准备测试数据 ==========\n')

  // 确保 capacity 已设置
  const rooms = await prisma.room.findMany()
  for (const room of rooms) {
    if (!room.capacity) {
      await prisma.room.update({ where: { id: room.id }, data: { capacity: 60 } })
    }
  }

  const classes = await prisma.class.findMany()
  for (const cls of classes) {
    if (!cls.capacity) {
      await prisma.class.update({ where: { id: cls.id }, data: { capacity: 40 } })
    }
  }

  // 找到所有 ScheduleItem，按时间分组
  const allItems = await prisma.scheduleItem.findMany({
    include: { class: true, teacher: true, course: true, room: true },
  })

  console.log(`数据库中共有 ${allItems.length} 条排课记录`)

  // =====================================================================
  // 场景 1：找一个课程，尝试移动到同一个时间 + 同一个教室（应触发教室冲突）
  // =====================================================================
  console.log('\n========== 场景 1：教室冲突 ==========\n')

  // 找到同一时间段有多个课程占用的教室
  const roomTimeMap = new Map<string, typeof allItems>()
  for (const item of allItems) {
    const key = `${item.roomId}-${item.dayOfWeek}-${item.periodStart},${item.periodEnd}`
    if (!roomTimeMap.has(key)) roomTimeMap.set(key, [])
    roomTimeMap.get(key)!.push(item)
  }

  let scenario1Done = false
  for (const [key, items] of roomTimeMap) {
    if (items.length >= 2 && checkWeekOverlap(
      { start: items[0].weekStart, end: items[0].weekEnd, type: items[0].weekType as any },
      { start: items[1].weekStart, end: items[1].weekEnd, type: items[1].weekType as any }
    )) {
      const itemA = items[0]
      const itemB = items[1]

      console.log(`找到同一教室时间段冲突：`)
      console.log(`  课程A: ${itemA.class.name} | ${itemA.course?.name} | 周${itemA.dayOfWeek} ${itemA.periodStart}-${itemA.periodEnd}节 | ${itemA.weekType}`)
      console.log(`  课程B: ${itemB.class.name} | ${itemB.course?.name} | 周${itemB.dayOfWeek} ${itemB.periodStart}-${itemB.periodEnd}节 | ${itemB.weekType}`)

      // 模拟将课程A移动到课程B的时间+教室（已经是同一个，但测试逻辑）
      const result = await checkScheduleConflict({
        scheduleItemId: itemA.id,
        targetDayOfWeek: itemB.dayOfWeek,
        targetTimeSlot: `${itemB.periodStart},${itemB.periodEnd}`,
        targetRoomId: itemB.roomId!,
      })

      console.log(`\n冲突检测结果: ${result.hasConflict ? '❌ 有冲突' : '✅ 无冲突'}`)
      for (const c of result.conflicts) {
        console.log(`  → ${c}`)
      }

      scenario1Done = true
      break
    }
  }

  if (!scenario1Done) {
    console.log('未找到天然的教室冲突场景，构造一个...')
    // 手动构造：取 item1，用 item2 的时间+教室
    const item1 = allItems[0]
    const item2 = allItems.find(i =>
      i.id !== item1.id &&
      i.roomId &&
      checkWeekOverlap(
        { start: item1.weekStart, end: item1.weekEnd, type: item1.weekType as any },
        { start: i.weekStart, end: i.weekEnd, type: i.weekType as any }
      )
    )

    if (item2) {
      const result = await checkScheduleConflict({
        scheduleItemId: item1.id,
        targetDayOfWeek: item2.dayOfWeek,
        targetTimeSlot: `${item2.periodStart},${item2.periodEnd}`,
        targetRoomId: item2.roomId!,
      })
      console.log(`\n冲突检测结果: ${result.hasConflict ? '❌ 有冲突' : '✅ 无冲突'}`)
      for (const c of result.conflicts) {
        console.log(`  → ${c}`)
      }
    }
  }

  // =====================================================================
  // 场景 2：教师冲突（找一个教师，看他在别的时间段是否有课，然后模拟移动到那个时间）
  // =====================================================================
  console.log('\n========== 场景 2：教师冲突 ==========\n')

  const teacherItems = allItems.filter(i => i.teacherId)
  let scenario2Done = false

  for (const itemA of teacherItems) {
    const itemB = teacherItems.find(i =>
      i.id !== itemA.id &&
      i.teacherId === itemA.teacherId &&
      (i.dayOfWeek !== itemA.dayOfWeek || i.periodStart !== itemA.periodStart) &&
      checkWeekOverlap(
        { start: itemA.weekStart, end: itemA.weekEnd, type: itemA.weekType as any },
        { start: i.weekStart, end: i.weekEnd, type: i.weekType as any }
      )
    )

    if (itemB) {
      console.log(`找到教师跨时间段冲突：`)
      console.log(`  教师: ${itemA.teacher?.name}`)
      console.log(`  课程A: ${itemA.class.name} | ${itemA.course?.name} | 周${itemA.dayOfWeek} ${itemA.periodStart}-${itemA.periodEnd}节`)
      console.log(`  课程B: ${itemB.class.name} | ${itemB.course?.name} | 周${itemB.dayOfWeek} ${itemB.periodStart}-${itemB.periodEnd}节`)

      const result = await checkScheduleConflict({
        scheduleItemId: itemA.id,
        targetDayOfWeek: itemB.dayOfWeek,
        targetTimeSlot: `${itemB.periodStart},${itemB.periodEnd}`,
        targetRoomId: itemB.roomId!,
      })

      console.log(`\n冲突检测结果: ${result.hasConflict ? '❌ 有冲突' : '✅ 无冲突'}`)
      for (const c of result.conflicts) {
        console.log(`  → ${c}`)
      }

      scenario2Done = true
      break
    }
  }

  if (!scenario2Done) {
    console.log('未找到天然的教师冲突场景（Mock数据中教师重复较少）')
  }

  // =====================================================================
  // 场景 3：班级冲突
  // =====================================================================
  console.log('\n========== 场景 3：班级冲突 ==========\n')

  let scenario3Done = false
  for (const itemA of allItems) {
    const itemB = allItems.find(i =>
      i.id !== itemA.id &&
      i.classId === itemA.classId &&
      (i.dayOfWeek !== itemA.dayOfWeek || i.periodStart !== itemA.periodStart) &&
      checkWeekOverlap(
        { start: itemA.weekStart, end: itemA.weekEnd, type: itemA.weekType as any },
        { start: i.weekStart, end: i.weekEnd, type: i.weekType as any }
      )
    )

    if (itemB) {
      console.log(`找到班级跨时间段冲突：`)
      console.log(`  班级: ${itemA.class.name}`)
      console.log(`  课程A: ${itemA.course?.name} | 周${itemA.dayOfWeek} ${itemA.periodStart}-${itemA.periodEnd}节`)
      console.log(`  课程B: ${itemB.course?.name} | 周${itemB.dayOfWeek} ${itemB.periodStart}-${itemB.periodEnd}节`)

      const result = await checkScheduleConflict({
        scheduleItemId: itemA.id,
        targetDayOfWeek: itemB.dayOfWeek,
        targetTimeSlot: `${itemB.periodStart},${itemB.periodEnd}`,
        targetRoomId: itemB.roomId!,
      })

      console.log(`\n冲突检测结果: ${result.hasConflict ? '❌ 有冲突' : '✅ 无冲突'}`)
      for (const c of result.conflicts) {
        console.log(`  → ${c}`)
      }

      scenario3Done = true
      break
    }
  }

  if (!scenario3Done) {
    console.log('未找到天然的班级冲突场景')
  }

  // =====================================================================
  // 场景 4：容量冲突（将大班级移动到小教室）
  // =====================================================================
  console.log('\n========== 场景 4：容量冲突 ==========\n')

  // 临时将某个教室容量设为较小值，以触发容量冲突
  const testRoom = await prisma.room.findFirst()
  if (testRoom) {
    await prisma.room.update({
      where: { id: testRoom.id },
      data: { capacity: 20 } // 设为 20，小于班级默认 40
    })

    const largeClass = await prisma.class.findFirst({ orderBy: { capacity: 'desc' } })
    const smallRoom = await prisma.room.findUnique({ where: { id: testRoom.id } })

    if (largeClass && smallRoom && largeClass.capacity && smallRoom.capacity && largeClass.capacity > smallRoom.capacity) {
      const item = allItems.find(i => i.classId === largeClass.id)
      if (item) {
        console.log(`构造容量冲突场景：`)
        console.log(`  班级: ${largeClass.name} (${largeClass.capacity}人)`)
        console.log(`  目标教室: ${smallRoom.name} (${smallRoom.capacity}人)`)

        const result = await checkScheduleConflict({
          scheduleItemId: item.id,
          targetDayOfWeek: item.dayOfWeek,
          targetTimeSlot: `${item.periodStart},${item.periodEnd}`,
          targetRoomId: smallRoom.id,
        })

        console.log(`\n冲突检测结果: ${result.hasConflict ? '❌ 有冲突' : '✅ 无冲突'}`)
        for (const c of result.conflicts) {
          console.log(`  → ${c}`)
        }
      }
    }

    // 恢复容量
    await prisma.room.update({
      where: { id: testRoom.id },
      data: { capacity: 60 }
    })
  }

  // =====================================================================
  // 场景 5：周次不重叠（应无冲突）
  // =====================================================================
  console.log('\n========== 场景 5：周次不重叠（应无冲突）==========\n')

  // 找一个前半周课程，尝试移动到后半周课程的时间
  const firstHalfItem = allItems.find(i => i.weekType === 'FIRST_HALF')
  const secondHalfItem = allItems.find(i =>
    i.weekType === 'SECOND_HALF' &&
    i.roomId &&
    i.id !== firstHalfItem?.id
  )

  if (firstHalfItem && secondHalfItem) {
    console.log(`测试周次不重叠场景：`)
    console.log(`  课程A: ${firstHalfItem.class.name} | ${firstHalfItem.course?.name} | 前八周`)
    console.log(`  课程B: ${secondHalfItem.class.name} | ${secondHalfItem.course?.name} | 后八周`)
    console.log(`  模拟将课程A 移动到 课程B 的时间+教室`)

    const overlap = checkWeekOverlap(
      { start: firstHalfItem.weekStart, end: firstHalfItem.weekEnd, type: firstHalfItem.weekType as any },
      { start: secondHalfItem.weekStart, end: secondHalfItem.weekEnd, type: secondHalfItem.weekType as any }
    )
    console.log(`  周次重叠检测: ${overlap ? '有重叠' : '无重叠'}`)

    const result = await checkScheduleConflict({
      scheduleItemId: firstHalfItem.id,
      targetDayOfWeek: secondHalfItem.dayOfWeek,
      targetTimeSlot: `${secondHalfItem.periodStart},${secondHalfItem.periodEnd}`,
      targetRoomId: secondHalfItem.roomId!,
    })

    console.log(`\n冲突检测结果: ${result.hasConflict ? '❌ 有冲突' : '✅ 无冲突'}`)
    for (const c of result.conflicts) {
      console.log(`  → ${c}`)
    }
  }

  console.log('\n========== 测试完成 ==========\n')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
