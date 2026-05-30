import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { parseRemarkKeywords, findMergedClassNames, buildEventKey } from '../src/lib/import/importer'
import type { ImportScheduleRecord } from '../src/types/import'

const prisma = new PrismaClient()

const TARGET_CLASS = '2024级钢铁智能冶金技术1班（高本贯通）'
const ABNORMAL_COURSES = [
  '机械制图', '金属材料与热处理', '传感器与检测技术', '电子技术',
  '林草环境', '无人机应用技术', '高等数学', '中华优秀传统文化',
]

const EXPECTED_TOTAL = 96
const EXPECTED_TARGET = 28
const EXPECTED_HIGH = 96
const EXPECTED_MEDIUM = 0
const EXPECTED_LOW = 0

interface SuspiciousCandidate {
  teachingTaskId: number
  classGroupId: number
  classGroupName: string
  courseName: string
  teacherName: string
  reason: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

async function main() {
  console.log('# Cleanup TeachingTaskClass Pollution Dry Run\n')

  console.log('## Safety')
  console.log('- mode: DRY_RUN_ONLY')
  console.log('- noDatabaseWrites: true')
  console.log('- noDeleteSqlGenerated: true')
  console.log('- executeModeEnabled: false')
  console.log()

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

  // ── 2. 构建 expected（复用 audit 逻辑）──
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

  const taskKeyToClassNames = new Map<string, Set<string>>()
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
    }
    taskKeyToClassNames.get(taskKey)!.add(r.class_info?.class_name ?? '')
  }

  // ── 3. 读取 actual ──
  const actualTasks = await prisma.teachingTask.findMany({
    include: {
      course: { select: { name: true } },
      teacher: { select: { name: true } },
      taskClasses: { include: { classGroup: { select: { name: true } } } },
      scheduleSlots: { include: { room: { select: { name: true } } } },
    },
  })

  // ── 4. expected vs actual ──
  const suspiciousLinks: SuspiciousCandidate[] = []
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

    if (!actualTaskToExpectedClasses.has(matchedTask.id)) {
      actualTaskToExpectedClasses.set(matchedTask.id, new Set())
    }
    for (const cn of expectedClassNames) {
      actualTaskToExpectedClasses.get(matchedTask.id)!.add(cn)
    }
  }

  for (const [taskId, unionExpectedClasses] of actualTaskToExpectedClasses) {
    const task = actualTasks.find((t) => t.id === taskId)
    if (!task) continue

    for (const tc of task.taskClasses) {
      if (!unionExpectedClasses.has(tc.classGroup.name)) {
        suspiciousLinks.push({
          teachingTaskId: task.id,
          classGroupId: tc.classGroupId,
          classGroupName: tc.classGroup.name,
          courseName: task.course.name,
          teacherName: task.teacher?.name ?? '-',
          reason: 'ACTUAL_NOT_IN_EXPECTED_FOR_CLASS',
          confidence: 'HIGH',
        })
      }
    }
  }

  // 去重
  const seen = new Set<string>()
  const deduped: SuspiciousCandidate[] = []
  for (const l of suspiciousLinks) {
    const key = `${l.teachingTaskId}|${l.classGroupId}`
    if (!seen.has(key)) { seen.add(key); deduped.push(l) }
  }
  suspiciousLinks.length = 0
  suspiciousLinks.push(...deduped)

  // ── 5. 目标班级 ──
  const targetTasks = actualTasks.filter((t) =>
    t.taskClasses.some((tc) => tc.classGroup.name === TARGET_CLASS),
  )
  const targetLinks = targetTasks.reduce((sum, t) => sum + t.taskClasses.filter((tc) => tc.classGroup.name === TARGET_CLASS).length, 0)
  const targetSuspicious = suspiciousLinks.filter((l) => l.classGroupName === TARGET_CLASS)

  // ── 6. 断言 ──
  const highCount = suspiciousLinks.filter((l) => l.confidence === 'HIGH').length
  const mediumCount = suspiciousLinks.filter((l) => l.confidence === 'MEDIUM').length
  const lowCount = suspiciousLinks.filter((l) => l.confidence === 'LOW').length
  const affectedTasks = new Set(suspiciousLinks.map((l) => l.teachingTaskId))
  const affectedClasses = new Set(suspiciousLinks.map((l) => l.classGroupName))

  const abnormalDetected = new Set<string>()
  const abnormalMissing = new Set<string>()
  for (const course of ABNORMAL_COURSES) {
    const detected = suspiciousLinks.some((l) => l.classGroupName === TARGET_CLASS && l.courseName === course)
    if (detected) abnormalDetected.add(course)
    else abnormalMissing.add(course)
  }

  console.log('## Candidate Assertions')
  console.log(`- totalCandidates: ${suspiciousLinks.length} (expected: ${EXPECTED_TOTAL}) ${suspiciousLinks.length === EXPECTED_TOTAL ? 'PASS' : 'FAIL'}`)
  console.log(`- targetCandidates: ${targetSuspicious.length} (expected: ${EXPECTED_TARGET}) ${targetSuspicious.length === EXPECTED_TARGET ? 'PASS' : 'FAIL'}`)
  console.log(`- highConfidence: ${highCount} (expected: ${EXPECTED_HIGH}) ${highCount === EXPECTED_HIGH ? 'PASS' : 'FAIL'}`)
  console.log(`- mediumConfidence: ${mediumCount} (expected: ${EXPECTED_MEDIUM}) ${mediumCount === EXPECTED_MEDIUM ? 'PASS' : 'FAIL'}`)
  console.log(`- lowConfidence: ${lowCount} (expected: ${EXPECTED_LOW}) ${lowCount === EXPECTED_LOW ? 'PASS' : 'FAIL'}`)
  console.log(`- abnormalCoursesCovered: ${abnormalDetected.size}/${ABNORMAL_COURSES.length} ${abnormalDetected.size === ABNORMAL_COURSES.length ? 'PASS' : 'FAIL'}`)
  if (abnormalMissing.size > 0) {
    console.log(`- abnormalCoursesMissing: ${[...abnormalMissing].join(', ')}`)
  }
  console.log()

  // 全局断言
  const allPassed =
    suspiciousLinks.length === EXPECTED_TOTAL &&
    targetSuspicious.length === EXPECTED_TARGET &&
    highCount === EXPECTED_HIGH &&
    mediumCount === EXPECTED_MEDIUM &&
    lowCount === EXPECTED_LOW &&
    abnormalDetected.size === ABNORMAL_COURSES.length

  if (!allPassed) {
    console.error('ABORT: One or more assertions failed. Cleanup must not proceed.')
    await prisma.$disconnect()
    process.exit(1)
  }

  // ── 7. Cleanup Plan ──
  console.log('## Cleanup Plan')
  console.log(`- links to remove: ${suspiciousLinks.length}`)
  console.log(`- affected tasks: ${affectedTasks.size}`)
  console.log(`- affected classes: ${affectedClasses.size}`)
  console.log()

  console.log('### Join Keys to Remove')
  console.log('| teachingTaskId | classGroupId | classGroupName | courseName | teacherName | reason | confidence |')
  console.log('| ---: | ---: | --- | --- | --- | --- | --- |')
  for (const l of suspiciousLinks) {
    console.log(`| ${l.teachingTaskId} | ${l.classGroupId} | ${l.classGroupName} | ${l.courseName} | ${l.teacherName} | ${l.reason} | ${l.confidence} |`)
  }
  console.log()

  // ── 8. Target Class Preview ──
  const targetAfter = targetLinks - targetSuspicious.length
  console.log('## Target Class Preview')
  console.log(`- className: ${TARGET_CLASS}`)
  console.log(`- beforeActualLinks: ${targetLinks}`)
  console.log(`- suspiciousLinks: ${targetSuspicious.length}`)
  console.log(`- expectedAfterLinks: ${targetAfter}`)
  console.log(`- abnormalCoursesAfterCleanupExpected: 0`)
  console.log()

  // ── 9. Orphan Risk ──
  const orphanZero: Array<{ taskId: number; course: string; teacher: string }> = []
  const orphanOne: Array<{ taskId: number; course: string; teacher: string; remaining: string }> = []
  let affectedWithSlots = 0

  for (const taskId of affectedTasks) {
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
        .map((tc) => tc.classGroup.name).join(', ')
      orphanOne.push({ taskId, course: courseName, teacher: teacherName, remaining: remainingClass })
    }
    if (task.scheduleSlots.length > 0) affectedWithSlots++
  }

  console.log('## Orphan Risk Preview')
  console.log(`- tasksWithZeroClassGroupsAfterCleanup: ${orphanZero.length}`)
  console.log(`- tasksWithOneClassGroupAfterCleanup: ${orphanOne.length}`)
  console.log(`- tasksWithScheduleSlots: ${affectedWithSlots}`)
  console.log(`- tasksWithScheduleAdjustments: UNKNOWN_NEEDS_REVIEW`)
  if (orphanZero.length > 0) {
    console.log('  0 classGroup tasks:')
    for (const o of orphanZero) console.log(`    - task ${o.taskId}: ${o.course} (${o.teacher})`)
  }
  if (orphanOne.length > 0) {
    console.log('  1 classGroup tasks (sample):')
    for (const o of orphanOne.slice(0, 5)) {
      console.log(`    - task ${o.taskId}: ${o.course} (${o.teacher}) -> remaining: ${o.remaining}`)
    }
    if (orphanOne.length > 5) console.log(`    ... and ${orphanOne.length - 5} more`)
  }
  console.log()

  // ── 10. Backup Required ──
  console.log('## Backup Required Before Execution')
  console.log('- source: prisma/dev.db')
  console.log('- suggested path: prisma/dev.db.backup-before-k9dq4-cleanup-{YYYYMMDDHHMMSS}')
  console.log('- restore: Copy-Item "prisma\\dev.db.backup-before-k9dq4-cleanup-{timestamp}" "prisma\\dev.db" -Force')
  console.log()

  // ── 11. Before/After Stats ──
  const totalTTC = actualTasks.reduce((s, t) => s + t.taskClasses.length, 0)
  console.log('## Before / After Stats')
  console.log(`| Metric | Before | After (expected) |`)
  console.log(`| --- | ---: | ---: |`)
  console.log(`| totalTeachingTaskClassLinks | ${totalTTC} | ${totalTTC - suspiciousLinks.length} |`)
  console.log(`| targetClassLinks | ${targetLinks} | ${targetAfter} |`)
  console.log(`| suspiciousLinks | ${suspiciousLinks.length} | 0 |`)
  console.log(`| affectedTasks | ${affectedTasks.size} | ${affectedTasks.size} (tasks unchanged) |`)
  console.log()

  console.log('## Next Step')
  console.log('- K9-DQ-4E-DATA-CLEANUP-EXECUTION')
  console.log()

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
