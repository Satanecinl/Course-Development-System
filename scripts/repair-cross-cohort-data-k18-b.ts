import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

const OUTPUT_JSON_PATH = path.join(__dirname, '..', 'docs', 'k18-cross-cohort-data-repair-execute.json')

const TARGET_LINKS = [
  { teachingTaskId: 168, classGroupId: 22, teachingTaskClassId: 349, keepClassGroupIds: [3, 18, 19], expectedSlotIds: [218] },
  { teachingTaskId: 174, classGroupId: 22, teachingTaskClassId: 361, keepClassGroupIds: [3, 18, 19], expectedSlotIds: [226] },
  { teachingTaskId: 176, classGroupId: 22, teachingTaskClassId: 366, keepClassGroupIds: [3, 18, 19], expectedSlotIds: [228] },
  { teachingTaskId: 181, classGroupId: 22, teachingTaskClassId: 377, keepClassGroupIds: [3, 18, 19], expectedSlotIds: [233] },
]

const EXCLUDED_TASK_ID = 37

interface SafetyCheckResult {
  name: string
  pass: boolean
  detail: string
}

async function runSafetyChecks(): Promise<{ pass: boolean; checks: SafetyCheckResult[] }> {
  const checks: SafetyCheckResult[] = []

  // 1. Prisma can connect
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.push({ name: 'Prisma connection', pass: true, detail: 'Connected' })
  } catch (e) {
    checks.push({ name: 'Prisma connection', pass: false, detail: String(e) })
    return { pass: false, checks }
  }

  // 2. 4 TeachingTasks exist
  for (const link of TARGET_LINKS) {
    const task = await prisma.teachingTask.findUnique({ where: { id: link.teachingTaskId } })
    checks.push({
      name: `Task ${link.teachingTaskId} exists`,
      pass: !!task,
      detail: task ? `Found: ${task.remark}` : 'NOT FOUND',
    })
  }

  // 3. 4 target TTC links exist with correct ids
  for (const link of TARGET_LINKS) {
    const ttc = await prisma.teachingTaskClass.findUnique({ where: { id: link.teachingTaskClassId } })
    const matchId = ttc && ttc.teachingTaskId === link.teachingTaskId && ttc.classGroupId === link.classGroupId
    checks.push({
      name: `TTC ${link.teachingTaskClassId} exists (task=${link.teachingTaskId}, cg=${link.classGroupId})`,
      pass: !!matchId,
      detail: ttc ? `Found: task=${ttc.teachingTaskId}, cg=${ttc.classGroupId}` : 'NOT FOUND',
    })
  }

  // 4. Each task currently includes CG 22
  for (const link of TARGET_LINKS) {
    const has22 = await prisma.teachingTaskClass.findFirst({
      where: { teachingTaskId: link.teachingTaskId, classGroupId: 22 },
    })
    checks.push({
      name: `Task ${link.teachingTaskId} has CG 22`,
      pass: !!has22,
      detail: has22 ? `TTC id=${has22.id}` : 'CG 22 NOT linked',
    })
  }

  // 5. Each task currently includes keep CGs [3,18,19]
  for (const link of TARGET_LINKS) {
    for (const keepCg of link.keepClassGroupIds) {
      const hasKeep = await prisma.teachingTaskClass.findFirst({
        where: { teachingTaskId: link.teachingTaskId, classGroupId: keepCg },
      })
      checks.push({
        name: `Task ${link.teachingTaskId} has CG ${keepCg}`,
        pass: !!hasKeep,
        detail: hasKeep ? `TTC id=${hasKeep.id}` : 'NOT linked',
      })
    }
  }

  // 6. After removal, each task retains at least 1 CG
  for (const link of TARGET_LINKS) {
    const allLinks = await prisma.teachingTaskClass.findMany({
      where: { teachingTaskId: link.teachingTaskId },
    })
    const afterCount = allLinks.filter(l => l.classGroupId !== link.classGroupId).length
    checks.push({
      name: `Task ${link.teachingTaskId} retains CGs after removal`,
      pass: afterCount >= 1,
      detail: `${afterCount} classGroups remaining`,
    })
  }

  // 7. ScheduleSlots exist and belong to correct tasks
  for (const link of TARGET_LINKS) {
    for (const slotId of link.expectedSlotIds) {
      const slot = await prisma.scheduleSlot.findUnique({ where: { id: slotId } })
      const belongs = slot && slot.teachingTaskId === link.teachingTaskId
      checks.push({
        name: `Slot ${slotId} exists and belongs to task ${link.teachingTaskId}`,
        pass: !!belongs,
        detail: slot ? `Found: task=${slot.teachingTaskId}, day=${slot.dayOfWeek}, idx=${slot.slotIndex}` : 'NOT FOUND',
      })
    }
  }

  // 8. Task 37 not in mutation plan
  const task37InPlan = TARGET_LINKS.some(l => l.teachingTaskId === EXCLUDED_TASK_ID)
  checks.push({
    name: 'Task 37 excluded from mutation plan',
    pass: !task37InPlan,
    detail: task37InPlan ? 'FAIL: task 37 in plan' : 'OK: task 37 excluded',
  })

  // 9. No non-target links in mutation plan
  const allTtcIds = TARGET_LINKS.map(l => l.teachingTaskClassId)
  checks.push({
    name: 'Only 4 target TTC links in plan',
    pass: allTtcIds.length === 4,
    detail: `${allTtcIds.length} target links`,
  })

  // 10. ImportBatch not in mutation plan
  checks.push({
    name: 'ImportBatch not in mutation plan',
    pass: true,
    detail: 'Plan only targets TTC links, no ImportBatch changes',
  })

  const allPass = checks.every(c => c.pass)
  return { pass: allPass, checks }
}

