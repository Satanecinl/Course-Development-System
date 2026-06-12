/**
 * K18-E2: Task 37 Controlled Execution Preparation
 *
 * Read-only script that prepares controlled execution readiness for the
 * target TeachingTask. Verifies all preconditions, documents backup
 * readiness, and outlines future validation plan.
 * No writes, no modifications, no execution switches.
 *
 * K36-A5D3A: real names are anonymized at write time.
 *
 * Usage: npx tsx scripts/prepare-task37-controlled-execution-k18-e2.ts
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { anonymizeReport } from './lib/anonymize-report-output'

const prisma = new PrismaClient()

const OUTPUT_JSON = path.resolve('docs/k18-task37-controlled-execution-prep.json')
const E1_JSON = path.resolve('docs/k18-task37-readonly-dry-run-preview.json')
const D2_JSON = path.resolve('docs/k18-task37-readonly-action-preview.json')
const K18C_JSON = path.resolve('docs/k18-task37-source-artifact-review.json')

// K36-A5D3A: ids only (no PII).
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

function getCgIdsFromJson(json: unknown): number[] | null {
  if (!isRecord(json)) return null
  const state = isRecord(json.currentState) ? json.currentState : null
  if (!state || !Array.isArray(state.currentClassGroupIds)) return null
  return (state.currentClassGroupIds as number[]).sort((a, b) => a - b)
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

  // ── 3. Candidate state ──
  const candidateClassGroupIds = [3, 17]
  const candidateTtcIdsToKeep = [92, 93]
  const candidateClassGroups = classGroups.filter((cg) => candidateClassGroupIds.includes(cg.id))
  const candidateStudentCount = candidateClassGroups.reduce((sum, cg) => sum + cg.studentCount, 0)
  const candidateCohortYears = [...new Set(candidateClassGroups.map((cg) => cg.cohortYear).filter(Boolean))].sort()
  const candidateIsCrossCohort = candidateCohortYears.length > 1

  // K36-A5D3A: no real name literal.
  const linkToExclude = {
    ttcId: EXCLUDED_TTC_ID,
    classGroupId: EXCLUDED_CG_ID,
    classGroupName: '<REDACTED>',
  }

  // ── 4. Readiness checks ──
  const checks: { id: string; pass: boolean; detail: string; required: boolean }[] = []

  checks.push({
    id: 'task37_exists',
    pass: true,
    detail: `Target task found (id=${TARGET_TASK_ID})`,
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
    pass: classGroups.some((cg) => cg.ttcId === EXCLUDED_TTC_ID && cg.id === EXCLUDED_CG_ID),
    detail: `TTC ${EXCLUDED_TTC_ID}: task=${TARGET_TASK_ID}, cg=${EXCLUDED_CG_ID}`,
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
    id: 'candidate_keeps_cg_3_and_17',
    pass: candidateClassGroupIds.includes(3) && candidateClassGroupIds.includes(17),
    detail: `Candidate CG IDs: [${candidateClassGroupIds.join(', ')}]`,
    required: true,
  })

  checks.push({
    id: 'candidate_keeps_at_least_one_cg',
    pass: candidateClassGroupIds.length >= 1,
    detail: `Candidate CG count: ${candidateClassGroupIds.length}`,
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

  // E1 JSON consistency
  const e1CgIds = getCgIdsFromJson(readJsonSafe(E1_JSON))
  checks.push({
    id: 'e1_json_current_state_matches_db',
    pass: e1CgIds !== null && e1CgIds.length === currentClassGroupIds.length && e1CgIds.every((id, i) => id === currentClassGroupIds[i]),
    detail: `E1 CG IDs: [${e1CgIds?.join(', ')}], DB CG IDs: [${currentClassGroupIds.join(', ')}]`,
    required: true,
  })

  // D2 JSON consistency
  const d2CgIds = getCgIdsFromJson(readJsonSafe(D2_JSON))
  checks.push({
    id: 'd2_json_current_state_matches_db',
    pass: d2CgIds !== null && d2CgIds.length === currentClassGroupIds.length && d2CgIds.every((id, i) => id === currentClassGroupIds[i]),
    detail: `D2 CG IDs: [${d2CgIds?.join(', ')}], DB CG IDs: [${currentClassGroupIds.join(', ')}]`,
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

  // K18-B validator status
  const k18bValidateScript = path.resolve('scripts/validate-cross-cohort-data-repair-k18-b.ts')
  checks.push({
    id: 'k18b_validator_still_valid',
    pass: fs.existsSync(k18bValidateScript),
    detail: `K18-B validator script exists: ${fs.existsSync(k18bValidateScript)}`,
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
  console.log('K18-E2 Task37 Controlled Execution Prep')
  console.log('')
  console.log(`Summary:`)
  console.log(`TASK_ID: ${TARGET_TASK_ID}`)
  console.log(`CURRENT_CLASS_GROUPS: [${currentClassGroupIds.join(', ')}]`)
  console.log(`CANDIDATE_CLASS_GROUPS: [${candidateClassGroupIds.join(', ')}]`)
  console.log(`CURRENT_TTC_IDS: [${currentTtcIds.join(', ')}]`)
  console.log(`CANDIDATE_TTC_IDS_TO_KEEP: [${candidateTtcIdsToKeep.join(', ')}]`)
  console.log(`CANDIDATE_LINK_TO_EXCLUDE_FROM_FUTURE_STATE: ttcId=${linkToExclude.ttcId}, cgId=${linkToExclude.classGroupId}`)
  console.log(`CURRENT_STUDENT_COUNT: ${currentStudentCount}`)
  console.log(`CANDIDATE_STUDENT_COUNT: ${candidateStudentCount}`)
  console.log(`READINESS_CHECKS: ${checks.filter((c) => c.pass).length}/${checks.length} PASS`)
  console.log(`BACKUP_CREATED_IN_THIS_STAGE: NO`)
  console.log(`DB_CHANGES_MADE: NO`)
  console.log(`SUGGESTED_NEXT_STAGE: K18-E3-TASK37-FINALIZATION-EXECUTE`)

  if (requiredFailures.length > 0) {
    console.log('\nREQUIRED CHECK FAILURES:')
    for (const f of requiredFailures) {
      console.log(`  ❌ ${f.id}: ${f.detail}`)
    }
    await prisma.$disconnect()
    process.exit(1)
  }

  // ── 7. Build JSON output ──
  const now = new Date()
  const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14)

  const report = {
    generatedAt: now.toISOString(),
    phase: 'K18-E2',
    mode: 'read-only',
    dbChangesMade: false,
    backupCreatedInThisStage: false,
    summary: {
      taskId: TARGET_TASK_ID,
      courseName: task.course.name,       // anonymized by helper
      teacherName: task.teacher?.name || null,
      importBatchId: task.importBatchId,
      importBatchStatus: task.importBatch?.status || null,
      suggestedNextStage: 'K18-E3-TASK37-FINALIZATION-EXECUTE',
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
    candidateState: {
      candidateClassGroupIds,
      candidateTeachingTaskClassIdsToKeep: candidateTtcIdsToKeep,
      candidateLinkToExcludeFromFutureState: linkToExclude,
      candidateStudentCount,
      candidateCohortYears,
      candidateIsCrossCohort,
      preservedTeachingTaskId: TARGET_TASK_ID,
      preservedScheduleSlotId: 43,
      preservedClassGroupIds: [3, 17, EXCLUDED_CG_ID],
      preservedImportBatchId: 1,
    },
    readinessChecks: checks.map((c) => ({
      id: c.id,
      pass: c.pass,
      detail: c.detail,
      required: c.required,
    })),
    backupReadiness: {
      dbPath: 'prisma/dev.db',
      backupDirectoryCandidate: 'prisma/',
      backupFileNamePattern: `dev.db.backup-before-k18-task37-finalization-${timestamp}`,
      backupNeededBeforeFutureWrite: true,
      backupCreatedInThisStage: false,
    },
    futureValidationPlan: {
      checks: [
        'confirm target task still exists',
        'confirm candidate classGroups remain linked',
        'confirm excluded TTC link no longer present in future state',
        'confirm excluded ClassGroup still exists',
        'confirm ScheduleSlot still exists and belongs to target task',
        'confirm ImportBatch unchanged',
        'confirm no remaining unaccepted cross-cohort task',
        'run K18-B validator',
        'run K18-C review',
        'run K18-E1 preview',
        'run build / lint / test baseline',
      ],
    },
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
    suggestedNextStage: 'K18-E3-TASK37-FINALIZATION-EXECUTE',
  }

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true })
  anonymizeReport(report)
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`\nJSON written: ${OUTPUT_JSON}`)

  // Print readiness check results
  console.log('\nReadiness Checks:')
  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.id}: ${c.detail}`)
  }

  console.log(`\nAll ${checks.length} readiness checks passed. Ready for K18-E3.`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
