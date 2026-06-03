import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

const TARGET = {
  teachingTaskId: 37,
  teachingTaskClassId: 94,
  classGroupId: 35,
  keepTeachingTaskClassIds: [92, 93],
  keepClassGroupIds: [3, 17],
  expectedScheduleSlotId: 43,
  expectedImportBatchId: 1,
}

interface SafetyCheck {
  name: string
  status: 'PASS' | 'FAIL'
  detail: string
}

interface FinalizationReport {
  mode: 'dry-run' | 'apply'
  applied: boolean
  backupPath: string | null
  targetAssociation: {
    teachingTaskId: number
    teachingTaskClassId: number
    classGroupId: number
    action: string
  }
  keptAssociations: Array<{
    teachingTaskClassId: number
    teachingTaskId: number
    classGroupId: number
  }>
  safetyChecks: SafetyCheck[]
  beforeSnapshot: {
    currentClassGroupIds: number[]
    currentTtcIds: number[]
    studentCount: number
    isCrossCohort: boolean
  }
  afterSnapshot: {
    candidateClassGroupIds: number[]
    candidateTtcIds: number[]
    studentCount: number
    isCrossCohort: boolean
  } | null
  postApplyValidation: Array<{ name: string; status: string; detail: string }> | null
  warnings: string[]
  generatedAt: string
}

const OUTPUT_JSON = path.join(
  process.cwd(),
  'docs',
  'k18-task37-finalization-execute.json',
)

const BACKUP_DIR = path.join(process.cwd(), 'prisma')
const DB_PATH = path.join(BACKUP_DIR, 'dev.db')

function getBackupPath(): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14)
  return path.join(
    BACKUP_DIR,
    `dev.db.backup-before-k18-task37-finalization-${ts}`,
  )
}

