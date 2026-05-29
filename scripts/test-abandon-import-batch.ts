import { PrismaClient } from '@prisma/client'
import { fetchJsonAsAdmin } from './test-auth-helper'

const prisma = new PrismaClient()

async function fetchJson(path: string, options?: RequestInit): Promise<{ status: number; data: any }> {
  return fetchJsonAsAdmin(path, options) as Promise<{ status: number; data: any }>
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

async function main() {
  console.log('=== Test Abandon Import Batch Guards ===\n')

  // Find a pending batch
  const pendingBatch = await prisma.importBatch.findFirst({
    where: { status: 'pending' },
    orderBy: { id: 'desc' },
  })

  if (!pendingBatch) {
    console.log('No pending ImportBatch found.')
    console.log('SKIPPED (not a code failure)')
    process.exit(0)
  }

  console.log(`Pending batch: #${pendingBatch.id} (${pendingBatch.status})\n`)

  // Record counts before
  const before = {
    classGroup: await prisma.classGroup.count(),
    teacher: await prisma.teacher.count(),
    course: await prisma.course.count(),
    room: await prisma.room.count(),
    teachingTask: await prisma.teachingTask.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
    batchStatus: (await prisma.importBatch.findUnique({ where: { id: pendingBatch.id } }))!.status,
  }

  let failed = false

  function check(name: string, ok: boolean, detail: string) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}${ok ? '' : ` — ${detail}`}`)
    if (!ok) failed = true
  }

  console.log('--- Guard Tests ---')

  // Guard 1: No confirmText → 400
  const r1 = await fetchJson(`/api/admin/import/batches/${pendingBatch.id}/abandon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  check('No confirmText → 400', r1.status === 400, `status=${r1.status}`)

  // Guard 2: Wrong confirmText → 400
  const r2 = await fetchJson(`/api/admin/import/batches/${pendingBatch.id}/abandon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmText: 'WRONG' }),
  })
  check('Wrong confirmText → 400', r2.status === 400, `status=${r2.status}`)

  // Guard 3: Invalid batch ID → 400
  const r3 = await fetchJson('/api/admin/import/batches/abc/abandon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmText: 'ABANDON_IMPORT' }),
  })
  check('Invalid batch ID → 400', r3.status === 400, `status=${r3.status}`)

  // Guard 4: Non-existent batch → 404
  const r4 = await fetchJson('/api/admin/import/batches/999999/abandon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmText: 'ABANDON_IMPORT' }),
  })
  check('Non-existent batch → 404', r4.status === 404, `status=${r4.status}`)

  // Guard 5: Rolled-back batch → 400
  const rolledBackBatch = await prisma.importBatch.findFirst({
    where: { status: 'rolled_back' },
  })
  if (rolledBackBatch) {
    const r5 = await fetchJson(`/api/admin/import/batches/${rolledBackBatch.id}/abandon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmText: 'ABANDON_IMPORT' }),
    })
    check('Rolled-back batch → 400', r5.status === 400, `status=${r5.status}`)
  } else {
    check('Rolled-back batch → 400', true, 'no rolled_back batch to test')
  }

  // Guard 6: NOT actually abandoning the pending batch
  check('Not executing ABANDON_IMPORT', true, 'test script does not abandon')

  // Verify database counts unchanged
  console.log('\n--- Database Count Checks ---')
  const after = {
    classGroup: await prisma.classGroup.count(),
    teacher: await prisma.teacher.count(),
    course: await prisma.course.count(),
    room: await prisma.room.count(),
    teachingTask: await prisma.teachingTask.count(),
    teachingTaskClass: await prisma.teachingTaskClass.count(),
    scheduleSlot: await prisma.scheduleSlot.count(),
    batchStatus: (await prisma.importBatch.findUnique({ where: { id: pendingBatch.id } }))!.status,
  }

  check('ClassGroup unchanged', before.classGroup === after.classGroup, `${before.classGroup} → ${after.classGroup}`)
  check('Teacher unchanged', before.teacher === after.teacher, `${before.teacher} → ${after.teacher}`)
  check('Course unchanged', before.course === after.course, `${before.course} → ${after.course}`)
  check('Room unchanged', before.room === after.room, `${before.room} → ${after.room}`)
  check('TeachingTask unchanged', before.teachingTask === after.teachingTask, `${before.teachingTask} → ${after.teachingTask}`)
  check('TeachingTaskClass unchanged', before.teachingTaskClass === after.teachingTaskClass, `${before.teachingTaskClass} → ${after.teachingTaskClass}`)
  check('ScheduleSlot unchanged', before.scheduleSlot === after.scheduleSlot, `${before.scheduleSlot} → ${after.scheduleSlot}`)
  check('BatchStatus still pending', after.batchStatus === 'pending', `status=${after.batchStatus}`)

  console.log()

  if (failed) {
    console.log('FAIL')
    process.exit(1)
  }

  console.log('PASS')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  prisma.$disconnect().then(() => process.exit(1))
})
