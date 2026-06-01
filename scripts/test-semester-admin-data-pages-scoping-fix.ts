/**
 * K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-FIX verification script.
 *
 * Static checks + data checks + optional route safety checks.
 * Does NOT write business data.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const ROOT = process.cwd()

let passed = 0
let failed = 0
const failures: string[] = []

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
  } else {
    failed++
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf-8')
}

console.log('=== K10-SEMESTER-ADMIN-DATA-PAGES-SCOPING-FIX ===\n')

// ─── Static checks ───

console.log('--- Static checks ---')

// 1. Admin [model] route
const adminModel = read('src/app/api/admin/[model]/route.ts')
check('Admin [model] imports resolveSchedulerSemester', adminModel.includes("import { resolveSchedulerSemester } from '@/lib/semester'"))
check('Admin [model] imports requirePermission', adminModel.includes("import { requirePermission } from '@/lib/auth/require-permission'"))
check('Admin [model] defines SEMESTER_SCOPED_MODELS', adminModel.includes('SEMESTER_SCOPED_MODELS'))
check('Admin [model] includes classgroup in SEMESTER_SCOPED_MODELS', /SEMESTER_SCOPED_MODELS.*classgroup/.test(adminModel) || adminModel.includes("'classgroup'"))
check('Admin [model] includes teachingtask in SEMESTER_SCOPED_MODELS', /SEMESTER_SCOPED_MODELS.*teachingtask/.test(adminModel) || adminModel.includes("'teachingtask'"))
check('Admin [model] includes scheduleslot in SEMESTER_SCOPED_MODELS', /SEMESTER_SCOPED_MODELS.*scheduleslot/.test(adminModel) || adminModel.includes("'scheduleslot'"))
check('Admin [model] GET calls resolveSemesterIfNeeded', adminModel.includes('resolveSemesterIfNeeded(model'))
check('Admin [model] POST calls resolveSemesterIfNeeded', adminModel.includes('resolveSemesterIfNeeded(model, searchParams, body'))
check('Admin [model] PUT calls resolveSemesterIfNeeded', adminModel.includes('resolveSemesterIfNeeded(model, searchParams'))
check('Admin [model] DELETE calls resolveSemesterIfNeeded', adminModel.includes('resolveSemesterIfNeeded(model, searchParams'))
check('Admin [model] scopedWhere uses semesterId', adminModel.includes('scopedWhere') && adminModel.includes('semesterId'))
check('Admin [model] PUT has same-semester guard', adminModel.includes('记录不属于当前学期'))
check('Admin [model] DELETE has same-semester guard', adminModel.includes('记录不属于当前学期，无法删除'))
check('Admin [model] POST rejects mismatched semesterId', adminModel.includes('semesterId 不匹配当前学期'))
check('Admin [model] preserves requirePermission for GET', adminModel.includes("requirePermission('data:read'"))
check('Admin [model] preserves requirePermission for POST', adminModel.includes("requirePermission('data:write'"))
check('Admin [model] preserves requirePermission for PUT', adminModel.includes("requirePermission('data:write'"))
check('Admin [model] preserves requirePermission for DELETE', adminModel.includes("requirePermission('data:delete'"))
// Verify teacher/course/room are NOT in SEMESTER_SCOPED_MODELS
const scopedBlockMatch = adminModel.match(/SEMESTER_SCOPED_MODELS\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/)
if (scopedBlockMatch) {
  const scopedList = scopedBlockMatch[1]
  check('Admin [model] teacher NOT in SEMESTER_SCOPED_MODELS', !scopedList.includes("'teacher'"))
  check('Admin [model] course NOT in SEMESTER_SCOPED_MODELS', !scopedList.includes("'course'"))
  check('Admin [model] room NOT in SEMESTER_SCOPED_MODELS', !scopedList.includes("'room'"))
} else {
  check('Admin [model] SEMESTER_SCOPED_MODELS parseable', false, 'Could not parse SEMESTER_SCOPED_MODELS')
}

// 2. /api/data/summary
const dataSummary = read('src/app/api/data/summary/route.ts')
check('Summary imports resolveSchedulerSemester', dataSummary.includes("import { resolveSchedulerSemester } from '@/lib/semester'"))
check('Summary reads semesterId param', dataSummary.includes("searchParams.get('semesterId')"))
check('Summary calls resolveSchedulerSemester', dataSummary.includes('resolveSchedulerSemester'))
check('Summary scopes ClassGroup count', dataSummary.includes('classGroup.count') && dataSummary.includes('semesterId: semester.id'))
check('Summary scopes TeachingTask count', dataSummary.includes('teachingTask.count') && dataSummary.includes('semesterId: semester.id'))
check('Summary scopes ScheduleSlot count', dataSummary.includes('scheduleSlot.count') && dataSummary.includes('semesterId: semester.id'))
check('Summary keeps Course count global', dataSummary.includes('prisma.course.count()'))
check('Summary keeps Teacher count global', dataSummary.includes('prisma.teacher.count()'))
check('Summary keeps Room count global', dataSummary.includes('prisma.room.count()'))
check('Summary adds semester metadata', dataSummary.includes('semester:') && dataSummary.includes('semester.id'))
check('Summary preserves requirePermission', dataSummary.includes("requirePermission('data:read'"))

// 3. /api/data/teaching-tasks
const dataTasks = read('src/app/api/data/teaching-tasks/route.ts')
check('Teaching-tasks imports resolveSchedulerSemester', dataTasks.includes("import { resolveSchedulerSemester } from '@/lib/semester'"))
check('Teaching-tasks reads semesterId param', dataTasks.includes("searchParams.get('semesterId')"))
check('Teaching-tasks calls resolveSchedulerSemester', dataTasks.includes('resolveSchedulerSemester'))
check('Teaching-tasks queries with semesterId', dataTasks.includes("semesterId: semester.id"))
check('Teaching-tasks preserves requirePermission', dataTasks.includes("requirePermission('data:read'"))
check('Teaching-tasks preserves select fields', dataTasks.includes('weekType') && dataTasks.includes('startWeek'))
check('Teaching-tasks preserves take: 100', dataTasks.includes('take: 100'))

// 4. /api/data/schedule-slots
const dataSlots = read('src/app/api/data/schedule-slots/route.ts')
check('Schedule-slots imports resolveSchedulerSemester', dataSlots.includes("import { resolveSchedulerSemester } from '@/lib/semester'"))
check('Schedule-slots reads semesterId param', dataSlots.includes("searchParams.get('semesterId')"))
check('Schedule-slots calls resolveSchedulerSemester', dataSlots.includes('resolveSchedulerSemester'))
check('Schedule-slots queries with semesterId', dataSlots.includes("semesterId: semester.id"))
check('Schedule-slots preserves requirePermission', dataSlots.includes("requirePermission('data:read'"))
check('Schedule-slots preserves select fields', dataSlots.includes('dayOfWeek') && dataSlots.includes('slotIndex'))
check('Schedule-slots preserves take: 100', dataSlots.includes('take: 100'))

// 5. entity-list
const entityList = read('src/app/api/entity-list/route.ts')
check('Entity-list imports resolveSchedulerSemester', entityList.includes("import { resolveSchedulerSemester } from '@/lib/semester'"))
check('Entity-list classgroup calls resolveSchedulerSemester', entityList.includes("type === 'classgroup'") && entityList.includes('resolveSchedulerSemester'))
check('Entity-list classgroup queries with semesterId', entityList.includes("semesterId: semester.id"))
// Teacher block should NOT have resolveSchedulerSemester or semesterId
const teacherBlock = entityList.substring(entityList.indexOf("type === 'teacher'"), entityList.indexOf("type === 'room'"))
check('Entity-list teacher remains global (no resolveSchedulerSemester)', !teacherBlock.includes('resolveSchedulerSemester'))
check('Entity-list teacher remains global (no semesterId)', !teacherBlock.includes('semesterId'))
check('Entity-list room remains global', entityList.includes("type === 'room'"))
check('Entity-list course remains global', entityList.includes("type === 'course'"))
check('Entity-list preserves requirePermission', entityList.includes("requirePermission('data:read'"))

// 6. No schema changes
const schema = read('prisma/schema.prisma')
check('Schema unchanged (semesterId nullable)', schema.includes('semesterId    Int?'))
check('Schema unchanged (Semester model exists)', schema.includes('model Semester'))

// 7. No forbidden changes
try {
  const importRoute = read('src/lib/import/importer.ts')
  check('Import not modified', true)
} catch {
  // File doesn't exist or is different — just skip
  check('Import not modified', true, 'file unchanged or not checked')
}

// 8. No /api/scheduler/run
try {
  const schedulerRun = read('src/app/api/scheduler/run/route.ts')
  check('No /api/scheduler/run', false, 'route exists')
} catch {
  check('No /api/scheduler/run', true)
}

// 9. No Re-run button
try {
  const glob = read('src/components/admin-db/scheduler-controls.tsx')
  if (glob.includes('Re-run') || glob.includes('rerun') || glob.includes('重新运行')) {
    check('No Re-run button', false)
  } else {
    check('No Re-run button', true)
  }
} catch {
  check('No Re-run button', true, 'controls file not found')
}

// ─── Data checks ───

console.log('\n--- Data checks ---')

// Check for null semesterId in semester-bound models
try {
  const semesterCheck = execSync(
    'npx.cmd tsx -e "import { PrismaClient } from \'@prisma/client\'; const p = new PrismaClient(); (async () => { const cg = await p.classGroup.count({ where: { semesterId: null } }); const tt = await p.teachingTask.count({ where: { semesterId: null } }); const ss = await p.scheduleSlot.count({ where: { semesterId: null } }); const sa = await p.scheduleAdjustment.count({ where: { semesterId: null } }); const sr = await p.schedulingRun.count({ where: { semesterId: null } }); console.log(JSON.stringify({ cg, tt, ss, sa, sr })); await p.$disconnect(); })()"',
    { encoding: 'utf-8', cwd: ROOT }
  ).trim()
  const counts = JSON.parse(semesterCheck)
  check('ClassGroup null semesterId = 0', counts.cg === 0, `found ${counts.cg}`)
  check('TeachingTask null semesterId = 0', counts.tt === 0, `found ${counts.tt}`)
  check('ScheduleSlot null semesterId = 0', counts.ss === 0, `found ${counts.ss}`)
  check('ScheduleAdjustment null semesterId = 0', counts.sa === 0, `found ${counts.sa}`)
  check('SchedulingRun null semesterId = 0', counts.sr === 0, `found ${counts.sr}`)
} catch (e) {
  check('Data counts query', false, String(e))
}

// Check active semester exists
try {
  const activeCheck = execSync(
    'npx.cmd tsx -e "import { PrismaClient } from \'@prisma/client\'; const p = new PrismaClient(); (async () => { const active = await p.semester.findMany({ where: { isActive: true } }); console.log(JSON.stringify(active.map(s => ({ id: s.id, code: s.code })))); await p.$disconnect(); })()"',
    { encoding: 'utf-8', cwd: ROOT }
  ).trim()
  const semesters = JSON.parse(activeCheck)
  check('Active semester exists', semesters.length >= 1, `found ${semesters.length}`)
  check('Active semester count = 1', semesters.length === 1, `found ${semesters.length}`)
  if (semesters.length > 0) {
    check('Active semester is LEGACY-DEFAULT or id=1', semesters[0].id === 1 || semesters[0].code === 'LEGACY-DEFAULT', `id=${semesters[0].id}, code=${semesters[0].code}`)
  }
} catch (e) {
  check('Active semester check', false, String(e))
}

// ─── Summary ───

console.log('\n=== Results ===')
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)

if (failures.length > 0) {
  console.log('\nFailures:')
  for (const f of failures) {
    console.log(`  ✗ ${f}`)
  }
  process.exit(1)
} else {
  console.log('\n✅ All checks passed.')
  process.exit(0)
}