async function runSafetyChecks(): Promise<SafetyCheck[]> {
  const checks: SafetyCheck[] = []

  const task = await prisma.teachingTask.findUnique({
    where: { id: TARGET.teachingTaskId },
    include: { course: true, teacher: true },
  })
  checks.push({
    name: 'task37_exists',
    status: task ? 'PASS' : 'FAIL',
    detail: task ? `TeachingTask ${TARGET.teachingTaskId} found` : `TeachingTask ${TARGET.teachingTaskId} NOT found`,
  })
  checks.push({
    name: 'course_is_xi_jinping',
    status: task && task.course.name === '习近平新时代中国特色社会主义思想概论' ? 'PASS' : 'FAIL',
    detail: task ? `Course: ${task.course.name}` : 'Task not found',
  })
  checks.push({
    name: 'teacher_is_fang_zhong_min',
    status: task && task.teacher?.name === '房忠敏' ? 'PASS' : 'FAIL',
    detail: task ? `Teacher: ${task.teacher?.name ?? 'null'}` : 'Task not found',
  })

  const batch = await prisma.importBatch.findUnique({
    where: { id: TARGET.expectedImportBatchId },
  })
  checks.push({
    name: 'import_batch_1_confirmed',
    status: batch && batch.status === 'confirmed' ? 'PASS' : 'FAIL',
    detail: batch ? `ImportBatch ${TARGET.expectedImportBatchId} status=${batch.status}` : 'ImportBatch not found',
  })

  const ttc94 = await prisma.teachingTaskClass.findUnique({
    where: { id: TARGET.teachingTaskClassId },
  })
  checks.push({
    name: 'ttc_94_exists',
    status: ttc94 ? 'PASS' : 'FAIL',
    detail: ttc94 ? `TTC ${TARGET.teachingTaskClassId} exists (task=${ttc94.teachingTaskId}, cg=${ttc94.classGroupId})` : 'TTC 94 not found',
  })
  checks.push({
    name: 'ttc_94_belongs_to_task37_and_cg35',
    status: ttc94 && ttc94.teachingTaskId === TARGET.teachingTaskId && ttc94.classGroupId === TARGET.classGroupId ? 'PASS' : 'FAIL',
    detail: ttc94 ? `TTC94: task=${ttc94.teachingTaskId}, cg=${ttc94.classGroupId}` : 'TTC94 not found',
  })

  const ttc92 = await prisma.teachingTaskClass.findUnique({ where: { id: 92 } })
  checks.push({
    name: 'ttc_92_belongs_to_task37_and_cg3',
    status: ttc92 && ttc92.teachingTaskId === 37 && ttc92.classGroupId === 3 ? 'PASS' : 'FAIL',
    detail: ttc92 ? `TTC92: task=${ttc92.teachingTaskId}, cg=${ttc92.classGroupId}` : 'TTC92 not found',
  })

  const ttc93 = await prisma.teachingTaskClass.findUnique({ where: { id: 93 } })
  checks.push({
    name: 'ttc_93_belongs_to_task37_and_cg17',
    status: ttc93 && ttc93.teachingTaskId === 37 && ttc93.classGroupId === 17 ? 'PASS' : 'FAIL',
    detail: ttc93 ? `TTC93: task=${ttc93.teachingTaskId}, cg=${ttc93.classGroupId}` : 'TTC93 not found',
  })

  const currentTtcs = await prisma.teachingTaskClass.findMany({
    where: { teachingTaskId: TARGET.teachingTaskId },
  })
  const currentCgIds = currentTtcs.map((t) => t.classGroupId).sort((a, b) => a - b)
  const expectedCurrent = [3, 17, 35]
  checks.push({
    name: 'current_classgroups_include_3_17_35',
    status: JSON.stringify(currentCgIds) === JSON.stringify(expectedCurrent) ? 'PASS' : 'FAIL',
    detail: `Current CGs: [${currentCgIds.join(', ')}]`,
  })

  const targetKeeps = TARGET.keepClassGroupIds.every((id) => currentCgIds.includes(id))
  checks.push({
    name: 'target_keeps_3_and_17',
    status: targetKeeps ? 'PASS' : 'FAIL',
    detail: `Target keeps [${TARGET.keepClassGroupIds.join(', ')}] — present in current: ${targetKeeps}`,
  })

  checks.push({
    name: 'target_leaves_at_least_one_classgroup',
    status: TARGET.keepClassGroupIds.length >= 1 ? 'PASS' : 'FAIL',
    detail: `Target leaves [${TARGET.keepClassGroupIds.join(', ')}] (${TARGET.keepClassGroupIds.length} groups)`,
  })

  const slot = await prisma.scheduleSlot.findUnique({
    where: { id: TARGET.expectedScheduleSlotId },
  })
  checks.push({
    name: 'slot_43_exists',
    status: slot ? 'PASS' : 'FAIL',
    detail: slot ? `ScheduleSlot ${TARGET.expectedScheduleSlotId} exists (task=${slot.teachingTaskId})` : 'Slot 43 not found',
  })
  checks.push({
    name: 'slot_43_belongs_to_task37',
    status: slot && slot.teachingTaskId === TARGET.teachingTaskId ? 'PASS' : 'FAIL',
    detail: slot ? `Slot ${TARGET.expectedScheduleSlotId} belongs to task ${slot.teachingTaskId}` : 'Slot not found',
  })

  const cg35 = await prisma.classGroup.findUnique({ where: { id: TARGET.classGroupId } })
  checks.push({
    name: 'classgroup_35_exists',
    status: cg35 ? 'PASS' : 'FAIL',
    detail: cg35 ? `ClassGroup ${TARGET.classGroupId} (${cg35.name}) exists` : `ClassGroup ${TARGET.classGroupId} not found`,
  })

  // Mutation plan checks
  checks.push({
    name: 'mutation_plan_only_ttc_94',
    status: 'PASS',
    detail: `Mutation plan: delete TTC id=${TARGET.teachingTaskClassId} only`,
  })
  checks.push({
    name: 'no_teaching_task_mutation',
    status: 'PASS',
    detail: 'No TeachingTask mutation planned',
  })
  checks.push({
    name: 'no_classgroup_mutation',
    status: 'PASS',
    detail: 'No ClassGroup mutation planned',
  })
  checks.push({
    name: 'no_schedule_slot_mutation',
    status: 'PASS',
    detail: 'No ScheduleSlot mutation planned',
  })
  checks.push({
    name: 'no_import_batch_mutation',
    status: 'PASS',
    detail: 'No ImportBatch mutation planned',
  })
  checks.push({
    name: 'no_non_target_ttc_mutation',
    status: 'PASS',
    detail: `No mutation on TTC [${TARGET.keepTeachingTaskClassIds.join(', ')}]`,
  })

  return checks
}

