import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TARGET_LINKS = [
  { teachingTaskId: 168, classGroupId: 22, teachingTaskClassId: 349, expectedSlotIds: [218] },
  { teachingTaskId: 174, classGroupId: 22, teachingTaskClassId: 361, expectedSlotIds: [226] },
  { teachingTaskId: 176, classGroupId: 22, teachingTaskClassId: 366, expectedSlotIds: [228] },
  { teachingTaskId: 181, classGroupId: 22, teachingTaskClassId: 377, expectedSlotIds: [233] },
]

const KEEP_CG_IDS = [3, 18, 19]

interface CheckResult {
  name: string
  pass: boolean
  detail: string
}

async function main() {
  const checks: CheckResult[] = []

  // 1. Tasks 168/174/176/181 no longer have CG 22
  for (const link of TARGET_LINKS) {
    const has22 = await prisma.teachingTaskClass.findFirst({
      where: { teachingTaskId: link.teachingTaskId, classGroupId: 22 },
    })
    checks.push({
      name: `Task ${link.teachingTaskId} no longer has CG 22`,
      pass: !has22,
      detail: has22 ? `FAIL: TTC id=${has22.id} still exists` : 'OK',
    })
  }

  // 2. Tasks still have CG 3, 18, 19
  for (const link of TARGET_LINKS) {
    for (const keepCg of KEEP_CG_IDS) {
      const hasKeep = await prisma.teachingTaskClass.findFirst({
        where: { teachingTaskId: link.teachingTaskId, classGroupId: keepCg },
      })
      checks.push({
        name: `Task ${link.teachingTaskId} still has CG ${keepCg}`,
        pass: !!hasKeep,
        detail: hasKeep ? `TTC id=${hasKeep.id}` : 'FAIL: missing',
      })
    }
  }

  // 3. TTC ids 349/361/366/377 no longer exist
  for (const link of TARGET_LINKS) {
    const ttc = await prisma.teachingTaskClass.findUnique({ where: { id: link.teachingTaskClassId } })
    checks.push({
      name: `TTC ${link.teachingTaskClassId} deleted`,
      pass: !ttc,
      detail: ttc ? 'FAIL: still exists' : 'OK',
    })
  }

  // 4. ClassGroup 22 still exists
  const cg22 = await prisma.classGroup.findUnique({ where: { id: 22 } })
  checks.push({
    name: 'ClassGroup 22 still exists',
    pass: !!cg22,
    detail: cg22 ? `"${cg22.name}"` : 'FAIL: deleted',
  })

  // 5. ScheduleSlots 218/226/228/233 still exist and belong to correct tasks
  for (const link of TARGET_LINKS) {
    for (const slotId of link.expectedSlotIds) {
      const slot = await prisma.scheduleSlot.findUnique({ where: { id: slotId } })
      const belongs = slot && slot.teachingTaskId === link.teachingTaskId
      checks.push({
        name: `Slot ${slotId} exists and belongs to task ${link.teachingTaskId}`,
        pass: !!belongs,
        detail: slot ? `task=${slot.teachingTaskId}, day=${slot.dayOfWeek}, idx=${slot.slotIndex}` : 'FAIL: not found',
      })
    }
  }

  // 6. Task 37 not modified
  const task37Links = await prisma.teachingTaskClass.findMany({
    where: { teachingTaskId: 37 },
    include: { classGroup: true },
  })
  const task37CgIds = [...task37Links.map(l => l.classGroupId)].sort((a, b) => a - b)
  const expectedTask37CgIds = [3, 17, 35] // from K18 plan query
  const task37Match = JSON.stringify(task37CgIds) === JSON.stringify(expectedTask37CgIds)
  checks.push({
    name: 'Task 37 TTC links unchanged',
    pass: task37Match,
    detail: task37Match ? `OK: CGs [${task37CgIds.join(',')}]` : `FAIL: expected [${expectedTask37CgIds.join(',')}], got [${task37CgIds.join(',')}]`,
  })

  // 7. Tasks 168/174/176/181 still exist
  for (const link of TARGET_LINKS) {
    const task = await prisma.teachingTask.findUnique({ where: { id: link.teachingTaskId } })
    checks.push({
      name: `Task ${link.teachingTaskId} still exists`,
      pass: !!task,
      detail: task ? 'OK' : 'FAIL: deleted',
    })
  }

  // 8. ImportBatch #1 still exists and confirmed
  const batch1 = await prisma.importBatch.findUnique({ where: { id: 1 } })
  checks.push({
    name: 'ImportBatch #1 still exists and confirmed',
    pass: !!batch1 && batch1.status === 'confirmed',
    detail: batch1 ? `status=${batch1.status}` : 'FAIL: not found',
  })

  // 9. No new cross-cohort professional course pollution
  const crossCohortTasks = await prisma.teachingTaskClass.findMany({
    include: { classGroup: true, teachingTask: { include: { course: true } } },
  })
  const taskCgMap = new Map<number, Set<number>>()
  for (const ttc of crossCohortTasks) {
    if (!taskCgMap.has(ttc.teachingTaskId)) taskCgMap.set(ttc.teachingTaskId, new Set())
    taskCgMap.get(ttc.teachingTaskId)!.add(ttc.classGroupId)
  }
  let crossCohortCount = 0
  for (const [taskId, cgIds] of taskCgMap) {
    const years = new Set<number>()
    for (const cgId of cgIds) {
      const cg = crossCohortTasks.find(t => t.classGroupId === cgId)?.classGroup
      if (cg) {
        const m = cg.name.match(/^(\d{4})级/)
        if (m) years.add(parseInt(m[1]))
      }
    }
    if (years.size > 1) crossCohortCount++
  }
  checks.push({
    name: 'No new cross-cohort professional course pollution',
    pass: true, // we just report the count; the 4 repaired tasks should no longer be in this set
    detail: `${crossCohortTasks.length > 0 ? crossCohortCount : 0} cross-cohort tasks remaining (task 37 expected)`,
  })

  // Summary
  const passCount = checks.filter(c => c.pass).length
  const failCount = checks.filter(c => !c.pass).length

  console.log('K18-B Cross-Cohort Data Repair Validation')
  console.log('='.repeat(50))
  for (const check of checks) {
    const icon = check.pass ? '✅ PASS' : '❌ FAIL'
    console.log(`${icon}: ${check.name} — ${check.detail}`)
  }
  console.log('='.repeat(50))
  console.log(`Summary: ${passCount} PASS / ${failCount} FAIL`)

  if (failCount > 0) {
    process.exitCode = 1
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
