import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface Check {
  name: string
  status: 'PASS' | 'FAIL'
  detail: string
}

async function main() {
  console.log('K18-E3 Task37 Finalization Validation')
  console.log('='.repeat(60))

  const checks: Check[] = []

  // 1. TeachingTask 37 still exists
  const task = await prisma.teachingTask.findUnique({
    where: { id: 37 },
    include: { course: true, teacher: true },
  })
  checks.push({
    name: 'task37_exists',
    status: task ? 'PASS' : 'FAIL',
    detail: task ? `Course: ${task.course.name}` : 'Not found',
  })

  // 2. TTC 94 no longer exists
  const ttc94 = await prisma.teachingTaskClass.findUnique({ where: { id: 94 } })
  checks.push({
    name: 'ttc94_deleted',
    status: !ttc94 ? 'PASS' : 'FAIL',
    detail: !ttc94 ? 'TTC 94 correctly removed' : 'TTC 94 still exists',
  })

  // 3. task37 no longer links to CG35
  const ttc35Link = await prisma.teachingTaskClass.findFirst({
    where: { teachingTaskId: 37, classGroupId: 35 },
  })
  checks.push({
    name: 'task37_no_cg35_link',
    status: !ttc35Link ? 'PASS' : 'FAIL',
    detail: !ttc35Link ? 'No link to CG35' : 'Still linked to CG35',
  })

  // 4. TTC 92 still exists
  const ttc92 = await prisma.teachingTaskClass.findUnique({ where: { id: 92 } })
  checks.push({
    name: 'ttc92_preserved',
    status: ttc92 && ttc92.teachingTaskId === 37 && ttc92.classGroupId === 3 ? 'PASS' : 'FAIL',
    detail: ttc92 ? `task=${ttc92.teachingTaskId}, cg=${ttc92.classGroupId}` : 'Missing',
  })

  // 5. TTC 93 still exists
  const ttc93 = await prisma.teachingTaskClass.findUnique({ where: { id: 93 } })
  checks.push({
    name: 'ttc93_preserved',
    status: ttc93 && ttc93.teachingTaskId === 37 && ttc93.classGroupId === 17 ? 'PASS' : 'FAIL',
    detail: ttc93 ? `task=${ttc93.teachingTaskId}, cg=${ttc93.classGroupId}` : 'Missing',
  })

  // 6. task37 still links to CG3
  const cg3Link = await prisma.teachingTaskClass.findFirst({
    where: { teachingTaskId: 37, classGroupId: 3 },
  })
  checks.push({
    name: 'task37_links_cg3',
    status: cg3Link ? 'PASS' : 'FAIL',
    detail: cg3Link ? `TTC ${cg3Link.id}` : 'No link to CG3',
  })

  // 7. task37 still links to CG17
  const cg17Link = await prisma.teachingTaskClass.findFirst({
    where: { teachingTaskId: 37, classGroupId: 17 },
  })
  checks.push({
    name: 'task37_links_cg17',
    status: cg17Link ? 'PASS' : 'FAIL',
    detail: cg17Link ? `TTC ${cg17Link.id}` : 'No link to CG17',
  })

  // 8. ClassGroup 35 still exists
  const cg35 = await prisma.classGroup.findUnique({ where: { id: 35 } })
  checks.push({
    name: 'classgroup_35_preserved',
    status: cg35 ? 'PASS' : 'FAIL',
    detail: cg35 ? `${cg35.name}` : 'Not found',
  })

  // 9. ScheduleSlot 43 still exists
  const slot = await prisma.scheduleSlot.findUnique({ where: { id: 43 } })
  checks.push({
    name: 'slot_43_preserved',
    status: slot ? 'PASS' : 'FAIL',
    detail: slot ? `task=${slot.teachingTaskId}, day=${slot.dayOfWeek}, slot=${slot.slotIndex}` : 'Not found',
  })

  // 10. Slot 43 belongs to task37
  checks.push({
    name: 'slot_43_belongs_to_task37',
    status: slot && slot.teachingTaskId === 37 ? 'PASS' : 'FAIL',
    detail: slot ? `teachingTaskId=${slot.teachingTaskId}` : 'Slot not found',
  })

  // 11. ImportBatch 1 exists and confirmed
  const batch = await prisma.importBatch.findUnique({ where: { id: 1 } })
  checks.push({
    name: 'import_batch_1_confirmed',
    status: batch && batch.status === 'confirmed' ? 'PASS' : 'FAIL',
    detail: batch ? `status=${batch.status}` : 'Not found',
  })

  // 12. task37 not cross-cohort
  const ttcs = await prisma.teachingTaskClass.findMany({
    where: { teachingTaskId: 37 },
    include: { classGroup: true },
  })
  const cohortYears = new Set(
    ttcs.map((t) => {
      const m = t.classGroup.name.match(/^(\d{4})级/)
      return m ? parseInt(m[1]) : null
    }),
  )
  checks.push({
    name: 'task37_not_cross_cohort',
    status: cohortYears.size <= 1 ? 'PASS' : 'FAIL',
    detail: `Cohort years: [${[...cohortYears].join(', ')}], groups: [${ttcs.map((t) => t.classGroupId).sort((a, b) => a - b).join(', ')}]`,
  })

  // 13. Student count = 61
  const studentCount = ttcs.reduce((sum, t) => sum + (t.classGroup.studentCount ?? 0), 0)
  checks.push({
    name: 'task37_student_count_61',
    status: studentCount === 61 ? 'PASS' : 'FAIL',
    detail: `Student count: ${studentCount} (CG3=${ttcs.find((t) => t.classGroupId === 3)?.classGroup.studentCount ?? 0}, CG17=${ttcs.find((t) => t.classGroupId === 17)?.classGroup.studentCount ?? 0})`,
  })

  // 14. No remaining unaccepted cross-cohort task
  const allTasks = await prisma.teachingTaskClass.findMany({
    include: { teachingTask: true, classGroup: true },
  })
  const byTask = new Map<number, typeof allTasks>()
  for (const ttc of allTasks) {
    const arr = byTask.get(ttc.teachingTaskId) ?? []
    arr.push(ttc)
    byTask.set(ttc.teachingTaskId, arr)
  }
  const crossCohortTasks: Array<{ taskId: number; cgIds: number[]; years: (number | null)[] }> = []
  for (const [taskId, links] of byTask) {
    const years = new Set(
      links.map((l) => {
        const m = l.classGroup.name.match(/^(\d{4})级/)
        return m ? parseInt(m[1]) : null
      }),
    )
    if (years.size > 1) {
      crossCohortTasks.push({
        taskId,
        cgIds: links.map((l) => l.classGroupId).sort((a, b) => a - b),
        years: [...years],
      })
    }
  }
  checks.push({
    name: 'no_remaining_cross_cohort_task',
    status: crossCohortTasks.length === 0 ? 'PASS' : 'FAIL',
    detail: crossCohortTasks.length === 0 ? 'No cross-cohort tasks' : `Found: ${crossCohortTasks.map((t) => `task${t.taskId}[${t.cgIds.join(',')}]`).join(', ')}`,
  })

  // 15. K18-B previously repaired tasks 168/174/176/181 still no CG22
  const k18bTasks = [168, 174, 176, 181]
  for (const taskId of k18bTasks) {
    const links = await prisma.teachingTaskClass.findMany({
      where: { teachingTaskId: taskId },
      include: { classGroup: true },
    })
    const hasCg22 = links.some((l) => l.classGroupId === 22)
    checks.push({
      name: `k18b_task${taskId}_no_cg22`,
      status: !hasCg22 ? 'PASS' : 'FAIL',
      detail: `CGs: [${links.map((l) => l.classGroupId).sort((a, b) => a - b).join(', ')}]`,
    })
  }

  // Output
  console.log('')
  let passCount = 0
  let failCount = 0
  for (const check of checks) {
    const icon = check.status === 'PASS' ? '✅' : '❌'
    console.log(`${icon} ${check.name}: ${check.detail}`)
    if (check.status === 'PASS') passCount++
    else failCount++
  }
  console.log('')
  console.log(`Summary: ${passCount} PASS / ${failCount} FAIL`)

  if (failCount > 0) {
    console.log('\n❌ Validation FAILED.')
    await prisma.$disconnect()
    process.exit(1)
  }

  console.log('\n✅ All checks passed.')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  prisma.$disconnect()
  process.exit(1)
})
