import { PrismaClient } from '@prisma/client'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { confirmImportBatchDryRun } from '../src/lib/import/importer'
import { computeImportParseStats, computeImportParseQuality } from '../src/lib/import/parse-utils'
import type { ImportScheduleRecord } from '../src/types/import'

const prisma = new PrismaClient()

async function main() {
  let tempBatchId: number | null = null

  // 查找最近一条 pending ImportBatch
  let batch = await prisma.importBatch.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
  })

  if (!batch) {
    // 没有 pending batch 时，从 confirmed batch 复用 parsed JSON 创建临时 pending batch
    const confirmedBatch = await prisma.importBatch.findFirst({
      where: { status: 'confirmed' },
      orderBy: { id: 'asc' },
    })
    if (!confirmedBatch?.parsedJsonPath) {
      console.log('没有 pending batch，也没有 confirmed batch 可复用。跳过。')
      process.exit(0)
    }

    const jsonPath = join(process.cwd(), confirmedBatch.parsedJsonPath)
    if (!existsSync(jsonPath)) {
      console.log(`Parsed JSON 不存在: ${jsonPath}。跳过。`)
      process.exit(0)
    }

    const records: ImportScheduleRecord[] = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    const stats = computeImportParseStats(records)
    const quality = computeImportParseQuality(records)

    const created = await prisma.importBatch.create({
      data: {
        filename: 'test-dry-run-0420.docx',
        originalFilePath: confirmedBatch.originalFilePath,
        parsedJsonPath: confirmedBatch.parsedJsonPath,
        statsJson: JSON.stringify(stats),
        qualityJson: JSON.stringify(quality),
        warningsJson: JSON.stringify(quality.warnings),
        status: 'pending',
        recordCount: records.length,
      },
    })
    tempBatchId = created.id
    batch = created
    console.log(`创建临时 pending ImportBatch: id=${batch.id}\n`)
  }

  console.log(`找到 pending ImportBatch: id=${batch.id}, filename="${batch.filename}"\n`)

  // 记录 dry-run 前的数据库状态
  const beforeTaskCount = await prisma.teachingTask.count()
  const beforeSlotCount = await prisma.scheduleSlot.count()

  // 读取 records 用于 invariant 检查
  const jsonPath = join(process.cwd(), batch.parsedJsonPath!)
  const records: ImportScheduleRecord[] = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  const uniqueClassNames = new Set(records.map((r) => r.class_info?.class_name).filter(Boolean))

  const plan = await confirmImportBatchDryRun(batch.id, 'UPSERT_BY_NATURAL_KEY')

  // ── 输出计划摘要 ──
  console.log('========== Dry-Run Import Plan ==========')
  console.log(`batchId:       ${plan.batchId}`)
  console.log(`strategy:      ${plan.strategy}`)
  console.log(`recordCount:   ${plan.recordCount}`)
  console.log(`canImport:     ${plan.canImport}`)
  console.log()

  console.log('--- Quality ---')
  console.log(`totalRecords:              ${plan.quality.totalRecords}`)
  console.log(`recordsMissingStudentCount: ${plan.quality.recordsMissingStudentCount}`)
  console.log(`recordsMissingTeacher:      ${plan.quality.recordsMissingTeacher}`)
  console.log(`recordsMissingRoom:         ${plan.quality.recordsMissingRoom}`)
  console.log(`recordsMissingCourse:       ${plan.quality.recordsMissingCourse}`)
  console.log(`duplicateCandidateCount:    ${plan.quality.duplicateCandidateCount}`)
  console.log()

  console.log('--- Classification ---')
  console.log(`canImport:                 ${plan.classification.canImport}`)
  console.log(`missingTeacherBusinessEmpty: ${plan.classification.missingTeacherBusinessEmpty}`)
  console.log(`missingTeacherParseBug:      ${plan.classification.missingTeacherParseBug}`)
  console.log(`missingRoomBusinessEmpty:    ${plan.classification.missingRoomBusinessEmpty}`)
  console.log(`missingRoomParseBug:         ${plan.classification.missingRoomParseBug}`)
  console.log(`missingRoomManualReview:     ${plan.classification.missingRoomManualReview}`)
  console.log()

  console.log('--- Planned Entities ---')
  console.log(`ClassGroups:   create=${plan.plannedClassGroups.createCount}, updateStudentCount=${plan.plannedClassGroups.updateStudentCountCount}`)
  if (plan.plannedClassGroups.names.length > 0) {
    console.log(`  new: ${plan.plannedClassGroups.names.slice(0, 10).join(', ')}${plan.plannedClassGroups.names.length > 10 ? '...' : ''}`)
  }
  if (plan.plannedClassGroups.studentCountUpdates.length > 0) {
    console.log(`  studentCount updates (first 5):`)
    for (const u of plan.plannedClassGroups.studentCountUpdates.slice(0, 5)) {
      console.log(`    ${u.className}: ${u.existingStudentCount} → ${u.studentCount}`)
    }
  }
  if (plan.plannedClassGroups.studentCountConflicts.length > 0) {
    console.log(`  studentCount CONFLICTS:`)
    for (const c of plan.plannedClassGroups.studentCountConflicts) {
      console.log(`    ${c.className}: ${c.values.join(', ')}`)
    }
  }

  console.log(`Teachers:      create=${plan.plannedTeachers.createCount}, missing=${plan.plannedTeachers.missingCount}`)
  if (plan.plannedTeachers.names.length > 0) {
    console.log(`  new: ${plan.plannedTeachers.names.join(', ')}`)
  }
  if (plan.plannedTeachers.missingExamples.length > 0) {
    console.log(`  missing examples: ${plan.plannedTeachers.missingExamples.join(' | ')}`)
  }

  console.log(`Courses:       create=${plan.plannedCourses.createCount}`)
  if (plan.plannedCourses.names.length > 0) {
    console.log(`  new: ${plan.plannedCourses.names.join(', ')}`)
  }

  console.log(`Rooms:         create=${plan.plannedRooms.createCount}, missing=${plan.plannedRooms.missingCount}`)
  if (plan.plannedRooms.names.length > 0) {
    console.log(`  new: ${plan.plannedRooms.names.join(', ')}`)
  }
  if (plan.plannedRooms.missingExamples.length > 0) {
    console.log(`  missing examples: ${plan.plannedRooms.missingExamples.join(' | ')}`)
  }
  console.log()

  console.log('--- Grouping Stats ---')
  console.log(`eventGroupCount:           ${plan.eventGroupCount}`)
  console.log(`teachingTaskGroupCount:    ${plan.teachingTaskGroupCount}`)
  console.log(`scheduleSlotGroupCount:    ${plan.scheduleSlotGroupCount}`)
  console.log()

  console.log('--- Planned Tasks & Slots ---')
  console.log(`TeachingTasks: create=${plan.plannedTeachingTasks.createCount}, duplicateKeys=${plan.plannedTeachingTasks.duplicateKeyCount}`)
  console.log(`  sampleKeys (first 10):`)
  for (const k of plan.plannedTeachingTasks.sampleKeys.slice(0, 10)) {
    console.log(`    ${k}`)
  }
  console.log(`ScheduleSlots: create=${plan.plannedScheduleSlots.createCount}, missingRoom=${plan.plannedScheduleSlots.missingRoomCount}, duplicateKeys=${plan.plannedScheduleSlots.duplicateKeyCount}`)
  console.log()

  // ── 合班样本 ──
  if (plan.mergedClassSamples.length > 0) {
    console.log(`--- Merged Class Samples (classGroupSet size > 1, first 20) ---`)
    for (const s of plan.mergedClassSamples) {
      console.log(`  ${s.course} | ${s.teacher ?? '(无)'} | ${s.weekType} | classes: ${s.classNames.join(', ')}`)
    }
    console.log()
  }

  // ── Blocking / Warnings ──
  if (plan.blockingReasons.length > 0) {
    console.log('--- Blocking Reasons ---')
    for (const r of plan.blockingReasons) console.log(`  - ${r}`)
    console.log()
  }

  if (plan.warnings.length > 0) {
    console.log('--- Warnings ---')
    for (const w of plan.warnings) console.log(`  - ${w}`)
    console.log()
  }

  // ════ Invariant 检查 ════
  console.log('========== Invariant Checks ==========')
  let invariantFailed = false

  function check(name: string, ok: boolean, detail: string) {
    const status = ok ? 'PASS' : 'FAIL'
    console.log(`  ${status}: ${name}${ok ? '' : ` — ${detail}`}`)
    if (!ok) invariantFailed = true
  }

  // 1. unique className count
  // After rollback, ClassGroups are retained so createCount=0 is expected.
  // The check verifies that all classNames are accounted for: either newly created,
  // already existing (retained), or in conflict.
  const existingClassGroupCount = await prisma.classGroup.count({
    where: { name: { in: [...uniqueClassNames] } },
  })
  const accountedFor = plan.plannedClassGroups.createCount + existingClassGroupCount + plan.plannedClassGroups.studentCountConflicts.length
  check(
    'unique className count ≈ plannedClassGroups total (accounting for existing)',
    Math.abs(uniqueClassNames.size - accountedFor) <= plan.plannedClassGroups.studentCountConflicts.length,
    `uniqueClassNames=${uniqueClassNames.size}, create=${plan.plannedClassGroups.createCount}, existing=${existingClassGroupCount}, conflicts=${plan.plannedClassGroups.studentCountConflicts.length}`,
  )

  // 2. updateStudentCountCount <= unique className count
  check(
    'updateStudentCountCount <= uniqueClassNames',
    plan.plannedClassGroups.updateStudentCountCount <= uniqueClassNames.size,
    `updateStudentCount=${plan.plannedClassGroups.updateStudentCountCount}, unique=${uniqueClassNames.size}`,
  )

  // 3. teachingTasks <= records
  check(
    'teachingTasks.createCount <= recordCount',
    plan.plannedTeachingTasks.createCount <= plan.recordCount,
    `tasks=${plan.plannedTeachingTasks.createCount}, records=${plan.recordCount}`,
  )

  // 4. scheduleSlots <= records
  check(
    'scheduleSlots.createCount <= recordCount',
    plan.plannedScheduleSlots.createCount <= plan.recordCount,
    `slots=${plan.plannedScheduleSlots.createCount}, records=${plan.recordCount}`,
  )

  // 5. blockingReasons empty ↔ canImport
  check(
    'blockingReasons empty ↔ canImport=true',
    (plan.blockingReasons.length === 0) === plan.canImport,
    `blocking=${plan.blockingReasons.length}, canImport=${plan.canImport}`,
  )

  // 6. batch status still pending
  const afterBatch = await prisma.importBatch.findUnique({ where: { id: batch.id } })
  check(
    'ImportBatch.status still pending',
    afterBatch?.status === 'pending',
    `status=${afterBatch?.status}`,
  )

  // 7. dry-run 前后 TeachingTask 数量不变
  const afterTaskCount = await prisma.teachingTask.count()
  check(
    'TeachingTask count unchanged after dry-run',
    beforeTaskCount === afterTaskCount,
    `before=${beforeTaskCount}, after=${afterTaskCount}`,
  )

  // 8. dry-run 前后 ScheduleSlot 数量不变
  const afterSlotCount = await prisma.scheduleSlot.count()
  check(
    'ScheduleSlot count unchanged after dry-run',
    beforeSlotCount === afterSlotCount,
    `before=${beforeSlotCount}, after=${afterSlotCount}`,
  )

  // 9. teachingTaskGroupCount == teachingTasks.createCount
  check(
    'teachingTaskGroupCount == teachingTasks.createCount',
    plan.teachingTaskGroupCount === plan.plannedTeachingTasks.createCount,
    `group=${plan.teachingTaskGroupCount}, create=${plan.plannedTeachingTasks.createCount}`,
  )

  // 10. scheduleSlotGroupCount == scheduleSlots.createCount
  check(
    'scheduleSlotGroupCount == scheduleSlots.createCount',
    plan.scheduleSlotGroupCount === plan.plannedScheduleSlots.createCount,
    `group=${plan.scheduleSlotGroupCount}, create=${plan.plannedScheduleSlots.createCount}`,
  )

  console.log()

  // Cleanup: abandon temp batch if we created one
  if (tempBatchId != null) {
    await prisma.importBatch.updateMany({
      where: { id: tempBatchId, status: 'pending' },
      data: { status: 'abandoned', errorMessage: 'Test cleanup: auto-abandoned' },
    })
    console.log(`临时 pending batch #${tempBatchId} 已 abandon (测试清理)\n`)
  }

  if (invariantFailed) {
    console.log('FAIL — invariant check(s) failed')
    process.exit(1)
  }

  console.log('PASS')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
