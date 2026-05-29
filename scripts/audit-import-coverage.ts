import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import type { ImportScheduleRecord } from '../src/types/import'
import { buildEventKey, mapTimeSlotToIndex, parseRemarkKeywords, findMergedClassNames } from '../src/lib/import/importer'

const prisma = new PrismaClient()

interface TaskCoverage {
  taskKey: string
  covered: boolean
  created: boolean
  teachingTaskId: number | null
  sourceTeacherEmpty: boolean
  dbTeacherId: number | null
  sourceRoomEmpty: boolean
  record: ImportScheduleRecord
  classNames: Set<string>
}

interface SlotCoverage {
  slotKey: string
  covered: boolean
  created: boolean
  scheduleSlotId: number | null
  sourceRoomEmpty: boolean
  dbRoomId: number | null
  record: ImportScheduleRecord
  classNames: Set<string>
}

async function main() {
  // 1. 查找 confirmed ImportBatch
  const batch = await prisma.importBatch.findFirst({
    where: { status: 'confirmed' },
    orderBy: { confirmedAt: 'desc' },
  })
  if (!batch) {
    console.log('没有找到 confirmed 状态的 ImportBatch。（可能已 rollback）')
    console.log('SKIPPED — coverage audit requires a confirmed batch')
    process.exit(0)
  }

  console.log('=== ImportBatch ===')
  console.log(`  batchId:          ${batch.id}`)
  console.log(`  filename:         ${batch.filename}`)
  console.log(`  recordCount:      ${batch.recordCount}`)
  console.log(`  createdTaskCount: ${batch.createdTaskCount}`)
  console.log(`  createdSlotCount: ${batch.createdSlotCount}`)
  console.log(`  confirmedAt:      ${batch.confirmedAt}`)
  console.log()

  // 2. 读取 parsed records
  const jsonPath = join(process.cwd(), batch.parsedJsonPath!)
  if (!existsSync(jsonPath)) {
    console.error(`解析文件不存在: ${jsonPath}`)
    process.exit(1)
  }
  const records: ImportScheduleRecord[] = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  console.log(`parsedRecordCount: ${records.length}`)
  console.log()

  // 3. 收集 classNames
  const allClassNames = new Set<string>()
  for (const r of records) {
    const cn = r.class_info?.class_name
    if (cn) allClassNames.add(cn)
  }

  // 4. Event 聚合（含合班解析）
  const eventKeyToClassNames = new Map<string, Set<string>>()
  for (const r of records) {
    const ek = buildEventKey(r)
    let set = eventKeyToClassNames.get(ek)
    if (!set) { set = new Set(); eventKeyToClassNames.set(ek, set) }
    set.add(r.class_info?.class_name ?? '')
    if (r.remark) {
      const keywords = parseRemarkKeywords(r.remark)
      if (keywords.length > 0) {
        const allClasses = [...allClassNames].map((n) => ({ name: n }))
        const merged = await findMergedClassNames(keywords, r.class_info?.class_name ?? '', allClasses)
        for (const m of merged) set.add(m)
      }
    }
  }

  // 5. TeachingTask 聚合
  const taskKeySet = new Set<string>()
  const taskKeys: string[] = []
  const taskKeyToClassNames = new Map<string, Set<string>>()
  const taskKeyToRecord = new Map<string, ImportScheduleRecord>()

  for (const r of records) {
    const ek = buildEventKey(r)
    const classGroupSet = eventKeyToClassNames.get(ek)
    const canonicalSet = classGroupSet ? [...classGroupSet].sort().join('|') : (r.class_info?.class_name ?? '')
    const taskKey = [r.course ?? '', r.teacher ?? '**NULL_TEACHER**', r.week_type, r.week_start, r.week_end, r.remark ?? '', canonicalSet].join('|')
    if (!taskKeySet.has(taskKey)) {
      taskKeySet.add(taskKey)
      taskKeys.push(taskKey)
      taskKeyToClassNames.set(taskKey, classGroupSet ?? new Set([r.class_info?.class_name ?? '']))
      taskKeyToRecord.set(taskKey, r)
    }
  }

  // 6. ScheduleSlot 聚合
  const slotKeySet = new Set<string>()
  const slotKeys: string[] = []
  const slotKeyToRecord = new Map<string, ImportScheduleRecord>()
  const slotKeyToClassNames = new Map<string, Set<string>>()

  for (const r of records) {
    const ek = buildEventKey(r)
    const classGroupSet = eventKeyToClassNames.get(ek)
    const canonicalSet = classGroupSet ? [...classGroupSet].sort().join('|') : (r.class_info?.class_name ?? '')
    const taskKey = [r.course ?? '', r.teacher ?? '**NULL_TEACHER**', r.week_type, r.week_start, r.week_end, r.remark ?? '', canonicalSet].join('|')
    const slotKey = [taskKey, r.room ?? '**NULL_ROOM**', r.day_of_week, mapTimeSlotToIndex(r.time_slot)].join('|')
    if (!slotKeySet.has(slotKey)) {
      slotKeySet.add(slotKey)
      slotKeys.push(slotKey)
      slotKeyToRecord.set(slotKey, r)
      slotKeyToClassNames.set(slotKey, classGroupSet ?? new Set([r.class_info?.class_name ?? '']))
    }
  }

  console.log(`eventGroupCount:         ${eventKeyToClassNames.size}`)
  console.log(`teachingTaskGroupCount:  ${taskKeys.length}`)
  console.log(`scheduleSlotGroupCount:  ${slotKeys.length}`)
  console.log()

  // 7. 构建 name → id 映射（只读）
  const courseMap = new Map<string, number>()
  const teacherMap = new Map<string, number>()
  const roomMap = new Map<string, number>()
  const classGroupMap = new Map<string, number>()

  const courses = await prisma.course.findMany({ select: { id: true, name: true } })
  for (const c of courses) courseMap.set(c.name, c.id)
  const teachers = await prisma.teacher.findMany({ select: { id: true, name: true } })
  for (const t of teachers) teacherMap.set(t.name, t.id)
  const rooms = await prisma.room.findMany({ select: { id: true, name: true } })
  for (const r of rooms) roomMap.set(r.name, r.id)
  const classGroups = await prisma.classGroup.findMany({ select: { id: true, name: true } })
  for (const cg of classGroups) classGroupMap.set(cg.name, cg.id)

  // 8. TeachingTask 覆盖率检查
  const taskCoverages: TaskCoverage[] = []
  const taskKeyToTaskId = new Map<string, number>()
  let coveredTaskCount = 0
  let missingTaskCount = 0
  let createdTaskCount = 0
  let reusedTaskCount = 0

  for (const taskKey of taskKeys) {
    const parts = taskKey.split('|')
    const [courseName, teacherStr, weekType, startWeekStr, endWeekStr, remark, _canonicalSet] = parts
    const teacherName = teacherStr === '**NULL_TEACHER**' ? null : teacherStr
    const startWeek = parseInt(startWeekStr, 10)
    const endWeek = parseInt(endWeekStr, 10)

    const courseId = courseMap.get(courseName)
    const teacherId = teacherName ? (teacherMap.get(teacherName) ?? null) : null
    const classGroupNames = taskKeyToClassNames.get(taskKey) ?? new Set<string>()
    const classGroupIds = [...classGroupNames]
      .map((n) => classGroupMap.get(n))
      .filter((id): id is number => id != null)
      .sort((a, b) => a - b)

    const record = taskKeyToRecord.get(taskKey)!
    const sourceTeacherEmpty = !record.teacher

    if (!courseId) {
      taskCoverages.push({
        taskKey, covered: false, created: false, teachingTaskId: null,
        sourceTeacherEmpty, dbTeacherId: null, sourceRoomEmpty: !record.room,
        record, classNames: classGroupNames,
      })
      missingTaskCount++
      continue
    }

    // 查询 DB
    const existingTasks = await prisma.teachingTask.findMany({
      where: { courseId, teacherId, weekType, startWeek, endWeek, remark: remark || null },
      include: { taskClasses: { select: { classGroupId: true } } },
    })

    let matchedTask: typeof existingTasks[number] | null = null
    for (const et of existingTasks) {
      const existingSet = et.taskClasses.map((tc) => tc.classGroupId).sort((a, b) => a - b)
      if (existingSet.length === classGroupIds.length && existingSet.every((id, i) => id === classGroupIds[i])) {
        matchedTask = et
        break
      }
    }

    if (matchedTask) {
      taskKeyToTaskId.set(taskKey, matchedTask.id)
      const isCreated = matchedTask.importBatchId === batch.id
      coveredTaskCount++
      if (isCreated) createdTaskCount++; else reusedTaskCount++
      taskCoverages.push({
        taskKey, covered: true, created: isCreated, teachingTaskId: matchedTask.id,
        sourceTeacherEmpty, dbTeacherId: matchedTask.teacherId,
        sourceRoomEmpty: !record.room, record, classNames: classGroupNames,
      })
    } else {
      missingTaskCount++
      taskCoverages.push({
        taskKey, covered: false, created: false, teachingTaskId: null,
        sourceTeacherEmpty, dbTeacherId: null, sourceRoomEmpty: !record.room,
        record, classNames: classGroupNames,
      })
    }
  }

  // 9. ScheduleSlot 覆盖率检查（含 roomId 验证）
  const slotCoverages: SlotCoverage[] = []
  let coveredSlotCount = 0
  let missingSlotCount = 0
  let createdSlotCount = 0
  let reusedSlotCount = 0

  for (const slotKey of slotKeys) {
    const parts = slotKey.split('|')
    const roomStr = parts[parts.length - 3]
    const dayOfWeek = parseInt(parts[parts.length - 2], 10)
    const slotIndex = parseInt(parts[parts.length - 1], 10)
    const taskKey = parts.slice(0, parts.length - 3).join('|')

    const record = slotKeyToRecord.get(slotKey)!
    const sourceRoomEmpty = roomStr === '**NULL_ROOM**'
    const roomName = sourceRoomEmpty ? null : roomStr
    const roomId = roomName ? (roomMap.get(roomName) ?? null) : null
    const teachingTaskId = taskKeyToTaskId.get(taskKey)

    if (!teachingTaskId) {
      slotCoverages.push({
        slotKey, covered: false, created: false, scheduleSlotId: null,
        sourceRoomEmpty, dbRoomId: null, record,
        classNames: slotKeyToClassNames.get(slotKey) ?? new Set(),
      })
      missingSlotCount++
      continue
    }

    // 按 room 查询：room 有值查 roomId，room 为空查 roomId=null
    const whereClause: any = { teachingTaskId, dayOfWeek, slotIndex }
    if (sourceRoomEmpty) {
      whereClause.roomId = null
    } else {
      whereClause.roomId = roomId
    }

    const existingSlot = await prisma.scheduleSlot.findFirst({
      where: whereClause,
    })

    if (existingSlot) {
      const isCreated = existingSlot.importBatchId === batch.id
      coveredSlotCount++
      if (isCreated) createdSlotCount++; else reusedSlotCount++
      slotCoverages.push({
        slotKey, covered: true, created: isCreated, scheduleSlotId: existingSlot.id,
        sourceRoomEmpty, dbRoomId: existingSlot.roomId, record,
        classNames: slotKeyToClassNames.get(slotKey) ?? new Set(),
      })
    } else {
      missingSlotCount++
      slotCoverages.push({
        slotKey, covered: false, created: false, scheduleSlotId: null,
        sourceRoomEmpty, dbRoomId: null, record,
        classNames: slotKeyToClassNames.get(slotKey) ?? new Set(),
      })
    }
  }

  // 10. Null teacher 异常检查
  const teacherNullAnomalies = taskCoverages.filter(
    (tc) => tc.sourceTeacherEmpty && tc.covered && tc.dbTeacherId !== null
  )
  const mappedMissingTeacherTaskCount = taskCoverages.filter((tc) => tc.sourceTeacherEmpty).length
  const mappedNullTeacherTaskCount = taskCoverages.filter(
    (tc) => tc.sourceTeacherEmpty && tc.covered && tc.dbTeacherId === null
  ).length

  // 11. Null room 异常检查
  const roomNullAnomalies = slotCoverages.filter(
    (sc) => sc.sourceRoomEmpty && sc.covered && sc.dbRoomId !== null
  )
  const mappedMissingRoomSlotCount = slotCoverages.filter((sc) => sc.sourceRoomEmpty).length
  const mappedNullRoomSlotCount = slotCoverages.filter(
    (sc) => sc.sourceRoomEmpty && sc.covered && sc.dbRoomId === null
  ).length

  // 12. Skipped records 检查
  const coveredTaskKeys = new Set(taskCoverages.filter((tc) => tc.covered).map((tc) => tc.taskKey))
  const coveredSlotKeys = new Set(slotCoverages.filter((sc) => sc.covered).map((sc) => sc.slotKey))

  let skippedRecordCount = 0
  const skippedExamples: ImportScheduleRecord[] = []

  for (const r of records) {
    const hasCourse = !!(r.course)
    const hasClassName = !!(r.class_info?.class_name)
    const hasDay = r.day_of_week > 0
    const hasPeriod = r.period_start > 0 || r.period_end > 0 || !!r.time_slot

    if (!hasCourse || !hasClassName || !hasDay || !hasPeriod) continue

    // 检查该 record 的 taskKey 和 slotKey 是否在 covered 集合中
    const ek = buildEventKey(r)
    const classGroupSet = eventKeyToClassNames.get(ek)
    const canonicalSet = classGroupSet ? [...classGroupSet].sort().join('|') : (r.class_info?.class_name ?? '')
    const taskKey = [r.course ?? '', r.teacher ?? '**NULL_TEACHER**', r.week_type, r.week_start, r.week_end, r.remark ?? '', canonicalSet].join('|')
    const slotKey = [taskKey, r.room ?? '**NULL_ROOM**', r.day_of_week, mapTimeSlotToIndex(r.time_slot)].join('|')

    const taskCovered = coveredTaskKeys.has(taskKey)
    const slotCovered = coveredSlotKeys.has(slotKey)

    if (!taskCovered && !slotCovered) {
      skippedRecordCount++
      if (skippedExamples.length < 10) skippedExamples.push(r)
    }
  }

  // 13. 输出报告
  const recordsMissingTeacher = records.filter((r) => !r.teacher).length
  const recordsMissingRoom = records.filter((r) => !r.room).length

  console.log('=== Coverage Audit ===')
  console.log(`  batchId:                       ${batch.id}`)
  console.log(`  parsedRecordCount:             ${records.length}`)
  console.log(`  eventGroupCount:               ${eventKeyToClassNames.size}`)
  console.log(`  teachingTaskGroupCount:        ${taskKeys.length}`)
  console.log(`  scheduleSlotGroupCount:        ${slotKeys.length}`)
  console.log(`  coveredTeachingTaskGroupCount: ${coveredTaskCount}`)
  console.log(`  missingTeachingTaskGroupCount: ${missingTaskCount}`)
  console.log(`  coveredScheduleSlotGroupCount: ${coveredSlotCount}`)
  console.log(`  missingScheduleSlotGroupCount: ${missingSlotCount}`)
  console.log(`  createdTeachingTaskCount:      ${createdTaskCount}`)
  console.log(`  reusedTeachingTaskCount:       ${reusedTaskCount}`)
  console.log(`  createdScheduleSlotCount:      ${createdSlotCount}`)
  console.log(`  reusedScheduleSlotCount:       ${reusedSlotCount}`)
  console.log(`  recordsMissingTeacher:         ${recordsMissingTeacher}`)
  console.log(`  recordsMissingRoom:            ${recordsMissingRoom}`)
  console.log(`  mappedMissingTeacherTaskCount: ${mappedMissingTeacherTaskCount}`)
  console.log(`  mappedNullTeacherTaskCount:    ${mappedNullTeacherTaskCount}`)
  console.log(`  mappedMissingRoomSlotCount:    ${mappedMissingRoomSlotCount}`)
  console.log(`  mappedNullRoomSlotCount:       ${mappedNullRoomSlotCount}`)
  console.log(`  skippedRecordCount:            ${skippedRecordCount}`)
  console.log()

  // 14. Null Teacher 异常明细
  if (teacherNullAnomalies.length > 0) {
    console.log(`=== Null Teacher Anomalies (${teacherNullAnomalies.length}) ===`)
    for (const a of teacherNullAnomalies) {
      const r = a.record
      const dbTeacher = a.dbTeacherId ? (await prisma.teacher.findUnique({ where: { id: a.dbTeacherId } }))?.name : null
      console.log(`  classNames: ${[...a.classNames].join(', ')}`)
      console.log(`  course:     ${r.course}`)
      console.log(`  source:     (空)`)
      console.log(`  mapped:     ${dbTeacher ?? '(null)'} (teacherId=${a.dbTeacherId})`)
      console.log(`  weekType:   ${r.week_type}`)
      console.log()
    }
  } else {
    console.log('=== Null Teacher Anomalies: 无 ===')
    console.log()
  }

  // 15. Null Room 异常明细
  if (roomNullAnomalies.length > 0) {
    console.log(`=== Null Room Anomalies (${roomNullAnomalies.length}) ===`)
    for (const a of roomNullAnomalies) {
      const r = a.record
      const dbRoom = a.dbRoomId ? (await prisma.room.findUnique({ where: { id: a.dbRoomId } }))?.name : null
      console.log(`  classNames: ${[...a.classNames].join(', ')}`)
      console.log(`  course:     ${r.course}`)
      console.log(`  teacher:    ${r.teacher ?? '(空)'}`)
      console.log(`  source:     (空)`)
      console.log(`  mapped:     ${dbRoom ?? '(null)'} (roomId=${a.dbRoomId})`)
      console.log(`  dayOfWeek:  ${r.day_of_week}`)
      console.log(`  slotIndex:  ${mapTimeSlotToIndex(r.time_slot)}`)
      console.log(`  weekType:   ${r.week_type}`)
      console.log()
    }
  } else {
    console.log('=== Null Room Anomalies: 无 ===')
    console.log()
  }

  // 16. Skipped records 明细
  if (skippedRecordCount > 0) {
    console.log(`=== Skipped Records (${skippedRecordCount}) ===`)
    for (const r of skippedExamples) {
      console.log(`  class: ${r.class_info?.class_name} | course: ${r.course} | teacher: ${r.teacher ?? '(空)'} | room: ${r.room ?? '(空)'} | day: ${r.day_of_week} | time: ${r.time_slot} | weekType: ${r.week_type}`)
    }
    if (skippedRecordCount > 10) console.log(`  ... and ${skippedRecordCount - 10} more`)
    console.log()
  } else {
    console.log('=== Skipped Records: 0 ===')
    console.log()
  }

  // 17. 语义说明
  console.log('=== Semantic Note ===')
  console.log('本次导入在已有数据基础上执行。createdTaskCount 仅代表新建任务数，')
  console.log('reusedTaskCount 代表复用已有任务。createdSlotCount 仅代表新建时段数，')
  console.log('reusedSlotCount 代表复用已有时段。parsedRecordCount 中每条记录')
  console.log('都应被某个 task/slot group 覆盖。')
  console.log()

  // 18. 判定
  const hasIssues =
    missingTaskCount > 0 ||
    missingSlotCount > 0 ||
    skippedRecordCount > 0 ||
    teacherNullAnomalies.length > 0 ||
    roomNullAnomalies.length > 0

  console.log(hasIssues ? 'AUDIT: ISSUES FOUND' : 'AUDIT: ALL CHECKS PASSED')
  process.exit(hasIssues ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
