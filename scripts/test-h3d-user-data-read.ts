// scripts/test-h3d-user-data-read.ts
// H3-D test: User data read access

import { PrismaClient } from '@prisma/client'
import {
  fetchJsonAsAdmin,
  fetchJsonAsUser,
  fetchJson,
  cleanup,
} from './test-auth-helper'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${message}`)
  } else {
    failed++
    console.error(`  ❌ ${message}`)
  }
}

function fileContains(relPath: string, search: string): boolean {
  try {
    const content = readFileSync(join(process.cwd(), relPath), 'utf-8')
    return content.includes(search)
  } catch {
    return false
  }
}

async function main() {
  console.log('🧪 H3-D User Data Read Tests\n')

  // ─── 1. Permission Tests ─────────────────────────────────────
  console.log('1️⃣  权限测试')

  // Summary API
  const noAuthSummary = await fetchJson('/api/data/summary')
  assert(noAuthSummary.status === 401, `未登录 /api/data/summary → 401 (实际: ${noAuthSummary.status})`)

  const userSummary = await fetchJsonAsUser('/api/data/summary')
  assert(userSummary.status === 200, `User /api/data/summary → 200 (实际: ${userSummary.status})`)

  const adminSummary = await fetchJsonAsAdmin('/api/data/summary')
  assert(adminSummary.status === 200, `Admin /api/data/summary → 200 (实际: ${adminSummary.status})`)

  // Teaching tasks API
  const noAuthTasks = await fetchJson('/api/data/teaching-tasks')
  assert(noAuthTasks.status === 401, `未登录 /api/data/teaching-tasks → 401 (实际: ${noAuthTasks.status})`)

  const userTasks = await fetchJsonAsUser('/api/data/teaching-tasks')
  assert(userTasks.status === 200, `User /api/data/teaching-tasks → 200 (实际: ${userTasks.status})`)

  // Schedule slots API
  const noAuthSlots = await fetchJson('/api/data/schedule-slots')
  assert(noAuthSlots.status === 401, `未登录 /api/data/schedule-slots → 401 (实际: ${noAuthSlots.status})`)

  const userSlots = await fetchJsonAsUser('/api/data/schedule-slots')
  assert(userSlots.status === 200, `User /api/data/schedule-slots → 200 (实际: ${userSlots.status})`)

  // ─── 2. Data Accuracy ────────────────────────────────────────
  console.log('\n2️⃣  数据准确性测试')

  const summaryData = (userSummary.data as any).summary
  const dbTeachingTaskCount = await prisma.teachingTask.count()
  const dbScheduleSlotCount = await prisma.scheduleSlot.count()

  assert(
    summaryData.teachingTasks === dbTeachingTaskCount,
    `TeachingTask 数量一致: API=${summaryData.teachingTasks}, DB=${dbTeachingTaskCount}`,
  )
  assert(
    summaryData.scheduleSlots === dbScheduleSlotCount,
    `ScheduleSlot 数量一致: API=${summaryData.scheduleSlots}, DB=${dbScheduleSlotCount}`,
  )
  assert(summaryData.courses > 0, `Course 数量 > 0 (实际: ${summaryData.courses})`)
  assert(summaryData.teachers > 0, `Teacher 数量 > 0 (实际: ${summaryData.teachers})`)
  assert(summaryData.rooms > 0, `Room 数量 > 0 (实际: ${summaryData.rooms})`)
  assert(summaryData.classGroups > 0, `ClassGroup 数量 > 0 (实际: ${summaryData.classGroups})`)

  // ─── 3. Tasks Data ───────────────────────────────────────────
  console.log('\n3️⃣  教学任务数据测试')

  const tasksData = (userTasks.data as any).tasks
  assert(Array.isArray(tasksData), '返回 tasks 数组')
  assert(tasksData.length > 0, 'tasks 不为空')
  assert(tasksData.length <= 100, 'tasks 数量 <= 100')

  if (tasksData.length > 0) {
    const firstTask = tasksData[0]
    assert('id' in firstTask, 'task 包含 id')
    assert('courseName' in firstTask, 'task 包含 courseName')
    assert('teacherName' in firstTask, 'task 包含 teacherName')
    assert('classNames' in firstTask, 'task 包含 classNames')
    assert(!('passwordHash' in firstTask), 'task 不包含 passwordHash')
  }

  // ─── 4. Slots Data ───────────────────────────────────────────
  console.log('\n4️⃣  课表安排数据测试')

  const slotsData = (userSlots.data as any).slots
  assert(Array.isArray(slotsData), '返回 slots 数组')
  assert(slotsData.length > 0, 'slots 不为空')
  assert(slotsData.length <= 100, 'slots 数量 <= 100')

  if (slotsData.length > 0) {
    const firstSlot = slotsData[0]
    assert('id' in firstSlot, 'slot 包含 id')
    assert('dayOfWeek' in firstSlot, 'slot 包含 dayOfWeek')
    assert('slotIndex' in firstSlot, 'slot 包含 slotIndex')
    assert('courseName' in firstSlot, 'slot 包含 courseName')
  }

  // ─── 5. User Cannot Write ────────────────────────────────────
  console.log('\n5️⃣  User 写权限防护测试')

  const userWriteTeachers = await fetchJsonAsUser('/api/teachers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '测试教师_越权' }),
  })
  assert(userWriteTeachers.status === 403, `User POST /api/teachers → 403 (实际: ${userWriteTeachers.status})`)

  const userImport = await fetchJsonAsUser('/api/admin/import/batches')
  assert(userImport.status === 403, `User /api/admin/import/batches → 403 (实际: ${userImport.status})`)

  const userScheduleAdj = await fetchJsonAsUser('/api/schedule-adjustments')
  assert(userScheduleAdj.status === 403, `User /api/schedule-adjustments → 403 (实际: ${userScheduleAdj.status})`)

  const userUsers = await fetchJsonAsUser('/api/admin/users')
  assert(userUsers.status === 403, `User /api/admin/users → 403 (实际: ${userUsers.status})`)

  // ─── 6. File Structure Check ─────────────────────────────────
  console.log('\n6️⃣  文件结构检查')

  assert(
    fileContains('src/app/api/data/summary/route.ts', 'requirePermission'),
    'summary API 使用 requirePermission',
  )
  assert(
    fileContains('src/app/api/data/summary/route.ts', 'data:read'),
    'summary API 使用 data:read',
  )
  assert(
    fileContains('src/app/api/data/teaching-tasks/route.ts', 'data:read'),
    'teaching-tasks API 使用 data:read',
  )
  assert(
    fileContains('src/app/api/data/schedule-slots/route.ts', 'data:read'),
    'schedule-slots API 使用 data:read',
  )
  assert(
    fileContains('src/app/data/page.tsx', 'ProtectedShell'),
    '/data 页面使用 ProtectedShell',
  )

  // ─── 7. Data Safety ──────────────────────────────────────────
  console.log('\n7️⃣  主数据安全检查')

  const scheduleSlotCount = await prisma.scheduleSlot.count()
  assert(scheduleSlotCount === 440, `ScheduleSlot = 440 (实际: ${scheduleSlotCount})`)

  const teachingTaskCount = await prisma.teachingTask.count()
  assert(teachingTaskCount === 308, `TeachingTask = 308 (实际: ${teachingTaskCount})`)

  const importBatch1 = await prisma.importBatch.findUnique({ where: { id: 1 } })
  assert(importBatch1?.status === 'confirmed', 'ImportBatch #1 still confirmed')

  // ─── Summary ─────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50))
  console.log(`📊 结果: ${passed} passed, ${failed} failed`)

  if (failed > 0) {
    console.error('❌ Some tests failed')
    process.exit(1)
  } else {
    console.log('✅ All tests passed')
  }
}

main()
  .catch((e) => {
    console.error('❌ Test error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await cleanup()
  })
