import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { parseRemarkKeywords, findMergedClassNames, buildEventKey, mapTimeSlotToIndex } from '../src/lib/import/importer'
import type { ImportScheduleRecord } from '../src/types/import'

const prisma = new PrismaClient()

const TARGET_CLASS = '2024级钢铁智能冶金技术1班（高本贯通）'
const ABNORMAL_COURSES = [
  '机械制图', '金属材料与热处理', '传感器与检测技术', '电子技术',
  '林草环境', '无人机应用技术', '高等数学', '中华优秀传统文化',
]

interface SuspiciousCandidate {
  teachingTaskId: number
  classGroupId: number
  classGroupName: string
  courseName: string
  teacherName: string
  roomName: string
  weekType: string
  startWeek: number
  endWeek: number
  dayOfWeek: number
  periodStart: number
  periodEnd: number
  slotIndex: number
  reason: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

async function main() {
  console.log('# Audit Cleanup Candidates\n')

  // ── 1. 读取 batch #1 JSON ──
  const batchId = 1
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { id: true, filename: true, parsedJsonPath: true, recordCount: true },
  })
  if (!batch || !batch.parsedJsonPath) {
    console.error('ImportBatch 1 not found or no parsedJsonPath')
    await prisma.$disconnect()
    process.exit(1)
  }

  const jsonPath = join(process.cwd(), batch.parsedJsonPath)
  const records: ImportScheduleRecord[] = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  const batchClassNames = new Set<string>()
  for (const r of records) {
    const cn = r.class_info?.class_name
    if (cn) batchClassNames.add(cn)
  }

  console.log('## Input')
  console.log(`- batchJsonPath: ${batch.parsedJsonPath}`)
  console.log(`- targetClassName: ${TARGET_CLASS}`)
  console.log(`- batchClassCount: ${batchClassNames.size}`)
  console.log(`- batchRecordCount: ${records.length}`)
  console.log()

  // ── 2. 构建 expected：复用修复后的 importer 逻辑 ──
  // 步骤 2a: eventKey 聚合（与 prepareRecords 一致）
  const eventKeyToClassNames = new Map<string, Set<string>>()
  const allClasses = [...batchClassNames].map((n) => ({ name: n }))
  const mergeWarnings: string[] = []

  for (const r of records) {
    const ek = buildEventKey(r)
    let set = eventKeyToClassNames.get(ek)
    if (!set) { set = new Set(); eventKeyToClassNames.set(ek, set) }
    set.add(r.class_info?.class_name ?? '')
    if (r.remark) {
      const keywords = parseRemarkKeywords(r.remark)
      if (keywords.length > 0) {
        const merged = await findMergedClassNames(keywords, r.class_info?.class_name ?? '', allClasses, mergeWarnings)
        for (const m of merged) set.add(m)
      }
    }
  }

  // 步骤 2b: taskKey 聚合（与 prepareRecords 一致）
  const taskKeyToClassNames = new Map<string, Set<string>>()
  const taskKeyToRecords = new Map<string, ImportScheduleRecord[]>()

  for (const r of records) {
    const ek = buildEventKey(r)
    const classGroupSet = eventKeyToClassNames.get(ek)
    const canonicalSet = classGroupSet
      ? [...classGroupSet].sort().join('|')
      : (r.class_info?.class_name ?? '')
    const taskKey = [
      r.course ?? '', r.teacher ?? '**NULL_TEACHER**',
      r.week_type, r.week_start, r.week_end, canonicalSet,
    ].join('|')

    if (!taskKeyToClassNames.has(taskKey)) {
      taskKeyToClassNames.set(taskKey, new Set())
      taskKeyToRecords.set(taskKey, [])
    }
    taskKeyToClassNames.get(taskKey)!.add(r.class_info?.class_name ?? '')
    taskKeyToRecords.get(taskKey)!.push(r)
  }

  // ── 3. 读取 actual：只读 Prisma 查询 ──
  const actualTasks = await prisma.teachingTask.findMany({
    include: {
      course: { select: { name: true } },
      teacher: { select: { name: true } },
      taskClasses: { include: { classGroup: { select: { name: true } } } },
      scheduleSlots: { include: { room: { select: { name: true } } } },
    },
  })

  const actualClassGroups = await prisma.classGroup.findMany({ select: { id: true, name: true } })
  const classGroupMapByName = new Map(actualClassGroups.map((cg) => [cg.name, cg.id]))

  // ── 4. expected vs actual 比较 ──
  const suspiciousLinks: SuspiciousCandidate[] = []
  const affectedTaskIds = new Set<number>()
  const affectedClassNames = new Set<string>()
  const affectedCourseNames = new Set<string>()

  // 步骤 1：为每个 JSON taskKey 找到对应的 actual TeachingTask
  // 匹配条件：同 course + teacher + weekType + startWeek + endWeek
  // 一个 actual task 可能对应多个 JSON taskKeys（不同 eventKey 聚合导致不同 canonical class set）
  const actualTaskToExpectedClasses = new Map<number, Set<string>>()

  for (const [taskKey, expectedClassNames] of taskKeyToClassNames) {
    const parts = taskKey.split('|')
    const courseName = parts[0]
    const teacherName = parts[1] === '**NULL_TEACHER**' ? null : parts[1]
    const weekType = parts[2]
    const startWeek = parseInt(parts[3], 10)
    const endWeek = parseInt(parts[4], 10)

    const candidateTasks = actualTasks.filter((t) =>
      t.course.name === courseName &&
      (teacherName === null ? t.teacherId === null : t.teacher?.name === teacherName) &&
      t.weekType === weekType &&
      t.startWeek === startWeek &&
      t.endWeek === endWeek,
    )

    if (candidateTasks.length === 0) continue

    // 如果有多个 candidate，选择 class set 与 expected 重叠最多的
    let matchedTask: typeof candidateTasks[number] | null = null
    let bestOverlap = -1
    for (const task of candidateTasks) {
      const actualClassSet = new Set(task.taskClasses.map((tc) => tc.classGroup.name))
      let overlap = 0
      for (const cn of expectedClassNames) {
        if (actualClassSet.has(cn)) overlap++
      }
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        matchedTask = task
      }
    }

    if (!matchedTask) continue

    // 将 expected class names 添加到该 actual task 的 union set 中
    if (!actualTaskToExpectedClasses.has(matchedTask.id)) {
      actualTaskToExpectedClasses.set(matchedTask.id, new Set())
    }
    for (const cn of expectedClassNames) {
      actualTaskToExpectedClasses.get(matchedTask.id)!.add(cn)
    }
  }

  // 步骤 2：对每个 actual task，比较 union(expected) vs actual
  for (const [taskId, unionExpectedClasses] of actualTaskToExpectedClasses) {
    const task = actualTasks.find((t) => t.id === taskId)
    if (!task) continue

    // 污染：actual 中有但 expected 中无
    for (const tc of task.taskClasses) {
      if (!unionExpectedClasses.has(tc.classGroup.name)) {
        const slots = task.scheduleSlots
        const roomName = slots.length > 0 ? (slots[0].room?.name ?? '-') : '-'
        const dayOfWeek = slots.length > 0 ? slots[0].dayOfWeek : 0
        const slotIndex = slots.length > 0 ? slots[0].slotIndex : 0

        suspiciousLinks.push({
          teachingTaskId: task.id,
          classGroupId: tc.classGroupId,
          classGroupName: tc.classGroup.name,
          courseName: task.course.name,
          teacherName: task.teacher?.name ?? '-',
          roomName,
          weekType: task.weekType,
          startWeek: task.startWeek,
          endWeek: task.endWeek,
          dayOfWeek,
          periodStart: 0,
          periodEnd: 0,
          slotIndex,
          reason: 'ACTUAL_NOT_IN_EXPECTED_FOR_CLASS',
          confidence: 'HIGH',
        })
        affectedTaskIds.add(task.id)
        affectedClassNames.add(tc.classGroup.name)
        affectedCourseNames.add(task.course.name)
      }
    }
  }

  // 去重：同一个 teachingTaskId + classGroupId 只保留一条
  const seen = new Set<string>()
  const dedupedLinks: SuspiciousCandidate[] = []
  for (const l of suspiciousLinks) {
    const key = `${l.teachingTaskId}|${l.classGroupId}`
    if (!seen.has(key)) {
      seen.add(key)
      dedupedLinks.push(l)
    }
  }
  suspiciousLinks.length = 0
  suspiciousLinks.push(...dedupedLinks)

  // ── 5. 目标班级专项 ──
  const targetTasks = actualTasks.filter((t) =>
    t.taskClasses.some((tc) => tc.classGroup.name === TARGET_CLASS),
  )
  const targetLinks = targetTasks.reduce((sum, t) => sum + t.taskClasses.filter((tc) => tc.classGroup.name === TARGET_CLASS).length, 0)
  const targetSuspicious = suspiciousLinks.filter((l) => l.classGroupName === TARGET_CLASS)

  // ── 6. 孤立风险 ──
  const orphanZero: Array<{ taskId: number; course: string; teacher: string }> = []
  const orphanOne: Array<{ taskId: number; course: string; teacher: string; remaining: string }> = []
  let affectedWithSlots = 0
  let affectedWithAdjustments = 0

  const adjustmentCount = await prisma.scheduleAdjustment.count()

  for (const taskId of affectedTaskIds) {
    const task = actualTasks.find((t) => t.id === taskId)
    if (!task) continue

    const currentCount = task.taskClasses.length
    const suspiciousCount = suspiciousLinks.filter((l) => l.teachingTaskId === taskId).length
    const remaining = currentCount - suspiciousCount

    const courseName = task.course.name
    const teacherName = task.teacher?.name ?? '-'

    if (remaining === 0) {
      orphanZero.push({ taskId, course: courseName, teacher: teacherName })
    } else if (remaining === 1) {
      const remainingClass = task.taskClasses
        .filter((tc) => !suspiciousLinks.some((l) => l.teachingTaskId === taskId && l.classGroupId === tc.classGroupId))
        .map((tc) => tc.classGroup.name)
        .join(', ')
      orphanOne.push({ taskId, course: courseName, teacher: teacherName, remaining: remainingClass })
    }

    if (task.scheduleSlots.length > 0) affectedWithSlots++
  }

  // ── 7. 输出 ──
  // 统计
  const highCount = suspiciousLinks.filter((l) => l.confidence === 'HIGH').length
  const mediumCount = suspiciousLinks.filter((l) => l.confidence === 'MEDIUM').length
  const lowCount = suspiciousLinks.filter((l) => l.confidence === 'LOW').length
  const affectedTasks = new Set(suspiciousLinks.map((l) => l.teachingTaskId))
  const affectedClasses = new Set(suspiciousLinks.map((l) => l.classGroupName))

  console.log('## Expected Summary')
  console.log(`- expectedTaskKeyCount: ${taskKeyToClassNames.size}`)
  console.log(`- expectedClassCount: ${batchClassNames.size}`)
  console.log()

  console.log('## Actual Summary')
  console.log(`- actualTeachingTaskCount: ${actualTasks.length}`)
  console.log(`- actualTeachingTaskClassCount: ${actualTasks.reduce((s, t) => s + t.taskClasses.length, 0)}`)
  console.log(`- actualAffectedTaskCount: ${affectedTasks.size}`)
  console.log(`- actualAffectedClassCount: ${affectedClasses.size}`)
  console.log()

  console.log('## Suspicious Candidates Summary')
  console.log(`- totalSuspiciousLinks: ${suspiciousLinks.length}`)
  console.log(`- highConfidence: ${highCount}`)
  console.log(`- mediumConfidence: ${mediumCount}`)
  console.log(`- lowConfidence: ${lowCount}`)
  console.log(`- targetClassSuspiciousLinks: ${targetSuspicious.length}`)
  console.log()

  console.log('## Target Class Summary')
  console.log(`- targetClassName: ${TARGET_CLASS}`)
  console.log(`- targetActualLinks: ${targetLinks}`)
  console.log(`- targetSuspiciousLinks: ${targetSuspicious.length}`)
  console.log()

  // 目标班级异常课程检查
  const abnormalDetected = new Set<string>()
  const abnormalMissing = new Set<string>()
  for (const course of ABNORMAL_COURSES) {
    const detected = suspiciousLinks.some((l) => l.classGroupName === TARGET_CLASS && l.courseName === course)
    if (detected) abnormalDetected.add(course)
    else abnormalMissing.add(course)
  }
  console.log(`- abnormalCoursesDetected: ${[...abnormalDetected].join(', ') || '(none)'}`)
  console.log(`- abnormalCoursesMissingFromCandidates: ${[...abnormalMissing].join(', ') || '(none)'}`)

  // 正常课程误标检查
  const normalCourses = targetTasks
    .filter((t) => !ABNORMAL_COURSES.includes(t.course.name))
    .map((t) => t.course.name)
  const falsePositives = normalCourses.filter((c) =>
    suspiciousLinks.some((l) => l.classGroupName === TARGET_CLASS && l.courseName === c),
  )
  console.log(`- normalCoursesFalsePositive: ${falsePositives.join(', ') || '(none)'}`)
  console.log()

  // 候选清单
  console.log('## Suspicious Candidates')
  if (suspiciousLinks.length === 0) {
    console.log('(no suspicious candidates)')
  } else {
    console.log('| teachingTaskId | classGroupId | classGroupName | courseName | teacherName | reason | confidence |')
    console.log('| ---: | ---: | --- | --- | --- | --- | --- |')
    for (const l of suspiciousLinks) {
      console.log(`| ${l.teachingTaskId} | ${l.classGroupId} | ${l.classGroupName} | ${l.courseName} | ${l.teacherName} | ${l.reason} | ${l.confidence} |`)
    }
  }
  console.log()

  // 孤立风险
  console.log('## Orphan Risk Preview')
  console.log(`- cleanup 后可能 0 classGroup 的 TeachingTask 数: ${orphanZero.length}`)
  console.log(`- cleanup 后可能 1 classGroup 的 TeachingTask 数: ${orphanOne.length}`)
  console.log(`- 涉及 ScheduleSlot 的 affected task 数: ${affectedWithSlots}`)
  console.log(`- 涉及 ScheduleAdjustment 的 affected task 数: ${affectedWithAdjustments}`)
  if (orphanZero.length > 0) {
    console.log('  0 classGroup tasks:')
    for (const o of orphanZero) {
      console.log(`    - task ${o.taskId}: ${o.course} (${o.teacher})`)
    }
  }
  if (orphanOne.length > 0) {
    console.log('  1 classGroup tasks (sample):')
    for (const o of orphanOne.slice(0, 5)) {
      console.log(`    - task ${o.taskId}: ${o.course} (${o.teacher}) → remaining: ${o.remaining}`)
    }
    if (orphanOne.length > 5) console.log(`    ... and ${orphanOne.length - 5} more`)
  }
  console.log()

  console.log('## Safety')
  console.log('- noDatabaseWrites: true')
  console.log('- noSqlite3: true')
  console.log('- noDeleteSqlGenerated: true')
  console.log()

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