async function getBeforeSnapshot() {
  const snapshots = []
  for (const link of TARGET_LINKS) {
    const task = await prisma.teachingTask.findUnique({
      where: { id: link.teachingTaskId },
      include: {
        course: true,
        teacher: true,
        taskClasses: { include: { classGroup: true } },
        scheduleSlots: true,
      },
    })
    if (!task) continue
    snapshots.push({
      taskId: task.id,
      courseName: task.course.name,
      teacherName: task.teacher?.name ?? null,
      classGroups: task.taskClasses.map(ttc => ({
        ttcId: ttc.id,
        classGroupId: ttc.classGroupId,
        name: ttc.classGroup.name,
        studentCount: ttc.classGroup.studentCount,
      })),
      scheduleSlots: task.scheduleSlots.map(s => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        slotIndex: s.slotIndex,
        roomId: s.roomId,
      })),
      totalStudentCount: task.taskClasses.reduce((sum, ttc) => sum + (ttc.classGroup.studentCount ?? 0), 0),
    })
  }
  return snapshots
}

async function getAfterSnapshot() {
  const snapshots = []
  for (const link of TARGET_LINKS) {
    const task = await prisma.teachingTask.findUnique({
      where: { id: link.teachingTaskId },
      include: {
        course: true,
        teacher: true,
        taskClasses: { include: { classGroup: true } },
        scheduleSlots: true,
      },
    })
    if (!task) continue
    snapshots.push({
      taskId: task.id,
      courseName: task.course.name,
      teacherName: task.teacher?.name ?? null,
      classGroups: task.taskClasses.map(ttc => ({
        ttcId: ttc.id,
        classGroupId: ttc.classGroupId,
        name: ttc.classGroup.name,
        studentCount: ttc.classGroup.studentCount,
      })),
      scheduleSlots: task.scheduleSlots.map(s => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        slotIndex: s.slotIndex,
        roomId: s.roomId,
      })),
      totalStudentCount: task.taskClasses.reduce((sum, ttc) => sum + (ttc.classGroup.studentCount ?? 0), 0),
    })
  }
  return snapshots
}

function formatTimestamp(): string {
  const now = new Date()
  return now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0')
}