async function getBeforeSnapshot() {
  const ttcs = await prisma.teachingTaskClass.findMany({
    where: { teachingTaskId: TARGET.teachingTaskId },
    include: { classGroup: true },
  })
  const currentCgIds = ttcs.map((t) => t.classGroupId).sort((a, b) => a - b)
  const currentTtcIds = ttcs.map((t) => t.id).sort((a, b) => a - b)
  const studentCount = ttcs.reduce((sum, t) => sum + (t.classGroup.studentCount ?? 0), 0)
  const cohortYears = new Set(
    ttcs.map((t) => {
      const m = t.classGroup.name.match(/^(\d{4})级/)
      return m ? parseInt(m[1]) : null
    }),
  )
  const isCrossCohort = cohortYears.size > 1

  return {
    currentClassGroupIds: currentCgIds,
    currentTtcIds: currentTtcIds,
    studentCount,
    isCrossCohort,
  }
}

async function getAfterSnapshot() {
  const ttcs = await prisma.teachingTaskClass.findMany({
    where: {
      teachingTaskId: TARGET.teachingTaskId,
      id: { not: TARGET.teachingTaskClassId },
    },
    include: { classGroup: true },
  })
  const candidateCgIds = ttcs.map((t) => t.classGroupId).sort((a, b) => a - b)
  const candidateTtcIds = ttcs.map((t) => t.id).sort((a, b) => a - b)
  const studentCount = ttcs.reduce((sum, t) => sum + (t.classGroup.studentCount ?? 0), 0)
  const cohortYears = new Set(
    ttcs.map((t) => {
      const m = t.classGroup.name.match(/^(\d{4})级/)
      return m ? parseInt(m[1]) : null
    }),
  )
  const isCrossCohort = cohortYears.size > 1

  return {
    candidateClassGroupIds: candidateCgIds,
    candidateTtcIds: candidateTtcIds,
    studentCount,
    isCrossCohort,
  }
}

async function runPostApplyChecks(): Promise<Array<{ name: string; status: string; detail: string }>> {
  const results: Array<{ name: string; status: string; detail: string }> = []

  const task = await prisma.teachingTask.findUnique({ where: { id: TARGET.teachingTaskId } })
  results.push({ name: 'task37_still_exists', status: task ? 'PASS' : 'FAIL', detail: task ? 'OK' : 'Missing' })

  const ttc94 = await prisma.teachingTaskClass.findUnique({ where: { id: TARGET.teachingTaskClassId } })
  results.push({ name: 'ttc94_deleted', status: !ttc94 ? 'PASS' : 'FAIL', detail: !ttc94 ? 'TTC 94 removed' : 'TTC 94 still exists' })

  const ttc92 = await prisma.teachingTaskClass.findUnique({ where: { id: 92 } })
  results.push({ name: 'ttc92_preserved', status: ttc92 && ttc92.teachingTaskId === 37 && ttc92.classGroupId === 3 ? 'PASS' : 'FAIL', detail: ttc92 ? `task=${ttc92.teachingTaskId}, cg=${ttc92.classGroupId}` : 'Missing' })

  const ttc93 = await prisma.teachingTaskClass.findUnique({ where: { id: 93 } })
  results.push({ name: 'ttc93_preserved', status: ttc93 && ttc93.teachingTaskId === 37 && ttc93.classGroupId === 17 ? 'PASS' : 'FAIL', detail: ttc93 ? `task=${ttc93.teachingTaskId}, cg=${ttc93.classGroupId}` : 'Missing' })

  const ttcs = await prisma.teachingTaskClass.findMany({ where: { teachingTaskId: TARGET.teachingTaskId } })
  const cgIds = ttcs.map((t) => t.classGroupId).sort((a, b) => a - b)
  results.push({ name: 'task37_classgroups', status: JSON.stringify(cgIds) === JSON.stringify([3, 17]) ? 'PASS' : 'FAIL', detail: `[${cgIds.join(', ')}]` })

  const cg35 = await prisma.classGroup.findUnique({ where: { id: 35 } })
  results.push({ name: 'classgroup_35_preserved', status: cg35 ? 'PASS' : 'FAIL', detail: cg35 ? `ClassGroup 35 (${cg35.name}) still exists` : 'Missing' })

  const slot = await prisma.scheduleSlot.findUnique({ where: { id: TARGET.expectedScheduleSlotId } })
  results.push({ name: 'slot_43_preserved', status: slot && slot.teachingTaskId === 37 ? 'PASS' : 'FAIL', detail: slot ? `task=${slot.teachingTaskId}` : 'Missing' })

  const batch = await prisma.importBatch.findUnique({ where: { id: TARGET.expectedImportBatchId } })
  results.push({ name: 'import_batch_1_preserved', status: batch && batch.status === 'confirmed' ? 'PASS' : 'FAIL', detail: batch ? `status=${batch.status}` : 'Missing' })

  // Recalculate with classGroup names
  const ttcsWithCg = await prisma.teachingTaskClass.findMany({
    where: { teachingTaskId: TARGET.teachingTaskId },
    include: { classGroup: true },
  })
  const years = new Set(
    ttcsWithCg.map((t) => {
      const m = t.classGroup.name.match(/^(\d{4})级/)
      return m ? parseInt(m[1]) : null
    }),
  )
  results.push({ name: 'task37_not_cross_cohort', status: years.size <= 1 ? 'PASS' : 'FAIL', detail: `Cohort years: [${[...years].join(', ')}]` })

  return results
}

