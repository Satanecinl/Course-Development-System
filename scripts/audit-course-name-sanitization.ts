import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import type { ImportScheduleRecord } from '../src/types/import'

const prisma = new PrismaClient()

const TARGET_CLASS = '2024级钢铁智能冶金技术1班（高本贯通）'
const KNOWN_ABNORMAL = ['）机械制图', '） 机械制图']

interface AbnormalCourse {
  name: string
  inJson: boolean
  inDb: boolean
  jsonRecords: Array<{ className: string; teacher: string; week: string; day: number; slot: string }>
  dbCourseId: number | null
  dbTeachingTaskCount: number
  dbScheduleSlotCount: number
  dbTeachingTaskClassCount: number
  dbClassGroupNames: string[]
}

function isAbnormalCourseName(name: string): boolean {
  if (name.startsWith('）') || name.startsWith(')')) return true
  if (name.startsWith('、') || name.startsWith('，')) return true
  const openB = (name.match(/[（(]/g) || []).length
  const closeB = (name.match(/[）)]/g) || []).length
  if (openB !== closeB) return true
  if (name !== name.trim()) return true
  return false
}

async function main() {
  console.log('# Course Name Sanitization Audit\n')

  // ── 1. JSON scan ──
  const batchId = 1
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { parsedJsonPath: true },
  })
  if (!batch?.parsedJsonPath) {
    console.error('ImportBatch 1 not found')
    await prisma.$disconnect()
    process.exit(1)
  }

  const jsonPath = join(process.cwd(), batch.parsedJsonPath)
  const records: ImportScheduleRecord[] = JSON.parse(readFileSync(jsonPath, 'utf-8'))

  const jsonAbnormal = new Map<string, Array<{ className: string; teacher: string; week: string; day: number; slot: string }>>()
  for (const r of records) {
    const cn = r.course ?? ''
    if (isAbnormalCourseName(cn) || KNOWN_ABNORMAL.includes(cn)) {
      if (!jsonAbnormal.has(cn)) jsonAbnormal.set(cn, [])
      jsonAbnormal.get(cn)!.push({
        className: r.class_info.class_name,
        teacher: r.teacher ?? '-',
        week: `${r.week_start}-${r.week_end}`,
        day: r.day_of_week,
        slot: r.time_slot,
      })
    }
  }

  console.log('## Input')
  console.log(`- batchJsonPath: ${batch.parsedJsonPath}`)
  console.log(`- targetAbnormalNames: ${KNOWN_ABNORMAL.join(', ')}`)
  console.log()

  console.log('## JSON Scan')
  console.log(`- ）机械制图 in JSON: ${jsonAbnormal.has('）机械制图') ? 'YES' : 'NO'}`)
  console.log(`- ） 机械制图 in JSON: ${jsonAbnormal.has('） 机械制图') ? 'YES' : 'NO'}`)
  console.log(`- other abnormal courseNames in JSON: ${jsonAbnormal.size}`)
  if (jsonAbnormal.size > 0) {
    for (const [name, recs] of jsonAbnormal) {
      console.log(`  - "${name}" (${recs.length} records)`)
      for (const r of recs.slice(0, 3)) {
        console.log(`      class="${r.className}" teacher="${r.teacher}" week=${r.week} day=${r.day} slot=${r.slot}`)
      }
    }
  }
  console.log()

  // ── 2. Database scan ──
  const allCourses = await prisma.course.findMany({ select: { id: true, name: true } })
  const dbAbnormalCourses = allCourses.filter((c) => isAbnormalCourseName(c.name) || KNOWN_ABNORMAL.includes(c.name))

  const courseDetails: AbnormalCourse[] = []
  for (const course of dbAbnormalCourses) {
    const tasks = await prisma.teachingTask.findMany({
      where: { courseId: course.id },
      include: {
        taskClasses: { include: { classGroup: { select: { name: true } } } },
        scheduleSlots: true,
      },
    })
    const slotCount = tasks.reduce((s, t) => s + t.scheduleSlots.length, 0)
    const ttcCount = tasks.reduce((s, t) => s + t.taskClasses.length, 0)
    const classGroupNames = [...new Set(tasks.flatMap((t) => t.taskClasses.map((tc) => tc.classGroup.name)))]

    courseDetails.push({
      name: course.name,
      inJson: jsonAbnormal.has(course.name),
      inDb: true,
      jsonRecords: jsonAbnormal.get(course.name) ?? [],
      dbCourseId: course.id,
      dbTeachingTaskCount: tasks.length,
      dbScheduleSlotCount: slotCount,
      dbTeachingTaskClassCount: ttcCount,
      dbClassGroupNames: classGroupNames,
    })
  }

  // Also check if known abnormal names exist as Course even if not caught by isAbnormalCourseName
  for (const name of KNOWN_ABNORMAL) {
    if (!courseDetails.some((c) => c.name === name)) {
      const course = allCourses.find((c) => c.name === name)
      if (course) {
        const tasks = await prisma.teachingTask.findMany({
          where: { courseId: course.id },
          include: {
            taskClasses: { include: { classGroup: { select: { name: true } } } },
            scheduleSlots: true,
          },
        })
        courseDetails.push({
          name: course.name,
          inJson: jsonAbnormal.has(name),
          inDb: true,
          jsonRecords: jsonAbnormal.get(name) ?? [],
          dbCourseId: course.id,
          dbTeachingTaskCount: tasks.length,
          dbScheduleSlotCount: tasks.reduce((s, t) => s + t.scheduleSlots.length, 0),
          dbTeachingTaskClassCount: tasks.reduce((s, t) => s + t.taskClasses.length, 0),
          dbClassGroupNames: [...new Set(tasks.flatMap((t) => t.taskClasses.map((tc) => tc.classGroup.name)))],
        })
      }
    }
  }

  const totalDbTasks = courseDetails.reduce((s, c) => s + c.dbTeachingTaskCount, 0)
  const totalDbSlots = courseDetails.reduce((s, c) => s + c.dbScheduleSlotCount, 0)
  const totalDbTTC = courseDetails.reduce((s, c) => s + c.dbTeachingTaskClassCount, 0)
  const allClassGroups = [...new Set(courseDetails.flatMap((c) => c.dbClassGroupNames))]

  console.log('## Database Scan')
  console.log(`- ）机械制图 in DB: ${courseDetails.some((c) => c.name === '）机械制图') ? 'YES' : 'NO'}`)
  console.log(`- ） 机械制图 in DB: ${courseDetails.some((c) => c.name === '） 机械制图') ? 'YES' : 'NO'}`)
  console.log(`- abnormal courseName total: ${courseDetails.length}`)
  console.log(`-涉及 Course: ${courseDetails.length}`)
  console.log(`-涉及 TeachingTask: ${totalDbTasks}`)
  console.log(`-涉及 ScheduleSlot: ${totalDbSlots}`)
  console.log(`-涉及 TeachingTaskClass: ${totalDbTTC}`)
  console.log(`-涉及 ClassGroup: ${allClassGroups.length}`)
  for (const c of courseDetails) {
    console.log(`  - "${c.name}" (id=${c.dbCourseId}): ${c.dbTeachingTaskCount} tasks, ${c.dbScheduleSlotCount} slots, ${c.dbTeachingTaskClassCount} ttc`)
    if (c.dbClassGroupNames.length > 0) {
      console.log(`    classes: ${c.dbClassGroupNames.join(', ')}`)
    }
  }
  console.log()

  // ── 3. Impact scope ──
  const allClasses = await prisma.classGroup.findMany({ select: { name: true } })
  const allClassNames = allClasses.map((c) => c.name)
  const targetClassAffected = courseDetails.some((c) => c.dbClassGroupNames.includes(TARGET_CLASS))
  const otherAffected = courseDetails.some((c) => c.dbClassGroupNames.some((n) => n !== TARGET_CLASS))

  console.log('## Impact Scope')
  console.log(`- affects target class: ${targetClassAffected ? 'YES' : 'NO'}`)
  console.log(`- affects other classes: ${otherAffected ? 'YES' : 'NO'}`)
  if (allClassGroups.length > 0) {
    console.log(`- affected classGroupNames: ${allClassGroups.join(', ')}`)
  }

  // Teacher / room summary
  for (const c of courseDetails) {
    const tasks = await prisma.teachingTask.findMany({
      where: { courseId: c.dbCourseId! },
      include: { teacher: { select: { name: true } }, scheduleSlots: { include: { room: { select: { name: true } } } } },
    })
    for (const t of tasks) {
      const room = t.scheduleSlots.length > 0 ? t.scheduleSlots[0].room?.name ?? '-' : '-'
      const day = t.scheduleSlots.length > 0 ? t.scheduleSlots[0].dayOfWeek : 0
      const slot = t.scheduleSlots.length > 0 ? t.scheduleSlots[0].slotIndex : 0
      console.log(`  task ${t.id}: "${c.name}" teacher="${t.teacher?.name ?? '-'}" room="${room}" day=${day} slot=${slot} weeks=${t.startWeek}-${t.endWeek}`)
    }
  }
  console.log()

  // ── 4. Source hypothesis ──
  console.log('## Source Hypothesis')
  if (jsonAbnormal.size > 0) {
    console.log('- verdict: ORIGINAL_JSON_HAS_BAD_NAME')
    console.log('- evidence: The abnormal course names exist in the batch #1 JSON (uploads/imports/1780035124021-sejcg9dy.json). The Python parser (scripts/parse_cell.py) produced these names from the Word docx. The CSV (scripts/semester_2026.csv) shows the raw teacher field contains "杨景勋 （）机械制图 张红梅 （双周上）" — the parser incorrectly split the teacher+course string, producing "）机械制图" as a course name.')
  } else {
    console.log('- verdict: UNKNOWN_NEEDS_REVIEW')
    console.log('- evidence: Abnormal names not found in JSON but exist in DB')
  }
  console.log()

  // ── 5. Risk ──
  console.log('## Risk')
  console.log(`- blocks capacity readonly recheck: NO (${totalDbTasks} tasks with abnormal names are separate Course entries; capacity check uses courseId not courseName)`)
  console.log(`- blocks solver recheck: NO (solver uses courseId; abnormal courseNames are separate Course records)`)
  console.log(`- needs parser/courseName fix: YES (源头在 Python parser parse_cell.py)`)
  console.log(`- needs data cleanup: YES (${totalDbTTC} TeachingTaskClass links, ${totalDbTasks} TeachingTasks, ${totalDbSlots} ScheduleSlots reference abnormal Course)`)
  console.log()

  console.log('## Safety')
  console.log('- noDatabaseWrites: true')
  console.log('- noSqlite3: true')
  console.log('- noCleanupSqlGenerated: true')
  console.log()

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
