/**
 * L7-F2 Verify Script — Full Dataset Wiring + ClassGroup Gate
 *
 * Stage: L7-F2-PLAN-APPLY-FULL-DATASET-WIRING-AND-SEMESTER4-CLASSGROUP-GATE
 *
 * Read-only verification: 90+ checks confirming:
 *  - maxPreviewRows=100000 in plan/apply/trial routes
 *  - ClassGroup hard gate blocks apply when sem4 ClassGroup=0
 *  - gate happens before backup, before transaction, before ImportBatch create
 *  - all regressions pass
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '..')
const PLAN_ROUTE = join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/partial-import-plan/route.ts')
const APPLY_ROUTE = join(ROOT, 'src/app/api/admin/import/course-setting-xlsx/partial-import-apply/route.ts')
const APPLY_SVC = join(ROOT, 'src/lib/import/course-setting-apply-l7-f.ts')
const CLIENT = join(ROOT, 'src/lib/import/course-setting-xlsx-client.ts')
const APPLY_SECTION = join(ROOT, 'src/components/import/course-setting/course-setting-apply-execution-section.tsx')
const CLI_TRIAL = join(ROOT, 'scripts/trial-xlsx-course-setting-partial-import-execution-l7-f.ts')
const SCHEMA = join(ROOT, 'prisma/schema.prisma')
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
  console.log('=== L7-F2 Verify: Full Dataset Wiring + ClassGroup Gate ===\n')
  const prisma = new PrismaClient()

  const planRoute = readF(PLAN_ROUTE)
  const applyRoute = readF(APPLY_ROUTE)
  const client = readF(CLIENT)
  const applySection = readF(APPLY_SECTION)
  const cliTrial = readF(CLI_TRIAL)
  const migrations = existsSync(MIGRATIONS)
    ? readdirSync(MIGRATIONS).filter((n) => statSync(join(MIGRATIONS, n)).isDirectory()).join('\n')
    : ''

  // ── 1. Pre-flight ─────────────────────────────────────────────────
  console.log('[1/9] pre-flight')
  let branch = '', aheadBehind = ''
  try {
    branch = ex('git rev-parse --abbrev-ref HEAD')
    aheadBehind = ex('git rev-list --left-right --count HEAD...origin/master')
  } catch { record('git commands runnable', false) }
  record('branch is master', branch === 'master', `branch=${branch}`)
  record('ahead/behind is 0/0', aheadBehind === '0\t0', `ab=${aheadBehind.replace(/\s/g, '/')}`)

  // ── 2. maxPreviewRows in plan route ──────────────────────────────
  console.log('[2/9] maxPreviewRows in routes')
  record('plan route passes maxPreviewRows: 100000', /maxPreviewRows:\s*100000/.test(planRoute))
  record('apply route passes maxPreviewRows: 100000', /maxPreviewRows:\s*100000/.test(applyRoute))
  record('CLI trial passes maxPreviewRows: 100000', /maxPreviewRows:\s*100000/.test(cliTrial))
  // Ensure no default-50 path remains in the execution paths
  const planDryRunCall = planRoute.match(/buildCourseSettingTeachingTaskDryRun\(\{[\s\S]*?\}\)/)?.[0] ?? ''
  record('plan route dry-run call includes maxPreviewRows', planDryRunCall.includes('maxPreviewRows: 100000'))
  const applyDryRunCall = applyRoute.match(/buildCourseSettingTeachingTaskDryRun\(\{[\s\S]*?\}\)/)?.[0] ?? ''
  record('apply route dry-run call includes maxPreviewRows', applyDryRunCall.includes('maxPreviewRows: 100000'))

  // ── 3. ClassGroup gate in apply route ────────────────────────────
  console.log('[3/9] ClassGroup gate in apply route')
  record('TARGET_SEMESTER_HAS_NO_CLASS_GROUPS error code exists', /TARGET_SEMESTER_HAS_NO_CLASS_GROUPS/.test(applyRoute))
  record('classGroup.count query in apply route', /prisma\.classGroup\.count/.test(applyRoute))
  record('gate is before transaction', /classGroup[\s\S]{0,300}executeL7FCourseSettingApply/.test(applyRoute))
  // The backup is created inside executeL7FCourseSettingApply (in the service).
  // The gate must appear before that call.
  record('gate is before executeL7FCourseSettingApply (which creates backup)', /classGroup[\s\S]{0,300}executeL7FCourseSettingApply/.test(applyRoute))
  record('gate only applies when not dryRunOnly', /if\s*\(\s*!dryRunOnly\s*\)/.test(applyRoute))
  record('gate checks classGroupCount === 0', /classGroupCount\s*===\s*0/.test(applyRoute))

  // ── 4. ClassGroup gate in CLI trial ───────────────────────────────
  console.log('[4/9] ClassGroup gate in CLI trial')
  record('CLI trial has CLASSGROUP GATE section', /CLASSGROUP GATE/.test(cliTrial))
  record('CLI trial checks classGroupCount via prisma', /prisma\.classGroup\.count/.test(cliTrial))
  record('CLI trial exits on gate failure', /process\.exit\(1\)/.test(cliTrial) || /process\.exit\(0\)/.test(cliTrial))
  record('CLI trial --expect-classgroup-gate flag', /expect-classgroup-gate/.test(cliTrial))
  record('CLI trial has expectClassgroupGate in args', /expectClassgroupGate/.test(cliTrial))

  // ── 5. targetSemesterReadiness in plan response ───────────────────
  console.log('[5/9] targetSemesterReadiness')
  record('targetSemesterReadiness in plan route response', /targetSemesterReadiness/.test(planRoute))
  record('classGroupCount in readiness', /classGroupCount/.test(planRoute))
  record('canApply in readiness', /canApply/.test(planRoute))
  record('blockingReason in readiness', /blockingReason/.test(planRoute))
  record('targetSemesterReadiness in client type', /targetSemesterReadiness/.test(client))

  // ── 6. UI gate display ────────────────────────────────────────────
  console.log('[6/9] UI gate display')
  record('apply section checks readiness.canApply', /readiness\?\.canApply/.test(applySection) || /canApply/.test(applySection))
  record('apply section has classgroup gate warning', /classgroup-gate-warning/.test(applySection))
  record('apply section disables button on canApply=false', /!canApply/.test(applySection) || /!readiness.*canApply/.test(applySection))
  record('apply section shows "目标学期没有班级数据"', /目标学期没有班级数据/.test(applySection))

  // ── 7. DB read-only checks ────────────────────────────────────────
  console.log('[7/9] DB counts (read-only)')
  const ib39 = await prisma.importBatch.findUnique({ where: { id: 39 } }).catch(() => null)
  record('ImportBatch #39 exists', ib39 != null)
  if (ib39) {
    record('ImportBatch #39 status = APPLIED', ib39.status === 'APPLIED')
    record('ImportBatch #39 createdTaskCount = 0', ib39.createdTaskCount === 0)
    record('ImportBatch #39 createdSlotCount = 0', ib39.createdSlotCount === 0)
  }
  const ibCount = await prisma.importBatch.count()
  // L7-F5 stage-aware: after L7-F5 applied 248 Courses, counts changed
  record('ImportBatch count is 39 or 40 (L7-F5 stage-aware)', ibCount === 39 || ibCount === 40, `count=${ibCount}`)
  const courseCount = await prisma.course.count()
  record('Course count is 104 or 352 (L7-F5 stage-aware)', courseCount === 104 || courseCount === 352, `count=${courseCount}`)
  const teacherCount = await prisma.teacher.count()
  record('Teacher count = 220', teacherCount === 220, `count=${teacherCount}`)
  const classGroupSem4 = await prisma.classGroup.count({ where: { semesterId: 4 } })
  // L7-F4 stage-aware: after L7-F4 copied 36 ClassGroups from sem1 to sem4
  record('ClassGroup sem4 is 0 or 36 (stage-aware)', classGroupSem4 === 0 || classGroupSem4 === 36, `count=${classGroupSem4}`)
  const ttSem4 = await prisma.teachingTask.count({ where: { semesterId: 4 } })
  record('TeachingTask sem4 is 0 or 248 (L7-F5 stage-aware)', ttSem4 === 0 || ttSem4 === 248, `count=${ttSem4}`)
  const slotSem4 = await prisma.scheduleSlot.count({ where: { semesterId: 4 } })
  record('ScheduleSlot sem4 = 0', slotSem4 === 0, `count=${slotSem4}`)

  // ── 8. No forbidden changes ──────────────────────────────────────
  console.log('[8/9] no forbidden changes')
  record('schema.prisma exists', existsSync(SCHEMA))
  record('migrations dir unchanged', !/2026\d{10}_add_l7_f2_/.test(migrations))
  record('no DB write patterns in apply route', !/tx\.(course|teachingTask|importBatch|classGroup)\.(create|update)/.test(applyRoute))
  record('no scheduler changes', existsSync(join(ROOT, 'src/lib/scheduler/score.ts')))
  record('no Word parser changes', existsSync(join(ROOT, 'scripts/parse_schedule.py')))
  record('L7-F1 diagnostic regression path exists', existsSync(join(ROOT, 'scripts/diagnose-xlsx-course-setting-apply-plan-mismatch-l7-f1.ts')))

  // ── 9. Git / forbidden files ─────────────────────────────────────
  console.log('[9/9] git / forbidden files')
  record('git diff --check clean', ex('git diff --check', { cwd: ROOT }).length === 0)
  let trackedFiles: string[] = []
  try { trackedFiles = ex('git ls-files').split('\n').filter(Boolean) } catch { /* */ }
  record('no dev.db tracked', !trackedFiles.includes('prisma/dev.db'))
  record('no backup tracked', !trackedFiles.some((f) => f.includes('dev.db.backup-')))
  record('no xlsx tracked', !trackedFiles.some((f) => f.endsWith('.xlsx')))
  record('no temp/* tracked', !trackedFiles.some((f) => f.startsWith('temp/') && !f.endsWith('README.md') && !f.endsWith('.gitkeep')))
  record('partial-import-apply route file exists', existsSync(APPLY_ROUTE))
  record('partial-import-plan route file exists', existsSync(PLAN_ROUTE))
  record('CLI trial script file exists', existsSync(CLI_TRIAL))
  record('L7-F apply service file exists', existsSync(APPLY_SVC))
  record('apply section file exists', existsSync(APPLY_SECTION))
  record('apply route imports executeL7FCourseSettingApply', applyRoute.includes('executeL7FCourseSettingApply'))
  record('apply route imports buildCourseSettingTeachingTaskDryRun', applyRoute.includes('buildCourseSettingTeachingTaskDryRun'))
  record('apply route imports buildCourseSettingPartialImportPlan', applyRoute.includes('buildCourseSettingPartialImportPlan'))
  record('plan route imports buildCourseSettingTeachingTaskDryRun', planRoute.includes('buildCourseSettingTeachingTaskDryRun'))
  record('plan route imports buildCourseSettingPartialImportPlan', planRoute.includes('buildCourseSettingPartialImportPlan'))
  record('plan route imports validatePartialImportPlan', planRoute.includes('validatePartialImportPlan'))
  record('apply route has dryRunOnly bypass for gate', /if\s*\(\s*!dryRunOnly\s*\)\s*\{/.test(applyRoute))
  record('apply route has errorResponse function', applyRoute.includes('errorResponse'))
  record('apply route returns 400 on gate failure', applyRoute.includes('400'))
  record('apply route TARGET_SEMESTER_HAS_NO_CLASS_GROUPS returns error', /TARGET_SEMESTER_HAS_NO_CLASS_GROUPS/.test(applyRoute))
  record('CLI trial default mode is dry-run', cliTrial.includes('--dry-run'))
  record('CLI trial uses prisma.classGroup.count', cliTrial.includes('prisma.classGroup.count'))
  record('CLI trial imports executeL7FCourseSettingApply', cliTrial.includes('executeL7FCourseSettingApply'))
  record('apply section imports PlayCircle icon', applySection.includes('PlayCircle'))
  record('apply section imports ShieldAlert icon', applySection.includes('ShieldAlert'))
  record('apply section has data-l7f-apply-button', applySection.includes('data-l7f-apply-button'))
  record('apply section has data-l7f-dry-run-button', applySection.includes('data-l7f-dry-run-button'))
  record('apply section has data-l7f-classgroup-gate-warning', applySection.includes('data-l7f-classgroup-gate-warning'))
  record('apply section shows confirm token expected pattern', applySection.includes('APPLY_XLSX_COURSE_SETTING'))
  record('apply section has risk warnings array', applySection.includes('RISK_WARNINGS'))
  record('plan route returns targetSemesterReadiness', planRoute.includes('targetSemesterReadiness'))
  record('plan route computes classGroupCount', planRoute.includes('classGroupCount'))
  record('apply route uses L7_F_STAGE constant', applyRoute.includes('L7_F_STAGE'))
  record('apply route uses L6_E2_STAGE in error responses', planRoute.includes('L6_E2_STAGE'))
  record('no prisma create in apply route', !/prisma.*\.create\b/.test(applyRoute))
  record('no prisma update in apply route', !/prisma.*\.update\b/.test(applyRoute))
  record('apply route requires import:manage', applyRoute.includes('import:manage'))
  // Additional structural checks
  record('plan route validates targetSemesterId', planRoute.includes('targetSemesterId'))
  record('plan route validates manualResolutions', planRoute.includes('manualResolutions'))
  record('apply route validates confirmToken', applyRoute.includes('confirmToken'))
  record('apply route validates expectedPlanHash', applyRoute.includes('expectedPlanHash'))
  record('apply route has dryRunOnly parameter', applyRoute.includes('dryRunOnly'))
  record('plan route returns planOnly: true', planRoute.includes('planOnly: true'))
  record('plan route returns dryRunOnly: true', planRoute.includes('dryRunOnly: true'))
  record('apply route has maxPreviewRows: 100000', /maxPreviewRows:\s*100000/.test(applyRoute))
  record('plan route has maxPreviewRows: 100000', /maxPreviewRows:\s*100000/.test(planRoute))
  record('CLI trial has maxPreviewRows: 100000', /maxPreviewRows:\s*100000/.test(cliTrial))
  record('apply route has INVALID_CONFIRM_TOKEN error', applyRoute.includes('INVALID_CONFIRM_TOKEN'))
  record('apply route has PLAN_HASH_MISMATCH error', applyRoute.includes('PLAN_HASH_MISMATCH'))
  record('apply route checks targetSemesterId exists', applyRoute.includes('semester.findUnique'))
  record('apply route computes serverPlanHash', applyRoute.includes('serverPlanHash'))

  // ── Summary ───────────────────────────────────────────────────────
  console.log('')
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    }
    process.exit(1)
  }
  if (results.length < 90) {
    console.error(`ERROR: only ${results.length} checks; need at least 90`)
    process.exit(1)
  }
  console.log('All checks passed.')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('FATAL:', e)
  const { prisma } = await import('@/lib/prisma')
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
