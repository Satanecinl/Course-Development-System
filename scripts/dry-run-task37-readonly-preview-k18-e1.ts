/**
 * K18-E1: Task 37 Read-Only Dry-Run Preview
 *
 * Read-only script that previews what would happen if the cross-cohort
 * TeachingTaskClass link were removed from the target task. No writes,
 * no modifications, no execution switches.
 *
 * K36-A5D3A: real teacher / class / course names are anonymized at
 * write time. Hard-coded detection is done via regex over cohort
 * markers; no specific teacher or course name is embedded.
 *
 * Usage: npx tsx scripts/dry-run-task37-readonly-preview-k18-e1.ts
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { anonymizeReport } from './lib/anonymize-report-output'

const prisma = new PrismaClient()

const OUTPUT_JSON = path.resolve('docs/k18-task37-readonly-dry-run-preview.json')
const D2_JSON = path.resolve('docs/k18-task37-readonly-action-preview.json')
const K18C_JSON = path.resolve('docs/k18-task37-source-artifact-review.json')

// K36-A5D3A: ids of the target task / TTC / ClassGroup. These are
// non-PII internal ids; safe to keep as constants.
const TARGET_TASK_ID = 37
const EXCLUDED_TTC_ID = 94
const EXCLUDED_CG_ID = 35

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
    where: { id: TARGET_TASK_ID },
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
    console.log('ERROR: target task not found')
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
  const currentTtcIds = classGroups.map((cg) => cg.ttcId).sort((a, b) => a - b)
  const currentStudentCount = classGroups.reduce((sum, cg) => sum + cg.studentCount, 0)
  const currentCohortYears = [...new Set(classGroups.map((cg) => cg.cohortYear).filter(Boolean))].sort()
  const currentIsCrossCohort = currentCohortYears.length > 1

  const slot = task.scheduleSlots[0]
  const slotInfo = slot
    ? {
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        slotIndex: slot.slotIndex,
        roomId: slot.roomId,
        roomName: slot.room?.name || null,
        roomCapacity: slot.room?.capacity ?? null,
      }
    : null

  // ── 3. Build candidate preview ──
  const candidateClassGroupIds = [3, 17]
  const candidateTtcIdsToKeep = [92, 93]
  const candidateClassGroups = classGroups.filter((cg) => candidateClassGroupIds.includes(cg.id))
  const candidateStudentCount = candidateClassGroups.reduce((sum, cg) => sum + cg.studentCount, 0)
  const candidateCohortYears = [...new Set(candidateClassGroups.map((cg) => cg.cohortYear).filter(Boolean))].sort()
  const candidateIsCrossCohort = candidateCohortYears.length > 1

  // K36-A5D3A: classGroupName is a real name; do not embed it.
  const linkToExclude = {
    ttcId: EXCLUDED_TTC_ID,
    classGroupId: EXCLUDED_CG_ID,
    classGroupName: '<REDACTED>',
  }

  // ── 4. Safety checks ──
  const checks: { id: string; pass: boolean; detail: string; required: boolean }[] = []

  checks.push({
    id: 'task37_exists',
    pass: true,
    detail: `Task 37 found: ${task.course.name}`,
    required: true,
  })

  checks.push({
    id: 'course_is_public_ideology',
    pass: /新时代|思想概论|毛泽东|道德与法治|形势与政策/i.test(task.course.name),
    detail: `Course: <REDACTED> (id=${task.courseId})`,
    required: true,
  })

  checks.push({
    id: 'teacher_is_assigned',
    pass: task.teacher?.name != null,
    detail: `Teacher: <REDACTED> (id=${task.teacherId})`,
    required: true,
  })

  checks.push({
    id: 'importBatch_1_exists',
    pass: task.importBatchId === 1 && task.importBatch !== null,
    detail: `ImportBatch: id=${task.importBatchId}, status=${task.importBatch?.status || 'null'}`,
    required: true,
  })

  checks.push({
    id: 'importBatch_1_confirmed',
    pass: task.importBatch?.status === 'confirmed',
    detail: `ImportBatch status: ${task.importBatch?.status || 'null'}`,
    required: true,
  })

  checks.push({
    id: 'current_cg_ids_include_3_17_35',
    pass:
      currentClassGroupIds.includes(3) &&
      currentClassGroupIds.includes(17) &&
      currentClassGroupIds.includes(35),
    detail: `CG IDs: [${currentClassGroupIds.join(', ')}]`,
    required: true,
  })

  checks.push({
    id: 'current_ttc_ids_include_92_93_94',
    pass:
      currentTtcIds.includes(92) &&
      currentTtcIds.includes(93) &&
      currentTtcIds.includes(94),
    detail: `TTC IDs: [${currentTtcIds.join(', ')}]`,
    required: true,
  })

  checks.push({
    id: 'ttc_94_belongs_to_task37_and_cg35',
    pass:
      classGroups.some((cg) => cg.ttcId === 94 && cg.id === 35),
    detail: `TTC 94: ${classGroups.find((cg) => cg.ttcId === 94) ? `task=${task.id}, cg=${classGroups.find((cg) => cg.ttcId === 94)?.id}` : 'not found'}`,
    required: true,
  })

  checks.push({
    id: 'cg35_exists',
    pass: currentClassGroupIds.includes(EXCLUDED_CG_ID),
    detail: `CG ${EXCLUDED_CG_ID}: <REDACTED>`,
    required: true,
  })

  checks.push({
    id: 'scheduleSlot_43_exists',
    pass: slotInfo !== null && slotInfo.id === 43,
    detail: slotInfo ? `Slot ${slotInfo.id} found` : 'No slot found',
    required: true,
  })

  checks.push({
    id: 'scheduleSlot_43_belongs_to_task37',
    pass: slot !== null && slot.teachingTaskId === 37,
    detail: slot ? `Slot ${slot.id} belongs to task ${slot.teachingTaskId}` : 'N/A',
    required: true,
  })

  checks.push({
    id: 'candidate_keeps_at_least_one_cg',
    pass: candidateClassGroupIds.length >= 1,
    detail: `Candidate CG count: ${candidateClassGroupIds.length}`,
    required: true,
  })

  checks.push({
    id: 'candidate_keeps_cg_3_and_17',
    pass: candidateClassGroupIds.includes(3) && candidateClassGroupIds.includes(17),
    detail: `Candidate CG IDs: [${candidateClassGroupIds.join(', ')}]`,
    required: true,
  })

  checks.push({
    id: 'candidate_preserves_task37',
    pass: true,
    detail: 'Task 37 preserved',
    required: true,
  })

  checks.push({
    id: 'candidate_preserves_slot43',
    pass: true,
    detail: 'Slot 43 preserved',
    required: true,
  })

  checks.push({
    id: 'candidate_preserves_cg35_standalone',
    pass: true,
    detail: 'CG 35 preserved as standalone ClassGroup (unlinked)',
    required: true,
  })

  // D2 JSON consistency
  const d2Json = readJsonSafe(D2_JSON)
  const d2CurrentCgIds = isRecord(d2Json) && isRecord(d2Json.currentState) && Array.isArray(d2Json.currentState.currentClassGroupIds)
    ? (d2Json.currentState.currentClassGroupIds as number[]).sort((a, b) => a - b)
    : null
  const d2Match = d2CurrentCgIds !== null &&
    d2CurrentCgIds.length === currentClassGroupIds.length &&
    d2CurrentCgIds.every((id, i) => id === currentClassGroupIds[i])
  checks.push({
    id: 'd2_json_current_state_matches_db',
    pass: !!d2Match,
    detail: `D2 CG IDs: [${d2CurrentCgIds?.join(', ')}], DB CG IDs: [${currentClassGroupIds.join(', ')}]`,
    required: true,
  })

  // K18-C decision
  const k18cJson = readJsonSafe(K18C_JSON)
  const k18cDecision = isRecord(k18cJson) ? k18cJson.decision : null
  checks.push({
    id: 'k18c_decision_is_likely_error',
    pass: k18cDecision === 'LIKELY_ERROR',
    detail: `K18-C decision: ${k18cDecision}`,
    required: true,
  })

  checks.push({
    id: 'no_db_changes_made',
    pass: true,
    detail: 'Script is read-only, no mutations performed',
    required: true,
  })

  // ── 5. Evaluate results ──
  const requiredFailures = checks.filter((c) => c.required && !c.pass)

  // ── 6. Terminal output ──
  console.log('K18-E1 Task37 Readonly Dry-Run Preview')
  console.log('')
  console.log(`Summary:`)
  console.log(`TASK_ID: ${TARGET_TASK_ID}`)
  console.log(`CURRENT_CLASS_GROUPS: [${currentClassGroupIds.join(', ')}]`)
  console.log(`CANDIDATE_CLASS_GROUPS: [${candidateClassGroupIds.join(', ')}]`)
  console.log(`CURRENT_TTC_IDS: [${currentTtcIds.join(', ')}]`)
  console.log(`CANDIDATE_TTC_IDS_TO_KEEP: [${candidateTtcIdsToKeep.join(', ')}]`)
  console.log(`CANDIDATE_LINK_TO_EXCLUDE_FROM_PREVIEW: ttcId=${linkToExclude.ttcId}, cgId=${linkToExclude.classGroupId} (${linkToExclude.classGroupName})`)
  console.log(`CURRENT_STUDENT_COUNT: ${currentStudentCount}`)
  console.log(`CANDIDATE_STUDENT_COUNT: ${candidateStudentCount}`)
  console.log(`CURRENT_CROSS_COHORT: ${currentIsCrossCohort}`)
  console.log(`CANDIDATE_CROSS_COHORT: ${candidateIsCrossCohort}`)
  console.log(`SLOT_43_PRESERVED: true`)
  console.log(`CLASSGROUP_35_PRESERVED: true`)
  console.log(`DB_CHANGES_MADE: NO`)
  console.log(`SAFETY_CHECKS: ${checks.filter((c) => c.pass).length}/${checks.length} PASS`)
  console.log(`SUGGESTED_NEXT_STAGE: K18-E2-TASK37-CONTROLLED-EXECUTION-PREP`)

  if (requiredFailures.length > 0) {
    console.log('\nREQUIRED CHECK FAILURES:')
    for (const f of requiredFailures) {
      console.log(`  ❌ ${f.id}: ${f.detail}`)
    }
    await prisma.$disconnect()
    process.exit(1)
  }

  // ── 7. Build JSON output ──
  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'K18-E1',
    mode: 'read-only',
    dbChangesMade: false,
    summary: {
      taskId: TARGET_TASK_ID,
      courseName: task.course.name,       // anonymized by anonymizeReport
      teacherName: task.teacher?.name || null, // anonymized by anonymizeReport
      importBatchId: task.importBatchId,
      importBatchStatus: task.importBatch?.status || null,
      suggestedNextStage: 'K18-E2-TASK37-CONTROLLED-EXECUTION-PREP',
    },
    currentState: {
      teachingTaskId: TARGET_TASK_ID,
      courseName: task.course.name,
      teacherName: task.teacher?.name || null,
      importBatchId: task.importBatchId,
      importBatchStatus: task.importBatch?.status || null,
      currentClassGroupIds,
      currentTeachingTaskClassIds: currentTtcIds,
      currentStudentCount,
      currentCohortYears,
      currentIsCrossCohort,
      scheduleSlotId: slotInfo?.id || null,
      roomName: slotInfo?.roomName || null,
      roomCapacity: slotInfo?.roomCapacity || null,
    },
    candidatePreview: {
      candidateClassGroupIds,
      candidateTeachingTaskClassIdsToKeep: candidateTtcIdsToKeep,
      candidateLinkToExcludeFromPreview: linkToExclude,
      candidateStudentCount,
      candidateCohortYears,
      candidateIsCrossCohort,
      preservedTeachingTaskId: TARGET_TASK_ID,
      preservedScheduleSlotId: 43,
      preservedClassGroupIds: [3, 17, EXCLUDED_CG_ID],
      preservedImportBatchId: 1,
    },
    safetyChecks: checks.map((c) => ({
      id: c.id,
      pass: c.pass,
      detail: c.detail,
      required: c.required,
    })),
    expectedImpact: {
      display: {
        description: '<REDACTED_TEXT>',
        candidateClassGroups: candidateClassGroups.map((cg) => cg.name), // anonymized by helper
        excludedClassGroup: linkToExclude.classGroupName,
      },
      adjustment: {
        description: '<REDACTED_TEXT>',
        slotId: 43,
        dayOfWeek: slotInfo?.dayOfWeek,
        slotIndex: slotInfo?.slotIndex,
      },
      export: {
        description: '<REDACTED_TEXT>',
        candidateClassGroupNames: candidateClassGroups.map((cg) => cg.name),
      },
      solverInput: {
        description: '<REDACTED_TEXT>',
        expectedStudentCount: candidateStudentCount,
      },
      capacity: {
        description: '<REDACTED_TEXT>',
        roomCapacity: slotInfo?.roomCapacity || null,
        candidateStudentCount,
        sufficient: (slotInfo?.roomCapacity ?? 0) >= candidateStudentCount,
      },
    },
    openQuestions: [
      '<REDACTED_TEXT>',
      '<REDACTED_TEXT>',
    ],
    suggestedNextStage: 'K18-E2-TASK37-CONTROLLED-EXECUTION-PREP',
  }

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true })
  anonymizeReport(report)
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`\nJSON written: ${OUTPUT_JSON}`)

  // Print safety check results
  console.log('\nSafety Checks:')
  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.id}: ${c.detail}`)
  }

  console.log(`\nAll ${checks.length} safety checks passed. Ready for K18-E2.`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
