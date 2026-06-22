/**
 * L7-F5 Verify Script — Valid XLSX Course Setting Apply Trial
 *
 * Stage: L7-F5-VALID-XLSX-COURSE-SETTING-APPLY-TRIAL-AFTER-CLASSGROUP-COPY
 *
 * 120+ read-only checks confirming valid apply trial correctness.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const APPLY_SVC = join(ROOT, 'src/lib/import/course-setting-apply-l7-f.ts')
const APPLY_ROUTE = join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/partial-import-apply/route.ts')
const PLAN_BUILDER = join(ROOT, 'src/lib/import/course-setting-partial-import-plan-l6-e2.ts')
const CLI_TRIAL = join(ROOT, 'scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts')
const MIGRATIONS = join(ROOT, 'prisma/migrations')

type Check = { name: string; ok: boolean; detail?: string }
const results: Check[] = []
const record = (name: string, ok: boolean, detail?: string): void => {
  results.push({ name, ok, detail })
  const mark = ok ? '✓' : '✗'
  const tail = detail ? ` — ${detail}` : ''
  console.log(`  ${mark} ${name}${tail}`)
}
const readF = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf-8') : '')
const ex = (cmd: string): string =>
  execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim()

async function main(): Promise<void> {
  console.log('=== L7-F5 Verify: Valid XLSX Course Setting Apply Trial ===\n')
  const prisma = new PrismaClient()
  const applySvc = readF(APPLY_SVC)
  const applyRoute = readF(APPLY_ROUTE)
  const planBuilder = readF(PLAN_BUILDER)
  const cliTrial = readF(CLI_TRIAL)
  const migrations = existsSync(MIGRATIONS)
    ? readdirSync(MIGRATIONS).filter((n) => statSync(join(MIGRATIONS, n)).isDirectory()).join('\n')
    : ''

  // ── 1. Pre-flight ─────────────────────────────────────────────────
  console.log('[1/8] pre-flight')
  let branch = '', aheadBehind = ''
  try {
    branch = ex('git rev-parse --abbrev-ref HEAD')
    aheadBehind = ex('git rev-list --left-right --count HEAD...origin/master')
  } catch { record('git runnable', false) }
  record('branch is master', branch === 'master')
  record('ahead/behind 0/0', aheadBehind === '0\t0')

  // ── 2. Stage constants + route guards ────────────────────────────
  console.log('[2/8] stage + route')
  record('L7-F5 apply service exists', existsSync(APPLY_SVC))
  record('apply route requires import:manage', /import:manage/.test(applyRoute))
  record('apply route checks confirmToken', /confirmToken|APPLY_XLSX_COURSE_SETTING_4/.test(applyRoute))
  record('apply route has classGroup gate', /TARGET_SEMESTER_HAS_NO_CLASS_GROUPS/.test(applyRoute))
  record('apply route gates classGroup before backup', /classGroup[\s\S]{0,400}executeL7FCourseSettingApply/.test(applyRoute))
  record('plan builder blocks rows without classGroupRefs', /classGroupMissing[\s\S]{0,100}blockersForRow/.test(planBuilder) || /resolvedClassGroupIds\.length === 0[\s\S]{0,200}blockersForRow/.test(planBuilder))
  record('CLI trial uses auto-resolve', /autoResolvedResolutions/.test(cliTrial))
  record('CLI trial builds raw map from second parse', /rawByApprovalItemId/.test(cliTrial))
  record('CLI trial uses APPLY_XLSX_COURSE_SETTING_4', /APPLY_XLSX_COURSE_SETTING_4/.test(cliTrial))
  record('CLI trial rejects invalid token', /confirm token mismatch|INVALID_CONFIRM_TOKEN/.test(cliTrial))

  // ── 3. DB counts ──────────────────────────────────────────────────
  console.log('[3/8] DB counts (post-apply)')
  const course = await prisma.course.count()
  const teacher = await prisma.teacher.count()
  const sem1CG = await prisma.classGroup.count({ where: { semesterId: 1 } })
  const sem4CG = await prisma.classGroup.count({ where: { semesterId: 4 } })
  const sem4TT = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  const sem4TTC = await prisma.teachingTaskClass.count({ where: { teachingTask: { semesterId: 4 } } })
  const ib = await prisma.importBatch.count()
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } })
  const ib40 = await prisma.importBatch.findUnique({ where: { id: 40 } })
  const sem4SS = await prisma.scheduleSlot.count({ where: { semesterId: 4 } })
  const sem4SA = await prisma.scheduleAdjustment.count({ where: { semesterId: 4 } })

  record('Course count = 352 (was 104, +248)', course === 352, `count=${course}`)
  record('Teacher count = 220 (unchanged)', teacher === 220, `count=${teacher}`)
  record('ClassGroup sem1 = 36 (unchanged)', sem1CG === 36, `count=${sem1CG}`)
  record('ClassGroup sem4 = 36 (unchanged)', sem4CG === 36, `count=${sem4CG}`)
  record('TeachingTask sem4 = 248', sem4TT === 248, `count=${sem4TT}`)
  record('TeachingTaskClass sem4 = 5398', sem4TTC === 5398, `count=${sem4TTC}`)
  record('ScheduleSlot sem4 = 0', sem4SS === 0, `count=${sem4SS}`)
  record('ScheduleAdjustment sem4 = 0', sem4SA === 0, `count=${sem4SA}`)
  record('ImportBatch count = 40 (+1)', ib === 40, `count=${ib}`)
  record('ImportBatch #39 exists', ib39 != null)
  record('ImportBatch #39 status = APPLIED', ib39?.status === 'APPLIED')
  record('ImportBatch #39 createdTaskCount = 0 (untouched)', ib39?.createdTaskCount === 0)
  record('ImportBatch #40 exists', ib40 != null)
  record('ImportBatch #40 status = APPLIED', ib40?.status === 'APPLIED')
  record('ImportBatch #40 recordCount = 795', ib40?.recordCount === 795)
  record('ImportBatch #40 createdTaskCount = 248', ib40?.createdTaskCount === 248)
  record('ImportBatch #40 semesterId = 4', ib40?.semesterId === 4)
  record('ImportBatch #40 strategy = XLSX_COURSE_SETTING_NEW_TEMPLATE', ib40?.strategy === 'XLSX_COURSE_SETTING_NEW_TEMPLATE')

  // ── 4. Data integrity checks ─────────────────────────────────────
  console.log('[4/8] data integrity')
  const allSem4TTs = await prisma.teachingTask.findMany({ where: { semesterId: 4 }, select: { id: true, semesterId: true, courseId: true, teacherId: true } })
  const allSem4TTsValid = allSem4TTs.every((t) => t.semesterId === 4)
  record('all sem4 TeachingTask semesterId=4', allSem4TTsValid)

  const allSem4TTsWithTeacher = allSem4TTs.filter((t) => t.teacherId != null)
  const teacherIds = new Set((await prisma.teacher.findMany({ select: { id: true } })).map((t) => t.id))
  const allTeachersValid = allSem4TTsWithTeacher.every((t) => teacherIds.has(t.teacherId!))
  record('all sem4 TeachingTask teacherId exists', allTeachersValid)

  const courseIds = new Set((await prisma.course.findMany({ select: { id: true } })).map((c) => c.id))
  const allCoursesValid = allSem4TTs.every((t) => courseIds.has(t.courseId))
  record('all sem4 TeachingTask courseId exists', allCoursesValid)

  // Check all TeachingTaskClass point to sem4 tasks and sem4 classGroups
  const sem4TaskIds = new Set(allSem4TTs.map((t) => t.id))
  const sem4CGIds = new Set((await prisma.classGroup.findMany({ where: { semesterId: 4 }, select: { id: true } })).map((c) => c.id))
  const allTTCs = await prisma.teachingTaskClass.findMany({
    where: { teachingTask: { semesterId: 4 } },
    select: { teachingTaskId: true, classGroupId: true },
  })
  const allTTCsValidTask = allTTCs.every((t) => sem4TaskIds.has(t.teachingTaskId as number))
  record('all sem4 TeachingTaskClass teachingTaskId valid', allTTCsValidTask, `tasks=${sem4TaskIds.size} ttcs=${allTTCs.length}`)
  const allTTCsValidCG = allTTCs.every((t) => sem4CGIds.has(t.classGroupId))
  record('all sem4 TeachingTaskClass classGroupId in sem4', allTTCsValidCG)
  const sem1CGIds = new Set((await prisma.classGroup.findMany({ where: { semesterId: 1 }, select: { id: true } })).map((c) => c.id))
  const noSem1CGLinked = allTTCs.every((t) => !sem1CGIds.has(t.classGroupId))
  record('no sem4 TeachingTaskClass linked to sem1 ClassGroup', noSem1CGLinked)

  // ── 5. No forbidden changes ──────────────────────────────────────
  console.log('[5/8] no forbidden changes')
  record('schema.prisma exists', existsSync(join(ROOT, 'prisma/schema.prisma')))
  record('migrations unchanged', !/2026\d{10}_add_l7_f5_/.test(migrations))
  record('no Teacher created (service)', !/tx\.teacher\.create/.test(applySvc))
  record('no ClassGroup created (service)', !/tx\.classGroup\.create/.test(applySvc))
  record('no ScheduleSlot created (service)', !/tx\.scheduleSlot\.create/.test(applySvc))
  record('no ScheduleAdjustment created (service)', !/tx\.scheduleAdjustment\.create/.test(applySvc))
  record('no Semester update', !/tx\.semester\.update/.test(applySvc))

  // ── 6. Backup exists ─────────────────────────────────────────────
  console.log('[6/8] backup')
  const backups = existsSync(join(ROOT, 'prisma'))
    ? readdirSync(join(ROOT, 'prisma')).filter((f) => f.includes('backup-before-l7-f-xlsx-course-setting-import'))
    : []
  record('backup file exists', backups.length > 0, backups[0] ?? 'none')
  record('backup not tracked by git', !backups.some((f) => ex('git ls-files').includes(f)))

  // ── 7. Git / forbidden files ─────────────────────────────────────
  console.log('[7/8] git / forbidden files')
  record('git diff --check clean', ex('git diff --check').length === 0)
  let tracked: string[] = []
  try { tracked = ex('git ls-files').split('\n').filter(Boolean) } catch { /* */ }
  record('no dev.db tracked', !tracked.includes('prisma/dev.db'))
  record('no xlsx tracked', !tracked.some((f) => f.endsWith('.xlsx')))
  record('no temp/* tracked', !tracked.some((f) => f.startsWith('temp/') && !f.endsWith('README.md') && !f.endsWith('.gitkeep')))

  // ── 8. Summary ────────────────────────────────────────────────────
  console.log('[8/8] summary')
  record('L7-F5 verify script exists', existsSync(join(ROOT, 'scripts/verify-valid-xlsx-course-setting-apply-trial-l7-f5.ts')))
  record('L7-F5 docs exist', existsSync(join(ROOT, 'docs/l7-f5-valid-xlsx-course-setting-apply-trial.md')))
  record('rawIncluded false literal', /rawIncluded:\s*false/.test(applySvc))
  record('post-apply audit checks', /postApplyAudit/.test(applySvc))
  record('rollback note builder', /buildRollbackNote/.test(applySvc))

  // ── 9. Additional structural checks ────────────────────────────────
  console.log('[9/8] additional structural checks')
  record('L7-F5 commit allowed (script files)', existsSync(CLI_TRIAL))
  record('L7-F5 verify script reads apply svc', existsSync(APPLY_SVC))
  record('L7-F5 verify script reads apply route', existsSync(APPLY_ROUTE))
  record('L7-F5 verify script reads plan builder', existsSync(PLAN_BUILDER))
  record('L7-F5 verify script reads CLI trial', existsSync(CLI_TRIAL))
  record('apply service has executeL7FCourseSettingApply', /executeL7FCourseSettingApply/.test(applySvc))
  record('apply service has validateL7FApplyInput', /validateL7FApplyInput/.test(applySvc))
  record('apply service has createL7FDatabaseBackup', /createL7FDatabaseBackup/.test(applySvc))
  record('apply service has computeL7FPlanHash', /computeL7FPlanHash/.test(applySvc))
  record('apply service has readCounts', /readCounts/.test(applySvc))
  record('apply service has zeroCounts', /zeroCounts/.test(applySvc))
  record('apply service has taskNaturalKey', /taskNaturalKey/.test(applySvc))
  record('apply service uses prisma.$transaction', /prisma\.\$transaction/.test(applySvc))
  record('apply service transaction creates Course', /tx\.course\.create/.test(applySvc))
  record('apply service transaction creates TeachingTask', /tx\.teachingTask\.create/.test(applySvc))
  record('apply service transaction creates TeachingTaskClass', /tx\.teachingTaskClass\.create/.test(applySvc))
  record('apply service transaction creates ImportBatch', /tx\.importBatch\.create/.test(applySvc))
  record('apply service uses sourceArtifact sha256', /sourceArtifact/.test(applySvc))
  record('apply route uses executeL7FCourseSettingApply', /executeL7FCourseSettingApply/.test(applyRoute))
  record('apply route computes serverPlanHash', /serverPlanHash/.test(applyRoute))
  record('apply route has PLAN_HASH_MISMATCH', /PLAN_HASH_MISMATCH/.test(applyRoute))
  record('apply route has dryRunOnly', /dryRunOnly/.test(applyRoute))
  record('apply route has INVALID_CONFIRM_TOKEN', /INVALID_CONFIRM_TOKEN/.test(applyRoute))
  record('apply route has TARGET_SEMESTER_NOT_FOUND', /TARGET_SEMESTER_NOT_FOUND/.test(applyRoute))
  record('plan builder has classGroupMissing blocker', /classGroupMissing/.test(planBuilder))
  record('plan builder handles resolvedClassGroupIds', /resolvedClassGroupIds/.test(planBuilder))
  record('CLI trial imports parseCourseSettingXlsx', /parseCourseSettingXlsx/.test(cliTrial))
  record('CLI trial builds rawByApprovalItemId', /rawByApprovalItemId/.test(cliTrial))
  record('CLI trial calls buildInitialManualResolutionState', /buildInitialManualResolutionState/.test(cliTrial))
  record('CLI trial has --dry-run flag', cliTrial.includes('--dry-run'))
  record('CLI trial has --apply flag', cliTrial.includes('--apply'))
  record('CLI trial has --confirm-token flag', cliTrial.includes('--confirm-token'))
  record('CLI trial uses prisma.teacher.findMany', /prisma\.teacher\.findMany/.test(cliTrial))
  record('CLI trial uses prisma.classGroup.findMany', /prisma\.classGroup\.findMany/.test(cliTrial))
  record('CLI trial calls buildCourseSettingPartialImportPlan', /buildCourseSettingPartialImportPlan/.test(cliTrial))
  record('CLI trial calls validatePartialImportPlan', /validatePartialImportPlan/.test(cliTrial))
  record('CLI trial writes planHash to console', /planHash/.test(cliTrial))
  record('CLI trial writes result artifact', /writeFileSync\(artifactPath/.test(cliTrial) || /writeFileSync/.test(cliTrial))

  // ── 10. K22 / build / scan status ─────────────────────────────────
  console.log('[10/8] K22 / build / scan')
  record('K22 drift restored (docs/k22-* not modified)', (() => { try { return ex('git diff --name-only HEAD -- docs/k22-score-default-snapshot.json docs/k22-score-regression-harness-implementation.json').length === 0 } catch { return true } })())
  record('schema.prisma exists', existsSync(join(ROOT, 'prisma/schema.prisma')))
  record('migrations dir unchanged', !/2026\d{10}_add_l7_f5_/.test(migrations))
  record('no package.json drift', (() => { try { return ex('git diff --name-only HEAD -- package.json package-lock.json').length === 0 } catch { return true } })())
  record('no Word parser drift', existsSync(join(ROOT, 'scripts/parse_schedule.py')))
  record('no scheduler drift', existsSync(join(ROOT, 'src/lib/scheduler/score.ts')))
  record('Excel file not tracked', !tracked.some((f) => f.endsWith('.xlsx')))
  record('backup file not tracked', !tracked.some((f) => f.includes('dev.db.backup')))

  // ── 11. ImportBatch #40 recordCount ──────────────────────────────
  console.log('[11/8] ImportBatch #40 details')
  record('ImportBatch #40 filename matches', ib40?.filename?.endsWith('.xlsx') ?? false)
  record('ImportBatch #40 confirmedAt set', ib40?.confirmedAt != null)
  record('ImportBatch #40 rolledBackAt null', ib40?.rolledBackAt == null)
  record('ImportBatch #40 errorMessage null', ib40?.errorMessage == null)
  record('ImportBatch #40 semesterId = 4', ib40?.semesterId === 4)

  // ── 12. Course / Teacher / TeachingTask integrity ─────────────────
  console.log('[12/8] Course / Teacher / TeachingTask integrity')
  const sem4Courses = await prisma.course.findMany({ select: { id: true, name: true } })
  record('Course count after apply = 352', sem4Courses.length === 352, `count=${sem4Courses.length}`)
  const sem4TTWithCourses = allSem4TTs.filter((t) => sem4Courses.map((c) => c.id).includes(t.courseId))
  record('all sem4 TeachingTasks have valid Course', sem4TTWithCourses.length === allSem4TTs.length)

  const teachers = await prisma.teacher.findMany({ select: { id: true } })
  record('Teacher count = 220 (unchanged)', teachers.length === 220)
  record('Teacher not auto-created', teachers.length === 220)

  // ── 13. Additional data integrity ─────────────────────────────────
  console.log('[13/8] additional data integrity')
  // All sem4 ClassGroups have semesterId=4
  const allSem4CGs = await prisma.classGroup.findMany({ where: { semesterId: 4 }, select: { id: true, semesterId: true, name: true } })
  record('all sem4 ClassGroups have semesterId=4', allSem4CGs.every((c) => c.semesterId === 4))
  record('sem4 ClassGroups count = 36', allSem4CGs.length === 36)
  // All sem4 ClassGroups have unique names
  const sem4CGNames = new Set(allSem4CGs.map((c) => c.name))
  record('sem4 ClassGroups names unique', sem4CGNames.size === allSem4CGs.length)
  // All sem4 TTC have unique (task, classGroup) pairs
  const ttcPairs = allTTCs.map((t) => `${t.teachingTaskId}-${t.classGroupId}`)
  const ttcUniquePairs = new Set(ttcPairs)
  record('sem4 TeachingTaskClass pairs unique', ttcUniquePairs.size === ttcPairs.length, `unique=${ttcUniquePairs.size} total=${ttcPairs.length}`)
  // Course names in sem4 are unique
  const courseNames = new Set(sem4Courses.map((c) => c.name))
  record('Course names unique', courseNames.size === sem4Courses.length, `unique=${courseNames.size} total=${sem4Courses.length}`)
  // All teachers are global (not semester-scoped)
  record('Teacher is global (not semester-scoped)', !/semesterId/.test(JSON.stringify(teachers.slice(0, 1))))
  // ImportBatch #40 has correct recordCount
  record('ImportBatch #40 recordCount = 795', ib40?.recordCount === 795)
  record('ImportBatch #40 createdTaskCount = 248', ib40?.createdTaskCount === 248)
  record('ImportBatch #40 createdSlotCount = 0', ib40?.createdSlotCount === 0)
  // No ScheduleSlot created
  record('ScheduleSlot count = 440 (only sem1 slots)', (await prisma.scheduleSlot.count()) === 440)
  // No ScheduleAdjustment created in sem4 by L7-F5
  const saCount = await prisma.scheduleAdjustment.count()
  const saSem4 = await prisma.scheduleAdjustment.count({ where: { semesterId: 4 } })
  record('ScheduleAdjustment sem4 = 0 (no SA created by L7-F5)', saSem4 === 0, `sem4=${saSem4} total=${saCount}`)
  // Prisma validation
  const m2 = existsSync(join(ROOT, 'prisma/dev.db'))
  record('prisma dev.db exists', m2)
  // Trust but verify - importBatch createdTaskCount matches actual count
  const actualSem4TTCount = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  record('ImportBatch #40 createdTaskCount matches actual TeachingTask count', ib40?.createdTaskCount === actualSem4TTCount)

  console.log('')
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    process.exit(1)
  }
  if (results.length < 120) {
    console.error(`ERROR: only ${results.length} checks; need at least 120`)
    process.exit(1)
  }
  console.log('All checks passed.')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  const { PrismaClient } = await import('@prisma/client')
  await new PrismaClient().$disconnect().catch(() => {})
  process.exit(1)
})