async function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const isApply = args.includes('--apply')
  const mode = isApply ? 'apply' : 'dry-run'

  if (!isDryRun && !isApply) {
    console.log('No mode specified. Defaulting to --dry-run.')
    console.log('Use --dry-run or --apply explicitly.')
  }

  console.log(`K18-B Cross-Cohort Data Repair — ${mode.toUpperCase()}`)
  console.log('='.repeat(60))

  // Run safety checks
  console.log('\nRunning safety checks...')
  const { pass: safetyPass, checks } = await runSafetyChecks()

  for (const check of checks) {
    const icon = check.pass ? '✅' : '❌'
    console.log(`  ${icon} ${check.name}: ${check.detail}`)
  }

  if (!safetyPass) {
    console.log('\n❌ SAFETY CHECKS FAILED. Cannot proceed.')
    const output = {
      mode,
      applied: false,
      backupPath: null,
      targetLinks: TARGET_LINKS,
      deletedLinks: [],
      safetyChecks: checks,
      beforeSnapshot: [],
      afterSnapshot: [],
      postApplyValidation: null,
      warnings: ['Safety checks failed — repair aborted'],
      generatedAt: new Date().toISOString(),
    }
    fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(output, null, 2), 'utf-8')
    await prisma.$disconnect()
    process.exit(1)
  }

  console.log('\n✅ All safety checks passed.')

  // Get before snapshot
  const beforeSnapshot = await getBeforeSnapshot()

  // Dry-run output
  console.log('\n--- DRY-RUN PREVIEW ---')
  for (const link of TARGET_LINKS) {
    const task = beforeSnapshot.find(s => s.taskId === link.teachingTaskId)
    if (!task) continue
    console.log(`\nTask ${link.teachingTaskId} (${task.courseName} / ${task.teacherName}):`)
    console.log(`  DELETE: TTC id=${link.teachingTaskClassId} (task=${link.teachingTaskId}, CG=${link.classGroupId})`)
    console.log(`  KEEP:   CGs [${link.keepClassGroupIds.join(', ')}]`)
    console.log(`  SLOTS:  [${link.expectedSlotIds.join(', ')}] (preserved)`)
    console.log(`  StudentCount: ${task.totalStudentCount} → ${task.classGroups.filter(cg => cg.classGroupId !== link.classGroupId).reduce((s, cg) => s + (cg.studentCount ?? 0), 0)}`)
  }

  console.log('\nSQL Preview:')
  for (const link of TARGET_LINKS) {
    console.log(`  DELETE FROM TeachingTaskClass WHERE id = ${link.teachingTaskClassId}; -- task ${link.teachingTaskId} + CG ${link.classGroupId}`)
  }

  console.log('\nNO DATABASE CHANGES WERE MADE (dry-run mode).')

  if (!isApply) {
    // Save dry-run result
    const output = {
      mode: 'dry-run',
      applied: false,
      backupPath: null,
      targetLinks: TARGET_LINKS,
      deletedLinks: [],
      safetyChecks: checks,
      beforeSnapshot,
      afterSnapshot: [],
      postApplyValidation: null,
      warnings: [],
      generatedAt: new Date().toISOString(),
    }
    fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(output, null, 2), 'utf-8')
    console.log(`\nOutput written to: ${OUTPUT_JSON_PATH}`)
    await prisma.$disconnect()
    return
  }

  // === APPLY MODE ===
  console.log('\n--- APPLY MODE ---')

  // Create backup
  const dbPath = path.join(__dirname, '..', 'prisma', 'dev.db')
  const backupPath = path.join(__dirname, '..', 'prisma', `dev.db.backup-before-k18-cross-cohort-repair-${formatTimestamp()}`)

  console.log(`\nCreating backup: ${backupPath}`)
  try {
    fs.copyFileSync(dbPath, backupPath)
    console.log('✅ Backup created successfully.')
  } catch (e) {
    console.log(`❌ Backup failed: ${e}`)
    const output = {
      mode: 'apply',
      applied: false,
      backupPath: null,
      targetLinks: TARGET_LINKS,
      deletedLinks: [],
      safetyChecks: checks,
      beforeSnapshot,
      afterSnapshot: [],
      postApplyValidation: null,
      warnings: [`Backup failed: ${e}`],
      generatedAt: new Date().toISOString(),
    }
    fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(output, null, 2), 'utf-8')
    await prisma.$disconnect()
    process.exit(1)
  }

  // Re-run safety checks before apply
  console.log('\nRe-running safety checks before apply...')
  const { pass: recheckPass, checks: recheckResults } = await runSafetyChecks()
  if (!recheckPass) {
    console.log('❌ Re-check failed. Aborting apply.')
    const output = {
      mode: 'apply',
      applied: false,
      backupPath,
      targetLinks: TARGET_LINKS,
      deletedLinks: [],
      safetyChecks: recheckResults,
      beforeSnapshot,
      afterSnapshot: [],
      postApplyValidation: null,
      warnings: ['Re-check failed before apply — aborted'],
      generatedAt: new Date().toISOString(),
    }
    fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(output, null, 2), 'utf-8')
    await prisma.$disconnect()
    process.exit(1)
  }

  // Execute deletion in transaction
  console.log('\nDeleting target TeachingTaskClass links...')
  const deletedLinks: Array<{ teachingTaskId: number; classGroupId: number; ttcId: number }> = []

  await prisma.$transaction(async (tx) => {
    for (const link of TARGET_LINKS) {
      const result = await tx.teachingTaskClass.delete({
        where: { id: link.teachingTaskClassId },
      })
      deletedLinks.push({
        teachingTaskId: result.teachingTaskId,
        classGroupId: result.classGroupId,
        ttcId: result.id,
      })
      console.log(`  ✅ Deleted TTC id=${result.id} (task=${result.teachingTaskId}, CG=${result.classGroupId})`)
    }
  })

  // Verify deletion count
  if (deletedLinks.length !== 4) {
    console.log(`\n❌ Expected 4 deletions, got ${deletedLinks.length}. Database may be in inconsistent state.`)
    console.log(`   Backup available at: ${backupPath}`)
    const output = {
      mode: 'apply',
      applied: false,
      backupPath,
      targetLinks: TARGET_LINKS,
      deletedLinks,
      safetyChecks: recheckResults,
      beforeSnapshot,
      afterSnapshot: [],
      postApplyValidation: null,
      warnings: [`Expected 4 deletions, got ${deletedLinks.length}`],
      generatedAt: new Date().toISOString(),
    }
    fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(output, null, 2), 'utf-8')
    await prisma.$disconnect()
    process.exit(1)
  }

  // Post-apply checks
  console.log('\nRunning post-apply checks...')
  const afterSnapshot = await getAfterSnapshot()
  const postChecks: SafetyCheckResult[] = []

  // Verify no CG 22 in target tasks
  for (const link of TARGET_LINKS) {
    const has22 = await prisma.teachingTaskClass.findFirst({
      where: { teachingTaskId: link.teachingTaskId, classGroupId: 22 },
    })
    postChecks.push({
      name: `Task ${link.teachingTaskId} no longer has CG 22`,
      pass: !has22,
      detail: has22 ? 'FAIL: CG 22 still linked' : 'OK: CG 22 removed',
    })
  }

  // Verify keep CGs still present
  for (const link of TARGET_LINKS) {
    for (const keepCg of link.keepClassGroupIds) {
      const hasKeep = await prisma.teachingTaskClass.findFirst({
        where: { teachingTaskId: link.teachingTaskId, classGroupId: keepCg },
      })
      postChecks.push({
        name: `Task ${link.teachingTaskId} still has CG ${keepCg}`,
        pass: !!hasKeep,
        detail: hasKeep ? `TTC id=${hasKeep.id}` : 'FAIL: NOT linked',
      })
    }
  }

  // Verify slots preserved
  for (const link of TARGET_LINKS) {
    for (const slotId of link.expectedSlotIds) {
      const slot = await prisma.scheduleSlot.findUnique({ where: { id: slotId } })
      postChecks.push({
        name: `Slot ${slotId} still exists`,
        pass: !!slot,
        detail: slot ? `task=${slot.teachingTaskId}, day=${slot.dayOfWeek}, idx=${slot.slotIndex}` : 'FAIL: DELETED',
      })
    }
  }

  // Verify TTC ids no longer exist
  for (const link of TARGET_LINKS) {
    const ttc = await prisma.teachingTaskClass.findUnique({ where: { id: link.teachingTaskClassId } })
    postChecks.push({
      name: `TTC ${link.teachingTaskClassId} deleted`,
      pass: !ttc,
      detail: ttc ? 'FAIL: still exists' : 'OK: deleted',
    })
  }

  // Verify CG 22 still exists
  const cg22 = await prisma.classGroup.findUnique({ where: { id: 22 } })
  postChecks.push({
    name: 'ClassGroup 22 still exists',
    pass: !!cg22,
    detail: cg22 ? `"${cg22.name}"` : 'FAIL: deleted',
  })

  // Verify tasks still exist
  for (const link of TARGET_LINKS) {
    const task = await prisma.teachingTask.findUnique({ where: { id: link.teachingTaskId } })
    postChecks.push({
      name: `Task ${link.teachingTaskId} still exists`,
      pass: !!task,
      detail: task ? 'OK' : 'FAIL: deleted',
    })
  }

  // Verify ImportBatch #1 unchanged
  const batch1 = await prisma.importBatch.findUnique({ where: { id: 1 } })
  postChecks.push({
    name: 'ImportBatch #1 unchanged',
    pass: !!batch1 && batch1.status === 'confirmed',
    detail: batch1 ? `status=${batch1.status}` : 'FAIL: not found',
  })

  // Verify task 37 unchanged
  const task37Links = await prisma.teachingTaskClass.findMany({
    where: { teachingTaskId: 37 },
  })
  postChecks.push({
    name: 'Task 37 TTC links unchanged',
    pass: task37Links.length === 3,
    detail: `${task37Links.length} links (expected 3)`,
  })

  const allPostPass = postChecks.every(c => c.pass)
  console.log(`\nPost-apply checks: ${allPostPass ? '✅ ALL PASSED' : '❌ SOME FAILED'}`)
  for (const check of postChecks) {
    const icon = check.pass ? '✅' : '❌'
    console.log(`  ${icon} ${check.name}: ${check.detail}`)
  }

  // Save apply result
  const output = {
    mode: 'apply',
    applied: true,
    backupPath,
    targetLinks: TARGET_LINKS,
    deletedLinks,
    safetyChecks: recheckResults,
    beforeSnapshot,
    afterSnapshot,
    postApplyValidation: postChecks,
    warnings: allPostPass ? [] : ['Some post-apply checks failed'],
    generatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(output, null, 2), 'utf-8')
  console.log(`\nOutput written to: ${OUTPUT_JSON_PATH}`)
  console.log(`\n${allPostPass ? '✅ REPAIR COMPLETE' : '⚠️ REPAIR COMPLETE WITH WARNINGS'}`)
  console.log(`Backup: ${backupPath}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
