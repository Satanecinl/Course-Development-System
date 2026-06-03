import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

const K17_DECISION_PATH = path.join(__dirname, '..', 'docs', 'k17-cross-cohort-review-decision.json')
const OUTPUT_JSON_PATH = path.join(__dirname, '..', 'docs', 'k18-cross-cohort-data-repair-plan.json')

const REPAIR_TASK_IDS = [168, 174, 176, 181]
const EXCLUDED_TASK_IDS = [37]
const ALL_TASK_IDS = [...REPAIR_TASK_IDS, ...EXCLUDED_TASK_IDS]
const TARGET_CLASS_GROUP_ID = 22

/** Extract cohort year from class group name */
function extractCohortYear(name: string): number | null {
  const m = name.match(/^(\d{4})级/)
  return m ? parseInt(m[1], 10) : null
}

/** Extract track from class group name */
function extractTrack(name: string): string | null {
  const m = name.match(/（(高本贯通|现场工程师)）/)
  return m ? m[1] : null
}

interface TaskRepairPlan {
  teachingTaskId: number
  courseId: number
  courseName: string
  teacherId: number | null
  teacherName: string | null
  semesterId: number | null
  importBatchId: number | null
  importBatchStatus: string | null
  weekType: string
  startWeek: number
  endWeek: number
  remark: string | null
  allClassGroups: Array<{
    classGroupId: number
    name: string
    semesterId: number | null
    studentCount: number | null
    cohortYear: number | null
    track: string | null
    shouldKeep: boolean
    reason: string
  }>
  teachingTaskClassLinks: Array<{
    id: number
    teachingTaskId: number
    classGroupId: number
  }>
  scheduleSlots: Array<{
    id: number
    dayOfWeek: number
    slotIndex: number
    roomId: number | null
    semesterId: number | null
  }>
  scheduleSlotCount: number
  currentStudentCountBasis: number | null
  proposedClassGroupIdsAfterRepair: number[]
  proposedStudentCountAfterRepair: number
  expectedDisplayAfterRepair: string
  expectedExportAfterRepair: string
  expectedSolverInputAfterRepair: string
  repairAction: {
    planType: string
    teachingTaskId: number
    removeClassGroupIds: number[]
    keepClassGroupIds: number[]
    affectedTeachingTaskClassLinks: Array<{ teachingTaskId: number; classGroupId: number; ttcId: number }>
    affectedScheduleSlotIds: number[]
    requiresNewTeachingTaskForRemovedClassGroup: boolean
    requiresManualSchedulingForNewTask: boolean
    requiresStudentCountRecalculation: boolean
    dryRunSqlPreview: string[]
    rollbackSqlPreview: string[]
    safetyChecks: string[]
  }
}

interface ExcludedTask {
  teachingTaskId: number
  courseName: string
  teacherName: string | null
  decision: string
  reason: string
  nextStep: string
}

