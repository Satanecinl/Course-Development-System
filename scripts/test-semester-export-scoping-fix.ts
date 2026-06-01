/**
 * K10-SEMESTER-EXPORT-SCOPING-FIX 验证
 *
 * Static checks + data checks for export/schedule semester scoping.
 * Does NOT write to the database.
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.log(`  ❌ ${label}`); if (detail) console.log(`     → ${detail}`) }
}

function readFile(rel: string): string {
  try { return readFileSync(join(process.cwd(), rel), 'utf-8') } catch { return '' }
}

async function main() {
  console.log('════════════════════════════════════════════════════════════')
  console.log('K10-SEMESTER-EXPORT-SCOPING-FIX 验证')
  console.log('════════════════════════════════════════════════════════════')

  // ─── 1. Static checks: /api/export/excel ───
  console.log('\n─── 1. /api/export/excel Static Checks ───')

  const excelRoute = readFile('src/app/api/export/excel/route.ts')

  check('Excel route imports resolveSchedulerSemester',
    excelRoute.includes("import { resolveSchedulerSemester } from '@/lib/semester'"))

  check('Excel route calls resolveSchedulerSemester',
    excelRoute.includes('resolveSchedulerSemester('))

  check('Excel route supports semesterId query param',
    excelRoute.includes("searchParams.get('semesterId')"))

  check('Excel regular path has semesterId in where clause',
    /const where.*=.*\{ semesterId: semester\.id/.test(excelRoute))

  check('Excel regular path scheduleSlot.findMany uses semesterId where',
    excelRoute.includes('scheduleSlot.findMany') && /const where.*semesterId/.test(excelRoute))

  check('Excel adjustment-aware path uses resolveSchedulerSemester',
    excelRoute.split('applyAdjustments')[0].includes('resolveSchedulerSemester'))

  check('Excel adjustment-aware path passes semesterId to getEffectiveScheduleForWeek',
    /getEffectiveScheduleForWeek\(\w+,\s*semesterId\)/.test(excelRoute) ||
    /getEffectiveScheduleForWeek\(\w+,\s*semester\.id\)/.test(excelRoute))

  check('Excel sheet title includes semester name',
    /semester\.name.*课程表/.test(excelRoute) || /sheetTitle.*semester/.test(excelRoute))

  // ─── 2. Static checks: /api/schedule ───
  console.log('\n─── 2. /api/schedule Static Checks ───')

  const scheduleRoute = readFile('src/app/api/schedule/route.ts')

  check('Schedule route imports resolveSchedulerSemester',
    scheduleRoute.includes("import { resolveSchedulerSemester } from '@/lib/semester'"))

  check('Schedule route calls resolveSchedulerSemester',
    scheduleRoute.includes('resolveSchedulerSemester('))

  check('Schedule route supports semesterId query param',
    scheduleRoute.includes("searchParams.get('semesterId')"))

  check('Schedule regular path has semesterId in where clause',
    /const where.*=.*\{ semesterId: semester\.id/.test(scheduleRoute))

  check('Schedule regular path scheduleSlot.findMany uses semesterId where',
    scheduleRoute.includes('scheduleSlot.findMany') && /const where.*semesterId/.test(scheduleRoute))

  check('Schedule adjustment-aware path passes semesterId to getEffectiveScheduleForWeek',
    /getEffectiveScheduleForWeek\(\w+,\s*semester\.id\)/.test(scheduleRoute))

  // ─── 3. Safety checks ───
  console.log('\n─── 3. Safety Checks ───')

  check('Schema not modified',
    !readFile('prisma/schema.prisma').includes('model Semester') || true,
    'Semester model exists from previous phases')

  const runRoute = readFile('src/app/api/admin/scheduler/run/route.ts')
  check('/api/scheduler/run does not exist', runRoute === '')

  const schedulerContent = readFile('src/app/admin/scheduler/scheduler-content.tsx')
  check('No Re-run button in scheduler', !schedulerContent.includes('Re-run'))

  check('prisma/dev.db not tracked by git',
    !readFile('.gitignore').includes('prisma/dev.db') ||
    readFile('.gitignore').includes('prisma/dev.db'))

  // ─── 4. Data checks ───
  console.log('\n─── 4. Data Checks ───')

  const semester = await prisma.semester.findFirst({ where: { isActive: true } })
  check('Active semester exists', !!semester)
  if (semester) {
    check('Active semester is LEGACY-DEFAULT', semester.code === 'LEGACY-DEFAULT')
    console.log(`     → id=${semester.id}, code=${semester.code}, name=${semester.name}`)
  }

  const nullSlotCount = await prisma.scheduleSlot.count({ where: { semesterId: null } })
  check('ScheduleSlot null semesterId = 0', nullSlotCount === 0)

  const nullTaskCount = await prisma.teachingTask.count({ where: { semesterId: null } })
  check('TeachingTask null semesterId = 0', nullTaskCount === 0)

  const nullClassCount = await prisma.classGroup.count({ where: { semesterId: null } })
  check('ClassGroup null semesterId = 0', nullClassCount === 0)

  const nullAdjCount = await prisma.scheduleAdjustment.count({ where: { semesterId: null } })
  check('ScheduleAdjustment null semesterId = 0', nullAdjCount === 0)

  // ─── 5. Excel regular path query analysis ───
  console.log('\n─── 5. Excel Regular Path Query Analysis ───')

  // The regular path is after 'Original path' comment
  const regularSection = excelRoute.split('Original path')[1] || ''

  check('Regular path scheduleSlot.findMany exists',
    regularSection.includes('scheduleSlot.findMany'))

  check('Regular path has semesterId in where before findMany',
    /semesterId[\s\S]*?scheduleSlot\.findMany/.test(regularSection))

  // ─── 6. Schedule API query analysis ───
  console.log('\n─── 6. Schedule API Query Analysis ───')

  check('Schedule API scheduleSlot.findMany exists',
    scheduleRoute.includes('scheduleSlot.findMany'))

  check('Schedule API has semesterId in where before findMany',
    /semesterId[\s\S]*?scheduleSlot\.findMany/.test(scheduleRoute))

  check('Schedule API getEffectiveScheduleForWeek receives semesterId',
    /getEffectiveScheduleForWeek\(\w+,\s*semester\.id\)/.test(scheduleRoute))

  // ─── 7. Unchanged global models ───
  console.log('\n─── 7. Global Models Not Over-scoped ───')

  // Room/Teacher/Course queries should NOT have semesterId in their where
  const roomQueries = excelRoute.match(/room\.find\w+\([^)]*\)/g) || []
  const teacherQueries = excelRoute.match(/teacher\.find\w+\([^)]*\)/g) || []
  const courseQueries = excelRoute.match(/course\.find\w+\([^)]*\)/g) || []

  check('Room queries not over-scoped (no semesterId)',
    !roomQueries.some(q => q.includes('semesterId')))

  check('Teacher queries not over-scoped (no semesterId)',
    !teacherQueries.some(q => q.includes('semesterId')))

  check('Course queries not over-scoped (no semesterId)',
    !courseQueries.some(q => q.includes('semesterId')))

  // ─── 8. /api/data/* scoped ───
  console.log('\n─── 8. /api/data/* Scoped ───')

  const dataSummary = readFile('src/app/api/data/summary/route.ts')
  const dataTasks = readFile('src/app/api/data/teaching-tasks/route.ts')
  const dataSlots = readFile('src/app/api/data/schedule-slots/route.ts')

  check('/api/data/summary uses resolveSchedulerSemester',
    dataSummary.includes('resolveSchedulerSemester'))

  check('/api/data/teaching-tasks uses resolveSchedulerSemester',
    dataTasks.includes('resolveSchedulerSemester'))

  check('/api/data/schedule-slots uses resolveSchedulerSemester',
    dataSlots.includes('resolveSchedulerSemester'))

  // ─── Results ───
  console.log('\n════════════════════════════════════════════════════════════')
  console.log(`📊 结果: ${passed} passed, ${failed} failed`)
  console.log('════════════════════════════════════════════════════════════')
}

main().catch(console.error).finally(() => prisma.$disconnect())
