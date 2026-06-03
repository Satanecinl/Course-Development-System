/**
 * K18-D2: Task 37 Read-Only Action Preview
 *
 * Read-only script that previews the candidate state for TeachingTask 37
 * after hypothetical repair (removing CG 35 link). No writes, no modifications.
 *
 * Usage: npx tsx scripts/preview-task37-readonly-candidate-state-k18-d2.ts
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

const OUTPUT_JSON = path.resolve('docs/k18-task37-readonly-action-preview.json')
const D1_JSON = path.resolve('docs/k18-task37-readonly-state-inspection.json')
const K18C_JSON = path.resolve('docs/k18-task37-source-artifact-review.json')

function extractCohortYear(name: string): number | null {
  const m = name.match(/^(\d{4})级/)
  return m ? parseInt(m[1], 10) : null
}

function readJsonSafe(filePath: string): unknown {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function main() {
  // ── 1. Fetch current DB state ──
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

  // ── 2. Build current state ──
  const classGroups = task.taskClasses.map((tc) => ({
    id: tc.classGroup.id,
    name: tc.classGroup.name,
    cohortYear: extractCohortYear(tc.classGroup.name),
    studentCount: tc.classGroup.studentCount ?? 0,
    ttcId: tc.id,
  }))

  const currentClassGroupIds = classGroups.map((cg) => cg.id).sort((a, b) => a - b)
  const currentStudentCount = classGroups.reduce((sum, cg) => sum + cg.studentCount, 0)
  const currentCohortYears = [...new Set(classGroups.map((cg) => cg.cohortYear).filter(Boolean))].sort()
  const currentIsCrossCohort = currentCohortYears.length > 1

  const slot = task.scheduleSlots[0]
  const scheduleSlotInfo = slot
    ? {
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        slotIndex: slot.slotIndex,
        roomId: slot.roomId,
        roomName: slot.room?.name || null,
        capacity: slot.room?.capacity || null,
      }
    : null

  // ── 3. Build candidate state ──
  const candidateClassGroupIds = [3, 17]
  const candidateClassGroups = classGroups.filter((cg) => candidateClassGroupIds.includes(cg.id))
  const candidateStudentCount = candidateClassGroups.reduce((sum, cg) => sum + cg.studentCount, 0)
  const candidateCohortYears = [...new Set(candidateClassGroups.map((cg) => cg.cohortYear).filter(Boolean))].sort()
  const candidateIsCrossCohort = candidateCohortYears.length > 1

  // ── 4. Load historical JSONs ──
  const d1Json = readJsonSafe(D1_JSON)
  const k18cJson = readJsonSafe(K18C_JSON)

  // ── 5. Consistency checks ──
  const checks: { check: string; pass: boolean; detail: string }[] = []

  checks.push({
    check: 'task37_exists',
    pass: true,
    detail: `Task 37 found: ${task.course.name}`,
  })

  checks.push({
    check: 'course_is_xi Jinping',
    pass: task.course.name === '习近平新时代中国特色社会主义思想概论',
    detail: `Course: ${task.course.name}`,
  })

  checks.push({
    check: 'teacher_is_fangZhongMin',
    pass: task.teacher?.name === '房忠敏',
    detail: `Teacher: ${task.teacher?.name || 'null'}`,
  })

  checks.push({
    check: 'current_links_include_ttc_92_93_94',
    pass:
      classGroups.some((cg) => cg.ttcId === 92) &&
      classGroups.some((cg) => cg.ttcId === 93) &&
      classGroups.some((cg) => cg.ttcId === 94),
    detail: `TTC IDs: ${classGroups.map((cg) => cg.ttcId).join(', ')}`,
  })

  checks.push({
    check: 'current_classgroup_ids_include_3_17_35',
    pass:
      currentClassGroupIds.includes(3) &&
      currentClassGroupIds.includes(17) &&
      currentClassGroupIds.includes(35),
    detail: `CG IDs: [${currentClassGroupIds.join(', ')}]`,
  })

  checks.push({
    check: 'scheduleSlot_43_exists',
    pass: scheduleSlotInfo !== null && scheduleSlotInfo.id === 43,
    detail: scheduleSlotInfo ? `Slot ${scheduleSlotInfo.id} found` : 'No slot found',
  })

  checks.push({
    check: 'scheduleSlot_43_belongs_to_task37',
    pass: scheduleSlotInfo !== null && task.scheduleSlots[0]?.teachingTaskId === 37,
    detail: scheduleSlotInfo
      ? `Slot ${scheduleSlotInfo.id} belongs to task ${task.scheduleSlots[0]?.teachingTaskId}`
      : 'N/A',
  })

  // Cross-cohort check
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
  checks.push({
    check: 'task37_only_remaining_cross_cohort',
    pass: crossCohortTasks.length === 1 && crossCohortTasks[0].id === 37,
    detail: `Cross-cohort tasks: ${crossCohortTasks.length} (ids: ${crossCohortTasks.map((t) => t.id).join(', ')})`,
  })

  // K18-C decision check
  const k18cDecision = isRecord(k18cJson) ? k18cJson.decision : null
  checks.push({
    check: 'k18c_decision_is_likely_error',
    pass: k18cDecision === 'LIKELY_ERROR',
    detail: `K18-C decision: ${k18cDecision}`,
  })

  // D1 consistency check
  const d1ClassGroups = isRecord(d1Json) && Array.isArray(d1Json.classGroups)
    ? (d1Json.classGroups as Record<string, unknown>[]).map((cg) => cg.id).sort((a, b) => (a as number) - (b as number))
    : null
  const d1Match = d1ClassGroups !== null &&
    d1ClassGroups.length === currentClassGroupIds.length &&
    d1ClassGroups.every((id, i) => id === currentClassGroupIds[i])
  checks.push({
    check: 'd1_json_consistent_with_db',
    pass: !!d1Match,
    detail: `D1 CG IDs: [${d1ClassGroups?.join(', ')}], DB CG IDs: [${currentClassGroupIds.join(', ')}]`,
  })

  // ── 6. Terminal output ──
  console.log('K18-D2 Task37 Readonly Action Preview')
  console.log('')
  console.log(`Summary:`)
  console.log(`TASK_ID: ${task.id}`)
  console.log(`CURRENT_CLASS_GROUPS: [${currentClassGroupIds.join(', ')}]`)
  console.log(`CANDIDATE_CLASS_GROUPS: [${candidateClassGroupIds.join(', ')}]`)
  console.log(`CURRENT_STUDENT_COUNT: ${currentStudentCount}`)
  console.log(`CANDIDATE_STUDENT_COUNT: ${candidateStudentCount}`)
  console.log(`CURRENT_CROSS_COHORT: ${currentIsCrossCohort}`)
  console.log(`CANDIDATE_CROSS_COHORT: ${candidateIsCrossCohort}`)
  console.log(`SLOT_PRESERVED: ${scheduleSlotInfo !== null}`)
  console.log(`DB_CHANGES_MADE: NO`)
  console.log(`SUGGESTED_NEXT_STAGE: K18-E-TASK37-DATA-REPAIR-EXECUTE`)

  // ── 7. Build JSON output ──
  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'K18-D2',
    mode: 'read-only',
    summary: {
      taskId: task.id,
      courseName: task.course.name,
      teacherName: task.teacher?.name || null,
      importBatchId: task.importBatchId,
      importBatchStatus: task.importBatch?.status || null,
      dbChangesMade: false,
      suggestedNextStage: 'K18-E-TASK37-DATA-REPAIR-EXECUTE',
    },
    currentState: {
      teachingTaskId: task.id,
      courseName: task.course.name,
      teacherName: task.teacher?.name || null,
      importBatchId: task.importBatchId,
      importBatchStatus: task.importBatch?.status || null,
      classGroups,
      scheduleSlot: scheduleSlotInfo,
      currentClassGroupIds,
      currentStudentCount,
      currentCohortYears,
      currentIsCrossCohort,
    },
    candidateState: {
      candidateClassGroupIds,
      candidateStudentCount,
      candidateCohortYears,
      candidateIsCrossCohort,
      preservedObjects: {
        teachingTaskId: 37,
        scheduleSlotId: 43,
        classGroupIdsStillExisting: [3, 17, 35],
        importBatchId: 1,
      },
      candidateDisplay: {
        classGroups: candidateClassGroups.map((cg) => cg.name),
        description: '只显示 2025级钢铁智能冶金技术1班（高本贯通）和 2025级森林草原防火技术1班',
      },
      candidateSolverInput: {
        expectedStudentCount: candidateStudentCount,
      },
      candidateExportImpact: {
        description: '不再包含 2024级森林草原防火技术1班',
      },
      candidateAdjustmentImpact: {
        description: 'slot 43 保持原 task 与时间位置',
        slotId: 43,
        dayOfWeek: slot?.dayOfWeek,
        slotIndex: slot?.slotIndex,
      },
    },
    consistencyChecks: checks,
    expectedImpact: {
      display: `修复后只显示 ${candidateClassGroups.length} 个班级，studentCount=${candidateStudentCount}`,
      adjustment: 'Slot 43 保持原位，调课功能不受影响',
      export: 'Excel 导出不再包含 2024级森林草原防火技术1班',
      solverInput: `以 ${candidateStudentCount} 人计算容量约束`,
      capacity: `Room capacity ${slot?.room?.capacity || 'unknown'} >= ${candidateStudentCount} students: ${(slot?.room?.capacity || 0) >= candidateStudentCount}`,
    },
    openQuestions: [
      '是否需要为 2024级森林草原防火技术1班 创建独立 TeachingTask？(K18-C 建议: 否，除非人工确认)',
      'ClassGroup 35 的学生是否需要在其他课程中重新安排？',
    ],
    suggestedNextStage: 'K18-E-TASK37-DATA-REPAIR-EXECUTE',
  }

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true })
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`\nJSON written: ${OUTPUT_JSON}`)

  // Print consistency check results
  console.log('\nConsistency Checks:')
  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.check}: ${c.detail}`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