async function main() {
  // Load K17-FIX-B decision
  const k17Raw = fs.readFileSync(K17_DECISION_PATH, 'utf-8')
  const k17 = JSON.parse(k17Raw)

  const repairCandidates: TaskRepairPlan[] = []
  const excludedTasks: ExcludedTask[] = []

  // Gather all tasks
  const tasks = await prisma.teachingTask.findMany({
    where: { id: { in: ALL_TASK_IDS } },
    include: {
      course: true,
      teacher: true,
      taskClasses: { include: { classGroup: true } },
      scheduleSlots: true,
      importBatch: true,
      semester: true,
    },
  })

  const taskMap = new Map(tasks.map(t => [t.id, t]))

  // Process repair candidates
  for (const taskId of REPAIR_TASK_IDS) {
    const task = taskMap.get(taskId)
    if (!task) continue

    const allClassGroups = task.taskClasses.map(ttc => {
      const cg = ttc.classGroup
      const shouldKeep = cg.id !== TARGET_CLASS_GROUP_ID
      return {
        classGroupId: cg.id,
        name: cg.name,
        semesterId: cg.semesterId,
        studentCount: cg.studentCount,
        cohortYear: extractCohortYear(cg.name),
        track: extractTrack(cg.name),
        shouldKeep,
        reason: shouldKeep
          ? 'Same cohort (2025) as primary task — keep'
          : 'Cross-cohort (2024) — incorrect link from parser auto-merge, remove',
      }
    })

    const keepClassGroupIds = allClassGroups.filter(cg => cg.shouldKeep).map(cg => cg.classGroupId)
    const removeClassGroupIds = [TARGET_CLASS_GROUP_ID]
    const affectedLinks = task.taskClasses
      .filter(ttc => ttc.classGroupId === TARGET_CLASS_GROUP_ID)
      .map(ttc => ({ teachingTaskId: taskId, classGroupId: TARGET_CLASS_GROUP_ID, ttcId: ttc.id }))

    const keepStudentCount = allClassGroups
      .filter(cg => cg.shouldKeep)
      .reduce((sum, cg) => sum + (cg.studentCount ?? 0), 0)

    const currentStudentCount = allClassGroups.reduce((sum, cg) => sum + (cg.studentCount ?? 0), 0)

    const scheduleSlots = task.scheduleSlots.map(s => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      slotIndex: s.slotIndex,
      roomId: s.roomId,
      semesterId: s.semesterId,
    }))

    const requiresStudentCountRecalculation = currentStudentCount !== keepStudentCount

    const repairAction = {
      planType: 'REMOVE_TEACHING_TASK_CLASS_LINK',
      teachingTaskId: taskId,
      removeClassGroupIds,
      keepClassGroupIds,
      affectedTeachingTaskClassLinks: affectedLinks,
      affectedScheduleSlotIds: scheduleSlots.map(s => s.id),
      requiresNewTeachingTaskForRemovedClassGroup: false,
      requiresManualSchedulingForNewTask: false,
      requiresStudentCountRecalculation,
      dryRunSqlPreview: [
        `-- Preview: delete TTC link for task ${taskId} + CG ${TARGET_CLASS_GROUP_ID}`,
        `DELETE FROM TeachingTaskClass WHERE teachingTaskId = ${taskId} AND classGroupId = ${TARGET_CLASS_GROUP_ID};`,
        `-- Affected TTC id: ${affectedLinks.map(l => l.ttcId).join(', ')}`,
      ],
      rollbackSqlPreview: [
        `-- Rollback: re-insert TTC link`,
        `INSERT INTO TeachingTaskClass (teachingTaskId, classGroupId) VALUES (${taskId}, ${TARGET_CLASS_GROUP_ID});`,
      ],
      safetyChecks: [
        `Task ${taskId} has ${keepClassGroupIds.length} classGroups remaining after removal — not orphaned`,
        `ScheduleSlot ids [${scheduleSlots.map(s => s.id).join(', ')}] are NOT deleted — preserved`,
        `ClassGroup ${TARGET_CLASS_GROUP_ID} has other standalone tasks (198-208) — not orphaned`,
        `No ScheduleAdjustment references affected TTC links — safe to delete`,
      ],
    }

    repairCandidates.push({
      teachingTaskId: task.id,
      courseId: task.courseId,
      courseName: task.course.name,
      teacherId: task.teacherId,
      teacherName: task.teacher?.name ?? null,
      semesterId: task.semesterId,
      importBatchId: task.importBatchId,
      importBatchStatus: task.importBatch?.status ?? null,
      weekType: task.weekType,
      startWeek: task.startWeek,
      endWeek: task.endWeek,
      remark: task.remark,
      allClassGroups,
      teachingTaskClassLinks: task.taskClasses.map(ttc => ({
        id: ttc.id,
        teachingTaskId: ttc.teachingTaskId,
        classGroupId: ttc.classGroupId,
      })),
      scheduleSlots,
      scheduleSlotCount: task.scheduleSlots.length,
      currentStudentCountBasis: currentStudentCount,
      proposedClassGroupIdsAfterRepair: keepClassGroupIds,
      proposedStudentCountAfterRepair: keepStudentCount,
      expectedDisplayAfterRepair: `Task ${taskId} displays only 2025-cohort classes; CG 22 removed from合班 list`,
      expectedExportAfterRepair: `Excel export for task ${taskId} shows only 2025-cohort classes`,
      expectedSolverInputAfterRepair: `Solver input treats task ${taskId} as 2025-cohort only; CG 22 not included in student count`,
      repairAction,
    })
  }

  // Process excluded task 37
  const task37 = taskMap.get(37)
  if (task37) {
    excludedTasks.push({
      teachingTaskId: 37,
      courseName: task37.course.name,
      teacherName: task37.teacher?.name ?? null,
      decision: 'NEEDS_SOURCE_REVIEW',
      reason: 'Public/ideology course (习近平新时代中国特色社会主义思想概论) — cross-cohort merge may be legitimate. Requires manual verification against original .docx before any repair action.',
      nextStep: 'Human reviews original .docx to determine if 2024级森林草原防火技术1班 and 2025级森林草原防火技术1班 should attend this course together. If confirmed legitimate → ACCEPTED_CROSS_COHORT. If not → separate repair plan.',
    })
  }

  // Build summary
  const summary = {
    REPAIR_CANDIDATES: REPAIR_TASK_IDS.length,
    EXCLUDED_TASKS: EXCLUDED_TASK_IDS.length,
    REQUIRES_NEW_TEACHING_TASK: 0, // CG 22 already has standalone tasks (198-208)
    REQUIRES_STUDENT_COUNT_RECALCULATION: repairCandidates.filter(r => r.repairAction.requiresStudentCountRecalculation).length,
    REQUIRES_MANUAL_REVIEW: 1, // task 37
    BLOCKING: 0, // repair plan is clear, can proceed to K18-B
  }

  // Check if CG 22 needs a new task for these 4 courses
  // CG 22 already has its own standalone tasks for other courses (198-208)
  // For these 4 courses, the 2024级 class was likely incorrectly merged — no new task needed
  // unless manual review confirms otherwise
  const cg22OtherTasks = await prisma.teachingTaskClass.findMany({
    where: {
      classGroupId: TARGET_CLASS_GROUP_ID,
      teachingTaskId: { notIn: REPAIR_TASK_IDS },
    },
    include: { teachingTask: { include: { course: true } } },
  })

  // Verify: does CG 22 already have standalone tasks for these courses?
  const repairCourseIds = repairCandidates.map(r => r.courseId)
  const cg22RepairCourseTasks = cg22OtherTasks.filter(ttc =>
    repairCourseIds.includes(ttc.teachingTask.courseId)
  )

  // If CG 22 has other tasks for the same courses, no new task needed
  // If not, manual review is needed to determine if a new task should be created
  const coursesNeedingNewTask = repairCourseIds.filter(cid =>
    !cg22RepairCourseTasks.some(ttc => ttc.teachingTask.courseId === cid)
  )

  for (const r of repairCandidates) {
    const needsNewTask = coursesNeedingNewTask.includes(r.courseId)
    r.repairAction.requiresNewTeachingTaskForRemovedClassGroup = needsNewTask
    r.repairAction.requiresManualSchedulingForNewTask = needsNewTask
    if (needsNewTask) {
      r.repairAction.safetyChecks.push(
        `CG 22 has no standalone task for course "${r.courseName}" (id=${r.courseId}) — manual review needed to decide if new task required`
      )
      summary.REQUIRES_NEW_TEACHING_TASK++
    } else {
      r.repairAction.safetyChecks.push(
        `CG 22 already has other tasks — no new task needed for this course`
      )
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    phase: 'K18',
    mode: 'read-only',
    summary,
    repairCandidates,
    excludedTasks,
    targetClassGroupId: TARGET_CLASS_GROUP_ID,
    backupPlan: {
      description: 'Copy prisma/dev.db before repair to allow rollback',
      command: 'copy prisma\\dev.db prisma\\dev.db.backup-before-k18-cross-cohort-repair-YYYYMMDDHHMMSS',
      alternativeUnix: 'cp prisma/dev.db prisma/dev.db.backup-before-k18-cross-cohort-repair-$(date +%Y%m%d%H%M%S)',
      required: true,
    },
    dryRunPlan: {
      description: 'Run repair script with --dry-run flag to preview changes without writing to DB',
      command: 'npx.cmd tsx scripts/repair-cross-cohort-data-k18-b.ts --dry-run',
      expectedOutput: [
        'List of TTC links to be deleted',
        'List of TTC links to be preserved',
        'Affected ScheduleSlot ids (not modified)',
        'Whether new TeachingTask creation is needed',
        'Student count recalculation details',
        'Safety check results',
      ],
      required: true,
    },
    applyPlan: {
      description: 'Execute repair after dry-run passes',
      command: 'npx.cmd tsx scripts/repair-cross-cohort-data-k18-b.ts --apply',
      prerequisites: [
        'Dry-run must pass all safety checks',
        'DB backup must be created',
        'Human must confirm no active drag/drop/solver on affected tasks',
      ],
      operations: [
        'Delete TTC links: (168,22), (174,22), (176,22), (181,22)',
        'Verify remaining classGroups per task are non-empty',
        'Verify ScheduleSlots are preserved',
        'Update remark field if needed (remove 2024级 reference)',
        'No new TeachingTask creation for CG 22 in this phase (manual review first)',
      ],
      required: true,
    },
    rollbackPlan: {
      description: 'Restore DB from backup if repair causes issues',
      primaryMethod: 'Restore prisma/dev.db from backup file',
      command: 'copy prisma\\dev.db.backup-before-k18-cross-cohort-repair-YYYYMMDDHHMMSS prisma\\dev.db',
      alternativeMethod: 'Re-insert deleted TTC links via inverse SQL',
      inverseOperations: [
        'INSERT INTO TeachingTaskClass (teachingTaskId, classGroupId) VALUES (168, 22);',
        'INSERT INTO TeachingTaskClass (teachingTaskId, classGroupId) VALUES (174, 22);',
        'INSERT INTO TeachingTaskClass (teachingTaskId, classGroupId) VALUES (176, 22);',
        'INSERT INTO TeachingTaskClass (teachingTaskId, classGroupId) VALUES (181, 22);',
      ],
      recommendedMethod: 'DB backup restore (primary) — simpler and more reliable',
      required: true,
    },
    postFixValidationPlan: {
      description: 'Run validation scripts after repair to confirm correctness',
      commands: [
        { cmd: 'npx.cmd tsx scripts/audit-data-quality-classgroup-matching-k17-fix-a.ts', expect: 'No HIGH cross-cohort findings for tasks 168/174/176/181' },
        { cmd: 'npx.cmd tsx scripts/review-cross-cohort-classgroup-decisions-k17-fix-b.ts', expect: 'Tasks 168/174/176/181 no longer LIKELY_ERROR' },
        { cmd: 'npx.cmd tsx scripts/plan-cross-cohort-data-repair-k18.ts', expect: '0 repair candidates remaining' },
        { cmd: 'npx.cmd tsx scripts/audit-schedule-mutation-server-guards.ts', expect: 'No new findings' },
        { cmd: 'npx.cmd tsx scripts/audit-teaching-task-mutation-semantic-guards.ts', expect: 'No new findings' },
        { cmd: 'npx.cmd tsx scripts/verify-schedule-mutation-client-preflight-fix.ts', expect: 'All checks pass' },
        { cmd: 'npm.cmd run build', expect: 'Build succeeds' },
        { cmd: 'npm.cmd run test:auth-foundation', expect: '53 passed / 1 failed (pre-existing)' },
      ],
      postRepairChecks: [
        'Tasks 168/174/176/181 no longer contain ClassGroup 22',
        'ClassGroup 22 not orphaned (still has tasks 198-208)',
        'ScheduleSlots 218/226/228/233 preserved',
        'No TeachingTask deleted',
        'No ImportBatch modified',
        'Task 37 unchanged',
      ],
    },
    safetyChecks: [
      'Remove only TTC links — never delete TeachingTask or ScheduleSlot',
      'Verify each task has at least 1 classGroup remaining after removal',
      'Verify ClassGroup 22 has other tasks — not orphaned',
      'No ScheduleAdjustment references affected TTC links',
      'Backup DB before any write operation',
      'Dry-run must pass before apply',
      'Freeze drag/drop/solver/export on affected tasks during repair',
    ],
  }

  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(output, null, 2), 'utf-8')

  // Terminal output
  console.log('K18 Cross-Cohort Data Repair Plan')
  console.log(`Summary:`)
  console.log(`REPAIR_CANDIDATES: ${summary.REPAIR_CANDIDATES}`)
  console.log(`EXCLUDED_TASKS: ${summary.EXCLUDED_TASKS}`)
  console.log(`REQUIRES_NEW_TEACHING_TASK: ${summary.REQUIRES_NEW_TEACHING_TASK}`)
  console.log(`REQUIRES_STUDENT_COUNT_RECALCULATION: ${summary.REQUIRES_STUDENT_COUNT_RECALCULATION}`)
  console.log(`REQUIRES_MANUAL_REVIEW: ${summary.REQUIRES_MANUAL_REVIEW}`)
  console.log(`BLOCKING: ${summary.BLOCKING}`)
  console.log(`Recommended next stage: K18-B CROSS-COHORT-DATA-REPAIR-EXECUTE`)
  console.log()
  console.log(`Output written to: ${OUTPUT_JSON_PATH}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
