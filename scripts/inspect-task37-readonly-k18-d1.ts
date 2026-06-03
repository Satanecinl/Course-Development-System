/**
 * K18-D1: Task 37 Read-Only State Inspection
 *
 * Read-only script that inspects TeachingTask 37 current DB state.
 * No writes, no modifications, no repair logic.
 *
 * Usage: npx tsx scripts/inspect-task37-readonly-k18-d1.ts
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

const OUTPUT_JSON = path.resolve('docs/k18-task37-readonly-state-inspection.json')

function extractCohortYear(name: string): number | null {
  const m = name.match(/^(\d{4})级/)
  return m ? parseInt(m[1], 10) : null
}

async function main() {
  // ── 1. Fetch task 37 with all relations ──
  const task = await prisma.teachingTask.findUnique({
    where: { id: 37 },
    include: {
      course: true,
      teacher: true,
      taskClasses: { include: { classGroup: true } },
      scheduleSlots: { include: { room: true } },
      importBatch: true,
      semester: true,
    },
  })

  if (!task) {
    console.log('ERROR: Task 37 not found')
    await prisma.$disconnect()
    process.exit(1)
  }

  // ── 2. Build class group info ──
  const classGroups = task.taskClasses.map((tc) => ({
    id: tc.classGroup.id,
    name: tc.classGroup.name,
    studentCount: tc.classGroup.studentCount,
    semesterId: tc.classGroup.semesterId,
    cohortYear: extractCohortYear(tc.classGroup.name),
  }))

  const cohortYears = [...new Set(classGroups.map((cg) => cg.cohortYear).filter(Boolean))]
  const isCrossCohort = cohortYears.length > 1

  // ── 3. Build TTC link info ──
  const ttcLinks = task.taskClasses.map((tc) => ({
    id: tc.id,
    teachingTaskId: tc.teachingTaskId,
    classGroupId: tc.classGroupId,
    classGroupName: tc.classGroup.name,
  }))

  // ── 4. Build slot info ──
  const slots = task.scheduleSlots.map((s) => ({
    id: s.id,
    teachingTaskId: s.teachingTaskId,
    dayOfWeek: s.dayOfWeek,
    slotIndex: s.slotIndex,
    roomId: s.roomId,
    roomName: s.room?.name || null,
    roomCapacity: s.room?.capacity || null,
  }))

  // ── 5. Check if CG 35 (2024级森林草原防火技术1班) is linked ──
  const hasCg35 = classGroups.some((cg) => cg.id === 35)

  // ── 6. Count total cross-cohort tasks in DB ──
  const allTasks = await prisma.teachingTask.findMany({
    include: { taskClasses: { include: { classGroup: true } } },
  })
  const crossCohortTasks = allTasks.filter((t) => {
    const years = [
      ...new Set(
        t.taskClasses
          .map((tc) => extractCohortYear(tc.classGroup.name))
          .filter(Boolean)
      ),
    ]
    return years.length > 1
  })

  // ── 7. Terminal output ──
  console.log('K18-D1 Task37 Readonly State Inspection')
  console.log('')
  console.log(`Summary:`)
  console.log(`TASK_ID: ${task.id}`)
  console.log(`COURSE: ${task.course.name}`)
  console.log(`TEACHER: ${task.teacher?.name || 'null'}`)
  console.log(`IMPORT_BATCH_ID: ${task.importBatchId}`)
  console.log(`IMPORT_BATCH_STATUS: ${task.importBatch?.status || 'null'}`)
  console.log(`SEMESTER_ID: ${task.semesterId}`)
  console.log(`REMARK: ${task.remark || 'null'}`)
  console.log(`CLASS_GROUP_COUNT: ${classGroups.length}`)
  console.log(`CLASS_GROUPS: ${classGroups.map((cg) => `${cg.id}(${cg.name})`).join(', ')}`)
  console.log(`TTC_LINK_IDS: ${ttcLinks.map((l) => l.id).join(', ')}`)
  console.log(`SCHEDULE_SLOT_IDS: ${slots.map((s) => s.id).join(', ')}`)
  console.log(`COHORT_YEARS: [${cohortYears.join(', ')}]`)
  console.log(`IS_CROSS_COHORT: ${isCrossCohort}`)
  console.log(`HAS_CG_35: ${hasCg35}`)
  console.log(`TOTAL_CROSS_COHORT_TASKS: ${crossCohortTasks.length}`)
  console.log(`IS_ONLY_REMAINING_CROSS_COHORT_CANDIDATE: ${crossCohortTasks.length === 1 && crossCohortTasks[0].id === 37}`)

  // ── 8. Build JSON output ──
  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'K18-D1',
    mode: 'read-only',
    task37: {
      id: task.id,
      courseId: task.courseId,
      courseName: task.course.name,
      teacherId: task.teacherId,
      teacherName: task.teacher?.name || null,
      semesterId: task.semesterId,
      importBatchId: task.importBatchId,
      importBatchStatus: task.importBatch?.status || null,
      importBatchConfirmedAt: task.importBatch?.confirmedAt || null,
      remark: task.remark,
      weekType: task.weekType,
      startWeek: task.startWeek,
      endWeek: task.endWeek,
    },
    classGroups,
    ttcLinks,
    scheduleSlots: slots,
    analysis: {
      cohortYears,
      isCrossCohort,
      hasCg35,
      cg35Name: hasCg35 ? classGroups.find((cg) => cg.id === 35)?.name : null,
      totalCrossCohortTasks: crossCohortTasks.length,
      crossCohortTaskIds: crossCohortTasks.map((t) => t.id),
      isOnlyRemainingCrossCohortCandidate:
        crossCohortTasks.length === 1 && crossCohortTasks[0].id === 37,
    },
  }

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true })
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`\nJSON written: ${OUTPUT_JSON}`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