async function main() {
  const args = process.argv.slice(2)
  const isApply = args.includes('--apply')
  const isDryRun = args.includes('--dry-run') || !isApply
  const mode: 'dry-run' | 'apply' = isApply ? 'apply' : 'dry-run'

  const warnings: string[] = []

  if (isDryRun && !isApply) {
    console.log('K18-E3 Task37 Finalization — DRY RUN')
  } else {
    console.log('K18-E3 Task37 Finalization — APPLY')
  }
  console.log('='.repeat(60))

  // Safety checks
  console.log('\n[1/5] Running safety checks...')
  const safetyChecks = await runSafetyChecks()
  let allPass = true
  for (const check of safetyChecks) {
    const icon = check.status === 'PASS' ? '✅' : '❌'
    console.log(`  ${icon} ${check.name}: ${check.detail}`)
    if (check.status === 'FAIL') allPass = false
  }
  console.log(`\n  Safety checks: ${safetyChecks.filter((c) => c.status === 'PASS').length}/${safetyChecks.length} PASS`)

  if (!allPass) {
    console.log('\n❌ Safety check FAILED. Cannot proceed.')
    const report: FinalizationReport = {
      mode,
      applied: false,
      backupPath: null,
      targetAssociation: {
        teachingTaskId: TARGET.teachingTaskId,
        teachingTaskClassId: TARGET.teachingTaskClassId,
        classGroupId: TARGET.classGroupId,
        action: 'DELETE',
      },
      keptAssociations: TARGET.keepTeachingTaskClassIds.map((id) => ({
        teachingTaskClassId: id,
        teachingTaskId: 37,
        classGroupId: id === 92 ? 3 : 17,
      })),
      safetyChecks,
      beforeSnapshot: await getBeforeSnapshot(),
      afterSnapshot: null,
      postApplyValidation: null,
      warnings: ['Safety check failed. Apply aborted.'],
      generatedAt: new Date().toISOString(),
    }
    fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true })
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2))
    console.log(`\nReport: ${OUTPUT_JSON}`)
    await prisma.$disconnect()
    process.exit(1)
  }

  // Before snapshot
  console.log('\n[2/5] Current state...')
  const before = await getBeforeSnapshot()
  console.log(`  Current classGroups: [${before.currentClassGroupIds.join(', ')}]`)
  console.log(`  Current TTCs: [${before.currentTtcIds.join(', ')}]`)
  console.log(`  Current student count: ${before.studentCount}`)
  console.log(`  Cross-cohort: ${before.isCrossCohort}`)

  // After snapshot (computed)
  const after = await getAfterSnapshot()
  console.log(`\n  Target: delete TTC ${TARGET.teachingTaskClassId} (task37 + CG35)`)
  console.log(`  Candidate classGroups: [${after.candidateClassGroupIds.join(', ')}]`)
  console.log(`  Candidate TTCs: [${after.candidateTtcIds.join(', ')}]`)
  console.log(`  Candidate student count: ${after.studentCount}`)
  console.log(`  Candidate cross-cohort: ${after.isCrossCohort}`)
  console.log(`\n  Expected: ${before.studentCount} → ${after.studentCount} students`)

  if (isDryRun && !isApply) {
    console.log('\n[3/5] Operation preview:')
    console.log(`  DELETE TeachingTaskClass WHERE id = ${TARGET.teachingTaskClassId}`)
    console.log(`    teachingTaskId = ${TARGET.teachingTaskId}`)
    console.log(`    classGroupId = ${TARGET.classGroupId}`)
    console.log(`  PRESERVE TTC [${TARGET.keepTeachingTaskClassIds.join(', ')}]`)
    console.log(`  PRESERVE TeachingTask ${TARGET.teachingTaskId}`)
    console.log(`  PRESERVE ClassGroup ${TARGET.classGroupId}`)
    console.log(`  PRESERVE ScheduleSlot ${TARGET.expectedScheduleSlotId}`)
    console.log(`  PRESERVE ImportBatch ${TARGET.expectedImportBatchId}`)
    console.log('\n  NO DATABASE CHANGES WERE MADE.')

    const report: FinalizationReport = {
      mode: 'dry-run',
      applied: false,
      backupPath: null,
      targetAssociation: {
        teachingTaskId: TARGET.teachingTaskId,
        teachingTaskClassId: TARGET.teachingTaskClassId,
        classGroupId: TARGET.classGroupId,
        action: 'DELETE',
      },
      keptAssociations: TARGET.keepTeachingTaskClassIds.map((id) => ({
        teachingTaskClassId: id,
        teachingTaskId: 37,
        classGroupId: id === 92 ? 3 : 17,
      })),
      safetyChecks,
      beforeSnapshot: before,
      afterSnapshot: after,
      postApplyValidation: null,
      warnings,
      generatedAt: new Date().toISOString(),
    }
    fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true })
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2))
    console.log(`\nReport: ${OUTPUT_JSON}`)
    await prisma.$disconnect()
    return
  }

  // Apply path
  // Create backup
  console.log('\n[3/5] Creating backup...')
  const backupPath = getBackupPath()
  try {
    fs.copyFileSync(DB_PATH, backupPath)
    const backupSize = fs.statSync(backupPath).size
    console.log(`  Backup created: ${backupPath} (${backupSize} bytes)`)
  } catch (err) {
    console.log(`\n❌ Backup failed: ${err}`)
    await prisma.$disconnect()
    process.exit(1)
  }

  // Apply mutation
  console.log('\n[4/5] Applying mutation...')
  const result = await prisma.$transaction(async (tx) => {
    const deleted = await tx.teachingTaskClass.deleteMany({
      where: {
        id: TARGET.teachingTaskClassId,
        teachingTaskId: TARGET.teachingTaskId,
        classGroupId: TARGET.classGroupId,
      },
    })
    return deleted
  })

  if (result.count !== 1) {
    console.log(`\n❌ Expected 1 affected row, got ${result.count}. Aborting.`)
    await prisma.$disconnect()
    process.exit(1)
  }
  console.log(`  Deleted TTC ${TARGET.teachingTaskClassId}: ${result.count} row(s)`)

  // Post-apply validation
  console.log('\n[5/5] Post-apply validation...')
  const postChecks = await runPostApplyChecks()
  let postAllPass = true
  for (const check of postChecks) {
    const icon = check.status === 'PASS' ? '✅' : '❌'
    console.log(`  ${icon} ${check.name}: ${check.detail}`)
    if (check.status === 'FAIL') postAllPass = false
  }

  const afterSnapshot = await getAfterSnapshot()
  console.log(`\n  Final classGroups: [${afterSnapshot.candidateClassGroupIds.join(', ')}]`)
  console.log(`  Final TTCs: [${afterSnapshot.candidateTtcIds.join(', ')}]`)
  console.log(`  Final student count: ${afterSnapshot.studentCount}`)
  console.log(`  Final cross-cohort: ${afterSnapshot.isCrossCohort}`)

  const report: FinalizationReport = {
    mode: 'apply',
    applied: true,
    backupPath,
    targetAssociation: {
      teachingTaskId: TARGET.teachingTaskId,
      teachingTaskClassId: TARGET.teachingTaskClassId,
      classGroupId: TARGET.classGroupId,
      action: 'DELETED',
    },
    keptAssociations: TARGET.keepTeachingTaskClassIds.map((id) => ({
      teachingTaskClassId: id,
      teachingTaskId: 37,
      classGroupId: id === 92 ? 3 : 17,
    })),
    safetyChecks,
    beforeSnapshot: before,
    afterSnapshot,
    postApplyValidation: postChecks,
    warnings,
    generatedAt: new Date().toISOString(),
  }
  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true })
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2))
  console.log(`\nReport: ${OUTPUT_JSON}`)

  if (!postAllPass) {
    console.log('\n❌ Post-apply validation FAILED. Check backup for restore.')
    await prisma.$disconnect()
    process.exit(1)
  }

  console.log('\n✅ K18-E3 Task37 finalization complete.')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  prisma.$disconnect()
  process.exit(1)
})
